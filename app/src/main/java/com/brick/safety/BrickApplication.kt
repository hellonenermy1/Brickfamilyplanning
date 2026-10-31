package com.brick.safety

import android.app.Application
import android.content.Context
import com.brick.safety.data.Journal
import com.brick.safety.reliability.CrashReporter
import com.brick.safety.reliability.RecoveryScheduler
import kotlin.math.max

class BrickApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        CrashReporter.install(this)
        recoverSequenceWatermark()
        // WorkManager is only a recovery backstop. A corrupt/unavailable WorkManager database must
        // never crash Brick before BootReceiver or the foreground tracking service can recover.
        runCatching { RecoveryScheduler.ensureScheduled(this) }
    }

    private fun recoverSequenceWatermark() {
        val prefs = getSharedPreferences("brick", Context.MODE_PRIVATE)
        val epoch = prefs.getInt("epoch", 1)
        val storedSequence = prefs.getLong("sequence", 0L)
        runCatching {
            Journal(this).use { journal -> max(storedSequence, journal.maxSequence(epoch)) }
        }.onSuccess { recoveredSequence ->
            if (recoveredSequence > storedSequence) {
                prefs.edit().putLong("sequence", recoveredSequence).commit()
            }
        }.onFailure {
            prefs.edit()
                .putBoolean("journalWriteHealthy", false)
                .putLong("lastJournalWriteFailureWallMs", System.currentTimeMillis())
                .commit()
        }
    }
}
