package com.sparkyapps.sparkyfitness.wear

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.annotation.StringRes
import androidx.compose.ui.graphics.toArgb
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DimensionBuilders.degrees
import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.DimensionBuilders.expand
import androidx.wear.protolayout.DimensionBuilders.sp
import androidx.wear.protolayout.DimensionBuilders.wrap
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.LayoutElementBuilders.Arc
import androidx.wear.protolayout.LayoutElementBuilders.ArcLine
import androidx.wear.protolayout.LayoutElementBuilders.Box
import androidx.wear.protolayout.LayoutElementBuilders.Column
import androidx.wear.protolayout.LayoutElementBuilders.FontStyle
import androidx.wear.protolayout.LayoutElementBuilders.Layout
import androidx.wear.protolayout.LayoutElementBuilders.LayoutElement
import androidx.wear.protolayout.LayoutElementBuilders.Row
import androidx.wear.protolayout.LayoutElementBuilders.Spacer
import androidx.wear.protolayout.LayoutElementBuilders.Text
import androidx.wear.protolayout.ModifiersBuilders.Background
import androidx.wear.protolayout.ModifiersBuilders.Clickable
import androidx.wear.protolayout.ModifiersBuilders.Corner
import androidx.wear.protolayout.ModifiersBuilders.Modifiers
import androidx.wear.protolayout.ModifiersBuilders.Padding
import androidx.wear.protolayout.ResourceBuilders.Resources
import androidx.wear.protolayout.TimelineBuilders.Timeline
import androidx.wear.protolayout.TimelineBuilders.TimelineEntry
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders.Tile
import androidx.wear.tiles.TileService
import com.SparkyApps.SparkyFitnessMobile.R
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt

private const val TILE_RESOURCES_VERSION = "2"
private const val TILE_FRESHNESS_INTERVAL_MS = 15 * 60 * 1000L

data class TileMacroRow(
  val key: String,
  val label: String,
  val valueText: String,
  val progress: Float,
  val colorArgb: Int,
  @StringRes val labelRes: Int = 0
)

data class NutritionTileModel(
  val hasData: Boolean,
  val consumedKcal: Int,
  val goalKcal: Int,
  val remainingKcal: Int,
  val burnedKcal: Int,
  val calorieProgress: Float,
  val macros: List<TileMacroRow>,
  /** Unit of the `*Kcal` figures above, already converted for display. */
  val energyUnit: String = "kcal"
)

data class TileStageBadge(
  val label: String,
  val durationText: String,
  val colorArgb: Int,
  @StringRes val labelRes: Int = 0
)

sealed class SleepWindow {
  data object NoSleepLogged : SleepWindow()
  data class BedWake(val bedtime: String, val wakeTime: String) : SleepWindow()
  data class Naps(val count: Int, val durationText: String) : SleepWindow()
  data class InBed(val durationText: String) : SleepWindow()
}

data class SleepTileModel(
  val hasData: Boolean,
  val durationText: String,
  val biometricsText: String?,
  val progress: Float,
  val stages: List<TileStageBadge>,
  val sleepScore: Int? = null,
  val inBedDurationText: String? = null,
  val window: SleepWindow = SleepWindow.NoSleepLogged
)

data class TileDoseRow(
  val name: String,
  val detailText: String,
  val statusSymbol: String,
  val statusColorArgb: Int,
  val doseId: String = "",
  val isPending: Boolean = false,
  val isDirectlyActionable: Boolean = isPending,
  val displayFingerprint: String = ""
)

data class MedicationsTileModel(
  val hasData: Boolean,
  val takenCount: Int,
  val totalCount: Int,
  val pendingCount: Int,
  val progress: Float,
  val doseRows: List<TileDoseRow>,
  val skippedCount: Int = 0
)

data class TileWaterContainerChip(
  val id: Int,
  val name: String,
  val addText: String,
  val volumeMl: Double
)

data class WaterTileModel(
  val hasOwner: Boolean,
  val consumedText: String,
  val goalText: String,
  val remainingText: String?,
  val isGoalMet: Boolean,
  val queuedText: String?,
  val syncFailed: Boolean = false,
  val progress: Float,
  val containers: List<TileWaterContainerChip>
)

data class WeightTileModel(
  val hasData: Boolean,
  val hasWeight: Boolean = hasData,
  val loggedToday: Boolean,
  val queuedToday: Boolean = false,
  val failedToday: Boolean = false,
  val latestDisplay: Double,
  val unitSuffix: String,
  val weightValueText: String,
  val stepDelta: Double?,
  val trendDelta: Double?,
  val trendCount: Int,
  val bodyFatPercent: Double?,
  val sparklineFractions: List<Float>,
  val progress: Float
)

data class TileExerciseItemRow(
  val title: String,
  val subtitle: String,
  val badgeColorArgb: Int,
  @StringRes val subtitleRes: Int = 0
)

data class ExerciseTileModel(
  val hasData: Boolean,
  val minutes: Int,
  val minutesGoal: Int,
  val calories: Int,
  val caloriesGoal: Int,
  val sessionCount: Int,
  val headlineText: String,
  val progress: Float,
  val rows: List<TileExerciseItemRow>,
  val hasExerciseSummary: Boolean = false,
  val stepsCount: Int? = null,
  val hasScheduledWorkouts: Boolean = false
)

object TileModels {
  /**
   * Formats a duration in seconds as `Xh Ym` or `Ym` when under an hour.
   */
  fun formatDurationSeconds(seconds: Int): String {
    val clamped = max(0, seconds)
    val hours = clamped / 3600
    val mins = (clamped % 3600) / 60
    return if (hours > 0) "${hours}h ${mins}m" else "${mins}m"
  }

  /**
   * Formats a nutrient amount as an integer when close to a whole number, or to one decimal place.
   */
  private fun formatNutrientAmount(value: Double): String {
    val rounded = value.roundToInt()
    return if (kotlin.math.abs(value - rounded) < 0.05) {
      rounded.toString()
    } else {
      String.format(Locale.US, "%.1f", value)
    }
  }

  /**
   * Maps a nutrient key to its display accent color ARGB value using [SparkyColors].
   */
  private fun colorForNutrientKey(key: String): Int = nutrientColor(key).toArgb()

  /**
   * Builds the display model for the Nutrition tile from today's [NutritionSnapshot].
   */
  fun buildNutritionTileModel(
    nutrition: NutritionSnapshot?,
    energy: EnergyDisplay = EnergyDisplay.KCAL
  ): NutritionTileModel {
    if (nutrition == null || !nutrition.isToday) {
      return NutritionTileModel(
        hasData = false,
        consumedKcal = 0,
        goalKcal = 0,
        remainingKcal = 0,
        burnedKcal = 0,
        calorieProgress = 0f,
        macros = emptyList()
      )
    }
    val consumed = energy.whole(nutrition.caloriesConsumed)
    val remaining = energy.whole(nutrition.caloriesRemaining)
    val burned = energy.whole(nutrition.caloriesBurned)
    val goal = max(0, energy.whole(nutrition.caloriesConsumed + nutrition.caloriesRemaining))
    val progress = nutrition.calorieProgress.toFloat().coerceIn(0f, 1f)

    val defaultLabels = mapOf(
      "protein" to R.string.common_protein,
      "carbs" to R.string.common_carbs,
      "fat" to R.string.common_fat
    )

    val usingFallbackRows = nutrition.rows.isNullOrEmpty()
    val sourceRows = nutrition.rows?.takeIf { it.isNotEmpty() } ?: listOf(
      NutrientRow(
        key = "protein",
        label = "Protein",
        unit = "g",
        consumed = nutrition.protein.consumed,
        goal = nutrition.protein.goal.takeIf { it > 0 },
        progress = nutrition.protein.progress
      ),
      NutrientRow(
        key = "carbs",
        label = "Carbs",
        unit = "g",
        consumed = nutrition.carbs.consumed,
        goal = nutrition.carbs.goal.takeIf { it > 0 },
        progress = nutrition.carbs.progress
      ),
      NutrientRow(
        key = "fat",
        label = "Fat",
        unit = "g",
        consumed = nutrition.fat.consumed,
        goal = nutrition.fat.goal.takeIf { it > 0 },
        progress = nutrition.fat.progress
      )
    )

    val macros = sourceRows.take(3).map { row ->
      val consumedStr = formatNutrientAmount(row.consumed)
      val unitSuffix = row.unit
      val valueText = if (row.goal != null && row.goal > 0) {
        "$consumedStr/${formatNutrientAmount(row.goal)}$unitSuffix"
      } else {
        "$consumedStr$unitSuffix"
      }
      TileMacroRow(
        key = row.key,
        label = row.label.take(12),
        valueText = valueText,
        progress = row.progress.toFloat().coerceIn(0f, 1f),
        colorArgb = colorForNutrientKey(row.key),
        labelRes = if (usingFallbackRows) (defaultLabels[row.key] ?: 0) else 0
      )
    }

    return NutritionTileModel(
      hasData = true,
      consumedKcal = consumed,
      goalKcal = goal,
      remainingKcal = remaining,
      burnedKcal = burned,
      calorieProgress = progress,
      macros = macros,
      energyUnit = energy.unit
    )
  }

