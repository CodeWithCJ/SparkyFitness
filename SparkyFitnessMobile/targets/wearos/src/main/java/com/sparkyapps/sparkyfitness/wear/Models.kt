package com.sparkyapps.sparkyfitness.wear

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt

enum class WatchPage(val key: String, val label: String) {
  GOALS("goals", "Goals"),
  WATER("water", "Water"),
  MEDICATIONS("medications", "Medications"),
  ENTRY("entry", "Weight"),
  TREND("trend", "Trend"),
  WORKOUT("workout", "Workout"),
  NOW_PLAYING("nowPlaying", "Now Playing"),
  FASTING("fasting", "Fasting"),
  STEPS("steps", "Steps");

  companion object {
    val defaultOrder = listOf(
      GOALS, WATER, MEDICATIONS, ENTRY, TREND, WORKOUT, FASTING, STEPS
    )

    fun fromKey(key: String?): WatchPage? =
      entries.firstOrNull { it.key.equals(key, ignoreCase = true) }
  }
}

enum class WeightUnit(val rawValue: String, val suffix: String) {
  KG("kg", "kg"),
  LBS("lbs", "lbs");

  fun fromKg(kg: Double): Double = if (this == LBS) kg / WeightRounding.KG_PER_LB else kg
  fun toKg(value: Double): Double = if (this == LBS) value * WeightRounding.KG_PER_LB else value
  fun displayedFromKg(kg: Double): Double = WeightRounding.displayed(kg = kg, lbs = this == LBS)

  companion object {
    fun fromRaw(raw: String?): WeightUnit? = when (raw?.lowercase()) {
      "kg" -> KG
      "lbs", "lb" -> LBS
      else -> null
    }
  }
}

enum class SyncState {
  SAVED,
  QUEUED,
  FAILED
}

object CheckInDate {
  fun today(): String {
    val fmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    return fmt.format(Date())
  }

  fun headerLabel(day: String): String {
    return try {
      val parser = SimpleDateFormat("yyyy-MM-dd", Locale.US)
      val date = parser.parse(day) ?: return day
      SimpleDateFormat("EEE, MMM d", Locale.getDefault()).format(date)
    } catch (_: Throwable) {
      day
    }
  }

  fun daysBetween(fromDay: String?, toDay: String = today()): Int {
    if (fromDay.isNullOrBlank()) return 1
    return try {
      val parser = SimpleDateFormat("yyyy-MM-dd", Locale.US)
      val d1 = parser.parse(fromDay)?.time ?: return 1
      val d2 = parser.parse(toDay)?.time ?: return 1
      val diffDays = ((d2 - d1) / (86_400_000L)).toInt()
      maxOf(1, diffDays)
    } catch (_: Throwable) {
      1
    }
  }
}

data class CheckIn(
  val id: String,
  val entryDate: String,
  val weightKg: Double,
  val bodyFatPercentage: Double?,
  val capturedAtMs: Long = System.currentTimeMillis()
)

data class HistoryPoint(
  val day: String,
  val weightKg: Double,
  val bodyFatPercentage: Double? = null
)

data class MacroGoal(
  val consumed: Double,
  val goal: Double,
  val progress: Double
) {
  val hasGoal: Boolean get() = goal > 0
}

data class NutrientRow(
  val key: String,
  val label: String,
  val unit: String,
  val consumed: Double,
  val goal: Double?,
  val progress: Double
)

data class NutritionSnapshot(
  val day: String,
  val caloriesConsumed: Double,
  val caloriesBurned: Double,
  val caloriesRemaining: Double,
  val calorieProgress: Double,
  val carbs: MacroGoal,
  val fat: MacroGoal,
  val protein: MacroGoal,
  val rows: List<NutrientRow>?
) {
  val isToday: Boolean get() = day == CheckInDate.today()
}

