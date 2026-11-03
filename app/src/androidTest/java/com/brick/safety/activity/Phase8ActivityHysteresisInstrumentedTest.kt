package com.brick.safety.activity

import com.brick.safety.testing.BrickInstrumentationTestCase

class Phase8ActivityHysteresisInstrumentedTest : BrickInstrumentationTestCase() {
    fun testLowConfidenceSampleCannotFlipStableTransportMode() {
        assertNull(ActivityModeFilter.sampledMode(ActivityMode.WALKING, ActivityMode.VEHICLE, 35))
        assertEquals(
            ActivityMode.WALKING,
            ActivityModeFilter.sampledMode(ActivityMode.WALKING, ActivityMode.WALKING, 20)
        )
        assertEquals(
            ActivityMode.VEHICLE,
            ActivityModeFilter.sampledMode(ActivityMode.WALKING, ActivityMode.VEHICLE, 80)
        )
    }

    fun testTransitionWithoutConfidenceDegradesToUnknownUntilSampleConfirms() {
        assertEquals(
            ActivityMode.UNKNOWN,
            ActivityModeFilter.transitionMode(ActivityMode.WALKING, ActivityMode.VEHICLE)
        )
        assertNull(ActivityModeFilter.sampledMode(ActivityMode.UNKNOWN, ActivityMode.VEHICLE, 40))
        assertEquals(
            ActivityMode.VEHICLE,
            ActivityModeFilter.sampledMode(ActivityMode.UNKNOWN, ActivityMode.VEHICLE, 75)
        )
    }

    fun testSameModeTransitionDoesNotDiscardExistingClassification() {
        assertEquals(
            ActivityMode.BICYCLE,
            ActivityModeFilter.transitionMode(ActivityMode.BICYCLE, ActivityMode.BICYCLE)
        )
    }
}
