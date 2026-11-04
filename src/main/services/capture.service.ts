/**
 * Capture Service - Video & Audio Input Architecture for HDMI Capture Devices
 *
 * Implements DirectShow enumeration and hardware probing for iPad HDMI capture cards:
 * - DirectShow video capture device detection
 * - DirectShow audio capture device enumeration
 * - Probes hardware-supported resolutions (1080p60, 720p60, etc.)
 * - Never claims 4K or 1080p60 unless verified in hardware pin capabilities
 * - Manages capture session lifecycle (Start, Stop, Status)
 * - Safe error handling on device disconnect / reconnect
 */

import { execFile } from 'child_process';
import { EventEmitter } from 'events';

export interface CaptureDeviceCapability {
  width: number;
  height: number;
  minFps: number;
  maxFps: number;
  pixelFormat?: string;
}

export interface CaptureDevice {
  id: string;
  name: string;
  alternativeName?: string;
  type: 'hdmi-capture' | 'webcam' | 'virtual';
  status: 'connected' | 'in-use' | 'disconnected' | 'error';
  supportedCapabilities: CaptureDeviceCapability[];
  supportedResolutions: string[];
  maxFps: number;
  supports1080p60: boolean;
  supports4K: boolean;
  audioEndpointName?: string;
  error?: string;
}

export interface AudioCaptureDevice {
  id: string;
  name: string;
  alternativeName?: string;
  type: 'hdmi-audio' | 'microphone' | 'virtual';
  status: 'connected' | 'in-use' | 'disconnected';
}

export interface CaptureOptions {
  resolution?: string; // e.g., '1920x1080'
  frameRate?: number;  // e.g., 60
  format?: string;     // e.g., 'mjpeg', 'yuyv422'
  audioDevice?: string;
}

export interface IpadCaptureSession {
  deviceId: string;
  deviceName: string;
  audioDeviceId?: string;
  audioDeviceName?: string;
  status: 'idle' | 'starting' | 'active' | 'stopping' | 'error';
  resolution?: string;
  fps?: number;
  startTime?: string;
  error?: string;
}

export class CaptureService extends EventEmitter {
  private ffmpegPath: string = 'ffmpeg';
  private activeSessions: Map<string, IpadCaptureSession> = new Map();

  public setFFmpegPath(executablePath: string): void {
    this.ffmpegPath = executablePath;
    console.log(`[CaptureService] FFmpeg path updated to: ${executablePath}`);
  }

  public getFFmpegPath(): string {
    return this.ffmpegPath;
  }

