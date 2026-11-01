package com.brick.safety.fusion

import com.brick.safety.location.GeoMath
import kotlin.math.exp
import kotlin.math.max

/**
 * Optional authenticated direction evidence for future UWB/Bluetooth/Wi-Fi peer ranging.
 * Direction only reweights an already-existing hypothesis; it never creates a coordinate itself.
 */
data class AuthenticatedDirectionConstraint(
    val id: String,
    val technology: RangeTechnology,
    val independenceGroup: String,
    val observedElapsedMs: Long,
    val sourceLatitude: Double,
    val sourceLongitude: Double,
    val bearingDeg: Float,
    val bearingUncertaintyDeg: Float,
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
        require(bearingDeg.isFinite())
        require(bearingUncertaintyDeg.isFinite() && bearingUncertaintyDeg in 1f..180f)
        require(supportWeight.isFinite() && supportWeight in 0.0..1.0)
        require(maxAgeMs in 1_000L..10L * 60L * 1_000L)
    }

    fun isFresh(nowElapsedMs: Long): Boolean =
        authenticated && observedElapsedMs in 1..nowElapsedMs && nowElapsedMs - observedElapsedMs <= maxAgeMs

    fun likelihoodAt(latitude: Double, longitude: Double, nowElapsedMs: Long): Double {
        if (!isFresh(nowElapsedMs)) return 0.0
        if (!latitude.isFinite() || latitude !in -90.0..90.0 ||
            !longitude.isFinite() || longitude !in -180.0..180.0) return 0.0
        // A point at the source has no meaningful direction and must not be rewarded.
        if (GeoMath.distanceMeters(sourceLatitude, sourceLongitude, latitude, longitude) < 1.0) return 0.0
        val actual = GeoMath.bearingDegrees(sourceLatitude, sourceLongitude, latitude, longitude)
        val miss = (GeoMath.angularDifference(actual, bearingDeg.toDouble()) - bearingUncertaintyDeg).coerceAtLeast(0.0)
        val scale = max(8.0, bearingUncertaintyDeg.toDouble())
        return (supportWeight * if (miss == 0.0) 1.0 else exp(-miss / scale)).coerceIn(0.0, 1.0)
    }
}

/**
 * One atomic runtime view from a future ranging provider. API existence is not capability proof:
 * the provider must explicitly report its current capability every time this snapshot is read.
 */
data class AuthenticatedRangingSnapshot(
    val technology: RangeTechnology,
    val capability: RangeCapability,
    val ranges: List<AuthenticatedRangeConstraint> = emptyList(),
    val directions: List<AuthenticatedDirectionConstraint> = emptyList()
) {
    init {
        require(ranges.size <= 32 && directions.size <= 32)
        require(ranges.all { it.technology == technology })
        require(directions.all { it.technology == technology })
        // No stale cached measurements are allowed to masquerade as usable when runtime capability
        // is absent/blocked. A provider may report the reason, but not active constraints.
        if (capability != RangeCapability.SUPPORTED) {
            require(ranges.isEmpty() && directions.isEmpty())
        }
    }
}

interface AuthenticatedRangingProvider {
    val technology: RangeTechnology
    fun snapshot(nowElapsedMs: Long): AuthenticatedRangingSnapshot
}

/** Missing provider is reported as UNSUPPORTED for this runtime, never silently assumed available. */
object AuthenticatedRangingCapabilities {
    fun snapshot(
        providers: Collection<AuthenticatedRangingProvider>,
        nowElapsedMs: Long
    ): Map<RangeTechnology, AuthenticatedRangingSnapshot> {
        require(nowElapsedMs >= 0L)
        val out = RangeTechnology.entries.associateWith {
            AuthenticatedRangingSnapshot(it, RangeCapability.UNSUPPORTED)
        }.toMutableMap()
        for (provider in providers) {
            val value = runCatching { provider.snapshot(nowElapsedMs) }
                .getOrElse { AuthenticatedRangingSnapshot(provider.technology, RangeCapability.FAILED) }
            if (value.technology != provider.technology) {
                out[provider.technology] = AuthenticatedRangingSnapshot(provider.technology, RangeCapability.FAILED)
                continue
            }
            val prior = out.getValue(provider.technology)
            if (capabilityRank(value.capability) > capabilityRank(prior.capability)) {
                out[provider.technology] = value
            }
        }
        return out
    }

    private fun capabilityRank(capability: RangeCapability): Int = when (capability) {
        RangeCapability.SUPPORTED -> 5
        RangeCapability.PERMISSION_REQUIRED -> 4
        RangeCapability.TEMPORARILY_UNAVAILABLE -> 3
        RangeCapability.FAILED -> 2
        RangeCapability.UNSUPPORTED -> 1
    }
}
