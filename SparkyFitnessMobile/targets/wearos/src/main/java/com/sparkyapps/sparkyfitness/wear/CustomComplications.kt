package com.sparkyapps.sparkyfitness.wear

import android.app.Activity
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffColorFilter
import android.graphics.RectF
import android.graphics.drawable.Icon
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.annotation.DrawableRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.core.content.IntentCompat
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.Icon as WearIcon
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.PositionIndicator
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import androidx.wear.watchface.complications.data.ColorRamp
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationText
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.CountDownTimeReference
import androidx.wear.watchface.complications.data.CountUpTimeReference
import androidx.wear.watchface.complications.data.GoalProgressComplicationData
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.MonochromaticImage
import androidx.wear.watchface.complications.data.NoDataComplicationData
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.RangedValueComplicationData
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.data.SmallImage
import androidx.wear.watchface.complications.data.SmallImageComplicationData
import androidx.wear.watchface.complications.data.SmallImageType
import androidx.wear.watchface.complications.data.TimeDifferenceComplicationText
import androidx.wear.watchface.complications.data.TimeDifferenceStyle
import androidx.wear.watchface.complications.data.TimeRange
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceService
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import androidx.wear.watchface.complications.datasource.ComplicationDataTimeline
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingTimelineComplicationDataSourceService
import androidx.wear.watchface.complications.datasource.TimeInterval
import androidx.wear.watchface.complications.datasource.TimelineEntry
import com.SparkyApps.SparkyFitnessMobile.R
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.util.Locale
import java.util.concurrent.TimeUnit
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Color palette mirroring `COMPLICATION_COLOR_HEX` in `src/utils/watchComplications.ts`.
 */
object CustomComplicationPalette {
  const val CALORIES: Int = 0xFF8992DC.toInt()
  const val PROTEIN: Int = 0xFFDBB06F.toInt()
  const val CARBS: Int = 0xFF97C692.toInt()
  const val FAT: Int = 0xFF8AC2DA.toInt()
  const val WATER: Int = 0xFF64D2FF.toInt()
  const val STEPS: Int = 0xFF66D4CF.toInt()
  const val FASTING: Int = 0xFFFF9F0A.toInt()
  const val WEIGHT: Int = 0xFF6AC4DC.toInt()
  const val SLEEP: Int = 0xFF7D7AFF.toInt()
  const val HEART: Int = 0xFFFF6482.toInt()
  const val EXERCISE: Int = 0xFF30D158.toInt()
  const val NEUTRAL: Int = 0xFFFFFFFF.toInt()

  fun colorArgb(key: String?): Int = when (key) {
    "calories" -> CALORIES
    "protein" -> PROTEIN
    "carbs" -> CARBS
    "fat" -> FAT
    "water" -> WATER
    "steps" -> STEPS
    "fasting" -> FASTING
    "weight" -> WEIGHT
    "sleep" -> SLEEP
    "heart" -> HEART
    "exercise" -> EXERCISE
    else -> NEUTRAL
  }

  fun knownColorArgbOrNull(key: String?): Int? = when (key) {
    "calories" -> CALORIES
    "protein" -> PROTEIN
    "carbs" -> CARBS
    "fat" -> FAT
    "water" -> WATER
    "steps" -> STEPS
    "fasting" -> FASTING
    "weight" -> WEIGHT
    "sleep" -> SLEEP
    "heart" -> HEART
    "exercise" -> EXERCISE
    "neutral" -> NEUTRAL
    else -> null
  }
}

/**
 * Maps the shared SF Symbol wire keys (`COMPLICATION_ICONS`) to Wear OS vector drawables.
 */
object CustomComplicationIcons {
  @DrawableRes
  fun drawableFor(iconKey: String?, @DrawableRes fallback: Int = R.drawable.ic_custom_gauge): Int =
    when (iconKey) {
      "flame.fill" -> R.drawable.ic_complication_calories
      "fish.fill" -> R.drawable.ic_custom_fish
      "leaf.fill" -> R.drawable.ic_complication_fat
      "drop.fill" -> R.drawable.ic_complication_water
      "figure.walk" -> R.drawable.ic_complication_steps
      "timer" -> R.drawable.ic_complication_fasting
      "scalemass.fill" -> R.drawable.ic_complication_weight
      "heart.fill" -> R.drawable.ic_custom_heart
      "bolt.fill" -> R.drawable.ic_complication_carbs
      "fork.knife" -> R.drawable.ic_custom_fork_knife
      "chart.bar.fill" -> R.drawable.ic_custom_chart_bar
      "gauge.with.dots.needle.33percent" -> R.drawable.ic_custom_gauge
      "bed.double.fill" -> R.drawable.ic_custom_bed
      "moon.zzz.fill" -> R.drawable.ic_tile_sleep
      "waveform.path.ecg" -> R.drawable.ic_custom_ecg
      "lungs.fill" -> R.drawable.ic_custom_lungs
      "dumbbell.fill" -> R.drawable.ic_tile_exercise
      else -> fallback
    }
}

data class CustomComplicationItem(
  val source: String,
  val format: String = "value",
  val color: String = "neutral",
  val icon: String = "gauge.with.dots.needle.33percent"
)

data class CustomComplicationDefinition(
  val id: String,
  val name: String,
  val source: String,
  val format: String = "value",
  val gauge: Boolean = false,
  val color: String = "neutral",
  val icon: String = "gauge.with.dots.needle.33percent",
  val extras: List<CustomComplicationItem> = emptyList()
) {
  fun allItems(): List<CustomComplicationItem> = buildList {
    add(CustomComplicationItem(source = source, format = format, color = color, icon = icon))
    addAll(extras.take(2))
  }
}

data class BuiltInComplicationStyle(
  val key: String,
  val color: String? = null,
  val icon: String? = null
)

data class CustomComplicationConfig(
  val revision: Long,
  val reload: Boolean,
  val definitions: List<CustomComplicationDefinition>,
  val builtIns: List<BuiltInComplicationStyle>?
)

/**
 * One metric snapshot available to custom complications, already converted into
 * the wearer's configured display units.
 */
data class CustomMetric(
  val key: String,
  val value: Double,
  val goal: Double? = null,
  val remaining: Double? = null,
  val progress: Double? = null,
  val rawProgress: Double? = null,
  val unit: String = "",
  val decimals: Int = 0,
  val day: String? = null,
  val startedAtMs: Long? = null,
  val targetEndAtMs: Long? = null,
  val isDuration: Boolean = false
)

data class ShownCustomValue(
  val text: String,
  val detail: String?,
  val progress: Double?,
  val rawProgress: Double?,
  val shortUnitHint: String? = null
) {
  companion object {
    val MISSING = ShownCustomValue(
      text = "—",
      detail = null,
      progress = null,
      rawProgress = null,
      shortUnitHint = null
    )
  }
}

data class RingLayerSpec(
  val progress: Float,
  val colorArgb: Int
)

data class FastingLiveClock(
  val startedAtMs: Long,
  val targetEndAtMs: Long?,
  val format: String,
  val detailGoalSuffix: String? = null
)

data class CustomComplicationRenderSpec(
  val name: String,
  val shortText: String,
  val shortTitle: String?,
  val longText: String,
  val longTitle: String?,
  val progress: Float?,
  val rawProgress: Float?,
  val primaryColorArgb: Int,
  val rampColors: IntArray,
  val iconKey: String,
  val rings: List<RingLayerSpec>,
  val tapPageKey: String,
  val contentDescription: String,
  val validUntil: Instant?,
  val dailyRolloverAt: Instant? = null,
  val hasNonDailyItems: Boolean = false,
  val activeFastingStartedAtMs: Long? = null,
  val activeFastingTargetEndAtMs: Long? = null,
  val fastingLiveClock: FastingLiveClock? = null
)

object CustomComplicationCodec {
  private const val MAX_NAME_LEN = 24
  private const val MAX_EXTRAS = 2

