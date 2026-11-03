package com.brick.safety.managed

import android.content.Context
import java.util.UUID

/** Target carried by one authenticated parent command. It is history after completion, not policy. */
enum class DesiredLocationState { ON, OFF }
enum class LocationCommandStatus { NONE, PENDING, IN_PROGRESS, COMPLETED, FAILED }

data class ParentLocationState(
    val target: DesiredLocationState?,
    val commandId: String?,
    val nonce: String?,
    val issuedAtMs: Long,
    val status: LocationCommandStatus,
    val completedAtMs: Long,
    val actualAfter: Boolean?,
    val resultDetail: String?
) {
    val pending: Boolean get() = status == LocationCommandStatus.PENDING
    val actionable: Boolean get() = status == LocationCommandStatus.PENDING
}

/** Durable local history of the last authenticated, device-bound one-shot Location command. */
object ParentLocationStateStore {
    private const val PREFS = "brick_parent_location"
    private const val KEY_TARGET = "target"
    private const val LEGACY_KEY_DESIRED = "desired"
    private const val KEY_COMMAND_ID = "commandId"
    private const val KEY_NONCE = "nonce"
    private const val KEY_ISSUED_AT_MS = "issuedAtMs"
    private const val KEY_STATUS = "status"
    private const val KEY_COMPLETED_AT_MS = "completedAtMs"
    private const val KEY_ACTUAL_AFTER = "actualAfter"
    private const val KEY_RESULT_DETAIL = "resultDetail"
    private const val MAX_DELIVERY_WINDOW_MS = 10 * 60_000L
    private const val MAX_FUTURE_SKEW_MS = 60_000L
    private val COMMAND_ID = Regex("[A-Za-z0-9._:-]{8,128}")

    fun read(context: Context): ParentLocationState {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val commandId = prefs.getString(KEY_COMMAND_ID, null)
        val targetName = prefs.getString(KEY_TARGET, null) ?: prefs.getString(LEGACY_KEY_DESIRED, null)
        val target = when (targetName) {
            DesiredLocationState.ON.name -> DesiredLocationState.ON
            DesiredLocationState.OFF.name -> DesiredLocationState.OFF
            else -> null
        }
        val status = if (commandId == null) LocationCommandStatus.NONE else {
            runCatching { LocationCommandStatus.valueOf(prefs.getString(KEY_STATUS, null) ?: LocationCommandStatus.COMPLETED.name) }
                .getOrDefault(LocationCommandStatus.FAILED)
        }
        return ParentLocationState(
            target = target,
            commandId = commandId,
            nonce = prefs.getString(KEY_NONCE, null),
            issuedAtMs = prefs.getLong(KEY_ISSUED_AT_MS, 0L).coerceAtLeast(0L),
            status = status,
            completedAtMs = prefs.getLong(KEY_COMPLETED_AT_MS, 0L).coerceAtLeast(0L),
            actualAfter = if (prefs.contains(KEY_ACTUAL_AFTER)) prefs.getBoolean(KEY_ACTUAL_AFTER, false) else null,
            resultDetail = prefs.getString(KEY_RESULT_DETAIL, null)
        )
    }

    /**
     * Stores only a command already authenticated and bound to this device by the network layer.
     * A newer command becomes PENDING. A completed command remains history and is never interpreted
     * as a persistent desired Location state.
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
            .putString(KEY_TARGET, desired.name)
            .remove(LEGACY_KEY_DESIRED)
            .putString(KEY_COMMAND_ID, commandId)
            .putString(KEY_NONCE, nonce)
            .putLong(KEY_ISSUED_AT_MS, issuedAtMs)
            .putString(KEY_STATUS, LocationCommandStatus.PENDING.name)
            .remove(KEY_COMPLETED_AT_MS)
            .remove(KEY_ACTUAL_AFTER)
            .remove(KEY_RESULT_DETAIL)
            .commit()
    }

    /** Claim before touching Android state so a crash cannot replay the same command forever. */
    fun claimPending(context: Context, commandId: String): Boolean {
        val state = read(context)
        if (state.commandId != commandId || state.status != LocationCommandStatus.PENDING) return false
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_STATUS, LocationCommandStatus.IN_PROGRESS.name)
            .commit()
    }

    fun complete(context: Context, commandId: String, actualAfter: Boolean?, matched: Boolean, detail: String?): Boolean {
        val state = read(context)
        if (state.commandId != commandId || state.status != LocationCommandStatus.IN_PROGRESS) return false
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_STATUS, if (matched) LocationCommandStatus.COMPLETED.name else LocationCommandStatus.FAILED.name)
            .putLong(KEY_COMPLETED_AT_MS, System.currentTimeMillis())
            .apply {
                if (actualAfter == null) remove(KEY_ACTUAL_AFTER) else putBoolean(KEY_ACTUAL_AFTER, actualAfter)
                if (detail.isNullOrBlank()) remove(KEY_RESULT_DETAIL) else putString(KEY_RESULT_DETAIL, detail.take(120))
            }
            .commit()
    }

    /**
     * Upgrade safety: an old command with no lifecycle status is history, not a newly actionable
     * command. This explicitly prevents Phase 7/old Phase 8 desired-state records from reviving.
     */
    fun migrateLegacyToHistory(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (prefs.getString(KEY_COMMAND_ID, null) == null || prefs.contains(KEY_STATUS)) return
        prefs.edit()
            .putString(KEY_STATUS, LocationCommandStatus.COMPLETED.name)
            .putLong(KEY_COMPLETED_AT_MS, System.currentTimeMillis())
            .commit()
    }
}
