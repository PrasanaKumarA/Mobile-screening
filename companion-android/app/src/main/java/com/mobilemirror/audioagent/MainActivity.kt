package com.mobilemirror.audioagent

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var tvStatus: TextView
    private lateinit var tvActiveRoute: TextView
    private lateinit var pbAudioLevel: ProgressBar
    private lateinit var btnToggleCapture: Button

    private var isCapturing = false
    private lateinit var audioDeviceMonitor: AudioDeviceMonitor

    private val projectionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            startAudioService(result.resultCode, result.data!!)
        } else {
            tvStatus.text = "Permission Denied by User"
            tvStatus.setTextColor(0xFFEF4444.toInt())
            isCapturing = false
            updateUiState()
        }
    }

    private val levelReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == AudioCaptureService.ACTION_AUDIO_LEVEL) {
                val peak = intent.getIntExtra(AudioCaptureService.EXTRA_LEVEL_PEAK, 0)
                pbAudioLevel.progress = peak
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        tvStatus = findViewById(R.id.tvStatus)
        tvActiveRoute = findViewById(R.id.tvActiveRoute)
        pbAudioLevel = findViewById(R.id.pbAudioLevel)
        btnToggleCapture = findViewById(R.id.btnToggleCapture)

        audioDeviceMonitor = AudioDeviceMonitor(this) { routeDesc ->
            runOnUiThread {
                tvActiveRoute.text = routeDesc
            }
        }
        audioDeviceMonitor.start()

        btnToggleCapture.setOnClickListener {
            if (isCapturing) {
                stopAudioService()
            } else {
                requestMediaProjection()
            }
        }

        // Register audio level receiver
        val filter = IntentFilter(AudioCaptureService.ACTION_AUDIO_LEVEL)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(levelReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(levelReceiver, filter)
        }

        // Auto-request projection if opened by ADB host
        requestMediaProjection()
    }

    private fun requestMediaProjection() {
        val projectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        projectionLauncher.launch(projectionManager.createScreenCaptureIntent())
    }

    private fun startAudioService(resultCode: Int, data: Intent) {
        val intent = Intent(this, AudioCaptureService::class.java).apply {
            action = AudioCaptureService.ACTION_START
            putExtra(AudioCaptureService.EXTRA_RESULT_CODE, resultCode)
            putExtra(AudioCaptureService.EXTRA_RESULT_DATA, data)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }

        isCapturing = true
        tvStatus.text = getString(R.string.status_capturing)
        tvStatus.setTextColor(0xFF10B981.toInt())
        updateUiState()
    }

    private fun stopAudioService() {
        val intent = Intent(this, AudioCaptureService::class.java).apply {
            action = AudioCaptureService.ACTION_STOP
        }
        startService(intent)

        isCapturing = false
        pbAudioLevel.progress = 0
        tvStatus.text = getString(R.string.status_idle)
        tvStatus.setTextColor(0xFF94A3B8.toInt())
        updateUiState()
    }

    private fun updateUiState() {
        btnToggleCapture.text = if (isCapturing) {
            getString(R.string.btn_stop)
        } else {
            getString(R.string.btn_start)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        audioDeviceMonitor.stop()
        try {
            unregisterReceiver(levelReceiver)
        } catch (_: Exception) {}
    }
}

