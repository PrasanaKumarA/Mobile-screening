import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Volume2,
  VolumeX,
  Speaker,
  Headphones,
  AlertTriangle,
  Info,
  CheckCircle2,
  AlertCircle,
  Radio,
  ExternalLink,
  Laptop,
  Smartphone,
  Layers,
  ArrowRight,
  Bluetooth,
  Play,
  Square,
  RefreshCw,
  Download,
  Loader2,
  Activity,
  Music,
  Cable,
  Usb,
  Settings,
  Sliders,
  Video,
} from 'lucide-react';
import Card from '../common/Card';
import PageHeader from '../common/PageHeader';
import StatusBadge from '../common/StatusBadge';
import { useAppContext } from '../../context/AppContext';
import type {
  CompanionAudioStatus,
  CompanionAudioStats,
  AudioRouteInfo,
  AudioLevelMetrics,
} from '../../types';

export default function AudioSettingsPage() {
  const { state, dispatch } = useAppContext();
  const { audioSettings, devices, companionAudio } = state;
  const navigate = useNavigate();

  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isCompanionInstalled, setIsCompanionInstalled] = useState<boolean | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isStartingCompanion, setIsStartingCompanion] = useState(false);
  const [audioStats, setAudioStats] = useState<CompanionAudioStats | null>(null);
  const [companionError, setCompanionError] = useState<string | null>(null);
  const [localVolume, setLocalVolume] = useState<number>(80);
  const [isMuted, setIsMuted] = useState(false);

  // Universal Audio Route & Live Level Monitoring
  const [activeRoute, setActiveRoute] = useState<AudioRouteInfo | null>(null);
  const [isCheckingRoute, setIsCheckingRoute] = useState(false);
  const [audioLevel, setAudioLevel] = useState<AudioLevelMetrics>({
    peak: 0,
    rms: 0,
    dB: -60,
  });

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const connectedDevices = devices.filter((d) => d.platform === 'android');
  const targetDevice = connectedDevices.find((d) => d.id === selectedDeviceId) || connectedDevices[0];

  useEffect(() => {
    if (connectedDevices.length > 0 && !selectedDeviceId) {
      setSelectedDeviceId(connectedDevices[0].id);
    }
  }, [connectedDevices, selectedDeviceId]);

  // Check if companion APK is installed
  const checkCompanionInstall = async (deviceId: string) => {
    if (!window.electronAPI?.audioCompanion?.isInstalled) return;
    try {
      const installed = await window.electronAPI.audioCompanion.isInstalled(deviceId);
      setIsCompanionInstalled(installed);
    } catch {
      setIsCompanionInstalled(false);
    }
  };

  // Query active Android audio output route (read-only diagnostics)
  const refreshAudioRoute = async (deviceId: string) => {
    if (!window.electronAPI?.audioCompanion?.getAudioRoute) return;
    setIsCheckingRoute(true);
    try {
      const route = await window.electronAPI.audioCompanion.getAudioRoute(deviceId);
      setActiveRoute(route);
    } catch {
      setActiveRoute(null);
    } finally {
      setIsCheckingRoute(false);
    }
  };

  useEffect(() => {
    if (targetDevice?.id) {
      checkCompanionInstall(targetDevice.id);
      refreshAudioRoute(targetDevice.id);
    }
  }, [targetDevice?.id]);

  // Initial status and listeners for audio companion
  useEffect(() => {
    if (!window.electronAPI?.audioCompanion) return;

    window.electronAPI.audioCompanion.getStatus().then((res) => {
      dispatch({
        type: 'SET_COMPANION_AUDIO',
        payload: {
          status: res.status,
          streamUrl: res.streamUrl,
          error: res.error || undefined,
        },
      });
      setAudioStats(res.stats);
      if (res.activeRoute) {
        setActiveRoute(res.activeRoute);
      }
    }).catch(() => {});

    window.electronAPI.audioCompanion.onStatusChanged((data) => {
      dispatch({
        type: 'SET_COMPANION_AUDIO',
        payload: data,
      });
      if (data.status === 'capturing' || data.status === 'error') {
        setIsStartingCompanion(false);
      }
      if (data.error) {
        setCompanionError(data.error);
      } else {
        setCompanionError(null);
      }
      if (targetDevice?.id) {
        refreshAudioRoute(targetDevice.id);
      }
    });

    if (window.electronAPI.audioCompanion.onAudioLevel) {
      window.electronAPI.audioCompanion.onAudioLevel((metrics) => {
        setAudioLevel(metrics);
      });
    }

    // Poll stats while capturing
    const interval = setInterval(async () => {
      if (companionAudio.status === 'capturing' && window.electronAPI?.audioCompanion?.getStats) {
        try {
          const stats = await window.electronAPI.audioCompanion.getStats();
          setAudioStats(stats);
        } catch {
          // Ignore
        }
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [dispatch, companionAudio.status, targetDevice?.id]);

  // Update HTML5 audio player volume
  useEffect(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.volume = isMuted ? 0 : localVolume / 100;
    }
  }, [localVolume, isMuted]);

  const handleInstallCompanion = async () => {
    if (!targetDevice || !window.electronAPI?.audioCompanion?.install) return;
    setIsInstalling(true);
    setCompanionError(null);
    try {
      const result = await window.electronAPI.audioCompanion.install(targetDevice.id);
      if (result.success) {
        setIsCompanionInstalled(true);
      } else {
        setCompanionError(result.error || 'Failed to install companion APK');
      }
    } catch (err: any) {
      setCompanionError(err.message || 'Installation error');
    } finally {
      setIsInstalling(false);
    }
  };

  const handleStartCompanion = async () => {
    if (!targetDevice || !window.electronAPI?.audioCompanion?.start) return;
    setIsStartingCompanion(true);
    setCompanionError(null);
    try {
      const result = await window.electronAPI.audioCompanion.start(targetDevice.id);
      if (!result.success) {
        setCompanionError(result.error || 'Failed to start Universal Audio capture');
        setIsStartingCompanion(false);
      } else {
        refreshAudioRoute(targetDevice.id);
      }
    } catch (err: any) {
      setCompanionError(err.message || 'Failed to start audio companion');
      setIsStartingCompanion(false);
    }
  };

  const handleStopCompanion = async () => {
    if (!window.electronAPI?.audioCompanion?.stop) return;
    try {
      await window.electronAPI.audioCompanion.stop(targetDevice?.id);
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      setAudioLevel({ peak: 0, rms: 0, dB: -60 });
    } catch (err: any) {
      setCompanionError(err.message || 'Failed to stop audio companion');
    }
  };

  const updateSetting = <K extends keyof typeof audioSettings>(
    key: K,
    value: (typeof audioSettings)[K]
  ) => {
    dispatch({ type: 'UPDATE_AUDIO_SETTINGS', payload: { [key]: value } });
  };

  const isCapturing = companionAudio.status === 'capturing';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Universal Audio Routing & Capture"
        description="Simultaneous phone audio playback and USB audio streaming for OBS Studio, independent of output device"
        icon={Volume2}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge
              status={
                isCapturing
                  ? 'active'
                  : companionAudio.status === 'error'
                  ? 'error'
                  : 'ready'
              }
              label={
                isCapturing
                  ? 'Audio Capture Streaming Active'
                  : companionAudio.status === 'error'
                  ? 'Audio Error'
                  : 'Audio Subsystem Ready'
              }
              size="md"
              pulse={isCapturing}
            />
          </div>
        }
      />

      {/* Global Settings Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-surface-800 pb-2">
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium text-surface-400 hover:text-white hover:bg-surface-800/80 transition-colors"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>General & Tool Paths</span>
        </button>
        <button
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-brand-600/20 text-brand-300 border border-brand-500/30"
        >
          <Volume2 className="w-3.5 h-3.5" />
          <span>Audio Routing & Capture</span>
        </button>
        <button
          onClick={() => navigate('/video')}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium text-surface-400 hover:text-white hover:bg-surface-800/80 transition-colors"
        >
          <Video className="w-3.5 h-3.5" />
          <span>Video & Quality</span>
        </button>
        <button
          onClick={() => navigate('/streaming')}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium text-surface-400 hover:text-white hover:bg-surface-800/80 transition-colors"
        >
          <Radio className="w-3.5 h-3.5" />
          <span>Streaming & OBS</span>
        </button>
      </div>

      {/* Featured Card: Universal Android Audio Capture */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-brand-500 to-indigo-600 text-white shadow-lg shadow-brand-500/20">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">
                  Universal Android Audio Capture (Audio Agent)
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/40 font-semibold uppercase tracking-wider">
                  Device Independent
                </span>
              </div>
              <p className="text-xs text-surface-400 mt-0.5">
                Game audio plays through your phone’s speakers, Bluetooth, 3.5mm, or USB-C headset while streaming uncompressed PCM over USB to OBS
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <StatusBadge
              status={isCapturing ? 'active' : 'idle'}
              label={isCapturing ? 'Stream Live (48 kHz Stereo)' : 'Capture Standby'}
              size="sm"
              pulse={isCapturing}
            />
          </div>
        </div>

        {/* Global Error Banner */}
        {companionError && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold">Capture Error:</span>
              <p className="mt-0.5">{companionError}</p>
            </div>
            <button
              onClick={() => setCompanionError(null)}
              className="text-[11px] underline text-red-300 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-3 gap-6">
          {/* Controls & Activation */}
          <div className="col-span-2 space-y-4">
            <div className="p-4 rounded-xl bg-surface-800/40 border border-surface-700/40 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-semibold text-surface-200">Target Device</label>
                  <p className="text-[11px] text-surface-400">Select connected Android device for USB audio streaming</p>
                </div>
                {targetDevice && isCompanionInstalled !== null && (
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded font-mono ${
                      isCompanionInstalled
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}
                  >
                    {isCompanionInstalled ? 'Companion Agent Installed' : 'Agent Not Installed'}
                  </span>
                )}
              </div>

              {connectedDevices.length > 0 ? (
                <div className="flex gap-2">
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    disabled={isCapturing}
                    className="input-field text-xs font-medium flex-1 py-2"
                  >
                    {connectedDevices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name || d.model} ({d.id}) • {d.connectionType.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      checkCompanionInstall(selectedDeviceId);
                      refreshAudioRoute(selectedDeviceId);
                    }}
                    className="p-2 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-400 hover:text-white border border-surface-700/50"
                    title="Refresh device status"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="p-2.5 rounded-lg bg-surface-800 text-xs text-surface-400">
                  No Android devices detected over USB.
                </div>
              )}

              {/* Install button if not installed */}
              {isCompanionInstalled === false && targetDevice && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
                  <div className="text-xs">
                    <p className="font-semibold text-amber-300">Audio Agent Required</p>
                    <p className="text-amber-200/80 text-[11px]">
                      Install MobileMirror Audio Agent on your phone to tap playback audio without altering output routing.
                    </p>
                  </div>
                  <button
                    onClick={handleInstallCompanion}
                    disabled={isInstalling}
                    className="btn-primary text-xs flex items-center gap-1.5 px-3 py-1.5"
                  >
                    {isInstalling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    <span>{isInstalling ? 'Installing...' : 'Install Agent'}</span>
                  </button>
                </div>
              )}

              {/* Action Start / Stop buttons */}
              <div className="pt-2 flex items-center gap-3">
                {isCapturing ? (
                  <button
                    onClick={handleStopCompanion}
                    className="btn-danger flex-1 flex items-center justify-center gap-2 py-2.5 font-medium"
                  >
                    <Square className="w-4 h-4 fill-current" />
                    Stop Audio Capture
                  </button>
                ) : (
                  <button
                    onClick={handleStartCompanion}
                    disabled={!targetDevice || isStartingCompanion}
                    className="btn-primary flex-1 flex items-center justify-center gap-2 py-2.5 font-medium shadow-lg shadow-brand-500/20"
                  >
                    {isStartingCompanion ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Prompting Phone for Consent...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-current" />
                        Start Universal Audio Capture
                      </>
                    )}
                  </button>
                )}
              </div>

              {isStartingCompanion && (
                <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 flex items-center gap-2 animate-pulse">
                  <Info className="w-4 h-4 flex-shrink-0" />
                  <span>
                    Please check your phone screen and tap <strong>"Start Now"</strong> to authorize playback audio capture.
                  </span>
                </div>
              )}
            </div>

            {/* Live Audio Level Meter (VU Meter) */}
            <div className="p-4 rounded-xl bg-surface-800/40 border border-surface-700/40 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-white">Live Audio Signal Meter</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-surface-400">
                    Peak: <strong className="text-white">{audioLevel.peak}%</strong>
                  </span>
                  <span className="text-[11px] font-mono text-surface-400">
                    RMS: <strong className="text-emerald-400">{audioLevel.rms}%</strong>
                  </span>
                  <span className="text-[11px] font-mono text-surface-400">
                    {audioLevel.dB} dB
                  </span>
                </div>
              </div>

              {/* Dynamic VU Meter Bar */}
              <div className="w-full bg-surface-900 rounded-full h-3 overflow-hidden border border-surface-700/50 p-0.5 flex items-center">
                <div
                  className={`h-full rounded-full transition-all duration-75 ${
                    audioLevel.peak > 85
                      ? 'bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500'
                      : audioLevel.peak > 50
                      ? 'bg-gradient-to-r from-emerald-500 to-amber-400'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${isCapturing ? Math.max(audioLevel.peak, 2) : 0}%` }}
                />
              </div>

              <div className="flex justify-between text-[10px] text-surface-500 font-mono">
                <span>-60 dB (Silence)</span>
                <span>-24 dB</span>
                <span>-12 dB</span>
                <span>-6 dB</span>
                <span>0 dB (Clipping)</span>
              </div>
            </div>

            {/* Windows Output Playback & Preview */}
            <div className="p-4 rounded-xl bg-surface-800/40 border border-surface-700/40 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Speaker className="w-4 h-4 text-brand-400" />
                  <span className="text-xs font-semibold text-white">Windows Audio Playback & Preview</span>
                </div>
                <span className="text-[10px] text-surface-400 font-mono">
                  WAV 48,000 Hz Stereo
                </span>
              </div>

              {/* Hidden HTML5 Audio element streaming from local loopback */}
              <audio
                ref={audioPlayerRef}
                src={isCapturing ? companionAudio.streamUrl || 'http://127.0.0.1:28201/live-audio.wav' : undefined}
                autoPlay
              />

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className={`p-2 rounded-lg border transition-colors ${
                    isMuted
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-surface-800 hover:bg-surface-700 text-surface-300 border-surface-700'
                  }`}
                  title={isMuted ? 'Unmute PC preview' : 'Mute PC preview (OBS still captures sound)'}
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={localVolume}
                  onChange={(e) => setLocalVolume(parseInt(e.target.value))}
                  disabled={isMuted}
                  className="w-full accent-brand-500"
                />
                <span className="text-xs font-mono text-surface-300 w-12 text-right">
                  {isMuted ? 'MUTED' : `${localVolume}%`}
                </span>
              </div>

              <p className="text-[11px] text-surface-500">
                Playing through default Windows output. In OBS Studio, use <strong className="text-surface-300">Application Audio Capture</strong> targeting <strong className="text-surface-300">MobileMirror Studio</strong>.
              </p>
            </div>
          </div>

          {/* Right Column: Routing Diagnostics & Output Compatibility Matrix */}
          <div className="space-y-4">
            {/* Active Output Route Card */}
            <div className="p-4 rounded-xl bg-surface-800/40 border border-surface-700/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-surface-300 uppercase tracking-wider block">
                  Detected Phone Route
                </span>
                <button
                  onClick={() => targetDevice && refreshAudioRoute(targetDevice.id)}
                  className="text-surface-400 hover:text-white"
                  title="Re-query active phone audio route"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCheckingRoute ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="p-3 rounded-lg bg-surface-900/80 border border-surface-700/60">
                <div className="flex items-center gap-2">
                  {activeRoute?.category === 'bluetooth' ? (
                    <Bluetooth className="w-4 h-4 text-blue-400" />
                  ) : activeRoute?.category === 'wired_headset' ? (
                    <Headphones className="w-4 h-4 text-indigo-400" />
                  ) : activeRoute?.category === 'usb_audio' ? (
                    <Usb className="w-4 h-4 text-purple-400" />
                  ) : (
                    <Smartphone className="w-4 h-4 text-emerald-400" />
                  )}
                  <span className="text-xs font-bold text-white">
                    {activeRoute ? activeRoute.description : 'Checking phone route...'}
                  </span>
                </div>
                <p className="text-[10px] text-surface-400 mt-1">
                  Audio continues playing through this device locally while being captured over USB.
                </p>
              </div>

              <div className="space-y-2 text-xs pt-1">
                <div className="flex justify-between py-1 border-b border-surface-800">
                  <span className="text-surface-400">Capture API:</span>
                  <span className="text-emerald-400 font-mono">AudioPlaybackCapture</span>
                </div>
                <div className="flex justify-between py-1 border-b border-surface-800">
                  <span className="text-surface-400">Sample Rate:</span>
                  <span className="text-white font-mono">48,000 Hz</span>
                </div>
                <div className="flex justify-between py-1 border-b border-surface-800">
                  <span className="text-surface-400">Channels:</span>
                  <span className="text-white font-mono">2 (Stereo)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-surface-800">
                  <span className="text-surface-400">Data Received:</span>
                  <span className="text-brand-300 font-mono">
                    {audioStats ? `${(audioStats.bytesReceived / 1024).toFixed(1)} KB` : '0 KB'}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-surface-400">Loopback URL:</span>
                  <span className="text-surface-300 font-mono text-[11px]">127.0.0.1:28201</span>
                </div>
              </div>
            </div>

            {/* Output Device Compatibility Matrix */}
            <div className="p-4 rounded-xl bg-surface-800/40 border border-surface-700/40 space-y-2.5">
              <span className="text-xs font-semibold text-surface-300 uppercase tracking-wider block">
                Output Compatibility Matrix
              </span>

              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center gap-2 p-2 rounded bg-surface-900/60 border border-surface-800 text-surface-300">
                  <Smartphone className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <div className="flex-1">
                    <span className="font-semibold text-white">Built-in Speaker</span>
                    <p className="text-[10px] text-surface-400">Phone speakers + USB Stream</p>
                  </div>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                </div>

                <div className="flex items-center gap-2 p-2 rounded bg-surface-900/60 border border-surface-800 text-surface-300">
                  <Bluetooth className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                  <div className="flex-1">
                    <span className="font-semibold text-white">Bluetooth Devices</span>
                    <p className="text-[10px] text-surface-400">Earbuds, Headphones, Speakers</p>
                  </div>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                </div>

                <div className="flex items-center gap-2 p-2 rounded bg-surface-900/60 border border-surface-800 text-surface-300">
                  <Headphones className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                  <div className="flex-1">
                    <span className="font-semibold text-white">Wired 3.5 mm Analog</span>
                    <p className="text-[10px] text-surface-400">Earphones, Gaming Headsets</p>
                  </div>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                </div>

                <div className="flex items-center gap-2 p-2 rounded bg-surface-900/60 border border-surface-800 text-surface-300">
                  <Usb className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                  <div className="flex-1">
                    <span className="font-semibold text-white">USB-C Audio & DACs</span>
                    <p className="text-[10px] text-surface-400">Type-C Headsets, External DACs</p>
                  </div>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* OBS Studio Dual-Audio Guide */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-brand-500/10 border border-brand-500/20 text-brand-400">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-white">OBS Studio Game Audio Setup</h3>
              <p className="text-xs text-surface-400">How to capture game audio cleanly into your YouTube Live broadcast</p>
            </div>
          </div>
          <span className="text-xs font-mono text-brand-400 px-2 py-0.5 rounded bg-brand-500/10 border border-brand-500/20">
            OBS Guide
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* Step 1 */}
          <div className="p-4 rounded-xl bg-surface-800/50 border border-surface-700/40 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-brand-400 uppercase tracking-wider">
              <span className="w-5 h-5 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-300">
                1
              </span>
              Game Audio in OBS
            </div>
            <h4 className="text-sm font-semibold text-white">Application Audio Capture</h4>
            <p className="text-xs text-surface-400 leading-relaxed">
              In OBS Studio, add a new source: <strong className="text-surface-200">"Application Audio Capture (BETA)"</strong> and choose <strong className="text-white">MobileMirror Studio</strong>. This records pure game audio without PC notification dings or Discord chat.
            </p>
          </div>

          {/* Step 2 */}
          <div className="p-4 rounded-xl bg-surface-800/50 border border-surface-700/40 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-brand-400 uppercase tracking-wider">
              <span className="w-5 h-5 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-300">
                2
              </span>
              Separate Microphone
            </div>
            <h4 className="text-sm font-semibold text-white">Voice Commentary</h4>
            <p className="text-xs text-surface-400 leading-relaxed">
              Connect your commentary microphone directly to your <strong className="text-surface-200">Windows PC</strong>. Add an <strong className="text-surface-200">"Audio Input Capture"</strong> source in OBS so your voice volume and game volume can be balanced independently.
            </p>
          </div>

          {/* Step 3 */}
          <div className="p-4 rounded-xl bg-surface-800/50 border border-amber-500/30 bg-amber-500/5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Echo Prevention
            </div>
            <h4 className="text-sm font-semibold text-amber-300">Prevent Echo</h4>
            <p className="text-xs text-amber-200/80 leading-relaxed">
              Do <strong className="text-white">NOT</strong> capture both Desktop Audio and Application Audio Capture for MobileMirror Studio simultaneously. Capturing both causes duplicate audio and a hollow echo on your stream.
            </p>
          </div>
        </div>
      </Card>

      {/* Alternative: Standard scrcpy Audio Forwarding */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-surface-700/50 text-surface-300">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Standard scrcpy Audio Forwarding (Alternative)</h3>
              <p className="text-xs text-surface-400">Direct scrcpy audio routing (mutes phone hardware speakers and phone headsets)</p>
            </div>
          </div>
          <StatusBadge
            status={audioSettings.enabled ? 'active' : 'idle'}
            label={audioSettings.enabled ? 'Enabled' : 'Disabled'}
            size="sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-surface-300 mb-1.5">
              scrcpy Forwarding State
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => updateSetting('enabled', true)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  audioSettings.enabled
                    ? 'bg-brand-600 text-white shadow-lg'
                    : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                }`}
              >
                Enabled
              </button>
              <button
                type="button"
                onClick={() => updateSetting('enabled', false)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  !audioSettings.enabled
                    ? 'bg-red-600/80 text-white shadow-lg'
                    : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                }`}
              >
                Disabled
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-300 mb-1.5">
              scrcpy Codec
            </label>
            <select
              value={audioSettings.codec}
              onChange={(e) => updateSetting('codec', e.target.value as any)}
              className="input-field text-xs py-2"
            >
              <option value="opus">Opus (Ultra-low latency)</option>
              <option value="aac">AAC</option>
              <option value="raw">Raw PCM</option>
            </select>
          </div>
        </div>
      </Card>
    </div>
  );
}
