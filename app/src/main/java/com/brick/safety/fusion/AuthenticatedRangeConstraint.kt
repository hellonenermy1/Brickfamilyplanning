package com.brick.safety.fusion

import com.brick.safety.location.GeoMath
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.max

enum class RangeTechnology {
    WIFI_RTT,
    WIFI_NAN_RTT,
    UWB,
    BLUETOOTH_CHANNEL_SOUNDING,
    OTHER_AUTHENTICATED
}

enum class RangeCapability {
    SUPPORTED,
    TEMPORARILY_UNAVAILABLE,
    PERMISSION_REQUIRED,
    UNSUPPORTED,
    FAILED
}

data class AuthenticatedRangeConstraint(
    val id: String,
    val technology: RangeTechnology,
    val independenceGroup: String,
    val observedElapsedMs: Long,
    val sourceLatitude: Double,
    val sourceLongitude: Double,
    val sourceUncertaintyM: Float,
    val rangeM: Float,
    val rangeStdDevM: Float?,
    val supportWeight: Double,
    val maxAgeMs: Long,
    val authenticated: Boolean
) {
    init {
        require(id.matches(Regex("[A-Za-z0-9._:-]{1,96}")))
        require(independenceGroup.matches(Regex("[A-Za-z0-9._:-]{1,64}")))
        require(observedElapsedMs >= 0L)
        require(sourceLatitude.isFinite() && sourceLatitude in -90.0..90.0)
        require(sourceLongitude.isFinite() && sourceLongitude in -180.0..180.0)
        require(sourceUncertaintyM.isFinite() && sourceUncertaintyM in 0f..10_000f)
        require(rangeM.isFinite() && rangeM in 0f..20_000f)
        require(rangeStdDevM == null || (rangeStdDevM.isFinite() && rangeStdDevM in 0f..5_000f))
        require(supportWeight.isFinite() && supportWeight in 0.0..1.0)
        require(maxAgeMs in 1_000L..10L * 60L * 1_000L)
    }

    fun isFresh(nowElapsedMs: Long): Boolean =
        authenticated && observedElapsedMs in 1..nowElapsedMs && nowElapsedMs - observedElapsedMs <= maxAgeMs

    /**
     * A range measurement constrains distance to a source; it does not identify a bearing. The
     * resulting geometry is therefore an annulus. Source uncertainty and measurement uncertainty
     * are combined conservatively as additive error rather than pretending Gaussian calibration.
     */
    fun annulus(): RangeAnnulus {
        val measurementAllowance = when (val sd = rangeStdDevM) {
            null -> when (technology) {
                RangeTechnology.WIFI_RTT, RangeTechnology.WIFI_NAN_RTT -> 15f
                RangeTechnology.UWB, RangeTechnology.BLUETOOTH_CHANNEL_SOUNDING -> 5f
                RangeTechnology.OTHER_AUTHENTICATED -> 25f
            }
            else -> max(2f, sd * 2f)
        }
        val allowance = (sourceUncertaintyM + measurementAllowance).coerceAtMost(10_000f)
        return RangeAnnulus(
            sourceLatitude = sourceLatitude,
            sourceLongitude = sourceLongitude,
            innerRadiusM = (rangeM - allowance).coerceAtLeast(0f),
            outerRadiusM = (rangeM + allowance).coerceAtMost(30_000f),
            allowanceM = allowance
        )
    }

    /**
     * Likelihood for an already-existing hypothesis. This only reweights hypotheses; a range
     * constraint by itself never creates an exact child coordinate.
     */
    fun likelihoodAt(latitude: Double, longitude: Double, nowElapsedMs: Long): Double {
        if (!isFresh(nowElapsedMs)) return 0.0
        if (!latitude.isFinite() || latitude !in -90.0..90.0 || !longitude.isFinite() || longitude !in -180.0..180.0) return 0.0
        val a = annulus()
        val d = GeoMath.distanceMeters(a.sourceLatitude, a.sourceLongitude, latitude, longitude)
        val miss = when {
            d < a.innerRadiusM -> a.innerRadiusM - d
            d > a.outerRadiusM -> d - a.outerRadiusM
            else -> 0.0
        }
        val scale = max(5.0, a.allowanceM.toDouble())
        val geometry = if (miss <= 0.0) 1.0 else exp(-miss / scale)
        return (geometry * supportWeight).coerceIn(0.0, 1.0)
    }

    fun distanceResidualM(latitude: Double, longitude: Double): Double {
        val d = GeoMath.distanceMeters(sourceLatitude, sourceLongitude, latitude, longitude)
        return abs(d - rangeM)
    }
}

data class RangeAnnulus(
    val sourceLatitude: Double,
    val sourceLongitude: Double,
    val innerRadiusM: Float,
    val outerRadiusM: Float,
    val allowanceM: Float
) {
    init {
        require(sourceLatitude.isFinite() && sourceLatitude in -90.0..90.0)
        require(sourceLongitude.isFinite() && sourceLongitude in -180.0..180.0)
        require(innerRadiusM.isFinite() && innerRadiusM >= 0f)
        require(outerRadiusM.isFinite() && outerRadiusM >= innerRadiusM)
        require(allowanceM.isFinite() && allowanceM >= 0f)
    }
}
