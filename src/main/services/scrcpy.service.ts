/**
 * Scrcpy Service - Screen mirroring for Android devices
 *
 * Implements:
 * - Real scrcpy process lifecycle management
 * - Explicit target device selection via -s <serial>
 * - Custom video settings: max-size (1920), FPS (60), H.264 codec, 16 Mbps bitrate
 * - Audio forwarding controls (--audio-codec=opus / --no-audio)
 * - Landscape gameplay orientation locking
 * - Duplicate session prevention
 * - Process error capturing and graceful teardown
 */

import { spawn, execFile, ChildProcess } from 'child_process';
import * as path from 'path';
import { EventEmitter } from 'events';

export interface ScrcpyOptions {
  maxSize?: number;              // e.g. 1920
  bitRate?: string;              // e.g. '16M' (16 Mbps)
  maxFps?: number;               // e.g. 60
  noAudio?: boolean;             // Default false (audio enabled)
  audioCodec?: 'opus' | 'aac' | 'raw'; // Default 'opus'
  videoCodec?: 'h264' | 'h265' | 'av1'; // Default 'h264'
  orientation?: 'auto' | 'portrait' | 'landscape'; // Landscape gameplay support
  stayAwake?: boolean;
  showTouches?: boolean;
  turnScreenOff?: boolean;
  windowTitle?: string;
  windowBorderless?: boolean;
  alwaysOnTop?: boolean;
}

export interface LiveScrcpyMetrics {
  currentFps: number;
  skippedFrames: number;
  renderer: string;
  textureWidth: number;
  textureHeight: number;
}

export interface ActiveSession {
  deviceId: string;
  process: ChildProcess;
  pid?: number;
  options: ScrcpyOptions;
  startTime: Date;
  status: 'starting' | 'active' | 'stopping' | 'error';
  audioEnabled?: boolean;
  audioStatus?: 'forwarding' | 'disabled' | 'error';
  audioError?: string;
  lastError?: string;
  liveMetrics?: LiveScrcpyMetrics;
}

export class ScrcpyService extends EventEmitter {
  private scrcpyPath: string = 'scrcpy';
  private adbPath: string = 'adb';
  private sessions: Map<string, ActiveSession> = new Map();

  public setScrcpyPath(executablePath: string): void {
    this.scrcpyPath = executablePath;
  }

  public getScrcpyPath(): string {
    return this.scrcpyPath;
  }

  public setAdbPath(adbPath: string): void {
    this.adbPath = adbPath;
  }

