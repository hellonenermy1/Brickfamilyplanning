package com.brick.safety.privileged

import android.os.Bundle
import com.brick.safety.testing.BrickInstrumentationTestCase
import java.security.KeyStore
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/** P8C-008: a pre-purge Binder response must not recreate Atlas privacy material after purge. */
class Phase8ShizukuStaleReplyAfterPurgeInstrumentedTest : BrickInstrumentationTestCase() {
    fun testInFlightStaleWifiReplyCannotReachPrivacyKeyReductionAfterPurgeFence() {
        val app = instrumentation.targetContext.applicationContext
        val controller = ShizukuBridgeController
        val klass = controller.javaClass
        val names = listOf("initialized", "foreground", "service", "serviceGeneration",
            "deprovisionShutdown", "capabilities", "lastError")
        fun field(name: String) = klass.getDeclaredField(name).apply { isAccessible = true }
        fun read(name: String): Any? = field(name).get(controller)
        fun write(name: String, value: Any?) = field(name).set(controller, value)
        val previous = names.associateWith(::read)
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val alias = "brick_atlas_hmac_v1"
        val entered = CountDownLatch(1)
        val release = AtomicBoolean(false)
        val outcome = AtomicReference<Result<List<PrivilegedWifiEvidence>>?>(null)

        val held = object : IBrickPrivilegedService.Stub() {
            override fun capabilities() = Bundle()
            override fun setLocationEnabled(enabled: Boolean) = false
            override fun wifiEvidence(): Bundle {
                entered.countDown()
                while (!release.get()) {
                    try { Thread.sleep(20L) } catch (_: InterruptedException) {
                        // Model a remote Binder call that ignores interrupt/cancel.
                    }
                }
                val row = Bundle().apply { putString("ssid", "stale-after-purge") }
                return Bundle().apply {
                    putBoolean("supported", true)
                    putParcelableArrayList("rows", arrayListOf(row))
                }
            }
            override fun bleEvidence() = Bundle()
            override fun cellEvidence() = Bundle()
            override fun powerDiagnostics() = Bundle()
            override fun requestPowerRepair() = false
            override fun attemptSosLocationEnable() = false
            override fun destroy() = Unit
        }
        val thread = Thread({ outcome.set(controller.wifi()) }, "p8c-held-privileged-reply")
        try {
            if (ks.containsAlias(alias)) ks.deleteEntry(alias)
            write("initialized", false)
            write("foreground", false)
            write("deprovisionShutdown", false)
            write("serviceGeneration", 811L)
            write("service", held)
            write("capabilities", emptySet<PrivilegedCapability>())
            thread.start()
            assertTrue("held privileged call never began", entered.await(2, TimeUnit.SECONDS))

            // The permanent purge fence is active before the old Binder is allowed to return.
            controller.shutdownForDeprovision()
            release.set(true)
            thread.join(3_000L)
            assertFalse("stale Binder request did not settle", thread.isAlive)
            val returned = outcome.get()
            assertNotNull("no privileged result captured", returned)
            assertTrue("stale successful result crossed the shutdown boundary", returned!!.isFailure)
            assertFalse("stale reply recreated Atlas HMAC identity", ks.containsAlias(alias))
            assertFalse("deprovision fence leaked live privileged health", controller.health().connected)
        } finally {
            release.set(true)
            thread.join(3_000L)
            names.forEach { write(it, previous[it]) }
            if (ks.containsAlias(alias)) ks.deleteEntry(alias)
        }
    }
}