data class WaterContainer(
  val id: Int,
  val name: String,
  val servingVolumeMl: Double,
  val unit: String
) {
  val displayVolume: String
    get() = when (unit.lowercase()) {
      "oz" -> "${(servingVolumeMl / 29.5735).roundToInt()} oz"
      "liter", "l" -> String.format(Locale.US, "%.2f L", servingVolumeMl / 1000.0)
      else -> "${servingVolumeMl.roundToInt()} ml"
    }
}

data class WaterLogEntry(
  val id: String,
  val name: String,
  val volumeMl: Double,
  val time: String
)

data class WaterSnapshot(
  val day: String,
  val consumedMl: Double,
  val fromFoodMl: Double?,
  val log: List<WaterLogEntry>
) {
  val isToday: Boolean get() = day == CheckInDate.today()
}

data class PendingWaterTap(
  val id: String,
  val volumeMl: Double,
  val containerId: Int,
  val containerName: String = "",
  val createdAtMs: Long,
  val day: String,
  val state: SyncState,
  val ownerId: String = ""
) {
  val isToday: Boolean get() = day == CheckInDate.today()
}

data class PendingWaterDelete(
  val id: String,
  val entryId: String,
  val volumeMl: Double = 0.0,
  val createdAtMs: Long,
  val day: String,
  val state: SyncState = SyncState.QUEUED,
  val ownerId: String = ""
) {
  val isToday: Boolean get() = day == CheckInDate.today()
}

enum class MedicationDoseStatus(val rawValue: String) {
  PENDING("pending"),
  TAKEN("taken"),
  SKIPPED("skipped");

  companion object {
    fun fromRaw(raw: String?): MedicationDoseStatus? =
      entries.firstOrNull { it.rawValue == raw }
  }
}

data class MedicationDose(
  val id: String,
  val medicationId: String,
  val scheduleId: String,
  val name: String,
  val detail: String,
  val time: String,
  val status: MedicationDoseStatus
)

data class MedicationSnapshot(
  val day: String,
  val doses: List<MedicationDose>
) {
  val isToday: Boolean get() = day == CheckInDate.today()
}

data class PendingMedicationTap(
  val id: String,
  val doseId: String,
  val medicationId: String,
  val scheduleId: String,
  val createdAtMs: Long,
  val day: String,
  val state: SyncState,
  val isUndo: Boolean = false
) {
  val isToday: Boolean get() = day == CheckInDate.today()
}

data class WatchFast(
  val startedAtMs: Long,
  val targetEndAtMs: Long?,
  val label: String?
)

data class StepsSnapshot(
  val day: String,
  val count: Int
) {
  val isToday: Boolean get() = day == CheckInDate.today()
}

data class SleepSnapshot(
  val day: String,
  val totalSeconds: Int,
  val timeInBedSeconds: Int,
  val sleepScore: Int? = null,
  val bedtime: String = "",
  val wakeTime: String = "",
  val deepSeconds: Int? = null,
  val remSeconds: Int? = null,
  val lightSeconds: Int? = null,
  val awakeSeconds: Int? = null,
  val restingHeartRate: Int? = null,
  val hrvMs: Int? = null,
  val spo2: Int? = null,
  val napCount: Int = 0,
  val napSeconds: Int = 0
) {
  val isToday: Boolean get() = day == CheckInDate.today()
}

data class ExerciseSessionItem(
  val name: String,
  val durationMinutes: Int,
  val calories: Int
)

data class ExerciseSummarySnapshot(
  val day: String,
  val minutes: Int,
  val minutesGoal: Int,
  val calories: Int,
  val caloriesGoal: Int,
  val sessionCount: Int,
  val sessions: List<ExerciseSessionItem> = emptyList()
) {
  val isToday: Boolean get() = day == CheckInDate.today()
}

data class StartableWorkout(
  val presetId: String,
  val name: String
)

data class ScheduledWorkout(
  val presetId: String,
  val name: String,
  val planName: String,
  val caption: String
)

