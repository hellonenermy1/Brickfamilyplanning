package com.brick.safety.reliability

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.brick.safety.beta.BetaSafety
import com.brick.safety.evidence.EvidenceDispatcher
import com.brick.safety.evidence.EvidenceDrainStop

object EvidenceRetryPolicy {
    const val CORE_BACKLOG_DELAY_SECONDS = 60L
    const val CATCH_UP_DELAY_SECONDS = 2L
    private const val BASE_FAILURE_DELAY_SECONDS = 30L
    private const val MAX_FAILURE_DELAY_SECONDS = 15 * 60L

    fun failureDelaySeconds(streak: Int): Long {
        val exponent = (streak.coerceAtLeast(1) - 1).coerceAtMost(5)
        return (BASE_FAILURE_DELAY_SECONDS * (1L shl exponent)).coerceAtMost(MAX_FAILURE_DELAY_SECONDS)
    }
}

/** Dedicated low-priority durable evidence drain. It can never revive a retired Brick beta. */
class EvidenceUploadWorker(
    appContext: Context,
    params: WorkerParameters
) : Worker(appContext, params) {
    companion object {
        private const val PREF_FAILURE_STREAK = "evidenceUploadFailureStreak"
    }

    private val prefs = applicationContext.getSharedPreferences("brick", Context.MODE_PRIVATE)

    private fun resetFailureStreak() {
        if (prefs.getInt(PREF_FAILURE_STREAK, 0) != 0) prefs.edit().putInt(PREF_FAILURE_STREAK, 0).apply()
    }

    private fun nextFailureDelaySeconds(): Long {
        val next = (prefs.getInt(PREF_FAILURE_STREAK, 0) + 1).coerceIn(1, 32)
        prefs.edit().putInt(PREF_FAILURE_STREAK, next).apply()
        return EvidenceRetryPolicy.failureDelaySeconds(next)
    }

    override fun doWork(): Result {
        if (!BetaSafety.enforceStartup(applicationContext)) return Result.success()
        return try {
            EvidenceDispatcher(applicationContext, scheduleRecovery = false).use { dispatcher ->
                val outcome = dispatcher.drainDetailed(maxBatches = 8)
                val pending = dispatcher.stats().pendingCount
                if (pending <= 0) {
                    resetFailureStreak()
                } else {
                    val delaySeconds = when (outcome.stop) {
                        EvidenceDrainStop.BUDGET_EXHAUSTED -> {
                            resetFailureStreak(); EvidenceRetryPolicy.CATCH_UP_DELAY_SECONDS
                        }
                        EvidenceDrainStop.CORE_BACKLOG -> {
                            resetFailureStreak(); EvidenceRetryPolicy.CORE_BACKLOG_DELAY_SECONDS
                        }
                        EvidenceDrainStop.TRANSPORT_FAILURE,
                        EvidenceDrainStop.ACK_FAILURE,
                        EvidenceDrainStop.JOURNAL_FAILURE,
                        EvidenceDrainStop.IDENTITY_UNAVAILABLE -> nextFailureDelaySeconds()
                        EvidenceDrainStop.EMPTY -> {
                            resetFailureStreak(); EvidenceRetryPolicy.CORE_BACKLOG_DELAY_SECONDS
                        }
                    }
                    RecoveryScheduler.scheduleEvidenceFollowUp(applicationContext, delaySeconds)
                }
            }
            Result.success()
        } catch (_: Throwable) {
            Result.retry()
        }
    }
}
