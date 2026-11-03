package com.brick.safety.maintenance

import android.app.admin.DevicePolicyManager
import android.content.Context
import android.net.wifi.WifiManager
import android.os.SystemClock
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.brick.safety.reliability.SafetyDispatcher
import org.json.JSONArray
import org.json.JSONObject
import java.time.DayOfWeek
import java.time.Duration
import java.time.ZonedDateTime
import java.util.concurrent.TimeUnit

/**
 * Durable local one-shot Wi-Fi scheduler. A schedule creates actions at due times, never a persistent
 * desired state. After an action completes, a child/user toggle is current truth and is not repaired.
 */
object WifiScheduleManager {
    private const val PREFS = "brick_wifi_schedule_v1"
    private const val KEY_SCHEDULES = "schedules"
    private const val KEY_LAST_RESULT = "lastResult"
    private const val MAX_SCHEDULES = 8
    private const val DEFAULT_GRACE_MINUTES = 15
    private const val WORK_PREFIX = "brick-wifi-schedule-"
    private const val VERIFY_TIMEOUT_MS = 10_000L
    private const val VERIFY_POLL_MS = 250L

    data class Schedule(
        val id: String,
        val enabled: Boolean,
        val targetEnabled: Boolean,
        val localMinuteOfDay: Int,
        val daysMask: Int,
        val graceMinutes: Int
    )

    data class Result(
        val scheduleId: String,
        val targetEnabled: Boolean,
        val actualEnabled: Boolean?,
        val status: String,
        val attemptedAtMs: Long,
        val detail: String
    )

    fun updateSchedules(context: Context, schedules: List<Schedule>): Boolean {
        require(schedules.size <= MAX_SCHEDULES)
        val seen = HashSet<String>()
        schedules.forEach {
            require(it.id.matches(Regex("[A-Za-z0-9._:-]{1,96}")) && seen.add(it.id))
            require(it.localMinuteOfDay in 0..1439)
            require(it.daysMask in 1..127)
            require(it.graceMinutes in 1..120)
        }
        val array = JSONArray()
        schedules.forEach { s ->
            array.put(JSONObject()
                .put("id", s.id)
                .put("enabled", s.enabled)
                .put("targetEnabled", s.targetEnabled)
                .put("localMinuteOfDay", s.localMinuteOfDay)
                .put("daysMask", s.daysMask)
                .put("graceMinutes", s.graceMinutes))
        }
        val ok = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(KEY_SCHEDULES, array.toString()).commit()
        if (ok) reschedule(context)
        return ok
    }

