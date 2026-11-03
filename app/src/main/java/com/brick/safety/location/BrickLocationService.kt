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
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.brick.safety.R
import com.brick.safety.activity.ActivityEngine
import com.brick.safety.activity.ActivityMode
import com.brick.safety.atlas.Phase4AtlasRuntime
import com.brick.safety.data.CrashOutbox
import com.brick.safety.data.Journal
import com.brick.safety.data.Protocol
import com.brick.safety.managed.DesiredLocationState
import com.brick.safety.managed.ManagedPolicy
import com.brick.safety.managed.ParentLocationStateStore
import com.brick.safety.network.BrickApi
import com.brick.safety.reliability.CoreUploadRetryPolicy
import com.brick.safety.reliability.DurableLocationDelivery
import com.brick.safety.reliability.HealthEvidence
import com.brick.safety.reliability.RecoveryScheduler
import com.brick.safety.reliability.SafetyDispatcher
import com.google.android.gms.location.*
import com.google.android.gms.tasks.CancellationTokenSource
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
        private const val ATLAS_PULSE_MS = 5_000L
        private const val DEEP_STATIONARY_AFTER_MS = 10 * 60_000L
        private const val BLE_SCAN_NORMAL_MS = 60_000L
        private const val BLE_SCAN_DEGRADED_MS = 30_000L
        private const val LOCATION_V2_BYTES = 90
        private const val LOCATION_BATCH_SIZE = 50
        private const val PREF_UPLOAD_FAILURE_STREAK = "coreUploadFailureStreak"
    }

    private val networkIo = Executors.newSingleThreadExecutor()
    private val healthIo = Executors.newSingleThreadExecutor()
    private val supervisor: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()
    private val fallbackTicker: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()
    private val uploadPumpRunning = AtomicBoolean(false)

    private lateinit var fused: FusedLocationProviderClient
    private lateinit var journal: Journal
    private lateinit var crashOutbox: CrashOutbox
    private lateinit var connectivity: ConnectivityManager
    private lateinit var activityEngine: ActivityEngine
    private lateinit var motionEngine: MotionEngine
    private lateinit var gnssMonitor: GnssQualityMonitor
    private lateinit var positionEngine: PositionEngine
    private lateinit var bleAnchorEngine: BleAnchorEngine

    private val seq = AtomicLong()
    private var epoch: Int = 1
    private var serviceStartedElapsed = 0L
    @Volatile private var lastLocationElapsed = 0L
    @Volatile private var lastFallbackElapsed = 0L
    @Volatile private var lastAckElapsed = 0L
    @Volatile private var lastHealthElapsed = 0L
    @Volatile private var lastBleScanElapsed = 0L
    @Volatile private var lastAtlasPulseElapsed = 0L
    @Volatile private var recoveryCount = 0
    @Volatile private var locationSubscribed = false
    @Volatile private var trackingIntervalMs = 3_000L
    @Volatile private var nextUploadAttemptElapsed = 0L

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            // A genuinely new usable network is a reason to bypass the previous transport's backoff.
            if (networkAvailable()) kickUploadPump(force = true)
            lastHealthElapsed = 0L
        }

        override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
            if (networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) {
                // Capability callbacks can repeat for the same network. They may wake the pump, but
                // must respect an existing transport backoff so callback churn cannot create a storm.
                kickUploadPump()
            }
            lastHealthElapsed = 0L
        }
    }

    override fun onCreate() {
        super.onCreate()
        serviceStartedElapsed = SystemClock.elapsedRealtime()
        fused = LocationServices.getFusedLocationProviderClient(this)
        journal = Journal(this)
        crashOutbox = CrashOutbox(this)
        connectivity = getSystemService(ConnectivityManager::class.java)
        activityEngine = ActivityEngine(this)
        motionEngine = MotionEngine(this)
        gnssMonitor = GnssQualityMonitor(this)
        positionEngine = PositionEngine(this, motionEngine, gnssMonitor)
        bleAnchorEngine = BleAnchorEngine(this) { config -> positionEngine.noteBleAnchor(config) }

        createChannel()
        startForeground(1001, notification(locationNotificationText()))

        val prefs = getSharedPreferences("brick", MODE_PRIVATE)
        epoch = prefs.getInt("epoch", 1)
        seq.set(prefs.getLong("sequence", 0L))
        recoveryCount = prefs.getInt("recoveryCount", 0)

        runCatching { ManagedPolicy.apply(this) }
        runCatching { RecoveryScheduler.ensureScheduled(this) }
        runCatching { connectivity.registerDefaultNetworkCallback(networkCallback) }
        runCatching { activityEngine.start() }
        runCatching { motionEngine.start() }
        runCatching { gnssMonitor.start() }

        if (androidLocationEnabled()) startTracking(desiredIntervalMs())
        if (isSosActive()) requestFreshSosFix()
        checkBatterySafety()
        kickUploadPump(force = true)
        startSupervisor()
        startFallbackTicker()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        runCatching { activityEngine.start() }
        runCatching { motionEngine.start() }
        runCatching { gnssMonitor.start() }
        val desired = desiredIntervalMs()
        if (androidLocationEnabled() && (!locationSubscribed || desired != trackingIntervalMs)) startTracking(desired)
        if (isSosActive()) requestFreshSosFix()
        checkBatterySafety()
        maybeScanBleAnchors(SystemClock.elapsedRealtime())
        // A newly queued safety event should get one prompt attempt even if ordinary history is in
        // transport backoff. Subsequent failures are still bounded by the persistent retry policy.
        val urgentWake = intent?.action == ACTION_ENSURE_RUNNING && SafetyDispatcher.pendingCount(this) > 0
        kickUploadPump(force = urgentWake)
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
        val priority = if (!isSosActive() && activity == ActivityMode.STATIONARY) Priority.PRIORITY_BALANCED_POWER_ACCURACY else Priority.PRIORITY_HIGH_ACCURACY
        val minInterval = if (intervalMs <= 1_000L) 1_000L else max(2_000L, intervalMs / 2)
        val maxDelay = if (intervalMs <= 1_000L) 1_000L else max(intervalMs * 2, 6_000L)
        val req = LocationRequest.Builder(priority, intervalMs)
            .setMinUpdateIntervalMillis(minInterval)
            .setMaxUpdateDelayMillis(maxDelay)
            .build()
        locationSubscribed = false
        val registration = runCatching { fused.requestLocationUpdates(req, callback, mainLooper) }.getOrNull() ?: return
        locationSubscribed = true
        registration.addOnFailureListener { locationSubscribed = false }
    }

    private fun requestFreshSosFix() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return
        val token = CancellationTokenSource()
        val request = runCatching { fused.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, token.token) }.getOrNull() ?: return
        request.addOnSuccessListener { location -> if (location != null && isSosActive()) record(location) }
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
        if (journal.append(epoch, sequence, packet)) kickUploadPump()
    }

    private fun startFallbackTicker() {
        fallbackTicker.scheduleWithFixedDelay({
            val now = SystemClock.elapsedRealtime()
            if (lastAtlasPulseElapsed <= 0L || now < lastAtlasPulseElapsed || now - lastAtlasPulseElapsed >= ATLAS_PULSE_MS) {
                lastAtlasPulseElapsed = now
                runCatching { Phase4AtlasRuntime.pulse(this) }
            }

            val activity = activityEngine.snapshot()
            val threshold = if (isSosActive()) 2_000L else max(8_000L, trackingIntervalMs * 2 + 2_000L)
            if (lastLocationElapsed == 0L || now - lastLocationElapsed < threshold) return@scheduleWithFixedDelay
            val minFallbackGap = when {
                isSosActive() -> 1_000L
                activity.mode == ActivityMode.STATIONARY -> max(60_000L, trackingIntervalMs)
                else -> 5_000L
            }
            if (now - lastFallbackElapsed < minFallbackGap) return@scheduleWithFixedDelay
            val sample = positionEngine.fallback(activity) ?: return@scheduleWithFixedDelay
            lastFallbackElapsed = now
            recordSample(sample)
        }, 2, 1, TimeUnit.SECONDS)
    }

    private fun isV2(p: Journal.Pending): Boolean = p.payload.size == LOCATION_V2_BYTES && p.payload.firstOrNull()?.toInt() == 2

    private fun sendOne(baseUrl: String, deviceId: String, p: Journal.Pending): Boolean {
        val sent = DurableLocationDelivery.sendOne(journal, p) { payload ->
            BrickApi.sendLocation(baseUrl, deviceId, payload)
        }
        if (sent) lastAckElapsed = SystemClock.elapsedRealtime()
        return sent
    }

    private fun sendBatch(baseUrl: String, deviceId: String, batch: List<Journal.Pending>): Boolean {
        if (batch.isEmpty()) return true
        val sent = DurableLocationDelivery.sendBatch(journal, batch) { pending ->
            val uploads = pending.map { BrickApi.LocationUpload(it.epoch, it.seq, it.payload) }
            BrickApi.sendLocationBatch(baseUrl, deviceId, uploads)
        }
        if (sent) lastAckElapsed = SystemClock.elapsedRealtime()
        return sent
    }

    private fun nextV2Batch(pending: List<Journal.Pending>): List<Journal.Pending> {
        val out = ArrayList<Journal.Pending>(pending.size.coerceAtMost(LOCATION_BATCH_SIZE))
        for (p in pending) {
            if (out.size >= LOCATION_BATCH_SIZE || !isV2(p)) break
            val previous = out.lastOrNull()
            if (previous != null && !(p.epoch > previous.epoch || (p.epoch == previous.epoch && p.seq > previous.seq))) break
            out += p
        }
        return out
    }

    private fun previewNewestIfBacklogged(baseUrl: String, deviceId: String, pendingCount: Int) {
        if (pendingCount <= 1) return
        val newest = runCatching { journal.latestPending() }.getOrNull() ?: return
        if (!isV2(newest)) return
        runCatching { BrickApi.sendLiveLocationPreview(baseUrl, deviceId, newest.payload) }
    }

    /** Returns false if crash-report storage or transport failed; history may still make progress. */
    private fun drainCrashReports(baseUrl: String, deviceId: String): Boolean {
        val pending = runCatching { crashOutbox.pending(10) }.getOrElse { return false }
        for (report in pending) {
            val sent = runCatching {
                BrickApi.sendCrashPayload(baseUrl, deviceId, report.payload, report.reportId)
                crashOutbox.ack(report.reportId)
            }.isSuccess
            if (!sent) return false
        }
        return true
    }

    private fun resetCoreUploadFailureStreak() {
        val prefs = getSharedPreferences("brick", MODE_PRIVATE)
        if (prefs.getInt(PREF_UPLOAD_FAILURE_STREAK, 0) != 0) {
            prefs.edit().putInt(PREF_UPLOAD_FAILURE_STREAK, 0).apply()
        }
    }

    private fun nextCoreUploadFailureDelayMs(): Long {
        val prefs = getSharedPreferences("brick", MODE_PRIVATE)
        val next = (prefs.getInt(PREF_UPLOAD_FAILURE_STREAK, 0) + 1).coerceIn(1, 64)
        prefs.edit().putInt(PREF_UPLOAD_FAILURE_STREAK, next).apply()
        return CoreUploadRetryPolicy.delayMs(next)
    }

    private fun kickUploadPump(force: Boolean = false) {
        val now = SystemClock.elapsedRealtime()
        if (!force && nextUploadAttemptElapsed > now) return
        if (!uploadPumpRunning.compareAndSet(false, true)) return

        networkIo.execute {
            var failed = false
            try {
                val prefs = getSharedPreferences("brick", MODE_PRIVATE)
                val deviceId = prefs.getString("deviceId", null) ?: return@execute
                val baseUrl = prefs.getString("apiBase", null) ?: return@execute
                if (!networkAvailable()) return@execute

                SafetyDispatcher.drain(this, 100)
                if (SafetyDispatcher.pendingCount(this) > 0) {
                    failed = true
                    return@execute
                }

                if (!drainCrashReports(baseUrl, deviceId)) failed = true
                val pendingCount = runCatching { journal.stats().pendingCount }.getOrElse {
                    failed = true
                    return@execute
                }
                previewNewestIfBacklogged(baseUrl, deviceId, pendingCount)

                while (true) {
                    val pending = runCatching { journal.nextPending(LOCATION_BATCH_SIZE) }.getOrElse {
                        failed = true
                        return@execute
                    }
                    if (pending.isEmpty()) break
                    val batch = nextV2Batch(pending)
                    val sent = if (batch.isNotEmpty()) sendBatch(baseUrl, deviceId, batch) else sendOne(baseUrl, deviceId, pending.first())
                    if (!sent) {
                        failed = true
                        return@execute
                    }
                }
            } catch (_: Throwable) {
                failed = true
            } finally {
                uploadPumpRunning.set(false)
                val pendingSafety = SafetyDispatcher.pendingCount(this) > 0
                val pendingCrash = runCatching { crashOutbox.pendingCount() > 0 }.getOrDefault(true)
                val pendingCore = runCatching { journal.stats().pendingCount > 0 }.getOrDefault(true)
                val hasPending = pendingSafety || pendingCrash || pendingCore

                if (!hasPending) {
                    nextUploadAttemptElapsed = 0L
                    resetCoreUploadFailureStreak()
                } else if (networkAvailable() && !supervisor.isShutdown) {
                    val delayMs = if (failed) nextCoreUploadFailureDelayMs() else 2_000L
                    nextUploadAttemptElapsed = SystemClock.elapsedRealtime() + delayMs
                    supervisor.schedule({ kickUploadPump() }, delayMs, TimeUnit.MILLISECONDS)
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

    private fun androidLocationEnabled(): Boolean {
        val lm = getSystemService(LocationManager::class.java)
        return runCatching { lm.isLocationEnabled }.getOrDefault(false)
    }

    private fun startSupervisor() {
        supervisor.scheduleWithFixedDelay({
            val now = SystemClock.elapsedRealtime()
            val locationEnabled = androidLocationEnabled()
            val locationState = ParentLocationStateStore.read(this)
            val desiredLocationEnabled = locationState.desired == DesiredLocationState.ON

            if (ManagedPolicy.isDeviceOwner(this) && locationEnabled != desiredLocationEnabled) {
                runCatching { ManagedPolicy.apply(this) }
            }
            if (!locationEnabled && locationSubscribed) {
                runCatching { fused.removeLocationUpdates(callback) }
                locationSubscribed = false
            }

            val desired = desiredIntervalMs()
            if (locationSubscribed && desired != trackingIntervalMs && locationEnabled) startTracking(desired)

            val staleLimit = if (isSosActive()) 8_000L else max(LOCATION_STALE_MS, trackingIntervalMs * 3)
            val stale = lastLocationElapsed > 0L && now - lastLocationElapsed > staleLimit
            val neverProducedFix = lastLocationElapsed == 0L && now - serviceStartedElapsed > FIRST_FIX_TIMEOUT_MS
            if ((!locationSubscribed || stale || neverProducedFix) && locationEnabled) {
                noteRecovery()
                startTracking(desired)
                if (isSosActive()) requestFreshSosFix()
            }

            checkBatterySafety()
            maybeScanBleAnchors(now)
            val pendingCore = runCatching { journal.stats().pendingCount > 0 }.getOrDefault(true)
            if (networkAvailable() && (pendingCore || SafetyDispatcher.pendingCount(this) > 0 || runCatching { crashOutbox.pendingCount() > 0 }.getOrDefault(true))) kickUploadPump()
            if (now - lastHealthElapsed >= HEALTH_INTERVAL_MS) sendHealth(now, locationEnabled)
        }, 10, 15, TimeUnit.SECONDS)
    }

    private fun maybeScanBleAnchors(now: Long, force: Boolean = false) {
        if (!::bleAnchorEngine.isInitialized || bleAnchorEngine.configuredCount() == 0 || !bleAnchorEngine.permissionGranted()) return
        val activity = activityEngine.snapshot().mode
        if (activity == ActivityMode.VEHICLE || activity == ActivityMode.BICYCLE || activity == ActivityMode.RUNNING) return
        val locationDegraded = lastLocationElapsed == 0L || now - lastLocationElapsed > max(15_000L, trackingIntervalMs * 2)
        val interval = if (locationDegraded) BLE_SCAN_DEGRADED_MS else BLE_SCAN_NORMAL_MS
        if (!force && lastBleScanElapsed > 0L && now - lastBleScanElapsed < interval) return
        lastBleScanElapsed = now
        bleAnchorEngine.scanOnce()
    }

    private fun updateBleAnchorConfigs(configs: List<BrickApi.BleAnchorConfig>) {
        val mapped = configs.map {
            BleAnchorEngine.Config(it.geofenceId, it.name, it.beaconUuid, it.latitude, it.longitude, it.radiusM)
        }
        bleAnchorEngine.updateConfigs(mapped)
        if (mapped.isNotEmpty()) maybeScanBleAnchors(SystemClock.elapsedRealtime(), force = true)
    }

    private fun applyLocationCommand(deviceId: String, command: BrickApi.LocationControlCommand?) {
        if (command == null || command.deviceId != deviceId) return
        val desired = if (command.desiredEnabled) DesiredLocationState.ON else DesiredLocationState.OFF
        val changed = runCatching {
            ParentLocationStateStore.applyVerified(
                this,
                desired,
                command.commandId,
                command.nonce,
                command.issuedAtMs,
                command.expiresAtMs
            )
        }.getOrDefault(false)
        if (!changed) return
        runCatching { ManagedPolicy.apply(this) }
        refreshNotification()
        lastHealthElapsed = 0L
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
            if (SafetyDispatcher.enqueue(this, "battery_critical", priority = SafetyDispatcher.PRIORITY_CRITICAL) != null) {
                criticalLatched = true
                lowLatched = true
            }
        } else if (pct <= 15 && !lowLatched) {
            if (SafetyDispatcher.enqueue(this, "battery_low", priority = SafetyDispatcher.PRIORITY_IMPORTANT) != null) {
                lowLatched = true
            }
        }
        if (pct >= 20) lowLatched = false
        if (pct >= 10) criticalLatched = false

        var initialized = prefs.getBoolean("chargingStateInitialized", false)
        var savedChargingState = prefs.getBoolean("lastChargingState", charging)
        if (!initialized) {
            initialized = true
            savedChargingState = charging
        } else if (charging != savedChargingState) {
            if (SafetyDispatcher.enqueue(this, if (charging) "charging_started" else "charging_stopped", priority = SafetyDispatcher.PRIORITY_NORMAL) != null) {
                savedChargingState = charging
            }
        }
        prefs.edit()
            .putBoolean("batteryLowLatched", lowLatched)
            .putBoolean("batteryCriticalLatched", criticalLatched)
            .putBoolean("chargingStateInitialized", initialized)
            .putBoolean("lastChargingState", savedChargingState)
            .apply()
    }

    private fun isSosActive(): Boolean = getSharedPreferences("brick", MODE_PRIVATE).getBoolean("sosActive", false)

    private fun desiredIntervalMs(): Long {
        if (isSosActive()) return 1_000L
        val activity = activityEngine.snapshot()
        return when (activity.mode) {
            ActivityMode.VEHICLE -> 3_000L
            ActivityMode.RUNNING -> 3_000L
            ActivityMode.BICYCLE -> 4_000L
            ActivityMode.WALKING -> 5_000L
            ActivityMode.STATIONARY -> {
                val now = SystemClock.elapsedRealtime()
                if (activity.modeSinceElapsedMs > 0L && activity.modeSinceElapsedMs <= now && now - activity.modeSinceElapsedMs >= DEEP_STATIONARY_AFTER_MS) 120_000L else 60_000L
            }
            ActivityMode.UNKNOWN -> 8_000L
        }
    }

    private fun appVersionName(): String = runCatching {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            packageManager.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0)).versionName
        } else {
            @Suppress("DEPRECATION")
            packageManager.getPackageInfo(packageName, 0).versionName
        }
    }.getOrNull() ?: "unknown"

    private fun sendHealth(now: Long, locationEnabled: Boolean) {
        lastHealthElapsed = now
        val prefs = getSharedPreferences("brick", MODE_PRIVATE)
        val deviceId = prefs.getString("deviceId", null) ?: return
        val baseUrl = prefs.getString("apiBase", null) ?: return
        val stats = runCatching { journal.stats() }.getOrNull()
        val activity = activityEngine.snapshot()
        val gnss = gnssMonitor.snapshot()
        val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val batteryPct = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY).coerceIn(0, 100)
        val locationState = ParentLocationStateStore.read(this)
        val desiredLocationEnabled = locationState.desired == DesiredLocationState.ON
        val health = JSONObject()
            .put("protocol", 1)
            .put("elapsedRealtimeMs", now)
            .put("serviceUptimeMs", now - serviceStartedElapsed)
            .put("locationAgeMs", if (lastLocationElapsed == 0L) JSONObject.NULL else now - lastLocationElapsed)
            .put("ackAgeMs", if (lastAckElapsed == 0L) JSONObject.NULL else now - lastAckElapsed)
            .put("pendingRecords", stats?.pendingCount ?: -1)
            .put("pendingSafetyEvents", SafetyDispatcher.pendingCount(this))
            .put("oldestPendingAgeMs", stats?.oldestPendingMs?.let { System.currentTimeMillis() - it } ?: JSONObject.NULL)
            .put("network", networkKind())
            .put("locationEnabled", locationEnabled)
            .put("locationDesiredEnabled", desiredLocationEnabled)
            .put("locationControlMatches", locationEnabled == desiredLocationEnabled)
            .put("locationControlCommandId", locationState.commandId ?: JSONObject.NULL)
            .put("locationSubscribed", locationSubscribed)
            .put("managed", ManagedPolicy.isDeviceOwner(this))
            .put("recoveryCount", recoveryCount)
            .put("appVersion", appVersionName())
            .put("activityMode", activity.mode.name.lowercase())
            .put("activityConfidence", activity.confidence)
            .put("trackingIntervalMs", trackingIntervalMs)
            .put("gnssUsedInFix", gnss.usedInFix)
            .put("gnssTotal", gnss.totalSatellites)
            .put("batteryPct", batteryPct)
            .put("charging", bm.isCharging)
            .put("sosActive", isSosActive())
            .put("serviceActive", true)

        val evidence = HealthEvidence.collect(this)
        val keys = evidence.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            health.put(key, evidence.get(key))
        }

        healthIo.execute {
            runCatching { BrickApi.sendHealth(baseUrl, deviceId, health) }
                .onSuccess { sync ->
                    updateBleAnchorConfigs(sync.bleAnchors)
                    applyLocationCommand(deviceId, sync.locationCommand)
                }
        }
    }

    private fun networkAvailable(): Boolean {
        val network = connectivity.activeNetwork ?: return false
        val caps = connectivity.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

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

    private fun locationNotificationText(): String = if (androidLocationEnabled()) "GPS on" else "GPS off"

    private fun refreshNotification() {
        getSystemService(NotificationManager::class.java).notify(1001, notification(locationNotificationText()))
    }

    private fun notification(text: String): Notification = NotificationCompat.Builder(this, "brick_tracking")
        .setSmallIcon(android.R.drawable.ic_menu_mylocation)
        .setContentTitle("Brick")
        .setContentText(text)
        .setOngoing(true)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setSilent(true)
        .build()

    override fun onTaskRemoved(rootIntent: Intent?) {
        runCatching { RecoveryScheduler.ensureScheduled(this) }
        runCatching { RecoveryScheduler.scheduleSoon(this, 15) }
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        runCatching { connectivity.unregisterNetworkCallback(networkCallback) }
        runCatching { fused.removeLocationUpdates(callback) }
        runCatching { activityEngine.stop() }
        runCatching { motionEngine.stop() }
        runCatching { gnssMonitor.stop() }
        runCatching { bleAnchorEngine.stop() }
        runCatching { Phase4AtlasRuntime.stop() }
        locationSubscribed = false
        runCatching { RecoveryScheduler.ensureScheduled(this) }
        runCatching { RecoveryScheduler.scheduleSoon(this, 15) }
        fallbackTicker.shutdownNow()
        supervisor.shutdownNow()
        networkIo.shutdownNow()
        healthIo.shutdownNow()
        crashOutbox.close()
        journal.close()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
