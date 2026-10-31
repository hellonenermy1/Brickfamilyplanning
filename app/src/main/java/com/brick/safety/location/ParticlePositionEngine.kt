package com.brick.safety.location

import kotlin.math.*

data class ParticleEstimate(
    val lat: Double,
    val lon: Double,
    val uncertaintyM: Float,
    val headingDeg: Float?,
    val speedMps: Float?,
    val activeParticles: Int,
    val routeCandidateIds: List<String>,
    val routeConstrained: Boolean,
    val ageSinceTrustedMs: Long,
    val expired: Boolean
)

private data class Particle(
    var lat: Double,
    var lon: Double,
    var headingDeg: Double,
    var weight: Double
)

/**
 * Deterministic particle/hypothesis engine. Route/magnetic/landmark clues reweight many candidates;
 * they never select one hidden exact road. Scalar uncertainty is monotonic between trusted fixes.
 */
class ParticlePositionEngine(private val particleCount: Int = 96) {
    private val particles = ArrayList<Particle>()
    private var anchorElapsedMs = 0L
    private var anchorWallMs = 0L
    private var lastUpdateElapsedMs = 0L
    private var uncertaintyM = 5f
    private var lastSpeedMps: Float? = null
    private var tick = 0L
    private var routeCandidates: List<String> = emptyList()
    private var routeConstrained = false

    fun isInitialized(): Boolean = particles.isNotEmpty() && anchorElapsedMs > 0L && lastUpdateElapsedMs >= anchorElapsedMs
    fun lastUpdateElapsedMs(): Long = lastUpdateElapsedMs
    fun lastSpeedMps(): Float? = lastSpeedMps

    fun initialize(
        lat: Double,
        lon: Double,
        accuracyM: Float,
        headingDeg: Float?,
        speedMps: Float?,
        elapsedMs: Long,
        wallMs: Long
    ) {
        require(lat.isFinite() && lon.isFinite() && lat in -90.0..90.0 && lon in -180.0..180.0)
        require(elapsedMs >= 0L)
        particles.clear()
        val radius = accuracyM.takeIf { it.isFinite() && it >= 0f }?.coerceIn(3f, 250f) ?: 50f
        val baseHeading = headingDeg?.takeIf { it.isFinite() }?.let { GeoMath.normalizeDegrees(it.toDouble()) }
        val golden = Math.PI * (3.0 - sqrt(5.0))
        for (i in 0 until particleCount.coerceIn(32, 256)) {
            val r = radius * sqrt((i + 0.5) / particleCount.toDouble())
            val angle = i * golden
            val bearing = GeoMath.normalizeDegrees(Math.toDegrees(angle))
            val p = GeoMath.project(lat, lon, r.toDouble(), bearing)
            val h = baseHeading?.let { GeoMath.normalizeDegrees(it + deterministicNoise(i, 17L) * 12.0) }
                ?: GeoMath.normalizeDegrees(i * 360.0 / particleCount)
            particles += Particle(p.first, p.second, h, 1.0 / particleCount)
        }
        anchorElapsedMs = elapsedMs
        anchorWallMs = wallMs
        lastUpdateElapsedMs = elapsedMs
        uncertaintyM = radius
        lastSpeedMps = speedMps?.takeIf { it.isFinite() && it >= 0f }
        tick = 0L
        routeCandidates = emptyList()
        routeConstrained = false
    }

