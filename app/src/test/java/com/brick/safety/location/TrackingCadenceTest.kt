package com.brick.safety.location

import com.brick.safety.activity.ActivityMode
import org.junit.Assert.assertEquals
import org.junit.Test

class TrackingCadenceTest {
    @Test fun stationaryEvenWhenDeepStationaryIs30Seconds() {
        assertEquals(30_000L, TrackingCadence.intervalMs(ActivityMode.STATIONARY, false, false))
        assertEquals(30_000L, TrackingCadence.maximumBatchDelayMs(30_000L))
        assertEquals(45_000L, TrackingCadence.reacquisitionTriggerMs(30_000L, false))
    }

    @Test fun liveAndSosTakePriorityOverStationary() {
        assertEquals(2_000L, TrackingCadence.intervalMs(ActivityMode.STATIONARY, false, true))
        assertEquals(1_000L, TrackingCadence.intervalMs(ActivityMode.STATIONARY, true, true))
        assertEquals(4_000L, TrackingCadence.reacquisitionTriggerMs(30_000L, true))
    }

    @Test fun movingModesUnchanged() {
        assertEquals(3_000L, TrackingCadence.intervalMs(ActivityMode.VEHICLE, false, false))
        assertEquals(3_000L, TrackingCadence.intervalMs(ActivityMode.RUNNING, false, false))
        assertEquals(4_000L, TrackingCadence.intervalMs(ActivityMode.BICYCLE, false, false))
        assertEquals(5_000L, TrackingCadence.intervalMs(ActivityMode.WALKING, false, false))
        assertEquals(8_000L, TrackingCadence.intervalMs(ActivityMode.UNKNOWN, false, false))
    }
}
