package com.brick.safety.beta

import org.junit.Assert.*
import org.junit.Test

class BetaReadinessModelTest {
    private fun good() = BetaReadinessModel.requiredChecks.map { BetaReadinessModel.Check(it, BetaReadinessModel.Status.PASS, "synthetic") }
    @Test fun completeKnownProofIsRequired() { assertTrue(BetaReadinessModel.ready(good())) }
    @Test fun eachMissingCoreProofBlocks() { good().forEach { missing -> assertFalse(missing.id, BetaReadinessModel.ready(good().filterNot { it.id == missing.id })) } }
    @Test fun pendingFailedUnsupportedCannotPassCore() {
        listOf(BetaReadinessModel.Status.PENDING, BetaReadinessModel.Status.FAIL, BetaReadinessModel.Status.UNSUPPORTED).forEach { status ->
            good().forEach { bad -> assertFalse(BetaReadinessModel.ready(good().map { if (it.id == bad.id) it.copy(status = status) else it })) }
        }
    }
    @Test fun duplicateCannotHideFailure() { assertFalse(BetaReadinessModel.ready(good() + good().first().copy(status = BetaReadinessModel.Status.FAIL))) }
    @Test fun coreCannotBeReclassifiedAsOptional() { assertFalse(BetaReadinessModel.ready(good().map { it.copy(required = false) })) }
    @Test fun optionalMissingHardwareDoesNotPretendCoreIsBroken() { assertTrue(BetaReadinessModel.ready(good() + BetaReadinessModel.Check("optional", BetaReadinessModel.Status.UNSUPPORTED, "not exposed", false))) }
    @Test fun addedRequiredFailureCannotBeIgnored() { assertFalse(BetaReadinessModel.ready(good() + BetaReadinessModel.Check("additional", BetaReadinessModel.Status.FAIL, "failure"))) }
}
