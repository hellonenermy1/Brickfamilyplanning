package com.brick.safety.location

/**
 * This is the exact BrickLocationService measured-freshness acceptance boundary.
 * Callback arrival time must never make a rejected/stale/fallback fix count as a fresh
 * FusedLocationProvider measurement (P8C-002).
 */
object MeasuredFixGate {
    fun acceptedElapsed(sample: PositionSample, callbackElapsedMs: Long): Long? {
        if (!sample.rawAccepted || sample.source != PositionSource.FUSED) return null
        val measurement = sample.elapsedRealtimeMs
        return measurement.takeIf { it > 0L && it <= callbackElapsedMs }
    }

    fun clearsReacquisition(measurementElapsedMs: Long, callbackElapsedMs: Long, triggerMs: Long): Boolean =
        triggerMs > 0L && measurementElapsedMs > 0L &&
            measurementElapsedMs <= callbackElapsedMs &&
            callbackElapsedMs - measurementElapsedMs <= triggerMs
}
