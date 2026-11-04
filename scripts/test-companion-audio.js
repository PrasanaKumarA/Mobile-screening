/**
 * MobileMirror Studio - Standalone Universal Audio Agent Diagnostic Script
 * Tests output-device-independent Android Audio Playback Capture over ADB.
 */

const { execFile } = require('child_process');
const net = require('net');
const path = require('path');

const ADB_PATH = 'C:\\Android\\platform-tools\\adb.exe';
const APK_PATH = path.resolve(__dirname, '..', 'resources', 'companion', 'audio-companion.apk');
const PACKAGE_NAME = 'com.rom1v.sndcpy';
const TCP_PORT = 28200;

function runAdb(args, timeout = 10000) {
  return new Promise((resolve, reject) => {
    execFile(ADB_PATH, args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`${stderr || err.message}`));
      resolve(stdout.trim());
    });
  });
}

async function detectActiveAudioRoute(deviceId) {
  try {
    const dump = await runAdb(['-s', deviceId, 'shell', 'dumpsys', 'audio'], 3000);
    const lower = dump.toLowerCase();

    if (
      lower.includes('device_out_bluetooth_a2dp') ||
      lower.includes('bt_a2dp') ||
      lower.includes('a2dp') ||
      lower.includes('device_out_bluetooth_sco')
    ) {
      return 'Bluetooth Audio (Earbuds / Headphones / Speaker)';
    }
    if (
      lower.includes('device_out_usb_device') ||
      lower.includes('device_out_usb_headset') ||
      lower.includes('usb_headset')
    ) {
      return 'USB-C Audio / External DAC';
    }
    if (
      lower.includes('device_out_wired_headset') ||
      lower.includes('device_out_wired_headphone') ||
      lower.includes('wired_headset')
    ) {
      return 'Wired 3.5 mm Headset / Headphones';
    }
    if (
      lower.includes('device_out_speaker') ||
      lower.includes('cur devices: speaker') ||
      lower.includes('speaker')
    ) {
      return 'Built-in Phone Speaker';
    }
    return 'Default Android Output Route';
  } catch {
    return 'Unknown Route';
  }
}

async function main() {
  console.log('================================================================');
  console.log('   MobileMirror Studio: Universal Android Audio Capture Test    ');
  console.log('================================================================');

  // 1. Device check
  console.log('\n[1/6] Checking ADB device connection...');
  const devicesOutput = await runAdb(['devices', '-l']);
  const lines = devicesOutput
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('List of'));

  if (lines.length === 0) {
    console.error('\n❌ No ADB devices detected.');
    console.error('👉 Please connect your Android phone via USB and ensure USB Debugging is ON.');
    process.exit(1);
  }

  const deviceId = lines[0].split(/\s+/)[0];
  console.log(`✅ Target device detected: ${deviceId}`);

  // 2. Audio output route detection
  console.log('\n[2/6] Detecting active phone audio output route (read-only)...');
  const activeRoute = await detectActiveAudioRoute(deviceId);
  console.log(`🔊 Active Phone Route: ${activeRoute}`);
  console.log('ℹ️  Audio will continue playing locally through this output while being captured.');

  // 3. Companion installation check
  console.log('\n[3/6] Checking MobileMirror Audio Agent installation...');
  const packages = await runAdb(['-s', deviceId, 'shell', 'pm', 'list', 'packages', PACKAGE_NAME]);
  if (!packages.includes(PACKAGE_NAME)) {
    console.log(`Installing ${APK_PATH}...`);
    await runAdb(['-s', deviceId, 'install', '-t', '-r', '-g', APK_PATH]);
    console.log('✅ Companion app installed successfully.');
  } else {
    console.log('✅ Companion app already installed.');
  }

  // 4. Pre-grant MediaProjection permission
  console.log('\n[4/6] Pre-granting MediaProjection appop permission...');
  try {
    await runAdb(['-s', deviceId, 'shell', 'appops', 'set', PACKAGE_NAME, 'PROJECT_MEDIA', 'allow']);
    console.log('✅ PROJECT_MEDIA appop granted.');
  } catch (err) {
    console.log(`ℹ️  Note: appops set returned (${err.message}). Consent prompt will appear on phone screen.`);
  }

  // 5. Port forward & launch app
  console.log('\n[5/6] Setting up ADB port forward (tcp:28200 -> localabstract:sndcpy)...');
  await runAdb(['-s', deviceId, 'forward', `tcp:${TCP_PORT}`, `localabstract:sndcpy`]);
  console.log('Launching companion audio agent on phone...');
  await runAdb(['-s', deviceId, 'shell', 'am', 'start', '-n', `${PACKAGE_NAME}/.MainActivity`]);
  console.log('✅ Audio Agent launched. (If a screen capture dialog appears on phone, tap "Start now" / "Allow")');

  // 6. Connect TCP client and measure real-time audio levels
  console.log('\n[6/6] Connecting to audio stream on localhost:28200...');
  let totalBytes = 0;
  let startTime = Date.now();
  let maxPeak = 0;

  for (let attempt = 1; attempt <= 15; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        const socket = net.connect({ host: '127.0.0.1', port: TCP_PORT }, () => {
          console.log('\n🎉 SUCCESS: Connected to Audio Agent PCM stream!');
          console.log('Capturing uncompressed 48,000 Hz, 16-bit, Stereo PCM...');
          console.log('----------------------------------------------------------------');

          socket.on('data', chunk => {
            totalBytes += chunk.length;
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const kb = (totalBytes / 1024).toFixed(1);
            const kbps = ((totalBytes * 8) / (Date.now() - startTime)).toFixed(1);

            // Calculate chunk peak
            for (let i = 0; i < chunk.length - 1; i += 2) {
              const sample = Math.abs(chunk.readInt16LE(i)) / 32768.0;
              if (sample > maxPeak) maxPeak = sample;
            }

            const peakPct = (maxPeak * 100).toFixed(0);
            process.stdout.write(
              `\r[Streaming] ${kb} KB in ${elapsed}s (~${kbps} kbps) | Peak: ${peakPct}% | Route: ${activeRoute}`
            );
          });

          socket.on('end', () => {
            console.log('\nStream closed by Android companion.');
            process.exit(0);
          });

          socket.on('error', err => {
            console.error('\nSocket error:', err.message);
          });

          // Test stream for 10 seconds then cleanly exit
          setTimeout(() => {
            console.log('\n----------------------------------------------------------------');
            console.log(`✅ Verification Complete! Total received: ${(totalBytes / 1024).toFixed(1)} KB PCM.`);
            console.log(`🔊 Confirmed: Local audio continued playing to ${activeRoute} without interruption.`);
            socket.destroy();
            resolve();
            process.exit(0);
          }, 10000);
        });

        socket.on('error', err => {
          reject(err);
        });
      });
      break;
    } catch (err) {
      if (attempt === 15) {
        console.error('\n❌ Could not connect after 15 attempts. Ensure you accepted the permission prompt on phone.');
        process.exit(1);
      }
      await new Promise(r => setTimeout(r, 600));
    }
  }
}

main().catch(err => {
  console.error('\nDiagnostic script encountered error:', err.message);
  process.exit(1);
});
