package com.sparkyapps.sparkyfitness.wear

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.os.Build
import androidx.annotation.DrawableRes
import androidx.wear.watchface.complications.data.ColorRamp
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationText
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.CountDownTimeReference
import androidx.wear.watchface.complications.data.GoalProgressComplicationData
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.MonochromaticImage
import androidx.wear.watchface.complications.data.NoDataComplicationData
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.RangedValueComplicationData
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.data.TimeDifferenceComplicationText
import androidx.wear.watchface.complications.data.TimeDifferenceStyle
import androidx.wear.watchface.complications.data.TimeRange
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import androidx.wear.watchface.complications.datasource.ComplicationDataTimeline
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService
import androidx.wear.watchface.complications.datasource.SuspendingTimelineComplicationDataSourceService
import androidx.wear.watchface.complications.datasource.TimeInterval
import androidx.wear.watchface.complications.datasource.TimelineEntry
import com.SparkyApps.SparkyFitnessMobile.R
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.Locale
import java.util.concurrent.TimeUnit
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

data class ComplicationDisplaySpec(
  val shortText: String,
  val shortTitle: String? = null,
  val longText: String,
  val longTitle: String? = null,
  val progressValue: Float = 0f,
  val goalValue: Float = 1f,
  val hasGoalTarget: Boolean = true,
  val rangedValueOverride: Float? = null,
  val contentDescription: String,
  val validUntil: Instant? = null,
  val longComplicationTextOverride: ComplicationText? = null,
  val longContentDescriptionOverride: ComplicationText? = null
)

object ComplicationModels {
  /**
   * Computes local midnight at the end of [day] (`YYYY-MM-DD`) so day-bound complication data expires at rollover.
   */
  fun endOfLocalDayInstant(
    day: String?,
    zoneId: ZoneId = ZoneId.systemDefault()
  ): Instant? {
    if (day.isNullOrBlank()) return null
    return try {
      LocalDate.parse(day).plusDays(1).atStartOfDay(zoneId).toInstant()
    } catch (_: Throwable) {
      null
    }
  }
  /**
   * Shortens `08:00 PM` -> `8:00p` and `09:30 AM` -> `9:30a` so next-dose times fit `SHORT_TEXT` slots.
   */
  fun compactDoseTime(rawTime: String): String {
    val trimmed = rawTime.trim()
    if (trimmed.isEmpty()) return ""
    val upper = trimmed.uppercase(Locale.US)
    val suffix = when {
      upper.endsWith("AM") -> "a"
      upper.endsWith("PM") -> "p"
      else -> null
    }
    if (suffix != null) {
      val core = trimmed.dropLast(2).trim().removePrefix("0")
      return if (core.isNotEmpty()) "$core$suffix" else trimmed
    }
    return trimmed
  }

  /**
   * Builds the shared `LONG_TEXT` Macro + Calorie summary banner (`540 kcal left · 132/160g P`).
   */
  fun buildNutritionBanner(
    nutrition: NutritionSnapshot?,
    energy: EnergyDisplay = EnergyDisplay.KCAL,
    syncPrompt: String = "Sync nutrition goals",
    proteinGoalFormat: (Int, Int) -> String = { c, g -> "${c}/${g}g P" },
    proteinOnlyFormat: (Int) -> String = { c -> "${c}g P" },
    bannerLeftFormat: (Int, String, String) -> String = { rem, unit, p -> "$rem $unit left · $p" },
    bannerOverFormat: (Int, String, String) -> String = { over, unit, p -> "$over $unit over · $p" },
    carbsFatFormat: (Int, Int) -> String = { c, f -> "C ${c}g · F ${f}g" }
  ): Pair<String, String?> {
    if (nutrition == null || !nutrition.isToday) {
      return syncPrompt to null
    }
    val remaining = energy.whole(nutrition.caloriesRemaining)
    val pConsumed = nutrition.protein.consumed.roundToInt()
    val pGoal = nutrition.protein.goal.roundToInt()
    val proteinPart = if (pGoal > 0) proteinGoalFormat(pConsumed, pGoal) else proteinOnlyFormat(pConsumed)
    val primaryBanner = if (remaining >= 0) {
      bannerLeftFormat(remaining, energy.unit, proteinPart)
    } else {
      bannerOverFormat(-remaining, energy.unit, proteinPart)
    }
    val secondaryTitle = carbsFatFormat(
      nutrition.carbs.consumed.roundToInt(),
      nutrition.fat.consumed.roundToInt()
    )
    return primaryBanner to secondaryTitle
  }

  /**
   * Builds the display specification for [CaloriesRemainingComplicationService].
   */
  fun buildCaloriesRemainingSpec(
    nutrition: NutritionSnapshot?,
    energy: EnergyDisplay = EnergyDisplay.KCAL,
    leftLabel: String = "left",
    overLabel: String = "over",
    syncPrompt: String = "Sync nutrition goals",
    proteinGoalFormat: (Int, Int) -> String = { c, g -> "${c}/${g}g P" },
    proteinOnlyFormat: (Int) -> String = { c -> "${c}g P" },
    bannerLeftFormat: (Int, String, String) -> String = { rem, unit, p -> "$rem $unit left · $p" },
    bannerOverFormat: (Int, String, String) -> String = { over, unit, p -> "$over $unit over · $p" },
    carbsFatFormat: (Int, Int) -> String = { c, f -> "C ${c}g · F ${f}g" }
  ): ComplicationDisplaySpec {
    val (bannerText, bannerTitle) = buildNutritionBanner(
      nutrition = nutrition,
      energy = energy,
      syncPrompt = syncPrompt,
      proteinGoalFormat = proteinGoalFormat,
      proteinOnlyFormat = proteinOnlyFormat,
      bannerLeftFormat = bannerLeftFormat,
      bannerOverFormat = bannerOverFormat,
      carbsFatFormat = carbsFatFormat
    )
    if (nutrition == null || !nutrition.isToday) {
      return ComplicationDisplaySpec(
        shortText = "—",
        shortTitle = energy.unit,
        longText = bannerText,
        longTitle = null,
        progressValue = 0f,
        goalValue = 2000f,
        rangedValueOverride = 0f,
        contentDescription = syncPrompt
      )
    }
    val consumed = max(0.0, energy.value(nutrition.caloriesConsumed)).toFloat()
    val goal = max(
      1.0,
      energy.value(nutrition.caloriesConsumed + nutrition.caloriesRemaining)
    ).toFloat()
    val remainingInt = energy.whole(nutrition.caloriesRemaining)
    val shortText = formatCompactBudgetShortText(remainingInt, energy)
    val shortTitle = if (remainingInt >= 0) leftLabel else overLabel
    val remainingClamped = remainingInt.toFloat().coerceIn(0f, goal)
    val remainingProgress = max(0f, remainingInt.toFloat())
    val longDesc = if (bannerTitle != null) "$bannerText · $bannerTitle" else bannerText
    return ComplicationDisplaySpec(
      shortText = shortText,
      shortTitle = shortTitle,
      longText = bannerText,
      longTitle = bannerTitle,
      progressValue = remainingProgress,
      goalValue = goal,
      rangedValueOverride = remainingClamped,
      contentDescription = longDesc,
      validUntil = endOfLocalDayInstant(nutrition.day)
    )
  }

  private fun formatCompactBudgetShortText(remainingInt: Int, energy: EnergyDisplay): String {
    val mag = abs(remainingInt)
    return if (energy.isKj) {
      if (mag < 10_000) {
        "${remainingInt}kJ"
      } else {
        val kVal = (remainingInt / 1000.0).roundToInt()
        val withSpace = "${kVal}k kJ"
        val withoutSpace = "${kVal}kkJ"
        when {
          withSpace.length <= 7 -> withSpace
          withoutSpace.length <= 7 -> withoutSpace
          else -> "${(remainingInt / 1_000_000.0).roundToInt()}MkJ"
        }
      }
    } else {
      val plain = "$remainingInt"
      if (plain.length <= 7) plain else "${(remainingInt / 1000.0).roundToInt()}k"
    }
  }

