/**
 * Physical Device Audio Pipeline Diagnosis Script for iQOO Neo 10R / BGMI
 */

const { execFile, execSync } = require('child_process');
const net = require('net');
const fs = require('fs');

const ADB = 'C:\\Android\\platform-tools\\adb.exe';
const SERIAL = '10BG170ARJ007KR';
const PORT = 28200;

console.log('============================================================');
console.log(`DIAGNOSING PHYSICAL AUDIO PIPELINE ON ${SERIAL}`);
console.log('============================================================\n');

function adb(args) {
  return new Promise((resolve, reject) => {
    execFile(ADB, ['-s', SERIAL, ...args], { timeout: 8000 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).trim()));
      else resolve(stdout.trim());
    });
  });
}

async function main() {
  try {
    // 1. Check phone audio routing BEFORE capture
    console.log('[1/6] Checking active audio output route on phone...');
    const audioDump = await adb(['shell', 'dumpsys', 'audio']);
    const isBluetooth = audioDump.includes('DEVICE_OUT_BLUETOOTH_A2DP') || audioDump.includes('mBluetoothHeadsetDevice:');
    const isWired = audioDump.includes('DEVICE_OUT_WIRED_HEADSET');
    const isSpeaker = audioDump.includes('DEVICE_OUT_SPEAKER') || audioDump.includes('cur devices: speaker');
    console.log(`      Active route: ${isBluetooth ? 'Bluetooth Headset' : isWired ? 'Wired 3.5mm' : 'Built-in Speaker'}`);

    // 2. Calibrate clock offset with 5-iteration RTT filtering
    console.log('\n[2/6] Calibrating clock offset (Android System.nanoTime vs PC performance.now)...');
    let bestRtt = Infinity;
    let clockDeltaMs = 0;
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now();
      const devEpochStr = await adb(['shell', 'date +%s%3N']);
      const t1 = Date.now();
      const rtt = t1 - t0;
      const devEpoch = parseInt(devEpochStr, 10);
      if (!isNaN(devEpoch) && rtt < bestRtt) {
        bestRtt = rtt;
        clockDeltaMs = devEpoch - Math.round(t0 + rtt / 2);
      }
    }
    console.log(`      Clock Delta: ${clockDeltaMs} ms (Best RTT: ${bestRtt} ms)`);

    // 3. Set up ADB forward
    console.log('\n[3/6] Setting up ADB port forward (tcp:28200 -> localabstract:sndcpy)...');
    await adb(['forward', `tcp:${PORT}`, 'localabstract:sndcpy']);

    // 4. Start companion service on phone if not already running
    console.log('\n[4/6] Verifying companion service state on phone...');
    await adb(['shell', 'am', 'start', '-n', 'com.rom1v.sndcpy/.MainActivity']);

    // 5. Connect TCP client and instrument stream for 5 seconds
    console.log('\n[5/6] Connecting to TCP audio stream on 127.0.0.1:28200...');
    const socket = net.connect({ host: '127.0.0.1', port: PORT });
    socket.setNoDelay(true);

    let packetCount = 0;
    let totalBytes = 0;
    let firstPacketTime = 0;
    let lastPacketTime = 0;
    const intervals = [];
    const packetSizes = [];
    let underruns = 0;
    let sumSquares = 0;
    let sampleCount = 0;
    let peakSample = 0;

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve();
      }, 5000);

      socket.on('data', (chunk) => {
        const now = Date.now();
        if (firstPacketTime === 0) {
          firstPacketTime = now;
          console.log(`      🎉 First packet received! Size: ${chunk.length} bytes`);
        } else {
          const interval = now - lastPacketTime;
          intervals.push(interval);
          if (interval > 100) underruns++;
        }
        lastPacketTime = now;
        packetCount++;
        totalBytes += chunk.length;
        packetSizes.push(chunk.length);

        // Check PCM levels (16-bit LE)
        for (let i = 0; i < chunk.length - 1; i += 2) {
          const s = chunk.readInt16LE(i);
          const absNorm = Math.abs(s) / 32768.0;
          if (absNorm > peakSample) peakSample = absNorm;
          sumSquares += absNorm * absNorm;
          sampleCount++;
        }
      });

      socket.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      socket.on('close', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    console.log('\n[6/6] Stream Instrumentation Results (5-second physical capture):');
    if (packetCount > 0) {
      const durationMs = lastPacketTime - firstPacketTime;
      const avgInterval = intervals.length > 0 ? (intervals.reduce((a, b) => a + b, 0) / intervals.length).toFixed(1) : 'N/A';
      const minInterval = intervals.length > 0 ? Math.min(...intervals) : 0;
      const maxInterval = intervals.length > 0 ? Math.max(...intervals) : 0;
      const avgSize = Math.round(totalBytes / packetCount);
      const audioDurationMs = Math.round(totalBytes / 192); // 48kHz stereo 16-bit = 192 bytes/ms
      const rms = sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0;
      const dB = Math.max(-60, Math.round(20 * Math.log10(Math.max(rms, 0.0001))));

      console.log(`      • Total Packets: ${packetCount}`);
      console.log(`      • Total Bytes: ${totalBytes} bytes (${(totalBytes / 1024).toFixed(1)} KB)`);
      console.log(`      • Packet Size: min=${Math.min(...packetSizes)}B, max=${Math.max(...packetSizes)}B, avg=${avgSize}B`);
      console.log(`      • Packet Intervals: min=${minInterval}ms, max=${maxInterval}ms, avg=${avgInterval}ms`);
      console.log(`      • Stream Duration (wall-clock): ${durationMs} ms`);
      console.log(`      • Audio Duration (samples): ${audioDurationMs} ms`);
      console.log(`      • Drift: ${durationMs - audioDurationMs} ms`);
      console.log(`      • Buffer Underruns (>100ms gap): ${underruns}`);
      console.log(`      • Audio Level: Peak=${(peakSample * 100).toFixed(0)}%, RMS=${(rms * 100).toFixed(0)}%, dB=${dB} dB`);
    } else {
      console.log('      ⚠ No audio packets received. Ensure companion permission is granted on phone screen.');
    }

    // 7. Verify phone route AFTER capture (Must NOT force route change!)
    const audioDumpAfter = await adb(['shell', 'dumpsys', 'audio']);
    const isBluetoothAfter = audioDumpAfter.includes('DEVICE_OUT_BLUETOOTH_A2DP') || audioDumpAfter.includes('mBluetoothHeadsetDevice:');
    console.log(`\n[Post-Check] Phone audio route after capture: ${isBluetoothAfter ? 'Bluetooth Headset' : 'Speaker'}`);
    console.log(`      Route preserved: ${isBluetooth === isBluetoothAfter ? 'YES (Non-destructive capture confirmed)' : 'NO (Changed)'}`);

  } catch (err) {
    console.error('Diagnostic error:', err.message);
  }
}

main();
