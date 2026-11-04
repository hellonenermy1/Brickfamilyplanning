package com.brick.safety.testing

import android.content.Context
import com.brick.safety.data.Journal
import com.brick.safety.maintenance.DeviceRoleStore
import java.io.File

/**
 * Phase 8C resource fixture. Seeding must not run under BroadcastReceiver/goAsync's ANR deadline.
 * Instrumentation owns this bounded 1,000-row insertion and preserves state for the next ADB step.
 */
class Phase8ResourceSeedInstrumentedTest : BrickInstrumentationTestCase() {
    fun testSeed1000DurableLocationRecordsAndRefusedUploadEndpoint() {
        val app = instrumentation.targetContext.applicationContext
        val statusFile = File(app.filesDir, "phase8_resource_seed_status.txt")
        statusFile.delete()
        val prefs = app.getSharedPreferences("brick", Context.MODE_PRIVATE)
        assertTrue(
            prefs.edit()
                .putString("deviceId", "80808080-8080-4080-8080-808080808080")
                .putString("apiBase", "https://127.0.0.1:1")
                .putInt("epoch", 808)
                .putLong("sequence", 1_000L)
                .putBoolean("sosActive", false)
                .putInt("coreUploadFailureStreak", 0)
                .commit()
        )
        assertTrue(DeviceRoleStore.setChildAfterPairing(app))

        var durable = 0
        Journal(app).use { journal ->
            for (seq in 1L..1_000L) {
                val packet = ByteArray(90) { index -> ((seq + index) % 251).toByte() }
                packet[0] = 2
                if (journal.append(808, seq, packet)) durable++
            }
            assertEquals(1_000, durable)
            assertEquals(1_000, journal.stats().pendingCount)
        }
        assertTrue(statusFile.writeText("seeded=$durable api=loopback-refusal\n").let { statusFile.exists() })
    }
}
