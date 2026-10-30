package com.brick.safety.location

import android.Manifest
import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.IBinder
import android.os.SystemClock
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.brick.safety.R
import com.brick.safety.data.Journal
import com.brick.safety.data.Protocol
import com.brick.safety.managed.ManagedPolicy
import com.brick.safety.network.BrickApi
import com.brick.safety.reliability.RecoveryScheduler
import com.google.android.gms.location.*
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

class BrickLocationService : Service() {
    companion object {
        const val ACTION_ENSURE_RUNNING = "com.brick.safety.action.ENSURE_RUNNING"
        private const val LOCATION_STALE_MS = 45_000L
        private const val HEALTH_INTERVAL_MS = 30_000L
    }

    private val networkIo = Executors.newSingleThreadExecutor()
    private val healthIo = Executors.newSingleThreadExecutor()
    private val supervisor: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()
    private val uploadPumpRunning = AtomicBoolean(false)
    private lateinit var fused: FusedLocationProviderClient
    private lateinit var journal: Journal
    private val seq = AtomicLong()
    private var epoch: Int = 1
    private var serviceStartedElapsed = 0L
    @Volatile private var lastLocationElapsed = 0L
    @Volatile private var lastAckElapsed = 0L
    @Volatile private var lastHealthElapsed = 0L
    @Volatile private var recoveryCount = 0
    @Volatile private var locationSubscribed = false

