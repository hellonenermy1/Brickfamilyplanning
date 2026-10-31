package com.brick.safety.location

import java.util.ArrayDeque
import kotlin.math.*

enum class Phase3Mode(val code: Int, val bit: Int) {
    UNKNOWN(0, 1 shl 0),
    STATIONARY(1, 1 shl 1),
    WALKING(2, 1 shl 2),
    RUNNING(3, 1 shl 3),
    BICYCLE(4, 1 shl 4),
    VEHICLE(5, 1 shl 5)
}

enum class MotionPlacement { UNKNOWN, HAND_LIKELY, POCKET_OR_BAG_LIKELY }

enum class LandmarkKind {
    TURN_LEFT,
    TURN_RIGHT,
    STOP,
    START,
    BUMP,
    ROUGH_VIBRATION,
    VERTICAL_STEP_PATTERN
}

data class MagneticPoint(
    val elapsedNs: Long,
    val eastUt: Float,
    val northUt: Float,
    val upUt: Float,
    val magnitudeUt: Float,
    val gradientUtPerSec: Float
)

data class LandmarkEvent(
    val kind: LandmarkKind,
    val elapsedNs: Long,
    val strength: Float
)

data class Phase3MotionSnapshot(
    val elapsedRealtimeNs: Long,
    val totalSteps: Long,
    val recentStepCount: Int,
    val lastStepElapsedNs: Long,
    val stepCadenceHz: Float,
    val headingDeg: Float?,
    val headingAgeMs: Long?,
    val headingDelta5sDeg: Float?,
    val linearAccelRmsMps2: Float?,
    val horizontalAccelRmsMps2: Float?,
    val verticalAccelRmsMps2: Float?,
    val gyroRmsRadS: Float?,
    val forwardAccelMps2: Float?,
    val magneticMagnitudeUt: Float?,
    val magneticVarianceUt2: Float?,
    val magneticGradientUtPerSec: Float?,
    val magneticAgeMs: Long?,
    val stationaryScore: Float,
    val placement: MotionPlacement,
    val accelerometerHealthy: Boolean,
    val gyroscopeHealthy: Boolean,
    val magneticHealthy: Boolean,
    val rotationHealthy: Boolean
)

/**
 * Pure Kotlin feature processor. Android's SensorManager adapter only feeds world-frame values here.
 * No location is produced by this class; it emits motion evidence and conservative landmark events.
 */
class Phase3SignalProcessor {
    private data class Scalar(val ns: Long, val value: Float)
    private data class Vec3(val ns: Long, val x: Float, val y: Float, val z: Float)
    private data class Heading(val ns: Long, val deg: Float)

    private val accel = ArrayDeque<Vec3>()
    private val gyro = ArrayDeque<Vec3>()
    private val heading = ArrayDeque<Heading>()
    private val magnetic = ArrayDeque<MagneticPoint>()
    private val stepTimes = ArrayDeque<Long>()
    private val landmarks = ArrayDeque<LandmarkEvent>()
    private val light = ArrayDeque<Scalar>()
    private val proximity = ArrayDeque<Scalar>()

    private var totalSteps = 0L
    private var lastStepElapsedNs = 0L
    private var turnReferenceHeading: Float? = null
    private var turnReferenceNs = 0L
    private var lastTurnNs = 0L
    private var lastBumpNs = 0L
    private var lastRoughNs = 0L
    private var lastVerticalPatternNs = 0L
    private var lastStationary: Boolean? = null

    private var accelAvailable = false
    private var gyroAvailable = false
    private var magneticAvailable = false
    private var rotationAvailable = false

    private val accelBias = FloatArray(3)
    private var previousMag: MagneticPoint? = null

    fun setAvailability(accel: Boolean, gyro: Boolean, magnetic: Boolean, rotation: Boolean) {
        accelAvailable = accel
        gyroAvailable = gyro
        magneticAvailable = magnetic
        rotationAvailable = rotation
    }

    fun onStepTotal(elapsedNs: Long, value: Long) {
        if (elapsedNs <= 0L || value < 0L) return
        if (value < totalSteps) {
            totalSteps = value
            stepTimes.clear()
            lastStepElapsedNs = elapsedNs
            return
        }
        val delta = (value - totalSteps).coerceAtMost(64L).toInt()
        if (delta > 0) {
            repeat(delta) { stepTimes.addLast(elapsedNs) }
            totalSteps = value
            lastStepElapsedNs = elapsedNs
        }
        trimSteps(elapsedNs)
    }