  /**
   * Builds the display model for the Sleep Health tile from today's [SleepSnapshot].
   */
  fun buildSleepTileModel(sleep: SleepSnapshot?): SleepTileModel {
    if (sleep == null || !sleep.isToday || (sleep.totalSeconds <= 0 && sleep.timeInBedSeconds <= 0)) {
      return SleepTileModel(
        hasData = false,
        durationText = "—",
        biometricsText = null,
        progress = 0f,
        stages = emptyList(),
        sleepScore = null,
        inBedDurationText = null,
        window = SleepWindow.NoSleepLogged
      )
    }
    val inBedOnlyDuration = if (sleep.totalSeconds <= 0) {
      formatDurationSeconds(sleep.timeInBedSeconds)
    } else {
      null
    }
    val durationText = if (sleep.totalSeconds > 0) {
      formatDurationSeconds(sleep.totalSeconds)
    } else {
      inBedOnlyDuration.orEmpty()
    }
    val window = when {
      sleep.bedtime.isNotBlank() && sleep.wakeTime.isNotBlank() ->
        SleepWindow.BedWake(sleep.bedtime, sleep.wakeTime)
      sleep.napCount > 0 ->
        SleepWindow.Naps(sleep.napCount, formatDurationSeconds(sleep.napSeconds))
      else ->
        SleepWindow.InBed(formatDurationSeconds(sleep.timeInBedSeconds))
    }

    val stages = mutableListOf<TileStageBadge>()
    sleep.deepSeconds?.takeIf { it > 0 }?.let {
      stages.add(TileStageBadge("Deep", formatDurationSeconds(it), 0xFF818CF8.toInt(), R.string.sleep_stage_deep))
    }
    sleep.remSeconds?.takeIf { it > 0 }?.let {
      stages.add(TileStageBadge("REM", formatDurationSeconds(it), 0xFFC084FC.toInt(), R.string.sleep_stage_rem))
    }
    sleep.lightSeconds?.takeIf { it > 0 }?.let {
      stages.add(TileStageBadge("Light", formatDurationSeconds(it), 0xFF38BDF8.toInt(), R.string.sleep_stage_light))
    }

    val bioParts = mutableListOf<String>()
    sleep.restingHeartRate?.takeIf { it > 0 }?.let { bioParts.add("RHR ${it}bpm") }
    sleep.hrvMs?.takeIf { it > 0 }?.let { bioParts.add("HRV ${it}ms") }
    sleep.spo2?.takeIf { it > 0 }?.let { bioParts.add("SpO2 ${it}%") }
    val biometricsText = bioParts.takeIf { it.isNotEmpty() }?.joinToString(" · ")

    val spanSeconds = if (sleep.totalSeconds > 0) sleep.totalSeconds else sleep.timeInBedSeconds
    val progress = if (sleep.sleepScore != null && sleep.sleepScore > 0) {
      (sleep.sleepScore / 100f).coerceIn(0f, 1f)
    } else {
      (spanSeconds / (8 * 3600f)).coerceIn(0f, 1f)
    }

    return SleepTileModel(
      hasData = true,
      durationText = durationText,
      biometricsText = biometricsText,
      progress = progress,
      stages = stages,
      sleepScore = sleep.sleepScore,
      inBedDurationText = inBedOnlyDuration,
      window = window
    )
  }

  /**
   * Builds the display model for the Medications tile from today's [MedicationSnapshot].
   */
  fun buildMedicationsTileModel(
    medications: MedicationSnapshot?,
    failedDoseIds: Set<String> = emptySet()
  ): MedicationsTileModel {
    if (medications == null || !medications.isToday) {
      return MedicationsTileModel(
        hasData = false,
        takenCount = 0,
        totalCount = 0,
        pendingCount = 0,
        progress = 0f,
        doseRows = emptyList(),
        skippedCount = 0
      )
    }
    val doses = medications.doses
    if (doses.isEmpty()) {
      return MedicationsTileModel(
        hasData = true,
        takenCount = 0,
        totalCount = 0,
        pendingCount = 0,
        progress = 1f,
        doseRows = emptyList(),
        skippedCount = 0
      )
    }
    val takenCount = doses.count { it.status == MedicationDoseStatus.TAKEN }
    val pendingCount = doses.count { it.status == MedicationDoseStatus.PENDING }
    val skippedCount = doses.count { it.status == MedicationDoseStatus.SKIPPED }
    val totalCount = doses.size
    val progress = (takenCount.toFloat() / totalCount.toFloat()).coerceIn(0f, 1f)

    val ordered = doses.sortedBy {
      when (it.status) {
        MedicationDoseStatus.PENDING -> 0
        MedicationDoseStatus.TAKEN -> 1
        MedicationDoseStatus.SKIPPED -> 2
      }
    }

    data class FormattedDoseDisplay(
      val name: String,
      val detailText: String,
      val visibleDetailPrefix: String,
      val strengthIntact: Boolean,
      val detailStrengthIntact: Boolean
    )

    fun formatDoseDisplay(dose: MedicationDose): FormattedDoseDisplay {
      val compactTime = ComplicationModels.compactDoseTime(dose.time)
      val cleanDetail = dose.detail.trim()
      val rightParts = listOf(cleanDetail, compactTime).filter { it.isNotBlank() }
      val detailText = rightParts.joinToString(" · ").ifBlank { dose.status.rawValue }
      val (compactName, nameStrengthIntact) = compactDoseNameWithSafety(dose.name)
      val (visibleDetailPrefix, unclippedChars) = visiblePillRowDetail(compactName, detailText)
      val detailClipped = cleanDetail.length > unclippedChars
      val clippedTailHasDigits = detailClipped && cleanDetail.drop(unclippedChars).any { it.isDigit() }
      val strengthMatch = DETAIL_STRENGTH_REGEX.findAll(cleanDetail).lastOrNull()
      val detailIsCountOnlyWithNamedStrength =
        dose.name.any { it.isDigit() } && DOSAGE_COUNT_ONLY_REGEX.matches(cleanDetail)
      val detailStrengthIntact = when {
        !detailClipped -> true
        clippedTailHasDigits -> false
        strengthMatch != null -> strengthMatch.range.last + 1 <= unclippedChars
        detailIsCountOnlyWithNamedStrength -> true
        else -> cleanDetail.none { it.isDigit() }
      }
      return FormattedDoseDisplay(
        name = compactName,
        detailText = detailText,
        visibleDetailPrefix = visibleDetailPrefix,
        strengthIntact = nameStrengthIntact,
        detailStrengthIntact = detailStrengthIntact
      )
    }

    val visibleSignatureCounts = doses
      .groupingBy { val d = formatDoseDisplay(it); d.name to d.visibleDetailPrefix }
      .eachCount()

    val doseRows = ordered.take(3).map { dose ->
      val isFailed = failedDoseIds.contains(dose.id)
      val (symbol, color) = when {
        isFailed -> "!" to 0xFFFB7185.toInt()
        dose.status == MedicationDoseStatus.TAKEN -> "✓" to 0xFF4ADE80.toInt()
        dose.status == MedicationDoseStatus.PENDING -> "○" to 0xFFFBBF24.toInt()
        else -> "–" to 0xFF94A3B8.toInt()
      }
      val disp = formatDoseDisplay(dose)
      val isPending = dose.status == MedicationDoseStatus.PENDING
      val sig = disp.name to disp.visibleDetailPrefix
      val uniquelyIdentifiable = isPending &&
        disp.strengthIntact &&
        disp.detailStrengthIntact &&
        (visibleSignatureCounts[sig] ?: 0) == 1
      TileDoseRow(
        name = disp.name,
        detailText = disp.detailText,
        statusSymbol = symbol,
        statusColorArgb = color,
        doseId = dose.id,
        isPending = isPending,
        isDirectlyActionable = uniquelyIdentifiable,
        displayFingerprint = medicationDoseFingerprint(dose)
      )
    }

    return MedicationsTileModel(
      hasData = true,
      takenCount = takenCount,
      totalCount = totalCount,
      pendingCount = pendingCount,
      progress = progress,
      doseRows = doseRows,
      skippedCount = skippedCount
    )
  }

  /**
   * Shortens long medication names while keeping any numeric strength/unit intact; returns `strengthIntact = false`
   * whenever any digit or trailing strength unit cannot fit without truncation.
   */
  fun compactDoseNameWithSafety(rawName: String, maxChars: Int = 15): Pair<String, Boolean> {
    val clean = rawName.trim()
    if (clean.isEmpty()) return "" to false
    if (clean.length <= maxChars) return clean to true
    val headOnly = clean.take((maxChars - 1).coerceAtLeast(1))
    if (!clean.any { it.isDigit() }) {
      return "${headOnly.trimEnd()}…" to true
    }
    val tokens = clean.split(Regex("\\s+"))
    val strengthIdx = tokens.indexOfFirst { tok -> tok.any { it.isDigit() } }
    if (strengthIdx > 0) {
      val prefix = tokens.subList(0, strengthIdx).joinToString(" ")
      val strengthTail = tokens.subList(strengthIdx, tokens.size).joinToString(" ")
      val minPrefixLen = 3
      val headBudget = maxChars - strengthTail.length - 1
      if (headBudget >= minPrefixLen) {
        val keptPrefix = prefix.take(headBudget)
        val droppedPrefix = prefix.drop(keptPrefix.length)
        if (!droppedPrefix.any { it.isDigit() }) {
          return "${keptPrefix.trimEnd()}…$strengthTail" to true
        }
      }
    }
    return "${headOnly.trimEnd()}…" to false
  }

  private const val SAFE_PILL_ROW_CHARS = 20
  private val DETAIL_STRENGTH_REGEX = Regex(
    "\\d+(?:[.,]\\d+)?\\s*(?:%|(?:mcg|mg|ug|µg|g|iu|ml|l|mmol|mol|meq|units?|u)\\b)(?:\\s*/\\s*(?:\\d+(?:[.,]\\d+)?(?:\\s*(?:%|[a-zµ]+\\b))?|(?:%|[a-zµ]+\\b)))*",
    RegexOption.IGNORE_CASE
  )
  private val DOSAGE_COUNT_ONLY_REGEX = Regex(
    "^\\d+(?:\\.5|/[24])?\\s*(?:tabs?|tablets?|caps?|capsules?|pills?|softgels?|gummies?|gummy|lozenges?|chews?|patches?|puffs?|sprays?|drops?|sachets?|packets?|vials?|ampoules?|syringes?|injections?|doses?)\\.?$",
    RegexOption.IGNORE_CASE
  )

  internal fun visiblePillRowDetail(compactName: String, detailText: String): Pair<String, Int> {
    val leftChars = 2 + compactName.length
    val availableDetailChars = (SAFE_PILL_ROW_CHARS - leftChars).coerceAtLeast(0)
    if (detailText.length <= availableDetailChars) {
      return detailText to detailText.length
    }
    val unclippedChars = (availableDetailChars - 1).coerceAtLeast(0)
    return detailText.take(unclippedChars) to unclippedChars
  }