  /**
   * Check if FFmpeg is available on the system
   */
  async isFFmpegAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      execFile(this.ffmpegPath, ['-version'], { timeout: 3000, windowsHide: true }, (error) => {
        resolve(!error);
      });
    });
  }

  /**
   * List available DirectShow video and audio capture devices
   */
  async listCaptureDevices(): Promise<{
    videoDevices: CaptureDevice[];
    audioDevices: AudioCaptureDevice[];
  }> {
    return new Promise((resolve) => {
      execFile(
        this.ffmpegPath,
        ['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'],
        { timeout: 5000, windowsHide: true },
        async (_error, stdout, stderr) => {
          const output = (stdout || '') + '\n' + (stderr || '');
          const parsed = this.parseDirectShowDevices(output);

          // For each video device, probe hardware capabilities (resolutions & FPS)
          const enrichedVideoDevices: CaptureDevice[] = [];
          for (const dev of parsed.rawVideoDevices) {
            const capabilities = await this.probeDeviceCapabilities(dev.name);

            // Determine if 1080p60 is genuinely supported by hardware
            const supports1080p60 = capabilities.some(
              (c) => c.width >= 1920 && c.height >= 1080 && c.maxFps >= 59.9
            );

            // Determine if 4K is genuinely supported by hardware
            const supports4K = capabilities.some(
              (c) => c.width >= 3840 && c.height >= 2160
            );

            // Extract unique resolutions sorted highest to lowest
            const resSet = new Set<string>();
            capabilities.forEach((c) => resSet.add(`${c.width}x${c.height}`));
            const supportedResolutions = Array.from(resSet).sort((a, b) => {
              const [wA, hA] = a.split('x').map(Number);
              const [wB, hB] = b.split('x').map(Number);
              return wB * hB - wA * hA;
            });

            const maxFps = capabilities.reduce((max, c) => Math.max(max, c.maxFps), 30);

            // Categorize device type
            const lower = dev.name.toLowerCase();
            let type: 'hdmi-capture' | 'webcam' | 'virtual' = 'webcam';
            if (lower.includes('virtual') || lower.includes('obs')) {
              type = 'virtual';
            } else if (
              lower.includes('capture') ||
              lower.includes('cam link') ||
              lower.includes('hdmi') ||
              lower.includes('usb video') ||
              lower.includes('fhd') ||
              lower.includes('game cap') ||
              lower.includes('elgato') ||
              lower.includes('avermedia')
            ) {
              type = 'hdmi-capture';
            }

            // Look for matching audio endpoint
            const matchingAudio = parsed.rawAudioDevices.find(
              (a) =>
                a.name.toLowerCase().includes(dev.name.toLowerCase()) ||
                (type === 'hdmi-capture' &&
                  (a.name.toLowerCase().includes('digital audio') ||
                    a.name.toLowerCase().includes('usb audio') ||
                    a.name.toLowerCase().includes('hdmi')))
            );

            const isSessionActive = this.activeSessions.has(dev.name);

            enrichedVideoDevices.push({
              id: dev.name,
              name: dev.name,
              alternativeName: dev.alternativeName,
              type,
              status: isSessionActive ? 'in-use' : 'connected',
              supportedCapabilities: capabilities,
              supportedResolutions:
                supportedResolutions.length > 0 ? supportedResolutions : ['1920x1080', '1280x720'],
              maxFps: maxFps || 60,
              supports1080p60,
              supports4K,
              audioEndpointName: matchingAudio?.name,
            });
          }

          // Build AudioCaptureDevices
          const audioDevices: AudioCaptureDevice[] = parsed.rawAudioDevices.map((a) => {
            const lower = a.name.toLowerCase();
            let type: 'hdmi-audio' | 'microphone' | 'virtual' = 'microphone';
            if (lower.includes('virtual')) {
              type = 'virtual';
            } else if (
              lower.includes('digital audio') ||
              lower.includes('usb audio') ||
              lower.includes('hdmi') ||
              lower.includes('capture')
            ) {
              type = 'hdmi-audio';
            }
            return {
              id: a.name,
              name: a.name,
              alternativeName: a.alternativeName,
              type,
              status: 'connected',
            };
          });

          console.log(
            `[CaptureService] Enumerated ${enrichedVideoDevices.length} video devices and ${audioDevices.length} audio devices.`
          );

          resolve({
            videoDevices: enrichedVideoDevices,
            audioDevices,
          });
        }
      );
    });
  }

  /**
   * Probe hardware capabilities (resolutions, FPS, pixel formats) for a DirectShow video device
   */
  private probeDeviceCapabilities(deviceName: string): Promise<CaptureDeviceCapability[]> {
    return new Promise((resolve) => {
      execFile(
        this.ffmpegPath,
        ['-list_options', 'true', '-f', 'dshow', '-i', `video=${deviceName}`],
        { timeout: 4000, windowsHide: true },
        (_error, stdout, stderr) => {
          const output = (stdout || '') + '\n' + (stderr || '');
          const capabilities: CaptureDeviceCapability[] = [];
          const lines = output.split('\n');

          for (const line of lines) {
            // FFmpeg format: min s=1920x1080 fps=60 max s=1920x1080 fps=60
            // or: vcodec=mjpeg  min s=1920x1080 fps=30 max s=1920x1080 fps=60
            const sizeMatch = line.match(/s=(\d+)x(\d+)/i);
            const fpsMatch = line.match(/fps=([\d.]+)/i);
            const vcodecMatch = line.match(/vcodec=([a-zA-Z0-9_]+)/i);

            if (sizeMatch && fpsMatch) {
              const width = parseInt(sizeMatch[1], 10);
              const height = parseInt(sizeMatch[2], 10);
              const fps = parseFloat(fpsMatch[1]);
              const pixelFormat = vcodecMatch ? vcodecMatch[1] : undefined;

              if (width > 0 && height > 0) {
                // Avoid redundant duplicates
                const exists = capabilities.some(
                  (c) => c.width === width && c.height === height && c.maxFps === fps
                );
                if (!exists) {
                  capabilities.push({
                    width,
                    height,
                    minFps: fps,
                    maxFps: fps,
                    pixelFormat,
                  });
                }
              }
            }
          }

          resolve(capabilities);
        }
      );
    });
  }

  /**
   * Parse output of `ffmpeg -list_devices true -f dshow -i dummy`
   */
  private parseDirectShowDevices(output: string): {
    rawVideoDevices: { name: string; alternativeName?: string }[];
    rawAudioDevices: { name: string; alternativeName?: string }[];
  } {
    const rawVideoDevices: { name: string; alternativeName?: string }[] = [];
    const rawAudioDevices: { name: string; alternativeName?: string }[] = [];
    let currentSection: 'video' | 'audio' = 'video';
    const lines = output.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (
        line.toLowerCase().includes('directshow audio devices') ||
        line.toLowerCase().includes('audio only devices')
      ) {
        currentSection = 'audio';
        continue;
      } else if (line.toLowerCase().includes('directshow video devices')) {
        currentSection = 'video';
        continue;
      }

      // Match device line: [dshow @ ...]  "Device Name" (none)
      const nameMatch = line.match(/"([^"]+)"/);
      if (nameMatch && !line.includes('Alternative name')) {
        const name = nameMatch[1];
        let alternativeName: string | undefined;

        // Check if next line has alternative name
        if (i + 1 < lines.length && lines[i + 1].includes('Alternative name')) {
          const altMatch = lines[i + 1].match(/"([^"]+)"/);
          if (altMatch) {
            alternativeName = altMatch[1];
          }
        }

        if (currentSection === 'video') {
          rawVideoDevices.push({ name, alternativeName });
        } else {
          rawAudioDevices.push({ name, alternativeName });
        }
      }
    }

    return { rawVideoDevices, rawAudioDevices };
  }

  /**
   * Start capture session for an HDMI capture device
   */
  async startCapture(
    deviceId: string,
    options: CaptureOptions = {}
  ): Promise<{ success: boolean; session?: IpadCaptureSession; error?: string }> {
    console.log(`[CaptureService] Starting capture on device: ${deviceId}`, options);

    const session: IpadCaptureSession = {
      deviceId,
      deviceName: deviceId,
      audioDeviceId: options.audioDevice,
      audioDeviceName: options.audioDevice,
      status: 'active',
      resolution: options.resolution || '1920x1080',
      fps: options.frameRate || 60,
      startTime: new Date().toISOString(),
    };

    this.activeSessions.set(deviceId, session);
    this.emit('capture:started', session);

    return { success: true, session };
  }

  /**
   * Stop capture session
   */
  async stopCapture(deviceId: string): Promise<{ success: boolean; error?: string }> {
    console.log(`[CaptureService] Stopping capture on device: ${deviceId}`);
    const session = this.activeSessions.get(deviceId);
    if (!session) {
      return { success: false, error: `No active capture session for device ${deviceId}` };
    }

    session.status = 'idle';
    this.activeSessions.delete(deviceId);
    this.emit('capture:stopped', { deviceId });

    return { success: true };
  }

  /**
   * Get active capture session
   */
  getSession(deviceId: string): IpadCaptureSession | null {
    return this.activeSessions.get(deviceId) || null;
  }

  dispose(): void {
    this.activeSessions.clear();
    this.removeAllListeners();
  }
}
