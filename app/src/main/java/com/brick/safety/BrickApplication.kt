package com.brick.safety

import android.app.Activity
import android.app.Application
import android.content.Context
import android.os.Bundle
import com.brick.safety.beta.BetaSafety
import com.brick.safety.crypto.DeviceKeys
import com.brick.safety.data.Journal
import com.brick.safety.diagnostics.DiagnosticMonitor
import com.brick.safety.diagnostics.DiagnosticStore
import com.brick.safety.fusion.Phase5CoarseNetworkRuntime
import com.brick.safety.fusion.Phase5HypothesisRuntime
import com.brick.safety.fusion.Phase5LearnedPlaceRuntime
import com.brick.safety.maintenance.CapabilityProfileStore
import com.brick.safety.maintenance.DeepOffManager
import com.brick.safety.maintenance.DeprovisionManager
import com.brick.safety.maintenance.DeviceRoleStore
import com.brick.safety.maintenance.P8BControlRuntime
import com.brick.safety.privileged.ShizukuBridgeController
import com.brick.safety.reliability.CrashReporter
import com.brick.safety.reliability.FallDetectorRuntime
import com.brick.safety.reliability.RecoveryScheduler
import com.brick.safety.reliability.SafetyDispatcher
import kotlin.math.max

class BrickApplication : Application() {
    private var startedActivities = 0

    override fun onCreate() {
        super.onCreate()

        // After PURGE BRICK, only the deprovision stage preference may remain. Do not initialize
        // diagnostics, keys, tracking, evidence, learned state, recovery work or any other store that
        // could recreate Brick-owned persistence while the user is between PURGE and UNINSTALL.
        if (DeprovisionManager.isPostPurge(this)) return

        DiagnosticStore.init(this)
        DeviceKeys.initialize(this)

        if (DeepOffManager.isActive(this)) {
            DeepOffManager.quiesce(this)
            DiagnosticStore.log(DiagnosticStore.Severity.INFO, "deep_off", "startup_remains_quiesced")
            return
        }
        if (!BetaSafety.enforceStartup(this)) {
            DiagnosticStore.log(DiagnosticStore.Severity.WARN, "beta", "startup_blocked_retired_or_expired")
            return
        }
        if (DeviceRoleStore.role(this) != DeviceRoleStore.Role.CHILD) {
            RecoveryScheduler.cancelAll(this)
            DiagnosticStore.log(
                DiagnosticStore.Severity.INFO,
                "role",
                "child_runtime_not_started",
                "role=${DeviceRoleStore.role(this)}"
            )
            return
        }

        runCatching { SafetyDispatcher.restoreSosMirror(this) }
            .onFailure {
                DiagnosticStore.log(
                    DiagnosticStore.Severity.ERROR,
                    "safety",
                    "sos_state_restore_failed",
                    it.javaClass.simpleName,
                    it
                )
            }
        P8BControlRuntime.initialize(this)
        DiagnosticMonitor.start(this)
        CrashReporter.install(this)
        Phase5LearnedPlaceRuntime.initialize(this)
        Phase5CoarseNetworkRuntime.initialize(this)
        Phase5HypothesisRuntime.initialize(this)
        runCatching { ShizukuBridgeController.initialize(this) }
            .onFailure {
                DiagnosticStore.log(
                    DiagnosticStore.Severity.WARN,
                    "shizuku",
                    "initialize_failed",
                    it.javaClass.simpleName,
                    it
                )
            }
        runCatching { CapabilityProfileStore.refresh(this) }
            .onFailure {
                DiagnosticStore.log(
                    DiagnosticStore.Severity.WARN,
                    "capability",
                    "profile_refresh_failed",
                    it.javaClass.simpleName,
                    it
                )
            }
        runCatching { FallDetectorRuntime.start(this) }
            .onFailure {
                DiagnosticStore.log(
                    DiagnosticStore.Severity.WARN,
                    "fall",
                    "detector_start_failed",
                    it.javaClass.simpleName,
                    it
                )
            }
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
        runCatching { RecoveryScheduler.ensureScheduled(this) }
            .onFailure {
                DiagnosticStore.log(
                    DiagnosticStore.Severity.WARN,
                    "recovery",
                    "scheduler_setup_failed",
                    it.javaClass.simpleName,
                    it
                )
            }
    }

    private fun recoverSequenceWatermark() {
        val prefs = getSharedPreferences("brick", Context.MODE_PRIVATE)
        val epoch = prefs.getInt("epoch", 1)
        val storedSequence = prefs.getLong("sequence", 0L)
        runCatching { Journal(this).use { journal -> max(storedSequence, journal.maxSequence(epoch)) } }
            .onSuccess { recoveredSequence ->
                if (recoveredSequence > storedSequence) {
                    prefs.edit().putLong("sequence", recoveredSequence).commit()
                    DiagnosticStore.log(
                        DiagnosticStore.Severity.INFO,
                        "journal",
                        "sequence_watermark_recovered",
                        "from=$storedSequence to=$recoveredSequence"
                    )
                }
            }.onFailure {
                prefs.edit().putBoolean("journalWriteHealthy", false)
                    .putLong("lastJournalWriteFailureWallMs", System.currentTimeMillis())
                    .commit()
                DiagnosticStore.log(
                    DiagnosticStore.Severity.ERROR,
                    "journal",
                    "sequence_recovery_failed",
                    it.javaClass.simpleName,
                    it
                )
            }
    }
}
