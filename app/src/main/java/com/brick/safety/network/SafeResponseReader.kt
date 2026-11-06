package com.brick.safety.network

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection

/** Bounded reads protect the tracking/health retry lanes from huge upstream error bodies. */
internal object SafeResponseReader {
    const val MAX_RESPONSE_BYTES = 16 * 1024

    fun read(connection: HttpURLConnection): String {
        val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
        return readStream(stream)
    }

    fun readStream(stream: InputStream?, limit: Int = MAX_RESPONSE_BYTES): String {
        require(limit in 1..MAX_RESPONSE_BYTES)
        if (stream == null) return ""
        return stream.use { input ->
            val result = ByteArrayOutputStream(minOf(2048, limit))
            val buffer = ByteArray(2048)
            while (result.size() <= limit) {
                val remaining = limit + 1 - result.size()
                if (remaining <= 0) break
                val count = input.read(buffer, 0, minOf(remaining, buffer.size))
                if (count == -1) break
                if (count == 0) throw IOException("response_stalled")
                result.write(buffer, 0, count)
            }
            if (result.size() > limit) throw IOException("response_too_large")
            String(result.toByteArray(), Charsets.UTF_8)
        }
    }
}
