/**
 * Settings Service
 *
 * Persists application settings and tool executable paths to disk
 * in the user's application data directory.
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export interface StoredSettings {
  adbPath: string;
  scrcpyPath: string;
  ffmpegPath: string;
  ffprobePath: string;
  obsPath: string;
  obsWebSocketUrl: string;
  obsWebSocketPassword?: string;
  youtubeStreamKey?: string;
  audioSyncOffsetMs: number;
  theme: 'dark' | 'light' | 'system';
  startMinimized: boolean;
  autoConnect: boolean;
  showNotifications: boolean;
  language: string;
}

const defaultSettings: StoredSettings = {
  adbPath: '',
  scrcpyPath: '',
  ffmpegPath: '',
  ffprobePath: '',
  obsPath: '',
  obsWebSocketUrl: 'ws://127.0.0.1:4455',
  obsWebSocketPassword: '',
  youtubeStreamKey: '',
  audioSyncOffsetMs: 0,
  theme: 'dark',
  startMinimized: false,
  autoConnect: false,
  showNotifications: true,
  language: 'en',
};

export class SettingsService {
  private filePath: string;
  private settings: StoredSettings;

  constructor() {
    try {
      const userDataDir = app.getPath('userData');
      this.filePath = path.join(userDataDir, 'mobilemirror-settings.json');
    } catch {
      // Fallback if app is not yet ready
      this.filePath = path.join(process.cwd(), 'mobilemirror-settings.json');
    }
    this.settings = this.loadSettings();
  }

  private loadSettings(): StoredSettings {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return { ...defaultSettings, ...parsed };
      }
    } catch (err) {
      console.error('[SettingsService] Failed to load settings:', err);
    }
    return { ...defaultSettings };
  }

  public getSettings(): StoredSettings {
    return { ...this.settings };
  }

  public saveSettings(partial: Partial<StoredSettings>): StoredSettings {
    this.settings = { ...this.settings, ...partial };
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), 'utf-8');
    } catch (err) {
      console.error('[SettingsService] Failed to save settings:', err);
    }
    return { ...this.settings };
  }
}

