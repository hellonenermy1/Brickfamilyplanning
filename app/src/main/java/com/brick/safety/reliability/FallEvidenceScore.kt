package com.brick.safety.reliability

/**
 * Uncalibrated, bounded evidence summary. A score here is NOT a probability that a human fell.
 * The alert threshold is deliberately unchanged until OPPO controlled-test sensitivity and
 * false-positive rates are measured. No camera, microphone or raw motion streams are stored.
 */
internal object FallEvidenceScore {
    fun compute(
        impactG: Float,
        peakRotationRadS: Float,
        postImpactMotion: Float,
        postImpactSamples: Int,
        activityMode: String,
        activityConfidence: Int
    ): Int {
        if (!impactG.isFinite() || !peakRotationRadS.isFinite() || !postImpactMotion.isFinite()) return 0
        val impact = when {
            impactG >= 5f -> 55
            impactG >= 4f -> 45
            impactG >= 3.2f -> 30
            impactG >= 2.7f -> 15
            else -> 0
        }
        val rotation = when {
            peakRotationRadS >= 4f -> 25
            peakRotationRadS >= 2.2f -> 20
            else -> 0
        }
        val movement = if (postImpactSamples >= 8) when {
            postImpactMotion < 0.28f -> 25
            postImpactMotion < 0.8f -> 10
            else -> 0
        } else 0
        val movingVehiclePenalty =
            if (activityMode == "vehicle" && activityConfidence >= 80) 35 else 0
        return (impact + rotation + movement - movingVehiclePenalty).coerceIn(0, 100)
    }
}
