package com.brick.safety.reliability

import android.content.Context
import android.os.BatteryManager
import com.brick.safety.data.SafetyOutbox
import com.brick.safety.diagnostics.DiagnosticStore
import com.brick.safety.network.BrickApi
import org.json.JSONObject

object SafetyDispatcher {
    const val PRIORITY_NORMAL = 1
    const val PRIORITY_IMPORTANT = 50
    const val PRIORITY_CRITICAL = 100
    const val PRIORITY_SOS = 200

    @Volatile private var cachedSosActive: Boolean? = null

    private data class Snapshot(
        val latitude: Double?, val longitude: Double?, val accuracyM: Double?, val positionAgeMs: Long?,
        val batteryPct: Int, val charging: Boolean
    )

    private fun noteOutboxUnavailable(context: Context) {
        context.getSharedPreferences("brick", Context.MODE_PRIVATE).edit()
            .putBoolean("safetyOutboxWriteHealthy", false)
            .putLong("lastSafetyOutboxWriteFailureWallMs", System.currentTimeMillis()).apply()
    }

    fun enqueue(context: Context, kind: String, detail: JSONObject = JSONObject(), priority: Int = PRIORITY_NORMAL): String? {
        val sosState = when (kind) {
            "sos_started" -> true
            "sos_cancelled" -> false
            else -> null
        }
        return enqueueInternal(context, kind, detail, priority, sosActiveState = sosState)
    }

    fun enqueueSosTransition(context: Context, active: Boolean, detail: JSONObject = JSONObject()): String? =
        enqueueInternal(
            context,
            if (active) "sos_started" else "sos_cancelled",
            detail,
            PRIORITY_SOS,
            sosActiveState = active
        )

    private fun enqueueInternal(
        context: Context,
        kind: String,
        detail: JSONObject,
        priority: Int,
        sosActiveState: Boolean?
    ): String? {
        val effectivePriority = if (kind == "sos_started" || kind == "sos_cancelled") PRIORITY_SOS else priority
        val brickPrefs = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
        val eventSequence = brickPrefs.getLong("safetySequence", 0L) + 1L
        if (!brickPrefs.edit().putLong("safetySequence", eventSequence).commit()) {
            brickPrefs.edit().putBoolean("safetyOutboxWriteHealthy", false)
                .putLong("lastSafetyOutboxWriteFailureWallMs", System.currentTimeMillis()).apply()
            DiagnosticStore.log(context, DiagnosticStore.Severity.ERROR, "safety", "sequence_persist_failed", "kind=$kind")
            return null
        }

        val snapshot = snapshot(context)
        val enriched = JSONObject(detail.toString())
            .put("batteryPct", snapshot.batteryPct)
            .put("charging", snapshot.charging)
            .put("positionAvailable", snapshot.latitude != null && snapshot.longitude != null)
        if (snapshot.positionAgeMs != null) enriched.put("positionAgeMs", snapshot.positionAgeMs)

        val envelope = BrickApi.createSafetyEnvelope(
            kind,
            eventSequence,
            enriched,
            snapshot.latitude,
            snapshot.longitude,
            snapshot.accuracyM
        )
        val saved = SafetyOutbox(context).use { outbox ->
            if (sosActiveState == null) {
                outbox.append(envelope.eventId, envelope.kind, envelope.payload, effectivePriority)
            } else {
                outbox.appendSosTransition(envelope.eventId, envelope.kind, envelope.payload, effectivePriority, sosActiveState)
            }
        }
        if (!saved) {
            DiagnosticStore.log(
                context,
                DiagnosticStore.Severity.ERROR,
                "safety",
                "outbox_save_failed",
                "kind=$kind priority=$effectivePriority"
            )
            return null
        }
        if (sosActiveState != null) {
            // The transaction above is authoritative. Cache only after it succeeds; this cache dies
            // with the process and is reloaded from SQLite on the next process start.
            cachedSosActive = sosActiveState
            // Compatibility mirror only. SafetyOutbox remains the durability source.
            brickPrefs.edit().putBoolean("sosActive", sosActiveState).commit()
        }
        DiagnosticStore.log(
            context,
            if (effectivePriority >= PRIORITY_CRITICAL) DiagnosticStore.Severity.WARN else DiagnosticStore.Severity.INFO,
            "safety",
            "event_saved",
            "kind=$kind priority=$effectivePriority sequence=$eventSequence positionAvailable=${snapshot.latitude != null && snapshot.longitude != null} positionAgeMs=${snapshot.positionAgeMs ?: -1}"
        )
        runCatching { ServiceControl.ensureTracking(context) }
            .onFailure {
                DiagnosticStore.log(
                    context,
                    DiagnosticStore.Severity.ERROR,
                    "safety",
                    "tracking_wake_failed",
                    "kind=$kind",
                    it
                )
            }
        return envelope.eventId
    }

