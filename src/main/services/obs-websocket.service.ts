/**
 * OBS WebSocket Service (Protocol v5)
 *
 * Implements native OBS Studio WebSocket v5 integration:
 * - OBS WebSocket server detection & connection validation
 * - Authentication challenge response (SHA-256)
 * - Real-time streaming & recording status observation
 * - Recording & streaming controls (Start, Stop, Toggle)
 * - Scene and source queries and automated MobileMirror source creation
 * - Audio sync offset configuration in OBS mixer
 * - 10-second test recording pipeline
 */

import * as crypto from 'crypto';
import { EventEmitter } from 'events';

export type ObsConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ObsStatusInfo {
  state: ObsConnectionState;
  url: string;
  version?: string;
  error?: string | null;
  isStreaming: boolean;
  isRecording: boolean;
  recordingTimecode?: string;
  streamingTimecode?: string;
}

export interface ObsRecordStatus {
  active: boolean;
  paused: boolean;
  timecode: string;
  bytes: number;
  duration: number;
  outputPath?: string;
}

export interface ObsStreamStatus {
  active: boolean;
  timecode: string;
  bytes: number;
  kbitsPerSec: number;
}

export class ObsWebSocketService extends EventEmitter {
  private ws: any = null;
  private url: string = 'ws://127.0.0.1:4455';
  private password?: string;
  private state: ObsConnectionState = 'disconnected';
  private obsVersion?: string;
  private lastError: string | null = null;

  private isStreaming: boolean = false;
  private isRecording: boolean = false;
  private streamingTimecode: string = '00:00:00';
  private recordingTimecode: string = '00:00:00';

