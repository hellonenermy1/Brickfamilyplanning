package com.brick.safety.evidence

import android.content.Context
import com.brick.safety.data.Journal
import com.brick.safety.reliability.RecoveryScheduler
import com.brick.safety.reliability.SafetyDispatcher
import java.io.Closeable
import java.util.UUID

fun interface EvidenceTransport {
    fun send(baseUrl: String, deviceId: String, batch: EvidenceProtocol.EncodedBatch): List<EvidenceAck>
}

object NetworkEvidenceTransport : EvidenceTransport {
    override fun send(baseUrl: String, deviceId: String, batch: EvidenceProtocol.EncodedBatch): List<EvidenceAck> =
        EvidenceApi.sendBatch(baseUrl, deviceId, batch)
}

enum class EvidenceDrainStop { EMPTY, BUDGET_EXHAUSTED, CORE_BACKLOG, TRANSPORT_FAILURE, ACK_FAILURE, JOURNAL_FAILURE, IDENTITY_UNAVAILABLE }
data class EvidenceDrainResult(val sentRecords: Int, val stop: EvidenceDrainStop)
private data class ConflictIsolationResult(val sentRecords: Int, val stop: EvidenceDrainStop?)

class EvidenceDispatcher(
    context: Context,
    private val journal: EvidenceJournal = EvidenceJournal(context),
    private val transport: EvidenceTransport = NetworkEvidenceTransport,
    private val coreBacklogProbe: (() -> Boolean)? = null,
    private val scheduleRecovery: Boolean = true
) : Closeable {
    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences("brick", Context.MODE_PRIVATE)

    private fun pairedDeviceId(): String? {
        val value = prefs.getString("deviceId", null)?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        val parsed = runCatching { UUID.fromString(value) }.getOrNull() ?: return null
        return value.takeIf { parsed.toString() == value && parsed.version() == 4 && parsed.variant() == 2 }
    }

    private fun pairedApiBase(): String? {
        val value = prefs.getString("apiBase", null)?.takeIf { it.isNotBlank() } ?: return null
        return runCatching { EvidenceApi.normalizeBase(value) }.getOrNull()
    }

    @Synchronized
    fun enqueue(observation: EvidenceObservation): Boolean {
        val deviceId = pairedDeviceId() ?: return false
        if (pairedApiBase() == null) return false
        val epoch = prefs.getInt("epoch", 1).coerceAtLeast(0)
        val record = journal.appendNew(deviceId, epoch, observation) ?: return false
        prefs.edit().putLong("evidenceSequence", record.sequence).apply()
        if (scheduleRecovery) runCatching { RecoveryScheduler.scheduleEvidenceSoon(appContext, 5) }
        return true
    }

    fun stats(): EvidenceJournal.Stats = journal.stats()

    /** Exact scheduler order before evidence: all safety, current/durable Location, then pending health. */
    private fun defaultCoreBacklogPresent(): Boolean {
        if (SafetyDispatcher.pendingCount(appContext) > 0) return true
        val locationPending = Journal(appContext).let { locationJournal ->
            try { locationJournal.stats().pendingCount } finally { locationJournal.close() }
        }
        if (locationPending > 0) return true
        if (prefs.getBoolean("healthUploadPending", false)) return true
        // Crash/diagnostic backlog intentionally does NOT block evidence; diagnostics is the final
        // priority class and drains after evidence.
        return false
    }

    private fun coreBacklogPresent(): Boolean = coreBacklogProbe?.invoke() ?: defaultCoreBacklogPresent()
    private fun exactAck(pending: EvidenceJournal.Pending) = EvidenceAck(pending.record.epoch, pending.record.sequence, pending.record.observation.recordId)

    private fun isolateConflictBatch(baseUrl: String, deviceId: String, pending: List<EvidenceJournal.Pending>): ConflictIsolationResult {
        var sent = 0
        for (item in pending) {
            if (coreBacklogPresent()) return ConflictIsolationResult(sent, EvidenceDrainStop.CORE_BACKLOG)
            val expected = exactAck(item)
            val single = try { EvidenceProtocol.encodeBatch(listOf(item.record)) } catch (_: Throwable) { return ConflictIsolationResult(sent, EvidenceDrainStop.JOURNAL_FAILURE) }
            val acked = try {
                transport.send(baseUrl, deviceId, single)
            } catch (_: EvidenceUploadConflict) {
                if (!journal.quarantineConflictBatch(listOf(expected))) return ConflictIsolationResult(sent, EvidenceDrainStop.JOURNAL_FAILURE)
                continue
            } catch (_: Throwable) { return ConflictIsolationResult(sent, EvidenceDrainStop.TRANSPORT_FAILURE) }
            if (acked.size != 1 || acked.single() != expected) return ConflictIsolationResult(sent, EvidenceDrainStop.ACK_FAILURE)
            if (!journal.ackBatch(acked)) return ConflictIsolationResult(sent, EvidenceDrainStop.JOURNAL_FAILURE)
            sent += 1
        }
        return ConflictIsolationResult(sent, null)
    }

    fun drainDetailed(maxBatches: Int = 2): EvidenceDrainResult {
        val deviceId = pairedDeviceId() ?: return EvidenceDrainResult(0, EvidenceDrainStop.IDENTITY_UNAVAILABLE)
        val baseUrl = pairedApiBase() ?: return EvidenceDrainResult(0, EvidenceDrainStop.IDENTITY_UNAVAILABLE)
        if (journal.ensureDeviceOwner(deviceId) == null) return EvidenceDrainResult(0, EvidenceDrainStop.JOURNAL_FAILURE)
        if (coreBacklogPresent()) return EvidenceDrainResult(0, EvidenceDrainStop.CORE_BACKLOG)

        var sent = 0
        repeat(maxBatches.coerceIn(1, 8)) {
            if (coreBacklogPresent()) return EvidenceDrainResult(sent, EvidenceDrainStop.CORE_BACKLOG)
            val pending = try { journal.nextPending(EvidenceProtocol.MAX_RECORDS_PER_BATCH) } catch (_: Throwable) { return EvidenceDrainResult(sent, EvidenceDrainStop.JOURNAL_FAILURE) }
            if (pending.isEmpty()) return EvidenceDrainResult(sent, EvidenceDrainStop.EMPTY)
            val batch = try { EvidenceProtocol.encodeBatch(pending.map { it.record }) } catch (_: Throwable) { return EvidenceDrainResult(sent, EvidenceDrainStop.JOURNAL_FAILURE) }
            val expected = pending.map(::exactAck)
            val acked = try {
                transport.send(baseUrl, deviceId, batch)
            } catch (_: EvidenceUploadConflict) {
                if (pending.size == 1) {
                    if (!journal.quarantineConflictBatch(expected)) return EvidenceDrainResult(sent, EvidenceDrainStop.JOURNAL_FAILURE)
                } else {
                    val isolated = isolateConflictBatch(baseUrl, deviceId, pending)
                    sent += isolated.sentRecords
                    if (isolated.stop != null) return EvidenceDrainResult(sent, isolated.stop)
                }
                return@repeat
            } catch (_: Throwable) { return EvidenceDrainResult(sent, EvidenceDrainStop.TRANSPORT_FAILURE) }

            if (acked.size != expected.size || acked.toSet() != expected.toSet()) return EvidenceDrainResult(sent, EvidenceDrainStop.ACK_FAILURE)
            if (!journal.ackBatch(acked)) return EvidenceDrainResult(sent, EvidenceDrainStop.JOURNAL_FAILURE)
            sent += acked.size
        }
        return EvidenceDrainResult(sent, EvidenceDrainStop.BUDGET_EXHAUSTED)
    }

    fun drainIfSafe(maxBatches: Int = 2): Int = drainDetailed(maxBatches).sentRecords
    override fun close() { journal.close() }
}
