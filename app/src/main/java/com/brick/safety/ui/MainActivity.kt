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
import android.os.SystemClock
import android.provider.Settings
import android.view.View
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.brick.safety.databinding.ActivityMainBinding
import com.brick.safety.diagnostics.DiagnosticsActivity
import com.brick.safety.maintenance.DeepOffManager
import com.brick.safety.maintenance.DeprovisionManager
import com.brick.safety.maintenance.DeviceRoleStore
import com.brick.safety.maintenance.MaintenanceEntryGate
import com.brick.safety.managed.ManagedPolicy
import com.brick.safety.network.BrickApi
import com.brick.safety.network.PinPairingApi
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
    private val maintenanceGate = MaintenanceEntryGate()
    private var sosPending = false
    private var sosSecondsLeft = 0

    private val foregroundPermissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        requestBackgroundIfUseful()
        refresh()
    }
    private val backgroundPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { refresh() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (DeprovisionManager.stage(this) != DeprovisionManager.Stage.NONE) {
            startActivity(Intent(this, DiagnosticsActivity::class.java))
            finish()
            return
        }

        b = ActivityMainBinding.inflate(layoutInflater)
        setContentView(b.root)

        b.brickLogo.setOnClickListener {
            if (maintenanceGate.onTap(SystemClock.elapsedRealtime())) {
                startActivity(Intent(this, DiagnosticsActivity::class.java))
            }
        }
        b.scanPairButton.setOnClickListener { scanPairingQr() }
        b.pairButton.setOnClickListener { pair() }
        b.fixButton.setOnClickListener { fixAttention() }
        b.parentPortalButton.setOnClickListener { openParentPortal() }
        b.safeButton.setOnClickListener { queueCheckIn() }
        b.sosButton.setOnClickListener {
            when {
                sosPending -> cancelSosCountdown()
                isSosActive() -> endSos()
                else -> beginSosCountdown()
            }
        }

        if (!DeepOffManager.isActive(this) && DeviceRoleStore.role(this) == DeviceRoleStore.Role.CHILD) {
            runCatching { RecoveryScheduler.ensureScheduled(this) }
            runCatching { ManagedPolicy.apply(this) }
        }
        refresh()
    }

    override fun onResume() {
        super.onResume()
        if (!DeprovisionManager.isPostPurge(this) && ::b.isInitialized) refresh()
    }

    private fun scanPairingQr() {
        if (DeviceRoleStore.role(this) == DeviceRoleStore.Role.PARENT_GUARDIAN) return
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
        if (DeviceRoleStore.role(this) == DeviceRoleStore.Role.PARENT_GUARDIAN) return
        val base = b.serverUrl.text.toString().trim()
        val token = b.pairingToken.text.toString().trim()
        if (!base.startsWith("https://") || token.isBlank()) {
            b.status.text = "● Enter secure server + pairing code"
            return
        }
        b.scanPairButton.isEnabled = false
        b.pairButton.isEnabled = false
        val pinFallback = token.matches(Regex("\\d{8}"))
        b.status.text = if (pinFallback) "● Waiting for parent confirmation…" else "● Pairing…"
        io.execute {
            try {
                val r = if (pinFallback) PinPairingApi.completeFallback(base, token) else BrickApi.completePairing(base, token)
                getSharedPreferences("brick", MODE_PRIVATE).edit()
                    .putString("deviceId", r.deviceId)
                    .putString("apiBase", r.apiBase)
                    .commit()
                DeviceRoleStore.setChildAfterPairing(this)
                runOnUiThread { requestPermissionsAndStart() }
            } catch (_: Exception) {
                runOnUiThread {
                    b.status.text = if (pinFallback) "● Fallback pairing failed or expired" else "● Pairing failed"
                    b.scanPairButton.isEnabled = true
                    b.pairButton.isEnabled = true
                }
            }
        }
    }

    private fun openParentPortal() {
        val base = DeviceRoleStore.parentPortal(this) ?: return
        val uri = Uri.parse(base.trimEnd('/') + "/parent")
        runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
            .onFailure { b.status.text = "● Parent dashboard unavailable" }
    }

    private fun queueCheckIn() {
        if (DeviceRoleStore.role(this) != DeviceRoleStore.Role.CHILD || DeepOffManager.isActive(this)) return
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
        if (DeviceRoleStore.role(this) != DeviceRoleStore.Role.CHILD || DeepOffManager.isActive(this)) return
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
        if (SafetyDispatcher.enqueueSosTransition(this, active = true) == null) {
            b.status.text = "● SOS NOT SAVED — storage error"
            b.safeButton.isEnabled = true
            renderSosState()
            return
        }
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
        if (SafetyDispatcher.enqueueSosTransition(this, active = false) == null) {
            b.status.text = "● SOS ACTIVE — end update NOT SAVED"
            renderSosState()
            return
        }
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

    private fun isSosActive(): Boolean = SafetyDispatcher.isSosActive(this)

    private fun renderSosState() {
        if (sosPending) return
        b.sosButton.text = if (isSosActive()) "END SOS" else "SOS"
        b.sosButton.isEnabled = DeviceRoleStore.role(this) == DeviceRoleStore.Role.CHILD && !DeepOffManager.isActive(this)
    }

    private fun requestPermissionsAndStart() {
        if (DeviceRoleStore.role(this) != DeviceRoleStore.Role.CHILD || DeepOffManager.isActive(this)) return
        val permissions = mutableListOf<String>()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            permissions += Manifest.permission.ACCESS_FINE_LOCATION
            permissions += Manifest.permission.ACCESS_COARSE_LOCATION
        }
        if (Build.VERSION.SDK_INT >= 29 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED) {
            permissions += Manifest.permission.ACTIVITY_RECOGNITION
        }
        if (Build.VERSION.SDK_INT >= 31 && ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) {
            permissions += Manifest.permission.BLUETOOTH_SCAN
        }
        if (Build.VERSION.SDK_INT >= 31 && ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_ADVERTISE) != PackageManager.PERMISSION_GRANTED) {
            permissions += Manifest.permission.BLUETOOTH_ADVERTISE
        }
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.NEARBY_WIFI_DEVICES) != PackageManager.PERMISSION_GRANTED) {
            permissions += Manifest.permission.NEARBY_WIFI_DEVICES
        }
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
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

    private fun locationEnabled(): Boolean =
        runCatching { getSystemService(LocationManager::class.java).isLocationEnabled }.getOrDefault(false)

    private fun backgroundGranted(): Boolean = Build.VERSION.SDK_INT < 29 ||
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun bleAnchorPermissionNeeded(): Boolean {
        if (Build.VERSION.SDK_INT < 31) return false
        val configured = getSharedPreferences("brick", MODE_PRIVATE).getInt("bleAnchorConfigCount", 0) > 0
        return configured && ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED
    }

    private fun attentionReason(): String? {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return "Location permission needs attention"
        }
        if (!locationEnabled()) return "Location needs attention"
        if (!ManagedPolicy.isDeviceOwner(this) && !backgroundGranted()) return "Background location needs attention"
        if (bleAnchorPermissionNeeded()) return "Nearby-device scan permission needs attention"
        return null
    }

    private fun fixAttention() {
        when {
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED -> requestPermissionsAndStart()
            !locationEnabled() -> startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
            !ManagedPolicy.isDeviceOwner(this) && !backgroundGranted() -> startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
            bleAnchorPermissionNeeded() -> requestPermissionsAndStart()
            else -> refresh()
        }
    }

    private fun startServiceNow() {
        if (DeviceRoleStore.role(this) != DeviceRoleStore.Role.CHILD || DeepOffManager.isActive(this)) return
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            runCatching { ServiceControl.ensureTracking(this) }
        }
        b.status.text = if (isSosActive()) "● SOS ACTIVE" else "● Safety active"
        renderSosState()
    }

    private fun refresh() {
        if (DeprovisionManager.isPostPurge(this)) return
        val role = DeviceRoleStore.role(this)
        val deepOff = DeepOffManager.isActive(this)
        val paired = getSharedPreferences("brick", MODE_PRIVATE).contains("deviceId")
        val child = role == DeviceRoleStore.Role.CHILD
        val parent = role == DeviceRoleStore.Role.PARENT_GUARDIAN

        b.parentPortalButton.visibility = if (parent) View.VISIBLE else View.GONE
        b.scanPairButton.visibility = if (!parent && !paired) View.VISIBLE else View.GONE
        b.serverUrl.visibility = if (!parent && !paired) View.VISIBLE else View.GONE
        b.pairingToken.visibility = if (!parent && !paired) View.VISIBLE else View.GONE
        b.pairButton.visibility = if (!parent && !paired) View.VISIBLE else View.GONE
        b.safeButton.visibility = if (child) View.VISIBLE else View.GONE
        b.sosButton.visibility = if (child) View.VISIBLE else View.GONE
        b.fixButton.visibility = View.GONE

        if (deepOff) {
            b.status.text = "● Deep Off"
            b.safeButton.isEnabled = false
            b.sosButton.isEnabled = false
            return
        }
        if (parent) {
            b.status.text = "● Parent/guardian mode"
            return
        }
        if (!paired) {
            b.scanPairButton.isEnabled = true
            b.status.text = "● Setup required — scan QR or enter 8-digit fallback code"
            return
        }

        val attention = attentionReason()
        b.fixButton.visibility = if (attention == null) View.GONE else View.VISIBLE
        if (attention != null) {
            b.status.text = "● $attention"
            renderSosState()
            return
        }

        b.safeButton.isEnabled = true
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
