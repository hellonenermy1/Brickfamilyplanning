package com.brick.safety.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.View
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.brick.safety.databinding.ActivityMainBinding
import com.brick.safety.location.BrickLocationService
import com.brick.safety.network.BrickApi
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {
    private lateinit var b: ActivityMainBinding
    private val io = Executors.newSingleThreadExecutor()

    private val permission = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { refresh() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityMainBinding.inflate(layoutInflater)
        setContentView(b.root)

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
                getSharedPreferences("brick", MODE_PRIVATE).edit().putString("deviceId", r.deviceId).putString("apiBase", r.apiBase).apply()
                runOnUiThread { requestPermissionsAndStart() }
            } catch (_: Exception) {
                runOnUiThread { b.status.text = "● Pairing failed"; b.pairButton.isEnabled = true }
            }
        }
    }

    private fun requestPermissionsAndStart() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            permission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.POST_NOTIFICATIONS))
        } else startServiceNow()
    }

    private fun startServiceNow() {
        ContextCompat.startForegroundService(this, Intent(this, BrickLocationService::class.java))
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
            b.status.text = if (paired) "● Location permission needed" else "● Setup required"
        }
    }

    override fun onDestroy() { io.shutdownNow(); super.onDestroy() }
}