  fun compactDoseName(rawName: String, maxChars: Int = 15): String =
    compactDoseNameWithSafety(rawName, maxChars).first

  /**
   * Builds the display model for the Exercise tile from today's exercise summary, scheduled workouts, and steps.
   */
  fun buildExerciseTileModel(
    exercise: ExerciseSummarySnapshot?,
    scheduledWorkouts: List<ScheduledWorkout>,
    steps: StepsSnapshot?,
    stepGoal: Int,
    energy: EnergyDisplay = EnergyDisplay.KCAL
  ): ExerciseTileModel {
    val validExercise = exercise?.takeIf { it.isToday }
    val validSteps = steps?.takeIf { it.isToday }

    val minutes = validExercise?.minutes ?: 0
    val minutesGoal = validExercise?.minutesGoal ?: 0
    val calories = validExercise?.calories ?: 0
    val caloriesGoal = validExercise?.caloriesGoal ?: 0
    val sessionCount = validExercise?.sessionCount ?: 0

    val hasAnyData = validExercise != null || scheduledWorkouts.isNotEmpty() || validSteps != null

    val progress = when {
      minutesGoal > 0 -> (minutes.toFloat() / minutesGoal.toFloat()).coerceIn(0f, 1f)
      caloriesGoal > 0 -> (calories.toFloat() / caloriesGoal.toFloat()).coerceIn(0f, 1f)
      minutes > 0 -> (minutes.toFloat() / 30f).coerceIn(0f, 1f)
      validSteps != null && stepGoal > 0 -> (validSteps.count.toFloat() / stepGoal.toFloat()).coerceIn(0f, 1f)
      else -> 0f
    }

    val headlineText = if (validExercise != null) {
      val shownCalories = energy.whole(calories.toDouble())
      val shownGoal = energy.whole(caloriesGoal.toDouble())
      val calorieText =
        if (caloriesGoal > 0) "$shownCalories/$shownGoal ${energy.unit}" else "$shownCalories ${energy.unit}"
      "${minutes}m · $calorieText"
    } else {
      "0m · 0 ${energy.unit}"
    }

    val rows = mutableListOf<TileExerciseItemRow>()
    for (session in validExercise?.sessions.orEmpty().take(2)) {
      rows.add(
        TileExerciseItemRow(
          title = session.name.take(15),
          subtitle = "${session.durationMinutes}m · ${energy.whole(session.calories.toDouble())} ${energy.unit}",
          badgeColorArgb = 0xFF4ADE80.toInt()
        )
      )
    }
    if (rows.size < 2) {
      for (sched in scheduledWorkouts.take(2 - rows.size)) {
        val rawSub = sched.planName.ifBlank { sched.caption }
        val useFallback = rawSub.isBlank()
        rows.add(
          TileExerciseItemRow(
            title = sched.name.take(15),
            subtitle = (if (useFallback) "Scheduled" else rawSub).take(16),
            badgeColorArgb = 0xFFFB923C.toInt(),
            subtitleRes = if (useFallback) R.string.tile_exercise_scheduled else 0
          )
        )
      }
    }

    return ExerciseTileModel(
      hasData = hasAnyData,
      minutes = minutes,
      minutesGoal = minutesGoal,
      calories = calories,
      caloriesGoal = caloriesGoal,
      sessionCount = sessionCount,
      headlineText = headlineText,
      progress = progress,
      rows = rows,
      hasExerciseSummary = validExercise != null,
      stepsCount = validSteps?.count,
      hasScheduledWorkouts = scheduledWorkouts.isNotEmpty()
    )
  }

  fun formatSleepDuration(
    model: SleepTileModel,
    getString: (Int, Array<out Any>) -> String
  ): String = model.inBedDurationText?.let {
    getString(R.string.tile_sleep_in_bed, arrayOf(it))
  } ?: model.durationText

  fun formatSleepDuration(context: Context, model: SleepTileModel): String =
    formatSleepDuration(model) { id, args -> context.getString(id, *args) }

  fun formatSleepWindow(
    window: SleepWindow,
    getString: (Int, Array<out Any>) -> String,
    getQuantityString: (Int, Int, Array<out Any>) -> String
  ): String = when (window) {
    is SleepWindow.NoSleepLogged -> getString(R.string.tile_sleep_no_logged, emptyArray())
    is SleepWindow.BedWake -> "${window.bedtime} – ${window.wakeTime}"
    is SleepWindow.Naps -> getQuantityString(
      R.plurals.tile_sleep_naps,
      window.count,
      arrayOf<Any>(window.count, window.durationText)
    )
    is SleepWindow.InBed -> getString(R.string.tile_sleep_in_bed, arrayOf(window.durationText))
  }

  fun formatSleepWindow(context: Context, window: SleepWindow): String = formatSleepWindow(
    window = window,
    getString = { id, args -> if (args.isEmpty()) context.getString(id) else context.getString(id, *args) },
    getQuantityString = { id, qty, args -> context.resources.getQuantityString(id, qty, *args) }
  )

  fun formatMedicationsHeadline(
    model: MedicationsTileModel,
    getString: (Int, Array<out Any>) -> String
  ): String = if (!model.hasData) {
    getString(R.string.tile_meds_not_synced, emptyArray())
  } else {
    getString(R.string.tile_meds_taken_count, arrayOf(model.takenCount, model.totalCount))
  }

  fun formatMedicationsHeadline(context: Context, model: MedicationsTileModel): String =
    formatMedicationsHeadline(model) { id, args ->
      if (args.isEmpty()) context.getString(id) else context.getString(id, *args)
    }

  fun formatMedicationsSubtitle(
    model: MedicationsTileModel,
    getString: (Int, Array<out Any>) -> String
  ): String = when {
    !model.hasData -> getString(R.string.tile_meds_open_app, emptyArray())
    model.totalCount == 0 -> getString(R.string.tile_meds_none_today, emptyArray())
    model.pendingCount > 0 -> getString(R.string.tile_meds_pending_today, arrayOf(model.pendingCount))
    model.skippedCount > 0 -> getString(R.string.tile_meds_skipped_done, arrayOf(model.skippedCount))
    else -> getString(R.string.tile_meds_all_done, emptyArray())
  }

  fun formatMedicationsSubtitle(context: Context, model: MedicationsTileModel): String =
    formatMedicationsSubtitle(model) { id, args ->
      if (args.isEmpty()) context.getString(id) else context.getString(id, *args)
    }

  fun formatExerciseHeadline(
    model: ExerciseTileModel,
    getString: (Int, Array<out Any>) -> String
  ): String = if (!model.hasExerciseSummary && model.stepsCount != null) {
    getString(R.string.tile_exercise_steps_count, arrayOf(model.stepsCount))
  } else {
    model.headlineText
  }

  fun formatExerciseHeadline(context: Context, model: ExerciseTileModel): String =
    formatExerciseHeadline(model) { id, args -> context.getString(id, *args) }

  fun formatExerciseSubtitle(
    model: ExerciseTileModel,
    getString: (Int, Array<out Any>) -> String,
    getQuantityString: (Int, Int, Array<out Any>) -> String
  ): String {
    val parts = mutableListOf<String>()
    if (model.minutesGoal > 0) {
      parts.add(getString(R.string.tile_exercise_goal_minutes, arrayOf(model.minutesGoal)))
    }
    if (model.sessionCount > 0) {
      parts.add(getQuantityString(R.plurals.tile_exercise_workouts, model.sessionCount, arrayOf(model.sessionCount)))
    } else if (model.stepsCount != null) {
      parts.add(getString(R.string.tile_exercise_steps_count, arrayOf(model.stepsCount)))
    }
    return parts.joinToString(" · ").ifEmpty {
      if (model.hasScheduledWorkouts) {
        getString(R.string.tile_exercise_planned_today, emptyArray())
      } else {
        getString(R.string.tile_exercise_tap_start, emptyArray())
      }
    }
  }

  fun formatExerciseSubtitle(context: Context, model: ExerciseTileModel): String = formatExerciseSubtitle(
    model = model,
    getString = { id, args -> if (args.isEmpty()) context.getString(id) else context.getString(id, *args) },
    getQuantityString = { id, qty, args -> context.resources.getQuantityString(id, qty, *args) }
  )

  /**
   * Resolves user-configured water containers or falls back to standard Glass (250ml) and Bottle (500ml) presets.
   */
  fun resolveEffectiveWaterContainers(
    containers: List<WaterContainer>,
    displayUnit: String?,
    defaultGlassName: String = "Glass",
    defaultBottleName: String = "Bottle"
  ): List<WaterContainer> {
    if (containers.isNotEmpty()) return containers
    val unit = displayUnit?.takeIf { it.isNotBlank() } ?: "ml"
    return listOf(
      WaterContainer(id = 1, name = defaultGlassName, servingVolumeMl = 250.0, unit = unit),
      WaterContainer(id = 2, name = defaultBottleName, servingVolumeMl = 500.0, unit = unit)
    )
  }

