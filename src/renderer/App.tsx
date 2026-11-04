import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import Dashboard from './components/dashboard/Dashboard';
import DeviceConnection from './components/devices/DeviceConnection';
import ScreenMirroring from './components/mirroring/ScreenMirroring';
import AudioSettingsPage from './components/settings/AudioSettings';
import VideoSettingsPage from './components/settings/VideoSettings';
import StreamingSettingsPage from './components/settings/StreamingSettings';
import AppSettingsPage from './components/settings/AppSettings';
import ErrorBoundary from './components/common/ErrorBoundary';

export default function App() {
  return (
    <MainLayout>
      <ErrorBoundary fallbackTitle="Application View Error">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/devices" element={<DeviceConnection />} />
          <Route path="/mirroring" element={<ScreenMirroring />} />
          <Route path="/audio" element={<AudioSettingsPage />} />
          <Route path="/video" element={<VideoSettingsPage />} />
          <Route path="/streaming" element={<StreamingSettingsPage />} />
          <Route path="/settings" element={<AppSettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </MainLayout>
  );
}
