package com.brick.safety.crypto

import android.content.Context
import com.brick.safety.testing.BrickInstrumentationTestCase
import java.security.KeyStore

/** P8C-006: paired identity loss/replacement must fail closed and never silently re-enrol. */
class Phase8DeviceKeyContinuityInstrumentedTest : BrickInstrumentationTestCase() {
    companion object {
        private const val ALIAS = "brick-device-signing-v1"
        private const val DEVICE_ID = "phase8-key-continuity-device"
    }

    private lateinit var context: Context
    private val prefs get() = context.getSharedPreferences("brick", Context.MODE_PRIVATE)

    override fun setUp() {
        super.setUp()
        context = instrumentation.targetContext.applicationContext
        resetIdentityState()
        DeviceKeys.initialize(context)
    }

    override fun tearDown() {
        resetIdentityState()
        // Leave a normal unpaired identity behind so later emulator tests are not poisoned by this
        // destructive continuity test.
        DeviceKeys.initialize(context)
        DeviceKeys.publicSpkiBase64()
        super.tearDown()
    }

    fun testMissingPairedKeyFailsClosedWithoutSilentRegeneration() {
        val original = DeviceKeys.publicSpkiBase64()
        assertTrue(original.length > 80)
        assertTrue(prefs.edit().putString("deviceId", DEVICE_ID).commit())

        // First paired use binds the expected fingerprint to the still-present original key.
        assertEquals(original, DeviceKeys.publicSpkiBase64())
        assertTrue(prefs.getString("pairedSigningKeySha256", null)?.isNotBlank() == true)

        deleteAlias()
        val thrown = runCatching { DeviceKeys.publicSpkiBase64() }.exceptionOrNull()
        assertTrue("missing paired key must fail closed", thrown is IllegalStateException)
        assertEquals("paired_signing_key_missing", DeviceKeys.identityFault(context))
        assertFalse("missing paired key must not be silently regenerated", aliasExists())
    }

    fun testReplacementPairedKeyIsRejectedAgainstPinnedFingerprint() {
        val original = DeviceKeys.publicSpkiBase64()
        assertTrue(prefs.edit().putString("deviceId", DEVICE_ID).commit())
        assertEquals(original, DeviceKeys.publicSpkiBase64())
        val expected = prefs.getString("pairedSigningKeySha256", null)
        assertTrue(!expected.isNullOrBlank())

        // Simulate an unexpected key replacement: remove the key while temporarily unpaired so a
        // different key can be generated, then restore the same paired device identity without
        // changing the pinned fingerprint.
        deleteAlias()
        assertTrue(prefs.edit().remove("deviceId").commit())
        val replacement = DeviceKeys.publicSpkiBase64()
        assertTrue(replacement.length > 80)
        assertFalse("replacement must really differ", replacement == original)
        assertTrue(prefs.edit().putString("deviceId", DEVICE_ID).commit())
        assertEquals(expected, prefs.getString("pairedSigningKeySha256", null))

        val thrown = runCatching { DeviceKeys.publicSpkiBase64() }.exceptionOrNull()
        assertTrue("replacement paired key must fail closed", thrown is SecurityException)
        assertEquals("paired_signing_key_mismatch", DeviceKeys.identityFault(context))
    }

    private fun resetIdentityState() {
        prefs.edit()
            .remove("deviceId")
            .remove("pairedSigningKeySha256")
            .remove("signingIdentityFault")
            .remove("signingIdentityFaultWallMs")
            .commit()
        deleteAlias()
    }

    private fun deleteAlias() {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (ks.containsAlias(ALIAS)) ks.deleteEntry(ALIAS)
    }

    private fun aliasExists(): Boolean = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.containsAlias(ALIAS)
}