  /**
   * Builds the display model for the interactive Hydration tile.
   */
  fun buildWaterTileModel(
    hasOwner: Boolean,
    consumedMl: Double,
    goalMl: Double,
    queuedMl: Double,
    watchCtx: WatchContext,
    containers: List<WaterContainer>,
    waterSyncState: SyncState = SyncState.SAVED,
    defaultGlassName: String = "Glass",
    defaultBottleName: String = "Bottle"
  ): WaterTileModel {
    val safeGoal = max(1.0, goalMl)
    val clampedConsumed = max(0.0, consumedMl)
    val progress = (clampedConsumed / safeGoal).toFloat().coerceIn(0f, 1f)
    val isGoalMet = goalMl > 0.0 && clampedConsumed >= goalMl - 0.5
    val remMl = max(0.0, goalMl - clampedConsumed)
    val effectiveContainers = resolveEffectiveWaterContainers(
      containers = containers,
      displayUnit = watchCtx.waterDisplayUnit,
      defaultGlassName = defaultGlassName,
      defaultBottleName = defaultBottleName
    )
    val chips = effectiveContainers.take(3).map { c ->
      val unitKey = (watchCtx.waterDisplayUnit?.takeIf { it.isNotBlank() } ?: c.unit).lowercase(Locale.US)
      val formattedVol = when (unitKey) {
        "oz" -> String.format(Locale.US, "%.1f oz", c.servingVolumeMl / 29.5735)
        "liter", "l" -> String.format(Locale.US, "%.2fL", c.servingVolumeMl / 1000.0)
        else -> "${c.servingVolumeMl.roundToInt()} ml"
      }
      TileWaterContainerChip(
        id = c.id,
        name = c.name.take(13),
        addText = "+$formattedVol",
        volumeMl = c.servingVolumeMl
      )
    }
    return WaterTileModel(
      hasOwner = hasOwner,
      consumedText = watchCtx.formattedWater(clampedConsumed),
      goalText = watchCtx.formattedWater(safeGoal),
      remainingText = if (!isGoalMet) watchCtx.formattedWater(remMl) else null,
      isGoalMet = isGoalMet,
      queuedText = if (queuedMl > 0.5) watchCtx.formattedWater(queuedMl) else null,
      syncFailed = waterSyncState == SyncState.FAILED,
      progress = progress,
      containers = chips
    )
  }

  /**
   * Builds the display model for the Weight & Body-Comp Trend tile and Weight complication.
   */
  fun buildWeightTileModel(
    watchCtx: WatchContext,
    history: List<HistoryPoint>,
    unit: WeightUnit = watchCtx.effectiveWeightUnit,
    today: String = CheckInDate.today(),
    todayUnconfirmed: Boolean = false,
    todayFailed: Boolean = false,
    locale: Locale = Locale.US
  ): WeightTileModel {
    val byDay = sortedMapOf<String, HistoryPoint>()
    for (pt in history) {
      if (pt.day.isNotBlank() && pt.day <= today && pt.weightKg > 0.0) {
        byDay[pt.day] = pt
      }
    }
    val ctxLastDay = watchCtx.lastEntryDate?.takeIf { it.isNotBlank() }
    val ctxLastKg = watchCtx.lastWeightKg?.takeIf { it > 0.0 }
    if (ctxLastDay != null && ctxLastDay <= today) {
      val existingLast = byDay[ctxLastDay]
      if (existingLast == null && ctxLastKg != null) {
        byDay[ctxLastDay] = HistoryPoint(
          day = ctxLastDay,
          weightKg = ctxLastKg,
          bodyFatPercentage = watchCtx.lastBodyFatPercentage
        )
      } else if (existingLast != null && existingLast.bodyFatPercentage == null && watchCtx.lastBodyFatPercentage != null) {
        byDay[ctxLastDay] = existingLast.copy(bodyFatPercentage = watchCtx.lastBodyFatPercentage)
      }
    }
    val ctxDay = watchCtx.today?.takeIf { it.isNotBlank() }
    val ctxTodayKg = watchCtx.todayWeightKg?.takeIf { it > 0.0 }
    if (ctxDay != null && ctxDay <= today && ctxTodayKg != null) {
      val existingBf = byDay[ctxDay]?.bodyFatPercentage
      byDay[ctxDay] = HistoryPoint(
        day = ctxDay,
        weightKg = ctxTodayKg,
        bodyFatPercentage = watchCtx.todayBodyFatPercentage ?: existingBf
      )
    } else if (ctxDay == null && ctxTodayKg != null) {
      val existingBf = byDay[today]?.bodyFatPercentage
      byDay[today] = HistoryPoint(
        day = today,
        weightKg = ctxTodayKg,
        bodyFatPercentage = watchCtx.todayBodyFatPercentage ?: existingBf
      )
    }

    val datedPoints = byDay.values.toList()
    val fallbackTodayKg = if (ctxDay == null || ctxDay <= today) ctxTodayKg else null
    val fallbackLastKg = if (ctxLastDay == null || ctxLastDay <= today) ctxLastKg else null
    val latestKg = datedPoints.lastOrNull()?.weightKg ?: fallbackTodayKg ?: fallbackLastKg
    val bfByDay = sortedMapOf<String, Double>()
    for (pt in history) {
      if (pt.day.isNotBlank() && pt.day <= today && pt.bodyFatPercentage != null) {
        bfByDay[pt.day] = pt.bodyFatPercentage
      }
    }
    if (ctxLastDay != null && ctxLastDay <= today && watchCtx.lastBodyFatPercentage != null) {
      bfByDay[ctxLastDay] = watchCtx.lastBodyFatPercentage
    }
    if (ctxDay != null && ctxDay <= today && watchCtx.todayBodyFatPercentage != null) {
      bfByDay[ctxDay] = watchCtx.todayBodyFatPercentage
    } else if (ctxDay == null && watchCtx.todayBodyFatPercentage != null) {
      bfByDay[today] = watchCtx.todayBodyFatPercentage
    }
    val todayBf = if (watchCtx.today == null || watchCtx.today == today) {
      watchCtx.todayBodyFatPercentage
    } else {
      null
    }
    val fallbackLastBf = if (ctxLastDay == null || ctxLastDay <= today) watchCtx.lastBodyFatPercentage else null
    val bodyFat = todayBf
      ?: bfByDay.values.lastOrNull()
      ?: fallbackLastBf

    if (latestKg == null || latestKg <= 0.0) {
      if (bodyFat != null) {
        return WeightTileModel(
          hasData = true,
          hasWeight = false,
          loggedToday = false,
          queuedToday = false,
          failedToday = todayFailed,
          latestDisplay = 0.0,
          unitSuffix = unit.suffix,
          weightValueText = String.format(locale, "BF %.1f%%", bodyFat),
          stepDelta = null,
          trendDelta = null,
          trendCount = 0,
          bodyFatPercent = bodyFat,
          sparklineFractions = emptyList(),
          progress = 0.3f
        )
      }
      return WeightTileModel(
        hasData = false,
        hasWeight = false,
        loggedToday = false,
        queuedToday = false,
        failedToday = todayFailed,
        latestDisplay = 0.0,
        unitSuffix = unit.suffix,
        weightValueText = "—",
        stepDelta = null,
        trendDelta = null,
        trendCount = 0,
        bodyFatPercent = null,
        sparklineFractions = emptyList(),
        progress = 0f
      )
    }

    val hasTodayEntry = byDay.containsKey(today)
    val queuedToday = hasTodayEntry && todayUnconfirmed
    val loggedToday = hasTodayEntry && !todayUnconfirmed
    val latestDisplay = unit.displayedFromKg(latestKg)
    val weightValueText = String.format(locale, "%.1f %s", latestDisplay, unit.suffix)

    val priorKg: Double? = when {
      datedPoints.size >= 2 -> datedPoints[datedPoints.size - 2].weightKg
      datedPoints.size == 1 && ctxLastDay == null && ctxLastKg != null && abs(ctxLastKg - latestKg) >= 0.05 -> ctxLastKg
      else -> null
    }

    val stepDelta = priorKg?.let { prev ->
      val raw = latestDisplay - unit.displayedFromKg(prev)
      (raw * 10.0).roundToInt() / 10.0
    }

    val seriesPoints = if (datedPoints.isNotEmpty()) {
      datedPoints.takeLast(7).map { unit.displayedFromKg(it.weightKg) }
    } else {
      listOf(latestDisplay)
    }

    val trendDelta = if (seriesPoints.size >= 2) {
      val raw = seriesPoints.last() - seriesPoints.first()
      (raw * 10.0).roundToInt() / 10.0
    } else {
      stepDelta
    }

    val sparklineFractions = if (seriesPoints.size >= 2) {
      val minVal = seriesPoints.minOrNull() ?: 0.0
      val maxVal = seriesPoints.maxOrNull() ?: 0.0
      val span = maxVal - minVal
      if (span < 0.05) {
        List(seriesPoints.size) { 0.55f }
      } else {
        seriesPoints.map { v -> ((v - minVal) / span).toFloat().coerceIn(0f, 1f) }
      }
    } else {
      emptyList()
    }

    val progress = when {
      loggedToday -> 1f
      queuedToday -> 0.85f
      seriesPoints.isNotEmpty() -> ((seriesPoints.size.coerceAtMost(7) / 7f) * 0.85f).coerceIn(0.15f, 0.85f)
      else -> 0.2f
    }

    return WeightTileModel(
      hasData = true,
      hasWeight = true,
      loggedToday = loggedToday,
      queuedToday = queuedToday,
      failedToday = todayFailed,
      latestDisplay = latestDisplay,
      unitSuffix = unit.suffix,
      weightValueText = weightValueText,
      stepDelta = stepDelta,
      trendDelta = trendDelta,
      trendCount = seriesPoints.size,
      bodyFatPercent = bodyFat,
      sparklineFractions = sparklineFractions,
      progress = progress
    )
  }
}

object TileUpdater {
  private val tileClasses = listOf(
    NutritionTileService::class.java,
    WaterTileService::class.java,
    SleepTileService::class.java,
    MedicationsTileService::class.java,
    ExerciseTileService::class.java,
    WeightTileService::class.java
  )

  /**
   * Requests a system refresh for all registered SparkyFitness Wear OS tiles.
   */
  fun requestAll(context: Context) {
    val appCtx = context.applicationContext
    val updater = try {
      TileService.getUpdater(appCtx)
    } catch (_: Throwable) {
      return
    }
    for (cls in tileClasses) {
      try {
        updater.requestUpdate(cls)
      } catch (_: Throwable) {}
    }
  }
}

class PackageReplacedTileReceiver : BroadcastReceiver() {
  /**
   * Refreshes watch context, complications, and tiles after the app package is updated.
   */
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
      WearSessionManager.getInstance(context.applicationContext).pullInitialDataItems()
      ComplicationUpdater.requestAll(context)
      TileUpdater.requestAll(context)
    }
  }
}