  fun starterDefinitions(
    caloriesLeftName: String = "Calories left",
    macrosName: String = "Macros",
    weightName: String = "Weight",
    sleepScoreName: String = "Sleep score"
  ): List<CustomComplicationDefinition> = listOf(
    CustomComplicationDefinition(
      id = "starter-caloriesRemaining",
      name = caloriesLeftName,
      source = "caloriesRemaining",
      format = "value",
      gauge = false,
      color = "calories",
      icon = "flame.fill"
    ),
    CustomComplicationDefinition(
      id = "starter-macros",
      name = macrosName,
      source = "protein",
      format = "percent",
      gauge = true,
      color = "protein",
      icon = "fish.fill",
      extras = listOf(
        CustomComplicationItem(source = "carbs", format = "percent", color = "carbs", icon = "leaf.fill"),
        CustomComplicationItem(source = "fat", format = "percent", color = "fat", icon = "drop.fill")
      )
    ),
    CustomComplicationDefinition(
      id = "starter-weight",
      name = weightName,
      source = "weight",
      format = "value",
      gauge = false,
      color = "weight",
      icon = "scalemass.fill"
    ),
    CustomComplicationDefinition(
      id = "starter-sleepScore",
      name = sleepScoreName,
      source = "sleepScore",
      format = "percent",
      gauge = true,
      color = "sleep",
      icon = "moon.zzz.fill"
    )
  )

  fun parseConfig(json: JSONObject): CustomComplicationConfig? {
    val revision = json.optDouble("revision", Double.NaN).takeIf { !it.isNaN() && it.isFinite() }?.toLong()
      ?: return null
    val defsArr = json.optJSONArray("definitions") ?: return null
    val definitions = parseDefinitionsArray(defsArr)
    val builtIns = if (json.has("builtIns")) {
      parseBuiltInsArray(json.optJSONArray("builtIns"))
    } else {
      null
    }
    return CustomComplicationConfig(
      revision = revision,
      reload = json.optBoolean("reload", false),
      definitions = definitions,
      builtIns = builtIns
    )
  }

  fun parseDefinitionsArray(arr: JSONArray?): List<CustomComplicationDefinition> {
    if (arr == null) return emptyList()
    val out = mutableListOf<CustomComplicationDefinition>()
    for (i in 0 until arr.length()) {
      val row = arr.optJSONObject(i) ?: continue
      val id = row.optString("id").trim()
      val name = row.optString("name").trim().take(MAX_NAME_LEN)
      val source = row.optString("source").trim()
      if (id.isEmpty() || name.isEmpty() || source.isEmpty()) continue
      val extrasArr = row.optJSONArray("extras")
      val extras = mutableListOf<CustomComplicationItem>()
      if (extrasArr != null) {
        val seen = mutableSetOf(source)
        for (j in 0 until extrasArr.length()) {
          if (extras.size >= MAX_EXTRAS) break
          val ex = extrasArr.optJSONObject(j) ?: continue
          val exSource = ex.optString("source").trim()
          if (exSource.isEmpty() || !seen.add(exSource)) continue
          extras.add(
            CustomComplicationItem(
              source = exSource,
              format = ex.optString("format").ifBlank { "value" },
              color = ex.optString("color").ifBlank { "neutral" },
              icon = ex.optString("icon").ifBlank { "gauge.with.dots.needle.33percent" }
            )
          )
        }
      }
      out.add(
        CustomComplicationDefinition(
          id = id,
          name = name,
          source = source,
          format = row.optString("format").ifBlank { "value" },
          gauge = row.optBoolean("gauge", false),
          color = row.optString("color").ifBlank { "neutral" },
          icon = row.optString("icon").ifBlank { "gauge.with.dots.needle.33percent" },
          extras = extras
        )
      )
    }
    return out
  }

  fun serializeDefinitions(list: List<CustomComplicationDefinition>): String {
    val arr = JSONArray()
    for (def in list) {
      val extrasArr = JSONArray()
      for (ex in def.extras.take(MAX_EXTRAS)) {
        extrasArr.put(
          JSONObject().apply {
            put("source", ex.source)
            put("format", ex.format)
            put("color", ex.color)
            put("icon", ex.icon)
          }
        )
      }
      arr.put(
        JSONObject().apply {
          put("id", def.id)
          put("name", def.name)
          put("source", def.source)
          put("format", def.format)
          put("gauge", def.gauge)
          put("color", def.color)
          put("icon", def.icon)
          put("extras", extrasArr)
        }
      )
    }
    return arr.toString()
  }

  fun parseBuiltInsArray(arr: JSONArray?): List<BuiltInComplicationStyle> {
    if (arr == null) return emptyList()
    val out = mutableListOf<BuiltInComplicationStyle>()
    for (i in 0 until arr.length()) {
      val row = arr.optJSONObject(i) ?: continue
      val key = row.optString("key").trim()
      if (key.isEmpty()) continue
      val color = row.optString("color").trim().takeIf { it.isNotEmpty() }
      val icon = row.optString("icon").trim().takeIf { it.isNotEmpty() }
      if (color == null && icon == null) continue
      out.add(BuiltInComplicationStyle(key = key, color = color, icon = icon))
    }
    return out
  }

  fun serializeBuiltIns(list: List<BuiltInComplicationStyle>): String {
    val arr = JSONArray()
    for (style in list) {
      arr.put(
        JSONObject().apply {
          put("key", style.key)
          if (style.color != null) put("color", style.color)
          if (style.icon != null) put("icon", style.icon)
        }
      )
    }
    return arr.toString()
  }
}

object CustomComplicationEngine {
  private val NO_PROGRESS_SOURCES = setOf(
    "caloriesRemaining",
    "caloriesBurned",
    "weight",
    "bodyFat",
    "sleepDuration",
    "deepSleep",
    "remSleep",
    "lightSleep",
    "timeInBed",
    "restingHeartRate",
    "hrv",
    "spo2",
    "workouts"
  )

  private val NON_DAILY_SOURCES = setOf("weight", "bodyFat", "fasting")

  fun sourceHasProgress(source: String): Boolean = source !in NO_PROGRESS_SOURCES

  fun definitionSupportsProgress(definition: CustomComplicationDefinition): Boolean {
    val items = definition.allItems()
    return if (items.size > 1) {
      items.any { sourceHasProgress(it.source) }
    } else {
      definition.gauge && sourceHasProgress(definition.source)
    }
  }

