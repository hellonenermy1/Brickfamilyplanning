package com.brick.safety.location

import android.test.InstrumentationTestCase

@Suppress("DEPRECATION")
class Phase3ConsistencyInstrumentedTest : InstrumentationTestCase() {
    private fun fix(
        lat: Double = 1.3000,
        lon: Double = 103.8000,
        elapsedMs: Long = 10_000L,
        speedMps: Float? = null,
        speedAcc: Float? = null,
        bearing: Float? = null,
        bearingAcc: Float? = null,
        accuracyM: Float = 5f
    ) = ConsistencyFix(lat, lon, accuracyM, elapsedMs, speedMps, speedAcc, bearing, bearingAcc)

    private fun motion(
        mode: Phase3Mode,
        confidence: Int = 90,
        steps: Int = 8,
        stepSensor: Boolean = true,
        stationary: Float = 0.1f,
        placement: MotionPlacement = MotionPlacement.UNKNOWN,
        rotationHealthy: Boolean = false,
        heading: Float? = null,
        headingAgeMs: Long? = null
    ) = ConsistencyMotion(mode, confidence, steps, stepSensor, stationary, placement, rotationHealthy, heading, headingAgeMs)

    fun testNormalWalkAndWeakSensorsFailOpen() {
        val previous = fix(speedMps = 1.2f, bearing = 90f)
        val normal = fix(lon = 103.80012, elapsedMs = 20_000L, speedMps = 1.4f, speedAcc = 0.8f, bearing = 92f, bearingAcc = 12f)
        val result = PositionConsistencyGuard.evaluate(previous, normal, motion(Phase3Mode.WALKING, steps = 12))
        assertTrue(result.accepted)
        assertEquals(FixConsistencyReason.ACCEPT, result.reason)

        // A phone in a bag or with unhealthy rotation is never rejected just because its physical
        // orientation disagrees with GPS travel bearing.
        val turn = fix(lon = 103.80060, elapsedMs = 20_000L, speedMps = 4f, speedAcc = 1f, bearing = 270f, bearingAcc = 8f)
        val weak = PositionConsistencyGuard.evaluate(previous, turn, motion(
            Phase3Mode.WALKING,
            steps = 10,
            stepSensor = false,
            placement = MotionPlacement.POCKET_OR_BAG_LIKELY,
            rotationHealthy = false,
            heading = 90f,
            headingAgeMs = 200L
        ))
        assertTrue(weak.accepted)
    }

    fun testStationaryJumpRejectedOnlyWithStrongMotionAgreement() {
        val previous = fix(speedMps = 0f)
        val jumped = fix(lon = 103.8010, elapsedMs = 20_000L, speedMps = 0.2f, speedAcc = 0.5f)
        val rejected = PositionConsistencyGuard.evaluate(previous, jumped, motion(
            Phase3Mode.STATIONARY,
            confidence = 95,
            steps = 0,
            stationary = 0.94f
        ))
        assertFalse(rejected.accepted)
        assertEquals(FixConsistencyReason.STATIONARY_CONTRADICTION, rejected.reason)

        val uncertain = PositionConsistencyGuard.evaluate(previous, jumped, motion(
            Phase3Mode.UNKNOWN,
            confidence = 0,
            steps = 0,
            stepSensor = false,
            stationary = 0.2f
        ))
        assertTrue(uncertain.accepted)
    }

    fun testWalkingJumpWithoutStepsRejected() {
        val previous = fix(speedMps = 1.2f)
        val jumped = fix(lon = 103.80070, elapsedMs = 20_000L, speedMps = 4f, speedAcc = 1f)
        val result = PositionConsistencyGuard.evaluate(previous, jumped, motion(
            Phase3Mode.WALKING,
            confidence = 90,
            steps = 0,
            stepSensor = true,
            stationary = 0.62f
        ))
        assertFalse(result.accepted)
        assertEquals(FixConsistencyReason.STEP_CONTRADICTION, result.reason)
    }

    fun testExtremeAccelerationRejectedButPlausibleVehicleChangeAccepted() {
        val walkingPrev = fix(speedMps = 1f)
        val impossible = fix(lon = 103.80015, elapsedMs = 11_000L, speedMps = 12f, speedAcc = 0.5f)
        val bad = PositionConsistencyGuard.evaluate(walkingPrev, impossible, motion(Phase3Mode.WALKING, stepSensor = false))
        assertFalse(bad.accepted)
        assertEquals(FixConsistencyReason.EXTREME_ACCELERATION, bad.reason)

        val vehiclePrev = fix(speedMps = 10f, bearing = 90f)
        val vehicle = fix(lon = 103.80040, elapsedMs = 12_000L, speedMps = 30f, speedAcc = 1f, bearing = 90f, bearingAcc = 8f)
        val good = PositionConsistencyGuard.evaluate(vehiclePrev, vehicle, motion(Phase3Mode.VEHICLE, stepSensor = false))
        assertTrue(good.accepted)
    }

    fun testHighQualitySuddenReverseNeedsPriorHeadingAgreement() {
        val previous = fix(speedMps = 2f, bearing = 90f)
        val reversed = fix(lon = 103.80060, elapsedMs = 20_000L, speedMps = 4f, speedAcc = 1f, bearing = 270f, bearingAcc = 8f)
        val result = PositionConsistencyGuard.evaluate(previous, reversed, motion(
            Phase3Mode.WALKING,
            confidence = 95,
            steps = 10,
            stepSensor = true,
            stationary = 0.1f,
            placement = MotionPlacement.HAND_LIKELY,
            rotationHealthy = true,
            heading = 92f,
            headingAgeMs = 200L
        ))
        assertFalse(result.accepted)
        assertEquals(FixConsistencyReason.HEADING_CONTRADICTION, result.reason)

        val noPriorAlignment = PositionConsistencyGuard.evaluate(previous.copy(bearingDeg = 180f), reversed, motion(
            Phase3Mode.WALKING,
            confidence = 95,
            steps = 10,
            stepSensor = true,
            stationary = 0.1f,
            placement = MotionPlacement.HAND_LIKELY,
            rotationHealthy = true,
            heading = 92f,
            headingAgeMs = 200L
        ))
        assertTrue(noPriorAlignment.accepted)
    }

    fun testHardPhysicsSpikeRejectedWithoutSensorHelp() {
        val previous = fix()
        val teleport = fix(lon = 103.8020, elapsedMs = 15_000L)
        val result = PositionConsistencyGuard.evaluate(previous, teleport, motion(
            Phase3Mode.WALKING,
            confidence = 0,
            steps = 0,
            stepSensor = false,
            stationary = 0f
        ))
        assertFalse(result.accepted)
        assertEquals(FixConsistencyReason.PHYSICS_SPEED, result.reason)
    }
}