abstract class BaseSparkyTileService : TileService() {
  protected abstract val targetPageKey: String
  protected abstract val accentColorArgb: Int

  protected abstract fun buildContentLayout(session: WearSessionManager): LayoutElement

  /**
   * Handles an inline interactive tile [ActionBuilders.LoadAction] click when [clickableId] is non-empty.
   * Returns `true` when the click mutated local store state so the tile re-renders immediately.
   */
  protected open fun handleTileAction(session: WearSessionManager, clickableId: String): Boolean = false

  /**
   * Builds the ProtoLayout timeline response for this tile service.
   */
  override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<Tile> {
    val session = WearSessionManager.getInstance(applicationContext)
    session.checkInStore.pruneStaleDayData()
    val clickedId = requestParams.currentState.lastClickableId
    val handledClick = clickedId.isNotEmpty() && try {
      handleTileAction(session, clickedId)
    } catch (t: Throwable) {
      val actionKind = clickedId.substringBefore(':', clickedId)
      Log.w("SparkyTile", "Failed handling tile click $actionKind", t)
      false
    }
    if (!handledClick) {
      session.requestContextFromPhoneThrottled()
    }

    // Store the preferred targetPageKey in the launch intent; MainActivity resolves it against
    // enabledPages at tap time (e.g. entry -> trend, workout -> steps) so cached tiles recover
    // if a hidden page is later re-enabled.
    val root = try {
      buildTileShell(
        content = buildContentLayout(session),
        progress = currentRingProgress(session),
        accentColorArgb = accentColorArgb,
        clickable = launchPageClickable(targetPageKey)
      )
    } catch (t: Throwable) {
      Log.e("SparkyTile", "Failed to build tile ${this::class.java.simpleName}", t)
      buildTileShell(
        content = Column.Builder()
          .setWidth(expand())
          .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
          .addContent(tileText(value = "SPARKY", sizeSp = 11f, colorArgb = accentColorArgb, bold = true))
          .addContent(vSpacer(4f))
          .addContent(tileText(value = getString(R.string.tile_tap_to_open), sizeSp = 13f, bold = true))
          .build(),
        progress = 0f,
        accentColorArgb = accentColorArgb,
        clickable = launchPageClickable(targetPageKey)
      )
    }

    val tile = Tile.Builder()
      .setResourcesVersion(TILE_RESOURCES_VERSION)
      .setFreshnessIntervalMillis(TILE_FRESHNESS_INTERVAL_MS)
      .setTileTimeline(
        Timeline.Builder()
          .addTimelineEntry(
            TimelineEntry.Builder()
              .setLayout(Layout.Builder().setRoot(root).build())
              .build()
          )
          .build()
      )
      .build()

    return Futures.immediateFuture(tile)
  }

  protected open fun currentRingProgress(session: WearSessionManager): Float = 0f

  override fun onTileResourcesRequest(
    requestParams: RequestBuilders.ResourcesRequest
  ): ListenableFuture<Resources> {
    return Futures.immediateFuture(
      Resources.Builder()
        .setVersion(TILE_RESOURCES_VERSION)
        .build()
    )
  }

  /** Builds a clickable action that opens [MainActivity] deep-linked to [pageKey]. */
  protected fun launchPageClickable(pageKey: String): Clickable {
    val activity = ActionBuilders.AndroidActivity.Builder()
      .setPackageName(packageName)
      .setClassName(ComponentName(this, MainActivity::class.java).className)
      .addKeyToExtraMapping("target_page", ActionBuilders.stringExtra(pageKey))
      .build()

    val action = ActionBuilders.LaunchAction.Builder()
      .setAndroidActivity(activity)
      .build()

    return Clickable.Builder()
      .setId("open_$pageKey")
      .setOnClick(action)
      .build()
  }

  /** Builds a clickable action that triggers an in-place tile reload with [id] in `lastClickableId`. */
  protected fun loadActionClickable(id: String): Clickable {
    return Clickable.Builder()
      .setId(id)
      .setOnClick(ActionBuilders.LoadAction.Builder().build())
      .build()
  }
}

/** Wraps tile [content] in a circular shell with a 300-degree progress arc and tap handler. */
private fun buildTileShell(
  content: LayoutElement,
  progress: Float,
  accentColorArgb: Int,
  clickable: Clickable
): LayoutElement {
  val clamped = progress.coerceIn(0f, 1f)
  val sweepDegrees = (clamped * 300f).coerceIn(0.1f, 300f)

  val progressArc = Arc.Builder()
    .setAnchorAngle(degrees(-150f))
    .setAnchorType(LayoutElementBuilders.ARC_ANCHOR_START)
    .addContent(
      ArcLine.Builder()
        .setLength(degrees(300f))
        .setThickness(dp(5f))
        .setColor(argb(0xFF1E293B.toInt()))
        .build()
    )
    .build()

  val activeArc = Arc.Builder()
    .setAnchorAngle(degrees(-150f))
    .setAnchorType(LayoutElementBuilders.ARC_ANCHOR_START)
    .addContent(
      ArcLine.Builder()
        .setLength(degrees(sweepDegrees))
        .setThickness(dp(5f))
        .setColor(argb(accentColorArgb))
        .build()
    )
    .build()

  return Box.Builder()
    .setWidth(expand())
    .setHeight(expand())
    .setModifiers(
      Modifiers.Builder()
        .setClickable(clickable)
        .setBackground(Background.Builder().setColor(argb(0xFF000000.toInt())).build())
        .build()
    )
    .addContent(progressArc)
    .addContent(activeArc)
    .addContent(
      Box.Builder()
        .setWidth(expand())
        .setHeight(expand())
        .setModifiers(
          Modifiers.Builder()
            .setPadding(
              Padding.Builder()
                .setStart(dp(20f))
                .setEnd(dp(20f))
                .setTop(dp(18f))
                .setBottom(dp(16f))
                .build()
            )
            .build()
        )
        .addContent(content)
        .build()
    )
    .build()
}

/**
 * Builds a single-line or multi-line ProtoLayout [Text] element with the given size, color, and weight.
 */
private fun tileText(
  value: String,
  sizeSp: Float,
  colorArgb: Int = 0xFFFFFFFF.toInt(),
  bold: Boolean = false,
  maxLines: Int = 1
): Text {
  return Text.Builder()
    .setText(value)
    .setMaxLines(maxLines)
    .setFontStyle(
      FontStyle.Builder()
        .setSize(sp(sizeSp))
        .setColor(argb(colorArgb))
        .setWeight(
          if (bold) LayoutElementBuilders.FONT_WEIGHT_BOLD
          else LayoutElementBuilders.FONT_WEIGHT_NORMAL
        )
        .build()
    )
    .build()
}

private fun vSpacer(heightDp: Float): Spacer =
  Spacer.Builder().setHeight(dp(heightDp)).build()

private fun hSpacer(widthDp: Float): Spacer =
  Spacer.Builder().setWidth(dp(widthDp)).build()

private fun pillRow(
  leftLabel: String,
  rightValue: String,
  accentColorArgb: Int,
  clickable: Clickable? = null,
  bgColorArgb: Int = 0xFF1E2636.toInt()
): LayoutElement {
  val modifiers = Modifiers.Builder()
    .setBackground(
      Background.Builder()
        .setColor(argb(bgColorArgb))
        .setCorner(Corner.Builder().setRadius(dp(14f)).build())
        .build()
    )
    .setPadding(
      Padding.Builder()
        .setStart(dp(10f))
        .setEnd(dp(10f))
        .setTop(dp(4f))
        .setBottom(dp(4f))
        .build()
    )
  if (clickable != null) {
    modifiers.setClickable(clickable)
  }
  return Box.Builder()
    .setWidth(expand())
    .setModifiers(modifiers.build())
    .addContent(
      Row.Builder()
        .setWidth(expand())
        .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
        .addContent(
          Box.Builder()
            .setWidth(dp(6f))
            .setHeight(dp(6f))
            .setModifiers(
              Modifiers.Builder()
                .setBackground(
                  Background.Builder()
                    .setColor(argb(accentColorArgb))
                    .setCorner(Corner.Builder().setRadius(dp(3f)).build())
                    .build()
                )
                .build()
            )
            .build()
        )
        .addContent(hSpacer(6f))
        .addContent(
          tileText(
            value = leftLabel,
            sizeSp = 11f,
            colorArgb = 0xFFF1F5F9.toInt(),
            bold = true
          )
        )
        .addContent(hSpacer(6f))
        .addContent(
          Box.Builder()
            .setWidth(expand())
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_END)
            .addContent(
              tileText(
                value = rightValue,
                sizeSp = 11f,
                colorArgb = accentColorArgb,
                bold = true
              )
            )
            .build()
        )
        .build()
    )
    .build()
}

private fun bottomActionPill(
  label: String,
  bgColorArgb: Int,
  textColorArgb: Int,
  clickable: Clickable? = null
): LayoutElement {
  val modifiers = Modifiers.Builder()
    .setBackground(
      Background.Builder()
        .setColor(argb(bgColorArgb))
        .setCorner(Corner.Builder().setRadius(dp(14f)).build())
        .build()
    )
    .setPadding(
      Padding.Builder()
        .setStart(dp(12f))
        .setEnd(dp(12f))
        .setTop(dp(3f))
        .setBottom(dp(3f))
        .build()
    )
  if (clickable != null) {
    modifiers.setClickable(clickable)
  }
  return Box.Builder()
    .setWidth(wrap())
    .setHeight(wrap())
    .setModifiers(modifiers.build())
    .addContent(
      tileText(
        value = label,
        sizeSp = 10f,
        colorArgb = textColorArgb,
        bold = true
      )
    )
    .build()
}

class NutritionTileService : BaseSparkyTileService() {
  override val targetPageKey = "goals"
  override val accentColorArgb = 0xFF4ADE80.toInt()

