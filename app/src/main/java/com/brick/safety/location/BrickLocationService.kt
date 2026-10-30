package com.brick.safety.location

import android.Manifest
import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.IBinder
import android.os.SystemClock
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.brick.safety.R
import com.brick.safety.activity.ActivityEngine
import com.brick.safety.activity.ActivityMode
import com.brick.safety.data.Journal
import com.brick.safety.data.Protocol
import com.brick.safety.managed.ManagedPolicy
import com.brick.safety.network.BrickApi
import com.brick.safety.reliability.RecoveryScheduler
import com.brick.safety.reliability.SafetyDispatcher
import com.google.android.gms.location.*
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.max

class BrickLocationService : Service() {
    companion object {
        const val ACTION_ENSURE_RUNNING = "com.brick.safety.action.ENSURE_RUNNING"
        private const val LOCATION_STALE_MS = 45_000L
        private const val FIRST_FIX_TIMEOUT_MS = 60_000L
        private const val HEALTH_INTERVAL_MS = 30_000L
    }

    private val networkIo = Executors.newSingleThreadExecutor()
    private val healthIo = Executors.newSingleThreadExecutor()
    private val supervisor: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()
    private val fallbackTicker: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()
    private val uploadPumpRunning = AtomicBoolean(false)

    private lateinit var fused: FusedLocationProviderClient
    private lateinit var journal: Journal
    private lateinit var connectivity: ConnectivityManager
    private lateinit var activityEngine: ActivityEngine
    private lateinit var motionEngine: MotionEngine
    private lateinit var gnssMonitor: GnssQualityMonitor
    private lateinit var positionEngine: PositionEngine

