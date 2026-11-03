package com.brick.safety.maintenance

import android.content.Context
import com.brick.safety.network.BrickApi

/**
 * Narrow process-local bridge from authenticated/validated health-sync config to durable local
 * control state. It deliberately does not depend on BrickLocationService and therefore cannot make
 * Core depend on optional control features.
 */
object P8BControlRuntime {
    @Volatile private var appContext: Context? = null

    fun initialize(context: Context) {
        appContext = context.applicationContext
        // Keep the legacy cadence key synchronized from the durable Live Track store after restart.
        syncLiveTrackCadence(context.applicationContext)
        WifiScheduleManager.reschedule(context.applicationContext)
    }

    fun apply(sync: BrickApi.HealthSyncResult) {
        val app = appContext ?: return
        sync.liveTrackCommand?.let { command ->
            val changed = runCatching {
                LiveTrackStateStore.applyVerified(
                    app,
                    command.commandId,
                    command.nonce,
                    command.active,
                    command.issuedAtMs,
                    command.expiresAtMs
                )
            }.getOrDefault(false)
            if (changed) syncLiveTrackCadence(app)
        }
        sync.wifiSchedules?.let { configs ->
            val schedules = configs.map {
                WifiScheduleManager.Schedule(
                    id = it.id,
                    enabled = it.enabled,
                    targetEnabled = it.targetEnabled,
                    localMinuteOfDay = it.localMinuteOfDay,
                    daysMask = it.daysMask,
                    graceMinutes = it.graceMinutes
                )
            }
            WifiScheduleManager.updateSchedules(app, schedules)
        }
    }

    fun refreshExpiry(context: Context) {
        val app = context.applicationContext
        LiveTrackStateStore.clearExpired(app)
        syncLiveTrackCadence(app)
    }

    private fun syncLiveTrackCadence(context: Context) {
        val state = LiveTrackStateStore.read(context)
        context.getSharedPreferences("brick", Context.MODE_PRIVATE).edit()
            .putLong("liveTrackUntilMs", if (state.active) state.activeUntilMs else 0L)
            .putString("liveTrackCommandId", state.commandId)
            .putString("liveTrackCommandStatus", state.status.name.lowercase())
            .putString("liveTrackResultDetail", state.resultDetail)
            .apply()
    }
}