  override fun currentRingProgress(session: WearSessionManager): Float {
    return TileModels.buildNutritionTileModel(session.checkInStore.nutrition.value).calorieProgress
  }

  /**
   * Builds the ProtoLayout content column for the Nutrition tile.
   */
  override fun buildContentLayout(session: WearSessionManager): LayoutElement {
    val model = TileModels.buildNutritionTileModel(
      session.checkInStore.nutrition.value,
      EnergyDisplay.of(session.checkInStore.watchContext.value)
    )
    val col = Column.Builder()
      .setWidth(expand())
      .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
      .addContent(
        tileText(
          value = getString(R.string.tile_nutrition_header),
          sizeSp = 10f,
          colorArgb = accentColorArgb,
          bold = true
        )
      )
      .addContent(vSpacer(2f))

    if (!model.hasData) {
      col.addContent(
        tileText(
          value = "— / — ${EnergyDisplay.of(session.checkInStore.watchContext.value).unit}",
          sizeSp = 15f,
          colorArgb = 0xFFFFFFFF.toInt(),
          bold = true
        )
      )
      col.addContent(vSpacer(4f))
      col.addContent(
        tileText(
          value = getString(R.string.tile_nutrition_tap_goals),
          sizeSp = 11f,
          colorArgb = 0xFF94A3B8.toInt()
        )
      )
      col.addContent(vSpacer(6f))
      col.addContent(
        bottomActionPill(
          label = getString(R.string.tile_nutrition_open_goals),
          bgColorArgb = 0xFF163E28.toInt(),
          textColorArgb = accentColorArgb
        )
      )
      return col.build()
    }

    val calHeadline = if (model.goalKcal > 0) {
      "${model.consumedKcal} / ${model.goalKcal} ${model.energyUnit}"
    } else {
      "${model.consumedKcal} ${model.energyUnit}"
    }
    col.addContent(
      tileText(
        value = calHeadline,
        sizeSp = 14f,
        colorArgb = 0xFFFFFFFF.toInt(),
        bold = true
      )
    )
    val subText = if (model.remainingKcal >= 0) {
      getString(R.string.tile_nutrition_left_burned, model.remainingKcal, model.burnedKcal)
    } else {
      getString(R.string.tile_nutrition_over_burned, -model.remainingKcal, model.burnedKcal)
    }
    col.addContent(
      tileText(
        value = subText,
        sizeSp = 10f,
        colorArgb = 0xFF94A3B8.toInt()
      )
    )
    col.addContent(vSpacer(4f))

    for ((idx, macro) in model.macros.withIndex()) {
      if (idx > 0) col.addContent(vSpacer(3f))
      val macroLabel = if (macro.labelRes != 0) getString(macro.labelRes) else macro.label
      col.addContent(
        pillRow(
          leftLabel = macroLabel,
          rightValue = macro.valueText,
          accentColorArgb = macro.colorArgb
        )
      )
    }

    if (model.macros.size < 3) {
      col.addContent(vSpacer(4f))
      col.addContent(
        bottomActionPill(
          label = getString(R.string.tile_nutrition_pct_goal, (model.calorieProgress * 100f).roundToInt()),
          bgColorArgb = 0xFF163E28.toInt(),
          textColorArgb = accentColorArgb
        )
      )
    }

    return col.build()
  }
}

class SleepTileService : BaseSparkyTileService() {
  override val targetPageKey = "sleep"
  override val accentColorArgb = 0xFF818CF8.toInt()

  override fun currentRingProgress(session: WearSessionManager): Float {
    return TileModels.buildSleepTileModel(session.checkInStore.sleep.value).progress
  }

  /**
   * Builds the ProtoLayout content column for the Sleep Health tile.
   */
  override fun buildContentLayout(session: WearSessionManager): LayoutElement {
    val model = TileModels.buildSleepTileModel(session.checkInStore.sleep.value)
    val headerLabel = if (model.hasData && model.biometricsText != null && model.stages.size >= 3) {
      getString(R.string.tile_sleep_header_bio, model.biometricsText.take(12).uppercase(Locale.US))
    } else {
      getString(R.string.tile_sleep_header)
    }
    val col = Column.Builder()
      .setWidth(expand())
      .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
      .addContent(
        tileText(
          value = headerLabel,
          sizeSp = 10f,
          colorArgb = accentColorArgb,
          bold = true
        )
      )
      .addContent(vSpacer(2f))

    if (!model.hasData) {
      col.addContent(
        tileText(
          value = getString(R.string.tile_sleep_no_data_title),
          sizeSp = 15f,
          colorArgb = 0xFFFFFFFF.toInt(),
          bold = true
        )
      )
      col.addContent(vSpacer(4f))
      col.addContent(
        tileText(
          value = getString(R.string.tile_sleep_no_data_sub),
          sizeSp = 11f,
          colorArgb = 0xFF94A3B8.toInt()
        )
      )
      col.addContent(vSpacer(6f))
      col.addContent(
        bottomActionPill(
          label = getString(R.string.sleep_title),
          bgColorArgb = 0xFF262856.toInt(),
          textColorArgb = 0xFFC7D2FE.toInt()
        )
      )
      return col.build()
    }

    val resolvedDuration = TileModels.formatSleepDuration(this, model)
    val resolvedScore = model.sleepScore?.let { getString(R.string.tile_sleep_score, it) }
    val headlineText = if (resolvedScore != null) {
      "$resolvedDuration · $resolvedScore"
    } else {
      resolvedDuration
    }
    col.addContent(
      tileText(
        value = headlineText,
        sizeSp = 14f,
        colorArgb = 0xFFFFFFFF.toInt(),
        bold = true
      )
    )
    col.addContent(
      tileText(
        value = TileModels.formatSleepWindow(this, model.window),
        sizeSp = 10f,
        colorArgb = 0xFF94A3B8.toInt()
      )
    )
    col.addContent(vSpacer(4f))

    for ((idx, stage) in model.stages.take(3).withIndex()) {
      if (idx > 0) col.addContent(vSpacer(3f))
      val stageLabel = if (stage.labelRes != 0) getString(stage.labelRes) else stage.label
      col.addContent(
        pillRow(
          leftLabel = stageLabel,
          rightValue = stage.durationText,
          accentColorArgb = stage.colorArgb
        )
      )
    }

    if (model.stages.size < 3) {
      col.addContent(vSpacer(4f))
      col.addContent(
        bottomActionPill(
          label = model.biometricsText ?: getString(R.string.tile_sleep_details),
          bgColorArgb = 0xFF262856.toInt(),
          textColorArgb = 0xFFC7D2FE.toInt()
        )
      )
    }

    return col.build()
  }
}

private const val CLICK_MED_TAKE_PREFIX = "med_take:"
private const val CLICK_WATER_ADD_PREFIX = "water_add:"
private const val CLICK_WATER_RETRY_PREFIX = "water_retry:"

internal fun medicationDoseFingerprint(dose: MedicationDose): String {
  val raw = "${dose.name.trim()}\u0000${dose.detail.trim()}\u0000${dose.time.trim()}"
  val digest = java.security.MessageDigest.getInstance("SHA-256").digest(raw.toByteArray(Charsets.UTF_8))
  return digest.take(6).joinToString("") { "%02x".format(it) }
}

internal fun formatMedicationTileActionId(
  actionToken: String,
  day: String,
  doseId: String,
  displayFingerprint: String
): String = "$CLICK_MED_TAKE_PREFIX$actionToken:$day:$displayFingerprint:$doseId"

internal fun resolveMedicationTileActionDose(
  clickableId: String,
  expectedToken: String?,
  currentSnap: MedicationSnapshot?
): MedicationDose? {
  if (!clickableId.startsWith(CLICK_MED_TAKE_PREFIX) || expectedToken.isNullOrEmpty()) return null
  val parts = clickableId.removePrefix(CLICK_MED_TAKE_PREFIX).split(':', limit = 4)
  if (parts.size != 4) return null
  val token = parts[0]
  val renderedDay = parts[1]
  val renderedFingerprint = parts[2]
  val doseId = parts[3]
  if (token != expectedToken || renderedDay.isEmpty() || renderedFingerprint.isEmpty() || doseId.isEmpty()) return null
  val snap = currentSnap?.takeIf { it.isToday && it.day == renderedDay } ?: return null
  val model = TileModels.buildMedicationsTileModel(snap)
  val actionableRow = model.doseRows.firstOrNull { it.isDirectlyActionable && it.doseId == doseId } ?: return null
  if (actionableRow.displayFingerprint != renderedFingerprint) return null
  return snap.doses.firstOrNull {
    it.id == doseId &&
      it.status == MedicationDoseStatus.PENDING &&
      medicationDoseFingerprint(it) == renderedFingerprint
  }
}

class MedicationsTileService : BaseSparkyTileService() {
  override val targetPageKey = "medications"
  override val accentColorArgb = 0xFF2DD4BF.toInt()

  override fun currentRingProgress(session: WearSessionManager): Float {
    return TileModels.buildMedicationsTileModel(session.checkInStore.medications.value).progress
  }

  override fun handleTileAction(session: WearSessionManager, clickableId: String): Boolean {
    val store = session.checkInStore
    val dose = resolveMedicationTileActionDose(
      clickableId = clickableId,
      expectedToken = store.currentActionToken(),
      currentSnap = store.medications.value
    ) ?: return false
    store.toggleMedication(dose, refreshTiles = false)
    return true
  }