  /**
   * Builds all custom complication metrics from the current watch context and live store overrides.
   * Mirrors `CustomComplicationMetrics.build(from:)` on Apple Watch.
   */
  fun buildMetrics(
    context: WatchContext,
    effectiveWaterMl: Double? = null,
    effectiveWaterDay: String? = null,
    liveSteps: StepsSnapshot? = null,
    useLiveFast: Boolean = false,
    liveFast: WatchFast? = null
  ): Map<String, CustomMetric> {
    val out = LinkedHashMap<String, CustomMetric>()
    val energy = EnergyDisplay.of(context)

    context.nutrition?.let { n ->
      val day = n.day
      val calGoal = (n.caloriesConsumed + n.caloriesRemaining).takeIf { it > 0.0 }
      val calRawProgress = calGoal?.let { max(0.0, n.caloriesConsumed / it) } ?: n.calorieProgress
      out["calories"] = CustomMetric(
        key = "calories",
        value = energy.value(n.caloriesConsumed),
        remaining = energy.value(n.caloriesRemaining),
        progress = n.calorieProgress.coerceIn(0.0, 1.0),
        rawProgress = calRawProgress,
        unit = energy.unit,
        day = day
      )
      out["caloriesRemaining"] = CustomMetric(
        key = "caloriesRemaining",
        value = energy.value(n.caloriesRemaining),
        unit = energy.unit,
        day = day
      )
      out["caloriesBurned"] = CustomMetric(
        key = "caloriesBurned",
        value = energy.value(n.caloriesBurned),
        unit = energy.unit,
        day = day
      )
      out["protein"] = macroMetric("protein", n.protein, day)
      out["carbs"] = macroMetric("carbs", n.carbs, day)
      out["fat"] = macroMetric("fat", n.fat, day)

      for (row in n.rows.orEmpty()) {
        val rowGoal = row.goal?.takeIf { it > 0.0 }
        val rowRaw = rowGoal?.let { max(0.0, row.consumed / it) }
        out["nutrient:${row.key}"] = CustomMetric(
          key = "nutrient:${row.key}",
          value = row.consumed,
          goal = rowGoal,
          progress = if (rowGoal != null) row.progress.coerceIn(0.0, 1.0) else null,
          rawProgress = rowRaw,
          unit = row.unit,
          decimals = if (row.consumed < 10.0) 1 else 0,
          day = day
        )
      }
    }

    val waterSnap = context.water
    val waterMl = effectiveWaterMl ?: waterSnap?.consumedMl
    val waterDay = if (effectiveWaterMl != null) {
      effectiveWaterDay ?: CheckInDate.today()
    } else {
      waterSnap?.day
    }
    if (waterMl != null && waterDay != null) {
      val unit = context.waterDisplayUnit ?: "ml"
      val shown = displayWater(waterMl, unit)
      val goalMl = context.waterGoalMl?.takeIf { it > 0.0 }
      val goalShown = goalMl?.let { displayWater(it, unit).value }
      val rawProgress = goalMl?.let { max(0.0, waterMl / it) }
      out["water"] = CustomMetric(
        key = "water",
        value = shown.value,
        goal = goalShown,
        progress = rawProgress?.coerceIn(0.0, 1.0),
        rawProgress = rawProgress,
        unit = shown.label,
        decimals = shown.decimals,
        day = waterDay
      )
    }

    val stepsSnap = liveSteps ?: context.steps
    if (stepsSnap != null) {
      val goal = (context.stepGoal ?: 10_000).toDouble()
      val rawProgress = if (goal > 0.0) max(0.0, stepsSnap.count.toDouble() / goal) else null
      out["steps"] = CustomMetric(
        key = "steps",
        value = stepsSnap.count.toDouble(),
        goal = goal.takeIf { it > 0.0 },
        progress = rawProgress?.coerceIn(0.0, 1.0),
        rawProgress = rawProgress,
        unit = "steps",
        day = stepsSnap.day
      )
    }

    val effectiveFast = if (useLiveFast) liveFast else context.fast
    if (context.fastSynced || effectiveFast != null) {
      out["fasting"] = CustomMetric(
        key = "fasting",
        value = 0.0,
        unit = "h",
        startedAtMs = effectiveFast?.startedAtMs,
        targetEndAtMs = effectiveFast?.targetEndAtMs
      )
    }

    context.sleep?.let { s ->
      val day = s.day
      out["sleepDuration"] = CustomMetric(
        key = "sleepDuration",
        value = s.totalSeconds.toDouble(),
        day = day,
        isDuration = true
      )
      if (s.timeInBedSeconds > 0) {
        out["timeInBed"] = CustomMetric(
          key = "timeInBed",
          value = s.timeInBedSeconds.toDouble(),
          day = day,
          isDuration = true
        )
      }
      s.sleepScore?.let { score ->
        val p = (score.toDouble() / 100.0).coerceIn(0.0, 1.0)
        out["sleepScore"] = CustomMetric(
          key = "sleepScore",
          value = score.toDouble(),
          progress = p,
          rawProgress = p,
          day = day
        )
      }
      s.deepSeconds?.let { sec ->
        out["deepSleep"] = CustomMetric(key = "deepSleep", value = sec.toDouble(), day = day, isDuration = true)
      }
      s.remSeconds?.let { sec ->
        out["remSleep"] = CustomMetric(key = "remSleep", value = sec.toDouble(), day = day, isDuration = true)
      }
      s.lightSeconds?.let { sec ->
        out["lightSleep"] = CustomMetric(key = "lightSleep", value = sec.toDouble(), day = day, isDuration = true)
      }
      s.restingHeartRate?.let { bpm ->
        out["restingHeartRate"] = CustomMetric(key = "restingHeartRate", value = bpm.toDouble(), unit = "bpm", day = day)
      }
      s.hrvMs?.let { ms ->
        out["hrv"] = CustomMetric(key = "hrv", value = ms.toDouble(), unit = "ms", day = day)
      }
      s.spo2?.let { pct ->
        out["spo2"] = CustomMetric(key = "spo2", value = pct.toDouble(), unit = "%", day = day)
      }
    }

    context.exerciseSummary?.let { ex ->
      val day = ex.day
      val minGoal = ex.minutesGoal.takeIf { it > 0 }?.toDouble()
      val minRaw = minGoal?.let { max(0.0, ex.minutes.toDouble() / it) }
      out["exerciseMinutes"] = CustomMetric(
        key = "exerciseMinutes",
        value = ex.minutes.toDouble(),
        goal = minGoal,
        progress = minRaw?.coerceIn(0.0, 1.0),
        rawProgress = minRaw,
        unit = "min",
        day = day
      )
      val calGoal = ex.caloriesGoal.takeIf { it > 0 }?.let { energy.value(it.toDouble()) }
      val calVal = energy.value(ex.calories.toDouble())
      val calRaw = calGoal?.let { max(0.0, calVal / it) }
      out["exerciseCalories"] = CustomMetric(
        key = "exerciseCalories",
        value = calVal,
        goal = calGoal,
        progress = calRaw?.coerceIn(0.0, 1.0),
        rawProgress = calRaw,
        unit = energy.unit,
        day = day
      )
      out["workouts"] = CustomMetric(
        key = "workouts",
        value = ex.sessionCount.toDouble(),
        day = day
      )
    }

    val weightKg = context.todayWeightKg ?: context.lastWeightKg
    if (weightKg != null) {
      val unit = context.effectiveWeightUnit
      out["weight"] = CustomMetric(
        key = "weight",
        value = unit.fromKg(weightKg),
        unit = unit.suffix,
        decimals = 1
      )
    }

    val bodyFat = context.todayBodyFatPercentage ?: context.lastBodyFatPercentage
    if (bodyFat != null) {
      out["bodyFat"] = CustomMetric(
        key = "bodyFat",
        value = bodyFat,
        unit = "%",
        decimals = 1
      )
    }

    return out
  }

  private fun macroMetric(key: String, macro: MacroGoal, day: String): CustomMetric {
    val goal = macro.goal.takeIf { it > 0.0 }
    val raw = goal?.let { max(0.0, macro.consumed / it) }
    return CustomMetric(
      key = key,
      value = macro.consumed,
      goal = goal,
      progress = if (goal != null) macro.progress.coerceIn(0.0, 1.0) else null,
      rawProgress = raw,
      unit = "g",
      day = day
    )
  }

  private data class DisplayWater(val value: Double, val label: String, val decimals: Int)

  private fun displayWater(ml: Double, unit: String): DisplayWater = when (unit.lowercase(Locale.US)) {
    "oz" -> DisplayWater(ml / 29.5735, "oz", 1)
    "liter", "l" -> DisplayWater(ml / 1000.0, "L", 2)
    else -> DisplayWater(ml, "ml", 0)
  }

  fun clockText(seconds: Double): String {
    val minutes = (max(0.0, seconds) / 60.0).toInt()
    return String.format(Locale.US, "%d:%02d", minutes / 60, minutes % 60)
  }

  fun formatNumber(value: Double, decimals: Int, locale: Locale = Locale.getDefault()): String {
    val nf = NumberFormat.getNumberInstance(locale).apply {
      minimumFractionDigits = decimals
      maximumFractionDigits = decimals
      isGroupingUsed = true
    }
    return nf.format(if (decimals == 0) value.roundToInt().toDouble() else value)
  }

  private fun formatCompactShortNumber(value: Double, decimals: Int, locale: Locale): String {
    val formatted = formatNumber(value, decimals, locale)
    if (formatted.length <= 7) return formatted
    val k = value / 1000.0
    return String.format(locale, "%.1fk", k)
  }

  fun percentText(progress: Double, locale: Locale = Locale.getDefault()): String {
    val rounded = (progress.coerceIn(0.0, 1.0) * 100.0).roundToInt() / 100.0
    return NumberFormat.getPercentInstance(locale).apply {
      minimumFractionDigits = 0
      maximumFractionDigits = 0
    }.format(rounded)
  }