data class SuggestedExercise(
  val exerciseId: String,
  val name: String
)

data class WatchPaceBand(
  val minSecondsPerKm: Double,
  val maxSecondsPerKm: Double
) {
  companion object {
    val standard = WatchPaceBand(300.0, 360.0)
    fun normalized(min: Double?, max: Double?): WatchPaceBand? {
      if (min == null || max == null || min <= 0 || max <= 0) return null
      return WatchPaceBand(minOf(min, max), maxOf(min, max))
    }
  }
}

data class WatchHeartRateBand(
  val minBpm: Double,
  val maxBpm: Double
) {
  companion object {
    val standard = WatchHeartRateBand(130.0, 165.0)
    fun normalized(min: Double?, max: Double?): WatchHeartRateBand? {
      if (min == null || max == null || min <= 0 || max <= 0) return null
      return WatchHeartRateBand(minOf(min, max), maxOf(min, max))
    }
  }
}

data class WatchRunPlan(
  val id: String,
  val name: String,
  val programId: String? = null,
  val programIndex: Int? = null,
  val steps: List<Step>,
  val activity: String? = null,
  val startText: String? = null,
  val doneText: String? = null
) {
  data class Step(
    val label: String,
    val seconds: Double,
    val pace: WatchPaceBand? = null,
    val heartRate: WatchHeartRateBand? = null,
    val meters: Double? = null,
    val unit: String? = null
  )
}

data class IndoorDistanceScale(
  val walk: Double = 1.0,
  val run: Double = 1.0
)

