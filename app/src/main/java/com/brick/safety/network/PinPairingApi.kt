package com.brick.safety.network

import com.brick.safety.crypto.DeviceKeys
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Manual fallback pairing. The eight-digit PIN only claims a pending session. Device binding does
 * not happen until a separately authenticated parent confirms it in the parent portal.
 */
object PinPairingApi {
    private val PIN = Regex("\\d{8}")

    private fun secureBase(baseUrl: String): String {
        val value = baseUrl.trim().trimEnd('/')
        val url = URL(value)
        require(url.protocol.equals("https", ignoreCase = true) && url.host.isNotBlank() && url.userInfo == null)
        require(url.query == null && url.ref == null && (url.path.isNullOrEmpty() || url.path == "/"))
        return "https://${url.authority}"
    }

    private fun postJson(url: URL, body: JSONObject): Pair<Int, String> {
        val c = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"; connectTimeout = 10_000; readTimeout = 10_000; doOutput = true
            instanceFollowRedirects = false; setRequestProperty("Content-Type", "application/json")
        }
        c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
        val code = c.responseCode
        val stream = if (code in 200..299) c.inputStream else c.errorStream
        return code to stream.bufferedReader().use { it.readText() }
    }

    fun completeFallback(baseUrl: String, pin: String): BrickApi.PairResult {
        val base = secureBase(baseUrl)
        require(PIN.matches(pin.trim())) { "Fallback pairing code must be eight digits" }
        val (claimCode, claimText) = postJson(
            URL("$base/api/pair/pin/claim"),
            JSONObject().put("pin", pin.trim()).put("publicKeySpkiB64", DeviceKeys.publicSpkiBase64())
        )
        if (claimCode !in 200..299) error("Fallback pairing claim failed: $claimText")
        val claim = JSONObject(claimText)
        val sessionId = claim.getString("sessionId")
        val claimSecret = claim.getString("claimSecret")
        val expiresAt = claim.getLong("expiresAt")
        require(sessionId.length in 32..64 && claimSecret.length >= 24)

        val deadline = minOf(expiresAt, System.currentTimeMillis() + 10 * 60_000L)
        while (System.currentTimeMillis() < deadline) {
            val (code, text) = postJson(
                URL("$base/api/pair/pin/status"),
                JSONObject().put("sessionId", sessionId).put("claimSecret", claimSecret)
            )
            if (code == 200) {
                val result = JSONObject(text)
                if (result.optString("status") == "confirmed") {
                    val apiBase = secureBase(result.getString("apiBase"))
                    require(apiBase == base) { "Pairing server attempted to change Brick API origin" }
                    return BrickApi.PairResult(result.getString("deviceId"), apiBase)
                }
            } else if (code !in listOf(202, 429)) {
                error("Fallback pairing confirmation failed: $text")
            }
            Thread.sleep(if (code == 429) 4_000L else 2_000L)
        }
        error("Fallback pairing expired before parent confirmation")
    }
}
