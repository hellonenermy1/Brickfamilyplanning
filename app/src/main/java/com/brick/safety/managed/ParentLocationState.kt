package com.brick.safety.managed

import android.content.Context
import java.util.UUID

/** Parent-requested Android Location state. ON remains the default so Phase 6 is backward-safe. */
enum class DesiredLocationState { ON, OFF }

data class ParentLocationState(
    val desired: DesiredLocationState,
    val commandId: String?,
    val nonce: String?,
    val issuedAtMs: Long
)

/** Durable local copy of the last authenticated, device-bound parent Location command. */
object ParentLocationStateStore {
    private const val PREFS = "brick_parent_location"
    private const val KEY_DESIRED = "desired"
    private const val KEY_COMMAND_ID = "commandId"
    private const val KEY_NONCE = "nonce"
    private const val KEY_ISSUED_AT_MS = "issuedAtMs"
    private const val MAX_DELIVERY_WINDOW_MS = 10 * 60_000L
    private const val MAX_FUTURE_SKEW_MS = 60_000L
    private val COMMAND_ID = Regex("[A-Za-z0-9._:-]{8,128}")

    fun read(context: Context): ParentLocationState {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val desired = when (prefs.getString(KEY_DESIRED, null)) {
            DesiredLocationState.OFF.name -> DesiredLocationState.OFF
            else -> DesiredLocationState.ON
        }
        return ParentLocationState(
            desired = desired,
            commandId = prefs.getString(KEY_COMMAND_ID, null),
            nonce = prefs.getString(KEY_NONCE, null),
            issuedAtMs = prefs.getLong(KEY_ISSUED_AT_MS, 0L).coerceAtLeast(0L)
        )
    }

    /**
     * Stores only a command already authenticated and bound to this device by the network layer.
     * Duplicate, replayed, stale, future-dated or expired commands are harmless no-ops/rejections.
     * Re-checking the time envelope here is deliberate defense in depth: a future parser/call-site
     * change cannot bypass the durable replay boundary with an impossible command lifetime.
     */
    fun applyVerified(
        context: Context,
        desired: DesiredLocationState,
        commandId: String,
        nonce: String,
        issuedAtMs: Long,
        expiresAtMs: Long,
        nowMs: Long = System.currentTimeMillis()
    ): Boolean {
        require(COMMAND_ID.matches(commandId)) { "Invalid Brick command id" }
        require(runCatching { UUID.fromString(nonce) }.isSuccess) { "Invalid Brick command nonce" }
        require(issuedAtMs > 0L && issuedAtMs <= nowMs + MAX_FUTURE_SKEW_MS) { "Invalid Brick command timestamp" }
        require(expiresAtMs > issuedAtMs) { "Invalid Brick command lifetime" }
        require(expiresAtMs > nowMs && expiresAtMs - nowMs <= MAX_DELIVERY_WINDOW_MS) { "Expired or invalid Brick command" }

        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val previousId = prefs.getString(KEY_COMMAND_ID, null)
        val previousNonce = prefs.getString(KEY_NONCE, null)
        val previousIssuedAt = prefs.getLong(KEY_ISSUED_AT_MS, 0L)
        if (previousId == commandId || previousNonce == nonce || issuedAtMs <= previousIssuedAt) return false

        return prefs.edit()
            .putString(KEY_DESIRED, desired.name)
            .putString(KEY_COMMAND_ID, commandId)
            .putString(KEY_NONCE, nonce)
            .putLong(KEY_ISSUED_AT_MS, issuedAtMs)
            .commit()
    }
}
