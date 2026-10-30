package com.brick.safety.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.brick.safety.databinding.ActivityMainBinding
import com.brick.safety.managed.ManagedPolicy
import com.brick.safety.network.BrickApi
import com.brick.safety.reliability.RecoveryScheduler
import com.brick.safety.reliability.SafetyDispatcher
import com.brick.safety.reliability.ServiceControl
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {
    private lateinit var b: ActivityMainBinding
    private val io = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
    private var sosPending = false
    private var sosSecondsLeft = 0

    private val foregroundPermissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        requestBackgroundIfUseful()
        refresh()
    }
    private val backgroundPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { refresh() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityMainBinding.inflate(layoutInflater)
        setContentView(b.root)

        RecoveryScheduler.ensureScheduled(this)
        runCatching { ManagedPolicy.apply(this) }

        b.pairButton.setOnClickListener { pair() }
        b.safeButton.setOnClickListener { queueSafetyEvent("safe_checkin", false) }
        b.sosButton.setOnClickListener { if (sosPending) cancelSos() else beginSosCountdown() }
        refresh()
    }

    private fun pair() {
        val base = b.serverUrl.text.toString().trim()
        val token = b.pairingToken.text.toString().trim()
        if (!base.startsWith("https://") || token.isBlank()) { b.status.text = "● Enter secure server + pairing code"; return }
        b.pairButton.isEnabled = false; b.status.text = "● Pairing…"
        io.execute {
            try {
                val r = BrickApi.completePairing(base, token)
                getSharedPreferences("brick", MODE_PRIVATE).edit()
                    .putString("deviceId", r.deviceId)
                    .putString("apiBase", r.apiBase)
                    .apply()
                runOnUiThread { requestPermissionsAndStart() }
            } catch (_: Exception) {
                runOnUiThread { b.status.text = "● Pairing failed"; b.pairButton.isEnabled = true }
            }
        }
    }

    private fun queueSafetyEvent(kind: String, critical: Boolean) {
        if (!getSharedPreferences("brick", MODE_PRIVATE).contains("deviceId")) return
        b.safeButton.isEnabled = false
        if (critical) b.sosButton.isEnabled = false
        val priority = if (critical) SafetyDispatcher.PRIORITY_CRITICAL else SafetyDispatcher.PRIORITY_NORMAL
        val eventId = SafetyDispatcher.enqueue(this, kind, priority = priority)
        b.status.text = if (critical) "● SOS queued — sending…" else "● I’m Safe queued — sending…"
        io.execute {
            SafetyDispatcher.drain(this, 20)
            val stillPending = SafetyDispatcher.pendingCount(this) > 0
            runOnUiThread {
                b.status.text = when {
                    critical && stillPending -> "● SOS saved — will retry automatically"
                    critical -> "● SOS sent"
                    stillPending -> "● I’m Safe saved — will retry automatically"
                    else -> "● I’m Safe sent"
                }
                b.safeButton.isEnabled = true
                b.sosButton.isEnabled = true
            }
        }
        @Suppress("UNUSED_VARIABLE") val stableEventId = eventId
    }

    private fun beginSosCountdown() {
        if (!getSharedPreferences("brick", MODE_PRIVATE).contains("deviceId")) return
        sosPending = true
        sosSecondsLeft = 3
        b.safeButton.isEnabled = false
        tickSos()
    }

    private fun tickSos() {
        if (!sosPending) return
        if (sosSecondsLeft <= 0) {
            sosPending = false
            b.sosButton.text = "SOS"
            queueSafetyEvent("sos_started", true)
            return
        }
        b.status.text = "● SOS in $sosSecondsLeft — tap SOS to cancel"
        b.sosButton.text = "CANCEL SOS"
        sosSecondsLeft--
        mainHandler.postDelayed({ tickSos() }, 1_000L)
    }

    private fun cancelSos() {
        sosPending = false
        mainHandler.removeCallbacksAndMessages(null)
        b.sosButton.text = "SOS"
        b.safeButton.isEnabled = true
        b.status.text = "● SOS cancelled"
    }

    private fun requestPermissionsAndStart() {
        val permissions = mutableListOf<String>()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            permissions += Manifest.permission.ACCESS_FINE_LOCATION
            permissions += Manifest.permission.ACCESS_COARSE_LOCATION
        }
        if (Build.VERSION.SDK_INT >= 29 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED) {
            permissions += Manifest.permission.ACTIVITY_RECOGNITION
        }
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            permissions += Manifest.permission.POST_NOTIFICATIONS
        }

        if (permissions.isNotEmpty()) foregroundPermissions.launch(permissions.toTypedArray())
        else {
            requestBackgroundIfUseful()
            startServiceNow()
        }
    }

    private fun requestBackgroundIfUseful() {
        if (ManagedPolicy.isDeviceOwner(this)) return
        if (Build.VERSION.SDK_INT >= 29 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            backgroundPermission.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
        }
    }

    private fun startServiceNow() {
        runCatching { ServiceControl.ensureTracking(this) }
        b.status.text = "● Safety active"
    }

    private fun refresh() {
        val paired = getSharedPreferences("brick", MODE_PRIVATE).contains("deviceId")
        val location = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (paired && location) {
            b.status.text = "● Safety active"
            b.serverUrl.visibility = View.GONE; b.pairingToken.visibility = View.GONE; b.pairButton.visibility = View.GONE
            b.safeButton.isEnabled = true; b.sosButton.isEnabled = true
            startServiceNow()
        } else {
            b.status.text = if (paired) "● Location needs attention" else "● Setup required"
        }
    }

    override fun onDestroy() {
        sosPending = false
        mainHandler.removeCallbacksAndMessages(null)
        io.shutdownNow()
        super.onDestroy()
    }
}
