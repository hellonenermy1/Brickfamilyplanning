package com.brick.safety.location

import android.content.Context
import android.os.SystemClock
import com.brick.safety.network.RouteGraphApi
import java.io.Closeable
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** Low-priority route-cache fetcher. Brick Core location/SOS upload never waits on this executor. */
class Phase3RouteGraphController(
    context: Context,
    private val positionEngine: PositionEngine
) : Closeable {
    companion object {
        private const val ATTEMPT_MIN_GAP_MS = 10L * 60L * 1_000L
    }

    private val appContext = context.applicationContext
    private val executor = Executors.newSingleThreadExecutor()
    private val running = AtomicBoolean(false)
    @Volatile private var lastAttemptElapsedMs = 0L

    fun maybeRefresh(baseUrl: String, deviceId: String, sample: PositionSample) {
        if (!sample.rawAccepted || sample.source != PositionSource.FUSED) return
        if (sample.quality != PositionQuality.PRECISE && sample.quality != PositionQuality.ASSISTED) return
        val lat = sample.trustedLat ?: return
        val lon = sample.trustedLon ?: return
        val wall = sample.wallTimeMs.takeIf { it > 0L } ?: return
        if (!positionEngine.shouldRefreshPrivateMap(lat, lon, wall)) return
        val now = SystemClock.elapsedRealtime()
        if (lastAttemptElapsedMs > 0L && now >= lastAttemptElapsedMs && now - lastAttemptElapsedMs < ATTEMPT_MIN_GAP_MS) return
        if (!running.compareAndSet(false, true)) return
        lastAttemptElapsedMs = now
        executor.execute {
            try {
                val result = RouteGraphApi.fetch(baseUrl, deviceId, lat, lon)
                positionEngine.mergePrivateMap(result.centerLat, result.centerLon, result.generatedAtMs, result.segments)
                appContext.getSharedPreferences("brick", Context.MODE_PRIVATE).edit()
                    .putBoolean("phase3RouteGraphHealthy", true)
                    .putLong("lastPhase3RouteGraphSuccessWallMs", System.currentTimeMillis())
                    .apply()
            } catch (_: Throwable) {
                val prefs = appContext.getSharedPreferences("brick", Context.MODE_PRIVATE)
                val total = prefs.getLong("phase3RouteGraphFailureTotal", 0L).coerceAtLeast(0L)
                prefs.edit()
                    .putBoolean("phase3RouteGraphHealthy", false)
                    .putLong("lastPhase3RouteGraphFailureWallMs", System.currentTimeMillis())
                    .putLong("phase3RouteGraphFailureTotal", total + 1L)
                    .apply()
            } finally {
                running.set(false)
            }
        }
    }

    override fun close() {
        executor.shutdownNow()
    }
}
