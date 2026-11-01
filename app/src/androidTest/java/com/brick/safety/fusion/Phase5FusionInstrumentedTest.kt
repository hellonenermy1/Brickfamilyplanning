package com.brick.safety.fusion

import com.brick.safety.atlas.AtlasMatchCandidate
import com.brick.safety.atlas.AtlasRuntimeSnapshot
import com.brick.safety.location.GeoMath
import com.brick.safety.location.PositionQuality
import com.brick.safety.testing.BrickInstrumentationTestCase

class Phase5FusionInstrumentedTest : BrickInstrumentationTestCase() {
    private val engine = ParallelEvidenceEngine()

    private fun c(
        id: String,
        group: String,
        lat: Double,
        lon: Double,
        radius: Float,
        weight: Double,
        strength: FusionStrength = FusionStrength.MEDIUM,
        kind: FusionEvidenceKind = FusionEvidenceKind.ATLAS,
        state: PositionQuality = PositionQuality.ESTIMATED,
        shape: FusionShapeKind = FusionShapeKind.CIRCLE,
        now: Long = 1_000_000L
    ) = FusionConstraint(
        id = id,
        kind = kind,
        independenceGroup = group,
        observedElapsedMs = now - 1_000L,
        latitude = lat,
        longitude = lon,
        radiusM = radius,
        supportWeight = weight,
        strength = strength,
        upperState = state,
        maxAgeMs = 120_000L,
        shapeHint = shape,
        explanation = id
    )

    fun testCorrelatedEvidenceDoesNotMultiplyIndependence() {
        val now = 1_000_000L
        val result = engine.fuse(now, listOf(
            c("wifi-bssid", "wifi.scan.1", 1.3000, 103.8000, 60f, 0.8, now = now),
            c("wifi-ssid", "wifi.scan.1", 1.3001, 103.8001, 70f, 0.7, now = now),
            c("wifi-rssi", "wifi.scan.1", 1.3000, 103.8000, 80f, 0.6, now = now)
        ))
        assertEquals(1, result.independenceGroups)
        assertEquals(1, result.evidenceUsed.size)
        assertTrue(result.uncertaintyM >= 120f)
    }

    fun testWeakEvidenceAloneCannotCreateTightPosition() {
        val now = 1_000_000L
        val result = engine.fuse(now, listOf(
            c("ssid-semantic", "wifi.semantic", 1.3000, 103.8000, 25f, 0.85, FusionStrength.WEAK,
                FusionEvidenceKind.WIFI_SEMANTIC, PositionQuality.ESTIMATED, now = now)
        ))
        assertEquals(PositionQuality.ESTIMATED, result.state)
        assertTrue(result.uncertaintyM >= 250f)
    }

    fun testIndependentAgreementCanShrinkButNeverToPrecise() {
        val now = 1_000_000L
        val result = engine.fuse(now, listOf(
            c("motion", "motion", 1.30000, 103.80000, 90f, 0.85, FusionStrength.MEDIUM,
                FusionEvidenceKind.MOTION_PARTICLE, PositionQuality.ESTIMATED, FusionShapeKind.CORRIDOR, now),
            c("atlas", "wifi.cluster", 1.30012, 103.80010, 70f, 0.90, FusionStrength.STRONG,
                FusionEvidenceKind.ATLAS, PositionQuality.ESTIMATED, FusionShapeKind.POSSIBLE_AREA, now)
        ))
        assertTrue(result.hasPosition)
        assertEquals(2, result.independenceGroups)
        assertTrue(result.uncertaintyM >= 35f)
        assertTrue(result.state != PositionQuality.PRECISE && result.state != PositionQuality.ASSISTED)
    }

    fun testConflictExpandsUncertaintyInsteadOfChoosingOneAnswer() {
        val now = 1_000_000L
        val agreeing = engine.fuse(now, listOf(
            c("a", "a", 1.3000, 103.8000, 60f, 0.9, FusionStrength.STRONG, now = now),
            c("b", "b", 1.3001, 103.8001, 60f, 0.9, FusionStrength.STRONG, now = now)
        ))
        val conflicting = engine.fuse(now, listOf(
            c("a", "a", 1.3000, 103.8000, 60f, 0.9, FusionStrength.STRONG, now = now),
            c("b", "b", 1.3200, 103.8200, 60f, 0.9, FusionStrength.STRONG, now = now)
        ))
        assertTrue(conflicting.conflicts.isNotEmpty())
        assertTrue(conflicting.uncertaintyM > agreeing.uncertaintyM)
        assertTrue(conflicting.state == PositionQuality.COARSE || conflicting.confidenceBand == FusionConfidenceBand.VERY_LOW)
    }

