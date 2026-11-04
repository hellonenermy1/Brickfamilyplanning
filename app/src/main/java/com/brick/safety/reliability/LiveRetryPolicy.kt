package com.brick.safety.reliability

/**
 * Best-effort Live rendering must not busy-loop when Android connectivity is validated but the
 * Brick API is unreachable. Durable Journal, SOS and critical alerts use independent delivery.
 */
object LiveRetryPolicy {
    const val FIRST_DELAY_MS = 2_000L
    const val MAX_DELAY_MS = 60_000L

    fun delayMs(consecutiveFailures: Int): Long {
        val shift = (consecutiveFailures - 1).coerceIn(0, 5)
        return (FIRST_DELAY_MS shl shift).coerceAtMost(MAX_DELAY_MS)
    }
}
