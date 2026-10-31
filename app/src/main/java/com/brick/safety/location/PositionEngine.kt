package com.brick.safety.location

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorManager
import android.location.Location
import android.os.SystemClock
import androidx.core.content.ContextCompat
import androidx.core.location.LocationCompat
import com.brick.safety.activity.ActivityMode
import com.brick.safety.activity.ActivitySnapshot
import kotlin.math.*

enum class PositionQuality(val code: Int) { PRECISE(1), ASSISTED(2), ANCHORED(3), ESTIMATED(4), COARSE(5), LAST_KNOWN(6), UNKNOWN(7) }
enum class PositionSource(val code: Int) { FUSED(1), INERTIAL(2), LAST_KNOWN(3), BLE_ANCHOR(4), UNKNOWN(0) }

data class PositionSample(
    val rawLat: Double?, val rawLon: Double?, val rawAccuracyM: Float?,
    val trustedLat: Double?, val trustedLon: Double?, val uncertaintyM: Float,
    val speedMps: Float?, val speedAccuracyMps: Float?,
    val bearingDeg: Float?, val bearingAccuracyDeg: Float?,
    val altitudeM: Double?, val verticalAccuracyM: Float?,
    val rawAccepted: Boolean, val rawMock: Boolean,
    val activity: ActivitySnapshot, val quality: PositionQuality, val source: PositionSource,
    val gnss: GnssQualityMonitor.Snapshot, val stepDelta: Int,
    val elapsedRealtimeMs: Long, val wallTimeMs: Long
)

class PositionEngine(private val context: Context, private val motion: MotionEngine, private val gnss: GnssQualityMonitor) {
    private data class Anchor(
        val lat: Double, val lon: Double, val accuracyM: Float, val elapsedMs: Long, val wallMs: Long,
        val speedMps: Float?, val bearingDeg: Float?, val stepTotal: Long, val activity: ActivityMode
    )
    private data class BleEvidence(
        val latitude: Double, val longitude: Double, val radiusM: Float,
        val seenElapsedMs: Long, val seenWallMs: Long
    )

    companion object {
        private const val BLE_ANCHOR_MAX_AGE_MS = 90_000L
    }

    private val prefs = context.getSharedPreferences("brick_position", Context.MODE_PRIVATE)
    private val phase3 = Phase3PositioningEngine(context, motion)
    @Volatile private var lastTrusted: Anchor? = loadRecentAnchor()
    @Volatile private var lastBleAnchor: BleEvidence? = null
    @Volatile private var walkingStrideM = prefs.getFloat("walkingStrideM", 0.72f).coerceIn(0.45f, 1.10f)
    @Volatile private var runningStrideM = prefs.getFloat("runningStrideM", 1.05f).coerceIn(0.70f, 1.80f)

    @Synchronized
    fun noteBleAnchor(config: BleAnchorEngine.Config) {
        if (!config.latitude.isFinite() || config.latitude !in -90.0..90.0 ||
            !config.longitude.isFinite() || config.longitude !in -180.0..180.0 ||
            !config.radiusM.isFinite() || config.radiusM !in 25f..5_000f) return
        lastBleAnchor = BleEvidence(
            config.latitude,
            config.longitude,
            config.radiusM,
            SystemClock.elapsedRealtime(),
            System.currentTimeMillis()
        )
    }

