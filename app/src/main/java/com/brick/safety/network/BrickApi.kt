package com.brick.safety.network

import com.brick.safety.crypto.DeviceKeys
import com.brick.safety.fusion.LearnedPlaceDefinition
import com.brick.safety.fusion.Phase5CoarseNetworkRuntime
import com.brick.safety.fusion.Phase5LearnedPlaceRuntime
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID

object BrickApi {
    data class PairResult(val deviceId: String, val apiBase: String)
    data class SafetyEnvelope(val eventId: String, val kind: String, val payload: ByteArray)
    data class LocationUpload(val epoch: Int, val sequence: Long, val payload: ByteArray)
    data class BleAnchorConfig(val geofenceId: String, val name: String, val beaconUuid: String, val latitude: Double, val longitude: Double, val radiusM: Float)
    data class LearnedPlaceConfig(val id: String, val name: String, val latitude: Double, val longitude: Double, val radiusM: Float)
    data class CoarseNetworkConfig(val latitude: Double, val longitude: Double)
    data class LocationControlCommand(val deviceId: String, val commandId: String, val nonce: String, val desiredEnabled: Boolean, val issuedAtMs: Long, val expiresAtMs: Long)
    data class LiveTrackCommand(val deviceId: String, val commandId: String, val nonce: String, val active: Boolean, val issuedAtMs: Long, val expiresAtMs: Long)
    data class WifiScheduleConfig(val id: String, val enabled: Boolean, val targetEnabled: Boolean, val localMinuteOfDay: Int, val daysMask: Int, val graceMinutes: Int)
    data class HealthSyncResult(
        val bleAnchors: List<BleAnchorConfig>,
        val locationCommand: LocationControlCommand?,
        val liveTrackCommand: LiveTrackCommand?,
        val wifiSchedules: List<WifiScheduleConfig>?
    )
    data class HealthConfig(
        val bleAnchors: List<BleAnchorConfig>?,
        val learnedPlaces: List<LearnedPlaceConfig>?,
        val coarseNetwork: CoarseNetworkConfig?,
        val locationCommand: LocationControlCommand?,
        val liveTrackCommand: LiveTrackCommand?,
        val wifiSchedules: List<WifiScheduleConfig>?
    )

    private const val LOCATION_V2_BYTES = 90
    private const val LOCATION_BATCH_VERSION: Byte = 1
    private const val MAX_LOCATION_DRAIN_GROUP = 50
    private const val MAX_LOCATION_HTTP_BATCH = 20
    private const val MAX_COMMAND_DELIVERY_MS = 10 * 60_000L
    private const val MAX_COMMAND_FUTURE_SKEW_MS = 60_000L
    private val PLACE_ID_RE = Regex("[A-Za-z0-9._:-]{1,96}")
    private val COMMAND_ID_RE = Regex("[A-Za-z0-9._:-]{8,128}")

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
    private fun endpoint(baseUrl: String, path: String): URL { require(path.startsWith('/')); return URL(secureBase(baseUrl) + path) }
    private fun connection(url: URL): HttpURLConnection = (url.openConnection() as HttpURLConnection).apply { instanceFollowRedirects = false }

    fun completePairing(baseUrl: String, token: String): PairResult {
        val requestedBase = secureBase(baseUrl)
        require(token.length in 16..256) { "Invalid Brick pairing token" }
        val c = connection(endpoint(requestedBase, "/api/pair/complete"))
        c.requestMethod = "POST"; c.connectTimeout = 10_000; c.readTimeout = 10_000; c.doOutput = true
        c.setRequestProperty("Content-Type", "application/json")
        val body = JSONObject().put("token", token).put("publicKeySpkiB64", DeviceKeys.publicSpkiBase64()).toString().toByteArray()
        c.outputStream.use { it.write(body) }
        val text = (if (c.responseCode in 200..299) c.inputStream else c.errorStream).bufferedReader().use { it.readText() }
        if (c.responseCode !in 200..299) error("Pairing failed: $text")
        val j = JSONObject(text)
        val apiBase = secureBase(j.getString("apiBase"))
        require(apiBase == requestedBase) { "Pairing server attempted to change Brick API origin" }
        return PairResult(j.getString("deviceId"), apiBase)
    }