  /**
   * Builds the display specification for [SleepComplicationService].
   */
  fun buildSleepSpec(
    sleep: SleepSnapshot?,
    sleepPrefix: String = "Sleep",
    scorePrefix: String = "Score",
    noSleepText: String = "No sleep logged",
    inBedShortLabel: String = "In bed",
    inBedFormat: (String) -> String = { "In bed $it" }
  ): ComplicationDisplaySpec {
    if (sleep == null || !sleep.isToday || (sleep.totalSeconds <= 0 && sleep.timeInBedSeconds <= 0)) {
      return ComplicationDisplaySpec(
        shortText = "—",
        shortTitle = null,
        longText = noSleepText,
        longTitle = null,
        progressValue = 0f,
        goalValue = 8f,
        contentDescription = noSleepText
      )
    }
    val inBedOnly = sleep.totalSeconds <= 0
    val spanSeconds = if (!inBedOnly) sleep.totalSeconds else sleep.timeInBedSeconds
    val rawDurationStr = TileModels.formatDurationSeconds(spanSeconds)
    val durationLabel = if (inBedOnly) inBedFormat(rawDurationStr) else "$sleepPrefix $rawDurationStr"
    val windowTitle = if (sleep.bedtime.isNotBlank() && sleep.wakeTime.isNotBlank()) {
      "${sleep.bedtime} – ${sleep.wakeTime}"
    } else {
      null
    }
    val dayEnd = endOfLocalDayInstant(sleep.day)
    val score = sleep.sleepScore?.takeIf { it > 0 }
    return if (score != null) {
      val longStr = "$durationLabel · $scorePrefix $score"
      ComplicationDisplaySpec(
        shortText = "$score",
        shortTitle = if (inBedOnly) inBedShortLabel else rawDurationStr,
        longText = longStr,
        longTitle = windowTitle,
        progressValue = score.toFloat(),
        goalValue = 100f,
        contentDescription = longStr,
        validUntil = dayEnd
      )
    } else {
      val hours = if (inBedOnly) 0f else spanSeconds / 3600f
      ComplicationDisplaySpec(
        shortText = rawDurationStr,
        shortTitle = if (inBedOnly) inBedShortLabel else null,
        longText = durationLabel,
        longTitle = windowTitle,
        progressValue = hours,
        goalValue = 8f,
        contentDescription = durationLabel,
        validUntil = dayEnd
      )
    }
  }

  /**
   * Builds the display specification for [MedicationsComplicationService].
   */
  fun buildMedicationsSpec(
    medications: MedicationSnapshot?,
    doneShortLabel: String = "Done",
    notSyncedText: String = "Not synced",
    noneTodayText: String = "No doses scheduled today",
    allDoneText: String = "All doses completed",
    openMedsFallbackLabel: String = "Medications",
    turnedOff: Boolean = false,
    turnedOffShortText: String = "Off",
    turnedOffText: String = "Turned off",
    turnedOffDescription: String = "Medications turned off",
    skippedDoneFormat: (Int) -> String = { "$it skipped · All done" }
  ): ComplicationDisplaySpec {
    // Medications is off in the phone app (Settings → Features): no doses, and
    // no "Not synced", which would ask the wearer to sync something turned off.
    if (turnedOff) {
      return ComplicationDisplaySpec(
        shortText = turnedOffShortText,
        shortTitle = null,
        longText = turnedOffText,
        longTitle = null,
        progressValue = 0f,
        goalValue = 1f,
        contentDescription = turnedOffDescription
      )
    }
    if (medications == null || !medications.isToday) {
      return ComplicationDisplaySpec(
        shortText = "—",
        shortTitle = null,
        longText = notSyncedText,
        longTitle = null,
        progressValue = 0f,
        goalValue = 1f,
        contentDescription = notSyncedText
      )
    }
    val dayEnd = endOfLocalDayInstant(medications.day)
    val doses = medications.doses
    if (doses.isEmpty()) {
      return ComplicationDisplaySpec(
        shortText = "0/0",
        shortTitle = doneShortLabel,
        longText = noneTodayText,
        longTitle = null,
        progressValue = 1f,
        goalValue = 1f,
        contentDescription = noneTodayText,
        validUntil = dayEnd
      )
    }
    val taken = doses.count { it.status == MedicationDoseStatus.TAKEN }
    val skipped = doses.count { it.status == MedicationDoseStatus.SKIPPED }
    val total = doses.size
    val nextPending = doses.firstOrNull { it.status == MedicationDoseStatus.PENDING }
    val fractionStr = "$taken/$total"
    return if (nextPending != null) {
      val detailLabel = nextPending.detail.trim().takeIf { it.isNotEmpty() }
      val shortTime = compactDoseTime(nextPending.time)
      val nameBudget = if (shortTime.isNotEmpty()) 14 else 16
      val (compactName, strengthIntact) = TileModels.compactDoseNameWithSafety(
        nextPending.name,
        maxChars = nameBudget
      )
      val safeDisplayName = if (strengthIntact && compactName.isNotEmpty()) {
        compactName
      } else {
        openMedsFallbackLabel
      }
      val nextLabel = if (shortTime.isNotEmpty()) {
        "$safeDisplayName $shortTime"
      } else {
        safeDisplayName
      }
      val longStr = "$fractionStr · $nextLabel"
      val descParts = mutableListOf(fractionStr, nextPending.name.trim())
      if (detailLabel != null) descParts.add(detailLabel)
      if (shortTime.isNotEmpty()) descParts.add(shortTime)
      val a11yDesc = descParts.filter { it.isNotEmpty() }.joinToString(" · ")
      ComplicationDisplaySpec(
        shortText = fractionStr,
        shortTitle = shortTime.ifEmpty { null },
        longText = longStr,
        longTitle = detailLabel,
        progressValue = taken.toFloat(),
        goalValue = total.toFloat(),
        contentDescription = a11yDesc,
        validUntil = dayEnd
      )
    } else {
      val completionLabel = if (skipped > 0) skippedDoneFormat(skipped) else allDoneText
      val longStr = "$fractionStr · $completionLabel"
      ComplicationDisplaySpec(
        shortText = fractionStr,
        shortTitle = doneShortLabel,
        longText = longStr,
        longTitle = null,
        progressValue = taken.toFloat(),
        goalValue = total.toFloat(),
        contentDescription = longStr,
        validUntil = dayEnd
      )
    }
  }

