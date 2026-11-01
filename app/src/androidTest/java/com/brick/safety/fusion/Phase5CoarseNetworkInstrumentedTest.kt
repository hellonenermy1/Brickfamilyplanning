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

    fun testCoarseNetworkCannotPullBetterCurrentEvidence() {
        val now = android.os.SystemClock.elapsedRealtime().coerceAtLeast(10_000L)
        val place = FusionConstraint(
            id = "learned-home",
            kind = FusionEvidenceKind.LEARNED_PLACE,
            independenceGroup = "atlas.environment",
            observedElapsedMs = now,
            latitude = 1.3000,
            longitude = 103.8000,
            radiusM = 100f,
            supportWeight = 0.90,
            strength = FusionStrength.STRONG,
            upperState = PositionQuality.ANCHORED,
            maxAgeMs = 60_000L,
            shapeHint = FusionShapeKind.PLACE_AREA,
            explanation = "trusted learned place"
        )
        val wrongCarrierExit = FusionConstraint(
            id = "coarse-network",
            kind = FusionEvidenceKind.COARSE_NETWORK,
            independenceGroup = "network.ip",
            observedElapsedMs = now,
            latitude = 35.6762,
            longitude = 139.6503,
            radiusM = 50_000f,
            supportWeight = 0.12,
            strength = FusionStrength.WEAK,
            upperState = PositionQuality.COARSE,
            maxAgeMs = 300_000L,
            shapeHint = FusionShapeKind.POSSIBLE_AREA,
            explanation = "deliberately wrong carrier egress"
        )

        val selection = Phase5PositionFusion().select(
            nowElapsedMs = now,
            phase3 = null,
            atlas = null,
            anchor = null,
            lastKnown = null,
            learnedPlace = place,
            coarseNetwork = wrongCarrierExit
        )
        assertNotNull(selection)
        selection!!
        assertTrue(selection.result.evidenceUsed.none { it.kind == FusionEvidenceKind.COARSE_NETWORK })
        assertEquals(1.3000, selection.result.latitude!!, 0.000001)
        assertEquals(103.8000, selection.result.longitude!!, 0.000001)
    }

    fun testCoarseNetworkPrecedesLastKnownOnlyWhenCurrentEvidenceIsAbsent() {
        val now = android.os.SystemClock.elapsedRealtime().coerceAtLeast(10_000L)
        val coarse = FusionConstraint(
            id = "coarse-network",
            kind = FusionEvidenceKind.COARSE_NETWORK,
            independenceGroup = "network.ip",
            observedElapsedMs = now,
            latitude = 1.3521,
            longitude = 103.8198,
            radiusM = 50_000f,
            supportWeight = 0.12,
            strength = FusionStrength.WEAK,
            upperState = PositionQuality.COARSE,
            maxAgeMs = 300_000L,
            shapeHint = FusionShapeKind.POSSIBLE_AREA,
            explanation = "coarse network area"
        )
        val last = com.brick.safety.location.PositionQuality.LAST_KNOWN
        assertEquals(PositionQuality.LAST_KNOWN, last)
        val selection = Phase5PositionFusion().select(
            nowElapsedMs = now,
            phase3 = null,
            atlas = null,
            anchor = null,
            lastKnown = Phase5LastKnownInput(1.3000, 103.8000, 500f, now - 30_000L, 600_000L),
            coarseNetwork = coarse
        )
        assertNotNull(selection)
        selection!!
        assertEquals(PositionQuality.COARSE, selection.result.state)
        assertEquals(setOf(FusionEvidenceKind.COARSE_NETWORK), selection.result.evidenceUsed.map { it.kind }.toSet())
    }
}
