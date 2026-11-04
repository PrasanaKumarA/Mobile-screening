import React, { useState, useEffect } from 'react';
import {
  Monitor,
  Play,
  Square,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Volume2,
  VolumeX,
  Gauge,
  Video,
  Radio,
  ExternalLink,
  RotateCw,
  Eye,
  Loader2,
  ShieldAlert,
  Speaker,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Card from '../common/Card';
import PageHeader from '../common/PageHeader';
import StatusBadge from '../common/StatusBadge';
import { useAppContext } from '../../context/AppContext';

export default function ScreenMirroring() {
  const { state, dispatch } = useAppContext();
  const navigate = useNavigate();

  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [stayAwake, setStayAwake] = useState(true);
  const [showTouches, setShowTouches] = useState(false);
  const [turnScreenOff, setTurnScreenOff] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  // Quick mirroring settings (defaults per Task 3)
  const [maxSize, setMaxSize] = useState<number>(1920);
  const [maxFps, setMaxFps] = useState<number>(60);
  const [bitRate, setBitRate] = useState<string>('16M'); // 16 Mbps
  const [videoCodec, setVideoCodec] = useState<'h264' | 'h265'>('h264');
  const [audioMode, setAudioMode] = useState<'bluetooth_dual' | 'standard_scrcpy' | 'none'>('bluetooth_dual');
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);
  const [orientation, setOrientation] = useState<'auto' | 'landscape' | 'portrait'>('auto');

  const connectedDevices = state.devices.filter((d) => d.platform === 'android');
  const selectedDevice = connectedDevices.find((d) => d.id === selectedDeviceId) || connectedDevices[0];

  const isScrcpyInstalled = state.toolStatus.scrcpy.status === 'installed';
  const isAdbInstalled = state.toolStatus.adb.status === 'installed';

  const isAuthorized = selectedDevice?.status === 'connected' || selectedDevice?.authorizationStatus === 'device';
  const isUnauthorized = selectedDevice?.status === 'unauthorized' || selectedDevice?.authorizationStatus === 'unauthorized';

  // Check if selected device currently has an active mirroring session
  const activeSession = selectedDevice ? state.activeSessions[selectedDevice.id] : undefined;
  const isMirroringActive = activeSession?.status === 'active' || state.mirroringStatus === 'active';

  // Default select first connected device
  useEffect(() => {
    if (connectedDevices.length > 0 && (!selectedDeviceId || !connectedDevices.some((d) => d.id === selectedDeviceId))) {
      setSelectedDeviceId(connectedDevices[0].id);
    }
  }, [connectedDevices, selectedDeviceId]);

  // Setup scrcpy event listeners
  useEffect(() => {
    if (!window.electronAPI) return;

    window.electronAPI.onMirroringStarted((session: any) => {
      setIsStarting(false);
      setErrorMessage(null);
      dispatch({ type: 'SET_MIRRORING_STATUS', payload: 'active' });
      dispatch({ type: 'SET_SESSION', payload: session });
    });

    window.electronAPI.onMirroringStopped((data: any) => {
      setIsStarting(false);
      dispatch({ type: 'SET_MIRRORING_STATUS', payload: 'idle' });
      dispatch({ type: 'REMOVE_SESSION', payload: data.deviceId });
    });

    window.electronAPI.onMirroringError((data: any) => {
      setIsStarting(false);
      setErrorMessage(data.error || 'scrcpy mirroring encountered an error');
      dispatch({ type: 'SET_MIRRORING_STATUS', payload: 'error' });
    });

    if (window.electronAPI.onMirroringAudioError) {
      window.electronAPI.onMirroringAudioError((data: any) => {
        dispatch({ type: 'SET_AUDIO_ERROR', payload: data });
      });
    }
  }, [dispatch]);

  const handleStartMirror = async () => {
    if (!selectedDevice || !window.electronAPI) return;

    if (!isAuthorized) {
      setErrorMessage('Device is unauthorized. Please accept the USB debugging prompt on your phone.');
      return;
    }

    if (!isScrcpyInstalled) {
      setErrorMessage('scrcpy is not installed or configured. Please set the scrcpy path in Settings.');
      return;
    }

    setErrorMessage(null);
    setIsStarting(true);
    dispatch({ type: 'SET_MIRRORING_STATUS', payload: 'starting' });

    try {
      const windowTitle = `MobileMirror - ${selectedDevice.model || selectedDevice.name || selectedDevice.id}`;
      const useDualAudio = audioMode === 'bluetooth_dual';
      const noAudio = useDualAudio || audioMode === 'none';

      const response = await window.electronAPI.scrcpy.startMirroring(selectedDevice.id, {
        maxSize,
        maxFps,
        bitRate,
        videoCodec,
        noAudio,
        audioCodec: 'opus',
        orientation,
        stayAwake,
        showTouches,
        turnScreenOff,
        windowTitle,
      });

      if (!response.success) {
        setIsStarting(false);
        setErrorMessage(response.error || 'Failed to start scrcpy session');
        dispatch({ type: 'SET_MIRRORING_STATUS', payload: 'error' });
      } else {
        setIsStarting(false);
        dispatch({ type: 'SET_MIRRORING_STATUS', payload: 'active' });
        dispatch({
          type: 'SET_SESSION',
          payload: {
            deviceId: selectedDevice.id,
            pid: response.pid,
            status: 'active',
            audioEnabled: !noAudio || useDualAudio,
            audioStatus: useDualAudio ? 'forwarding' : noAudio ? 'disabled' : 'forwarding',
          },
        });

        // If Bluetooth Dual-Audio mode is chosen, automatically activate the companion audio capture
        if (useDualAudio && window.electronAPI.audioCompanion) {
          dispatch({
            type: 'SET_COMPANION_AUDIO',
            payload: {
              status: 'starting',
              deviceId: selectedDevice.id,
            },
          });
          window.electronAPI.audioCompanion.start(selectedDevice.id).then((res: any) => {
            if (res && res.success) {
              dispatch({
                type: 'SET_COMPANION_AUDIO',
                payload: {
                  status: 'capturing',
                  deviceId: selectedDevice.id,
                  streamUrl: res.streamUrl,
                },
              });
            } else if (res && res.error) {
              dispatch({
                type: 'SET_COMPANION_AUDIO',
                payload: {
                  status: 'error',
                  deviceId: selectedDevice.id,
                  error: res.error,
                },
              });
            }
          }).catch((err: any) => {
            console.warn('[ScreenMirroring] Auto-start companion audio warning:', err);
          });
        }
      }
    } catch (err: unknown) {
      setIsStarting(false);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      dispatch({ type: 'SET_MIRRORING_STATUS', payload: 'error' });
    }
  };

  const handleStopMirror = async () => {
    if (!selectedDevice || !window.electronAPI) return;

    try {
      await window.electronAPI.scrcpy.stopMirroring(selectedDevice.id);
      if (window.electronAPI.audioCompanion) {
        await window.electronAPI.audioCompanion.stop(selectedDevice.id);
      }
    } catch (err) {
      console.error('Failed to stop mirroring:', err);
    } finally {
      dispatch({ type: 'SET_MIRRORING_STATUS', payload: 'idle' });
      dispatch({ type: 'REMOVE_SESSION', payload: selectedDevice.id });
      dispatch({ type: 'SET_COMPANION_AUDIO', payload: { status: 'idle' } });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Screen Mirroring"
        description="High-performance real-time Android screen mirroring powered by scrcpy"
        icon={Monitor}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge
              status={isMirroringActive ? 'active' : isStarting ? 'connecting' : 'idle'}
              label={isMirroringActive ? 'Mirroring Active' : isStarting ? 'Starting...' : 'Idle'}
              size="md"
              pulse={isMirroringActive || isStarting}
            />
          </div>
        }
      />

      {/* Missing tools warning banner */}
      {(!isAdbInstalled || !isScrcpyInstalled) && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-white">Required Tools Missing</p>
              <p className="text-xs text-surface-300 mt-0.5">
                {!isAdbInstalled && !isScrcpyInstalled
                  ? 'ADB and scrcpy were not detected.'
                  : !isAdbInstalled
                  ? 'ADB is not detected.'
                  : 'scrcpy is not detected.'}{' '}
                Configure valid executable paths to enable USB screen mirroring.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/settings')}
            className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
          >
            Configure in Settings
          </button>
        </div>
      )}

      {/* Error alert banner */}
      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-200">Mirroring Error</p>
              <p className="text-xs text-red-300/90 mt-0.5 font-mono whitespace-pre-wrap">{errorMessage}</p>
            </div>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-surface-400 hover:text-white text-xs px-2 py-1"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Mirror Viewport & Status Card */}
        <div className="col-span-2">
          <Card padding={false}>
            <div className="aspect-video bg-surface-950 rounded-xl overflow-hidden flex flex-col items-center justify-center relative p-6 border border-surface-800">
              {isMirroringActive ? (
                <div className="text-center max-w-md space-y-4">
                  <div className="inline-flex p-4 rounded-full bg-brand-500/10 border border-brand-500/30 text-brand-400">
                    <Eye className="w-10 h-10 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">scrcpy Window Running</h3>
                    <p className="text-xs text-brand-300 font-medium mt-1">
                      Target: {selectedDevice?.name || selectedDevice?.model || selectedDevice?.id}
                      {activeSession?.pid && ` (PID: ${activeSession.pid})`}
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-surface-900/80 border border-surface-700/50 text-left text-xs space-y-1.5">
                    <div className="flex justify-between text-surface-300">
                      <span>Window Title:</span>
                      <span className="font-mono text-brand-300 font-semibold truncate max-w-[200px]">
                        MobileMirror - {selectedDevice?.model || selectedDevice?.id}
                      </span>
                    </div>
                    <div className="flex justify-between text-surface-300">
                      <span>Stream Quality:</span>
                      <span className="text-surface-200">
                        {maxSize === 0 ? 'Native' : `${maxSize}p`} @ {maxFps} FPS ({bitRate})
                      </span>
                    </div>
                    <div className="flex justify-between text-surface-300">
                      <span>Audio Forwarding:</span>
                      <span className={audioEnabled ? 'text-emerald-400 font-medium' : 'text-surface-400'}>
                        {audioEnabled ? 'Enabled (Opus)' : 'Disabled'}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-surface-400 leading-relaxed">
                    The mirror is displayed in scrcpy's native hardware-accelerated Direct3D/OpenGL window.
                    To capture in OBS Studio, select <strong>Window Capture</strong> with this window title.
                  </p>

                  <button
                    onClick={handleStopMirror}
                    className="btn-secondary text-xs px-4 py-2 border border-red-500/30 text-red-400 hover:bg-red-500/10 inline-flex items-center gap-2"
                  >
                    <Square className="w-3.5 h-3.5" />
                    Stop Mirroring Session
                  </button>
                </div>
              ) : isStarting ? (
                <div className="text-center space-y-3">
                  <Loader2 className="w-10 h-10 text-brand-400 animate-spin mx-auto" />
                  <h3 className="text-base font-semibold text-white">Launching scrcpy Mirror...</h3>
                  <p className="text-xs text-surface-400">Connecting to {selectedDevice?.name || 'device'} via ADB</p>
                </div>
              ) : (
                <div className="text-center max-w-sm space-y-3">
                  <div className="p-4 rounded-full bg-surface-800/40 text-surface-500 inline-flex">
                    <Monitor className="w-12 h-12" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-surface-200">Ready to Mirror</h3>
                    <p className="text-xs text-surface-400 mt-1">
                      {connectedDevices.length > 0
                        ? `Selected: ${selectedDevice?.name || selectedDevice?.model} (${selectedDevice?.id})`
                        : 'Connect an Android device via USB cable with USB Debugging enabled.'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Controls Panel */}
        <div className="space-y-4">
          <Card>
            <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider mb-4">
              Mirroring Controls
            </h3>

            {/* Target Device Selector */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-surface-400 mb-1.5">
                Target Device (Multi-Device Support)
              </label>
              {connectedDevices.length > 0 ? (
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  disabled={isMirroringActive}
                  className="input-field text-xs font-medium"
                >
                  {connectedDevices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name || d.model} ({d.id}) • {d.connectionType.toUpperCase()}
                      {d.authorizationStatus === 'unauthorized' ? ' [UNAUTHORIZED]' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-800 border border-surface-600 text-xs text-surface-400">
                  <Smartphone className="w-4 h-4 text-surface-500" />
                  No Android devices detected
                </div>
              )}
            </div>

            {/* Unauthorized warning notice */}
            {isUnauthorized && (
              <div className="mb-4 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  Authorization Required
                </div>
                <p className="text-[11px] text-amber-200/90 leading-relaxed">
                  Unlock your phone and tap <strong>"Always allow from this computer"</strong> on the USB debugging prompt.
                </p>
              </div>
            )}

            {/* Video & Stream Settings (Configurable per Task 3) */}
            <div className="space-y-3 pt-2 border-t border-surface-800 mb-4">
              <p className="text-[11px] font-semibold text-surface-400 uppercase tracking-wider">
                Video & Performance
              </p>

              {/* Max Size */}
              <div className="flex items-center justify-between">
                <label className="text-xs text-surface-300">Max Dimension</label>
                <select
                  value={maxSize}
                  onChange={(e) => setMaxSize(parseInt(e.target.value))}
                  disabled={isMirroringActive}
                  className="input-field text-xs py-1 px-2 w-28"
                >
                  <option value={1920}>1920p (FHD)</option>
                  <option value={1440}>1440p (QHD)</option>
                  <option value={1080}>1080p</option>
                  <option value={720}>720p (HD)</option>
                  <option value={0}>Native Screen</option>
                </select>
              </div>

              {/* Frame Rate */}
              <div className="flex items-center justify-between">
                <label className="text-xs text-surface-300">Frame Rate</label>
                <select
                  value={maxFps}
                  onChange={(e) => setMaxFps(parseInt(e.target.value))}
                  disabled={isMirroringActive}
                  className="input-field text-xs py-1 px-2 w-28"
                >
                  <option value={60}>60 FPS</option>
                  <option value={90}>90 FPS</option>
                  <option value={120}>120 FPS</option>
                  <option value={30}>30 FPS</option>
                </select>
              </div>

              {/* Bitrate */}
              <div className="flex items-center justify-between">
                <label className="text-xs text-surface-300">Video Bitrate</label>
                <select
                  value={bitRate}
                  onChange={(e) => setBitRate(e.target.value)}
                  disabled={isMirroringActive}
                  className="input-field text-xs py-1 px-2 w-28"
                >
                  <option value="16M">16 Mbps</option>
                  <option value="8M">8 Mbps</option>
                  <option value="24M">24 Mbps</option>
                  <option value="32M">32 Mbps</option>
                  <option value="4M">4 Mbps</option>
                </select>
              </div>

              {/* Codec */}
              <div className="flex items-center justify-between">
                <label className="text-xs text-surface-300">Video Codec</label>
                <select
                  value={videoCodec}
                  onChange={(e) => setVideoCodec(e.target.value as any)}
                  disabled={isMirroringActive}
                  className="input-field text-xs py-1 px-2 w-28 font-mono"
                >
                  <option value="h264">H.264</option>
                  <option value="h265">H.265 (HEVC)</option>
                </select>
              </div>

              {/* Landscape Gameplay Orientation Support */}
              <div className="flex items-center justify-between">
                <label className="text-xs text-surface-300">Orientation</label>
                <select
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value as any)}
                  disabled={isMirroringActive}
                  className="input-field text-xs py-1 px-2 w-28"
                >
                  <option value="auto">Auto Rotate</option>
                  <option value="landscape">Landscape Lock</option>
                  <option value="portrait">Portrait Lock</option>
                </select>
              </div>

              {/* Audio Routing Mode */}
              <div className="space-y-2 pt-1 border-t border-surface-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-surface-300">
                    <Volume2 className="w-3.5 h-3.5 text-brand-400" />
                    <span>Audio Routing Mode</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/audio')}
                    className="text-[11px] text-brand-400 hover:text-brand-300 underline"
                  >
                    Audio Hub →
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAudioMode('bluetooth_dual')}
                    disabled={isMirroringActive}
                    className={`p-2 rounded-lg text-left border transition-all ${
                      audioMode === 'bluetooth_dual'
                        ? 'bg-brand-600/20 border-brand-500 text-white'
                        : 'bg-surface-800/40 border-surface-700/50 text-surface-400 hover:text-surface-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                      <Radio className="w-3.5 h-3.5 text-brand-400" />
                      <span>Universal Audio Agent</span>
                    </div>
                    <p className="text-[10px] text-surface-400 mt-0.5">Local Playback + USB Stream</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAudioMode('standard_scrcpy')}
                    disabled={isMirroringActive}
                    className={`p-2 rounded-lg text-left border transition-all ${
                      audioMode === 'standard_scrcpy'
                        ? 'bg-brand-600/20 border-brand-500 text-white'
                        : 'bg-surface-800/40 border-surface-700/50 text-surface-400 hover:text-surface-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                      <Speaker className="w-3.5 h-3.5 text-blue-400" />
                      <span>Standard scrcpy</span>
                    </div>
                    <p className="text-[10px] text-surface-400 mt-0.5">Windows PC Speakers Only</p>
                  </button>
                </div>

                {/* Live audio forwarding state & error display */}
                {isMirroringActive && (
                  <div className="text-[11px] p-2 rounded bg-surface-900/60 border border-surface-800 flex items-center justify-between">
                    <span className="text-surface-400">Audio State:</span>
                    {audioMode === 'bluetooth_dual' ? (
                      <span className="text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Universal Audio (Local + USB Stream)
                      </span>
                    ) : audioMode === 'standard_scrcpy' ? (
                      <span className="text-blue-400 font-medium flex items-center gap-1">
                        <Speaker className="w-3 h-3" />
                        scrcpy Opus to PC
                      </span>
                    ) : (
                      <span className="text-surface-500">Muted</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Quick usability toggles */}
            <div className="space-y-2.5 pt-2 border-t border-surface-800 mb-5">
              <SettingToggle
                label="Stay Awake"
                description="Prevent device screen sleep while mirroring"
                checked={stayAwake}
                onChange={setStayAwake}
                disabled={isMirroringActive}
              />
              <SettingToggle
                label="Show Touches"
                description="Highlight screen tap points"
                checked={showTouches}
                onChange={setShowTouches}
                disabled={isMirroringActive}
              />
              <SettingToggle
                label="Turn Screen Off"
                description="Mirror with physical phone display turned off"
                checked={turnScreenOff}
                onChange={setTurnScreenOff}
                disabled={isMirroringActive}
              />
            </div>

            {/* Action button */}
            <div>
              {isMirroringActive ? (
                <button
                  onClick={handleStopMirror}
                  className="btn-secondary w-full flex items-center justify-center gap-2 border border-red-500/20 text-red-400 hover:bg-red-500/10 font-medium py-2.5"
                >
                  <Square className="w-4 h-4" />
                  Stop Mirroring
                </button>
              ) : (
                <button
                  onClick={handleStartMirror}
                  disabled={!selectedDevice || isUnauthorized || isStarting || !isScrcpyInstalled}
                  className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 font-medium shadow-lg shadow-brand-500/20"
                >
                  {isStarting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Launching Mirror...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Start Screen Mirror
                    </>
                  )}
                </button>
              )}
            </div>
          </Card>

          {/* OBS Studio Integration Guide */}
          <Card>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-surface-300 uppercase tracking-wider">
                <Radio className="w-4 h-4 text-brand-400" />
                OBS Studio Dual Capture
              </div>
              <button
                type="button"
                onClick={() => navigate('/audio')}
                className="text-[11px] text-brand-400 hover:text-brand-300"
              >
                Audio Setup Guide →
              </button>
            </div>
            <p className="text-[11px] text-surface-400 leading-relaxed mb-2">
              <strong>1. Video:</strong> Add <span className="text-white">Window Capture</span> matching:
            </p>
            <div className="p-2 rounded bg-surface-950 font-mono text-xs text-brand-300 border border-surface-800 truncate select-all mb-2">
              MobileMirror - {selectedDevice?.model || selectedDevice?.name || 'Device'}
            </div>
            <p className="text-[11px] text-surface-400 leading-relaxed">
              <strong>2. Audio:</strong> Add <span className="text-white">Application Audio Capture</span> for <span className="text-white font-mono">scrcpy.exe</span> or capture Windows <span className="text-white">Desktop Audio</span>.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SettingToggle({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center justify-between cursor-pointer group ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div>
        <p className="text-xs font-medium text-surface-200 group-hover:text-white transition-colors">{label}</p>
        <p className="text-[10px] text-surface-500">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={`relative w-8 h-4 rounded-full transition-colors duration-200 ${
          checked ? 'bg-brand-600' : 'bg-surface-700'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  );
}
