package com.brick.safety.testing

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.brick.safety.data.Journal
import com.brick.safety.reliability.ServiceControl

/** Debug/testOnly-only receiver used by CI to start a deterministic sustained-failure workload. */
class Phase8ResourceHarnessReceiver : BroadcastReceiver() {
    companion object {
        const val ACTION_SEED = "com.brick.safety.testing.PHASE8_RESOURCE_SEED"
        private const val EPOCH = 808
        private const val BACKLOG_ROWS = 1_000
    }

    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != ACTION_SEED) return
        val app = context.applicationContext
        val prefs = app.getSharedPreferences("brick", Context.MODE_PRIVATE)
        prefs.edit()
            .putString("deviceId", "80808080-8080-4080-8080-808080808080")
            .putString("apiBase", "https://127.0.0.1:1")
            .putInt("epoch", EPOCH)
            .putLong("sequence", BACKLOG_ROWS.toLong())
            .putBoolean("sosActive", false)
            .putInt("coreUploadFailureStreak", 0)
            .commit()

        var durable = 0
        Journal(app).use { journal ->
            for (seq in 1L..BACKLOG_ROWS.toLong()) {
                val payload = ByteArray(90) { index -> ((seq + index) % 251).toByte() }
                payload[0] = 2
                if (journal.append(EPOCH, seq, payload)) durable++
            }
        }
        check(durable == BACKLOG_ROWS) { "resource fixture only persisted $durable/$BACKLOG_ROWS rows" }
        ServiceControl.ensureTracking(app)
        Log.i("BrickP8Resource", "seeded=$durable api=loopback-refusal service=start-requested")
    }
}