  /**
   * Check if scrcpy is available and runnable
   */
  async isScrcpyAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      execFile(this.scrcpyPath, ['--version'], { timeout: 3000, windowsHide: true }, (error) => {
        resolve(!error);
      });
    });
  }

  /**
   * Start mirroring session for a specific target device
   */
  async startMirroring(
    deviceId: string,
    options: ScrcpyOptions = {}
  ): Promise<{ success: boolean; pid?: number; error?: string }> {
    // Prevent duplicate sessions on the same device
    if (this.sessions.has(deviceId)) {
      const existing = this.sessions.get(deviceId)!;
      if (existing.status === 'active' || existing.status === 'starting') {
        return {
          success: false,
          error: `A mirroring session is already active for device ${deviceId} (PID: ${existing.pid}). Stop it before starting a new one.`,
        };
      }
      this.stopMirroring(deviceId);
    }

    const args = this.buildArgs(deviceId, options);
    const scrcpyDir = path.dirname(this.scrcpyPath);

    return new Promise((resolve) => {
      let isSettled = false;
      let startupStderr = '';

      // Set environment variable so scrcpy always uses our verified ADB binary
      const env = {
        ...process.env,
        ADB: this.adbPath,
      };

      let proc: ChildProcess;
      try {
        proc = spawn(this.scrcpyPath, args, {
          cwd: scrcpyDir,
          env,
          windowsHide: false,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        resolve({ success: false, error: `Failed to spawn scrcpy: ${msg}` });
        return;
      }

      const isAudioEnabled = !options.noAudio;
      const session: ActiveSession = {
        deviceId,
        process: proc,
        pid: proc.pid,
        options,
        startTime: new Date(),
        status: 'starting',
        audioEnabled: isAudioEnabled,
        audioStatus: isAudioEnabled ? 'forwarding' : 'disabled',
      };

      this.sessions.set(deviceId, session);

      const parseScrcpyOutput = (text: string) => {
        const fpsMatch = text.match(/INFO:\s+(\d+)\s+fps(?:\s+\(\+(\d+)\s+frames\s+skipped\))?/);
        if (fpsMatch) {
          const currentFps = parseInt(fpsMatch[1], 10);
          const skipped = fpsMatch[2] ? parseInt(fpsMatch[2], 10) : 0;
          if (!session.liveMetrics) {
            session.liveMetrics = { currentFps: 0, skippedFrames: 0, renderer: 'direct3d11', textureWidth: 1920, textureHeight: 864 };
          }
          session.liveMetrics.currentFps = currentFps;
          session.liveMetrics.skippedFrames += skipped;
          this.emit('fps', { deviceId, currentFps, skippedFrames: session.liveMetrics.skippedFrames });
        }

        const texMatch = text.match(/INFO:\s+Texture:\s+(\d+)x(\d+)/);
        if (texMatch) {
          if (!session.liveMetrics) {
            session.liveMetrics = { currentFps: 0, skippedFrames: 0, renderer: 'direct3d11', textureWidth: 0, textureHeight: 0 };
          }
          session.liveMetrics.textureWidth = parseInt(texMatch[1], 10);
          session.liveMetrics.textureHeight = parseInt(texMatch[2], 10);
        }

        const renMatch = text.match(/INFO:\s+Renderer:\s+(\w+)/);
        if (renMatch) {
          if (!session.liveMetrics) {
            session.liveMetrics = { currentFps: 0, skippedFrames: 0, renderer: renMatch[1], textureWidth: 0, textureHeight: 0 };
          } else {
            session.liveMetrics.renderer = renMatch[1];
          }
        }
      };

      proc.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        parseScrcpyOutput(text);
        this.emit('log', { deviceId, level: 'info', message: text });
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        parseScrcpyOutput(text);
        startupStderr += text;
        this.emit('log', { deviceId, level: 'error', message: text });

        // Check for audio error messages
        const lower = text.toLowerCase();
        if (
          text.includes('[Audio]') ||
          lower.includes('audio error') ||
          lower.includes('failed to start audio') ||
          lower.includes('audio forwarding disabled') ||
          lower.includes('demuxer error')
        ) {
          session.audioStatus = 'error';
          session.audioError = text.trim();
          this.emit('audio:error', { deviceId, error: text.trim() });
        }

        // Check for common error messages
        if (text.includes('ERROR:') || text.includes('failed')) {
          session.lastError = text.trim();
        }
      });

      proc.on('error', (err) => {
        session.status = 'error';
        session.lastError = err.message;
        this.sessions.delete(deviceId);
        this.emit('error', { deviceId, message: err.message });
        if (!isSettled) {
          isSettled = true;
          resolve({ success: false, error: err.message });
        }
      });

      proc.on('close', (code, signal) => {
        this.sessions.delete(deviceId);
        this.emit('stopped', { deviceId, code, signal });

        if (!isSettled) {
          isSettled = true;
          const errMsg = startupStderr.trim() || `scrcpy exited with code ${code}`;
          resolve({ success: false, error: errMsg });
        }
      });

      // If the process stays alive for 800ms without crashing, consider it successfully running
      setTimeout(() => {
        if (!isSettled && session.process && !session.process.killed) {
          isSettled = true;
          session.status = 'active';
          this.emit('started', {
            deviceId,
            pid: proc.pid,
            options,
          });
          resolve({ success: true, pid: proc.pid });
        }
      }, 800);
    });
  }

  /**
   * Stop mirroring a specific device
   * Safely terminates only the scrcpy process spawned by this application instance.
   */
  stopMirroring(deviceId: string): { success: boolean; error?: string } {
    const session = this.sessions.get(deviceId);
    if (!session) {
      return { success: false, error: `No active mirroring session found for device ${deviceId}` };
    }

    try {
      session.status = 'stopping';
      const pid = session.pid;
      session.process.kill();

      // On Windows, if process hasn't closed after 600ms, ensure tree termination for this specific PID only
      setTimeout(() => {
        if (pid) {
          try {
            process.kill(pid, 0); // Check if process still exists
            execFile('taskkill', ['/PID', pid.toString(), '/T', '/F'], () => {});
          } catch {
            // Already terminated cleanly
          }
        }
      }, 600);

      this.sessions.delete(deviceId);
      this.emit('stopped', { deviceId, code: 0 });
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  /**
   * Stop all active sessions
   */
  stopAll(): void {
    for (const [deviceId, session] of this.sessions) {
      try {
        session.process.kill('SIGTERM');
      } catch {
        // Ignore
      }
      this.emit('stopped', { deviceId, code: 0 });
    }
    this.sessions.clear();
  }

  /**
   * Check if a device is currently being mirrored
   */
  isMirroring(deviceId: string): boolean {
    const session = this.sessions.get(deviceId);
    return session !== undefined && session.status === 'active';
  }

  /**
   * Get active session info for a device
   */
  getSession(deviceId: string): {
    deviceId: string;
    pid?: number;
    status: string;
    startTime: string;
    options: ScrcpyOptions;
    audioEnabled: boolean;
    audioStatus: 'forwarding' | 'disabled' | 'error';
    audioError?: string;
    liveMetrics?: LiveScrcpyMetrics;
  } | null {
    const session = this.sessions.get(deviceId);
    if (!session) return null;
    return {
      deviceId: session.deviceId,
      pid: session.pid,
      status: session.status,
      startTime: session.startTime.toISOString(),
      options: session.options,
      audioEnabled: session.audioEnabled ?? !session.options.noAudio,
      audioStatus: session.audioStatus || (!session.options.noAudio ? 'forwarding' : 'disabled'),
      audioError: session.audioError,
      liveMetrics: session.liveMetrics,
    };
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): Record<
    string,
    {
      deviceId: string;
      pid?: number;
      status: string;
      options: ScrcpyOptions;
      audioEnabled: boolean;
      audioStatus: 'forwarding' | 'disabled' | 'error';
      audioError?: string;
      liveMetrics?: LiveScrcpyMetrics;
    }
  > {
    const result: Record<string, any> = {};
    for (const [id, session] of this.sessions) {
      result[id] = {
        deviceId: id,
        pid: session.pid,
        status: session.status,
        options: session.options,
        audioEnabled: session.audioEnabled ?? !session.options.noAudio,
        audioStatus: session.audioStatus || (!session.options.noAudio ? 'forwarding' : 'disabled'),
        audioError: session.audioError,
        liveMetrics: session.liveMetrics,
      };
    }
    return result;
  }

  /**
   * Build scrcpy CLI command-line arguments
   */
  private buildArgs(deviceId: string, options: ScrcpyOptions): string[] {
    const args: string[] = ['--serial', deviceId];

    // Video constraints (defaults: 1920 max size, 120 fps max, 24M bitrate, H.264)
    const maxSize = options.maxSize !== undefined ? options.maxSize : 1920;
    if (maxSize > 0) {
      args.push(`--max-size=${maxSize}`);
    }

    const maxFps = options.maxFps !== undefined ? options.maxFps : 120;
    if (maxFps > 0) {
      args.push(`--max-fps=${maxFps}`);
    }

    const bitRate = options.bitRate || '24M';
    args.push(`--video-bit-rate=${bitRate}`);

    const videoCodec = options.videoCodec || 'h264';
    args.push(`--video-codec=${videoCodec}`);

    // Print real-time FPS to stderr for live diagnostics dashboard
    args.push('--print-fps');

    // Audio Forwarding
    if (options.noAudio) {
      args.push('--no-audio');
    } else {
      const audioCodec = options.audioCodec || 'opus';
      args.push(`--audio-codec=${audioCodec}`);
    }

    // Landscape gameplay support
    if (options.orientation === 'landscape') {
      args.push('--lock-video-orientation=1');
    } else if (options.orientation === 'portrait') {
      args.push('--lock-video-orientation=0');
    }

    // Usability controls
    if (options.stayAwake) {
      args.push('--stay-awake');
    }
    if (options.showTouches) {
      args.push('--show-touches');
    }
    if (options.turnScreenOff) {
      args.push('--turn-screen-off');
    }
    if (options.alwaysOnTop) {
      args.push('--always-on-top');
    }
    if (options.windowBorderless) {
      args.push('--window-borderless');
    }

    // Window Title (OBS Studio window capture identifier)
    const title = options.windowTitle || `MobileMirror - ${deviceId}`;
    args.push(`--window-title=${title}`);

    return args;
  }

  dispose(): void {
    this.stopAll();
    this.removeAllListeners();
  }
}
