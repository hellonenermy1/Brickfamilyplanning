package com.brick.safety.location

import kotlin.math.*

object GeoMath {
    private const val EARTH_RADIUS_M = 6_371_000.0

    data class Projection(val lat: Double, val lon: Double, val distanceM: Double, val t: Double)

    fun distanceMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val p1 = Math.toRadians(lat1)
        val p2 = Math.toRadians(lat2)
        val dp = Math.toRadians(lat2 - lat1)
        val dl = Math.toRadians(lon2 - lon1)
        val a = sin(dp / 2).pow(2) + cos(p1) * cos(p2) * sin(dl / 2).pow(2)
        return EARTH_RADIUS_M * 2 * atan2(sqrt(a.coerceAtMost(1.0)), sqrt((1.0 - a).coerceAtLeast(0.0)))
    }

    fun project(lat: Double, lon: Double, distanceM: Double, bearingDeg: Double): Pair<Double, Double> {
        if (distanceM == 0.0) return lat to lon
        val br = Math.toRadians(normalizeDegrees(bearingDeg))
        val lat1 = Math.toRadians(lat)
        val lon1 = Math.toRadians(lon)
        val x = distanceM / EARTH_RADIUS_M
        val lat2 = asin(sin(lat1) * cos(x) + cos(lat1) * sin(x) * cos(br))
        val lon2 = lon1 + atan2(sin(br) * sin(x) * cos(lat1), cos(x) - sin(lat1) * sin(lat2))
        return Math.toDegrees(lat2) to normalizeLongitude(Math.toDegrees(lon2))
    }

    fun bearingDegrees(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val p1 = Math.toRadians(lat1)
        val p2 = Math.toRadians(lat2)
        val dl = Math.toRadians(lon2 - lon1)
        val y = sin(dl) * cos(p2)
        val x = cos(p1) * sin(p2) - sin(p1) * cos(p2) * cos(dl)
        return normalizeDegrees(Math.toDegrees(atan2(y, x)))
    }

    fun normalizeDegrees(value: Double): Double = ((value % 360.0) + 360.0) % 360.0

    fun signedAngularDifference(fromDeg: Double, toDeg: Double): Double =
        ((toDeg - fromDeg + 540.0) % 360.0) - 180.0

    fun angularDifference(a: Double, b: Double): Double = abs(signedAngularDifference(a, b))

    fun nearestOnSegment(
        lat: Double,
        lon: Double,
        aLat: Double,
        aLon: Double,
        bLat: Double,
        bLon: Double
    ): Projection {
        val refLat = (lat + aLat + bLat) / 3.0
        val cosLat = cos(Math.toRadians(refLat)).coerceAtLeast(1e-6)
        fun x(lonValue: Double) = (lonValue - lon) * 111_320.0 * cosLat
        fun y(latValue: Double) = (latValue - lat) * 110_540.0
        val ax = x(aLon); val ay = y(aLat)
        val bx = x(bLon); val by = y(bLat)
        val dx = bx - ax; val dy = by - ay
        val denom = dx * dx + dy * dy
        val t = if (denom <= 1e-9) 0.0 else (-(ax * dx + ay * dy) / denom).coerceIn(0.0, 1.0)
        val px = ax + t * dx; val py = ay + t * dy
        val pLon = lon + px / (111_320.0 * cosLat)
        val pLat = lat + py / 110_540.0
        return Projection(pLat, normalizeLongitude(pLon), hypot(px, py), t)
    }

    fun weightedCentroid(points: List<Triple<Double, Double, Double>>): Pair<Double, Double>? {
        if (points.isEmpty()) return null
        val total = points.sumOf { it.third.coerceAtLeast(0.0) }
        if (total <= 0.0) return null
        val refLat = points.sumOf { it.first * it.third } / total
        var x = 0.0; var y = 0.0
        val cosLat = cos(Math.toRadians(refLat)).coerceAtLeast(1e-6)
        val refLon = points.first().second
        for ((lat, lon, weight) in points) {
            val w = weight.coerceAtLeast(0.0)
            x += (lon - refLon) * 111_320.0 * cosLat * w
            y += lat * 110_540.0 * w
        }
        val lat = y / (110_540.0 * total)
        val lon = refLon + x / (111_320.0 * cosLat * total)
        return lat to normalizeLongitude(lon)
    }

    private fun normalizeLongitude(value: Double): Double {
        var x = value
        while (x > 180.0) x -= 360.0
        while (x < -180.0) x += 360.0
        return x
    }
}
