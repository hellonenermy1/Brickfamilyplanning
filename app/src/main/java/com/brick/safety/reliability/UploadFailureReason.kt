package com.brick.safety.reliability

import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.net.ConnectException
import javax.net.ssl.SSLException

/**
 * Privacy-minimised reason codes for failure investigation.
 * Never log raw exception messages, URLs, device IDs or server response bodies.
 */
internal object UploadFailureReason {
    private val statusPattern = Regex("""(?:upload|failed|failure)\s+([1-5][0-9]{2})(?=\s|:|$)""", RegexOption.IGNORE_CASE)

    fun classify(failure: Throwable?): String {
        if (failure == null) return "unknown"
        return when (failure) {
            is SocketTimeoutException -> "network_timeout"
            is UnknownHostException -> "dns_failure"
            is ConnectException -> "connection_failure"
            is SSLException -> "tls_failure"
            else -> {
                val status = statusPattern.find(failure.message.orEmpty())?.groupValues?.getOrNull(1)
                if (status != null) "http_$status"
                else when {
                    failure is SecurityException -> "security_exception"
                    failure is java.io.IOException -> "network_io_failure"
                    failure is IllegalArgumentException -> "invalid_request"
                    else -> "transport_or_ack_failure"
                }
            }
        }
    }
}