    @Synchronized
    fun evaluate(raw: Location, activityInput: ActivitySnapshot): PositionSample {
        val nowElapsed = SystemClock.elapsedRealtime()
        val activity = freshActivity(activityInput, nowElapsed)
        val rawElapsed = raw.elapsedRealtimeNanos / 1_000_000L
        val rawAgeMs = nowElapsed - rawElapsed
        val mock = LocationCompat.isMock(raw)
        val finite = raw.latitude.isFinite() && raw.longitude.isFinite() && raw.latitude in -90.0..90.0 &&
            raw.longitude in -180.0..180.0 && raw.accuracy.isFinite() && raw.accuracy >= 0f
        var accepted = finite && !mock && rawElapsed > 0L && rawAgeMs in 0L..60_000L && raw.accuracy <= 5_000f
        val previous = lastTrusted

        if (accepted && previous != null) {
            if (rawElapsed <= previous.elapsedMs) {
                accepted = false
            } else {
                val dt = (rawElapsed - previous.elapsedMs) / 1000.0
                val distance = distanceMeters(previous.lat, previous.lon, raw.latitude, raw.longitude)
                val allowance = maxPlausibleSpeed(activity.mode) * dt + previous.accuracyM + raw.accuracy + 35.0
                if (distance > allowance) accepted = false
                if (raw.accuracy > 500f && nowElapsed - previous.elapsedMs < 5 * 60_000L) accepted = false
            }
        }

        if (accepted && previous != null) {
            val motionSnapshot = motion.phase3Snapshot()
            val stepDelta = (motionSnapshot.totalSteps - previous.stepTotal).coerceAtLeast(0L).coerceAtMost(65_535L).toInt()
            val candidateSpeed = if (raw.hasSpeed() && raw.speed.isFinite() && raw.speed >= 0f) raw.speed else null
            val candidateSpeedAccuracy = if (raw.hasSpeedAccuracy() && raw.speedAccuracyMetersPerSecond.isFinite() && raw.speedAccuracyMetersPerSecond >= 0f) raw.speedAccuracyMetersPerSecond else null
            val candidateBearing = if (raw.hasBearing() && raw.bearing.isFinite()) normalizeDegrees(raw.bearing) else null
            val candidateBearingAccuracy = if (raw.hasBearingAccuracy() && raw.bearingAccuracyDegrees.isFinite() && raw.bearingAccuracyDegrees >= 0f) raw.bearingAccuracyDegrees else null
            val result = PositionConsistencyGuard.evaluate(
                previous = ConsistencyFix(previous.lat, previous.lon, previous.accuracyM, previous.elapsedMs, previous.speedMps, null, previous.bearingDeg, null),
                candidate = ConsistencyFix(raw.latitude, raw.longitude, raw.accuracy, rawElapsed, candidateSpeed, candidateSpeedAccuracy, candidateBearing, candidateBearingAccuracy),
                motion = ConsistencyMotion(
                    mode = phase3Mode(activity.mode),
                    activityConfidence = activity.confidence,
                    stepDelta = stepDelta,
                    stepSensorAvailable = stepSensorEvidenceAvailable(),
                    stationaryScore = motionSnapshot.stationaryScore,
                    placement = motionSnapshot.placement,
                    rotationHealthy = motionSnapshot.rotationHealthy,
                    headingDeg = motionSnapshot.headingDeg,
                    headingAgeMs = motionSnapshot.headingAgeMs
                )
            )
            if (!result.accepted) {
                accepted = false
                noteConsistencyReject(result.reason)
            }
        }
        if (!accepted) return rejectedSample(raw, activity, mock, nowElapsed)

        val stepTotal = motion.snapshot().totalSteps
        calibrateStride(previous, raw, activity, stepTotal)
        var speed = when {
            raw.hasSpeed() && raw.speed.isFinite() && raw.speed >= 0f -> raw.speed
            previous != null && rawElapsed > previous.elapsedMs -> {
                val dt = (rawElapsed - previous.elapsedMs) / 1000f
                if (dt >= 2f) (distanceMeters(previous.lat, previous.lon, raw.latitude, raw.longitude) / dt).toFloat() else null
            }
            else -> null
        }
        var speedAcc = if (raw.hasSpeedAccuracy() && raw.speedAccuracyMetersPerSecond.isFinite() && raw.speedAccuracyMetersPerSecond >= 0f) raw.speedAccuracyMetersPerSecond else null
        if (speed != null && speed > maxPlausibleSpeed(activity.mode).toFloat()) { speed = null; speedAcc = null }
        if (activity.mode == ActivityMode.STATIONARY && speed != null && speed <= 1.2f && (speedAcc == null || speedAcc >= 0.6f)) {
            speed = 0f; speedAcc = speedAcc ?: 1f
        }
        val bearing = if (raw.hasBearing() && raw.bearing.isFinite()) normalizeDegrees(raw.bearing) else previous?.bearingDeg
        val bearingAcc = if (raw.hasBearingAccuracy() && raw.bearingAccuracyDegrees.isFinite() && raw.bearingAccuracyDegrees >= 0f) raw.bearingAccuracyDegrees else null
        val gnssNow = gnss.snapshot()
        val strongGnss = gnssNow.usedInFix >= 4 && (gnssNow.averageCn0DbHz ?: 0f) >= 18f
        val quality = when {
            raw.accuracy <= 20f && strongGnss -> PositionQuality.PRECISE
            raw.accuracy <= 100f -> PositionQuality.ASSISTED
            else -> PositionQuality.COARSE
        }
        val wall = stableWallTime(raw.time, rawElapsed, previous)
        val anchor = Anchor(raw.latitude, raw.longitude, raw.accuracy, rawElapsed, wall, speed, bearing, stepTotal, activity.mode)
        lastTrusted = anchor
        persistAnchor(anchor)

        // Do not train/re-anchor Phase 3 from a very coarse Android point. Those points remain valid
        // raw/fused observations, but trusted motion/path learning uses only precise/assisted fixes.
        if (quality == PositionQuality.PRECISE || quality == PositionQuality.ASSISTED) {
            runCatching {
                phase3.onTrustedFix(raw.latitude, raw.longitude, raw.accuracy, rawElapsed, wall, speed, bearing, activity)
            }
        }

        return PositionSample(
            raw.latitude, raw.longitude, raw.accuracy, raw.latitude, raw.longitude, raw.accuracy,
            speed, speedAcc, bearing, bearingAcc,
            if (raw.hasAltitude() && raw.altitude.isFinite()) raw.altitude else null,
            if (raw.hasVerticalAccuracy() && raw.verticalAccuracyMeters.isFinite() && raw.verticalAccuracyMeters >= 0f) raw.verticalAccuracyMeters else null,
            true, false, activity, quality, PositionSource.FUSED, gnssNow, 0, rawElapsed, wall
        )
    }

