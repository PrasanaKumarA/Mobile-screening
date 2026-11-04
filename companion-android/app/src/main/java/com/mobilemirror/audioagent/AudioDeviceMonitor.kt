package com.mobilemirror.audioagent

import android.content.Context
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.util.Log

/**
 * Monitors active audio output devices on Android without altering device routing.
 * Provides diagnostics for speaker, Bluetooth, wired 3.5mm, and USB-C output.
 */
class AudioDeviceMonitor(
    private val context: Context,
    private val onDeviceChanged: (String) -> Unit
) {
    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    private val deviceCallback = object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>?) {
            notifyActiveRoute()
        }

        override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>?) {
            notifyActiveRoute()
        }
    }

    fun start() {
        try {
            audioManager.registerAudioDeviceCallback(deviceCallback, null)
            notifyActiveRoute()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register audio device callback: ${e.message}")
        }
    }

    fun stop() {
        try {
            audioManager.unregisterAudioDeviceCallback(deviceCallback)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to unregister callback: ${e.message}")
        }
    }

    fun getCurrentRouteDescription(): String {
        val devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
        for (device in devices) {
            when (device.type) {
                AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
                AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> {
                    val name = if (device.productName.isNotEmpty()) " (${device.productName})" else ""
                    return "Bluetooth Audio$name"
                }
                AudioDeviceInfo.TYPE_WIRED_HEADSET,
                AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> {
                    return "Wired 3.5 mm Headset"
                }
                AudioDeviceInfo.TYPE_USB_DEVICE,
                AudioDeviceInfo.TYPE_USB_HEADSET -> {
                    val name = if (device.productName.isNotEmpty()) " (${device.productName})" else ""
                    return "USB-C Audio / DAC$name"
                }
                AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> {
                    return "Built-in Phone Speaker"
                }
            }
        }
        return "Built-in Speaker / Default Output"
    }

    private fun notifyActiveRoute() {
        val route = getCurrentRouteDescription()
        Log.i(TAG, "Active audio output route: $route")
        onDeviceChanged(route)
    }

    companion object {
        private const val TAG = "AudioDeviceMonitor"
    }
}

