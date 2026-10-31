package com.brick.safety.evidence

import com.brick.safety.crypto.DeviceKeys
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

object EvidenceApi {
    private const val MAX_RESPONSE_BYTES = 65_536
    private val DEVICE_ID_RE = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")

    /**
     * Return Brick's canonical HTTPS API origin, rejecting paths, credentials, query strings and
     * fragments. The dispatcher uses this before journaling so a corrupted preference cannot create
     * a growing durable backlog that the network layer will later refuse to send.
     */
    fun normalizeBase(baseUrl: String): String {
        val value = baseUrl.trim().trimEnd('/')
        val url = URL(value)
        require(url.protocol.equals("https", ignoreCase = true)) { "Brick API requires HTTPS" }
        require(url.host.isNotBlank()) { "Brick API host is required" }
        require(url.userInfo == null) { "Brick API URL must not contain user info" }
        require(url.query == null && url.ref == null) { "Brick API base must not contain query or fragment" }
        require(url.path.isNullOrEmpty() || url.path == "/") { "Brick API base must not contain a path" }
        return "https://${url.authority}"
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
                require(total <= MAX_RESPONSE_BYTES) { "Evidence response too large" }
                output.write(buffer, 0, read)
            }
            return output.toString(Charsets.UTF_8.name())
        }
    }

    fun sendBatch(baseUrl: String, deviceId: String, batch: EvidenceProtocol.EncodedBatch): List<EvidenceAck> {
        require(DEVICE_ID_RE.matches(deviceId)) { "Invalid Brick device identity" }
        require(batch.bytes.size <= EvidenceProtocol.MAX_BATCH_BYTES)
        val url = URL(normalizeBase(baseUrl) + "/api/device/$deviceId/evidence")
        val c = (url.openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = false
            requestMethod = "POST"
            connectTimeout = 10_000
            readTimeout = 15_000
            doOutput = true
            setRequestProperty("Content-Type", "application/vnd.brick.evidence")
            setRequestProperty("X-Brick-Signature", DeviceKeys.sign(batch.bytes))
        }
        try {
            c.outputStream.use { it.write(batch.bytes) }
            val code = c.responseCode
            val text = readBoundedText(if (code in 200..299) c.inputStream else c.errorStream)
            if (code !in 200..299) error("Evidence upload failed $code: $text")

            val response = JSONObject(text)
            require(response.optInt("protocol", -1) == 1) { "Evidence ACK protocol mismatch" }
            require(response.optString("batchId") == batch.batchId) { "Evidence batch ACK mismatch" }
            val array = response.getJSONArray("acked")
            require(array.length() == batch.records.size) { "Evidence ACK count mismatch" }
            val actual = buildSet {
                for (i in 0 until array.length()) {
                    val item = array.getJSONObject(i)
                    add(EvidenceAck(item.getInt("epoch"), item.getLong("sequence"), item.getString("recordId")))
                }
            }
            val expected = batch.records.map { EvidenceAck(it.epoch, it.sequence, it.observation.recordId) }.toSet()
            require(actual.size == expected.size && actual == expected) { "Evidence ACK contents mismatch" }
            return batch.records.map { EvidenceAck(it.epoch, it.sequence, it.observation.recordId) }
        } finally {
            c.disconnect()
        }
    }
}
