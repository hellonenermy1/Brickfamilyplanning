package com.brick.safety.evidence

data class EvidenceProviderDescriptor(
    val provider: EvidenceProviderId,
    val family: EvidenceFamily,
    val samplingClass: EvidenceSamplingClass,
    val independenceNamespace: String
) {
    init {
        require(independenceNamespace.matches(Regex("[A-Za-z0-9._:-]{1,32}")))
    }
}

data class EvidenceProviderStatus(
    val capability: ProviderCapability,
    val health: ProviderHealth,
    val reason: String? = null
) {
    init { require(reason == null || reason.length <= 160) }
}

fun interface EvidenceSink {
    fun emit(observation: EvidenceObservation): Boolean
}

interface EvidenceProvider {
    val descriptor: EvidenceProviderDescriptor
    fun status(): EvidenceProviderStatus
    fun start(sink: EvidenceSink)
    fun applySampling(decision: EvidenceSamplingDecision)

    /**
     * Collect one bounded observation when the current sampling decision permits it. Phase 2
     * providers do not need to implement this; the default keeps the original contract compatible.
     */
    fun collectNow() = Unit

    fun stop()
}