  /**
   * Builds the ProtoLayout content column for the Medications tile.
   */
  override fun buildContentLayout(session: WearSessionManager): LayoutElement {
    val store = session.checkInStore
    val medSnap = store.medications.value
    val medDay = medSnap?.day?.takeIf { it.isNotBlank() }
    val model = TileModels.buildMedicationsTileModel(medSnap, store.failedMedicationDoseIdsForToday())
    val actionToken = store.currentActionToken()
    val headlineText = TileModels.formatMedicationsHeadline(this, model)
    val subtitleText = TileModels.formatMedicationsSubtitle(this, model)
    val col = Column.Builder()
      .setWidth(expand())
      .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
      .addContent(
        tileText(
          value = getString(R.string.tile_meds_header),
          sizeSp = 10f,
          colorArgb = accentColorArgb,
          bold = true
        )
      )
      .addContent(vSpacer(2f))
      .addContent(
        tileText(
          value = headlineText,
          sizeSp = 15f,
          colorArgb = 0xFFFFFFFF.toInt(),
          bold = true
        )
      )
      .addContent(
        tileText(
          value = subtitleText,
          sizeSp = 10f,
          colorArgb = 0xFF94A3B8.toInt()
        )
      )
      .addContent(vSpacer(4f))

    for ((idx, dose) in model.doseRows.withIndex()) {
      if (idx > 0) col.addContent(vSpacer(3f))
      val doseClickable = when {
        dose.isDirectlyActionable && actionToken != null && !medDay.isNullOrEmpty() && dose.doseId.isNotEmpty() ->
          loadActionClickable(
            formatMedicationTileActionId(actionToken, medDay, dose.doseId, dose.displayFingerprint)
          )
        dose.isPending ->
          launchPageClickable(targetPageKey)
        else -> null
      }
      col.addContent(
        pillRow(
          leftLabel = "${dose.statusSymbol} ${dose.name}",
          rightValue = dose.detailText,
          accentColorArgb = dose.statusColorArgb,
          clickable = doseClickable,
          bgColorArgb = if (doseClickable != null) 0xFF232D3F.toInt() else 0xFF1E2636.toInt()
        )
      )
    }

    if (model.doseRows.size < 3) {
      col.addContent(vSpacer(4f))
      col.addContent(
        bottomActionPill(
          label = if (model.pendingCount > 0) {
            getString(R.string.tile_meds_log_dose)
          } else {
            getString(R.string.meds_title_empty)
          },
          bgColorArgb = 0xFF144440.toInt(),
          textColorArgb = accentColorArgb
        )
      )
    }

    return col.build()
  }
}

class ExerciseTileService : BaseSparkyTileService() {
  override val targetPageKey = "workout"
  override val accentColorArgb = 0xFFFB923C.toInt()

  override fun currentRingProgress(session: WearSessionManager): Float {
    val store = session.checkInStore
    return TileModels.buildExerciseTileModel(
      exercise = store.exerciseSummary.value,
      scheduledWorkouts = store.todaysScheduledWorkouts(),
      steps = store.steps.value,
      stepGoal = store.stepGoal.value
    ).progress
  }

  /**
   * Builds the ProtoLayout content column for the Exercise tile.
   */
  override fun buildContentLayout(session: WearSessionManager): LayoutElement {
    val store = session.checkInStore
    val model = TileModels.buildExerciseTileModel(
      exercise = store.exerciseSummary.value,
      scheduledWorkouts = store.todaysScheduledWorkouts(),
      steps = store.steps.value,
      stepGoal = store.stepGoal.value,
      energy = EnergyDisplay.of(store.watchContext.value)
    )
    val headlineText = TileModels.formatExerciseHeadline(this, model)
    val subtitleText = TileModels.formatExerciseSubtitle(this, model)
    val col = Column.Builder()
      .setWidth(expand())
      .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
      .addContent(
        tileText(
          value = getString(R.string.tile_exercise_header),
          sizeSp = 10f,
          colorArgb = accentColorArgb,
          bold = true
        )
      )
      .addContent(vSpacer(2f))
      .addContent(
        tileText(
          value = headlineText,
          sizeSp = 15f,
          colorArgb = 0xFFFFFFFF.toInt(),
          bold = true
        )
      )
      .addContent(
        tileText(
          value = subtitleText,
          sizeSp = 10f,
          colorArgb = 0xFF94A3B8.toInt()
        )
      )
      .addContent(vSpacer(4f))

    for ((idx, row) in model.rows.withIndex()) {
      if (idx > 0) col.addContent(vSpacer(3f))
      val rowSubtitle = if (row.subtitleRes != 0) getString(row.subtitleRes) else row.subtitle
      col.addContent(
        pillRow(
          leftLabel = row.title,
          rightValue = rowSubtitle,
          accentColorArgb = row.badgeColorArgb
        )
      )
    }

    if (model.rows.size < 3) {
      col.addContent(vSpacer(4f))
      col.addContent(
        bottomActionPill(
          label = getString(R.string.tile_exercise_workouts_pill),
          bgColorArgb = 0xFF431407.toInt(),
          textColorArgb = accentColorArgb
        )
      )
    }

    return col.build()
  }
}

class WaterTileService : BaseSparkyTileService() {
  override val targetPageKey = "water"
  override val accentColorArgb = 0xFF22D3EE.toInt()

  override fun currentRingProgress(session: WearSessionManager): Float {
    val store = session.checkInStore
    if (store.activeOwnerId() == null) return 0f
    return (store.effectiveWaterMl.value / max(1.0, store.waterGoalMl.value)).toFloat().coerceIn(0f, 1f)
  }

  override fun handleTileAction(session: WearSessionManager, clickableId: String): Boolean {
    val store = session.checkInStore
    val currentToken = store.currentActionToken() ?: return false
    if (clickableId.startsWith(CLICK_WATER_RETRY_PREFIX)) {
      val token = clickableId.removePrefix(CLICK_WATER_RETRY_PREFIX)
      if (token != currentToken) return false
      store.retryFailedWaterTaps(refreshTiles = false)
      return true
    }
    if (!clickableId.startsWith(CLICK_WATER_ADD_PREFIX)) return false
    val rawSpec = clickableId.removePrefix(CLICK_WATER_ADD_PREFIX)
    val parts = rawSpec.split(':')
    if (parts.size != 3 || parts[0] != currentToken) return false
    val containerId = parts[1].toIntOrNull() ?: return false
    val expectedBits = parts[2].toLongOrNull() ?: return false
    val containers = TileModels.resolveEffectiveWaterContainers(
      containers = store.waterContainers.value,
      displayUnit = store.watchContext.value.waterDisplayUnit,
      defaultGlassName = getString(R.string.water_default_glass),
      defaultBottleName = getString(R.string.water_default_bottle)
    )
    val target = containers.firstOrNull { it.id == containerId } ?: return false
    if (target.servingVolumeMl.toRawBits() != expectedBits) {
      return false
    }
    store.tapWaterContainer(target, refreshTiles = false)
    return true
  }

  /**
   * Builds the ProtoLayout content column for the interactive Hydration tile.
   */
  override fun buildContentLayout(session: WearSessionManager): LayoutElement {
    val store = session.checkInStore
    val actionToken = store.currentActionToken()
    val waterEnabled = store.enabledPages.value.contains(WatchPage.WATER)
    val model = TileModels.buildWaterTileModel(
      hasOwner = actionToken != null,
      consumedMl = store.effectiveWaterMl.value,
      goalMl = store.waterGoalMl.value,
      queuedMl = store.queuedWaterMl.value,
      watchCtx = store.watchContext.value,
      containers = store.waterContainers.value,
      waterSyncState = store.waterSyncState.value,
      defaultGlassName = getString(R.string.water_default_glass),
      defaultBottleName = getString(R.string.water_default_bottle)
    )

    val col = Column.Builder()
      .setWidth(expand())
      .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
      .addContent(
        tileText(
          value = getString(R.string.tile_water_header),
          sizeSp = 10f,
          colorArgb = accentColorArgb,
          bold = true
        )
      )
      .addContent(vSpacer(2f))

    if (!model.hasOwner || actionToken == null) {
      col.addContent(
        tileText(
          value = getString(R.string.tile_meds_not_synced),
          sizeSp = 15f,
          colorArgb = 0xFFFFFFFF.toInt(),
          bold = true
        )
      )
      col.addContent(vSpacer(4f))
      col.addContent(
        tileText(
          value = getString(R.string.tile_meds_open_app),
          sizeSp = 11f,
          colorArgb = 0xFF94A3B8.toInt()
        )
      )
      col.addContent(vSpacer(6f))
      col.addContent(
        bottomActionPill(
          label = getString(R.string.water_title),
          bgColorArgb = 0xFF0E3A47.toInt(),
          textColorArgb = accentColorArgb
        )
      )
      return col.build()
    }

    col.addContent(
      tileText(
        value = "${model.consumedText} / ${model.goalText}",
        sizeSp = 14f,
        colorArgb = 0xFFFFFFFF.toInt(),
        bold = true
      )
    )
    val retryClickable = if (model.syncFailed && !waterEnabled) {
      loadActionClickable("$CLICK_WATER_RETRY_PREFIX$actionToken")
    } else {
      null
    }
    val (subText, subColor) = when {
      model.syncFailed && !waterEnabled -> getString(R.string.water_sync_failed) to 0xFFFB7185.toInt()
      model.syncFailed -> getString(R.string.tile_water_sync_failed) to 0xFFFB7185.toInt()
      model.queuedText != null -> getString(R.string.water_syncing_amount, model.queuedText) to 0xFFFBBF24.toInt()
      model.isGoalMet -> getString(R.string.tile_water_goal_reached) to 0xFF4ADE80.toInt()
      model.remainingText != null -> getString(R.string.tile_water_remaining, model.remainingText) to 0xFF94A3B8.toInt()
      else -> getString(R.string.tile_water_tap_log) to 0xFF94A3B8.toInt()
    }
    val subtitleNode = tileText(
      value = subText,
      sizeSp = 10f,
      colorArgb = subColor
    )
    if (retryClickable != null) {
      col.addContent(
        Box.Builder()
          .setModifiers(Modifiers.Builder().setClickable(retryClickable).build())
          .addContent(subtitleNode)
          .build()
      )
    } else {
      col.addContent(subtitleNode)
    }
    col.addContent(vSpacer(4f))

    for ((idx, chip) in model.containers.withIndex()) {
      if (idx > 0) col.addContent(vSpacer(3f))
      col.addContent(
        pillRow(
          leftLabel = chip.name,
          rightValue = chip.addText,
          accentColorArgb = accentColorArgb,
          clickable = loadActionClickable("$CLICK_WATER_ADD_PREFIX$actionToken:${chip.id}:${chip.volumeMl.toRawBits()}"),
          bgColorArgb = 0xFF19283A.toInt()
        )
      )
    }

    if (model.containers.size < 3) {
      if (retryClickable != null) {
        col.addContent(vSpacer(4f))
        col.addContent(
          bottomActionPill(
            label = getString(R.string.common_retry),
            bgColorArgb = 0xFF4C1D24.toInt(),
            textColorArgb = 0xFFFB7185.toInt(),
            clickable = retryClickable
          )
        )
      } else if (waterEnabled) {
        col.addContent(vSpacer(4f))
        col.addContent(
          bottomActionPill(
            label = getString(R.string.tile_water_open_log),
            bgColorArgb = 0xFF0E3A47.toInt(),
            textColorArgb = accentColorArgb
          )
        )
      }
    }

    return col.build()
  }
}