    fun onStep(elapsedNs: Long) {
        if (elapsedNs <= 0L) return
        totalSteps += 1
        stepTimes.addLast(elapsedNs)
        lastStepElapsedNs = elapsedNs
        trimSteps(elapsedNs)
    }

    /** Feed linear acceleration already rotated into East/North/Up world coordinates. */
    fun onLinearAcceleration(elapsedNs: Long, east: Float, north: Float, up: Float) {
        if (elapsedNs <= 0L || !east.isFinite() || !north.isFinite() || !up.isFinite()) return
        val x = east - accelBias[0]
        val y = north - accelBias[1]
        val z = up - accelBias[2]
        accel.addLast(Vec3(elapsedNs, x, y, z))
        trimVec(accel, elapsedNs, 10_000_000_000L)
        if (abs(z) >= 2.8f && elapsedNs - lastBumpNs >= 1_000_000_000L) {
            addLandmark(LandmarkKind.BUMP, elapsedNs, (abs(z) / 4f).coerceIn(0f, 2f))
            lastBumpNs = elapsedNs
        }
    }

    fun onGyroscope(elapsedNs: Long, x: Float, y: Float, z: Float) {
        if (elapsedNs <= 0L || !x.isFinite() || !y.isFinite() || !z.isFinite()) return
        gyro.addLast(Vec3(elapsedNs, x, y, z))
        trimVec(gyro, elapsedNs, 10_000_000_000L)
    }

    fun onOrientation(elapsedNs: Long, headingDeg: Float) {
        if (elapsedNs <= 0L || !headingDeg.isFinite()) return
        val normalized = GeoMath.normalizeDegrees(headingDeg.toDouble()).toFloat()
        heading.addLast(Heading(elapsedNs, normalized))
        while (heading.isNotEmpty() && elapsedNs - heading.first().ns > 15_000_000_000L) heading.removeFirst()
        val ref = turnReferenceHeading
        if (ref == null || turnReferenceNs <= 0L || elapsedNs - turnReferenceNs > 12_000_000_000L) {
            turnReferenceHeading = normalized
            turnReferenceNs = elapsedNs
            return
        }
        val delta = GeoMath.signedAngularDifference(ref.toDouble(), normalized.toDouble()).toFloat()
        if (abs(delta) >= 35f && elapsedNs - lastTurnNs >= 1_500_000_000L) {
            addLandmark(if (delta > 0f) LandmarkKind.TURN_RIGHT else LandmarkKind.TURN_LEFT, elapsedNs, (abs(delta) / 90f).coerceIn(0.4f, 2f))
            turnReferenceHeading = normalized
            turnReferenceNs = elapsedNs
            lastTurnNs = elapsedNs
        }
    }

    fun onMagnetic(elapsedNs: Long, eastUt: Float, northUt: Float, upUt: Float) {
        if (elapsedNs <= 0L || !eastUt.isFinite() || !northUt.isFinite() || !upUt.isFinite()) return
        val magnitude = sqrt(eastUt * eastUt + northUt * northUt + upUt * upUt)
        if (!magnitude.isFinite() || magnitude !in 1f..200f) return
        val prior = previousMag
        val gradient = if (prior != null && elapsedNs > prior.elapsedNs) {
            val dt = (elapsedNs - prior.elapsedNs) / 1_000_000_000f
            if (dt in 0.05f..5f) ((magnitude - prior.magnitudeUt) / dt).coerceIn(-100f, 100f) else 0f
        } else 0f
        val point = MagneticPoint(elapsedNs, eastUt, northUt, upUt, magnitude, gradient)
        previousMag = point
        val last = magnetic.peekLast()
        if (last == null || elapsedNs - last.elapsedNs >= 450_000_000L) magnetic.addLast(point)
        while (magnetic.size > 24) magnetic.removeFirst()
        while (magnetic.isNotEmpty() && elapsedNs - magnetic.first().elapsedNs > 20_000_000_000L) magnetic.removeFirst()
    }

    fun onLight(elapsedNs: Long, lux: Float) {
        if (elapsedNs <= 0L || !lux.isFinite() || lux < 0f) return
        light.addLast(Scalar(elapsedNs, lux))
        trimScalar(light, elapsedNs, 10_000_000_000L)
    }

    fun onProximity(elapsedNs: Long, distanceCm: Float) {
        if (elapsedNs <= 0L || !distanceCm.isFinite() || distanceCm < 0f) return
        proximity.addLast(Scalar(elapsedNs, distanceCm))
        trimScalar(proximity, elapsedNs, 10_000_000_000L)
    }