  fun formatMetric(
    source: String,
    format: String,
    metric: CustomMetric?,
    nowMs: Long,
    today: String = CheckInDate.today(),
    locale: Locale = Locale.getDefault(),
    ofGoalFormat: (String) -> String = { "of $it" },
    leftUnitFormat: (String) -> String = { "$it left" },
    leftOnlyLabel: String = "left"
  ): ShownCustomValue {
    if (metric == null) return ShownCustomValue.MISSING
    if (metric.day != null && metric.day != today) return ShownCustomValue.MISSING

    if (source == "fasting") {
      val startedAtMs = metric.startedAtMs ?: return ShownCustomValue.MISSING
      val elapsedSec = max(0.0, (nowMs - startedAtMs) / 1000.0)
      var progress: Double? = null
      var rawProgress: Double? = null
      var remainingSec: Double? = null
      var totalSec: Double? = null
      val targetEndAtMs = metric.targetEndAtMs
      if (targetEndAtMs != null && targetEndAtMs > startedAtMs) {
        val span = (targetEndAtMs - startedAtMs) / 1000.0
        if (span > 0.0) {
          totalSec = span
          rawProgress = elapsedSec / span
          progress = min(1.0, rawProgress)
          remainingSec = max(0.0, span - elapsedSec)
        }
      }
      if (format == "percent" && progress != null) {
        return ShownCustomValue(
          text = percentText(progress, locale),
          detail = clockText(elapsedSec),
          progress = progress,
          rawProgress = rawProgress
        )
      }
      if (format == "remaining" && remainingSec != null) {
        return ShownCustomValue(
          text = clockText(remainingSec),
          detail = leftOnlyLabel,
          progress = progress,
          rawProgress = rawProgress,
          shortUnitHint = leftOnlyLabel
        )
      }
      return ShownCustomValue(
        text = clockText(elapsedSec),
        detail = totalSec?.let { ofGoalFormat(clockText(it)) },
        progress = progress,
        rawProgress = rawProgress
      )
    }

    val decimals = metric.decimals
    val unit = metric.unit
    if (format == "percent" && metric.progress != null) {
      val amount = amountText(metric.value, unit, decimals, locale)
      return ShownCustomValue(
        text = percentText(metric.progress, locale),
        detail = amount,
        progress = metric.progress,
        rawProgress = metric.rawProgress ?: metric.progress
      )
    }
    val remainingValue = metric.remaining ?: metric.goal?.let { it - metric.value }
    if (format == "remaining" && remainingValue != null) {
      val clamped = max(0.0, remainingValue)
      val detail = if (unit.isEmpty()) leftOnlyLabel else leftUnitFormat(unit)
      return ShownCustomValue(
        text = formatCompactShortNumber(clamped, decimals, locale),
        detail = detail,
        progress = metric.progress,
        rawProgress = metric.rawProgress ?: metric.progress,
        shortUnitHint = leftOnlyLabel
      )
    }
    val text = if (metric.isDuration) {
      clockText(metric.value)
    } else {
      formatCompactShortNumber(metric.value, decimals, locale)
    }
    val detail = metric.goal?.let { goal ->
      ofGoalFormat(amountText(goal, unit, decimals, locale))
    } ?: unit.takeIf { it.isNotEmpty() }
    return ShownCustomValue(
      text = text,
      detail = detail,
      progress = metric.progress,
      rawProgress = metric.rawProgress ?: metric.progress,
      shortUnitHint = unit.takeIf { it.isNotEmpty() && !metric.isDuration && it != "steps" }
    )
  }

  private fun amountText(value: Double, unit: String, decimals: Int, locale: Locale): String {
    val num = formatNumber(value, decimals, locale)
    return if (unit.isEmpty()) num else "$num $unit"
  }

  fun resolveTapPageKey(source: String): String = when (source) {
    "water" -> WatchPage.WATER.key
    "steps" -> WatchPage.STEPS.key
    "fasting" -> WatchPage.FASTING.key
    "weight", "bodyFat" -> WatchPage.ENTRY.key
    "sleepDuration", "sleepScore", "deepSleep", "remSleep", "lightSleep",
    "timeInBed", "restingHeartRate", "hrv", "spo2" -> "sleep"
    "exerciseMinutes", "exerciseCalories", "workouts" -> WatchPage.WORKOUT.key
    else -> WatchPage.GOALS.key
  }

  fun buildRenderSpec(
    definition: CustomComplicationDefinition,
    metrics: Map<String, CustomMetric>,
    nowMs: Long,
    today: String = CheckInDate.today(),
    locale: Locale = Locale.getDefault(),
    ofGoalFormat: (String) -> String = { "of $it" },
    leftUnitFormat: (String) -> String = { "$it left" },
    leftOnlyLabel: String = "left",
    preview: Boolean = false
  ): CustomComplicationRenderSpec {
    val items = definition.allItems()
    val several = items.size > 1

    val shownItems = items.map { item ->
      val metric = metrics[item.source]
      var shown = formatMetric(
        source = item.source,
        format = item.format,
        metric = metric,
        nowMs = nowMs,
        today = today,
        locale = locale,
        ofGoalFormat = ofGoalFormat,
        leftUnitFormat = leftUnitFormat,
        leftOnlyLabel = leftOnlyLabel
      )
      if (preview && shown.text == ShownCustomValue.MISSING.text) {
        shown = ShownCustomValue(
          text = "65%",
          detail = null,
          progress = 0.65,
          rawProgress = 0.65
        )
      }
      val showProgress = several || definition.gauge
      Triple(item, shown, if (showProgress) shown.progress else null)
    }

    val dailyRolloverAt = items.mapNotNull { item ->
      metrics[item.source]?.day?.takeIf { it == today }
    }
      .mapNotNull { ComplicationModels.endOfLocalDayInstant(it) }
      .minOrNull()
    val hasNonDailyItems = items.any { it.source in NON_DAILY_SOURCES }
    val validUntil = if (preview || hasNonDailyItems) null else dailyRolloverAt

    val fastingMetric = if (items.any { it.source == "fasting" }) metrics["fasting"] else null
    val activeFastStart = fastingMetric?.startedAtMs
    val activeFastTargetEnd = fastingMetric?.targetEndAtMs?.takeIf {
      activeFastStart != null && it > activeFastStart
    }

    val primaryColor = CustomComplicationPalette.colorArgb(definition.color)
    val tapPageKey = resolveTapPageKey(definition.source)

    if (!several) {
      val (_, shown, progress) = shownItems.first()
      val rawProgress = if (definition.gauge) shown.rawProgress else null
      val inlinePercentUnit = shown.text != ShownCustomValue.MISSING.text &&
        shown.shortUnitHint == "%" &&
        !shown.text.endsWith("%")
      val shortText = if (inlinePercentUnit) "${shown.text}%" else shown.text
      val shortTitle = when {
        shown.text == ShownCustomValue.MISSING.text -> null
        inlinePercentUnit -> null
        !shown.shortUnitHint.isNullOrBlank() -> shown.shortUnitHint
        else -> null
      }
      val longText = when {
        shown.detail == null || shown.text == ShownCustomValue.MISSING.text -> shown.text
        shown.detail == "%" -> if (shown.text.endsWith("%")) shown.text else "${shown.text}%"
        shown.detail == shown.shortUnitHint -> "${shown.text} ${shown.detail}"
        else -> "${shown.text} · ${shown.detail}"
      }
      val desc = "${definition.name} $longText"
      val liveClock = if (definition.source == "fasting" && activeFastStart != null && !preview) {
        val goalSuffix = if (definition.format == "value" && activeFastTargetEnd != null) {
          ofGoalFormat(clockText((activeFastTargetEnd - activeFastStart) / 1000.0))
        } else {
          null
        }
        FastingLiveClock(
          startedAtMs = activeFastStart,
          targetEndAtMs = activeFastTargetEnd,
          format = definition.format,
          detailGoalSuffix = goalSuffix
        )
      } else {
        null
      }
      return CustomComplicationRenderSpec(
        name = definition.name,
        shortText = shortText,
        shortTitle = shortTitle,
        longText = longText,
        longTitle = definition.name,
        progress = progress?.toFloat(),
        rawProgress = rawProgress?.toFloat(),
        primaryColorArgb = primaryColor,
        rampColors = intArrayOf(primaryColor),
        iconKey = definition.icon,
        rings = emptyList(),
        tapPageKey = tapPageKey,
        contentDescription = desc,
        validUntil = validUntil,
        dailyRolloverAt = if (preview) null else dailyRolloverAt,
        hasNonDailyItems = hasNonDailyItems,
        activeFastingStartedAtMs = if (preview) null else activeFastStart,
        activeFastingTargetEndAtMs = if (preview) null else activeFastTargetEnd,
        fastingLiveClock = liveClock
      )
    }

    // Multi-value (2–3 values)
    val ringSpecs = shownItems.mapNotNull { (item, _, progress) ->
      progress?.let {
        RingLayerSpec(
          progress = it.toFloat().coerceIn(0f, 1f),
          colorArgb = CustomComplicationPalette.colorArgb(item.color)
        )
      }
    }
    val joinedLong = shownItems.joinToString(" · ") { it.second.text }
    val firstText = shownItems.first().second.text
    val restCompact = shownItems.drop(1).joinToString("/") {
      it.second.text.replace(Regex("\\s*%$"), "")
    }
    val shortTitle = restCompact.takeIf { it.isNotBlank() && it.length <= 7 }
      ?: definition.name.take(7)
    val ramp = if (ringSpecs.isNotEmpty()) {
      ringSpecs.map { it.colorArgb }.toIntArray()
    } else {
      intArrayOf(primaryColor)
    }
    val primaryRingProgress = ringSpecs.firstOrNull()?.progress
    val firstRaw = shownItems.firstOrNull { it.third != null }?.second?.rawProgress?.toFloat()
    return CustomComplicationRenderSpec(
      name = definition.name,
      shortText = firstText,
      shortTitle = shortTitle,
      longText = joinedLong,
      longTitle = definition.name,
      progress = primaryRingProgress,
      rawProgress = firstRaw,
      primaryColorArgb = primaryColor,
      rampColors = ramp,
      iconKey = definition.icon,
      rings = ringSpecs,
      tapPageKey = tapPageKey,
      contentDescription = "${definition.name}: $joinedLong",
      validUntil = validUntil,
      dailyRolloverAt = if (preview) null else dailyRolloverAt,
      hasNonDailyItems = hasNonDailyItems,
      activeFastingStartedAtMs = if (preview) null else activeFastStart,
      activeFastingTargetEndAtMs = if (preview) null else activeFastTargetEnd
    )
  }
}

