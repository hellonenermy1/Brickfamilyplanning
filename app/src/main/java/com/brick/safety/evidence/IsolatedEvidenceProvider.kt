package com.brick.safety.evidence

import android.os.SystemClock
import kotlin.math.min

/**
 * Phase 8 fault boundary around one optional evidence provider.
 *
 * A provider exception must never escape into Brick Core. The failed provider is quarantined with
 * bounded exponential backoff and can recover independently on a later pulse. This wrapper does
 * not pretend to solve a Binder/API call that never returns; true hard-hang containment is a
 * separate Phase 8 requirement because blindly moving Android callbacks across threads is unsafe.
 */
class IsolatedEvidenceProvider(
    private val delegate: EvidenceProvider,
    private val nowElapsedMs: () -> Long = { SystemClock.elapsedRealtime() },
    private val baseBackoffMs: Long = 5_000L,
    private val maxBackoffMs: Long = 5L * 60L * 1_000L
) : EvidenceProvider {
    init {
        require(baseBackoffMs > 0L)
        require(maxBackoffMs >= baseBackoffMs)
    }

    override val descriptor: EvidenceProviderDescriptor = delegate.descriptor

    @Volatile private var sink: EvidenceSink? = null
    @Volatile private var latestDecision = EvidenceSamplingDecision(false, null)
    @Volatile private var decisionDirty = true
    @Volatile private var delegateStarted = false
    @Volatile private var consecutiveFailures = 0
    @Volatile private var retryAtElapsedMs = 0L
    @Volatile private var failedOperation: String? = null
    @Volatile private var failedType: String? = null

    override fun status(): EvidenceProviderStatus {
        val now = nowElapsedMs()
        if (now < retryAtElapsedMs) return isolatedStatus("backoff")

        val current = try {
            delegate.status()
        } catch (t: Throwable) {
            recordFailure("status", t)
            return isolatedStatus("exception")
        }

        recoverIfSameOperation("status")
        return if (consecutiveFailures > 0 && current.health != ProviderHealth.FAILED) {
            EvidenceProviderStatus(
                capability = current.capability,
                health = ProviderHealth.DEGRADED,
                reason = "isolated_retry_ready_${failedOperation ?: "provider"}"
            )
        } else current
    }

    override fun start(sink: EvidenceSink) {
        this.sink = sink
        if (inBackoff()) return
        ensureStarted()
    }

    override fun applySampling(decision: EvidenceSamplingDecision) {
        latestDecision = decision
        decisionDirty = true
        if (inBackoff() || !delegateStarted) return
        applyDecisionIfNeeded()
    }

    override fun collectNow() {
        if (inBackoff()) return
        if (!delegateStarted && !ensureStarted()) return
        if (inBackoff()) return
        if (!applyDecisionIfNeeded()) return

        try {
            delegate.collectNow()
            recoverIfSameOperation("collect")
        } catch (t: Throwable) {
            recordFailure("collect", t)
        }
    }

    override fun stop() {
        delegateStarted = false
        decisionDirty = true
        sink = null
        runCatching { delegate.stop() }
    }

    @Synchronized
    private fun ensureStarted(): Boolean {
        if (delegateStarted) return true
        if (inBackoff()) return false
        val currentSink = sink ?: return false
        return try {
            delegate.start(currentSink)
            delegateStarted = true
            decisionDirty = true
            recoverIfSameOperation("start")
            true
        } catch (t: Throwable) {
            delegateStarted = false
            recordFailure("start", t)
            false
        }
    }

    private fun applyDecisionIfNeeded(): Boolean {
        if (!decisionDirty) return true
        return try {
            delegate.applySampling(latestDecision)
            decisionDirty = false
            recoverIfSameOperation("apply")
            true
        } catch (t: Throwable) {
            decisionDirty = true
            recordFailure("apply", t)
            false
        }
    }

    private fun inBackoff(): Boolean = nowElapsedMs() < retryAtElapsedMs

    @Synchronized
    private fun recordFailure(operation: String, error: Throwable) {
        consecutiveFailures = (consecutiveFailures + 1).coerceAtMost(30)
        failedOperation = operation
        failedType = error.javaClass.simpleName.take(48).ifBlank { "Throwable" }
        val shift = (consecutiveFailures - 1).coerceIn(0, 16)
        val multiplier = 1L shl shift
        val raw = if (baseBackoffMs > Long.MAX_VALUE / multiplier) Long.MAX_VALUE else baseBackoffMs * multiplier
        val delay = min(raw, maxBackoffMs)
        retryAtElapsedMs = safeAdd(nowElapsedMs(), delay)
    }

    @Synchronized
    private fun recoverIfSameOperation(operation: String) {
        if (failedOperation != operation) return
        consecutiveFailures = 0
        retryAtElapsedMs = 0L
        failedOperation = null
        failedType = null
    }

    private fun isolatedStatus(state: String): EvidenceProviderStatus {
        val op = failedOperation ?: "provider"
        val type = failedType ?: "failure"
        return EvidenceProviderStatus(
            ProviderCapability.TEMPORARILY_UNAVAILABLE,
            ProviderHealth.FAILED,
            "isolated_${state}_${op}_${type}".take(160)
        )
    }

    private fun safeAdd(left: Long, right: Long): Long =
        if (right > 0L && left > Long.MAX_VALUE - right) Long.MAX_VALUE else left + right
}
