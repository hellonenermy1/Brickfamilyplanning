package com.brick.safety.evidence

import android.content.Context
import com.brick.safety.data.CrashOutbox
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

enum class EvidenceDrainStop {
    EMPTY,
    BUDGET_EXHAUSTED,
    CORE_BACKLOG,
    TRANSPORT_FAILURE,
    ACK_FAILURE,
    JOURNAL_FAILURE,
    IDENTITY_UNAVAILABLE
}

data class EvidenceDrainResult(val sentRecords: Int, val stop: EvidenceDrainStop)

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
        // Server pairing uses crypto.randomUUID(): canonical lowercase RFC-4122 v4 (variant 2).
        return value.takeIf { parsed.toString() == value && parsed.version() == 4 && parsed.variant() == 2 }
    }

    private fun pairedApiBase(): String? {
        val value = prefs.getString("apiBase", null)?.takeIf { it.isNotBlank() } ?: return null
        return runCatching { EvidenceApi.normalizeBase(value) }.getOrNull()
    }

    @Synchronized
    fun enqueue(observation: EvidenceObservation): Boolean {
        // Refuse to persist new family-location evidence when pairing is incomplete or stored
        // identity/origin state is corrupt. Otherwise Brick could create an unsendable durable
        // evidence backlog even though the transport would later reject the same API origin.
        val deviceId = pairedDeviceId() ?: return false
        if (pairedApiBase() == null) return false

        val epoch = prefs.getInt("epoch", 1).coerceAtLeast(0)
        val record = journal.appendNew(deviceId, epoch, observation) ?: return false
        // Preference is only a cheap observable cache. The SQLite journal owns allocation and can
        // recover the correct next sequence even if this async preference write never happens.
        prefs.edit().putLong("evidenceSequence", record.sequence).apply()
        if (scheduleRecovery) runCatching { RecoveryScheduler.scheduleEvidenceSoon(appContext, 5) }
        return true
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
     * Evidence is intentionally the lowest-priority durable stream. This detailed result lets the
     * worker distinguish healthy backlog catch-up from persistent transport/ACK/config failures, so
     * failures can back off without slowing normal catch-up or competing with Brick Core.
     */
    fun drainDetailed(maxBatches: Int = 2): EvidenceDrainResult {
        val deviceId = pairedDeviceId() ?: return EvidenceDrainResult(0, EvidenceDrainStop.IDENTITY_UNAVAILABLE)
        val baseUrl = pairedApiBase() ?: return EvidenceDrainResult(0, EvidenceDrainStop.IDENTITY_UNAVAILABLE)

        // Bind the encrypted journal to the same paired child identity used by this upload. If the
        // pairing changed, old unsent evidence is preserved as quarantine history rather than being
        // uploaded under the new device ID. A DB failure is distinct from an identity/config error.
        if (journal.ensureDeviceOwner(deviceId) == null) {
            return EvidenceDrainResult(0, EvidenceDrainStop.JOURNAL_FAILURE)
        }
        if (coreBacklogPresent()) return EvidenceDrainResult(0, EvidenceDrainStop.CORE_BACKLOG)

        var sent = 0
        repeat(maxBatches.coerceIn(1, 8)) {
            // Recheck before every batch so safety/location work can preempt evidence between batches.
            if (coreBacklogPresent()) return EvidenceDrainResult(sent, EvidenceDrainStop.CORE_BACKLOG)
            val pending = try {
                journal.nextPending(EvidenceProtocol.MAX_RECORDS_PER_BATCH)
            } catch (_: Throwable) {
                return EvidenceDrainResult(sent, EvidenceDrainStop.JOURNAL_FAILURE)
            }
            if (pending.isEmpty()) return EvidenceDrainResult(sent, EvidenceDrainStop.EMPTY)
            val batch = try {
                EvidenceProtocol.encodeBatch(pending.map { it.record })
            } catch (_: Throwable) {
                return EvidenceDrainResult(sent, EvidenceDrainStop.JOURNAL_FAILURE)
            }
            val acked = try {
                transport.send(baseUrl, deviceId, batch)
            } catch (_: Throwable) {
                return EvidenceDrainResult(sent, EvidenceDrainStop.TRANSPORT_FAILURE)
            }

            // Do not rely solely on the production HTTP transport's validation. The dispatcher is
            // the final deletion boundary and independently requires the exact ACK identity set.
            val expected = pending.map { EvidenceAck(it.record.epoch, it.record.sequence, it.record.observation.recordId) }
            if (acked.size != expected.size || acked.toSet() != expected.toSet()) {
                return EvidenceDrainResult(sent, EvidenceDrainStop.ACK_FAILURE)
            }
            if (!journal.ackBatch(acked)) return EvidenceDrainResult(sent, EvidenceDrainStop.JOURNAL_FAILURE)
            sent += acked.size
        }
        return EvidenceDrainResult(sent, EvidenceDrainStop.BUDGET_EXHAUSTED)
    }

    /** Compatibility helper for existing callers/tests that only need the sent-record count. */
    fun drainIfSafe(maxBatches: Int = 2): Int = drainDetailed(maxBatches).sentRecords

    override fun close() {
        journal.close()
    }
}
