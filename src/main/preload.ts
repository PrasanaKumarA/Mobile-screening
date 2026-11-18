import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion'),

  // Tool detection & configuration
  checkTools: () => ipcRenderer.invoke('tools:check'),
  tools: {
    checkAll: () => ipcRenderer.invoke('tools:checkAll'),
    validatePath: (tool: string, path: string) =>
      ipcRenderer.invoke('tools:validatePath', tool, path),
    browse: (tool: string) => ipcRenderer.invoke('tools:browse', tool),
    getSettings: () => ipcRenderer.invoke('tools:getSettings'),
    saveSettings: (settings: Record<string, unknown>) =>
      ipcRenderer.invoke('tools:saveSettings', settings),
  },

  // ADB service
  adb: {
    listDevices: () => ipcRenderer.invoke('adb:listDevices'),
    connectWireless: (ip: string, port: number) =>
      ipcRenderer.invoke('adb:connectWireless', ip, port),
    disconnect: (deviceId: string) =>
      ipcRenderer.invoke('adb:disconnect', deviceId),
    restartServer: () => ipcRenderer.invoke('adb:restartServer'),
    getDeviceDiagnostics: (deviceId: string) =>
      ipcRenderer.invoke('adb:getDeviceDiagnostics', deviceId),
  },

  // Scrcpy process control
  scrcpy: {
    startMirroring: (deviceId: string, options: Record<string, unknown>) =>
      ipcRenderer.invoke('scrcpy:start', deviceId, options),
    stopMirroring: (deviceId: string) =>
      ipcRenderer.invoke('scrcpy:stop', deviceId),
    getSession: (deviceId: string) =>
      ipcRenderer.invoke('scrcpy:getSession', deviceId),
    getAllSessions: () => ipcRenderer.invoke('scrcpy:getAllSessions'),
    onFpsUpdate: (callback: (data: { deviceId: string; currentFps: number; skippedFrames: number }) => void) => {
      ipcRenderer.on('scrcpy:fps', (_event, data) => callback(data));
    },
  },

  // Android Universal Audio Companion
  audioCompanion: {
    getStatus: () => ipcRenderer.invoke('audioCompanion:getStatus'),
    isInstalled: (deviceId: string) =>
      ipcRenderer.invoke('audioCompanion:isInstalled', deviceId),
    install: (deviceId: string) =>
      ipcRenderer.invoke('audioCompanion:install', deviceId),
    start: (deviceId: string) =>
      ipcRenderer.invoke('audioCompanion:start', deviceId),
    stop: (deviceId?: string) =>
      ipcRenderer.invoke('audioCompanion:stop', deviceId),
    getStreamUrl: () => ipcRenderer.invoke('audioCompanion:getStreamUrl'),
    getStats: () => ipcRenderer.invoke('audioCompanion:getStats'),
    getAudioRoute: (deviceId: string) =>
      ipcRenderer.invoke('audioCompanion:getAudioRoute', deviceId),
    getSyncMetrics: () => ipcRenderer.invoke('audioCompanion:getSyncMetrics'),
    getDetailedSyncMetrics: () =>
      ipcRenderer.invoke('audioCompanion:getDetailedSyncMetrics'),
    setSyncOffset: (offsetMs: number) =>
      ipcRenderer.invoke('audioCompanion:setSyncOffset', offsetMs),
    setTargetBufferLatency: (targetMs: number) =>
      ipcRenderer.invoke('audioCompanion:setTargetBufferLatency', targetMs),
    calibrateClock: (deviceId?: string) =>
      ipcRenderer.invoke('audioCompanion:calibrateClock', deviceId),
    onStatusChanged: (callback: (data: any) => void) => {
      ipcRenderer.on('audioCompanion:statusChanged', (_event, data) =>
        callback(data)
      );
    },
    onAudioLevel: (callback: (metrics: any) => void) => {
      ipcRenderer.on('audioCompanion:level', (_event, metrics) =>
        callback(metrics)
      );
    },
    onPcmData: (callback: (chunk: Uint8Array) => void) => {
      ipcRenderer.on('audioCompanion:pcm', (_event, data) =>
        callback(data)
      );
    },
    onPcmChunk: (callback: (payload: any) => void) => {
      ipcRenderer.on('audioCompanion:pcmChunk', (_event, data) =>
        callback(data)
      );
    },
  },

  // OBS Studio WebSocket & Streaming Integration
  obs: {
    connect: (url?: string, password?: string) =>
      ipcRenderer.invoke('obs:connect', url, password),
    disconnect: () => ipcRenderer.invoke('obs:disconnect'),
    getStatus: () => ipcRenderer.invoke('obs:getStatus'),
    getRecordStatus: () => ipcRenderer.invoke('obs:getRecordStatus'),
    getStreamStatus: () => ipcRenderer.invoke('obs:getStreamStatus'),
    startRecording: () => ipcRenderer.invoke('obs:startRecording'),
    stopRecording: () => ipcRenderer.invoke('obs:stopRecording'),
    startStreaming: () => ipcRenderer.invoke('obs:startStreaming'),
    stopStreaming: () => ipcRenderer.invoke('obs:stopStreaming'),
    getScenes: () => ipcRenderer.invoke('obs:getScenes'),
    setupSources: (options: Record<string, any>) =>
      ipcRenderer.invoke('obs:setupSources', options),
    setupIpadSources: (options: { sceneName?: string; videoDeviceName: string; audioDeviceName?: string }) =>
      ipcRenderer.invoke('obs:setupIpadSources', options),
    runTestRecording: (durationSeconds: number) =>
      ipcRenderer.invoke('obs:runTestRecording', durationSeconds),
    onStatusChanged: (callback: (data: any) => void) => {
      ipcRenderer.on('obs:statusChanged', (_event, data) => callback(data));
    },
    onRecordStateChanged: (callback: (data: any) => void) => {
      ipcRenderer.on('obs:recordStateChanged', (_event, data) => callback(data));
    },
    onStreamStateChanged: (callback: (data: any) => void) => {
      ipcRenderer.on('obs:streamStateChanged', (_event, data) => callback(data));
    },
  },

  // iPad HDMI Video & Audio Capture
  capture: {
    listDevices: () => ipcRenderer.invoke('capture:listDevices'),
    startCapture: (deviceId: string, options?: Record<string, any>) =>
      ipcRenderer.invoke('capture:start', deviceId, options),
    stopCapture: (deviceId: string) =>
      ipcRenderer.invoke('capture:stop', deviceId),
    getSession: (deviceId: string) =>
      ipcRenderer.invoke('capture:getSession', deviceId),
    onCaptureStarted: (callback: (session: any) => void) => {
      ipcRenderer.on('capture:started', (_event, data) => callback(data));
    },
    onCaptureStopped: (callback: (data: any) => void) => {
      ipcRenderer.on('capture:stopped', (_event, data) => callback(data));
    },
    onCaptureError: (callback: (data: any) => void) => {
      ipcRenderer.on('capture:error', (_event, data) => callback(data));
    },
  },

  // Event listeners
  onDeviceConnected: (callback: (device: any) => void) => {
    ipcRenderer.on('device:connected', (_event, device) => callback(device));
  },
  onDeviceDisconnected: (callback: (deviceId: string) => void) => {
    ipcRenderer.on('device:disconnected', (_event, deviceId) =>
      callback(deviceId)
    );
  },
  onDeviceUnauthorized: (callback: (device: { id: string; name: string }) => void) => {
    ipcRenderer.on('device:unauthorized', (_event, device) => callback(device));
  },
  onMirroringStarted: (callback: (session: any) => void) => {
    ipcRenderer.on('scrcpy:started', (_event, session) => callback(session));
  },
  onMirroringStopped: (callback: (data: { deviceId: string; code?: number }) => void) => {
    ipcRenderer.on('scrcpy:stopped', (_event, data) => callback(data));
  },
  onMirroringError: (callback: (data: { deviceId: string; error: string }) => void) => {
    ipcRenderer.on('scrcpy:error', (_event, data) => callback(data));
  },
  onMirroringAudioError: (callback: (data: { deviceId: string; error: string }) => void) => {
    ipcRenderer.on('scrcpy:audioError', (_event, data) => callback(data));
  },
});
