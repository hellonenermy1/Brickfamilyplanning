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
import com.brick.safety.diagnostics.DiagnosticStore
import com.brick.safety.maintenance.DeepOffManager
import com.brick.safety.maintenance.DeviceRoleStore
import com.brick.safety.maintenance.WifiScheduleManager
import com.brick.safety.managed.DesiredLocationState
import com.brick.safety.managed.ManagedPolicy
import com.brick.safety.managed.ParentLocationStateStore
import com.brick.safety.network.BrickApi
import com.brick.safety.network.LiveApi
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
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.max

class BrickLocationService : Service() {
    companion object {
        const val ACTION_ENSURE_RUNNING = "com.brick.safety.action.ENSURE_RUNNING"
        private const val HEALTH_INTERVAL_MS = 30_000L
        private const val ATLAS_PULSE_MS = 5_000L
        private const val DEEP_STATIONARY_AFTER_MS = 10 * 60_000L
        private const val BLE_SCAN_NORMAL_MS = 60_000L
        private const val BLE_SCAN_DEGRADED_MS = 30_000L
        private const val LOCATION_V2_BYTES = 90
        private const val LOCATION_BATCH_SIZE = 50
        private const val REACQUIRE_MIN_RETRY_GAP_MS = 5_000L
        private const val REACQUIRE_RETRY_AFTER_FAILURE_MS = 30_000L
        private const val REACQUIRE_SOS_RETRY_AFTER_FAILURE_MS = 10_000L
        private const val PREF_UPLOAD_FAILURE_STREAK = "coreUploadFailureStreak"
    }

    private data class LiveCandidate(val payload: ByteArray, val trace: LiveApi.Trace)

