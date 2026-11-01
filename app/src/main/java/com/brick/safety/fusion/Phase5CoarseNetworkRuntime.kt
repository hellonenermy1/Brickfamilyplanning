package com.brick.safety.fusion

import android.content.Context
import android.os.SystemClock
import com.brick.safety.location.PositionQuality

/**
 * Last-resort IP-derived network area. The server may provide an IP-geolocation centre, but Brick
 * deliberately enforces a 50 km uncertainty floor on-device. This source can therefore never
 * become building/place truth even if a server regression accidentally sends a smaller radius.
 *
 * The value is process-local and short lived. Brick does not persist the IP-derived coordinate on
 * the child; after reboot it must be refreshed by a normal authenticated health exchange.
 */
object Phase5CoarseNetworkRuntime {
    private const val RADIUS_M = 50_000f
    private const val MAX_AGE_MS = 15L * 60L * 1_000L

    private data class Snapshot(
        val ownerDeviceId: String,
        val latitude: Double,
        val longitude: Double,
        val observedElapsedMs: Long
    )

    @Volatile private var appContext: Context? = null
    @Volatile private var snapshot: Snapshot? = null

    fun initialize(context: Context) {
        appContext = context.applicationContext
    }

    @Synchronized
    fun update(deviceId: String, latitude: Double, longitude: Double): Boolean {
        val context = appContext ?: return false
        val currentOwner = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
            .getString("deviceId", null)
            ?.takeIf { it.isNotBlank() }
            ?: return false
        if (deviceId != currentOwner) return false
        if (!latitude.isFinite() || latitude !in -90.0..90.0 ||
            !longitude.isFinite() || longitude !in -180.0..180.0) return false
        snapshot = Snapshot(deviceId, latitude, longitude, SystemClock.elapsedRealtime())
        return true
    }

    @Synchronized
    fun clear() {
        snapshot = null
    }

    fun constraint(nowElapsedMs: Long = SystemClock.elapsedRealtime()): FusionConstraint? {
        val context = appContext ?: return null
        val current = snapshot ?: return null
        val currentOwner = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
            .getString("deviceId", null)
            ?.takeIf { it.isNotBlank() }
            ?: return null
        if (current.ownerDeviceId != currentOwner) return null
        if (current.observedElapsedMs <= 0L || current.observedElapsedMs > nowElapsedMs) return null
        if (nowElapsedMs - current.observedElapsedMs > MAX_AGE_MS) return null
        return FusionConstraint(
            id = "coarse-network",
            kind = FusionEvidenceKind.COARSE_NETWORK,
            independenceGroup = "network.ip",
            observedElapsedMs = current.observedElapsedMs,
            latitude = current.latitude,
            longitude = current.longitude,
            radiusM = RADIUS_M,
            supportWeight = 0.12,
            strength = FusionStrength.WEAK,
            upperState = PositionQuality.COARSE,
            maxAgeMs = MAX_AGE_MS,
            shapeHint = FusionShapeKind.POSSIBLE_AREA,
            explanation = "coarse IP-derived network area"
        )
    }
}
