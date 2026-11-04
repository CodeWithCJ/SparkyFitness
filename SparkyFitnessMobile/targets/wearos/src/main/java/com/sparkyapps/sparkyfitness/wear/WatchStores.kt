package com.sparkyapps.sparkyfitness.wear

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.speech.tts.TextToSpeech
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

object Haptics {
  private var appContext: Context? = null

  fun init(context: Context) {
    appContext = context.applicationContext
  }

  private fun vibrate(ms: Long = 35L, amplitude: Int = VibrationEffect.DEFAULT_AMPLITUDE) {
    val ctx = appContext ?: return
    try {
      val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val vm = ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
        vm?.defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      }
      vibrator?.vibrate(VibrationEffect.createOneShot(ms, amplitude))
    } catch (_: Throwable) {}
  }

  fun click() = vibrate(20L, 120)
  fun start() = vibrate(45L, 180)
  fun stop() = vibrate(55L, 200)
  fun success() = vibrate(60L, 220)
  fun warning() = vibrate(80L, 240)
  fun failure() = vibrate(100L, 255)
  fun directionUp() = vibrate(25L, 150)
}

class WatchRunSpeaker(context: Context) {
  private var tts: TextToSpeech? = null
  private var ready = false

  init {
    try {
      tts = TextToSpeech(context.applicationContext) { status ->
        if (status == TextToSpeech.SUCCESS) {
          tts?.language = Locale.US
          ready = true
        }
      }
    } catch (_: Throwable) {}
  }

  fun speak(text: String) {
    if (!ready || text.isBlank()) return
    try {
      tts?.speak(text, TextToSpeech.QUEUE_ADD, null, UUID.randomUUID().toString())
    } catch (_: Throwable) {}
  }
}

class CheckInStore(private val context: Context) {
  private val prefs = context.getSharedPreferences("sparky_wear_checkin", Context.MODE_PRIVATE)
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

  var session: WearSessionTransport? = null

  private val _watchContext = MutableStateFlow(WatchContext.empty)
  val watchContext: StateFlow<WatchContext> = _watchContext.asStateFlow()

  private val _draftWeight = MutableStateFlow(75.0)
  val draftWeight: StateFlow<Double> = _draftWeight.asStateFlow()

  private val _draftBodyFat = MutableStateFlow(18.0)
  val draftBodyFat: StateFlow<Double> = _draftBodyFat.asStateFlow()

  private val _hasBodyFatSeed = MutableStateFlow(false)
  val hasBodyFatSeed: StateFlow<Boolean> = _hasBodyFatSeed.asStateFlow()

  private val _unit = MutableStateFlow(WeightUnit.KG)
  val unit: StateFlow<WeightUnit> = _unit.asStateFlow()

  private val _history = MutableStateFlow<List<HistoryPoint>>(emptyList())
  val history: StateFlow<List<HistoryPoint>> = _history.asStateFlow()

  private val _syncState = MutableStateFlow(SyncState.SAVED)
  val syncState: StateFlow<SyncState> = _syncState.asStateFlow()

  private val _water = MutableStateFlow<WaterSnapshot?>(null)
  val water: StateFlow<WaterSnapshot?> = _water.asStateFlow()

  private val _pendingWaterTaps = MutableStateFlow<List<PendingWaterTap>>(emptyList())
  val pendingWaterTaps: StateFlow<List<PendingWaterTap>> = _pendingWaterTaps.asStateFlow()

  private val _pendingWaterDeletes = MutableStateFlow<List<PendingWaterDelete>>(emptyList())
  val pendingWaterDeletes: StateFlow<List<PendingWaterDelete>> = _pendingWaterDeletes.asStateFlow()

  private val _effectiveWaterMl = MutableStateFlow(0.0)
  val effectiveWaterMl: StateFlow<Double> = _effectiveWaterMl.asStateFlow()

  private val _queuedWaterMl = MutableStateFlow(0.0)
  val queuedWaterMl: StateFlow<Double> = _queuedWaterMl.asStateFlow()

  private val _waterLogEntries = MutableStateFlow<List<WaterLogEntry>>(emptyList())
  val waterLogEntries: StateFlow<List<WaterLogEntry>> = _waterLogEntries.asStateFlow()

  private val _waterSyncState = MutableStateFlow(SyncState.SAVED)
  val waterSyncState: StateFlow<SyncState> = _waterSyncState.asStateFlow()

  private val _waterContainers = MutableStateFlow<List<WaterContainer>>(emptyList())
  val waterContainers: StateFlow<List<WaterContainer>> = _waterContainers.asStateFlow()

  private val _waterGoalMl = MutableStateFlow(2500.0)
  val waterGoalMl: StateFlow<Double> = _waterGoalMl.asStateFlow()

  private val _waterDisplayUnit = MutableStateFlow("ml")
  val waterDisplayUnit: StateFlow<String> = _waterDisplayUnit.asStateFlow()

  private val _nutrition = MutableStateFlow<NutritionSnapshot?>(null)
  val nutrition: StateFlow<NutritionSnapshot?> = _nutrition.asStateFlow()

  private val _medications = MutableStateFlow<MedicationSnapshot?>(null)
  val medications: StateFlow<MedicationSnapshot?> = _medications.asStateFlow()

  private val _startableWorkouts = MutableStateFlow<List<StartableWorkout>>(emptyList())
  val startableWorkouts: StateFlow<List<StartableWorkout>> = _startableWorkouts.asStateFlow()

  private val _scheduledWorkouts = MutableStateFlow<List<ScheduledWorkout>>(emptyList())
  val scheduledWorkouts: StateFlow<List<ScheduledWorkout>> = _scheduledWorkouts.asStateFlow()

  private val _fast = MutableStateFlow<WatchFast?>(null)
  val fast: StateFlow<WatchFast?> = _fast.asStateFlow()

  private val _steps = MutableStateFlow<StepsSnapshot?>(null)
  val steps: StateFlow<StepsSnapshot?> = _steps.asStateFlow()

  private val _stepGoal = MutableStateFlow(10000)
  val stepGoal: StateFlow<Int> = _stepGoal.asStateFlow()

  private val _sleep = MutableStateFlow<SleepSnapshot?>(null)
  val sleep: StateFlow<SleepSnapshot?> = _sleep.asStateFlow()

  private val _exerciseSummary = MutableStateFlow<ExerciseSummarySnapshot?>(null)
  val exerciseSummary: StateFlow<ExerciseSummarySnapshot?> = _exerciseSummary.asStateFlow()

  private val _enabledPages = MutableStateFlow(WatchPage.defaultOrder)
  val enabledPages: StateFlow<List<WatchPage>> = _enabledPages.asStateFlow()

  private var confirmedOwnerId: String? = null
  private var userEditedWeight = false
  private var userEditedBodyFat = false
  private var workoutPageActive = false
  private val waterConsumedBaseline = mutableMapOf<String, Double>()
  private val pendingCheckInDays = mutableMapOf<String, String>() // clientId -> day
  private val unconfirmedDays = mutableSetOf<String>()

  init {
    restorePersistedPendingWater()
    restorePersistedContext()
    recomputeWaterState()
  }

  internal fun activeOwnerId(): String? =
    confirmedOwnerId?.takeIf { it.isNotEmpty() }
      ?: _watchContext.value.workoutServerId?.takeIf { it.isNotEmpty() }

  fun setWorkoutPageActive(active: Boolean) {
    if (workoutPageActive != active) {
      workoutPageActive = active
      _enabledPages.value = _watchContext.value.visiblePages(workoutActive = active)
    }
  }

  val deltaFromLatest: Double?
    get() {
      val lastKg = _watchContext.value.lastWeightKg ?: _history.value.lastOrNull()?.weightKg ?: return null
      val lastDisplay = _unit.value.fromKg(lastKg)
      return _draftWeight.value - lastDisplay
    }

  val isWeightDeltaImplausible: Boolean
    get() {
      val lastKg = _watchContext.value.lastWeightKg ?: _history.value.lastOrNull()?.weightKg ?: return false
      val draftKg = _unit.value.toKg(_draftWeight.value)
      val deltaKg = abs(draftKg - lastKg)
      val days = max(1, _watchContext.value.daysSinceLastEntry).toDouble()
      val thresholdKg = max(1.5, 0.8 * sqrt(days))
      return deltaKg > thresholdKg
    }

  fun isDayUnconfirmed(day: String): Boolean = unconfirmedDays.contains(day)

  fun rollingMean(points: List<HistoryPoint>, window: Int = 7): List<Pair<Int, Double>> {
    if (points.size < 2) return emptyList()
    val u = _unit.value
    val out = mutableListOf<Pair<Int, Double>>()
    for (i in points.indices) {
      val from = max(0, i - window + 1)
      val slice = points.subList(from, i + 1)
      val avgKg = slice.map { it.weightKg }.average()
      out.add(i to u.fromKg(avgKg))
    }
    return out
  }

  fun nudge(steps: Int) {
    userEditedWeight = true
    val next = _draftWeight.value + steps * 0.1
    _draftWeight.value = clampAndSnap(next, _unit.value)
  }

  fun setDraftWeight(value: Double) {
    userEditedWeight = true
    _draftWeight.value = clampAndSnap(value, _unit.value)
  }

  fun nudgeBodyFat(steps: Int) {
    userEditedBodyFat = true
    _hasBodyFatSeed.value = true
    val next = _draftBodyFat.value + steps * 0.1
    _draftBodyFat.value = clampBodyFat(next)
  }

  fun setDraftBodyFat(value: Double) {
    userEditedBodyFat = true
    _hasBodyFatSeed.value = true
    _draftBodyFat.value = clampBodyFat(value)
  }

  fun applyStartingWeight(value: Double, selectedUnit: WeightUnit) {
    userEditedWeight = true
    _unit.value = selectedUnit
    _draftWeight.value = clampAndSnap(value, selectedUnit)
  }