data class WatchContext(
  val today: String? = null,
  val todayWeightKg: Double? = null,
  val todayBodyFatPercentage: Double? = null,
  val lastWeightKg: Double? = null,
  val lastBodyFatPercentage: Double? = null,
  val lastEntryDate: String? = null,
  val history: List<HistoryPoint> = emptyList(),
  val ackedClientIds: List<String> = emptyList(),
  val failedClientIds: List<String> = emptyList(),
  val updatedAtMs: Long = 0L,
  val weightUnit: WeightUnit? = null,
  val nutrition: NutritionSnapshot? = null,
  val water: WaterSnapshot? = null,
  val waterContainers: List<WaterContainer>? = null,
  val waterGoalMl: Double? = null,
  val waterDisplayUnit: String? = null,
  val generatedAtMs: Long? = null,
  val hapticsEnabled: Boolean? = null,
  val restAlertsEnabled: Boolean? = null,
  val pageOrder: List<String>? = null,
  val hiddenPages: List<String>? = null,
  val setInputStyle: String? = null,
  val startableWorkouts: List<StartableWorkout>? = null,
  val scheduledWorkouts: List<ScheduledWorkout>? = null,
  val suggestedExercises: List<SuggestedExercise>? = null,
  val workoutServerId: String? = null,
  val distanceUnit: String? = null,
  /** The phone's energy unit (`kcal` or `kJ`); energy numbers stay kcal. Null reads as kcal. */
  val energyUnit: String? = null,
  val doubleTapEnabled: Boolean? = null,
  val rpeEnabled: Boolean? = null,
  val newWorkout: Boolean? = null,
  val workoutCountdown: Int? = null,
  val holdCountdown: Boolean? = null,
  val workoutTopLine: String? = null,
  val heartRateZoneFloors: List<Double>? = null,
  val exerciseDoNow: Boolean? = null,
  val medications: MedicationSnapshot? = null,
  val fast: WatchFast? = null,
  val fastSynced: Boolean = false,
  val steps: StepsSnapshot? = null,
  val stepGoal: Int? = null,
  val sleep: SleepSnapshot? = null,
  val exerciseSummary: ExerciseSummarySnapshot? = null,
  val runVoiceCues: Boolean? = null,
  val runAutoPause: Boolean? = null,
  val runCheckInMinutes: Int? = null,
  val runPaceBand: WatchPaceBand? = null,
  val runHeartRateBand: WatchHeartRateBand? = null,
  val runPlans: List<WatchRunPlan>? = null,
  val indoorDistanceScale: IndoorDistanceScale? = null
) {
  val effectiveWeightUnit: WeightUnit
    get() = weightUnit ?: WeightUnit.KG

  val effectiveHapticsEnabled: Boolean
    get() = hapticsEnabled != false

  val effectiveRestBuzzEnabled: Boolean
    get() = effectiveHapticsEnabled && restAlertsEnabled != false

  val effectiveNewWorkout: Boolean
    get() = newWorkout == true

  val effectiveWorkoutCountdown: Int
    get() = if (effectiveNewWorkout) maxOf(0, workoutCountdown ?: 3) else 0

  val effectiveHoldCountdown: Boolean
    get() = effectiveNewWorkout && holdCountdown != false

  val effectiveWorkoutTopLineIsMetrics: Boolean
    get() = workoutTopLine == "metrics"

  val effectiveExerciseDoNow: Boolean
    get() = exerciseDoNow == true

  val hasSeed: Boolean
    get() = todayWeightKg != null || lastWeightKg != null

  val daysSinceLastEntry: Int
    get() = CheckInDate.daysBetween(lastEntryDate ?: today)

  fun formattedWater(ml: Double, locale: Locale = Locale.getDefault()): String =
    formatWaterAmount(ml, waterDisplayUnit, locale)

  fun visiblePages(workoutActive: Boolean): List<WatchPage> {
    val hidden = (hiddenPages ?: emptyList()).map { it.lowercase() }.toSet()
    val ordered = mutableListOf<WatchPage>()
    for (raw in (pageOrder ?: emptyList())) {
      val p = WatchPage.fromKey(raw) ?: continue
      if (p == WatchPage.NOW_PLAYING) continue
      if (!ordered.contains(p)) ordered.add(p)
    }
    for (p in WatchPage.defaultOrder) {
      if (!ordered.contains(p)) ordered.add(p)
    }
    val filtered = ordered.filter { page ->
      if (workoutActive && page == WatchPage.WORKOUT) true
      else !hidden.contains(page.key)
    }.toMutableList()
    if (workoutActive) {
      val workoutIdx = filtered.indexOf(WatchPage.WORKOUT)
      if (workoutIdx >= 0 && !filtered.contains(WatchPage.NOW_PLAYING)) {
        filtered.add(workoutIdx + 1, WatchPage.NOW_PLAYING)
      }
    }
    return filtered.ifEmpty { listOf(WatchPage.GOALS) }
  }

  companion object {
    val empty = WatchContext()
  }
}

// ---- Workout Domain Models ----

data class PlannedSet(
  val setId: String,
  val targetReps: Double? = null,
  val targetWeightKg: Double? = null,
  val restSeconds: Int = 60,
  val restAfterSeconds: Int? = null,
  val setType: String? = null,
  val targetDurationSec: Int? = null,
  val previousDurationSec: Int? = null,
  val timed: Boolean? = null,
  val carry: Boolean? = null,
  val targetDistanceKm: Double? = null,
  val weighted: Boolean? = null
)

data class PlannedExercise(
  val exerciseEntryId: String,
  val name: String,
  val supersetRun: Int? = null,
  val bodyweight: Boolean? = null,
  val equipment: String? = null,
  val plates: WatchPlateConfig? = null,
  val imageKey: String? = null,
  val imageCount: Int? = null,
  val muscle: String? = null,
  val sets: List<PlannedSet>
)