  /**
   * Builds the display specification for [ExerciseComplicationService], including live session and next-workout banners.
   */
  fun buildExerciseSpec(
    exercise: ExerciseSummarySnapshot?,
    scheduledWorkouts: List<ScheduledWorkout>,
    activeSessionLabel: String? = null,
    activeSessionMinutes: Int? = null,
    energy: EnergyDisplay = EnergyDisplay.KCAL,
    liveShortLabel: String = "Live",
    todayWorkoutFormat: (String) -> String = { "Today: $it" },
    startPrompt: String = "Start workout"
  ): ComplicationDisplaySpec {
    val validExercise = exercise?.takeIf { it.isToday }
    val dayEnd = endOfLocalDayInstant(validExercise?.day ?: CheckInDate.today())
    val loggedMinutes = validExercise?.minutes ?: 0
    val goalMinutes = max(1, validExercise?.minutesGoal?.takeIf { it > 0 } ?: 30)
    val liveMins = activeSessionMinutes?.coerceAtLeast(0)

    if (!activeSessionLabel.isNullOrBlank() && liveMins != null) {
      val totalActive = loggedMinutes + liveMins
      val longStr = "${activeSessionLabel.take(18)} · ${liveMins}m"
      return ComplicationDisplaySpec(
        shortText = "${liveMins}m",
        shortTitle = liveShortLabel,
        longText = longStr,
        longTitle = if (loggedMinutes > 0) "${totalActive}/${goalMinutes}m" else null,
        progressValue = totalActive.toFloat(),
        goalValue = goalMinutes.toFloat(),
        contentDescription = longStr,
        validUntil = dayEnd
      )
    }

    val nextScheduled = scheduledWorkouts.firstOrNull()
    if (nextScheduled != null && (validExercise == null || validExercise.sessionCount == 0)) {
      val longStr = todayWorkoutFormat(nextScheduled.name.take(18))
      return ComplicationDisplaySpec(
        shortText = "${loggedMinutes}m",
        shortTitle = "/${goalMinutes}m",
        longText = longStr,
        longTitle = if (loggedMinutes > 0) "${loggedMinutes}/${goalMinutes}m" else nextScheduled.planName.takeIf { it.isNotBlank() },
        progressValue = loggedMinutes.toFloat(),
        goalValue = goalMinutes.toFloat(),
        contentDescription = longStr,
        validUntil = dayEnd
      )
    }

    if (validExercise != null && (loggedMinutes > 0 || validExercise.calories > 0 || validExercise.sessionCount > 0)) {
      val shownCalories = energy.whole(validExercise.calories.toDouble())
      val longStr = "${loggedMinutes}/${goalMinutes}m · $shownCalories ${energy.unit}"
      return ComplicationDisplaySpec(
        shortText = "${loggedMinutes}m",
        shortTitle = "/${goalMinutes}m",
        longText = longStr,
        longTitle = validExercise.sessions.firstOrNull()?.name?.take(18),
        progressValue = loggedMinutes.toFloat(),
        goalValue = goalMinutes.toFloat(),
        contentDescription = longStr,
        validUntil = endOfLocalDayInstant(validExercise.day)
      )
    }

    val idleLong = "0/${goalMinutes}m · $startPrompt"
    return ComplicationDisplaySpec(
      shortText = "0m",
      shortTitle = "/${goalMinutes}m",
      longText = idleLong,
      longTitle = null,
      progressValue = 0f,
      goalValue = goalMinutes.toFloat(),
      contentDescription = idleLong,
      validUntil = validExercise?.day?.let { endOfLocalDayInstant(it) }
    )
  }

  /**
   * Builds the display specification for [WeightComplicationService].
   */
  fun buildWeightSpec(
    weightModel: WeightTileModel,
    noWeightText: String = "No prior weight",
    locale: Locale = Locale.US,
    bodyFatFormat: (Double) -> String = { String.format(locale, "BF %.1f%%", it) }
  ): ComplicationDisplaySpec {
    if (!weightModel.hasData) {
      return ComplicationDisplaySpec(
        shortText = "—",
        shortTitle = weightModel.unitSuffix,
        longText = noWeightText,
        longTitle = null,
        contentDescription = noWeightText
      )
    }
    if (!weightModel.hasWeight && weightModel.bodyFatPercent != null) {
      val bfLabel = bodyFatFormat(weightModel.bodyFatPercent)
      return ComplicationDisplaySpec(
        shortText = String.format(locale, "%.1f%%", weightModel.bodyFatPercent),
        shortTitle = "BF",
        longText = bfLabel,
        longTitle = noWeightText,
        contentDescription = "$bfLabel · $noWeightText"
      )
    }
    val shortVal = String.format(locale, "%.1f", weightModel.latestDisplay)
    val deltaStr = weightModel.stepDelta?.let { d ->
      val sign = if (d > 0) "+" else ""
      String.format(locale, "%s%.1f", sign, d)
    }
    val shortTitle = deltaStr ?: weightModel.unitSuffix
    val longStr = if (deltaStr != null) {
      "${weightModel.weightValueText} · $deltaStr ${weightModel.unitSuffix}"
    } else {
      weightModel.weightValueText
    }
    val bfTitle = weightModel.bodyFatPercent?.let(bodyFatFormat)
    val a11yDesc = if (bfTitle != null) "$longStr · $bfTitle" else longStr
    return ComplicationDisplaySpec(
      shortText = shortVal,
      shortTitle = shortTitle,
      longText = longStr,
      longTitle = bfTitle,
      contentDescription = a11yDesc
    )
  }

  /**
   * Builds the display specification for macro goal complications (`Protein`, `Carbs`, `Fat`),
   * omitting target/remaining copy when [configuredGoal] is null or non-positive.
   */
  fun buildMacroSpec(
    fullLabel: String,
    consumed: Float,
    configuredGoal: Float?,
    fallbackGoal: Float,
    validUntil: Instant? = null,
    descWithGoalFormat: (String, Int, Int, Int) -> String = { label, c, g, pct -> "$label: $c / ${g}g ($pct%)" },
    descWithoutGoalFormat: (String, Int) -> String = { label, c -> "$label: ${c}g" },
    leftFormat: (Int) -> String = { "${it}g left" },
    overFormat: (Int) -> String = { "${it}g over" }
  ): ComplicationDisplaySpec {
    val activeGoal = configuredGoal?.takeIf { it > 0f }
    val safeGoal = max(1f, activeGoal ?: fallbackGoal)
    return if (activeGoal != null) {
      val pct = ((consumed / safeGoal) * 100f).toInt()
      val remGrams = (safeGoal - consumed).roundToInt()
      val longTitle = if (remGrams >= 0) leftFormat(remGrams) else overFormat(-remGrams)
      ComplicationDisplaySpec(
        shortText = "${consumed.toInt()}g",
        shortTitle = "/${safeGoal.toInt()}g",
        longText = "$fullLabel ${consumed.toInt()} / ${safeGoal.toInt()}g",
        longTitle = longTitle,
        progressValue = max(0f, consumed),
        goalValue = safeGoal,
        contentDescription = descWithGoalFormat(fullLabel, consumed.toInt(), safeGoal.toInt(), pct),
        validUntil = validUntil
      )
    } else {
      ComplicationDisplaySpec(
        shortText = "${consumed.toInt()}g",
        shortTitle = null,
        longText = "$fullLabel ${consumed.toInt()}g",
        longTitle = null,
        progressValue = max(0f, consumed),
        goalValue = safeGoal,
        hasGoalTarget = false,
        contentDescription = descWithoutGoalFormat(fullLabel, consumed.toInt()),
        validUntil = validUntil
      )
    }
  }
}

object ComplicationUpdater {
  private const val SLEEP_REQUEST_CODE = 100

  fun requestAll(context: Context) {
    val appCtx = context.applicationContext
    val services = listOf(
      EnergyGoalComplicationService::class.java,
      CaloriesRemainingComplicationService::class.java,
      ProteinGoalComplicationService::class.java,
      CarbsGoalComplicationService::class.java,
      FatGoalComplicationService::class.java,
      WaterGoalComplicationService::class.java,
      FastingComplicationService::class.java,
      StepsComplicationService::class.java,
      SleepComplicationService::class.java,
      MedicationsComplicationService::class.java,
      ExerciseComplicationService::class.java,
      WeightComplicationService::class.java,
      CustomComplicationService::class.java,
      CustomGaugeComplicationService::class.java
    )
    for (cls in services) {
      try {
        ComplicationDataSourceUpdateRequester.create(
          appCtx,
          ComponentName(appCtx, cls)
        ).requestUpdateAll()
      } catch (_: Throwable) {}
    }
  }

  fun tapPendingIntent(context: Context, page: WatchPage): PendingIntent {
    return tapPageKeyPendingIntent(context, page.key, page.ordinal)
  }

  fun tapSleepPendingIntent(context: Context): PendingIntent {
    return tapPageKeyPendingIntent(context, "sleep", SLEEP_REQUEST_CODE)
  }

