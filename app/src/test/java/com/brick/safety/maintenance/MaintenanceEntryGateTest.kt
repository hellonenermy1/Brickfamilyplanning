package com.brick.safety.maintenance

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MaintenanceEntryGateTest {
    @Test
    fun exactSevenTapsThenTenSecondWaitAndFinalTapOpens() {
        val gate = MaintenanceEntryGate()
        var now = 1_000L
        repeat(7) {
            assertFalse(gate.onTap(now))
            now += 500L
        }
        val seventhAt = now - 500L
        assertFalse(gate.onTap(seventhAt + 9_999L))

        // The early final tap is an invalid sequence and must reset silently.
        now = 30_000L
        repeat(7) {
            assertFalse(gate.onTap(now))
            now += 500L
        }
        val validSeventhAt = now - 500L
        assertTrue(gate.onTap(validSeventhAt + 10_000L))
    }

    @Test
    fun armedWindowExpiryResetsAndDoesNotOpen() {
        val gate = MaintenanceEntryGate()
        var now = 5_000L
        repeat(7) {
            assertFalse(gate.onTap(now))
            now += 400L
        }
        val seventhAt = now - 400L
        assertFalse(gate.onTap(seventhAt + 40_001L))
        assertFalse(gate.onTap(seventhAt + 40_002L))
    }

    @Test
    fun firstSevenMustFitBurstWindow() {
        val gate = MaintenanceEntryGate()
        assertFalse(gate.onTap(1_000L))
        assertFalse(gate.onTap(10_001L))

        var now = 10_101L
        repeat(6) {
            assertFalse(gate.onTap(now))
            now += 500L
        }
        // Only seven taps in the new sequence have now occurred; this is the seventh, not the opener.
        assertFalse(gate.onTap(now))
    }

    @Test
    fun invalidClockInputResetsState() {
        val gate = MaintenanceEntryGate()
        repeat(4) { assertFalse(gate.onTap(1_000L + it * 200L)) }
        assertFalse(gate.onTap(0L))

        var now = 20_000L
        repeat(7) {
            assertFalse(gate.onTap(now))
            now += 300L
        }
        val seventhAt = now - 300L
        assertTrue(gate.onTap(seventhAt + 10_000L))
    }
}
