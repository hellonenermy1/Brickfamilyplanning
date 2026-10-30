package com.brick.safety.location

import android.Manifest
import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.os.BatteryManager
import android.os.IBinder
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.brick.safety.R
import com.brick.safety.data.Journal
import com.brick.safety.data.Protocol
import com.brick.safety.network.BrickApi
import com.google.android.gms.location.*
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicLong

class BrickLocationService : Service() {
    private val io = Executors.newSingleThreadExecutor()
    private lateinit var fused: FusedLocationProviderClient
    private lateinit var journal: Journal
    private val seq = AtomicLong()
    private var epoch: Int = 1

    override fun onCreate() {
        super.onCreate()
        fused = LocationServices.getFusedLocationProviderClient(this)
        journal = Journal(this)
        createChannel()
        startForeground(1001, notification("Safety active"))
        val prefs = getSharedPreferences("brick", MODE_PRIVATE)
        epoch = prefs.getInt("epoch", 1)
        seq.set(prefs.getLong("sequence", 0L))
        startTracking()
        flushPending()
    }

    private fun startTracking() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            stopSelf(); return
        }
        val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 3_000L)
            .setMinUpdateIntervalMillis(2_000L)
            .setMaxUpdateDelayMillis(6_000L)
            .build()
        fused.requestLocationUpdates(req, callback, mainLooper)
    }

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.locations.forEach(::record)
        }
    }

    private fun record(location: Location) {
        val prefs = getSharedPreferences("brick", MODE_PRIVATE)
        val deviceId = prefs.getString("deviceId", null) ?: return
        val baseUrl = prefs.getString("apiBase", null) ?: return
        val sequence = seq.incrementAndGet()
        prefs.edit().putLong("sequence", sequence).apply()
        val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val pct = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY).coerceIn(0, 100)
        val charging = bm.isCharging
        val packet = Protocol.encodeLive(epoch, sequence, location, pct, charging)
        journal.append(epoch, sequence, packet)
        io.execute {
            try {
                val ack = BrickApi.sendLocation(baseUrl, deviceId, packet)
                journal.ack(epoch, ack)
            } catch (_: Exception) {
                // Keep encrypted journal entry. Phase 2 adds the long-running self-healing supervisor.
            }
        }
    }

    private fun flushPending() {
        val prefs = getSharedPreferences("brick", MODE_PRIVATE)
        val deviceId = prefs.getString("deviceId", null) ?: return
        val baseUrl = prefs.getString("apiBase", null) ?: return
        io.execute {
            journal.nextPending(100).forEach { p ->
                try { journal.ack(p.epoch, BrickApi.sendLocation(baseUrl, deviceId, p.payload)) }
                catch (_: Exception) { return@execute }
            }
        }
    }

    private fun createChannel() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("brick_tracking", getString(R.string.channel_name), NotificationManager.IMPORTANCE_LOW).apply {
            description = getString(R.string.channel_description)
        })
    }

    private fun notification(text: String): Notification = NotificationCompat.Builder(this, "brick_tracking")
        .setSmallIcon(android.R.drawable.ic_menu_mylocation)
        .setContentTitle("Brick")
        .setContentText(text)
        .setOngoing(true)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .build()

    override fun onDestroy() { fused.removeLocationUpdates(callback); io.shutdownNow(); super.onDestroy() }
    override fun onBind(intent: Intent?): IBinder? = null
}
