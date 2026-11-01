package com.brick.safety.fusion

import com.brick.safety.atlas.AtlasMatchCandidate
import com.brick.safety.atlas.AtlasRuntimeSnapshot
import com.brick.safety.location.PositionQuality
import com.brick.safety.testing.BrickInstrumentationTestCase

class Phase5LearnedPlaceInstrumentedTest : BrickInstrumentationTestCase() {
    private val now = 1_000_000L
    private val home = LearnedPlaceDefinition("home", "Home", 1.3000, 103.8000, 120f)
    private val school = LearnedPlaceDefinition("school", "School", 1.3300, 103.8200, 150f)

    private fun snapshot(
        lat: Double = 1.3002,
        lon: Double = 103.8001,
        support: Double = 0.82,
        groups: Int = 3,
        signals: Int = 5,
        uncertainty: Float = 55f,
        negative: Double = 0.01,
        ambiguous: Boolean = false,
        observed: Long = now - 1_000L
    ) = AtlasRuntimeSnapshot(
        candidates = listOf(
            AtlasMatchCandidate(
                labelId = "cell:1:2",
                latitude = lat,
                longitude = lon,
                uncertaintyM = uncertainty,
                supportWeight = support,
                matchedSignals = signals,
                independenceGroups = groups,
                negativePenalty = negative,
                ambiguous = ambiguous
            )
        ),
        observedElapsedMs = observed,
        providerStatuses = emptyMap()
    )

    fun testStrongUnambiguousAtlasMapsToExactlyOneConfiguredPlaceArea() {
        val c = LearnedPlaceMatcher.match(listOf(home, school), snapshot(), now)
        assertNotNull(c)
        assertEquals(FusionEvidenceKind.LEARNED_PLACE, c!!.kind)
        assertEquals("atlas.environment", c.independenceGroup)
        assertEquals(PositionQuality.ANCHORED, c.upperState)
        assertEquals(FusionShapeKind.PLACE_AREA, c.shapeHint)
        assertEquals(home.latitude, c.latitude, 0.000001)
        assertEquals(home.longitude, c.longitude, 0.000001)
        assertTrue(c.radiusM >= home.radiusM)
    }

    fun testWeakOrAmbiguousAtlasCannotNameAPlace() {
        assertNull(LearnedPlaceMatcher.match(listOf(home), snapshot(support = 0.40), now))
        assertNull(LearnedPlaceMatcher.match(listOf(home), snapshot(groups = 1), now))
        assertNull(LearnedPlaceMatcher.match(listOf(home), snapshot(signals = 1), now))
        assertNull(LearnedPlaceMatcher.match(listOf(home), snapshot(negative = 0.20), now))
        assertNull(LearnedPlaceMatcher.match(listOf(home), snapshot(ambiguous = true), now))
    }

    fun testStaleAtlasCannotNameAPlace() {
        assertNull(LearnedPlaceMatcher.match(listOf(home), snapshot(observed = now - 46_000L), now))
    }

    fun testOverlappingConfiguredPlacesFailClosedInsteadOfGuessingName() {
        val overlapping = LearnedPlaceDefinition("other", "Other", 1.3001, 103.8001, 150f)
        assertNull(LearnedPlaceMatcher.match(listOf(home, overlapping), snapshot(), now))
    }

    fun testAtlasOutsideConfiguredPlaceDoesNotCreateLearnedPlace() {
        assertNull(LearnedPlaceMatcher.match(listOf(home, school), snapshot(lat = 1.3500, lon = 103.8500), now))
    }

    fun testHugeAtlasUncertaintyCannotAnchorSmallPlace() {
        assertNull(LearnedPlaceMatcher.match(listOf(home), snapshot(uncertainty = 600f), now))
    }

    fun testNamedPlaceSharesAtlasIndependenceGroupToPreventDoubleVote() {
        val place = LearnedPlaceMatcher.match(listOf(home), snapshot(), now)!!
        val genericAtlas = Phase5FusionAdapter.fromAtlas(snapshot(), now)!!
        val result = ParallelEvidenceEngine().fuse(now, listOf(place, genericAtlas))
        assertEquals(1, result.independenceGroups)
        assertEquals(1, result.evidenceUsed.size)
    }
}
