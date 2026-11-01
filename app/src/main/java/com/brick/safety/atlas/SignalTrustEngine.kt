package com.brick.safety.atlas

import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

internal data class AtlasSignalStats(
    val kind: AtlasSignalKind,
    val signalId: String,
    val observationCount: Int,
    val trustedObservationCount: Int,
    val distinctLabels: Int,
    val geographicSpreadM: Double,
    val firstSeenWallMs: Long,
    val lastSeenWallMs: Long,
    val meanQuality: Float,
    val sourceHealthRatio: Float,
    val measurementMean: Float?,
    val measurementVariance: Double?,
    val strongestLabelPresence: Float,
    val trustedVisitCount: Int,
    val semanticCommon: Boolean,
    val trustedAnchor: Boolean
)

object SignalTrustEngine {
    private const val DAY_MS = 24L * 60L * 60L * 1_000L
    private const val STALE_MS = 90L * DAY_MS

    fun classify(stats: AtlasSignalStats, nowWallMs: Long): AtlasSignalClass {
        val age = (nowWallMs - stats.lastSeenWallMs).coerceAtLeast(0L)
        if (stats.trustedAnchor && stats.trustedObservationCount >= 2 && age <= STALE_MS) return AtlasSignalClass.TRUSTED_ANCHOR
        if (age > STALE_MS) return AtlasSignalClass.STALE
        if (stats.observationCount < 3 || stats.trustedObservationCount < 2) return AtlasSignalClass.UNKNOWN
        if (stats.semanticCommon || stats.distinctLabels >= 8 || stats.geographicSpreadM >= 5_000.0) return AtlasSignalClass.GLOBAL_COMMON
        if (stats.distinctLabels >= 3 && stats.geographicSpreadM >= 1_000.0) return AtlasSignalClass.MOBILE

        val stddev = stats.measurementVariance?.takeIf { it >= 0.0 }?.let(::sqrt)
        if (stats.sourceHealthRatio < 0.60f || (stats.observationCount >= 6 && stddev != null && stddev > 18.0)) {
            return AtlasSignalClass.UNSTABLE
        }

        if (stats.distinctLabels >= 2 || stats.strongestLabelPresence < 0.55f) return AtlasSignalClass.LOCAL_COMMON
        if (stats.trustedVisitCount >= 2 && stats.strongestLabelPresence >= 0.55f && stats.geographicSpreadM <= 250.0 && stats.meanQuality >= 0.45f) {
            return AtlasSignalClass.DISTINCTIVE_STATIC
        }
        return AtlasSignalClass.UNKNOWN
    }

    /** Internal support weight only. This is not a calibrated probability and must not be shown as one. */
    fun weight(stats: AtlasSignalStats, classification: AtlasSignalClass, nowWallMs: Long): Double {
        val classBase = when (classification) {
            AtlasSignalClass.TRUSTED_ANCHOR -> 0.95
            AtlasSignalClass.DISTINCTIVE_STATIC -> 0.78
            AtlasSignalClass.LOCAL_COMMON -> 0.32
            AtlasSignalClass.GLOBAL_COMMON -> 0.015
            AtlasSignalClass.MOBILE -> 0.04
            AtlasSignalClass.UNSTABLE -> 0.06
            AtlasSignalClass.STALE -> 0.01
            AtlasSignalClass.UNKNOWN -> 0.10
        }
        if (classBase <= 0.02) return classBase

        val uniqueness = (1.0 / (1.0 + ln(1.0 + stats.distinctLabels.coerceAtLeast(1).toDouble()))).coerceIn(0.20, 1.0)
        val stability = (stats.strongestLabelPresence.toDouble() * min(1.0, stats.trustedVisitCount / 4.0)).coerceIn(0.10, 1.0)
        val ageDays = ((nowWallMs - stats.lastSeenWallMs).coerceAtLeast(0L)).toDouble() / DAY_MS
        val freshness = exp(-ageDays / 45.0).coerceIn(0.08, 1.0)
        val quality = stats.meanQuality.toDouble().coerceIn(0.05, 1.0)
        val health = stats.sourceHealthRatio.toDouble().coerceIn(0.05, 1.0)
        val repeats = (ln(1.0 + stats.trustedObservationCount.toDouble()) / ln(9.0)).coerceIn(0.20, 1.0)
        val spoofResistance = spoofResistance(stats.kind)
        val spreadPenalty = when {
            stats.geographicSpreadM >= 2_000.0 -> 0.15
            stats.geographicSpreadM >= 500.0 -> 0.45
            stats.geographicSpreadM >= 150.0 -> 0.75
            else -> 1.0
        }

        val value = classBase * uniqueness * stability * freshness * quality * health * repeats * spoofResistance * spreadPenalty
        return value.coerceIn(0.0, classBase)
    }

    fun measurementSimilarity(observed: Float?, mean: Float?, variance: Double?): Double {
        if (observed == null || mean == null || variance == null || variance < 0.0) return 0.72
        val sigma = max(4.0, sqrt(variance + 4.0))
        val z = kotlin.math.abs(observed - mean) / sigma
        return exp(-0.5 * z * z).coerceIn(0.05, 1.0)
    }

    private fun spoofResistance(kind: AtlasSignalKind): Double = when (kind) {
        AtlasSignalKind.WIFI_AP -> 0.72
        AtlasSignalKind.WIFI_SSID_HINT -> 0.18
        AtlasSignalKind.BLE_DEVICE -> 0.62
        AtlasSignalKind.LAN_SERVICE -> 0.52
        AtlasSignalKind.CELLULAR -> 0.60
        AtlasSignalKind.GNSS_SKY -> 0.56
        AtlasSignalKind.NETWORK_CONTEXT -> 0.28
        AtlasSignalKind.COMPANION -> 0.45
        AtlasSignalKind.CHARGING -> 0.18
    }
}
