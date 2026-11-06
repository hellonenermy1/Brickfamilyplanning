package com.brick.safety.diagnostics

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

class OperationalLogRetentionTest {
    @Test fun singaporeMondayKeepsMondayAndSixPreviousCalendarDays() {
        val now = Instant.parse("2026-11-09T04:00:00Z").toEpochMilli() // Mon 12:00 SGT
        assertEquals(Instant.parse("2026-11-02T16:00:00Z").toEpochMilli(),
            OperationalLogRetention.cutoffMs(now))
    }

    @Test fun singaporeTuesdayAdvancesOneDayNotOneWeek() {
        val now = Instant.parse("2026-11-10T04:00:00Z").toEpochMilli()
        assertEquals(Instant.parse("2026-11-03T16:00:00Z").toEpochMilli(),
            OperationalLogRetention.cutoffMs(now))
    }

    @Test fun monthYearRolloverAndDaylightSaving() {
        val now = Instant.parse("2027-01-02T04:00:00Z").toEpochMilli()
        assertEquals(Instant.parse("2026-12-26T16:00:00Z").toEpochMilli(),
            OperationalLogRetention.cutoffMs(now))
        val ny = Instant.parse("2026-03-09T12:00:00Z").toEpochMilli()
        assertEquals(Instant.parse("2026-03-03T05:00:00Z").toEpochMilli(),
            OperationalLogRetention.cutoffMs(ny, "America/New_York"))
    }

    @Test fun malformedTimezoneDefaultsToSingapore() {
        val now = Instant.parse("2026-11-09T04:00:00Z").toEpochMilli()
        assertEquals(OperationalLogRetention.cutoffMs(now),
            OperationalLogRetention.cutoffMs(now, "invalid-timezone"))
    }
}