    fun testStrongGroundReceiverProducesAreaNotExactPoint() {
        val now = 1_000_000L
        val result = engine.fuse(now, listOf(
            c("receiver-school-gate", "receiver.school-gate", 1.3200, 103.8100, 45f, 1.0,
                FusionStrength.AUTHORITATIVE_AREA, FusionEvidenceKind.GROUND_RECEIVER,
                PositionQuality.ANCHORED, FusionShapeKind.RECEIVER_AREA, now)
        ))
        assertEquals(PositionQuality.ANCHORED, result.state)
        assertEquals(FusionShapeKind.RECEIVER_AREA, result.shape)
        assertTrue(result.uncertaintyM >= 45f)
    }

    fun testStaleEvidenceIsExcluded() {
        val now = 1_000_000L
        val stale = FusionConstraint(
            id = "stale",
            kind = FusionEvidenceKind.ATLAS,
            independenceGroup = "atlas",
            observedElapsedMs = now - 121_000L,
            latitude = 1.3,
            longitude = 103.8,
            radiusM = 80f,
            supportWeight = 0.9,
            strength = FusionStrength.STRONG,
            upperState = PositionQuality.ESTIMATED,
            maxAgeMs = 120_000L,
            explanation = "stale"
        )
        val result = engine.fuse(now, listOf(stale))
        assertEquals(PositionQuality.UNKNOWN, result.state)
        assertFalse(result.hasPosition)
    }

    fun testDistinctiveAtlasCandidateStillCannotBecomeNamedPlaceAnchor() {
        val now = 1_000_000L
        val snapshot = AtlasRuntimeSnapshot(
            candidates = listOf(
                AtlasMatchCandidate(
                    labelId = "cell:100:200",
                    latitude = 1.3000,
                    longitude = 103.8000,
                    uncertaintyM = 35f,
                    supportWeight = 0.90,
                    matchedSignals = 6,
                    independenceGroups = 3,
                    negativePenalty = 0.0,
                    ambiguous = false
                )
            ),
            observedElapsedMs = now - 1_000L,
            providerStatuses = emptyMap()
        )
        val constraint = Phase5FusionAdapter.fromAtlas(snapshot, now)
        assertNotNull(constraint)
        assertEquals(FusionEvidenceKind.ATLAS, constraint!!.kind)
        assertEquals(PositionQuality.ESTIMATED, constraint.upperState)
        val result = engine.fuse(now, listOf(constraint))
        assertEquals(PositionQuality.ESTIMATED, result.state)
        assertTrue(result.state != PositionQuality.ANCHORED)
    }

    fun testTinyRadiusWeakEvidenceCannotOutvoteBroaderAuthoritativeArea() {
        val now = 1_000_000L
        val strongLat = 1.3000
        val strongLon = 103.8000
        val weakLat = 1.3100
        val weakLon = 103.8100
        val result = engine.fuse(now, listOf(
            c("receiver", "ground.receiver", strongLat, strongLon, 250f, 1.0,
                FusionStrength.AUTHORITATIVE_AREA, FusionEvidenceKind.GROUND_RECEIVER,
                PositionQuality.ANCHORED, FusionShapeKind.RECEIVER_AREA, now),
            c("tiny-weak", "wifi.semantic", weakLat, weakLon, 25f, 1.0,
                FusionStrength.WEAK, FusionEvidenceKind.WIFI_SEMANTIC,
                PositionQuality.ESTIMATED, FusionShapeKind.CIRCLE, now)
        ))
        assertTrue(result.hasPosition)
        val dStrong = GeoMath.distanceMeters(result.latitude!!, result.longitude!!, strongLat, strongLon)
        val dWeak = GeoMath.distanceMeters(result.latitude, result.longitude, weakLat, weakLon)
        assertTrue(dStrong <= dWeak)
        assertTrue(result.conflicts.isNotEmpty())
        assertTrue(result.uncertaintyM >= 250f)
    }
}