  private pendingRequests = new Map<string, { resolve: (res: any) => void; reject: (err: any) => void; timer: NodeJS.Timeout }>();
  private pollTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
  }

  public getStatus(): ObsStatusInfo {
    return {
      state: this.state,
      url: this.url,
      version: this.obsVersion,
      error: this.lastError,
      isStreaming: this.isStreaming,
      isRecording: this.isRecording,
      recordingTimecode: this.recordingTimecode,
      streamingTimecode: this.streamingTimecode,
    };
  }

  /**
   * Connect to OBS WebSocket server (v5 protocol)
   */
  public async connect(url?: string, password?: string): Promise<{ success: boolean; version?: string; error?: string }> {
    if (this.state === 'connected' && this.ws) {
      return { success: true, version: this.obsVersion };
    }

    if (url) this.url = url.trim();
    if (password !== undefined) this.password = password;

    this.disconnect();
    this.setState('connecting');
    this.lastError = null;

    return new Promise((resolve) => {
      let isSettled = false;
      const timeout = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          this.setState('error');
          this.lastError = 'Connection timed out. Ensure OBS Studio is open and WebSocket is enabled in Tools -> WebSocket Server Settings.';
          this.cleanupSocket();
          resolve({ success: false, error: this.lastError });
        }
      }, 5000);

      try {
        const WebSocketClass = (globalThis as any).WebSocket;
        if (!WebSocketClass) {
          throw new Error('WebSocket is not available in the current Node/Electron environment.');
        }

        const ws = new WebSocketClass(this.url);
        this.ws = ws;

        ws.onopen = () => {
          console.log(`[ObsWebSocket] Socket opened to ${this.url}. Awaiting Hello opcode...`);
        };

        ws.onmessage = (event: any) => {
          try {
            const rawData = typeof event.data === 'string' ? event.data : event.data.toString();
            const msg = JSON.parse(rawData);
            this.handleMessage(msg, (authResult) => {
              if (!isSettled) {
                isSettled = true;
                clearTimeout(timeout);
                if (authResult.success) {
                  resolve({ success: true, version: this.obsVersion });
                } else {
                  resolve({ success: false, error: authResult.error });
                }
              }
            });
          } catch (err: unknown) {
            console.error('[ObsWebSocket] Message parse error:', err);
          }
        };

        ws.onerror = (err: any) => {
          const msg = err?.message || 'WebSocket connection error';
          console.warn(`[ObsWebSocket] Socket error: ${msg}`);
          this.lastError = 'Unable to connect to OBS WebSocket. Please check Tools -> WebSocket Server Settings in OBS Studio.';
          if (!isSettled) {
            isSettled = true;
            clearTimeout(timeout);
            this.setState('error');
            this.cleanupSocket();
            resolve({ success: false, error: this.lastError });
          }
        };

        ws.onclose = () => {
          console.log('[ObsWebSocket] Socket closed');
          const wasConnected = this.state === 'connected';
          const wasError = this.state === 'error';
          this.cleanupSocket();
          if (!wasError) {
            this.setState('disconnected');
          }
          if (wasConnected) {
            this.emit('disconnected');
          }
        };
      } catch (err: unknown) {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timeout);
          const msg = err instanceof Error ? err.message : String(err);
          this.lastError = msg;
          this.setState('error');
          resolve({ success: false, error: msg });
        }
      }
    });
  }

  /**
   * Disconnect from OBS WebSocket
   */
  public disconnect(): void {
    this.cleanupSocket();
    this.setState('disconnected');
  }

  private cleanupSocket(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    for (const [, req] of this.pendingRequests) {
      clearTimeout(req.timer);
      req.reject(new Error('WebSocket closed'));
    }
    this.pendingRequests.clear();

    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }

  private setState(newState: ObsConnectionState): void {
    this.state = newState;
    this.emit('status-changed', this.getStatus());
  }

  /**
   * Handle OBS WebSocket v5 OpCodes
   */
  private handleMessage(msg: any, onAuthSettled: (res: { success: boolean; error?: string }) => void): void {
    const op = msg.op;
    const d = msg.d;

    // Op 0: Hello from OBS
    if (op === 0) {
      this.obsVersion = d.obsWebSocketVersion;
      const rpcVersion = d.rpcVersion || 1;
      const identifyPayload: any = {
        rpcVersion,
        eventSubscriptions: (1 << 0) | (1 << 3) | (1 << 6), // General + StreamStateChanged + RecordStateChanged
      };

      // Check if authentication required
      if (d.authentication) {
        if (!this.password) {
          const err = 'OBS WebSocket requires a password. Please enter the server password in Settings.';
          this.lastError = err;
          this.setState('error');
          onAuthSettled({ success: false, error: err });
          return;
        }

        // SHA-256 Auth Challenge calculation
        const secret = crypto.createHash('sha256').update(this.password + d.authentication.salt).digest('base64');
        const auth = crypto.createHash('sha256').update(secret + d.authentication.challenge).digest('base64');
        identifyPayload.authentication = auth;
      }

      // Send Identify (Op 1)
      this.send({ op: 1, d: identifyPayload });
      return;
    }

    // Op 2: Identified (Auth succeeded)
    if (op === 2) {
      console.log(`[ObsWebSocket] Successfully identified with OBS Studio ${this.obsVersion || ''}!`);
      this.setState('connected');
      onAuthSettled({ success: true });
      this.startPollingStatus();
      return;
    }

    // Op 5: Event
    if (op === 5) {
      this.handleEvent(d);
      return;
    }

    // Op 7: RequestResponse
    if (op === 7) {
      const requestId = d.requestId;
      const pending = this.pendingRequests.get(requestId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(requestId);
        if (d.requestStatus && d.requestStatus.result) {
          pending.resolve(d.responseData || {});
        } else {
          const errMsg = d.requestStatus?.comment || 'OBS request failed';
          pending.reject(new Error(errMsg));
        }
      }
      return;
    }
  }

  private handleEvent(d: any): void {
    const eventType = d.eventType;
    const eventData = d.eventData || {};

    if (eventType === 'RecordStateChanged') {
      this.isRecording = Boolean(eventData.outputActive);
      this.emit('record-state-changed', {
        active: this.isRecording,
        state: eventData.outputState,
        outputPath: eventData.outputPath,
      });
      this.emit('status-changed', this.getStatus());
    }

    if (eventType === 'StreamStateChanged') {
      this.isStreaming = Boolean(eventData.outputActive);
      this.emit('stream-state-changed', {
        active: this.isStreaming,
        state: eventData.outputState,
      });
      this.emit('status-changed', this.getStatus());
    }
  }

  private send(data: any): void {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(data));
    }
  }

  /**
   * Send RPC request to OBS WebSocket v5
   */
  public call(requestType: string, requestData: any = {}): Promise<any> {
    if (this.state !== 'connected' || !this.ws) {
      return Promise.reject(new Error('OBS WebSocket is not connected.'));
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request ${requestType} timed out after 5000ms.`));
      }, 5000);

      this.pendingRequests.set(requestId, { resolve, reject, timer });
      this.send({
        op: 6,
        d: {
          requestType,
          requestId,
          requestData,
        },
      });
    });
  }

  private startPollingStatus(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    const poll = async () => {
      if (this.state !== 'connected') return;
      try {
        const [recStatus, streamStatus] = await Promise.all([
          this.getRecordStatus().catch(() => null),
          this.getStreamStatus().catch(() => null),
        ]);
        if (recStatus) {
          this.isRecording = recStatus.active;
          this.recordingTimecode = recStatus.timecode || '00:00:00';
        }
        if (streamStatus) {
          this.isStreaming = streamStatus.active;
          this.streamingTimecode = streamStatus.timecode || '00:00:00';
        }
        this.emit('status-changed', this.getStatus());
      } catch {}
    };
    poll();
    this.pollTimer = setInterval(poll, 2000);
  }

  // ============================================================
  // High-Level OBS Controls
  // ============================================================

  public async getRecordStatus(): Promise<ObsRecordStatus> {
    const res = await this.call('GetRecordStatus');
    return {
      active: Boolean(res.outputActive),
      paused: Boolean(res.outputPaused),
      timecode: res.outputTimecode || '00:00:00',
      bytes: res.outputBytes || 0,
      duration: res.outputDuration || 0,
      outputPath: res.outputPath,
    };
  }

  public async getStreamStatus(): Promise<ObsStreamStatus> {
    const res = await this.call('GetStreamStatus');
    return {
      active: Boolean(res.outputActive),
      timecode: res.outputTimecode || '00:00:00',
      bytes: res.outputBytes || 0,
      kbitsPerSec: res.outputKbitsPerSec || 0,
    };
  }

  public async startRecording(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.call('StartRecord');
      this.isRecording = true;
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async stopRecording(): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    try {
      const res = await this.call('StopRecord');
      this.isRecording = false;
      return { success: true, outputPath: res?.outputPath };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async startStreaming(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.call('StartStream');
      this.isStreaming = true;
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async stopStreaming(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.call('StopStream');
      this.isStreaming = false;
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async getSceneList(): Promise<{ currentProgramSceneName: string; scenes: string[] }> {
    const res = await this.call('GetSceneList');
    const scenes = (res.scenes || []).map((s: any) => s.sceneName || s.name);
    return {
      currentProgramSceneName: res.currentProgramSceneName || scenes[0] || 'Scene',
      scenes,
    };
  }

  /**
   * Create or configure dedicated MobileMirror audio and video inputs in OBS Studio
   */
  public async setupMobileMirrorSources(options: {
    sceneName?: string;
    deviceId?: string;
    streamUrl?: string;
    syncOffsetMs?: number;
  } = {}): Promise<{ success: boolean; message: string }> {
    try {
      const sceneList = await this.getSceneList();
      const targetScene = options.sceneName || sceneList.currentProgramSceneName;
      const deviceId = options.deviceId || 'Device';
      const streamUrl = options.streamUrl || 'http://127.0.0.1:28201/live-audio.wav';
      const syncOffsetMs = options.syncOffsetMs || 0;

      // 1. Add/Update dedicated Game Audio Media Source
      const audioSourceName = 'MobileMirror Game Audio';
      try {
        await this.call('CreateInput', {
          sceneName: targetScene,
          inputName: audioSourceName,
          inputKind: 'ffmpeg_source',
          inputSettings: {
            input: streamUrl,
            is_local_file: false,
            buffering_mb: 2,
            reconnect_delay_sec: 2,
          },
        });
      } catch {
        // If input already exists, update its settings
        await this.call('SetInputSettings', {
          inputName: audioSourceName,
          inputSettings: {
            input: streamUrl,
            is_local_file: false,
          },
        }).catch(() => {});
      }

      // 2. Set sync offset on game audio input if specified
      if (syncOffsetMs !== 0) {
        await this.call('SetInputAudioSyncOffset', {
          inputName: audioSourceName,
          inputAudioSyncOffset: syncOffsetMs,
        }).catch(() => {});
      }

      // 3. Add/Update Window Capture source for scrcpy
      const videoSourceName = `MobileMirror Video (${deviceId})`;
      const windowSearch = `MobileMirror - ${deviceId}:SDL_app:scrcpy.exe`;
      try {
        await this.call('CreateInput', {
          sceneName: targetScene,
          inputName: videoSourceName,
          inputKind: 'window_capture',
          inputSettings: {
            window: windowSearch,
            method: 2, // Windows 10 (1903 and up) WGC capture method
            priority: 1, // Match title, otherwise find window of same executable
          },
        });
      } catch {
        // Source already exists
      }

      return {
        success: true,
        message: `Configured "${audioSourceName}" and "${videoSourceName}" in OBS scene "${targetScene}".`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Failed to configure OBS sources: ${msg}` };
    }
  }

  /**
   * Run an automated 10-second test recording to verify video, game audio, and microphone sync
   */
  public async runTestRecording(durationSeconds: number = 10, onProgress?: (secRemaining: number) => void): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    if (this.state !== 'connected') {
      return { success: false, error: 'OBS Studio is not connected via WebSocket.' };
    }

    const startRes = await this.startRecording();
    if (!startRes.success) {
      return { success: false, error: startRes.error };
    }

    for (let remaining = durationSeconds; remaining > 0; remaining--) {
      if (onProgress) onProgress(remaining);
      await new Promise((r) => setTimeout(r, 1000));
    }

    const stopRes = await this.stopRecording();
    return stopRes;
  }

  public dispose(): void {
    this.cleanupSocket();
    this.removeAllListeners();
  }
}
