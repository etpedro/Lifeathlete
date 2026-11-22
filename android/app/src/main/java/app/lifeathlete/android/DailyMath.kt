package app.lifeathlete.android

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/** One sleep session as read from Health Connect, reduced to what the daily math needs. */
data class SleepSessionData(val start: Instant, val end: Instant, val awakeSeconds: Long)

/**
 * Pure per-day arithmetic for the Health Connect bridge (no Android imports, unit-tested).
 * Contract: a metric with no data is omitted, never reported as 0.
 */
object DailyMath {

    /**
     * Hours slept per local date of each session's END (a night belongs to the morning it
     * ends), as `end - start - awake`, summed per date and rounded to 2 decimals. Sessions with
     * a non-positive length, or awake time that covers the whole session, are ignored.
     */
    fun sleepHoursByEndDate(sessions: List<SleepSessionData>, zone: ZoneId): Map<LocalDate, Double> {
        val secondsByDate = LinkedHashMap<LocalDate, Long>()
        for (session in sessions) {
            val length = Duration.between(session.start, session.end).seconds
            if (length <= 0L) continue
            val awake = if (session.awakeSeconds > 0L) session.awakeSeconds else 0L
            if (awake >= length) continue
            val date = session.end.atZone(zone).toLocalDate()
            secondsByDate[date] = (secondsByDate[date] ?: 0L) + (length - awake)
        }
        val hoursByDate = LinkedHashMap<LocalDate, Double>()
        for ((date, seconds) in secondsByDate) {
            hoursByDate[date] = Math.round(seconds / 36.0) / 100.0
        }
        return hoursByDate
    }

    /** Nearest whole minute (half a minute rounds up); non-positive durations are 0. */
    fun roundMinutes(seconds: Long): Int {
        if (seconds <= 0L) return 0
        return ((seconds + 30L) / 60L).toInt()
    }

    /** Seconds of [start, end) that fall inside [from, to); 0 when they do not overlap. */
    fun overlapSeconds(start: Instant, end: Instant, from: Instant, to: Instant): Long {
        val clippedStart = if (start.isAfter(from)) start else from
        val clippedEnd = if (end.isBefore(to)) end else to
        val seconds = Duration.between(clippedStart, clippedEnd).seconds
        return if (seconds > 0L) seconds else 0L
    }

    /** The last `days` local dates, newest first, today included. */
    fun windowDates(today: LocalDate, days: Int): List<LocalDate> {
        val dates = ArrayList<LocalDate>()
        for (i in 0 until days) {
            dates.add(today.minusDays(i.toLong()))
        }
        return dates
    }

    /** Days that have at least one metric, in the map's order; empty days are dropped, never zero-filled. */
    fun dropEmpty(values: Map<LocalDate, Map<String, Double>>): List<Pair<LocalDate, Map<String, Double>>> {
        val result = ArrayList<Pair<LocalDate, Map<String, Double>>>()
        for ((date, metrics) in values) {
            if (metrics.isNotEmpty()) result.add(Pair(date, metrics))
        }
        return result
    }
}
