package com.brick.safety.location

import kotlin.math.*

data class StrideStats(
    val meanM: Float,
    val varianceM2: Float,
    val samples: Int
) {
    val stdDevM: Float get() = sqrt(varianceM2.coerceAtLeast(0f))
}

data class OdometryInput(
    val mode: Phase3Mode,
    val placement: MotionPlacement,
    val dtSec: Double,
    val stepDelta: Int,
    val headingDeg: Float?,
    val headingDeltaDeg: Float?,
    val stationaryScore: Float,
    val forwardAccelMps2: Float?,
    val previousSpeedMps: Float?,
    val rotationHealthy: Boolean,
    val accelerometerHealthy: Boolean,
    val outageAgeSec: Double
)

data class OdometryDelta(
    val distanceM: Double,
    val distanceSigmaM: Double,
    val headingDeg: Double?,
    val headingDeltaDeg: Double,
    val headingSigmaDeg: Double,
    val speedMps: Double?,
    val uncertaintyGrowthM: Double,
    val zeroVelocityApplied: Boolean,
    val usableMotion: Boolean
)

/** Conservative learned odometry. Raw acceleration is never integrated indefinitely. */
class LearnedOdometryModel {
    private data class Key(val mode: Phase3Mode, val placement: MotionPlacement)
    private val strides = linkedMapOf<Key, StrideStats>()

    fun stride(mode: Phase3Mode, placement: MotionPlacement): StrideStats {
        require(mode == Phase3Mode.WALKING || mode == Phase3Mode.RUNNING)
        return strides[Key(mode, placement)] ?: strides[Key(mode, MotionPlacement.UNKNOWN)] ?: defaultStride(mode)
    }

    fun calibrateStride(
        mode: Phase3Mode,
        placement: MotionPlacement,
        stepDelta: Int,
        distanceM: Double,
        startAccuracyM: Float,
        endAccuracyM: Float
    ): Boolean {
        if (mode != Phase3Mode.WALKING && mode != Phase3Mode.RUNNING) return false
        if (stepDelta !in 4..400 || !distanceM.isFinite() || distanceM !in 3.0..500.0) return false
        if (!startAccuracyM.isFinite() || !endAccuracyM.isFinite() || startAccuracyM > 25f || endAccuracyM > 25f) return false
        val observed = (distanceM / stepDelta).toFloat()
        val allowed = if (mode == Phase3Mode.WALKING) 0.40f..1.25f else 0.60f..2.00f
        if (observed !in allowed) return false
        update(Key(mode, MotionPlacement.UNKNOWN), observed)
        if (placement != MotionPlacement.UNKNOWN) update(Key(mode, placement), observed)
        return true
    }

    private fun update(key: Key, observed: Float) {
        val old = strides[key] ?: defaultStride(key.mode)
        val alpha = when {
            old.samples < 3 -> 0.25f
            old.samples < 10 -> 0.15f
            else -> 0.08f
        }
        val newMean = old.meanM * (1f - alpha) + observed * alpha
        val residual = observed - newMean
        val newVar = (old.varianceM2 * (1f - alpha) + residual * residual * alpha).coerceIn(0.0025f, 0.16f)
        strides[key] = StrideStats(newMean, newVar, (old.samples + 1).coerceAtMost(10_000))
    }

    fun propagate(input: OdometryInput): OdometryDelta {
        val dt = input.dtSec.coerceIn(0.0, 120.0)
        val stationary = input.stationaryScore >= 0.88f && input.stepDelta <= 0
        if (stationary || input.mode == Phase3Mode.STATIONARY && input.stationaryScore >= 0.72f) {
            return OdometryDelta(0.0, max(0.4, dt * 0.08), input.headingDeg?.toDouble(), input.headingDeltaDeg?.toDouble() ?: 0.0,
                if (input.rotationHealthy) 8.0 else 45.0, 0.0, max(0.25, dt * 0.18), true, true)
        }

        val stepLimit = (dt * 5.0 + 8.0).roundToInt().coerceIn(0, 600)
        val steps = input.stepDelta.coerceIn(0, stepLimit)
        val heading = input.headingDeg?.toDouble()
        val headingDelta = input.headingDeltaDeg?.toDouble() ?: 0.0
        val headingSigma = when {
            input.rotationHealthy && heading != null && input.mode == Phase3Mode.VEHICLE -> 5.0
            input.rotationHealthy && heading != null && input.mode == Phase3Mode.BICYCLE -> 7.0
            input.rotationHealthy && heading != null -> 10.0
            heading != null -> 25.0
            else -> 90.0
        }

        return when (input.mode) {
            Phase3Mode.WALKING, Phase3Mode.RUNNING -> {
                val model = stride(input.mode, input.placement)
                val distance = steps * model.meanM.toDouble()
                val sigma = sqrt(max(0.25, steps * model.varianceM2.toDouble())) + distance * 0.08 + dt * 0.12
                val speed = if (dt >= 0.5) distance / dt else null
                val growthRate = if (input.mode == Phase3Mode.RUNNING) 0.55 else 0.38
                OdometryDelta(distance, sigma.coerceAtLeast(1.0), heading, headingDelta, headingSigma, speed,
                    (1.2 + sigma * 0.8 + dt * growthRate).coerceAtLeast(1.0), false, steps > 0 || heading != null)
            }
            Phase3Mode.BICYCLE, Phase3Mode.VEHICLE -> propagateWheeled(input, dt, heading, headingDelta, headingSigma)
            Phase3Mode.UNKNOWN -> {
                if (steps > 0) {
                    val model = stride(Phase3Mode.WALKING, input.placement)
                    val distance = steps * model.meanM.toDouble()
                    OdometryDelta(distance, 3.0 + distance * 0.30 + dt * 0.4, heading, headingDelta, max(headingSigma, 35.0),
                        if (dt >= 0.5) distance / dt else null, 4.0 + distance * 0.25 + dt * 0.8, false, true)
                } else OdometryDelta(0.0, 5.0 + dt, heading, headingDelta, 120.0, null, 5.0 + dt * 1.8, false, false)
            }
            Phase3Mode.STATIONARY -> OdometryDelta(0.0, 2.0 + dt * 0.2, heading, headingDelta, headingSigma, 0.0, 1.0 + dt * 0.3, false, true)
        }
    }

