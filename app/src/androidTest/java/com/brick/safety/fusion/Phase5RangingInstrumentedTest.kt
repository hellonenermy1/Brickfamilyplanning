package com.brick.safety.fusion

import com.brick.safety.location.GeoMath
import com.brick.safety.testing.BrickInstrumentationTestCase

class Phase5RangingInstrumentedTest : BrickInstrumentationTestCase() {
    private val now = 1_000_000L

    private fun constraint(
        technology: RangeTechnology = RangeTechnology.WIFI_RTT,
        sourceUncertaintyM: Float = 10f,
        rangeM: Float = 100f,
        stdDevM: Float? = 5f,
        authenticated: Boolean = true,
        observedElapsedMs: Long = now - 1_000L,
        maxAgeMs: Long = 30_000L
    ) = AuthenticatedRangeConstraint(
        id = "range:test",
        technology = technology,
        independenceGroup = "wifi.scan",
        observedElapsedMs = observedElapsedMs,
        sourceLatitude = 1.3000,
        sourceLongitude = 103.8000,
        sourceUncertaintyM = sourceUncertaintyM,
        rangeM = rangeM,
        rangeStdDevM = stdDevM,
        supportWeight = 0.85,
        maxAgeMs = maxAgeMs,
        authenticated = authenticated
    )

    fun testRangeCreatesAnnulusRatherThanExactPoint() {
        val c = constraint(sourceUncertaintyM = 10f, rangeM = 100f, stdDevM = 5f)
        val annulus = c.annulus()
        // allowance = source uncertainty 10 m + 2*stddev 10 m.
        assertEquals(20f, annulus.allowanceM, 0.001f)
        assertEquals(80f, annulus.innerRadiusM, 0.001f)
        assertEquals(120f, annulus.outerRadiusM, 0.001f)
        assertTrue(annulus.innerRadiusM < annulus.outerRadiusM)

        // The source coordinate is the ranging peer/anchor, not a child-position estimate. Because
        // the range model deliberately keeps an uncertainty tail instead of a brittle hard cutoff,
        // the peer can retain tiny residual support but must score vastly below a hypothesis on the
        // measured ring.
        val sourceScore = c.likelihoodAt(c.sourceLatitude, c.sourceLongitude, now)
        val onRing = GeoMath.project(c.sourceLatitude, c.sourceLongitude, 100.0, 90.0)
        val ringScore = c.likelihoodAt(onRing.first, onRing.second, now)
        assertTrue(sourceScore >= 0.0)
        assertTrue(sourceScore < 0.02)
        assertTrue(ringScore > 0.80)
        assertTrue(ringScore > sourceScore * 20.0)
    }

    fun testHypothesisInsideAnnulusScoresHigherThanFarHypothesis() {
        val c = constraint(rangeM = 100f, stdDevM = 4f)
        val inside = GeoMath.project(c.sourceLatitude, c.sourceLongitude, 100.0, 90.0)
        val far = GeoMath.project(c.sourceLatitude, c.sourceLongitude, 600.0, 90.0)
        val insideScore = c.likelihoodAt(inside.first, inside.second, now)
        val farScore = c.likelihoodAt(far.first, far.second, now)
        assertTrue(insideScore > 0.80)
        assertTrue(farScore < insideScore)
        assertTrue(farScore < 0.05)
    }

    fun testUnauthenticatedOrStaleRangeCannotInfluenceHypotheses() {
        val point = GeoMath.project(1.3000, 103.8000, 100.0, 0.0)
        val unauthenticated = constraint(authenticated = false)
        assertEquals(0.0, unauthenticated.likelihoodAt(point.first, point.second, now), 0.0)

        val stale = constraint(observedElapsedMs = now - 31_000L, maxAgeMs = 30_000L)
        assertEquals(0.0, stale.likelihoodAt(point.first, point.second, now), 0.0)
    }

    fun testSourceUncertaintyExpandsAnnulusConservatively() {
        val tight = constraint(sourceUncertaintyM = 5f, stdDevM = 2f).annulus()
        val loose = constraint(sourceUncertaintyM = 80f, stdDevM = 2f).annulus()
        assertTrue(loose.allowanceM > tight.allowanceM)
        assertTrue(loose.innerRadiusM <= tight.innerRadiusM)
        assertTrue(loose.outerRadiusM >= tight.outerRadiusM)
    }

    fun testMissingStandardDeviationUsesTechnologySpecificConservativeAllowance() {
        val wifi = constraint(technology = RangeTechnology.WIFI_RTT, sourceUncertaintyM = 0f, stdDevM = null).annulus()
        val uwb = constraint(technology = RangeTechnology.UWB, sourceUncertaintyM = 0f, stdDevM = null).annulus()
        val generic = constraint(technology = RangeTechnology.OTHER_AUTHENTICATED, sourceUncertaintyM = 0f, stdDevM = null).annulus()
        assertEquals(15f, wifi.allowanceM, 0.001f)
        assertEquals(5f, uwb.allowanceM, 0.001f)
        assertEquals(25f, generic.allowanceM, 0.001f)
    }

    fun testDistanceResidualDoesNotInventDirection() {
        val c = constraint(rangeM = 100f)
        val east = GeoMath.project(c.sourceLatitude, c.sourceLongitude, 100.0, 90.0)
        val west = GeoMath.project(c.sourceLatitude, c.sourceLongitude, 100.0, 270.0)
        assertTrue(c.distanceResidualM(east.first, east.second) < 1.0)
        assertTrue(c.distanceResidualM(west.first, west.second) < 1.0)
        assertEquals(
            c.likelihoodAt(east.first, east.second, now),
            c.likelihoodAt(west.first, west.second, now),
            0.01
        )
    }
}