    fun propagate(
        nowElapsedMs: Long,
        delta: OdometryDelta,
        mode: Phase3Mode,
        graph: LocalRouteGraph,
        magneticSupport: List<SequenceSupport> = emptyList(),
        landmarkSupport: List<SequenceSupport> = emptyList()
    ): ParticleEstimate? {
        if (!isInitialized() || nowElapsedMs < lastUpdateElapsedMs) return null
        if (nowElapsedMs == lastUpdateElapsedMs) return estimate(nowElapsedMs)
        tick += 1
        val mag = magneticSupport.associate { it.segmentId to it.strength.coerceIn(0.0, 1.0) }
        val land = landmarkSupport.associate { it.segmentId to it.strength.coerceIn(0.0, 1.0) }
        val routeWeight = mutableMapOf<String, Double>()
        var constrainedCount = 0
        val routeConstraintsEnabled = mode != Phase3Mode.STATIONARY

        for ((index, particle) in particles.withIndex()) {
            val distanceNoise = deterministicNoise(index, tick * 31 + 7)
            val headingNoise = deterministicNoise(index, tick * 47 + 11)
            val distance = (delta.distanceM + distanceNoise * delta.distanceSigmaM).coerceAtLeast(0.0)
            val heading = when {
                delta.headingDeg != null -> {
                    val target = GeoMath.normalizeDegrees(delta.headingDeg + headingNoise * delta.headingSigmaDeg)
                    val correction = GeoMath.signedAngularDifference(particle.headingDeg, target) * 0.72
                    GeoMath.normalizeDegrees(particle.headingDeg + correction)
                }
                else -> GeoMath.normalizeDegrees(particle.headingDeg + delta.headingDeltaDeg + headingNoise * delta.headingSigmaDeg)
            }

            if (distance > 0.01) {
                val next = GeoMath.project(particle.lat, particle.lon, distance, heading)
                particle.lat = next.first
                particle.lon = next.second
            }
            particle.headingDeg = heading

            val searchRadius = (20.0 + uncertaintyM * 0.38 + delta.distanceSigmaM).coerceIn(20.0, 180.0)
            val matches = if (routeConstraintsEnabled) graph.nearest(particle.lat, particle.lon, mode, particle.headingDeg, searchRadius, 5) else emptyList()
            if (matches.isNotEmpty()) {
                val best = matches.first()
                val scale = if (best.segment.source == RouteSegmentSource.PRIVATE_MAP) 28.0 else 22.0
                var factor = 0.35 + 1.65 * exp(-best.distanceM / scale)
                best.headingDeltaDeg?.let { hd -> factor *= (0.45 + 0.55 * exp(-hd / 55.0)) }
                factor *= 1.0 + (mag[best.segment.id] ?: 0.0) * 0.35 + (land[best.segment.id] ?: 0.0) * 0.28
                if (best.segment.source == RouteSegmentSource.LEARNED) {
                    factor *= (0.75 + (best.segment.observations / 4.0).coerceIn(0.0, 0.5))
                }
                particle.weight *= factor.coerceIn(0.08, 2.6)

                val strong = best.segment.source == RouteSegmentSource.PRIVATE_MAP || best.segment.observations >= 2
                if (strong && best.distanceM <= searchRadius * 0.75) {
                    // Soft per-particle projection. Different particles may select different edges,
                    // so this narrows a hypothesis set rather than snapping the whole estimate.
                    val pull = if (best.segment.source == RouteSegmentSource.PRIVATE_MAP) 0.48 else 0.32
                    particle.lat += (best.projectedLat - particle.lat) * pull
                    particle.lon += (best.projectedLon - particle.lon) * pull
                    constrainedCount += 1
                }
                routeWeight[best.segment.id] = (routeWeight[best.segment.id] ?: 0.0) + particle.weight
            } else if (routeConstraintsEnabled && graph.hasStrongCoverage(particle.lat, particle.lon, searchRadius * 0.8)) {
                particle.weight *= 0.18
            }
        }

        normalizeWeights()
        if (effectiveSampleSize() < particles.size * 0.45) systematicResample()
        routeCandidates = if (routeConstraintsEnabled) routeWeight.entries.sortedByDescending { it.value }.take(3).map { it.key } else emptyList()
        routeConstrained = routeConstraintsEnabled && constrainedCount >= max(4, particles.size / 8)
        uncertaintyM = max(
            uncertaintyM + delta.uncertaintyGrowthM.toFloat(),
            spatialRadius90().toFloat() + (delta.distanceSigmaM * 0.45).toFloat()
        ).coerceAtMost(10_000f)
        lastSpeedMps = delta.speedMps?.takeIf { it.isFinite() && it >= 0.0 }?.toFloat()
        lastUpdateElapsedMs = nowElapsedMs
        return estimate(nowElapsedMs)
    }

    fun estimate(nowElapsedMs: Long): ParticleEstimate? {
        if (!isInitialized() || particles.isEmpty()) return null
        normalizeWeights()
        val center = GeoMath.weightedCentroid(particles.map { Triple(it.lat, it.lon, it.weight) }) ?: return null
        val heading = circularMeanHeading()
        val age = (nowElapsedMs - anchorElapsedMs).coerceAtLeast(0L)
        val expired = age > 20L * 60L * 1_000L || uncertaintyM >= 5_000f || particles.size < 8
        return ParticleEstimate(
            center.first,
            center.second,
            uncertaintyM,
            heading?.toFloat(),
            lastSpeedMps,
            particles.size,
            routeCandidates,
            routeConstrained,
            age,
            expired
        )
    }

    private fun normalizeWeights() {
        var total = particles.sumOf { if (it.weight.isFinite() && it.weight > 0.0) it.weight else 0.0 }
        if (total <= 1e-12) {
            val uniform = 1.0 / particles.size.coerceAtLeast(1)
            particles.forEach { it.weight = uniform }
            return
        }
        particles.forEach {
            if (!it.weight.isFinite() || it.weight < 0.0) it.weight = 0.0
            it.weight /= total
        }
        total = particles.sumOf { it.weight }
        if (abs(total - 1.0) > 1e-9 && total > 0.0) particles.forEach { it.weight /= total }
    }

    private fun effectiveSampleSize(): Double {
        val sumSq = particles.sumOf { it.weight * it.weight }
        return if (sumSq <= 0.0) 0.0 else 1.0 / sumSq
    }

