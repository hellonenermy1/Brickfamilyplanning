package com.brick.safety.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.IOException

class SafeResponseReaderTest {
    @Test fun normalJsonResponseIntact() {
        assertEquals("{\"ack\":10}", SafeResponseReader.readStream(ByteArrayInputStream("{\"ack\":10}".toByteArray())))
    }

    @Test fun oversizedResponseRejectedBeforeExhaustingMemory() {
        val data = ByteArray(SafeResponseReader.MAX_RESPONSE_BYTES + 500) { 65 }
        assertThrows(IOException::class.java) { SafeResponseReader.readStream(ByteArrayInputStream(data)) }
    }

    @Test fun nullErrorBodyDoesNotThrow() {
        assertEquals("", SafeResponseReader.readStream(null))
    }
}
