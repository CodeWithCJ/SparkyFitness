package com.sparkyapps.sparkyfitness.wear

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log
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
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import java.util.Locale
import kotlin.math.max
import kotlin.math.roundToInt

private const val TILE_RESOURCES_VERSION = "2"
private const val TILE_FRESHNESS_INTERVAL_MS = 15 * 60 * 1000L

data class TileMacroRow(
  val key: String,
  val label: String,
  val valueText: String,
  val progress: Float,
  val colorArgb: Int
)

data class NutritionTileModel(
  val hasData: Boolean,
  val consumedKcal: Int,
  val goalKcal: Int,
  val remainingKcal: Int,
  val burnedKcal: Int,
  val calorieProgress: Float,
  val macros: List<TileMacroRow>
)

data class TileStageBadge(
  val label: String,
  val durationText: String,
  val colorArgb: Int
)

data class SleepTileModel(
  val hasData: Boolean,
  val durationText: String,
  val scoreText: String?,
  val windowText: String,
  val biometricsText: String?,
  val progress: Float,
  val stages: List<TileStageBadge>
)

data class TileDoseRow(
  val name: String,
  val detailText: String,
  val statusSymbol: String,
  val statusColorArgb: Int
)

data class MedicationsTileModel(
  val hasData: Boolean,
  val takenCount: Int,
  val totalCount: Int,
  val pendingCount: Int,
  val headlineText: String,
  val subtitleText: String,
  val progress: Float,
  val doseRows: List<TileDoseRow>
)

data class TileExerciseItemRow(
  val title: String,
  val subtitle: String,
  val badgeColorArgb: Int
)