  fun saveWeight(includeBodyFat: Boolean = _hasBodyFatSeed.value) {
    val ownerId = activeOwnerId() ?: return
    val u = _unit.value
    val displayVal = clampAndSnap(_draftWeight.value, u)
    val weightKg = u.toKg(displayVal)
    val bodyFat = if (includeBodyFat) clampBodyFat(_draftBodyFat.value) else null
    val today = CheckInDate.today()
    val clientId = UUID.randomUUID().toString()
    val checkIn = CheckIn(
      id = clientId,
      entryDate = today,
      weightKg = weightKg,
      bodyFatPercentage = bodyFat
    )

    pendingCheckInDays[clientId] = today
    unconfirmedDays.add(today)

    val nextHistory = _history.value.toMutableList()
    val idx = nextHistory.indexOfFirst { it.day == today }
    val pt = HistoryPoint(day = today, weightKg = weightKg, bodyFatPercentage = bodyFat)
    if (idx >= 0) nextHistory[idx] = pt else nextHistory.add(pt)
    _history.value = nextHistory
    userEditedWeight = false
    userEditedBodyFat = false
    _syncState.value = SyncState.QUEUED

    val payload = OutboundPayloads.checkIn(checkIn, ownerId = ownerId)
    session?.sendWeightCheckIn(payload) { deliveredLive ->
      scope.launch {
        _syncState.value = if (deliveredLive) SyncState.SAVED else SyncState.QUEUED
      }
    }
    Haptics.success()
  }

  /**
   * Clears any day-scoped snapshots and pending water mutations that belong to a previous calendar day.
   */
  fun pruneStaleDayData() {
    val today = CheckInDate.today()
    val curWater = _water.value
    if (curWater != null && curWater.day != today) {
      _water.value = null
    }
    val curNutrition = _nutrition.value
    if (curNutrition != null && curNutrition.day != today) {
      _nutrition.value = null
    }
    val curMeds = _medications.value
    if (curMeds != null && curMeds.day != today) {
      _medications.value = null
    }
    val curSteps = _steps.value
    if (curSteps != null && curSteps.day != today) {
      _steps.value = null
    }
    val curSleep = _sleep.value
    if (curSleep != null && curSleep.day != today) {
      _sleep.value = null
    }
    val curExercise = _exerciseSummary.value
    if (curExercise != null && curExercise.day != today) {
      _exerciseSummary.value = null
    }
    if (!_watchContext.value.today.isNullOrEmpty() && _watchContext.value.today != today) {
      _scheduledWorkouts.value = emptyList()
    }
    val filteredTaps = _pendingWaterTaps.value.filter { it.day == today }
    val filteredDeletes = _pendingWaterDeletes.value.filter { it.day == today }
    if (filteredTaps.size != _pendingWaterTaps.value.size || filteredDeletes.size != _pendingWaterDeletes.value.size) {
      _pendingWaterTaps.value = filteredTaps
      _pendingWaterDeletes.value = filteredDeletes
      persistPendingWater()
    }
    recomputeWaterState()
  }

  fun resendQueued() {
    val ownerId = confirmedOwnerId?.takeIf { it.isNotEmpty() } ?: return
    val today = CheckInDate.today()
    for (tap in _pendingWaterTaps.value) {
      if (tap.day == today && tap.state == SyncState.QUEUED && tap.ownerId == ownerId) {
        val payload = OutboundPayloads.waterTap(
          clientId = tap.id,
          entryDate = tap.day,
          containerId = tap.containerId,
          ownerId = ownerId
        )
        session?.sendMessageOrQueue(payload, "waterIntake")
      }
    }
    for (del in _pendingWaterDeletes.value) {
      if (del.day == today && del.state == SyncState.QUEUED && del.ownerId == ownerId) {
        val payload = OutboundPayloads.waterDelete(
          clientId = del.id,
          entryId = del.entryId,
          ownerId = ownerId
        )
        session?.sendMessageOrQueue(payload, "waterDelete")
      }
    }
  }

  fun tapWaterContainer(container: WaterContainer) {
    val ownerId = activeOwnerId() ?: return
    pruneStaleDayData()
    val today = CheckInDate.today()
    val tap = PendingWaterTap(
      id = UUID.randomUUID().toString(),
      volumeMl = container.servingVolumeMl,
      containerId = container.id,
      containerName = container.name,
      createdAtMs = System.currentTimeMillis(),
      day = today,
      state = SyncState.QUEUED,
      ownerId = ownerId
    )
    waterConsumedBaseline[tap.id] = _water.value?.takeIf { it.isToday }?.consumedMl ?: 0.0
    _pendingWaterTaps.value = _pendingWaterTaps.value + tap
    persistPendingWater()
    recomputeWaterState()
    ComplicationUpdater.requestAll(context)

    val payload = OutboundPayloads.waterTap(
      clientId = tap.id,
      entryDate = today,
      containerId = container.id,
      ownerId = ownerId
    )
    session?.sendMessageOrQueue(payload, "waterIntake")
    Haptics.click()
  }

  fun deleteWaterEntry(entry: WaterLogEntry) {
    val ownerId = activeOwnerId() ?: return
    pruneStaleDayData()
    if (entry.id.startsWith("pending_")) {
      val tapId = entry.id.removePrefix("pending_")
      _pendingWaterTaps.value = _pendingWaterTaps.value.filterNot { it.id == tapId }
      waterConsumedBaseline.remove(tapId)
      persistPendingWater()
      recomputeWaterState()
      ComplicationUpdater.requestAll(context)
      Haptics.click()
      return
    }
    if (_pendingWaterDeletes.value.any { it.entryId == entry.id }) return
    val del = PendingWaterDelete(
      id = UUID.randomUUID().toString(),
      entryId = entry.id,
      volumeMl = entry.volumeMl,
      createdAtMs = System.currentTimeMillis(),
      day = CheckInDate.today(),
      state = SyncState.QUEUED,
      ownerId = ownerId
    )
    _pendingWaterDeletes.value = _pendingWaterDeletes.value + del
    persistPendingWater()
    recomputeWaterState()
    ComplicationUpdater.requestAll(context)

    val payload = OutboundPayloads.waterDelete(
      clientId = del.id,
      entryId = entry.id,
      ownerId = ownerId
    )
    session?.sendMessageOrQueue(payload, "waterDelete")
    Haptics.click()
  }

  fun deleteLastWaterEntry() {
    val lastEntry = _waterLogEntries.value.lastOrNull() ?: return
    deleteWaterEntry(lastEntry)
  }

  fun retryFailedWaterTaps() {
    val ownerId = activeOwnerId() ?: return
    var changed = false
    val updated = _pendingWaterTaps.value.map { tap ->
      if (tap.state == SyncState.FAILED && tap.ownerId == ownerId) {
        changed = true
        val payload = OutboundPayloads.waterTap(
          clientId = tap.id,
          entryDate = tap.day,
          containerId = tap.containerId,
          ownerId = ownerId
        )
        session?.sendMessageOrQueue(payload, "waterIntake")
        tap.copy(state = SyncState.QUEUED)
      } else tap
    }
    if (changed) {
      _pendingWaterTaps.value = updated
      persistPendingWater()
      recomputeWaterState()
    }
  }

  fun acknowledge(clientId: String, ok: Boolean) {
    val checkInDay = pendingCheckInDays.remove(clientId)
    if (checkInDay != null) {
      if (ok) {
        unconfirmedDays.remove(checkInDay)
        _syncState.value = SyncState.SAVED
      } else {
        _syncState.value = SyncState.FAILED
      }
    }

    val tapIdx = _pendingWaterTaps.value.indexOfFirst { it.id == clientId }
    if (tapIdx >= 0) {
      val list = _pendingWaterTaps.value.toMutableList()
      val nextState = if (ok) SyncState.SAVED else SyncState.FAILED
      list[tapIdx] = list[tapIdx].copy(state = nextState)
      if (ok && !waterConsumedBaseline.containsKey(clientId)) {
        waterConsumedBaseline[clientId] = _water.value?.takeIf { it.isToday }?.consumedMl ?: 0.0
      }
      _pendingWaterTaps.value = list
      persistPendingWater()
      recomputeWaterState()
      ComplicationUpdater.requestAll(context)
    }

    val delIdx = _pendingWaterDeletes.value.indexOfFirst { it.id == clientId }
    if (delIdx >= 0) {
      val list = _pendingWaterDeletes.value.toMutableList()
      if (ok) {
        val entryId = list[delIdx].entryId
        val serverHasEntry = _water.value?.log?.any { it.id == entryId } == true
        if (!serverHasEntry) {
          list.removeAt(delIdx)
        } else {
          list[delIdx] = list[delIdx].copy(state = SyncState.SAVED)
        }
      } else {
        list.removeAt(delIdx)
      }
      _pendingWaterDeletes.value = list
      persistPendingWater()
      recomputeWaterState()
      ComplicationUpdater.requestAll(context)
    }
  }

  private fun recomputeWaterState() {
    val todaySnap = _water.value?.takeIf { it.isToday }
    val serverMl = todaySnap?.consumedMl ?: 0.0

    // Settle SAVED taps once server consumedMl has advanced past their baseline
    val remainingTaps = _pendingWaterTaps.value.filter { tap ->
      if (!tap.isToday) return@filter false
      if (tap.state == SyncState.SAVED) {
        val baseline = waterConsumedBaseline[tap.id]
        if (baseline != null && serverMl >= baseline + tap.volumeMl * 0.5) {
          waterConsumedBaseline.remove(tap.id)
          return@filter false
        }
      }
      true
    }
    if (remainingTaps.size != _pendingWaterTaps.value.size) {
      _pendingWaterTaps.value = remainingTaps
      persistPendingWater()
    }

    // Settle SAVED deletes once the entry is no longer in server log
    val serverEntryIds = todaySnap?.log?.map { it.id }?.toSet().orEmpty()
    val remainingDeletes = _pendingWaterDeletes.value.filter { del ->
      del.isToday && (del.state == SyncState.QUEUED || serverEntryIds.contains(del.entryId))
    }
    if (remainingDeletes.size != _pendingWaterDeletes.value.size) {
      _pendingWaterDeletes.value = remainingDeletes
      persistPendingWater()
    }

    val savedOptimisticMl = remainingTaps
      .filter { it.state == SyncState.SAVED }
      .sumOf { it.volumeMl }
    val queuedOptimisticMl = remainingTaps
      .filter { it.state == SyncState.QUEUED }
      .sumOf { it.volumeMl }
    val deletedPendingMl = remainingDeletes
      .filter { serverEntryIds.contains(it.entryId) }
      .sumOf { it.volumeMl }

    val totalMl = max(0.0, serverMl + savedOptimisticMl + queuedOptimisticMl - deletedPendingMl)
    _effectiveWaterMl.value = totalMl
    _queuedWaterMl.value = queuedOptimisticMl

    val deletedIds = remainingDeletes.map { it.entryId }.toSet()
    val baseLog = todaySnap?.log.orEmpty().filterNot { deletedIds.contains(it.id) }
    val timeFmt = SimpleDateFormat("HH:mm", Locale.getDefault())
    val pendingLog = remainingTaps
      .filter { it.state != SyncState.FAILED }
      .map { tap ->
        val name = tap.containerName.ifBlank {
          _waterContainers.value.firstOrNull { it.id == tap.containerId }?.name ?: "Drink"
        }
        WaterLogEntry(
          id = "pending_${tap.id}",
          name = name,
          volumeMl = tap.volumeMl,
          time = timeFmt.format(Date(tap.createdAtMs))
        )
      }
    _waterLogEntries.value = baseLog + pendingLog

    _waterSyncState.value = when {
      remainingTaps.any { it.state == SyncState.FAILED } -> SyncState.FAILED
      remainingTaps.any { it.state == SyncState.QUEUED } || remainingDeletes.any { it.state == SyncState.QUEUED } -> SyncState.QUEUED
      else -> SyncState.SAVED
    }
  }