    @Synchronized
    fun fallback(activityInput: ActivitySnapshot): PositionSample? {
        val now = SystemClock.elapsedRealtime()
        return buildBestFallback(null, freshActivity(activityInput, now), false, now)
    }

    @Synchronized
    fun shouldRefreshPrivateMap(lat: Double, lon: Double, wallMs: Long): Boolean =
        phase3.shouldRefreshPrivateMap(lat, lon, wallMs)

    @Synchronized
    fun mergePrivateMap(centerLat: Double, centerLon: Double, wallMs: Long, segments: Collection<LocalRouteSegment>) =
        phase3.mergePrivateMap(centerLat, centerLon, wallMs, segments)

    @Synchronized
    fun phase3Health(): Phase3PositioningHealth = phase3.health()

    private fun rejectedSample(raw: Location, activity: ActivitySnapshot, mock: Boolean, now: Long): PositionSample {
        return buildBestFallback(raw, activity, mock, now) ?: PositionSample(
            raw.latitude.takeIf { it.isFinite() && it in -90.0..90.0 }, raw.longitude.takeIf { it.isFinite() && it in -180.0..180.0 }, raw.accuracy.takeIf { it.isFinite() && it >= 0f },
            null, null, 5_000f, null, null, null, null, null, null,
            false, mock, activity, PositionQuality.UNKNOWN, PositionSource.UNKNOWN, gnss.snapshot(), 0, now, System.currentTimeMillis()
        )
    }

    private fun buildBestFallback(raw: Location?, activity: ActivitySnapshot, rawMock: Boolean, now: Long): PositionSample? {
        return buildFromBleAnchor(raw, activity, rawMock, now)
            ?: buildFromPhase3(raw, activity, rawMock, now)
            ?: buildFromAnchor(raw, activity, rawMock, now)
    }

