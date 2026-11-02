package com.brick.safety.reliability

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.brick.safety.beta.BetaSafety
import com.brick.safety.evidence.EvidenceDispatcher

class RecoveryWorker(
    appContext: Context,
    params: WorkerParameters
) : Worker(appContext, params) {
    override fun doWork(): Result {
        if (!BetaSafety.enforceStartup(applicationContext)) return Result.success()
        return try {
            // Brick Core recovery always runs first. Evidence has a separate network-constrained
            // worker so a large evidence backlog cannot monopolise or fail core recovery work.
            ServiceControl.ensureTracking(applicationContext)
            runCatching {
                EvidenceDispatcher(applicationContext, scheduleRecovery = false).use { dispatcher ->
                    if (dispatcher.stats().pendingCount > 0) {
                        RecoveryScheduler.scheduleEvidenceSoon(applicationContext, 1)
                    }
                }
            }
            Result.success()
        } catch (_: Throwable) {
            Result.retry()
        }
    }
}
