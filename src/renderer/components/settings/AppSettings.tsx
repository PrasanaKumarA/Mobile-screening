import React, { useState, useEffect } from 'react';
import {
  Settings,
  FolderOpen,
  Info,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Save,
  Check,
  Volume2,
  Video,
  Radio,
  Sliders,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Card from '../common/Card';
import PageHeader from '../common/PageHeader';
import StatusBadge from '../common/StatusBadge';
import { useAppContext } from '../../context/AppContext';
import type { ToolInfo } from '../../types';

export default function AppSettingsPage() {
  const { state, dispatch } = useAppContext();
  const navigate = useNavigate();

  // Safe fallbacks to prevent any possible undefined property access
  const appSettings = state?.appSettings || {
    theme: 'dark' as const,
    startMinimized: false,
    autoConnect: false,
    showNotifications: true,
    adbPath: '',
    scrcpyPath: '',
    ffmpegPath: '',
    ffprobePath: '',
    language: 'en',
  };

  const toolStatus = state?.toolStatus || {
    adb: { name: 'ADB', toolType: 'adb' as const, status: 'missing' as const, error: 'Not checked' },
    scrcpy: { name: 'scrcpy', toolType: 'scrcpy' as const, status: 'missing' as const, error: 'Not checked' },
    ffmpeg: { name: 'FFmpeg', toolType: 'ffmpeg' as const, status: 'missing' as const, error: 'Not checked' },
    ffprobe: { name: 'ffprobe', toolType: 'ffprobe' as const, status: 'missing' as const, error: 'Not checked' },
  };

  const [adbPath, setAdbPath] = useState<string>(appSettings.adbPath || '');
  const [scrcpyPath, setScrcpyPath] = useState<string>(appSettings.scrcpyPath || '');
  const [ffmpegPath, setFfmpegPath] = useState<string>(appSettings.ffmpegPath || '');
  const [ffprobePath, setFfprobePath] = useState<string>(appSettings.ffprobePath || '');

  const [validationResults, setValidationResults] = useState<Record<string, ToolInfo | null>>({
    adb: null,
    scrcpy: null,
    ffmpeg: null,
    ffprobe: null,
  });

  const [isValidating, setIsValidating] = useState<Record<string, boolean>>({
    adb: false,
    scrcpy: false,
    ffmpeg: false,
    ffprobe: false,
  });

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync from state if appSettings changes
  useEffect(() => {
    if (appSettings) {
      setAdbPath(appSettings.adbPath || '');
      setScrcpyPath(appSettings.scrcpyPath || '');
      setFfmpegPath(appSettings.ffmpegPath || '');
      setFfprobePath(appSettings.ffprobePath || '');
    }
  }, [appSettings]);

  const updateGeneralSetting = <K extends keyof typeof appSettings>(
    key: K,
    value: (typeof appSettings)[K]
  ) => {
    try {
      dispatch({ type: 'UPDATE_APP_SETTINGS', payload: { [key]: value } });
      if (window.electronAPI?.tools?.saveSettings) {
        window.electronAPI.tools.saveSettings({ [key]: value });
      }
    } catch (err: unknown) {
      console.error('Failed to update setting:', err);
    }
  };

  const handleBrowse = async (tool: 'adb' | 'scrcpy' | 'ffmpeg' | 'ffprobe') => {
    if (!window.electronAPI?.tools?.browse) return;

    try {
      setErrorMessage(null);
      const result = await window.electronAPI.tools.browse(tool);
      if (result && result.path) {
        if (tool === 'adb') setAdbPath(result.path);
        if (tool === 'scrcpy') setScrcpyPath(result.path);
        if (tool === 'ffmpeg') {
          setFfmpegPath(result.path);
          if (!ffprobePath) {
            const guessedProbe = result.path.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1');
            setFfprobePath(guessedProbe);
          }
        }
        if (tool === 'ffprobe') setFfprobePath(result.path);

        setValidationResults((prev) => ({ ...prev, [tool]: result }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Failed to browse for ${tool}: ${msg}`);
    }
  };

  const handleTestPath = async (tool: 'adb' | 'scrcpy' | 'ffmpeg' | 'ffprobe', inputPath: string) => {
    if (!window.electronAPI?.tools?.validatePath) return;

    setIsValidating((prev) => ({ ...prev, [tool]: true }));
    setErrorMessage(null);
    try {
      const result = await window.electronAPI.tools.validatePath(tool, inputPath);
      setValidationResults((prev) => ({ ...prev, [tool]: result }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setValidationResults((prev) => ({
        ...prev,
        [tool]: {
          name: tool.toUpperCase(),
          toolType: tool,
          status: 'error',
          error: msg,
        },
      }));
    } finally {
      setIsValidating((prev) => ({ ...prev, [tool]: false }));
    }
  };

  const handleSaveAndApply = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    setErrorMessage(null);

    try {
      if (window.electronAPI?.tools?.saveSettings) {
        const response = await window.electronAPI.tools.saveSettings({
          adbPath,
          scrcpyPath,
          ffmpegPath,
          ffprobePath,
        });

        if (response?.settings) {
          dispatch({ type: 'SET_APP_SETTINGS', payload: response.settings });
        }
        if (response?.tools) {
          dispatch({ type: 'SET_TOOL_STATUS', payload: response.tools });
          setValidationResults({
            adb: response.tools.adb,
            scrcpy: response.tools.scrcpy,
            ffmpeg: response.tools.ffmpeg,
            ffprobe: response.tools.ffprobe || null,
          });
        }

        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Failed to save settings: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestAllTools = async () => {
    if (!window.electronAPI?.tools?.checkAll) return;
    setErrorMessage(null);
    try {
      const tools = await window.electronAPI.tools.checkAll();
      if (tools) {
        dispatch({ type: 'SET_TOOL_STATUS', payload: tools });
        setValidationResults({
          adb: tools.adb,
          scrcpy: tools.scrcpy,
          ffmpeg: tools.ffmpeg,
          ffprobe: tools.ffprobe || null,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Failed to test tools: ${msg}`);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings & Tools"
        description="Configure executable paths, tool detection, video/audio preferences, and streaming options"
        icon={Settings}
        action={
          <button
            onClick={handleTestAllTools}
            className="btn-secondary flex items-center gap-2 text-sm"
            title="Scan and verify all tools from PATH and default locations"
          >
            <RefreshCw className="w-4 h-4" />
            Test All Tools
          </button>
        }
      />

      {/* Global Settings Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-surface-800 pb-2">
        <button
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-brand-600/20 text-brand-300 border border-brand-500/30"
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
          onClick={() => navigate('/streaming')}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium text-surface-400 hover:text-white hover:bg-surface-800/80 transition-colors"
        >
          <Radio className="w-3.5 h-3.5" />
          <span>Streaming & OBS</span>
        </button>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Settings Error:</span>
            <p className="mt-0.5">{errorMessage}</p>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-[11px] underline text-red-300 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Tool Paths */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-surface-200 uppercase tracking-wider">
                Tool Executable Paths
              </h3>
              <p className="text-xs text-surface-400 mt-0.5">
                Configure paths to external binaries. If left empty, system PATH and default directories are searched.
              </p>
            </div>
          </div>

          <div className="space-y-5">
            {/* ADB Path */}
            <ToolPathField
              name="ADB (Android Debug Bridge)"
              tool="adb"
              defaultHint="Default: C:\Android\platform-tools\adb.exe (or in PATH)"
              value={adbPath}
              onChange={setAdbPath}
              onBrowse={() => handleBrowse('adb')}
              onTest={() => handleTestPath('adb', adbPath)}
              isValidating={isValidating.adb}
              validation={validationResults.adb || toolStatus.adb}
              placeholder="C:\Android\platform-tools\adb.exe"
            />

            {/* scrcpy Path */}
            <ToolPathField
              name="scrcpy (Screen Copy)"
              tool="scrcpy"
              defaultHint="Default: C:\Android\scrcpy\scrcpy.exe (or in PATH)"
              value={scrcpyPath}
              onChange={setScrcpyPath}
              onBrowse={() => handleBrowse('scrcpy')}
              onTest={() => handleTestPath('scrcpy', scrcpyPath)}
              isValidating={isValidating.scrcpy}
              validation={validationResults.scrcpy || toolStatus.scrcpy}
              placeholder="C:\Android\scrcpy\scrcpy.exe"
            />

            {/* FFmpeg Path */}
            <ToolPathField
              name="FFmpeg (Media Processing Engine)"
              tool="ffmpeg"
              defaultHint="Default: C:\ffmpeg\bin\ffmpeg.exe (searched only when empty)"
              value={ffmpegPath}
              onChange={setFfmpegPath}
              onBrowse={() => handleBrowse('ffmpeg')}
              onTest={() => handleTestPath('ffmpeg', ffmpegPath)}
              isValidating={isValidating.ffmpeg}
              validation={validationResults.ffmpeg || toolStatus.ffmpeg}
              placeholder="C:\ffmpeg\bin\ffmpeg.exe"
            />

            {/* ffprobe Path */}
            <ToolPathField
              name="ffprobe (Stream Analyzer)"
              tool="ffprobe"
              defaultHint="Default: C:\ffmpeg\bin\ffprobe.exe (searched only when empty)"
              value={ffprobePath}
              onChange={setFfprobePath}
              onBrowse={() => handleBrowse('ffprobe')}
              onTest={() => handleTestPath('ffprobe', ffprobePath)}
              isValidating={isValidating.ffprobe}
              validation={validationResults.ffprobe || toolStatus.ffprobe}
              placeholder="C:\ffmpeg\bin\ffprobe.exe"
            />
          </div>

          {/* Action Footer */}
          <div className="mt-6 pt-4 border-t border-surface-800 flex items-center justify-between">
            <button
              onClick={handleSaveAndApply}
              disabled={isSaving}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              {saveSuccess ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" />
                  Settings Saved & Applied!
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {isSaving ? 'Saving...' : 'Save & Apply Paths'}
                </>
              )}
            </button>

            <span className="text-[11px] text-surface-500">
              Validates and saves to settings file
            </span>
          </div>
        </Card>

        {/* General Preferences */}
        <div className="space-y-6">
          <Card>
            <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider mb-4">
              General Preferences
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-surface-400 mb-1.5">Theme</label>
                <select
                  value={appSettings.theme || 'dark'}
                  onChange={(e) => updateGeneralSetting('theme', e.target.value as any)}
                  className="input-field text-sm"
                >
                  <option value="dark">Dark Theme (Default)</option>
                  <option value="light">Light Theme (Coming Soon)</option>
                  <option value="system">System Preference</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-surface-400 mb-1.5">Language</label>
                <select
                  value={appSettings.language || 'en'}
                  onChange={(e) => updateGeneralSetting('language', e.target.value)}
                  className="input-field text-sm"
                >
                  <option value="en">English (United States)</option>
                </select>
              </div>

              <ToggleSetting
                label="Start Minimized"
                description="Launch MobileMirror Studio hidden in system tray"
                checked={!!appSettings.startMinimized}
                onChange={(v) => updateGeneralSetting('startMinimized', v)}
              />

              <ToggleSetting
                label="Auto-Connect"
                description="Automatically connect to known ADB devices on startup"
                checked={!!appSettings.autoConnect}
                onChange={(v) => updateGeneralSetting('autoConnect', v)}
              />

              <ToggleSetting
                label="Notifications"
                description="Display desktop alerts when devices connect or disconnect"
                checked={!!appSettings.showNotifications}
                onChange={(v) => updateGeneralSetting('showNotifications', v)}
              />
            </div>
          </Card>

          {/* About MobileMirror Studio */}
          <Card>
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg bg-brand-600/10 border border-brand-500/20 text-brand-400">
                <Info className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-white">MobileMirror Studio</h4>
                  <span className="text-xs font-mono text-brand-400 px-2 py-0.5 rounded bg-brand-500/10 border border-brand-500/20">
                    v1.0.0
                  </span>
                </div>
                <p className="text-xs text-surface-400 mt-1">
                  Professional Windows desktop screen mirroring & streaming studio powered by Electron, React, ADB, and scrcpy.
                </p>
                <div className="mt-3 pt-3 border-t border-surface-800 text-[11px] text-surface-500 space-y-1">
                  <p>• Architecture: Electron 28 + Node.js 26 + TypeScript</p>
                  <p>• Mirroring Engine: Official scrcpy integration</p>
                  <p>• Streaming Support: OBS Studio Window Capture ready</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Tool Path Input Field Component
// ============================================================

function ToolPathField({
  name,
  tool,
  defaultHint,
  value,
  onChange,
  onBrowse,
  onTest,
  isValidating,
  validation,
  placeholder,
}: {
  name: string;
  tool: 'adb' | 'scrcpy' | 'ffmpeg' | 'ffprobe';
  defaultHint: string;
  value: string;
  onChange: (val: string) => void;
  onBrowse: () => void;
  onTest: () => void;
  isValidating: boolean;
  validation?: ToolInfo | null;
  placeholder: string;
}) {
  const status = validation?.status || 'missing';
  const version = validation?.version;
  const error = validation?.error;
  const detectedPath = validation?.path;

  return (
    <div className="p-3 rounded-lg bg-surface-800/40 border border-surface-700/40 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-xs font-semibold text-surface-200">{name}</label>
          <p className="text-[10px] text-surface-500">{defaultHint}</p>
        </div>
        <StatusBadge
          status={status}
          label={
            status === 'installed'
              ? version
                ? `Installed (v${version})`
                : 'Installed'
              : status === 'error'
              ? 'Error'
              : 'Missing'
          }
          size="sm"
        />
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="input-field text-xs font-mono flex-1 py-1.5"
        />
        <button
          onClick={onBrowse}
          className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5 flex-shrink-0"
          title="Browse for executable on Windows"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Browse...
        </button>
        <button
          onClick={onTest}
          disabled={isValidating}
          className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5 flex-shrink-0 border border-surface-600 hover:border-brand-500"
          title="Test this specific path"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isValidating ? 'animate-spin text-brand-400' : ''}`} />
          {isValidating ? 'Testing...' : 'Test'}
        </button>
      </div>

      {/* Verification Feedback Banner */}
      {status === 'installed' && (
        <div className="flex items-center gap-2 p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <span className="font-semibold">Verified</span>
            {version && <span className="ml-1 text-emerald-200">• Version {version}</span>}
            {detectedPath && (
              <span className="block text-[10px] text-emerald-400/80 truncate font-mono">
                {detectedPath}
              </span>
            )}
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-start gap-2 p-2 rounded bg-red-500/10 border border-red-500/20 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <span className="font-semibold">Verification Error</span>
            <span className="block text-[11px] text-red-200/90 mt-0.5">{error}</span>
          </div>
        </div>
      )}

      {status === 'missing' && (
        <div className="flex items-start gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <span className="font-semibold">Not Detected</span>
            <span className="block text-[10px] text-amber-200/90 mt-0.5">
              {error || 'Binary not found. Please browse for the .exe or install it.'}
            </span>
          </div>
        </div>
      )}
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
