package app.lifeathlete.android

import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.MindfulnessSessionRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Read-only bridge from the web app to Health Connect. Contract (see src/lib/health/capacitor.ts):
 * - isAvailable()                 -> { available, unavailableCategories }
 * - checkPermissions({categories}) -> { granted }
 * - requestPermissions({categories}) -> { granted }
 * - readMetrics({days, categories}) -> { days: [{ date: "YYYY-MM-DD", metrics: { <metric>: number } }] }
 * A metric with no data on a day is omitted (never 0). Health values are never logged.
 */
@CapacitorPlugin(name = "HealthConnectBridge")
class HealthConnectBridgePlugin : Plugin() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val permissionContract = PermissionController.createRequestPermissionResultContract()

    override fun handleOnDestroy() {
        scope.cancel()
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        try {
            val result = JSObject()
            val unavailable = JSArray()
            if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) {
                result.put("available", false)
                result.put("unavailableCategories", unavailable)
                call.resolve(result)
                return
            }
            val client = HealthConnectClient.getOrCreate(context)
            if (!isMindfulnessSupported(client)) unavailable.put(MINDFUL)
            result.put("available", true)
            result.put("unavailableCategories", unavailable)
            call.resolve(result)
        } catch (e: Exception) {
            call.reject("Health Connect availability check failed", ERROR_UNAVAILABLE, e)
        }
    }

    @PluginMethod
    override fun checkPermissions(call: PluginCall) {
        val categories = categoriesOf(call)
        val client = clientOrNull()
        if (client == null) {
            rejectUnavailable(call)
            return
        }
        scope.launch {
            try {
                val granted = client.permissionController.getGrantedPermissions()
                call.resolve(grantedResult(categories, granted))
            } catch (e: Exception) {
                call.reject("Could not check Health Connect permissions", ERROR_PERMISSION_CHECK, e)
            }
        }
    }

    @PluginMethod
    override fun requestPermissions(call: PluginCall) {
        val categories = categoriesOf(call)
        if (categories.isEmpty()) {
            call.resolve(grantedResult(categories, emptySet()))
            return
        }
        if (clientOrNull() == null) {
            rejectUnavailable(call)
            return
        }
        try {
            val permissions = HashSet<String>()
            for (category in categories) permissions.add(readPermissionOf(category))
            val intent = permissionContract.createIntent(context, permissions)
            startActivityForResult(call, intent, "permissionResult")
        } catch (e: Exception) {
            call.reject("Could not open the Health Connect permission screen", ERROR_PERMISSION_REQUEST, e)
        }
    }

    /** Result of the Health Connect permission screen (registered by Capacitor via @ActivityCallback). */
    @ActivityCallback
    private fun permissionResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        try {
            val categories = categoriesOf(call)
            val fromScreen: Set<String> =
                try {
                    permissionContract.parseResult(result.resultCode, result.data)
                } catch (e: Exception) {
                    emptySet()
                }
            val client = clientOrNull()
            if (client == null) {
                call.resolve(grantedResult(categories, fromScreen))
                return
            }
            scope.launch {
                try {
                    // The screen reports what was granted in it; the controller also knows earlier grants.
                    val granted: Set<String> =
                        try {
                            fromScreen + client.permissionController.getGrantedPermissions()
                        } catch (e: Exception) {
                            fromScreen
                        }
                    call.resolve(grantedResult(categories, granted))
                } catch (e: Exception) {
                    call.reject("Could not read the permission result", ERROR_PERMISSION_REQUEST, e)
                }
            }
        } catch (e: Exception) {
            call.reject("Could not read the permission result", ERROR_PERMISSION_REQUEST, e)
        }
    }

    @PluginMethod
    fun readMetrics(call: PluginCall) {
        val categories = categoriesOf(call)
        val days = (call.getInt("days", DEFAULT_DAYS) ?: DEFAULT_DAYS).coerceIn(1, MAX_DAYS)
        val client = clientOrNull()
        if (client == null) {
            rejectUnavailable(call)
            return
        }
        scope.launch {
            try {
                val granted = client.permissionController.getGrantedPermissions()
                val readable = categories.filter { granted.contains(readPermissionOf(it)) }
                val zone = ZoneId.systemDefault()
                val dates = DailyMath.windowDates(LocalDate.now(zone), days)
                val values = LinkedHashMap<LocalDate, MutableMap<String, Double>>()
                for (date in dates) values[date] = LinkedHashMap()

                for (date in dates) {
                    val metrics = values.getValue(date)
                    val filter = TimeRangeFilter.between(
                        date.atStartOfDay(zone).toInstant(),
                        date.plusDays(1).atStartOfDay(zone).toInstant(),
                    )
                    readDailyAggregates(client, filter, readable, metrics)
                    if (readable.contains(MINDFUL)) readMindfulMinutes(client, filter, metrics)
                }

                if (readable.contains(SLEEP) && dates.isNotEmpty()) {
                    // Padded by one day before the oldest date so a night ending on it is included.
                    val from = dates.last().minusDays(1).atStartOfDay(zone).toInstant()
                    val to = dates.first().plusDays(1).atStartOfDay(zone).toInstant()
                    val hours = DailyMath.sleepHoursByEndDate(readSleepSessions(client, from, to), zone)
                    for ((date, h) in hours) {
                        val metrics = values[date] ?: continue
                        if (h > 0.0) metrics[SLEEP] = h
                    }
                }

                call.resolve(daysResult(DailyMath.dropEmpty(values)))
            } catch (e: Exception) {
                call.reject("Could not read Health Connect data", ERROR_READ_FAILED, e)
            }
        }
    }

    /** Steps and exercise minutes for one day, in one aggregate request; absent or 0 is omitted. */
    private suspend fun readDailyAggregates(
        client: HealthConnectClient,
        filter: TimeRangeFilter,
        readable: List<String>,
        metrics: MutableMap<String, Double>,
    ) {
        val wantSteps = readable.contains(STEPS)
        val wantWorkout = readable.contains(WORKOUT)
        if (!wantSteps && !wantWorkout) return
        val request = AggregateRequest(
            metrics = when {
                wantSteps && wantWorkout -> setOf(StepsRecord.COUNT_TOTAL, ExerciseSessionRecord.EXERCISE_DURATION_TOTAL)
                wantSteps -> setOf(StepsRecord.COUNT_TOTAL)
                else -> setOf(ExerciseSessionRecord.EXERCISE_DURATION_TOTAL)
            },
            timeRangeFilter = filter,
        )
        val result = client.aggregate(request)
        if (wantSteps) {
            val steps: Long? = result[StepsRecord.COUNT_TOTAL]
            if (steps != null && steps > 0L) metrics[STEPS] = steps.toDouble()
        }
        if (wantWorkout) {
            val minutes = minutesOf(result[ExerciseSessionRecord.EXERCISE_DURATION_TOTAL])
            if (minutes > 0) metrics[WORKOUT] = minutes.toDouble()
        }
    }

    /**
     * MINDFULNESS (library 1.2.0-alpha line): its own request so a failure only drops this
     * metric. To remove mindfulness, delete this function and its call, and make
     * isMindfulnessSupported return false.
     */
    private suspend fun readMindfulMinutes(
        client: HealthConnectClient,
        filter: TimeRangeFilter,
        metrics: MutableMap<String, Double>,
    ) {
        val duration: Duration? =
            try {
                client.aggregate(
                    AggregateRequest(
                        metrics = setOf(MindfulnessSessionRecord.MINDFULNESS_DURATION_TOTAL),
                        timeRangeFilter = filter,
                    ),
                )[MindfulnessSessionRecord.MINDFULNESS_DURATION_TOTAL]
            } catch (e: Exception) {
                null
            }
        val minutes = minutesOf(duration)
        if (minutes > 0) metrics[MINDFUL] = minutes.toDouble()
    }

    /** Sleep sessions in [from, to), all pages, with their awake stages summed (clipped to the session). */
    private suspend fun readSleepSessions(
        client: HealthConnectClient,
        from: Instant,
        to: Instant,
    ): List<SleepSessionData> {
        val sessions = ArrayList<SleepSessionData>()
        var pageToken: String? = null
        var pages = 0
        do {
            val response = client.readRecords(
                ReadRecordsRequest(
                    recordType = SleepSessionRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(from, to),
                    pageToken = pageToken,
                ),
            )
            for (record in response.records) {
                var awakeSeconds = 0L
                for (stage in record.stages) {
                    if (stage.stage != SleepSessionRecord.STAGE_TYPE_AWAKE &&
                        stage.stage != SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED
                    ) {
                        continue
                    }
                    val start = if (stage.startTime.isAfter(record.startTime)) stage.startTime else record.startTime
                    val end = if (stage.endTime.isBefore(record.endTime)) stage.endTime else record.endTime
                    val seconds = Duration.between(start, end).seconds
                    if (seconds > 0L) awakeSeconds += seconds
                }
                sessions.add(SleepSessionData(record.startTime, record.endTime, awakeSeconds))
            }
            pageToken = response.pageToken
            pages++
        } while (pageToken != null && pages < MAX_SLEEP_PAGES)
        return sessions
    }

    /** MINDFULNESS: availability of the mindfulness feature on this device's Health Connect. */
    private fun isMindfulnessSupported(client: HealthConnectClient): Boolean =
        try {
            client.features.getFeatureStatus(HealthConnectFeatures.FEATURE_MINDFULNESS_SESSION) ==
                HealthConnectFeatures.FEATURE_STATUS_AVAILABLE
        } catch (e: Exception) {
            false
        }

    /** The client when Health Connect is installed and up to date, else null (never throws). */
    private fun clientOrNull(): HealthConnectClient? =
        try {
            if (HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE) {
                HealthConnectClient.getOrCreate(context)
            } else {
                null
            }
        } catch (e: Exception) {
            null
        }

    private fun rejectUnavailable(call: PluginCall) {
        call.reject("Health Connect is not installed or needs an update", ERROR_UNAVAILABLE)
    }

    /** Known categories from the call, in order, without duplicates; unknown strings are ignored. */
    private fun categoriesOf(call: PluginCall): List<String> {
        val array = call.getArray("categories") ?: return emptyList()
        val result = ArrayList<String>()
        for (i in 0 until array.length()) {
            val category = array.optString(i)
            if (CATEGORIES.contains(category) && !result.contains(category)) result.add(category)
        }
        return result
    }

    private fun readPermissionOf(category: String): String =
        when (category) {
            STEPS -> HealthPermission.getReadPermission(StepsRecord::class)
            WORKOUT -> HealthPermission.getReadPermission(ExerciseSessionRecord::class)
            SLEEP -> HealthPermission.getReadPermission(SleepSessionRecord::class)
            MINDFUL -> HealthPermission.getReadPermission(MindfulnessSessionRecord::class)
            else -> throw IllegalArgumentException("Unknown category")
        }

    private fun grantedResult(categories: List<String>, granted: Set<String>): JSObject {
        val array = JSArray()
        for (category in categories) {
            if (granted.contains(readPermissionOf(category))) array.put(category)
        }
        val result = JSObject()
        result.put("granted", array)
        return result
    }

    private fun daysResult(days: List<Pair<LocalDate, Map<String, Double>>>): JSObject {
        val array = JSArray()
        for ((date, metrics) in days) {
            val values = JSObject()
            for ((key, value) in metrics) {
                if (key == SLEEP) values.put(key, value) else values.put(key, value.toLong())
            }
            val day = JSObject()
            day.put("date", date.toString())
            day.put("metrics", values)
            array.put(day)
        }
        val result = JSObject()
        result.put("days", array)
        return result
    }

    private fun minutesOf(duration: Duration?): Int = if (duration == null) 0 else DailyMath.roundMinutes(duration.seconds)

    private companion object {
        const val STEPS = "steps"
        const val WORKOUT = "workout_minutes"
        const val SLEEP = "sleep_hours"
        const val MINDFUL = "mindful_minutes"
        val CATEGORIES = listOf(STEPS, WORKOUT, SLEEP, MINDFUL)

        const val ERROR_UNAVAILABLE = "health_connect_unavailable"
        const val ERROR_PERMISSION_CHECK = "permission_check_failed"
        const val ERROR_PERMISSION_REQUEST = "permission_request_failed"
        const val ERROR_READ_FAILED = "read_failed"

        const val DEFAULT_DAYS = 7
        const val MAX_DAYS = 31
        const val MAX_SLEEP_PAGES = 20
    }
}
