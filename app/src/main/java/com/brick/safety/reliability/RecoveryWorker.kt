package com.brick.safety.reliability

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.brick.safety.beta.BetaSafety
import com.brick.safety.diagnostics.DiagnosticStore
import com.brick.safety.evidence.EvidenceDispatcher
import com.brick.safety.maintenance.DeepOffManager
import com.brick.safety.maintenance.DeviceRoleStore

class RecoveryWorker(
    appContext: Context,
    params: WorkerParameters
) : Worker(appContext, params) {
    override fun doWork(): Result {
        if (DeepOffManager.isActive(applicationContext) || DeviceRoleStore.role(applicationContext) != DeviceRoleStore.Role.CHILD) return Result.success()
        if (!BetaSafety.enforceStartup(applicationContext)) return Result.success()
        return try {
            runCatching { DiagnosticStore.pruneIfNewLocalDay(applicationContext) }
            ServiceControl.ensureTracking(applicationContext)
            runCatching {
                EvidenceDispatcher(applicationContext, scheduleRecovery = false).use { dispatcher ->
                    if (dispatcher.stats().pendingCount > 0) RecoveryScheduler.scheduleEvidenceSoon(applicationContext, 1)
                }
            }
            Result.success()
        } catch (_: Throwable) {
            Result.retry()
        }
    }
}