  /**
   * Toggles a scheduled medication dose between taken and pending and queues the mutation to the phone.
   */
  fun toggleMedication(dose: MedicationDose) {
    val ownerId = activeOwnerId() ?: return
    val cur = _medications.value ?: return
    val list = cur.doses.toMutableList()
    val idx = list.indexOfFirst { it.id == dose.id }
    if (idx < 0) return
    val nextTaken = list[idx].status != MedicationDoseStatus.TAKEN
    val nextStatus = if (nextTaken) MedicationDoseStatus.TAKEN else MedicationDoseStatus.PENDING
    list[idx] = list[idx].copy(status = nextStatus)
    _medications.value = cur.copy(doses = list)
    TileUpdater.requestAll(context)

    val payload = OutboundPayloads.medicationTaken(
      clientId = UUID.randomUUID().toString(),
      entryDate = cur.day,
      medicationId = dose.medicationId,
      scheduleId = dose.scheduleId,
      taken = nextTaken,
      ownerId = ownerId
    )
    session?.sendMessageOrQueue(payload, "medicationTaken")
    Haptics.success()
  }

  fun endFast() {
    val ownerId = activeOwnerId() ?: return
    if (_fast.value == null) return
    _fast.value = null
    ComplicationUpdater.requestAll(context)
    session?.sendMessageOrQueue(
      OutboundPayloads.fastEnd(UUID.randomUUID().toString(), ownerId = ownerId),
      "fastEnd"
    )
    Haptics.stop()
  }

  fun startFast(presetId: String, hours: Double) {
    val ownerId = activeOwnerId() ?: return
    val nowMs = System.currentTimeMillis()
    val targetMs = nowMs + (hours * 3600_000.0).toLong()
    _fast.value = WatchFast(
      startedAtMs = nowMs,
      targetEndAtMs = targetMs,
      label = presetId
    )
    ComplicationUpdater.requestAll(context)
    session?.sendMessageOrQueue(
      OutboundPayloads.fastStart(
        presetId = presetId,
        clientId = UUID.randomUUID().toString(),
        ownerId = ownerId
      ),
      "fastStart"
    )
    Haptics.start()
  }

  fun updateLiveSteps(stepsCount: Int) {
    val cur = _steps.value
    val today = CheckInDate.today()
    if (cur != null && cur.day == today) {
      if (stepsCount > cur.count) {
        _steps.value = cur.copy(count = stepsCount)
      }
    } else if (stepsCount > 0) {
      _steps.value = StepsSnapshot(day = today, count = stepsCount)
    }
  }

  /**
   * Resets all cached account state, snapshots, and persisted preferences on sign-out or account switch.
   */
  fun clearAccountState(newOwnerId: String? = null) {
    confirmedOwnerId = newOwnerId?.takeIf { it.isNotEmpty() }
    _watchContext.value = WatchContext.empty
    _history.value = emptyList()
    _water.value = null
    _pendingWaterTaps.value = emptyList()
    _pendingWaterDeletes.value = emptyList()
    _effectiveWaterMl.value = 0.0
    _queuedWaterMl.value = 0.0
    _waterLogEntries.value = emptyList()
    _waterSyncState.value = SyncState.SAVED
    _waterContainers.value = emptyList()
    _nutrition.value = null
    _medications.value = null
    _startableWorkouts.value = emptyList()
    _scheduledWorkouts.value = emptyList()
    _fast.value = null
    _steps.value = null
    _sleep.value = null
    _exerciseSummary.value = null
    _hasBodyFatSeed.value = false
    userEditedWeight = false
    userEditedBodyFat = false
    waterConsumedBaseline.clear()
    pendingCheckInDays.clear()
    unconfirmedDays.clear()
    val editor = prefs.edit()
      .remove("last_context_json")
      .remove("pending_water_taps")
      .remove("pending_water_deletes")
    if (confirmedOwnerId != null) {
      editor.putString("context_owner_id", confirmedOwnerId)
    } else {
      editor.remove("context_owner_id")
    }
    editor.apply()
    ComplicationUpdater.requestAll(context)
    TileUpdater.requestAll(context)
  }

  /**
   * Applies a remote context JSON payload from the phone, validating account ownership and refreshing complications and tiles.
   */
  fun applyRemoteContextJson(obj: JSONObject, rawJson: String? = null) {
    val incomingOwner = obj.optStringOrNull("workoutServerId")?.takeIf { it.isNotEmpty() }
    val storedOwner = prefs.getString("context_owner_id", null)?.takeIf { it.isNotEmpty() }
    if (rawJson != null) {
      if (incomingOwner == null || (storedOwner != null && incomingOwner != storedOwner)) {
        clearAccountState(newOwnerId = incomingOwner)
        session?.clearQueuedWatchTransfers()
        if (incomingOwner == null) return
      } else {
        confirmedOwnerId = incomingOwner
      }
    }

    val previousUnit = _unit.value
    val nextCtx = ContextPayloadMapper.parseContext(obj, _watchContext.value)

    for (ackedId in nextCtx.ackedClientIds) {
      acknowledge(ackedId, true)
    }
    for (failedId in nextCtx.failedClientIds) {
      acknowledge(failedId, false)
    }

    _watchContext.value = nextCtx
    val effectiveUnit = nextCtx.effectiveWeightUnit
    _unit.value = effectiveUnit
    _history.value = nextCtx.history
    _water.value = nextCtx.water?.takeIf { it.isToday }
    _waterContainers.value = nextCtx.waterContainers ?: emptyList()
    nextCtx.waterGoalMl?.let { _waterGoalMl.value = it }
    nextCtx.waterDisplayUnit?.let { _waterDisplayUnit.value = it }
    _nutrition.value = nextCtx.nutrition?.takeIf { it.isToday }
    _medications.value = nextCtx.medications?.takeIf { it.isToday }
    _startableWorkouts.value = nextCtx.startableWorkouts ?: emptyList()
    _scheduledWorkouts.value = if (nextCtx.today.isNullOrEmpty() || nextCtx.today == CheckInDate.today()) {
      nextCtx.scheduledWorkouts ?: emptyList()
    } else {
      emptyList()
    }
    _fast.value = nextCtx.fast
    _steps.value = nextCtx.steps?.takeIf { it.isToday } ?: _steps.value?.takeIf { it.isToday }
    nextCtx.stepGoal?.let { _stepGoal.value = it }
    _sleep.value = nextCtx.sleep?.takeIf { it.isToday }
    _exerciseSummary.value = nextCtx.exerciseSummary?.takeIf { it.isToday }
    _enabledPages.value = nextCtx.visiblePages(workoutActive = workoutPageActive)

    if (!userEditedWeight) {
      val seedKg = nextCtx.todayWeightKg ?: nextCtx.lastWeightKg ?: nextCtx.history.lastOrNull()?.weightKg
      if (seedKg != null) {
        _draftWeight.value = clampAndSnap(effectiveUnit.fromKg(seedKg), effectiveUnit)
      }
    } else if (previousUnit != effectiveUnit) {
      val kg = previousUnit.toKg(_draftWeight.value)
      _draftWeight.value = clampAndSnap(effectiveUnit.fromKg(kg), effectiveUnit)
    }

    val seedBf = nextCtx.todayBodyFatPercentage ?: nextCtx.lastBodyFatPercentage
      ?: nextCtx.history.lastOrNull { it.bodyFatPercentage != null }?.bodyFatPercentage
    if (seedBf != null) {
      _hasBodyFatSeed.value = true
      if (!userEditedBodyFat) {
        _draftBodyFat.value = clampBodyFat(seedBf)
      }
    }

    recomputeWaterState()

    if (rawJson != null) {
      if (incomingOwner != null) {
        prefs.edit()
          .putString("context_owner_id", incomingOwner)
          .putString("last_context_json", rawJson)
          .apply()
        resendQueued()
      } else {
        prefs.edit()
          .remove("context_owner_id")
          .remove("last_context_json")
          .apply()
      }
    }
    ComplicationUpdater.requestAll(context)
    TileUpdater.requestAll(context)
  }

  fun handleAck(status: String) {
    _syncState.value = if (status == "failed") SyncState.FAILED else SyncState.SAVED
  }

  private fun persistPendingWater() {
    try {
      val tapsArr = JSONArray()
      for (t in _pendingWaterTaps.value) {
        tapsArr.put(
          JSONObject()
            .put("id", t.id)
            .put("volumeMl", t.volumeMl)
            .put("containerId", t.containerId)
            .put("containerName", t.containerName)
            .put("createdAtMs", t.createdAtMs)
            .put("day", t.day)
            .put("state", t.state.name)
            .put("ownerId", t.ownerId)
        )
      }
      val delArr = JSONArray()
      for (d in _pendingWaterDeletes.value) {
        delArr.put(
          JSONObject()
            .put("id", d.id)
            .put("entryId", d.entryId)
            .put("volumeMl", d.volumeMl)
            .put("createdAtMs", d.createdAtMs)
            .put("day", d.day)
            .put("state", d.state.name)
            .put("ownerId", d.ownerId)
        )
      }
      prefs.edit()
        .putString("pending_water_taps", tapsArr.toString())
        .putString("pending_water_deletes", delArr.toString())
        .apply()
    } catch (_: Throwable) {}
  }

