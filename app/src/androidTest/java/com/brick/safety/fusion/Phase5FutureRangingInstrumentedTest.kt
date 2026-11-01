package com.brick.safety.fusion

import com.brick.safety.location.GeoMath
import com.brick.safety.testing.BrickInstrumentationTestCase

class Phase5FutureRangingInstrumentedTest : BrickInstrumentationTestCase() {
    private val now = 1_000_000L

    fun testDirectionReweightsExistingHypothesesWithoutCreatingPosition() {
        val direction = AuthenticatedDirectionConstraint(
            id = "dir:test",
            technology = RangeTechnology.UWB,
            independenceGroup = "uwb.peer",
            observedElapsedMs = now - 1_000L,
            sourceLatitude = 1.3000,
            sourceLongitude = 103.8000,
            bearingDeg = 90f,
            bearingUncertaintyDeg = 10f,
            supportWeight = 0.9,
            maxAgeMs = 30_000L,
            authenticated = true
        )
        val east = GeoMath.project(1.3000, 103.8000, 50.0, 90.0)
        val west = GeoMath.project(1.3000, 103.8000, 50.0, 270.0)
        assertTrue(direction.likelihoodAt(east.first, east.second, now) > 0.85)
        assertTrue(direction.likelihoodAt(west.first, west.second, now) < 0.05)
        assertEquals(0.0, direction.likelihoodAt(1.3000, 103.8000, now), 0.0)
    }

    fun testUnauthenticatedOrStaleDirectionCannotInfluenceHypotheses() {
        val point = GeoMath.project(1.3000, 103.8000, 40.0, 0.0)
        val unauthenticated = direction(authenticated = false)
        assertEquals(0.0, unauthenticated.likelihoodAt(point.first, point.second, now), 0.0)
        val stale = direction(observedElapsedMs = now - 31_000L)
        assertEquals(0.0, stale.likelihoodAt(point.first, point.second, now), 0.0)
    }

    fun testMissingFutureProviderIsExplicitlyUnsupported() {
        val snapshot = AuthenticatedRangingCapabilities.snapshot(emptyList(), now)
        for (technology in RangeTechnology.entries) {
            assertEquals(RangeCapability.UNSUPPORTED, snapshot.getValue(technology).capability)
            assertTrue(snapshot.getValue(technology).ranges.isEmpty())
            assertTrue(snapshot.getValue(technology).directions.isEmpty())
        }
    }

    fun testProviderReportsRuntimePermissionStateInsteadOfPretendingSupport() {
        val provider = object : AuthenticatedRangingProvider {
            override val technology = RangeTechnology.BLUETOOTH_CHANNEL_SOUNDING
            override fun snapshot(nowElapsedMs: Long) = AuthenticatedRangingSnapshot(
                technology,
                RangeCapability.PERMISSION_REQUIRED
            )
        }
        val snapshot = AuthenticatedRangingCapabilities.snapshot(listOf(provider), now)
        assertEquals(RangeCapability.PERMISSION_REQUIRED, snapshot.getValue(provider.technology).capability)
        assertTrue(snapshot.getValue(provider.technology).ranges.isEmpty())
    }

    fun testProviderFailureIsIsolatedAndDoesNotCrashCapabilitySnapshot() {
        val provider = object : AuthenticatedRangingProvider {
            override val technology = RangeTechnology.WIFI_NAN_RTT
            override fun snapshot(nowElapsedMs: Long): AuthenticatedRangingSnapshot = error("provider died")
        }
        val snapshot = AuthenticatedRangingCapabilities.snapshot(listOf(provider), now)
        assertEquals(RangeCapability.FAILED, snapshot.getValue(provider.technology).capability)
        assertEquals(RangeCapability.UNSUPPORTED, snapshot.getValue(RangeTechnology.UWB).capability)
    }

    fun testNonSupportedCapabilityCannotCarryCachedMeasurements() {
        val range = AuthenticatedRangeConstraint(
            id = "range:test",
            technology = RangeTechnology.UWB,
            independenceGroup = "uwb.peer",
            observedElapsedMs = now - 1_000L,
            sourceLatitude = 1.3000,
            sourceLongitude = 103.8000,
            sourceUncertaintyM = 5f,
            rangeM = 20f,
            rangeStdDevM = 2f,
            supportWeight = 0.8,
            maxAgeMs = 30_000L,
            authenticated = true
        )
        var rejected = false
        try {
            AuthenticatedRangingSnapshot(
                RangeTechnology.UWB,
                RangeCapability.TEMPORARILY_UNAVAILABLE,
                ranges = listOf(range)
            )
        } catch (_: IllegalArgumentException) {
            rejected = true
        }
        assertTrue(rejected)
    }

    private fun direction(
        authenticated: Boolean = true,
        observedElapsedMs: Long = now - 1_000L
    ) = AuthenticatedDirectionConstraint(
        id = "dir:test",
        technology = RangeTechnology.OTHER_AUTHENTICATED,
        independenceGroup = "range.other",
        observedElapsedMs = observedElapsedMs,
        sourceLatitude = 1.3000,
        sourceLongitude = 103.8000,
        bearingDeg = 0f,
        bearingUncertaintyDeg = 10f,
        supportWeight = 0.8,
        maxAgeMs = 30_000L,
        authenticated = authenticated
    )
}
