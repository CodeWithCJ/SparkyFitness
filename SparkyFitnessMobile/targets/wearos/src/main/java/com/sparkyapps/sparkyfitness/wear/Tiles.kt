package com.sparkyapps.sparkyfitness.wear

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.annotation.StringRes
import androidx.compose.ui.graphics.toArgb
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders
import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.DimensionBuilders.expand
import androidx.wear.protolayout.DimensionBuilders.wrap
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.LayoutElementBuilders.Box
import androidx.wear.protolayout.LayoutElementBuilders.Column
import androidx.wear.protolayout.LayoutElementBuilders.Layout
import androidx.wear.protolayout.LayoutElementBuilders.LayoutElement
import androidx.wear.protolayout.LayoutElementBuilders.Row
import androidx.wear.protolayout.LayoutElementBuilders.Spacer
import androidx.wear.protolayout.ModifiersBuilders.Background
import androidx.wear.protolayout.ModifiersBuilders.Clickable
import androidx.wear.protolayout.ModifiersBuilders.Corner
import androidx.wear.protolayout.ModifiersBuilders.Modifiers
import androidx.wear.protolayout.ModifiersBuilders.Padding
import androidx.wear.protolayout.ResourceBuilders.Resources
import androidx.wear.protolayout.TimelineBuilders.Timeline
import androidx.wear.protolayout.TimelineBuilders.TimelineEntry
import androidx.wear.protolayout.material3.ButtonColors
import androidx.wear.protolayout.material3.ButtonDefaults.filledTonalButtonColors
import androidx.wear.protolayout.material3.CardColors
import androidx.wear.protolayout.material3.ColorScheme
import androidx.wear.protolayout.material3.DataCardStyle
import androidx.wear.protolayout.material3.MaterialScope
import androidx.wear.protolayout.material3.PrimaryLayoutMargins
import androidx.wear.protolayout.material3.ProgressIndicatorColors
import androidx.wear.protolayout.material3.Typography
import androidx.wear.protolayout.material3.buttonGroup
import androidx.wear.protolayout.material3.card
import androidx.wear.protolayout.material3.circularProgressIndicator
import androidx.wear.protolayout.material3.materialScope
import androidx.wear.protolayout.material3.primaryLayout
import androidx.wear.protolayout.material3.text
import androidx.wear.protolayout.material3.textDataCard
import androidx.wear.protolayout.material3.textEdgeButton
import androidx.wear.protolayout.modifiers.LayoutModifier
import androidx.wear.protolayout.modifiers.background
import androidx.wear.protolayout.modifiers.clip
import androidx.wear.protolayout.modifiers.contentDescription
import androidx.wear.protolayout.modifiers.padding
import androidx.wear.protolayout.types.LayoutColor
import androidx.wear.protolayout.types.argb
import androidx.wear.protolayout.types.layoutString
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

private const val TILE_RESOURCES_VERSION = "3"
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
  val displayFingerprint: String = "",
  val fullName: String = name,
  val status: MedicationDoseStatus = MedicationDoseStatus.PENDING
)

data class MedicationsTileModel(
  val hasData: Boolean,
  val takenCount: Int,
  val totalCount: Int,
  val pendingCount: Int,
  val progress: Float,
  val doseRows: List<TileDoseRow>,
  val skippedCount: Int = 0,
  /** Medications is turned off in the phone app (Settings → Features). */
  val turnedOff: Boolean = false,
  val pageIndex: Int = 0,
  val totalPages: Int = 1
)