    private fun buildFromBleAnchor(raw: Location?, activity: ActivitySnapshot, rawMock: Boolean, now: Long): PositionSample? {
        val anchor = lastBleAnchor ?: return null
        val age = now - anchor.seenElapsedMs
        if (age !in 0..BLE_ANCHOR_MAX_AGE_MS) return null
        if (activity.mode == ActivityMode.VEHICLE || activity.mode == ActivityMode.BICYCLE || activity.mode == ActivityMode.RUNNING) return null
        val wall = anchor.seenWallMs + age
        return PositionSample(
            raw?.latitude?.takeIf { it.isFinite() && it in -90.0..90.0 },
            raw?.longitude?.takeIf { it.isFinite() && it in -180.0..180.0 },
            raw?.accuracy?.takeIf { it.isFinite() && it >= 0f },
            anchor.latitude,
            anchor.longitude,
            anchor.radiusM.coerceAtLeast(25f),
            0f.takeIf { activity.mode == ActivityMode.STATIONARY },
            null,
            motion.snapshot().headingDeg,
            null,
            null,
            null,
            false,
            rawMock,
            activity,
            PositionQuality.ANCHORED,
            PositionSource.BLE_ANCHOR,
            gnss.snapshot(),
            0,
            now,
            wall
        )
    }

    private fun buildFromPhase3(raw: Location?, activity: ActivitySnapshot, rawMock: Boolean, now: Long): PositionSample? {
        val fallback = runCatching { phase3.fallback(activity, now) }.getOrNull() ?: return null
        val estimate = fallback.position
        if (estimate.expired || !estimate.lat.isFinite() || estimate.lat !in -90.0..90.0 || !estimate.lon.isFinite() || estimate.lon !in -180.0..180.0) return null
        val wall = lastTrusted?.let { it.wallMs + (now - it.elapsedMs).coerceAtLeast(0L) } ?: System.currentTimeMillis()
        return PositionSample(
            raw?.latitude?.takeIf { it.isFinite() && it in -90.0..90.0 },
            raw?.longitude?.takeIf { it.isFinite() && it in -180.0..180.0 },
            raw?.accuracy?.takeIf { it.isFinite() && it >= 0f },
            estimate.lat,
            estimate.lon,
            estimate.uncertaintyM.coerceIn(3f, 5_000f),
            estimate.speedMps?.takeIf { it.isFinite() && it >= 0f },
            null,
            estimate.headingDeg?.takeIf { it.isFinite() }?.let(::normalizeDegrees),
            null,
            null,
            null,
            false,
            rawMock,
            activity,
            PositionQuality.ESTIMATED,
            PositionSource.INERTIAL,
            gnss.snapshot(),
            fallback.stepDelta,
            now,
            wall
        )
    }

