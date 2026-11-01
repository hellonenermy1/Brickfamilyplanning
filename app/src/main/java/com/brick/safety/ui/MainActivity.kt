package com.brick.safety.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
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
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
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

        runCatching { RecoveryScheduler.ensureScheduled(this) }
        runCatching { ManagedPolicy.apply(this) }

        b.scanPairButton.setOnClickListener { scanPairingQr() }
        b.pairButton.setOnClickListener { pair() }
        b.fixButton.setOnClickListener { fixAttention() }
        b.safeButton.setOnClickListener { queueCheckIn() }
        b.sosButton.setOnClickListener {
            when {
                sosPending -> cancelSosCountdown()
                isSosActive() -> endSos()
                else -> beginSosCountdown()
            }
        }
        refresh()
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun scanPairingQr() {
        val options = GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .enableAutoZoom()
            .build()
        b.scanPairButton.isEnabled = false
        b.status.text = "● Scan Brick pairing QR"
        GmsBarcodeScanning.getClient(this, options).startScan()
            .addOnSuccessListener { barcode ->
                val raw = barcode.rawValue
                val uri = raw?.let { runCatching { Uri.parse(it) }.getOrNull() }
                val api = uri?.getQueryParameter("api")
                val token = uri?.getQueryParameter("token")
                val valid = uri?.scheme == "brick" && uri.host == "pair" &&
                    !api.isNullOrBlank() && api.startsWith("https://") &&
                    !token.isNullOrBlank() && token.length in 16..256
                if (!valid) {
                    b.status.text = "● Invalid Brick pairing QR"
                    b.scanPairButton.isEnabled = true
                    return@addOnSuccessListener
                }
                b.serverUrl.setText(api)
                b.pairingToken.setText(token)
                b.scanPairButton.isEnabled = true
                pair()
            }
            .addOnCanceledListener {
                b.status.text = "● Setup required"
                b.scanPairButton.isEnabled = true
            }
            .addOnFailureListener {
                b.status.text = "● QR scan unavailable — use manual pairing"
                b.scanPairButton.isEnabled = true
            }
    }

    private fun pair() {
        val base = b.serverUrl.text.toString().trim()
        val token = b.pairingToken.text.toString().trim()
        if (!base.startsWith("https://") || token.isBlank()) { b.status.text = "● Enter secure server + pairing code"; return }
        b.scanPairButton.isEnabled = false
        b.pairButton.isEnabled = false
        b.status.text = "● Pairing…"
        io.execute {
            try {
                val r = BrickApi.completePairing(base, token)
                getSharedPreferences("brick", MODE_PRIVATE).edit()
                    .putString("deviceId", r.deviceId)
                    .putString("apiBase", r.apiBase)
                    .apply()
                runOnUiThread { requestPermissionsAndStart() }
            } catch (_: Exception) {
                runOnUiThread {
                    b.status.text = "● Pairing failed"
                    b.scanPairButton.isEnabled = true
                    b.pairButton.isEnabled = true
                }
            }
        }
    }

    private fun queueCheckIn() {
        if (!getSharedPreferences("brick", MODE_PRIVATE).contains("deviceId")) return
        b.safeButton.isEnabled = false
        if (SafetyDispatcher.enqueue(this, "safe_checkin", priority = SafetyDispatcher.PRIORITY_NORMAL) == null) {
            b.status.text = "● I’m Safe NOT SAVED — storage error"
            b.safeButton.isEnabled = true
            renderSosState()
            return
        }
        b.status.text = "● I’m Safe queued — sending…"
        io.execute {
            SafetyDispatcher.drain(this, 20)
            val pending = SafetyDispatcher.pendingCount(this) > 0
            runOnUiThread {
                b.status.text = if (pending) "● I’m Safe saved — will retry automatically" else "● I’m Safe sent"
                b.safeButton.isEnabled = true
                renderSosState()
            }
        }
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
            activateSos()
            return
        }
        b.status.text = "● SOS in $sosSecondsLeft — tap to cancel"
        b.sosButton.text = "CANCEL SOS"
        sosSecondsLeft--
        mainHandler.postDelayed({ tickSos() }, 1_000L)
    }

    private fun cancelSosCountdown() {
        sosPending = false
        mainHandler.removeCallbacksAndMessages(null)
        b.safeButton.isEnabled = true
        b.status.text = "● SOS cancelled"
        renderSosState()
    }

    private fun activateSos() {
        if (SafetyDispatcher.enqueue(this, "sos_started", priority = SafetyDispatcher.PRIORITY_CRITICAL) == null) {
            b.status.text = "● SOS NOT SAVED — storage error"
            b.safeButton.isEnabled = true
            renderSosState()
            return
        }
        getSharedPreferences("brick", MODE_PRIVATE).edit().putBoolean("sosActive", true).apply()
        runCatching { ServiceControl.ensureTracking(this) }
        b.status.text = "● SOS ACTIVE — sending…"
        b.safeButton.isEnabled = true
        renderSosState()
        io.execute {
            SafetyDispatcher.drain(this, 50)
            val pending = SafetyDispatcher.pendingCount(this) > 0
            runOnUiThread {
                b.status.text = if (pending) "● SOS ACTIVE — alert saved, retrying" else "● SOS ACTIVE — alert sent"
                renderSosState()
            }
        }
    }

    private fun endSos() {
        if (SafetyDispatcher.enqueue(this, "sos_cancelled", priority = SafetyDispatcher.PRIORITY_CRITICAL) == null) {
            b.status.text = "● SOS ACTIVE — end update NOT SAVED"
            renderSosState()
            return
        }
        getSharedPreferences("brick", MODE_PRIVATE).edit().putBoolean("sosActive", false).apply()
        runCatching { ServiceControl.ensureTracking(this) }
        b.status.text = "● Ending SOS…"
        renderSosState()
        io.execute {
            SafetyDispatcher.drain(this, 50)
            val pending = SafetyDispatcher.pendingCount(this) > 0
            runOnUiThread {
                b.status.text = if (pending) "● SOS ended — update saved for retry" else "● SOS ended"
                renderSosState()
            }
        }
    }

    private fun isSosActive(): Boolean = getSharedPreferences("brick", MODE_PRIVATE).getBoolean("sosActive", false)

    private fun renderSosState() {
        if (sosPending) return
        b.sosButton.text = if (isSosActive()) "END SOS" else "SOS"
        b.sosButton.isEnabled = true
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
        if (Build.VERSION.SDK_INT >= 31 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) {
            permissions += Manifest.permission.BLUETOOTH_SCAN
        }
        if (Build.VERSION.SDK_INT >= 31 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_ADVERTISE) != PackageManager.PERMISSION_GRANTED) {
            // Optional Phase 5 private Witness Mesh. Denial degrades Witness only, never Brick Core.
            permissions += Manifest.permission.BLUETOOTH_ADVERTISE
        }
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.NEARBY_WIFI_DEVICES) != PackageManager.PERMISSION_GRANTED) {
            // Optional Wi-Fi RTT capability on supported hardware. Denial never blocks Brick Core.
            permissions += Manifest.permission.NEARBY_WIFI_DEVICES
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
        if (Build.VERSION.SDK_INT >= 29 && Build.VERSION.SDK_INT < 30 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            backgroundPermission.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
        }
    }

    private fun locationEnabled(): Boolean = runCatching {
        getSystemService(LocationManager::class.java).isLocationEnabled
    }.getOrDefault(false)

    private fun backgroundGranted(): Boolean = Build.VERSION.SDK_INT < 29 ||
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun bleAnchorPermissionNeeded(): Boolean {
        if (Build.VERSION.SDK_INT < 31) return false
        val configured = getSharedPreferences("brick", MODE_PRIVATE).getInt("bleAnchorConfigCount", 0) > 0
        return configured && ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED
    }

    private fun attentionReason(): String? {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return "Location permission needs attention"
        if (!locationEnabled()) return "Location needs attention"
        if (!ManagedPolicy.isDeviceOwner(this) && !backgroundGranted()) return "Background location needs attention"
        if (bleAnchorPermissionNeeded()) return "Nearby-device scan permission needs attention"
        return null
    }

    private fun fixAttention() {
        when {
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED -> requestPermissionsAndStart()
            !locationEnabled() -> startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
            !ManagedPolicy.isDeviceOwner(this) && !backgroundGranted() -> startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
            )
            bleAnchorPermissionNeeded() -> requestPermissionsAndStart()
            else -> refresh()
        }
    }

    private fun startServiceNow() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            runCatching { ServiceControl.ensureTracking(this) }
        }
        b.status.text = if (isSosActive()) "● SOS ACTIVE" else "● Safety active"
        renderSosState()
    }

    private fun refresh() {
        val paired = getSharedPreferences("brick", MODE_PRIVATE).contains("deviceId")
        b.scanPairButton.visibility = if (paired) View.GONE else View.VISIBLE
        b.serverUrl.visibility = if (paired) View.GONE else View.VISIBLE
        b.pairingToken.visibility = if (paired) View.GONE else View.VISIBLE
        b.pairButton.visibility = if (paired) View.GONE else View.VISIBLE
        if (!paired) b.scanPairButton.isEnabled = true
        b.safeButton.isEnabled = paired
        b.sosButton.isEnabled = paired

        if (!paired) {
            b.fixButton.visibility = View.GONE
            b.status.text = "● Setup required"
            return
        }

        val attention = attentionReason()
        b.fixButton.visibility = if (attention == null) View.GONE else View.VISIBLE
        if (attention != null) {
            b.status.text = "● $attention"
            renderSosState()
            return
        }

        b.status.text = if (isSosActive()) "● SOS ACTIVE" else "● Safety active"
        renderSosState()
        startServiceNow()
    }

    override fun onDestroy() {
        sosPending = false
        mainHandler.removeCallbacksAndMessages(null)
        io.shutdownNow()
        super.onDestroy()
    }
}