    private fun propagateWheeled(input: OdometryInput, dt: Double, heading: Double?, headingDelta: Double, headingSigma: Double): OdometryDelta {
        val maxSpeed = if (input.mode == Phase3Mode.BICYCLE) 25.0 else 90.0
        val previous = input.previousSpeedMps?.toDouble()?.takeIf { it.isFinite() && it in 0.0..maxSpeed }
        if (previous == null) return OdometryDelta(0.0, 8.0 + dt * 2.0, heading, headingDelta, max(headingSigma, 25.0), null,
            8.0 + dt * if (input.mode == Phase3Mode.VEHICLE) 3.0 else 1.8, false, heading != null)

        val integrationDt = dt.coerceAtMost(12.0)
        val maxAccel = if (input.mode == Phase3Mode.BICYCLE) 2.5 else 4.0
        val accel = if (input.accelerometerHealthy) input.forwardAccelMps2?.toDouble()?.coerceIn(-maxAccel, maxAccel) ?: 0.0 else 0.0
        val predicted = (previous + accel * integrationDt).coerceIn(0.0, maxSpeed)
        val decay = exp(-dt / if (input.mode == Phase3Mode.VEHICLE) 75.0 else 55.0)
        val nextSpeed = predicted * decay
        val distance = ((previous + nextSpeed) * 0.5 * integrationDt).coerceAtLeast(0.0)
        val extraGap = (dt - integrationDt).coerceAtLeast(0.0)
        val sigma = 3.0 + distance * 0.18 + integrationDt * (if (input.mode == Phase3Mode.VEHICLE) 1.2 else 0.8) + extraGap * 5.0
        val growth = 4.0 + sigma * 0.8 + dt * (if (input.mode == Phase3Mode.VEHICLE) 1.8 else 1.1)
        return OdometryDelta(distance, sigma, heading, headingDelta, headingSigma, nextSpeed, growth, false, true)
    }

    fun encode(): String = strides.entries.joinToString(";") { (key, value) ->
        listOf(key.mode.code, key.placement.ordinal, value.meanM, value.varianceM2, value.samples).joinToString(",")
    }

    fun restore(encoded: String?) {
        strides.clear()
        if (encoded.isNullOrBlank()) return
        for (token in encoded.split(';')) {
            val p = token.split(',')
            if (p.size != 5) continue
            val mode = Phase3Mode.entries.firstOrNull { it.code == p[0].toIntOrNull() } ?: continue
            if (mode != Phase3Mode.WALKING && mode != Phase3Mode.RUNNING) continue
            val placement = MotionPlacement.entries.getOrNull(p[1].toIntOrNull() ?: -1) ?: continue
            val mean = p[2].toFloatOrNull()?.takeIf { it.isFinite() } ?: continue
            val variance = p[3].toFloatOrNull()?.takeIf { it.isFinite() && it >= 0f } ?: continue
            val samples = p[4].toIntOrNull()?.coerceIn(0, 10_000) ?: continue
            val allowed = if (mode == Phase3Mode.WALKING) 0.40f..1.25f else 0.60f..2.00f
            if (mean !in allowed) continue
            strides[Key(mode, placement)] = StrideStats(mean, variance.coerceAtMost(0.16f), samples)
        }
    }

    private fun defaultStride(mode: Phase3Mode) = when (mode) {
        Phase3Mode.RUNNING -> StrideStats(1.05f, 0.09f, 0)
        else -> StrideStats(0.72f, 0.04f, 0)
    }
}
