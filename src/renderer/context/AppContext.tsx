import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import type {
  Device,
  RecentConnection,
  MirroringStatus,
  VideoSettings,
  AudioSettings,
  StreamingSettings,
  AppSettings,
  SystemToolsInfo,
  CompanionAudioStatus,
} from '../types';

// ============================================================
// Application State
// ============================================================

interface AppState {
  devices: Device[];
  recentConnections: RecentConnection[];
  mirroringStatus: MirroringStatus;
  activeDevice: Device | null;
  activeSessions: Record<string, { pid?: number; status: string; options?: any; audioEnabled?: boolean; audioStatus?: 'forwarding' | 'disabled' | 'error'; audioError?: string }>;
  companionAudio: {
    status: CompanionAudioStatus;
    deviceId?: string;
    streamUrl?: string;
    error?: string;
  };
  obsStatus: {
    state: 'disconnected' | 'connecting' | 'connected' | 'error';
    url: string;
    version?: string;
    error?: string | null;
    isStreaming: boolean;
    isRecording: boolean;
    recordingTimecode?: string;
    streamingTimecode?: string;
  };
  toolStatus: SystemToolsInfo;
  videoSettings: VideoSettings;
  audioSettings: AudioSettings;
  streamingSettings: StreamingSettings;
  appSettings: AppSettings;
}

const initialState: AppState = {
  devices: [],
  recentConnections: [],
  mirroringStatus: 'idle',
  activeDevice: null,
  activeSessions: {},
  companionAudio: {
    status: 'idle',
  },
  obsStatus: {
    state: 'disconnected',
    url: 'ws://127.0.0.1:4455',
    isStreaming: false,
    isRecording: false,
  },
  toolStatus: {
    adb: { name: 'ADB', toolType: 'adb', status: 'missing', error: 'Checking installation...' },
    scrcpy: { name: 'scrcpy', toolType: 'scrcpy', status: 'missing', error: 'Checking installation...' },
    ffmpeg: { name: 'FFmpeg', toolType: 'ffmpeg', status: 'missing', error: 'Checking installation...' },
    ffprobe: { name: 'ffprobe', toolType: 'ffprobe', status: 'missing', error: 'Checking installation...' },
    obs: { name: 'OBS Studio', toolType: 'obs', status: 'missing', error: 'Checking installation...' },
  },
  videoSettings: {
    resolution: '1920',
    maxFps: 120,
    bitRate: '24M',
    codec: 'h264',
    orientation: 'auto',
  },
  audioSettings: {
    enabled: true,
    source: 'device',
    codec: 'opus',
    volume: 80,
  },
  streamingSettings: {
    platform: 'obs',
    outputFormat: 'mp4',
    virtualCamera: false,
    overlayEnabled: false,
    youtubeRtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
    youtubeStreamKey: '',
    obsWebSocketUrl: 'ws://127.0.0.1:4455',
    obsWebSocketPassword: '',
    audioSyncOffsetMs: 0,
    mutePcAudioPlayback: false,
  },
  appSettings: {
    theme: 'dark',
    startMinimized: false,
    autoConnect: false,
    showNotifications: true,
    adbPath: '',
    scrcpyPath: '',
    ffmpegPath: '',
    ffprobePath: '',
    obsPath: '',
    obsWebSocketUrl: 'ws://127.0.0.1:4455',
    obsWebSocketPassword: '',
    youtubeStreamKey: '',
    audioSyncOffsetMs: 0,
    language: 'en',
  },
};

// ============================================================
// Actions
// ============================================================

