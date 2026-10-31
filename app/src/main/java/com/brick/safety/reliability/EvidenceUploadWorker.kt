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
                // Bound each worker run so evidence cannot monopolise execution. If durable records
                // remain, append exactly one successor. Fast progress gets a short delay; a zero-
                // progress run (core backlog, network/server failure or ACK failure) backs off.
                val sent = dispatcher.drainIfSafe(maxBatches = 8)
                if (dispatcher.stats().pendingCount > 0) {
                    RecoveryScheduler.scheduleEvidenceFollowUp(
                        applicationContext,
                        delaySeconds = if (sent > 0) 2 else 30
                    )
                }
            }
            Result.success()
        } catch (_: Throwable) {
            // Unexpected local journal/worker failure uses WorkManager's normal retry semantics.
            // Core tracking is independent and is not failed by this worker.
            Result.retry()
        }
    }
}