object CustomComplicationBitmaps {
  private const val ICON_PX = 96
  private const val RINGS_PX = 128

  fun tintedIconSmallImage(
    context: Context,
    @DrawableRes iconRes: Int,
    colorArgb: Int
  ): SmallImage? {
    val drawable = ContextCompat.getDrawable(context, iconRes)?.mutate() ?: return null
    val bitmap = Bitmap.createBitmap(ICON_PX, ICON_PX, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    drawable.colorFilter = PorterDuffColorFilter(colorArgb, PorterDuff.Mode.SRC_IN)
    drawable.setBounds(0, 0, ICON_PX, ICON_PX)
    drawable.draw(canvas)
    val ambientIcon = Icon.createWithResource(context, iconRes)
    return SmallImage.Builder(Icon.createWithBitmap(bitmap), SmallImageType.ICON)
      .setAmbientImage(ambientIcon)
      .build()
  }

  fun concentricRingsSmallImage(rings: List<RingLayerSpec>): SmallImage? {
    if (rings.isEmpty()) return null
    val activeBitmap = drawRingsBitmap(rings, monochrome = false)
    val ambientBitmap = drawRingsBitmap(rings, monochrome = true)
    return SmallImage.Builder(Icon.createWithBitmap(activeBitmap), SmallImageType.ICON)
      .setAmbientImage(Icon.createWithBitmap(ambientBitmap))
      .build()
  }

  private fun drawRingsBitmap(rings: List<RingLayerSpec>, monochrome: Boolean): Bitmap {
    val bitmap = Bitmap.createBitmap(RINGS_PX, RINGS_PX, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val side = RINGS_PX.toFloat()
    val stroke = side * 0.11f
    val step = stroke + side * 0.035f

    val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeWidth = stroke
      color = if (monochrome) 0x44FFFFFF else 0x3DFFFFFF
    }
    val arcPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeWidth = stroke
      strokeCap = Paint.Cap.ROUND
    }

    rings.take(3).forEachIndexed { index, ring ->
      val inset = stroke / 2f + step * index
      val rect = RectF(inset, inset, side - inset, side - inset)
      if (rect.width() <= stroke) return@forEachIndexed
      canvas.drawOval(rect, trackPaint)
      val sweep = (ring.progress.coerceIn(0f, 1f) * 360f).coerceAtLeast(if (ring.progress > 0f) 4f else 0f)
      if (sweep > 0f) {
        arcPaint.color = if (monochrome) 0xFFFFFFFF.toInt() else ring.colorArgb
        canvas.drawArc(rect, -90f, sweep, false, arcPaint)
      }
    }
    return bitmap
  }
}

class CustomComplicationStore(private val context: Context) {
  private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  private val _definitions = MutableStateFlow(loadDefinitions())
  val definitions: StateFlow<List<CustomComplicationDefinition>> = _definitions.asStateFlow()

  private val _builtInStyles = MutableStateFlow(loadBuiltInStyles())
  val builtInStyles: StateFlow<Map<String, BuiltInComplicationStyle>> = _builtInStyles.asStateFlow()

  fun defaultStarters(): List<CustomComplicationDefinition> = CustomComplicationCodec.starterDefinitions(
    caloriesLeftName = context.getString(R.string.complication_custom_starter_calories_left),
    macrosName = context.getString(R.string.complication_custom_starter_macros),
    weightName = context.getString(R.string.complication_custom_starter_weight),
    sleepScoreName = context.getString(R.string.complication_custom_starter_sleep_score)
  )

  fun loadDefinitions(): List<CustomComplicationDefinition> {
    val raw = prefs.getString(KEY_DEFINITIONS, null) ?: return defaultStarters()
    return try {
      CustomComplicationCodec.parseDefinitionsArray(JSONArray(raw))
    } catch (_: Throwable) {
      defaultStarters()
    }
  }

  private fun loadBuiltInStyles(): Map<String, BuiltInComplicationStyle> {
    val raw = prefs.getString(KEY_BUILT_IN_STYLES, null) ?: return emptyMap()
    return try {
      CustomComplicationCodec.parseBuiltInsArray(JSONArray(raw)).associateBy { it.key }
    } catch (_: Throwable) {
      emptyMap()
    }
  }

  fun builtInStyleFor(key: String): BuiltInComplicationStyle? = _builtInStyles.value[key]

  fun getAssignedDefinitionId(complicationInstanceId: Int): String? {
    if (complicationInstanceId < 0) return null
    return prefs.getString("$KEY_SLOT_PREFIX$complicationInstanceId", null)
  }

  fun setAssignedDefinitionId(complicationInstanceId: Int, definitionId: String) {
    if (complicationInstanceId < 0) return
    prefs.edit().putString("$KEY_SLOT_PREFIX$complicationInstanceId", definitionId).apply()
  }

  fun clearAssignedSlot(complicationInstanceId: Int) {
    if (complicationInstanceId < 0) return
    prefs.edit().remove("$KEY_SLOT_PREFIX$complicationInstanceId").apply()
  }

  fun applyConfigJson(json: JSONObject): Boolean {
    val config = CustomComplicationCodec.parseConfig(json) ?: return false
    val storedRevision = prefs.getLong(KEY_REVISION, 0L)
    if (config.revision < storedRevision) return false

    val prevDefs = _definitions.value
    val prevBuiltIns = _builtInStyles.value
    val newBuiltInsList = config.builtIns
    val newBuiltInsMap = newBuiltInsList?.associateBy { it.key } ?: prevBuiltIns

    val editor = prefs.edit()
      .putLong(KEY_REVISION, config.revision)
      .putString(KEY_DEFINITIONS, CustomComplicationCodec.serializeDefinitions(config.definitions))
    if (newBuiltInsList != null) {
      editor.putString(KEY_BUILT_IN_STYLES, CustomComplicationCodec.serializeBuiltIns(newBuiltInsList))
    }
    editor.apply()

    _definitions.value = config.definitions
    _builtInStyles.value = newBuiltInsMap

    val changed = config.reload || prevDefs != config.definitions || prevBuiltIns != newBuiltInsMap
    if (changed) {
      ComplicationUpdater.requestAll(context)
    }
    return true
  }

  companion object {
    private const val PREFS_NAME = "sparky_wear_custom_complications"
    private const val KEY_DEFINITIONS = "definitions_json"
    private const val KEY_BUILT_IN_STYLES = "built_in_styles_json"
    private const val KEY_REVISION = "revision"
    private const val KEY_SLOT_PREFIX = "slot_"
  }
}

