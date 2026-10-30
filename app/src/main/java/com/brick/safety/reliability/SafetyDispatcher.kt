package com.brick.safety.reliability

import android.content.Context
import android.os.BatteryManager
import com.brick.safety.data.SafetyOutbox
import com.brick.safety.network.BrickApi
import org.json.JSONObject

object SafetyDispatcher {
    const val PRIORITY_NORMAL = 1
    const val PRIORITY_IMPORTANT = 50
    const val PRIORITY_CRITICAL = 100

    private data class Snapshot(
        val latitude: Double?,
        val longitude: Double?,
        val accuracyM: Double?,
        val positionAgeMs: Long?,
        val batteryPct: Int,
        val charging: Boolean
    )

    fun enqueue(context: Context, kind: String, detail: JSONObject = JSONObject(), priority: Int = PRIORITY_NORMAL): String {
        val snapshot = snapshot(context)
        val enriched = JSONObject(detail.toString())
            .put("batteryPct", snapshot.batteryPct)
            .put("charging", snapshot.charging)
            .put("positionAvailable", snapshot.latitude != null && snapshot.longitude != null)
        if (snapshot.positionAgeMs != null) enriched.put("positionAgeMs", snapshot.positionAgeMs)

        val envelope = BrickApi.createSafetyEnvelope(
            kind = kind,
            detail = enriched,
            latitude = snapshot.latitude,
            longitude = snapshot.longitude,
            accuracyM = snapshot.accuracyM
        )
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

    private fun snapshot(context: Context): Snapshot {
        val battery = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val pct = battery.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY).coerceIn(0, 100)
        val charging = battery.isCharging

        val prefs = context.getSharedPreferences("brick_position", Context.MODE_PRIVATE)
        val wall = prefs.getLong("anchorWallMs", 0L)
        val now = System.currentTimeMillis()
        val age = if (wall > 0L) now - wall else Long.MAX_VALUE
        if (age !in 0..10 * 60_000L) return Snapshot(null, null, null, null, pct, charging)

        val lat = Double.fromBits(prefs.getLong("anchorLatBits", 0L))
        val lon = Double.fromBits(prefs.getLong("anchorLonBits", 0L))
        val accuracy = prefs.getFloat("anchorAccuracyM", Float.NaN).toDouble()
        val valid = lat.isFinite() && lon.isFinite() && lat in -90.0..90.0 && lon in -180.0..180.0
        return if (valid) {
            Snapshot(lat, lon, accuracy.takeIf { it.isFinite() && it >= 0.0 }, age, pct, charging)
        } else {
            Snapshot(null, null, null, null, pct, charging)
        }
    }
}
