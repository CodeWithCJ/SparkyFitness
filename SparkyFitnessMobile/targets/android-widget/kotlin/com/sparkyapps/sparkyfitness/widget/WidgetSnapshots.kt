package com.sparkyapps.sparkyfitness.widget

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.sync.Mutex
import org.json.JSONObject

/**
 * One lock for every write to the widget snapshots: the JS bridge
 * (CalorieWidgetModule), the water widget's buttons and the worker that sends
 * their taps. A write reads, changes and stores a snapshot, so two of them
 * must never interleave. The lock is not reentrant: code that already holds it
 * calls the `...Locked` helpers.
 */
object WidgetSnapshotLock {
    val mutex = Mutex()
}

/** A snapshot only describes the day it was built for; any other day reads as none. */
internal fun isSnapshotToday(date: String): Boolean {
    if (date.isBlank()) return false
    return try {
        LocalDate.parse(date, DateTimeFormatter.ISO_LOCAL_DATE) == LocalDate.now()
    } catch (e: Exception) {
        false
    }
}

/** A number the snapshot may leave out: absent, JSON null and non-finite all read as none. */
internal fun JSONObject.optionalDouble(name: String): Double? {
    if (!has(name) || isNull(name)) return null
    val value = optDouble(name, Double.NaN)
    return if (value.isFinite()) value else null
}
