package com.brick.safety.maintenance

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters

class WifiScheduleWorker(appContext: Context, params: WorkerParameters) : Worker(appContext, params) {
    override fun doWork(): Result {
        if (DeepOffManager.isActive(applicationContext)) return Result.success()
        val id = inputData.getString("scheduleId") ?: return Result.success()
        val trigger = inputData.getLong("triggerEpochMs", -1L)
        return runCatching {
            WifiScheduleManager.execute(applicationContext, id, trigger)
            Result.success()
        }.getOrElse { Result.retry() }
    }
}
