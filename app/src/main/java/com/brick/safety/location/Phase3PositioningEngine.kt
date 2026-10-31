package com.brick.safety.location

import android.content.Context
import android.os.SystemClock
import com.brick.safety.activity.ActivityMode
import com.brick.safety.activity.ActivitySnapshot
import kotlin.math.max

data class Phase3FallbackEstimate(
    val position: ParticleEstimate,
    val stepDelta: Int,
    val zeroVelocityApplied: Boolean
)

data class Phase3PositioningHealth(
    val initialized: Boolean,
    val routeSegments: Int,
    val privateMapSegments: Int,
    val learnedRouteSegments: Int,
    val uncertaintyM: Float?,
    val ageSinceTrustedMs: Long?,
    val routeConstrained: Boolean,
    val stateHealthy: Boolean
)

/**
 * Android coordinator around the pure Phase 3 motion/route/particle models.
 * Trusted fused fixes train/re-anchor it; degraded periods only produce an uncertainty-bounded estimate.
 */
class Phase3PositioningEngine(
    context: Context,
    private val motion: MotionEngine
) {
    private data class TrustedFix(
        val lat: Double,
        val lon: Double,
        val accuracyM: Float,
        val elapsedMs: Long,
        val wallMs: Long,
        val speedMps: Float?,
        val bearingDeg: Float?,
        val stepTotal: Long,
        val mode: Phase3Mode,
        val placement: MotionPlacement
    )

    companion object {
        private const val SAVE_INTERVAL_MS = 15_000L
        private const val DIRECT_PROPAGATION_GAP_MS = 30_000L
        private const val MAP_REFRESH_MAX_AGE_MS = 6L * 60L * 60L * 1_000L
        private const val MAP_REFRESH_DISTANCE_M = 500.0
    }

    private val appContext = context.applicationContext
    private val stateStore = Phase3StateStore(appContext)
    private val healthPrefs = appContext.getSharedPreferences("brick", Context.MODE_PRIVATE)
    private val odometry = LearnedOdometryModel()
    private val routeGraph = LocalRouteGraph()
    private val magneticModel = MagneticSequenceModel()
    private val landmarkModel = LandmarkSequenceModel()
    private val particles = ParticlePositionEngine()

    @Volatile private var lastTrusted: TrustedFix? = null
    @Volatile private var lastMotionStepTotal = 0L
    @Volatile private var lastSaveElapsedMs = 0L
    @Volatile private var lastMapRefreshWallMs = 0L
    @Volatile private var lastMapLat: Double? = null
    @Volatile private var lastMapLon: Double? = null

    init { restore() }

    @Synchronized
    fun onTrustedFix(
        lat: Double,
        lon: Double,
        accuracyM: Float,
        elapsedMs: Long,
        wallMs: Long,
        speedMps: Float?,
        bearingDeg: Float?,
        activity: ActivitySnapshot
    ) {
        if (!lat.isFinite() || lat !in -90.0..90.0 || !lon.isFinite() || lon !in -180.0..180.0 ||
            !accuracyM.isFinite() || accuracyM < 0f || elapsedMs < 0L || wallMs <= 0L) return

        applyTrustedSamplingProfile(activity, elapsedMs)
        val nowNs = SystemClock.elapsedRealtimeNanos()
        val snapshot = motion.phase3Snapshot(nowNs)
        val mode = mode(activity.mode)
        val current = TrustedFix(lat, lon, accuracyM, elapsedMs, wallMs, speedMps, bearingDeg, snapshot.totalSteps, mode, snapshot.placement)
        val previous = lastTrusted
        var learnedSomething = false

        if (previous != null && elapsedMs > previous.elapsedMs && previous.mode == mode) {
            val distance = GeoMath.distanceMeters(previous.lat, previous.lon, lat, lon)
            val stepDelta = (snapshot.totalSteps - previous.stepTotal).coerceIn(0L, 65_535L).toInt()
            learnedSomething = odometry.calibrateStride(mode, snapshot.placement, stepDelta, distance, previous.accuracyM, accuracyM) || learnedSomething
            val segmentId = routeGraph.addTrustedSegment(previous.lat, previous.lon, lat, lon, mode, previous.accuracyM, accuracyM, wallMs)
            if (segmentId != null) {
                learnedSomething = true
                if (previous.accuracyM <= 20f && accuracyM <= 20f) {
                    val fromNs = previous.elapsedMs * 1_000_000L
                    val magnetic = motion.magneticSequence(nowNs).filter { it.elapsedNs >= fromNs }
                    val landmarks = motion.recentLandmarks(nowNs).filter { it.elapsedNs >= fromNs }
                    if (magneticModel.observeTrusted(segmentId, bearingDeg ?: snapshot.headingDeg, magnetic, wallMs)) learnedSomething = true
                    if (landmarkModel.observeTrusted(segmentId, landmarks, wallMs)) learnedSomething = true
                }
            }
        }

        particles.initialize(lat, lon, accuracyM, bearingDeg, speedMps, elapsedMs, wallMs)
        lastMotionStepTotal = snapshot.totalSteps
        lastTrusted = current
        persist(force = learnedSomething || elapsedMs - lastSaveElapsedMs >= SAVE_INTERVAL_MS)
    }

    @Synchronized
    fun fallback(activity: ActivitySnapshot, nowElapsedMs: Long = SystemClock.elapsedRealtime()): Phase3FallbackEstimate? {
        motion.setSamplingProfile(if (isSosActive()) MotionSamplingProfile.SOS else MotionSamplingProfile.DEGRADED)
        if (!particles.isInitialized()) return null
        val lastUpdate = particles.lastUpdateElapsedMs()
        if (lastUpdate <= 0L || nowElapsedMs < lastUpdate) return null
        val dtMs = nowElapsedMs - lastUpdate
        if (dtMs == 0L) {
            val current = particles.estimate(nowElapsedMs) ?: return null
            return current.takeUnless { it.expired }?.let { Phase3FallbackEstimate(it, 0, false) }
        }

        val snapshot = motion.phase3Snapshot()
        val rawStepDelta = (snapshot.totalSteps - lastMotionStepTotal).coerceAtLeast(0L).coerceAtMost(65_535L).toInt()
        val mode = mode(activity.mode)
        val currentEstimate = particles.estimate(nowElapsedMs)
        val gapIsDirectlyTrackable = dtMs <= DIRECT_PROPAGATION_GAP_MS
        val stepDelta = if (gapIsDirectlyTrackable) rawStepDelta else 0

        val absoluteHeading = when {
            !snapshot.rotationHealthy -> null
            mode == Phase3Mode.WALKING || mode == Phase3Mode.RUNNING -> snapshot.headingDeg.takeIf { snapshot.placement == MotionPlacement.HAND_LIKELY }
            else -> null
        }
        val relativeHeading = when {
            !snapshot.rotationHealthy || !gapIsDirectlyTrackable -> null
            mode == Phase3Mode.VEHICLE || mode == Phase3Mode.BICYCLE -> snapshot.headingDelta5sDeg?.coerceIn(-70f, 70f)
            snapshot.placement == MotionPlacement.HAND_LIKELY -> snapshot.headingDelta5sDeg?.coerceIn(-90f, 90f)
            else -> null
        }
        val priorHeading = currentEstimate?.headingDeg
        val headingAgrees = snapshot.headingDeg != null && priorHeading != null &&
            GeoMath.angularDifference(snapshot.headingDeg.toDouble(), priorHeading.toDouble()) <= 45.0
        val forwardAccel = snapshot.forwardAccelMps2.takeIf { gapIsDirectlyTrackable && snapshot.accelerometerHealthy && headingAgrees }

        val inputDtSec = (dtMs / 1000.0).coerceAtLeast(0.0)
        var delta = odometry.propagate(
            OdometryInput(
                mode = mode,
                placement = snapshot.placement,
                dtSec = if (gapIsDirectlyTrackable) inputDtSec else 0.0,
                stepDelta = stepDelta,
                headingDeg = absoluteHeading,
                headingDeltaDeg = relativeHeading,
                stationaryScore = snapshot.stationaryScore,
                forwardAccelMps2 = forwardAccel,
                previousSpeedMps = particles.lastSpeedMps(),
                rotationHealthy = snapshot.rotationHealthy,
                accelerometerHealthy = snapshot.accelerometerHealthy,
                outageAgeSec = (currentEstimate?.ageSinceTrustedMs ?: 0L) / 1000.0
            )
        )

        if (!gapIsDirectlyTrackable) {
            val gapSec = inputDtSec.coerceAtMost(20.0 * 60.0)
            val growthPerSec = when (mode) {
                Phase3Mode.STATIONARY -> 1.0
                Phase3Mode.WALKING -> 2.0
                Phase3Mode.RUNNING -> 3.0
                Phase3Mode.BICYCLE -> 5.0
                Phase3Mode.VEHICLE -> 8.0
                Phase3Mode.UNKNOWN -> 5.0
            }
            delta = delta.copy(
                distanceM = 0.0,
                distanceSigmaM = max(delta.distanceSigmaM, gapSec * growthPerSec * 0.45),
                uncertaintyGrowthM = max(delta.uncertaintyGrowthM, gapSec * growthPerSec),
                zeroVelocityApplied = false,
                usableMotion = false
            )
        }

        val magneticSupport = if (snapshot.magneticHealthy) magneticModel.match(snapshot.headingDeg, motion.magneticSequence()) else emptyList()
        val landmarkSupport = landmarkModel.match(motion.recentLandmarks())
        val estimate = particles.propagate(nowElapsedMs, delta, mode, routeGraph, magneticSupport, landmarkSupport) ?: return null
        lastMotionStepTotal = snapshot.totalSteps
        persist(force = false)
        return estimate.takeUnless { it.expired }?.let { Phase3FallbackEstimate(it, rawStepDelta, delta.zeroVelocityApplied) }
    }

    @Synchronized
    fun mergePrivateMap(centerLat: Double, centerLon: Double, wallMs: Long, segments: Collection<LocalRouteSegment>) {
        if (!centerLat.isFinite() || centerLat !in -90.0..90.0 || !centerLon.isFinite() || centerLon !in -180.0..180.0 || wallMs <= 0L) return
        routeGraph.mergePrivateMap(segments)
        lastMapRefreshWallMs = wallMs
        lastMapLat = centerLat
        lastMapLon = centerLon
        persist(force = true)
    }

    @Synchronized
    fun shouldRefreshPrivateMap(lat: Double, lon: Double, wallMs: Long): Boolean {
        if (!lat.isFinite() || lat !in -90.0..90.0 || !lon.isFinite() || lon !in -180.0..180.0 || wallMs <= 0L) return false
        val priorLat = lastMapLat
        val priorLon = lastMapLon
        if (lastMapRefreshWallMs <= 0L || wallMs - lastMapRefreshWallMs > MAP_REFRESH_MAX_AGE_MS) return true
        if (priorLat == null || priorLon == null) return true
        return GeoMath.distanceMeters(priorLat, priorLon, lat, lon) >= MAP_REFRESH_DISTANCE_M
    }

    @Synchronized
    fun health(nowElapsedMs: Long = SystemClock.elapsedRealtime()): Phase3PositioningHealth {
        val estimate = particles.estimate(nowElapsedMs)
        val all = routeGraph.all()
        return Phase3PositioningHealth(
            initialized = particles.isInitialized(),
            routeSegments = all.size,
            privateMapSegments = all.count { it.source == RouteSegmentSource.PRIVATE_MAP },
            learnedRouteSegments = all.count { it.source == RouteSegmentSource.LEARNED },
            uncertaintyM = estimate?.uncertaintyM,
            ageSinceTrustedMs = estimate?.ageSinceTrustedMs,
            routeConstrained = estimate?.routeConstrained == true,
            stateHealthy = healthPrefs.getBoolean("phase3StateHealthy", true)
        )
    }

    private fun restore() {
        val state = stateStore.read() ?: return
        odometry.restore(state.odometry)
        routeGraph.restore(state.routeGraph)
        magneticModel.restore(state.magnetic)
        landmarkModel.restore(state.landmarks)
        particles.restore(state.particles, SystemClock.elapsedRealtime())
        lastMotionStepTotal = state.lastMotionStepTotal
        lastMapRefreshWallMs = state.lastMapRefreshWallMs
        if (lastMapRefreshWallMs > 0L) {
            val lat = Double.fromBits(state.lastMapLatBits)
            val lon = Double.fromBits(state.lastMapLonBits)
            lastMapLat = lat.takeIf { it.isFinite() && it in -90.0..90.0 }
            lastMapLon = lon.takeIf { it.isFinite() && it in -180.0..180.0 }
        } else {
            lastMapLat = null
            lastMapLon = null
        }
    }

    private fun persist(force: Boolean) {
        val nowElapsed = SystemClock.elapsedRealtime()
        if (!force && lastSaveElapsedMs > 0L && nowElapsed - lastSaveElapsedMs < SAVE_INTERVAL_MS) return
        val state = Phase3PersistedState(
            odometry = odometry.encode(),
            routeGraph = routeGraph.encode(System.currentTimeMillis()),
            magnetic = magneticModel.encode(),
            landmarks = landmarkModel.encode(),
            particles = particles.encode(),
            lastMotionStepTotal = lastMotionStepTotal,
            lastMapRefreshWallMs = lastMapRefreshWallMs,
            lastMapLatBits = lastMapLat?.toBits() ?: 0L,
            lastMapLonBits = lastMapLon?.toBits() ?: 0L
        )
        if (stateStore.write(state)) lastSaveElapsedMs = nowElapsed
    }

    private fun applyTrustedSamplingProfile(activity: ActivitySnapshot, nowElapsedMs: Long) {
        val profile = when {
            isSosActive() -> MotionSamplingProfile.SOS
            activity.mode == ActivityMode.STATIONARY && activity.modeSinceElapsedMs > 0L &&
                activity.modeSinceElapsedMs <= nowElapsedMs && nowElapsedMs - activity.modeSinceElapsedMs >= 10L * 60L * 1_000L -> MotionSamplingProfile.LOW_POWER
            else -> MotionSamplingProfile.NORMAL
        }
        motion.setSamplingProfile(profile)
    }

    private fun isSosActive(): Boolean = healthPrefs.getBoolean("sosActive", false)

    private fun mode(activity: ActivityMode): Phase3Mode = when (activity) {
        ActivityMode.STATIONARY -> Phase3Mode.STATIONARY
        ActivityMode.WALKING -> Phase3Mode.WALKING
        ActivityMode.RUNNING -> Phase3Mode.RUNNING
        ActivityMode.BICYCLE -> Phase3Mode.BICYCLE
        ActivityMode.VEHICLE -> Phase3Mode.VEHICLE
        ActivityMode.UNKNOWN -> Phase3Mode.UNKNOWN
    }
}
