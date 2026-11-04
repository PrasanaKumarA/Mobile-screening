import React, { useState, useEffect, useRef, ReactNode } from 'react';
import { Volume2, VolumeX, Radio, CheckCircle2 } from 'lucide-react';
import Sidebar from './Sidebar';
import TitleBar from './TitleBar';
import { useAppContext } from '../../context/AppContext';

// Web Audio API Low-Latency PCM Stream Engine
class PcmPlayer {
  private audioCtx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private nextPlayTime: number = 0;

  private init(): boolean {
    try {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        this.audioCtx = new AudioContextClass({ sampleRate: 48000 });
        this.gainNode = this.audioCtx.createGain();
        this.gainNode.connect(this.audioCtx.destination);
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      return true;
    } catch (e) {
      console.warn('[PcmPlayer] AudioContext init warning:', e);
      return false;
    }
  }

  public setVolume(volPercent: number, isMuted: boolean) {
    if (!this.audioCtx || !this.gainNode) return;
    const gain = isMuted ? 0 : Math.max(0, Math.min(1, volPercent / 100));
    try {
      this.gainNode.gain.setValueAtTime(gain, this.audioCtx.currentTime);
    } catch {}
  }

  public feed(chunk: Uint8Array) {
    if (!this.init() || !this.audioCtx || !this.gainNode) return;

    // Ensure 4-byte alignment (16-bit signed stereo = 2 bytes * 2 channels = 4 bytes per sample)
    const byteLength = chunk.byteLength - (chunk.byteLength % 4);
    if (byteLength <= 0) return;

    const int16 = new Int16Array(chunk.buffer, chunk.byteOffset, byteLength / 2);
    const numSamples = int16.length / 2;
    if (numSamples <= 0) return;

    const audioBuffer = this.audioCtx.createBuffer(2, numSamples, 48000);
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);

    for (let i = 0; i < numSamples; i++) {
      left[i] = int16[i * 2] / 32768.0;
      right[i] = int16[i * 2 + 1] / 32768.0;
    }

    const source = this.audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.gainNode);

    const currentTime = this.audioCtx.currentTime;
    if (this.nextPlayTime < currentTime) {
      // 20ms lead time to prevent underruns
      this.nextPlayTime = currentTime + 0.02;
    }

    source.start(this.nextPlayTime);
    this.nextPlayTime += audioBuffer.duration;
  }

  public stop() {
    this.nextPlayTime = 0;
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        this.audioCtx.close().catch(() => {});
      } catch {}
      this.audioCtx = null;
      this.gainNode = null;
    }
  }
}

interface MainLayoutProps {
  children: ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { state } = useAppContext();
  const { companionAudio } = state;

  const [volume, setVolume] = useState(85);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pcmPlayerRef = useRef<PcmPlayer | null>(null);

  const isCapturing = companionAudio.status === 'capturing';

  // Direct Web Audio API PCM playback via Electron IPC
  useEffect(() => {
    if (!pcmPlayerRef.current) {
      pcmPlayerRef.current = new PcmPlayer();
    }
    const player = pcmPlayerRef.current;

    if (isCapturing) {
      player.setVolume(volume, isMuted);

      if (window.electronAPI?.audioCompanion?.onPcmData) {
        window.electronAPI.audioCompanion.onPcmData((chunk: Uint8Array) => {
          player.feed(chunk);
        });
      }
    } else {
      player.stop();
    }

    return () => {
      if (!isCapturing) {
        player.stop();
      }
    };
  }, [isCapturing]);

  // Sync volume & mute changes with Web Audio API
  useEffect(() => {
    pcmPlayerRef.current?.setVolume(volume, isMuted);
  }, [volume, isMuted]);

  // Fallback HTML5 audio sink (only used if onPcmData is not present)
  useEffect(() => {
    const hasPcmIpc = Boolean(window.electronAPI?.audioCompanion?.onPcmData);
    const audio = audioRef.current;
    if (!audio || hasPcmIpc) return;

    if (isCapturing) {
      const streamUrl = companionAudio.streamUrl || 'http://127.0.0.1:28201/live-audio.wav';
      if (audio.src !== streamUrl) {
        audio.src = streamUrl;
      }
      audio.volume = isMuted ? 0 : volume / 100;
      audio.play().catch(() => {});
    } else {
      audio.pause();
      audio.src = '';
    }
  }, [isCapturing, companionAudio.streamUrl]);

  return (
    <div className="flex flex-col h-screen bg-surface-950 overflow-hidden">
      {/* Fallback persistent audio sink element */}
      <audio ref={audioRef} />

      {/* Custom title bar */}
      <TitleBar />

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar navigation */}
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* Page content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Active Audio Streaming Notification Pill (when audio capture is active) */}
          {isCapturing && (
            <div className="bg-emerald-950/70 border-b border-emerald-500/30 px-6 py-1.5 flex items-center justify-between text-xs text-emerald-200">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                </span>
                <span className="font-semibold text-white">Universal Audio Stream Active:</span>
                <span>Direct 48 kHz Stereo PCM playing through Laptop Speakers & OBS Desktop Audio</span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-1 rounded hover:bg-emerald-900/60 text-emerald-300 hover:text-white transition-colors flex items-center gap-1.5"
                  title={isMuted ? 'Unmute Laptop Speakers' : 'Mute Laptop Speakers'}
                >
                  {isMuted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
                  <span className="text-[11px] font-medium">{isMuted ? 'Unmute' : 'Mute'}</span>
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(e) => setVolume(parseInt(e.target.value))}
                  disabled={isMuted}
                  className="w-20 accent-emerald-400 h-1 cursor-pointer"
                />
                <span className="text-[11px] font-mono text-emerald-300 w-8 text-right">
                  {isMuted ? 'MUTE' : `${volume}%`}
                </span>
              </div>
            </div>
          )}

          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            <div className="p-6 max-w-[1600px] mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
