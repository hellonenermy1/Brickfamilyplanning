package com.brick.safety.location

import com.brick.safety.activity.ActivityMode

/**
 * Normal-operation targets, not a guarantee against Android/ColorOS throttling or network loss.
 * Stationary and deep-stationary fixes remain bounded to a 30s request interval (#31).
 */
internal object TrackingCadence {
    const val STATIONARY_INTERVAL_MS = 30_000L

    fun intervalMs(mode: ActivityMode, sosActive: Boolean, liveActive: Boolean): Long {
        if (sosActive) return 1_000L
        if (liveActive) return 2_000L
        return when (mode) {
            ActivityMode.VEHICLE, ActivityMode.RUNNING -> 3_000L
            ActivityMode.BICYCLE -> 4_000L
            ActivityMode.WALKING -> 5_000L
            ActivityMode.STATIONARY -> STATIONARY_INTERVAL_MS
            ActivityMode.UNKNOWN -> 8_000L
        }
    }

    fun maximumBatchDelayMs(intervalMs: Long): Long =
        if (intervalMs >= STATIONARY_INTERVAL_MS) intervalMs
        else if (intervalMs <= 1_000L) 1_000L
        else maxOf(intervalMs * 2, 6_000L)

    fun reacquisitionTriggerMs(intervalMs: Long, sosActive: Boolean): Long =
        if (sosActive) 4_000L
        else if (intervalMs >= STATIONARY_INTERVAL_MS) intervalMs + 15_000L
        else maxOf(10_000L, intervalMs * 2 + 3_000L)
}