    fun readSchedules(context: Context): List<Schedule> {
        val raw = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_SCHEDULES, null) ?: return emptyList()
        return runCatching {
            val a = JSONArray(raw)
            buildList {
                for (i in 0 until minOf(a.length(), MAX_SCHEDULES)) {
                    val o = a.optJSONObject(i) ?: continue
                    val id = o.optString("id")
                    val minute = o.optInt("localMinuteOfDay", -1)
                    val mask = o.optInt("daysMask", 0)
                    val grace = o.optInt("graceMinutes", DEFAULT_GRACE_MINUTES)
                    if (!id.matches(Regex("[A-Za-z0-9._:-]{1,96}")) || minute !in 0..1439 || mask !in 1..127 || grace !in 1..120) continue
                    add(Schedule(id, o.optBoolean("enabled", true), o.optBoolean("targetEnabled", true), minute, mask, grace))
                }
            }
        }.getOrDefault(emptyList())
    }

    fun lastResult(context: Context): Result? {
        val raw = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_LAST_RESULT, null) ?: return null
        return runCatching {
            val o = JSONObject(raw)
            Result(
                scheduleId = o.getString("scheduleId"),
                targetEnabled = o.getBoolean("targetEnabled"),
                actualEnabled = if (o.isNull("actualEnabled")) null else o.getBoolean("actualEnabled"),
                status = o.getString("status"),
                attemptedAtMs = o.getLong("attemptedAtMs"),
                detail = o.optString("detail").take(120)
            )
        }.getOrNull()
    }

    fun reschedule(context: Context) {
        val app = context.applicationContext
        val wm = WorkManager.getInstance(app)
        readSchedules(app).forEach { schedule ->
            wm.cancelUniqueWork(WORK_PREFIX + schedule.id)
            if (!schedule.enabled) return@forEach
            val next = nextOccurrence(schedule, ZonedDateTime.now()) ?: return@forEach
            val delayMs = Duration.between(ZonedDateTime.now(), next).toMillis().coerceAtLeast(1_000L)
            val data = Data.Builder()
                .putString("scheduleId", schedule.id)
                .putLong("triggerEpochMs", next.toInstant().toEpochMilli())
                .build()
            val request = OneTimeWorkRequestBuilder<WifiScheduleWorker>()
                .setInputData(data)
                .setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
                .build()
            wm.enqueueUniqueWork(WORK_PREFIX + schedule.id, ExistingWorkPolicy.REPLACE, request)
        }
    }

    fun cancelAll(context: Context) {
        val wm = WorkManager.getInstance(context.applicationContext)
        readSchedules(context).forEach { wm.cancelUniqueWork(WORK_PREFIX + it.id) }
    }

    @Suppress("DEPRECATION")
    fun execute(context: Context, scheduleId: String, scheduledEpochMs: Long): Result {
        val app = context.applicationContext
        val schedule = readSchedules(app).firstOrNull { it.id == scheduleId }
            ?: return saveResult(app, Result(scheduleId, false, null, "missing", System.currentTimeMillis(), "schedule_missing"))
        val now = System.currentTimeMillis()
        val graceMs = schedule.graceMinutes * 60_000L
        if (scheduledEpochMs <= 0L || now < scheduledEpochMs - 60_000L || now - scheduledEpochMs > graceMs) {
            return saveResult(app, Result(schedule.id, schedule.targetEnabled, currentWifi(app), "skipped_stale", now, "outside_grace_window"))
                .also { reschedule(app) }
        }
        if (!schedule.targetEnabled && criticalSafetyActive(app)) {
            return saveResult(app, Result(schedule.id, false, currentWifi(app), "deferred_safety", now, "SOS_or_HIGH_fall_active"))
                .also { scheduleDeferredRetry(app, schedule, scheduledEpochMs) }
        }

        val dpm = app.getSystemService(DevicePolicyManager::class.java)
        val owner = runCatching { dpm.isDeviceOwnerApp(app.packageName) }.getOrDefault(false)
        if (!owner) {
            return saveResult(app, Result(schedule.id, schedule.targetEnabled, currentWifi(app), "unsupported", now, "Device_Owner_required_on_targetSdk"))
                .also { reschedule(app) }
        }

        val wifi = app.getSystemService(WifiManager::class.java)
        val before = runCatching { wifi.isWifiEnabled }.getOrNull()
        if (before == schedule.targetEnabled) {
            return saveResult(app, Result(schedule.id, schedule.targetEnabled, before, "completed", now, "already_current"))
                .also { reschedule(app) }
        }

        val requested = runCatching { wifi.setWifiEnabled(schedule.targetEnabled) }.getOrDefault(false)
        if (!requested) {
            val result = Result(schedule.id, schedule.targetEnabled, currentWifi(app), "failed", now, "platform_rejected_request")
            saveResult(app, result)
            reschedule(app)
            return result
        }

        val actual = awaitWifiState(wifi, schedule.targetEnabled)
        val matched = actual == schedule.targetEnabled
        val result = Result(
            schedule.id,
            schedule.targetEnabled,
            actual,
            if (matched) "completed" else "failed",
            now,
            if (matched) "device_owner_one_shot_confirmed" else "actual_state_confirmation_timeout"
        )
        saveResult(app, result)
        reschedule(app)
        return result
    }

    @Suppress("DEPRECATION")
    internal fun awaitWifiState(wifi: WifiManager, targetEnabled: Boolean, timeoutMs: Long = VERIFY_TIMEOUT_MS): Boolean? {
        val started = SystemClock.elapsedRealtime()
        var actual: Boolean? = runCatching { wifi.isWifiEnabled }.getOrNull()
        while (actual != targetEnabled && SystemClock.elapsedRealtime() - started < timeoutMs.coerceAtLeast(0L)) {
            try {
                Thread.sleep(VERIFY_POLL_MS)
            } catch (_: InterruptedException) {
                Thread.currentThread().interrupt()
                break
            }
            actual = runCatching { wifi.isWifiEnabled }.getOrNull()
        }
        return actual
    }

    private fun scheduleDeferredRetry(context: Context, schedule: Schedule, originalEpochMs: Long) {
        val request = OneTimeWorkRequestBuilder<WifiScheduleWorker>()
            .setInputData(Data.Builder().putString("scheduleId", schedule.id).putLong("triggerEpochMs", originalEpochMs).build())
            .setInitialDelay(2, TimeUnit.MINUTES)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(WORK_PREFIX + schedule.id, ExistingWorkPolicy.REPLACE, request)
    }

    private fun criticalSafetyActive(context: Context): Boolean =
        SafetyDispatcher.isSosActive(context) || SafetyDispatcher.isHighFallActive(context)

    @Suppress("DEPRECATION")
    private fun currentWifi(context: Context): Boolean? = runCatching {
        context.getSystemService(WifiManager::class.java).isWifiEnabled
    }.getOrNull()

    private fun saveResult(context: Context, result: Result): Result {
        val o = JSONObject()
            .put("scheduleId", result.scheduleId)
            .put("targetEnabled", result.targetEnabled)
            .put("actualEnabled", result.actualEnabled ?: JSONObject.NULL)
            .put("status", result.status)
            .put("attemptedAtMs", result.attemptedAtMs)
            .put("detail", result.detail)
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_LAST_RESULT, o.toString()).commit()
        return result
    }

    private fun nextOccurrence(schedule: Schedule, now: ZonedDateTime): ZonedDateTime? {
        for (offset in 0..7) {
            val day = now.plusDays(offset.toLong())
            val bit = dayBit(day.dayOfWeek)
            if (schedule.daysMask and bit == 0) continue
            val candidate = day.withHour(schedule.localMinuteOfDay / 60).withMinute(schedule.localMinuteOfDay % 60)
                .withSecond(0).withNano(0)
            if (candidate.isAfter(now.plusSeconds(1))) return candidate
        }
        return null
    }

    private fun dayBit(day: DayOfWeek): Int = 1 shl (day.value - 1)
}
