package com.brick.safety.diagnostics

import java.time.Instant
import java.time.ZoneId

/** Routine diagnostic logs only: current local calendar day plus six previous days (#39). */
internal object OperationalLogRetention {
    private val defaultZone = ZoneId.of("Asia/Singapore")

    fun cutoffMs(nowUtcMs: Long, timezoneId: String = "Asia/Singapore"): Long {
        val zone = runCatching { ZoneId.of(timezoneId) }.getOrDefault(defaultZone)
        return Instant.ofEpochMilli(nowUtcMs)
            .atZone(zone)
            .toLocalDate()
            .minusDays(6)
            .atStartOfDay(zone)
            .toInstant()
            .toEpochMilli()
    }

    fun localDay(nowUtcMs: Long, timezoneId: String = "Asia/Singapore"): String {
        val zone = runCatching { ZoneId.of(timezoneId) }.getOrDefault(defaultZone)
        return Instant.ofEpochMilli(nowUtcMs).atZone(zone).toLocalDate().toString()
    }
}
