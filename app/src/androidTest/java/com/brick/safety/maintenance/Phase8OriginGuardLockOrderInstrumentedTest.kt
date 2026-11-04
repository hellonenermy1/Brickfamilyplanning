package com.brick.safety.maintenance

import android.content.Context
import com.brick.safety.crypto.DeviceKeys
import com.brick.safety.testing.BrickInstrumentationTestCase
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * P8C-008 lock-order reproducer: older V1 stage pref has no independent guard.
 * Signer holds DeviceKeys while purge can own DeprovisionManager and be waiting for DeviceKeys.
 * Reading/migrating the stage while holding the signer must not reacquire the Deprov singleton.
 */
class Phase8OriginGuardLockOrderInstrumentedTest : BrickInstrumentationTestCase() {
    fun testLegacyMigrationCannotDeadlockSignerAndDeprovisionMonitors() {
        val app = instrumentation.targetContext.applicationContext
        val prefs = app.getSharedPreferences("brick_deprovision_v1", Context.MODE_PRIVATE)
        assertTrue(prefs.edit()
            .putBoolean("deprovisionEverStarted", true)
            .putString("stage", DeprovisionManager.Stage.UNDO_DEVICE_MANAGEMENT.name)
            .commit())
        val guard = DeprovisionManager.originGuardFile(app)
        listOf(guard, File(guard.path + ".new"), File(guard.path + ".bak")).forEach { it.delete() }
        assertFalse("test requires legacy marker absence", guard.exists())

        val signerHeld = CountDownLatch(1)
        val deprovisionHeld = CountDownLatch(1)
        val beginRead = CountDownLatch(1)
        val readStage = AtomicReference<DeprovisionManager.Stage?>(null)
        val signThread = Thread({
            synchronized(DeviceKeys) {
                signerHeld.countDown()
                beginRead.await(3L, TimeUnit.SECONDS)
                readStage.set(DeprovisionManager.stage(app))
            }
        }, "p8c-legacy-stage-signing-lock").apply { isDaemon = true }
        val purgeLockThread = Thread({
            signerHeld.await(3L, TimeUnit.SECONDS)
            synchronized(DeprovisionManager) {
                deprovisionHeld.countDown()
                synchronized(DeviceKeys) { /* purge's existing nested lock order */ }
            }
        }, "p8c-legacy-purge-lock").apply { isDaemon = true }
        try {
            signThread.start()
            purgeLockThread.start()
            assertTrue("test did not acquire signing lock", signerHeld.await(2L, TimeUnit.SECONDS))
            assertTrue("test did not acquire deprovision lock", deprovisionHeld.await(2L, TimeUnit.SECONDS))
            beginRead.countDown()

            signThread.join(5_000L)
            purgeLockThread.join(5_000L)
            assertFalse("ABBA deadlock: stage migration tried to take DeprovisionManager lock under DeviceKeys",
                signThread.isAlive)
            assertFalse("purge lock still blocked after migration", purgeLockThread.isAlive)
            assertEquals(DeprovisionManager.Stage.UNDO_DEVICE_MANAGEMENT, readStage.get())
            assertTrue("legacy marker was not migrated atomically", guard.exists())
        } finally {
            beginRead.countDown()
            if (!signThread.isAlive && !purgeLockThread.isAlive) {
                app.deleteSharedPreferences("brick_deprovision_v1")
                guard.delete()
            }
        }
    }
}
