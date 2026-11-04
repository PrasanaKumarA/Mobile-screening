# MobileMirror Audio Agent (Android Companion App)

MobileMirror Audio Agent is an Android companion application for **MobileMirror Studio** that enables **Universal Android Audio Playback Capture**.

## Architecture & Design Goals

1. **Output-Device Independence**:
   - The user can listen through any Android-connected device:
     - Built-in phone speakers
     - Bluetooth earbuds / headphones / speakers
     - Wired 3.5 mm analog headphones / headsets
     - USB-C earphones / external USB DACs
   - Game and media audio continues playing without interruption or routing alteration.

2. **Official Android Playback Capture API**:
   - Uses `AudioPlaybackCaptureConfiguration` (Android 10+ / API 29+).
   - Taps `USAGE_GAME`, `USAGE_MEDIA`, and `USAGE_UNKNOWN` streams.
   - Captures uncompressed **48,000 Hz 16-bit Stereo PCM**.

3. **Android 14+ Foreground Service**:
   - Runs with `FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION`.
   - Explicit user consent requested via `MediaProjectionManager`.
   - Low memory footprint and zero CPU overhead.

4. **USB ADB Transport**:
   - Streams PCM data to local abstract socket `sndcpy`.
   - ADB forwards to Windows host `localhost:28200`.
   - Zero transcoding latency.

## Building from Source

```bash
cd companion-android
./gradlew assembleRelease
# Output APK: app/build/outputs/apk/release/app-release.apk
```

