package com.brick.safety.network

import com.brick.safety.crypto.DeviceKeys
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

object BrickApi {
    data class PairResult(val deviceId: String, val apiBase: String)
    data class SafetyEnvelope(val eventId: String, val kind: String, val payload: ByteArray)

    fun completePairing(baseUrl: String, token: String): PairResult {
        val url = URL(baseUrl.trimEnd('/') + "/api/pair/complete")
        val c = url.openConnection() as HttpURLConnection
        c.requestMethod = "POST"; c.connectTimeout = 10_000; c.readTimeout = 10_000; c.doOutput = true
        c.setRequestProperty("Content-Type", "application/json")
        val body = JSONObject().put("token", token).put("publicKeySpkiB64", DeviceKeys.publicSpkiBase64()).toString().toByteArray()
        c.outputStream.use { it.write(body) }
        val text = (if (c.responseCode in 200..299) c.inputStream else c.errorStream).bufferedReader().use { it.readText() }
        if (c.responseCode !in 200..299) error("Pairing failed: $text")
        val j = JSONObject(text)
        return PairResult(j.getString("deviceId"), j.getString("apiBase"))
    }

    fun sendLocation(baseUrl: String, deviceId: String, payload: ByteArray): Long {
        val url = URL(baseUrl.trimEnd('/') + "/api/device/$deviceId/location")
        val c = url.openConnection() as HttpURLConnection
        c.requestMethod = "POST"; c.connectTimeout = 8_000; c.readTimeout = 8_000; c.doOutput = true
        c.setRequestProperty("Content-Type", "application/octet-stream")
        c.setRequestProperty("X-Brick-Signature", DeviceKeys.sign(payload))
        c.outputStream.use { it.write(payload) }
        val text = (if (c.responseCode in 200..299) c.inputStream else c.errorStream).bufferedReader().use { it.readText() }
        if (c.responseCode !in 200..299) error("Upload failed ${c.responseCode}: $text")
        return JSONObject(text).getLong("ack")
    }

    fun sendHealth(baseUrl: String, deviceId: String, health: JSONObject) {
        val payload = health.toString().toByteArray(Charsets.UTF_8)
        val url = URL(baseUrl.trimEnd('/') + "/api/device/$deviceId/health")
        val c = url.openConnection() as HttpURLConnection
        c.requestMethod = "POST"; c.connectTimeout = 8_000; c.readTimeout = 8_000; c.doOutput = true
        c.setRequestProperty("Content-Type", "application/json")
        c.setRequestProperty("X-Brick-Signature", DeviceKeys.sign(payload))
        c.outputStream.use { it.write(payload) }
        val text = (if (c.responseCode in 200..299) c.inputStream else c.errorStream).bufferedReader().use { it.readText() }
        if (c.responseCode !in 200..299) error("Health upload failed ${c.responseCode}: $text")
    }

    fun createSafetyEnvelope(
        kind: String,
        eventSequence: Long,
        detail: JSONObject = JSONObject(),
        latitude: Double? = null,
        longitude: Double? = null,
        accuracyM: Double? = null
    ): SafetyEnvelope {
        require(eventSequence > 0L)
        val eventId = UUID.randomUUID().toString()
        val event = JSONObject()
            .put("protocol", 1)
            .put("eventId", eventId)
            .put("eventSequence", eventSequence)
            .put("kind", kind)
            .put("createdAtMs", System.currentTimeMillis())
            .put("detail", detail)
        if (latitude != null && longitude != null) {
            event.put("latitude", latitude)
            event.put("longitude", longitude)
            if (accuracyM != null) event.put("accuracyM", accuracyM)
        }
        return SafetyEnvelope(eventId, kind, event.toString().toByteArray(Charsets.UTF_8))
    }

    fun sendSafetyPayload(baseUrl: String, deviceId: String, payload: ByteArray, expectedEventId: String): String {
        val url = URL(baseUrl.trimEnd('/') + "/api/device/$deviceId/event")
        val c = url.openConnection() as HttpURLConnection
        c.requestMethod = "POST"; c.connectTimeout = 8_000; c.readTimeout = 8_000; c.doOutput = true
        c.setRequestProperty("Content-Type", "application/json")
        c.setRequestProperty("X-Brick-Signature", DeviceKeys.sign(payload))
        c.outputStream.use { it.write(payload) }
        val text = (if (c.responseCode in 200..299) c.inputStream else c.errorStream).bufferedReader().use { it.readText() }
        if (c.responseCode !in 200..299) error("Safety event upload failed ${c.responseCode}: $text")
        val response = JSONObject(text)
        val ack = response.optString("eventId")
        if (ack != expectedEventId) error("Safety event ACK mismatch")
        return ack
    }

    fun sendCrashPayload(baseUrl: String, deviceId: String, payload: ByteArray, expectedReportId: String): String {
        val url = URL(baseUrl.trimEnd('/') + "/api/device/$deviceId/crash")
        val c = url.openConnection() as HttpURLConnection
        c.requestMethod = "POST"; c.connectTimeout = 8_000; c.readTimeout = 8_000; c.doOutput = true
        c.setRequestProperty("Content-Type", "application/json")
        c.setRequestProperty("X-Brick-Signature", DeviceKeys.sign(payload))
        c.outputStream.use { it.write(payload) }
        val text = (if (c.responseCode in 200..299) c.inputStream else c.errorStream).bufferedReader().use { it.readText() }
        if (c.responseCode !in 200..299) error("Crash report upload failed ${c.responseCode}")
        val ack = JSONObject(text).optString("reportId")
        if (ack != expectedReportId) error("Crash report ACK mismatch")
        return ack
    }
}
