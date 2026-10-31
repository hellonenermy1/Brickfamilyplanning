package com.brick.safety.reliability

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.brick.safety.evidence.EvidenceDispatcher

/**
 * Dedicated low-priority durable evidence drain. It never owns or replaces Brick Core tracking.
 * The dispatcher itself refuses to send while safety, live-location or crash backlog exists.
 */
class EvidenceUploadWorker(
    appContext: Context,
    params: WorkerParameters
) : Worker(appContext, params) {
    override fun doWork(): Result {
        return try {
            EvidenceDispatcher(applicationContext, scheduleRecovery = false).use { dispatcher ->
                // A bounded run prevents evidence from monopolising a worker indefinitely. Returning
                // retry while records remain lets WorkManager continue catch-up after long outages.
                dispatcher.drainIfSafe(maxBatches = 8)
                if (dispatcher.stats().pendingCount > 0) Result.retry() else Result.success()
            }
        } catch (_: Throwable) {
            Result.retry()
        }
    }
}
