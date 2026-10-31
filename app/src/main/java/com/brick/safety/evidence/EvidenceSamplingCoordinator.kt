package com.brick.safety.evidence

enum class BrickEvidenceState {
    SOS,
    DEGRADED_POSITION,
    MOVING,
    STATIONARY,
    DEEP_STATIONARY
}

data class EvidenceSamplingDecision(
    val enabled: Boolean,
    val intervalMs: Long?,
    val maxBurstMs: Long? = null
) {
    init {
        require(intervalMs == null || intervalMs > 0L)
        require(maxBurstMs == null || maxBurstMs > 0L)
    }
}

object EvidenceSamplingCoordinator {
    fun decision(samplingClass: EvidenceSamplingClass, state: BrickEvidenceState): EvidenceSamplingDecision {
        return when (samplingClass) {
            EvidenceSamplingClass.CONTINUOUS_SENSOR -> when (state) {
                BrickEvidenceState.SOS, BrickEvidenceState.DEGRADED_POSITION, BrickEvidenceState.MOVING -> EvidenceSamplingDecision(true, null)
                BrickEvidenceState.STATIONARY -> EvidenceSamplingDecision(true, 30_000L)
                BrickEvidenceState.DEEP_STATIONARY -> EvidenceSamplingDecision(true, 120_000L)
            }

            EvidenceSamplingClass.EVENT_SENSOR -> EvidenceSamplingDecision(true, null)

            EvidenceSamplingClass.RADIO_BURST -> when (state) {
                BrickEvidenceState.SOS -> EvidenceSamplingDecision(true, 5_000L, 4_000L)
                BrickEvidenceState.DEGRADED_POSITION -> EvidenceSamplingDecision(true, 15_000L, 4_000L)
                BrickEvidenceState.MOVING -> EvidenceSamplingDecision(true, 30_000L, 3_000L)
                BrickEvidenceState.STATIONARY -> EvidenceSamplingDecision(true, 120_000L, 3_000L)
                BrickEvidenceState.DEEP_STATIONARY -> EvidenceSamplingDecision(true, 600_000L, 3_000L)
            }

            EvidenceSamplingClass.NETWORK_CONTEXT -> when (state) {
                BrickEvidenceState.SOS -> EvidenceSamplingDecision(true, 5_000L)
                BrickEvidenceState.DEGRADED_POSITION -> EvidenceSamplingDecision(true, 15_000L)
                BrickEvidenceState.MOVING -> EvidenceSamplingDecision(true, 30_000L)
                BrickEvidenceState.STATIONARY -> EvidenceSamplingDecision(true, 120_000L)
                BrickEvidenceState.DEEP_STATIONARY -> EvidenceSamplingDecision(true, 300_000L)
            }

            EvidenceSamplingClass.EXTERNAL_OBSERVATION -> EvidenceSamplingDecision(true, null)
        }
    }
}
