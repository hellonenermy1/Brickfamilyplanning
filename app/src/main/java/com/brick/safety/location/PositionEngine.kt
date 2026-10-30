package com.brick.safety.location

import android.content.Context
import android.location.Location
import android.os.SystemClock
import androidx.core.location.LocationCompat
import com.brick.safety.activity.ActivityMode
import com.brick.safety.activity.ActivitySnapshot
import kotlin.math.*

enum class PositionQuality(val code: Int) {
    PRECISE(1), ASSISTED(2), ANCHORED(3), ESTIMATED(4), COARSE(5), LAST_KNOWN(6), UNKNOWN(7)
}

enum class PositionSource(val code: Int) {
    FUSED(1), INERTIAL(2), LAST_KNOWN(3), UNKNOWN(0)
}

data class PositionSample(
    val rawLat: Double?,
    val rawLon: Double?,
    val rawAccuracyM: Float?,
    val trustedLat: Double?,
    val trustedLon: Double?,
    val uncertaintyM: Float,
    val speedMps: Float?,
    val speedAccuracyMps: Float?,
    val bearingDeg: Float?,
    val bearingAccuracyDeg: Float?,
    val altitudeM: Double?,
    val verticalAccuracyM: Float?,
    val rawAccepted: Boolean,
    val rawMock: Boolean,
    val activity: ActivitySnapshot,
    val quality: PositionQuality,
    val source: PositionSource,
    val gnss: GnssQualityMonitor.Snapshot,
    val stepDelta: Int,
    val elapsedRealtimeMs: Long,
    val wallTimeMs: Long
)

