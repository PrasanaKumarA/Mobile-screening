import React, { useState, useEffect, useRef } from 'react';
import {
  Tablet,
  Video,
  Volume2,
  VolumeX,
  Play,
  Square,
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Copy,
  Check,
  Maximize2,
  Radio,
  Sparkles,
  Info,
  Layers,
  Settings2,
  ExternalLink,
} from 'lucide-react';
import Card from '../common/Card';
import PageHeader from '../common/PageHeader';
import StatusBadge from '../common/StatusBadge';
import { useAppContext } from '../../context/AppContext';
import type { CaptureDevice, AudioCaptureDevice } from '../../types';

export default function IpadCapturePage() {
  const { state } = useAppContext();
  const { obsStatus } = state;

  // Device Discovery
  const [videoDevices, setVideoDevices] = useState<CaptureDevice[]>([]);
  const [audioDevices, setAudioDevices] = useState<AudioCaptureDevice[]>([]);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string>('');
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [backendError, setBackendError] = useState<string | null>(null);

  // Capture Session State
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [targetResolution, setTargetResolution] = useState<string>('1920x1080');
  const [targetFps, setTargetFps] = useState<number>(60);
  const [measuredResolution, setMeasuredResolution] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [measuredFps, setMeasuredFps] = useState<number>(0);
  const [aspectRatio, setAspectRatio] = useState<'ipad' | '16-9' | 'native'>('ipad');

  // Video Preview Stream
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // HDMI Audio & Live Meter
  const [audioVolume, setAudioVolume] = useState<number>(85);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);
  const [monitorAudioOnPc, setMonitorAudioOnPc] = useState<boolean>(true);
  const [audioMeter, setAudioMeter] = useState<{ peak: number; rms: number; dB: number }>({ peak: 0, rms: 0, dB: -60 });
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioGainRef = useRef<GainNode | null>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const audioAnimFrameRef = useRef<number | null>(null);

  // OBS Integration
  const [obsSceneMessage, setObsSceneMessage] = useState<string | null>(null);
  const [isConfiguringObs, setIsConfiguringObs] = useState<boolean>(false);

  // Clipboard Helper
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // Enumerate DirectShow / UVC Video and Audio devices
  const refreshDevices = async () => {
    setIsRefreshing(true);
    setBackendError(null);
    try {
      // 1. Backend DirectShow & FFmpeg Hardware probe
      if (window.electronAPI?.capture?.listDevices) {
        const res = await window.electronAPI.capture.listDevices();
        if (res) {
          setVideoDevices(res.videoDevices || []);
          setAudioDevices(res.audioDevices || []);

          // Pre-select first capture card if not set
          if (res.videoDevices?.length > 0 && !selectedVideoDeviceId) {
            const hdmiCard = res.videoDevices.find((d) => d.type === 'hdmi-capture') || res.videoDevices[0];
            setSelectedVideoDeviceId(hdmiCard.name);
            if (hdmiCard.audioEndpointName) {
              setSelectedAudioDeviceId(hdmiCard.audioEndpointName);
            }
          }
        }
      }

      // 2. Browser MediaDevices fallback/enrichment
      if (navigator.mediaDevices?.enumerateDevices) {
        const browserDevices = await navigator.mediaDevices.enumerateDevices();
        const browserAudioInputs = browserDevices
          .filter((d) => d.kind === 'audioinput')
          .map((d) => ({
            id: d.deviceId,
            name: d.label || `Audio Input (${d.deviceId.substring(0, 6)})`,
            type: (d.label.toLowerCase().includes('digital') || d.label.toLowerCase().includes('hdmi')
              ? 'hdmi-audio'
              : 'microphone') as 'hdmi-audio' | 'microphone',
            status: 'connected' as const,
          }));

        if (browserAudioInputs.length > 0) {
          setAudioDevices((prev) => {
            const combined = [...prev];
            for (const ba of browserAudioInputs) {
              if (!combined.some((c) => c.name === ba.name)) {
                combined.push(ba);
              }
            }
            return combined;
          });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[IpadCapture] Device enumeration notice:', msg);
      setBackendError(msg);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  useEffect(() => {
    refreshDevices();
    if (navigator.mediaDevices) {
      navigator.mediaDevices.ondevicechange = () => {
        console.log('[IpadCapture] Hardware devices changed (hotplug detected). Refreshing list...');
        refreshDevices();
      };
    }
  }, []);

  // Selected device information
  const selectedDevice = videoDevices.find((d) => d.name === selectedVideoDeviceId || d.id === selectedVideoDeviceId);
  const isHdmiCaptureCard = selectedDevice?.type === 'hdmi-capture';
  const supports1080p60 = Boolean(selectedDevice?.supports1080p60);
  const supports4K = Boolean(selectedDevice?.supports4K);

  // Stop Capture Stream
  const stopCapture = async () => {
    if (audioAnimFrameRef.current) {
      cancelAnimationFrame(audioAnimFrameRef.current);
      audioAnimFrameRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      try {
        audioCtxRef.current.close().catch(() => {});
      } catch {}
      audioCtxRef.current = null;
    }

    if (selectedVideoDeviceId && window.electronAPI?.capture?.stopCapture) {
      try {
        await window.electronAPI.capture.stopCapture(selectedVideoDeviceId);
      } catch {}
    }

    setIsCapturing(false);
    setMeasuredResolution({ width: 0, height: 0 });
    setMeasuredFps(0);
    setAudioMeter({ peak: 0, rms: 0, dB: -60 });
  };

  // Start Capture Stream
  const startCapture = async () => {
    if (!selectedVideoDeviceId) {
      setBackendError('Please select a video capture device first.');
      return;
    }

    await stopCapture();
    setBackendError(null);

    try {
      // Find browser deviceId corresponding to selected DirectShow device name
      let matchingBrowserVideoId: string | undefined;
      if (navigator.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const match = devices.find(
          (d) =>
            d.kind === 'videoinput' &&
            (d.label.toLowerCase().includes(selectedVideoDeviceId.toLowerCase()) ||
              selectedVideoDeviceId.toLowerCase().includes(d.label.toLowerCase()))
        );
        matchingBrowserVideoId = match?.deviceId;
      }

      const [reqWidth, reqHeight] = targetResolution.split('x').map(Number);

      const constraints: MediaStreamConstraints = {
        video: matchingBrowserVideoId
          ? {
              deviceId: { exact: matchingBrowserVideoId },
              width: { ideal: reqWidth || 1920 },
              height: { ideal: reqHeight || 1080 },
              frameRate: { ideal: targetFps || 60 },
            }
          : {
              width: { ideal: reqWidth || 1920 },
              height: { ideal: reqHeight || 1080 },
              frameRate: { ideal: targetFps || 60 },
            },
        audio: false, // Audio opened separately below for independent volume & metering
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      // Read real track parameters
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        setMeasuredResolution({
          width: settings.width || reqWidth || 1920,
          height: settings.height || reqHeight || 1080,
        });
        setMeasuredFps(Math.round(settings.frameRate || targetFps || 60));
      }

      // Connect HDMI audio track if audio device available
      if (selectedAudioDeviceId) {
        try {
          let matchingAudioId: string | undefined;
          const devList = await navigator.mediaDevices.enumerateDevices();
          const aMatch = devList.find(
            (d) =>
              d.kind === 'audioinput' &&
              (d.label.toLowerCase().includes(selectedAudioDeviceId.toLowerCase()) ||
                selectedAudioDeviceId.toLowerCase().includes(d.label.toLowerCase()))
          );
          matchingAudioId = aMatch?.deviceId || selectedAudioDeviceId;

          const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: { exact: matchingAudioId },
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
          });

          // Set up Web Audio API meter and monitor
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const audioCtx = new AudioContextClass();
          audioCtxRef.current = audioCtx;

          const source = audioCtx.createMediaStreamSource(audioStream);
          const gainNode = audioCtx.createGain();
          gainNode.gain.value = isAudioMuted ? 0 : audioVolume / 100;
          audioGainRef.current = gainNode;

          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 1024;
          analyser.smoothingTimeConstant = 0.6;
          audioAnalyserRef.current = analyser;

          source.connect(gainNode);
          gainNode.connect(analyser);

          // Route to speakers if monitoring is enabled
          if (monitorAudioOnPc) {
            gainNode.connect(audioCtx.destination);
          }

          // Real-time audio VU meter animation loop
          const dataArray = new Float32Array(analyser.fftSize);
          const updateAudioVU = () => {
            if (!audioAnalyserRef.current) return;
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

            setAudioMeter({
              peak: Math.min(100, Math.round(peak * 100)),
              rms: Math.min(100, Math.round(rms * 100)),
              dB,
            });

            audioAnimFrameRef.current = requestAnimationFrame(updateAudioVU);
          };
          updateAudioVU();
        } catch (audioErr) {
          console.warn('[IpadCapture] Note: HDMI audio device open warning:', audioErr);
        }
      }

      // Notify backend capture service
      if (window.electronAPI?.capture?.startCapture) {
        await window.electronAPI.capture.startCapture(selectedVideoDeviceId, {
          resolution: targetResolution,
          frameRate: targetFps,
          audioDevice: selectedAudioDeviceId,
        });
      }

      setIsCapturing(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[IpadCapture] Failed to start capture:', msg);
      setBackendError(`Capture error: ${msg}. Please ensure no other application is locking the HDMI capture card.`);
      await stopCapture();
    }
  };

  // Sync Audio Volume & Mute with Web Audio API
  useEffect(() => {
    if (audioGainRef.current && audioCtxRef.current) {
      const vol = isAudioMuted ? 0 : audioVolume / 100;
      audioGainRef.current.gain.setValueAtTime(vol, audioCtxRef.current.currentTime);
    }
  }, [audioVolume, isAudioMuted]);

  // Sync PC Monitor Audio toggle
  useEffect(() => {
    if (audioGainRef.current && audioCtxRef.current) {
      try {
        if (monitorAudioOnPc) {
          audioGainRef.current.connect(audioCtxRef.current.destination);
        } else {
          audioGainRef.current.disconnect(audioCtxRef.current.destination);
        }
      } catch {}
    }
  }, [monitorAudioOnPc]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      stopCapture();
    };
  }, []);

  // OBS One-Click Source Setup
  const handleAutoConfigureObs = async () => {
    if (!window.electronAPI?.obs?.setupIpadSources) {
      setObsSceneMessage('OBS integration requires OBS WebSocket v5 to be connected.');
      return;
    }

    if (obsStatus.state !== 'connected') {
      setObsSceneMessage('Please connect to OBS Studio in the Streaming tab first.');
      return;
    }

    setIsConfiguringObs(true);
    setObsSceneMessage(null);
    try {
      const res = await window.electronAPI.obs.setupIpadSources({
        videoDeviceName: selectedVideoDeviceId,
        audioDeviceName: selectedAudioDeviceId,
      });
      setObsSceneMessage(res.message);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setObsSceneMessage(`Failed: ${msg}`);
    } finally {
      setIsConfiguringObs(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="iPad Pro M4 – HDMI Hardware Capture"
        description="Direct low-latency screen capture via external USB-C HDMI capture card with independent HDMI audio monitoring"
        icon={Tablet}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={refreshDevices}
              disabled={isRefreshing}
              className="btn-secondary text-xs flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh Devices
            </button>
            <StatusBadge
              status={isCapturing ? 'active' : selectedDevice ? 'ready' : 'disconnected'}
              label={isCapturing ? 'CAPTURE ACTIVE' : selectedDevice ? 'DEVICE READY' : 'NO CAPTURE CARD'}
            />
          </div>
        }
      />

      {/* Main Grid: Live Preview & Device Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ============================================================ */}
        {/* LEFT 2 COLUMNS: LIVE HARDWARE VIDEO PREVIEW                  */}
        {/* ============================================================ */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-0 overflow-hidden bg-black/90 border-surface-800 flex flex-col">
            {/* Live Video Canvas Bar */}
            <div className="bg-surface-900/90 border-b border-surface-800 px-4 py-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full ${
                      isCapturing ? 'bg-emerald-400 opacity-75' : 'bg-surface-500'
                    }`}
                  />
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      isCapturing ? 'bg-emerald-400' : 'bg-surface-500'
                    }`}
                  />
                </span>
                <span className="font-semibold text-white">
                  {isCapturing ? 'Live HDMI Feed' : 'Capture Preview Standby'}
                </span>
                {isCapturing && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {measuredResolution.width > 0
                      ? `${measuredResolution.width}x${measuredResolution.height} @ ${measuredFps} FPS`
                      : `${targetResolution} @ ${targetFps} FPS`}
                  </span>
                )}
              </div>

              {/* Aspect Ratio & Fullscreen Controls */}
              <div className="flex items-center gap-2">
                <div className="bg-surface-800 rounded-lg p-0.5 flex text-[11px]">
                  <button
                    onClick={() => setAspectRatio('ipad')}
                    className={`px-2 py-0.5 rounded ${
                      aspectRatio === 'ipad' ? 'bg-brand-600 text-white font-medium' : 'text-surface-400'
                    }`}
                    title="iPad Pro M4 Native Aspect Ratio (4:3)"
                  >
                    4:3 (iPad)
                  </button>
                  <button
                    onClick={() => setAspectRatio('16-9')}
                    className={`px-2 py-0.5 rounded ${
                      aspectRatio === '16-9' ? 'bg-brand-600 text-white font-medium' : 'text-surface-400'
                    }`}
                    title="16:9 Standard Fit"
                  >
                    16:9
                  </button>
                  <button
                    onClick={() => setAspectRatio('native')}
                    className={`px-2 py-0.5 rounded ${
                      aspectRatio === 'native' ? 'bg-brand-600 text-white font-medium' : 'text-surface-400'
                    }`}
                    title="Fill Frame"
                  >
                    Fit
                  </button>
                </div>

                <button
                  onClick={() => {
                    if (videoRef.current?.requestFullscreen) {
                      videoRef.current.requestFullscreen();
                    }
                  }}
                  disabled={!isCapturing}
                  className="p-1 rounded text-surface-400 hover:text-white hover:bg-surface-800 disabled:opacity-40"
                  title="Fullscreen Preview"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Video Viewport */}
            <div className="relative min-h-[460px] flex items-center justify-center bg-surface-950 p-2">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`max-h-[580px] w-auto rounded shadow-2xl transition-all duration-200 ${
                  aspectRatio === 'ipad'
                    ? 'aspect-[4/3] object-contain'
                    : aspectRatio === '16-9'
                    ? 'aspect-[16/9] object-contain'
                    : 'w-full object-contain'
                } ${!isCapturing ? 'hidden' : 'block'}`}
              />

              {!isCapturing && (
                <div className="text-center p-8 space-y-3 max-w-md">
                  <div className="w-16 h-16 rounded-2xl bg-surface-900 border border-surface-800 flex items-center justify-center mx-auto text-brand-400 shadow-xl">
                    <Tablet className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-base font-semibold text-white">iPad HDMI Video Preview Standby</h4>
                    <p className="text-xs text-surface-400 mt-1 leading-relaxed">
                      Connect your iPad Pro M4 via USB-C to HDMI adapter, connect to your HDMI capture card, and click{' '}
                      <strong className="text-white">Start Capture</strong> below.
                    </p>
                  </div>
                  <button
                    onClick={startCapture}
                    disabled={!selectedVideoDeviceId}
                    className="btn-primary px-6 py-2 text-sm flex items-center gap-2 mx-auto disabled:opacity-50"
                  >
                    <Play className="w-4 h-4" />
                    Start Video Preview
                  </button>
                </div>
              )}
            </div>

            {/* Bottom Capture Action Bar */}
            <div className="p-3 bg-surface-900 border-t border-surface-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isCapturing ? (
                  <button
                    onClick={stopCapture}
                    className="btn-danger text-xs px-4 py-2 flex items-center gap-1.5 font-semibold"
                  >
                    <Square className="w-3.5 h-3.5" />
                    Stop Capture
                  </button>
                ) : (
                  <button
                    onClick={startCapture}
                    disabled={!selectedVideoDeviceId}
                    className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5 font-semibold disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Start Capture
                  </button>
                )}

                <div className="text-xs text-surface-400 font-medium">
                  {isCapturing ? (
                    <span className="text-emerald-400 font-semibold">Live 60 FPS DirectShow Hardware Stream</span>
                  ) : (
                    <span>Ready to capture</span>
                  )}
                </div>
              </div>

              {/* Quick resolution/fps tags */}
              <div className="flex items-center gap-2 text-[11px] font-mono text-surface-400">
                <span className="px-2 py-0.5 rounded bg-surface-800 border border-surface-700">
                  Target: {targetResolution}
                </span>
                <span className="px-2 py-0.5 rounded bg-surface-800 border border-surface-700">
                  {targetFps} FPS
                </span>
              </div>
            </div>
          </Card>

          {/* Backend / Device Error Notice */}
          {backendError && (
            <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/30 flex items-start gap-2.5 text-xs text-red-200">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-300">Capture Device Diagnostic Notice</p>
                <p className="text-[11px] text-red-200/90 mt-0.5">{backendError}</p>
              </div>
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* RIGHT COLUMN: CAPTURE CONFIGURATION & AUDIO                  */}
        {/* ============================================================ */}
        <div className="space-y-6">
          {/* Card 1: Capture Device & Hardware Capabilities */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-surface-200 uppercase tracking-wider flex items-center gap-2">
                <Video className="w-4 h-4 text-brand-400" />
                HDMI Capture Hardware
              </h3>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-800 text-surface-400">
                DirectShow
              </span>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Device Selector */}
              <div>
                <label className="block text-[11px] font-medium text-surface-300 mb-1">
                  Video Capture Device
                </label>
                <select
                  value={selectedVideoDeviceId}
                  onChange={(e) => {
                    setSelectedVideoDeviceId(e.target.value);
                    const dev = videoDevices.find((d) => d.name === e.target.value || d.id === e.target.value);
                    if (dev?.audioEndpointName) {
                      setSelectedAudioDeviceId(dev.audioEndpointName);
                    }
                  }}
                  disabled={isCapturing}
                  className="input-field text-xs"
                >
                  {videoDevices.length === 0 ? (
                    <option value="">No DirectShow Video Capture Card Detected</option>
                  ) : (
                    videoDevices.map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.name} {d.type === 'hdmi-capture' ? '(HDMI Capture Card)' : ''}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Hardware Capability Verification */}
              {selectedDevice ? (
                <div className="p-3 rounded-lg bg-surface-900 border border-surface-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-surface-400">Device Type:</span>
                    <span className="font-semibold text-white capitalize">{selectedDevice.type.replace('-', ' ')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-surface-400">1080p60 Hardware Support:</span>
                    <span className={`font-semibold ${supports1080p60 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {supports1080p60 ? 'Verified (1080p60)' : '30 FPS Only'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-surface-400">4K Resolution Support:</span>
                    <span className="font-semibold text-surface-400">
                      {supports4K ? 'Supported (4K)' : 'Not Supported (1080p Max)'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-surface-400">Max Hardware FPS:</span>
                    <span className="font-mono text-white font-bold">{selectedDevice.maxFps} FPS</span>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-surface-900/60 border border-surface-800 text-[11px] text-surface-400">
                  No HDMI capture card currently detected. Plug in your USB capture card and click <strong>Refresh Devices</strong>.
                </div>
              )}

              {/* Target Resolution & FPS Selector */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="block text-[11px] font-medium text-surface-400 mb-1">Capture Resolution</label>
                  <select
                    value={targetResolution}
                    onChange={(e) => setTargetResolution(e.target.value)}
                    disabled={isCapturing}
                    className="input-field text-xs"
                  >
                    <option value="1920x1080">1080p (1920x1080)</option>
                    <option value="1280x720">720p (1280x720)</option>
                    {supports4K && <option value="3840x2160">4K (3840x2160)</option>}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-surface-400 mb-1">Target Frame Rate</label>
                  <select
                    value={targetFps}
                    onChange={(e) => setTargetFps(parseInt(e.target.value))}
                    disabled={isCapturing}
                    className="input-field text-xs"
                  >
                    <option value="60">60 FPS</option>
                    <option value="30">30 FPS</option>
                  </select>
                </div>
              </div>
            </div>
          </Card>

          {/* Card 2: HDMI Audio & Live VU Meter */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-surface-200 uppercase tracking-wider flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-emerald-400" />
                HDMI Audio Pipeline
              </h3>
              <span className="text-[11px] font-mono text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                Isolated
              </span>
            </div>

            <p className="text-xs text-surface-400 mb-3">
              Captures iPad HDMI audio directly from the capture card. Strictly separated from Android audio streams to prevent mixing and duplicate sound.
            </p>

            <div className="space-y-3.5 text-xs">
              {/* HDMI Audio Device Selector */}
              <div>
                <label className="block text-[11px] font-medium text-surface-300 mb-1">
                  HDMI Audio Input Device
                </label>
                <select
                  value={selectedAudioDeviceId}
                  onChange={(e) => setSelectedAudioDeviceId(e.target.value)}
                  disabled={isCapturing}
                  className="input-field text-xs"
                >
                  <option value="">None / No Audio Device</option>
                  {audioDevices.map((a) => (
                    <option key={a.id} value={a.name}>
                      {a.name} {a.type === 'hdmi-audio' ? '(HDMI Capture Audio)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Volume Slider & Mute Toggle */}
              <div className="p-3 rounded-lg bg-surface-900 border border-surface-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsAudioMuted(!isAudioMuted)}
                      className={`btn text-xs px-2.5 py-1 flex items-center gap-1.5 ${
                        isAudioMuted
                          ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {isAudioMuted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
                      {isAudioMuted ? 'Muted' : 'Unmuted'}
                    </button>
                    <span className="text-xs font-semibold text-surface-200">HDMI Audio Volume</span>
                  </div>
                  <span className="font-mono text-emerald-400 font-bold">
                    {isAudioMuted ? 'MUTE' : `${audioVolume}%`}
                  </span>
                </div>

                <input
                  type="range"
                  min="0"
                  max="100"
                  value={audioVolume}
                  onChange={(e) => setAudioVolume(parseInt(e.target.value))}
                  disabled={isAudioMuted}
                  className="w-full accent-emerald-400 h-1.5 cursor-pointer bg-surface-950"
                />

                <div className="flex items-center justify-between pt-1 border-t border-surface-800 text-[11px]">
                  <span className="text-surface-400">Monitor on PC Speakers:</span>
                  <button
                    onClick={() => setMonitorAudioOnPc(!monitorAudioOnPc)}
                    className={`relative w-8 h-4.5 rounded-full transition-colors ${
                      monitorAudioOnPc ? 'bg-emerald-600' : 'bg-surface-600'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                        monitorAudioOnPc ? 'translate-x-3.5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Live HDMI Audio VU Meter */}
              <div className="p-2.5 rounded-lg bg-surface-900/80 border border-surface-800 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-surface-400 font-medium">HDMI Audio Level:</span>
                  <span className="font-mono text-emerald-400 font-semibold">{audioMeter.dB} dB</span>
                </div>
                <div className="w-full bg-surface-950 h-2.5 rounded-full overflow-hidden flex items-center p-0.5">
                  <div
                    className="h-full rounded-full transition-all duration-75 bg-gradient-to-r from-emerald-500 via-yellow-400 to-red-500"
                    style={{ width: `${isAudioMuted ? 0 : Math.min(100, Math.max(0, audioMeter.peak))}%` }}
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Card 3: OBS Studio iPad Integration */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-surface-200 uppercase tracking-wider flex items-center gap-2">
                <Radio className="w-4 h-4 text-purple-400" />
                OBS Studio Integration
              </h3>
              <StatusBadge
                status={obsStatus.state === 'connected' ? 'connected' : 'disconnected'}
                label={obsStatus.state === 'connected' ? 'OBS CONNECTED' : 'OBS OFFLINE'}
              />
            </div>

            <p className="text-xs text-surface-400 mb-3">
              Add iPad HDMI video and audio directly into OBS Studio while preserving existing Android mirroring sources and scenes.
            </p>

            <div className="space-y-3 text-xs">
              {/* Copyable Device Identifiers */}
              <div className="space-y-2">
                <div>
                  <span className="text-[11px] text-surface-400 block mb-0.5">OBS Video Capture Device Name</span>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      readOnly
                      value={selectedVideoDeviceId || 'No video card selected'}
                      className="input-field text-xs font-mono bg-surface-900 flex-1 text-purple-300"
                    />
                    <button
                      onClick={() => copyToClipboard(selectedVideoDeviceId, 'obsVid')}
                      disabled={!selectedVideoDeviceId}
                      className="btn-secondary px-2.5 text-xs"
                    >
                      {copiedKey === 'obsVid' ? <Check className="w-3.5 h-3.5 text-purple-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {selectedAudioDeviceId && (
                  <div>
                    <span className="text-[11px] text-surface-400 block mb-0.5">OBS Audio Input Device Name</span>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        readOnly
                        value={selectedAudioDeviceId}
                        className="input-field text-xs font-mono bg-surface-900 flex-1 text-emerald-300"
                      />
                      <button
                        onClick={() => copyToClipboard(selectedAudioDeviceId, 'obsAud')}
                        className="btn-secondary px-2.5 text-xs"
                      >
                        {copiedKey === 'obsAud' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Auto Setup Button via OBS WebSocket */}
              <div className="pt-2 border-t border-surface-800">
                <button
                  onClick={handleAutoConfigureObs}
                  disabled={isConfiguringObs || obsStatus.state !== 'connected' || !selectedVideoDeviceId}
                  className="btn-primary w-full text-xs py-2 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-300" />
                  {isConfiguringObs ? 'Configuring OBS Scene...' : 'Auto-Add iPad Sources to OBS'}
                </button>

                {obsSceneMessage && (
                  <p className="text-[11px] text-purple-300 bg-purple-950/40 p-2 rounded mt-2 border border-purple-500/20">
                    {obsSceneMessage}
                  </p>
                )}
              </div>

              {/* Manual Setup Guidance */}
              <div className="p-3 rounded-lg bg-surface-900/60 border border-surface-800 text-[11px] text-surface-400 space-y-1">
                <p className="font-semibold text-surface-200">Manual OBS Setup:</p>
                <p>1. In OBS, click <strong>+</strong> &rarr; <strong>Video Capture Device</strong> &rarr; Select your capture card.</p>
                <p>2. Click <strong>+</strong> &rarr; <strong>Audio Input Capture</strong> &rarr; Select the capture card's audio device.</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

