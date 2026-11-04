package com.brick.safety.reliability

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** P8C.18: Live failures cannot retry immediately under a validated but unreachable network. */
class LiveRetryPolicyTest {
    @Test fun monotonicallyBacksOffAndCapsAtOneMinute() {
        val delays = (1..12).map(LiveRetryPolicy::delayMs)
        assertEquals(2_000L, delays.first())
        assertEquals(4_000L, delays[1])
        assertEquals(8_000L, delays[2])
        assertEquals(16_000L, delays[3])
        assertEquals(32_000L, delays[4])
        assertEquals(60_000L, delays[5])
        assertTrue(delays.zipWithNext().all { (a, b) -> a > 0L && b >= a })
        assertTrue(delays.all { it <= LiveRetryPolicy.MAX_DELAY_MS })
    }

    @Test fun zeroOrNegativeCountsStillCannotCauseImmediateRetry() {
        assertEquals(LiveRetryPolicy.FIRST_DELAY_MS, LiveRetryPolicy.delayMs(0))
        assertEquals(LiveRetryPolicy.FIRST_DELAY_MS, LiveRetryPolicy.delayMs(-100))
    }
}
