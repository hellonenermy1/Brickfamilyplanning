package com.brick.safety.atlas

import com.brick.safety.activity.ActivityMode
import com.brick.safety.testing.BrickInstrumentationTestCase

@Suppress("DEPRECATION")
class Phase4TransitionInstrumentedTest : BrickInstrumentationTestCase() {
    private val wall = 1_800_000_000_000L

    private fun wifiScan(elapsed: Long, vararg ids: String): AtlasScan = AtlasScan(
        elapsed,
        wall + elapsed,
        0.85f,
        ids.mapIndexed { index, id ->
            AtlasSignalObservation(
                AtlasSignalKind.WIFI_AP,
                id,
                "wifi.scan",
                -45f - index * 4f,
                0.85f
            )
        }
    )

    fun testMinorRadioChurnDoesNotCreateTransitionButMaterialChangeDoes() {
        val tracker = AtlasTransitionTracker()
        val first = tracker.augmentSource(
            "wifi",
            wifiScan(1_000L, "wifi:aaaaaaaaaaaaaaaaaaaaaaaa", "wifi:bbbbbbbbbbbbbbbbbbbbbbbb")
        )
        assertFalse(first.observations.any { it.kind == AtlasSignalKind.TRANSITION })

        // Same two APs plus one transient AP has high overlap and is ignored as ordinary scan churn.
        val minor = tracker.augmentSource(
            "wifi",
            wifiScan(
                2_000L,
                "wifi:aaaaaaaaaaaaaaaaaaaaaaaa",
                "wifi:bbbbbbbbbbbbbbbbbbbbbbbb",
                "wifi:cccccccccccccccccccccccc"
            )
        )
        assertFalse(minor.observations.any { it.kind == AtlasSignalKind.TRANSITION })

        val changed = tracker.augmentSource(
            "wifi",
            wifiScan(3_000L, "wifi:dddddddddddddddddddddddd", "wifi:eeeeeeeeeeeeeeeeeeeeeeee")
        )
        val transition = changed.observations.firstOrNull { it.kind == AtlasSignalKind.TRANSITION }
        assertNotNull(transition)
        assertEquals("wifi.scan", transition!!.independenceGroup)
        assertTrue(transition.signalId.startsWith("trans:"))
        assertTrue(transition.quality <= 0.70f)
    }

    fun testActivityApproachSequenceStaysDerivedAndLowTrust() {
        val tracker = AtlasTransitionTracker()
        assertNull(tracker.activityTransition(ActivityMode.VEHICLE, 90, 10_000L, wall + 10_000L))

        val stop = tracker.activityTransition(ActivityMode.STATIONARY, 90, 20_000L, wall + 20_000L)
        assertNotNull(stop)
        assertEquals(1, stop!!.observations.count { it.kind == AtlasSignalKind.TRANSITION })
        assertEquals("activity.transition", stop.observations.first().independenceGroup)

        val walking = tracker.activityTransition(ActivityMode.WALKING, 85, 30_000L, wall + 30_000L)
        assertNotNull(walking)
        assertTrue(walking!!.observations.count { it.kind == AtlasSignalKind.TRANSITION } >= 2)
        assertTrue(walking.observations.any { it.signalId.startsWith("seq:") })
        assertTrue(walking.observations.all { it.quality <= 0.60f })
    }

    fun testWeakOrUnknownActivityDoesNotTeachSequence() {
        val tracker = AtlasTransitionTracker()
        assertNull(tracker.activityTransition(ActivityMode.VEHICLE, 20, 1_000L, wall + 1_000L))
        assertNull(tracker.activityTransition(ActivityMode.UNKNOWN, 95, 2_000L, wall + 2_000L))
        assertNull(tracker.activityTransition(ActivityMode.WALKING, 90, 3_000L, wall + 3_000L))
    }

    fun testZoneGridIsStableNearbyAndChangesAcrossAreas() {
        val a = AtlasGrid.zoneFor(1.30000, 103.80000)
        val b = AtlasGrid.zoneFor(1.30010, 103.80010)
        val far = AtlasGrid.zoneFor(1.31000, 103.81000)
        assertEquals(a, b)
        assertFalse(a == far)
        assertTrue(a.startsWith("zone:"))
    }
}