data class ActiveWorkoutPlan(
  val sessionId: String,
  val workoutName: String,
  val exercises: List<PlannedExercise>,
  val setOrder: List<String>,
  val workoutFormat: String? = null,
  val timeCapSeconds: Int? = null,
  val startedAtMs: Long? = null,
  val armedAtMs: Long? = null,
  val capEndsAtMs: Long? = null,
  val fromPreset: Boolean? = null,
  val pausedAtMs: Long? = null,
  val excludedPauseSeconds: Int = 0,
  val prSetIds: Set<String> = emptySet()
) {
  /** Maps each superset member's `exerciseEntryId` to its partner names. */
  fun supersetPartners(): Map<String, String> {
    val partners = HashMap<String, String>()
    for (members in adjacentSupersetRuns(exercises)) {
      for (member in members) {
        val others = members.filter { it.exerciseEntryId != member.exerciseEntryId }.map { it.name }
        if (others.isNotEmpty()) {
          partners[member.exerciseEntryId] = others.joinToString(", ")
        }
      }
    }
    return partners
  }

  /**
   * Flattens [exercises] into the watch's linear step sequence:
   * - Interleaves adjacent 2+ exercise `supersetRun` blocks round-robin so
   *   supersets alternate exercises even when [setOrder] is empty or when new
   *   sets are added locally on the watch before the phone echoes an update.
   * - Clears `supersetRun` on dissolved 1-exercise singletons.
   * - Honors [setOrder] for all phone-known set IDs while inserting any
   *   locally-added watch sets right after their round-robin predecessor.
   */
  fun flattenSteps(): List<WorkoutStep> {
    val normalizedExercises = normalizedSupersetExercises(exercises)
    val partners = ActiveWorkoutPlan(
      sessionId = sessionId,
      workoutName = workoutName,
      exercises = normalizedExercises,
      setOrder = setOrder
    ).supersetPartners()

    fun buildStep(ex: PlannedExercise, idx: Int, set: PlannedSet): WorkoutStep = WorkoutStep(
      setId = set.setId,
      exerciseEntryId = ex.exerciseEntryId,
      exerciseName = ex.name,
      setIndexInExercise = idx + 1,
      totalSetsInExercise = ex.sets.size,
      setType = set.setType,
      supersetRun = ex.supersetRun,
      supersetWith = partners[ex.exerciseEntryId],
      bodyweight = ex.bodyweight == true,
      timed = set.timed == true,
      carry = set.carry == true,
      weighted = set.weighted == true,
      targetWeightKg = set.targetWeightKg,
      targetReps = set.targetReps,
      targetDurationSec = set.targetDurationSec,
      previousDurationSec = set.previousDurationSec,
      targetDistanceKm = set.targetDistanceKm,
      restSeconds = set.restSeconds,
      restAfterSeconds = set.restAfterSeconds,
      equipment = ex.equipment,
      plates = ex.plates,
      imageKey = ex.imageKey,
      imageCount = ex.imageCount,
      muscle = ex.muscle
    )

    val interleaved = ArrayList<WorkoutStep>()
    var i = 0
    while (i < normalizedExercises.size) {
      val first = normalizedExercises[i]
      val run = first.supersetRun
      if (run == null) {
        first.sets.forEachIndexed { idx, set ->
          interleaved.add(buildStep(first, idx, set))
        }
        i += 1
        continue
      }
      var end = i + 1
      while (end < normalizedExercises.size && normalizedExercises[end].supersetRun == run) {
        end += 1
      }
      val members = normalizedExercises.subList(i, end)
      val roundCount = members.maxOfOrNull { it.sets.size } ?: 0
      for (round in 0 until roundCount) {
        for (member in members) {
          val set = member.sets.getOrNull(round) ?: continue
          interleaved.add(buildStep(member, round, set))
        }
      }
      i = end
    }

    if (setOrder.isEmpty()) return interleaved
    val byId = interleaved.associateBy { it.setId }
    val ordered = ArrayList<WorkoutStep>(interleaved.size)
    val seen = HashSet<String>(interleaved.size)
    for (id in setOrder) {
      val step = byId[id] ?: continue
      if (seen.add(id)) ordered.add(step)
    }
    if (ordered.isEmpty()) return interleaved
    if (ordered.size == interleaved.size) return ordered

    for (idx in interleaved.indices) {
      val step = interleaved[idx]
      if (!seen.add(step.setId)) continue
      val prevId = if (idx > 0) interleaved[idx - 1].setId else null
      val insertAt = if (prevId != null) {
        val prevPos = ordered.indexOfFirst { it.setId == prevId }
        if (prevPos >= 0) prevPos + 1 else ordered.size
      } else {
        0
      }
      ordered.add(insertAt, step)
    }
    return ordered
  }

  companion object {
    /** Returns maximal adjacent runs of 2+ exercises sharing a non-null `supersetRun`. */
    fun adjacentSupersetRuns(list: List<PlannedExercise>): List<List<PlannedExercise>> {
      val runs = ArrayList<List<PlannedExercise>>()
      var i = 0
      while (i < list.size) {
        val run = list[i].supersetRun
        if (run == null) {
          i += 1
          continue
        }
        var end = i + 1
        while (end < list.size && list[end].supersetRun == run) {
          end += 1
        }
        if (end - i >= 2) {
          runs.add(list.subList(i, end))
        }
        i = end
      }
      return runs
    }

    /** Clears `supersetRun` on any exercise not part of an adjacent 2+ run. */
    fun normalizedSupersetExercises(list: List<PlannedExercise>): List<PlannedExercise> {
      val validEntryIds = adjacentSupersetRuns(list)
        .flatten()
        .mapTo(HashSet()) { it.exerciseEntryId }
      if (list.none { it.supersetRun != null && it.exerciseEntryId !in validEntryIds }) {
        return list
      }
      return list.map { ex ->
        if (ex.supersetRun != null && ex.exerciseEntryId !in validEntryIds) {
          ex.copy(supersetRun = null)
        } else {
          ex
        }
      }
    }
  }
}

