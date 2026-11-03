package com.brick.safety.reliability

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Process
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.brick.safety.crypto.DeviceKeys
import com.brick.safety.maintenance.DeepOffManager
import com.brick.safety.maintenance.DeviceRoleStore
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate
import java.time.ZoneId

/**
 * Privacy-minimal screen-time summary: total foreground duration and session count only. Package
 * names and per-app usage never leave the device and are not persisted by Brick.
 */
class ScreenTimeWorker(appContext: Context, params: WorkerParameters) : Worker(appContext, params) {
    override fun doWork(): Result {
        val app = applicationContext
        if (DeepOffManager.isActive(app) || DeviceRoleStore.role(app) != DeviceRoleStore.Role.CHILD) return Result.success()
        if (!usageAccessGranted(app)) {
            app.getSharedPreferences("brick", Context.MODE_PRIVATE).edit().putString("screenTimeCapability", "permission_required").apply()
            return Result.success()
        }
        val prefs = app.getSharedPreferences("brick", Context.MODE_PRIVATE)
        val deviceId = prefs.getString("deviceId", null) ?: return Result.success()
        val apiBase = prefs.getString("apiBase", null) ?: return Result.success()
        return try {
            val summary = summarizeToday(app)
            prefs.edit().putString("screenTimeCapability", "supported").putString("screenTimeLastSummary", summary.toString()).apply()
            send(apiBase, deviceId, summary)
            Result.success()
        } catch (_: Throwable) {
            Result.retry()
        }
    }

    private fun summarizeToday(context: Context): JSONObject {
        val zone = ZoneId.systemDefault()
        val day = LocalDate.now(zone)
        val start = day.atStartOfDay(zone).toInstant().toEpochMilli()
        val end = System.currentTimeMillis()
        val usm = context.getSystemService(UsageStatsManager::class.java)
        val events = usm.queryEvents(start, end)
        val currentStarts = HashMap<String, Long>()
        var total = 0L
        var sessions = 0
        val event = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            val pkg = event.packageName ?: continue
            when (event.eventType) {
                UsageEvents.Event.ACTIVITY_RESUMED,
                UsageEvents.Event.MOVE_TO_FOREGROUND -> {
                    if (!currentStarts.containsKey(pkg)) {
                        currentStarts[pkg] = event.timeStamp.coerceIn(start, end)
                        sessions++
                    }
                }
                UsageEvents.Event.ACTIVITY_PAUSED,
                UsageEvents.Event.MOVE_TO_BACKGROUND -> {
                    val begun = currentStarts.remove(pkg) ?: continue
                    if (event.timeStamp >= begun) total += (event.timeStamp.coerceAtMost(end) - begun).coerceAtLeast(0L)
                }
            }
        }
        for (begun in currentStarts.values) total += (end - begun).coerceAtLeast(0L)
        total = total.coerceIn(0L, end - start)
        return JSONObject()
            .put("protocol", 1)
            .put("localDay", day.toString())
            .put("totalForegroundMs", total)
            .put("sessionCount", sessions.coerceAtLeast(0))
            .put("capturedAtMs", end)
            .put("privacy", "aggregate_only_no_package_names")
    }

    private fun usageAccessGranted(context: Context): Boolean {
        val appOps = context.getSystemService(AppOpsManager::class.java)
        val mode = appOps.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
        return mode == AppOpsManager.MODE_ALLOWED
    }

    private fun send(baseUrl: String, deviceId: String, summary: JSONObject) {
        val base = secureBase(baseUrl)
        val payload = summary.toString().toByteArray(Charsets.UTF_8)
        val c = (URL("$base/api/device/$deviceId/screen-time").openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = false
            requestMethod = "POST"
            connectTimeout = 8_000
            readTimeout = 8_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("X-Brick-Signature", DeviceKeys.sign(payload))
        }
        c.outputStream.use { it.write(payload) }
        val text = (if (c.responseCode in 200..299) c.inputStream else c.errorStream).bufferedReader().use { it.readText() }
        if (c.responseCode !in 200..299 || !JSONObject(text).optBoolean("ok", false)) error("screen time upload failed")
    }

    private fun secureBase(value: String): String {
        val u = URL(value.trim().trimEnd('/'))
        require(u.protocol.equals("https", true) && u.host.isNotBlank() && u.userInfo == null && u.query == null && u.ref == null)
        require(u.path.isNullOrEmpty() || u.path == "/")
        return "https://${u.authority}"
    }
}
