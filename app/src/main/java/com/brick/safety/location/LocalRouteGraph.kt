package com.brick.safety.location

import kotlin.math.*

enum class RouteSegmentSource { LEARNED, PRIVATE_MAP }

data class LocalRouteSegment(
    val id: String,
    val aLat: Double,
    val aLon: Double,
    val bLat: Double,
    val bLon: Double,
    val allowedModeMask: Int,
    val observations: Int,
    val lastSeenWallMs: Long,
    val source: RouteSegmentSource
)

data class RouteMatch(
    val segment: LocalRouteSegment,
    val projectedLat: Double,
    val projectedLon: Double,
    val distanceM: Double,
    val headingDeltaDeg: Double?
)

/**
 * Bounded local route/path graph. Learned edges are evidence of paths Brick has actually observed;
 * PRIVATE_MAP edges may be imported from the private server map cache. Missing graph coverage is
 * never treated as a wall or proof that a path is impossible.
 */
class LocalRouteGraph(private val maxSegments: Int = 768) {
    private val segments = linkedMapOf<String, LocalRouteSegment>()

    fun size(): Int = segments.size
    fun all(): List<LocalRouteSegment> = segments.values.toList()

    fun addTrustedSegment(
        aLat: Double,
        aLon: Double,
        bLat: Double,
        bLon: Double,
        mode: Phase3Mode,
        startAccuracyM: Float,
        endAccuracyM: Float,
        wallMs: Long
    ): String? {
        if (!validLatLon(aLat, aLon) || !validLatLon(bLat, bLon)) return null
        if (!startAccuracyM.isFinite() || !endAccuracyM.isFinite() || startAccuracyM > 35f || endAccuracyM > 35f) return null
        if (mode == Phase3Mode.UNKNOWN || mode == Phase3Mode.STATIONARY) return null
        val distance = GeoMath.distanceMeters(aLat, aLon, bLat, bLon)
        if (distance !in 4.0..350.0) return null
        val id = learnedId(aLat, aLon, bLat, bLon)
        val prior = segments[id]
        val next = if (prior != null && prior.source == RouteSegmentSource.LEARNED) {
            prior.copy(
                allowedModeMask = prior.allowedModeMask or mode.bit,
                observations = (prior.observations + 1).coerceAtMost(65_535),
                lastSeenWallMs = max(prior.lastSeenWallMs, wallMs)
            )
        } else LocalRouteSegment(id, aLat, aLon, bLat, bLon, mode.bit, 1, wallMs, RouteSegmentSource.LEARNED)
        segments[id] = next
        trim()
        return id
    }

    fun mergePrivateMap(items: Collection<LocalRouteSegment>) {
        for (item in items) {
            if (item.source != RouteSegmentSource.PRIVATE_MAP || !validLatLon(item.aLat, item.aLon) || !validLatLon(item.bLat, item.bLon)) continue
            if (item.allowedModeMask <= 0) continue
            val distance = GeoMath.distanceMeters(item.aLat, item.aLon, item.bLat, item.bLon)
            if (distance !in 0.5..2_000.0) continue
            val id = if (item.id.startsWith("map:")) item.id else "map:${item.id}"
            segments[id] = item.copy(id = id, observations = item.observations.coerceAtLeast(1))
        }
        trim()
    }

    fun nearest(lat: Double, lon: Double, mode: Phase3Mode, headingDeg: Double?, maxDistanceM: Double, limit: Int = 8): List<RouteMatch> {
        if (!validLatLon(lat, lon) || maxDistanceM <= 0.0) return emptyList()
        val out = ArrayList<RouteMatch>()
        for (segment in segments.values) {
            if (!modeCompatible(segment, mode)) continue
            val projection = GeoMath.nearestOnSegment(lat, lon, segment.aLat, segment.aLon, segment.bLat, segment.bLon)
            if (projection.distanceM > maxDistanceM) continue
            val delta = headingDeg?.let {
                val h = GeoMath.bearingDegrees(segment.aLat, segment.aLon, segment.bLat, segment.bLon)
                min(GeoMath.angularDifference(h, it), GeoMath.angularDifference(GeoMath.normalizeDegrees(h + 180.0), it))
            }
            out += RouteMatch(segment, projection.lat, projection.lon, projection.distanceM, delta)
        }
        return out.sortedWith(compareBy<RouteMatch> { it.distanceM + (it.headingDeltaDeg ?: 0.0) * 0.22 }
            .thenByDescending { if (it.segment.source == RouteSegmentSource.PRIVATE_MAP) 1 else it.segment.observations })
            .take(limit.coerceIn(1, 24))
    }