  fun tapPageKeyPendingIntent(
    context: Context,
    pageKey: String,
    requestCode: Int
  ): PendingIntent {
    val intent = Intent(context, MainActivity::class.java).apply {
      action = Intent.ACTION_VIEW
      putExtra("target_page", pageKey)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    return PendingIntent.getActivity(
      context,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  fun monoIcon(context: Context, @DrawableRes iconRes: Int): MonochromaticImage {
    return MonochromaticImage.Builder(Icon.createWithResource(context, iconRes)).build()
  }

  fun resolveBuiltInStyle(
    context: Context,
    builtInKey: String,
    @DrawableRes defaultIconRes: Int
  ): Pair<Int, Int?> {
    val style = WearSessionManager.getInstance(context.applicationContext)
      .customComplicationStore
      .builtInStyleFor(builtInKey)
      ?: return defaultIconRes to null
    val iconRes = style.icon?.let { CustomComplicationIcons.drawableFor(it, defaultIconRes) } ?: defaultIconRes
    val colorArgb = CustomComplicationPalette.knownColorArgbOrNull(style.color)
    return iconRes to colorArgb
  }

  fun buildComplicationFromSpec(
    context: Context,
    type: ComplicationType,
    @DrawableRes iconRes: Int,
    spec: ComplicationDisplaySpec,
    tap: PendingIntent?,
    colorArgb: Int? = null
  ): ComplicationData? {
    val safeGoal = if (spec.goalValue > 0f) spec.goalValue else 1f
    val shortText = PlainComplicationText.Builder(spec.shortText).build()
    val shortTitle = spec.shortTitle?.takeIf { it.isNotBlank() }?.let {
      PlainComplicationText.Builder(it).build()
    }
    val longText = spec.longComplicationTextOverride
      ?: PlainComplicationText.Builder(spec.longText).build()
    val longTitle = spec.longTitle?.takeIf { it.isNotBlank() }?.let {
      PlainComplicationText.Builder(it).build()
    }
    val desc = if (type == ComplicationType.LONG_TEXT) {
      spec.longContentDescriptionOverride
        ?: spec.longComplicationTextOverride
        ?: PlainComplicationText.Builder(spec.contentDescription).build()
    } else {
      PlainComplicationText.Builder(spec.contentDescription).build()
    }
    val image = monoIcon(context, iconRes)
    val tintedImage = colorArgb?.let { CustomComplicationBitmaps.tintedIconSmallImage(context, iconRes, it) }
    val colorRamp = colorArgb?.let { ColorRamp(intArrayOf(it), false) }
    val timeRange = spec.validUntil?.let { TimeRange.before(it) }

    return when (type) {
      ComplicationType.RANGED_VALUE -> {
        val rangedVal = (spec.rangedValueOverride ?: spec.progressValue).coerceIn(0f, safeGoal)
        RangedValueComplicationData.Builder(
          value = rangedVal,
          min = 0f,
          max = safeGoal,
          contentDescription = desc
        ).apply {
          setText(shortText)
          if (shortTitle != null) setTitle(shortTitle)
          setMonochromaticImage(image)
          if (tintedImage != null) setSmallImage(tintedImage)
          if (colorRamp != null) setColorRamp(colorRamp)
          setTapAction(tap)
          if (timeRange != null) setValidTimeRange(timeRange)
        }.build()
      }

      ComplicationType.GOAL_PROGRESS -> {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          if (!spec.hasGoalTarget) {
            NoDataComplicationData()
          } else {
            GoalProgressComplicationData.Builder(
              value = max(0f, spec.progressValue),
              targetValue = safeGoal,
              contentDescription = desc
            ).apply {
              setText(shortText)
              if (shortTitle != null) setTitle(shortTitle)
              setMonochromaticImage(image)
              if (tintedImage != null) setSmallImage(tintedImage)
              if (colorRamp != null) setColorRamp(colorRamp)
              setTapAction(tap)
              if (timeRange != null) setValidTimeRange(timeRange)
            }.build()
          }
        } else {
          null
        }
      }

      ComplicationType.SHORT_TEXT -> {
        ShortTextComplicationData.Builder(
          text = shortText,
          contentDescription = desc
        ).apply {
          if (shortTitle != null) setTitle(shortTitle)
          setMonochromaticImage(image)
          if (tintedImage != null) setSmallImage(tintedImage)
          setTapAction(tap)
          if (timeRange != null) setValidTimeRange(timeRange)
        }.build()
      }

      ComplicationType.LONG_TEXT -> {
        LongTextComplicationData.Builder(
          text = longText,
          contentDescription = desc
        ).apply {
          if (longTitle != null) setTitle(longTitle)
          setMonochromaticImage(image)
          if (tintedImage != null) setSmallImage(tintedImage)
          setTapAction(tap)
          if (timeRange != null) setValidTimeRange(timeRange)
        }.build()
      }

      else -> null
    }
  }

  fun buildMacroData(
    context: Context,
    type: ComplicationType,
    @DrawableRes iconRes: Int,
    fullLabel: String,
    consumed: Float,
    configuredGoal: Float?,
    fallbackGoal: Float,
    tap: PendingIntent?,
    validUntil: Instant? = null,
    colorArgb: Int? = null
  ): ComplicationData? {
    val spec = ComplicationModels.buildMacroSpec(
      fullLabel = fullLabel,
      consumed = consumed,
      configuredGoal = configuredGoal,
      fallbackGoal = fallbackGoal,
      validUntil = validUntil,
      descWithGoalFormat = { label, c, g, pct ->
        context.getString(R.string.complication_macro_desc, label, c, g, pct)
      },
      descWithoutGoalFormat = { label, c ->
        context.getString(R.string.complication_macro_desc_no_goal, label, c)
      },
      leftFormat = { context.getString(R.string.complication_macro_left, it) },
      overFormat = { context.getString(R.string.complication_macro_over, it) }
    )
    return buildComplicationFromSpec(context, type, iconRes, spec, tap, colorArgb = colorArgb)
  }
}

class EnergyGoalComplicationService : SuspendingComplicationDataSourceService() {
  override fun getPreviewData(type: ComplicationType): ComplicationData? {
    val previewNutrition = NutritionSnapshot(
      day = CheckInDate.today(),
      caloriesConsumed = 1450.0,
      caloriesBurned = 320.0,
      caloriesRemaining = 550.0,
      calorieProgress = 0.725,
      carbs = MacroGoal(160.0, 220.0, 0.73),
      fat = MacroGoal(48.0, 70.0, 0.69),
      protein = MacroGoal(120.0, 160.0, 0.75),
      rows = null
    )
    return buildData(type, previewNutrition, EnergyDisplay.KCAL, tap = null, expireAtMidnight = false)
  }

  override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
    val session = WearSessionManager.getInstance(applicationContext)
    val store = session.checkInStore
    store.pruneStaleDayData()
    session.refreshLiveFromServerIfStale()
    val nutrition = store.nutrition.value
    val energy = EnergyDisplay.of(store.watchContext.value)
    val tap = ComplicationUpdater.tapPendingIntent(applicationContext, WatchPage.GOALS)
    return buildData(request.complicationType, nutrition, energy, tap, expireAtMidnight = true)
  }

  private fun buildData(
    type: ComplicationType,
    nutrition: NutritionSnapshot?,
    energy: EnergyDisplay,
    tap: PendingIntent?,
    expireAtMidnight: Boolean
  ): ComplicationData? {
    val valid = nutrition?.takeIf { it.isToday }
    val consumed = energy.value(valid?.caloriesConsumed ?: 0.0).toFloat()
    val goal = energy.value(
      max(1.0, (valid?.caloriesConsumed ?: 0.0) + (valid?.caloriesRemaining ?: 2000.0))
    ).toFloat()
    val pct = ((consumed / max(1f, goal)) * 100f).toInt()
    val descText = getString(
      R.string.complication_energy_desc,
      consumed.toInt(),
      goal.toInt(),
      energy.unit,
      pct
    )
    val (bannerText, bannerTitle) = ComplicationModels.buildNutritionBanner(
      nutrition = valid,
      energy = energy,
      syncPrompt = getString(R.string.complication_nutrition_sync),
      proteinGoalFormat = { c, g -> getString(R.string.complication_nutrition_protein_goal, c, g) },
      proteinOnlyFormat = { c -> getString(R.string.complication_nutrition_protein_only, c) },
      bannerLeftFormat = { rem, u, p -> getString(R.string.complication_nutrition_banner_left, rem, u, p) },
      bannerOverFormat = { over, u, p -> getString(R.string.complication_nutrition_banner_over, over, u, p) },
      carbsFatFormat = { c, f -> getString(R.string.complication_nutrition_carbs_fat, c, f) }
    )
    val longDesc = if (bannerTitle != null) "$bannerText · $bannerTitle" else bannerText
    val effectiveDesc = if (type == ComplicationType.LONG_TEXT) longDesc else descText
    val spec = ComplicationDisplaySpec(
      shortText = "${consumed.toInt()}",
      shortTitle = energy.unit,
      longText = bannerText,
      longTitle = bannerTitle,
      progressValue = max(0f, consumed),
      goalValue = max(1f, goal),
      contentDescription = effectiveDesc,
      validUntil = if (expireAtMidnight) valid?.day?.let { ComplicationModels.endOfLocalDayInstant(it) } else null
    )
    val (iconRes, colorArgb) = if (expireAtMidnight) {
      ComplicationUpdater.resolveBuiltInStyle(this, "calorieGoal", R.drawable.ic_complication_calories)
    } else {
      R.drawable.ic_complication_calories to null
    }
    return ComplicationUpdater.buildComplicationFromSpec(
      this,
      type,
      iconRes,
      spec,
      tap,
      colorArgb = colorArgb
    )
  }
}

class CaloriesRemainingComplicationService : SuspendingComplicationDataSourceService() {
  override fun getPreviewData(type: ComplicationType): ComplicationData? {
    val previewNutrition = NutritionSnapshot(
      day = CheckInDate.today(),
      caloriesConsumed = 1450.0,
      caloriesBurned = 320.0,
      caloriesRemaining = 550.0,
      calorieProgress = 0.725,
      carbs = MacroGoal(160.0, 220.0, 0.73),
      fat = MacroGoal(48.0, 70.0, 0.69),
      protein = MacroGoal(120.0, 160.0, 0.75),
      rows = null
    )
    val spec = buildSpec(previewNutrition, EnergyDisplay.KCAL).copy(validUntil = null)
    return ComplicationUpdater.buildComplicationFromSpec(
      this,
      type,
      R.drawable.ic_complication_calories_left,
      spec,
      tap = null
    )
  }

