package com.brick.safety.upgrade

import android.content.Context
import androidx.test.platform.app.InstrumentationRegistry
import com.brick.safety.crypto.DeviceKeys
import com.brick.safety.data.Journal
import com.brick.safety.testing.BrickInstrumentationTestCase

/**
 * Cross-version test deliberately compiled once from Phase 8 and run first against the exact Phase 7
 * target APK, then again after adb install -r upgrades that same package to Phase 8. Keep the seed
 * path limited to APIs/classes that exist in the Phase 7 baseline.
 */
class Phase8UpgradeContinuityInstrumentedTest : BrickInstrumentationTestCase() {
    companion object {
        private const val DEVICE_ID = "phase8-upgrade-device-0001"
        private const val EPOCH = 808
        private const val SEQ = 77L
        private const val PAYLOAD = "phase7-pending-before-upgrade"
    }

    private val context get() = instrumentation.targetContext.applicationContext
    private fun mode(): String = InstrumentationRegistry.getArguments().getString("p8UpgradeMode") ?: ""

    fun testSeedPhase7State() {
        if (mode() != "seed") return
        val info = context.packageManager.getPackageInfo(context.packageName, 0)
        assertEquals("seed must run against exact Phase 7 versionCode", 8L, info.longVersionCode)

        assertTrue(
            context.getSharedPreferences("brick", Context.MODE_PRIVATE).edit()
                .putString("deviceId", DEVICE_ID)
                .putLong("safetySequence", 777L)
                .commit()
        )
        assertTrue(
            context.getSharedPreferences("brick_parent_location", Context.MODE_PRIVATE).edit()
                .putString("desired", "OFF")
                .putString("commandId", "cmd-upgrade-0001")
                .putString("nonce", "11111111-1111-4111-8111-111111111111")
                .putLong("issuedAtMs", 123_456L)
                .commit()
        )
        // Phase 7 does not interpret this Phase 8 retirement marker, but preserving it across the
        // package update proves an interrupted retirement cannot be reset to ACTIVE by upgrading.
        assertTrue(
            context.getSharedPreferences("brick_beta_safety", Context.MODE_PRIVATE).edit()
                .putString("retirement_stage", "DISARMED")
                .commit()
        )

        Journal(context).use { journal ->
            assertTrue(journal.append(EPOCH, SEQ, PAYLOAD.toByteArray()))
            assertEquals(SEQ, journal.nextPending(10).single().seq)
        }

        val publicKey = DeviceKeys.publicSpkiBase64()
        assertTrue(publicKey.length > 80)
        assertTrue(
            context.getSharedPreferences("brick_upgrade_probe", Context.MODE_PRIVATE).edit()
                .putString("phase7PublicKey", publicKey)
                .commit()
        )
    }

    fun testVerifyPhase8UpgradePreservedIdentityBacklogAndRetirement() {
        if (mode() != "verify") return
        val info = context.packageManager.getPackageInfo(context.packageName, 0)
        assertEquals("verify must run after in-place Phase 8 upgrade", 9L, info.longVersionCode)

        val brick = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
        assertEquals(DEVICE_ID, brick.getString("deviceId", null))
        assertEquals(777L, brick.getLong("safetySequence", -1L))

        val parent = context.getSharedPreferences("brick_parent_location", Context.MODE_PRIVATE)
        assertEquals("OFF", parent.getString("desired", null))
        assertEquals("cmd-upgrade-0001", parent.getString("commandId", null))
        assertEquals("11111111-1111-4111-8111-111111111111", parent.getString("nonce", null))
        assertEquals(123_456L, parent.getLong("issuedAtMs", -1L))

        Journal(context).use { journal ->
            val row = journal.nextPending(10).single()
            assertEquals(EPOCH, row.epoch)
            assertEquals(SEQ, row.seq)
            assertEquals(PAYLOAD, row.payload.toString(Charsets.UTF_8))
        }

        val before = context.getSharedPreferences("brick_upgrade_probe", Context.MODE_PRIVATE)
            .getString("phase7PublicKey", null)
        assertNotNull(before)
        assertEquals("AndroidKeyStore identity must survive package update", before!!, DeviceKeys.publicSpkiBase64())

        // Reflection keeps this same test APK runnable against Phase 7, where BetaSafety does not yet
        // exist, while still proving Phase 8 interprets the persisted marker as fail-closed. Startup
        // recovery is allowed to advance DISARMED -> MANAGEMENT_RELEASED when no owner/admin remains;
        // that is safe monotonic progress, not reactivation. Stage 3 remains explicit and must not be
        // entered merely because an APK was upgraded.
        val betaClass = Class.forName("com.brick.safety.beta.BetaSafety")
        val beta = betaClass.getField("INSTANCE").get(null)
        val stage = betaClass.getMethod("retirementStage", Context::class.java).invoke(beta, context).toString()
        val operational = betaClass.getMethod(
            "isOperational",
            Context::class.java,
            java.lang.Long.TYPE
        ).invoke(beta, context, System.currentTimeMillis()) as Boolean
        assertTrue(
            "upgrade must preserve or safely advance the fail-closed retirement state, was $stage",
            stage == "DISARMED" || stage == "MANAGEMENT_RELEASED"
        )
        assertFalse("upgrade must never reactivate a previously disarmed install", operational)
    }
}
