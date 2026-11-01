package com.brick.safety.atlas

import kotlin.math.*

enum class AtlasSignalKind {
    WIFI_AP,
    WIFI_SSID_HINT,
    BLE_DEVICE,
    LAN_SERVICE,
    CELLULAR,
    GNSS_SKY,
    NETWORK_CONTEXT,
    COMPANION,
    CHARGING
}

enum class AtlasSignalClass {
    TRUSTED_ANCHOR,
    DISTINCTIVE_STATIC,
    LOCAL_COMMON,
    GLOBAL_COMMON,
    MOBILE,
    UNSTABLE,
    STALE,
    UNKNOWN
}

data class AtlasTrustedLabel(
    val labelId: String,
    val latitude: Double,
    val longitude: Double,
    val accuracyM: Float,
    val elapsedRealtimeMs: Long,
    val wallTimeMs: Long,
    val zoneId: String? = null
) {
    init {
        require(labelId.matches(Regex("[A-Za-z0-9._:-]{3,96}")))
        require(latitude.isFinite() && latitude in -90.0..90.0)
        require(longitude.isFinite() && longitude in -180.0..180.0)
        require(accuracyM.isFinite() && accuracyM >= 0f)
        require(elapsedRealtimeMs >= 0L)
        require(wallTimeMs > 0L)
        require(zoneId == null || zoneId.matches(Regex("[A-Za-z0-9._:-]{1,64}")))
    }
}

data class AtlasSignalObservation(
    val kind: AtlasSignalKind,
    val signalId: String,
    val independenceGroup: String,
    val measurement: Float? = null,
    val quality: Float = 1f,
    val semanticCommon: Boolean = false,
    val trustedAnchor: Boolean = false,
    val sourceHealthy: Boolean = true
) {
    init {
        require(signalId.matches(Regex("[A-Za-z0-9._:-]{6,96}")))
        require(independenceGroup.matches(Regex("[A-Za-z0-9._:-]{1,64}")))
        require(measurement == null || measurement.isFinite())
        require(quality.isFinite() && quality in 0f..1f)
    }
}

data class AtlasScan(
    val elapsedRealtimeMs: Long,
    val wallTimeMs: Long,
    val quality: Float,
    val observations: List<AtlasSignalObservation>
) {
    init {
        require(elapsedRealtimeMs >= 0L)
        require(wallTimeMs > 0L)
        require(quality.isFinite() && quality in 0f..1f)
        require(observations.size <= 128)
    }
}

data class AtlasSignalSummary(
    val kind: AtlasSignalKind,
    val signalId: String,
    val classification: AtlasSignalClass,
    val observationCount: Int,
    val distinctLabels: Int,
    val geographicSpreadM: Double,
    val lastSeenWallMs: Long,
    val meanQuality: Float,
    val sourceHealthRatio: Float,
    val measurementMean: Float?,
    val measurementStdDev: Float?,
    val internalTrustWeight: Double
)

data class AtlasMatchCandidate(
    val labelId: String,
    val latitude: Double,
    val longitude: Double,
    val uncertaintyM: Float,
    val supportWeight: Double,
    val matchedSignals: Int,
    val independenceGroups: Int,
    val negativePenalty: Double,
    val ambiguous: Boolean
)

object AtlasGrid {
    private const val CELL_DEG = 0.0005

    fun labelFor(latitude: Double, longitude: Double): String {
        require(latitude.isFinite() && latitude in -90.0..90.0)
        require(longitude.isFinite() && longitude in -180.0..180.0)
        val y = floor((latitude + 90.0) / CELL_DEG).toLong()
        val x = floor((longitude + 180.0) / CELL_DEG).toLong()
        return "cell:$y:$x"
    }
}

internal object AtlasGeo {
    private const val R = 6_371_000.0

    fun distanceM(aLat: Double, aLon: Double, bLat: Double, bLon: Double): Double {
        val p1 = Math.toRadians(aLat)
        val p2 = Math.toRadians(bLat)
        val dp = Math.toRadians(bLat - aLat)
        val dl = Math.toRadians(bLon - aLon)
        val h = sin(dp / 2).pow(2) + cos(p1) * cos(p2) * sin(dl / 2).pow(2)
        return R * 2 * atan2(sqrt(h.coerceAtMost(1.0)), sqrt((1.0 - h).coerceAtLeast(0.0)))
    }
}
