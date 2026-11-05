package com.brick.safety.beta

import com.brick.safety.BuildConfig
import com.brick.safety.crypto.DeviceKeys
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

/** No redirects, response payload logging, production fallback or real telemetry sequence changes. */
object BetaApi {
    fun origin(value: String): String {
        val u = URL(value.trim().trimEnd('/'))
        require(u.protocol == "https" && u.host.isNotBlank() && u.userInfo == null && u.query == null && u.ref == null)
        require((u.path.isEmpty() || u.path == "/") && (u.port == -1 || u.port == 443))
        return "https://${u.host}"
    }
    fun request(base: String, device: String, action: String, extra: JSONObject = JSONObject()): JSONObject {
        require(UUID.fromString(device).toString().equals(device, true))
        require(action == "readiness" || action == "observations")
        val nonce = UUID.randomUUID().toString()
        val body = extra.put("protocol", 1).put("nonce", nonce).put("releaseId", BuildConfig.BRICK_RELEASE_ID)
            .put("apkSourceSha", BuildConfig.BRICK_SOURCE_SHA).put("sentAtMs", System.currentTimeMillis()).toString().toByteArray(Charsets.UTF_8)
        require(body.size <= 65_536)
        val connection = URL("${origin(base)}/api/device/$device/beta/$action").openConnection() as HttpURLConnection
        try {
            connection.instanceFollowRedirects = false
            connection.requestMethod = "POST"
            connection.connectTimeout = 8_000; connection.readTimeout = 8_000; connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("X-Brick-Signature", DeviceKeys.sign(body))
            connection.outputStream.use { it.write(body) }
            val code = connection.responseCode
            if (code == 404 || code == 501) throw BackendPending()
            check(code == 200) { "beta_http_$code" }
            val deadline = android.os.SystemClock.elapsedRealtime() + 12_000L
            val bytes = connection.inputStream.use { input ->
                val out = java.io.ByteArrayOutputStream(); val buffer = ByteArray(4096)
                while (true) {
                    check(android.os.SystemClock.elapsedRealtime() <= deadline) { "beta_read_deadline" }
                    val n = input.read(buffer); if (n < 0) break
                    check(out.size() + n <= 65_536) { "beta_response_too_large" }; out.write(buffer, 0, n)
                }
                out.toByteArray()
            }
            val result = JSONObject(String(bytes, Charsets.UTF_8))
            check(result.optInt("protocol") == 1 && result.optString("nonce") == nonce) { "beta_nonce_or_protocol" }
            check(result.optString("environment") == "beta" && result.optString("releaseId") == BuildConfig.BRICK_RELEASE_ID) { "beta_identity_mismatch" }
            check(result.optString("backendSourceSha").matches(Regex("[0-9a-f]{40}"))) { "beta_source_missing" }
            check(kotlin.math.abs(System.currentTimeMillis() - result.optLong("serverReceivedAtMs", 0)) <= 120_000L) { "beta_clock_or_stale_response" }
            return result
        } finally { connection.disconnect() }
    }
    class BackendPending : Exception("phase2_endpoint_pending")
}