data class TileWaterContainerChip(
  val id: Int,
  val name: String,
  val addText: String,
  val volumeMl: Double,
  val isQuickAdd: Boolean = false,
  val isDirectlyActionable: Boolean = true,
  val fullName: String = name
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
  val containers: List<TileWaterContainerChip>,
  val pageIndex: Int = 0,
  val totalPages: Int = 1,
  val totalContainerCount: Int = containers.size
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

  const val MEDICATIONS_TILE_PAGE_SIZE = 4

  /**
   * Builds the display model for the Medications tile from today's [MedicationSnapshot],
   * paginating in groups of [MEDICATIONS_TILE_PAGE_SIZE] so all scheduled and PRN doses
   * for the day can be inspected and logged directly from the tile.
   */
  fun buildMedicationsTileModel(
    medications: MedicationSnapshot?,
    failedDoseIds: Set<String> = emptySet(),
    turnedOff: Boolean = false,
    page: Int = 0,
    screenWidthDp: Int = DEFAULT_TILE_SCREEN_WIDTH_DP,
    fontScale: Float = 1f
  ): MedicationsTileModel {
    if (turnedOff) {
      return MedicationsTileModel(
        hasData = false,
        takenCount = 0,
        totalCount = 0,
        pendingCount = 0,
        progress = 0f,
        doseRows = emptyList(),
        turnedOff = true,
        pageIndex = 0,
        totalPages = 1
      )
    }
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

    val allRows = buildAllMedicationDoseRows(
      doses = doses,
      failedDoseIds = failedDoseIds,
      screenWidthDp = screenWidthDp,
      fontScale = fontScale
    )
    val totalPages = (totalCount + MEDICATIONS_TILE_PAGE_SIZE - 1) / MEDICATIONS_TILE_PAGE_SIZE
    val safePage = ((page % totalPages) + totalPages) % totalPages
    val fromIdx = safePage * MEDICATIONS_TILE_PAGE_SIZE
    val pageRows = allRows.drop(fromIdx).take(MEDICATIONS_TILE_PAGE_SIZE)

    return MedicationsTileModel(
      hasData = true,
      takenCount = takenCount,
      totalCount = totalCount,
      pendingCount = pendingCount,
      progress = progress,
      doseRows = pageRows,
      skippedCount = skippedCount,
      pageIndex = safePage,
      totalPages = totalPages
    )
  }

  internal fun buildAllMedicationDoseRows(
    doses: List<MedicationDose>,
    failedDoseIds: Set<String> = emptySet(),
    screenWidthDp: Int = DEFAULT_TILE_SCREEN_WIDTH_DP,
    fontScale: Float = 1f
  ): List<TileDoseRow> {
    if (doses.isEmpty()) return emptyList()
    val useGrid = doses.size >= 3

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
      val signatureDetailPrefix: String,
      val strengthIntact: Boolean,
      val detailStrengthIntact: Boolean
    )

    fun formatDoseDisplay(dose: MedicationDose, rowIndex: Int, totalRows: Int): FormattedDoseDisplay {
      val compactTime = ComplicationModels.compactDoseTime(dose.time)
      val cleanDetail = dose.detail.trim()
      val rightParts = listOf(cleanDetail, compactTime).filter { it.isNotBlank() }
      val detailText = rightParts.joinToString(" · ").ifBlank { dose.status.rawValue }
      val (compactName, nameStrengthIntact) = compactDoseNameWithSafety(
        rawName = dose.name,
        maxChars = if (useGrid) SAFE_GRID_NAME_CHARS else SAFE_PILL_NAME_CHARS,
        minPrefixLen = if (useGrid) 2 else 3
      )
      val (visibleDetailPrefix, unclippedChars) = if (useGrid) {
        visibleGridChipDetail(
          detailText = detailText,
          screenWidthDp = screenWidthDp,
          fontScale = fontScale,
          rowIndex = rowIndex,
          totalRows = totalRows
        )
      } else {
        visiblePillRowDetail(
          compactName = compactName,
          detailText = detailText,
          screenWidthDp = screenWidthDp,
          fontScale = fontScale,
          rowIndex = rowIndex,
          totalRows = totalRows
        )
      }
      val detailClipped = cleanDetail.length > unclippedChars
      val clippedTailHasDigits = detailClipped && cleanDetail.drop(unclippedChars).any { isNumericChar(it) }
      val strengthMatch = DETAIL_STRENGTH_REGEX.findAll(cleanDetail).lastOrNull()
      val detailIsCountOnlyWithNamedStrength =
        dose.name.any { isNumericChar(it) } && DOSAGE_COUNT_ONLY_REGEX.matches(cleanDetail)
      val detailStrengthIntact = when {
        !detailClipped -> true
        clippedTailHasDigits -> false
        strengthMatch != null -> strengthMatch.range.last + 1 <= unclippedChars
        detailIsCountOnlyWithNamedStrength -> true
        else -> cleanDetail.none { isNumericChar(it) }
      }
      val signatureDetailPrefix = if (useGrid) {
        visibleGridChipDetail(
          detailText = detailText,
          screenWidthDp = screenWidthDp,
          fontScale = fontScale,
          rowIndex = 0,
          totalRows = 1
        ).first
      } else {
        visiblePillRowDetail(
          compactName = compactName,
          detailText = detailText,
          screenWidthDp = screenWidthDp,
          fontScale = fontScale,
          rowIndex = 0,
          totalRows = 1
        ).first
      }
      return FormattedDoseDisplay(
        name = compactName,
        detailText = detailText,
        visibleDetailPrefix = visibleDetailPrefix,
        signatureDetailPrefix = signatureDetailPrefix,
        strengthIntact = nameStrengthIntact,
        detailStrengthIntact = detailStrengthIntact
      )
    }

    val displayed = ordered.mapIndexed { idx, dose ->
      val (rowIndex, totalRows) = if (useGrid) {
        val pageOffset = idx % MEDICATIONS_TILE_PAGE_SIZE
        val pageCount = minOf(MEDICATIONS_TILE_PAGE_SIZE, ordered.size - (idx - pageOffset))
        val rowsInPage = ((pageCount + 1) / 2).coerceAtLeast(1)
        (pageOffset / 2) to rowsInPage
      } else {
        idx to ordered.size
      }
      formatDoseDisplay(dose, rowIndex, totalRows)
    }
    val visibleSignatureCounts = displayed
      .groupingBy { it.name to it.signatureDetailPrefix }
      .eachCount()

    return ordered.mapIndexed { idx, dose ->
      val isFailed = failedDoseIds.contains(dose.id)
      val (symbol, color) = when {
        isFailed -> "!" to 0xFFFB7185.toInt()
        dose.status == MedicationDoseStatus.TAKEN -> "✓" to 0xFF4ADE80.toInt()
        dose.status == MedicationDoseStatus.PENDING -> "○" to 0xFFFBBF24.toInt()
        else -> "–" to 0xFF94A3B8.toInt()
      }
      val disp = displayed[idx]
      val isPending = dose.status == MedicationDoseStatus.PENDING
      val sig = disp.name to disp.signatureDetailPrefix
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
        displayFingerprint = medicationDoseFingerprint(dose),
        fullName = dose.name.trim().ifEmpty { disp.name },
        status = dose.status
      )
    }
  }

  fun buildMedicationCardContentDescription(
    dose: TileDoseRow,
    markTakenFormat: (String, String) -> String,
    markTakenFailedFormat: (String, String, String) -> String,
    openFormat: (String, String, String) -> String,
    statusLabel: String
  ): String {
    val labelName = dose.fullName.ifBlank { dose.name }
    return when {
      dose.isDirectlyActionable && dose.statusSymbol == "!" ->
        markTakenFailedFormat(labelName, dose.detailText, statusLabel)
      dose.isDirectlyActionable -> markTakenFormat(labelName, dose.detailText)
      else -> openFormat(labelName, dose.detailText, statusLabel)
    }
  }

  fun buildWaterCardContentDescription(
    chip: TileWaterContainerChip,
    logFormat: (String, String) -> String,
    openFormat: (String, String) -> String
  ): String {
    val labelName = chip.fullName.ifBlank { chip.name }
    return if (chip.isDirectlyActionable) {
      logFormat(labelName, chip.addText)
    } else {
      openFormat(labelName, chip.addText)
    }
  }

  private fun isNumericChar(ch: Char): Boolean =
    ch.isDigit() || Character.getType(ch) == Character.OTHER_NUMBER.toInt()

  /**
   * Shortens long medication names while keeping any numeric strength/unit intact; returns `strengthIntact = false`
   * whenever any digit, fraction character, or trailing strength unit cannot fit without truncation.
   */
  fun compactDoseNameWithSafety(
    rawName: String,
    maxChars: Int = SAFE_PILL_NAME_CHARS,
    minPrefixLen: Int = 3
  ): Pair<String, Boolean> {
    val clean = rawName.trim()
    if (clean.isEmpty()) return "" to false
    if (clean.length <= maxChars) return clean to true
    val headOnly = clean.take((maxChars - 1).coerceAtLeast(1))
    if (!clean.any { isNumericChar(it) }) {
      return "${headOnly.trimEnd()}…" to true
    }
    val tokens = clean.split(Regex("\\s+"))
    val strengthIdx = tokens.indexOfFirst { tok -> tok.any { isNumericChar(it) } }
    if (strengthIdx > 0) {
      val prefix = tokens.subList(0, strengthIdx).joinToString(" ")
      val strengthTail = tokens.subList(strengthIdx, tokens.size).joinToString(" ")
      val headBudget = maxChars - strengthTail.length - 1
      if (headBudget >= minPrefixLen) {
        val keptPrefix = prefix.take(headBudget)
        val droppedPrefix = prefix.drop(keptPrefix.length)
        if (!droppedPrefix.any { isNumericChar(it) }) {
          return "${keptPrefix.trimEnd()}…$strengthTail" to true
        }
      }
    }
    return "${headOnly.trimEnd()}…" to false
  }

  internal const val DEFAULT_TILE_SCREEN_WIDTH_DP = 225
  private const val SAFE_PILL_NAME_CHARS = 15
  private const val SAFE_GRID_NAME_CHARS = 12
  private const val SAFE_PILL_ROW_CHARS = 20
  private const val SAFE_GRID_DETAIL_CHARS = 14
  private const val GRID_DETAIL_APPROX_CHAR_DP = 6.2f
  private const val PILL_ROW_APPROX_CHAR_DP = 6.6f
  private val DETAIL_STRENGTH_REGEX = Regex(
    "(?:\\d+(?:[.,]\\d+)?\\p{No}?|\\p{No})\\s*(?:%|(?:mcg|mg|ug|µg|g|iu|ml|l|mmol|mol|meq|units?|u)\\b)(?:\\s*/\\s*(?:(?:\\d+(?:[.,]\\d+)?\\p{No}?|\\p{No})(?:\\s*(?:%|[a-zµ]+\\b))?|(?:%|[a-zµ]+\\b)))*",
    RegexOption.IGNORE_CASE
  )
  private val DOSAGE_COUNT_ONLY_REGEX = Regex(
    "^(?:\\d+(?:\\.5|/[24]|\\p{No})?|\\p{No})\\s*(?:tabs?|tablets?|caps?|capsules?|pills?|softgels?|gummies?|gummy|lozenges?|chews?|patches?|puffs?|sprays?|drops?|sachets?|packets?|vials?|ampoules?|syringes?|injections?|doses?)\\.?$",
    RegexOption.IGNORE_CASE
  )

  internal fun visiblePillRowDetail(
    compactName: String,
    detailText: String,
    screenWidthDp: Int = DEFAULT_TILE_SCREEN_WIDTH_DP,
    fontScale: Float = 1f,
    rowIndex: Int = 0,
    totalRows: Int = 1
  ): Pair<String, Int> {
    val effectiveScale = maxOf(1f, fontScale)
    val curveInset = tileRowCurveInsetDp(rowIndex, totalRows)
    val innerWidthDp = (screenWidthDp.toFloat() - 20f - 4f - (2f * curveInset) - 16f - 18f).coerceAtLeast(40f)
    val scaledBudget = (innerWidthDp / (PILL_ROW_APPROX_CHAR_DP * effectiveScale)).toInt().coerceIn(8, SAFE_PILL_ROW_CHARS)
    val leftChars = 2 + compactName.length
    val availableDetailChars = (scaledBudget - leftChars).coerceAtLeast(0)
    if (detailText.length <= availableDetailChars) {
      return detailText to detailText.length
    }
    val unclippedChars = (availableDetailChars - 1).coerceAtLeast(0)
    return detailText.take(unclippedChars) to unclippedChars
  }

  internal fun visibleGridChipDetail(
    detailText: String,
    screenWidthDp: Int = DEFAULT_TILE_SCREEN_WIDTH_DP,
    fontScale: Float = 1f,
    rowIndex: Int = 0,
    totalRows: Int = 2
  ): Pair<String, Int> {
    val effectiveScale = maxOf(1f, fontScale)
    val curveInset = tileRowCurveInsetDp(rowIndex, totalRows)
    val cardInnerWidthDp = ((screenWidthDp.toFloat() - 20f - 4f - (2f * curveInset) - 4f - 16f) / 2f).coerceAtLeast(32f)
    val charBudget = (cardInnerWidthDp / (GRID_DETAIL_APPROX_CHAR_DP * effectiveScale)).toInt().coerceIn(5, SAFE_GRID_DETAIL_CHARS)
    if (detailText.length <= charBudget) {
      return detailText to detailText.length
    }
    val unclippedChars = (charBudget - 1).coerceAtLeast(0)
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
  ): String = if (model.turnedOff) {
    getString(R.string.tile_meds_turned_off, emptyArray())
  } else if (!model.hasData) {
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
    model.turnedOff -> getString(R.string.tile_meds_turned_off_hint, emptyArray())
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

  internal const val WATER_TILE_PAGE_SIZE = 4

  /**
   * Orders synced water containers and Quick Add drink presets for the non-scrolling Hydration tile:
   * 1. Primary standard container(s) (or the first standard container when none is marked primary)
   *    so plain water is always immediately reachable.
   * 2. Quick Add drink presets (`isQuickAdd = true`, e.g. Drip Coffee, Coke Zero) so they are never
   *    buried behind extra vessels.
   * 3. Any remaining standard water containers in their configured order.
   */
  fun orderWaterTileContainers(containers: List<WaterContainer>): List<WaterContainer> {
    if (containers.size <= 1) return containers
    val standard = containers.filter { !it.isQuickAdd }
    val quickAdd = containers.filter { it.isQuickAdd }
    if (quickAdd.isEmpty() && standard.none { it.isPrimary }) return containers
    val leadStandard = standard.filter { it.isPrimary }.ifEmpty { standard.take(1) }
    val leadIds = leadStandard.map { it.id }.toSet()
    val tailStandard = standard.filterNot { leadIds.contains(it.id) }
    return leadStandard + quickAdd + tailStandard
  }

  /**
   * Builds the display model for the interactive Hydration tile.
   * Prioritizes primary water + Quick Add presets in pages of up to [WATER_TILE_PAGE_SIZE] items
   * so all synced containers and Quick Add drinks are one-tap accessible right on the tile.
   */
  fun buildWaterTileModel(
    hasOwner: Boolean,
    consumedMl: Double,
    goalMl: Double,
    queuedMl: Double,
    watchCtx: WatchContext,
    containers: List<WaterContainer>,
    waterSyncState: SyncState = SyncState.SAVED,
    locale: Locale = Locale.getDefault(),
    page: Int = 0
  ): WaterTileModel {
    val safeGoal = max(1.0, goalMl)
    val clampedConsumed = max(0.0, consumedMl)
    val progress = (clampedConsumed / safeGoal).toFloat().coerceIn(0f, 1f)
    val isGoalMet = goalMl > 0.0 && clampedConsumed >= goalMl - 0.5
    val remMl = max(0.0, goalMl - clampedConsumed)
    val ordered = orderWaterTileContainers(containers)
    val totalPages = if (ordered.isEmpty()) 1 else (ordered.size + WATER_TILE_PAGE_SIZE - 1) / WATER_TILE_PAGE_SIZE
    val resolvedPage = if (totalPages <= 1) 0 else ((page % totalPages) + totalPages) % totalPages
    val allChips = buildAllWaterContainerChips(ordered, watchCtx, locale)
    val chips = allChips.drop(resolvedPage * WATER_TILE_PAGE_SIZE).take(WATER_TILE_PAGE_SIZE)
    return WaterTileModel(
      hasOwner = hasOwner,
      consumedText = watchCtx.formattedWater(clampedConsumed, locale),
      goalText = watchCtx.formattedWater(safeGoal, locale),
      remainingText = if (!isGoalMet) watchCtx.formattedWater(remMl, locale) else null,
      isGoalMet = isGoalMet,
      queuedText = if (queuedMl > 0.5) watchCtx.formattedWater(queuedMl, locale) else null,
      syncFailed = waterSyncState == SyncState.FAILED,
      progress = progress,
      containers = chips,
      pageIndex = resolvedPage,
      totalPages = totalPages,
      totalContainerCount = ordered.size
    )
  }

  private fun String.codePointLength(): Int = codePointCount(0, length)

  private fun String.takeCodePoints(n: Int): String {
    if (n <= 0 || isEmpty()) return ""
    val cpLen = codePointLength()
    if (n >= cpLen) return this
    return substring(0, offsetByCodePoints(0, n))
  }

  private fun String.takeLastCodePoints(n: Int): String {
    if (n <= 0 || isEmpty()) return ""
    val cpLen = codePointLength()
    if (n >= cpLen) return this
    return substring(offsetByCodePoints(0, cpLen - n))
  }

  private fun String.dropCodePoints(n: Int): String {
    if (n <= 0 || isEmpty()) return ""
    val cpLen = codePointLength()
    if (n >= cpLen) return ""
    return substring(offsetByCodePoints(0, n))
  }

  private fun commonCodePointPrefixLength(a: String, b: String): Int {
    var i = 0
    var count = 0
    while (i < a.length && i < b.length) {
      val cpA = a.codePointAt(i)
      val cpB = b.codePointAt(i)
      if (cpA != cpB) break
      i += Character.charCount(cpA)
      count++
    }
    return count
  }

  private fun formatCompactedContainerName(
    clean: String,
    commonCpLen: Int,
    maxNameChars: Int,
    maxHeadLen: Int,
    trimSuffixLeadingWhitespace: Boolean = true
  ): String {
    val dropped = clean.dropCodePoints(commonCpLen.coerceIn(0, clean.codePointLength()))
    val rawSuffix = (if (trimSuffixLeadingWhitespace) dropped.trimStart() else dropped).ifEmpty {
      clean.takeLastCodePoints((maxNameChars / 2).coerceAtLeast(1))
    }
    val headLen = minOf(maxHeadLen, commonCpLen, (maxNameChars - 2).coerceAtLeast(2)).coerceAtLeast(2)
    val head = clean.takeCodePoints(headLen).trimEnd().ifEmpty { clean.takeCodePoints(2) }
    val tailBudget = (maxNameChars - head.codePointLength() - 1).coerceAtLeast(1)
    val tail = if (rawSuffix.codePointLength() <= tailBudget) {
      rawSuffix
    } else {
      val prefixSlice = rawSuffix.takeCodePoints(tailBudget)
      if (trimSuffixLeadingWhitespace) {
        prefixSlice.trimEnd().ifEmpty { rawSuffix.takeLastCodePoints(tailBudget) }
      } else {
        prefixSlice
      }
    }
    return "$head…$tail"
  }

  internal fun compactWaterContainerName(
    container: WaterContainer,
    allOrdered: List<WaterContainer>,
    maxNameChars: Int
  ): String {
    val clean = container.name.trim()
    if (clean.codePointLength() <= maxNameChars) return clean
    val cleanPrefix = clean.takeCodePoints(maxNameChars)
    val collidingSiblings = allOrdered.filter {
      it.id != container.id && it.name.trim().takeCodePoints(maxNameChars) == cleanPrefix
    }
    if (collidingSiblings.isEmpty()) {
      return cleanPrefix
    }
    val minCommonLen = collidingSiblings.minOf { commonCodePointPrefixLength(clean, it.name.trim()) }
    val minCandidate = formatCompactedContainerName(clean, minCommonLen, maxNameChars, maxHeadLen = 4)
    val minCollidesWithSibling = collidingSiblings.any { sibling ->
      formatCompactedContainerName(sibling.name.trim(), minCommonLen, maxNameChars, maxHeadLen = 4) == minCandidate
    }
    if (!minCollidesWithSibling) {
      return minCandidate
    }
    val maxCommonLen = collidingSiblings.maxOf { commonCodePointPrefixLength(clean, it.name.trim()) }
    if (maxCommonLen > minCommonLen) {
      val maxCandidate = formatCompactedContainerName(clean, maxCommonLen, maxNameChars, maxHeadLen = 4)
      val maxCollidesWithSibling = collidingSiblings.any { sibling ->
        val sibClean = sibling.name.trim()
        val sibPrefix = sibClean.takeCodePoints(maxNameChars)
        val sibOthers = allOrdered.filter {
          it.id != sibling.id && it.name.trim().takeCodePoints(maxNameChars) == sibPrefix
        }
        val sibMaxLen = sibOthers.maxOfOrNull { commonCodePointPrefixLength(sibClean, it.name.trim()) } ?: minCommonLen
        formatCompactedContainerName(sibClean, sibMaxLen, maxNameChars, maxHeadLen = 4) == maxCandidate
      }
      if (!maxCollidesWithSibling) {
        return maxCandidate
      }
    }
    val compactHeadCandidate = formatCompactedContainerName(clean, minCommonLen, maxNameChars, maxHeadLen = 2)
    val compactHeadCollides = collidingSiblings.any { sibling ->
      formatCompactedContainerName(sibling.name.trim(), minCommonLen, maxNameChars, maxHeadLen = 2) == compactHeadCandidate
    }
    return if (!compactHeadCollides) compactHeadCandidate else minCandidate
  }

  private fun disambiguateCollidingWaterChipNames(
    ordered: List<WaterContainer>,
    rawChips: List<TileWaterContainerChip>,
    maxNameChars: Int
  ): List<TileWaterContainerChip> {
    val result = rawChips.toMutableList()
    val groups = result.indices.groupBy { idx -> result[idx].name to result[idx].addText }
    for ((_, indices) in groups) {
      if (indices.size <= 1) continue
      val distinctRawNames = indices.map { ordered[it].name.trim() }.toSet()
      if (distinctRawNames.size <= 1) continue
      val groupContainers = indices.map { ordered[it] }
      val proposed = indices.associateWith { idx ->
        val clean = ordered[idx].name.trim()
        val peers = groupContainers.filter { it.id != ordered[idx].id && it.name.trim() != clean }
        val minDiff = peers.minOfOrNull { commonCodePointPrefixLength(clean, it.name.trim()) } ?: 0
        val minRaw = formatCompactedContainerName(
          clean = clean,
          commonCpLen = minDiff,
          maxNameChars = maxNameChars,
          maxHeadLen = 4,
          trimSuffixLeadingWhitespace = false
        )
        val collidesAtMin = peers.any { peer ->
          formatCompactedContainerName(
            clean = peer.name.trim(),
            commonCpLen = minDiff,
            maxNameChars = maxNameChars,
            maxHeadLen = 4,
            trimSuffixLeadingWhitespace = false
          ) == minRaw
        }
        if (!collidesAtMin) {
          minRaw
        } else {
          val maxDiff = peers.maxOfOrNull { commonCodePointPrefixLength(clean, it.name.trim()) } ?: minDiff
          val maxRaw = formatCompactedContainerName(
            clean = clean,
            commonCpLen = maxDiff,
            maxNameChars = maxNameChars,
            maxHeadLen = 2,
            trimSuffixLeadingWhitespace = false
          )
          val collidesAtMax = peers.any { peer ->
            val pClean = peer.name.trim()
            val pPeers = groupContainers.filter { it.id != peer.id && it.name.trim() != pClean }
            val pMaxDiff = pPeers.maxOfOrNull { commonCodePointPrefixLength(pClean, it.name.trim()) } ?: minDiff
            formatCompactedContainerName(
              clean = pClean,
              commonCpLen = pMaxDiff,
              maxNameChars = maxNameChars,
              maxHeadLen = 2,
              trimSuffixLeadingWhitespace = false
            ) == maxRaw
          }
          if (!collidesAtMax) maxRaw else result[idx].name
        }
      }
      val existingSigsOutsideGroup = result.indices
        .filterNot { it in indices }
        .map { result[it].name to result[it].addText }
        .toSet()
      val proposedSigs = indices.map { proposed.getValue(it) to result[it].addText }
      val distinctProposedCount = proposedSigs.toSet().size
      val introducesExternalCollision = proposedSigs.any { it in existingSigsOutsideGroup }
      if (distinctProposedCount > 1 && !introducesExternalCollision) {
        for (idx in indices) {
          result[idx] = result[idx].copy(name = proposed.getValue(idx))
        }
      }
    }
    return result
  }

  internal fun buildAllWaterContainerChips(
    ordered: List<WaterContainer>,
    watchCtx: WatchContext,
    locale: Locale = Locale.getDefault()
  ): List<TileWaterContainerChip> {
    if (ordered.isEmpty()) return emptyList()
    val useCompactNames = ordered.size >= 3
    val maxNameChars = if (useCompactNames) 11 else 13
    val rawChips = ordered.map { c ->
      val effectiveUnit = watchCtx.waterDisplayUnit?.takeIf { it.isNotBlank() } ?: c.unit
      val addLabel = if (c.servingVolumeMl > 0.05) {
        "+${formatWaterAmount(c.servingVolumeMl, effectiveUnit, locale)}"
      } else {
        "+"
      }
      TileWaterContainerChip(
        id = c.id,
        name = compactWaterContainerName(c, ordered, maxNameChars),
        addText = addLabel,
        volumeMl = c.servingVolumeMl,
        isQuickAdd = c.isQuickAdd,
        fullName = c.name.trim().ifEmpty { compactWaterContainerName(c, ordered, maxNameChars) }
      )
    }
    val disambiguated = disambiguateCollidingWaterChipNames(ordered, rawChips, maxNameChars)
    val sigCounts = disambiguated.groupingBy { it.name to it.addText }.eachCount()
    return disambiguated.map { chip ->
      val unique = (sigCounts[chip.name to chip.addText] ?: 0) == 1
      chip.copy(isDirectlyActionable = unique)
    }
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

/**
 * Builds an explicit high-contrast dark OLED Material 3 [ColorScheme] for a SparkyFitness tile.
 * `allowDynamicTheme = false` is passed to [materialScope] so Wear OS 6 dynamic wallpaper pastel
 * palettes never wash out semantic accent text on tonal containers.
 */
private fun sparkyTileColorScheme(
  primaryArgb: Int,
  primaryDimArgb: Int,
  primaryContainerArgb: Int,
  onPrimaryArgb: Int,
  onPrimaryContainerArgb: Int,
  secondaryArgb: Int = 0xFF38BDF8.toInt(),
  secondaryDimArgb: Int = 0xFF0EA5E9.toInt(),
  secondaryContainerArgb: Int = 0xFF132A3E.toInt(),
  onSecondaryArgb: Int = 0xFF082F49.toInt(),
  onSecondaryContainerArgb: Int = 0xFFBAE6FD.toInt(),
  tertiaryArgb: Int = 0xFFFBBF24.toInt(),
  tertiaryDimArgb: Int = 0xFFF59E0B.toInt(),
  tertiaryContainerArgb: Int = 0xFF362812.toInt(),
  onTertiaryArgb: Int = 0xFF451A03.toInt(),
  onTertiaryContainerArgb: Int = 0xFFFEF08A.toInt()
): ColorScheme = ColorScheme(
  primary = primaryArgb.argb,
  primaryDim = primaryDimArgb.argb,
  primaryContainer = primaryContainerArgb.argb,
  onPrimary = onPrimaryArgb.argb,
  onPrimaryContainer = onPrimaryContainerArgb.argb,
  secondary = secondaryArgb.argb,
  secondaryDim = secondaryDimArgb.argb,
  secondaryContainer = secondaryContainerArgb.argb,
  onSecondary = onSecondaryArgb.argb,
  onSecondaryContainer = onSecondaryContainerArgb.argb,
  tertiary = tertiaryArgb.argb,
  tertiaryDim = tertiaryDimArgb.argb,
  tertiaryContainer = tertiaryContainerArgb.argb,
  onTertiary = onTertiaryArgb.argb,
  onTertiaryContainer = onTertiaryContainerArgb.argb,
  surfaceContainerLow = 0xFF12161F.toInt().argb,
  surfaceContainer = 0xFF1A2230.toInt().argb,
  surfaceContainerHigh = 0xFF242F42.toInt().argb,
  onSurface = 0xFFF1F5F9.toInt().argb,
  onSurfaceVariant = 0xFF94A3B8.toInt().argb,
  outline = 0xFF475569.toInt().argb,
  outlineVariant = 0xFF293548.toInt().argb,
  background = 0xFF000000.toInt().argb,
  onBackground = 0xFFF8FAFC.toInt().argb,
  error = 0xFFFB7185.toInt().argb,
  errorDim = 0xFFF43F5E.toInt().argb,
  errorContainer = 0xFF3F1621.toInt().argb,
  onError = 0xFF4C0519.toInt().argb,
  onErrorContainer = 0xFFFECDD3.toInt().argb
)

abstract class BaseSparkyTileService : TileService() {
  protected abstract val targetPageKey: String
  protected abstract val accentColorArgb: Int
  protected abstract val tileColorScheme: ColorScheme

  protected abstract fun MaterialScope.buildTileLayout(session: WearSessionManager): LayoutElement

  /**
   * Handles an inline interactive tile [ActionBuilders.LoadAction] click when [clickableId] is non-empty.
   * Returns `true` when the click mutated local store state so the tile re-renders immediately.
   */
  protected open fun handleTileAction(session: WearSessionManager, clickableId: String): Boolean = false

  /**
   * Builds the ProtoLayout Material 3 timeline response for this tile service.
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
    val pageClick = launchPageClickable(targetPageKey)
    val root = try {
      materialScope(
        context = applicationContext,
        deviceConfiguration = requestParams.deviceConfiguration,
        allowDynamicTheme = false,
        defaultColorScheme = tileColorScheme
      ) {
        buildTileLayout(session)
      }
    } catch (t: Throwable) {
      Log.e("SparkyTile", "Failed to build tile ${this::class.java.simpleName}", t)
      materialScope(
        context = applicationContext,
        deviceConfiguration = requestParams.deviceConfiguration,
        allowDynamicTheme = false,
        defaultColorScheme = tileColorScheme
      ) {
        buildM3TileShell(
          progress = 0f,
          accentColorArgb = accentColorArgb,
          pageClickable = pageClick,
          titleText = "SPARKY",
          mainContent = {
            m3StatusCard(
              headline = getString(R.string.tile_tap_to_open),
              subtitle = getString(R.string.app_name),
              subtitleColor = colorScheme.onSurfaceVariant,
              clickable = pageClick
            )
          },
          edgeButtonLabel = getString(R.string.app_name),
          edgeButtonClickable = pageClick
        )
      }
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

/**
 * Wraps a Material 3 Expressive [primaryLayout] + optional curved [textEdgeButton] inside an OLED
 * black circular bezel framed by a gapped M3 [circularProgressIndicator] that clears the bottom
 * [textEdgeButton].
 */
internal fun supportsExpandedCircularProgressIndicator(major: Int, minor: Int): Boolean =
  major > 1 || (major == 1 && minor >= 403)

internal const val TILE_OUTER_RING_STROKE_DP = 5f

internal fun tileRowCurveInsetDp(rowIndex: Int, totalRows: Int): Float = when {
  totalRows <= 1 -> 8f
  totalRows == 2 -> if (rowIndex == 0) 0f else 5f
  else -> when (rowIndex) {
    0 -> 0f
    1 -> 1f
    else -> 7f
  }
}

private fun withHorizontalInset(insetDp: Float, content: LayoutElement): LayoutElement {
  if (insetDp <= 0f) return content
  return Box.Builder()
    .setWidth(expand())
    .setHeight(expand())
    .setModifiers(
      Modifiers.Builder()
        .setPadding(
          Padding.Builder()
            .setStart(dp(insetDp))
            .setEnd(dp(insetDp))
            .build()
        )
        .build()
    )
    .addContent(content)
    .build()
}

private fun MaterialScope.buildM3TileShell(
  progress: Float,
  accentColorArgb: Int,
  pageClickable: Clickable,
  titleText: String,
  mainContent: MaterialScope.() -> LayoutElement,
  edgeButtonLabel: String? = null,
  edgeButtonClickable: Clickable = pageClickable,
  edgeButtonColors: ButtonColors? = null,
  margins: PrimaryLayoutMargins = PrimaryLayoutMargins.MID_PRIMARY_LAYOUT_MARGIN
): LayoutElement {
  val hasEdgeButton = !edgeButtonLabel.isNullOrBlank()
  val clamped = progress.coerceIn(0f, 1f)
  val startAngle = if (hasEdgeButton) 224f else 205f
  val endAngle = if (hasEdgeButton) 496f else 515f
  val schema = deviceConfiguration.rendererSchemaVersion
  val ringSize = if (supportsExpandedCircularProgressIndicator(schema.major, schema.minor)) {
    expand()
  } else {
    dp(minOf(deviceConfiguration.screenWidthDp, deviceConfiguration.screenHeightDp).toFloat())
  }

  val outerRing = circularProgressIndicator(
    staticProgress = clamped,
    modifier = LayoutModifier.padding(2f),
    startAngleDegrees = startAngle,
    endAngleDegrees = endAngle,
    strokeWidth = TILE_OUTER_RING_STROKE_DP,
    colors = ProgressIndicatorColors(
      indicatorColor = accentColorArgb.argb,
      trackColor = colorScheme.outlineVariant,
      trackOverflowColor = colorScheme.primaryDim
    ),
    size = ringSize
  )

  val primary = primaryLayout(
    onClick = pageClickable,
    margins = margins,
    titleSlot = {
      text(
        text = titleText.layoutString,
        typography = Typography.TITLE_SMALL,
        color = accentColorArgb.argb,
        scalable = false,
        maxLines = 1
      )
    },
    mainSlot = {
      Box.Builder()
        .setWidth(expand())
        .setHeight(expand())
        .setModifiers(
          Modifiers.Builder()
            .setPadding(
              Padding.Builder()
                .setStart(dp(2f))
                .setEnd(dp(2f))
                .setTop(dp(2f))
                .setBottom(dp(2f))
                .build()
            )
            .build()
        )
        .addContent(mainContent())
        .build()
    },
    bottomSlot = if (hasEdgeButton) {
      {
        textEdgeButton(
          onClick = edgeButtonClickable,
          colors = edgeButtonColors ?: ButtonColors(
            containerColor = colorScheme.primaryContainer,
            labelColor = colorScheme.onPrimaryContainer
          )
        ) {
          text(
            text = edgeButtonLabel!!.layoutString,
            maxLines = 1
          )
        }
      }
    } else {
      null
    }
  )

  return Box.Builder()
    .setWidth(expand())
    .setHeight(expand())
    .setModifiers(
      Modifiers.Builder()
        .setClickable(pageClickable)
        .setBackground(Background.Builder().setColor(ColorBuilders.argb(0xFF000000.toInt())).build())
        .build()
    )
    .addContent(outerRing)
    .addContent(primary)
    .build()
}

private fun vSpacer(heightDp: Float): Spacer =
  Spacer.Builder().setHeight(dp(heightDp)).build()

private fun hSpacer(widthDp: Float): Spacer =
  Spacer.Builder().setWidth(dp(widthDp)).build()

/**
 * Compact 2-line Material 3 metric header (headline + secondary status line) at the top of `mainSlot`.
 */
private fun MaterialScope.m3SummaryHeader(
  headline: String,
  subtitle: String,
  subtitleColor: LayoutColor = colorScheme.onSurfaceVariant,
  subtitleClickable: Clickable? = null
): LayoutElement {
  val subtitleElement = text(
    text = subtitle.layoutString,
    typography = Typography.BODY_EXTRA_SMALL,
    color = subtitleColor,
    maxLines = 1
  )
  val wrappedSubtitle: LayoutElement = if (subtitleClickable != null) {
    Box.Builder()
      .setModifiers(Modifiers.Builder().setClickable(subtitleClickable).build())
      .addContent(subtitleElement)
      .build()
  } else {
    subtitleElement
  }
  return Column.Builder()
    .setWidth(expand())
    .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
    .addContent(
      text(
        text = headline.layoutString,
        typography = Typography.TITLE_MEDIUM,
        color = colorScheme.onBackground,
        maxLines = 1
      )
    )
    .addContent(wrappedSubtitle)
    .build()
}

/**
 * Centered Material 3 tonal surface card used for empty, unsynced, or turned-off tile states.
 */
private fun MaterialScope.m3StatusCard(
  headline: String,
  subtitle: String,
  subtitleColor: LayoutColor = colorScheme.onSurfaceVariant,
  clickable: Clickable
): LayoutElement =
  withHorizontalInset(
    6f,
    buttonGroup(width = expand(), height = expand()) {
      buttonGroupItem {
        card(
          onClick = clickable,
          modifier = LayoutModifier.background(colorScheme.surfaceContainerLow).clip(shapes.large),
          width = expand(),
          height = expand(),
          contentPadding = padding(horizontal = 10f, vertical = 6f)
        ) {
          Box.Builder()
            .setWidth(expand())
            .setHeight(expand())
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
            .addContent(
              Column.Builder()
                .setWidth(expand())
                .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
                .addContent(
                  text(
                    text = headline.layoutString,
                    typography = Typography.TITLE_MEDIUM,
                    color = colorScheme.onSurface,
                    maxLines = 1
                  )
                )
                .addContent(vSpacer(2f))
                .addContent(
                  text(
                    text = subtitle.layoutString,
                    typography = Typography.BODY_EXTRA_SMALL,
                    color = subtitleColor,
                    maxLines = 2
                  )
                )
                .build()
            )
            .build()
        }
      }
    }
  )

/**
 * Full-width Material 3 pill row inside a [buttonGroup] with a colored semantic indicator dot,
 * primary label, and end-aligned value.
 */
private fun MaterialScope.m3PillMetricRow(
  leftLabel: String,
  rightValue: String,
  accentColorArgb: Int,
  clickable: Clickable,
  containerColor: LayoutColor = colorScheme.surfaceContainer
): LayoutElement =
  buttonGroup(width = expand(), height = expand()) {
    buttonGroupItem {
      card(
        onClick = clickable,
        modifier = LayoutModifier.background(containerColor).clip(shapes.full),
        width = expand(),
        height = expand(),
        contentPadding = padding(horizontal = 8f, vertical = 2f)
      ) {
        Row.Builder()
          .setWidth(expand())
          .setHeight(expand())
          .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
          .addContent(
            Box.Builder()
              .setWidth(dp(6f))
              .setHeight(dp(6f))
              .setModifiers(
                Modifiers.Builder()
                  .setBackground(
                    Background.Builder()
                      .setColor(ColorBuilders.argb(accentColorArgb))
                      .setCorner(Corner.Builder().setRadius(dp(3f)).build())
                      .build()
                  )
                  .build()
              )
              .build()
          )
          .addContent(hSpacer(6f))
          .addContent(
            text(
              text = leftLabel.layoutString,
              typography = Typography.LABEL_SMALL,
              color = colorScheme.onSurface,
              maxLines = 1
            )
          )
          .addContent(hSpacer(6f))
          .addContent(
            Box.Builder()
              .setWidth(expand())
              .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_END)
              .addContent(
                text(
                  text = rightValue.layoutString,
                  typography = Typography.LABEL_SMALL,
                  color = accentColorArgb.argb,
                  maxLines = 1
                )
              )
              .build()
          )
          .build()
      }
    }
  }

class NutritionTileService : BaseSparkyTileService() {
  override val targetPageKey = "goals"
  override val accentColorArgb = 0xFF4ADE80.toInt()
  override val tileColorScheme: ColorScheme = sparkyTileColorScheme(
    primaryArgb = 0xFF4ADE80.toInt(),
    primaryDimArgb = 0xFF22C55E.toInt(),
    primaryContainerArgb = 0xFF133323.toInt(),
    onPrimaryArgb = 0xFF052E16.toInt(),
    onPrimaryContainerArgb = 0xFFBBF7D0.toInt()
  )

  override fun currentRingProgress(session: WearSessionManager): Float {
    return TileModels.buildNutritionTileModel(session.checkInStore.nutrition.value).calorieProgress
  }

  override fun MaterialScope.buildTileLayout(session: WearSessionManager): LayoutElement {
    val energy = EnergyDisplay.of(session.checkInStore.watchContext.value)
    val model = TileModels.buildNutritionTileModel(session.checkInStore.nutrition.value, energy)
    val pageClick = launchPageClickable(targetPageKey)

    if (!model.hasData) {
      return buildM3TileShell(
        progress = 0f,
        accentColorArgb = accentColorArgb,
        pageClickable = pageClick,
        titleText = getString(R.string.tile_nutrition_header),
        mainContent = {
          m3StatusCard(
            headline = "— / — ${energy.unit}",
            subtitle = getString(R.string.tile_nutrition_tap_goals),
            clickable = pageClick
          )
        },
        edgeButtonLabel = getString(R.string.tile_nutrition_open_goals),
        edgeButtonClickable = pageClick
      )
    }

    val calHeadline = if (model.goalKcal > 0) {
      "${model.consumedKcal} / ${model.goalKcal} ${model.energyUnit}"
    } else {
      "${model.consumedKcal} ${model.energyUnit}"
    }
    val subText = if (model.remainingKcal >= 0) {
      getString(R.string.tile_nutrition_left_burned, model.remainingKcal, model.burnedKcal)
    } else {
      getString(R.string.tile_nutrition_over_burned, -model.remainingKcal, model.burnedKcal)
    }
    val subColor = if (model.remainingKcal >= 0) {
      colorScheme.onSurfaceVariant
    } else {
      colorScheme.tertiary
    }
    val showEdgeBtn = model.macros.size < 3 || deviceConfiguration.screenHeightDp >= 225

    return buildM3TileShell(
      progress = model.calorieProgress,
      accentColorArgb = accentColorArgb,
      pageClickable = pageClick,
      titleText = getString(R.string.tile_nutrition_header),
      mainContent = {
        val col = Column.Builder()
          .setWidth(expand())
          .setHeight(expand())
          .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
          .addContent(m3SummaryHeader(headline = calHeadline, subtitle = subText, subtitleColor = subColor))
        if (model.macros.isNotEmpty()) {
          col.addContent(vSpacer(3f))
          for ((idx, macro) in model.macros.withIndex()) {
            if (idx > 0) col.addContent(vSpacer(3f))
            val macroLabel = if (macro.labelRes != 0) getString(macro.labelRes) else macro.label
            col.addContent(
              withHorizontalInset(
                tileRowCurveInsetDp(idx, model.macros.size),
                m3PillMetricRow(
                  leftLabel = macroLabel,
                  rightValue = macro.valueText,
                  accentColorArgb = macro.colorArgb,
                  clickable = pageClick
                )
              )
            )
          }
        }
        col.build()
      },
      edgeButtonLabel = if (showEdgeBtn) {
        getString(R.string.tile_nutrition_pct_goal, (model.calorieProgress * 100f).roundToInt())
      } else {
        null
      },
      edgeButtonClickable = pageClick
    )
  }
}

class SleepTileService : BaseSparkyTileService() {
  override val targetPageKey = "sleep"
  override val accentColorArgb = 0xFF818CF8.toInt()
  override val tileColorScheme: ColorScheme = sparkyTileColorScheme(
    primaryArgb = 0xFF818CF8.toInt(),
    primaryDimArgb = 0xFF6366F1.toInt(),
    primaryContainerArgb = 0xFF20224A.toInt(),
    onPrimaryArgb = 0xFF1E1B4B.toInt(),
    onPrimaryContainerArgb = 0xFFE0E7FF.toInt()
  )

  override fun currentRingProgress(session: WearSessionManager): Float {
    return TileModels.buildSleepTileModel(session.checkInStore.sleep.value).progress
  }

  override fun MaterialScope.buildTileLayout(session: WearSessionManager): LayoutElement {
    val model = TileModels.buildSleepTileModel(session.checkInStore.sleep.value)
    val pageClick = launchPageClickable(targetPageKey)
    val headerLabel = if (model.hasData && model.biometricsText != null && model.stages.size >= 3) {
      getString(R.string.tile_sleep_header_bio, model.biometricsText.take(12).uppercase(Locale.US))
    } else {
      getString(R.string.tile_sleep_header)
    }

    if (!model.hasData) {
      return buildM3TileShell(
        progress = 0f,
        accentColorArgb = accentColorArgb,
        pageClickable = pageClick,
        titleText = headerLabel,
        mainContent = {
          m3StatusCard(
            headline = getString(R.string.tile_sleep_no_data_title),
            subtitle = getString(R.string.tile_sleep_no_data_sub),
            clickable = pageClick
          )
        },
        edgeButtonLabel = getString(R.string.sleep_title),
        edgeButtonClickable = pageClick
      )
    }

    val resolvedDuration = TileModels.formatSleepDuration(this@SleepTileService, model)
    val resolvedScore = model.sleepScore?.let { getString(R.string.tile_sleep_score, it) }
    val headlineText = if (resolvedScore != null) {
      "$resolvedDuration · $resolvedScore"
    } else {
      resolvedDuration
    }
    val windowText = TileModels.formatSleepWindow(this@SleepTileService, model.window)
    val stagesShown = model.stages.take(3)
    val showEdgeBtn = stagesShown.size < 3 || deviceConfiguration.screenHeightDp >= 225

    return buildM3TileShell(
      progress = model.progress,
      accentColorArgb = accentColorArgb,
      pageClickable = pageClick,
      titleText = headerLabel,
      mainContent = {
        val col = Column.Builder()
          .setWidth(expand())
          .setHeight(expand())
          .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
          .addContent(m3SummaryHeader(headline = headlineText, subtitle = windowText))
        if (stagesShown.isNotEmpty()) {
          col.addContent(vSpacer(3f))
          for ((idx, stage) in stagesShown.withIndex()) {
            if (idx > 0) col.addContent(vSpacer(3f))
            val stageLabel = if (stage.labelRes != 0) getString(stage.labelRes) else stage.label
            col.addContent(
              withHorizontalInset(
                tileRowCurveInsetDp(idx, stagesShown.size),
                m3PillMetricRow(
                  leftLabel = stageLabel,
                  rightValue = stage.durationText,
                  accentColorArgb = stage.colorArgb,
                  clickable = pageClick
                )
              )
            )
          }
        }
        col.build()
      },
      edgeButtonLabel = if (showEdgeBtn) {
        model.biometricsText ?: getString(R.string.tile_sleep_details)
      } else {
        null
      },
      edgeButtonClickable = pageClick
    )
  }
}

private const val CLICK_MED_TAKE_PREFIX = "med_take:"
private const val CLICK_MED_PAGE_PREFIX = "med_page:"
private const val CLICK_WATER_ADD_PREFIX = "water_add:"
private const val CLICK_WATER_RETRY_PREFIX = "water_retry:"
private const val CLICK_WATER_PAGE_PREFIX = "water_page:"

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
  currentSnap: MedicationSnapshot?,
  screenWidthDp: Int = TileModels.DEFAULT_TILE_SCREEN_WIDTH_DP,
  fontScale: Float = 1f
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
  val allRows = TileModels.buildAllMedicationDoseRows(
    doses = snap.doses,
    screenWidthDp = screenWidthDp,
    fontScale = fontScale
  )
  val actionableRow = allRows.firstOrNull { it.isDirectlyActionable && it.doseId == doseId } ?: return null
  if (actionableRow.displayFingerprint != renderedFingerprint) return null
  return snap.doses.firstOrNull {
    it.id == doseId &&
      it.status == MedicationDoseStatus.PENDING &&
      medicationDoseFingerprint(it) == renderedFingerprint
  }
}

/**
 * Material 3 [textDataCard] cell for a single medication dose inside a 2×2 [buttonGroup].
 */
private fun MaterialScope.m3MedicationGridCard(
  dose: TileDoseRow,
  clickable: Clickable
): LayoutElement {
  val containerBg: LayoutColor = when {
    dose.statusSymbol == "!" -> colorScheme.errorContainer
    dose.isPending -> colorScheme.surfaceContainerHigh
    dose.statusSymbol == "✓" -> colorScheme.primaryContainer
    else -> colorScheme.surfaceContainer
  }
  val titleCol: LayoutColor = if (dose.isPending) {
    colorScheme.onSurface
  } else {
    colorScheme.onSurfaceVariant
  }
  val detailCol: LayoutColor = dose.statusColorArgb.argb

  val statusLabel = when {
    dose.statusSymbol == "!" -> context.getString(R.string.tile_meds_status_failed)
    dose.status == MedicationDoseStatus.TAKEN -> context.getString(R.string.tile_meds_status_taken)
    dose.status == MedicationDoseStatus.SKIPPED -> context.getString(R.string.tile_meds_status_skipped)
    else -> context.getString(R.string.tile_meds_status_pending)
  }
  val cardDescription = TileModels.buildMedicationCardContentDescription(
    dose = dose,
    markTakenFormat = { name, detail -> context.getString(R.string.tile_meds_card_cd_mark_taken, name, detail) },
    markTakenFailedFormat = { name, detail, status ->
      context.getString(R.string.tile_meds_card_cd_mark_taken_failed, name, detail, status)
    },
    openFormat = { name, detail, status -> context.getString(R.string.tile_meds_card_cd_open, name, detail, status) },
    statusLabel = statusLabel
  )

  return textDataCard(
    onClick = clickable,
    modifier = LayoutModifier.contentDescription(cardDescription),
    title = {
      text(
        text = "${dose.statusSymbol} ${dose.name}".layoutString,
        typography = Typography.BODY_SMALL,
        color = titleCol,
        maxLines = 1
      )
    },
    content = {
      text(
        text = dose.detailText.layoutString,
        typography = Typography.BODY_EXTRA_SMALL,
        color = detailCol,
        maxLines = 1,
        overflow = LayoutElementBuilders.TEXT_OVERFLOW_ELLIPSIZE_END
      )
    },
    width = expand(),
    height = expand(),
    shape = shapes.medium,
    colors = CardColors(
      backgroundColor = containerBg,
      titleColor = titleCol,
      contentColor = detailCol
    ),
    style = DataCardStyle.smallDataCardStyle(),
    contentPadding = padding(horizontal = 4f, vertical = 2f)
  )
}

class MedicationsTileService : BaseSparkyTileService() {
  override val targetPageKey = "medications"
  override val accentColorArgb = 0xFF2DD4BF.toInt()
  override val tileColorScheme: ColorScheme = sparkyTileColorScheme(
    primaryArgb = 0xFF2DD4BF.toInt(),
    primaryDimArgb = 0xFF14B8A6.toInt(),
    primaryContainerArgb = 0xFF113835.toInt(),
    onPrimaryArgb = 0xFF042F2E.toInt(),
    onPrimaryContainerArgb = 0xFF99F6E4.toInt()
  )

  override fun currentRingProgress(session: WearSessionManager): Float {
    return medicationsModel(session).progress
  }

  /** Today's doses, or the turned-off state while Medications is off in the phone app. */
  private fun medicationsModel(
    session: WearSessionManager,
    screenWidthDp: Int = resources.configuration.screenWidthDp.takeIf { it > 0 } ?: TileModels.DEFAULT_TILE_SCREEN_WIDTH_DP,
    fontScale: Float = resources.configuration.fontScale.coerceAtLeast(1f)
  ): MedicationsTileModel {
    val store = session.checkInStore
    return TileModels.buildMedicationsTileModel(
      medications = store.medications.value,
      failedDoseIds = store.failedMedicationDoseIdsForToday(),
      turnedOff = store.watchContext.value.isFeatureOff("medications"),
      page = store.medicationTilePage.value,
      screenWidthDp = screenWidthDp,
      fontScale = fontScale
    )
  }

  override fun handleTileAction(session: WearSessionManager, clickableId: String): Boolean {
    val store = session.checkInStore
    // A tile drawn before Medications was turned off in the phone app logs nothing.
    if (store.watchContext.value.isFeatureOff("medications")) return false
    val currentToken = store.currentActionToken() ?: return false
    if (clickableId.startsWith(CLICK_MED_PAGE_PREFIX)) {
      val token = clickableId.removePrefix(CLICK_MED_PAGE_PREFIX)
      if (token != currentToken) return false
      val total = store.medications.value?.takeIf { it.isToday }?.doses?.size ?: 0
      val totalPages = if (total <= 0) {
        1
      } else {
        (total + TileModels.MEDICATIONS_TILE_PAGE_SIZE - 1) / TileModels.MEDICATIONS_TILE_PAGE_SIZE
      }
      store.advanceMedicationTilePage(totalPages)
      Haptics.click()
      return true
    }
    val dose = resolveMedicationTileActionDose(
      clickableId = clickableId,
      expectedToken = currentToken,
      currentSnap = store.medications.value,
      screenWidthDp = resources.configuration.screenWidthDp.takeIf { it > 0 } ?: TileModels.DEFAULT_TILE_SCREEN_WIDTH_DP,
      fontScale = resources.configuration.fontScale.coerceAtLeast(1f)
    ) ?: return false
    store.toggleMedication(dose, refreshTiles = false)
    return true
  }

  override fun MaterialScope.buildTileLayout(session: WearSessionManager): LayoutElement {
    val store = session.checkInStore
    val medSnap = store.medications.value
    val medDay = medSnap?.day?.takeIf { it.isNotBlank() }
    val model = medicationsModel(
      session = session,
      screenWidthDp = deviceConfiguration.screenWidthDp.takeIf { it > 0 } ?: TileModels.DEFAULT_TILE_SCREEN_WIDTH_DP,
      fontScale = resources.configuration.fontScale.coerceAtLeast(1f)
    )
    val actionToken = store.currentActionToken()
    val pageClick = launchPageClickable(targetPageKey)
    val headlineText = TileModels.formatMedicationsHeadline(this@MedicationsTileService, model)
    val subtitleText = TileModels.formatMedicationsSubtitle(this@MedicationsTileService, model)

    if (model.turnedOff) {
      return buildM3TileShell(
        progress = 0f,
        accentColorArgb = accentColorArgb,
        pageClickable = pageClick,
        titleText = getString(R.string.tile_meds_header),
        mainContent = {
          m3StatusCard(
            headline = headlineText,
            subtitle = subtitleText,
            clickable = pageClick
          )
        },
        edgeButtonLabel = null
      )
    }

    if (!model.hasData || model.totalCount == 0) {
      val doneColor = if (model.hasData) 0xFF4ADE80.toInt().argb else colorScheme.onSurfaceVariant
      return buildM3TileShell(
        progress = model.progress,
        accentColorArgb = accentColorArgb,
        pageClickable = pageClick,
        titleText = getString(R.string.tile_meds_header),
        mainContent = {
          m3StatusCard(
            headline = headlineText,
            subtitle = subtitleText,
            subtitleColor = doneColor,
            clickable = pageClick
          )
        },
        edgeButtonLabel = getString(R.string.meds_title_empty),
        edgeButtonClickable = pageClick
      )
    }

    val subtitleColor = if (model.pendingCount == 0 && model.hasData && model.totalCount > 0) {
      0xFF4ADE80.toInt().argb
    } else {
      colorScheme.onSurfaceVariant
    }

    val (edgeLabel, edgeClick) = when {
      model.totalPages > 1 && actionToken != null ->
        getString(R.string.tile_water_more_pages, model.pageIndex + 1, model.totalPages) to
          loadActionClickable("$CLICK_MED_PAGE_PREFIX$actionToken")
      else ->
        (if (model.pendingCount > 0) getString(R.string.tile_meds_log_dose) else getString(R.string.meds_title_empty)) to
          pageClick
    }

    fun clickableForDose(dose: TileDoseRow): Clickable = when {
      dose.isDirectlyActionable && actionToken != null && !medDay.isNullOrEmpty() && dose.doseId.isNotEmpty() ->
        loadActionClickable(
          formatMedicationTileActionId(actionToken, medDay, dose.doseId, dose.displayFingerprint)
        )
      else -> pageClick
    }

    val useGrid = model.totalCount >= 3 || model.totalPages > 1
    return buildM3TileShell(
      progress = model.progress,
      accentColorArgb = accentColorArgb,
      pageClickable = pageClick,
      titleText = getString(R.string.tile_meds_header),
      mainContent = {
        val col = Column.Builder()
          .setWidth(expand())
          .setHeight(expand())
          .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
          .addContent(m3SummaryHeader(headline = headlineText, subtitle = subtitleText, subtitleColor = subtitleColor))
          .addContent(vSpacer(3f))

        if (useGrid) {
          val rows = model.doseRows.chunked(2)
          for ((rowIdx, rowDoses) in rows.withIndex()) {
            if (rowIdx > 0) col.addContent(vSpacer(4f))
            col.addContent(
              withHorizontalInset(
                tileRowCurveInsetDp(rowIdx, rows.size),
                buttonGroup(width = expand(), height = expand(), spacing = 4f) {
                  for (dose in rowDoses) {
                    buttonGroupItem {
                      m3MedicationGridCard(dose = dose, clickable = clickableForDose(dose))
                    }
                  }
                }
              )
            )
          }
        } else {
          for ((idx, dose) in model.doseRows.withIndex()) {
            if (idx > 0) col.addContent(vSpacer(3f))
            val isActionableOrPending = dose.isDirectlyActionable || dose.isPending
            col.addContent(
              withHorizontalInset(
                tileRowCurveInsetDp(idx, model.doseRows.size),
                m3PillMetricRow(
                  leftLabel = "${dose.statusSymbol} ${dose.name}",
                  rightValue = dose.detailText,
                  accentColorArgb = dose.statusColorArgb,
                  clickable = clickableForDose(dose),
                  containerColor = if (isActionableOrPending) {
                    colorScheme.surfaceContainerHigh
                  } else {
                    colorScheme.surfaceContainer
                  }
                )
              )
            )
          }
        }
        col.build()
      },
      edgeButtonLabel = edgeLabel,
      edgeButtonClickable = edgeClick
    )
  }
}

class ExerciseTileService : BaseSparkyTileService() {
  override val targetPageKey = "workout"
  override val accentColorArgb = 0xFFFB923C.toInt()
  override val tileColorScheme: ColorScheme = sparkyTileColorScheme(
    primaryArgb = 0xFFFB923C.toInt(),
    primaryDimArgb = 0xFFF97316.toInt(),
    primaryContainerArgb = 0xFF3B1A0B.toInt(),
    onPrimaryArgb = 0xFF431407.toInt(),
    onPrimaryContainerArgb = 0xFFFED7AA.toInt()
  )

  override fun currentRingProgress(session: WearSessionManager): Float {
    val store = session.checkInStore
    return TileModels.buildExerciseTileModel(
      exercise = store.exerciseSummary.value,
      scheduledWorkouts = store.todaysScheduledWorkouts(),
      steps = store.steps.value,
      stepGoal = store.stepGoal.value
    ).progress
  }

  override fun MaterialScope.buildTileLayout(session: WearSessionManager): LayoutElement {
    val store = session.checkInStore
    val pageClick = launchPageClickable(targetPageKey)
    val model = TileModels.buildExerciseTileModel(
      exercise = store.exerciseSummary.value,
      scheduledWorkouts = store.todaysScheduledWorkouts(),
      steps = store.steps.value,
      stepGoal = store.stepGoal.value,
      energy = EnergyDisplay.of(store.watchContext.value)
    )
    val headlineText = TileModels.formatExerciseHeadline(this@ExerciseTileService, model)
    val subtitleText = TileModels.formatExerciseSubtitle(this@ExerciseTileService, model)

    if (model.rows.isEmpty()) {
      return buildM3TileShell(
        progress = model.progress,
        accentColorArgb = accentColorArgb,
        pageClickable = pageClick,
        titleText = getString(R.string.tile_exercise_header),
        mainContent = {
          m3StatusCard(
            headline = headlineText,
            subtitle = subtitleText,
            clickable = pageClick
          )
        },
        edgeButtonLabel = getString(R.string.tile_exercise_workouts_pill),
        edgeButtonClickable = pageClick
      )
    }

    return buildM3TileShell(
      progress = model.progress,
      accentColorArgb = accentColorArgb,
      pageClickable = pageClick,
      titleText = getString(R.string.tile_exercise_header),
      mainContent = {
        val col = Column.Builder()
          .setWidth(expand())
          .setHeight(expand())
          .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
          .addContent(m3SummaryHeader(headline = headlineText, subtitle = subtitleText))
          .addContent(vSpacer(3f))
        for ((idx, row) in model.rows.withIndex()) {
          if (idx > 0) col.addContent(vSpacer(3f))
          val rowSubtitle = if (row.subtitleRes != 0) getString(row.subtitleRes) else row.subtitle
          col.addContent(
            withHorizontalInset(
              tileRowCurveInsetDp(idx, model.rows.size),
              m3PillMetricRow(
                leftLabel = row.title,
                rightValue = rowSubtitle,
                accentColorArgb = row.badgeColorArgb,
                clickable = pageClick
              )
            )
          )
        }
        col.build()
      },
      edgeButtonLabel = getString(R.string.tile_exercise_workouts_pill),
      edgeButtonClickable = pageClick
    )
  }
}

/**
 * Material 3 [textDataCard] cell for a single Hydration vessel or Quick Add drink preset inside
 * a 2×2 [buttonGroup]. Uses dark cyan `primaryContainer` for plain water vessels and dark amber
 * `tertiaryContainer` for Quick Add presets.
 */
private fun MaterialScope.m3WaterGridCard(
  chip: TileWaterContainerChip,
  clickable: Clickable
): LayoutElement {
  val bgColor: LayoutColor = if (chip.isQuickAdd) {
    colorScheme.tertiaryContainer
  } else {
    colorScheme.primaryContainer
  }
  val valueColor: LayoutColor = if (chip.isQuickAdd) {
    colorScheme.tertiary
  } else {
    colorScheme.primary
  }
  val cardDescription = TileModels.buildWaterCardContentDescription(
    chip = chip,
    logFormat = { name, amount -> context.getString(R.string.tile_water_card_cd_log, name, amount) },
    openFormat = { name, amount -> context.getString(R.string.tile_water_card_cd_open, name, amount) }
  )

  return textDataCard(
    onClick = clickable,
    modifier = LayoutModifier.contentDescription(cardDescription),
    title = {
      text(
        text = chip.name.layoutString,
        typography = Typography.BODY_SMALL,
        color = colorScheme.onSurface,
        maxLines = 1
      )
    },
    content = {
      text(
        text = chip.addText.layoutString,
        typography = Typography.BODY_EXTRA_SMALL,
        color = valueColor,
        maxLines = 1
      )
    },
    width = expand(),
    height = expand(),
    shape = shapes.medium,
    colors = CardColors(
      backgroundColor = bgColor,
      titleColor = colorScheme.onSurface,
      contentColor = valueColor
    ),
    style = DataCardStyle.smallDataCardStyle(),
    contentPadding = padding(horizontal = 4f, vertical = 2f)
  )
}

class WaterTileService : BaseSparkyTileService() {
  override val targetPageKey = "water"
  override val accentColorArgb = 0xFF38BDF8.toInt()
  override val tileColorScheme: ColorScheme = sparkyTileColorScheme(
    primaryArgb = 0xFF38BDF8.toInt(),
    primaryDimArgb = 0xFF0EA5E9.toInt(),
    primaryContainerArgb = 0xFF132A3E.toInt(),
    onPrimaryArgb = 0xFF082F49.toInt(),
    onPrimaryContainerArgb = 0xFFBAE6FD.toInt(),
    tertiaryArgb = 0xFFFBBF24.toInt(),
    tertiaryDimArgb = 0xFFF59E0B.toInt(),
    tertiaryContainerArgb = 0xFF362812.toInt(),
    onTertiaryArgb = 0xFF451A03.toInt(),
    onTertiaryContainerArgb = 0xFFFEF08A.toInt()
  )

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
    if (clickableId.startsWith(CLICK_WATER_PAGE_PREFIX)) {
      val token = clickableId.removePrefix(CLICK_WATER_PAGE_PREFIX)
      if (token != currentToken) return false
      val total = store.waterContainers.value.size
      val totalPages = if (total <= 0) 1 else (total + TileModels.WATER_TILE_PAGE_SIZE - 1) / TileModels.WATER_TILE_PAGE_SIZE
      store.advanceWaterTilePage(totalPages)
      Haptics.click()
      return true
    }
    if (!clickableId.startsWith(CLICK_WATER_ADD_PREFIX)) return false
    val rawSpec = clickableId.removePrefix(CLICK_WATER_ADD_PREFIX)
    val parts = rawSpec.split(':')
    if (parts.size != 3 || parts[0] != currentToken) return false
    val containerId = parts[1].toIntOrNull() ?: return false
    val expectedBits = parts[2].toLongOrNull() ?: return false
    val allOrdered = TileModels.orderWaterTileContainers(store.waterContainers.value)
    val allChips = TileModels.buildAllWaterContainerChips(allOrdered, store.watchContext.value)
    val actionableChip = allChips.firstOrNull { it.id == containerId && it.isDirectlyActionable } ?: return false
    if (actionableChip.volumeMl.toRawBits() != expectedBits) {
      return false
    }
    val target = allOrdered.firstOrNull { it.id == containerId } ?: return false
    if (target.servingVolumeMl.toRawBits() != expectedBits) {
      return false
    }
    store.tapWaterContainer(target, refreshTiles = false)
    return true
  }

  override fun MaterialScope.buildTileLayout(session: WearSessionManager): LayoutElement {
    val store = session.checkInStore
    val actionToken = store.currentActionToken()
    val waterEnabled = store.enabledPages.value.contains(WatchPage.WATER)
    val pageClick = launchPageClickable(targetPageKey)
    val model = TileModels.buildWaterTileModel(
      hasOwner = actionToken != null,
      consumedMl = store.effectiveWaterMl.value,
      goalMl = store.waterGoalMl.value,
      queuedMl = store.queuedWaterMl.value,
      watchCtx = store.watchContext.value,
      containers = store.waterContainers.value,
      waterSyncState = store.waterSyncState.value,
      page = store.waterTilePage.value
    )

    if (!model.hasOwner || actionToken == null) {
      return buildM3TileShell(
        progress = 0f,
        accentColorArgb = accentColorArgb,
        pageClickable = pageClick,
        titleText = getString(R.string.tile_water_header),
        mainContent = {
          m3StatusCard(
            headline = getString(R.string.tile_meds_not_synced),
            subtitle = getString(R.string.tile_meds_open_app),
            clickable = pageClick
          )
        },
        edgeButtonLabel = getString(R.string.water_title),
        edgeButtonClickable = pageClick
      )
    }

    val retryClickable = if (model.syncFailed && !waterEnabled) {
      loadActionClickable("$CLICK_WATER_RETRY_PREFIX$actionToken")
    } else {
      null
    }
    val (subText, subColor) = when {
      model.syncFailed && !waterEnabled -> getString(R.string.water_sync_failed) to colorScheme.error
      model.syncFailed -> getString(R.string.tile_water_sync_failed) to colorScheme.error
      model.queuedText != null -> getString(R.string.water_syncing_amount, model.queuedText) to colorScheme.tertiary
      model.isGoalMet -> getString(R.string.tile_water_goal_reached) to 0xFF4ADE80.toInt().argb
      model.remainingText != null -> getString(R.string.tile_water_remaining, model.remainingText) to colorScheme.onSurfaceVariant
      else -> getString(R.string.tile_water_tap_log) to colorScheme.onSurfaceVariant
    }

    val (edgeLabel, edgeClick, edgeColors) = when {
      model.totalPages > 1 -> Triple(
        getString(R.string.tile_water_more_pages, model.pageIndex + 1, model.totalPages),
        loadActionClickable("$CLICK_WATER_PAGE_PREFIX$actionToken"),
        null
      )
      retryClickable != null -> Triple(
        getString(R.string.common_retry),
        retryClickable,
        ButtonColors(
          containerColor = colorScheme.errorContainer,
          labelColor = colorScheme.onErrorContainer
        )
      )
      waterEnabled -> Triple(
        getString(R.string.tile_water_open_log),
        pageClick,
        null
      )
      model.containers.isEmpty() -> Triple(
        getString(R.string.water_title),
        pageClick,
        null
      )
      else -> Triple(null, pageClick, null)
    }

    fun clickableForWaterChip(chip: TileWaterContainerChip): Clickable =
      if (chip.isDirectlyActionable) {
        loadActionClickable("$CLICK_WATER_ADD_PREFIX$actionToken:${chip.id}:${chip.volumeMl.toRawBits()}")
      } else {
        pageClick
      }

    val useGrid = model.containers.size >= 3 || model.totalPages > 1
    return buildM3TileShell(
      progress = model.progress,
      accentColorArgb = accentColorArgb,
      pageClickable = pageClick,
      titleText = getString(R.string.tile_water_header),
      mainContent = {
        val col = Column.Builder()
          .setWidth(expand())
          .setHeight(expand())
          .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
          .addContent(
            m3SummaryHeader(
              headline = "${model.consumedText} / ${model.goalText}",
              subtitle = subText,
              subtitleColor = subColor,
              subtitleClickable = retryClickable
            )
          )

        if (model.containers.isNotEmpty()) {
          col.addContent(vSpacer(3f))
          if (useGrid) {
            val rows = model.containers.chunked(2)
            for ((rowIdx, rowChips) in rows.withIndex()) {
              if (rowIdx > 0) col.addContent(vSpacer(4f))
              col.addContent(
                withHorizontalInset(
                  tileRowCurveInsetDp(rowIdx, rows.size),
                  buttonGroup(width = expand(), height = expand(), spacing = 4f) {
                    for (chip in rowChips) {
                      buttonGroupItem {
                        m3WaterGridCard(
                          chip = chip,
                          clickable = clickableForWaterChip(chip)
                        )
                      }
                    }
                  }
                )
              )
            }
          } else {
            for ((idx, chip) in model.containers.withIndex()) {
              if (idx > 0) col.addContent(vSpacer(3f))
              val chipAccent = if (chip.isQuickAdd) 0xFFFBBF24.toInt() else accentColorArgb
              val chipContainer = if (chip.isQuickAdd) {
                colorScheme.tertiaryContainer
              } else {
                colorScheme.primaryContainer
              }
              col.addContent(
                withHorizontalInset(
                  tileRowCurveInsetDp(idx, model.containers.size),
                  m3PillMetricRow(
                    leftLabel = chip.name,
                    rightValue = chip.addText,
                    accentColorArgb = chipAccent,
                    clickable = clickableForWaterChip(chip),
                    containerColor = chipContainer
                  )
                )
              )
            }
          }
        }
        col.build()
      },
      edgeButtonLabel = edgeLabel,
      edgeButtonClickable = edgeClick,
      edgeButtonColors = edgeColors
    )
  }
}

