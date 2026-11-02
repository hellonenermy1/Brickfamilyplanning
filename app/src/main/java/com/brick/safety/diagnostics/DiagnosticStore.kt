package com.brick.safety.diagnostics

import android.Manifest
import android.app.ActivityManager
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.brick.safety.activity.ActivityState
import com.brick.safety.data.CrashOutbox
import com.brick.safety.data.Journal
import com.brick.safety.location.BrickLocationService
import com.brick.safety.managed.ParentLocationStateStore
import com.brick.safety.privileged.PrivilegedBridgeRuntime
import com.brick.safety.reliability.SafetyDispatcher
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger

object DiagnosticStore {
    enum class Severity { INFO, WARN, ERROR }

    data class Event(
        val id: Long,
        val wallMs: Long,
        val elapsedMs: Long,
        val sessionId: String?,
        val severity: Severity,
        val component: String,
        val event: String,
        val detail: String,
        val error: String?
    )

    private const val DB_NAME = "brick_diagnostics.db"
    private const val DB_VERSION = 1
    private const val PREFS = "brick_diagnostics"
    private const val MAX_EVENTS = 12_000
    private const val NORMAL_RETENTION_MS = 48L * 60L * 60L * 1_000L
    private const val ERROR_RETENTION_MS = 7L * 24L * 60L * 60L * 1_000L
    private const val MAX_DETAIL = 4_000
    private const val MAX_ERROR = 16_000

    @Volatile private var initialized = false
    private lateinit var appContext: Context
    private lateinit var helper: Db
    private val writes = AtomicInteger(0)
    private val lock = Any()

    fun init(context: Context) {
        if (initialized) return
        synchronized(lock) {
            if (initialized) return
            appContext = context.applicationContext
            helper = Db(appContext)
            helper.setWriteAheadLoggingEnabled(true)
            helper.writableDatabase
            initialized = true
            val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            prefs.edit()
                .putLong("processStartWallMs", System.currentTimeMillis())
                .putLong("processStartElapsedMs", SystemClock.elapsedRealtime())
                .apply()
            prune()
        }
    }

    fun log(
        severity: Severity,
        component: String,
        event: String,
        detail: String = "",
        error: Throwable? = null
    ) {
        if (!initialized) return
        runCatching {
            synchronized(lock) {
                val values = ContentValues().apply {
                    put("wall_ms", System.currentTimeMillis())
                    put("elapsed_ms", SystemClock.elapsedRealtime())
                    put("session_id", activeSessionId())
                    put("severity", severity.name)
                    put("component", component.take(80))
                    put("event", event.take(120))
                    put("detail", detail.take(MAX_DETAIL))
                    put("error", error?.stackTraceToString()?.take(MAX_ERROR))
                }
                helper.writableDatabase.insertOrThrow("events", null, values)
                if (writes.incrementAndGet() % 100 == 0) pruneLocked()
            }
        }
    }

    fun log(
        context: Context,
        severity: Severity,
        component: String,
        event: String,
        detail: String = "",
        error: Throwable? = null
    ) {
        if (!initialized) init(context)
        log(severity, component, event, detail, error)
    }