    fun snapshot(nowNs: Long): Phase3MotionSnapshot {
        trimVec(accel, nowNs, 10_000_000_000L)
        trimVec(gyro, nowNs, 10_000_000_000L)
        trimSteps(nowNs)
        trimScalar(light, nowNs, 10_000_000_000L)
        trimScalar(proximity, nowNs, 10_000_000_000L)
        while (heading.isNotEmpty() && nowNs - heading.first().ns > 15_000_000_000L) heading.removeFirst()
        while (magnetic.isNotEmpty() && nowNs - magnetic.first().elapsedNs > 20_000_000_000L) magnetic.removeFirst()
        while (landmarks.isNotEmpty() && nowNs - landmarks.first().elapsedNs > 120_000_000_000L) landmarks.removeFirst()

        val accelRecent = accel.filter { nowNs - it.ns <= 3_000_000_000L }
        val gyroRecent = gyro.filter { nowNs - it.ns <= 3_000_000_000L }
        val accelRms = vecRms(accelRecent) { v -> sqrt(v.x * v.x + v.y * v.y + v.z * v.z) }
        val horizRms = vecRms(accelRecent) { v -> hypot(v.x.toDouble(), v.y.toDouble()).toFloat() }
        val vertRms = vecRms(accelRecent) { v -> abs(v.z) }
        val gyroRms = vecRms(gyroRecent) { v -> sqrt(v.x * v.x + v.y * v.y + v.z * v.z) }

        val newestHeading = heading.peekLast()
        val headingAgeMs = newestHeading?.let { ((nowNs - it.ns).coerceAtLeast(0L) / 1_000_000L) }
        val headingValue = newestHeading?.deg?.takeIf { headingAgeMs != null && headingAgeMs <= 5_000L }
        val old5 = heading.firstOrNull { nowNs - it.ns <= 5_000_000_000L }
        val headingDelta5 = if (old5 != null && newestHeading != null) GeoMath.signedAngularDifference(old5.deg.toDouble(), newestHeading.deg.toDouble()).toFloat() else null

        val recentSteps = stepTimes.count { nowNs - it <= 5_000_000_000L }
        val cadence = if (stepTimes.size >= 2) {
            val valid = stepTimes.filter { nowNs - it <= 8_000_000_000L }
            if (valid.size >= 2) ((valid.size - 1) / ((valid.last() - valid.first()) / 1_000_000_000f).coerceAtLeast(0.25f)).coerceAtMost(5f) else 0f
        } else 0f

        val magneticRecent = magnetic.filter { nowNs - it.elapsedNs <= 6_000_000_000L }
        val magMean = magneticRecent.map { it.magnitudeUt }.average().takeIf { it.isFinite() }?.toFloat()
        val magVariance = if (magneticRecent.size >= 2 && magMean != null) magneticRecent.sumOf { (it.magnitudeUt - magMean).toDouble().pow(2) }.div(magneticRecent.size).toFloat() else null
        val magGradient = magnetic.peekLast()?.gradientUtPerSec
        val magAge = magnetic.peekLast()?.let { ((nowNs - it.elapsedNs).coerceAtLeast(0L) / 1_000_000L) }

        val noRecentStep = lastStepElapsedNs <= 0L || nowNs - lastStepElapsedNs > 4_000_000_000L
        var stationary = 0f
        if (noRecentStep) stationary += 0.38f
        if (accelRms != null && accelRms <= 0.18f) stationary += 0.28f
        else if (accelRms != null && accelRms <= 0.35f) stationary += 0.14f
        if (gyroRms != null && gyroRms <= 0.035f) stationary += 0.22f
        else if (gyroRms != null && gyroRms <= 0.08f) stationary += 0.10f
        if (headingDelta5 != null && abs(headingDelta5) <= 4f) stationary += 0.12f
        if (!accelAvailable && !gyroAvailable) stationary = if (noRecentStep) 0.48f else 0.15f
        stationary = stationary.coerceIn(0f, 1f)

        if (stationary >= 0.92f && accelRecent.size >= 8) {
            val meanX = accelRecent.map { it.x }.average().toFloat()
            val meanY = accelRecent.map { it.y }.average().toFloat()
            val meanZ = accelRecent.map { it.z }.average().toFloat()
            val alpha = 0.03f
            accelBias[0] = accelBias[0] * (1f - alpha) + meanX * alpha
            accelBias[1] = accelBias[1] * (1f - alpha) + meanY * alpha
            accelBias[2] = accelBias[2] * (1f - alpha) + meanZ * alpha
        }

        val stationaryNow = stationary >= 0.82f
        val priorStationary = lastStationary
        if (priorStationary != null && priorStationary != stationaryNow) {
            addLandmark(if (stationaryNow) LandmarkKind.STOP else LandmarkKind.START, nowNs, stationary)
        }
        lastStationary = stationaryNow

        if (vertRms != null && vertRms >= 1.15f && cadence in 0.8f..3.5f && nowNs - lastVerticalPatternNs >= 5_000_000_000L) {
            addLandmark(LandmarkKind.VERTICAL_STEP_PATTERN, nowNs, (vertRms / 2f).coerceIn(0.5f, 2f))
            lastVerticalPatternNs = nowNs
        }
        if (accelRms != null && gyroRms != null && accelRms >= 1.2f && gyroRms >= 0.15f && nowNs - lastRoughNs >= 4_000_000_000L) {
            addLandmark(LandmarkKind.ROUGH_VIBRATION, nowNs, ((accelRms / 2f) + gyroRms).coerceIn(0.5f, 2f))
            lastRoughNs = nowNs
        }

        val latestLight = light.peekLast()?.takeIf { nowNs - it.ns <= 5_000_000_000L }?.value
        val latestProximity = proximity.peekLast()?.takeIf { nowNs - it.ns <= 5_000_000_000L }?.value
        val placement = when {
            latestProximity != null && latestProximity <= 2.5f && latestLight != null && latestLight <= 8f -> MotionPlacement.POCKET_OR_BAG_LIKELY
            latestLight != null && latestLight >= 30f && (latestProximity == null || latestProximity > 4f) -> MotionPlacement.HAND_LIKELY
            else -> MotionPlacement.UNKNOWN
        }

        val headingRad = headingValue?.let { Math.toRadians(it.toDouble()) }
        val forwardAccel = if (headingRad != null && accelRecent.isNotEmpty()) {
            val last = accelRecent.last()
            (last.eastNorthForward(headingRad)).toFloat()
        } else null

        return Phase3MotionSnapshot(
            nowNs,
            totalSteps,
            recentSteps,
            lastStepElapsedNs,
            cadence,
            headingValue,
            headingAgeMs,
            headingDelta5,
            accelRms,
            horizRms,
            vertRms,
            gyroRms,
            forwardAccel,
            magMean,
            magVariance,
            magGradient,
            magAge,
            stationary,
            placement,
            accelAvailable && accelRecent.isNotEmpty(),
            gyroAvailable && gyroRecent.isNotEmpty(),
            magneticAvailable && magnetic.isNotEmpty(),
            rotationAvailable && headingValue != null
        )
    }

