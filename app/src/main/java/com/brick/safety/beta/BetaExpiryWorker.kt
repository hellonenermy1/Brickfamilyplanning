package com.brick.safety.beta

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.brick.safety.maintenance.DeprovisionManager

class BetaExpiryWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : Worker(appContext, workerParams) {

    override fun doWork(): Result {
        if (DeprovisionManager.isPostPurge(applicationContext)) return Result.success()
        BetaSafety.enforceStartup(applicationContext)
        return Result.success()
    }
}
