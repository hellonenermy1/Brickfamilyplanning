package com.brick.safety.atlas

import android.content.Context
import android.os.SystemClock
import com.brick.safety.activity.ActivityMode
import com.brick.safety.activity.ActivityState
import com.brick.safety.evidence.*
import com.brick.safety.location.PositionQuality
import com.brick.safety.location.PositionSample
import com.brick.safety.reliability.RecoveryScheduler
import java.util.concurrent.atomic.AtomicBoolean

class Phase4AtlasController(context: Context) {
    companion object {
        private const val COMBINE_WINDOW_MS = 15_000L
        private const val PERSIST_MIN_GAP_MS = 30_000L
        private const val DEGRADED_POSITION_AFTER_MS = 45_000L
        private const val DEEP_STATIONARY_AFTER_MS = 10L * 60L * 1_000L
    }

    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences("brick", Context.MODE_PRIVATE)
    private val positionPrefs = appContext.getSharedPreferences("brick_position", Context.MODE_PRIVATE)
    private val journal = EvidenceJournal(appContext)
    private var atlas = EnvironmentalAtlas()
    private val stateStore = AtlasStateStore(appContext)
    private val started = AtomicBoolean(false)
    private val recentScans = linkedMapOf<String, AtlasScan>()
    @Volatile private var trustedLabel: AtlasTrustedLabel? = null
    @Volatile private var lastPersistElapsedMs = 0L
    @Volatile private var latestCandidates: List<AtlasMatchCandidate> = emptyList()
    @Volatile private var ownerInitialized = false

    private val providers: List<EvidenceProvider> = listOf(
        WifiEnvironmentProvider(appContext) { noteProviderScan("wifi", it) },
        CellularEnvironmentProvider(appContext) { noteProviderScan("cellular", it) },
        NetworkContextProvider(appContext) { noteProviderScan("network", it) }
    )

    private val sink = EvidenceSink { observation ->
        val deviceId = prefs.getString("deviceId", null)?.takeIf { it.isNotBlank() } ?: return@EvidenceSink false
        if (!ensureOwner(deviceId)) return@EvidenceSink false
        val epoch = prefs.getInt("epoch", 1).coerceAtLeast(0)
        val record = runCatching { journal.appendNew(deviceId, epoch, observation) }.getOrNull()
        if (record != null) {
            runCatching { RecoveryScheduler.scheduleEvidenceSoon(appContext, 5) }
            true
        } else false
    }

    fun start() {
        if (!started.compareAndSet(false, true)) return
        providers.forEach { provider -> runCatching { provider.start(sink) } }
        prefs.getString("deviceId", null)?.takeIf { it.isNotBlank() }?.let(::ensureOwner)
        publishHealth()
    }

    fun stop() {
        if (!started.compareAndSet(true, false)) return
        providers.forEach { provider -> runCatching { provider.stop() } }
        persist(force = true)
        journal.close()
    }

    /** Only fresh PRECISE/ASSISTED trusted fused positions are allowed to label Atlas training. */
    fun notePosition(sample: PositionSample) {
        val deviceId = prefs.getString("deviceId", null)?.takeIf { it.isNotBlank() } ?: return
        if (!ensureOwner(deviceId)) return
        val lat = sample.trustedLat ?: return
        val lon = sample.trustedLon ?: return
        if (!sample.rawAccepted) return
        if (sample.quality != PositionQuality.PRECISE && sample.quality != PositionQuality.ASSISTED) return
        if (!lat.isFinite() || lat !in -90.0..90.0 || !lon.isFinite() || lon !in -180.0..180.0) return
        if (!sample.uncertaintyM.isFinite() || sample.uncertaintyM > 50f) return
        val nowElapsed = SystemClock.elapsedRealtime()
        if (sample.elapsedRealtimeMs <= 0L || sample.elapsedRealtimeMs > nowElapsed || nowElapsed - sample.elapsedRealtimeMs > COMBINE_WINDOW_MS) return
        trustedLabel = AtlasTrustedLabel(
            AtlasGrid.labelFor(lat, lon),
            lat,
            lon,
            sample.uncertaintyM,
            sample.elapsedRealtimeMs,
            sample.wallTimeMs
        )
    }

