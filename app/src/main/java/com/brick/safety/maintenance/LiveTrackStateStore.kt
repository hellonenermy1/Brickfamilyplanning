package com.brick.safety.maintenance

import android.content.Context
import java.util.UUID

enum class LiveTrackCommandStatus { NONE, COMPLETED, FAILED }

data class LiveTrackState(
    val active: Boolean,
    val activeUntilMs: Long,
    val commandId: String?,
    val issuedAtMs: Long,
    val status: LiveTrackCommandStatus,
    val resultDetail: String?
)

object LiveTrackStateStore {
    private const val PREFS = "brick_live_track_v1"
    private val ID_RE = Regex("[A-Za-z0-9._:-]{8,128}")
    private const val FUTURE_SKEW_MS = 60_000L

    fun read(context: Context, nowMs: Long = System.currentTimeMillis()): LiveTrackState {
        val p = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val until = p.getLong("activeUntilMs", 0L)
        val id = p.getString("commandId", null)
        val status = if (id == null) LiveTrackCommandStatus.NONE else runCatching {
            LiveTrackCommandStatus.valueOf(p.getString("status", LiveTrackCommandStatus.COMPLETED.name) ?: LiveTrackCommandStatus.COMPLETED.name)
        }.getOrDefault(LiveTrackCommandStatus.FAILED)
        return LiveTrackState(
            active = until > nowMs,
            activeUntilMs = until,
            commandId = id,
            issuedAtMs = p.getLong("issuedAtMs", 0L),
            status = status,
            resultDetail = p.getString("resultDetail", null)
        )
    }

    fun applyVerified(
        context: Context,
        commandId: String,
        nonce: String,
        requestedActive: Boolean,
        issuedAtMs: Long,
        expiresAtMs: Long,
        nowMs: Long = System.currentTimeMillis()
    ): Boolean {
        require(ID_RE.matches(commandId))
        require(runCatching { UUID.fromString(nonce) }.isSuccess)
        require(issuedAtMs > 0 && issuedAtMs <= nowMs + FUTURE_SKEW_MS)
        require(expiresAtMs > nowMs && expiresAtMs > issuedAtMs && expiresAtMs - nowMs <= 10 * 60_000L)
        val p = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val priorId = p.getString("commandId", null)
        val priorIssued = p.getLong("issuedAtMs", 0L)
        val priorNonce = p.getString("nonce", null)
        if (priorId == commandId || priorNonce == nonce || issuedAtMs <= priorIssued) return false

        val until = if (requestedActive) expiresAtMs else 0L
        return p.edit()
            .putString("commandId", commandId)
            .putString("nonce", nonce)
            .putLong("issuedAtMs", issuedAtMs)
            .putLong("activeUntilMs", until)
            .putString("status", LiveTrackCommandStatus.COMPLETED.name)
            .putString("resultDetail", if (requestedActive) "fast_mode_active_until_expiry" else "fast_mode_stopped")
            .commit()
    }

    fun clearExpired(context: Context, nowMs: Long = System.currentTimeMillis()) {
        val p = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val until = p.getLong("activeUntilMs", 0L)
        if (until > 0L && until <= nowMs) p.edit().putLong("activeUntilMs", 0L).apply()
    }
}