/**
 * Material 3 tonal [card] displaying up to 7 weight trend sparkline bars alongside the latest
 * Body Fat % or Trend badge.
 */
private fun MaterialScope.buildM3WeightSparklineCard(
  fractions: List<Float>,
  rightBadgeText: String,
  accentColorArgb: Int,
  barColorArgb: Int,
  clickable: Clickable
): LayoutElement {
  val slice = fractions.takeLast(7)
  val barsRow = Row.Builder()
    .setWidth(wrap())
    .setHeight(dp(26f))
    .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_BOTTOM)

  for ((idx, frac) in slice.withIndex()) {
    if (idx > 0) {
      barsRow.addContent(hSpacer(3f))
    }
    val barHeightDp = 10f + (frac.coerceIn(0f, 1f) * 16f)
    val isLast = idx == slice.lastIndex
    barsRow.addContent(
      Box.Builder()
        .setWidth(dp(6f))
        .setHeight(dp(barHeightDp))
        .setModifiers(
          Modifiers.Builder()
            .setBackground(
              Background.Builder()
                .setColor(ColorBuilders.argb(if (isLast) accentColorArgb else barColorArgb))
                .setCorner(Corner.Builder().setRadius(dp(3f)).build())
                .build()
            )
            .build()
        )
        .build()
    )
  }

  return buttonGroup(width = expand(), height = expand()) {
    buttonGroupItem {
      card(
        onClick = clickable,
        modifier = LayoutModifier.background(colorScheme.surfaceContainer).clip(shapes.large),
        width = expand(),
        height = expand(),
        contentPadding = padding(horizontal = 12f, vertical = 6f)
      ) {
        Row.Builder()
          .setWidth(expand())
          .setHeight(expand())
          .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
          .addContent(barsRow.build())
          .addContent(
            Box.Builder()
              .setWidth(expand())
              .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_END)
              .addContent(
                text(
                  text = rightBadgeText.layoutString,
                  typography = Typography.LABEL_MEDIUM,
                  color = barColorArgb.argb,
                  maxLines = 1
                )
              )
              .build()
          )
          .build()
      }
    }
  }
}

