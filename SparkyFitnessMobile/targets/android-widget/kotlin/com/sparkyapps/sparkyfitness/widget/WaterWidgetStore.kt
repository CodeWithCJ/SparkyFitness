package com.sparkyapps.sparkyfitness.widget

import android.content.Context
import android.os.Build
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import com.sparkyapps.sparkyfitness.backgroundwater.WATER_WIDGET_ACCOUNT_EPOCH
import com.sparkyapps.sparkyfitness.backgroundwater.WaterChangeOutcome
import kotlin.math.max
import kotlinx.coroutines.CancellationException
import org.json.JSONObject

/** The water widget's snapshot as it is drawn, or null when there is none for today. */
internal data class WaterSnapshot(
    val consumedMl: Double,
    val goalMl: Double,
    /** One drink of the dashboard's container; null when it is linked to a food. */
    val drinkMl: Double?,
    val unit: String,
    val canLog: Boolean,
    /**
     * The part of today's water logged by hand, which is all a − can remove;
     * null when unknown (a server without the breakdown), which leaves − on.
     */
    val manualMl: Double?,
    /** Taps waiting to be sent, and taps being sent: shown before the server answers. */
    val pendingDrinks: Int,
    val sendingDrinks: Int,
    val status: String?,
) {
    private val queuedMl: Double = (pendingDrinks + sendingDrinks) * (drinkMl ?: 0.0)
    val shownMl: Double = max(0.0, consumedMl + queuedMl)
    val showsButtons: Boolean = canLog && (drinkMl ?: 0.0) > 0.0
    val canRemove: Boolean = shownMl > 0.0 && (manualMl == null || manualMl + queuedMl > 0.0)
}

/**
 * Everything that changes the water widget's figures, all under
 * [WidgetSnapshotLock]: the app's pushes (CalorieWidgetModule), the − and +
 * buttons ([WaterChangeAction]), the worker that sends them
 * ([WaterWidgetWorker]), a drink logged by the shortcut or the tile
 * (WaterWidgetReceiver), and the clear on an account change.
 *
 * The snapshot is one JSON object kept, like the other widgets', in
 * SharedPreferences and in each instance's Glance state. Besides what the app
 * sends it holds the taps not yet answered and the last error to show.
 */
internal object WaterWidgetStore {
    const val WORK_NAME = "water-widget-change"

    const val STATUS_SIGN_IN = "sign_in"
    const val STATUS_PICK_CONTAINER = "pick_container"
    const val STATUS_EXPIRED = "expired"
    const val STATUS_UNREACHABLE = "unreachable"
    const val STATUS_FAILED = "failed"
    const val STATUS_NOTHING_TO_REMOVE = "nothing_to_remove"

    private const val KEY_ACCOUNT_EPOCH = WATER_WIDGET_ACCOUNT_EPOCH
    private const val KEY_PENDING = "pendingDrinks"
    private const val KEY_SENDING = "sendingDrinks"
    private const val KEY_STATUS = "status"
    // The server accepts up to 100 drinks a request.
    private const val MAX_DRINKS_PER_REQUEST = 100

    /** Taps taken by the worker, and the account and day they were made for. */
    class Batch(val drinks: Int, val accountEpoch: Long, val date: String)

    fun parse(json: String?): WaterSnapshot? {
        if (json == null) return null
        return try {
            val obj = JSONObject(json)
            if (!isSnapshotToday(obj.optString("date", ""))) return null
            WaterSnapshot(
                consumedMl = obj.optionalDouble("consumedMl") ?: 0.0,
                goalMl = obj.optionalDouble("goalMl") ?: 0.0,
                drinkMl = obj.optionalDouble("drinkMl")?.takeIf { it > 0.0 },
                unit = obj.optString("unit", "ml"),
                canLog = obj.optBoolean("canLog", false),
                manualMl = obj.optionalDouble("manualMl"),
                pendingDrinks = obj.optInt(KEY_PENDING, 0),
                sendingDrinks = obj.optInt(KEY_SENDING, 0),
                status = obj.optString(KEY_STATUS, "").ifEmpty { null },
            )
        } catch (e: Exception) {
            null
        }
    }