    fun sendLocation(baseUrl: String, deviceId: String, payload: ByteArray): Long {
        val c = connection(endpoint(baseUrl, "/api/device/$deviceId/location"))
        c.requestMethod = "POST"; c.connectTimeout = 8_000; c.readTimeout = 8_000; c.doOutput = true
        c.setRequestProperty("Content-Type", "application/octet-stream"); c.setRequestProperty("X-Brick-Signature", DeviceKeys.sign(payload))
        c.outputStream.use { it.write(payload) }
        val text = (if (c.responseCode in 200..299) c.inputStream else c.errorStream).bufferedReader().use { it.readText() }
        if (c.responseCode !in 200..299) error("Upload failed ${c.responseCode}: $text")
        return JSONObject(text).getLong("ack")
    }

    fun sendLiveLocationPreview(baseUrl: String, deviceId: String, payload: ByteArray): Boolean {
        require(payload.size == LOCATION_V2_BYTES && payload.firstOrNull()?.toInt() == 2)
        val c = connection(endpoint(baseUrl, "/api/device/$deviceId/location/live"))
        c.requestMethod = "POST"; c.connectTimeout = 5_000; c.readTimeout = 5_000; c.doOutput = true
        c.setRequestProperty("Content-Type", "application/octet-stream"); c.setRequestProperty("X-Brick-Signature", DeviceKeys.sign(payload))
        c.outputStream.use { it.write(payload) }
        val text = (if (c.responseCode in 200..299) c.inputStream else c.errorStream).bufferedReader().use { it.readText() }
        if (c.responseCode !in 200..299) error("Live preview failed ${c.responseCode}: $text")
        return JSONObject(text).optBoolean("previewed", false)
    }

    private fun sendLocationBatchChunk(baseUrl: String, deviceId: String, items: List<LocationUpload>): List<Pair<Int, Long>> {
        require(items.isNotEmpty() && items.size <= MAX_LOCATION_HTTP_BATCH)
        val body = ByteBuffer.allocate(3 + items.size * LOCATION_V2_BYTES).order(ByteOrder.BIG_ENDIAN)
            .put(LOCATION_BATCH_VERSION).putShort(items.size.toShort()).apply { items.forEach { put(it.payload) } }.array()
        val c = connection(endpoint(baseUrl, "/api/device/$deviceId/location/batch"))
        c.requestMethod = "POST"; c.connectTimeout = 10_000; c.readTimeout = 15_000; c.doOutput = true
        c.setRequestProperty("Content-Type", "application/octet-stream"); c.setRequestProperty("X-Brick-Signature", DeviceKeys.sign(body))
        c.outputStream.use { it.write(body) }
        val text = (if (c.responseCode in 200..299) c.inputStream else c.errorStream).bufferedReader().use { it.readText() }
        if (c.responseCode !in 200..299) error("Batch upload failed ${c.responseCode}: $text")
        val response = JSONObject(text); val acks = response.getJSONArray("acked")
        if (acks.length() != items.size) error("Batch ACK count mismatch")
        val expected = items.map { it.epoch to it.sequence }.toSet()
        val actual = buildSet { for (i in 0 until acks.length()) { val ack = acks.getJSONObject(i); add(ack.getInt("epoch") to ack.getLong("sequence")) } }
        if (actual.size != items.size || actual != expected) error("Batch ACK contents mismatch")
        return items.map { it.epoch to it.sequence }
    }

    fun sendLocationBatch(baseUrl: String, deviceId: String, items: List<LocationUpload>): List<Pair<Int, Long>> {
        require(items.isNotEmpty() && items.size <= MAX_LOCATION_DRAIN_GROUP)
        items.forEachIndexed { index, item ->
            require(item.payload.size == LOCATION_V2_BYTES && item.payload.firstOrNull()?.toInt() == 2)
            if (index > 0) { val previous = items[index - 1]; require(item.epoch > previous.epoch || (item.epoch == previous.epoch && item.sequence > previous.sequence)) }
        }
        val acknowledged = ArrayList<Pair<Int, Long>>(items.size)
        for (chunk in items.chunked(MAX_LOCATION_HTTP_BATCH)) acknowledged += sendLocationBatchChunk(baseUrl, deviceId, chunk)
        if (acknowledged.size != items.size) error("Durable batch ACK count mismatch")
        return acknowledged
    }

