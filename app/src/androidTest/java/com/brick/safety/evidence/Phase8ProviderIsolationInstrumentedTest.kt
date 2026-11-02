package com.brick.safety.evidence

import com.brick.safety.testing.BrickInstrumentationTestCase

class Phase8ProviderIsolationInstrumentedTest : BrickInstrumentationTestCase() {
    private class FakeProvider : EvidenceProvider {
        override val descriptor = EvidenceProviderDescriptor(
            EvidenceProviderId.DUMMY_TEST,
            EvidenceFamily.DUMMY_TEST,
            EvidenceSamplingClass.NETWORK_CONTEXT,
            "p8.test"
        )
        var startCalls = 0
        var applyCalls = 0
        var collectCalls = 0
        var statusCalls = 0
        var failStart = 0
        var failApply = 0
        var failCollect = 0
        var failStatus = 0

        override fun status(): EvidenceProviderStatus {
            statusCalls++
            if (failStatus-- > 0) throw IllegalStateException("synthetic status failure")
            return EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.HEALTHY)
        }

        override fun start(sink: EvidenceSink) {
            startCalls++
            if (failStart-- > 0) throw IllegalStateException("synthetic start failure")
        }

        override fun applySampling(decision: EvidenceSamplingDecision) {
            applyCalls++
            if (failApply-- > 0) throw IllegalStateException("synthetic apply failure")
        }

        override fun collectNow() {
            collectCalls++
            if (failCollect-- > 0) throw IllegalStateException("synthetic collect failure")
        }

        override fun stop() = Unit
    }

    private val sink = EvidenceSink { true }
    private val enabledDecision = EvidenceSamplingDecision(true, 5_000L, 1_000L)

    fun testCollectCrashIsContainedBackedOffAndRecoveredIndependently() {
        var now = 10_000L
        val broken = FakeProvider().apply { failCollect = 1 }
        val healthy = FakeProvider()
        val isolated = IsolatedEvidenceProvider(broken, { now }, baseBackoffMs = 5_000L, maxBackoffMs = 20_000L)
        val healthyIsolated = IsolatedEvidenceProvider(healthy, { now }, baseBackoffMs = 5_000L, maxBackoffMs = 20_000L)

        isolated.start(sink)
        healthyIsolated.start(sink)
        isolated.applySampling(enabledDecision)
        healthyIsolated.applySampling(enabledDecision)

        // Synthetic exception is swallowed at this provider boundary, not propagated to Brick Core.
        isolated.collectNow()
        healthyIsolated.collectNow()
        assertEquals(1, broken.collectCalls)
        assertEquals(1, healthy.collectCalls)
        val failed = isolated.status()
        assertEquals(ProviderHealth.FAILED, failed.health)
        assertTrue(failed.reason?.startsWith("isolated_backoff_collect_") == true)

        // Repeated supervisor pulses during cooldown do not hammer the broken provider.
        isolated.collectNow()
        isolated.collectNow()
        healthyIsolated.collectNow()
        assertEquals(1, broken.collectCalls)
        assertEquals(2, healthy.collectCalls)

        now += 5_000L
        isolated.collectNow()
        assertEquals(2, broken.collectCalls)
        assertEquals(ProviderHealth.HEALTHY, isolated.status().health)
    }

    fun testStartCrashRetriesAfterCooldownWithLatestSamplingDecision() {
        var now = 50_000L
        val fake = FakeProvider().apply { failStart = 1 }
        val isolated = IsolatedEvidenceProvider(fake, { now }, baseBackoffMs = 2_000L, maxBackoffMs = 20_000L)

        isolated.start(sink)
        assertEquals(1, fake.startCalls)
        isolated.applySampling(enabledDecision)
        isolated.collectNow()
        assertEquals(1, fake.startCalls)
        assertEquals(0, fake.collectCalls)

        now += 2_000L
        isolated.collectNow()
        assertEquals(2, fake.startCalls)
        assertTrue(fake.applyCalls >= 1)
        assertEquals(1, fake.collectCalls)
        assertEquals(ProviderHealth.HEALTHY, isolated.status().health)
    }

    fun testStatusCrashCannotBreakHealthPublishing() {
        var now = 100_000L
        val fake = FakeProvider().apply { failStatus = 1 }
        val isolated = IsolatedEvidenceProvider(fake, { now }, baseBackoffMs = 1_000L, maxBackoffMs = 4_000L)
        isolated.start(sink)

        val failed = isolated.status()
        assertEquals(ProviderHealth.FAILED, failed.health)
        assertEquals(1, fake.statusCalls)
        // Still in cooldown: status itself is not re-invoked into a crash loop.
        assertEquals(ProviderHealth.FAILED, isolated.status().health)
        assertEquals(1, fake.statusCalls)

        now += 1_000L
        assertEquals(ProviderHealth.HEALTHY, isolated.status().health)
        assertEquals(2, fake.statusCalls)
    }

    fun testApplyCrashIsContainedAndBackedOff() {
        var now = 200_000L
        val fake = FakeProvider().apply { failApply = 1 }
        val isolated = IsolatedEvidenceProvider(fake, { now }, baseBackoffMs = 3_000L, maxBackoffMs = 12_000L)
        isolated.start(sink)
        isolated.applySampling(enabledDecision)
        assertEquals(1, fake.applyCalls)
        isolated.collectNow()
        assertEquals(0, fake.collectCalls)

        now += 3_000L
        isolated.applySampling(enabledDecision)
        isolated.collectNow()
        assertTrue(fake.applyCalls >= 2)
        assertEquals(1, fake.collectCalls)
    }
}