    private val seq = AtomicLong()
    private var epoch: Int = 1
    private var serviceStartedElapsed = 0L
    @Volatile private var lastLocationElapsed = 0L
    @Volatile private var lastFallbackElapsed = 0L
    @Volatile private var lastAckElapsed = 0L
    @Volatile private var lastHealthElapsed = 0L
    @Volatile private var recoveryCount = 0
    @Volatile private var locationSubscribed = false
    @Volatile private var trackingIntervalMs = 3_000L

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            kickUploadPump()
            lastHealthElapsed = 0L
        }

        override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
            lastHealthElapsed = 0L
        }
    }

    override fun onCreate() {
        super.onCreate()
        serviceStartedElapsed = SystemClock.elapsedRealtime()
        fused = LocationServices.getFusedLocationProviderClient(this)
        journal = Journal(this)
        connectivity = getSystemService(ConnectivityManager::class.java)
        activityEngine = ActivityEngine(this)
        motionEngine = MotionEngine(this)
        gnssMonitor = GnssQualityMonitor(this)
        positionEngine = PositionEngine(this, motionEngine, gnssMonitor)

        createChannel()
        startForeground(1001, notification("Safety active"))

        val prefs = getSharedPreferences("brick", MODE_PRIVATE)
        epoch = prefs.getInt("epoch", 1)
        seq.set(prefs.getLong("sequence", 0L))
        recoveryCount = prefs.getInt("recoveryCount", 0)

        runCatching { ManagedPolicy.apply(this) }
        RecoveryScheduler.ensureScheduled(this)
        runCatching { connectivity.registerDefaultNetworkCallback(networkCallback) }
        runCatching { activityEngine.start() }
        runCatching { motionEngine.start() }
        runCatching { gnssMonitor.start() }

        startTracking(desiredIntervalMs())
        checkBatterySafety()
        kickUploadPump()
        startSupervisor()
        startFallbackTicker()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        runCatching { activityEngine.start() }
        runCatching { motionEngine.start() }
        runCatching { gnssMonitor.start() }
        if (!locationSubscribed) startTracking(desiredIntervalMs())
        checkBatterySafety()
        kickUploadPump()
        return START_STICKY
    }

    private fun startTracking(intervalMs: Long) {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            locationSubscribed = false
            return
        }
        runCatching { fused.removeLocationUpdates(callback) }
        trackingIntervalMs = intervalMs
        val activity = activityEngine.snapshot().mode
        val priority = if (activity == ActivityMode.STATIONARY) Priority.PRIORITY_BALANCED_POWER_ACCURACY else Priority.PRIORITY_HIGH_ACCURACY
        val req = LocationRequest.Builder(priority, intervalMs)
            .setMinUpdateIntervalMillis(max(2_000L, intervalMs / 2))
            .setMaxUpdateDelayMillis(max(intervalMs * 2, 6_000L))
            .build()
        locationSubscribed = true
        fused.requestLocationUpdates(req, callback, mainLooper)
            .addOnFailureListener { locationSubscribed = false }
    }

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            lastLocationElapsed = SystemClock.elapsedRealtime()
            result.locations.forEach(::record)
        }
    }

    private fun record(location: Location) {
        val sample = positionEngine.evaluate(location, activityEngine.snapshot())
        recordSample(sample)
    }

    private fun recordSample(sample: PositionSample) {
        val prefs = getSharedPreferences("brick", MODE_PRIVATE)
        if (prefs.getString("deviceId", null).isNullOrBlank() || prefs.getString("apiBase", null).isNullOrBlank()) return
        val sequence = seq.incrementAndGet()
        prefs.edit().putLong("sequence", sequence).apply()
        val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val pct = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY).coerceIn(0, 100)
        val packet = Protocol.encodePosition(epoch, sequence, sample, pct, bm.isCharging)
        journal.append(epoch, sequence, packet)
        kickUploadPump()
    }

    private fun startFallbackTicker() {
        fallbackTicker.scheduleWithFixedDelay({
            val now = SystemClock.elapsedRealtime()
            val threshold = max(8_000L, trackingIntervalMs * 2 + 2_000L)
            if (lastLocationElapsed == 0L || now - lastLocationElapsed < threshold) return@scheduleWithFixedDelay
            if (now - lastFallbackElapsed < 5_000L) return@scheduleWithFixedDelay
            val sample = positionEngine.fallback(activityEngine.snapshot()) ?: return@scheduleWithFixedDelay
            lastFallbackElapsed = now
            recordSample(sample)
        }, 5, 3, TimeUnit.SECONDS)
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
                if (!networkAvailable()) return@execute

                SafetyDispatcher.drain(this, 100)
                if (SafetyDispatcher.pendingCount(this) > 0) return@execute

                val newest = journal.latestPending()
                if (newest != null && !sendOne(baseUrl, deviceId, newest)) return@execute

                while (true) {
                    val pending = journal.nextPending(100)
                    if (pending.isEmpty()) break
                    for (p in pending) if (!sendOne(baseUrl, deviceId, p)) return@execute
                }
            } finally {
                uploadPumpRunning.set(false)
                val pendingSafety = SafetyDispatcher.pendingCount(this) > 0
                if ((pendingSafety || journal.stats().pendingCount > 0) && networkAvailable() && !supervisor.isShutdown) {
                    supervisor.schedule({ kickUploadPump() }, 2, TimeUnit.SECONDS)
                }
            }
        }
    }

    private fun noteRecovery() {
        recoveryCount += 1
        getSharedPreferences("brick", MODE_PRIVATE).edit()
            .putInt("recoveryCount", recoveryCount)
            .putLong("lastSelfRecoveryWallMs", System.currentTimeMillis())
            .apply()
    }

    private fun startSupervisor() {
        supervisor.scheduleWithFixedDelay({
            val now = SystemClock.elapsedRealtime()
            val lm = getSystemService(LocationManager::class.java)
            val locationEnabled = runCatching { lm.isLocationEnabled }.getOrDefault(false)

            if (ManagedPolicy.isDeviceOwner(this) && !locationEnabled) {
                runCatching { ManagedPolicy.apply(this) }
            }

            val desired = desiredIntervalMs()
            if (locationSubscribed && desired != trackingIntervalMs && locationEnabled) {
                startTracking(desired)
            }

            val stale = lastLocationElapsed > 0L && now - lastLocationElapsed > max(LOCATION_STALE_MS, trackingIntervalMs * 3)
            val neverProducedFix = lastLocationElapsed == 0L && now - serviceStartedElapsed > FIRST_FIX_TIMEOUT_MS
            if ((!locationSubscribed || stale || neverProducedFix) && locationEnabled) {
                noteRecovery()
                startTracking(desired)
            }

            checkBatterySafety()
            if (networkAvailable() && (journal.stats().pendingCount > 0 || SafetyDispatcher.pendingCount(this) > 0)) kickUploadPump()
            if (now - lastHealthElapsed >= HEALTH_INTERVAL_MS) sendHealth(now, locationEnabled)
        }, 10, 15, TimeUnit.SECONDS)
    }

    private fun checkBatterySafety() {
        val prefs = getSharedPreferences("brick", MODE_PRIVATE)
        if (!prefs.contains("deviceId")) return
        val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val pct = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY).coerceIn(0, 100)
        val charging = bm.isCharging
        var lowLatched = prefs.getBoolean("batteryLowLatched", false)
        var criticalLatched = prefs.getBoolean("batteryCriticalLatched", false)

        if (pct <= 5 && !criticalLatched) {
            SafetyDispatcher.enqueue(this, "battery_critical", priority = SafetyDispatcher.PRIORITY_CRITICAL)
            criticalLatched = true
            lowLatched = true
        } else if (pct <= 15 && !lowLatched) {
            SafetyDispatcher.enqueue(this, "battery_low", priority = SafetyDispatcher.PRIORITY_IMPORTANT)
            lowLatched = true
        }
        if (pct >= 20) lowLatched = false
        if (pct >= 10) criticalLatched = false

        val initialized = prefs.getBoolean("chargingStateInitialized", false)
        val previousCharging = prefs.getBoolean("lastChargingState", charging)
        if (initialized && charging != previousCharging) {
            SafetyDispatcher.enqueue(
                this,
                if (charging) "charging_started" else "charging_stopped",
                priority = SafetyDispatcher.PRIORITY_NORMAL
            )
        }

        prefs.edit()
            .putBoolean("batteryLowLatched", lowLatched)
            .putBoolean("batteryCriticalLatched", criticalLatched)
            .putBoolean("chargingStateInitialized", true)
            .putBoolean("lastChargingState", charging)
            .apply()
    }

    private fun desiredIntervalMs(): Long = when (activityEngine.snapshot().mode) {
        ActivityMode.VEHICLE -> 3_000L
        ActivityMode.RUNNING -> 3_000L
        ActivityMode.BICYCLE -> 4_000L
        ActivityMode.WALKING -> 5_000L
        ActivityMode.STATIONARY -> 60_000L
        ActivityMode.UNKNOWN -> 8_000L
    }

    private fun sendHealth(now: Long, locationEnabled: Boolean) {
        lastHealthElapsed = now
        val prefs = getSharedPreferences("brick", MODE_PRIVATE)
        val deviceId = prefs.getString("deviceId", null) ?: return
        val baseUrl = prefs.getString("apiBase", null) ?: return
        val stats = journal.stats()
        val activity = activityEngine.snapshot()
        val gnss = gnssMonitor.snapshot()
        val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val batteryPct = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY).coerceIn(0, 100)
        val health = JSONObject()
            .put("protocol", 1)
            .put("elapsedRealtimeMs", now)
            .put("serviceUptimeMs", now - serviceStartedElapsed)
            .put("locationAgeMs", if (lastLocationElapsed == 0L) JSONObject.NULL else now - lastLocationElapsed)
            .put("ackAgeMs", if (lastAckElapsed == 0L) JSONObject.NULL else now - lastAckElapsed)
            .put("pendingRecords", stats.pendingCount)
            .put("pendingSafetyEvents", SafetyDispatcher.pendingCount(this))
            .put("oldestPendingAgeMs", stats.oldestPendingMs?.let { System.currentTimeMillis() - it } ?: JSONObject.NULL)
            .put("network", networkKind())
            .put("locationEnabled", locationEnabled)
            .put("locationSubscribed", locationSubscribed)
            .put("managed", ManagedPolicy.isDeviceOwner(this))
            .put("recoveryCount", recoveryCount)
            .put("appVersion", "0.4.0-phase4")
            .put("activityMode", activity.mode.name.lowercase())
            .put("activityConfidence", activity.confidence)
            .put("trackingIntervalMs", trackingIntervalMs)
            .put("gnssUsedInFix", gnss.usedInFix)
            .put("gnssTotal", gnss.totalSatellites)
            .put("batteryPct", batteryPct)
            .put("charging", bm.isCharging)

        healthIo.execute { runCatching { BrickApi.sendHealth(baseUrl, deviceId, health) } }
    }

    private fun networkAvailable(): Boolean = networkKind() != "offline"

    private fun networkKind(): String {
        val network = connectivity.activeNetwork ?: return "offline"
        val caps = connectivity.getNetworkCapabilities(network) ?: return "offline"
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
        RecoveryScheduler.scheduleSoon(this, 15)
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        runCatching { connectivity.unregisterNetworkCallback(networkCallback) }
        runCatching { fused.removeLocationUpdates(callback) }
        runCatching { activityEngine.stop() }
        runCatching { motionEngine.stop() }
        runCatching { gnssMonitor.stop() }
        locationSubscribed = false
        RecoveryScheduler.ensureScheduled(this)
        RecoveryScheduler.scheduleSoon(this, 15)
        fallbackTicker.shutdownNow()
        supervisor.shutdownNow()
        networkIo.shutdownNow()
        healthIo.shutdownNow()
        journal.close()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
