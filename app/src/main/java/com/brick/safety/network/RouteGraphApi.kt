package com.brick.safety.network

import com.brick.safety.crypto.DeviceKeys
import com.brick.safety.location.LocalRouteSegment
import com.brick.safety.location.RouteSegmentSource
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

object RouteGraphApi {
    data class Result(
        val centerLat: Double,
        val centerLon: Double,
        val generatedAtMs: Long,
        val radiusM: Int,
        val segments: List<LocalRouteSegment>
    )

    private const val MAX_RESPONSE_BYTES = 128 * 1024
    private const val MAX_SEGMENTS = 256
    private const val MOVING_MODE_MASK = (1 shl 2) or (1 shl 3) or (1 shl 4) or (1 shl 5)

    fun fetch(baseUrl: String, deviceId: String, lat: Double, lon: Double): Result {
        require(validDeviceId(deviceId)) { "Invalid Brick device identity" }
        require(lat.isFinite() && lat in -90.0..90.0 && lon.isFinite() && lon in -180.0..180.0) { "Invalid route graph coordinate" }
        val body = JSONObject().put("protocol", 1).put("lat", lat).put("lon", lon).toString().toByteArray(Charsets.UTF_8)
        val c = (URL(secureBase(baseUrl) + "/api/device/$deviceId/route-graph").openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = false
            requestMethod = "POST"
            connectTimeout = 8_000
            readTimeout = 12_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("X-Brick-Signature", DeviceKeys.sign(body))
        }
        try {
            c.outputStream.use { it.write(body) }
            val code = c.responseCode
            val text = readBoundedText(if (code in 200..299) c.inputStream else c.errorStream)
            if (code !in 200..299) error("Route graph failed $code: ${text.take(512)}")
            return parse(text, lat, lon)
        } finally {
            c.disconnect()
        }
    }

    internal fun parse(text: String, requestedLat: Double, requestedLon: Double): Result {
        val root = JSONObject(text)
        require(root.getInt("protocol") == 1) { "Route graph protocol mismatch" }
        val generatedAtMs = root.getLong("generatedAtMs")
        require(generatedAtMs > 0L) { "Route graph generated time invalid" }
        val center = root.getJSONObject("center")
        val centerLat = center.getDouble("lat")
        val centerLon = center.getDouble("lon")
        require(centerLat.isFinite() && centerLat in -90.0..90.0 && centerLon.isFinite() && centerLon in -180.0..180.0)
        require(kotlin.math.abs(centerLat - requestedLat) <= 1e-7 && kotlin.math.abs(centerLon - requestedLon) <= 1e-7) { "Route graph center mismatch" }
        val radiusM = root.getInt("radiusM")
        require(radiusM in 100..650) { "Route graph radius invalid" }
        val array = root.getJSONArray("segments")
        require(array.length() <= MAX_SEGMENTS) { "Too many route graph segments" }
        val segments = ArrayList<LocalRouteSegment>(array.length())
        for (i in 0 until array.length()) {
            val item = array.getJSONObject(i)
            val id = item.getString("id")
            if (id.length !in 3..120) continue
            val aLat = item.getDouble("aLat"); val aLon = item.getDouble("aLon")
            val bLat = item.getDouble("bLat"); val bLon = item.getDouble("bLon")
            if (!validCoordinate(aLat, aLon) || !validCoordinate(bLat, bLon)) continue
            val rawMask = item.getInt("allowedModeMask")
            if (rawMask <= 0 || rawMask and MOVING_MODE_MASK == 0 || rawMask and MOVING_MODE_MASK.inv() != 0) continue
            segments += LocalRouteSegment(
                id = id,
                aLat = aLat, aLon = aLon,
                bLat = bLat, bLon = bLon,
                allowedModeMask = rawMask,
                observations = 1,
                lastSeenWallMs = generatedAtMs,
                source = RouteSegmentSource.PRIVATE_MAP
            )
        }
        return Result(centerLat, centerLon, generatedAtMs, radiusM, segments)
    }

    private fun readBoundedText(stream: InputStream?): String {
        if (stream == null) return ""
        stream.use { input ->
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(4_096)
            var total = 0
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                if (read == 0) continue
                total += read
                require(total <= MAX_RESPONSE_BYTES) { "Route graph response too large" }
                output.write(buffer, 0, read)
            }
            return output.toString(Charsets.UTF_8.name())
        }
    }

    private fun secureBase(baseUrl: String): String {
        val value = baseUrl.trim().trimEnd('/')
        val url = URL(value)
        require(url.protocol.equals("https", ignoreCase = true)) { "Brick API requires HTTPS" }
        require(url.host.isNotBlank()) { "Brick API host is required" }
        require(url.userInfo == null) { "Brick API URL must not contain user info" }
        require(url.query == null && url.ref == null) { "Brick API base must not contain query or fragment" }
        require(url.path.isNullOrEmpty() || url.path == "/") { "Brick API base must not contain a path" }
        return "https://${url.authority}"
    }

    private fun validDeviceId(value: String): Boolean {
        val parsed = runCatching { UUID.fromString(value) }.getOrNull() ?: return false
        return parsed.toString() == value && parsed.version() == 4 && parsed.variant() == 2
    }

    private fun validCoordinate(lat: Double, lon: Double) = lat.isFinite() && lon.isFinite() && lat in -90.0..90.0 && lon in -180.0..180.0
}
