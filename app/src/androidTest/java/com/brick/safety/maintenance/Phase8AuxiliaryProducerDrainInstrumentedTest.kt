package com.brick.safety.maintenance

import android.os.Handler
import android.os.HandlerThread
import com.brick.safety.diagnostics.DiagnosticMonitor
import com.brick.safety.reliability.FallDetectorRuntime
import com.brick.safety.testing.BrickInstrumentationTestCase
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * P8C-008: cancellation is not completion. Both non-service async writers must be fully drained
 * before the real purge is permitted to delete their preference / safety-outbox namespaces.
 *
 * Uses held in-flight work, not an invented process kill or a mock production implementation.
 */
class Phase8AuxiliaryProducerDrainInstrumentedTest : BrickInstrumentationTestCase() {
    fun testDiagnosticSamplerStopWaitsUntilInFlightSampleIsDone() {
        val app = instrumentation.targetContext.applicationContext
        // Reflect the monitor's private last-state mutex to hold one real scheduled sampling pass.
        val type = DiagnosticMonitor.javaClass
        val lastField = type.getDeclaredField("last").apply { isAccessible = true }
        val last = lastField.get(DiagnosticMonitor)
        val activeField = type.getDeclaredField("activeSamples").apply { isAccessible = true }
        DiagnosticMonitor.stop()
        assertEquals(0, activeField.getInt(DiagnosticMonitor))
        val ready = CountDownLatch(1)
        val release = AtomicBoolean(false)
        val holder = Thread({
            synchronized(last) {
                ready.countDown()
                while (!release.get()) {
                    try { Thread.sleep(20L) } catch (_: InterruptedException) { }
                }
            }
        }, "p8c-held-diagnostic-map")
        try {
            holder.start()
            assertTrue(ready.await(2, TimeUnit.SECONDS))
            DiagnosticMonitor.start(app)
            val until = android.os.SystemClock.elapsedRealtime() + 7_000L
            while (activeField.getInt(DiagnosticMonitor) == 0 &&
                android.os.SystemClock.elapsedRealtime() < until) Thread.sleep(25L)
            assertTrue("real diagnostics sample did not enter the held in-flight state",
                activeField.getInt(DiagnosticMonitor) > 0)
            // stop() also clears a map guarded by last, so it can legitimately block until a
            // sample exits that lock. Invoke it separately to avoid blocking the test controller.
            val stopped = CountDownLatch(1)
            val stopper = Thread({
                try { DiagnosticMonitor.stop() } finally { stopped.countDown() }
            }, "p8c-stop-diagnostics")
            stopper.start()
            Thread.sleep(80L)
            assertFalse("a still-running sample must not be reported as drained",
                DiagnosticMonitor.awaitQuiescent(80L))
            release.set(true)
            holder.join(2_000L)
            assertTrue("diagnostic stop must finish once current work exits",
                stopped.await(4, TimeUnit.SECONDS))
            assertTrue("actual sampling should finish after contention is removed",
                DiagnosticMonitor.awaitQuiescent(8_000L))
        } finally {
            release.set(true)
            holder.join(2_000L)
            DiagnosticMonitor.stop()
        }
    }

    fun testRetiredFallHandlerMustActuallyExitBeforeQuiescent() {
        val runtime = FallDetectorRuntime
        runtime.stop()
        val type = runtime.javaClass
        val started = type.getDeclaredField("started").apply { isAccessible = true }
        val threadField = type.getDeclaredField("thread").apply { isAccessible = true }
        val handlerField = type.getDeclaredField("handler").apply { isAccessible = true }
        val entered = CountDownLatch(1)
        val release = AtomicBoolean(false)
        val held = HandlerThread("p8c-held-fall-handler").also { it.start() }
        val h = Handler(held.looper)
        h.post {
            entered.countDown()
            while (!release.get()) {
                try { Thread.sleep(20L) } catch (_: InterruptedException) { }
            }
        }
        try {
            assertTrue("held handler did not start", entered.await(2, TimeUnit.SECONDS))
            started.setBoolean(runtime, true)
            threadField.set(runtime, held)
            handlerField.set(runtime, h)
            // Production stop() must retain the thread and issue quitSafely; it must not claim the
            // handler has exited just because its queue is closed.
            runtime.stop()
            assertFalse("quitSafely() counted as terminated while callback is still executing",
                runtime.awaitQuiescent(80L))
            release.set(true)
            assertTrue("released handler must eventually join", runtime.awaitQuiescent(5_000L))
        } finally {
            release.set(true)
            held.quitSafely()
            held.join(2_000L)
            runtime.stop()
        }
    }
}
