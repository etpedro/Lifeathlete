package app.lifeathlete.android

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DailyMathTest {

    private val lisbon: ZoneId = ZoneId.of("Europe/Lisbon")

    /** Local wall-clock time in Lisbon as an Instant. */
    private fun at(year: Int, month: Int, day: Int, hour: Int, minute: Int): Instant =
        LocalDateTime.of(year, month, day, hour, minute).atZone(lisbon).toInstant()

    private fun session(start: Instant, end: Instant, awakeSeconds: Long = 0L): SleepSessionData =
        SleepSessionData(start, end, awakeSeconds)

    private fun hoursOn(result: Map<LocalDate, Double>, date: LocalDate): Double =
        result[date] ?: throw AssertionError("no sleep on $date in $result")

    // --- sleepHoursByEndDate ---

    @Test
    fun nightSessionIsAttributedToTheDateItEnds() {
        // 23:30 -> 06:45 = 7 h 15 min = 7.25 h, all on the end date (15 Jan).
        val result = DailyMath.sleepHoursByEndDate(
            listOf(session(at(2026, 1, 14, 23, 30), at(2026, 1, 15, 6, 45))),
            lisbon,
        )
        assertEquals(setOf(LocalDate.of(2026, 1, 15)), result.keys)
        assertEquals(7.25, hoursOn(result, LocalDate.of(2026, 1, 15)), 1e-9)
    }

    @Test
    fun awakeTimeIsSubtracted() {
        val start = at(2026, 1, 14, 23, 30)
        val end = at(2026, 1, 15, 6, 45)
        val halfHourAwake = DailyMath.sleepHoursByEndDate(listOf(session(start, end, 30L * 60L)), lisbon)
        assertEquals(6.75, hoursOn(halfHourAwake, LocalDate.of(2026, 1, 15)), 1e-9)
        val hourAwake = DailyMath.sleepHoursByEndDate(listOf(session(start, end, 60L * 60L)), lisbon)
        assertEquals(6.25, hoursOn(hourAwake, LocalDate.of(2026, 1, 15)), 1e-9)
    }

    @Test
    fun sessionsEndingTheSameDayAreSummedAndOtherDaysKeptApart() {
        val result = DailyMath.sleepHoursByEndDate(
            listOf(
                session(at(2026, 1, 14, 23, 30), at(2026, 1, 15, 6, 45)), // 7.25 h -> 15 Jan
                session(at(2026, 1, 15, 14, 0), at(2026, 1, 15, 15, 30)), // nap 1.5 h -> 15 Jan
                session(at(2026, 1, 15, 23, 0), at(2026, 1, 16, 7, 0)), // 8 h -> 16 Jan
            ),
            lisbon,
        )
        assertEquals(setOf(LocalDate.of(2026, 1, 15), LocalDate.of(2026, 1, 16)), result.keys)
        assertEquals(8.75, hoursOn(result, LocalDate.of(2026, 1, 15)), 1e-9)
        assertEquals(8.0, hoursOn(result, LocalDate.of(2026, 1, 16)), 1e-9)
    }

    @Test
    fun sessionEndingExactlyAtMidnightBelongsToTheNewDate() {
        val result = DailyMath.sleepHoursByEndDate(
            listOf(session(at(2026, 1, 15, 22, 0), at(2026, 1, 16, 0, 0))),
            lisbon,
        )
        assertEquals(setOf(LocalDate.of(2026, 1, 16)), result.keys)
        assertEquals(2.0, hoursOn(result, LocalDate.of(2026, 1, 16)), 1e-9)
    }

    @Test
    fun springForwardNightUsesTheRealClock() {
        // Lisbon, Sunday 29 Mar 2026: 01:00 WET -> 02:00 WEST. 23:00 -> 07:00 local is 7 real hours.
        val result = DailyMath.sleepHoursByEndDate(
            listOf(session(at(2026, 3, 28, 23, 0), at(2026, 3, 29, 7, 0))),
            lisbon,
        )
        assertEquals(setOf(LocalDate.of(2026, 3, 29)), result.keys)
        assertEquals(7.0, hoursOn(result, LocalDate.of(2026, 3, 29)), 1e-9)
    }

    @Test
    fun fallBackNightUsesTheRealClock() {
        // Lisbon, Sunday 25 Oct 2026: 02:00 WEST -> 01:00 WET. 23:00 -> 07:00 local is 9 real hours.
        val result = DailyMath.sleepHoursByEndDate(
            listOf(session(at(2026, 10, 24, 23, 0), at(2026, 10, 25, 7, 0))),
            lisbon,
        )
        assertEquals(setOf(LocalDate.of(2026, 10, 25)), result.keys)
        assertEquals(9.0, hoursOn(result, LocalDate.of(2026, 10, 25)), 1e-9)
    }

    @Test
    fun endDateIsTheLocalDateOfTheZoneNotUtc() {
        // 29 Mar 2026 23:30Z is 30 Mar 00:30 in Lisbon (WEST, UTC+1): 7.5 h on 30 Mar.
        val result = DailyMath.sleepHoursByEndDate(
            listOf(session(Instant.parse("2026-03-29T16:00:00Z"), Instant.parse("2026-03-29T23:30:00Z"))),
            lisbon,
        )
        assertEquals(setOf(LocalDate.of(2026, 3, 30)), result.keys)
        assertEquals(7.5, hoursOn(result, LocalDate.of(2026, 3, 30)), 1e-9)
    }

    @Test
    fun hoursAreRoundedToTwoDecimals() {
        // 23:00 -> 06:20 = 7 h 20 min = 7.333... h -> 7.33
        val result = DailyMath.sleepHoursByEndDate(
            listOf(session(at(2026, 1, 14, 23, 0), at(2026, 1, 15, 6, 20))),
            lisbon,
        )
        assertEquals(7.33, hoursOn(result, LocalDate.of(2026, 1, 15)), 1e-9)
    }

    @Test
    fun zeroNegativeAndAllAwakeSessionsAreIgnored() {
        val t = at(2026, 1, 15, 6, 0)
        val result = DailyMath.sleepHoursByEndDate(
            listOf(
                session(t, t), // zero length
                session(t, at(2026, 1, 15, 5, 0)), // end before start
                session(at(2026, 1, 15, 5, 0), t, 60L * 60L), // awake == length
                session(at(2026, 1, 15, 5, 0), t, 2 * 60L * 60L), // awake > length
            ),
            lisbon,
        )
        assertTrue(result.isEmpty())
    }

    @Test
    fun noSessionsGiveNoDays() {
        assertTrue(DailyMath.sleepHoursByEndDate(emptyList(), lisbon).isEmpty())
    }

    // --- roundMinutes ---

    @Test
    fun roundMinutesRoundsToTheNearestMinute() {
        assertEquals(1, DailyMath.roundMinutes(89))
        assertEquals(2, DailyMath.roundMinutes(90))
        assertEquals(0, DailyMath.roundMinutes(0))
        assertEquals(0, DailyMath.roundMinutes(29))
        assertEquals(1, DailyMath.roundMinutes(30))
        assertEquals(60, DailyMath.roundMinutes(3600))
        assertEquals(0, DailyMath.roundMinutes(-120))
    }

    // --- overlapSeconds ---

    @Test
    fun overlapSecondsClipsSessionsToTheDay() {
        val dayStart = at(2026, 1, 15, 0, 0)
        val dayEnd = at(2026, 1, 16, 0, 0)
        // fully inside: 10:00 -> 10:20 = 1200 s
        assertEquals(1200L, DailyMath.overlapSeconds(at(2026, 1, 15, 10, 0), at(2026, 1, 15, 10, 20), dayStart, dayEnd))
        // crosses the start: 14 Jan 23:50 -> 15 Jan 00:10 = 600 s on 15 Jan
        assertEquals(600L, DailyMath.overlapSeconds(at(2026, 1, 14, 23, 50), at(2026, 1, 15, 0, 10), dayStart, dayEnd))
        // crosses the end: 15 Jan 23:45 -> 16 Jan 00:15 = 900 s on 15 Jan
        assertEquals(900L, DailyMath.overlapSeconds(at(2026, 1, 15, 23, 45), at(2026, 1, 16, 0, 15), dayStart, dayEnd))
        // outside, touching the end, and reversed: 0
        assertEquals(0L, DailyMath.overlapSeconds(at(2026, 1, 16, 8, 0), at(2026, 1, 16, 8, 30), dayStart, dayEnd))
        assertEquals(0L, DailyMath.overlapSeconds(at(2026, 1, 16, 0, 0), at(2026, 1, 16, 0, 30), dayStart, dayEnd))
        assertEquals(0L, DailyMath.overlapSeconds(at(2026, 1, 15, 11, 0), at(2026, 1, 15, 10, 0), dayStart, dayEnd))
    }

    // --- windowDates ---

    @Test
    fun windowDatesIsNewestFirstWithTodayIncluded() {
        val dates = DailyMath.windowDates(LocalDate.of(2026, 1, 15), 7)
        assertEquals(7, dates.size)
        assertEquals(LocalDate.of(2026, 1, 15), dates.first())
        assertEquals(LocalDate.of(2026, 1, 9), dates.last())
        for (i in 1 until dates.size) {
            assertEquals(dates[i - 1].minusDays(1), dates[i])
        }
    }

    @Test
    fun windowDatesCrossesMonthBoundaries() {
        assertEquals(
            listOf(LocalDate.of(2026, 3, 2), LocalDate.of(2026, 3, 1), LocalDate.of(2026, 2, 28)),
            DailyMath.windowDates(LocalDate.of(2026, 3, 2), 3),
        )
    }

    @Test
    fun windowDatesWithNoDaysIsEmpty() {
        assertTrue(DailyMath.windowDates(LocalDate.of(2026, 1, 15), 0).isEmpty())
    }

    // --- dropEmpty ---

    @Test
    fun dropEmptyKeepsOnlyDaysWithMetricsAndNeverInsertsZero() {
        val d1 = LocalDate.of(2026, 1, 15)
        val d2 = LocalDate.of(2026, 1, 14)
        val d3 = LocalDate.of(2026, 1, 13)
        val input = linkedMapOf<LocalDate, Map<String, Double>>(
            d1 to mapOf("steps" to 1234.0),
            d2 to emptyMap(),
            d3 to mapOf("sleep_hours" to 7.25, "workout_minutes" to 30.0),
        )
        val result = DailyMath.dropEmpty(input)
        assertEquals(listOf(d1, d3), result.map { it.first })
        assertEquals(mapOf("steps" to 1234.0), result[0].second)
        assertEquals(mapOf("sleep_hours" to 7.25, "workout_minutes" to 30.0), result[1].second)
        for ((_, metrics) in result) {
            assertFalse(metrics.isEmpty())
            assertFalse(metrics.values.contains(0.0))
        }
    }

    @Test
    fun dropEmptyOfOnlyEmptyDaysIsEmpty() {
        val input = linkedMapOf<LocalDate, Map<String, Double>>(
            LocalDate.of(2026, 1, 15) to emptyMap(),
            LocalDate.of(2026, 1, 14) to emptyMap(),
        )
        assertTrue(DailyMath.dropEmpty(input).isEmpty())
    }
}
