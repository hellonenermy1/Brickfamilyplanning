package com.brick.safety.maintenance

import android.content.Context
import com.brick.safety.location.BrickServiceQuiescenceGate
import com.brick.safety.testing.BrickInstrumentationTestCase
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/**
 * P8C-008 original in-flight writer race: use the production PURGE_BRICK routine while an
 * uninterruptible tracking-service executor is in flight. Stores must not be cleared until
 * that executor has ACTUALLY finished, even after shutdownNow().
 */
class Phase8ServiceWriterDrainInstrumentedTest : BrickInstrumentationTestCase() {
    fun testPurgingCannotDeletePrivateStateUntilUninterruptibleServiceWriterExits() {
        val app = instrumentation.targetContext.applicationContext
        val prefs = app.getSharedPreferences("brick", Context.MODE_PRIVATE)
        assertTrue(prefs.edit().putString("p8cWriterProbe", "must_survive_until_drain").commit())
        assertTrue(DeprovisionManager.authoriseFreeze(app).ok)
        assertTrue(app.getSharedPreferences("brick_deprovision_v1", Context.MODE_PRIVATE).edit()
            .putBoolean("deprovisionEverStarted", true)
            .putString("stage", DeprovisionManager.Stage.UNDO_DEVICE_MANAGEMENT.name)
            .commit())
        assertEquals(DeprovisionManager.Stage.UNDO_DEVICE_MANAGEMENT, DeprovisionManager.stage(app))

        val entered = CountDownLatch(1)
        val release = AtomicBoolean(false)
        val executor = Executors.newSingleThreadExecutor()
        val result = AtomicReference<DeprovisionManager.Result?>(null)
        BrickServiceQuiescenceGate.serviceStarted()
        executor.execute {
            entered.countDown()
            while (!release.get()) {
                try { Thread.sleep(20L) } catch (_: InterruptedException) {
                    // Model an already-running IO/Binder callback that ignores shutdownNow.
                }
            }
        }
        assertTrue("fake service writer did not enter", entered.await(2, TimeUnit.SECONDS))
        executor.shutdownNow()
        BrickServiceQuiescenceGate.serviceShutdownRequested(listOf(executor))
        val purgeThread = Thread({ result.set(DeprovisionManager.purgeBrick(app)) }, "p8c-purge-race")
        try {
            assertFalse("writer barrier released on shutdownNow instead of actual termination",
                BrickServiceQuiescenceGate.awaitQuiescent(70L))
            purgeThread.start()
            Thread.sleep(250L)
            assertNull("PURGE completed despite active uninterruptible writer", result.get())
            assertEquals("real private data deleted before writer drained",
                "must_survive_until_drain", prefs.getString("p8cWriterProbe", null))

            release.set(true)
            purgeThread.join(20_000L)
            assertFalse("purge did not resume after all writers terminated", purgeThread.isAlive)
            assertNotNull(result.get())
            assertTrue("production purge did not complete after drain: ${result.get()}", result.get()!!.ok)
            assertEquals(DeprovisionManager.Stage.PURGE_BRICK, DeprovisionManager.stage(app))
            assertTrue("private preference should be purged AFTER safe termination", prefs.all.isEmpty())
        } finally {
            release.set(true)
            purgeThread.join(1_000L)
            executor.shutdownNow()
        }
    }
}