  private fun restorePersistedPendingWater() {
    val persistedOwner = prefs.getString("context_owner_id", null)?.takeIf { it.isNotEmpty() }
    if (persistedOwner == null) {
      prefs.edit()
        .remove("pending_water_taps")
        .remove("pending_water_deletes")
        .apply()
      return
    }
    val today = CheckInDate.today()
    try {
      val tapsRaw = prefs.getString("pending_water_taps", null)
      if (!tapsRaw.isNullOrBlank()) {
        val arr = JSONArray(tapsRaw)
        val taps = mutableListOf<PendingWaterTap>()
        for (i in 0 until arr.length()) {
          val o = arr.optJSONObject(i) ?: continue
          val day = o.optString("day")
          val itemOwner = o.optString("ownerId", "")
          if (day != today || itemOwner != persistedOwner) continue
          val state = try {
            SyncState.valueOf(o.optString("state", "QUEUED"))
          } catch (_: Throwable) {
            SyncState.QUEUED
          }
          taps.add(
            PendingWaterTap(
              id = o.optString("id"),
              volumeMl = o.optDouble("volumeMl", 0.0),
              containerId = o.optInt("containerId", 0),
              containerName = o.optString("containerName", ""),
              createdAtMs = o.optLong("createdAtMs", System.currentTimeMillis()),
              day = day,
              state = state,
              ownerId = itemOwner
            )
          )
        }
        _pendingWaterTaps.value = taps
      }
      val delRaw = prefs.getString("pending_water_deletes", null)
      if (!delRaw.isNullOrBlank()) {
        val arr = JSONArray(delRaw)
        val dels = mutableListOf<PendingWaterDelete>()
        for (i in 0 until arr.length()) {
          val o = arr.optJSONObject(i) ?: continue
          val day = o.optString("day")
          val itemOwner = o.optString("ownerId", "")
          if (day != today || itemOwner != persistedOwner) continue
          val state = try {
            SyncState.valueOf(o.optString("state", "QUEUED"))
          } catch (_: Throwable) {
            SyncState.QUEUED
          }
          dels.add(
            PendingWaterDelete(
              id = o.optString("id"),
              entryId = o.optString("entryId"),
              volumeMl = o.optDouble("volumeMl", 0.0),
              createdAtMs = o.optLong("createdAtMs", System.currentTimeMillis()),
              day = day,
              state = state,
              ownerId = itemOwner
            )
          )
        }
        _pendingWaterDeletes.value = dels
      }
    } catch (_: Throwable) {}
  }

  private fun restorePersistedContext() {
    val persistedOwner = prefs.getString("context_owner_id", null)?.takeIf { it.isNotEmpty() } ?: run {
      prefs.edit().remove("last_context_json").apply()
      return
    }
    val raw = prefs.getString("last_context_json", null) ?: return
    try {
      val json = JSONObject(raw)
      if (json.optStringOrNull("workoutServerId") != persistedOwner) {
        clearAccountState(newOwnerId = null)
        return
      }
      applyRemoteContextJson(json, rawJson = null)
    } catch (_: Throwable) {}
  }

  private fun clampAndSnap(value: Double, unit: WeightUnit): Double {
    val minV = if (unit == WeightUnit.KG) 20.0 else 44.0
    val maxV = if (unit == WeightUnit.KG) 300.0 else 660.0
    val clamped = max(minV, min(maxV, value))
    return (clamped * 10.0).roundToInt() / 10.0
  }

  private fun clampBodyFat(value: Double): Double {
    val clamped = max(2.0, min(65.0, value))
    return (clamped * 10.0).roundToInt() / 10.0
  }
}

class WorkoutSessionStore(private val context: Context) {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

  var session: WearSessionTransport? = null
  var sensors: WatchSensorsController? = null
  var checkInStore: CheckInStore? = null

  private val _phase = MutableStateFlow(Phase.IDLE)
  val phase: StateFlow<Phase> = _phase.asStateFlow()

  private val _plan = MutableStateFlow<ActiveWorkoutPlan?>(null)
  val plan: StateFlow<ActiveWorkoutPlan?> = _plan.asStateFlow()

  private val _steps = MutableStateFlow<List<WorkoutStep>>(emptyList())
  val steps: StateFlow<List<WorkoutStep>> = _steps.asStateFlow()

  private val _stepIndex = MutableStateFlow(0)
  val stepIndex: StateFlow<Int> = _stepIndex.asStateFlow()

  private val _draftReps = MutableStateFlow(10)
  val draftReps: StateFlow<Int> = _draftReps.asStateFlow()

  private val _draftWeight = MutableStateFlow(20.0)
  val draftWeight: StateFlow<Double> = _draftWeight.asStateFlow()

  private val _draftDurationSeconds = MutableStateFlow(30)
  val draftDurationSeconds: StateFlow<Int> = _draftDurationSeconds.asStateFlow()

  private val _draftDistanceKm = MutableStateFlow(0.05)
  val draftDistanceKm: StateFlow<Double> = _draftDistanceKm.asStateFlow()

  private val _draftRpe = MutableStateFlow<Double?>(null)
  val draftRpe: StateFlow<Double?> = _draftRpe.asStateFlow()

  private val _restRemainingSeconds = MutableStateFlow(0)
  val restRemainingSeconds: StateFlow<Int> = _restRemainingSeconds.asStateFlow()

  private val _elapsedSeconds = MutableStateFlow(0)
  val elapsedSeconds: StateFlow<Int> = _elapsedSeconds.asStateFlow()

  private val _capRemainingSeconds = MutableStateFlow<Int?>(null)
  val capRemainingSeconds: StateFlow<Int?> = _capRemainingSeconds.asStateFlow()

  private val _setTimerRunning = MutableStateFlow(false)
  val setTimerRunning: StateFlow<Boolean> = _setTimerRunning.asStateFlow()

  private val _setTimerElapsedSeconds = MutableStateFlow(0)
  val setTimerElapsedSeconds: StateFlow<Int> = _setTimerElapsedSeconds.asStateFlow()

  private val _activePrBanner = MutableStateFlow<String?>(null)
  val activePrBanner: StateFlow<String?> = _activePrBanner.asStateFlow()

  private val _currentHeartRate = MutableStateFlow<Double?>(null)
  val currentHeartRate: StateFlow<Double?> = _currentHeartRate.asStateFlow()

  private val _averageHeartRate = MutableStateFlow<Double?>(null)
  val averageHeartRate: StateFlow<Double?> = _averageHeartRate.asStateFlow()

  private val _activeCalories = MutableStateFlow(0.0)
  val activeCalories: StateFlow<Double> = _activeCalories.asStateFlow()

  private val _completedSetsCount = MutableStateFlow(0)
  val completedSetsCount: StateFlow<Int> = _completedSetsCount.asStateFlow()

  private val _completedSummary = MutableStateFlow<WorkoutSummary?>(null)
  val completedSummary: StateFlow<WorkoutSummary?> = _completedSummary.asStateFlow()

  private val _startingPresetId = MutableStateFlow<String?>(null)
  val startingPresetId: StateFlow<String?> = _startingPresetId.asStateFlow()

  private val _startErrorMessage = MutableStateFlow<String?>(null)
  val startErrorMessage: StateFlow<String?> = _startErrorMessage.asStateFlow()

  private var startedAtMs: Long = 0L
  private var restEndsAtMs: Long = 0L
  private var activeSetTimerStartMs: Long? = null
  private var totalVolumeKg: Double = 0.0
  private var planModifiedOnWatch: Boolean = false
  private var tickerJob: Job? = null
  private var restTimerJob: Job? = null
  private var setTimerJob: Job? = null
  private var prBannerJob: Job? = null
  private var startTimeoutJob: Job? = null
  private val completedSetIds = mutableSetOf<String>()
  private val celebratedPrSetIds = mutableSetOf<String>()
  private val hrReadings = mutableListOf<Double>()

  enum class Phase {
    IDLE, ACTIVE_SET, REST, RPE_PROMPT, ASKING_PRESET_UPDATE, COMPLETED
  }

  val currentStep: WorkoutStep?
    get() = _steps.value.getOrNull(_stepIndex.value)

  val isWorkoutActive: Boolean
    get() = _phase.value != Phase.IDLE && _phase.value != Phase.COMPLETED && _phase.value != Phase.ASKING_PRESET_UPDATE

  val weightUnit: WeightUnit
    get() = checkInStore?.unit?.value ?: WeightUnit.KG

  val usesMiles: Boolean
    get() = checkInStore?.watchContext?.value?.distanceUnit == "mi"

  fun requestStartPreset(presetId: String) {
    if (_startingPresetId.value != null) return
    _startingPresetId.value = presetId
    _startErrorMessage.value = null
    startTimeoutJob?.cancel()
    val serverId = checkInStore?.activeOwnerId()
    session?.sendWorkoutStartRequest(
      OutboundPayloads.workoutStartRequest(presetId, serverId)
    ) { delivered ->
      scope.launch {
        if (!delivered) {
          _startingPresetId.value = null
          _startErrorMessage.value = "Phone isn't reachable. Open SparkyFitness on your phone and try again."
          Haptics.failure()
        }
      }
    }
    startTimeoutJob = scope.launch {
      delay(12000)
      if (_startingPresetId.value == presetId && _phase.value == Phase.IDLE) {
        _startingPresetId.value = null
        _startErrorMessage.value = "Couldn't start workout on phone. Make sure SparkyFitness is open."
        Haptics.failure()
      }
    }
  }

  fun clearStartError() {
    _startErrorMessage.value = null
  }

  fun startOrUpdatePlan(incoming: ActiveWorkoutPlan) {
    startTimeoutJob?.cancel()
    _startingPresetId.value = null
    _startErrorMessage.value = null

    val isSameSession = _plan.value?.sessionId == incoming.sessionId && _phase.value != Phase.IDLE
    _plan.value = incoming

    val builtSteps = flattenSteps(incoming)
    _steps.value = builtSteps
    checkAndCelebratePrs(incoming.prSetIds)

    if (!isSameSession) {
      startedAtMs = incoming.startedAtMs ?: System.currentTimeMillis()
      completedSetIds.clear()
      celebratedPrSetIds.clear()
      celebratedPrSetIds.addAll(incoming.prSetIds)
      hrReadings.clear()
      totalVolumeKg = 0.0
      planModifiedOnWatch = false
      _completedSetsCount.value = 0
      _activeCalories.value = 0.0
      _completedSummary.value = null
      _stepIndex.value = 0
      _phase.value = Phase.ACTIVE_SET
      checkInStore?.setWorkoutPageActive(true)
      seedDraftsForCurrentStep()
      startTicker()
      sensors?.startWorkoutSensors(
        sessionId = incoming.sessionId,
        exerciseEntryIdProvider = { currentStep?.exerciseEntryId ?: "workout" },
        enableGps = false,
        onHeartRate = { bpm ->
          scope.launch {
            _currentHeartRate.value = bpm
            hrReadings.add(bpm)
            _averageHeartRate.value = hrReadings.average()
          }
        },
        onCalories = { kcal ->
          scope.launch { _activeCalories.value = kcal }
        },
        onDistance = {}
      )
      Haptics.start()
    } else {
      val clampedIdx = min(_stepIndex.value, max(0, builtSteps.size - 1))
      _stepIndex.value = clampedIdx
      seedDraftsForCurrentStep()
    }
  }