    internal fun parseHealthConfig(response: JSONObject, nowMs: Long = System.currentTimeMillis()): HealthConfig {
        val bleAnchors: List<BleAnchorConfig>? = if (response.has("bleAnchors") && !response.isNull("bleAnchors")) {
            val array = response.optJSONArray("bleAnchors")
            if (array == null) emptyList() else buildList {
                for (i in 0 until minOf(array.length(), 8)) {
                    val j = array.optJSONObject(i) ?: continue
                    val uuid = j.optString("beaconUuid", "").lowercase(); val geofenceId = j.optString("geofenceId", "")
                    val lat = j.optDouble("latitude", Double.NaN); val lon = j.optDouble("longitude", Double.NaN); val radius = j.optDouble("radiusM", Double.NaN)
                    if (runCatching { UUID.fromString(uuid) }.isFailure || geofenceId.isBlank() || !lat.isFinite() || lat !in -90.0..90.0 || !lon.isFinite() || lon !in -180.0..180.0 || !radius.isFinite() || radius !in 25.0..5_000.0) continue
                    add(BleAnchorConfig(geofenceId, j.optString("name", "Trusted place").trim().take(64).ifBlank { "Trusted place" }, uuid, lat, lon, radius.toFloat()))
                }
            }
        } else null

        val learnedPlaces: List<LearnedPlaceConfig>? = if (response.has("learnedPlaces") && !response.isNull("learnedPlaces")) {
            val array = response.optJSONArray("learnedPlaces")
            if (array == null) emptyList() else buildList {
                val seen = HashSet<String>()
                for (i in 0 until minOf(array.length(), 32)) {
                    val j = array.optJSONObject(i) ?: continue
                    val id = j.optString("id", ""); val name = j.optString("name", "").trim()
                    val lat = j.optDouble("latitude", Double.NaN); val lon = j.optDouble("longitude", Double.NaN); val radius = j.optDouble("radiusM", Double.NaN)
                    if (!PLACE_ID_RE.matches(id) || !seen.add(id) || name.isBlank() || name.length > 64 || !lat.isFinite() || lat !in -90.0..90.0 || !lon.isFinite() || lon !in -180.0..180.0 || !radius.isFinite() || radius !in 25.0..5_000.0) continue
                    add(LearnedPlaceConfig(id, name, lat, lon, radius.toFloat()))
                }
            }
        } else null

        val coarseNetwork = if (response.has("coarseNetwork") && !response.isNull("coarseNetwork")) response.optJSONObject("coarseNetwork")?.let { j ->
            val lat = j.optDouble("latitude", Double.NaN); val lon = j.optDouble("longitude", Double.NaN)
            if (lat.isFinite() && lat in -90.0..90.0 && lon.isFinite() && lon in -180.0..180.0) CoarseNetworkConfig(lat, lon) else null
        } else null

        fun commandCommon(j: JSONObject): Triple<String, Long, Long>? {
            val commandId = j.optString("commandId", ""); val nonce = j.optString("nonce", "")
            val issued = j.optLong("issuedAtMs", -1L); val expires = j.optLong("expiresAtMs", -1L)
            if (!COMMAND_ID_RE.matches(commandId) || runCatching { UUID.fromString(nonce) }.isFailure || issued <= 0L || issued > nowMs + MAX_COMMAND_FUTURE_SKEW_MS || expires <= issued || expires <= nowMs || expires - nowMs > MAX_COMMAND_DELIVERY_MS) return null
            return Triple(commandId, issued, expires)
        }

        val locationCommand = response.optJSONObject("locationCommand")?.let { j ->
            val deviceId = j.optString("deviceId", ""); val common = commandCommon(j); val desired = j.opt("desiredEnabled")
            if (j.optInt("protocol", -1) != 1 || runCatching { UUID.fromString(deviceId) }.isFailure || common == null || desired !is Boolean) null
            else LocationControlCommand(deviceId, common.first, j.getString("nonce"), desired, common.second, common.third)
        }

        val liveTrackCommand = response.optJSONObject("liveTrackCommand")?.let { j ->
            val deviceId = j.optString("deviceId", ""); val common = commandCommon(j); val active = j.opt("active")
            if (j.optInt("protocol", -1) != 1 || runCatching { UUID.fromString(deviceId) }.isFailure || common == null || active !is Boolean) null
            else LiveTrackCommand(deviceId, common.first, j.getString("nonce"), active, common.second, common.third)
        }

        val wifiSchedules: List<WifiScheduleConfig>? = if (response.has("wifiSchedules") && !response.isNull("wifiSchedules")) {
            val a = response.optJSONArray("wifiSchedules")
            if (a == null) emptyList() else buildList {
                val seen = HashSet<String>()
                for (i in 0 until minOf(a.length(), 8)) {
                    val j = a.optJSONObject(i) ?: continue; val id = j.optString("id", "")
                    val minute = j.optInt("localMinuteOfDay", -1); val mask = j.optInt("daysMask", 0); val grace = j.optInt("graceMinutes", 15)
                    if (!PLACE_ID_RE.matches(id) || !seen.add(id) || minute !in 0..1439 || mask !in 1..127 || grace !in 1..120) continue
                    add(WifiScheduleConfig(id, j.optBoolean("enabled", true), j.optBoolean("targetEnabled", true), minute, mask, grace))
                }
            }
        } else null

        return HealthConfig(bleAnchors, learnedPlaces, coarseNetwork, locationCommand, liveTrackCommand, wifiSchedules)
    }

