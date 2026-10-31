package com.brick.safety.evidence

import android.content.Context
import com.brick.safety.data.CrashOutbox
import com.brick.safety.data.Journal
import com.brick.safety.reliability.RecoveryScheduler
import com.brick.safety.reliability.SafetyDispatcher

class EvidenceDispatcher(
    context: Context,
    private val journal: EvidenceJournal = EvidenceJournal(context)
) {
    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences("brick", Context.MODE_PRIVATE)

    @Synchronized
    fun enqueue(observation: EvidenceObservation): Boolean {
        val epoch = prefs.getInt("epoch", 1).coerceAtLeast(0)
        val stored = prefs.getLong("evidenceSequence", 0L)
        val next = maxOf(stored, journal.maxSequence(epoch)) + 1L
        if (!prefs.edit().putLong("evidenceSequence", next).commit()) return false
        val appended = journal.append(EvidenceRecord(epoch, next, observation))
        if (appended) runCatching { RecoveryScheduler.scheduleSoon(appContext, 5) }
        return appended
    }

    fun stats(): EvidenceJournal.Stats = journal.stats()

    /**
     * Evidence is intentionally the lowest-priority durable stream. It is not sent while
     * safety, crash or durable location backlog exists. Later phases may improve cadence,
     * but they must preserve this ordering invariant.
     */
    fun drainIfSafe(maxBatches: Int = 2): Int {
        val deviceId = prefs.getString("deviceId", null) ?: return 0
        val baseUrl = prefs.getString("apiBase", null) ?: return 0
        if (SafetyDispatcher.pendingCount(appContext) > 0) return 0

        val locationJournal = Journal(appContext)
        val locationPending = try { locationJournal.stats().pendingCount } finally { locationJournal.close() }
        if (locationPending > 0) return 0

        val crashOutbox = CrashOutbox(appContext)
        if (runCatching { crashOutbox.pendingCount() > 0 }.getOrDefault(true)) return 0

        var sent = 0
        repeat(maxBatches.coerceIn(1, 8)) {
            if (SafetyDispatcher.pendingCount(appContext) > 0) return sent
            val pending = journal.nextPending(EvidenceProtocol.MAX_RECORDS_PER_BATCH)
            if (pending.isEmpty()) return sent
            val records = pending.map { it.record }
            val batch = EvidenceProtocol.encodeBatch(records)
            val acked = try { EvidenceApi.sendBatch(baseUrl, deviceId, batch) } catch (_: Throwable) { return sent }
            if (!journal.ackBatch(acked)) return sent
            sent += acked.size
        }
        return sent
    }
}
