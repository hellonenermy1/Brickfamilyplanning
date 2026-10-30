package com.brick.safety.reliability

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters

class RecoveryWorker(
    appContext: Context,
    params: WorkerParameters
) : Worker(appContext, params) {
    override fun doWork(): Result {
        return try {
            ServiceControl.ensureTracking(applicationContext)
            Result.success()
        } catch (_: Throwable) {
            Result.retry()
        }
    }
}