    fun magneticSequence(nowNs: Long, maxAgeNs: Long = 16_000_000_000L): List<MagneticPoint> =
        magnetic.filter { nowNs >= it.elapsedNs && nowNs - it.elapsedNs <= maxAgeNs }.takeLast(16)

    fun recentLandmarks(nowNs: Long, maxAgeNs: Long = 90_000_000_000L): List<LandmarkEvent> =
        landmarks.filter { nowNs >= it.elapsedNs && nowNs - it.elapsedNs <= maxAgeNs }.takeLast(12)

    private fun addLandmark(kind: LandmarkKind, ns: Long, strength: Float) {
        landmarks.addLast(LandmarkEvent(kind, ns, strength.coerceIn(0f, 3f)))
        while (landmarks.size > 24) landmarks.removeFirst()
    }

    private fun trimSteps(nowNs: Long) {
        while (stepTimes.isNotEmpty() && nowNs - stepTimes.first() > 12_000_000_000L) stepTimes.removeFirst()
    }

    private fun trimVec(queue: ArrayDeque<Vec3>, nowNs: Long, maxAgeNs: Long) {
        while (queue.isNotEmpty() && nowNs - queue.first().ns > maxAgeNs) queue.removeFirst()
    }

    private fun trimScalar(queue: ArrayDeque<Scalar>, nowNs: Long, maxAgeNs: Long) {
        while (queue.isNotEmpty() && nowNs - queue.first().ns > maxAgeNs) queue.removeFirst()
    }

    private fun vecRms(values: List<Vec3>, fn: (Vec3) -> Float): Float? {
        if (values.isEmpty()) return null
        return sqrt(values.sumOf { fn(it).toDouble().pow(2) } / values.size).toFloat()
    }

    private fun Vec3.eastNorthForward(headingRad: Double): Double = x * sin(headingRad) + y * cos(headingRad)
}