data class ExerciseTileModel(
  val hasData: Boolean,
  val minutes: Int,
  val minutesGoal: Int,
  val calories: Int,
  val caloriesGoal: Int,
  val sessionCount: Int,
  val headlineText: String,
  val subtitleText: String,
  val progress: Float,
  val rows: List<TileExerciseItemRow>
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
  fun buildNutritionTileModel(nutrition: NutritionSnapshot?): NutritionTileModel {
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
    val consumed = nutrition.caloriesConsumed.roundToInt()
    val remaining = nutrition.caloriesRemaining.roundToInt()
    val burned = nutrition.caloriesBurned.roundToInt()
    val goal = max(0, (nutrition.caloriesConsumed + nutrition.caloriesRemaining).roundToInt())
    val progress = nutrition.calorieProgress.toFloat().coerceIn(0f, 1f)

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
        colorArgb = colorForNutrientKey(row.key)
      )
    }

    return NutritionTileModel(
      hasData = true,
      consumedKcal = consumed,
      goalKcal = goal,
      remainingKcal = remaining,
      burnedKcal = burned,
      calorieProgress = progress,
      macros = macros
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
        scoreText = null,
        windowText = "No sleep logged today",
        biometricsText = null,
        progress = 0f,
        stages = emptyList()
      )
    }
    val durationText = if (sleep.totalSeconds > 0) {
      formatDurationSeconds(sleep.totalSeconds)
    } else {
      "In bed ${formatDurationSeconds(sleep.timeInBedSeconds)}"
    }
    val scoreText = sleep.sleepScore?.let { "Score $it" }
    val windowText = when {
      sleep.bedtime.isNotBlank() && sleep.wakeTime.isNotBlank() -> "${sleep.bedtime} – ${sleep.wakeTime}"
      sleep.napCount > 0 -> "${sleep.napCount} nap${if (sleep.napCount == 1) "" else "s"} (${formatDurationSeconds(sleep.napSeconds)})"
      else -> "In bed ${formatDurationSeconds(sleep.timeInBedSeconds)}"
    }

    val stages = mutableListOf<TileStageBadge>()
    sleep.deepSeconds?.takeIf { it > 0 }?.let {
      stages.add(TileStageBadge("Deep", formatDurationSeconds(it), 0xFF818CF8.toInt()))
    }
    sleep.remSeconds?.takeIf { it > 0 }?.let {
      stages.add(TileStageBadge("REM", formatDurationSeconds(it), 0xFFC084FC.toInt()))
    }
    sleep.lightSeconds?.takeIf { it > 0 }?.let {
      stages.add(TileStageBadge("Light", formatDurationSeconds(it), 0xFF38BDF8.toInt()))
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
      scoreText = scoreText,
      windowText = windowText,
      biometricsText = biometricsText,
      progress = progress,
      stages = stages
    )
  }

  /**
   * Builds the display model for the Medications tile from today's [MedicationSnapshot].
   */
  fun buildMedicationsTileModel(medications: MedicationSnapshot?): MedicationsTileModel {
    if (medications == null || !medications.isToday) {
      return MedicationsTileModel(
        hasData = false,
        takenCount = 0,
        totalCount = 0,
        pendingCount = 0,
        headlineText = "Not synced",
        subtitleText = "Open app to sync",
        progress = 0f,
        doseRows = emptyList()
      )
    }
    val doses = medications.doses
    if (doses.isEmpty()) {
      return MedicationsTileModel(
        hasData = true,
        takenCount = 0,
        totalCount = 0,
        pendingCount = 0,
        headlineText = "0 / 0 Taken",
        subtitleText = "No doses scheduled today",
        progress = 1f,
        doseRows = emptyList()
      )
    }
    val takenCount = doses.count { it.status == MedicationDoseStatus.TAKEN }
    val pendingCount = doses.count { it.status == MedicationDoseStatus.PENDING }
    val skippedCount = doses.count { it.status == MedicationDoseStatus.SKIPPED }
    val totalCount = doses.size
    val progress = (takenCount.toFloat() / totalCount.toFloat()).coerceIn(0f, 1f)

    val headlineText = "$takenCount / $totalCount Taken"
    val subtitleText = when {
      pendingCount > 0 -> "$pendingCount pending today"
      skippedCount > 0 -> "$skippedCount skipped · All done"
      else -> "All doses completed"
    }

    val ordered = doses.sortedBy {
      when (it.status) {
        MedicationDoseStatus.PENDING -> 0
        MedicationDoseStatus.TAKEN -> 1
        MedicationDoseStatus.SKIPPED -> 2
      }
    }

    val doseRows = ordered.take(3).map { dose ->
      val (symbol, color) = when (dose.status) {
        MedicationDoseStatus.TAKEN -> "✓" to 0xFF4ADE80.toInt()
        MedicationDoseStatus.PENDING -> "○" to 0xFFFBBF24.toInt()
        MedicationDoseStatus.SKIPPED -> "–" to 0xFF94A3B8.toInt()
      }
      val rightParts = listOf(dose.detail, dose.time).filter { it.isNotBlank() }
      TileDoseRow(
        name = dose.name.take(14),
        detailText = rightParts.joinToString(" · ").ifBlank { dose.status.rawValue },
        statusSymbol = symbol,
        statusColorArgb = color
      )
    }

    return MedicationsTileModel(
      hasData = true,
      takenCount = takenCount,
      totalCount = totalCount,
      pendingCount = pendingCount,
      headlineText = headlineText,
      subtitleText = subtitleText,
      progress = progress,
      doseRows = doseRows
    )
  }

  /**
   * Builds the display model for the Exercise tile from today's exercise summary, scheduled workouts, and steps.
   */
  fun buildExerciseTileModel(
    exercise: ExerciseSummarySnapshot?,
    scheduledWorkouts: List<ScheduledWorkout>,
    steps: StepsSnapshot?,
    stepGoal: Int
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
      val calorieText = if (caloriesGoal > 0) "$calories/$caloriesGoal kcal" else "$calories kcal"
      "${minutes}m · $calorieText"
    } else if (validSteps != null) {
      "${validSteps.count} steps"
    } else {
      "0m · 0 kcal"
    }

    val subtitleParts = mutableListOf<String>()
    if (minutesGoal > 0) {
      subtitleParts.add("Goal ${minutesGoal}m")
    }
    if (sessionCount > 0) {
      subtitleParts.add("$sessionCount workout${if (sessionCount == 1) "" else "s"}")
    } else if (validSteps != null) {
      subtitleParts.add("${validSteps.count} steps")
    }
    val subtitleText = subtitleParts.joinToString(" · ").ifEmpty {
      if (scheduledWorkouts.isNotEmpty()) "Workout planned today" else "Tap to start a workout"
    }

    val rows = mutableListOf<TileExerciseItemRow>()
    for (session in validExercise?.sessions.orEmpty().take(2)) {
      rows.add(
        TileExerciseItemRow(
          title = session.name.take(15),
          subtitle = "${session.durationMinutes}m · ${session.calories} kcal",
          badgeColorArgb = 0xFF4ADE80.toInt()
        )
      )
    }
    if (rows.size < 2) {
      for (sched in scheduledWorkouts.take(2 - rows.size)) {
        rows.add(
          TileExerciseItemRow(
            title = sched.name.take(15),
            subtitle = sched.planName.ifBlank { sched.caption }.ifBlank { "Scheduled" }.take(16),
            badgeColorArgb = 0xFFFB923C.toInt()
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
      subtitleText = subtitleText,
      progress = progress,
      rows = rows
    )
  }
}

object TileUpdater {
  private val tileClasses = listOf(
    NutritionTileService::class.java,
    SleepTileService::class.java,
    MedicationsTileService::class.java,
    ExerciseTileService::class.java
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
   * Builds the ProtoLayout timeline response for this tile service.
   */
  override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<Tile> {
    val session = WearSessionManager.getInstance(applicationContext)
    session.checkInStore.pruneStaleDayData()
    session.requestContextFromPhoneThrottled()

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
          .addContent(tileText(value = "Tap to open", sizeSp = 13f, bold = true))
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
  accentColorArgb: Int
): LayoutElement {
  return Box.Builder()
    .setWidth(expand())
    .setModifiers(
      Modifiers.Builder()
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
            .setTop(dp(4f))
            .setBottom(dp(4f))
            .build()
        )
        .build()
    )
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
  textColorArgb: Int
): LayoutElement {
  return Box.Builder()
    .setWidth(wrap())
    .setHeight(wrap())
    .setModifiers(
      Modifiers.Builder()
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
        .build()
    )
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
    val model = TileModels.buildNutritionTileModel(session.checkInStore.nutrition.value)
    val col = Column.Builder()
      .setWidth(expand())
      .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
      .addContent(
        tileText(
          value = "NUTRITION",
          sizeSp = 10f,
          colorArgb = accentColorArgb,
          bold = true
        )
      )
      .addContent(vSpacer(2f))

    if (!model.hasData) {
      col.addContent(
        tileText(
          value = "— / — kcal",
          sizeSp = 15f,
          colorArgb = 0xFFFFFFFF.toInt(),
          bold = true
        )
      )
      col.addContent(vSpacer(4f))
      col.addContent(
        tileText(
          value = "Tap to open Goals",
          sizeSp = 11f,
          colorArgb = 0xFF94A3B8.toInt()
        )
      )
      col.addContent(vSpacer(6f))
      col.addContent(
        bottomActionPill(
          label = "Open Goals",
          bgColorArgb = 0xFF163E28.toInt(),
          textColorArgb = accentColorArgb
        )
      )
      return col.build()
    }

    val calHeadline = if (model.goalKcal > 0) {
      "${model.consumedKcal} / ${model.goalKcal} kcal"
    } else {
      "${model.consumedKcal} kcal"
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
      "${model.remainingKcal} left · ${model.burnedKcal} burned"
    } else {
      "${-model.remainingKcal} over · ${model.burnedKcal} burned"
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
      col.addContent(
        pillRow(
          leftLabel = macro.label,
          rightValue = macro.valueText,
          accentColorArgb = macro.colorArgb
        )
      )
    }

    if (model.macros.size < 3) {
      col.addContent(vSpacer(4f))
      col.addContent(
        bottomActionPill(
          label = "${(model.calorieProgress * 100f).roundToInt()}% Goal",
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
      "SLEEP · ${model.biometricsText.take(12).uppercase(Locale.US)}"
    } else {
      "SLEEP HEALTH"
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
          value = "No Sleep Data",
          sizeSp = 15f,
          colorArgb = 0xFFFFFFFF.toInt(),
          bold = true
        )
      )
      col.addContent(vSpacer(4f))
      col.addContent(
        tileText(
          value = "Sync sleep in SparkyFitness",
          sizeSp = 11f,
          colorArgb = 0xFF94A3B8.toInt()
        )
      )
      col.addContent(vSpacer(6f))
      col.addContent(
        bottomActionPill(
          label = "Sleep Health",
          bgColorArgb = 0xFF262856.toInt(),
          textColorArgb = 0xFFC7D2FE.toInt()
        )
      )
      return col.build()
    }

    val headlineText = if (model.scoreText != null) {
      "${model.durationText} · ${model.scoreText}"
    } else {
      model.durationText
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
        value = model.windowText,
        sizeSp = 10f,
        colorArgb = 0xFF94A3B8.toInt()
      )
    )
    col.addContent(vSpacer(4f))

    for ((idx, stage) in model.stages.take(3).withIndex()) {
      if (idx > 0) col.addContent(vSpacer(3f))
      col.addContent(
        pillRow(
          leftLabel = stage.label,
          rightValue = stage.durationText,
          accentColorArgb = stage.colorArgb
        )
      )
    }

    if (model.stages.size < 3) {
      col.addContent(vSpacer(4f))
      col.addContent(
        bottomActionPill(
          label = model.biometricsText ?: "Sleep Details",
          bgColorArgb = 0xFF262856.toInt(),
          textColorArgb = 0xFFC7D2FE.toInt()
        )
      )
    }

    return col.build()
  }
}