  fun applyIntervalTiming(timing: IntervalTimingUpdate) {
    val cur = _plan.value ?: return
    if (cur.sessionId != timing.sessionId) return
    _plan.value = cur.copy(
      armedAtMs = timing.armedAtMs ?: cur.armedAtMs,
      capEndsAtMs = timing.capEndsAtMs ?: cur.capEndsAtMs,
      pausedAtMs = timing.pausedAtMs,
      excludedPauseSeconds = timing.excludedPauseSeconds
    )
  }

  fun applySetTargetsUpdate(update: ContextPayloadMapper.SetTargetsUpdate) {
    val curPlan = _plan.value ?: return
    if (curPlan.sessionId != update.sessionId) return
    val updatedSteps = _steps.value.map { step ->
      val t = update.targets[step.setId]
      if (t != null) {
        step.copy(
          targetWeightKg = t.weightKg ?: step.targetWeightKg,
          targetReps = t.reps ?: step.targetReps,
          targetDurationSec = t.durationSec ?: step.targetDurationSec,
          previousDurationSec = t.previousDurationSec ?: step.previousDurationSec,
          targetDistanceKm = t.distanceKm ?: step.targetDistanceKm
        )
      } else step
    }
    _steps.value = updatedSteps
    completedSetIds.clear()
    completedSetIds.addAll(update.completedSetIds)
    _completedSetsCount.value = completedSetIds.size
    checkAndCelebratePrs(update.prSetIds)
    seedDraftsForCurrentStep()
  }

  private fun checkAndCelebratePrs(prSetIds: Set<String>) {
    val newPrs = prSetIds.subtract(celebratedPrSetIds)
    if (newPrs.isNotEmpty()) {
      celebratedPrSetIds.addAll(newPrs)
      _activePrBanner.value = "🏆 New PR!"
      Haptics.success()
      prBannerJob?.cancel()
      prBannerJob = scope.launch {
        delay(3500)
        _activePrBanner.value = null
      }
    }
  }

  fun adjustReps(delta: Int) {
    _draftReps.value = max(0, _draftReps.value + delta)
    Haptics.click()
  }

  fun setDraftReps(reps: Int) {
    _draftReps.value = max(0, reps)
  }

  fun adjustWeight(deltaSteps: Int) {
    val u = weightUnit
    val step = if (u == WeightUnit.KG) 1.25 else 2.5
    val next = max(0.0, _draftWeight.value + deltaSteps * step)
    _draftWeight.value = (next * 100.0).roundToInt() / 100.0
    Haptics.click()
  }

  fun setDraftWeight(value: Double) {
    _draftWeight.value = max(0.0, (value * 100.0).roundToInt() / 100.0)
  }

  fun adjustDuration(deltaSeconds: Int) {
    _draftDurationSeconds.value = max(5, _draftDurationSeconds.value + deltaSeconds)
    Haptics.click()
  }

  fun adjustDistance(deltaSteps: Int) {
    val stepKm = if (usesMiles) 0.0160934 else 0.01 // ~0.01 mi or 10m
    val next = max(0.0, _draftDistanceKm.value + deltaSteps * stepKm)
    _draftDistanceKm.value = (next * 1000.0).roundToInt() / 1000.0
    Haptics.click()
  }

  fun startSetTimer() {
    val plan = _plan.value ?: return
    val step = currentStep ?: return
    val nowMs = System.currentTimeMillis()
    activeSetTimerStartMs = nowMs
    _setTimerRunning.value = true
    _setTimerElapsedSeconds.value = 0
    val targetSec = step.targetDurationSec ?: _draftDurationSeconds.value

    session?.sendMessageOrQueue(
      OutboundPayloads.setTimerStarted(plan.sessionId, step.setId, nowMs, plan.armedAtMs),
      "setTimerStarted"
    )
    Haptics.start()

    setTimerJob?.cancel()
    setTimerJob = scope.launch {
      var alertedTarget = false
      while (isActive && _setTimerRunning.value) {
        delay(250)
        val elapsed = max(0, ((System.currentTimeMillis() - nowMs) / 1000L).toInt())
        _setTimerElapsedSeconds.value = elapsed
        if (!alertedTarget && targetSec > 0 && elapsed >= targetSec) {
          alertedTarget = true
          Haptics.success()
        }
      }
    }
  }

  fun stopSetTimer() {
    val plan = _plan.value ?: return
    val step = currentStep ?: return
    val startedMs = activeSetTimerStartMs ?: return
    setTimerJob?.cancel()
    val elapsed = max(1, ((System.currentTimeMillis() - startedMs) / 1000L).toInt())
    _setTimerRunning.value = false
    activeSetTimerStartMs = null
    _draftDurationSeconds.value = elapsed
    session?.sendMessageOrQueue(
      OutboundPayloads.setTimerStopped(plan.sessionId, step.setId, elapsed, startedMs),
      "setTimerStopped"
    )
    Haptics.stop()
  }

  fun applyEdit(action: WorkoutEditAction) {
    val curPlan = _plan.value ?: return
    planModifiedOnWatch = true
    session?.sendMessageOrQueue(
      OutboundPayloads.workoutEdit(curPlan.sessionId, UUID.randomUUID().toString(), action),
      "workoutEdit"
    )

    // Optimistically update local plan & steps
    val updatedExercises = curPlan.exercises.toMutableList()
    when (action) {
      is WorkoutEditAction.AddSet -> {
        val exIdx = updatedExercises.indexOfFirst { it.exerciseEntryId == action.exerciseEntryId }
        if (exIdx >= 0) {
          val ex = updatedExercises[exIdx]
          val template = ex.sets.lastOrNull()
          val newSet = PlannedSet(
            setId = "watch_set_${UUID.randomUUID()}",
            targetReps = template?.targetReps ?: 10.0,
            targetWeightKg = template?.targetWeightKg,
            restSeconds = template?.restSeconds ?: 60,
            setType = "normal",
            targetDurationSec = template?.targetDurationSec,
            timed = template?.timed,
            carry = template?.carry,
            targetDistanceKm = template?.targetDistanceKm,
            weighted = template?.weighted
          )
          updatedExercises[exIdx] = ex.copy(sets = ex.sets + newSet)
        }
      }
      is WorkoutEditAction.DeleteSet -> {
        for (i in updatedExercises.indices) {
          val ex = updatedExercises[i]
          if (ex.sets.any { it.setId == action.setId } && ex.sets.size > 1) {
            updatedExercises[i] = ex.copy(sets = ex.sets.filterNot { it.setId == action.setId })
          }
        }
      }
      is WorkoutEditAction.SetSetType -> {
        for (i in updatedExercises.indices) {
          val ex = updatedExercises[i]
          val sets = ex.sets.map { s ->
            if (s.setId == action.setId) s.copy(setType = action.type) else s
          }
          updatedExercises[i] = ex.copy(sets = sets)
        }
      }
      is WorkoutEditAction.AddExercise -> {
        val suggested = checkInStore?.watchContext?.value?.suggestedExercises
          ?.firstOrNull { it.exerciseId == action.exerciseId }
        val newEntryId = "watch_ex_${UUID.randomUUID()}"
        val newEx = PlannedExercise(
          exerciseEntryId = newEntryId,
          name = suggested?.name ?: "Exercise",
          sets = listOf(
            PlannedSet(
              setId = "watch_set_${UUID.randomUUID()}",
              targetReps = 10.0,
              targetWeightKg = 20.0,
              restSeconds = 60,
              setType = "normal"
            )
          )
        )
        updatedExercises.add(newEx)
      }
      is WorkoutEditAction.DeleteExercise -> {
        if (updatedExercises.size > 1) {
          updatedExercises.removeAll { it.exerciseEntryId == action.exerciseEntryId }
        }
      }
    }
    val nextPlan = curPlan.copy(exercises = updatedExercises)
    _plan.value = nextPlan
    val nextSteps = flattenSteps(nextPlan)
    _steps.value = nextSteps
    _stepIndex.value = min(_stepIndex.value, max(0, nextSteps.size - 1))
    seedDraftsForCurrentStep()
    Haptics.click()
  }

  fun completeCurrentSet() {
    if (_setTimerRunning.value) {
      stopSetTimer()
    }
    val step = currentStep ?: return
    completedSetIds.add(step.setId)
    _completedSetsCount.value = completedSetIds.size

    val rpeEnabled = checkInStore?.watchContext?.value?.rpeEnabled == true
    if (rpeEnabled && _phase.value == Phase.ACTIVE_SET) {
      _draftRpe.value = 8.0
      _phase.value = Phase.RPE_PROMPT
      Haptics.click()
      return
    }
    commitCurrentSetAndAdvance(rpe = null)
  }

  fun submitRpe(rpe: Double?) {
    _draftRpe.value = rpe
    commitCurrentSetAndAdvance(rpe = rpe)
  }

  private fun commitCurrentSetAndAdvance(rpe: Double?) {
    val plan = _plan.value ?: return
    val step = currentStep ?: return
    val weightKg = if (step.bodyweight && !step.weighted) null else weightUnit.toKg(_draftWeight.value)
    if (weightKg != null && _draftReps.value > 0 && !step.timed) {
      totalVolumeKg += weightKg * _draftReps.value
    }
    val completed = CompletedSet(
      clientId = UUID.randomUUID().toString(),
      sessionId = plan.sessionId,
      setId = step.setId,
      weightKg = weightKg,
      reps = if (step.timed) null else _draftReps.value.toDouble(),
      duration = if (step.timed) _draftDurationSeconds.value else null,
      distanceKm = if (step.carry) _draftDistanceKm.value else step.targetDistanceKm,
      rpe = rpe
    )
    session?.sendMessageOrQueue(OutboundPayloads.setCompleted(completed), "setCompleted")
    Haptics.success()

    val nextIndex = _stepIndex.value + 1
    if (nextIndex >= _steps.value.size) {
      finishWorkout(notifyPhone = true)
    } else {
      val restSec = step.restSeconds
      _stepIndex.value = nextIndex
      seedDraftsForCurrentStep()
      if (restSec > 0) {
        startRestTimer(restSec)
      } else {
        _phase.value = Phase.ACTIVE_SET
      }
    }
  }

