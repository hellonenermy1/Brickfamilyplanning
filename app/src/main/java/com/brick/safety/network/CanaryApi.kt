package com.brick.safety.network

import com.brick.safety.crypto.DeviceKeys
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

object CanaryApi {
    data class Result(val nonce: String, val serverReceivedAtMs: Long)

    fun roundTrip(baseUrl: String, deviceId: String): Result {
        require(runCatching { UUID.fromString(deviceId) }.isSuccess)
        val base = secureBase(baseUrl)
        val nonce = UUID.randomUUID().toString()
        val payload = JSONObject()
            .put("protocol", 1)
            .put("nonce", nonce)
            .put("sentAtMs", System.currentTimeMillis())
            .toString().toByteArray(Charsets.UTF_8)
        val url = URL("$base/api/device/$deviceId/canary")
        val c = (url.openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = false
            requestMethod = "POST"
            connectTimeout = 8_000
            readTimeout = 8_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("X-Brick-Signature", DeviceKeys.sign(payload))
        }
        c.outputStream.use { it.write(payload) }
        val text = (if (c.responseCode in 200..299) c.inputStream else c.errorStream).bufferedReader().use { it.readText() }
        if (c.responseCode !in 200..299) error("Canary failed ${c.responseCode}: ${text.take(300)}")
        val j = JSONObject(text)
        if (j.optString("nonce") != nonce) error("Canary nonce mismatch")
        val received = j.optLong("serverReceivedAtMs", -1L)
        if (received <= 0L) error("Canary server timestamp missing")
        return Result(nonce, received)
    }

    private fun secureBase(value: String): String {
        val url = URL(value.trim().trimEnd('/'))
        require(url.protocol.equals("https", true) && url.host.isNotBlank() && url.userInfo == null && url.query == null && url.ref == null)
        require(url.path.isNullOrEmpty() || url.path == "/")
        return "https://${url.authority}"
    }
}
