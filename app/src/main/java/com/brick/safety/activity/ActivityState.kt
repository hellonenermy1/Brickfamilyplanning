package com.brick.safety.activity

import android.content.Context
import android.os.SystemClock
import com.brick.safety.maintenance.DeprovisionManager

/** Broad transport/activity classes only. Brick never pretends it knows car vs bus vs train here. */
enum class ActivityMode(val code: Int) {
    UNKNOWN(0),
    STATIONARY(1),
    WALKING(2),
    RUNNING(3),
    BICYCLE(4),
    VEHICLE(5);

    companion object {
        fun fromCode(code: Int): ActivityMode = entries.firstOrNull { it.code == code } ?: UNKNOWN
    }
}

data class ActivitySnapshot(
    val mode: ActivityMode,
    val confidence: Int,
    val updatedElapsedMs: Long,
    val modeSinceElapsedMs: Long = 0L
)

object ActivityState {
    private const val PREFS = "brick_activity"

    fun read(context: Context): ActivitySnapshot {
        val app = context.applicationContext
        if (DeprovisionManager.isPostPurge(app)) return ActivitySnapshot(ActivityMode.UNKNOWN, 0, 0L, 0L)
        val p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val updated = p.getLong("updatedElapsedMs", 0L)
        return ActivitySnapshot(
            ActivityMode.fromCode(p.getInt("mode", ActivityMode.UNKNOWN.code)),
            p.getInt("confidence", 0).coerceIn(0, 100),
            updated,
            p.getLong("modeSinceElapsedMs", updated).coerceAtLeast(0L)
        )
    }

    fun write(context: Context, mode: ActivityMode, confidence: Int) {
        val app = context.applicationContext
        if (DeprovisionManager.isPostPurge(app)) return
        val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val now = SystemClock.elapsedRealtime()
        val previousMode = ActivityMode.fromCode(prefs.getInt("mode", ActivityMode.UNKNOWN.code))
        val previousSince = prefs.getLong("modeSinceElapsedMs", 0L)
        val modeSince = if (previousMode == mode && previousSince in 1..now) previousSince else now
        prefs.edit()
            .putInt("mode", mode.code)
            .putInt("confidence", confidence.coerceIn(0, 100))
            .putLong("updatedElapsedMs", now)
            .putLong("modeSinceElapsedMs", modeSince)
            .apply()
    }
}