  override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
    val session = WearSessionManager.getInstance(applicationContext)
    val store = session.checkInStore
    store.pruneStaleDayData()
    session.refreshLiveFromServerIfStale()
    val energy = EnergyDisplay.of(store.watchContext.value)
    val spec = buildSpec(store.nutrition.value, energy)
    val tap = ComplicationUpdater.tapPendingIntent(applicationContext, WatchPage.GOALS)
    return ComplicationUpdater.buildComplicationFromSpec(
      this,
      request.complicationType,
      R.drawable.ic_complication_calories_left,
      spec,
      tap
    )
  }

  private fun buildSpec(nutrition: NutritionSnapshot?, energy: EnergyDisplay): ComplicationDisplaySpec =
    ComplicationModels.buildCaloriesRemainingSpec(
      nutrition = nutrition,
      energy = energy,
      leftLabel = getString(R.string.complication_unit_left),
      overLabel = getString(R.string.complication_unit_over),
      syncPrompt = getString(R.string.complication_nutrition_sync),
      proteinGoalFormat = { c, g -> getString(R.string.complication_nutrition_protein_goal, c, g) },
      proteinOnlyFormat = { c -> getString(R.string.complication_nutrition_protein_only, c) },
      bannerLeftFormat = { rem, u, p -> getString(R.string.complication_nutrition_banner_left, rem, u, p) },
      bannerOverFormat = { over, u, p -> getString(R.string.complication_nutrition_banner_over, over, u, p) },
      carbsFatFormat = { c, f -> getString(R.string.complication_nutrition_carbs_fat, c, f) }
    )
}

class ProteinGoalComplicationService : SuspendingComplicationDataSourceService() {
  override fun getPreviewData(type: ComplicationType): ComplicationData? {
    return ComplicationUpdater.buildMacroData(this, type, R.drawable.ic_complication_protein, getString(R.string.common_protein), 120f, 160f, 160f, null)
  }

  override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
    val session = WearSessionManager.getInstance(applicationContext)
    val store = session.checkInStore
    store.pruneStaleDayData()
    session.refreshLiveFromServerIfStale()
    val valid = store.nutrition.value?.takeIf { it.isToday }
    val p = valid?.protein
    val consumed = (p?.consumed ?: 0.0).toFloat()
    val configuredGoal = p?.goal?.takeIf { it > 0.0 }?.toFloat()
    val tap = ComplicationUpdater.tapPendingIntent(applicationContext, WatchPage.GOALS)
    val validUntil = valid?.day?.let { ComplicationModels.endOfLocalDayInstant(it) }
    val (iconRes, colorArgb) = ComplicationUpdater.resolveBuiltInStyle(this, "proteinGoal", R.drawable.ic_complication_protein)
    return ComplicationUpdater.buildMacroData(this, request.complicationType, iconRes, getString(R.string.common_protein), consumed, configuredGoal, 150f, tap, validUntil, colorArgb = colorArgb)
  }
}

class CarbsGoalComplicationService : SuspendingComplicationDataSourceService() {
  override fun getPreviewData(type: ComplicationType): ComplicationData? {
    return ComplicationUpdater.buildMacroData(this, type, R.drawable.ic_complication_carbs, getString(R.string.common_carbs), 160f, 220f, 220f, null)
  }

  override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
    val session = WearSessionManager.getInstance(applicationContext)
    val store = session.checkInStore
    store.pruneStaleDayData()
    session.refreshLiveFromServerIfStale()
    val valid = store.nutrition.value?.takeIf { it.isToday }
    val c = valid?.carbs
    val consumed = (c?.consumed ?: 0.0).toFloat()
    val configuredGoal = c?.goal?.takeIf { it > 0.0 }?.toFloat()
    val tap = ComplicationUpdater.tapPendingIntent(applicationContext, WatchPage.GOALS)
    val validUntil = valid?.day?.let { ComplicationModels.endOfLocalDayInstant(it) }
    val (iconRes, colorArgb) = ComplicationUpdater.resolveBuiltInStyle(this, "carbsGoal", R.drawable.ic_complication_carbs)
    return ComplicationUpdater.buildMacroData(this, request.complicationType, iconRes, getString(R.string.common_carbs), consumed, configuredGoal, 200f, tap, validUntil, colorArgb = colorArgb)
  }
}

class FatGoalComplicationService : SuspendingComplicationDataSourceService() {
  override fun getPreviewData(type: ComplicationType): ComplicationData? {
    return ComplicationUpdater.buildMacroData(this, type, R.drawable.ic_complication_fat, getString(R.string.common_fat), 48f, 70f, 70f, null)
  }

  override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
    val session = WearSessionManager.getInstance(applicationContext)
    val store = session.checkInStore
    store.pruneStaleDayData()
    session.refreshLiveFromServerIfStale()
    val valid = store.nutrition.value?.takeIf { it.isToday }
    val f = valid?.fat
    val consumed = (f?.consumed ?: 0.0).toFloat()
    val configuredGoal = f?.goal?.takeIf { it > 0.0 }?.toFloat()
    val tap = ComplicationUpdater.tapPendingIntent(applicationContext, WatchPage.GOALS)
    val validUntil = valid?.day?.let { ComplicationModels.endOfLocalDayInstant(it) }
    val (iconRes, colorArgb) = ComplicationUpdater.resolveBuiltInStyle(this, "fatGoal", R.drawable.ic_complication_fat)
    return ComplicationUpdater.buildMacroData(this, request.complicationType, iconRes, getString(R.string.common_fat), consumed, configuredGoal, 65f, tap, validUntil, colorArgb = colorArgb)
  }
}

