package com.brick.safety.testing

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.brick.safety.data.Journal
import com.brick.safety.reliability.ServiceControl
import java.util.concurrent.Executors

/** Debug/testOnly-only receiver used by CI to start a deterministic sustained-failure workload. */
class Phase8ResourceHarnessReceiver : BroadcastReceiver() {
    companion object {
        const val ACTION_SEED = "com.brick.safety.testing.PHASE8_RESOURCE_SEED"
        private const val EPOCH = 808
        private const val BACKLOG_ROWS = 1_000
    }

    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != ACTION_SEED) return

        // Seeding 1,000 encrypted SQLite rows is intentionally heavy and must never run on the
        // BroadcastReceiver main thread. A slower GitHub emulator can otherwise cross Android's
        // broadcast-ANR threshold and make the resource test measure an ANR rather than Brick.
        val pending = goAsync()
        val app = context.applicationContext
        val executor = Executors.newSingleThreadExecutor { runnable ->
            Thread(runnable, "BrickP8ResourceSeed").apply { isDaemon = false }
        }
        executor.execute {
            try {
                seedAndStart(app)
            } catch (t: Throwable) {
                Log.e("BrickP8Resource", "seed-failed type=${t.javaClass.simpleName}", t)
            } finally {
                pending.finish()
                executor.shutdown()
            }
        }
    }

    private fun seedAndStart(app: Context) {
        val prefs = app.getSharedPreferences("brick", Context.MODE_PRIVATE)
        check(
            prefs.edit()
                .putString("deviceId", "80808080-8080-4080-8080-808080808080")
                .putString("apiBase", "https://127.0.0.1:1")
                .putInt("epoch", EPOCH)
                .putLong("sequence", BACKLOG_ROWS.toLong())
                .putBoolean("sosActive", false)
                .putInt("coreUploadFailureStreak", 0)
                .commit()
        ) { "resource fixture preferences were not durably committed" }

        var durable = 0
        Journal(app).use { journal ->
            for (seq in 1L..BACKLOG_ROWS.toLong()) {
                val payload = ByteArray(90) { index -> ((seq + index) % 251).toByte() }
                payload[0] = 2
                if (journal.append(EPOCH, seq, payload)) durable++
            }
        }
        check(durable == BACKLOG_ROWS) { "resource fixture only persisted $durable/$BACKLOG_ROWS rows" }

        // Completion marker is emitted only after all 1,000 rows are durable. CI waits for this exact
        // line before starting measurements, so asynchronous seeding cannot race the test envelope.
        Log.i("BrickP8Resource", "seeded=$durable api=loopback-refusal")
        runCatching { ServiceControl.ensureTracking(app) }
            .onSuccess { Log.i("BrickP8Resource", "service=start-requested") }
            .onFailure { Log.e("BrickP8Resource", "service=start-failed type=${it.javaClass.simpleName}", it) }
    }
}