    private fun systematicResample() {
        if (particles.isEmpty()) return
        normalizeWeights()
        val cumulative = DoubleArray(particles.size)
        var running = 0.0
        particles.forEachIndexed { i, p -> running += p.weight; cumulative[i] = running }
        val result = ArrayList<Particle>(particles.size)
        val step = 1.0 / particles.size
        var u = step * 0.5
        var j = 0
        for (i in particles.indices) {
            while (j < cumulative.lastIndex && u > cumulative[j]) j++
            val chosen = particles[j]
            val jitterM = deterministicNoise(i, tick * 79 + 13) * min(2.0, uncertaintyM * 0.015)
            val jitterBearing = GeoMath.normalizeDegrees(i * 137.507764)
            val point = if (abs(jitterM) > 0.01) GeoMath.project(chosen.lat, chosen.lon, abs(jitterM), if (jitterM >= 0) jitterBearing else GeoMath.normalizeDegrees(jitterBearing + 180)) else chosen.lat to chosen.lon
            result += Particle(point.first, point.second, chosen.headingDeg, step)
            u += step
        }
        particles.clear(); particles.addAll(result)
    }

    private fun spatialRadius90(): Double {
        val center = GeoMath.weightedCentroid(particles.map { Triple(it.lat, it.lon, it.weight) }) ?: return uncertaintyM.toDouble()
        val sorted = particles.map { GeoMath.distanceMeters(center.first, center.second, it.lat, it.lon) to it.weight }.sortedBy { it.first }
        var cumulative = 0.0
        for ((distance, weight) in sorted) {
            cumulative += weight
            if (cumulative >= 0.90) return distance
        }
        return sorted.lastOrNull()?.first ?: uncertaintyM.toDouble()
    }

    private fun circularMeanHeading(): Double? {
        if (particles.isEmpty()) return null
        var x = 0.0; var y = 0.0
        for (p in particles) {
            val r = Math.toRadians(p.headingDeg)
            x += cos(r) * p.weight
            y += sin(r) * p.weight
        }
        if (hypot(x, y) < 1e-6) return null
        return GeoMath.normalizeDegrees(Math.toDegrees(atan2(y, x)))
    }

    fun encode(): String {
        if (!isInitialized()) return ""
        val header = listOf(anchorElapsedMs, anchorWallMs, lastUpdateElapsedMs, uncertaintyM, lastSpeedMps ?: Float.NaN, tick).joinToString(",")
        val body = particles.joinToString("/") { p -> "${p.lat},${p.lon},${p.headingDeg},${p.weight}" }
        val routes = routeCandidates.joinToString(",")
        return "P3V1|$header|$routes|${if (routeConstrained) 1 else 0}|$body"
    }

    fun restore(encoded: String?, currentElapsedMs: Long): Boolean {
        particles.clear()
        if (encoded.isNullOrBlank()) return false
        val p = encoded.split('|')
        if (p.size != 5 || p[0] != "P3V1") return false
        val h = p[1].split(',')
        if (h.size != 6) return false
        val anchorElapsed = h[0].toLongOrNull() ?: return false
        val anchorWall = h[1].toLongOrNull() ?: return false
        val lastUpdate = h[2].toLongOrNull() ?: return false
        val uncertainty = h[3].toFloatOrNull()?.takeIf { it.isFinite() && it in 0f..10_000f } ?: return false
        val speed = h[4].toFloatOrNull()?.takeIf { it.isFinite() && it >= 0f }
        val restoredTick = h[5].toLongOrNull()?.coerceAtLeast(0L) ?: return false
        // elapsedRealtime reset means reboot; do not fake continuous inertial state across reboot.
        if (anchorElapsed < 0L || lastUpdate < anchorElapsed || lastUpdate > currentElapsedMs) return false
        val restored = p[4].split('/').mapNotNull { token ->
            val v = token.split(',')
            if (v.size != 4) return@mapNotNull null
            val lat = v[0].toDoubleOrNull(); val lon = v[1].toDoubleOrNull(); val heading = v[2].toDoubleOrNull(); val weight = v[3].toDoubleOrNull()
            if (lat == null || lon == null || heading == null || weight == null) return@mapNotNull null
            if (!lat.isFinite() || !lon.isFinite() || !heading.isFinite() || !weight.isFinite() || weight < 0.0 || lat !in -90.0..90.0 || lon !in -180.0..180.0) return@mapNotNull null
            Particle(lat, lon, GeoMath.normalizeDegrees(heading), weight)
        }
        if (restored.size !in 8..256) return false
        particles.addAll(restored)
        anchorElapsedMs = anchorElapsed
        anchorWallMs = anchorWall
        lastUpdateElapsedMs = lastUpdate
        uncertaintyM = uncertainty
        lastSpeedMps = speed
        tick = restoredTick
        routeCandidates = p[2].split(',').filter { it.isNotBlank() }.take(3)
        routeConstrained = p[3] == "1"
        normalizeWeights()
        return true
    }

    private fun deterministicNoise(index: Int, salt: Long): Double {
        val x = sin((index + 1) * 12.9898 + (salt % 1_000_003L) * 0.000123) * 43758.5453123
        val frac = x - floor(x)
        return frac * 2.0 - 1.0
    }
}