open class CustomComplicationService : SuspendingTimelineComplicationDataSourceService() {
  override fun getPreviewData(type: ComplicationType): ComplicationData? {
    val requiresProgress = type == ComplicationType.RANGED_VALUE || type == ComplicationType.GOAL_PROGRESS
    val def = if (requiresProgress) {
      CustomComplicationDefinition(
        id = "preview-gauge",
        name = getString(R.string.complication_custom_starter_sleep_score),
        source = "sleepScore",
        format = "percent",
        gauge = true,
        color = "sleep",
        icon = "moon.zzz.fill"
      )
    } else {
      CustomComplicationDefinition(
        id = "preview-text",
        name = getString(R.string.complication_custom_starter_calories_left),
        source = "caloriesRemaining",
        format = "value",
        gauge = false,
        color = "calories",
        icon = "flame.fill"
      )
    }
    val previewContext = WatchContext(
      today = CheckInDate.today(),
      todayWeightKg = 72.5,
      weightUnit = WeightUnit.KG,
      nutrition = NutritionSnapshot(
        day = CheckInDate.today(),
        caloriesConsumed = 1240.0,
        caloriesBurned = 420.0,
        caloriesRemaining = 660.0,
        calorieProgress = 0.65,
        carbs = MacroGoal(140.0, 215.0, 0.65),
        fat = MacroGoal(45.0, 69.0, 0.65),
        protein = MacroGoal(98.0, 150.0, 0.65),
        rows = null
      ),
      sleep = SleepSnapshot(
        day = CheckInDate.today(),
        totalSeconds = 7 * 3600 + 42 * 60,
        timeInBedSeconds = 8 * 3600 + 5 * 60,
        sleepScore = 82
      )
    )
    val metrics = CustomComplicationEngine.buildMetrics(previewContext)
    val spec = CustomComplicationEngine.buildRenderSpec(
      definition = def,
      metrics = metrics,
      nowMs = System.currentTimeMillis(),
      ofGoalFormat = { getString(R.string.complication_custom_of_goal, it) },
      leftUnitFormat = { getString(R.string.complication_custom_left_unit, it) },
      leftOnlyLabel = getString(R.string.complication_unit_left),
      preview = true
    )
    return buildComplicationData(type, spec, tap = null)
  }

  override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationDataTimeline? {
    val session = WearSessionManager.getInstance(applicationContext)
    val checkInStore = session.checkInStore
    val customStore = session.customComplicationStore
    checkInStore.pruneStaleDayData()

    val defs = customStore.definitions.value
    val assignedId = customStore.getAssignedDefinitionId(request.complicationInstanceId)
    val requiresProgress = request.complicationType == ComplicationType.RANGED_VALUE ||
      request.complicationType == ComplicationType.GOAL_PROGRESS
    val definition = when {
      assignedId != null -> defs.firstOrNull { it.id == assignedId }
      requiresProgress -> defs.firstOrNull { CustomComplicationEngine.definitionSupportsProgress(it) }
      else -> defs.firstOrNull()
    }
    if (definition == null) {
      val emptySpec = CustomComplicationRenderSpec(
        name = getString(R.string.complication_custom_label),
        shortText = "—",
        shortTitle = null,
        longText = getString(R.string.complication_custom_unconfigured),
        longTitle = getString(R.string.complication_custom_label),
        progress = null,
        rawProgress = null,
        primaryColorArgb = CustomComplicationPalette.NEUTRAL,
        rampColors = intArrayOf(CustomComplicationPalette.NEUTRAL),
        iconKey = "gauge.with.dots.needle.33percent",
        rings = emptyList(),
        tapPageKey = WatchPage.GOALS.key,
        contentDescription = getString(R.string.complication_custom_unconfigured),
        validUntil = null,
        activeFastingStartedAtMs = null
      )
      val tap = ComplicationUpdater.tapPendingIntent(applicationContext, WatchPage.GOALS)
      val data = buildComplicationData(request.complicationType, emptySpec, tap) ?: return null
      return ComplicationDataTimeline(data, emptyList())
    }

    val today = CheckInDate.today()
    val metrics = CustomComplicationEngine.buildMetrics(
      context = checkInStore.watchContext.value,
      effectiveWaterMl = checkInStore.effectiveWaterMl.value.takeIf {
        checkInStore.water.value?.isToday == true || it > 0.0
      },
      effectiveWaterDay = today,
      liveSteps = checkInStore.steps.value,
      useLiveFast = true,
      liveFast = checkInStore.fast.value
    )
    val nowMs = System.currentTimeMillis()
    val tap = ComplicationUpdater.tapPageKeyPendingIntent(
      applicationContext,
      CustomComplicationEngine.resolveTapPageKey(definition.source),
      CUSTOM_TAP_REQUEST_CODE_BASE + (request.complicationInstanceId and 0x0FFF)
    )

    fun renderAt(atMs: Long, day: String = today): CustomComplicationRenderSpec =
      CustomComplicationEngine.buildRenderSpec(
        definition = definition,
        metrics = metrics,
        nowMs = atMs,
        today = day,
        ofGoalFormat = { getString(R.string.complication_custom_of_goal, it) },
        leftUnitFormat = { getString(R.string.complication_custom_left_unit, it) },
        leftOnlyLabel = getString(R.string.complication_unit_left)
      )

    val currentSpec = renderAt(nowMs, today)
    val currentData = buildComplicationData(request.complicationType, currentSpec, tap, nowMs)
      ?: return null

    val rolloverAt = currentSpec.dailyRolloverAt?.takeIf {
      currentSpec.hasNonDailyItems && it.toEpochMilli() > nowMs
    }
    val nextDayStr = rolloverAt?.let {
      runCatching { LocalDate.parse(today).plusDays(1).toString() }.getOrNull()
    }

    // If an active fast is shown, build a non-rewinding timeline (using time-dependent
    // text for single-value elapsed/remaining and keeping the final/post-rollover entry
    // as the timeline default so progress never jumps backward after entries expire).
    val startedAtMs = currentSpec.activeFastingStartedAtMs
    if (startedAtMs != null) {
      val rolloverMs = rolloverAt?.toEpochMilli()
      val endMs = listOfNotNull(nowMs + 15L * 60_000L, rolloverMs).minOrNull()
        ?: (nowMs + 15L * 60_000L)
      val needsMinuteProgressTicks = currentSpec.progress != null ||
        currentSpec.fastingLiveClock == null ||
        currentSpec.fastingLiveClock.format == "percent"
      val entries = mutableListOf<TimelineEntry>()
      var fallbackData = currentData

      if (needsMinuteProgressTicks) {
        val elapsedSec = max(0.0, (nowMs - startedAtMs) / 1000.0)
        var tickMs = startedAtMs + ((floor(elapsedSec / 60.0).toLong() + 1L) * 60_000L)
        var prevMs = nowMs
        var prevData = currentData
        while (tickMs < endMs) {
          entries.add(
            TimelineEntry(
              TimeInterval(Instant.ofEpochMilli(prevMs), Instant.ofEpochMilli(tickMs)),
              prevData
            )
          )
          val nextSpec = renderAt(tickMs, today)
          val nextData = buildComplicationData(request.complicationType, nextSpec, tap, tickMs)
            ?: break
          prevMs = tickMs
          prevData = nextData
          tickMs += 60_000L
        }
        val finalSpec = renderAt(endMs, today)
        val finalData = buildComplicationData(request.complicationType, finalSpec, tap, endMs)
          ?: prevData
        if (prevMs < endMs) {
          entries.add(
            TimelineEntry(
              TimeInterval(Instant.ofEpochMilli(prevMs), Instant.ofEpochMilli(endMs)),
              prevData
            )
          )
        }
        fallbackData = finalData
      } else {
        val targetEndMs = currentSpec.activeFastingTargetEndAtMs
        if (currentSpec.fastingLiveClock?.format == "remaining" && targetEndMs != null && targetEndMs > nowMs) {
          val transitionMs = if (rolloverMs != null) min(targetEndMs, rolloverMs) else targetEndMs
          val doneSpec = renderAt(transitionMs, if (rolloverMs != null && transitionMs >= rolloverMs && nextDayStr != null) nextDayStr else today)
          val doneData = buildComplicationData(request.complicationType, doneSpec, tap, transitionMs)
          if (doneData != null) {
            entries.add(
              TimelineEntry(
                TimeInterval(Instant.ofEpochMilli(nowMs), Instant.ofEpochMilli(transitionMs)),
                currentData
              )
            )
            val doneEnd = if (rolloverAt != null && transitionMs < rolloverAt.toEpochMilli()) {
              rolloverAt
            } else {
              Instant.ofEpochMilli(transitionMs + 365L * 86_400_000L)
            }
            if (rolloverAt == null || transitionMs < rolloverAt.toEpochMilli()) {
              entries.add(
                TimelineEntry(
                  TimeInterval(Instant.ofEpochMilli(transitionMs), doneEnd),
                  doneData
                )
              )
            }
            fallbackData = doneData
          }
        }
      }

      if (rolloverAt != null && nextDayStr != null) {
        val rolloverData = buildComplicationData(
          request.complicationType,
          renderAt(rolloverAt.toEpochMilli(), nextDayStr),
          tap,
          rolloverAt.toEpochMilli()
        )
        if (rolloverData != null) {
          if (needsMinuteProgressTicks && endMs < rolloverAt.toEpochMilli()) {
            entries.add(
              TimelineEntry(
                TimeInterval(Instant.ofEpochMilli(endMs), rolloverAt),
                fallbackData
              )
            )
          } else if (entries.isEmpty()) {
            entries.add(TimelineEntry(TimeInterval(Instant.ofEpochMilli(nowMs), rolloverAt), currentData))
          }
          entries.add(
            TimelineEntry(
              TimeInterval(rolloverAt, rolloverAt.plusSeconds(365L * 86_400L)),
              rolloverData
            )
          )
          fallbackData = rolloverData
        }
      }

      return ComplicationDataTimeline(fallbackData, entries)
    }

    // Mixed daily + non-daily slot (e.g., weight + steps): transition cleanly at midnight
    // so yesterday's daily values clear while non-daily values stay visible.
    if (rolloverAt != null && nextDayStr != null) {
      val rolloverData = buildComplicationData(
        request.complicationType,
        renderAt(rolloverAt.toEpochMilli(), nextDayStr),
        tap,
        rolloverAt.toEpochMilli()
      )
      if (rolloverData != null) {
        return ComplicationDataTimeline(
          defaultComplicationData = rolloverData,
          timelineEntries = listOf(
            TimelineEntry(TimeInterval(Instant.ofEpochMilli(nowMs), rolloverAt), currentData),
            TimelineEntry(
              TimeInterval(rolloverAt, rolloverAt.plusSeconds(365L * 86_400L)),
              rolloverData
            )
          )
        )
      }
    }

    return ComplicationDataTimeline(currentData, emptyList())
  }

