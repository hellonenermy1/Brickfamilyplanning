package com.brick.safety.crypto

import android.content.Context
import com.brick.safety.maintenance.DeprovisionManager
import com.brick.safety.testing.BrickInstrumentationTestCase
import java.security.KeyStore
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/**
 * P8C-008: purge must not delete prefs while an older signing operation owns the signer monitor.
 * The production purge is run for real; we hold the actual DeviceKeys object lock to simulate a
 * slow signature/migration already admitted before the removal handoff.
 */
class Phase8CryptoPurgeWriterRaceInstrumentedTest : BrickInstrumentationTestCase() {
    fun testActualPurgeWaitsForOldSignerBeforeDeletingAnyBrickPrefsAndKey() {
        val app = instrumentation.targetContext.applicationContext
        val prefs = app.getSharedPreferences("brick", Context.MODE_PRIVATE)
        DeviceKeys.initialize(app)
        assertTrue(DeviceKeys.publicSpkiBase64().isNotBlank())
        assertTrue(prefs.edit()
            .putString("deviceId", "p8c-crypto-race-device")
            .putString("p8cCryptoWriterProbe", "must_exist_while_signer_is_active")
            .commit())
        assertTrue(DeviceKeys.sign(byteArrayOf(1, 2, 3)).isNotBlank())
        assertTrue(DeprovisionManager.authoriseFreeze(app).ok)
        assertTrue(app.getSharedPreferences("brick_deprovision_v1", Context.MODE_PRIVATE).edit()
            .putBoolean("deprovisionEverStarted", true)
            .putString("stage", DeprovisionManager.Stage.UNDO_DEVICE_MANAGEMENT.name)
            .commit())
        assertEquals(DeprovisionManager.Stage.UNDO_DEVICE_MANAGEMENT, DeprovisionManager.stage(app))

        val entered = CountDownLatch(1)
        val release = AtomicBoolean(false)
        val signer = Thread({
            synchronized(DeviceKeys) {
                entered.countDown()
                while (!release.get()) {
                    try { Thread.sleep(20L) } catch (_: InterruptedException) {
                        // An already running signing operation need not respond to cancellation.
                    }
                }
            }
        }, "p8c-held-signer")
        val result = AtomicReference<DeprovisionManager.Result?>(null)
        val purger = Thread({ result.set(DeprovisionManager.purgeBrick(app)) }, "p8c-purge-with-signer")
        try {
            signer.start()
            assertTrue("signer monitor was not captured", entered.await(2L, TimeUnit.SECONDS))
            purger.start()
            Thread.sleep(700L)
            assertNull("purge reported success before signer released", result.get())
            assertEquals("preexisting signer allowed sensitive prefs to be deleted early",
                "must_exist_while_signer_is_active", prefs.getString("p8cCryptoWriterProbe", null))
            release.set(true)
            signer.join(3_000L)
            purger.join(20_000L)
            assertFalse("production purge hung after the signing operation completed", purger.isAlive)
            assertNotNull(result.get())
            assertTrue("real purge did not complete safely after signer release: ${result.get()}",
                result.get()!!.ok)
            assertEquals(DeprovisionManager.Stage.PURGE_BRICK, DeprovisionManager.stage(app))
            assertFalse(prefs.contains("deviceId"))
            assertFalse(prefs.contains("p8cCryptoWriterProbe"))
            assertFalse(KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
                .containsAlias("brick-device-signing-v1"))
            assertTrue("new post-purge signing request failed open",
                runCatching { DeviceKeys.sign(byteArrayOf(4)) }.isFailure)
        } finally {
            release.set(true)
            signer.join(3_000L)
            purger.join(1_000L)
        }
    }
}
