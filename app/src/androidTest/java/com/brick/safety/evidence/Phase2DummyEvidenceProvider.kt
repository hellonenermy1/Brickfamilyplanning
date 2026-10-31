package com.brick.safety.evidence

import android.os.SystemClock
import java.util.UUID

/** Test-only provider used to prove the Phase 2 provider -> journal -> transport -> ACK path. */
class Phase2DummyEvidenceProvider : EvidenceProvider {
    override val descriptor = EvidenceProviderDescriptor(
        provider = EvidenceProviderId.DUMMY_TEST,
        family = EvidenceFamily.DUMMY_TEST,
        samplingClass = EvidenceSamplingClass.EVENT_SENSOR,
        independenceNamespace = "dummy.test"
    )

    private var sink: EvidenceSink? = null
    private var enabled = true

    override fun status() = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.HEALTHY)

    override fun start(sink: EvidenceSink) {
        this.sink = sink
    }

    override fun applySampling(decision: EvidenceSamplingDecision) {
        enabled = decision.enabled
    }

    override fun stop() {
        sink = null
    }

    fun emitOnce(label: String = "phase2-dummy"): Boolean {
        if (!enabled) return false
        val nowElapsed = SystemClock.elapsedRealtime()
        return sink?.emit(
            EvidenceObservation(
                recordId = UUID.randomUUID().toString(),
                elapsedRealtimeMs = nowElapsed,
                wallTimeMs = System.currentTimeMillis(),
                provider = descriptor.provider,
                family = descriptor.family,
                independenceGroup = "dummy:test:scene",
                capability = ProviderCapability.SUPPORTED,
                health = ProviderHealth.HEALTHY,
                quality = EvidenceQuality.HIGH,
                payload = label.toByteArray(Charsets.UTF_8)
            )
        ) ?: false
    }
}