  private fun buildFastingLiveTexts(
    clock: FastingLiveClock,
    nowMs: Long
  ): Pair<ComplicationText?, ComplicationText?> {
    return when (clock.format) {
      "value" -> {
        val shortLive = TimeDifferenceComplicationText.Builder(
          TimeDifferenceStyle.SHORT_DUAL_UNIT,
          CountUpTimeReference(Instant.ofEpochMilli(clock.startedAtMs))
        )
          .setDisplayAsNow(false)
          .setMinimumTimeUnit(TimeUnit.MINUTES)
          .build()
        val longLive = if (clock.detailGoalSuffix != null) {
          TimeDifferenceComplicationText.Builder(
            TimeDifferenceStyle.SHORT_DUAL_UNIT,
            CountUpTimeReference(Instant.ofEpochMilli(clock.startedAtMs))
          )
            .setText("^1 · ${clock.detailGoalSuffix}")
            .setDisplayAsNow(false)
            .setMinimumTimeUnit(TimeUnit.MINUTES)
            .build()
        } else {
          shortLive
        }
        shortLive to longLive
      }
      "remaining" -> {
        val targetMs = clock.targetEndAtMs?.takeIf { it > nowMs } ?: return null to null
        val shortLive = TimeDifferenceComplicationText.Builder(
          TimeDifferenceStyle.SHORT_DUAL_UNIT,
          CountDownTimeReference(Instant.ofEpochMilli(targetMs))
        )
          .setDisplayAsNow(false)
          .setMinimumTimeUnit(TimeUnit.MINUTES)
          .build()
        val longLive = TimeDifferenceComplicationText.Builder(
          TimeDifferenceStyle.SHORT_DUAL_UNIT,
          CountDownTimeReference(Instant.ofEpochMilli(targetMs))
        )
          .setText("^1 · ${getString(R.string.complication_unit_left)}")
          .setDisplayAsNow(false)
          .setMinimumTimeUnit(TimeUnit.MINUTES)
          .build()
        shortLive to longLive
      }
      else -> null to null
    }
  }

  private fun buildComplicationData(
    type: ComplicationType,
    spec: CustomComplicationRenderSpec,
    tap: PendingIntent?,
    nowMs: Long = System.currentTimeMillis()
  ): ComplicationData? {
    val iconRes = CustomComplicationIcons.drawableFor(spec.iconKey)
    val isGaugeSlot = type == ComplicationType.RANGED_VALUE || type == ComplicationType.GOAL_PROGRESS
    val hasMultiRings = spec.rings.size > 1
    val ringImage = if (hasMultiRings || (!isGaugeSlot && spec.rings.isNotEmpty())) {
      CustomComplicationBitmaps.concentricRingsSmallImage(spec.rings)
    } else {
      null
    }
    val monoIcon = if (ringImage != null) null else ComplicationUpdater.monoIcon(this, iconRes)
    val smallIcon = ringImage
      ?: CustomComplicationBitmaps.tintedIconSmallImage(this, iconRes, spec.primaryColorArgb)

    val (liveShortText, liveLongText) = spec.fastingLiveClock?.let {
      buildFastingLiveTexts(it, nowMs)
    } ?: (null to null)

    val shortText = liveShortText ?: PlainComplicationText.Builder(spec.shortText).build()
    val shortTitle = spec.shortTitle?.takeIf { it.isNotBlank() }?.let {
      PlainComplicationText.Builder(it).build()
    }
    val longText = liveLongText ?: PlainComplicationText.Builder(spec.longText).build()
    val longTitle = spec.longTitle?.takeIf { it.isNotBlank() }?.let {
      PlainComplicationText.Builder(it).build()
    }
    val desc = if (liveLongText != null && type == ComplicationType.LONG_TEXT) {
      liveLongText
    } else if (liveShortText != null && type != ComplicationType.LONG_TEXT) {
      liveShortText
    } else {
      PlainComplicationText.Builder(spec.contentDescription).build()
    }
    val timeRange = spec.validUntil?.let { TimeRange.before(it) }
    val singleRamp = if (!hasMultiRings) ColorRamp(spec.rampColors, false) else null

    return when (type) {
      ComplicationType.RANGED_VALUE -> {
        val progress = spec.progress ?: return NoDataComplicationData()
        val valuePct = (progress * 100f).coerceIn(0f, 100f)
        RangedValueComplicationData.Builder(
          value = valuePct,
          min = 0f,
          max = 100f,
          contentDescription = desc
        ).apply {
          setText(shortText)
          if (shortTitle != null) setTitle(shortTitle)
          if (monoIcon != null) setMonochromaticImage(monoIcon)
          if (smallIcon != null) setSmallImage(smallIcon)
          if (singleRamp != null) setColorRamp(singleRamp)
          setTapAction(tap)
          if (timeRange != null) setValidTimeRange(timeRange)
        }.build()
      }

      ComplicationType.GOAL_PROGRESS -> {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          val progress = spec.progress ?: return NoDataComplicationData()
          val rawPct = max(0f, (spec.rawProgress ?: progress) * 100f)
          GoalProgressComplicationData.Builder(
            value = rawPct,
            targetValue = 100f,
            contentDescription = desc
          ).apply {
            setText(shortText)
            if (shortTitle != null) setTitle(shortTitle)
            if (monoIcon != null) setMonochromaticImage(monoIcon)
            if (smallIcon != null) setSmallImage(smallIcon)
            if (singleRamp != null) setColorRamp(singleRamp)
            setTapAction(tap)
            if (timeRange != null) setValidTimeRange(timeRange)
          }.build()
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
          if (monoIcon != null) setMonochromaticImage(monoIcon)
          if (smallIcon != null) setSmallImage(smallIcon)
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
          if (monoIcon != null) setMonochromaticImage(monoIcon)
          if (smallIcon != null) setSmallImage(smallIcon)
          setTapAction(tap)
          if (timeRange != null) setValidTimeRange(timeRange)
        }.build()
      }

      ComplicationType.SMALL_IMAGE -> {
        val img = smallIcon ?: return null
        SmallImageComplicationData.Builder(
          smallImage = img,
          contentDescription = desc
        ).apply {
          setTapAction(tap)
          if (timeRange != null) setValidTimeRange(timeRange)
        }.build()
      }

      else -> null
    }
  }

  companion object {
    private const val CUSTOM_TAP_REQUEST_CODE_BASE = 2000
  }
}