class WeightTileService : BaseSparkyTileService() {
  override val targetPageKey = "entry"
  override val accentColorArgb = 0xFF4ADE80.toInt()
  override val tileColorScheme: ColorScheme = sparkyTileColorScheme(
    primaryArgb = 0xFF4ADE80.toInt(),
    primaryDimArgb = 0xFF22C55E.toInt(),
    primaryContainerArgb = 0xFF133323.toInt(),
    onPrimaryArgb = 0xFF052E16.toInt(),
    onPrimaryContainerArgb = 0xFFBBF7D0.toInt()
  )

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

  override fun MaterialScope.buildTileLayout(session: WearSessionManager): LayoutElement {
    val store = session.checkInStore
    val enabledPages = store.enabledPages.value
    val entryEnabled = enabledPages.contains(WatchPage.ENTRY)
    val trendEnabled = enabledPages.contains(WatchPage.TREND)
    val pageClick = launchPageClickable(targetPageKey)
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

    if (!model.hasData) {
      val emptySub = when {
        model.failedToday && entryEnabled -> getString(R.string.tile_weight_sync_failed)
        model.failedToday -> getString(R.string.tile_weight_sync_failed_hidden)
        entryEnabled -> getString(R.string.tile_weight_log_prompt)
        else -> getString(R.string.tile_tap_to_open)
      }
      val emptySubColor = if (model.failedToday) colorScheme.error else colorScheme.onSurfaceVariant
      val emptyEdgeColors = if (model.failedToday) {
        ButtonColors(
          containerColor = colorScheme.errorContainer,
          labelColor = colorScheme.onErrorContainer
        )
      } else {
        null
      }
      return buildM3TileShell(
        progress = 0f,
        accentColorArgb = accentColorArgb,
        pageClickable = pageClick,
        titleText = headerText,
        mainContent = {
          m3StatusCard(
            headline = getString(R.string.tile_weight_no_data),
            subtitle = emptySub,
            subtitleColor = emptySubColor,
            clickable = pageClick
          )
        },
        edgeButtonLabel = if (entryEnabled) {
          if (model.failedToday) getString(R.string.common_retry) else getString(R.string.tile_weight_check_in)
        } else {
          null
        },
        edgeButtonClickable = launchPageClickable("entry"),
        edgeButtonColors = emptyEdgeColors
      )
    }

    val headlineValue = if (!model.hasWeight && bfBadge != null) bfBadge else model.weightValueText
    val (subtitleText, subtitleColor) = when {
      model.failedToday && entryEnabled -> getString(R.string.tile_weight_sync_failed) to colorScheme.error
      model.failedToday -> getString(R.string.tile_weight_sync_failed_hidden) to colorScheme.error
      model.queuedToday -> getString(R.string.tile_weight_queued_today) to colorScheme.tertiary
      model.trendDelta != null && model.trendCount >= 2 -> {
        val sign = if (model.trendDelta > 0) "+" else ""
        getString(
          R.string.tile_weight_trend_delta,
          sign,
          model.trendDelta,
          model.unitSuffix,
          model.trendCount
        ) to colorScheme.onSurfaceVariant
      }
      model.stepDelta != null -> {
        val sign = if (model.stepDelta > 0) "+" else ""
        getString(R.string.tile_weight_vs_last, sign, model.stepDelta, model.unitSuffix) to colorScheme.onSurfaceVariant
      }
      model.loggedToday -> getString(R.string.tile_weight_checked_in_today) to colorScheme.onSurfaceVariant
      entryEnabled -> getString(R.string.tile_weight_log_prompt) to colorScheme.onSurfaceVariant
      else -> getString(R.string.tile_tap_to_open) to colorScheme.onSurfaceVariant
    }

    val trendClickable = if (trendEnabled) launchPageClickable("trend") else pageClick
    val (edgeLabel, edgeClick, edgeColors) = when {
      entryEnabled && model.failedToday -> Triple(
        getString(R.string.common_retry),
        launchPageClickable("entry"),
        ButtonColors(
          containerColor = colorScheme.errorContainer,
          labelColor = colorScheme.onErrorContainer
        )
      )
      entryEnabled && model.queuedToday -> Triple(
        getString(R.string.tile_weight_queued_pill),
        launchPageClickable("entry"),
        ButtonColors(
          containerColor = colorScheme.tertiaryContainer,
          labelColor = colorScheme.onTertiaryContainer
        )
      )
      entryEnabled && model.loggedToday -> Triple(
        getString(R.string.tile_weight_checked_in_pill),
        launchPageClickable("entry"),
        null
      )
      entryEnabled -> Triple(
        getString(R.string.tile_weight_check_in),
        launchPageClickable("entry"),
        null
      )
      trendEnabled -> Triple(
        getString(R.string.tile_weight_trend_badge),
        launchPageClickable("trend"),
        null
      )
      else -> Triple(null, pageClick, null)
    }

    return buildM3TileShell(
      progress = model.progress,
      accentColorArgb = accentColorArgb,
      pageClickable = pageClick,
      titleText = headerText,
      mainContent = {
        val col = Column.Builder()
          .setWidth(expand())
          .setHeight(expand())
          .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
          .addContent(m3SummaryHeader(headline = headlineValue, subtitle = subtitleText, subtitleColor = subtitleColor))
          .addContent(vSpacer(4f))

        if (model.sparklineFractions.size >= 2) {
          val rightBadge = bfBadge ?: getString(R.string.tile_weight_trend_badge)
          col.addContent(
            withHorizontalInset(
              tileRowCurveInsetDp(0, 1),
              buildM3WeightSparklineCard(
                fractions = model.sparklineFractions,
                rightBadgeText = rightBadge,
                accentColorArgb = accentColorArgb,
                barColorArgb = 0xFF38BDF8.toInt(),
                clickable = trendClickable
              )
            )
          )
        } else {
          col.addContent(
            withHorizontalInset(
              tileRowCurveInsetDp(0, 1),
              m3PillMetricRow(
                leftLabel = getString(R.string.trend_weight_title),
                rightValue = if (model.hasWeight && bfBadge != null) bfBadge else getString(R.string.tile_weight_need_more),
                accentColorArgb = 0xFF38BDF8.toInt(),
                clickable = trendClickable
              )
            )
          )
        }
        col.build()
      },
      edgeButtonLabel = edgeLabel,
      edgeButtonClickable = edgeClick,
      edgeButtonColors = edgeColors
    )
  }
}