    private val networkIo = Executors.newSingleThreadExecutor()
    private val healthIo = Executors.newSingleThreadExecutor()
    private val liveIo = Executors.newSingleThreadExecutor()
    private val supervisor: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()
    private val fallbackTicker: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()
    private val uploadPumpRunning = AtomicBoolean(false)
    private val livePumpRunning = AtomicBoolean(false)
    private val latestLive = AtomicReference<LiveCandidate?>(null)
    private val measuredGeneration = AtomicLong(0L)
    private val reacquisitionInProgress = AtomicBoolean(false)

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
    @Volatile private var lastLocationCallbackElapsed = 0L
    @Volatile private var lastFallbackElapsed = 0L
    @Volatile private var lastAckElapsed = 0L
    @Volatile private var lastHealthElapsed = 0L
    @Volatile private var lastBleScanElapsed = 0L
    @Volatile private var lastAtlasPulseElapsed = 0L
    @Volatile private var recoveryCount = 0
    @Volatile private var locationSubscribed = false
    @Volatile private var trackingIntervalMs = 3_000L
    @Volatile private var nextUploadAttemptElapsed = 0L
    @Volatile private var reacquisitionDeadlineElapsed = 0L
    @Volatile private var lastReacquireAttemptElapsed = 0L
    @Volatile private var reacquisitionFailedForGap = false
    @Volatile private var lastObservedActivityMode = ActivityMode.UNKNOWN

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            if (networkAvailable()) {
                kickLivePump()
                kickUploadPump(force = true)
            }
            lastHealthElapsed = 0L
        }

        override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
            if (networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) {
                kickLivePump()
                kickUploadPump()
            }
            lastHealthElapsed = 0L
        }
    }

    override fun onCreate() {
        super.onCreate()
        if (DeepOffManager.isActive(this) || DeviceRoleStore.role(this) != DeviceRoleStore.Role.CHILD) {
            stopSelf()
            return
        }

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
        startForeground(1001, notification())

        val prefs = getSharedPreferences("brick", MODE_PRIVATE)
        epoch = prefs.getInt("epoch", 1)
        seq.set(prefs.getLong("sequence", 0L))
        recoveryCount = prefs.getInt("recoveryCount", 0)

        runCatching { ManagedPolicy.apply(this) }
        runCatching { RecoveryScheduler.ensureScheduled(this) }
        runCatching { WifiScheduleManager.reschedule(this) }
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
        if (DeepOffManager.isActive(this) || DeviceRoleStore.role(this) != DeviceRoleStore.Role.CHILD) {
            stopSelf()
            return START_NOT_STICKY
        }
        runCatching { activityEngine.start() }
        runCatching { motionEngine.start() }
        runCatching { gnssMonitor.start() }
        val desired = desiredIntervalMs()
        if (androidLocationEnabled() && (!locationSubscribed || desired != trackingIntervalMs)) startTracking(desired)
        if (isSosActive()) requestFreshSosFix()
        checkBatterySafety()
        maybeScanBleAnchors(SystemClock.elapsedRealtime())
        val urgentWake = intent?.action == ACTION_ENSURE_RUNNING && SafetyDispatcher.pendingCriticalCount(this) > 0
        kickLivePump()
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
        val priority = if (!isSosActive() && activity == ActivityMode.STATIONARY) {
            Priority.PRIORITY_BALANCED_POWER_ACCURACY
        } else {
            Priority.PRIORITY_HIGH_ACCURACY
        }
        val minInterval = if (intervalMs <= 1_000L) 1_000L else max(2_000L, intervalMs / 2)
        val maxDelay = if (intervalMs <= 1_000L) 1_000L else max(intervalMs * 2, 6_000L)
        val req = LocationRequest.Builder(priority, intervalMs)
            .setMinUpdateIntervalMillis(minInterval)
            .setMaxUpdateDelayMillis(maxDelay)
            .build()
        locationSubscribed = false
        val registration = runCatching { fused.requestLocationUpdates(req, callback, mainLooper) }.getOrNull() ?: return
        registration.addOnSuccessListener { locationSubscribed = true }
        registration.addOnFailureListener { locationSubscribed = false }
    }

    private fun requestFreshSosFix() =
        beginReacquisition(SystemClock.elapsedRealtime(), forceSubscriptionRepair = false, sosPriority = true)

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.locations.forEach(::recordMeasured)
        }
    }

    private fun recordMeasured(location: Location) {
        val now = SystemClock.elapsedRealtime()
        lastLocationCallbackElapsed = now
        val sample = positionEngine.evaluate(location, activityEngine.snapshot())

        if (sample.rawAccepted && sample.source == PositionSource.FUSED &&
            sample.elapsedRealtimeMs > 0L && sample.elapsedRealtimeMs <= now) {
            lastLocationElapsed = sample.elapsedRealtimeMs
            val acceptedAgeMs = now - sample.elapsedRealtimeMs
            if (acceptedAgeMs <= reacquisitionTriggerMs()) {
                measuredGeneration.incrementAndGet()
                reacquisitionInProgress.set(false)
                reacquisitionFailedForGap = false
                reacquisitionDeadlineElapsed = 0L
            }
        }

        recordSample(sample)
    }

    private fun recordSample(sample: PositionSample) {
        val prefs = getSharedPreferences("brick", MODE_PRIVATE)
        val deviceId = prefs.getString("deviceId", null) ?: return
        prefs.getString("apiBase", null) ?: return
        val sequence = seq.incrementAndGet()
        prefs.edit().putLong("sequence", sequence).apply()
        val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val pct = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY).coerceIn(0, 100)
        val packet = Protocol.encodePosition(epoch, sequence, sample, pct, bm.isCharging)
        val persistStart = SystemClock.elapsedRealtime()
        if (!journal.append(epoch, sequence, packet)) return
        val persistedWall = System.currentTimeMillis()
        val persistDuration = (SystemClock.elapsedRealtime() - persistStart).coerceAtLeast(0L)

        // Fast Live is allowed only after durable local persistence. It is independent of backlog,
        // Queue/history work and can coalesce obsolete renders while the Journal retains every point.
        latestLive.set(
            LiveCandidate(
                packet,
                LiveApi.Trace(
                    id = "$epoch:$sequence",
                    sourceWallMs = sample.wallTimeMs,
                    persistedWallMs = persistedWall,
                    persistDurationMs = persistDuration,
                    sendStartWallMs = persistedWall
                )
            )
        )
        kickLivePump()
        kickUploadPump()
    }

    private fun kickLivePump() {
        if (!::connectivity.isInitialized || !networkAvailable()) return
        if (!livePumpRunning.compareAndSet(false, true)) return
        liveIo.execute {
            try {
                while (networkAvailable()) {
                    val candidate = latestLive.getAndSet(null) ?: break
                    val prefs = getSharedPreferences("brick", MODE_PRIVATE)
                    val deviceId = prefs.getString("deviceId", null) ?: break
                    val base = prefs.getString("apiBase", null) ?: break
                    val sendTrace = candidate.trace.copy(sendStartWallMs = System.currentTimeMillis())
                    val result = runCatching { LiveApi.send(base, deviceId, candidate.payload, sendTrace) }
                    if (result.isFailure) {
                        // Preserve newest current candidate for the next validated network wake, but
                        // never overwrite a newer candidate that arrived while this request failed.
                        latestLive.compareAndSet(null, candidate)
                        break
                    }
                    val r = result.getOrThrow()
                    DiagnosticStore.log(
                        this,
                        DiagnosticStore.Severity.INFO,
                        "live",
                        "fast_live_stage",
                        "trace=${sendTrace.id} sourceAgeMs=${(sendTrace.sendStartWallMs - sendTrace.sourceWallMs).coerceAtLeast(0L)} persistMs=${sendTrace.persistDurationMs} backend=${r.backendReceivedAtMs ?: -1} do=${r.doUpdatedAtMs ?: -1} previewed=${r.previewed}"
                    )
                }
            } finally {
                livePumpRunning.set(false)
                if (latestLive.get() != null && networkAvailable()) kickLivePump()
            }
        }
    }

    private fun startFallbackTicker() {
        fallbackTicker.scheduleWithFixedDelay({
            val now = SystemClock.elapsedRealtime()
            if (lastAtlasPulseElapsed <= 0L || now < lastAtlasPulseElapsed || now - lastAtlasPulseElapsed >= ATLAS_PULSE_MS) {
                lastAtlasPulseElapsed = now
                runCatching { Phase4AtlasRuntime.pulse(this) }
            }

            refreshReacquisitionTimeout(now)
            val activity = activityEngine.snapshot()
            val trigger = reacquisitionTriggerMs()
            val gap = lastLocationElapsed == 0L || now < lastLocationElapsed || now - lastLocationElapsed >= trigger
            if (!gap) return@scheduleWithFixedDelay

            if (!reacquisitionInProgress.get() && (!reacquisitionFailedForGap || retryReacquisitionDue(now))) {
                beginReacquisition(now, forceSubscriptionRepair = true, sosPriority = isSosActive())
                return@scheduleWithFixedDelay
            }
            if (reacquisitionInProgress.get() || !reacquisitionFailedForGap) return@scheduleWithFixedDelay

            val minFallbackGap = when {
                isSosActive() -> 1_000L
                activity.mode == ActivityMode.STATIONARY -> max(60_000L, trackingIntervalMs)
                else -> 5_000L
            }
            if (now - lastFallbackElapsed < minFallbackGap) return@scheduleWithFixedDelay

            val generation = measuredGeneration.get()
            val measuredAtStart = lastLocationElapsed
            val sample = positionEngine.fallback(activity) ?: return@scheduleWithFixedDelay
            // A fresh accepted measured fix that arrived while fallback was computing wins. A rejected
            // or old callback does not advance generation and therefore cannot suppress repair.
            if (generation != measuredGeneration.get() || lastLocationElapsed != measuredAtStart ||
                (lastLocationElapsed > 0L && now - lastLocationElapsed < trigger)) return@scheduleWithFixedDelay
            lastFallbackElapsed = now
            recordSample(sample)
        }, 2, 1, TimeUnit.SECONDS)
    }

    private fun reacquisitionTriggerMs(): Long = when {
        isSosActive() -> 4_000L
        trackingIntervalMs >= 60_000L -> trackingIntervalMs * 2 + 10_000L
        else -> max(10_000L, trackingIntervalMs * 2 + 3_000L)
    }

    private fun reacquisitionTimeoutMs(): Long = if (isSosActive()) 6_000L else 10_000L

    private fun retryReacquisitionDue(now: Long): Boolean {
        if (!reacquisitionFailedForGap) return false
        if (lastReacquireAttemptElapsed <= 0L || now < lastReacquireAttemptElapsed) return true
        val retryAfter = if (isSosActive()) REACQUIRE_SOS_RETRY_AFTER_FAILURE_MS else REACQUIRE_RETRY_AFTER_FAILURE_MS
        return now - lastReacquireAttemptElapsed >= retryAfter
    }

    private fun refreshReacquisitionTimeout(now: Long) {
        if (reacquisitionInProgress.get() && reacquisitionDeadlineElapsed > 0L && now >= reacquisitionDeadlineElapsed) {
            reacquisitionInProgress.set(false)
            reacquisitionFailedForGap = true
            DiagnosticStore.log(
                this,
                DiagnosticStore.Severity.WARN,
                "location",
                "reacquisition_timeout",
                "intervalMs=$trackingIntervalMs subscribed=$locationSubscribed"
            )
        }
    }

    private fun beginReacquisition(now: Long, forceSubscriptionRepair: Boolean, sosPriority: Boolean = false) {
        if (reacquisitionInProgress.get()) return
        if (lastReacquireAttemptElapsed > 0L && now >= lastReacquireAttemptElapsed &&
            now - lastReacquireAttemptElapsed < REACQUIRE_MIN_RETRY_GAP_MS) return
        lastReacquireAttemptElapsed = now

        val fine = ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val enabled = androidLocationEnabled()
        if (!fine || !enabled) {
            reacquisitionFailedForGap = true
            reacquisitionInProgress.set(false)
            DiagnosticStore.log(
                this,
                DiagnosticStore.Severity.WARN,
                "location",
                "reacquisition_unavailable",
                "fine=$fine enabled=$enabled service=true subscribed=$locationSubscribed"
            )
            return
        }

        reacquisitionFailedForGap = false
        reacquisitionInProgress.set(true)
        reacquisitionDeadlineElapsed = now + reacquisitionTimeoutMs()
        if (forceSubscriptionRepair || !locationSubscribed) {
            noteRecovery()
            startTracking(desiredIntervalMs())
        }

        val token = CancellationTokenSource()
        val priority = if (sosPriority || activityEngine.snapshot().mode != ActivityMode.STATIONARY) {
            Priority.PRIORITY_HIGH_ACCURACY
        } else {
            Priority.PRIORITY_BALANCED_POWER_ACCURACY
        }
        val request = runCatching { fused.getCurrentLocation(priority, token.token) }.getOrNull()
        if (request == null) {
            reacquisitionDeadlineElapsed = now
            return
        }
        request.addOnSuccessListener { location -> if (location != null) recordMeasured(location) }
        request.addOnFailureListener { reacquisitionDeadlineElapsed = SystemClock.elapsedRealtime() }
    }

    private fun isV2(p: Journal.Pending): Boolean =
        p.payload.size == LOCATION_V2_BYTES && p.payload.firstOrNull()?.toInt() == 2

    private fun sendOne(baseUrl: String, deviceId: String, p: Journal.Pending): Boolean {
        val sent = DurableLocationDelivery.sendOne(journal, p) { payload -> BrickApi.sendLocation(baseUrl, deviceId, payload) }
        if (sent) lastAckElapsed = SystemClock.elapsedRealtime()
        return sent
    }

    private fun sendBatch(baseUrl: String, deviceId: String, batch: List<Journal.Pending>): Boolean {
        if (batch.isEmpty()) return true
        val sent = DurableLocationDelivery.sendBatch(journal, batch) { pending ->
            BrickApi.sendLocationBatch(baseUrl, deviceId, pending.map { BrickApi.LocationUpload(it.epoch, it.seq, it.payload) })
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

                // Priority 1/2: SOS then critical safety. Outbox order is descending, so SOS=200
                // always drains before critical=100. Lower-priority check-ins wait until after Location.
                SafetyDispatcher.drain(this, 100, minPriority = SafetyDispatcher.PRIORITY_CRITICAL)
                if (SafetyDispatcher.pendingCriticalCount(this) > 0) {
                    failed = true
                    return@execute
                }

                // Priority 3: durable Location. Fast Live already runs independently on liveIo.
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
                    val sent = if (batch.isNotEmpty()) {
                        sendBatch(baseUrl, deviceId, batch)
                    } else {
                        sendOne(baseUrl, deviceId, pending.first())
                    }
                    if (!sent) {
                        failed = true
                        return@execute
                    }
                }

                // Lower-priority safety/check-ins are still above evidence/diagnostics, but no longer
                // block current Location. Health has its own immediately scheduled signed path.
                SafetyDispatcher.drain(this, 100, maxPriority = SafetyDispatcher.PRIORITY_CRITICAL - 1)
                if (SystemClock.elapsedRealtime() - lastHealthElapsed >= HEALTH_INTERVAL_MS) {
                    sendHealth(SystemClock.elapsedRealtime(), androidLocationEnabled())
                }

                // Diagnostics are last. Evidence uses its own worker and explicitly yields to safety,
                // Location and pending health state.
                if (!drainCrashReports(baseUrl, deviceId)) failed = true
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
            if (DeepOffManager.isActive(this) || DeviceRoleStore.role(this) != DeviceRoleStore.Role.CHILD) {
                stopSelf()
                return@scheduleWithFixedDelay
            }
            val now = SystemClock.elapsedRealtime()
            val locationEnabled = androidLocationEnabled()
            if (!locationEnabled && locationSubscribed) {
                runCatching { fused.removeLocationUpdates(callback) }
                locationSubscribed = false
            }

            val activity = activityEngine.snapshot().mode
            val desired = desiredIntervalMs()
            val leftSlowStationary = lastObservedActivityMode == ActivityMode.STATIONARY && activity != ActivityMode.STATIONARY
            lastObservedActivityMode = activity
            if (leftSlowStationary && locationEnabled) {
                startTracking(desired)
                beginReacquisition(now, forceSubscriptionRepair = true)
            } else if (locationSubscribed && desired != trackingIntervalMs && locationEnabled) {
                startTracking(desired)
            }

            val trigger = reacquisitionTriggerMs()
            val gap = lastLocationElapsed == 0L || now < lastLocationElapsed || now - lastLocationElapsed >= trigger
            if (gap && locationEnabled && !reacquisitionInProgress.get() &&
                (!reacquisitionFailedForGap || retryReacquisitionDue(now))) {
                beginReacquisition(now, forceSubscriptionRepair = true, sosPriority = isSosActive())
            }

            checkBatterySafety()
            maybeScanBleAnchors(now)
            val pendingCore = runCatching { journal.stats().pendingCount > 0 }.getOrDefault(true)
            if (networkAvailable() &&
                (pendingCore || SafetyDispatcher.pendingCount(this) > 0 ||
                    runCatching { crashOutbox.pendingCount() > 0 }.getOrDefault(true))) {
                kickUploadPump()
            }
            if (now - lastHealthElapsed >= HEALTH_INTERVAL_MS) sendHealth(now, locationEnabled)
        }, 5, 5, TimeUnit.SECONDS)
    }

    private fun maybeScanBleAnchors(now: Long, force: Boolean = false) {
        if (!::bleAnchorEngine.isInitialized || bleAnchorEngine.configuredCount() == 0 || !bleAnchorEngine.permissionGranted()) return
        val activity = activityEngine.snapshot().mode
        if (activity == ActivityMode.VEHICLE || activity == ActivityMode.BICYCLE || activity == ActivityMode.RUNNING) return
        val locationDegraded = lastLocationElapsed == 0L || now - lastLocationElapsed > reacquisitionTriggerMs()
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
        val target = if (command.desiredEnabled) DesiredLocationState.ON else DesiredLocationState.OFF
        val changed = runCatching {
            ParentLocationStateStore.applyVerified(
                this,
                target,
                command.commandId,
                command.nonce,
                command.issuedAtMs,
                command.expiresAtMs
            )
        }.getOrDefault(false)
        if (!changed) return
        runCatching { ManagedPolicy.apply(this) }
        val actual = androidLocationEnabled()
        if (actual) {
            startTracking(desiredIntervalMs())
            beginReacquisition(SystemClock.elapsedRealtime(), forceSubscriptionRepair = true)
        } else if (locationSubscribed) {
            runCatching { fused.removeLocationUpdates(callback) }
            locationSubscribed = false
        }
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
            if (SafetyDispatcher.enqueue(
                    this,
                    if (charging) "charging_started" else "charging_stopped",
                    priority = SafetyDispatcher.PRIORITY_NORMAL
                ) != null) {
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

    private fun isSosActive(): Boolean = SafetyDispatcher.isSosActive(this)

    private fun desiredIntervalMs(): Long {
        if (isSosActive()) return 1_000L
        val prefs = getSharedPreferences("brick", MODE_PRIVATE)
        val liveTrackUntil = prefs.getLong("liveTrackUntilMs", 0L)
        if (liveTrackUntil > System.currentTimeMillis()) return 2_000L
        val activity = activityEngine.snapshot()
        return when (activity.mode) {
            ActivityMode.VEHICLE, ActivityMode.RUNNING -> 3_000L
            ActivityMode.BICYCLE -> 4_000L
            ActivityMode.WALKING -> 5_000L
            ActivityMode.STATIONARY -> {
                val now = SystemClock.elapsedRealtime()
                if (activity.modeSinceElapsedMs > 0L && activity.modeSinceElapsedMs <= now &&
                    now - activity.modeSinceElapsedMs >= DEEP_STATIONARY_AFTER_MS) {
                    120_000L
                } else {
                    60_000L
                }
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
        prefs.edit().putBoolean("healthUploadPending", true).apply()
        val stats = runCatching { journal.stats() }.getOrNull()
        val activity = activityEngine.snapshot()
        val gnss = gnssMonitor.snapshot()
        val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val batteryPct = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY).coerceIn(0, 100)
        val command = ParentLocationStateStore.read(this)
        val wifiResult = WifiScheduleManager.lastResult(this)
        val health = JSONObject()
            .put("protocol", 1)
            .put("elapsedRealtimeMs", now)
            .put("serviceUptimeMs", now - serviceStartedElapsed)
            .put("locationAgeMs", if (lastLocationElapsed == 0L) JSONObject.NULL else now - lastLocationElapsed)
            .put("locationCallbackAgeMs", if (lastLocationCallbackElapsed == 0L) JSONObject.NULL else now - lastLocationCallbackElapsed)
            .put("ackAgeMs", if (lastAckElapsed == 0L) JSONObject.NULL else now - lastAckElapsed)
            .put("pendingRecords", stats?.pendingCount ?: -1)
            .put("pendingSafetyEvents", SafetyDispatcher.pendingCount(this))
            .put("oldestPendingAgeMs", stats?.oldestPendingMs?.let { System.currentTimeMillis() - it } ?: JSONObject.NULL)
            .put("network", networkKind())
            .put("locationEnabled", locationEnabled)
            .put("locationControlCommandId", command.commandId ?: JSONObject.NULL)
            .put("locationControlCommandTarget", command.target?.name?.lowercase() ?: JSONObject.NULL)
            .put("locationControlCommandStatus", command.status.name.lowercase())
            .put("locationControlActualAfter", command.actualAfter ?: JSONObject.NULL)
            .put("locationControlCompletedAtMs", command.completedAtMs.takeIf { it > 0L } ?: JSONObject.NULL)
            .put("locationControlResultDetail", command.resultDetail ?: JSONObject.NULL)
            .put("locationSubscribed", locationSubscribed)
            .put("reacquisitionState", when {
                reacquisitionInProgress.get() -> "refreshing"
                reacquisitionFailedForGap -> "failed_using_fallback"
                else -> "measured"
            })
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
            .put("liveTrackActive", prefs.getLong("liveTrackUntilMs", 0L) > System.currentTimeMillis())
        if (wifiResult != null) {
            health.put(
                "wifiScheduleResult",
                JSONObject()
                    .put("scheduleId", wifiResult.scheduleId)
                    .put("targetEnabled", wifiResult.targetEnabled)
                    .put("actualEnabled", wifiResult.actualEnabled ?: JSONObject.NULL)
                    .put("status", wifiResult.status)
                    .put("attemptedAtMs", wifiResult.attemptedAtMs)
                    .put("detail", wifiResult.detail)
            )
        }

        val evidence = HealthEvidence.collect(this)
        val keys = evidence.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            health.put(key, evidence.get(key))
        }

        healthIo.execute {
            runCatching { BrickApi.sendHealth(baseUrl, deviceId, health) }
                .onSuccess { sync ->
                    prefs.edit().putBoolean("healthUploadPending", false).apply()
                    updateBleAnchorConfigs(sync.bleAnchors)
                    applyLocationCommand(deviceId, sync.locationCommand)
                }
                .onFailure { prefs.edit().putBoolean("healthUploadPending", true).apply() }
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
        nm.createNotificationChannel(
            NotificationChannel("brick_tracking", getString(R.string.channel_name), NotificationManager.IMPORTANCE_LOW).apply {
                description = getString(R.string.channel_description)
            }
        )
    }

    private fun notification(): Notification = NotificationCompat.Builder(this, "brick_tracking")
        .setSmallIcon(android.R.drawable.ic_menu_mylocation)
        .setContentTitle("Brick")
        .setContentText("Safety active")
        .setOngoing(true)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setSilent(true)
        .build()

    override fun onTaskRemoved(rootIntent: Intent?) {
        if (!DeepOffManager.isActive(this) && DeviceRoleStore.role(this) == DeviceRoleStore.Role.CHILD) {
            runCatching { RecoveryScheduler.ensureScheduled(this) }
            runCatching { RecoveryScheduler.scheduleSoon(this, 15) }
        }
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        if (::connectivity.isInitialized) runCatching { connectivity.unregisterNetworkCallback(networkCallback) }
        if (::fused.isInitialized) runCatching { fused.removeLocationUpdates(callback) }
        if (::activityEngine.isInitialized) runCatching { activityEngine.stop() }
        if (::motionEngine.isInitialized) runCatching { motionEngine.stop() }
        if (::gnssMonitor.isInitialized) runCatching { gnssMonitor.stop() }
        if (::bleAnchorEngine.isInitialized) runCatching { bleAnchorEngine.stop() }
        runCatching { Phase4AtlasRuntime.stop() }
        locationSubscribed = false
        if (!DeepOffManager.isActive(this) && DeviceRoleStore.role(this) == DeviceRoleStore.Role.CHILD) {
            runCatching { RecoveryScheduler.ensureScheduled(this) }
            runCatching { RecoveryScheduler.scheduleSoon(this, 15) }
        }
        fallbackTicker.shutdownNow()
        supervisor.shutdownNow()
        networkIo.shutdownNow()
        healthIo.shutdownNow()
        liveIo.shutdownNow()
        if (::crashOutbox.isInitialized) crashOutbox.close()
        if (::journal.isInitialized) journal.close()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
