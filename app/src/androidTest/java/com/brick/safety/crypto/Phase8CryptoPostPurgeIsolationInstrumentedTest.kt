package com.brick.safety.crypto

import android.content.Context
import com.brick.safety.maintenance.DeprovisionManager
import com.brick.safety.testing.BrickInstrumentationTestCase
import java.io.File
import java.security.KeyStore

/** P8C-008: an in-flight signed request must not regenerate the purged AndroidKeystore identity. */
class Phase8CryptoPostPurgeIsolationInstrumentedTest : BrickInstrumentationTestCase() {
    fun testLateSignatureCannotRecreatePurgedKeyOrBrickPrefs() {
        val app = instrumentation.targetContext.applicationContext
        val prefs = app.getSharedPreferences("brick", Context.MODE_PRIVATE)
        DeviceKeys.initialize(app)
        assertTrue("test requires a real initial private signing key",
            DeviceKeys.publicSpkiBase64().isNotBlank())
        assertTrue(prefs.edit().putString("deviceId", "test-paired-device").commit())
        val frozen = DeprovisionManager.authoriseFreeze(app)
        assertTrue(frozen.detail, frozen.ok)
        assertTrue(app.getSharedPreferences("brick_deprovision_v1", Context.MODE_PRIVATE).edit()
            .putBoolean("deprovisionEverStarted", true)
            .putString("stage", DeprovisionManager.Stage.PURGE_BRICK.name)
            .commit())
        assertEquals(DeprovisionManager.Stage.PURGE_BRICK, DeprovisionManager.stage(app))

        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val alias = "brick-device-signing-v1"
        assertTrue(ks.containsAlias(alias))
        ks.deleteEntry(alias)
        assertTrue(app.deleteSharedPreferences("brick"))
        val brickXml = File(app.applicationInfo.dataDir, "shared_prefs/brick.xml")
        assertFalse(brickXml.exists())

        repeat(10) {
            assertTrue("late post-purge signature must fail closed",
                runCatching { DeviceKeys.sign(byteArrayOf(it.toByte())) }.isFailure)
            assertTrue("public identity must not be recreated",
                runCatching { DeviceKeys.publicSpkiBase64() }.isFailure)
        }
        assertFalse("post-purge code regenerated signing key", ks.containsAlias(alias))
        assertFalse("post-purge crypto recreated Brick preference store", brickXml.exists())
        assertTrue(DeprovisionManager.isPostPurge(app))
    }
}
