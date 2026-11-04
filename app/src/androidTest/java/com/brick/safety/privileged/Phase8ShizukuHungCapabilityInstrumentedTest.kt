package com.brick.safety.privileged

import android.os.Bundle
import android.os.SystemClock
import com.brick.safety.testing.BrickInstrumentationTestCase
import java.util.concurrent.atomic.AtomicBoolean

/** P8C-012: exercise the actual controller's never-returning capabilities() boundary. */
class Phase8ShizukuHungCapabilityInstrumentedTest : BrickInstrumentationTestCase() {
    fun testHungCapabilitiesProbeTimesOutAndNewGenerationRecovers() {
        val controller = ShizukuBridgeController
        val klass = controller.javaClass
        val releaseStuckBinder = AtomicBoolean(false)
        val initial = mutableMapOf<String, Any?>()

        fun field(name: String): java.lang.reflect.Field =
            klass.getDeclaredField(name).apply { isAccessible = true }
        fun write(name: String, value: Any?) = field(name).set(controller, value)
        fun read(name: String): Any? = field(name).get(controller)

        val mutableNames = listOf(
            "initialized", "foreground", "binding", "service",
            "serviceGeneration", "capabilities", "lastError", "deprovisionShutdown"
        )
        mutableNames.forEach { name -> initial[name] = read(name) }

        fun fake(stuck: Boolean) = object : IBrickPrivilegedService.Stub() {
            override fun capabilities(): Bundle {
                if (stuck) {
                    while (!releaseStuckBinder.get()) {
                        try { Thread.sleep(20L) } catch (_: InterruptedException) {
                            // Deliberately reproduce a Binder call ignoring cancellation.
                        }
                    }
                    return Bundle()
                }
                return Bundle().apply { putBoolean("wifiEvidence", true) }
            }
            override fun setLocationEnabled(enabled: Boolean) = false
            override fun wifiEvidence() = Bundle()
            override fun bleEvidence() = Bundle()
            override fun cellEvidence() = Bundle()
            override fun powerDiagnostics() = Bundle()
            override fun requestPowerRepair() = false
            override fun attemptSosLocationEnable() = false
            override fun destroy() = Unit
        }

        val probe = klass.getDeclaredMethod("refreshCapabilities").apply { isAccessible = true }
        try {
            write("initialized", true)
            write("foreground", false)
            write("binding", false)
            write("deprovisionShutdown", false)
            write("serviceGeneration", 100_000L)
            write("service", fake(stuck = true))
            write("capabilities", emptySet<PrivilegedCapability>())
            probe.invoke(controller)

            val timeoutDeadline = SystemClock.elapsedRealtime() + 7_500L
            while (SystemClock.elapsedRealtime() < timeoutDeadline &&
                read("service") != null) Thread.sleep(50L)
            assertNull("hung capability probe did not invalidate the old generation", read("service"))
            assertEquals("Shizuku capability probe timed out", controller.health().lastError)
            assertTrue(controller.health().capabilities.isEmpty())

            write("service", fake(stuck = false))
            write("serviceGeneration", (read("serviceGeneration") as Long) + 1L)
            probe.invoke(controller)
            val recoveryDeadline = SystemClock.elapsedRealtime() + 2_500L
            while (SystemClock.elapsedRealtime() < recoveryDeadline &&
                !controller.health().capabilities.contains(PrivilegedCapability.WIFI_EVIDENCE)) {
                Thread.sleep(50L)
            }
            assertTrue(
                "new Shizuku generation queued behind uninterruptible old binder",
                controller.health().capabilities.contains(PrivilegedCapability.WIFI_EVIDENCE)
            )
        } finally {
            releaseStuckBinder.set(true)
            // Do not leave artificial provider bindings in the next instrumented class.
            controller.shutdown()
            mutableNames.forEach { name -> write(name, initial[name]) }
        }
    }
}
