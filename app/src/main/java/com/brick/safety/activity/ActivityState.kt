package com.brick.safety.activity

import android.content.Context
import android.os.SystemClock

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
    val updatedElapsedMs: Long
)

object ActivityState {
    private const val PREFS = "brick_activity"

    fun read(context: Context): ActivitySnapshot {
        val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return ActivitySnapshot(
            ActivityMode.fromCode(p.getInt("mode", ActivityMode.UNKNOWN.code)),
            p.getInt("confidence", 0).coerceIn(0, 100),
            p.getLong("updatedElapsedMs", 0L)
        )
    }

    fun write(context: Context, mode: ActivityMode, confidence: Int) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putInt("mode", mode.code)
            .putInt("confidence", confidence.coerceIn(0, 100))
            .putLong("updatedElapsedMs", SystemClock.elapsedRealtime())
            .apply()
    }
}
