import React from 'react';
import {
  Radio,
  MonitorPlay,
  Cast,
  ExternalLink,
  Volume2,
  Mic,
  AlertTriangle,
  CheckCircle2,
  Layers,
  ArrowRight,
  Sliders,
  Video,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Card from '../common/Card';
import PageHeader from '../common/PageHeader';
import { useAppContext } from '../../context/AppContext';

export default function StreamingSettingsPage() {
  const { state, dispatch } = useAppContext();
  const { streamingSettings, audioSettings } = state;
  const navigate = useNavigate();

  const updateSetting = <K extends keyof typeof streamingSettings>(
    key: K,
    value: (typeof streamingSettings)[K]
  ) => {
    dispatch({ type: 'UPDATE_STREAMING_SETTINGS', payload: { [key]: value } });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Streaming & OBS Studio Setup"
        description="Configure OBS Studio capture, audio routing, and YouTube Live broadcasting"
        icon={Radio}
        action={
          <button
            onClick={() => navigate('/audio')}
            className="btn-secondary flex items-center gap-2 text-xs"
          >
            <Volume2 className="w-3.5 h-3.5 text-brand-400" />
            Audio Routing Settings
          </button>
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
        <button
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-brand-600/20 text-brand-300 border border-brand-500/30"
        >
          <Radio className="w-3.5 h-3.5" />
          <span>Streaming & OBS</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* OBS Video & Audio Capture Steps */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-surface-200 uppercase tracking-wider">
              OBS Studio Dual Capture Guide
            </h3>
            <span className="text-[11px] font-mono text-brand-400 px-2 py-0.5 rounded bg-brand-500/10 border border-brand-500/20">
              Low Latency
            </span>
          </div>

          <div className="space-y-4">
            {/* Step 1: Video Capture */}
            <div className="p-3.5 rounded-xl bg-gradient-to-br from-brand-500/10 to-violet-500/5 border border-brand-500/20 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-brand-400">
                <MonitorPlay className="w-4 h-4" />
                <span>1. Video: Window Capture Source</span>
              </div>
              <ol className="space-y-1.5 text-xs text-surface-300">
                <li className="flex gap-2">
                  <span className="text-brand-400 font-bold">•</span>
                  In OBS, add a <strong className="text-white">"Window Capture"</strong> source.
                </li>
                <li className="flex gap-2">
                  <span className="text-brand-400 font-bold">•</span>
                  Select the window named <strong className="text-white font-mono">MobileMirror - [Device]</strong>.
                </li>
                <li className="flex gap-2">
                  <span className="text-brand-400 font-bold">•</span>
                  Set Capture Method to <strong className="text-white">"Windows 10 (1903 and up)"</strong>.
                </li>
              </ol>
            </div>

            {/* Step 2: Audio Capture */}
            <div className="p-3.5 rounded-xl bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border border-blue-500/20 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-400">
                <Volume2 className="w-4 h-4" />
                <span>2. Audio: Application Audio Capture</span>
              </div>
              <ol className="space-y-1.5 text-xs text-surface-300">
                <li className="flex gap-2">
                  <span className="text-blue-400 font-bold">•</span>
                  Add an <strong className="text-white">"Application Audio Capture (BETA)"</strong> source.
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-400 font-bold">•</span>
                  Target <strong className="text-white font-mono">scrcpy.exe</strong> to isolate game audio from Windows alerts.
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-400 font-bold">•</span>
                  Or capture your default <strong className="text-white">Desktop Audio</strong> in OBS Audio Settings.
                </li>
              </ol>
            </div>

            {/* Output Container Format */}
            <div>
              <label className="block text-xs font-medium text-surface-400 mb-1.5">
                Recording Container Format
              </label>
              <select
                value={streamingSettings.outputFormat}
                onChange={(e) => updateSetting('outputFormat', e.target.value)}
                className="input-field text-sm"
              >
                <option value="mp4">MP4 (Standard)</option>
                <option value="mkv">MKV (Crash Resilient)</option>
                <option value="flv">FLV</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Live Streaming Workflow & Warnings */}
        <div className="space-y-6">
          <Card>
            <h3 className="text-sm font-semibold text-surface-200 uppercase tracking-wider mb-4">
              YouTube Live Streaming Workflow
            </h3>

            <div className="space-y-4">
              {/* Separate Mic Notice */}
              <div className="p-3 rounded-lg bg-surface-800/50 border border-surface-700/40 flex items-start gap-2.5">
                <Mic className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-semibold text-surface-200">Microphone Commentary</p>
                  <p className="text-surface-400 text-[11px] mt-0.5">
                    Connect your commentary mic directly to Windows PC. Add an "Audio Input Capture" source in OBS to adjust voice vs. game volume independently.
                  </p>
                </div>
              </div>

              {/* Echo Prevention Warning */}
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-300">Prevent Stream Echo</p>
                  <p className="text-[11px] text-amber-200/90 mt-0.5">
                    Never capture Desktop Audio AND Application Audio Capture at the same time for scrcpy, as this creates a distracting duplicate echo on stream.
                  </p>
                </div>
              </div>

              {/* YouTube Live Details */}
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs">
                <div className="flex items-center gap-2 text-red-400 font-semibold mb-1">
                  <Cast className="w-4 h-4" />
                  <span>Broadcasting to YouTube</span>
                </div>
                <p className="text-surface-400 text-[11px]">
                  scrcpy forwards video and audio to Windows. In OBS Studio, go to Settings → Stream, select YouTube - RTMPS, paste your Stream Key, and click "Start Streaming".
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-surface-200 uppercase tracking-wider mb-4">
              Additional Toggles
            </h3>
            <div className="space-y-3">
              <ToggleSetting
                label="Virtual Camera Ready"
                description="Allow OBS Virtual Camera output to external applications"
                checked={streamingSettings.virtualCamera}
                onChange={(v) => updateSetting('virtualCamera', v)}
              />
              <ToggleSetting
                label="Overlay Support"
                description="Prepare scene canvas for gaming overlays and alerts"
                checked={streamingSettings.overlayEnabled}
                onChange={(v) => updateSetting('overlayEnabled', v)}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ToggleSetting({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer group py-1">
      <div>
        <p className="text-sm text-surface-200 group-hover:text-white transition-colors">{label}</p>
        <p className="text-[11px] text-surface-500">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${
          checked ? 'bg-brand-600' : 'bg-surface-600'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  );
}
