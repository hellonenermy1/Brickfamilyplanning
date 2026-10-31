package com.brick.safety.evidence

import com.brick.safety.crypto.DeviceKeys
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

class EvidenceUploadConflict(message: String) : Exception(message)

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

    private fun strictInteger(obj: JSONObject, key: String, min: Long, max: Long): Long {
        val raw = obj.get(key)
        val value = when (raw) {
            is Byte -> raw.toLong()
            is Short -> raw.toLong()
            is Int -> raw.toLong()
            is Long -> raw
            else -> throw IllegalArgumentException("Evidence ACK $key must be an integer JSON number")
        }
        require(value in min..max) { "Evidence ACK $key outside allowed range" }
        return value
    }

    /**
     * Parse only the exact ACK schema that may authorize local deletion. JSONObject.getInt/getLong
     * can coerce strings and fractional JSON numbers; that is intentionally forbidden here. The
     * server must return real integral JSON numbers and the exact record identities in this batch.
     */
    fun parseAckResponse(text: String, batch: EvidenceProtocol.EncodedBatch): List<EvidenceAck> {
        val response = JSONObject(text)
        require(strictInteger(response, "protocol", 1L, 1L) == 1L) { "Evidence ACK protocol mismatch" }
        val responseBatchId = response.get("batchId")
        require(responseBatchId is String && responseBatchId == batch.batchId) { "Evidence batch ACK mismatch" }

        val array = response.getJSONArray("acked")
        require(array.length() == batch.records.size) { "Evidence ACK count mismatch" }
        val actual = ArrayList<EvidenceAck>(array.length())
        for (i in 0 until array.length()) {
            val item = array.getJSONObject(i)
            val epoch = strictInteger(item, "epoch", 0L, Int.MAX_VALUE.toLong()).toInt()
            val sequence = strictInteger(item, "sequence", 1L, EvidenceProtocol.MAX_WIRE_INTEGER)
            val recordId = item.get("recordId")
            require(recordId is String) { "Evidence ACK recordId must be a string" }
            actual += EvidenceAck(epoch, sequence, recordId)
        }

        val expected = batch.records.map { EvidenceAck(it.epoch, it.sequence, it.observation.recordId) }
        require(actual.size == expected.size && actual.toSet() == expected.toSet()) { "Evidence ACK contents mismatch" }
        return expected
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
            // The authenticated Brick server uses 409 only when durable evidence identity/content
            // conflicts. Retrying the same front-of-queue record forever cannot resolve that state;
            // surface it separately so the dispatcher can retain it as quarantine and continue.
            if (code == 409) throw EvidenceUploadConflict(text.take(1_024))
            if (code !in 200..299) error("Evidence upload failed $code: $text")
            return parseAckResponse(text, batch)
        } finally {
            c.disconnect()
        }
    }
}