  fun skipRest() {
    val plan = _plan.value
    val prevEnds = restEndsAtMs
    restTimerJob?.cancel()
    _restRemainingSeconds.value = 0
    restEndsAtMs = 0L
    if (plan != null && prevEnds > 0L) {
      session?.sendMessageOrQueue(
        OutboundPayloads.restChanged(plan.sessionId, prevEnds, null),
        "restChanged"
      )
    }
    _phase.value = Phase.ACTIVE_SET
    Haptics.click()
  }

  fun addRestSeconds(extra: Int = 15) {
    val plan = _plan.value
    val prevEnds = restEndsAtMs
    _restRemainingSeconds.value = max(0, _restRemainingSeconds.value + extra)
    restEndsAtMs = System.currentTimeMillis() + (_restRemainingSeconds.value * 1000L)
    if (plan != null && prevEnds > 0L) {
      session?.sendMessageOrQueue(
        OutboundPayloads.restChanged(plan.sessionId, prevEnds, restEndsAtMs),
        "restChanged"
      )
    }
    Haptics.click()
  }

  fun skipCurrentExercise() {
    val step = currentStep ?: return
    val curIdx = _stepIndex.value
    val nextIdx = _steps.value.withIndex().indexOfFirst { (idx, s) ->
      idx > curIdx && s.exerciseEntryId != step.exerciseEntryId
    }
    if (nextIdx >= 0) {
      _stepIndex.value = nextIdx
      seedDraftsForCurrentStep()
      _phase.value = Phase.ACTIVE_SET
      Haptics.click()
    } else {
      finishWorkout(notifyPhone = true)
    }
  }

  fun jumpToStep(index: Int) {
    if (index in _steps.value.indices) {
      restTimerJob?.cancel()
      _stepIndex.value = index
      seedDraftsForCurrentStep()
      _phase.value = Phase.ACTIVE_SET
      Haptics.click()
    }
  }

  fun finishWorkout(notifyPhone: Boolean) {
    val plan = _plan.value ?: return
    tickerJob?.cancel()
    restTimerJob?.cancel()
    setTimerJob?.cancel()
    _setTimerRunning.value = false
    sensors?.stopWorkoutSensors()
    checkInStore?.setWorkoutPageActive(false)

    val duration = _elapsedSeconds.value
    val avgHr = _averageHeartRate.value
    val maxHr = hrReadings.maxOrNull()
    val kcal = _activeCalories.value.takeIf { it > 0 }

    if (notifyPhone) {
      session?.sendMessageOrQueue(OutboundPayloads.workoutStop(plan.sessionId), "workoutStop")
    }

    _completedSummary.value = WorkoutSummary(
      sessionId = plan.sessionId,
      workoutName = plan.workoutName,
      durationSeconds = duration,
      setsCompleted = _completedSetsCount.value,
      volumeKg = totalVolumeKg,
      averageBpm = avgHr,
      maxBpm = maxHr,
      activeEnergyKcal = kcal
    )
    if (notifyPhone && plan.fromPreset == true && planModifiedOnWatch) {
      _phase.value = Phase.ASKING_PRESET_UPDATE
    } else {
      _phase.value = Phase.COMPLETED
    }
    Haptics.success()
  }

  fun answerPresetUpdate(update: Boolean) {
    val plan = _plan.value
    if (plan != null) {
      session?.sendMessageOrQueue(
        OutboundPayloads.presetUpdateAnswer(plan.sessionId, update),
        "presetUpdateAnswer"
      )
    }
    _phase.value = Phase.COMPLETED
    Haptics.click()
  }

  fun discardWorkout(notifyPhone: Boolean = true) {
    val plan = _plan.value
    tickerJob?.cancel()
    restTimerJob?.cancel()
    setTimerJob?.cancel()
    _setTimerRunning.value = false
    sensors?.stopWorkoutSensors()
    checkInStore?.setWorkoutPageActive(false)
    if (notifyPhone && plan != null) {
      session?.sendMessageOrQueue(
        OutboundPayloads.workoutDiscard(plan.sessionId, plan.armedAtMs),
        "workoutDiscard"
      )
    }
    _plan.value = null
    _steps.value = emptyList()
    _stepIndex.value = 0
    _completedSummary.value = null
    _phase.value = Phase.IDLE
    Haptics.stop()
  }

  fun dismissSummary() {
    _plan.value = null
    _steps.value = emptyList()
    _stepIndex.value = 0
    _completedSummary.value = null
    _phase.value = Phase.IDLE
  }

  private fun startRestTimer(seconds: Int) {
    restTimerJob?.cancel()
    _restRemainingSeconds.value = seconds
    restEndsAtMs = System.currentTimeMillis() + seconds * 1000L
    _phase.value = Phase.REST
    restTimerJob = scope.launch {
      while (isActive && _restRemainingSeconds.value > 0) {
        delay(1000)
        val next = _restRemainingSeconds.value - 1
        _restRemainingSeconds.value = next
        if (next in 1..3) Haptics.click()
        if (next <= 0) {
          Haptics.start()
          _phase.value = Phase.ACTIVE_SET
          break
        }
      }
    }
  }

  private fun startTicker() {
    tickerJob?.cancel()
    tickerJob = scope.launch {
      while (isActive && isWorkoutActive) {
        val now = System.currentTimeMillis()
        val curPlan = _plan.value
        val pauseOffsetSec = curPlan?.excludedPauseSeconds ?: 0
        _elapsedSeconds.value = max(0, ((now - startedAtMs) / 1000L).toInt() - pauseOffsetSec)

        val capEnds = curPlan?.capEndsAtMs
        if (capEnds != null) {
          val rem = max(0, ((capEnds - now) / 1000L).toInt())
          _capRemainingSeconds.value = rem
        } else if (curPlan?.timeCapSeconds != null && curPlan.timeCapSeconds > 0) {
          _capRemainingSeconds.value = max(0, curPlan.timeCapSeconds - _elapsedSeconds.value)
        } else {
          _capRemainingSeconds.value = null
        }
        delay(1000)
      }
    }
  }

  private fun seedDraftsForCurrentStep() {
    val step = currentStep ?: return
    val u = weightUnit
    _draftReps.value = (step.targetReps ?: 10.0).toInt()
    val kg = step.targetWeightKg ?: 20.0
    _draftWeight.value = (u.fromKg(kg) * 10.0).roundToInt() / 10.0
    _draftDurationSeconds.value = step.targetDurationSec ?: step.previousDurationSec ?: 30
    _draftDistanceKm.value = step.targetDistanceKm ?: 0.05
    _draftRpe.value = null
    _setTimerRunning.value = false
    _setTimerElapsedSeconds.value = 0
  }

  private fun flattenSteps(plan: ActiveWorkoutPlan): List<WorkoutStep> {
    val out = mutableListOf<WorkoutStep>()
    plan.exercises.forEach { ex ->
      val totalSets = ex.sets.size
      ex.sets.forEachIndexed { idx, set ->
        out.add(
          WorkoutStep(
            setId = set.setId,
            exerciseEntryId = ex.exerciseEntryId,
            exerciseName = ex.name,
            setIndexInExercise = idx + 1,
            totalSetsInExercise = totalSets,
            setType = set.setType,
            supersetRun = ex.supersetRun,
            bodyweight = ex.bodyweight == true,
            timed = set.timed == true,
            carry = set.carry == true,
            weighted = set.weighted == true,
            targetWeightKg = set.targetWeightKg,
            targetReps = set.targetReps,
            targetDurationSec = set.targetDurationSec,
            previousDurationSec = set.previousDurationSec,
            targetDistanceKm = set.targetDistanceKm,
            restSeconds = set.restSeconds
          )
        )
      }
    }
    return out
  }
}

class RecordingStore {
  var session: WearSessionTransport? = null
  var sensors: WatchSensorsController? = null
  var checkInStore: CheckInStore? = null

  private val _state = MutableStateFlow<RecordingState?>(null)
  val state: StateFlow<RecordingState?> = _state.asStateFlow()

  private val _liveHeartRate = MutableStateFlow<Double?>(null)
  val liveHeartRate: StateFlow<Double?> = _liveHeartRate.asStateFlow()

  private var streamingSessionId: String? = null

  val isActive: Boolean
    get() {
      val s = _state.value ?: return false
      return s.status == "recording" || s.status == "paused"
    }

  fun applyRemoteState(next: RecordingState) {
    if (next.status == "ended" || next.status == "finished") {
      _state.value = null
      _liveHeartRate.value = null
      checkInStore?.setWorkoutPageActive(false)
      if (streamingSessionId != null) {
        streamingSessionId = null
        sensors?.stopWorkoutSensors()
      }
    } else {
      _state.value = next
      checkInStore?.setWorkoutPageActive(true)
      if (streamingSessionId != next.sessionId) {
        streamingSessionId = next.sessionId
        sensors?.startWorkoutSensors(
          sessionId = next.sessionId,
          exerciseEntryIdProvider = { "recording" },
          enableGps = false,
          sendAsRecordingHr = true,
          onHeartRate = { bpm -> _liveHeartRate.value = bpm },
          onCalories = {},
          onDistance = {}
        )
      }
    }
  }

  fun sendAction(action: String) {
    val s = _state.value ?: return
    session?.sendMessageOrQueue(OutboundPayloads.recordingControl(s.sessionId, action), "recordingControl")
    Haptics.click()
  }
}

class WatchRunStore(private val context: Context) {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private val prefs = context.getSharedPreferences("sparky_wear_runs", Context.MODE_PRIVATE)
  private val speaker = WatchRunSpeaker(context)

  var session: WearSessionTransport? = null
  var sensors: WatchSensorsController? = null
  var checkInStore: CheckInStore? = null

  private val _phase = MutableStateFlow(RunPhase.IDLE)
  val phase: StateFlow<RunPhase> = _phase.asStateFlow()

  private val _request = MutableStateFlow<WatchRunStartRequest?>(null)
  val request: StateFlow<WatchRunStartRequest?> = _request.asStateFlow()

  private val _settings = MutableStateFlow(WatchRunSettings())
  val settings: StateFlow<WatchRunSettings> = _settings.asStateFlow()

  private val _paceAlertEnabled = MutableStateFlow(false)
  val paceAlertEnabled: StateFlow<Boolean> = _paceAlertEnabled.asStateFlow()

  private val _heartRateAlertEnabled = MutableStateFlow(false)
  val heartRateAlertEnabled: StateFlow<Boolean> = _heartRateAlertEnabled.asStateFlow()