    /** Retained conservative fail-safe underneath Phase 3. */
    private fun buildFromAnchor(raw: Location?, activity: ActivitySnapshot, rawMock: Boolean, now: Long): PositionSample? {
        val a = lastTrusted ?: return null
        if (now < a.elapsedMs) return null
        val ageSec = (now - a.elapsedMs) / 1000.0
        val m = motion.snapshot()
        val steps = (m.totalSteps - a.stepTotal).coerceAtLeast(0L).coerceAtMost(65_535L).toInt()
        val heading = m.headingDeg ?: a.bearingDeg
        var lat = a.lat; var lon = a.lon
        var quality = PositionQuality.LAST_KNOWN; var source = PositionSource.LAST_KNOWN
        var uncertainty = a.accuracyM + (ageSec * if (activity.mode == ActivityMode.STATIONARY) 0.5 else 3.0).toFloat()

        when (activity.mode) {
            ActivityMode.WALKING, ActivityMode.RUNNING -> if (heading != null && ageSec <= 120.0) {
                val stride = if (activity.mode == ActivityMode.RUNNING) runningStrideM else walkingStrideM
                val distance = steps * stride
                project(a.lat, a.lon, distance.toDouble(), heading.toDouble()).also { lat = it.first; lon = it.second }
                uncertainty = a.accuracyM + 8f + distance * 0.30f + (ageSec * 0.9).toFloat()
                quality = PositionQuality.ESTIMATED; source = PositionSource.INERTIAL
            }
            ActivityMode.VEHICLE, ActivityMode.BICYCLE -> if (a.speedMps != null && a.bearingDeg != null && ageSec <= 20.0) {
                val distance = a.speedMps.toDouble() * ageSec
                project(a.lat, a.lon, distance, a.bearingDeg.toDouble()).also { lat = it.first; lon = it.second }
                uncertainty = a.accuracyM + 15f + (ageSec * 4f).toFloat() + (distance * 0.15).toFloat()
                quality = PositionQuality.ESTIMATED; source = PositionSource.INERTIAL
            }
            else -> Unit
        }
        val stableWall = a.wallMs + (now - a.elapsedMs)
        return PositionSample(
            raw?.latitude?.takeIf { it.isFinite() && it in -90.0..90.0 }, raw?.longitude?.takeIf { it.isFinite() && it in -180.0..180.0 }, raw?.accuracy?.takeIf { it.isFinite() && it >= 0f },
            lat, lon, uncertainty.coerceAtMost(5_000f), null, null, heading, null, null, null,
            false, rawMock, activity, quality, source, gnss.snapshot(), steps, now, stableWall
        )
    }

    private fun calibrateStride(previous: Anchor?, raw: Location, activity: ActivitySnapshot, stepTotal: Long) {
        if (previous == null || raw.accuracy > 25f || previous.accuracyM > 25f || activity.mode != previous.activity) return
        if (activity.mode != ActivityMode.WALKING && activity.mode != ActivityMode.RUNNING) return
        val steps = stepTotal - previous.stepTotal
        if (steps < 4) return
        val distance = distanceMeters(previous.lat, previous.lon, raw.latitude, raw.longitude)
        if (distance !in 3.0..250.0) return
        val observed = (distance / steps).toFloat()
        if (activity.mode == ActivityMode.WALKING && observed in 0.45f..1.10f) {
            walkingStrideM = walkingStrideM * 0.9f + observed * 0.1f
            prefs.edit().putFloat("walkingStrideM", walkingStrideM).apply()
        } else if (activity.mode == ActivityMode.RUNNING && observed in 0.70f..1.80f) {
            runningStrideM = runningStrideM * 0.9f + observed * 0.1f
            prefs.edit().putFloat("runningStrideM", runningStrideM).apply()
        }
    }

    private fun stableWallTime(rawWall: Long, rawElapsed: Long, previous: Anchor?): Long {
        if (previous == null) return rawWall.takeIf { it > 0L } ?: System.currentTimeMillis()
        val expected = previous.wallMs + (rawElapsed - previous.elapsedMs)
        if (rawWall <= 0L) return expected
        return if (abs(rawWall - expected) <= 5 * 60_000L) rawWall else expected
    }

    private fun persistAnchor(a: Anchor) {
        prefs.edit().putLong("anchorWallMs", a.wallMs).putLong("anchorElapsedMs", a.elapsedMs)
            .putLong("anchorLatBits", a.lat.toBits()).putLong("anchorLonBits", a.lon.toBits()).putFloat("anchorAccuracyM", a.accuracyM)
            .putFloat("anchorSpeedMps", a.speedMps ?: Float.NaN).putFloat("anchorBearingDeg", a.bearingDeg ?: Float.NaN)
            .putLong("anchorStepTotal", a.stepTotal).putInt("anchorActivity", a.activity.code).apply()
    }

