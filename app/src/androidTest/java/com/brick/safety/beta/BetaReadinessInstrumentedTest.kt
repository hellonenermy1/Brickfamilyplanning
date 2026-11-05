package com.brick.safety.beta

import android.content.Context
import androidx.test.platform.app.InstrumentationRegistry
import com.brick.safety.BuildConfig
import com.brick.safety.crypto.DeviceKeys
import com.brick.safety.crypto.JournalCipher
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.io.ByteArrayOutputStream

/** Disposable emulator application only; never invokes destructive removal on a user's installation. */
class BetaReadinessInstrumentedTest {
    private val c: Context get() = InstrumentationRegistry.getInstrumentation().targetContext
    @Before fun setup() { DeviceKeys.initialize(c); c.deleteDatabase("brick_beta_readiness.db") }
    @Test fun realEncryptedStorePersistsAcrossReopenAndExportsAckedRows() {
        BetaRunStore(c).use { s -> s.start("synthetic-binding"); s.sample(JSONObject().put("pendingRecords", 7)); s.put("acked", "1") }
        BetaRunStore(c).use { s ->
            assertEquals(0, s.batch().length())
            assertEquals(1, s.batch(6000, pendingOnly = false).length())
            assertEquals(7, s.batch(6000, false).getJSONObject(0).getJSONObject("observation").getJSONObject("health").getInt("pendingRecords"))
            s.readableDatabase.rawQuery("SELECT payload FROM records", null).use { q ->
                assertTrue(q.moveToFirst()); val ciphertext=q.getBlob(0)
                assertFalse(String(ciphertext, Charsets.UTF_8).contains("pendingRecords"))
                assertTrue(String(JournalCipher.decrypt(ciphertext), Charsets.UTF_8).contains("pendingRecords"))
            }
        }
    }
    @Test fun actualMissingBackendAndPairingNeverStartRun() {
        val p = c.getSharedPreferences("brick", Context.MODE_PRIVATE)
        p.edit().remove("deviceId").remove("apiBase").commit()
        val report = BetaDiagnostics.runChecks(c)
        assertFalse(report.getBoolean("coreReady"))
        assertTrue(report.toString().contains("PENDING"))
        try { BetaDiagnostics.startRun(c, true); fail("unpaired phone started endurance") } catch (_: IllegalStateException) { }
        assertTrue(BetaDiagnostics.summary(c).getJSONObject("endurance").isNull("run"))
    }
    @Test fun noPhysicalEscapeAttestationNeverStartsRun() {
        try { BetaDiagnostics.startRun(c, false); fail("missing escape attestation accepted") } catch (_: IllegalStateException) { }
    }
    @Test fun unknownOrCleartextOriginRejected() {
        listOf("http://example.com", "https://u:p@example.com", "https://example.com/x", "https://example.com?q=1", "https://example.com#fragment", "https://example.com:8443").forEach {
            try { BetaApi.origin(it); fail("accepted insecure origin") } catch (_: IllegalArgumentException) { }
        }
        assertEquals("https://example.com", BetaApi.origin("https://example.com/"))
    }
    @Test fun realJournalProbeIsNotTelemetryAndCanBeReopened() {
        c.getSharedPreferences("brick", Context.MODE_PRIVATE).edit().remove("deviceId").remove("apiBase").commit()
        val report=BetaDiagnostics.runChecks(c)
        val checks=report.getJSONArray("checks")
        val journal=(0 until checks.length()).map { checks.getJSONObject(it) }.single { it.getString("id")=="journal" }
        assertEquals("PASS",journal.getString("status"))
        com.brick.safety.data.Journal(c).use { j ->
            j.readableDatabase.rawQuery("SELECT COUNT(*) FROM beta_diagnostic_probe",null).use { assertTrue(it.moveToFirst()); assertEquals(0,it.getInt(0)) }
        }
    }
    @Test fun automaticExpiryIsDisabled() { assertFalse(BuildConfig.BRICK_BETA); assertEquals(0L,BuildConfig.BRICK_BETA_EXPIRY_EPOCH_MS); assertFalse(BetaSafety.isExpired(Long.MAX_VALUE)) }
    @Test fun ownerReleaseReadbackMatchesActualUnmanagedDevice() {
        val dpm=c.getSystemService(android.app.admin.DevicePolicyManager::class.java)
        org.junit.Assume.assumeFalse(dpm.isDeviceOwnerApp(c.packageName))
        val result=BetaSafety.releaseDeviceOwner(c)
        assertEquals(dpm.isDeviceOwnerApp(c.packageName),result.ownerAfter)
        assertEquals(dpm.isAdminActive(android.content.ComponentName(c,com.brick.safety.managed.BrickDeviceAdminReceiver::class.java)),result.activeAdminAfter)
    }
}