    /**
     * Foreground-service pulse that reuses PositionEngine's accepted persisted anchor instead of
     * opening another location subscription. A reboot resets elapsedRealtime, so stale pre-reboot
     * anchors are rejected rather than used as training labels.
     */
    fun pulseFromForeground() {
        if (!started.get()) start()
        val deviceId = prefs.getString("deviceId", null)?.takeIf { it.isNotBlank() } ?: return
        if (!ensureOwner(deviceId)) return
        refreshTrustedLabelFromPersistedAnchor()

        val nowElapsed = SystemClock.elapsedRealtime()
        val activityRaw = ActivityState.read(appContext)
        val activity = if (activityRaw.updatedElapsedMs in 1..nowElapsed && nowElapsed - activityRaw.updatedElapsedMs <= 120_000L) {
            activityRaw
        } else {
            activityRaw.copy(mode = ActivityMode.UNKNOWN, confidence = 0)
        }
        val anchorElapsed = positionPrefs.getLong("anchorElapsedMs", 0L)
        val degraded = anchorElapsed <= 0L || anchorElapsed > nowElapsed || nowElapsed - anchorElapsed > DEGRADED_POSITION_AFTER_MS
        val deepStationary = activity.mode == ActivityMode.STATIONARY && activity.modeSinceElapsedMs in 1..nowElapsed &&
            nowElapsed - activity.modeSinceElapsedMs >= DEEP_STATIONARY_AFTER_MS
        tick(
            sos = prefs.getBoolean("sosActive", false),
            degradedPosition = degraded,
            activity = activity.mode,
            deepStationary = deepStationary
        )
    }

    fun tick(
        sos: Boolean,
        degradedPosition: Boolean,
        activity: ActivityMode,
        deepStationary: Boolean
    ) {
        if (!started.get()) return
        val state = when {
            sos -> BrickEvidenceState.SOS
            degradedPosition -> BrickEvidenceState.DEGRADED_POSITION
            deepStationary -> BrickEvidenceState.DEEP_STATIONARY
            activity == ActivityMode.STATIONARY -> BrickEvidenceState.STATIONARY
            else -> BrickEvidenceState.MOVING
        }
        providers.forEach { provider ->
            val decision = EvidenceSamplingCoordinator.decision(provider.descriptor.samplingClass, state)
            runCatching { provider.applySampling(decision) }
            runCatching { provider.collectNow() }
        }
        publishHealth()
    }

    fun candidates(): List<AtlasMatchCandidate> = latestCandidates

    fun providerStatuses(): Map<EvidenceProviderId, EvidenceProviderStatus> = providers.associate { it.descriptor.provider to it.status() }

    @Synchronized
    private fun noteProviderScan(source: String, scan: AtlasScan) {
        val nowElapsed = SystemClock.elapsedRealtime()
        if (scan.elapsedRealtimeMs <= 0L || scan.elapsedRealtimeMs > nowElapsed) return
        recentScans[source] = scan
        val keep = recentScans.filterValues { candidate ->
            candidate.elapsedRealtimeMs <= scan.elapsedRealtimeMs && scan.elapsedRealtimeMs - candidate.elapsedRealtimeMs <= COMBINE_WINDOW_MS
        }
        recentScans.keys.retainAll(keep.keys)
        val observations = keep.values.flatMap { it.observations }.take(128)
        if (observations.isEmpty()) return
        val quality = keep.values.map { it.quality }.average().toFloat().coerceIn(0f, 1f)
        val combined = AtlasScan(scan.elapsedRealtimeMs, scan.wallTimeMs, quality, observations)

        val label = trustedLabel
        if (label != null) {
            val elapsedDelta = kotlin.math.abs(combined.elapsedRealtimeMs - label.elapsedRealtimeMs)
            if (elapsedDelta <= COMBINE_WINDOW_MS && runCatching { atlas.observeTrusted(label, combined) }.getOrDefault(false)) {
                persist(force = false)
            }
        }
        latestCandidates = runCatching { atlas.match(combined) }.getOrDefault(emptyList())
        publishHealth()
    }