private fun buildWeightSparklineCard(
  fractions: List<Float>,
  rightBadgeText: String,
  accentColorArgb: Int,
  barColorArgb: Int,
  clickable: Clickable? = null
): LayoutElement {
  val barsRow = Row.Builder()
    .setWidth(wrap())
    .setHeight(dp(26f))
    .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_BOTTOM)

  for ((idx, frac) in fractions.takeLast(7).withIndex()) {
    if (idx > 0) {
      barsRow.addContent(hSpacer(3f))
    }
    val barHeightDp = 10f + (frac.coerceIn(0f, 1f) * 16f)
    val isLast = idx == fractions.takeLast(7).lastIndex
    barsRow.addContent(
      Box.Builder()
        .setWidth(dp(6f))
        .setHeight(dp(barHeightDp))
        .setModifiers(
          Modifiers.Builder()
            .setBackground(
              Background.Builder()
                .setColor(argb(if (isLast) accentColorArgb else barColorArgb))
                .setCorner(Corner.Builder().setRadius(dp(3f)).build())
                .build()
            )
            .build()
        )
        .build()
    )
  }

  val cardModifiers = Modifiers.Builder()
    .setBackground(
      Background.Builder()
        .setColor(argb(0xFF1E2636.toInt()))
        .setCorner(Corner.Builder().setRadius(dp(14f)).build())
        .build()
    )
    .setPadding(
      Padding.Builder()
        .setStart(dp(10f))
        .setEnd(dp(10f))
        .setTop(dp(6f))
        .setBottom(dp(6f))
        .build()
    )
  if (clickable != null) {
    cardModifiers.setClickable(clickable)
  }

  return Box.Builder()
    .setWidth(expand())
    .setModifiers(cardModifiers.build())
    .addContent(
      Row.Builder()
        .setWidth(expand())
        .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
        .addContent(barsRow.build())
        .addContent(
          Box.Builder()
            .setWidth(expand())
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_END)
            .addContent(
              tileText(
                value = rightBadgeText,
                sizeSp = 11f,
                colorArgb = barColorArgb,
                bold = true
              )
            )
            .build()
        )
        .build()
    )
    .build()
}

class WeightTileService : BaseSparkyTileService() {
  override val targetPageKey = "entry"
  override val accentColorArgb = 0xFF4ADE80.toInt()

  override fun currentRingProgress(session: WearSessionManager): Float {
    val store = session.checkInStore
    val today = CheckInDate.today()
    return TileModels.buildWeightTileModel(
      watchCtx = store.watchContext.value,
      history = store.history.value,
      unit = store.unit.value,
      today = today,
      todayUnconfirmed = store.isDayUnconfirmed(today),
      todayFailed = store.isDayFailed(today),
      locale = Locale.getDefault()
    ).progress
  }

  /**
   * Builds the ProtoLayout content column for the Weight & Body-Comp Trend tile.
   */
  override fun buildContentLayout(session: WearSessionManager): LayoutElement {
    val store = session.checkInStore
    val enabledPages = store.enabledPages.value
    val entryEnabled = enabledPages.contains(WatchPage.ENTRY)
    val today = CheckInDate.today()
    val model = TileModels.buildWeightTileModel(
      watchCtx = store.watchContext.value,
      history = store.history.value,
      unit = store.unit.value,
      today = today,
      todayUnconfirmed = store.isDayUnconfirmed(today),
      todayFailed = store.isDayFailed(today),
      locale = Locale.getDefault()
    )
    val bfBadge = model.bodyFatPercent?.let {
      getString(R.string.weight_bf_short, it)
    }
    val headerText = if (model.hasWeight && bfBadge != null && model.sparklineFractions.size < 2) {
      getString(R.string.tile_weight_header_bf, bfBadge)
    } else {
      getString(R.string.tile_weight_header)
    }

    val col = Column.Builder()
      .setWidth(expand())
      .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
      .addContent(
        tileText(
          value = headerText,
          sizeSp = 10f,
          colorArgb = accentColorArgb,
          bold = true
        )
      )
      .addContent(vSpacer(2f))

    if (!model.hasData) {
      val emptySub = when {
        model.failedToday && entryEnabled -> getString(R.string.tile_weight_sync_failed)
        model.failedToday -> getString(R.string.tile_weight_sync_failed_hidden)
        entryEnabled -> getString(R.string.tile_weight_log_prompt)
        else -> getString(R.string.tile_tap_to_open)
      }
      val emptySubColor = if (model.failedToday) 0xFFFB7185.toInt() else 0xFF94A3B8.toInt()
      col.addContent(
        tileText(
          value = getString(R.string.tile_weight_no_data),
          sizeSp = 15f,
          colorArgb = 0xFFFFFFFF.toInt(),
          bold = true
        )
      )
      col.addContent(vSpacer(4f))
      col.addContent(
        tileText(
          value = emptySub,
          sizeSp = 11f,
          colorArgb = emptySubColor
        )
      )
      if (entryEnabled) {
        col.addContent(vSpacer(6f))
        col.addContent(
          bottomActionPill(
            label = if (model.failedToday) getString(R.string.common_retry) else getString(R.string.tile_weight_check_in),
            bgColorArgb = if (model.failedToday) 0xFF4C1D24.toInt() else 0xFF163E28.toInt(),
            textColorArgb = if (model.failedToday) 0xFFFB7185.toInt() else accentColorArgb,
            clickable = launchPageClickable("entry")
          )
        )
      }
      return col.build()
    }

    val headlineValue = if (!model.hasWeight && bfBadge != null) bfBadge else model.weightValueText
    col.addContent(
      tileText(
        value = headlineValue,
        sizeSp = 15f,
        colorArgb = 0xFFFFFFFF.toInt(),
        bold = true
      )
    )

    val (subtitleText, subtitleColor) = when {
      model.failedToday && entryEnabled -> getString(R.string.tile_weight_sync_failed) to 0xFFFB7185.toInt()
      model.failedToday -> getString(R.string.tile_weight_sync_failed_hidden) to 0xFFFB7185.toInt()
      model.queuedToday -> getString(R.string.tile_weight_queued_today) to 0xFFFBBF24.toInt()
      model.trendDelta != null && model.trendCount >= 2 -> {
        val sign = if (model.trendDelta > 0) "+" else ""
        getString(
          R.string.tile_weight_trend_delta,
          sign,
          model.trendDelta,
          model.unitSuffix,
          model.trendCount
        ) to 0xFF94A3B8.toInt()
      }
      model.stepDelta != null -> {
        val sign = if (model.stepDelta > 0) "+" else ""
        getString(R.string.tile_weight_vs_last, sign, model.stepDelta, model.unitSuffix) to 0xFF94A3B8.toInt()
      }
      model.loggedToday -> getString(R.string.tile_weight_checked_in_today) to 0xFF94A3B8.toInt()
      entryEnabled -> getString(R.string.tile_weight_log_prompt) to 0xFF94A3B8.toInt()
      else -> getString(R.string.tile_tap_to_open) to 0xFF94A3B8.toInt()
    }
    col.addContent(
      tileText(
        value = subtitleText,
        sizeSp = 10f,
        colorArgb = subtitleColor
      )
    )
    col.addContent(vSpacer(5f))

    val trendClickable = if (enabledPages.contains(WatchPage.TREND)) {
      launchPageClickable("trend")
    } else {
      null
    }
    if (model.sparklineFractions.size >= 2) {
      val rightBadge = bfBadge ?: getString(R.string.tile_weight_trend_badge)
      col.addContent(
        buildWeightSparklineCard(
          fractions = model.sparklineFractions,
          rightBadgeText = rightBadge,
          accentColorArgb = accentColorArgb,
          barColorArgb = 0xFF22D3EE.toInt(),
          clickable = trendClickable
        )
      )
    } else {
      col.addContent(
        pillRow(
          leftLabel = getString(R.string.trend_weight_title),
          rightValue = if (model.hasWeight && bfBadge != null) bfBadge else getString(R.string.tile_weight_need_more),
          accentColorArgb = 0xFF22D3EE.toInt(),
          clickable = trendClickable
        )
      )
    }

    if (entryEnabled) {
      val (pillLabel, pillBg, pillFg) = when {
        model.failedToday -> Triple(
          getString(R.string.common_retry),
          0xFF4C1D24.toInt(),
          0xFFFB7185.toInt()
        )
        model.queuedToday -> Triple(
          getString(R.string.tile_weight_queued_pill),
          0xFF423010.toInt(),
          0xFFFBBF24.toInt()
        )
        model.loggedToday -> Triple(
          getString(R.string.tile_weight_checked_in_pill),
          0xFF163E28.toInt(),
          accentColorArgb
        )
        else -> Triple(
          getString(R.string.tile_weight_check_in),
          0xFF163E28.toInt(),
          accentColorArgb
        )
      }
      col.addContent(vSpacer(5f))
      col.addContent(
        bottomActionPill(
          label = pillLabel,
          bgColorArgb = pillBg,
          textColorArgb = pillFg,
          clickable = launchPageClickable("entry")
        )
      )
    }

    return col.build()
  }
}
