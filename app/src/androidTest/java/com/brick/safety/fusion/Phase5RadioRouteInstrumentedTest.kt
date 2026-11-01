package com.brick.safety.fusion

import android.os.SystemClock
import com.brick.safety.atlas.AtlasMatchCandidate
import com.brick.safety.atlas.AtlasRuntimeSnapshot
import com.brick.safety.location.LocalRouteSegment
import com.brick.safety.location.ParticleEstimate
import com.brick.safety.location.Phase3FallbackEstimate
import com.brick.safety.location.RouteSegmentSource
import com.brick.safety.testing.BrickInstrumentationTestCase

class Phase5RadioRouteInstrumentedTest : BrickInstrumentationTestCase() {
    private val routeA = LocalRouteSegment(
        id = "route-a",
        aLat = 1.3000,
        aLon = 103.8000,
        bLat = 1.3010,
        bLon = 103.8010,
        allowedModeMask = 1,
        observations = 2,
        lastSeenWallMs = 1_700_000_000_000L,
        source = RouteSegmentSource.LEARNED
    )
    private val routeB = LocalRouteSegment(
        id = "route-b",
        aLat = 1.3100,
        aLon = 103.8100,
        bLat = 1.3110,
        bLon = 103.8110,
        allowedModeMask = 1,
        observations = 2,
        lastSeenWallMs = 1_700_000_000_000L,
        source = RouteSegmentSource.LEARNED
    )

    fun testStrongAtlasCanRerankExistingRoutesWithoutMovingPositionTruth() {
        val now = SystemClock.elapsedRealtime().coerceAtLeast(20_000L)
        val original = fallback(listOf(routeA, routeB), listOf("route-a", "route-b"))
        val atlas = atlas(now, lat = 1.3105, lon = 103.8105, support = 0.82, ambiguous = false)

        val reranked = Phase5RadioRouteMatcher.rerank(original, atlas, now)
        assertNotNull(reranked)
        reranked!!
        assertEquals(listOf("route-b", "route-a"), reranked.position.routeCandidateIds)
        assertEquals(original.position.routeCandidateIds.toSet(), reranked.position.routeCandidateIds.toSet())
        assertEquals(original.position.lat, reranked.position.lat, 0.0)
        assertEquals(original.position.lon, reranked.position.lon, 0.0)
        assertEquals(original.position.uncertaintyM, reranked.position.uncertaintyM)
        assertEquals(original.position.routeConstrained, reranked.position.routeConstrained)
    }

    fun testWeakOrAmbiguousAtlasCannotChangeRouteOrdering() {
        val now = SystemClock.elapsedRealtime().coerceAtLeast(20_000L)
        val original = fallback(listOf(routeA, routeB), listOf("route-a", "route-b"))

        val weak = Phase5RadioRouteMatcher.rerank(
            original,
            atlas(now, lat = 1.3105, lon = 103.8105, support = 0.30, ambiguous = false),
            now
        )
        assertEquals(original.position.routeCandidateIds, weak!!.position.routeCandidateIds)

        val ambiguous = Phase5RadioRouteMatcher.rerank(
            original,
            atlas(now, lat = 1.3105, lon = 103.8105, support = 0.90, ambiguous = true),
            now
        )
        assertEquals(original.position.routeCandidateIds, ambiguous!!.position.routeCandidateIds)
    }

    fun testMissingAtlasOrIncompleteGeometryPreservesOriginalOrdering() {
        val now = SystemClock.elapsedRealtime().coerceAtLeast(20_000L)
        val original = fallback(listOf(routeA, routeB), listOf("route-a", "route-b"))
        assertEquals(
            original.position.routeCandidateIds,
            Phase5RadioRouteMatcher.rerank(original, null, now)!!.position.routeCandidateIds
        )

        val incomplete = fallback(listOf(routeA), listOf("route-a", "route-b"))
        val result = Phase5RadioRouteMatcher.rerank(
            incomplete,
            atlas(now, lat = 1.3105, lon = 103.8105, support = 0.90, ambiguous = false),
            now
        )
        assertEquals(incomplete.position.routeCandidateIds, result!!.position.routeCandidateIds)
    }

    fun testHistoricalFrequencyCannotBecomeTruthWithoutStrongCurrentEnvironment() {
        val now = SystemClock.elapsedRealtime().coerceAtLeast(20_000L)
        val frequentOldRoute = routeB.copy(observations = 65_535)
        val original = fallback(listOf(routeA, frequentOldRoute), listOf("route-a", "route-b"))
        val weakCurrentEnvironment = atlas(
            now,
            lat = 1.3105,
            lon = 103.8105,
            support = 0.44,
            ambiguous = false
        )

        val result = Phase5RadioRouteMatcher.rerank(original, weakCurrentEnvironment, now)
        assertEquals(listOf("route-a", "route-b"), result!!.position.routeCandidateIds)
    }

    private fun fallback(routes: List<LocalRouteSegment>, ids: List<String>): Phase3FallbackEstimate =
        Phase3FallbackEstimate(
            position = ParticleEstimate(
                lat = 1.3050,
                lon = 103.8050,
                uncertaintyM = 240f,
                headingDeg = 45f,
                speedMps = 1.2f,
                activeParticles = 96,
                routeCandidateIds = ids,
                routeConstrained = true,
                ageSinceTrustedMs = 45_000L,
                expired = false
            ),
            stepDelta = 12,
            zeroVelocityApplied = false,
            routeHypotheses = routes
        )

    private fun atlas(now: Long, lat: Double, lon: Double, support: Double, ambiguous: Boolean): AtlasRuntimeSnapshot =
        AtlasRuntimeSnapshot(
            candidates = listOf(
                AtlasMatchCandidate(
                    labelId = "cell:1:2",
                    latitude = lat,
                    longitude = lon,
                    uncertaintyM = 60f,
                    supportWeight = support,
                    matchedSignals = 4,
                    independenceGroups = 2,
                    negativePenalty = 0.02,
                    ambiguous = ambiguous
                )
            ),
            observedElapsedMs = now,
            providerStatuses = emptyMap()
        )
}