    fun isSosActive(context: Context): Boolean {
        cachedSosActive?.let { return it }
        val prefs = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
        val legacy = prefs.getBoolean("sosActive", false)
        val active = runCatching { SafetyOutbox(context).use { it.sosActive(legacy) } }.getOrElse {
            noteOutboxUnavailable(context)
            return legacy
        }
        // Do not freeze an uncertain fallback in memory when the outbox already reports unhealthy;
        // repeated reads then get a chance to recover. Healthy reads are cached to keep the 1 Hz
        // location/supervisor paths from opening SQLite on every SOS state check.
        if (prefs.getBoolean("safetyOutboxWriteHealthy", true)) cachedSosActive = active
        return active
    }

    fun restoreSosMirror(context: Context): Boolean {
        cachedSosActive = null
        val active = isSosActive(context)
        context.getSharedPreferences("brick", Context.MODE_PRIVATE).edit().putBoolean("sosActive", active).commit()
        return active
    }

    fun drain(
        context: Context,
        limit: Int = 50,
        minPriority: Int = Int.MIN_VALUE,
        maxPriority: Int = Int.MAX_VALUE
    ): Int {
        val prefs = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
        val deviceId = prefs.getString("deviceId", null) ?: return 0
        val apiBase = prefs.getString("apiBase", null) ?: return 0
        var delivered = 0
        SafetyOutbox(context).use { outbox ->
            val pending = runCatching { outbox.pending(limit, minPriority, maxPriority) }.getOrElse {
                noteOutboxUnavailable(context)
                return 0
            }
            for (event in pending) {
                try {
                    BrickApi.sendSafetyPayload(apiBase, deviceId, event.payload, event.eventId)
                    if (!outbox.ack(event.eventId)) {
                        DiagnosticStore.log(
                            context,
                            DiagnosticStore.Severity.ERROR,
                            "safety",
                            "local_ack_failed",
                            "kind=${event.kind}"
                        )
                        break
                    }
                    delivered++
                    DiagnosticStore.log(
                        context,
                        DiagnosticStore.Severity.INFO,
                        "safety",
                        "event_delivered",
                        "kind=${event.kind}"
                    )
                } catch (t: Exception) {
                    DiagnosticStore.log(
                        context,
                        DiagnosticStore.Severity.WARN,
                        "safety",
                        "delivery_failed",
                        "kind=${event.kind} type=${t.javaClass.simpleName} message=${t.message?.take(500) ?: "none"}",
                        t
                    )
                    break
                }
            }
        }
        return delivered
    }

    fun pendingCount(context: Context): Int =
        runCatching { SafetyOutbox(context).use { it.stats().pendingCount } }
            .getOrElse {
                noteOutboxUnavailable(context)
                1
            }

    fun pendingCriticalCount(context: Context): Int = runCatching {
        SafetyOutbox(context).use { it.pendingCountAtLeast(PRIORITY_CRITICAL) }
    }.getOrElse {
        noteOutboxUnavailable(context)
        1
    }

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
