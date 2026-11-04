package com.brick.safety.maintenance

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import com.brick.safety.crypto.DeviceKeys
import com.brick.safety.testing.BrickInstrumentationTestCase
import java.io.File
import java.security.KeyStore
import javax.crypto.KeyGenerator

/** P8C-005: exercise the production PURGE_BRICK path against the complete known Brick inventory. */
@Suppress("DEPRECATION")
class Phase8PurgeInventoryInstrumentedTest : BrickInstrumentationTestCase() {
    private lateinit var context: Context

    private val databases = listOf(
        "brick_journal.db",
        "brick_safety_outbox.db",
        "brick_crash_outbox.db",
        "brick_evidence.db",
        "brick_diagnostics.db"
    )
    private val preferences = listOf(
        "brick",
        "brick_position",
        "brick_activity",
        "brick_companion_presence",
        "brick_beta_safety",
        "brick_parent_location",
        "brick_managed_policy_p8",
        "brick_diag_state",
        "brick_diag_flags",
        "brick_diagnostics",
        "brick_policy_ledger_v1",
        "brick_deep_off_v1",
        "brick_live_track_v1",
        "brick_wifi_schedule_v1",
        "brick_canary_v1",
        "brick_device_role_v1",
        "brick_capability_profile_v1",
        "brick_ble_anchors"
    )
    private val files = listOf(
        "brick_phase3_state.bin",
        "brick_atlas_v1.bin",
        "brick_learned_places_v1.bin"
    )
    private val aliases = listOf(
        "brick-device-signing-v1",
        "brick-journal-aes-v1",
        "brick-witness-alias-hmac-v1",
        "brick_atlas_hmac_v1"
    )

    override fun setUp() {
        super.setUp()
        context = instrumentation.targetContext.applicationContext
        cleanupFixtures()
        context.deleteSharedPreferences("brick_deprovision_v1")
    }

    override fun tearDown() {
        cleanupFixtures()
        context.deleteSharedPreferences("brick_deprovision_v1")
        super.tearDown()
    }

    fun testProductionPurgeDeletesAndVerifiesCompleteKnownInventory() {
        seedEveryKnownStore()
        assertInventoryPresent()

        // This test isolates PURGE itself. The preceding production stage is represented durably so
        // purgeBrick() exercises its real Shizuku shutdown, WorkManager drain, database/prefs/file/
        // Keystore deletion and final PURGE_BRICK persistence without requiring Device Owner setup.
        assertTrue(
            context.getSharedPreferences("brick_deprovision_v1", Context.MODE_PRIVATE).edit()
                .putString("stage", DeprovisionManager.Stage.UNDO_DEVICE_MANAGEMENT.name)
                .putBoolean("deprovisionEverStarted", true)
                .putLong("updatedAtMs", System.currentTimeMillis())
                .commit()
        )

        val result = DeprovisionManager.purgeBrick(context)
        assertTrue(result.detail, result.ok)
        assertEquals(DeprovisionManager.Stage.PURGE_BRICK, result.stage)
        assertTrue(DeprovisionManager.isPostPurge(context))

        databases.forEach { name ->
            assertFalse("database survived purge: $name", context.getDatabasePath(name).exists())
        }
        preferences.forEach { name ->
            assertTrue("preference data survived purge: $name", context.getSharedPreferences(name, Context.MODE_PRIVATE).all.isEmpty())
        }
        files.forEach { name ->
            listOf("", ".new", ".bak").forEach { suffix ->
                val persisted = File(context.filesDir, name + suffix)
                assertFalse("internal atomic file survived purge: ${name + suffix}", persisted.exists())
            }
        }
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        aliases.forEach { alias ->
            assertFalse("Keystore alias survived purge: $alias", ks.containsAlias(alias))
        }
    }

    private fun seedEveryKnownStore() {
        databases.forEach { name ->
            context.openOrCreateDatabase(name, Context.MODE_PRIVATE, null).use { db ->
                db.execSQL("CREATE TABLE IF NOT EXISTS p8c_probe(v INTEGER NOT NULL)")
                db.execSQL("INSERT INTO p8c_probe(v) VALUES(1)")
            }
        }
        preferences.forEach { name ->
            assertTrue(
                "failed to seed preference $name",
                context.getSharedPreferences(name, Context.MODE_PRIVATE).edit().putString("p8cProbe", "present").commit()
            )
        }
        files.forEach { name ->
            listOf("", ".new", ".bak").forEach { suffix ->
                File(context.filesDir, name + suffix).writeBytes(byteArrayOf(0x42, 0x52, 0x49, 0x43, 0x4b))
            }
        }

        // Production helper creates the signing identity under the exact real alias.
        DeviceKeys.initialize(context)
        DeviceKeys.publicSpkiBase64()
        createAesAlias("brick-journal-aes-v1")
        createHmacAlias("brick-witness-alias-hmac-v1")
        createHmacAlias("brick_atlas_hmac_v1")
    }

    private fun assertInventoryPresent() {
        databases.forEach { assertTrue("database fixture missing: $it", context.getDatabasePath(it).exists()) }
        preferences.forEach { assertEquals("present", context.getSharedPreferences(it, Context.MODE_PRIVATE).getString("p8cProbe", null)) }
        files.forEach { name ->
            listOf("", ".new", ".bak").forEach { suffix ->
                assertTrue("atomic file fixture missing: ${name + suffix}", File(context.filesDir, name + suffix).exists())
            }
        }
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        aliases.forEach { assertTrue("Keystore fixture missing: $it", ks.containsAlias(it)) }
    }

    private fun createAesAlias(alias: String) {
        deleteAlias(alias)
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        generator.generateKey()
    }

    private fun createHmacAlias(alias: String) {
        deleteAlias(alias)
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_HMAC_SHA256, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
            ).setDigests(KeyProperties.DIGEST_SHA256).build()
        )
        generator.generateKey()
    }

    private fun deleteAlias(alias: String) {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (ks.containsAlias(alias)) ks.deleteEntry(alias)
    }

    private fun cleanupFixtures() {
        databases.forEach { runCatching { context.deleteDatabase(it) } }
        preferences.forEach { runCatching { context.deleteSharedPreferences(it) } }
        files.forEach { name ->
            listOf("", ".new", ".bak").forEach { suffix ->
                runCatching { File(context.filesDir, name + suffix).delete() }
            }
        }
        aliases.forEach { runCatching { deleteAlias(it) } }
    }
}
