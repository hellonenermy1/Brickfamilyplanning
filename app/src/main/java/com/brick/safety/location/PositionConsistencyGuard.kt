package com.brick.safety.location

import kotlin.math.abs
import kotlin.math.max

enum class FixConsistencyReason {
    ACCEPT,
    PHYSICS_SPEED,
    EXTREME_ACCELERATION,
    STATIONARY_CONTRADICTION,
    STEP_CONTRADICTION,
    HEADING_CONTRADICTION
}

data class ConsistencyFix(
    val lat: Double,
    val lon: Double,
    val accuracyM: Float,
    val elapsedMs: Long,
    val speedMps: Float?,
    val speedAccuracyMps: Float?,
    val bearingDeg: Float?,
    val bearingAccuracyDeg: Float?
)

data class ConsistencyMotion(
    val mode: Phase3Mode,
    val activityConfidence: Int,
    val stepDelta: Int,
    val stepSensorAvailable: Boolean,
    val stationaryScore: Float,
    val placement: MotionPlacement,
    val rotationHealthy: Boolean,
    val headingDeg: Float?,
    val headingAgeMs: Long?
)

data class FixConsistencyResult(
    val accepted: Boolean,
    val reason: FixConsistencyReason,
    val distanceM: Double,
    val effectiveDistanceM: Double,
    val effectiveSpeedMps: Double
)

/**
 * Conservative fused-fix guard used before a fix is allowed to update trusted state or train
 * Phase 3 models. A weak/missing sensor never rejects a fix. Rejection requires either a hard
 * physics violation or multiple strong, independent motion contradictions.
 */
