import React, { useState } from 'react';
import {
  Smartphone,
  Tablet,
  Usb,
  Wifi,
  Search,
  RefreshCw,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  HelpCircle,
} from 'lucide-react';
import Card from '../common/Card';
import PageHeader from '../common/PageHeader';
import StatusBadge from '../common/StatusBadge';
import { useAppContext } from '../../context/AppContext';

export default function DeviceConnection() {
  const { state, dispatch } = useAppContext();
  const [activeTab, setActiveTab] = useState<'android' | 'ipad'>('android');
  const [wirelessIp, setWirelessIp] = useState('');
  const [wirelessPort, setWirelessPort] = useState('5555');
  const [isScanning, setIsScanning] = useState(false);
  const [isRestartingAdb, setIsRestartingAdb] = useState(false);

  const handleScanDevices = async () => {
    setIsScanning(true);
    try {
      if (window.electronAPI) {
        const devices = await window.electronAPI.adb.listDevices();
        dispatch({ type: 'SET_DEVICES', payload: devices });
      }
    } catch (err) {
      console.error('Failed to scan devices:', err);
    } finally {
      setTimeout(() => setIsScanning(false), 800);
    }
  };

  const handleRestartAdb = async () => {
    setIsRestartingAdb(true);
    try {
      if (window.electronAPI) {
        await window.electronAPI.adb.restartServer();
        const devices = await window.electronAPI.adb.listDevices();
        dispatch({ type: 'SET_DEVICES', payload: devices });
      }
    } catch (err) {
      console.error('Failed to restart ADB:', err);
    } finally {
      setIsRestartingAdb(false);
    }
  };

  const handleWirelessConnect = async () => {
    if (!wirelessIp.trim()) return;
    try {
      if (window.electronAPI) {
        const success = await window.electronAPI.adb.connectWireless(wirelessIp, parseInt(wirelessPort) || 5555);
        if (success) {
          const devices = await window.electronAPI.adb.listDevices();
          dispatch({ type: 'SET_DEVICES', payload: devices });
        }
      }
    } catch (err) {
      console.error('Failed to connect wirelessly:', err);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Device Connection"
        description="Connect and manage your mobile devices"
        icon={Smartphone}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={handleRestartAdb}
              disabled={isRestartingAdb || isScanning}
              className="btn-secondary flex items-center gap-2 text-xs"
              title="Restart ADB daemon and re-enumerate USB devices"
            >
              {isRestartingAdb ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Restart ADB
            </button>
            <button
              onClick={handleScanDevices}
              disabled={isScanning || isRestartingAdb}
              className="btn-primary flex items-center gap-2"
            >
              {isScanning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Scan Devices
            </button>
          </div>
        }
      />

      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 bg-surface-800/50 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('android')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'android'
              ? 'bg-brand-600 text-white shadow-lg'
              : 'text-surface-400 hover:text-white hover:bg-surface-700'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          Android
        </button>
        <button
          onClick={() => setActiveTab('ipad')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'ipad'
              ? 'bg-brand-600 text-white shadow-lg'
              : 'text-surface-400 hover:text-white hover:bg-surface-700'
          }`}
        >
          <Tablet className="w-4 h-4" />
          iPad
        </button>
      </div>

      {activeTab === 'android' ? (
        <div className="grid grid-cols-2 gap-6">
          {/* USB Connection */}
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <Usb className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">USB Connection</h3>
                <p className="text-xs text-surface-400">Connect via USB cable with ADB</p>
              </div>
            </div>

            <div className="space-y-3 mb-4">
              <div className="p-3 rounded-lg bg-surface-800/50 border border-surface-700/30">
                <h4 className="text-xs font-medium text-surface-300 mb-2">Setup Instructions</h4>
                <ol className="space-y-1.5 text-xs text-surface-400">
                  <li className="flex gap-2">
                    <span className="text-brand-400 font-medium">1.</span>
                    Enable Developer Options on your Android device
                  </li>
                  <li className="flex gap-2">
                    <span className="text-brand-400 font-medium">2.</span>
                    Enable USB Debugging in Developer Options
                  </li>
                  <li className="flex gap-2">
                    <span className="text-brand-400 font-medium">3.</span>
                    Connect via USB cable and approve the debug prompt
                  </li>
                  <li className="flex gap-2">
                    <span className="text-brand-400 font-medium">4.</span>
                    Click "Scan Devices" to detect your device
                  </li>
                </ol>
              </div>
            </div>

            {state.devices.filter((d) => d.platform === 'android' && d.connectionType === 'usb').length > 0 ? (
              <div className="space-y-2">
                {state.devices
                  .filter((d) => d.platform === 'android' && d.connectionType === 'usb')
                  .map((device) => (
                    <DeviceRow key={device.id} device={device} />
                  ))}
              </div>
            ) : (
              <div className="flex flex-col items-center py-6 text-center border border-dashed border-surface-700/30 rounded-lg">
                <Usb className="w-8 h-8 text-surface-600 mb-2" />
                <p className="text-sm text-surface-400">No USB devices detected</p>
                <p className="text-xs text-surface-500 mt-1">Connect a device and click Scan</p>
              </div>
            )}
          </Card>

          {/* Wireless Connection */}
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Wifi className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Wireless Connection</h3>
                <p className="text-xs text-surface-400">Connect over Wi-Fi network</p>
              </div>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-surface-300 mb-1.5">
                  Device IP Address
                </label>
                <input
                  type="text"
                  value={wirelessIp}
                  onChange={(e) => setWirelessIp(e.target.value)}
                  placeholder="192.168.1.100"
                  className="input-field text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-300 mb-1.5">
                  Port
                </label>
                <input
                  type="text"
                  value={wirelessPort}
                  onChange={(e) => setWirelessPort(e.target.value)}
                  placeholder="5555"
                  className="input-field text-sm"
                />
              </div>
              <button
                onClick={handleWirelessConnect}
                disabled={!wirelessIp.trim()}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                <Wifi className="w-4 h-4" />
                Connect Wirelessly
              </button>
            </div>

            <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <div className="flex gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-amber-300">Prerequisite</p>
                  <p className="text-xs text-surface-400 mt-0.5">
                    First connect via USB and run <code className="text-amber-300 bg-surface-800 px-1 rounded">adb tcpip 5555</code> to enable wireless mode.
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      ) : (
        <Card>
          <div className="flex flex-col items-center text-center py-12">
            <div className="p-4 rounded-full bg-blue-500/10 border border-blue-500/20 mb-4">
              <Tablet className="w-10 h-10 text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">iPad Capture — Coming Soon</h3>
            <p className="text-sm text-surface-400 max-w-md mb-4">
              iPad mirroring will use HDMI capture devices connected to your Windows machine.
              This requires a compatible HDMI capture card and a Lightning/USB-C to HDMI adapter for your iPad.
            </p>
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-800/50 border border-surface-700/30">
              <HelpCircle className="w-4 h-4 text-surface-400" />
              <span className="text-xs text-surface-400">Architecture is prepared for capture device integration</span>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function DeviceRow({ device }: { device: any }) {
  const isAuthorized = device.status === 'connected' || device.authorizationStatus === 'device';
  const isUnauthorized = device.status === 'unauthorized' || device.authorizationStatus === 'unauthorized';

  return (
    <div className="p-3 rounded-lg bg-surface-800/50 border border-surface-700/30 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Smartphone className={`w-5 h-5 ${isAuthorized ? 'text-emerald-400' : 'text-amber-400'}`} />
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white">{device.name || device.model}</p>
              {device.androidVersion && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-brand-500/10 text-brand-300 border border-brand-500/20">
                  Android {device.androidVersion}
                </span>
              )}
            </div>
            <p className="text-xs text-surface-400 mt-0.5 font-mono">
              Serial: {device.id} {device.manufacturer && `• ${device.manufacturer}`}
            </p>
          </div>
        </div>
        <StatusBadge
          status={isAuthorized ? 'connected' : isUnauthorized ? 'unauthorized' : 'disconnected'}
          label={isAuthorized ? 'Authorized' : isUnauthorized ? 'Unauthorized' : 'Offline'}
          pulse={isAuthorized}
        />
      </div>

      {isUnauthorized && (
        <div className="text-[11px] text-amber-300 bg-amber-500/10 p-2 rounded border border-amber-500/20 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
          <span>
            Please check your phone screen and tap <strong>"Always allow from this computer"</strong>, then tap <strong>"Allow"</strong>.
          </span>
        </div>
      )}
    </div>
  );
}