    fun hasStrongCoverage(lat: Double, lon: Double, radiusM: Double): Boolean {
        if (!validLatLon(lat, lon)) return false
        return segments.values.any { segment ->
            val strong = segment.source == RouteSegmentSource.PRIVATE_MAP || segment.observations >= 2
            strong && GeoMath.nearestOnSegment(lat, lon, segment.aLat, segment.aLon, segment.bLat, segment.bLon).distanceM <= radiusM
        }
    }

    fun encode(nowWallMs: Long): String {
        val minWall = nowWallMs - 45L * 24L * 60L * 60L * 1_000L
        return segments.values
            .filter { it.source == RouteSegmentSource.PRIVATE_MAP || it.lastSeenWallMs <= 0L || it.lastSeenWallMs >= minWall || it.observations >= 2 }
            .takeLast(maxSegments)
            .joinToString(";") { s ->
                listOf(s.id, s.aLat, s.aLon, s.bLat, s.bLon, s.allowedModeMask, s.observations, s.lastSeenWallMs, s.source.ordinal).joinToString("|")
            }
    }

    fun restore(encoded: String?) {
        segments.clear()
        if (encoded.isNullOrBlank()) return
        for (token in encoded.split(';').takeLast(maxSegments)) {
            val p = token.split('|')
            if (p.size != 9) continue
            val id = p[0].takeIf { it.length in 3..120 } ?: continue
            val aLat = p[1].toDoubleOrNull() ?: continue
            val aLon = p[2].toDoubleOrNull() ?: continue
            val bLat = p[3].toDoubleOrNull() ?: continue
            val bLon = p[4].toDoubleOrNull() ?: continue
            if (!validLatLon(aLat, aLon) || !validLatLon(bLat, bLon)) continue
            val mask = p[5].toIntOrNull()?.takeIf { it > 0 } ?: continue
            val observations = p[6].toIntOrNull()?.coerceIn(1, 65_535) ?: continue
            val wall = p[7].toLongOrNull()?.coerceAtLeast(0L) ?: continue
            val source = RouteSegmentSource.entries.getOrNull(p[8].toIntOrNull() ?: -1) ?: continue
            segments[id] = LocalRouteSegment(id, aLat, aLon, bLat, bLon, mask, observations, wall, source)
        }
        trim()
    }

    private fun modeCompatible(segment: LocalRouteSegment, mode: Phase3Mode): Boolean {
        if (mode == Phase3Mode.UNKNOWN || mode == Phase3Mode.STATIONARY) return true
        return segment.allowedModeMask and mode.bit != 0
    }

    private fun trim() {
        if (segments.size <= maxSegments) return
        val keep = segments.values
            .sortedWith(compareByDescending<LocalRouteSegment> { if (it.source == RouteSegmentSource.PRIVATE_MAP) 1 else 0 }
                .thenByDescending { it.observations }.thenByDescending { it.lastSeenWallMs })
            .take(maxSegments).associateBy { it.id }
        segments.keys.retainAll(keep.keys)
    }

    private fun learnedId(aLat: Double, aLon: Double, bLat: Double, bLon: Double): String {
        fun q(v: Double) = round(v * 10_000.0).toLong()
        val a = "${q(aLat)}_${q(aLon)}"
        val b = "${q(bLat)}_${q(bLon)}"
        return if (a <= b) "learn:$a:$b" else "learn:$b:$a"
    }

    private fun validLatLon(lat: Double, lon: Double) = lat.isFinite() && lon.isFinite() && lat in -90.0..90.0 && lon in -180.0..180.0
}