  private val _autoPaused = MutableStateFlow(false)
  val autoPaused: StateFlow<Boolean> = _autoPaused.asStateFlow()

  private val _elapsedSeconds = MutableStateFlow(0)
  val elapsedSeconds: StateFlow<Int> = _elapsedSeconds.asStateFlow()

  private val _distanceMeters = MutableStateFlow(0.0)
  val distanceMeters: StateFlow<Double> = _distanceMeters.asStateFlow()

  private val _heartRate = MutableStateFlow<Double?>(null)
  val heartRate: StateFlow<Double?> = _heartRate.asStateFlow()

  private val _activeCalories = MutableStateFlow(0.0)
  val activeCalories: StateFlow<Double> = _activeCalories.asStateFlow()

  private val _currentStepIndex = MutableStateFlow(0)
  val currentStepIndex: StateFlow<Int> = _currentStepIndex.asStateFlow()

  private val _stepRemainingSeconds = MutableStateFlow<Int?>(null)
  val stepRemainingSeconds: StateFlow<Int?> = _stepRemainingSeconds.asStateFlow()

  private val _lapCount = MutableStateFlow(0)
  val lapCount: StateFlow<Int> = _lapCount.asStateFlow()

  private val _activeAlertBanner = MutableStateFlow<String?>(null)
  val activeAlertBanner: StateFlow<String?> = _activeAlertBanner.asStateFlow()

  private var startedAtMs: Long = 0L
  private var stationarySeconds: Int = 0
  private var lastAlertAtSec: Int = -60
  private var tickerJob: Job? = null
  private val hrSeries = mutableListOf<List<Double>>()
  private val routeSeries = mutableListOf<List<Double>>()
  private val distanceSeries = mutableListOf<List<Double>>()
  private val laps = mutableListOf<Double>()
  private val lapDistances = mutableListOf<Double>()

  enum class RunPhase {
    IDLE, RUNNING, PAUSED, CONFIRMING_DISTANCE, COMPLETED
  }

  val usesMiles: Boolean
    get() = checkInStore?.watchContext?.value?.distanceUnit == "mi"

  val currentPaceSecondsPerKm: Double?
    get() {
      val distKm = _distanceMeters.value / 1000.0
      val sec = _elapsedSeconds.value
      if (distKm < 0.03 || sec < 5) return null
      return sec.toDouble() / distKm
    }

  fun startLocalRun(
    kind: String,
    place: String,
    plan: WatchRunPlan? = null,
    paceAlert: Boolean = false,
    heartRateAlert: Boolean = false
  ) {
    val ctx = checkInStore?.watchContext?.value
    val req = WatchRunStartRequest(
      requestId = UUID.randomUUID().toString(),
      kind = kind,
      place = place,
      requestedAtMs = System.currentTimeMillis(),
      plan = plan,
      settings = WatchRunSettings(
        autoPause = ctx?.runAutoPause ?: false,
        voiceCues = ctx?.runVoiceCues ?: true,
        paceBand = if (paceAlert) (ctx?.runPaceBand ?: WatchPaceBand.standard) else null,
        heartRateBand = if (heartRateAlert) (ctx?.runHeartRateBand ?: WatchHeartRateBand.standard) else null,
        checkInMinutes = ctx?.runCheckInMinutes
      )
    )
    startRun(req)
  }

  fun startRun(incoming: WatchRunStartRequest) {
    val ctx = checkInStore?.watchContext?.value
    val resolvedSettings = incoming.settings ?: WatchRunSettings(
      autoPause = ctx?.runAutoPause ?: false,
      voiceCues = ctx?.runVoiceCues ?: true,
      paceBand = ctx?.runPaceBand,
      heartRateBand = ctx?.runHeartRateBand,
      checkInMinutes = ctx?.runCheckInMinutes
    )
    _request.value = incoming
    _settings.value = resolvedSettings
    _paceAlertEnabled.value = resolvedSettings.paceBand != null
    _heartRateAlertEnabled.value = resolvedSettings.heartRateBand != null
    _autoPaused.value = false
    _elapsedSeconds.value = 0
    _distanceMeters.value = 0.0
    _heartRate.value = null
    _activeCalories.value = 0.0
    _currentStepIndex.value = 0
    _lapCount.value = 0
    _activeAlertBanner.value = null
    _stepRemainingSeconds.value = incoming.plan?.steps?.firstOrNull()?.seconds?.toInt()
    hrSeries.clear()
    routeSeries.clear()
    distanceSeries.clear()
    laps.clear()
    lapDistances.clear()
    stationarySeconds = 0
    lastAlertAtSec = -60
    startedAtMs = System.currentTimeMillis()
    _phase.value = RunPhase.RUNNING
    checkInStore?.setWorkoutPageActive(true)

    val scale = getIndoorScale(incoming.kind)
    val baseStrideMeters = if (incoming.kind == "walk") 0.74 else 1.02
    val indoorStride = if (incoming.place == "indoor") baseStrideMeters * scale else 0.0

    var lastSensorMeters = 0.0
    sensors?.startWorkoutSensors(
      sessionId = incoming.requestId,
      exerciseEntryIdProvider = { incoming.kind },
      enableGps = incoming.place == "outdoor",
      indoorStrideMeters = indoorStride,
      onHeartRate = { bpm ->
        scope.launch {
          _heartRate.value = bpm
          val elapsedSec = _elapsedSeconds.value.toDouble()
          hrSeries.add(listOf(elapsedSec, bpm))
        }
      },
      onCalories = { kcal ->
        scope.launch { _activeCalories.value = kcal }
      },
      onDistance = { meters ->
        scope.launch {
          val delta = (meters - lastSensorMeters).coerceAtLeast(0.0)
          lastSensorMeters = meters
          if (_phase.value == RunPhase.RUNNING) {
            val next = _distanceMeters.value + delta
            _distanceMeters.value = next
            distanceSeries.add(listOf(_elapsedSeconds.value.toDouble(), next))
          }
        }
      },
      onLocationPoint = { lat, lon, tsMs ->
        scope.launch { routeSeries.add(listOf(lat, lon, tsMs.toDouble())) }
      }
    )

    val startCue = incoming.plan?.startText ?: incoming.plan?.steps?.firstOrNull()?.label
      ?: "Starting ${incoming.place} ${incoming.kind}"
    emitVoiceCue(startCue)

    startTicker()
    Haptics.start()
  }

  private val handledControlIds = LinkedHashSet<String>()

  fun discardRun() {
    tickerJob?.cancel()
    sensors?.stopWorkoutSensors()
    dismiss()
  }

  fun handleRemoteControl(action: String, json: JSONObject? = null) {
    val controlId = json?.optStringOrNull("controlId")
    if (controlId != null && !handledControlIds.add(controlId)) return
    if (handledControlIds.size > 200) {
      handledControlIds.remove(handledControlIds.first())
    }
    when (action) {
      "pause" -> pause()
      "resume" -> resume()
      "stop", "end", "finish" -> finish()
      "discard" -> discardRun()
      "skip", "skipStep" -> skipStep()
      "lap" -> markLap()
      "autoPauseOn", "autoPauseOff" -> {
        val enabled = action == "autoPauseOn"
        _settings.value = _settings.value.copy(autoPause = enabled)
        if (!enabled && _autoPaused.value) {
          _autoPaused.value = false
          _phase.value = RunPhase.RUNNING
        }
        broadcastRunLive()
      }
      "voiceCuesOn", "voiceCuesOff" -> {
        _settings.value = _settings.value.copy(voiceCues = action == "voiceCuesOn")
        broadcastRunLive()
      }
      "paceAlertOn", "paceAlertOff" -> {
        val enabled = action == "paceAlertOn"
        _paceAlertEnabled.value = enabled
        val cur = _settings.value
        if (enabled && cur.paceBand == null) {
          _settings.value = cur.copy(
            paceBand = checkInStore?.watchContext?.value?.runPaceBand ?: WatchPaceBand.standard
          )
        }
        broadcastRunLive()
      }
      "heartRateAlertOn", "heartRateAlertOff" -> {
        val enabled = action == "heartRateAlertOn"
        _heartRateAlertEnabled.value = enabled
        val cur = _settings.value
        if (enabled && cur.heartRateBand == null) {
          _settings.value = cur.copy(
            heartRateBand = checkInStore?.watchContext?.value?.runHeartRateBand ?: WatchHeartRateBand.standard
          )
        }
        broadcastRunLive()
      }
      "settings" -> {
        if (json != null) {
          val cur = _settings.value
          val nextAutoPause = json.optBooleanOrNull("autoPause") ?: cur.autoPause
          val nextVoiceCues = json.optBooleanOrNull("voiceCues") ?: cur.voiceCues
          _settings.value = cur.copy(autoPause = nextAutoPause, voiceCues = nextVoiceCues)
          json.optBooleanOrNull("paceAlert")?.let { _paceAlertEnabled.value = it }
          json.optBooleanOrNull("heartRateAlert")?.let { _heartRateAlertEnabled.value = it }
        }
      }
    }
  }

  fun acknowledgeCue(id: String) {
    // Phone acknowledged speaking cue
  }

  fun toggleAutoPause() {
    val cur = _settings.value
    _settings.value = cur.copy(autoPause = !cur.autoPause)
    if (!_settings.value.autoPause && _autoPaused.value) {
      _autoPaused.value = false
      _phase.value = RunPhase.RUNNING
    }
    Haptics.click()
  }

  fun toggleVoiceCues() {
    val cur = _settings.value
    _settings.value = cur.copy(voiceCues = !cur.voiceCues)
    Haptics.click()
  }

  fun togglePaceAlert() {
    val next = !_paceAlertEnabled.value
    _paceAlertEnabled.value = next
    val cur = _settings.value
    if (next && cur.paceBand == null) {
      _settings.value = cur.copy(paceBand = checkInStore?.watchContext?.value?.runPaceBand ?: WatchPaceBand.standard)
    }
    Haptics.click()
  }

  fun toggleHeartRateAlert() {
    val next = !_heartRateAlertEnabled.value
    _heartRateAlertEnabled.value = next
    val cur = _settings.value
    if (next && cur.heartRateBand == null) {
      _settings.value = cur.copy(heartRateBand = checkInStore?.watchContext?.value?.runHeartRateBand ?: WatchHeartRateBand.standard)
    }
    Haptics.click()
  }

  fun testVoiceCue() {
    speaker.speak("Voice cues active. Have a great workout!")
    Haptics.click()
  }

