import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, MonitorPlay, Gauge, Volume2, Radio, Sliders } from 'lucide-react';
import Card from '../common/Card';
import PageHeader from '../common/PageHeader';
import { useAppContext } from '../../context/AppContext';

export default function VideoSettingsPage() {
  const { state, dispatch } = useAppContext();
  const { videoSettings } = state;
  const navigate = useNavigate();

  const updateSetting = <K extends keyof typeof videoSettings>(
    key: K,
    value: (typeof videoSettings)[K]
  ) => {
    dispatch({ type: 'UPDATE_VIDEO_SETTINGS', payload: { [key]: value } });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Video Settings"
        description="Configure resolution, frame rate, and codec for mirroring"
        icon={Video}
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
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-brand-600/20 text-brand-300 border border-brand-500/30"
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

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider mb-4">
            Quality
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-surface-400 mb-1.5">
                Max Resolution
              </label>
              <select
                value={videoSettings.resolution}
                onChange={(e) => updateSetting('resolution', e.target.value)}
                className="input-field text-sm"
              >
                <option value="1920x1080">1920×1080 (Full HD)</option>
                <option value="2560x1440">2560×1440 (QHD)</option>
                <option value="1280x720">1280×720 (HD)</option>
                <option value="854x480">854×480 (SD)</option>
                <option value="0">Native (No limit)</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-surface-400">
                  Max FPS
                </label>
                <span className="text-xs font-medium text-brand-400">{videoSettings.maxFps} fps</span>
              </div>
              <input
                type="range"
                min="15"
                max="120"
                step="5"
                value={videoSettings.maxFps}
                onChange={(e) => updateSetting('maxFps', parseInt(e.target.value))}
                className="w-full accent-brand-500"
              />
              <div className="flex justify-between text-[10px] text-surface-500 mt-1">
                <span>15</span>
                <span>30</span>
                <span>60</span>
                <span>120</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-surface-400 mb-1.5">
                Bit Rate
              </label>
              <select
                value={videoSettings.bitRate}
                onChange={(e) => updateSetting('bitRate', e.target.value)}
                className="input-field text-sm"
              >
                <option value="2M">2 Mbps (Low)</option>
                <option value="4M">4 Mbps (Medium)</option>
                <option value="8M">8 Mbps (High)</option>
                <option value="16M">16 Mbps (Very High)</option>
                <option value="32M">32 Mbps (Ultra)</option>
              </select>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider mb-4">
            Codec & Orientation
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-surface-400 mb-1.5">
                Video Codec
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['h264', 'h265'] as const).map((codec) => (
                  <button
                    key={codec}
                    onClick={() => updateSetting('codec', codec)}
                    className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                      videoSettings.codec === codec
                        ? 'bg-brand-600/20 border-brand-500/30 text-brand-400'
                        : 'bg-surface-800 border-surface-700/30 text-surface-400 hover:bg-surface-700'
                    }`}
                  >
                    <span className="block font-semibold">{codec.toUpperCase()}</span>
                    <span className="block text-[10px] mt-0.5 opacity-70">
                      {codec === 'h264' ? 'Best compatibility' : 'Better compression'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-surface-400 mb-1.5">
                Orientation
              </label>
              <select
                value={videoSettings.orientation}
                onChange={(e) => updateSetting('orientation', e.target.value as any)}
                className="input-field text-sm"
              >
                <option value="auto">Auto-detect</option>
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </div>

            <div className="p-3 rounded-lg bg-brand-500/5 border border-brand-500/20 mt-4">
              <div className="flex items-start gap-2">
                <Gauge className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-brand-300">Performance Tip</p>
                  <p className="text-xs text-surface-400 mt-0.5">
                    For gaming, use H.264 codec with 60 fps and 8-16 Mbps bit rate.
                    For streaming, match your OBS output settings.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