data class IntervalTimingUpdate(
  val sessionId: String,
  val armedAtMs: Long? = null,
  val capEndsAtMs: Long? = null,
  val pausedAtMs: Long? = null,
  val excludedPauseSeconds: Int = 0
)

data class WorkoutStep(
  val setId: String,
  val exerciseEntryId: String,
  val exerciseName: String,
  val setIndexInExercise: Int,
  val totalSetsInExercise: Int,
  val setType: String?,
  val supersetRun: Int?,
  val supersetWith: String? = null,
  val bodyweight: Boolean,
  val timed: Boolean,
  val carry: Boolean,
  val weighted: Boolean,
  val targetWeightKg: Double?,
  val targetReps: Double?,
  val targetDurationSec: Int?,
  val previousDurationSec: Int?,
  val targetDistanceKm: Double?,
  val restSeconds: Int,
  val restAfterSeconds: Int? = null,
  val equipment: String? = null,
  val plates: WatchPlateConfig? = null,
  val imageKey: String? = null,
  val imageCount: Int? = null,
  val muscle: String? = null
) {
  fun toRestStepFacts(): RestStepFacts = RestStepFacts(
    exerciseEntryId = exerciseEntryId,
    supersetRun = supersetRun,
    setNumber = setIndexInExercise,
    isDrop = setType.equals("drop", ignoreCase = true),
    ownRestSeconds = restAfterSeconds,
    restBeforeSeconds = restSeconds
  )
}

data class SetValues(
  val weightKg: Double? = null,
  val reps: Double? = null,
  val durationSec: Int? = null,
  val previousDurationSec: Int? = null,
  val distanceKm: Double? = null
)

sealed class PhoneRest {
  data class Resting(val endsAtMs: Long, val durationSeconds: Int) : PhoneRest()
  data object Paused : PhoneRest()
  data object Ready : PhoneRest()
}

