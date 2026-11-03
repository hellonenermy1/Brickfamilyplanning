package com.brick.safety.maintenance

/**
 * Local-only hidden maintenance entry.
 *
 * Exact contract: seven logo taps, wait at least ten seconds, then one further tap inside the armed
 * window. There is no PIN, key or backend dependency. Any invalid sequence resets silently.
 */
class MaintenanceEntryGate(
    private val minWaitMs: Long = 10_000L,
    private val armedWindowMs: Long = 30_000L,
    private val firstSevenWindowMs: Long = 8_000L
) {
    private var taps = 0
    private var firstTapMs = 0L
    private var seventhTapMs = 0L

    @Synchronized
    fun onTap(nowElapsedMs: Long): Boolean {
        if (nowElapsedMs <= 0L) {
            reset()
            return false
        }

        if (taps < 7) {
            if (taps == 0) firstTapMs = nowElapsedMs
            if (nowElapsedMs < firstTapMs || nowElapsedMs - firstTapMs > firstSevenWindowMs) {
                reset()
                taps = 1
                firstTapMs = nowElapsedMs
                return false
            }
            taps += 1
            if (taps == 7) seventhTapMs = nowElapsedMs
            return false
        }

        val age = nowElapsedMs - seventhTapMs
        if (age < minWaitMs || age > minWaitMs + armedWindowMs) {
            reset()
            return false
        }

        reset()
        return true
    }

    @Synchronized
    fun reset() {
        taps = 0
        firstTapMs = 0L
        seventhTapMs = 0L
    }
}
