package com.brick.safety.atlas

import android.content.Context
import android.os.SystemClock
import com.brick.safety.activity.ActivityMode
import com.brick.safety.evidence.*
import com.brick.safety.location.PositionQuality
import com.brick.safety.location.PositionSample
import com.brick.safety.reliability.RecoveryScheduler
import java.util.concurrent.atomic.AtomicBoolean

class Phase4AtlasController(context: Context) {
    companion object {
        private const val COMBINE_WINDOW_MS = 15_000L
        private const val PERSIST_MIN_GAP_MS = 30_000L
    }

    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences("brick", Context.MODE_PRIVATE)
    private val journal = EvidenceJournal(appContext)
    private val atlas = EnvironmentalAtlas()
    private val stateStore = AtlasStateStore(appContext)
    private val started = AtomicBoolean(false)
    private val recentScans = linkedMapOf<String, AtlasScan>()
    @Volatile private var trustedLabel: AtlasTrustedLabel? = null
    @Volatile private var lastPersistElapsedMs = 0L
    @Volatile private var latestCandidates: List<AtlasMatchCandidate> = emptyList()

    private val providers: List<EvidenceProvider> = listOf(
        WifiEnvironmentProvider(appContext) { noteProviderScan("wifi", it) },
        NetworkContextProvider(appContext) { noteProviderScan("network", it) }
    )

    private val sink = EvidenceSink { observation ->
        val deviceId = prefs.getString("deviceId", null)?.takeIf { it.isNotBlank() } ?: return@EvidenceSink false
        val epoch = prefs.getInt("epoch", 1).coerceAtLeast(0)
        val record = runCatching { journal.appendNew(deviceId, epoch, observation) }.getOrNull()
        if (record != null) {
            runCatching { RecoveryScheduler.scheduleEvidenceSoon(appContext, 5) }
            true
        } else false
    }

    init {
        stateStore.restoreInto(atlas)
        publishHealth()
    }

    fun start() {
        if (!started.compareAndSet(false, true)) return
        providers.forEach { provider -> runCatching { provider.start(sink) } }
    }

    fun stop() {
        if (!started.compareAndSet(true, false)) return
        providers.forEach { provider -> runCatching { provider.stop() } }
        persist(force = true)
        journal.close()
    }

    /** Only fresh PRECISE/ASSISTED trusted fused positions are allowed to label Atlas training. */
    fun notePosition(sample: PositionSample) {
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

    private fun persist(force: Boolean) {
        val nowElapsed = SystemClock.elapsedRealtime()
        if (!force && lastPersistElapsedMs > 0L && nowElapsed >= lastPersistElapsedMs && nowElapsed - lastPersistElapsedMs < PERSIST_MIN_GAP_MS) return
        if (stateStore.write(atlas)) lastPersistElapsedMs = nowElapsed
    }

    private fun publishHealth() {
        val status = providerStatuses()
        val best = latestCandidates.firstOrNull()
        prefs.edit()
            .putInt("atlasLabelCount", atlas.labelCount())
            .putInt("atlasSignalCount", atlas.signalCount())
            .putInt("atlasCandidateCount", latestCandidates.size)
            .putBoolean("atlasCandidateAmbiguous", best?.ambiguous ?: false)
            .putFloat("atlasCandidateUncertaintyM", best?.uncertaintyM ?: Float.NaN)
            .putBoolean("atlasWifiProviderHealthy", status[EvidenceProviderId.WIFI_ENVIRONMENT]?.health == ProviderHealth.HEALTHY)
            .putBoolean("atlasNetworkProviderHealthy", status[EvidenceProviderId.NETWORK_CONTEXT]?.health == ProviderHealth.HEALTHY)
            .apply()
    }
}