  fun markLap() {
    if (_phase.value != RunPhase.RUNNING && _phase.value != RunPhase.PAUSED) return
    val prevLapTime = laps.sum()
    val lapDuration = max(1.0, _elapsedSeconds.value.toDouble() - prevLapTime)
    val prevLapDist = lapDistances.sum()
    val lapDist = max(0.0, _distanceMeters.value - prevLapDist)
    laps.add(lapDuration)
    lapDistances.add(lapDist)
    _lapCount.value = laps.size
    emitVoiceCue("Lap ${laps.size}")
    Haptics.directionUp()
  }

  fun pause() {
    if (_phase.value == RunPhase.RUNNING) {
      _autoPaused.value = false
      _phase.value = RunPhase.PAUSED
      broadcastRunLive()
      Haptics.stop()
    }
  }

  fun resume() {
    if (_phase.value == RunPhase.PAUSED) {
      _autoPaused.value = false
      _phase.value = RunPhase.RUNNING
      broadcastRunLive()
      Haptics.start()
    }
  }

  fun skipStep() {
    val steps = _request.value?.plan?.steps ?: return
    val next = _currentStepIndex.value + 1
    if (next < steps.size) {
      _currentStepIndex.value = next
      _stepRemainingSeconds.value = steps[next].seconds.toInt()
      emitVoiceCue(steps[next].label)
      Haptics.directionUp()
    }
  }

  fun finish() {
    val req = _request.value ?: return
    tickerJob?.cancel()
    sensors?.stopWorkoutSensors()
    if (req.place == "indoor" && _distanceMeters.value > 10.0) {
      _phase.value = RunPhase.CONFIRMING_DISTANCE
      Haptics.stop()
    } else {
      completeAndSendRun(actualDistanceMeters = null)
    }
  }

  fun confirmDistance(actualMeters: Double?) {
    completeAndSendRun(actualDistanceMeters = actualMeters)
  }

  private fun completeAndSendRun(actualDistanceMeters: Double?) {
    val req = _request.value ?: return
    checkInStore?.setWorkoutPageActive(false)
    val estimated = _distanceMeters.value
    val finalMeters = actualDistanceMeters?.takeIf { it > 0.0 } ?: estimated
    val prevScale = getIndoorScale(req.kind)
    val nextScale = if (req.place == "indoor" && actualDistanceMeters != null && estimated > 50.0) {
      val ratio = (actualDistanceMeters / estimated).coerceIn(0.5, 1.5)
      val blended = (prevScale * 0.5) + (prevScale * ratio * 0.5)
      saveIndoorScale(req.kind, blended.coerceIn(0.5, 1.5))
      blended.coerceIn(0.5, 1.5)
    } else prevScale

    _distanceMeters.value = finalMeters
    val endedAtMs = System.currentTimeMillis()
    val result = WatchRunResult(
      clientId = UUID.randomUUID().toString(),
      kind = req.kind,
      place = req.place,
      startedAtMs = startedAtMs,
      endedAtMs = endedAtMs,
      activeSeconds = _elapsedSeconds.value,
      distanceMeters = finalMeters,
      activeEnergyKcal = _activeCalories.value,
      route = routeSeries.toList(),
      heartRate = hrSeries.toList(),
      laps = laps.toList(),
      lapDistances = lapDistances.toList(),
      distanceSeries = distanceSeries.toList(),
      plan = req.plan,
      planCompleted = true,
      distanceScale = nextScale,
      estimatedDistanceMeters = if (req.place == "indoor") estimated else null
    )

    req.plan?.doneText?.let { emitVoiceCue(it) }
    session?.sendWatchRunFinished(result)
    _phase.value = RunPhase.COMPLETED
    Haptics.success()
  }

  fun dismiss() {
    tickerJob?.cancel()
    checkInStore?.setWorkoutPageActive(false)
    _request.value = null
    _phase.value = RunPhase.IDLE
  }

  private fun emitVoiceCue(text: String) {
    if (!_settings.value.voiceCues || text.isBlank()) return
    speaker.speak(text)
    val id = UUID.randomUUID().toString()
    session?.sendMessageOrQueue(OutboundPayloads.runCue(id, text), "runCue")
  }

  private fun getIndoorScale(kind: String): Double {
    val ctxScale = checkInStore?.watchContext?.value?.indoorDistanceScale
    val defaultScale = if (kind == "walk") (ctxScale?.walk ?: 1.0) else (ctxScale?.run ?: 1.0)
    return prefs.getFloat("indoor_scale_$kind", defaultScale.toFloat()).toDouble()
  }

  private fun saveIndoorScale(kind: String, scale: Double) {
    prefs.edit().putFloat("indoor_scale_$kind", scale.toFloat()).apply()
  }

  private fun broadcastRunLive() {
    val req = _request.value ?: return
    val steps = req.plan?.steps.orEmpty()
    val curStep = steps.getOrNull(_currentStepIndex.value)
    val nextStep = steps.getOrNull(_currentStepIndex.value + 1)
    val status = when (_phase.value) {
      RunPhase.RUNNING -> "running"
      RunPhase.PAUSED -> "paused"
      else -> "ended"
    }
    val payload = OutboundPayloads.runLive(
      runId = req.requestId,
      kind = req.kind,
      place = req.place,
      status = status,
      autoPaused = _autoPaused.value,
      settings = _settings.value,
      paceAlert = _paceAlertEnabled.value,
      heartRateAlert = _heartRateAlertEnabled.value,
      elapsed = _elapsedSeconds.value.toDouble(),
      distanceMeters = _distanceMeters.value,
      heartRate = _heartRate.value,
      energyKcal = _activeCalories.value,
      lapCount = _lapCount.value,
      stepLabel = curStep?.label,
      stepRemaining = _stepRemainingSeconds.value?.toDouble(),
      nextLabel = nextStep?.label,
      requestId = req.requestId
    )
    session?.sendLiveOnly(payload)
  }

  private fun checkPaceAndHrAlerts(elapsedSec: Int) {
    if (elapsedSec - lastAlertAtSec < 45 || elapsedSec < 30) return
    val steps = _request.value?.plan?.steps.orEmpty()
    val curStep = steps.getOrNull(_currentStepIndex.value)

    if (_heartRateAlertEnabled.value) {
      val band = curStep?.heartRate ?: _settings.value.heartRateBand
      val bpm = _heartRate.value
      if (band != null && bpm != null) {
        if (bpm > band.maxBpm) {
          val msg = "Heart rate high: ${bpm.toInt()} BPM"
          _activeAlertBanner.value = msg
          lastAlertAtSec = elapsedSec
          emitVoiceCue(msg)
          Haptics.warning()
          return
        } else if (bpm < band.minBpm) {
          val msg = "Heart rate low: ${bpm.toInt()} BPM"
          _activeAlertBanner.value = msg
          lastAlertAtSec = elapsedSec
          emitVoiceCue(msg)
          Haptics.warning()
          return
        }
      }
    }

    if (_paceAlertEnabled.value) {
      val band = curStep?.pace ?: _settings.value.paceBand
      val paceSecKm = currentPaceSecondsPerKm
      if (band != null && paceSecKm != null) {
        if (paceSecKm > band.maxSecondsPerKm) {
          val msg = "Pace below target"
          _activeAlertBanner.value = msg
          lastAlertAtSec = elapsedSec
          emitVoiceCue(msg)
          Haptics.warning()
          return
        } else if (paceSecKm < band.minSecondsPerKm) {
          val msg = "Pace above target"
          _activeAlertBanner.value = msg
          lastAlertAtSec = elapsedSec
          emitVoiceCue(msg)
          Haptics.warning()
          return
        }
      }
    }

    if (elapsedSec - lastAlertAtSec >= 10) {
      _activeAlertBanner.value = null
    }
  }

  private fun startTicker() {
    tickerJob?.cancel()
    tickerJob = scope.launch {
      while (isActive && (_phase.value == RunPhase.RUNNING || _phase.value == RunPhase.PAUSED)) {
        delay(1000)

        // Auto-pause check
        if (_settings.value.autoPause) {
          val speed = sensors?.effectiveSpeedMps() ?: 1.0
          if (_phase.value == RunPhase.RUNNING) {
            if (speed < 0.45 && _elapsedSeconds.value > 10) {
              stationarySeconds += 1
              if (stationarySeconds >= 5) {
                _autoPaused.value = true
                _phase.value = RunPhase.PAUSED
                Haptics.stop()
              }
            } else {
              stationarySeconds = 0
            }
          } else if (_phase.value == RunPhase.PAUSED && _autoPaused.value && speed >= 0.7) {
            stationarySeconds = 0
            _autoPaused.value = false
            _phase.value = RunPhase.RUNNING
            Haptics.start()
          }
        }

        if (_phase.value == RunPhase.RUNNING) {
          val nextElapsed = _elapsedSeconds.value + 1
          _elapsedSeconds.value = nextElapsed

          val checkInMins = _settings.value.checkInMinutes
          if (checkInMins != null && checkInMins > 0 && nextElapsed % (checkInMins * 60) == 0) {
            val distKm = _distanceMeters.value / 1000.0
            emitVoiceCue(String.format(Locale.US, "%d minutes. Distance %.2f kilometers.", nextElapsed / 60, distKm))
          }

          checkPaceAndHrAlerts(nextElapsed)

          val rem = _stepRemainingSeconds.value
          if (rem != null) {
            if (rem > 1) {
              _stepRemainingSeconds.value = rem - 1
            } else {
              val steps = _request.value?.plan?.steps.orEmpty()
              val nextIdx = _currentStepIndex.value + 1
              if (nextIdx < steps.size) {
                _currentStepIndex.value = nextIdx
                _stepRemainingSeconds.value = steps[nextIdx].seconds.toInt()
                emitVoiceCue(steps[nextIdx].label)
                Haptics.directionUp()
              } else {
                _stepRemainingSeconds.value = null
                finish()
              }
            }
          }
        }

        if (_elapsedSeconds.value % 3 == 0) {
          broadcastRunLive()
        }
      }
    }
  }
}

interface WearSessionTransport {
  fun sendWeightCheckIn(payload: JSONObject, onResult: (Boolean) -> Unit)
  fun sendWorkoutStartRequest(payload: JSONObject, onResult: (Boolean) -> Unit)
  fun sendMessageOrQueue(payload: JSONObject, queueType: String)
  fun sendLiveOnly(payload: JSONObject) {}
  fun sendWatchRunFinished(result: WatchRunResult)
  fun sendHeartRateBatch(batch: HeartRateBatch)
  fun clearQueuedWatchTransfers() {}
}
