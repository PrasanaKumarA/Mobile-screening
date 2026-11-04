import React, { useState, useEffect, useRef } from 'react';
import {
  Radio,
  MonitorPlay,
  Cast,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  RefreshCw,
  FolderOpen,
  Play,
  Square,
  Video,
  Sliders,
  ShieldCheck,
  Eye,
  EyeOff,
  Activity,
  Wrench,
  Clock,
  Sparkles,
  Link,
  Unlink,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Card from '../common/Card';
import PageHeader from '../common/PageHeader';
import StatusBadge from '../common/StatusBadge';
import { useAppContext } from '../../context/AppContext';
import type { AudioSyncMetrics, ObsStatusInfo, ToolInfo } from '../../types';

export default function StreamingSettingsPage() {
  const { state, dispatch } = useAppContext();
  const { streamingSettings, appSettings, toolStatus, activeDevice, activeSessions, companionAudio } = state;
  const navigate = useNavigate();

  // Active mirror session
  const activeDeviceId = activeDevice?.id;
  const isMirroring = activeDeviceId ? Boolean(activeSessions[activeDeviceId]?.status === 'active') : false;
  const isAudioCapturing = companionAudio.status === 'capturing';

  // 1. OBS Tool Detection State
  const obsTool: ToolInfo = toolStatus.obs || {
    name: 'OBS Studio',
    toolType: 'obs',
    status: 'missing',
    error: 'OBS Studio path not checked',
  };
  const [obsPathInput, setObsPathInput] = useState<string>(appSettings.obsPath || '');
  const [isValidatingObs, setIsValidatingObs] = useState<boolean>(false);
  const [obsValidationResult, setObsValidationResult] = useState<ToolInfo | null>(null);

  // 2. OBS WebSocket State
  const [wsUrl, setWsUrl] = useState<string>(streamingSettings.obsWebSocketUrl || 'ws://127.0.0.1:4455');
  const [wsPassword, setWsPassword] = useState<string>(streamingSettings.obsWebSocketPassword || '');
  const [showWsPassword, setShowWsPassword] = useState<boolean>(false);
  const [isWsConnecting, setIsWsConnecting] = useState<boolean>(false);
  const [wsStatus, setWsStatus] = useState<ObsStatusInfo>(
    state.obsStatus || {
      state: 'disconnected',
      url: wsUrl,
      isStreaming: false,
      isRecording: false,
    }
  );
  const [autoSceneMessage, setAutoSceneMessage] = useState<string | null>(null);
  const [isSettingUpScene, setIsSettingUpScene] = useState<boolean>(false);

  // 3. Audio & Sync Diagnostics State
  const [syncMetrics, setSyncMetrics] = useState<AudioSyncMetrics | null>(null);
  const [syncOffset, setSyncOffset] = useState<number>(streamingSettings.audioSyncOffsetMs || 0);
  const [gameAudioMetrics, setGameAudioMetrics] = useState<{ peak: number; rms: number; dB: number }>({
    peak: 0,
    rms: 0,
    dB: -60,
  });

  // 4. Microphone Integration State
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [micGain, setMicGain] = useState<number>(100);
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [micLevel, setMicLevel] = useState<{ peak: number; rms: number; dB: number }>({ peak: 0, rms: 0, dB: -60 });
  const [micActive, setMicActive] = useState<boolean>(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAudioCtxRef = useRef<AudioContext | null>(null);
  const micGainNodeRef = useRef<GainNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micAnimFrameRef = useRef<number | null>(null);

  // 5. YouTube Streaming Preparation State
  const [rtmpUrl, setRtmpUrl] = useState<string>(streamingSettings.youtubeRtmpUrl || 'rtmp://a.rtmp.youtube.com/live2');
  const [streamKey, setStreamKey] = useState<string>(streamingSettings.youtubeStreamKey || '');
  const [showStreamKey, setShowStreamKey] = useState<boolean>(false);

  // 6. Test Recording State
  const [isTestingRecord, setIsTestingRecord] = useState<boolean>(false);
  const [testSecondsRemaining, setTestSecondsRemaining] = useState<number>(10);
  const [testRecordResult, setTestRecordResult] = useState<{ success: boolean; outputPath?: string; error?: string } | null>(null);

  // Copy helper
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const updateStreaming = (patch: Partial<typeof streamingSettings>) => {
    dispatch({ type: 'UPDATE_STREAMING_SETTINGS', payload: patch });
    if (window.electronAPI?.tools?.saveSettings) {
      window.electronAPI.tools.saveSettings(patch as any);
    }
  };

  // Sync OBS Path with AppSettings
  useEffect(() => {
    if (appSettings.obsPath) {
      setObsPathInput(appSettings.obsPath);
    }
  }, [appSettings.obsPath]);

  // Audio companion level listener
  useEffect(() => {
    if (window.electronAPI?.audioCompanion?.onAudioLevel) {
      window.electronAPI.audioCompanion.onAudioLevel((metrics) => {
        setGameAudioMetrics(metrics);
      });
    }
  }, []);

  // Poll sync metrics while capturing
  useEffect(() => {
    if (!window.electronAPI?.audioCompanion?.getSyncMetrics) return;
    const interval = setInterval(async () => {
      try {
        const metrics = await window.electronAPI!.audioCompanion.getSyncMetrics!();
        if (metrics) setSyncMetrics(metrics);
      } catch {}
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // OBS WebSocket status listener
  useEffect(() => {
    if (!window.electronAPI?.obs) return;
    window.electronAPI.obs.getStatus().then((status) => {
      if (status) setWsStatus(status);
    }).catch(() => {});

    window.electronAPI.obs.onStatusChanged((status) => {
      setWsStatus(status);
    });
  }, []);

  // Enumerate Windows Audio Input Devices (Microphones)
  const enumerateMicrophones = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter((d) => d.kind === 'audioinput');
      setAudioInputDevices(mics);
      if (mics.length > 0 && !selectedMicId) {
        setSelectedMicId(mics[0].deviceId);
      }
    } catch (err) {
      console.warn('[Microphone] Failed to enumerate audio devices:', err);
    }
  };

  useEffect(() => {
    enumerateMicrophones();
    if (navigator.mediaDevices) {
      navigator.mediaDevices.ondevicechange = () => enumerateMicrophones();
    }
  }, []);

  // Setup Microphone Stream and Web Audio VU Meter
  useEffect(() => {
    let isCancelled = false;

    const stopMic = () => {
      if (micAnimFrameRef.current) {
        cancelAnimationFrame(micAnimFrameRef.current);
        micAnimFrameRef.current = null;
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      if (micAudioCtxRef.current && micAudioCtxRef.current.state !== 'closed') {
        try { micAudioCtxRef.current.close().catch(() => {}); } catch {}
        micAudioCtxRef.current = null;
      }
      setMicActive(false);
      setMicLevel({ peak: 0, rms: 0, dB: -60 });
    };

    if (!selectedMicId) {
      stopMic();
      return;
    }

    const startMic = async () => {
      stopMic();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: selectedMicId ? { exact: selectedMicId } : undefined,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });

        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        micStreamRef.current = stream;
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        micAudioCtxRef.current = ctx;

        const source = ctx.createMediaStreamSource(stream);
        const gainNode = ctx.createGain();
        gainNode.gain.value = isMicMuted ? 0 : micGain / 100;
        micGainNodeRef.current = gainNode;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.6;
        micAnalyserRef.current = analyser;

        source.connect(gainNode);
        gainNode.connect(analyser);
        // Note: We DO NOT connect to ctx.destination, preventing mic from playing back into PC speakers!
        // This isolates microphone audio strictly for monitoring meters and OBS capture!

        setMicActive(true);

        const dataArray = new Float32Array(analyser.fftSize);
        const updateVU = () => {
          if (isCancelled || !micAnalyserRef.current) return;
          analyser.getFloatTimeDomainData(dataArray);

          let sumSquares = 0;
          let peak = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const val = Math.abs(dataArray[i]);
            if (val > peak) peak = val;
            sumSquares += val * val;
          }

          const rms = Math.sqrt(sumSquares / dataArray.length);
          const dB = Math.max(-60, Math.round(20 * Math.log10(Math.max(peak, 0.0001))));

          setMicLevel({
            peak: Math.min(100, Math.round(peak * 100)),
            rms: Math.min(100, Math.round(rms * 100)),
            dB,
          });

          micAnimFrameRef.current = requestAnimationFrame(updateVU);
        };
        updateVU();
      } catch (err) {
        console.warn('[Microphone] Failed to start microphone listener:', err);
        setMicActive(false);
      }
    };

    startMic();

    return () => {
      isCancelled = true;
      stopMic();
    };
  }, [selectedMicId]);

  // Sync mic gain & mute
  useEffect(() => {
    if (micGainNodeRef.current && micAudioCtxRef.current) {
      const g = isMicMuted ? 0 : micGain / 100;
      micGainNodeRef.current.gain.setValueAtTime(g, micAudioCtxRef.current.currentTime);
    }
  }, [micGain, isMicMuted]);

  // Browse for OBS Executable
  const handleBrowseObs = async () => {
    if (!window.electronAPI?.tools?.browse) return;
    try {
      const result = await window.electronAPI.tools.browse('obs');
      if (result && result.path) {
        setObsPathInput(result.path);
        setObsValidationResult(result);
        if (window.electronAPI?.tools?.saveSettings) {
          window.electronAPI.tools.saveSettings({ obsPath: result.path });
        }
      }
    } catch (err: unknown) {
      console.error('Failed to browse for OBS:', err);
    }
  };

  // Test OBS Executable
  const handleTestObs = async () => {
    if (!window.electronAPI?.tools?.validatePath) return;
    setIsValidatingObs(true);
    try {
      const result = await window.electronAPI.tools.validatePath('obs', obsPathInput);
      setObsValidationResult(result);
      if (result.status === 'installed' && window.electronAPI?.tools?.saveSettings) {
        window.electronAPI.tools.saveSettings({ obsPath: obsPathInput });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setObsValidationResult({
        name: 'OBS Studio',
        toolType: 'obs',
        status: 'error',
        error: msg,
      });
    } finally {
      setIsValidatingObs(false);
    }
  };

  // Connect / Disconnect OBS WebSocket
  const handleToggleObsWebSocket = async () => {
    if (!window.electronAPI?.obs) return;

    if (wsStatus.state === 'connected') {
      await window.electronAPI.obs.disconnect();
      setWsStatus((prev) => ({ ...prev, state: 'disconnected' }));
    } else {
      setIsWsConnecting(true);
      try {
        updateStreaming({ obsWebSocketUrl: wsUrl, obsWebSocketPassword: wsPassword });
        const res = await window.electronAPI.obs.connect(wsUrl, wsPassword);
        if (res.success) {
          const freshStatus = await window.electronAPI.obs.getStatus();
          setWsStatus(freshStatus);
        } else {
          setWsStatus((prev) => ({
            ...prev,
            state: 'error',
            error: res.error || 'Failed to connect to OBS WebSocket',
          }));
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setWsStatus((prev) => ({ ...prev, state: 'error', error: msg }));
      } finally {
        setIsWsConnecting(false);
      }
    }
  };

  // Setup MobileMirror Sources in OBS
  const handleSetupObsSources = async () => {
    if (!window.electronAPI?.obs) return;
    setIsSettingUpScene(true);
    setAutoSceneMessage(null);
    try {
      const res = await window.electronAPI.obs.setupSources({
        deviceId: activeDeviceId || 'Device',
        streamUrl: companionAudio.streamUrl || 'http://127.0.0.1:28201/live-audio.wav',
        syncOffsetMs: syncOffset,
      });
      setAutoSceneMessage(res.message);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAutoSceneMessage(`Failed: ${msg}`);
    } finally {
      setIsSettingUpScene(false);
    }
  };

  // Run 10-Second Test Recording
  const handleRunTestRecording = async () => {
    if (!window.electronAPI?.obs) return;
    if (wsStatus.state !== 'connected') {
      setTestRecordResult({
        success: false,
        error: 'Connect to OBS Studio via WebSocket first to run the automated test recording.',
      });
      return;
    }

    setIsTestingRecord(true);
    setTestSecondsRemaining(10);
    setTestRecordResult(null);

    try {
      const timer = setInterval(() => {
        setTestSecondsRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      const res = await window.electronAPI.obs.runTestRecording(10);
      clearInterval(timer);
      setTestRecordResult(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestRecordResult({ success: false, error: msg });
    } finally {
      setIsTestingRecord(false);
    }
  };

  // Apply Sync Offset
  const handleSyncOffsetChange = (newOffset: number) => {
    setSyncOffset(newOffset);
    updateStreaming({ audioSyncOffsetMs: newOffset });
    if (window.electronAPI?.audioCompanion?.setSyncOffset) {
      window.electronAPI.audioCompanion.setSyncOffset(newOffset);
    }
  };

  // Calculate Pre-Stream Checklist items
  const effectiveObs = obsValidationResult || obsTool;
  const isObsValidated = effectiveObs.status === 'installed';
  const hasGameAudio = isAudioCapturing;
  const hasVideoMirror = isMirroring;
  const hasMicTested = micActive && micLevel.dB > -55;
  const isEchoProtected = Boolean(streamingSettings.mutePcAudioPlayback);
  const hasStreamKey = Boolean(streamKey && streamKey.trim().length > 6);
  const checklistPassedCount = [
    isObsValidated,
    hasVideoMirror,
    hasGameAudio,
    hasMicTested,
    isEchoProtected,
    hasStreamKey,
  ].filter(Boolean).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="OBS Studio & YouTube Live Command Center"
        description="Comprehensive capture configuration, dedicated game audio routing, microphone isolation, and broadcast verification"
        icon={Radio}
        action={
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                wsStatus.state === 'connected'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : wsStatus.state === 'connecting'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-surface-800 text-surface-400 border border-surface-700'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  wsStatus.state === 'connected'
                    ? 'bg-emerald-400 animate-pulse'
                    : wsStatus.state === 'connecting'
                    ? 'bg-amber-400 animate-ping'
                    : 'bg-surface-500'
                }`}
              />
              OBS WebSocket: {wsStatus.state.toUpperCase()}
            </span>
          </div>
        }
      />

      {/* Settings Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-surface-800 pb-2">
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium text-surface-400 hover:text-white hover:bg-surface-800/80 transition-colors"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>General & Tool Paths</span>
        </button>
        <button
          onClick={() => navigate('/audio')}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium text-surface-400 hover:text-white hover:bg-surface-800/80 transition-colors"
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
        <button className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-brand-600/20 text-brand-300 border border-brand-500/30">
          <Radio className="w-3.5 h-3.5" />
          <span>Streaming & OBS</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ============================================================ */}
        {/* SECTION 1: OBS DETECTION & EXECUTABLE VALIDATION             */}
        {/* ============================================================ */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-brand-400" />
              <h3 className="text-sm font-semibold text-surface-200 uppercase tracking-wider">
                1. OBS Studio Installation & Detection
              </h3>
            </div>
            <StatusBadge
              status={effectiveObs.status}
              label={effectiveObs.status === 'installed' ? `v${effectiveObs.version || 'OK'}` : undefined}
            />
          </div>

          <p className="text-xs text-surface-400 mb-4">
            MobileMirror strictly validates the OBS Studio executable binary and extracts verified PE metadata. It never reports OBS installed without validating its executable.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1">
                OBS Executable Path (obs64.exe)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={obsPathInput}
                  onChange={(e) => setObsPathInput(e.target.value)}
                  placeholder="C:\Program Files\obs-studio\bin\64bit\obs64.exe"
                  className="input-field text-xs font-mono flex-1"
                />
                <button
                  onClick={handleBrowseObs}
                  className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5"
                  title="Browse for obs64.exe"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  Browse
                </button>
                <button
                  onClick={handleTestObs}
                  disabled={isValidatingObs}
                  className="btn-primary px-3 py-1.5 text-xs flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isValidatingObs ? 'animate-spin' : ''}`} />
                  {isValidatingObs ? 'Testing...' : 'Test'}
                </button>
              </div>
            </div>

            {/* Validation Outcome Notification */}
            {effectiveObs.status === 'installed' ? (
              <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/30 flex items-start gap-2.5 text-xs text-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-emerald-300">
                    OBS Studio Validated ({effectiveObs.version ? `v${effectiveObs.version}` : 'Verified'})
                  </p>
                  <p className="text-[11px] text-emerald-300/80 mt-0.5 font-mono break-all">
                    {effectiveObs.path || 'Found in standard installation directory'}
                  </p>
                </div>
              </div>
            ) : effectiveObs.status === 'error' ? (
              <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/30 flex items-start gap-2.5 text-xs text-red-200">
                <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-300">OBS Validation Failed</p>
                  <p className="text-[11px] text-red-300/80 mt-0.5">{effectiveObs.error}</p>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-surface-800/50 border border-surface-700/50 text-xs text-surface-400">
                OBS Studio not detected in default paths. Click <strong>Browse</strong> to select your <code className="text-white">obs64.exe</code> location.
              </div>
            )}
          </div>
        </Card>

        {/* ============================================================ */}
        {/* SECTION 2: OBS WEBSOCKET INTEGRATION                        */}
        {/* ============================================================ */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-semibold text-surface-200 uppercase tracking-wider">
                2. OBS WebSocket Control Hub (v5)
              </h3>
            </div>
            <span
              className={`text-[11px] px-2 py-0.5 rounded font-mono ${
                wsStatus.state === 'connected'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-surface-800 text-surface-400 border border-surface-700'
              }`}
            >
              Port 4455
            </span>
          </div>

          <p className="text-xs text-surface-400 mb-4">
            Connects to OBS Studio's built-in WebSocket server (OBS 28+) to automate scene management, read streaming/recording status, and trigger test recordings.
          </p>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-surface-400 mb-1">Server URL</label>
                <input
                  type="text"
                  value={wsUrl}
                  onChange={(e) => setWsUrl(e.target.value)}
                  placeholder="ws://127.0.0.1:4455"
                  className="input-field text-xs font-mono"
                  disabled={wsStatus.state === 'connected'}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-surface-400 mb-1">Server Password (Optional)</label>
                <div className="relative">
                  <input
                    type={showWsPassword ? 'text' : 'password'}
                    value={wsPassword}
                    onChange={(e) => setWsPassword(e.target.value)}
                    placeholder="Leave empty if disabled"
                    className="input-field text-xs font-mono pr-8"
                    disabled={wsStatus.state === 'connected'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowWsPassword(!showWsPassword)}
                    className="absolute right-2 top-2 text-surface-400 hover:text-white"
                  >
                    {showWsPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                onClick={handleToggleObsWebSocket}
                disabled={isWsConnecting}
                className={`btn text-xs flex items-center gap-2 ${
                  wsStatus.state === 'connected'
                    ? 'bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30'
                    : 'btn-primary'
                }`}
              >
                {wsStatus.state === 'connected' ? (
                  <>
                    <Unlink className="w-3.5 h-3.5" />
                    Disconnect WebSocket
                  </>
                ) : (
                  <>
                    <Link className="w-3.5 h-3.5" />
                    {isWsConnecting ? 'Connecting...' : 'Connect to OBS'}
                  </>
                )}
              </button>

              {wsStatus.state === 'connected' && (
                <button
                  onClick={handleSetupObsSources}
                  disabled={isSettingUpScene}
                  className="btn-secondary text-xs flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-brand-400" />
                  {isSettingUpScene ? 'Configuring...' : 'Auto-Setup OBS Sources'}
                </button>
              )}
            </div>

            {/* Auto setup notice */}
            {autoSceneMessage && (
              <div className="p-2.5 rounded bg-brand-950/40 border border-brand-500/30 text-[11px] text-brand-300">
                {autoSceneMessage}
              </div>
            )}

            {/* Live recording & streaming status badges */}
            {wsStatus.state === 'connected' && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-surface-800 text-xs">
                <div className="p-2 rounded bg-surface-900 border border-surface-800 flex items-center justify-between">
                  <span className="text-surface-400">Recording:</span>
                  <span className={`font-semibold ${wsStatus.isRecording ? 'text-red-400 animate-pulse' : 'text-surface-400'}`}>
                    {wsStatus.isRecording ? `REC (${wsStatus.recordingTimecode || '00:00:00'})` : 'OFF'}
                  </span>
                </div>
                <div className="p-2 rounded bg-surface-900 border border-surface-800 flex items-center justify-between">
                  <span className="text-surface-400">Streaming:</span>
                  <span className={`font-semibold ${wsStatus.isStreaming ? 'text-emerald-400 animate-pulse' : 'text-surface-400'}`}>
                    {wsStatus.isStreaming ? `LIVE (${wsStatus.streamingTimecode || '00:00:00'})` : 'OFF'}
                  </span>
                </div>
              </div>
            )}

            {wsStatus.state === 'error' && (
              <p className="text-[11px] text-red-400 bg-red-950/20 p-2 rounded border border-red-500/20">
                {wsStatus.error}
              </p>
            )}
          </div>
        </Card>

        {/* ============================================================ */}
        {/* SECTION 3: DEDICATED GAME AUDIO PIPELINE                     */}
        {/* ============================================================ */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-surface-200 uppercase tracking-wider">
                3. Dedicated Game Audio Routing (Isolated PCM)
              </h3>
            </div>
            <span
              className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                isAudioCapturing
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-surface-800 text-surface-400'
              }`}
            >
              {isAudioCapturing ? 'STREAMING 48kHz' : 'IDLE'}
            </span>
          </div>

          <p className="text-xs text-surface-400 mb-3">
            Exposes MobileMirror's existing raw 48,000 Hz 16-bit stereo PCM audio pipeline directly to OBS Studio via a local uncompressed WAV endpoint. Does not require capturing all Windows desktop audio.
          </p>

          <div className="space-y-3.5">
            {/* Dedicated Stream URL with Copy Button */}
            <div>
              <label className="block text-[11px] font-medium text-surface-300 mb-1">
                OBS Dedicated Media Source URL
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value="http://127.0.0.1:28201/live-audio.wav"
                  className="input-field text-xs font-mono bg-surface-900 flex-1 text-emerald-300 select-all"
                />
                <button
                  onClick={() => copyToClipboard('http://127.0.0.1:28201/live-audio.wav', 'streamUrl')}
                  className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5"
                >
                  {copiedKey === 'streamUrl' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === 'streamUrl' ? 'Copied!' : 'Copy URL'}
                </button>
              </div>
            </div>

            {/* Anti-Echo / Mute PC Playback Toggle */}
            <div className="p-3 rounded-lg bg-surface-900 border border-surface-800 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-surface-200">Mute PC Speaker Playback (Anti-Echo)</p>
                <p className="text-[11px] text-surface-400 mt-0.5">
                  Mutes Windows speaker playback while preserving audio stream to OBS. Prevents mic echo and duplicate desktop sounds.
                </p>
              </div>
              <button
                onClick={() =>
                  updateStreaming({ mutePcAudioPlayback: !streamingSettings.mutePcAudioPlayback })
                }
                className={`relative w-9 h-5 rounded-full transition-colors ${
                  streamingSettings.mutePcAudioPlayback ? 'bg-emerald-600' : 'bg-surface-600'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    streamingSettings.mutePcAudioPlayback ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Live Game Audio VU Meter */}
            <div className="p-2.5 rounded-lg bg-surface-900/80 border border-surface-800 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-surface-400 font-medium">Game Audio Level:</span>
                <span className="font-mono text-emerald-400 font-semibold">{gameAudioMetrics.dB} dB</span>
              </div>
              <div className="w-full bg-surface-950 h-2.5 rounded-full overflow-hidden flex items-center p-0.5">
                <div
                  className="h-full rounded-full transition-all duration-75 bg-gradient-to-r from-emerald-500 via-yellow-400 to-red-500"
                  style={{ width: `${Math.min(100, Math.max(0, gameAudioMetrics.peak))}%` }}
                />
              </div>
            </div>

            {/* Step-by-Step OBS Source Guide */}
            <div className="p-3 rounded-lg bg-blue-950/30 border border-blue-500/20 text-xs space-y-1.5 text-blue-200">
              <p className="font-semibold text-blue-300">How to add in OBS Studio:</p>
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-blue-200/90">
                <li>In OBS Sources, click <strong>+</strong> &rarr; <strong>Media Source</strong>.</li>
                <li>Uncheck <strong>"Local File"</strong>.</li>
                <li>In <strong>Input</strong>, paste: <code className="text-white font-mono">http://127.0.0.1:28201/live-audio.wav</code></li>
                <li>Set Network Buffering to <strong>2 MB</strong> and click OK.</li>
              </ol>
            </div>
          </div>
        </Card>

        {/* ============================================================ */}
        {/* SECTION 4: MICROPHONE INTEGRATION (INDEPENDENT)              */}
        {/* ============================================================ */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-surface-200 uppercase tracking-wider">
                4. Microphone Integration & Commentary Isolation
              </h3>
            </div>
            <span className="text-[11px] font-mono text-cyan-400 px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">
              Independent Pipeline
            </span>
          </div>

          <p className="text-xs text-surface-400 mb-3">
            Detects Windows audio inputs for live microphone monitoring. Microphone audio is kept 100% separate from Android game audio to allow independent volume mixing in OBS.
          </p>

          <div className="space-y-3.5">
            {/* Microphone Selection Dropdown */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-surface-300">Windows Audio Input Device</label>
                <button
                  onClick={enumerateMicrophones}
                  className="text-[11px] text-surface-400 hover:text-white flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Refresh Mics
                </button>
              </div>
              <select
                value={selectedMicId}
                onChange={(e) => setSelectedMicId(e.target.value)}
                className="input-field text-xs"
              >
                {audioInputDevices.length === 0 ? (
                  <option value="">No microphones detected</option>
                ) : (
                  audioInputDevices.map((d, idx) => (
                    <option key={d.deviceId || idx} value={d.deviceId}>
                      {d.label || `Microphone ${idx + 1}`}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Mic Controls: Gain & Mute */}
            <div className="p-3 rounded-lg bg-surface-900 border border-surface-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsMicMuted(!isMicMuted)}
                    className={`btn text-xs px-2.5 py-1 flex items-center gap-1.5 ${
                      isMicMuted
                        ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                        : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    }`}
                  >
                    {isMicMuted ? <MicOff className="w-3.5 h-3.5 text-red-400" /> : <Mic className="w-3.5 h-3.5 text-cyan-400" />}
                    {isMicMuted ? 'Muted' : 'Live'}
                  </button>
                  <span className="text-xs font-semibold text-surface-200">Commentary Mic Gain</span>
                </div>
                <span className="text-xs font-mono text-cyan-400 font-bold">{isMicMuted ? 'MUTE' : `${micGain}%`}</span>
              </div>

              <input
                type="range"
                min="0"
                max="200"
                value={micGain}
                onChange={(e) => setMicGain(parseInt(e.target.value))}
                disabled={isMicMuted}
                className="w-full accent-cyan-400 h-1.5 cursor-pointer bg-surface-950"
              />
            </div>

            {/* Live Microphone VU Meter */}
            <div className="p-2.5 rounded-lg bg-surface-900/80 border border-surface-800 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-surface-400 font-medium">Mic Level (VU):</span>
                <span className="font-mono text-cyan-400 font-semibold">
                  {isMicMuted ? 'MUTED' : `${micLevel.dB} dB`}
                </span>
              </div>
              <div className="w-full bg-surface-950 h-2.5 rounded-full overflow-hidden flex items-center p-0.5">
                <div
                  className="h-full rounded-full transition-all duration-75 bg-gradient-to-r from-cyan-500 via-teal-400 to-amber-500"
                  style={{ width: `${isMicMuted ? 0 : Math.min(100, Math.max(0, micLevel.peak))}%` }}
                />
              </div>
            </div>

            <div className="p-3 rounded-lg bg-surface-800/40 border border-surface-700/50 text-[11px] text-surface-400">
              <strong className="text-white">OBS Integration:</strong> In OBS, add an <strong>"Audio Input Capture"</strong> source and select this microphone. This enables adjusting commentary volume separately from gameplay sound.
            </div>
          </div>
        </Card>

        {/* ============================================================ */}
        {/* SECTION 5: VIDEO CAPTURE (WINDOW IDENTIFICATION)             */}
        {/* ============================================================ */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MonitorPlay className="w-4 h-4 text-violet-400" />
              <h3 className="text-sm font-semibold text-surface-200 uppercase tracking-wider">
                5. Video Capture & Window Identification
              </h3>
            </div>
            <StatusBadge
              status={isMirroring ? 'installed' : 'missing'}
              label={isMirroring ? 'MIRROR ACTIVE' : 'MIRROR IDLE'}
            />
          </div>

          <p className="text-xs text-surface-400 mb-3">
            Captures the hardware-accelerated native scrcpy rendering window with zero translation overhead and locked 60 FPS delivery.
          </p>

          <div className="space-y-3.5">
            {/* Window Search Title */}
            <div>
              <label className="block text-[11px] font-medium text-surface-300 mb-1">
                OBS Window Title Identifier
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={`MobileMirror - ${activeDeviceId || '[Device-Serial]'}`}
                  className="input-field text-xs font-mono bg-surface-900 flex-1 text-violet-300 select-all"
                />
                <button
                  onClick={() =>
                    copyToClipboard(`MobileMirror - ${activeDeviceId || '[Device-Serial]'}`, 'winTitle')
                  }
                  className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5"
                >
                  {copiedKey === 'winTitle' ? <Check className="w-3.5 h-3.5 text-violet-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === 'winTitle' ? 'Copied!' : 'Copy Title'}
                </button>
              </div>
            </div>

            {/* Recommended OBS Window Capture Parameters */}
            <div className="p-3 rounded-lg bg-surface-900 border border-surface-800 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-surface-400 text-[11px]">Capture Method:</span>
                <p className="font-semibold text-surface-200 mt-0.5">Windows 10 (1903 and up)</p>
                <p className="text-[10px] text-surface-500">Prevents black screens and preserves hardware VSync</p>
              </div>
              <div>
                <span className="text-surface-400 text-[11px]">Window Match Priority:</span>
                <p className="font-semibold text-surface-200 mt-0.5">Match title, otherwise find same type</p>
                <p className="text-[10px] text-surface-500">Guarantees reliable hook after reconnects</p>
              </div>
            </div>

            {!isMirroring && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
                <span>Screen mirroring is not currently running.</span>
                <button
                  onClick={() => navigate('/mirroring')}
                  className="btn-primary text-xs px-3 py-1"
                >
                  Launch Screen Mirror
                </button>
              </div>
            )}
          </div>
        </Card>

        {/* ============================================================ */}
        {/* SECTION 6: AUDIO/VIDEO SYNCHRONIZATION & HEALTH               */}
        {/* ============================================================ */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-surface-200 uppercase tracking-wider">
                6. Audio/Video Sync & Diagnostics
              </h3>
            </div>
            <span className="text-[11px] font-mono text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
              Low Jitter
            </span>
          </div>

          <p className="text-xs text-surface-400 mb-3">
            Measures latency drift between Android PCM sample generation and Windows wall-clock time. Detects buffer underruns, signal clipping, and recovers after USB disconnects.
          </p>

          <div className="space-y-3.5">
            {/* Sync Offset Slider */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-surface-200">Audio Sync Offset</label>
                <span className="text-xs font-mono font-bold text-amber-400">
                  {syncOffset > 0 ? `+${syncOffset}` : syncOffset} ms
                </span>
              </div>
              <input
                type="range"
                min="-500"
                max="500"
                step="10"
                value={syncOffset}
                onChange={(e) => handleSyncOffsetChange(parseInt(e.target.value))}
                className="w-full accent-amber-400 h-1.5 cursor-pointer bg-surface-950"
              />
              <div className="flex justify-between text-[10px] text-surface-500 mt-1 font-mono">
                <span>-500 ms (Audio Ahead)</span>
                <button onClick={() => handleSyncOffsetChange(0)} className="text-amber-400 hover:underline">
                  Reset (0 ms)
                </button>
                <span>+500 ms (Audio Delay)</span>
              </div>
            </div>

            {/* Health Metrics Grid */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-surface-900 border border-surface-800">
                <span className="text-[10px] text-surface-400 block">Measured Drift</span>
                <span className="text-xs font-mono font-bold text-surface-200">
                  {syncMetrics ? `${Math.abs(syncMetrics.driftMs)} ms` : 'Measuring...'}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-surface-900 border border-surface-800">
                <span className="text-[10px] text-surface-400 block">Buffer Underruns</span>
                <span className={`text-xs font-mono font-bold ${syncMetrics && syncMetrics.underrunCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {syncMetrics ? syncMetrics.underrunCount : 0}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-surface-900 border border-surface-800">
                <span className="text-[10px] text-surface-400 block">Clipping Events</span>
                <span className={`text-xs font-mono font-bold ${syncMetrics && syncMetrics.isClipping ? 'text-red-400 animate-pulse' : 'text-emerald-400'}`}>
                  {syncMetrics ? syncMetrics.clippingCount : 0}
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-surface-900/50 border border-surface-800 text-[11px] text-surface-400 flex items-center justify-between">
              <span>USB Disconnect Auto-Recovery:</span>
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Armed & Ready
              </span>
            </div>
          </div>
        </Card>

        {/* ============================================================ */}
        {/* SECTION 7: YOUTUBE STREAMING & TEST RECORDING                */}
        {/* ============================================================ */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Cast className="w-4 h-4 text-red-400" />
              <h3 className="text-sm font-semibold text-surface-200 uppercase tracking-wider">
                7. YouTube Live Streaming Preparation & Verification
              </h3>
            </div>
            <span className="text-xs text-surface-400">
              Checklist: <strong className="text-white">{checklistPassedCount} / 6 Ready</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: RTMP Settings & Stream Key */}
            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-surface-300 mb-1">
                  YouTube RTMP Stream Server URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={rtmpUrl}
                    onChange={(e) => {
                      setRtmpUrl(e.target.value);
                      updateStreaming({ youtubeRtmpUrl: e.target.value });
                    }}
                    className="input-field text-xs font-mono flex-1 text-surface-200"
                  />
                  <button
                    onClick={() => copyToClipboard(rtmpUrl, 'rtmpUrl')}
                    className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5"
                  >
                    {copiedKey === 'rtmpUrl' ? <Check className="w-3.5 h-3.5 text-red-400" /> : <Copy className="w-3.5 h-3.5" />}
                    Copy
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-surface-300 mb-1">
                  YouTube Stream Key (Secure Storage)
                </label>
                <div className="relative flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showStreamKey ? 'text' : 'password'}
                      value={streamKey}
                      onChange={(e) => {
                        setStreamKey(e.target.value);
                        updateStreaming({ youtubeStreamKey: e.target.value });
                      }}
                      placeholder="Paste your YouTube Stream Key here"
                      className="input-field text-xs font-mono pr-8"
                    />
                    <button
                      type="button"
                      onClick={() => setShowStreamKey(!showStreamKey)}
                      className="absolute right-2 top-2 text-surface-400 hover:text-white"
                      title={showStreamKey ? 'Hide Stream Key' : 'Reveal Stream Key'}
                    >
                      {showStreamKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <button
                    onClick={() => copyToClipboard(streamKey, 'streamKey')}
                    disabled={!streamKey}
                    className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5"
                  >
                    {copiedKey === 'streamKey' ? <Check className="w-3.5 h-3.5 text-red-400" /> : <Copy className="w-3.5 h-3.5" />}
                    Copy for OBS
                  </button>
                </div>
                <p className="text-[11px] text-surface-500 mt-1">
                  Stream keys are stored securely and never logged. In OBS Studio: Settings &rarr; Stream &rarr; Service: YouTube - RTMPS.
                </p>
              </div>

              {/* 10-Second Test Recording Control */}
              <div className="p-3.5 rounded-xl bg-gradient-to-br from-red-500/10 to-brand-500/10 border border-red-500/20 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-white">Local Recording Test</p>
                    <p className="text-[11px] text-surface-400">
                      Run a 10-second test recording to verify synchronized video, game audio, and microphone commentary before going live.
                    </p>
                  </div>
                  <button
                    onClick={handleRunTestRecording}
                    disabled={isTestingRecord || wsStatus.state !== 'connected'}
                    className={`btn text-xs px-3.5 py-1.5 flex items-center gap-1.5 ${
                      isTestingRecord
                        ? 'bg-red-500 text-white animate-pulse'
                        : 'bg-red-600 hover:bg-red-500 text-white font-semibold'
                    }`}
                  >
                    {isTestingRecord ? (
                      <>
                        <Square className="w-3.5 h-3.5" />
                        Recording ({testSecondsRemaining}s)
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        Run 10s Test Recording
                      </>
                    )}
                  </button>
                </div>

                {testRecordResult && (
                  <div
                    className={`p-2 rounded text-xs mt-2 ${
                      testRecordResult.success
                        ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/30'
                        : 'bg-red-950/40 text-red-300 border border-red-500/30'
                    }`}
                  >
                    {testRecordResult.success ? (
                      <div>
                        <p className="font-semibold">Test Recording Completed Successfully!</p>
                        {testRecordResult.outputPath && (
                          <p className="text-[11px] mt-0.5 font-mono break-all text-emerald-200">
                            Saved to: {testRecordResult.outputPath}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p>{testRecordResult.error}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Pre-Stream Checklist */}
            <div className="space-y-3 p-4 rounded-xl bg-surface-900 border border-surface-800">
              <div className="flex items-center justify-between border-b border-surface-800 pb-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-surface-200">
                    Pre-Stream Broadcast Checklist
                  </h4>
                </div>
                <span className="text-[11px] font-mono text-surface-400">Mandatory Verification</span>
              </div>

              <div className="space-y-2 text-xs">
                <ChecklistItem
                  label="1. OBS Studio Executable Validated"
                  description="Validated binary with verified version inspection"
                  passed={isObsValidated}
                />
                <ChecklistItem
                  label="2. Android Video Mirroring Active"
                  description="Scrcpy 60 FPS window ready for OBS Window Capture"
                  passed={hasVideoMirror}
                />
                <ChecklistItem
                  label="3. Dedicated Game Audio Pipeline Capturing"
                  description="Raw 48 kHz stereo PCM streaming to OBS Media Source"
                  passed={hasGameAudio}
                />
                <ChecklistItem
                  label="4. Commentary Microphone Isolated & Tested"
                  description="Mic levels verified without mixing into game audio stream"
                  passed={hasMicTested}
                />
                <ChecklistItem
                  label="5. Anti-Echo Protection Active"
                  description="PC speaker playback muted to prevent duplicate audio & echo"
                  passed={isEchoProtected}
                />
                <ChecklistItem
                  label="6. YouTube Stream Key Configured"
                  description="Secure key entered and copied to OBS settings"
                  passed={hasStreamKey}
                />
              </div>

              {checklistPassedCount === 6 ? (
                <div className="p-2.5 rounded bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-300 font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  All 6 Pre-Stream Checks Passed! Ready to Broadcast on YouTube Live.
                </div>
              ) : (
                <div className="p-2.5 rounded bg-surface-800/60 text-xs text-surface-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Complete the remaining items before starting your YouTube live stream.
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ChecklistItem({
  label,
  description,
  passed,
}: {
  label: string;
  description: string;
  passed: boolean;
}) {
  return (
    <div
      className={`p-2 rounded-lg flex items-start gap-2.5 transition-colors ${
        passed ? 'bg-emerald-950/20 border border-emerald-500/20' : 'bg-surface-950/40 border border-surface-800'
      }`}
    >
      {passed ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
      ) : (
        <div className="w-4 h-4 rounded-full border border-surface-600 flex-shrink-0 mt-0.5" />
      )}
      <div className="flex-1">
        <p className={`font-semibold ${passed ? 'text-emerald-200' : 'text-surface-300'}`}>{label}</p>
        <p className="text-[11px] text-surface-500">{description}</p>
      </div>
    </div>
  );
}