class WaterGoalComplicationService : SuspendingComplicationDataSourceService() {
  override fun getPreviewData(type: ComplicationType): ComplicationData? {
    return buildData(type, consumed = 1500f, goal = 2500f, unit = "ml", tap = null, validUntil = null)
  }

  override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
    val session = WearSessionManager.getInstance(applicationContext)
    val store = session.checkInStore
    var requestDay = CheckInDate.today()
    store.pruneStaleDayData()
    session.refreshLiveFromServerIfStale()
    var consumed = store.effectiveWaterMl.value.toFloat()
    var snap = store.water.value
    val afterDay = CheckInDate.today()
    if (afterDay != requestDay) {
      requestDay = afterDay
      store.pruneStaleDayData()
      consumed = store.effectiveWaterMl.value.toFloat()
      snap = store.water.value
    }
    val goal = max(1.0, store.waterGoalMl.value).toFloat()
    val unit = store.waterDisplayUnit.value
    val tap = ComplicationUpdater.tapPendingIntent(applicationContext, WatchPage.WATER)
    val waterDay = snap?.takeIf { it.day == requestDay }?.day ?: if (consumed > 0f) requestDay else null
    val validUntil = ComplicationModels.endOfLocalDayInstant(waterDay)
    return buildData(request.complicationType, consumed, goal, unit, tap, validUntil)
  }

  private fun buildData(
    type: ComplicationType,
    consumed: Float,
    goal: Float,
    unit: String,
    tap: PendingIntent?,
    validUntil: Instant?
  ): ComplicationData? {
    val locale = Locale.getDefault()
    val lowerUnit = unit.lowercase(Locale.US)
    val displayValue = when (lowerUnit) {
      "oz" -> "${(consumed / 29.5735f).roundToInt()}oz"
      "liter", "l" -> String.format(locale, "%.1fL", consumed / 1000f)
      else -> "${consumed.toInt()}"
    }
    val displayGoal = when (lowerUnit) {
      "oz" -> "${(goal / 29.5735f).roundToInt()} oz"
      "liter", "l" -> String.format(locale, "%.1f L", goal / 1000f)
      else -> "${goal.toInt()} ml"
    }
    val longValue = when (lowerUnit) {
      "oz" -> "${(consumed / 29.5735f).roundToInt()} / $displayGoal"
      "liter", "l" -> String.format(locale, "%.1f / %s", consumed / 1000f, displayGoal)
      else -> "${consumed.toInt()} / $displayGoal"
    }
    val spec = ComplicationDisplaySpec(
      shortText = displayValue,
      shortTitle = if (lowerUnit != "oz" && lowerUnit != "liter" && lowerUnit != "l") "ml" else null,
      longText = longValue,
      longTitle = getString(R.string.water_title),
      progressValue = max(0f, consumed),
      goalValue = max(1f, goal),
      contentDescription = getString(R.string.complication_water_desc, longValue),
      validUntil = validUntil
    )
    val (iconRes, colorArgb) = if (tap != null) {
      ComplicationUpdater.resolveBuiltInStyle(this, "water", R.drawable.ic_complication_water)
    } else {
      R.drawable.ic_complication_water to null
    }
    return ComplicationUpdater.buildComplicationFromSpec(
      this,
      type,
      iconRes,
      spec,
      tap,
      colorArgb = colorArgb
    )
  }
}

class FastingComplicationService : SuspendingTimelineComplicationDataSourceService() {
  override fun getPreviewData(type: ComplicationType): ComplicationData? {
    return buildData(type, elapsedHours = 12.5f, goalHours = 16f, isActive = true, presetLabel = "16:8", tap = null)
  }

  override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationDataTimeline? {
    val store = WearSessionManager.getInstance(applicationContext).checkInStore
    val fast = store.fast.value
    val nowMs = System.currentTimeMillis()
    val tap = ComplicationUpdater.tapPendingIntent(applicationContext, WatchPage.FASTING)
    val type = request.complicationType

    if (fast == null) {
      val idleData = buildData(type, elapsedHours = 0f, goalHours = 16f, isActive = false, presetLabel = null, tap = tap)
      return idleData?.let { ComplicationDataTimeline(it, emptyList()) }
    }

    val explicitTargetEndMs = fast.targetEndAtMs?.takeIf { it > fast.startedAtMs }
    val safeGoalHours = if (explicitTargetEndMs != null) {
      max(0.01f, ((explicitTargetEndMs - fast.startedAtMs) / 3600_000.0).toFloat())
    } else {
      16f
    }
    val effectiveTargetEndMs = explicitTargetEndMs ?: (fast.startedAtMs + 16L * 3600_000L)
    val elapsedHours = max(0.0, (nowMs - fast.startedAtMs) / 3600_000.0).toFloat()
    val remSecNow = if (effectiveTargetEndMs > nowMs) {
      max(1, ((effectiveTargetEndMs - nowMs + 999L) / 1000L).toInt())
    } else {
      0
    }
    val activeCountdownTarget = effectiveTargetEndMs.takeIf { it > nowMs }?.let { Instant.ofEpochMilli(it) }
    val currentData = buildData(
      type,
      elapsedHours = elapsedHours,
      goalHours = safeGoalHours,
      isActive = true,
      presetLabel = fast.label,
      tap = tap,
      remainingSeconds = remSecNow,
      countdownTargetInstant = activeCountdownTarget
    ) ?: return null

    if (effectiveTargetEndMs > nowMs) {
      val neutralDefaultData = buildData(
        type,
        elapsedHours = elapsedHours,
        goalHours = safeGoalHours,
        isActive = true,
        presetLabel = fast.label,
        tap = tap,
        neutralActiveSummary = true
      ) ?: currentData
      val completedData = buildData(
        type,
        elapsedHours = safeGoalHours,
        goalHours = safeGoalHours,
        isActive = true,
        presetLabel = fast.label,
        tap = tap,
        remainingSeconds = 0,
        countdownTargetInstant = null
      )
      if (completedData != null) {
        val nowInst = Instant.ofEpochMilli(nowMs)
        val targetInst = Instant.ofEpochMilli(effectiveTargetEndMs)
        val afterTargetEndInst = Instant.ofEpochMilli(effectiveTargetEndMs + 365L * 86_400_000L)
        return ComplicationDataTimeline(
          neutralDefaultData,
          listOf(
            TimelineEntry(TimeInterval(nowInst, targetInst), currentData),
            TimelineEntry(TimeInterval(targetInst, afterTargetEndInst), completedData)
          )
        )
      }
    }

    return ComplicationDataTimeline(currentData, emptyList())
  }

  private fun formatGoalHoursLabel(goalHours: Float, locale: Locale = Locale.getDefault()): String {
    val roundedInt = goalHours.roundToInt()
    return if (abs(goalHours - roundedInt) < 0.05f && roundedInt >= 1) {
      "${roundedInt}h"
    } else {
      String.format(locale, "%.1fh", goalHours)
    }
  }