    fun loadSnapshot(context: Context): WaterSnapshot? = parse(storedJson(context))

    /**
     * Stores what the app sent. A background refresh leaves out the drink,
     * unit and whether the buttons may show, and the Dashboard leaves out the
     * drink until its container has loaded; whatever is left out is kept from
     * the stored copy. The manual part comes with every push and is never
     * kept, as the day's water may have changed since. Taps not yet sent are
     * always kept; the request still out is forgotten when the day changes,
     * as its answer is then dropped. A push from the app answers any error the
     * widget was showing. Redraws nothing: the app reloads the widget after it.
     */
    suspend fun mergeFromAppLocked(context: Context, json: String) {
        val incoming = JSONObject(json)
        // The widget only shows the device's day; a background refresh built
        // for another day (the account's timezone) would blank it.
        if (!isSnapshotToday(incoming.optString("date", ""))) return
        val stored = storedObject(context)
        if (stored != null) {
            for (key in listOf("drinkMl", "unit", "canLog")) {
                if (!incoming.has(key) && stored.has(key)) incoming.put(key, stored.get(key))
            }
            if (stored.has(KEY_PENDING)) incoming.put(KEY_PENDING, stored.get(KEY_PENDING))
            if (stored.has(KEY_SENDING) && stored.optString("date") == incoming.optString("date")) {
                incoming.put(KEY_SENDING, stored.get(KEY_SENDING))
            }
        }
        incoming.remove(KEY_STATUS)
        writeLocked(context, incoming, redraw = false)
    }

    /** Adds a tap to send. False when there is nothing to change (no snapshot for today, or nothing to remove). */
    suspend fun addTapLocked(context: Context, change: Int): Boolean {
        if (change == 0) return false
        val obj = storedObject(context) ?: return false
        val snapshot = parse(obj.toString()) ?: return false
        if (!snapshot.showsButtons) return false
        if (change < 0 && !snapshot.canRemove) return false
        obj.put(KEY_PENDING, snapshot.pendingDrinks + change)
        obj.remove(KEY_STATUS)
        writeLocked(context, obj, redraw = true)
        return true
    }

    /**
     * Forgets taps an earlier worker took and never answered: it was stopped
     * or its process died mid-request. Called when a worker starts. A stopped
     * worker's request may still be finishing, but its coroutine was
     * cancelled, so its answer is never applied. The taps are not sent again,
     * as that request may have reached the server; the next app push brings
     * the day's real total.
     */
    suspend fun reclaimSendingLocked(context: Context) {
        val obj = storedObject(context) ?: return
        if (obj.optInt(KEY_SENDING, 0) == 0) return
        obj.put(KEY_SENDING, 0)
        writeLocked(context, obj, redraw = true)
    }

    /** Takes the taps waiting to be sent, or null when there are none. */
    suspend fun takePendingLocked(context: Context): Batch? {
        val obj = storedObject(context) ?: return null
        val pending = obj.optInt(KEY_PENDING, 0)
        if (pending == 0) return null
        val drinks = pending.coerceIn(-MAX_DRINKS_PER_REQUEST, MAX_DRINKS_PER_REQUEST)
        obj.put(KEY_PENDING, pending - drinks)
        obj.put(KEY_SENDING, obj.optInt(KEY_SENDING, 0) + drinks)
        writeLocked(context, obj, redraw = false)
        return Batch(drinks, accountEpoch(context), obj.optString("date", ""))
    }

