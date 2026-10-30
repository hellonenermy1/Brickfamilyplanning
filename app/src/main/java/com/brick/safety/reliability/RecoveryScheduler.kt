package com.brick.safety.reliability

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

object RecoveryScheduler {
    private const val PERIODIC_WORK = "brick-periodic-recovery"
    private const val SOON_WORK = "brick-soon-recovery"

    fun ensureScheduled(context: Context) {
        val request = PeriodicWorkRequestBuilder<RecoveryWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.NOT_REQUIRED).build())
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            PERIODIC_WORK,
            ExistingPeriodicWorkPolicy.KEEP,
            request
        )
    }

    fun scheduleSoon(context: Context, delaySeconds: Long = 15) {
        val request = OneTimeWorkRequestBuilder<RecoveryWorker>()
            .setInitialDelay(delaySeconds.coerceAtLeast(1), TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            SOON_WORK,
            ExistingWorkPolicy.REPLACE,
            request
        )
    }
}