  private fun buildData(
    type: ComplicationType,
    elapsedHours: Float,
    goalHours: Float,
    isActive: Boolean,
    presetLabel: String?,
    tap: PendingIntent?,
    remainingSeconds: Int? = null,
    countdownTargetInstant: Instant? = null,
    neutralActiveSummary: Boolean = false
  ): ComplicationData? {
    val locale = Locale.getDefault()
    val safeGoal = if (goalHours > 0f) goalHours else 16f
    val goalHoursLabel = formatGoalHoursLabel(safeGoal, locale)
    val shortLabel = if (isActive) {
      String.format(locale, "%.1fh", elapsedHours)
    } else {
      getString(R.string.complication_fasting_idle)
    }
    val longLabel = if (!isActive) {
      getString(R.string.complication_fasting_long_idle)
    } else if (neutralActiveSummary) {
      getString(R.string.complication_fasting_long_active, shortLabel, goalHoursLabel)
    } else {
      val remSec = remainingSeconds ?: ((safeGoal - elapsedHours) * 3600f).roundToInt()
      when {
        remSec <= 0 -> getString(R.string.complication_fasting_long_done, shortLabel)
        remSec < 60 -> getString(R.string.complication_fasting_long_under_min)
        else -> getString(
          R.string.complication_fasting_long_left,
          TileModels.formatDurationSeconds(remSec)
        )
      }
    }
    val liveCountdownText = if (neutralActiveSummary) {
      null
    } else {
      countdownTargetInstant?.let { targetInst ->
        TimeDifferenceComplicationText.Builder(
          TimeDifferenceStyle.SHORT_DUAL_UNIT,
          CountDownTimeReference(targetInst)
        )
          .setText(getString(R.string.complication_fasting_long_left, "^1"))
          .setDisplayAsNow(false)
          .setMinimumTimeUnit(TimeUnit.MINUTES)
          .build()
      }
    }
    val presetTitle = presetLabel?.takeIf { it.isNotBlank() }
    val liveCountdownA11y = if (neutralActiveSummary || presetTitle == null) {
      null
    } else {
      countdownTargetInstant?.let { targetInst ->
        TimeDifferenceComplicationText.Builder(
          TimeDifferenceStyle.SHORT_DUAL_UNIT,
          CountDownTimeReference(targetInst)
        )
          .setText("${getString(R.string.complication_fasting_long_left, "^1")} · $presetTitle")
          .setDisplayAsNow(false)
          .setMinimumTimeUnit(TimeUnit.MINUTES)
          .build()
      }
    }
    val roundedGoalHours = safeGoal.roundToInt()
    val isWholeHourGoal = abs(safeGoal - roundedGoalHours) < 0.05f && roundedGoalHours >= 1
    val descText = if (isWholeHourGoal) {
      getString(R.string.complication_fasting_desc, shortLabel, roundedGoalHours)
    } else {
      getString(R.string.complication_fasting_desc_text, shortLabel, goalHoursLabel)
    }
    val longDesc = if (presetTitle != null) "$longLabel · $presetTitle" else longLabel
    val effectiveDesc = if (type == ComplicationType.LONG_TEXT) longDesc else descText
    val spec = ComplicationDisplaySpec(
      shortText = shortLabel,
      shortTitle = if (isActive) "/$goalHoursLabel" else null,
      longText = longLabel,
      longTitle = presetTitle,
      progressValue = max(0f, elapsedHours),
      goalValue = safeGoal,
      contentDescription = effectiveDesc,
      longComplicationTextOverride = liveCountdownText,
      longContentDescriptionOverride = liveCountdownA11y
    )
    val (iconRes, colorArgb) = if (tap != null) {
      ComplicationUpdater.resolveBuiltInStyle(this, "fasting", R.drawable.ic_complication_fasting)
    } else {
      R.drawable.ic_complication_fasting to null
    }
    return ComplicationUpdater.buildComplicationFromSpec(
      this,
      type,
      iconRes,
      spec,
      tap,
      colorArgb = colorArgb
    )
  }
}

class StepsComplicationService : SuspendingComplicationDataSourceService() {
  override fun getPreviewData(type: ComplicationType): ComplicationData? {
    return buildData(type, today = 6420f, goal = 10000f, tap = null, validUntil = null)
  }

  override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
    val session = WearSessionManager.getInstance(applicationContext)
    val store = session.checkInStore
    store.pruneStaleDayData()
    session.refreshLiveFromServerIfStale()
    val steps = store.steps.value?.takeIf { it.isToday }
    val today = (steps?.count ?: 0).toFloat()
    val goal = max(1, store.stepGoal.value).toFloat()
    val tap = ComplicationUpdater.tapPendingIntent(applicationContext, WatchPage.STEPS)
    val validUntil = steps?.day?.let { ComplicationModels.endOfLocalDayInstant(it) }
    return buildData(request.complicationType, today, goal, tap, validUntil)
  }

  private fun buildData(
    type: ComplicationType,
    today: Float,
    goal: Float,
    tap: PendingIntent?,
    validUntil: Instant?
  ): ComplicationData? {
    val shortStr = if (today >= 1000f) {
      String.format(Locale.getDefault(), "%.1fk", today / 1000f)
    } else {
      "${today.toInt()}"
    }
    val descText = getString(R.string.complication_steps_desc, today.toInt(), goal.toInt())
    val longStr = getString(R.string.complication_steps_long, today.toInt(), goal.toInt())
    val spec = ComplicationDisplaySpec(
      shortText = shortStr,
      shortTitle = null,
      longText = longStr,
      longTitle = getString(R.string.steps_title),
      progressValue = max(0f, today),
      goalValue = max(1f, goal),
      contentDescription = descText,
      validUntil = validUntil
    )
    val (iconRes, colorArgb) = if (tap != null) {
      ComplicationUpdater.resolveBuiltInStyle(this, "steps", R.drawable.ic_complication_steps)
    } else {
      R.drawable.ic_complication_steps to null
    }
    return ComplicationUpdater.buildComplicationFromSpec(
      this,
      type,
      iconRes,
      spec,
      tap,
      colorArgb = colorArgb
    )
  }
}

class SleepComplicationService : SuspendingComplicationDataSourceService() {
  override fun getPreviewData(type: ComplicationType): ComplicationData? {
    val previewSleep = SleepSnapshot(
      day = CheckInDate.today(),
      totalSeconds = 7 * 3600 + 24 * 60,
      timeInBedSeconds = 7 * 3600 + 50 * 60,
      sleepScore = 84,
      bedtime = "11:00 PM",
      wakeTime = "6:50 AM"
    )
    val spec = ComplicationModels.buildSleepSpec(
      sleep = previewSleep,
      sleepPrefix = getString(R.string.complication_sleep_prefix),
      scorePrefix = getString(R.string.complication_sleep_score_prefix),
      noSleepText = getString(R.string.tile_sleep_no_logged),
      inBedShortLabel = getString(R.string.complication_sleep_in_bed_short),
      inBedFormat = { getString(R.string.tile_sleep_in_bed, it) }
    ).copy(validUntil = null)
    return ComplicationUpdater.buildComplicationFromSpec(
      this,
      type,
      R.drawable.ic_tile_sleep,
      spec,
      tap = null
    )
  }

  override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
    val store = WearSessionManager.getInstance(applicationContext).checkInStore
    store.pruneStaleDayData()
    val spec = ComplicationModels.buildSleepSpec(
      sleep = store.sleep.value,
      sleepPrefix = getString(R.string.complication_sleep_prefix),
      scorePrefix = getString(R.string.complication_sleep_score_prefix),
      noSleepText = getString(R.string.tile_sleep_no_logged),
      inBedShortLabel = getString(R.string.complication_sleep_in_bed_short),
      inBedFormat = { getString(R.string.tile_sleep_in_bed, it) }
    )
    val tap = ComplicationUpdater.tapSleepPendingIntent(applicationContext)
    return ComplicationUpdater.buildComplicationFromSpec(
      this,
      request.complicationType,
      R.drawable.ic_tile_sleep,
      spec,
      tap
    )
  }
}

