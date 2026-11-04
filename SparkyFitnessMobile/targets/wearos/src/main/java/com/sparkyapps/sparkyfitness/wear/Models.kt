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

  fun fromKg(kg: Double): Double = if (this == LBS) kg * 2.20462262185 else kg
  fun toKg(value: Double): Double = if (this == LBS) value / 2.20462262185 else value

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
  val doubleTapEnabled: Boolean? = null,
  val rpeEnabled: Boolean? = null,
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

  val hasSeed: Boolean
    get() = todayWeightKg != null || lastWeightKg != null

  val daysSinceLastEntry: Int
    get() = CheckInDate.daysBetween(lastEntryDate ?: today)

  fun formattedWater(ml: Double): String {
    return when (waterDisplayUnit?.lowercase()) {
      "oz" -> String.format(Locale.US, "%.1f oz", ml / 29.5735)
      "liter", "l" -> String.format(Locale.US, "%.2fL", ml / 1000.0)
      else -> "${ml.roundToInt()} ml"
    }
  }

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
)

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
  val bodyweight: Boolean,
  val timed: Boolean,
  val carry: Boolean,
  val weighted: Boolean,
  val targetWeightKg: Double?,
  val targetReps: Double?,
  val targetDurationSec: Int?,
  val previousDurationSec: Int?,
  val targetDistanceKm: Double?,
  val restSeconds: Int
)

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
  val activeEnergyKcal: Double?
)

sealed class WorkoutEditAction {
  data class AddSet(val exerciseEntryId: String) : WorkoutEditAction()
  data class DeleteSet(val setId: String) : WorkoutEditAction()
  data class SetSetType(val setId: String, val type: String) : WorkoutEditAction()
  data class AddExercise(val exerciseId: String) : WorkoutEditAction()
  data class DeleteExercise(val exerciseEntryId: String) : WorkoutEditAction()
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
