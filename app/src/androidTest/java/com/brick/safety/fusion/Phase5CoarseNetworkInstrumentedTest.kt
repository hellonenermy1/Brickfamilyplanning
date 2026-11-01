package com.brick.safety.fusion

import com.brick.safety.location.PositionQuality
import com.brick.safety.testing.BrickInstrumentationTestCase

class Phase5CoarseNetworkInstrumentedTest : BrickInstrumentationTestCase() {
    private val deviceA = "11111111-1111-4111-8111-111111111111"
    private val deviceB = "22222222-2222-4222-8222-222222222222"

    override fun setUp() {
        super.setUp()
        val context = instrumentation.targetContext
        context.getSharedPreferences("brick", 0).edit().putString("deviceId", deviceA).commit()
        Phase5CoarseNetworkRuntime.initialize(context)
        Phase5CoarseNetworkRuntime.clear()
    }

    override fun tearDown() {
        Phase5CoarseNetworkRuntime.clear()
        super.tearDown()
    }

    fun testCoarseNetworkAlwaysUsesFiftyKilometreAreaAndCoarseState() {
        assertTrue(Phase5CoarseNetworkRuntime.update(deviceA, 1.3521, 103.8198))
        val constraint = Phase5CoarseNetworkRuntime.constraint()
        assertNotNull(constraint)
        constraint!!
        assertEquals(FusionEvidenceKind.COARSE_NETWORK, constraint.kind)
        assertEquals(PositionQuality.COARSE, constraint.upperState)
        assertEquals(50_000f, constraint.radiusM)
        assertEquals(FusionStrength.WEAK, constraint.strength)

        val result = ParallelEvidenceEngine().fuse(constraint.observedElapsedMs, listOf(constraint))
        assertEquals(PositionQuality.COARSE, result.state)
        assertEquals(50_000f, result.uncertaintyM)
        assertTrue(result.state != PositionQuality.PRECISE && result.state != PositionQuality.ASSISTED)
    }

    fun testCoarseNetworkCannotCrossPairingOwnerBoundary() {
        assertTrue(Phase5CoarseNetworkRuntime.update(deviceA, 1.3521, 103.8198))
        val context = instrumentation.targetContext
        context.getSharedPreferences("brick", 0).edit().putString("deviceId", deviceB).commit()
        assertNull(Phase5CoarseNetworkRuntime.constraint())
        assertFalse(Phase5CoarseNetworkRuntime.update(deviceA, 1.3521, 103.8198))
    }

    fun testMalformedCoordinatesFailClosed() {
        assertFalse(Phase5CoarseNetworkRuntime.update(deviceA, 91.0, 103.8))
        assertFalse(Phase5CoarseNetworkRuntime.update(deviceA, 1.3, 181.0))
        assertNull(Phase5CoarseNetworkRuntime.constraint())
    }
}