class PositionEngine(
    private val context: Context,
    private val motion: MotionEngine,
    private val gnss: GnssQualityMonitor
) {
    private data class Anchor(
        val lat: Double,
        val lon: Double,
        val accuracyM: Float,
        val elapsedMs: Long,
        val wallMs: Long,
        val speedMps: Float?,
        val bearingDeg: Float?,
        val stepTotal: Long,
        val activity: ActivityMode
    )

    private val prefs = context.getSharedPreferences("brick_position", Context.MODE_PRIVATE)
    @Volatile private var lastTrusted: Anchor? = loadRecentAnchor()
    @Volatile private var walkingStrideM = prefs.getFloat("walkingStrideM", 0.72f).coerceIn(0.45f, 1.10f)
    @Volatile private var runningStrideM = prefs.getFloat("runningStrideM", 1.05f).coerceIn(0.70f, 1.80f)

    @Synchronized
    fun evaluate(raw: Location, activityInput: ActivitySnapshot): PositionSample {
        val nowElapsed = SystemClock.elapsedRealtime()
        val activity = freshActivity(activityInput, nowElapsed)
        val rawElapsed = raw.elapsedRealtimeNanos / 1_000_000L
        val rawAgeMs = (nowElapsed - rawElapsed).coerceAtLeast(0L)
        val mock = LocationCompat.isMock(raw)
        val finite = raw.latitude.isFinite() && raw.longitude.isFinite() &&
            raw.latitude in -90.0..90.0 && raw.longitude in -180.0..180.0 &&
            raw.accuracy.isFinite() && raw.accuracy >= 0f

        var accepted = finite && !mock && rawAgeMs <= 60_000L && raw.accuracy <= 5_000f
        val previous = lastTrusted

        if (accepted && previous != null) {
            val dt = (rawElapsed - previous.elapsedMs) / 1000.0
            if (dt > 0.5) {
                val distance = distanceMeters(previous.lat, previous.lon, raw.latitude, raw.longitude)
                val allowance = maxPlausibleSpeed(activity.mode) * dt + previous.accuracyM + raw.accuracy + 50.0
                if (distance > allowance) accepted = false
            } else if (dt < -2.0) {
                accepted = false
            }

            val anchorAge = nowElapsed - previous.elapsedMs
            if (raw.accuracy > 500f && anchorAge < 5 * 60_000L) accepted = false
        }

        if (!accepted) return fallbackForRejectedRaw(raw, activity, mock, nowElapsed)

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
        var speedAcc = if (raw.hasSpeedAccuracy()) raw.speedAccuracyMetersPerSecond else null

        // Suppress stationary GPS/Doppler noise instead of presenting tiny fake speeds.
        if (activity.mode == ActivityMode.STATIONARY &&
            speed != null && speed <= 1.2f && (speedAcc == null || speedAcc >= 0.6f)) {
            speed = 0f
            speedAcc = speedAcc ?: 1.0f
        }

        val bearing = if (raw.hasBearing()) normalizeDegrees(raw.bearing) else previous?.bearingDeg
        val bearingAcc = if (raw.hasBearingAccuracy()) raw.bearingAccuracyDegrees else null
        val quality = when {
            raw.accuracy <= 20f -> PositionQuality.PRECISE
            raw.accuracy <= 100f -> PositionQuality.ASSISTED
            else -> PositionQuality.COARSE
        }

        val anchor = Anchor(
            raw.latitude,
            raw.longitude,
            raw.accuracy,
            rawElapsed,
            raw.time,
            speed,
            bearing,
            stepTotal,
            activity.mode
        )
        lastTrusted = anchor
        persistAnchor(anchor)

        return PositionSample(
            raw.latitude, raw.longitude, raw.accuracy,
            raw.latitude, raw.longitude, raw.accuracy,
            speed, speedAcc,
            bearing, bearingAcc,
            if (raw.hasAltitude()) raw.altitude else null,
            if (raw.hasVerticalAccuracy()) raw.verticalAccuracyMeters else null,
            true, false, activity, quality, PositionSource.FUSED,
            gnss.snapshot(), 0, rawElapsed, raw.time
        )
    }

    /** Called when fresh fused fixes stop arriving. Never pretends this is measured GPS. */
    @Synchronized
    fun fallback(activityInput: ActivitySnapshot): PositionSample? {
        val nowElapsed = SystemClock.elapsedRealtime()
        return buildFallback(null, freshActivity(activityInput, nowElapsed), false, nowElapsed)
    }

    private fun fallbackForRejectedRaw(raw: Location, activity: ActivitySnapshot, rawMock: Boolean, nowElapsed: Long): PositionSample {
        return buildFallback(raw, activity, rawMock, nowElapsed) ?: PositionSample(
            rawLat = raw.latitude.takeIf { it.isFinite() },
            rawLon = raw.longitude.takeIf { it.isFinite() },
            rawAccuracyM = raw.accuracy.takeIf { it.isFinite() && it >= 0f },
            trustedLat = null,
            trustedLon = null,
            uncertaintyM = 5_000f,
            speedMps = null,
            speedAccuracyMps = null,
            bearingDeg = null,
            bearingAccuracyDeg = null,
            altitudeM = null,
            verticalAccuracyM = null,
            rawAccepted = false,
            rawMock = rawMock,
            activity = activity,
            quality = PositionQuality.UNKNOWN,
            source = PositionSource.UNKNOWN,
            gnss = gnss.snapshot(),
            stepDelta = 0,
            elapsedRealtimeMs = nowElapsed,
            wallTimeMs = System.currentTimeMillis()
        )
    }

    private fun buildFallback(raw: Location?, activity: ActivitySnapshot, rawMock: Boolean, nowElapsed: Long): PositionSample? {
        val anchor = lastTrusted
        val gnssSnapshot = gnss.snapshot()
        val rawElapsed = raw?.elapsedRealtimeNanos?.div(1_000_000L)
        if (anchor == null) {
            return if (raw != null && !rawMock && raw.latitude.isFinite() && raw.longitude.isFinite()) {
                PositionSample(
                    raw.latitude, raw.longitude, raw.accuracy.takeIf { it.isFinite() && it >= 0f },
                    raw.latitude, raw.longitude, max(raw.accuracy.takeIf { it.isFinite() && it >= 0f } ?: 500f, 500f),
                    null, null, null, null,
                    if (raw.hasAltitude()) raw.altitude else null,
                    if (raw.hasVerticalAccuracy()) raw.verticalAccuracyMeters else null,
                    false, rawMock, activity, PositionQuality.COARSE, PositionSource.FUSED,
                    gnssSnapshot, 0, rawElapsed ?: nowElapsed, raw.time
                )
            } else null
        }

        val ageSec = ((nowElapsed - anchor.elapsedMs).coerceAtLeast(0L) / 1000.0)
        val motionNow = motion.snapshot()
        val steps = (motionNow.totalSteps - anchor.stepTotal).coerceAtLeast(0L).coerceAtMost(65_535L).toInt()
        val heading = motionNow.headingDeg ?: anchor.bearingDeg

        var lat = anchor.lat
        var lon = anchor.lon
        var quality = PositionQuality.LAST_KNOWN
        var source = PositionSource.LAST_KNOWN
        var uncertainty = anchor.accuracyM + (ageSec * if (activity.mode == ActivityMode.STATIONARY) 0.5 else 3.0).toFloat()

        when (activity.mode) {
            ActivityMode.WALKING, ActivityMode.RUNNING -> {
                if (heading != null && ageSec <= 120.0) {
                    val stride = if (activity.mode == ActivityMode.RUNNING) runningStrideM else walkingStrideM
                    val distance = steps * stride
                    val projected = project(anchor.lat, anchor.lon, distance.toDouble(), heading.toDouble())
                    lat = projected.first
                    lon = projected.second
                    uncertainty = anchor.accuracyM + 8f + (distance * 0.30f) + (ageSec * 0.9).toFloat()
                    quality = PositionQuality.ESTIMATED
                    source = PositionSource.INERTIAL
                }
            }
            ActivityMode.VEHICLE, ActivityMode.BICYCLE -> {
                val speed = anchor.speedMps
                val course = anchor.bearingDeg
                if (speed != null && course != null && ageSec <= 20.0) {
                    val distance = speed.toDouble() * ageSec
                    val projected = project(anchor.lat, anchor.lon, distance, course.toDouble())
                    lat = projected.first
                    lon = projected.second
                    uncertainty = anchor.accuracyM + 15f + (ageSec * 4f).toFloat() + (distance * 0.15).toFloat()
                    quality = PositionQuality.ESTIMATED
                    source = PositionSource.INERTIAL
                }
            }
            else -> Unit
        }

        return PositionSample(
            raw?.latitude?.takeIf { it.isFinite() }, raw?.longitude?.takeIf { it.isFinite() }, raw?.accuracy?.takeIf { it.isFinite() && it >= 0f },
            lat, lon, uncertainty.coerceAtMost(5_000f),
            null, null, heading, null,
            null, null,
            false, rawMock, activity, quality, source,
            gnssSnapshot, steps, nowElapsed, System.currentTimeMillis()
        )
    }

    private fun calibrateStride(previous: Anchor?, raw: Location, activity: ActivitySnapshot, stepTotal: Long) {
        if (previous == null || raw.accuracy > 25f || previous.accuracyM > 25f) return
        if (activity.mode != previous.activity) return
        if (activity.mode != ActivityMode.WALKING && activity.mode != ActivityMode.RUNNING) return
        val steps = stepTotal - previous.stepTotal
        if (steps < 4) return
        val distance = distanceMeters(previous.lat, previous.lon, raw.latitude, raw.longitude)
        if (distance !in 3.0..250.0) return
        val observed = (distance / steps).toFloat()
        if (activity.mode == ActivityMode.WALKING && observed in 0.45f..1.10f) {
            walkingStrideM = walkingStrideM * 0.9f + observed * 0.1f
            prefs.edit().putFloat("walkingStrideM", walkingStrideM).apply()
        }
        if (activity.mode == ActivityMode.RUNNING && observed in 0.70f..1.80f) {
            runningStrideM = runningStrideM * 0.9f + observed * 0.1f
            prefs.edit().putFloat("runningStrideM", runningStrideM).apply()
        }
    }

    private fun persistAnchor(a: Anchor) {
        prefs.edit()
            .putLong("anchorWallMs", a.wallMs)
            .putLong("anchorElapsedMs", a.elapsedMs)
            .putLong("anchorLatBits", a.lat.toBits())
            .putLong("anchorLonBits", a.lon.toBits())
            .putFloat("anchorAccuracyM", a.accuracyM)
            .putFloat("anchorSpeedMps", a.speedMps ?: Float.NaN)
            .putFloat("anchorBearingDeg", a.bearingDeg ?: Float.NaN)
            .putLong("anchorStepTotal", a.stepTotal)
            .putInt("anchorActivity", a.activity.code)
            .apply()
    }

    private fun loadRecentAnchor(): Anchor? {
        val wall = prefs.getLong("anchorWallMs", 0L)
        if (wall <= 0L) return null
        val age = System.currentTimeMillis() - wall
        if (age !in 0..10 * 60_000L) return null
        val savedElapsed = prefs.getLong("anchorElapsedMs", 0L)
        val currentElapsed = SystemClock.elapsedRealtime()
        val approximatedElapsed = if (savedElapsed in 1..currentElapsed) savedElapsed else (currentElapsed - age).coerceAtLeast(0L)
        return Anchor(
            Double.fromBits(prefs.getLong("anchorLatBits", 0L)),
            Double.fromBits(prefs.getLong("anchorLonBits", 0L)),
            prefs.getFloat("anchorAccuracyM", 100f),
            approximatedElapsed,
            wall,
            prefs.getFloat("anchorSpeedMps", Float.NaN).takeIf { it.isFinite() },
            prefs.getFloat("anchorBearingDeg", Float.NaN).takeIf { it.isFinite() },
            prefs.getLong("anchorStepTotal", 0L),
            ActivityMode.fromCode(prefs.getInt("anchorActivity", ActivityMode.UNKNOWN.code))
        )
    }

    private fun freshActivity(a: ActivitySnapshot, now: Long): ActivitySnapshot =
        if (a.updatedElapsedMs > 0 && now - a.updatedElapsedMs <= 2 * 60_000L) a
        else ActivitySnapshot(ActivityMode.UNKNOWN, 0, a.updatedElapsedMs)

    private fun maxPlausibleSpeed(mode: ActivityMode): Double = when (mode) {
        ActivityMode.STATIONARY -> 15.0
        ActivityMode.WALKING -> 12.0
        ActivityMode.RUNNING -> 18.0
        ActivityMode.BICYCLE -> 35.0
        ActivityMode.VEHICLE, ActivityMode.UNKNOWN -> 90.0
    }

    private fun normalizeDegrees(value: Float): Float = ((value % 360f) + 360f) % 360f

    private fun distanceMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val out = FloatArray(1)
        Location.distanceBetween(lat1, lon1, lat2, lon2, out)
        return out[0].toDouble()
    }

    private fun project(lat: Double, lon: Double, distanceM: Double, bearingDeg: Double): Pair<Double, Double> {
        val r = 6_371_000.0
        val br = Math.toRadians(bearingDeg)
        val lat1 = Math.toRadians(lat)
        val lon1 = Math.toRadians(lon)
        val angular = distanceM / r
        val lat2 = asin(sin(lat1) * cos(angular) + cos(lat1) * sin(angular) * cos(br))
        val lon2 = lon1 + atan2(sin(br) * sin(angular) * cos(lat1), cos(angular) - sin(lat1) * sin(lat2))
        return Math.toDegrees(lat2) to Math.toDegrees(lon2)
    }
}