    /**
     * Shows what the server answered. Dropped when the account changed after
     * the taps were taken, so the previous account's total never comes back,
     * or when the app has since sent another day, whose push forgot this
     * request. A failure drops every tap still waiting too: the person can tap
     * again.
     */
    suspend fun applyOutcomeLocked(context: Context, batch: Batch, outcome: WaterChangeOutcome) {
        if (accountEpoch(context) != batch.accountEpoch) return
        val obj = storedObject(context) ?: return
        if (obj.optString("date", "") != batch.date) return
        val before = obj.optionalDouble("consumedMl") ?: 0.0
        val drinkMl = obj.optionalDouble("drinkMl") ?: 0.0
        obj.put(KEY_SENDING, obj.optInt(KEY_SENDING, 0) - batch.drinks)
        when (outcome) {
            is WaterChangeOutcome.Changed -> {
                val total = outcome.totalMl ?: max(0.0, before + batch.drinks * drinkMl)
                obj.put("consumedMl", total)
                outcome.manualMl?.let { obj.put("manualMl", it) }
                // The server removes only drinks logged by hand: a − that
                // found none leaves the total where it was.
                if (batch.drinks < 0 && total >= before) {
                    obj.put(KEY_STATUS, STATUS_NOTHING_TO_REMOVE)
                } else {
                    obj.remove(KEY_STATUS)
                }
            }
            else -> {
                obj.put(KEY_PENDING, 0)
                obj.put(KEY_SENDING, 0)
                obj.put(KEY_STATUS, statusFor(outcome))
            }
        }
        writeLocked(context, obj, redraw = true)
    }

    /**
     * A drink logged by the shortcut or the tile: show the server's new total,
     * unless the account changed while that request was out.
     */
    suspend fun applyTotalsLocked(context: Context, totalMl: Double, manualMl: Double?, accountEpoch: Long?) {
        if (accountEpoch != null && accountEpoch != accountEpoch(context)) return
        val obj = storedObject(context) ?: return
        if (!isSnapshotToday(obj.optString("date", ""))) return
        obj.put("consumedMl", totalMl)
        if (manualMl != null) obj.put("manualMl", manualMl)
        obj.remove(KEY_STATUS)
        writeLocked(context, obj, redraw = true)
    }

    /**
     * The account changed: taps not yet sent belong to the previous account.
     * The snapshot itself is erased with the others (CalorieWidgetModule).
     */
    fun onAccountChangedLocked(context: Context) {
        prefs(context).edit().putLong(KEY_ACCOUNT_EPOCH, accountEpoch(context) + 1).commit()
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
    }

    /** Sends the waiting taps in the order they were made, one request after another. */
    fun enqueueSend(context: Context) {
        val request = OneTimeWorkRequestBuilder<WaterWidgetWorker>()
        // Before Android 12 an expedited job runs as a foreground service,
        // and this worker does not supply ForegroundInfo.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            request.setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
        }
        WorkManager.getInstance(context)
            .enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.APPEND_OR_REPLACE, request.build())
    }

    private fun statusFor(outcome: WaterChangeOutcome): String = when (outcome) {
        WaterChangeOutcome.NotSignedIn -> STATUS_SIGN_IN
        WaterChangeOutcome.NoContainer -> STATUS_PICK_CONTAINER
        WaterChangeOutcome.Expired -> STATUS_EXPIRED
        WaterChangeOutcome.Unreachable -> STATUS_UNREACHABLE
        else -> STATUS_FAILED
    }

    private fun accountEpoch(context: Context): Long = prefs(context).getLong(KEY_ACCOUNT_EPOCH, 0L)

    private fun prefs(context: Context) =
        context.getSharedPreferences(WaterWidgetReceiver.PREFS_NAME, Context.MODE_PRIVATE)

    private fun storedJson(context: Context): String? =
        prefs(context).getString(WaterWidgetReceiver.PREFS_KEY_SNAPSHOT, null)

    private fun storedObject(context: Context): JSONObject? = try {
        storedJson(context)?.let { JSONObject(it) }
    } catch (e: Exception) {
        null
    }

    /** Stores [obj] and copies it into every instance's state, redrawing each when asked. */
    private suspend fun writeLocked(context: Context, obj: JSONObject, redraw: Boolean) {
        val json = obj.toString()
        if (!prefs(context).edit().putString(WaterWidgetReceiver.PREFS_KEY_SNAPSHOT, json).commit()) {
            throw IllegalStateException("Failed to persist water widget snapshot")
        }
        val widget = WaterWidget()
        GlanceAppWidgetManager(context).getGlanceIds(WaterWidget::class.java).forEach { id ->
            try {
                updateAppWidgetState(context, id) { state -> state[WaterWidget.SNAPSHOT_STATE_KEY] = json }
                if (redraw) widget.update(context, id)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // That instance keeps its previous copy until a later write
                // reaches it.
            }
        }
    }
}