data class CompletedSet(
  val clientId: String,
  val sessionId: String,
  val setId: String,
  val weightKg: Double? = null,
  val reps: Double? = null,
  val duration: Int? = null,
  val distanceKm: Double? = null,
  val rpe: Double? = null,
  val rpeOnly: Boolean = false,
  val completedAtMs: Long = System.currentTimeMillis()
)

data class HeartRateSample(
  val t: String,
  val bpm: Double
)

data class HeartRateBatch(
  val clientId: String,
  val sessionId: String,
  val exerciseEntryId: String,
  val samples: List<HeartRateSample>,
  val activeEnergyKcal: Double? = null,
  val durationMinutes: Double? = null
)

data class WorkoutSummary(
  val sessionId: String,
  val workoutName: String,
  val durationSeconds: Int,
  val setsCompleted: Int,
  val volumeKg: Double,
  val averageBpm: Double?,
  val maxBpm: Double?,
  val activeEnergyKcal: Double?,
  val changedPresetName: String? = null
)

sealed class WorkoutEditAction {
  data class AddSet(val exerciseEntryId: String) : WorkoutEditAction()
  data class DeleteSet(val setId: String) : WorkoutEditAction()
  data class SetSetType(val setId: String, val type: String) : WorkoutEditAction()
  data class AddExercise(val exerciseId: String) : WorkoutEditAction()
  data class DeleteExercise(val exerciseEntryId: String) : WorkoutEditAction()
  data class DoExerciseNow(val exerciseEntryId: String, val anchorEntryId: String) : WorkoutEditAction()
  data class SetValuesEdit(
    val setId: String,
    val weightKg: Double? = null,
    val reps: Double? = null,
    val distanceKm: Double? = null,
    val atMs: Long = System.currentTimeMillis(),
    val armedAtMs: Long? = null
  ) : WorkoutEditAction()
}

// ---- Phone GPS Recording Models ----

data class IntervalStep(
  val index: Int,
  val label: String,
  val remaining: Double,
  val next: String?
)

data class RecordingState(
  val sessionId: String,
  val activity: String, // "walk" | "run" | "ride"
  val indoor: Boolean,
  val status: String, // "recording" | "paused" | "finished" | "ended"
  val startedAtMs: Long,
  val pausedMs: Double,
  val pausedAtMs: Long?,
  val distanceMeters: Double,
  val paceSeconds: Double?,
  val usesMiles: Boolean,
  val sentAtMs: Double,
  val lapCount: Int,
  val interval: IntervalStep?
)

// ---- Wrist-Only Run Models ----

data class WatchRunSettings(
  val autoPause: Boolean = false,
  val voiceCues: Boolean = false,
  val paceBand: WatchPaceBand? = null,
  val heartRateBand: WatchHeartRateBand? = null,
  val checkInMinutes: Int? = null
)

data class WatchRunStartRequest(
  val requestId: String,
  val kind: String, // "run" | "walk"
  val place: String, // "indoor" | "outdoor"
  val requestedAtMs: Long,
  val plan: WatchRunPlan? = null,
  val settings: WatchRunSettings? = null
)

data class WatchRunResult(
  val clientId: String,
  val kind: String,
  val place: String,
  val startedAtMs: Long,
  val endedAtMs: Long,
  val activeSeconds: Int,
  val distanceMeters: Double,
  val activeEnergyKcal: Double,
  val route: List<List<Double>> = emptyList(),
  val heartRate: List<List<Double>> = emptyList(),
  val laps: List<Double> = emptyList(),
  val lapDistances: List<Double> = emptyList(),
  val distanceSeries: List<List<Double>> = emptyList(),
  val plan: WatchRunPlan? = null,
  val planCompleted: Boolean = false,
  val distanceScale: Double = 1.0,
  val estimatedDistanceMeters: Double? = null
)

/**
 * How to show an energy number. Everything the phone and Health Services hand
 * the watch is kcal; [WatchContext.energyUnit] says whether to show it in kJ.
 * A context from an older phone app has no unit and reads as kcal.
 */
