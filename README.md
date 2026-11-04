# MobileMirror Studio

A high-performance Windows desktop application built with **Electron**, **React 18**, **TypeScript**, **Tailwind CSS**, and **Vite** for professional Android screen mirroring and universal audio capture.

---

## Features

- **Real-Time Android USB Mirroring**: High-performance, low-latency screen mirroring powered by hardware-accelerated `scrcpy` (up to 1080p @ 60 FPS, 16 Mbps).
- **Universal Dual-Audio Routing**:
  - Independent Android game-audio capture via Android's `AudioPlaybackCaptureConfiguration` & `MediaProjection` API.
  - Listen through Bluetooth earbuds / headphones connected directly to the phone.
  - Simultaneously stream 48 kHz uncompressed stereo PCM audio to your Windows PC and laptop speakers with near-zero latency (<25 ms).
  - OBS Studio captures laptop audio seamlessly for YouTube/Twitch live streaming.
- **Dynamic Tool Detection**: Auto-detects ADB, scrcpy, FFmpeg, and ffprobe from PATH, WinGet, or custom configured paths with real-time version verification.
- **Interactive OBS Streaming Hub**: Step-by-step guidance and window targeting for OBS Studio capture.

---

## Tech Stack

- **Desktop Framework**: Electron 28
- **Frontend**: React 18, TypeScript, Tailwind CSS, Lucide Icons, Vite
- **Core Native Engines**:
  - `scrcpy` (Screen mirroring)
  - `adb` (Android Debug Bridge)
  - `ffmpeg` & `ffprobe` (Media stream processing)
- **Audio Engine**:
  - Android Audio Companion APK (`companion-android/`)
  - Web Audio API real-time PCM streamer (`PcmPlayer`)
  - HTTP Live WAV Streaming endpoint (`http://127.0.0.1:28201/live-audio.wav`)

---

## Getting Started

### Prerequisites
- Windows 10/11
- Node.js (v18+)
- Android device with USB Debugging enabled
- `platform-tools` (ADB) and `scrcpy`

### Installation

```bash
# Clone the repository
git clone https://github.com/PrasanaKumarA/Mobile-screening.git
cd Mobile-screening

# Install dependencies
npm install

# Run development mode
npm run dev

# Build for production
npm run build

# Start production build
npm start
```

---

## License

MIT License.
