package com.brick.safety.maintenance

import android.os.Handler
import android.os.HandlerThread
import com.brick.safety.diagnostics.DiagnosticMonitor
import com.brick.safety.reliability.FallDetectorRuntime
import com.brick.safety.testing.BrickInstrumentationTestCase
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/** P8C-008: auxiliary writer stop requests must not be mistaken for completed writes. */
class Phase8AuxiliaryWriterDrainInstrumentedTest : BrickInstrumentationTestCase() {
    fun testDiagnosticSamplerDrainWaitsForActiveSample() {
        DiagnosticMonitor.stop()
        val klass = DiagnosticMonitor.javaClass
        val lockField = klass.getDeclaredField("drainMonitor").apply { isAccessible = true }
        val countField = klass.getDeclaredField("activeSamples").apply { isAccessible = true }
        val monitor = lockField.get(DiagnosticMonitor) as Object
        synchronized(monitor) { countField.setInt(DiagnosticMonitor, 1) }
        try {
            assertFalse("diagnostics writer incorrectly reported drained",
                DiagnosticMonitor.awaitQuiescent(80L))
        } finally {
            synchronized(monitor) {
                countField.setInt(DiagnosticMonitor, 0)
                monitor.notifyAll()
            }
        }
        assertTrue("diagnostic worker drain didn't release after sample exited",
            DiagnosticMonitor.awaitQuiescent(500L))
    }

    fun testFallHandlerMustTerminateAfterQuitSafelyBeforePurge() {
        FallDetectorRuntime.stop()
        val retiring = HandlerThread("p8c-held-fall-callback")
        retiring.start()
        val entered = CountDownLatch(1)
        val release = AtomicBoolean(false)
        Handler(retiring.looper).post {
            entered.countDown()
            while (!release.get()) {
                try { Thread.sleep(20L) } catch (_: InterruptedException) {
                    // Deliberately emulate a fall evidence handler ignoring interruption.
                }
            }
        }
        assertTrue("fake fall callback did not start", entered.await(2, TimeUnit.SECONDS))
        val field = FallDetectorRuntime.javaClass.getDeclaredField("retiredThreads").apply { isAccessible = true }
        @Suppress("UNCHECKED_CAST")
        val oldThreads = field.get(FallDetectorRuntime) as ArrayDeque<HandlerThread>
        oldThreads.addLast(retiring)
        retiring.quitSafely()
        try {
            assertFalse("pending fall-sensor writer incorrectly reported drained",
                FallDetectorRuntime.awaitQuiescent(80L))
        } finally {
            release.set(true)
        }
        assertTrue("fall handler did not join after the pending writer completed",
            FallDetectorRuntime.awaitQuiescent(5_000L))
        assertFalse(retiring.isAlive)
    }
}
