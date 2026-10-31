package com.brick.safety.evidence

import android.content.Context
import com.brick.safety.data.CrashOutbox
import com.brick.safety.data.Journal
import com.brick.safety.reliability.RecoveryScheduler
import com.brick.safety.reliability.SafetyDispatcher

fun interface EvidenceTransport {
    fun send(baseUrl: String, deviceId: String, batch: EvidenceProtocol.EncodedBatch): List<EvidenceAck>
}

object NetworkEvidenceTransport : EvidenceTransport {
    override fun send(baseUrl: String, deviceId: String, batch: EvidenceProtocol.EncodedBatch): List<EvidenceAck> =
        EvidenceApi.sendBatch(baseUrl, deviceId, batch)
}

class EvidenceDispatcher(
    context: Context,
    private val journal: EvidenceJournal = EvidenceJournal(context),
    private val transport: EvidenceTransport = NetworkEvidenceTransport,
    private val coreBacklogProbe: (() -> Boolean)? = null,
    private val scheduleRecovery: Boolean = true
) {
    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences("brick", Context.MODE_PRIVATE)

    @Synchronized
    fun enqueue(observation: EvidenceObservation): Boolean {
        val epoch = prefs.getInt("epoch", 1).coerceAtLeast(0)
        val stored = prefs.getLong("evidenceSequence", 0L)
        val next = maxOf(stored, journal.maxSequence(epoch)) + 1L
        if (next <= 0L) return false
        if (!prefs.edit().putLong("evidenceSequence", next).commit()) return false
        val appended = journal.append(EvidenceRecord(epoch, next, observation))
        if (appended && scheduleRecovery) runCatching { RecoveryScheduler.scheduleSoon(appContext, 5) }
        return appended
    }

    fun stats(): EvidenceJournal.Stats = journal.stats()

    private fun defaultCoreBacklogPresent(): Boolean {
        if (SafetyDispatcher.pendingCount(appContext) > 0) return true

        val locationPending = Journal(appContext).let { locationJournal ->
            try { locationJournal.stats().pendingCount } finally { locationJournal.close() }
        }
        if (locationPending > 0) return true

        val crashPending = CrashOutbox(appContext).let { outbox ->
            try { runCatching { outbox.pendingCount() > 0 }.getOrDefault(true) }
            finally { outbox.close() }
        }
        return crashPending
    }

    private fun coreBacklogPresent(): Boolean = coreBacklogProbe?.invoke() ?: defaultCoreBacklogPresent()

    /**
     * Evidence is intentionally the lowest-priority durable stream. It is not sent while
     * safety, crash or durable location backlog exists. Later phases may improve cadence,
     * but they must preserve this ordering invariant.
     */
    fun drainIfSafe(maxBatches: Int = 2): Int {
        val deviceId = prefs.getString("deviceId", null) ?: return 0
        val baseUrl = prefs.getString("apiBase", null) ?: return 0
        if (coreBacklogPresent()) return 0

        var sent = 0
        repeat(maxBatches.coerceIn(1, 8)) {
            // Recheck before each batch so safety/location work can preempt evidence between
            // evidence batches. Evidence never owns the live/safety upload path.
            if (coreBacklogPresent()) return sent
            val pending = journal.nextPending(EvidenceProtocol.MAX_RECORDS_PER_BATCH)
            if (pending.isEmpty()) return sent
            val batch = EvidenceProtocol.encodeBatch(pending.map { it.record })
            val acked = try { transport.send(baseUrl, deviceId, batch) } catch (_: Throwable) { return sent }
            if (!journal.ackBatch(acked)) return sent
            sent += acked.size
        }
        return sent
    }
}
