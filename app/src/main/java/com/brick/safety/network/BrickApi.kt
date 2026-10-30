package com.brick.safety.network

import com.brick.safety.crypto.DeviceKeys
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object BrickApi {
    data class PairResult(val deviceId: String, val apiBase: String)

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
}
