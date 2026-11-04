// ============================================================
// MobileMirror Studio - Type Definitions
// ============================================================

/** Supported device platforms */
export type DevicePlatform = 'android' | 'ipad';

/** Connection method */
export type ConnectionType = 'usb' | 'wireless' | 'hdmi';

/** Device connection state */
export type DeviceStatus = 'connected' | 'disconnected' | 'connecting' | 'unauthorized' | 'offline' | 'error';

/** Mirroring session state */
export type MirroringStatus = 'idle' | 'starting' | 'active' | 'stopping' | 'error';

/** Tool status type */
export type ToolStatus = 'installed' | 'missing' | 'error';

/** Tool type */
export type ToolType = 'adb' | 'scrcpy' | 'ffmpeg' | 'ffprobe';

/** Individual tool information */
export interface ToolInfo {
  name: string;
  toolType: ToolType;
  status: ToolStatus;
  path?: string;
  version?: string;
  error?: string;
}

/** System tools status */
export interface SystemToolsInfo {
  adb: ToolInfo;
  scrcpy: ToolInfo;
  ffmpeg: ToolInfo;
  ffprobe?: ToolInfo;
}

/** A connected device */
export interface Device {
  id: string;
  name: string;
  platform: DevicePlatform;
  connectionType: ConnectionType;
  status: DeviceStatus;
  authorizationStatus?: 'device' | 'unauthorized' | 'offline' | 'authorizing' | 'no permissions';
  model?: string;
  manufacturer?: string;
  osVersion?: string;
  androidVersion?: string;
  resolution?: string;
  batteryLevel?: number;
  ipAddress?: string;
}

/** Active mirror session info */
export interface MirrorSessionInfo {
  deviceId: string;
  pid?: number;
  status: MirroringStatus;
  options?: Record<string, unknown>;
  audioEnabled?: boolean;
  audioStatus?: 'forwarding' | 'disabled' | 'error';
  audioError?: string;
}

/** A past connection record */
export interface RecentConnection {
  id: string;
  device: Device;
  connectedAt: string;
  duration: string;
  sessionType: 'mirror' | 'stream';
}

/** Video quality settings */
export interface VideoSettings {
  resolution: string;      // e.g. '1920', '1440', '1080', '720', '0' (native)
  maxFps: number;          // e.g. 60
  bitRate: string;         // e.g. '16M' (16 Mbps default)
  codec: 'h264' | 'h265';  // default 'h264'
  orientation: 'auto' | 'portrait' | 'landscape'; // Landscape gameplay support
}

/** Audio configuration */
export interface AudioSettings {
  enabled: boolean;
  source: 'device' | 'system' | 'both';
  codec: 'opus' | 'aac' | 'raw';
  volume: number;
}

/** Streaming configuration */
export interface StreamingSettings {
  platform: 'obs' | 'custom';
  outputFormat: string;
  virtualCamera: boolean;
  overlayEnabled: boolean;
}

/** Application preferences */
export interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  startMinimized: boolean;
  autoConnect: boolean;
  showNotifications: boolean;
  adbPath: string;
  scrcpyPath: string;
  ffmpegPath: string;
  ffprobePath: string;
  language: string;
}

/** Navigation page identifiers */
export type PageId =
  | 'dashboard'
  | 'devices'
  | 'mirroring'
  | 'audio'
  | 'video'
  | 'streaming'
  | 'settings';

/** Navigation item */
export interface NavItem {
  id: PageId;
  label: string;
  icon: string;
  badge?: number;
}

export type AudioOutputCategory =
  | 'speaker'
  | 'bluetooth'
  | 'wired_headset'
  | 'usb_audio'
  | 'unknown';

export interface AudioRouteInfo {
  category: AudioOutputCategory;
  description: string;
  rawDeviceType?: string;
}

export interface AudioLevelMetrics {
  peak: number; // 0 - 100%
  rms: number;  // 0 - 100%
  dB: number;   // -60 to 0 dB
}

export type CompanionAudioStatus =
  | 'idle'
  | 'installing'
  | 'starting'
  | 'capturing'
  | 'stopping'
  | 'stopped'
  | 'error';

export interface CompanionAudioStats {
  bytesReceived: number;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  connectedClients: number;
  peakLevel?: number;
  rmsLevel?: number;
  dB?: number;
}

export interface CompanionAudioStatusResponse {
  status: CompanionAudioStatus;
  streamUrl: string;
  stats: CompanionAudioStats;
  activeRoute?: AudioRouteInfo;
  error: string | null;
}

/** Electron API exposed via preload */
export interface ElectronAPI {
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  getVersion: () => Promise<string>;
  checkTools: () => Promise<{ adb: boolean; scrcpy: boolean; ffmpeg: boolean }>;
  tools: {
    checkAll: () => Promise<SystemToolsInfo>;
    validatePath: (tool: ToolType, path: string) => Promise<ToolInfo>;
    browse: (tool: ToolType) => Promise<ToolInfo | null>;
    getSettings: () => Promise<AppSettings>;
    saveSettings: (settings: Partial<AppSettings>) => Promise<{ settings: AppSettings; tools: SystemToolsInfo }>;
  };
  adb: {
    listDevices: () => Promise<Device[]>;
    connectWireless: (ip: string, port: number) => Promise<boolean>;
    disconnect: (deviceId: string) => Promise<void>;
    restartServer: () => Promise<boolean>;
  };
  scrcpy: {
    startMirroring: (
      deviceId: string,
      options: Record<string, unknown>
    ) => Promise<{ success: boolean; pid?: number; error?: string }>;
    stopMirroring: (deviceId: string) => Promise<{ success: boolean; error?: string }>;
    getSession: (deviceId: string) => Promise<MirrorSessionInfo | null>;
    getAllSessions: () => Promise<Record<string, MirrorSessionInfo>>;
  };
  audioCompanion: {
    getStatus: () => Promise<CompanionAudioStatusResponse>;
    isInstalled: (deviceId: string) => Promise<boolean>;
    install: (deviceId: string) => Promise<{ success: boolean; error?: string }>;
    start: (deviceId: string) => Promise<{ success: boolean; streamUrl?: string; error?: string }>;
    stop: (deviceId?: string) => Promise<boolean>;
    getStreamUrl: () => Promise<string>;
    getStats: () => Promise<CompanionAudioStats>;
    getAudioRoute: (deviceId: string) => Promise<AudioRouteInfo>;
    onStatusChanged: (callback: (data: { status: CompanionAudioStatus; deviceId?: string; streamUrl?: string; error?: string }) => void) => void;
    onAudioLevel: (callback: (metrics: AudioLevelMetrics) => void) => void;
    onPcmData?: (callback: (chunk: Uint8Array) => void) => void;
  };
  onDeviceConnected: (callback: (device: Device) => void) => void;
  onDeviceDisconnected: (callback: (deviceId: string) => void) => void;
  onDeviceUnauthorized: (callback: (device: { id: string; name: string }) => void) => void;
  onMirroringStarted: (callback: (session: any) => void) => void;
  onMirroringStopped: (callback: (data: { deviceId: string; code?: number }) => void) => void;
  onMirroringError: (callback: (data: { deviceId: string; error: string }) => void) => void;
  onMirroringAudioError: (callback: (data: { deviceId: string; error: string }) => void) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
