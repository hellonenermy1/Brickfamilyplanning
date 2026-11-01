package com.brick.safety.managed

import android.content.Context

/** Parent-requested Android Location state. ON remains the default so Phase 6 is backward-safe. */
enum class DesiredLocationState { ON, OFF }

data class ParentLocationState(
    val desired: DesiredLocationState,
    val commandId: String?,
    val issuedAtMs: Long
)

/**
 * Durable local copy of the last authenticated parent Location command.
 * Network/authentication code must verify a command before calling [applyVerified].
 */
object ParentLocationStateStore {
    private const val PREFS = "brick_parent_location"
    private const val KEY_DESIRED = "desired"
    private const val KEY_COMMAND_ID = "commandId"
    private const val KEY_ISSUED_AT_MS = "issuedAtMs"
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
            issuedAtMs = prefs.getLong(KEY_ISSUED_AT_MS, 0L).coerceAtLeast(0L)
        )
    }

    /**
     * Stores only a command already authenticated and bound to this device.
     * Duplicate or older commands are harmless no-ops, which makes retries safe.
     */
    fun applyVerified(
        context: Context,
        desired: DesiredLocationState,
        commandId: String,
        issuedAtMs: Long
    ): Boolean {
        require(COMMAND_ID.matches(commandId)) { "Invalid Brick command id" }
        require(issuedAtMs > 0L) { "Invalid Brick command timestamp" }

        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val previousId = prefs.getString(KEY_COMMAND_ID, null)
        val previousIssuedAt = prefs.getLong(KEY_ISSUED_AT_MS, 0L)
        if (previousId == commandId || issuedAtMs <= previousIssuedAt) return false

        return prefs.edit()
            .putString(KEY_DESIRED, desired.name)
            .putString(KEY_COMMAND_ID, commandId)
            .putLong(KEY_ISSUED_AT_MS, issuedAtMs)
            .commit()
    }
}