    override fun onCreate() {
        super.onCreate()
        serviceStartedElapsed = SystemClock.elapsedRealtime()
        fused = LocationServices.getFusedLocationProviderClient(this)
        journal = Journal(this)
        createChannel()
        startForeground(1001, notification("Safety active"))

        val prefs = getSharedPreferences("brick", MODE_PRIVATE)
        epoch = prefs.getInt("epoch", 1)
        seq.set(prefs.getLong("sequence", 0L))
        recoveryCount = prefs.getInt("recoveryCount", 0)

        runCatching { ManagedPolicy.apply(this) }
        RecoveryScheduler.ensureScheduled(this)
        startTracking()
        kickUploadPump()
        startSupervisor()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!locationSubscribed) startTracking()
        kickUploadPump()
        return START_STICKY
    }

    private fun startTracking() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            locationSubscribed = false
            return
        }
        runCatching { fused.removeLocationUpdates(callback) }
        val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 3_000L)
            .setMinUpdateIntervalMillis(2_000L)
            .setMaxUpdateDelayMillis(6_000L)
            .build()
        fused.requestLocationUpdates(req, callback, mainLooper)
            .addOnSuccessListener { locationSubscribed = true }
            .addOnFailureListener { locationSubscribed = false }
    }

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            lastLocationElapsed = SystemClock.elapsedRealtime()
            result.locations.forEach(::record)
        }
    }

    private fun record(location: Location) {
        val prefs = getSharedPreferences("brick", MODE_PRIVATE)
        if (prefs.getString("deviceId", null).isNullOrBlank() || prefs.getString("apiBase", null).isNullOrBlank()) return
        val sequence = seq.incrementAndGet()
        prefs.edit().putLong("sequence", sequence).apply()
        val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val pct = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY).coerceIn(0, 100)
        val packet = Protocol.encodeLive(epoch, sequence, location, pct, bm.isCharging)
        journal.append(epoch, sequence, packet)
        kickUploadPump()
    }

    private fun sendOne(baseUrl: String, deviceId: String, p: Journal.Pending): Boolean {
        return try {
            val ack = BrickApi.sendLocation(baseUrl, deviceId, p.payload)
            if (ack != p.seq) throw IllegalStateException("ACK mismatch: expected ${p.seq}, got $ack")
            journal.ackExact(p.epoch, p.seq)
            lastAckElapsed = SystemClock.elapsedRealtime()
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun kickUploadPump() {
        if (!uploadPumpRunning.compareAndSet(false, true)) return
        networkIo.execute {
            try {
                val prefs = getSharedPreferences("brick", MODE_PRIVATE)
                val deviceId = prefs.getString("deviceId", null) ?: return@execute
                val baseUrl = prefs.getString("apiBase", null) ?: return@execute

                // Reconnect behavior: restore "now" first, then fill historical gaps.
                val newest = journal.latestPending()
                if (newest != null && !sendOne(baseUrl, deviceId, newest)) return@execute

                while (true) {
                    val pending = journal.nextPending(100)
                    if (pending.isEmpty()) break
                    for (p in pending) if (!sendOne(baseUrl, deviceId, p)) return@execute
                }
            } finally {
                uploadPumpRunning.set(false)
                if (journal.stats().pendingCount > 0 && networkAvailable()) {
                    supervisor.schedule({ kickUploadPump() }, 2, TimeUnit.SECONDS)
                }
            }
        }
    }

    private fun startSupervisor() {
        supervisor.scheduleWithFixedDelay({
            val now = SystemClock.elapsedRealtime()
            val lm = getSystemService(LocationManager::class.java)
            val locationEnabled = runCatching { lm.isLocationEnabled }.getOrDefault(false)

            if (ManagedPolicy.isDeviceOwner(this) && !locationEnabled) {
                runCatching { ManagedPolicy.apply(this) }
            }

            val stale = lastLocationElapsed > 0L && now - lastLocationElapsed > LOCATION_STALE_MS
            if ((!locationSubscribed || stale) && locationEnabled) {
                recoveryCount += 1
                getSharedPreferences("brick", MODE_PRIVATE).edit()
                    .putInt("recoveryCount", recoveryCount)
                    .putLong("lastSelfRecoveryWallMs", System.currentTimeMillis())
                    .apply()
                startTracking()
            }

            if (networkAvailable() && journal.stats().pendingCount > 0) kickUploadPump()
            if (now - lastHealthElapsed >= HEALTH_INTERVAL_MS) sendHealth(now, locationEnabled)
        }, 10, 15, TimeUnit.SECONDS)
    }

    private fun sendHealth(now: Long, locationEnabled: Boolean) {
        lastHealthElapsed = now
        val prefs = getSharedPreferences("brick", MODE_PRIVATE)
        val deviceId = prefs.getString("deviceId", null) ?: return
        val baseUrl = prefs.getString("apiBase", null) ?: return
        val stats = journal.stats()
        val health = JSONObject()
            .put("protocol", 1)
            .put("elapsedRealtimeMs", now)
            .put("serviceUptimeMs", now - serviceStartedElapsed)
            .put("locationAgeMs", if (lastLocationElapsed == 0L) JSONObject.NULL else now - lastLocationElapsed)
            .put("ackAgeMs", if (lastAckElapsed == 0L) JSONObject.NULL else now - lastAckElapsed)
            .put("pendingRecords", stats.pendingCount)
            .put("oldestPendingAgeMs", stats.oldestPendingMs?.let { System.currentTimeMillis() - it } ?: JSONObject.NULL)
            .put("network", networkKind())
            .put("locationEnabled", locationEnabled)
            .put("locationSubscribed", locationSubscribed)
            .put("managed", ManagedPolicy.isDeviceOwner(this))
            .put("recoveryCount", recoveryCount)
            .put("appVersion", "0.2.0-phase2")

        healthIo.execute { runCatching { BrickApi.sendHealth(baseUrl, deviceId, health) } }
    }

    private fun networkAvailable(): Boolean = networkKind() != "offline"

    private fun networkKind(): String {
        val cm = getSystemService(ConnectivityManager::class.java)
        val network = cm.activeNetwork ?: return "offline"
        val caps = cm.getNetworkCapabilities(network) ?: return "offline"
        return when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "mobile"
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) -> "other"
            else -> "offline"
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

    override fun onTaskRemoved(rootIntent: Intent?) {
        RecoveryScheduler.ensureScheduled(this)
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        runCatching { fused.removeLocationUpdates(callback) }
        locationSubscribed = false
        RecoveryScheduler.ensureScheduled(this)
        supervisor.shutdownNow()
        networkIo.shutdownNow()
        healthIo.shutdownNow()
        journal.close()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