/**
 * Dedicated `RANGED_VALUE` / `GOAL_PROGRESS` custom complication provider so hybrid watch-face
 * slots (such as Pixel Watch Explorer) can pick either a clean text/value custom complication
 * (`Sparky Custom`) or a native progress-ring custom complication (`Sparky Custom Gauge`).
 */
class CustomGaugeComplicationService : CustomComplicationService()

/**
 * Watch-face configuration picker launched when the wearer adds or edits a
 * "Sparky Custom" or "Sparky Custom Gauge" complication slot on Wear OS.
 */
class CustomComplicationConfigActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val session = WearSessionManager.getInstance(applicationContext)
    session.pullInitialDataItems()
    val complicationInstanceId = intent.getIntExtra(
      ComplicationDataSourceService.EXTRA_CONFIG_COMPLICATION_ID,
      -1
    )
    val rawSlotType = intent.getIntExtra(
      ComplicationDataSourceService.EXTRA_CONFIG_COMPLICATION_TYPE,
      -1
    )
    val requiresProgressSlot =
      rawSlotType == ComplicationType.RANGED_VALUE.toWireComplicationType() ||
        rawSlotType == ComplicationType.GOAL_PROGRESS.toWireComplicationType()
    val providerComponent = IntentCompat.getParcelableExtra(
      intent,
      EXTRA_CONFIG_PROVIDER_COMPONENT,
      ComponentName::class.java
    ) ?: ComponentName(
      applicationContext,
      if (requiresProgressSlot) {
        CustomGaugeComplicationService::class.java
      } else {
        CustomComplicationService::class.java
      }
    )
    val currentAssignedId = session.customComplicationStore
      .getAssignedDefinitionId(complicationInstanceId)

    setContent {
      MaterialTheme {
        CustomComplicationPickerScreen(
          session = session,
          selectedId = currentAssignedId,
          requiresProgressSlot = requiresProgressSlot,
          onSelect = { def ->
            if (complicationInstanceId >= 0) {
              session.customComplicationStore.setAssignedDefinitionId(
                complicationInstanceId,
                def.id
              )
              try {
                ComplicationDataSourceUpdateRequester.create(
                  applicationContext,
                  providerComponent
                ).requestUpdate(complicationInstanceId)
              } catch (_: Throwable) {}
            }
            setResult(Activity.RESULT_OK)
            finish()
          }
        )
      }
    }
  }
  companion object {
    private const val EXTRA_CONFIG_PROVIDER_COMPONENT =
      "android.support.wearable.complications.EXTRA_CONFIG_PROVIDER_COMPONENT"
  }
}

@Composable
private fun CustomComplicationPickerScreen(
  session: WearSessionManager,
  selectedId: String?,
  requiresProgressSlot: Boolean,
  onSelect: (CustomComplicationDefinition) -> Unit
) {
  val context = LocalContext.current
  val definitions by session.customComplicationStore.definitions.collectAsState()
  val watchContext by session.checkInStore.watchContext.collectAsState()
  val effectiveWaterMl by session.checkInStore.effectiveWaterMl.collectAsState()
  val liveSteps by session.checkInStore.steps.collectAsState()
  val liveFast by session.checkInStore.fast.collectAsState()
  val listState = rememberScalingLazyListState()

  val orderedDefinitions = if (requiresProgressSlot) {
    definitions.sortedByDescending { CustomComplicationEngine.definitionSupportsProgress(it) }
  } else {
    definitions
  }
  val today = CheckInDate.today()
  val metrics = CustomComplicationEngine.buildMetrics(
    context = watchContext,
    effectiveWaterMl = effectiveWaterMl.takeIf { watchContext.water?.isToday == true || it > 0.0 },
    effectiveWaterDay = today,
    liveSteps = liveSteps,
    useLiveFast = true,
    liveFast = liveFast
  )
  val nowMs = System.currentTimeMillis()
  val leftOnly = stringResource(R.string.complication_unit_left)
  val useSparkyCustomLabel = stringResource(R.string.complication_custom_picker_use_sparky_custom)
  val pickerTitle = stringResource(
    if (requiresProgressSlot) {
      R.string.complication_custom_gauge_picker_title
    } else {
      R.string.complication_custom_picker_title
    }
  )

  Scaffold(
    timeText = { TimeText() },
    positionIndicator = { PositionIndicator(scalingLazyListState = listState) }
  ) {
    Box(
      modifier = Modifier
        .fillMaxSize()
        .background(Color.Black)
    ) {
      if (orderedDefinitions.isEmpty()) {
        Box(
          modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp),
          contentAlignment = Alignment.Center
        ) {
          Text(
            text = stringResource(R.string.complication_custom_picker_empty),
            color = Color(0xFFB8B8C0),
            fontSize = 13.sp,
            textAlign = TextAlign.Center
          )
        }
      } else {
        ScalingLazyColumn(
          state = listState,
          contentPadding = PaddingValues(top = 28.dp, bottom = 36.dp, start = 10.dp, end = 10.dp),
          modifier = Modifier.fillMaxSize()
        ) {
          item {
            Text(
              text = pickerTitle,
              color = Color.White,
              fontSize = 14.sp,
              fontWeight = FontWeight.SemiBold,
              textAlign = TextAlign.Center,
              modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 8.dp)
            )
          }
          items(orderedDefinitions, key = { it.id }) { def ->
            val accentColor = Color(CustomComplicationPalette.colorArgb(def.color))
            val isSelected = def.id == selectedId
            val compatible = !requiresProgressSlot || CustomComplicationEngine.definitionSupportsProgress(def)
            val spec = CustomComplicationEngine.buildRenderSpec(
              definition = def,
              metrics = metrics,
              nowMs = nowMs,
              ofGoalFormat = { context.getString(R.string.complication_custom_of_goal, it) },
              leftUnitFormat = { context.getString(R.string.complication_custom_left_unit, it) },
              leftOnlyLabel = leftOnly
            )
            val subtitle = if (!compatible) {
              useSparkyCustomLabel
            } else {
              spec.longText.takeIf { it != ShownCustomValue.MISSING.text }
            }
            val chipModifier = if (isSelected) {
              Modifier
                .fillMaxWidth()
                .border(1.5.dp, accentColor, CircleShape)
            } else {
              Modifier.fillMaxWidth()
            }
            Chip(
              modifier = chipModifier,
              enabled = compatible,
              onClick = { onSelect(def) },
              colors = ChipDefaults.secondaryChipColors(
                backgroundColor = if (isSelected) Color(0xFF1F2A24) else Color(0xFF1C1C1E)
              ),
              icon = {
                Box(
                  modifier = Modifier
                    .size(28.dp)
                    .clip(CircleShape)
                    .background(Color(0xFF121214)),
                  contentAlignment = Alignment.Center
                ) {
                  WearIcon(
                    painter = painterResource(CustomComplicationIcons.drawableFor(def.icon)),
                    contentDescription = null,
                    tint = accentColor,
                    modifier = Modifier.size(18.dp)
                  )
                }
              },
              label = {
                Text(
                  text = def.name,
                  maxLines = 1,
                  overflow = TextOverflow.Ellipsis,
                  color = Color.White,
                  fontWeight = FontWeight.Medium
                )
              },
              secondaryLabel = subtitle?.let { text ->
                {
                  Text(
                    text = text,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    color = if (compatible) accentColor else Color(0xFF9A9AA2)
                  )
                }
              }
            )
          }
        }
      }
    }
  }
}