type AppAction =
  | { type: 'SET_DEVICES'; payload: Device[] }
  | { type: 'ADD_DEVICE'; payload: Device }
  | { type: 'REMOVE_DEVICE'; payload: string }
  | { type: 'SET_ACTIVE_DEVICE'; payload: Device | null }
  | { type: 'SET_MIRRORING_STATUS'; payload: MirroringStatus }
  | { type: 'SET_SESSION'; payload: { deviceId: string; pid?: number; status: string; options?: any; audioEnabled?: boolean; audioStatus?: 'forwarding' | 'disabled' | 'error'; audioError?: string } }
  | { type: 'SET_AUDIO_ERROR'; payload: { deviceId: string; error: string } }
  | { type: 'SET_COMPANION_AUDIO'; payload: { status: CompanionAudioStatus; deviceId?: string; streamUrl?: string; error?: string } }
  | { type: 'SET_OBS_STATUS'; payload: Partial<AppState['obsStatus']> }
  | { type: 'REMOVE_SESSION'; payload: string }
  | { type: 'SET_TOOL_STATUS'; payload: SystemToolsInfo }
  | { type: 'UPDATE_VIDEO_SETTINGS'; payload: Partial<VideoSettings> }
  | { type: 'UPDATE_AUDIO_SETTINGS'; payload: Partial<AudioSettings> }
  | { type: 'UPDATE_STREAMING_SETTINGS'; payload: Partial<StreamingSettings> }
  | { type: 'UPDATE_APP_SETTINGS'; payload: Partial<AppSettings> }
  | { type: 'SET_APP_SETTINGS'; payload: AppSettings }
  | { type: 'ADD_RECENT_CONNECTION'; payload: RecentConnection };

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_DEVICES':
      return { ...state, devices: action.payload };
    case 'ADD_DEVICE':
      return {
        ...state,
        devices: [...state.devices.filter((d) => d.id !== action.payload.id), action.payload],
      };
    case 'REMOVE_DEVICE':
      return {
        ...state,
        devices: state.devices.filter((d) => d.id !== action.payload),
        activeDevice:
          state.activeDevice?.id === action.payload ? null : state.activeDevice,
        activeSessions: { ...state.activeSessions, [action.payload]: undefined as any },
      };
    case 'SET_ACTIVE_DEVICE':
      return { ...state, activeDevice: action.payload };
    case 'SET_MIRRORING_STATUS':
      return { ...state, mirroringStatus: action.payload };
    case 'SET_SESSION':
      return {
        ...state,
        activeSessions: {
          ...state.activeSessions,
          [action.payload.deviceId]: action.payload,
        },
      };
    case 'SET_AUDIO_ERROR': {
      const existing = state.activeSessions[action.payload.deviceId];
      if (!existing) return state;
      return {
        ...state,
        activeSessions: {
          ...state.activeSessions,
          [action.payload.deviceId]: {
            ...existing,
            audioStatus: 'error',
            audioError: action.payload.error,
          },
        },
      };
    }
    case 'SET_COMPANION_AUDIO':
      return {
        ...state,
        companionAudio: {
          ...state.companionAudio,
          ...action.payload,
        },
      };
    case 'SET_OBS_STATUS':
      return {
        ...state,
        obsStatus: {
          ...state.obsStatus,
          ...action.payload,
        },
      };
    case 'REMOVE_SESSION': {
      const nextSessions = { ...state.activeSessions };
      delete nextSessions[action.payload];
      return {
        ...state,
        activeSessions: nextSessions,
      };
    }
    case 'SET_TOOL_STATUS':
      return {
        ...state,
        toolStatus: action.payload ? { ...state.toolStatus, ...action.payload } : state.toolStatus,
      };
    case 'UPDATE_VIDEO_SETTINGS':
      return {
        ...state,
        videoSettings: { ...state.videoSettings, ...(action.payload || {}) },
      };
    case 'UPDATE_AUDIO_SETTINGS':
      return {
        ...state,
        audioSettings: { ...state.audioSettings, ...(action.payload || {}) },
      };
    case 'UPDATE_STREAMING_SETTINGS':
      return {
        ...state,
        streamingSettings: { ...state.streamingSettings, ...(action.payload || {}) },
      };
    case 'UPDATE_APP_SETTINGS':
      return {
        ...state,
        appSettings: { ...state.appSettings, ...(action.payload || {}) },
      };
    case 'SET_APP_SETTINGS':
      return {
        ...state,
        appSettings: action.payload ? { ...state.appSettings, ...action.payload } : state.appSettings,
      };
    case 'ADD_RECENT_CONNECTION':
      return {
        ...state,
        recentConnections: [
          action.payload,
          ...state.recentConnections.slice(0, 9),
        ],
      };
    default:
      return state;
  }
}

