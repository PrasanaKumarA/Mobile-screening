import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { AdbService, AdbDevice } from './services/adb.service';
import { ScrcpyService, ScrcpyOptions } from './services/scrcpy.service';
import { CaptureService } from './services/capture.service';
import { ToolDetectionService, ToolType, SystemToolsInfo } from './services/tool-detection.service';
import { SettingsService, StoredSettings } from './services/settings.service';
import { AudioCompanionService } from './services/audio-companion.service';
import { ObsWebSocketService } from './services/obs-websocket.service';

// Allow automatic unmuted audio playback without requiring page clicks
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow: BrowserWindow | null = null;
const adbService = new AdbService();
const scrcpyService = new ScrcpyService();
const captureService = new CaptureService();
const toolDetectionService = new ToolDetectionService();
const settingsService = new SettingsService();
const audioCompanionService = new AudioCompanionService();
const obsWebSocketService = new ObsWebSocketService();

/**
 * Apply resolved tool paths to backend services
 */
async function applyToolPaths(tools: SystemToolsInfo): Promise<void> {
  if (tools.adb.status === 'installed' && tools.adb.path) {
    adbService.setAdbPath(tools.adb.path);
    scrcpyService.setAdbPath(tools.adb.path);
    audioCompanionService.setAdbPath(tools.adb.path);
    // Ensure ADB daemon is active
    await adbService.startServer();
    adbService.setAdbReady(true);
  } else {
    adbService.setAdbReady(false);
  }

  if (tools.scrcpy.status === 'installed' && tools.scrcpy.path) {
    scrcpyService.setScrcpyPath(tools.scrcpy.path);
  }

  if (tools.ffmpeg.status === 'installed' && tools.ffmpeg.path) {
    captureService.setFFmpegPath(tools.ffmpeg.path);
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    backgroundColor: '#0f172a',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    // Development Mode: Connect to Vite dev server with automatic retry
    const loadDevServer = (retries = 20) => {
      mainWindow?.loadURL(devServerUrl).catch((err) => {
        if (retries > 0) {
          setTimeout(() => loadDevServer(retries - 1), 300);
        } else {
          console.error(`[Electron] Failed to connect to dev server at ${devServerUrl}:`, err);
        }
      });
    };
    loadDevServer();
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Production Mode: Load compiled HTML file from dist/renderer
    const distHtmlPath = path.join(__dirname, '../renderer/index.html');
    if (!fs.existsSync(distHtmlPath)) {
      console.error(
        `[Electron] Production build not found at: ${distHtmlPath}. Please run "npm run build" first.`
      );
    }
    mainWindow.loadFile(distHtmlPath).then(() => {
      console.log('[Electron] Production file successfully loaded into window.');
    }).catch((err) => {
      console.error(`[Electron] Failed to load production file at ${distHtmlPath}:`, err);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Forward ADB service events to renderer
  adbService.on('device:connected', (device: AdbDevice) => {
    mainWindow?.webContents.send('device:connected', {
      id: device.id,
      name: device.displayName,
      model: device.model,
      manufacturer: device.manufacturer,
      platform: 'android',
      connectionType: device.connectionType,
      status: device.state === 'device' ? 'connected' : device.state,
      authorizationStatus: device.state,
      androidVersion: device.androidVersion,
    });
  });

  adbService.on('device:stateChanged', (device: AdbDevice) => {
    mainWindow?.webContents.send('device:connected', {
      id: device.id,
      name: device.displayName,
      model: device.model,
      manufacturer: device.manufacturer,
      platform: 'android',
      connectionType: device.connectionType,
      status: device.state === 'device' ? 'connected' : device.state,
      authorizationStatus: device.state,
      androidVersion: device.androidVersion,
    });
  });

  adbService.on('device:unauthorized', (device: AdbDevice) => {
    mainWindow?.webContents.send('device:unauthorized', {
      id: device.id,
      name: device.displayName,
    });
  });

  adbService.on('device:disconnected', (deviceId: string) => {
    // If device was mirroring, stop the scrcpy process
    if (scrcpyService.isMirroring(deviceId)) {
      scrcpyService.stopMirroring(deviceId);
    }
    // Cleanly recover audio pipeline on USB disconnect
    audioCompanionService.handleDeviceDisconnected(deviceId);
    mainWindow?.webContents.send('device:disconnected', deviceId);
  });

  // Forward Scrcpy service events to renderer
  scrcpyService.on('started', (data) => {
    mainWindow?.webContents.send('scrcpy:started', data);
  });

  scrcpyService.on('stopped', (data) => {
    mainWindow?.webContents.send('scrcpy:stopped', data);
  });

  scrcpyService.on('error', (data) => {
    mainWindow?.webContents.send('scrcpy:error', data);
  });

  scrcpyService.on('audio:error', (data) => {
    mainWindow?.webContents.send('scrcpy:audioError', data);
  });

  scrcpyService.on('fps', (data) => {
    mainWindow?.webContents.send('scrcpy:fps', data);
  });

  audioCompanionService.on('status-changed', (data) => {
    mainWindow?.webContents.send('audioCompanion:statusChanged', data);
  });

  audioCompanionService.on('audio-level', (metrics) => {
    mainWindow?.webContents.send('audioCompanion:level', metrics);
  });

  audioCompanionService.on('pcm-data', (chunk: Buffer) => {
    mainWindow?.webContents.send('audioCompanion:pcm', chunk);
  });

  audioCompanionService.on('pcm-chunk', (payload) => {
    mainWindow?.webContents.send('audioCompanion:pcmChunk', payload);
  });

  // Forward OBS WebSocket service events to renderer
  obsWebSocketService.on('status-changed', (data) => {
    mainWindow?.webContents.send('obs:statusChanged', data);
  });

  obsWebSocketService.on('record-state-changed', (data) => {
    mainWindow?.webContents.send('obs:recordStateChanged', data);
  });

  obsWebSocketService.on('stream-state-changed', (data) => {
    mainWindow?.webContents.send('obs:streamStateChanged', data);
  });

  // Forward Capture service events to renderer
  captureService.on('capture:started', (session) => {
    mainWindow?.webContents.send('capture:started', session);
  });

  captureService.on('capture:stopped', (data) => {
    mainWindow?.webContents.send('capture:stopped', data);
  });

  captureService.on('capture:error', (data) => {
    mainWindow?.webContents.send('capture:error', data);
  });
}

// Window control IPC handlers
ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window:close', () => {
  mainWindow?.close();
});

ipcMain.handle('window:isMaximized', () => {
  return mainWindow?.isMaximized() ?? false;
});

// App info handler
ipcMain.handle('app:getVersion', () => {
  return app.getVersion();
});

// ============================================================
// Secure Tool Detection & Settings IPC Handlers
// ============================================================

ipcMain.handle('tools:checkAll', async () => {
  const settings = settingsService.getSettings();
  const tools = await toolDetectionService.detectAll({
    adbPath: settings.adbPath,
    scrcpyPath: settings.scrcpyPath,
    ffmpegPath: settings.ffmpegPath,
    ffprobePath: settings.ffprobePath,
    obsPath: settings.obsPath,
  });
  await applyToolPaths(tools);
  return tools;
});

ipcMain.handle('tools:validatePath', async (_event, tool: ToolType, inputPath: string) => {
  if (!inputPath || !inputPath.trim()) {
    return {
      name: tool.toUpperCase(),
      toolType: tool,
      status: 'missing',
      error: 'Path cannot be empty',
    };
  }
  return toolDetectionService.verifyExecutable(tool, path.resolve(inputPath.trim()));
});

ipcMain.handle('tools:browse', async (_event, tool: ToolType) => {
  if (!mainWindow) return null;

  const toolLabels: Record<ToolType, string> = {
    adb: 'adb.exe (Android Debug Bridge)',
    scrcpy: 'scrcpy.exe (Screen Copy)',
    ffmpeg: 'ffmpeg.exe (FFmpeg)',
    ffprobe: 'ffprobe.exe (ffprobe Media Prober)',
    obs: 'obs64.exe (OBS Studio 64-bit)',
  };

  const result = await dialog.showOpenDialog(mainWindow, {
    title: `Select ${toolLabels[tool] || tool} Executable`,
    filters: [
      { name: 'Executables (*.exe)', extensions: ['exe'] },
      { name: 'All Files (*.*)', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const selectedPath = result.filePaths[0];
  const validation = await toolDetectionService.verifyExecutable(tool, selectedPath);
  return validation;
});

ipcMain.handle('tools:getSettings', () => {
  return settingsService.getSettings();
});

ipcMain.handle('tools:saveSettings', async (_event, partialSettings: Partial<StoredSettings>) => {
  const updatedSettings = settingsService.saveSettings(partialSettings);
  const tools = await toolDetectionService.detectAll({
    adbPath: updatedSettings.adbPath,
    scrcpyPath: updatedSettings.scrcpyPath,
    ffmpegPath: updatedSettings.ffmpegPath,
    ffprobePath: updatedSettings.ffprobePath,
    obsPath: updatedSettings.obsPath,
  });
  await applyToolPaths(tools);
  return { settings: updatedSettings, tools };
});

// Legacy check handler
ipcMain.handle('tools:check', async () => {
  const settings = settingsService.getSettings();
  const tools = await toolDetectionService.detectAll({
    adbPath: settings.adbPath,
    scrcpyPath: settings.scrcpyPath,
    ffmpegPath: settings.ffmpegPath,
    ffprobePath: settings.ffprobePath,
  });
  await applyToolPaths(tools);
  return {
    adb: tools.adb.status === 'installed',
    scrcpy: tools.scrcpy.status === 'installed',
    ffmpeg: tools.ffmpeg.status === 'installed',
  };
});

// ============================================================
// ADB & Scrcpy Mirroring IPC Handlers
// ============================================================

ipcMain.handle('adb:listDevices', async () => {
  try {
    const rawDevices = await adbService.listDevices();
    return rawDevices.map((device: AdbDevice) => ({
      id: device.id,
      name: device.displayName,
      model: device.model,
      manufacturer: device.manufacturer,
      platform: 'android' as const,
      connectionType: device.connectionType,
      status: device.state === 'device' ? ('connected' as const) : (device.state as any),
      authorizationStatus: device.state,
      androidVersion: device.androidVersion,
    }));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Error listing devices:', msg);
    return [];
  }
});

ipcMain.handle('adb:connectWireless', async (_event, ip: string, port: number) => {
  return adbService.connectWireless(ip, port);
});

ipcMain.handle('adb:disconnect', async (_event, deviceId: string) => {
  if (scrcpyService.isMirroring(deviceId)) {
    scrcpyService.stopMirroring(deviceId);
  }
  return adbService.disconnect(deviceId);
});

ipcMain.handle('adb:restartServer', async () => {
  return adbService.restartServer();
});

ipcMain.handle('adb:getDeviceDiagnostics', async (_event, deviceId: string) => {
  return adbService.getDeviceDiagnostics(deviceId);
});

// Scrcpy process control
ipcMain.handle('scrcpy:start', async (_event, deviceId: string, options: ScrcpyOptions) => {
  return scrcpyService.startMirroring(deviceId, options);
});

ipcMain.handle('scrcpy:stop', async (_event, deviceId: string) => {
  return scrcpyService.stopMirroring(deviceId);
});

ipcMain.handle('scrcpy:getSession', async (_event, deviceId: string) => {
  return scrcpyService.getSession(deviceId);
});

ipcMain.handle('scrcpy:getAllSessions', async () => {
  return scrcpyService.getAllSessions();
});

// ============================================================
// Android Bluetooth Dual-Audio Companion IPC Handlers
// ============================================================

ipcMain.handle('audioCompanion:getStatus', async () => {
  return {
    status: audioCompanionService.getStatus(),
    streamUrl: audioCompanionService.getStreamUrl(),
    stats: audioCompanionService.getStats(),
    error: audioCompanionService.getLastError(),
  };
});

ipcMain.handle('audioCompanion:isInstalled', async (_event, deviceId: string) => {
  return audioCompanionService.isInstalled(deviceId);
});

ipcMain.handle('audioCompanion:install', async (_event, deviceId: string) => {
  return audioCompanionService.installCompanion(deviceId);
});

ipcMain.handle('audioCompanion:start', async (_event, deviceId: string) => {
  return audioCompanionService.startAudioCapture(deviceId);
});

ipcMain.handle('audioCompanion:stop', async (_event, deviceId?: string) => {
  return audioCompanionService.stopAudioCapture(deviceId);
});

ipcMain.handle('audioCompanion:getStreamUrl', async () => {
  return audioCompanionService.getStreamUrl();
});

ipcMain.handle('audioCompanion:getStats', async () => {
  return audioCompanionService.getStats();
});

ipcMain.handle('audioCompanion:getAudioRoute', async (_event, deviceId: string) => {
  return audioCompanionService.getAudioRoute(deviceId);
});

ipcMain.handle('audioCompanion:getSyncMetrics', async () => {
  return audioCompanionService.getSyncMetrics();
});

ipcMain.handle('audioCompanion:getDetailedSyncMetrics', async () => {
  return audioCompanionService.getDetailedSyncMetrics();
});

ipcMain.handle('audioCompanion:setTargetBufferLatency', async (_event, targetMs: number) => {
  audioCompanionService.setTargetBufferLatency(targetMs);
  return { success: true, targetMs };
});

ipcMain.handle('audioCompanion:calibrateClock', async (_event, deviceId?: string) => {
  return audioCompanionService.calibrateClock(deviceId);
});

ipcMain.handle('audioCompanion:setSyncOffset', async (_event, offsetMs: number) => {
  audioCompanionService.setSyncOffset(offsetMs);
  return { success: true, offsetMs };
});

// ============================================================
// OBS Studio & OBS WebSocket IPC Handlers
// ============================================================

ipcMain.handle('obs:connect', async (_event, url?: string, password?: string) => {
  const settings = settingsService.getSettings();
  const targetUrl = url || settings.obsWebSocketUrl || 'ws://127.0.0.1:4455';
  const targetPassword = password !== undefined ? password : settings.obsWebSocketPassword;
  return obsWebSocketService.connect(targetUrl, targetPassword);
});

ipcMain.handle('obs:disconnect', async () => {
  obsWebSocketService.disconnect();
  return { success: true };
});

ipcMain.handle('obs:getStatus', async () => {
  return obsWebSocketService.getStatus();
});

ipcMain.handle('obs:getRecordStatus', async () => {
  return obsWebSocketService.getRecordStatus();
});

ipcMain.handle('obs:getStreamStatus', async () => {
  return obsWebSocketService.getStreamStatus();
});

ipcMain.handle('obs:startRecording', async () => {
  return obsWebSocketService.startRecording();
});

ipcMain.handle('obs:stopRecording', async () => {
  return obsWebSocketService.stopRecording();
});

ipcMain.handle('obs:startStreaming', async () => {
  return obsWebSocketService.startStreaming();
});

ipcMain.handle('obs:stopStreaming', async () => {
  return obsWebSocketService.stopStreaming();
});

ipcMain.handle('obs:getScenes', async () => {
  return obsWebSocketService.getSceneList();
});

ipcMain.handle('obs:setupSources', async (_event, options: Record<string, any>) => {
  return obsWebSocketService.setupMobileMirrorSources({
    sceneName: options.sceneName,
    deviceId: options.deviceId,
    streamUrl: options.streamUrl || audioCompanionService.getStreamUrl(),
    syncOffsetMs: options.syncOffsetMs !== undefined ? options.syncOffsetMs : audioCompanionService.getSyncOffset(),
  });
});

ipcMain.handle('obs:setupIpadSources', async (_event, options: { sceneName?: string; videoDeviceName: string; audioDeviceName?: string }) => {
  return obsWebSocketService.setupIpadSources(options);
});

ipcMain.handle('obs:runTestRecording', async (_event, durationSeconds: number = 10) => {
  return obsWebSocketService.runTestRecording(durationSeconds);
});

// ============================================================
// iPad HDMI Capture Card IPC Handlers
// ============================================================

ipcMain.handle('capture:listDevices', async () => {
  return captureService.listCaptureDevices();
});

ipcMain.handle('capture:start', async (_event, deviceId: string, options: any) => {
  return captureService.startCapture(deviceId, options);
});

ipcMain.handle('capture:stop', async (_event, deviceId: string) => {
  return captureService.stopCapture(deviceId);
});

ipcMain.handle('capture:getSession', async (_event, deviceId: string) => {
  return captureService.getSession(deviceId);
});

app.whenReady().then(async () => {
  createWindow();

  // Initial tool detection on startup
  const settings = settingsService.getSettings();
  const initialTools = await toolDetectionService.detectAll({
    adbPath: settings.adbPath,
    scrcpyPath: settings.scrcpyPath,
    ffmpegPath: settings.ffmpegPath,
    ffprobePath: settings.ffprobePath,
    obsPath: settings.obsPath,
  });
  await applyToolPaths(initialTools);

  // Set initial sync offset from settings if configured
  if (settings.audioSyncOffsetMs) {
    audioCompanionService.setSyncOffset(settings.audioSyncOffsetMs);
  }

  // Start background device polling
  adbService.startDevicePolling(2500);
});

app.on('window-all-closed', () => {
  adbService.dispose();
  scrcpyService.dispose();
  captureService.dispose();
  audioCompanionService.dispose();
  obsWebSocketService.dispose();
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
