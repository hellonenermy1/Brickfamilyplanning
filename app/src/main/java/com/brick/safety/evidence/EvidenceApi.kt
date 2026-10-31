package com.brick.safety.evidence

import com.brick.safety.crypto.DeviceKeys
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object EvidenceApi {
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

    fun sendBatch(baseUrl: String, deviceId: String, batch: EvidenceProtocol.EncodedBatch): List<EvidenceAck> {
        require(batch.bytes.size <= EvidenceProtocol.MAX_BATCH_BYTES)
        val url = URL(secureBase(baseUrl) + "/api/device/$deviceId/evidence")
        val c = (url.openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = false
            requestMethod = "POST"
            connectTimeout = 10_000
            readTimeout = 15_000
            doOutput = true
            setRequestProperty("Content-Type", "application/vnd.brick.evidence")
            setRequestProperty("X-Brick-Signature", DeviceKeys.sign(batch.bytes))
        }
        c.outputStream.use { it.write(batch.bytes) }
        val text = (if (c.responseCode in 200..299) c.inputStream else c.errorStream)
            .bufferedReader().use { it.readText() }
        if (c.responseCode !in 200..299) error("Evidence upload failed ${c.responseCode}: $text")

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
    }
}