object PositionConsistencyGuard {
    fun evaluate(previous: ConsistencyFix, candidate: ConsistencyFix, motion: ConsistencyMotion): FixConsistencyResult {
        val dtSec = (candidate.elapsedMs - previous.elapsedMs) / 1000.0
        if (dtSec <= 0.0 || !dtSec.isFinite()) return rejected(FixConsistencyReason.PHYSICS_SPEED, 0.0, 0.0, Double.POSITIVE_INFINITY)

        val distance = GeoMath.distanceMeters(previous.lat, previous.lon, candidate.lat, candidate.lon)
        val accuracyMargin = previous.accuracyM.coerceAtLeast(0f) + candidate.accuracyM.coerceAtLeast(0f) + 20f
        val effectiveDistance = max(0.0, distance - accuracyMargin)
        val effectiveSpeed = effectiveDistance / dtSec

        // Keep the original physics idea, but use accuracy-adjusted displacement here. PositionEngine
        // retains its independent raw distance allowance too, so neither guard becomes a single point
        // of failure.
        val hardSpeed = hardSpeedLimit(motion.mode)
        if (effectiveSpeed > hardSpeed) return rejected(FixConsistencyReason.PHYSICS_SPEED, distance, effectiveDistance, effectiveSpeed)

        val previousSpeed = previous.speedMps?.toDouble()?.takeIf { it.isFinite() && it >= 0.0 }
        val candidateSpeed = candidate.speedMps?.toDouble()?.takeIf { it.isFinite() && it >= 0.0 }
        val candidateSpeedAcc = candidate.speedAccuracyMps?.toDouble()?.takeIf { it.isFinite() && it >= 0.0 }
        if (dtSec <= 20.0 && previousSpeed != null && candidateSpeed != null && candidateSpeedAcc != null && candidateSpeedAcc <= 3.0) {
            val measuredAccel = abs(candidateSpeed - previousSpeed) / dtSec
            // These are intentionally generous rejection bounds. They catch sensor/GPS teleport spikes,
            // not ordinary human/vehicle acceleration or braking.
            val limit = when (motion.mode) {
                Phase3Mode.STATIONARY -> 4.0
                Phase3Mode.WALKING -> 4.5
                Phase3Mode.RUNNING -> 6.5
                Phase3Mode.BICYCLE -> 7.5
                Phase3Mode.VEHICLE -> 13.0
                Phase3Mode.UNKNOWN -> 16.0
            }
            if (measuredAccel > limit + candidateSpeedAcc / dtSec.coerceAtLeast(0.5)) {
                return rejected(FixConsistencyReason.EXTREME_ACCELERATION, distance, effectiveDistance, effectiveSpeed)
            }
        }

        val accurateEnoughForMotionGate = previous.accuracyM <= 50f && candidate.accuracyM <= 50f
        if (accurateEnoughForMotionGate && motion.mode == Phase3Mode.STATIONARY && motion.activityConfidence >= 60 &&
            motion.stationaryScore >= 0.82f && motion.stepDelta <= 1) {
            val stationaryAllowance = max(18.0, dtSec.coerceAtMost(60.0) * 0.75)
            if (effectiveDistance > stationaryAllowance) {
                return rejected(FixConsistencyReason.STATIONARY_CONTRADICTION, distance, effectiveDistance, effectiveSpeed)
            }
        }

        if (accurateEnoughForMotionGate && motion.stepSensorAvailable && motion.activityConfidence >= 70 &&
            (motion.mode == Phase3Mode.WALKING || motion.mode == Phase3Mode.RUNNING) && dtSec in 3.0..60.0 &&
            motion.stepDelta <= 1 && motion.stationaryScore >= 0.50f) {
            val noStepAllowance = if (motion.mode == Phase3Mode.RUNNING) 30.0 else 24.0
            if (effectiveDistance > noStepAllowance) {
                return rejected(FixConsistencyReason.STEP_CONTRADICTION, distance, effectiveDistance, effectiveSpeed)
            }
        }

        // Phone orientation is not automatically travel direction. It only becomes rejection evidence
        // when the previous trusted travel bearing already agreed with the current hand-held heading;
        // then a sudden high-quality GPS reversal can contradict that established continuity.
        val previousBearing = previous.bearingDeg?.toDouble()?.takeIf { it.isFinite() }
        val candidateBearing = candidate.bearingDeg?.toDouble()?.takeIf { it.isFinite() }
        val bearingAccuracy = candidate.bearingAccuracyDeg?.toDouble()?.takeIf { it.isFinite() && it >= 0.0 }
        val motionHeading = motion.headingDeg?.toDouble()?.takeIf { it.isFinite() }
        val headingFresh = motion.headingAgeMs != null && motion.headingAgeMs in 0L..2_500L
        val priorHeadingAgreed = previousBearing != null && motionHeading != null &&
            GeoMath.angularDifference(previousBearing, motionHeading) <= 45.0
        if (accurateEnoughForMotionGate && motion.rotationHealthy && headingFresh && priorHeadingAgreed &&
            motion.placement == MotionPlacement.HAND_LIKELY && motion.activityConfidence >= 70 &&
            (motion.mode == Phase3Mode.WALKING || motion.mode == Phase3Mode.RUNNING) &&
            candidateBearing != null && bearingAccuracy != null && bearingAccuracy <= 20.0 && motionHeading != null &&
            effectiveDistance >= 18.0 && effectiveSpeed >= 1.0) {
            val disagreement = GeoMath.angularDifference(candidateBearing, motionHeading)
            if (disagreement >= 145.0) {
                return rejected(FixConsistencyReason.HEADING_CONTRADICTION, distance, effectiveDistance, effectiveSpeed)
            }
        }

        return FixConsistencyResult(true, FixConsistencyReason.ACCEPT, distance, effectiveDistance, effectiveSpeed)
    }

    private fun hardSpeedLimit(mode: Phase3Mode): Double = when (mode) {
        Phase3Mode.STATIONARY -> 12.0
        Phase3Mode.WALKING -> 9.0
        Phase3Mode.RUNNING -> 16.0
        Phase3Mode.BICYCLE -> 35.0
        Phase3Mode.VEHICLE -> 100.0
        Phase3Mode.UNKNOWN -> 100.0
    }

    private fun rejected(reason: FixConsistencyReason, distance: Double, effectiveDistance: Double, effectiveSpeed: Double) =
        FixConsistencyResult(false, reason, distance, effectiveDistance, effectiveSpeed)
}