    fun startSession(context: Context): String {
        if (!initialized) init(context)
        val stamp = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())
        val id = "OPPO-$stamp-${UUID.randomUUID().toString().take(4).uppercase(Locale.US)}"
        val now = System.currentTimeMillis()
        synchronized(lock) {
            val v = ContentValues().apply {
                put("id", id)
                put("started_wall_ms", now)
                putNull("ended_wall_ms")
            }
            helper.writableDatabase.insertWithOnConflict("sessions", null, v, SQLiteDatabase.CONFLICT_REPLACE)
            appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("activeSessionId", id).commit()
        }
        log(Severity.INFO, "session", "test_session_started", id)
        return id
    }

    fun endSession(context: Context): String? {
        if (!initialized) init(context)
        val id = activeSessionId() ?: return null
        log(Severity.INFO, "session", "test_session_ended", id)
        synchronized(lock) {
            val v = ContentValues().apply { put("ended_wall_ms", System.currentTimeMillis()) }
            helper.writableDatabase.update("sessions", v, "id=?", arrayOf(id))
            appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove("activeSessionId").commit()
        }
        return id
    }

    fun activeSessionId(): String? {
        if (!initialized) return null
        return appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("activeSessionId", null)
    }

    fun addMarker(context: Context): Int {
        if (!initialized) init(context)
        val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val n = prefs.getInt("markerNumber", 0) + 1
        prefs.edit().putInt("markerNumber", n).apply()
        log(Severity.INFO, "tester", "manual_marker", "marker=$n")
        return n
    }

    fun latestError(context: Context): Event? {
        if (!initialized) init(context)
        synchronized(lock) {
            helper.readableDatabase.query(
                "events",
                COLUMNS,
                "severity=?",
                arrayOf(Severity.ERROR.name),
                null,
                null,
                "id DESC",
                "1"
            ).use { c ->
                return if (c.moveToFirst()) readEvent(c) else null
            }
        }
    }

    fun recentEvents(context: Context, limit: Int = 1_000): List<Event> {
        if (!initialized) init(context)
        val safeLimit = limit.coerceIn(1, 5_000)
        synchronized(lock) {
            val out = ArrayList<Event>(safeLimit)
            helper.readableDatabase.query(
                "events",
                COLUMNS,
                null,
                null,
                null,
                null,
                "id DESC",
                safeLimit.toString()
            ).use { c -> while (c.moveToNext()) out += readEvent(c) }
            out.reverse()
            return out
        }
    }

    fun summary(context: Context): String = buildReport(context, eventLimit = 80, compact = true)

    fun fullReport(context: Context): String = buildReport(context, eventLimit = 2_000, compact = false)

    private fun buildReport(context: Context, eventLimit: Int, compact: Boolean): String {
        if (!initialized) init(context)
        val app = context.applicationContext
        val now = System.currentTimeMillis()
        val brick = app.getSharedPreferences("brick", Context.MODE_PRIVATE)
        val diag = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val position = app.getSharedPreferences("brick_position", Context.MODE_PRIVATE)
        val activity = ActivityState.read(app)
        val battery = app.getSystemService(BatteryManager::class.java)
        val power = app.getSystemService(PowerManager::class.java)
        val am = app.getSystemService(ActivityManager::class.java)
        val locationManager = app.getSystemService(LocationManager::class.java)
        val connectivity = app.getSystemService(ConnectivityManager::class.java)
        val activeNetwork = connectivity.activeNetwork
        val caps = activeNetwork?.let { connectivity.getNetworkCapabilities(it) }
        val network = when {
            caps == null -> "offline"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "mobile"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) -> "other"
            else -> "offline"
        }
        val validated = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true
        val batteryPct = battery.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY).coerceIn(0, 100)
        val paired = brick.contains("deviceId")
        val positionWall = position.getLong("anchorWallMs", 0L)
        val positionAge = if (positionWall > 0L && now >= positionWall) now - positionWall else null
        val accuracy = position.getFloat("anchorAccuracyM", Float.NaN).takeIf { it.isFinite() && it >= 0f }
        val speedKmh = position.getFloat("anchorSpeedMps", Float.NaN).takeIf { it.isFinite() && it >= 0f }?.times(3.6f)
        val phase3Uncertainty = brick.getFloat("phase3UncertaintyM", Float.NaN).takeIf { it.isFinite() && it >= 0f }
        val privileged = runCatching { PrivilegedBridgeRuntime.current().health() }.getOrNull()
        val locationState = runCatching { ParentLocationStateStore.read(app) }.getOrNull()

        val journalStats = runCatching {
            Journal(app).use { it.stats() }
        }.getOrNull()
        val crashPending = runCatching {
            CrashOutbox(app).use { it.pendingCount() }
        }.getOrDefault(-1)
        val safetyPending = runCatching { SafetyDispatcher.pendingCount(app) }.getOrDefault(-1)

        @Suppress("DEPRECATION")
        val serviceRunning = runCatching {
            am.getRunningServices(100).any { it.service.className == BrickLocationService::class.java.name }
        }.getOrDefault(false)

        @Suppress("DEPRECATION")
        val versionName = runCatching { app.packageManager.getPackageInfo(app.packageName, 0).versionName }.getOrNull() ?: "unknown"
        @Suppress("DEPRECATION")
        val versionCode = runCatching { app.packageManager.getPackageInfo(app.packageName, 0).longVersionCode }.getOrDefault(-1L)

        fun granted(permission: String): Boolean = ContextCompat.checkSelfPermission(app, permission) == PackageManager.PERMISSION_GRANTED
        fun age(wall: Long): String = if (wall <= 0L || now < wall) "never" else formatDuration(now - wall)

        val sb = StringBuilder(32_768)
        sb.appendLine("BRICK PHASE 6C BETA DIAGNOSTIC REPORT")
        sb.appendLine("Generated: ${formatWall(now)}")
        sb.appendLine("Session: ${activeSessionId() ?: "none"}")
        sb.appendLine("App: $versionName ($versionCode)")
        sb.appendLine("Device: ${Build.MANUFACTURER} ${Build.MODEL}")
        sb.appendLine("Android: ${Build.VERSION.RELEASE} / SDK ${Build.VERSION.SDK_INT}")
        sb.appendLine("Process uptime: ${formatDuration(SystemClock.elapsedRealtime() - diag.getLong("processStartElapsedMs", SystemClock.elapsedRealtime()))}")
        sb.appendLine()
        sb.appendLine("DEVICE HEALTH")
        sb.appendLine("paired=$paired serviceRunning=$serviceRunning sosActive=${brick.getBoolean("sosActive", false)}")
        sb.appendLine("network=$network validated=$validated dataSaverRestricted=${connectivity.restrictBackgroundStatus == ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED}")
        sb.appendLine("battery=${batteryPct}% charging=${battery.isCharging} powerSave=${power.isPowerSaveMode} doze=${power.isDeviceIdleMode}")
        sb.appendLine("batteryOptimizationExempt=${power.isIgnoringBatteryOptimizations(app.packageName)} backgroundRestricted=${am.isBackgroundRestricted}")
        sb.appendLine("notificationsEnabled=${NotificationManagerCompat.from(app).areNotificationsEnabled()}")
        sb.appendLine("locationEnabled=${runCatching { locationManager.isLocationEnabled }.getOrDefault(false)} desired=${locationState?.desired?.name ?: "unknown"}")
        sb.appendLine("fineLocation=${granted(Manifest.permission.ACCESS_FINE_LOCATION)} backgroundLocation=${Build.VERSION.SDK_INT < 29 || granted(Manifest.permission.ACCESS_BACKGROUND_LOCATION)}")
        sb.appendLine("activityRecognition=${Build.VERSION.SDK_INT < 29 || granted(Manifest.permission.ACTIVITY_RECOGNITION)} bluetoothScan=${Build.VERSION.SDK_INT < 31 || granted(Manifest.permission.BLUETOOTH_SCAN)} nearbyWifi=${Build.VERSION.SDK_INT < 33 || granted(Manifest.permission.NEARBY_WIFI_DEVICES)}")
        sb.appendLine("notificationPermission=${Build.VERSION.SDK_INT < 33 || granted(Manifest.permission.POST_NOTIFICATIONS)}")
        sb.appendLine("journalPending=${journalStats?.pendingCount ?: -1} journalOldestAge=${journalStats?.oldestPendingMs?.let { if (now >= it) formatDuration(now - it) else "clock-skew" } ?: "none"}")
        sb.appendLine("safetyPending=$safetyPending crashPending=$crashPending recoveryCount=${brick.getInt("recoveryCount", 0)} lastRecovery=${age(brick.getLong("lastSelfRecoveryWallMs", 0L))}")
        sb.appendLine("journalWriteHealthy=${brick.getBoolean("journalWriteHealthy", true)} safetyOutboxWriteHealthy=${brick.getBoolean("safetyOutboxWriteHealthy", true)}")
        sb.appendLine("shizukuAvailable=${privileged?.available ?: false} connected=${privileged?.connected ?: false} permission=${privileged?.permissionGranted ?: false} lastError=${privileged?.lastError ?: "none"}")
        sb.appendLine()
        sb.appendLine("POSITION / ACTIVITY")
        sb.appendLine("trustedFixAge=${positionAge?.let(::formatDuration) ?: "none"} accuracy=${accuracy?.let { "%.1fm".format(Locale.US, it) } ?: "unknown"} speed=${speedKmh?.let { "%.1fkm/h".format(Locale.US, it) } ?: "unknown"}")
        sb.appendLine("activity=${activity.mode.name.lowercase(Locale.US)} confidence=${activity.confidence}% activityAge=${if (activity.updatedElapsedMs > 0L && SystemClock.elapsedRealtime() >= activity.updatedElapsedMs) formatDuration(SystemClock.elapsedRealtime() - activity.updatedElapsedMs) else "unknown"}")
        sb.appendLine("phase3Uncertainty=${phase3Uncertainty?.let { "%.1fm".format(Locale.US, it) } ?: "unknown"} routeConstrained=${if (brick.contains("phase3RouteConstrained")) brick.getBoolean("phase3RouteConstrained", false) else "unknown"}")
        sb.appendLine("consistencyRejects=${brick.getLong("phase3ConsistencyRejectTotal", 0L)} lastRejectReason=${brick.getString("lastPhase3ConsistencyRejectReason", "none")}")

        val latest = latestError(app)
        if (latest != null) {
            sb.appendLine()
            sb.appendLine("LAST ERROR")
            appendEvent(sb, latest, includeStack = true)
        }

        if (!compact) {
            sb.appendLine()
            sb.appendLine("EVENT LOG (oldest to newest; no coordinates are stored here)")
            recentEvents(app, eventLimit).forEach { appendEvent(sb, it, includeStack = true) }
        } else {
            sb.appendLine()
            sb.appendLine("RECENT EVENTS")
            recentEvents(app, eventLimit).takeLast(20).forEach { appendEvent(sb, it, includeStack = false) }
        }
        return sb.toString()
    }

    private fun appendEvent(sb: StringBuilder, e: Event, includeStack: Boolean) {
        sb.append('[').append(formatWall(e.wallMs)).append("] ")
            .append(e.severity.name).append(' ')
            .append(e.component).append('/').append(e.event)
        if (!e.sessionId.isNullOrBlank()) sb.append(" session=").append(e.sessionId)
        if (e.detail.isNotBlank()) sb.append(" :: ").append(e.detail.replace('\n', ' '))
        sb.appendLine()
        if (includeStack && !e.error.isNullOrBlank()) {
            sb.appendLine(e.error)
        }
    }

    private fun readEvent(c: android.database.Cursor): Event = Event(
        id = c.getLong(0),
        wallMs = c.getLong(1),
        elapsedMs = c.getLong(2),
        sessionId = c.getString(3),
        severity = runCatching { Severity.valueOf(c.getString(4)) }.getOrDefault(Severity.INFO),
        component = c.getString(5),
        event = c.getString(6),
        detail = c.getString(7) ?: "",
        error = c.getString(8)
    )

    private fun prune() = synchronized(lock) { pruneLocked() }

    private fun pruneLocked() {
        val now = System.currentTimeMillis()
        val db = helper.writableDatabase
        db.delete("events", "severity<>? AND wall_ms<?", arrayOf(Severity.ERROR.name, (now - NORMAL_RETENTION_MS).toString()))
        db.delete("events", "severity=? AND wall_ms<?", arrayOf(Severity.ERROR.name, (now - ERROR_RETENTION_MS).toString()))
        db.execSQL("DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY id DESC LIMIT $MAX_EVENTS)")
    }

    private fun formatWall(ms: Long): String = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US).format(Date(ms))

    private fun formatDuration(ms: Long): String {
        val safe = ms.coerceAtLeast(0L)
        val seconds = safe / 1_000L
        val h = seconds / 3_600L
        val m = (seconds % 3_600L) / 60L
        val s = seconds % 60L
        return if (h > 0) "${h}h${m}m${s}s" else if (m > 0) "${m}m${s}s" else "${s}s"
    }

    private class Db(context: Context) : SQLiteOpenHelper(context, DB_NAME, null, DB_VERSION) {
        override fun onConfigure(db: SQLiteDatabase) {
            super.onConfigure(db)
            db.setForeignKeyConstraintsEnabled(false)
        }

        override fun onCreate(db: SQLiteDatabase) {
            db.execSQL(
                """
                CREATE TABLE events(
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    wall_ms INTEGER NOT NULL,
                    elapsed_ms INTEGER NOT NULL,
                    session_id TEXT,
                    severity TEXT NOT NULL,
                    component TEXT NOT NULL,
                    event TEXT NOT NULL,
                    detail TEXT NOT NULL,
                    error TEXT
                )
                """.trimIndent()
            )
            db.execSQL("CREATE INDEX idx_events_wall ON events(wall_ms)")
            db.execSQL("CREATE INDEX idx_events_severity ON events(severity)")
            db.execSQL(
                """
                CREATE TABLE sessions(
                    id TEXT PRIMARY KEY,
                    started_wall_ms INTEGER NOT NULL,
                    ended_wall_ms INTEGER
                )
                """.trimIndent()
            )
        }

        override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit
    }

    private val COLUMNS = arrayOf(
        "id", "wall_ms", "elapsed_ms", "session_id", "severity", "component", "event", "detail", "error"
    )
}
