package com.mobilemirror.audioagent

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.net.LocalServerSocket
import android.net.LocalSocket
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*
import java.io.OutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.sqrt

/**
 * Foreground Service that captures eligible playback audio using AudioPlaybackCaptureConfiguration.
 * Streams uncompressed 48 kHz stereo 16-bit PCM chunks to local UNIX abstract socket "sndcpy".
 */
class AudioCaptureService : Service() {

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var mediaProjection: MediaProjection? = null
    private var audioRecord: AudioRecord? = null
    private var localServerSocket: LocalServerSocket? = null
    private var clientSocket: LocalSocket? = null
    private var isRecording = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        if (action == ACTION_STOP) {
            stopCapture()
            stopSelf()
            return START_NOT_STICKY
        }

        val resultCode = intent?.getIntExtra(EXTRA_RESULT_CODE, 0) ?: 0
        val resultData = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent?.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent?.getParcelableExtra(EXTRA_RESULT_DATA)
        }

        if (resultCode != 0 && resultData != null) {
            startForegroundServiceWithNotification()
            startCapture(resultCode, resultData)
        } else {
            Log.e(TAG, "Missing MediaProjection resultCode or data")
            stopSelf()
        }

        return START_STICKY
    }

    private fun startForegroundServiceWithNotification() {
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("MobileMirror Audio Agent")
            .setContentText("Capturing game audio over USB to Windows")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun startCapture(resultCode: Int, resultData: Intent) {
        val projectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        mediaProjection = projectionManager.getMediaProjection(resultCode, resultData)

        if (mediaProjection == null) {
            Log.e(TAG, "Failed to acquire MediaProjection token")
            stopSelf()
            return
        }

        serviceScope.launch {
            try {
                // Setup UNIX abstract domain socket "sndcpy"
                localServerSocket = LocalServerSocket(SOCKET_NAME)
                Log.i(TAG, "UNIX abstract socket '$SOCKET_NAME' ready, waiting for ADB host connection...")

                clientSocket = localServerSocket?.accept()
                Log.i(TAG, "ADB host connected to audio socket. Initializing AudioPlaybackCapture...")

                val outputStream: OutputStream = clientSocket!!.outputStream

                // Configure AudioPlaybackCapture for GAME, MEDIA, and UNKNOWN usages
                val config = AudioPlaybackCaptureConfiguration.Builder(mediaProjection!!)
                    .addMatchingUsage(AudioAttributes.USAGE_GAME)
                    .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                    .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                    .build()

                val audioFormat = AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(SAMPLE_RATE)
                    .setChannelMask(AudioFormat.CHANNEL_IN_STEREO)
                    .build()

                val minBufferSize = AudioRecord.getMinBufferSize(
                    SAMPLE_RATE,
                    AudioFormat.CHANNEL_IN_STEREO,
                    AudioFormat.ENCODING_PCM_16BIT
                )
                // Hardware buffer accommodates at least minBufferSize, minimum 4x 20ms frames to prevent internal driver starvation
                val hardwareBufferSize = max(minBufferSize, FRAME_SIZE_20MS * 4)

                audioRecord = AudioRecord.Builder()
                    .setAudioPlaybackCaptureConfig(config)
                    .setAudioFormat(audioFormat)
                    .setBufferSizeInBytes(hardwareBufferSize)
                    .build()

                audioRecord?.startRecording()
                isRecording = true
                Log.i(TAG, "AudioRecord started at 48 kHz stereo 16-bit PCM. Target frame: ${FRAME_SIZE_20MS}B (20ms)")

                // Read in optimized 20ms audio frames (960 sample frames = 3840 bytes) for minimal latency
                val chunkBuffer = ByteArray(FRAME_SIZE_20MS)
                val headerBuffer = ByteBuffer.allocate(HEADER_SIZE).order(ByteOrder.LITTLE_ENDIAN)

                var sequenceNumber = 0
                var droppedFrames = 0
                var captureOverruns = 0
                var lastReadNanoTime = System.nanoTime()

                var levelSampleCount = 0
                var levelSampleSumSquares = 0.0
                var levelSamplePeak = 0.0
                var lastEmitTime = System.currentTimeMillis()

                while (isRecording && isActive) {
                    val readStartNs = System.nanoTime()
                    val bytesRead = audioRecord?.read(chunkBuffer, 0, chunkBuffer.size, AudioRecord.READ_BLOCKING) ?: -1

                    if (bytesRead > 0) {
                        val captureTimestampNs = System.nanoTime()
                        val intervalMs = (captureTimestampNs - lastReadNanoTime) / 1_000_000
                        lastReadNanoTime = captureTimestampNs

                        // Detect hardware capture overrun if read interval is significantly longer than 1 frame (> 35ms)
                        var flags: Short = 0
                        if (intervalMs > 35 && sequenceNumber > 0) {
                            captureOverruns++
                            flags = (flags.toInt() or FLAG_OVERRUN_DETECTED).toShort()
                            Log.w(TAG, "Capture overrun detected! Gap: ${intervalMs}ms (Total overruns: $captureOverruns)")
                        }

                        // Write packet header with accurate monotonic timestamp (HEADER_SIZE = 24 bytes)
                        headerBuffer.clear()
                        headerBuffer.put(MAGIC_HEADER_BYTES) // 4 bytes: 'M', 'M', 'A', 'U'
                        headerBuffer.putShort(PROTOCOL_VERSION) // 2 bytes: v1
                        headerBuffer.putShort(flags) // 2 bytes: flags
                        headerBuffer.putInt(sequenceNumber++) // 4 bytes: sequence
                        headerBuffer.putLong(captureTimestampNs) // 8 bytes: monotonic timestamp in nanoseconds
                        headerBuffer.putInt(bytesRead) // 4 bytes: payload length

                        outputStream.write(headerBuffer.array(), 0, HEADER_SIZE)
                        outputStream.write(chunkBuffer, 0, bytesRead)
                        outputStream.flush()

                        // Compute audio level for monitoring
                        for (i in 0 until bytesRead - 1 step 2) {
                            val sample = (chunkBuffer[i].toInt() and 0xFF) or (chunkBuffer[i + 1].toInt() shl 8)
                            val shortSample = sample.toShort()
                            val absNorm = abs(shortSample.toDouble()) / 32768.0
                            if (absNorm > levelSamplePeak) levelSamplePeak = absNorm
                            levelSampleSumSquares += absNorm * absNorm
                            levelSampleCount++
                        }

                        val now = System.currentTimeMillis()
                        if (now - lastEmitTime >= 200 && levelSampleCount > 0) {
                            val rms = sqrt(levelSampleSumSquares / levelSampleCount)
                            val peak = (levelSamplePeak * 100).toInt()
                            broadcastAudioLevel(peak, (rms * 100).toInt())

                            levelSampleSumSquares = 0.0
                            levelSamplePeak = 0.0
                            levelSampleCount = 0
                            lastEmitTime = now
                        }
                    } else if (bytesRead < 0) {
                        Log.w(TAG, "AudioRecord read returned error code: $bytesRead")
                        droppedFrames++
                        break
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Audio capture loop exception: ${e.message}", e)
            } finally {
                cleanupCaptureResources()
            }
        }
    }

    private fun broadcastAudioLevel(peak: Int, rms: Int) {
        val intent = Intent(ACTION_AUDIO_LEVEL).apply {
            putExtra(EXTRA_LEVEL_PEAK, peak)
            putExtra(EXTRA_LEVEL_RMS, rms)
        }
        sendBroadcast(intent)
    }

    private fun stopCapture() {
        isRecording = false
        cleanupCaptureResources()
    }

    private fun cleanupCaptureResources() {
        try {
            audioRecord?.stop()
            audioRecord?.release()
        } catch (_: Exception) {}
        audioRecord = null

        try {
            clientSocket?.close()
        } catch (_: Exception) {}
        clientSocket = null

        try {
            localServerSocket?.close()
        } catch (_: Exception) {}
        localServerSocket = null

        try {
            mediaProjection?.stop()
        } catch (_: Exception) {}
        mediaProjection = null
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "MobileMirror Audio Capture",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Foreground notification for streaming game audio to PC"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        stopCapture()
        serviceScope.cancel()
    }

    companion object {
        const val TAG = "AudioCaptureService"
        const val CHANNEL_ID = "mobilemirror_audio_channel"
        const val NOTIFICATION_ID = 4040
        const val SOCKET_NAME = "sndcpy"
        const val SAMPLE_RATE = 48000
        const val BUFFER_SIZE = 4096

        // Low-latency framing constants
        val MAGIC_HEADER_BYTES = byteArrayOf('M'.code.toByte(), 'M'.code.toByte(), 'A'.code.toByte(), 'U'.code.toByte()) // "MMAU"
        const val PROTOCOL_VERSION: Short = 1
        const val HEADER_SIZE = 24
        const val FRAME_SIZE_10MS = 1920 // 480 samples * 4 bytes
        const val FRAME_SIZE_20MS = 3840 // 960 samples * 4 bytes
        const val FLAG_OVERRUN_DETECTED: Short = 0x0001
        const val FLAG_CLOCK_SYNC: Short = 0x0002

        const val ACTION_START = "com.mobilemirror.audioagent.ACTION_START"
        const val ACTION_STOP = "com.mobilemirror.audioagent.ACTION_STOP"
        const val ACTION_AUDIO_LEVEL = "com.mobilemirror.audioagent.ACTION_AUDIO_LEVEL"

        const val EXTRA_RESULT_CODE = "extra_result_code"
        const val EXTRA_RESULT_DATA = "extra_result_data"
        const val EXTRA_LEVEL_PEAK = "extra_level_peak"
        const val EXTRA_LEVEL_RMS = "extra_level_rms"
    }
}

