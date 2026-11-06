package com.brick.safety.reliability

import org.junit.Assert.assertEquals
import org.junit.Test
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException

class UploadFailureReasonTest {
    @Test fun classifiesHttpWithoutLeakingMessageBody() {
        assertEquals("http_401", UploadFailureReason.classify(IllegalStateException("Upload failed 401: private-token https://example.test")))
        assertEquals("http_403", UploadFailureReason.classify(IllegalStateException("Batch upload failed 403: secret")))
        assertEquals("http_500", UploadFailureReason.classify(IllegalStateException("Health upload failed 500: hidden body")))
    }

    @Test fun classifiesNetworkAndSanitizesUnknown() {
        assertEquals("network_timeout", UploadFailureReason.classify(SocketTimeoutException("sensitive hostname")))
        assertEquals("dns_failure", UploadFailureReason.classify(UnknownHostException("private endpoint")))
        assertEquals("tls_failure", UploadFailureReason.classify(SSLException("private TLS info")))
        assertEquals("transport_or_ack_failure", UploadFailureReason.classify(IllegalStateException("Authorization: bearer secret")))
        assertEquals("unknown", UploadFailureReason.classify(null))
    }
}
