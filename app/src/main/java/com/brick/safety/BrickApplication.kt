package com.brick.safety

import android.app.Activity
import android.app.Application
import android.content.Context
import android.os.Bundle
import com.brick.safety.data.Journal
import com.brick.safety.diagnostics.DiagnosticMonitor
import com.brick.safety.diagnostics.DiagnosticStore
import com.brick.safety.fusion.Phase5CoarseNetworkRuntime
import com.brick.safety.fusion.Phase5HypothesisRuntime
import com.brick.safety.fusion.Phase5LearnedPlaceRuntime
import com.brick.safety.privileged.ShizukuBridgeController
import com.brick.safety.reliability.CrashReporter
import com.brick.safety.reliability.RecoveryScheduler
import kotlin.math.max

class BrickApplication : Application() {
    private var startedActivities = 0

    override fun onCreate() {
        super.onCreate()
        DiagnosticStore.init(this)
        DiagnosticMonitor.start(this)
        CrashReporter.install(this)
        Phase5LearnedPlaceRuntime.initialize(this)
        Phase5CoarseNetworkRuntime.initialize(this)
        Phase5HypothesisRuntime.initialize(this)
        runCatching { ShizukuBridgeController.initialize(this) }
            .onFailure { DiagnosticStore.log(DiagnosticStore.Severity.WARN, "shizuku", "initialize_failed", it.javaClass.simpleName, it) }
        registerActivityLifecycleCallbacks(object : ActivityLifecycleCallbacks {
            override fun onActivityStarted(activity: Activity) {
                startedActivities += 1
                if (startedActivities == 1) {
                    DiagnosticStore.log(DiagnosticStore.Severity.INFO, "process", "app_foreground")
                    runCatching { ShizukuBridgeController.onAppForegroundChanged(true) }
                }
            }

            override fun onActivityStopped(activity: Activity) {
                startedActivities = (startedActivities - 1).coerceAtLeast(0)
                if (startedActivities == 0) {
                    DiagnosticStore.log(DiagnosticStore.Severity.INFO, "process", "app_background")
                    runCatching { ShizukuBridgeController.onAppForegroundChanged(false) }
                }
            }

            override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit
            override fun onActivityResumed(activity: Activity) = Unit
            override fun onActivityPaused(activity: Activity) = Unit
            override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
            override fun onActivityDestroyed(activity: Activity) = Unit
        })
        recoverSequenceWatermark()
        // WorkManager is only a recovery backstop. A corrupt/unavailable WorkManager database must
        // never crash Brick before BootReceiver or the foreground tracking service can recover.
        runCatching { RecoveryScheduler.ensureScheduled(this) }
            .onFailure { DiagnosticStore.log(DiagnosticStore.Severity.WARN, "recovery", "scheduler_setup_failed", it.javaClass.simpleName, it) }
    }

    private fun recoverSequenceWatermark() {
        val prefs = getSharedPreferences("brick", Context.MODE_PRIVATE)
        val epoch = prefs.getInt("epoch", 1)
        val storedSequence = prefs.getLong("sequence", 0L)
        runCatching {
            Journal(this).use { journal -> max(storedSequence, journal.maxSequence(epoch)) }
        }.onSuccess { recoveredSequence ->
            if (recoveredSequence > storedSequence) {
                prefs.edit().putLong("sequence", recoveredSequence).commit()
                DiagnosticStore.log(DiagnosticStore.Severity.INFO, "journal", "sequence_watermark_recovered", "from=$storedSequence to=$recoveredSequence")
            }
        }.onFailure {
            prefs.edit()
                .putBoolean("journalWriteHealthy", false)
                .putLong("lastJournalWriteFailureWallMs", System.currentTimeMillis())
                .commit()
            DiagnosticStore.log(DiagnosticStore.Severity.ERROR, "journal", "sequence_recovery_failed", it.javaClass.simpleName, it)
        }
    }
}
