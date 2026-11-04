/**
 * Capture Service - Video input architecture for HDMI capture devices
 *
 * This service provides a modular architecture for capturing video from
 * external sources like HDMI capture cards (used for iPad mirroring).
 *
 * Uses verified FFmpeg executable path resolved by ToolDetectionService.
 */

import { execFile } from 'child_process';
import { EventEmitter } from 'events';

export interface CaptureDevice {
  id: string;
  name: string;
  type: 'hdmi-capture' | 'virtual';
  status: 'available' | 'in-use' | 'error';
  resolution?: string;
  frameRate?: number;
}

export interface CaptureOptions {
  resolution?: string;    // e.g., '1920x1080'
  frameRate?: number;     // e.g., 60
  format?: string;        // e.g., 'mjpeg', 'h264'
  audioDevice?: string;   // Audio input device name
}

export class CaptureService extends EventEmitter {
  private ffmpegPath: string = 'ffmpeg';
  private activeCaptures: Map<string, unknown> = new Map();

  public setFFmpegPath(executablePath: string): void {
    this.ffmpegPath = executablePath;
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
   * List available capture devices via FFmpeg/DirectShow
   * This will enumerate HDMI capture cards and other video input devices
   */
  async listCaptureDevices(): Promise<CaptureDevice[]> {
    return [];
  }

  /**
   * Start capturing from a device
   * Future implementation will spawn FFmpeg process
   */
  async startCapture(
    _deviceId: string,
    _options: CaptureOptions = {}
  ): Promise<void> {
    this.emit('capture:notImplemented', {
      message: 'HDMI capture support is planned for a future release',
    });
  }

  /**
   * Stop capturing from a device
   */
  async stopCapture(_deviceId: string): Promise<void> {
    // Placeholder
  }

  dispose(): void {
    this.activeCaptures.clear();
    this.removeAllListeners();
  }
}