data class EnergyDisplay(val isKj: Boolean) {
  /** A kcal value in this unit. */
  fun value(kcal: Double): Double = if (isKj) kcal * 4.184 else kcal

  /** A kcal value in this unit, rounded to a whole number. */
  fun whole(kcal: Double): Int = value(kcal).roundToInt()

  val unit: String get() = if (isKj) "kJ" else "kcal"

  companion object {
    val KCAL = EnergyDisplay(isKj = false)

    fun of(context: WatchContext?): EnergyDisplay = EnergyDisplay(isKj = context?.energyUnit == "kJ")
  }
}

// ---- Phone Media Control Models ----

enum class MediaTarget {
  PHONE,
  WATCH
}

enum class MediaTransportAction(val wireValue: String) {
  PLAY_PAUSE("playPause"),
  NEXT("next"),
  PREVIOUS("previous")
}

data class PhoneMediaState(
  val title: String? = null,
  val artist: String? = null,
  val album: String? = null,
  val appName: String? = null,
  val isPlaying: Boolean = false,
  val volume: Int = 0,
  val maxVolume: Int = 0,
  val hasSession: Boolean = false,
  val hasMetadataAccess: Boolean = false,
  val epoch: Long = 0L,
  val seq: Long = 0L,
  val updatedAtMs: Long = 0L
) {
  val volumePercent: Int?
    get() = if (maxVolume > 0) ((volume.coerceIn(0, maxVolume) * 100f) / maxVolume).roundToInt() else null

  val secondaryLabel: String?
    get() = artist?.takeIf { it.isNotBlank() } ?: appName?.takeIf { it.isNotBlank() }
}

object MediaControlLogic {
  /**
   * Resolves whether the Now Playing page should target the paired phone or
   * local watch audio:
   * - If the user explicitly picked a target and it is reachable, honor it.
   * - If the phone is not reachable, fall back to local watch audio.
   * - If the watch itself is actively playing local audio while the phone is
   *   not playing, automatically target local watch audio.
   * - Otherwise default to controlling the paired phone.
   */
  fun resolveEffectiveTarget(
    manualTarget: MediaTarget?,
    phoneReachable: Boolean,
    watchMusicActive: Boolean,
    phoneMedia: PhoneMediaState?
  ): MediaTarget {
    if (!phoneReachable) return MediaTarget.WATCH
    if (manualTarget != null) return manualTarget
    if (watchMusicActive && phoneMedia?.isPlaying != true) return MediaTarget.WATCH
    return MediaTarget.PHONE
  }

  /**
   * Accepts newer or equal snapshots while dropping stale/reordered deliveries:
   * - When either snapshot carries a producer [PhoneMediaState.epoch], compares
   *   by `(epoch, seq)` so a phone process restart cleanly advances the epoch
   *   even if the system clock moved backward, while reordered deliveries in
   *   the same or older epoch are still rejected.
   * - Falls back to [PhoneMediaState.updatedAtMs] for legacy payloads without
   *   an epoch.
   */
  fun shouldAcceptSnapshot(incoming: PhoneMediaState, current: PhoneMediaState?): Boolean {
    if (current == null) return true
    if (incoming.epoch > 0L || current.epoch > 0L) {
      if (incoming.epoch != current.epoch) return incoming.epoch > current.epoch
      return incoming.seq >= current.seq
    }
    return incoming.updatedAtMs >= current.updatedAtMs
  }
}

fun formatWaterAmount(
  ml: Double,
  displayUnit: String?,
  locale: Locale = Locale.getDefault()
): String = when (displayUnit?.lowercase(Locale.US)) {
  "oz" -> String.format(locale, "%.1f oz", ml / 29.5735)
  "liter", "l" -> String.format(locale, "%.2fL", ml / 1000.0)
  else -> String.format(locale, "%d ml", ml.roundToInt())
}
