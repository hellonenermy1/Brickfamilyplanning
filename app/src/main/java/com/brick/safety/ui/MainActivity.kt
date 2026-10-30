package com.brick.safety.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.View
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.brick.safety.databinding.ActivityMainBinding
import com.brick.safety.managed.ManagedPolicy
import com.brick.safety.network.BrickApi
import com.brick.safety.reliability.RecoveryScheduler
import com.brick.safety.reliability.ServiceControl
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {
    private lateinit var b: ActivityMainBinding
    private val io = Executors.newSingleThreadExecutor()

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
        b.safeButton.setOnClickListener { b.status.text = "● Safe check-in queued" }
        b.sosButton.setOnClickListener { b.status.text = "● SOS UI reserved for Phase 4" }
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

    override fun onDestroy() { io.shutdownNow(); super.onDestroy() }
}
