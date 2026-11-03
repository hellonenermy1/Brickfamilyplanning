package com.brick.safety.reliability

import com.brick.safety.data.Journal

/**
 * Small transport boundary used by Brick Core's location uploader.
 *
 * Network/DNS/TLS/HTTP failures are allowed to fail this attempt, but they may never delete the
 * durable journal row. Only an exact server acknowledgement can advance local durable state.
 * Injected transports make the exact production boundary deterministic to torture-test in CI.
 */
object DurableLocationDelivery {
    fun sendOne(
        journal: Journal,
        pending: Journal.Pending,
        transport: (ByteArray) -> Long
    ): Boolean {
        return try {
            val ack = transport(pending.payload)
            if (ack != pending.seq) return false
            journal.ackExact(pending.epoch, pending.seq)
        } catch (_: Throwable) {
            false
        }
    }

    fun sendBatch(
        journal: Journal,
        pending: List<Journal.Pending>,
        transport: (List<Journal.Pending>) -> List<Pair<Int, Long>>
    ): Boolean {
        if (pending.isEmpty()) return true
        return try {
            val acked = transport(pending)
            journal.ackBatch(acked)
        } catch (_: Throwable) {
            false
        }
    }
}

/** Persistent bounded backoff for Core uploads when Android still reports a validated network. */
object CoreUploadRetryPolicy {
    const val BASE_DELAY_MS = 5_000L
    const val MAX_DELAY_MS = 5L * 60L * 1_000L

    fun delayMs(streak: Int): Long {
        val exponent = (streak.coerceAtLeast(1) - 1).coerceAtMost(6)
        return (BASE_DELAY_MS * (1L shl exponent)).coerceAtMost(MAX_DELAY_MS)
    }
}