class MedicationsTileService : BaseSparkyTileService() {
  override val targetPageKey = "medications"
  override val accentColorArgb = 0xFF2DD4BF.toInt()

  override fun currentRingProgress(session: WearSessionManager): Float {
    return TileModels.buildMedicationsTileModel(session.checkInStore.medications.value).progress
  }

  /**
   * Builds the ProtoLayout content column for the Medications tile.
   */
  override fun buildContentLayout(session: WearSessionManager): LayoutElement {
    val model = TileModels.buildMedicationsTileModel(session.checkInStore.medications.value)
    val col = Column.Builder()
      .setWidth(expand())
      .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
      .addContent(
        tileText(
          value = "MEDICATIONS",
          sizeSp = 10f,
          colorArgb = accentColorArgb,
          bold = true
        )
      )
      .addContent(vSpacer(2f))
      .addContent(
        tileText(
          value = model.headlineText,
          sizeSp = 15f,
          colorArgb = 0xFFFFFFFF.toInt(),
          bold = true
        )
      )
      .addContent(
        tileText(
          value = model.subtitleText,
          sizeSp = 10f,
          colorArgb = 0xFF94A3B8.toInt()
        )
      )
      .addContent(vSpacer(4f))

    for ((idx, dose) in model.doseRows.withIndex()) {
      if (idx > 0) col.addContent(vSpacer(3f))
      col.addContent(
        pillRow(
          leftLabel = "${dose.statusSymbol} ${dose.name}",
          rightValue = dose.detailText,
          accentColorArgb = dose.statusColorArgb
        )
      )
    }

    if (model.doseRows.size < 3) {
      col.addContent(vSpacer(4f))
      col.addContent(
        bottomActionPill(
          label = if (model.pendingCount > 0) "Log Dose" else "Medications",
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
      scheduledWorkouts = store.scheduledWorkouts.value,
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
      scheduledWorkouts = store.scheduledWorkouts.value,
      steps = store.steps.value,
      stepGoal = store.stepGoal.value
    )
    val col = Column.Builder()
      .setWidth(expand())
      .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
      .addContent(
        tileText(
          value = "EXERCISE",
          sizeSp = 10f,
          colorArgb = accentColorArgb,
          bold = true
        )
      )
      .addContent(vSpacer(2f))
      .addContent(
        tileText(
          value = model.headlineText,
          sizeSp = 15f,
          colorArgb = 0xFFFFFFFF.toInt(),
          bold = true
        )
      )
      .addContent(
        tileText(
          value = model.subtitleText,
          sizeSp = 10f,
          colorArgb = 0xFF94A3B8.toInt()
        )
      )
      .addContent(vSpacer(4f))

    for ((idx, row) in model.rows.withIndex()) {
      if (idx > 0) col.addContent(vSpacer(3f))
      col.addContent(
        pillRow(
          leftLabel = row.title,
          rightValue = row.subtitle,
          accentColorArgb = row.badgeColorArgb
        )
      )
    }

    if (model.rows.size < 3) {
      col.addContent(vSpacer(4f))
      col.addContent(
        bottomActionPill(
          label = "Workouts",
          bgColorArgb = 0xFF431407.toInt(),
          textColorArgb = accentColorArgb
        )
      )
    }

    return col.build()
  }
}