// ============================================================
// Context
// ============================================================

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Global listeners and status bootstrap (runs once across entire app lifecycle)
  useEffect(() => {
    if (!window.electronAPI) return;

    // 1. Initial tools check
    if (window.electronAPI.tools?.checkAll) {
      window.electronAPI.tools.checkAll().then((tools) => {
        if (tools) dispatch({ type: 'SET_TOOL_STATUS', payload: tools });
      }).catch(() => {});
    }

    // 2. Initial companion audio status & global live listener
    if (window.electronAPI.audioCompanion) {
      window.electronAPI.audioCompanion.getStatus().then((res: any) => {
        if (res) {
          dispatch({
            type: 'SET_COMPANION_AUDIO',
            payload: {
              status: res.status || 'idle',
              streamUrl: res.streamUrl,
              deviceId: res.deviceId,
              error: res.error,
            },
          });
        }
      }).catch(() => {});

      window.electronAPI.audioCompanion.onStatusChanged((data: any) => {
        console.log('[AppContext] Global companion audio status update:', data);
        dispatch({
          type: 'SET_COMPANION_AUDIO',
          payload: {
            status: data.status,
            streamUrl: data.streamUrl,
            deviceId: data.deviceId,
            error: data.error,
          },
        });
      });
    }

    // 3. Global Mirroring lifecycle events
    if (window.electronAPI.onMirroringStarted) {
      window.electronAPI.onMirroringStarted((session: any) => {
        dispatch({ type: 'SET_MIRRORING_STATUS', payload: 'active' });
        if (session && session.deviceId) {
          dispatch({ type: 'SET_SESSION', payload: session });
        }
      });
    }

    if (window.electronAPI.onMirroringStopped) {
      window.electronAPI.onMirroringStopped((data: any) => {
        dispatch({ type: 'SET_MIRRORING_STATUS', payload: 'idle' });
        if (data && data.deviceId) {
          dispatch({ type: 'REMOVE_SESSION', payload: data.deviceId });
        }
      });
    }

    // 4. Global Device discovery
    if (window.electronAPI.adb?.listDevices) {
      window.electronAPI.adb.listDevices().then((devices: Device[]) => {
        dispatch({ type: 'SET_DEVICES', payload: devices });
        if (devices.length > 0 && !state.activeDevice) {
          dispatch({ type: 'SET_ACTIVE_DEVICE', payload: devices[0] });
        }
      }).catch(() => {});
    }

    if (window.electronAPI.onDeviceConnected) {
      window.electronAPI.onDeviceConnected((dev: Device) => {
        dispatch({ type: 'ADD_DEVICE', payload: dev });
      });
    }

    // 5. OBS WebSocket Status listeners
    if (window.electronAPI.obs) {
      window.electronAPI.obs.getStatus().then((status: any) => {
        if (status) {
          dispatch({ type: 'SET_OBS_STATUS', payload: status });
        }
      }).catch(() => {});

      window.electronAPI.obs.onStatusChanged((status: any) => {
        dispatch({ type: 'SET_OBS_STATUS', payload: status });
      });

      window.electronAPI.obs.onRecordStateChanged((rec: any) => {
        dispatch({
          type: 'SET_OBS_STATUS',
          payload: { isRecording: rec.active },
        });
      });

      window.electronAPI.obs.onStreamStateChanged((stream: any) => {
        dispatch({
          type: 'SET_OBS_STATUS',
          payload: { isStreaming: stream.active },
        });
      });
    }
  }, [dispatch]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextType {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}

