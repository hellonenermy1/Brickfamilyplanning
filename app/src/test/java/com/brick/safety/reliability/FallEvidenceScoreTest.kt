package com.brick.safety.reliability

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FallEvidenceScoreTest {
    @Test fun higherCorroboratedImpactGetsMoreEvidenceButNotCalibratedProbability() {
        val mild = FallEvidenceScore.compute(2.8f, 0.4f, 1.1f, 35, "walking", 80)
        val corroborated = FallEvidenceScore.compute(4.5f, 2.5f, 0.15f, 40, "walking", 80)
        assertTrue(corroborated > mild)
        assertEquals(90, corroborated)
    }
    @Test fun missingPostImpactSamplesDoNotProveImmobility() {
        assertEquals(65, FallEvidenceScore.compute(4.1f, 2.3f, 0f, 0, "unknown", 0))
    }
    @Test fun vehicleContextIsConservativelyDownweighted() {
        assertTrue(FallEvidenceScore.compute(4.1f, 2.3f, 0.1f, 40, "vehicle", 95) <
            FallEvidenceScore.compute(4.1f, 2.3f, 0.1f, 40, "stationary", 95))
    }
    @Test fun invalidSignalsReturnNoEvidence() {
        assertEquals(0, FallEvidenceScore.compute(Float.NaN, 2.5f, 0.1f, 40, "unknown", 0))
    }
}
