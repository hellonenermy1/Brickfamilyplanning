package com.brick.safety.reliability

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.brick.safety.evidence.EvidenceDispatcher

class RecoveryWorker(
    appContext: Context,
    params: WorkerParameters
) : Worker(appContext, params) {
    override fun doWork(): Result {
        return try {
            // Core tracking recovery always runs first. Evidence is intentionally best-effort and
            // lower priority; a failed evidence upload must never make core recovery fail.
            ServiceControl.ensureTracking(applicationContext)
            runCatching {
                EvidenceDispatcher(applicationContext).use { dispatcher ->
                    dispatcher.drainIfSafe(maxBatches = 2)
                }
            }
            Result.success()
        } catch (_: Throwable) {
            Result.retry()
        }
    }
}
