package com.brick.safety.network

import com.brick.safety.crypto.DeviceKeys
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Dedicated best-effort current-state path. Durable history remains in the local Journal. */
object LiveApi {
    data class Trace(
        val id: String,
        val sourceWallMs: Long,
        val persistedWallMs: Long,
        val persistDurationMs: Long,
        val sendStartWallMs: Long
    )

    data class Result(
        val previewed: Boolean,
        val backendReceivedAtMs: Long?,
        val doUpdatedAtMs: Long?
    )

    fun send(baseUrl: String, deviceId: String, payload: ByteArray, trace: Trace): Result {
        val base = secureBase(baseUrl)
        val c = (URL("$base/api/device/$deviceId/location/live").openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = false
            requestMethod = "POST"
            connectTimeout = 5_000
            readTimeout = 5_000
            doOutput = true
            setRequestProperty("Content-Type", "application/octet-stream")
            setRequestProperty("X-Brick-Signature", DeviceKeys.sign(payload))
            setRequestProperty("X-Brick-Live-Trace", trace.id.take(120))
            setRequestProperty("X-Brick-Source-Wall-Ms", trace.sourceWallMs.toString())
            setRequestProperty("X-Brick-Persisted-Wall-Ms", trace.persistedWallMs.toString())
            setRequestProperty("X-Brick-Persist-Duration-Ms", trace.persistDurationMs.coerceAtLeast(0L).toString())
            setRequestProperty("X-Brick-Send-Wall-Ms", trace.sendStartWallMs.toString())
        }
        c.outputStream.use { it.write(payload) }
        val text = (if (c.responseCode in 200..299) c.inputStream else c.errorStream).bufferedReader().use { it.readText() }
        if (c.responseCode !in 200..299) error("Live preview failed ${c.responseCode}: ${text.take(300)}")
        val j = JSONObject(text)
        return Result(
            previewed = j.optBoolean("previewed", false),
            backendReceivedAtMs = j.optLong("backendReceivedAtMs", -1L).takeIf { it > 0L },
            doUpdatedAtMs = j.optLong("doUpdatedAtMs", -1L).takeIf { it > 0L }
        )
    }

    private fun secureBase(value: String): String {
        val u = URL(value.trim().trimEnd('/'))
        require(u.protocol.equals("https", true) && u.host.isNotBlank() && u.userInfo == null && u.query == null && u.ref == null)
        require(u.path.isNullOrEmpty() || u.path == "/")
        return "https://${u.authority}"
    }
}
