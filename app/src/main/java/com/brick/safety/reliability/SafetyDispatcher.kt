package com.brick.safety.reliability

import android.content.Context
import com.brick.safety.data.SafetyOutbox
import com.brick.safety.network.BrickApi
import org.json.JSONObject

object SafetyDispatcher {
    const val PRIORITY_NORMAL = 1
    const val PRIORITY_CRITICAL = 100

    fun enqueue(context: Context, kind: String, detail: JSONObject = JSONObject(), priority: Int = PRIORITY_NORMAL): String {
        val envelope = BrickApi.createSafetyEnvelope(kind, detail)
        SafetyOutbox(context).use { outbox ->
            outbox.append(envelope.eventId, envelope.kind, envelope.payload, priority)
        }
        ServiceControl.ensureTracking(context)
        return envelope.eventId
    }

    fun drain(context: Context, limit: Int = 50): Int {
        val prefs = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
        val deviceId = prefs.getString("deviceId", null) ?: return 0
        val apiBase = prefs.getString("apiBase", null) ?: return 0
        var delivered = 0
        SafetyOutbox(context).use { outbox ->
            for (event in outbox.pending(limit)) {
                try {
                    BrickApi.sendSafetyPayload(apiBase, deviceId, event.payload, event.eventId)
                    outbox.ack(event.eventId)
                    delivered++
                } catch (_: Exception) {
                    break
                }
            }
        }
        return delivered
    }

    fun pendingCount(context: Context): Int = SafetyOutbox(context).use { it.stats().pendingCount }
}
