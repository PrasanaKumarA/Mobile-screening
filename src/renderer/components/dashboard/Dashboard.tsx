import React, { useState, useEffect, useCallback } from 'react';
import {
  Monitor,
  Smartphone,
  Tablet,
  Wifi,
  Usb,
  Play,
  Square,
  Radio,
  Zap,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Activity,
  RefreshCw,
  Settings,
  Loader2,
  Video,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Card from '../common/Card';
import StatusBadge from '../common/StatusBadge';
import { useAppContext } from '../../context/AppContext';
import type { ToolInfo } from '../../types';

export default function Dashboard() {
  const { state, dispatch } = useAppContext();
  const navigate = useNavigate();
  const [isTestingTools, setIsTestingTools] = useState(false);
  const [isRefreshingDevices, setIsRefreshingDevices] = useState(false);
  const [startingDeviceId, setStartingDeviceId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const checkAllTools = useCallback(async () => {
    if (window.electronAPI?.tools?.checkAll) {
      setIsTestingTools(true);
      try {
        const tools = await window.electronAPI.tools.checkAll();
        dispatch({ type: 'SET_TOOL_STATUS', payload: tools });
      } catch (err) {
        console.error('Failed to check tools:', err);
      } finally {
        setIsTestingTools(false);
      }
    }
  }, [dispatch]);

  const refreshDevices = useCallback(async () => {
    if (!window.electronAPI) return;
    setIsRefreshingDevices(true);
    try {
      const devices = await window.electronAPI.adb.listDevices();
      dispatch({ type: 'SET_DEVICES', payload: devices });
    } catch (err: any) {
      console.error('Failed to refresh devices:', err);
      setErrorMessage(err.message || 'Failed to detect devices via ADB');
    } finally {
      setTimeout(() => setIsRefreshingDevices(false), 600);
    }
  }, [dispatch]);

  const handleRestartAdb = async () => {
    if (!window.electronAPI) return;
    setIsRefreshingDevices(true);
    setErrorMessage(null);
    try {
      await window.electronAPI.adb.restartServer();
      const devices = await window.electronAPI.adb.listDevices();
      dispatch({ type: 'SET_DEVICES', payload: devices });
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to restart ADB server');
    } finally {
      setIsRefreshingDevices(false);
    }
  };

  useEffect(() => {
    if (window.electronAPI) {
      checkAllTools();

      if (window.electronAPI.tools?.getSettings) {
        window.electronAPI.tools.getSettings().then((settings) => {
          dispatch({ type: 'SET_APP_SETTINGS', payload: settings });
        });
      }

      refreshDevices();

      window.electronAPI.onDeviceConnected((device: any) => {
        dispatch({ type: 'ADD_DEVICE', payload: device });
      });

      window.electronAPI.onDeviceDisconnected((deviceId: string) => {
        dispatch({ type: 'REMOVE_DEVICE', payload: deviceId });
      });

      window.electronAPI.onMirroringStarted((session: any) => {
        setStartingDeviceId(null);
        setErrorMessage(null);
        dispatch({ type: 'SET_MIRRORING_STATUS', payload: 'active' });
        dispatch({ type: 'SET_SESSION', payload: session });
      });

      window.electronAPI.onMirroringStopped((data: any) => {
        setStartingDeviceId(null);
        dispatch({ type: 'SET_MIRRORING_STATUS', payload: 'idle' });
        dispatch({ type: 'REMOVE_SESSION', payload: data.deviceId });
      });

      window.electronAPI.onMirroringError((data: any) => {
        setStartingDeviceId(null);
        setErrorMessage(data.error || 'Mirroring encountered an error');
        dispatch({ type: 'SET_MIRRORING_STATUS', payload: 'error' });
      });

      if (window.electronAPI.onMirroringAudioError) {
        window.electronAPI.onMirroringAudioError((data: any) => {
          dispatch({ type: 'SET_AUDIO_ERROR', payload: data });
        });
      }
    }
  }, [dispatch, checkAllTools, refreshDevices]);

  const handleStartMirroring = async (deviceId: string) => {
    if (!window.electronAPI) return;
    const device = state.devices.find((d) => d.id === deviceId);
    if (!device) return;

    if (state.toolStatus.scrcpy.status !== 'installed') {
      setErrorMessage('scrcpy is not installed or configured. Please configure scrcpy path in Settings.');
      return;
    }

    setStartingDeviceId(deviceId);
    setErrorMessage(null);
    dispatch({ type: 'SET_MIRRORING_STATUS', payload: 'starting' });

    try {
      const windowTitle = `MobileMirror - ${device.model || device.name || device.id}`;
      const response = await window.electronAPI.scrcpy.startMirroring(deviceId, {
        maxSize: 1920,
        maxFps: 60,
        bitRate: '16M',
        videoCodec: 'h264',
        noAudio: !state.audioSettings.enabled,
        audioCodec: state.audioSettings.codec || 'opus',
        orientation: 'auto',
        stayAwake: true,
        showTouches: false,
        turnScreenOff: false,
        windowTitle,
      });

      if (!response.success) {
        setErrorMessage(response.error || 'Failed to start scrcpy mirroring');
        setStartingDeviceId(null);
        dispatch({ type: 'SET_MIRRORING_STATUS', payload: 'error' });
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to launch scrcpy');
      setStartingDeviceId(null);
      dispatch({ type: 'SET_MIRRORING_STATUS', payload: 'error' });
    }
  };

  const handleStopMirroring = async (deviceId: string) => {
    if (!window.electronAPI) return;
    try {
      await window.electronAPI.scrcpy.stopMirroring(deviceId);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to stop mirroring');
    }
  };

  const androidDevices = state.devices.filter((d) => d.platform === 'android');
  const ipadDevices = state.devices.filter((d) => d.platform === 'ipad');
  const hasConnectedDevices = state.devices.some((d) => d.status === 'connected');
  const isAnyMirroringActive = state.mirroringStatus === 'active' || Object.keys(state.activeSessions).length > 0;

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-500/20">
              <Monitor className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">MobileMirror Studio</h1>
              <p className="text-sm text-surface-400">Low-latency mobile mirroring for gaming and live streaming</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge
            status={isAnyMirroringActive ? 'active' : hasConnectedDevices ? 'connected' : 'idle'}
            label={isAnyMirroringActive ? 'Mirroring Active' : hasConnectedDevices ? `${androidDevices.length} Connected` : 'No Devices'}
            size="md"
            pulse={isAnyMirroringActive || hasConnectedDevices}
          />
        </div>
      </div>

      {/* Global Error Banner */}
      {errorMessage && (
        <div className="flex items-center justify-between p-3.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-xs px-2 py-1 rounded bg-surface-800 hover:bg-surface-700 text-surface-300"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* System Status Grid */}
      <div className="grid grid-cols-4 gap-4">
        <StatusTile
          icon={Smartphone}
          label="Android"
          value={androidDevices.length > 0 ? `${androidDevices.length} Device${androidDevices.length > 1 ? 's' : ''}` : 'No devices'}
          status={androidDevices.length > 0 ? 'connected' : 'disconnected'}
          gradient="from-green-500/10 to-emerald-500/5"
          borderColor="border-emerald-500/20"
          iconColor="text-emerald-400"
        />
        <StatusTile
          icon={Tablet}
          label="iPad"
          value="Not configured"
          status="unavailable"
          gradient="from-blue-500/10 to-cyan-500/5"
          borderColor="border-blue-500/20"
          iconColor="text-blue-400"
        />
        <StatusTile
          icon={Monitor}
          label="Mirroring"
          value={isAnyMirroringActive ? 'Streaming' : 'Idle'}
          status={isAnyMirroringActive ? 'active' : 'idle'}
          gradient="from-brand-500/10 to-violet-500/5"
          borderColor="border-brand-500/20"
          iconColor="text-brand-400"
        />
        <StatusTile
          icon={Radio}
          label="OBS Ready"
          value="Ready"
          status="ready"
          gradient="from-amber-500/10 to-orange-500/5"
          borderColor="border-amber-500/20"
          iconColor="text-amber-400"
        />
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left Column - Device Connections */}
        <div className="col-span-2 space-y-6">
          {/* Android Connection Panel */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <Smartphone className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Android Devices</h3>
                  <p className="text-xs text-surface-400">Real-time USB & Wireless scrcpy mirroring</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={refreshDevices}
                  disabled={isRefreshingDevices}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-300 hover:text-white text-xs border border-surface-700/50 transition-colors"
                  title="Rescan ADB devices"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingDevices ? 'animate-spin text-brand-400' : ''}`} />
                  <span>Rescan</span>
                </button>
                <button
                  onClick={() => navigate('/devices')}
                  className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5"
                >
                  <Usb className="w-3.5 h-3.5" />
                  Manage Devices
                </button>
              </div>
            </div>

            {androidDevices.length > 0 ? (
              <div className="space-y-3">
                {androidDevices.map((device) => {
                  const isAuthorized = device.status === 'connected' || device.authorizationStatus === 'device';
                  const isUnauthorized = device.status === 'unauthorized' || device.authorizationStatus === 'unauthorized';
                  const session = state.activeSessions[device.id];
                  const isMirroring = !!session && session.status === 'active';
                  const isStartingThis = startingDeviceId === device.id;

                  return (
                    <div
                      key={device.id}
                      className={`p-4 rounded-xl border transition-all ${
                        isMirroring
                          ? 'bg-emerald-950/20 border-emerald-500/40 shadow-lg shadow-emerald-500/5'
                          : 'bg-surface-800/50 border-surface-700/40 hover:border-surface-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-2.5 rounded-xl ${isMirroring ? 'bg-emerald-500/20 text-emerald-300' : isAuthorized ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                            <Smartphone className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-white">
                                {device.name || device.model}
                              </p>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-700 text-surface-300 font-medium uppercase tracking-wider">
                                {device.connectionType}
                              </span>
                              {device.androidVersion && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-300 border border-brand-500/20 font-medium">
                                  Android {device.androidVersion}
                                </span>
                              )}
                              {isMirroring && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold animate-pulse">
                                  ● LIVE MIRROR
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-surface-400 mt-1 font-mono">
                              Serial: <span className="text-surface-300">{device.id}</span>
                              {device.manufacturer && <span className="ml-2 font-sans text-surface-500">• {device.manufacturer}</span>}
                              {isMirroring && session?.pid && (
                                <span className="ml-2 text-emerald-400 font-sans">• PID {session.pid}</span>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <StatusBadge
                            status={isMirroring ? 'active' : isAuthorized ? 'connected' : isUnauthorized ? 'unauthorized' : 'disconnected'}
                            label={isMirroring ? 'Mirroring' : isAuthorized ? 'Authorized' : isUnauthorized ? 'Unauthorized' : 'Offline'}
                            pulse={isMirroring || isAuthorized}
                          />

                          {isAuthorized ? (
                            isMirroring ? (
                              <button
                                onClick={() => handleStopMirroring(device.id)}
                                className="btn-danger text-xs flex items-center gap-1.5 px-3 py-1.5 font-medium"
                                title="Stop scrcpy mirroring session"
                              >
                                <Square className="w-3.5 h-3.5 fill-current" />
                                Stop Mirror
                              </button>
                            ) : (
                              <button
                                onClick={() => handleStartMirroring(device.id)}
                                disabled={isStartingThis}
                                className="btn-primary text-xs flex items-center gap-1.5 px-3 py-1.5 font-medium"
                                title="Start 1080p 60fps scrcpy mirroring"
                              >
                                {isStartingThis ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                )}
                                <span>{isStartingThis ? 'Launching...' : 'Start Mirror'}</span>
                              </button>
                            )
                          ) : (
                            <button
                              onClick={() => navigate('/devices')}
                              className="btn-secondary text-xs px-2.5 py-1.5 text-amber-300 hover:text-white"
                              title="View authorization instructions"
                            >
                              Authorize
                            </button>
                          )}

                          <button
                            onClick={() => {
                              dispatch({ type: 'SET_ACTIVE_DEVICE', payload: device });
                              navigate('/mirroring');
                            }}
                            className="p-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-400 hover:text-white transition-colors border border-surface-700/50"
                            title="Open Advanced Mirroring Studio"
                          >
                            <Settings className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Mirroring Details Bar (when active) */}
                      {isMirroring && (
                        <div className="mt-3 pt-3 border-t border-emerald-500/20 flex flex-wrap items-center justify-between text-xs text-emerald-300/90 gap-2">
                          <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1">
                              <Video className="w-3.5 h-3.5 text-emerald-400" />
                              <span>1080p @ 60 FPS • 16 Mbps (H.264)</span>
                            </span>
                            <span className="flex items-center gap-1">
                              {session?.audioStatus === 'error' ? (
                                <span className="text-red-400 font-medium flex items-center gap-1" title={session.audioError}>
                                  <AlertCircle className="w-3.5 h-3.5" />
                                  Audio Error
                                </span>
                              ) : !state.audioSettings.enabled ? (
                                <span className="text-surface-400 flex items-center gap-1">
                                  <VolumeX className="w-3.5 h-3.5" />
                                  Audio Disabled
                                </span>
                              ) : (
                                <span className="text-emerald-400 flex items-center gap-1">
                                  <Volume2 className="w-3.5 h-3.5" />
                                  <span>{state.audioSettings.codec.toUpperCase()} Audio</span>
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-[11px] text-surface-400 bg-surface-900/60 px-2 py-0.5 rounded border border-surface-700/40">
                              OBS Capture: <span className="text-white font-mono font-medium">MobileMirror - {device.model || device.name}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => navigate('/audio')}
                              className="text-[11px] text-brand-400 hover:text-brand-300 underline"
                              title="View OBS Audio Setup & Routing"
                            >
                              Audio Setup →
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Unauthorized Warning Banner */}
                      {isUnauthorized && (
                        <div className="mt-2.5 pt-2 border-t border-surface-700/40 flex items-center justify-between text-xs text-amber-300/90 bg-amber-500/5 px-3 py-2 rounded-lg">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                            <span>
                              Unlock your device and tap <strong className="text-white">"Always allow from this computer"</strong> then <strong className="text-white">"Allow"</strong>.
                            </span>
                          </div>
                          <button
                            onClick={handleRestartAdb}
                            className="text-[11px] underline hover:text-white ml-2 flex-shrink-0"
                          >
                            Restart ADB
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyDeviceState
                icon={Smartphone}
                title="No Android devices connected"
                description="Connect an Android phone via USB cable and enable USB Debugging."
                action="Connect Android"
                onAction={() => navigate('/devices')}
              />
            )}
          </Card>

          {/* iPad Connection Panel */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <Tablet className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">iPad Connection</h3>
                  <p className="text-xs text-surface-400">HDMI capture card input for iOS devices</p>
                </div>
              </div>
            </div>

            <EmptyDeviceState
              icon={Tablet}
              title="iPad capture ready for HDMI capture hardware"
              description="iPad mirroring connects via USB HDMI capture devices. The modular architecture is isolated from Android ADB."
              muted
            />
          </Card>
        </div>

        {/* Right Column - Quick Actions & Recent */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card>
            <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider mb-4">
              Quick Actions
            </h3>
            <div className="space-y-2">
              <QuickAction
                icon={Play}
                label="Mirroring Studio"
                description="Custom resolution, FPS, bitrate & audio"
                onClick={() => navigate('/mirroring')}
                disabled={!hasConnectedDevices}
              />
              <QuickAction
                icon={Usb}
                label="USB Devices"
                description="Manage and pair USB Android phones"
                onClick={() => navigate('/devices')}
              />
              <QuickAction
                icon={Wifi}
                label="Wireless Connect"
                description="Pair over Wi-Fi (adb tcpip 5555)"
                onClick={() => navigate('/devices')}
              />
              <QuickAction
                icon={Radio}
                label="OBS Live Setup"
                description="Stream window capture instructions"
                onClick={() => navigate('/streaming')}
              />
            </div>
          </Card>

          {/* Tool Status */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider">
                System Tools
              </h3>
              <button
                onClick={checkAllTools}
                disabled={isTestingTools}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md bg-surface-800 hover:bg-surface-700 text-surface-300 hover:text-white transition-colors border border-surface-700/50"
                title="Test and verify all tool installations"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTestingTools ? 'animate-spin text-brand-400' : ''}`} />
                <span>{isTestingTools ? 'Testing...' : 'Test Tools'}</span>
              </button>
            </div>

            <div className="space-y-3">
              <ToolStatusRow
                name="ADB"
                description="Android Debug Bridge"
                toolInfo={state.toolStatus.adb}
                onConfigure={() => navigate('/settings')}
              />
              <ToolStatusRow
                name="scrcpy"
                description="Screen mirroring engine"
                toolInfo={state.toolStatus.scrcpy}
                onConfigure={() => navigate('/settings')}
              />
              <ToolStatusRow
                name="FFmpeg"
                description="Media processing"
                toolInfo={state.toolStatus.ffmpeg}
                onConfigure={() => navigate('/settings')}
              />
              {state.toolStatus.ffprobe && (
                <ToolStatusRow
                  name="ffprobe"
                  description="Stream analyzer"
                  toolInfo={state.toolStatus.ffprobe}
                  onConfigure={() => navigate('/settings')}
                />
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-surface-800 flex items-center justify-between">
              <span className="text-[11px] text-surface-500">
                Custom paths configurable in settings
              </span>
              <button
                onClick={() => navigate('/settings')}
                className="flex items-center gap-1 text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors"
              >
                <Settings className="w-3.5 h-3.5" />
                Configure Paths
              </button>
            </div>
          </Card>

          {/* Recent Connections */}
          <Card>
            <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider mb-4">
              Recent Connections
            </h3>
            {state.recentConnections.length > 0 ? (
              <div className="space-y-2">
                {state.recentConnections.slice(0, 5).map((conn) => (
                  <div
                    key={conn.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-800/50 transition-colors cursor-pointer"
                  >
                    <Clock className="w-3.5 h-3.5 text-surface-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-surface-300 truncate">
                        {conn.device.name}
                      </p>
                      <p className="text-[10px] text-surface-500">{conn.connectedAt}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <Clock className="w-8 h-8 text-surface-600 mx-auto mb-2" />
                <p className="text-xs text-surface-500">No recent connections</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function StatusTile({
  icon: Icon,
  label,
  value,
  status,
  gradient,
  borderColor,
  iconColor,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  status: string;
  gradient: string;
  borderColor: string;
  iconColor: string;
}) {
  return (
    <div
      className={`
        relative overflow-hidden rounded-xl border p-4
        bg-gradient-to-br ${gradient} ${borderColor}
        transition-all duration-300 hover:scale-[1.02]
      `}
    >
      <div className="flex items-start justify-between mb-3">
        <Icon className={`w-5 h-5 ${iconColor}`} />
        <StatusBadge status={status as any} size="sm" />
      </div>
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-xs text-surface-400 mt-0.5">{label}</p>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  description,
  onClick,
  disabled = false,
}: {
  icon: React.ElementType;
  label: string;
  description: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        w-full flex items-center gap-3 p-3 rounded-lg text-left
        transition-all duration-200 group
        ${
          disabled
            ? 'opacity-40 cursor-not-allowed bg-surface-800/30'
            : 'hover:bg-surface-800/70 bg-surface-800/30 hover:border-brand-500/20 border border-transparent'
        }
      `}
    >
      <div className="p-2 rounded-lg bg-surface-700/50 group-hover:bg-brand-600/20 transition-colors">
        <Icon className="w-4 h-4 text-surface-300 group-hover:text-brand-400 transition-colors" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-surface-200">{label}</p>
        <p className="text-[11px] text-surface-500 truncate">{description}</p>
      </div>
      <ArrowRight className="w-3.5 h-3.5 text-surface-600 group-hover:text-surface-400 transition-colors" />
    </button>
  );
}

function ToolStatusRow({
  name,
  description,
  toolInfo,
  onConfigure,
}: {
  name: string;
  description: string;
  toolInfo?: ToolInfo;
  onConfigure?: () => void;
}) {
  const status = toolInfo?.status || 'missing';
  const version = toolInfo?.version;
  const error = toolInfo?.error;
  const path = toolInfo?.path;

  const getStatusLabel = () => {
    if (status === 'installed') {
      return version ? `Installed (v${version})` : 'Installed';
    }
    if (status === 'error') {
      return 'Error';
    }
    return 'Missing';
  };

  return (
    <div className="p-2.5 rounded-lg bg-surface-800/40 border border-surface-700/30 hover:border-surface-700 transition-colors">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-surface-200">{name}</p>
            <StatusBadge
              status={status}
              label={getStatusLabel()}
              size="sm"
            />
          </div>
          <p className="text-[11px] text-surface-500 mt-0.5">{description}</p>
        </div>

        {onConfigure && (
          <button
            onClick={onConfigure}
            className="p-1.5 rounded-md hover:bg-surface-700 text-surface-400 hover:text-white transition-colors"
            title="Configure path"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {status === 'installed' && path && (
        <p className="text-[10px] text-emerald-400/80 font-mono mt-1.5 truncate" title={path}>
          Path: {path}
        </p>
      )}

      {status !== 'installed' && error && (
        <p className="text-[10px] text-amber-400/80 mt-1.5 line-clamp-2" title={error}>
          {error}
        </p>
      )}
    </div>
  );
}

function EmptyDeviceState({
  icon: Icon,
  title,
  description,
  action,
  onAction,
  muted = false,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
  muted?: boolean;
}) {
  return (
    <div
      className={`
        flex flex-col items-center text-center py-8 px-4 rounded-lg border border-dashed
        ${muted ? 'border-surface-700/30 bg-surface-800/20' : 'border-surface-600/30 bg-surface-800/30'}
      `}
    >
      <Icon className={`w-10 h-10 mb-3 ${muted ? 'text-surface-700' : 'text-surface-600'}`} />
      <h4 className={`text-sm font-medium mb-1 ${muted ? 'text-surface-500' : 'text-surface-300'}`}>
        {title}
      </h4>
      <p className={`text-xs max-w-xs ${muted ? 'text-surface-600' : 'text-surface-400'}`}>
        {description}
      </p>
      {action && onAction && (
        <button onClick={onAction} className="btn-primary mt-4 text-sm">
          {action}
        </button>
      )}
    </div>
  );
}


