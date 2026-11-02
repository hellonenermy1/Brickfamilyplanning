package com.brick.safety.beta

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters

class BetaExpiryWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : Worker(appContext, workerParams) {

    override fun doWork(): Result {
        BetaSafety.enforceStartup(applicationContext)
        return Result.success()
    }
}
