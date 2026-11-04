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