    private fun applyLearnedPlaceConfig(deviceId: String, config: HealthConfig) {
        val places = config.learnedPlaces ?: return
        val definitions = places.mapNotNull { runCatching { LearnedPlaceDefinition(it.id, it.name, it.latitude, it.longitude, it.radiusM) }.getOrNull() }
        Phase5LearnedPlaceRuntime.update(deviceId, definitions)
    }
    private fun applyCoarseNetworkConfig(deviceId: String, config: HealthConfig) {
        val coarse = config.coarseNetwork ?: return
        Phase5CoarseNetworkRuntime.update(deviceId, coarse.latitude, coarse.longitude)
    }

    fun sendHealth(baseUrl: String, deviceId: String, health: JSONObject): HealthSyncResult {
        val payload = health.toString().toByteArray(Charsets.UTF_8)
        val c = connection(endpoint(baseUrl, "/api/device/$deviceId/health"))
        c.requestMethod = "POST"; c.connectTimeout = 8_000; c.readTimeout = 8_000; c.doOutput = true
        c.setRequestProperty("Content-Type", "application/json"); c.setRequestProperty("X-Brick-Signature", DeviceKeys.sign(payload))
        c.outputStream.use { it.write(payload) }
        val text = (if (c.responseCode in 200..299) c.inputStream else c.errorStream).bufferedReader().use { it.readText() }
        if (c.responseCode !in 200..299) error("Health upload failed ${c.responseCode}: $text")
        val config = parseHealthConfig(JSONObject(text))
        applyLearnedPlaceConfig(deviceId, config); applyCoarseNetworkConfig(deviceId, config)
        return HealthSyncResult(config.bleAnchors ?: emptyList(), config.locationCommand, config.liveTrackCommand, config.wifiSchedules)
    }

    fun createSafetyEnvelope(kind: String, eventSequence: Long, detail: JSONObject = JSONObject(), latitude: Double? = null, longitude: Double? = null, accuracyM: Double? = null): SafetyEnvelope {
        require(eventSequence > 0L)
        val eventId = UUID.randomUUID().toString()
        val event = JSONObject().put("protocol", 1).put("eventId", eventId).put("eventSequence", eventSequence).put("kind", kind).put("createdAtMs", System.currentTimeMillis()).put("detail", detail)
        if (latitude != null && longitude != null) { event.put("latitude", latitude).put("longitude", longitude); if (accuracyM != null) event.put("accuracyM", accuracyM) }
        return SafetyEnvelope(eventId, kind, event.toString().toByteArray(Charsets.UTF_8))
    }

    fun sendSafetyPayload(baseUrl: String, deviceId: String, payload: ByteArray, expectedEventId: String): String {
        val c = connection(endpoint(baseUrl, "/api/device/$deviceId/event"))
        c.requestMethod = "POST"; c.connectTimeout = 8_000; c.readTimeout = 8_000; c.doOutput = true
        c.setRequestProperty("Content-Type", "application/json"); c.setRequestProperty("X-Brick-Signature", DeviceKeys.sign(payload)); c.outputStream.use { it.write(payload) }
        val text = (if (c.responseCode in 200..299) c.inputStream else c.errorStream).bufferedReader().use { it.readText() }
        if (c.responseCode !in 200..299) error("Safety event upload failed ${c.responseCode}: $text")
        val ack = JSONObject(text).optString("eventId"); if (ack != expectedEventId) error("Safety event ACK mismatch"); return ack
    }

    fun sendCrashPayload(baseUrl: String, deviceId: String, payload: ByteArray, expectedReportId: String): String {
        val c = connection(endpoint(baseUrl, "/api/device/$deviceId/crash"))
        c.requestMethod = "POST"; c.connectTimeout = 8_000; c.readTimeout = 8_000; c.doOutput = true
        c.setRequestProperty("Content-Type", "application/json"); c.setRequestProperty("X-Brick-Signature", DeviceKeys.sign(payload)); c.outputStream.use { it.write(payload) }
        val text = (if (c.responseCode in 200..299) c.inputStream else c.errorStream).bufferedReader().use { it.readText() }
        if (c.responseCode !in 200..299) error("Crash report failed ${c.responseCode}")
        val ack = JSONObject(text).optString("reportId"); if (ack != expectedReportId) error("Crash report ACK mismatch"); return ack
    }
}
