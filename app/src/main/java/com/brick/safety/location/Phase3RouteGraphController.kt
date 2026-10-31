package com.brick.safety.location

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.SystemClock
import com.brick.safety.network.RouteGraphApi
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** Low-priority route-cache fetcher. Brick Core location/SOS upload never waits on this executor. */
object Phase3RouteGraphController {
    private const val ATTEMPT_MIN_GAP_MS = 10L * 60L * 1_000L
    private val executor = Executors.newSingleThreadExecutor()
    private val running = AtomicBoolean(false)
    @Volatile private var lastAttemptElapsedMs = 0L

    fun maybeRefresh(context: Context, phase3: Phase3PositioningEngine, sample: PositionSample) {
        if (!sample.rawAccepted || sample.source != PositionSource.FUSED) return
        if (sample.quality != PositionQuality.PRECISE && sample.quality != PositionQuality.ASSISTED) return
        val lat = sample.trustedLat ?: return
        val lon = sample.trustedLon ?: return
        val wall = sample.wallTimeMs.takeIf { it > 0L } ?: return
        if (!phase3.shouldRefreshPrivateMap(lat, lon, wall)) return

        val appContext = context.applicationContext
        val connectivity = appContext.getSystemService(ConnectivityManager::class.java)
        val network = connectivity.activeNetwork ?: return
        val caps = connectivity.getNetworkCapabilities(network) ?: return
        if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) ||
            !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) return

        val prefs = appContext.getSharedPreferences("brick", Context.MODE_PRIVATE)
        val deviceId = prefs.getString("deviceId", null)?.takeIf { it.isNotBlank() } ?: return
        val baseUrl = prefs.getString("apiBase", null)?.takeIf { it.isNotBlank() } ?: return

        val now = SystemClock.elapsedRealtime()
        if (lastAttemptElapsedMs > 0L && now >= lastAttemptElapsedMs && now - lastAttemptElapsedMs < ATTEMPT_MIN_GAP_MS) return
        if (!running.compareAndSet(false, true)) return
        lastAttemptElapsedMs = now
        executor.execute {
            try {
                val result = RouteGraphApi.fetch(baseUrl, deviceId, lat, lon)
                phase3.mergePrivateMap(result.centerLat, result.centerLon, result.generatedAtMs, result.segments)
                prefs.edit()
                    .putBoolean("phase3RouteGraphHealthy", true)
                    .putLong("lastPhase3RouteGraphSuccessWallMs", System.currentTimeMillis())
                    .apply()
            } catch (_: Throwable) {
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
}