    private fun refreshTrustedLabelFromPersistedAnchor() {
        val nowElapsed = SystemClock.elapsedRealtime()
        val savedElapsed = positionPrefs.getLong("anchorElapsedMs", 0L)
        if (savedElapsed !in 1..nowElapsed || nowElapsed - savedElapsed > COMBINE_WINDOW_MS) {
            trustedLabel = null
            return
        }
        val accuracy = positionPrefs.getFloat("anchorAccuracyM", Float.NaN)
        if (!accuracy.isFinite() || accuracy > 50f || accuracy < 0f) {
            trustedLabel = null
            return
        }
        val lat = Double.fromBits(positionPrefs.getLong("anchorLatBits", 0L))
        val lon = Double.fromBits(positionPrefs.getLong("anchorLonBits", 0L))
        val wall = positionPrefs.getLong("anchorWallMs", 0L)
        if (!lat.isFinite() || lat !in -90.0..90.0 || !lon.isFinite() || lon !in -180.0..180.0 || wall <= 0L) {
            trustedLabel = null
            return
        }
        val nowWall = System.currentTimeMillis()
        if (wall > nowWall + 2L * 60L * 1_000L || nowWall - wall > 2L * 60L * 1_000L) {
            trustedLabel = null
            return
        }
        trustedLabel = AtlasTrustedLabel(AtlasGrid.labelFor(lat, lon), lat, lon, accuracy, savedElapsed, wall)
    }

    @Synchronized
    private fun ensureOwner(deviceId: String): Boolean {
        val savedOwner = prefs.getString("atlasOwnerDeviceId", null)
        if (ownerInitialized && savedOwner == deviceId) return true
        if (savedOwner == deviceId) {
            ownerInitialized = stateStore.restoreInto(atlas)
            publishHealth()
            return ownerInitialized
        }

        // Missing owner metadata is treated as unowned state. Delete before binding so a restored
        // app backup or previous pairing can never silently donate an Atlas model to another child.
        stateStore.clear()
        atlas = EnvironmentalAtlas()
        trustedLabel = null
        latestCandidates = emptyList()
        recentScans.clear()
        val committed = prefs.edit().putString("atlasOwnerDeviceId", deviceId).commit()
        ownerInitialized = committed
        publishHealth()
        return committed
    }

    private fun persist(force: Boolean) {
        if (!ownerInitialized) return
        val nowElapsed = SystemClock.elapsedRealtime()
        if (!force && lastPersistElapsedMs > 0L && nowElapsed >= lastPersistElapsedMs && nowElapsed - lastPersistElapsedMs < PERSIST_MIN_GAP_MS) return
        if (stateStore.write(atlas)) lastPersistElapsedMs = nowElapsed
    }

    private fun publishHealth() {
        val status = providerStatuses()
        val best = latestCandidates.firstOrNull()
        val wifi = status[EvidenceProviderId.WIFI_ENVIRONMENT]
        val cell = status[EvidenceProviderId.CELLULAR]
        val network = status[EvidenceProviderId.NETWORK_CONTEXT]
        val edit = prefs.edit()
            .putInt("atlasLabelCount", atlas.labelCount())
            .putInt("atlasSignalCount", atlas.signalCount())
            .putInt("atlasCandidateCount", latestCandidates.size)
            .putBoolean("atlasCandidateAmbiguous", best?.ambiguous ?: false)
            .putString("atlasWifiProviderCapability", wifi?.capability?.name ?: ProviderCapability.TEMPORARILY_UNAVAILABLE.name)
            .putString("atlasWifiProviderHealth", wifi?.health?.name ?: ProviderHealth.UNAVAILABLE.name)
            .putString("atlasCellularProviderCapability", cell?.capability?.name ?: ProviderCapability.TEMPORARILY_UNAVAILABLE.name)
            .putString("atlasCellularProviderHealth", cell?.health?.name ?: ProviderHealth.UNAVAILABLE.name)
            .putString("atlasNetworkProviderCapability", network?.capability?.name ?: ProviderCapability.TEMPORARILY_UNAVAILABLE.name)
            .putString("atlasNetworkProviderHealth", network?.health?.name ?: ProviderHealth.UNAVAILABLE.name)
        if (best?.uncertaintyM?.isFinite() == true) edit.putFloat("atlasCandidateUncertaintyM", best.uncertaintyM)
        else edit.remove("atlasCandidateUncertaintyM")
        edit.apply()
    }
}

object Phase4AtlasRuntime {
    @Volatile private var controller: Phase4AtlasController? = null

    fun pulse(context: Context) {
        val current = controller ?: synchronized(this) {
            controller ?: Phase4AtlasController(context.applicationContext).also { controller = it }
        }
        current.pulseFromForeground()
    }
}
