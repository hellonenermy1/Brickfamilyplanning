package com.brick.safety.privileged

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.atomic.AtomicBoolean

class RecoverableExecutorLaneTest {
    @Test
    fun timedOutUninterruptibleCallDoesNotBlockReplacementLane() {
        val lane = RecoverableExecutorLane("brick-p8c-test-lane")
        val releaseOldCall = AtomicBoolean(false)
        try {
            val first = lane.call(80L) {
                // Model a Binder/native call that ignores interruption. Future.cancel(true) alone
                // cannot make a single-thread executor usable again in this failure mode.
                while (!releaseOldCall.get()) {
                    try {
                        Thread.sleep(10L)
                    } catch (_: InterruptedException) {
                        // Deliberately ignore interruption until the test releases the old call.
                    }
                }
                "late"
            }
            assertTrue(first.isFailure)

            val second = lane.call(1_000L) { "recovered" }
            assertTrue(second.isSuccess)
            assertEquals("recovered", second.getOrThrow())
        } finally {
            releaseOldCall.set(true)
            lane.shutdown()
        }
    }
}