    private fun loadRecentAnchor(): Anchor? {
        val wall = prefs.getLong("anchorWallMs", 0L); if (wall <= 0L) return null
        val age = System.currentTimeMillis() - wall; if (age !in 0..10 * 60_000L) return null
        val savedElapsed = prefs.getLong("anchorElapsedMs", 0L); val currentElapsed = SystemClock.elapsedRealtime()
        val elapsed = if (savedElapsed in 1..currentElapsed) savedElapsed else (currentElapsed - age).coerceAtLeast(0L)
        val lat = Double.fromBits(prefs.getLong("anchorLatBits", 0L))
        val lon = Double.fromBits(prefs.getLong("anchorLonBits", 0L))
        val accuracy = prefs.getFloat("anchorAccuracyM", 100f)
        if (!lat.isFinite() || lat !in -90.0..90.0 || !lon.isFinite() || lon !in -180.0..180.0 || !accuracy.isFinite() || accuracy < 0f) return null
        return Anchor(lat, lon, accuracy, elapsed, wall,
            prefs.getFloat("anchorSpeedMps", Float.NaN).takeIf { it.isFinite() && it >= 0f }, prefs.getFloat("anchorBearingDeg", Float.NaN).takeIf { it.isFinite() },
            prefs.getLong("anchorStepTotal", 0L), ActivityMode.fromCode(prefs.getInt("anchorActivity", ActivityMode.UNKNOWN.code)))
    }

    private fun noteConsistencyReject(reason: FixConsistencyReason) {
        val p = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
        val total = p.getLong("phase3ConsistencyRejectTotal", 0L).coerceAtLeast(0L)
        p.edit()
            .putLong("phase3ConsistencyRejectTotal", total + 1L)
            .putLong("lastPhase3ConsistencyRejectWallMs", System.currentTimeMillis())
            .putString("lastPhase3ConsistencyRejectReason", reason.name.lowercase())
            .apply()
    }

    private fun stepSensorEvidenceAvailable(): Boolean {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED) return false
        val sm = context.getSystemService(SensorManager::class.java)
        return sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null || sm.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) != null
    }

    private fun phase3Mode(mode: ActivityMode): Phase3Mode = when (mode) {
        ActivityMode.STATIONARY -> Phase3Mode.STATIONARY
        ActivityMode.WALKING -> Phase3Mode.WALKING
        ActivityMode.RUNNING -> Phase3Mode.RUNNING
        ActivityMode.BICYCLE -> Phase3Mode.BICYCLE
        ActivityMode.VEHICLE -> Phase3Mode.VEHICLE
        ActivityMode.UNKNOWN -> Phase3Mode.UNKNOWN
    }

    private fun freshActivity(a: ActivitySnapshot, now: Long) =
        if (a.updatedElapsedMs > 0L && a.updatedElapsedMs <= now && now - a.updatedElapsedMs <= 120_000L) a
        else ActivitySnapshot(ActivityMode.UNKNOWN, 0, a.updatedElapsedMs)

    private fun maxPlausibleSpeed(mode: ActivityMode) = when (mode) {
        ActivityMode.STATIONARY -> 5.0
        ActivityMode.WALKING -> 4.5
        ActivityMode.RUNNING -> 10.0
        ActivityMode.BICYCLE -> 25.0
        ActivityMode.VEHICLE, ActivityMode.UNKNOWN -> 90.0
    }

    private fun normalizeDegrees(v: Float) = ((v % 360f) + 360f) % 360f
    private fun distanceMeters(a: Double, b: Double, c: Double, d: Double): Double { val out = FloatArray(1); Location.distanceBetween(a,b,c,d,out); return out[0].toDouble() }
    private fun project(lat: Double, lon: Double, distance: Double, bearing: Double): Pair<Double, Double> {
        val r = 6_371_000.0; val br = Math.toRadians(bearing); val lat1 = Math.toRadians(lat); val lon1 = Math.toRadians(lon); val x = distance / r
        val lat2 = asin(sin(lat1)*cos(x)+cos(lat1)*sin(x)*cos(br)); val lon2 = lon1 + atan2(sin(br)*sin(x)*cos(lat1), cos(x)-sin(lat1)*sin(lat2))
        return Math.toDegrees(lat2) to Math.toDegrees(lon2)
    }
}