class MedicationsComplicationService : SuspendingComplicationDataSourceService() {
  override fun getPreviewData(type: ComplicationType): ComplicationData? {
    val previewMeds = MedicationSnapshot(
      day = CheckInDate.today(),
      doses = listOf(
        MedicationDose("1", "m1", "s1", "Vitamin D", "2000 IU", "8:00 AM", MedicationDoseStatus.TAKEN),
        MedicationDose("2", "m2", "s2", "Omega-3", "1000 mg", "12:00 PM", MedicationDoseStatus.TAKEN),
        MedicationDose("3", "m3", "s3", "Magnesium", "400 mg", "8:00 PM", MedicationDoseStatus.PENDING)
      )
    )
    val spec = ComplicationModels.buildMedicationsSpec(
      medications = previewMeds,
      doneShortLabel = getString(R.string.common_done),
      notSyncedText = getString(R.string.tile_meds_not_synced),
      noneTodayText = getString(R.string.tile_meds_none_today),
      allDoneText = getString(R.string.tile_meds_all_done),
      openMedsFallbackLabel = getString(R.string.meds_title_empty),
      skippedDoneFormat = { getString(R.string.tile_meds_skipped_done, it) }
    ).copy(validUntil = null)
    return ComplicationUpdater.buildComplicationFromSpec(
      this,
      type,
      R.drawable.ic_tile_medications,
      spec,
      tap = null
    )
  }

  override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
    val session = WearSessionManager.getInstance(applicationContext)
    val store = session.checkInStore
    store.pruneStaleDayData()
    session.refreshLiveFromServerIfStale()
    val spec = ComplicationModels.buildMedicationsSpec(
      medications = store.medications.value,
      doneShortLabel = getString(R.string.common_done),
      notSyncedText = getString(R.string.tile_meds_not_synced),
      noneTodayText = getString(R.string.tile_meds_none_today),
      allDoneText = getString(R.string.tile_meds_all_done),
      openMedsFallbackLabel = getString(R.string.meds_title_empty),
      turnedOff = store.watchContext.value.isFeatureOff("medications"),
      turnedOffShortText = getString(R.string.complication_meds_off_short),
      turnedOffText = getString(R.string.tile_meds_turned_off),
      turnedOffDescription = getString(R.string.complication_meds_turned_off_description),
      skippedDoneFormat = { getString(R.string.tile_meds_skipped_done, it) }
    )
    val tap = ComplicationUpdater.tapPendingIntent(applicationContext, WatchPage.MEDICATIONS)
    return ComplicationUpdater.buildComplicationFromSpec(
      this,
      request.complicationType,
      R.drawable.ic_tile_medications,
      spec,
      tap
    )
  }
}

class ExerciseComplicationService : SuspendingComplicationDataSourceService() {
  override fun getPreviewData(type: ComplicationType): ComplicationData? {
    val previewExercise = ExerciseSummarySnapshot(
      day = CheckInDate.today(),
      minutes = 35,
      minutesGoal = 45,
      calories = 310,
      caloriesGoal = 450,
      sessionCount = 1,
      sessions = listOf(ExerciseSessionItem("Push Day A", 35, 310))
    )
    val spec = ComplicationModels.buildExerciseSpec(
      exercise = previewExercise,
      scheduledWorkouts = emptyList(),
      liveShortLabel = getString(R.string.workout_new_live_title),
      todayWorkoutFormat = { getString(R.string.complication_exercise_today_workout, it) },
      startPrompt = getString(R.string.complication_exercise_start_prompt)
    ).copy(validUntil = null)
    return ComplicationUpdater.buildComplicationFromSpec(
      this,
      type,
      R.drawable.ic_tile_exercise,
      spec,
      tap = null
    )
  }

  override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
    val session = WearSessionManager.getInstance(applicationContext)
    val store = session.checkInStore
    store.pruneStaleDayData()
    session.refreshLiveFromServerIfStale()
    val energy = EnergyDisplay.of(store.watchContext.value)

    var activeLabel: String? = null
    var activeMinutes: Int? = null
    if (session.workoutStore.isWorkoutActive) {
      activeLabel = session.workoutStore.plan.value?.workoutName?.takeIf { it.isNotBlank() }
        ?: getString(R.string.workout_new_fallback_title)
      activeMinutes = session.workoutStore.elapsedSeconds.value / 60
    } else {
      val runPhase = session.runStore.phase.value
      if (runPhase == WatchRunStore.RunPhase.RUNNING || runPhase == WatchRunStore.RunPhase.PAUSED) {
        val kind = session.runStore.request.value?.kind
        activeLabel = if (kind == "walk") {
          getString(R.string.recording_activity_walk)
        } else {
          getString(R.string.recording_activity_run)
        }
        activeMinutes = session.runStore.elapsedSeconds.value / 60
      } else if (session.recordingStore.isActive) {
        val rec = session.recordingStore.state.value
        if (rec != null) {
          activeLabel = when (rec.activity) {
            "walk" -> getString(R.string.recording_activity_walk)
            "ride" -> getString(R.string.recording_activity_ride)
            else -> getString(R.string.recording_activity_run)
          }
          val now = rec.pausedAtMs ?: System.currentTimeMillis()
          val elapsedMs = max(0L, now - rec.startedAtMs - rec.pausedMs.toLong())
          activeMinutes = (elapsedMs / 60_000L).toInt()
        }
      }
    }

    val spec = ComplicationModels.buildExerciseSpec(
      exercise = store.exerciseSummary.value,
      scheduledWorkouts = store.todaysScheduledWorkouts(),
      activeSessionLabel = activeLabel,
      activeSessionMinutes = activeMinutes,
      energy = energy,
      liveShortLabel = getString(R.string.workout_new_live_title),
      todayWorkoutFormat = { getString(R.string.complication_exercise_today_workout, it) },
      startPrompt = getString(R.string.complication_exercise_start_prompt)
    )
    val tap = ComplicationUpdater.tapPendingIntent(applicationContext, WatchPage.WORKOUT)
    return ComplicationUpdater.buildComplicationFromSpec(
      this,
      request.complicationType,
      R.drawable.ic_tile_exercise,
      spec,
      tap
    )
  }
}

class WeightComplicationService : SuspendingComplicationDataSourceService() {
  override fun getPreviewData(type: ComplicationType): ComplicationData? {
    val today = CheckInDate.today()
    val previewCtx = WatchContext(
      today = today,
      todayWeightKg = 80.92,
      todayBodyFatPercentage = 16.8,
      weightUnit = WeightUnit.LBS
    )
    val previewHistory = listOf(
      HistoryPoint("2026-01-01", 81.10, 17.0),
      HistoryPoint(today, 80.92, 16.8)
    )
    val locale = Locale.getDefault()
    val weightModel = TileModels.buildWeightTileModel(
      watchCtx = previewCtx,
      history = previewHistory,
      unit = WeightUnit.LBS,
      today = today,
      locale = locale
    )
    val spec = ComplicationModels.buildWeightSpec(
      weightModel = weightModel,
      noWeightText = getString(R.string.weight_no_prior),
      locale = locale,
      bodyFatFormat = { getString(R.string.weight_bf_short, it) }
    )
    return ComplicationUpdater.buildComplicationFromSpec(
      this,
      type,
      R.drawable.ic_complication_weight,
      spec,
      tap = null
    )
  }

  override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
    val store = WearSessionManager.getInstance(applicationContext).checkInStore
    val locale = Locale.getDefault()
    val weightModel = TileModels.buildWeightTileModel(
      watchCtx = store.watchContext.value,
      history = store.history.value,
      unit = store.unit.value,
      locale = locale
    )
    val spec = ComplicationModels.buildWeightSpec(
      weightModel = weightModel,
      noWeightText = getString(R.string.weight_no_prior),
      locale = locale,
      bodyFatFormat = { getString(R.string.weight_bf_short, it) }
    )
    val tap = ComplicationUpdater.tapPendingIntent(applicationContext, WatchPage.ENTRY)
    return ComplicationUpdater.buildComplicationFromSpec(
      this,
      request.complicationType,
      R.drawable.ic_complication_weight,
      spec,
      tap
    )
  }
}
