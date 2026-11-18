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
export type ToolType = 'adb' | 'scrcpy' | 'ffmpeg' | 'ffprobe' | 'obs';

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
  obs?: ToolInfo;
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
  youtubeRtmpUrl?: string;
  youtubeStreamKey?: string;
  obsWebSocketUrl?: string;
  obsWebSocketPassword?: string;
  audioSyncOffsetMs?: number;
  mutePcAudioPlayback?: boolean;
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
  obsPath: string;
  obsWebSocketUrl?: string;
  obsWebSocketPassword?: string;
  youtubeStreamKey?: string;
  audioSyncOffsetMs?: number;
  language: string;
}

/** Navigation page identifiers */
export type PageId =
  | 'dashboard'
  | 'devices'
  | 'mirroring'
  | 'ipad'
  | 'audio'
  | 'video'
  | 'streaming'
  | 'settings';

/** DirectShow & HDMI Capture Device Definitions */
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

export interface AudioSyncMetrics {
  streamStartTime: number;
  lastPacketTimestamp: number;
  totalBytesReceived: number;
  totalAudioDurationMs: number;
  wallClockElapsedMs: number;
  driftMs: number;
  syncOffsetMs: number;
  underrunCount: number;
  clippingCount: number;
  isClipping: boolean;
  sampleRate: number;
  channels: number;
}

export interface DetailedSyncMetrics extends AudioSyncMetrics {
  captureFrameDurationMs: number;
  averageSampleWaitingMs: number;
  transportLatencyMs: number;
  captureToReceiverLatencyMs: number;
  averageCaptureToReceiverMs: number;
  bufferingLatencyMs: number;
  wasapiConfiguredBufferMs: number;
  actualPhysicalDacLatencyMs: number;
  playbackLatencyMs: number;
  receiverToPlaybackLatencyMs: number;
  totalAudioLatencyMs: number;
  obsIngestionLatencyMs: number;
  totalObsAudioLatencyMs: number;
  videoLatencyMs: number;
  estimatedAvOffsetMs: number;
  obsAvOffsetMs: number;
  packetJitterMs: number;
  clockOffsetMs: number;
  clockDriftPpm: number;
  overrunCount: number;
  droppedPackets: number;
  targetBufferLatencyMs: number;
  activeCorrectionMs: number;
}

export interface PcmPacketPayload {
  pcm: Uint8Array;
  captureTimeMs: number;
  arrivalTimeMs: number;
  sequenceNumber: number;
  transportLatencyMs: number;
  isOverrun?: boolean;
}

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
    getSyncMetrics?: () => Promise<AudioSyncMetrics>;
    getDetailedSyncMetrics?: () => Promise<DetailedSyncMetrics>;
    setSyncOffset?: (offsetMs: number) => Promise<{ success: boolean; offsetMs: number }>;
    setTargetBufferLatency?: (targetMs: number) => Promise<{ success: boolean; targetMs: number }>;
    calibrateClock?: (deviceId?: string) => Promise<{ success: boolean; clockOffsetMs: number; rttMs: number }>;
    onStatusChanged: (callback: (data: { status: CompanionAudioStatus; deviceId?: string; streamUrl?: string; error?: string }) => void) => void;
    onAudioLevel: (callback: (metrics: AudioLevelMetrics) => void) => void;
    onPcmData?: (callback: (chunk: Uint8Array) => void) => void;
    onPcmChunk?: (callback: (payload: PcmPacketPayload) => void) => void;
  };
  obs?: {
    connect: (url?: string, password?: string) => Promise<{ success: boolean; version?: string; error?: string }>;
    disconnect: () => Promise<{ success: boolean }>;
    getStatus: () => Promise<ObsStatusInfo>;
    getRecordStatus: () => Promise<ObsRecordStatus>;
    getStreamStatus: () => Promise<ObsStreamStatus>;
    startRecording: () => Promise<{ success: boolean; error?: string }>;
    stopRecording: () => Promise<{ success: boolean; outputPath?: string; error?: string }>;
    startStreaming: () => Promise<{ success: boolean; error?: string }>;
    stopStreaming: () => Promise<{ success: boolean; error?: string }>;
    getScenes: () => Promise<{ currentProgramSceneName: string; scenes: string[] }>;
    setupSources: (options: Record<string, any>) => Promise<{ success: boolean; message: string }>;
    setupIpadSources?: (options: { sceneName?: string; videoDeviceName: string; audioDeviceName?: string }) => Promise<{ success: boolean; message: string }>;
    runTestRecording: (durationSeconds: number) => Promise<{ success: boolean; outputPath?: string; error?: string }>;
    onStatusChanged: (callback: (data: ObsStatusInfo) => void) => void;
    onRecordStateChanged: (callback: (data: { active: boolean; state: string; outputPath?: string }) => void) => void;
    onStreamStateChanged: (callback: (data: { active: boolean; state: string }) => void) => void;
  };
  capture?: {
    listDevices: () => Promise<{ videoDevices: CaptureDevice[]; audioDevices: AudioCaptureDevice[] }>;
    startCapture: (deviceId: string, options?: Record<string, any>) => Promise<{ success: boolean; session?: IpadCaptureSession; error?: string }>;
    stopCapture: (deviceId: string) => Promise<{ success: boolean; error?: string }>;
    getSession: (deviceId: string) => Promise<IpadCaptureSession | null>;
    onCaptureStarted?: (callback: (session: IpadCaptureSession) => void) => void;
    onCaptureStopped?: (callback: (data: { deviceId: string }) => void) => void;
    onCaptureError?: (callback: (data: { error: string }) => void) => void;
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
