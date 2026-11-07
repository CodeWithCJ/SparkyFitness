package com.sparkyapps.sparkyfitness.wear

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import androidx.annotation.DrawableRes
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.MonochromaticImage
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.RangedValueComplicationData
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService
import com.SparkyApps.SparkyFitnessMobile.R
import java.util.Locale
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

object ComplicationUpdater {
  fun requestAll(context: Context) {
    val appCtx = context.applicationContext
    val services = listOf(
      EnergyGoalComplicationService::class.java,
      ProteinGoalComplicationService::class.java,
      CarbsGoalComplicationService::class.java,
      FatGoalComplicationService::class.java,
      WaterGoalComplicationService::class.java,
      FastingComplicationService::class.java,
      StepsComplicationService::class.java
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
    val intent = Intent(context, MainActivity::class.java).apply {
      action = Intent.ACTION_VIEW
      putExtra("target_page", page.key)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    return PendingIntent.getActivity(
      context,
      page.ordinal,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  fun monoIcon(context: Context, @DrawableRes iconRes: Int): MonochromaticImage {
    return MonochromaticImage.Builder(Icon.createWithResource(context, iconRes)).build()
  }

  fun buildMacroData(
    context: Context,
    type: ComplicationType,
    @DrawableRes iconRes: Int,
    fullLabel: String,
    consumed: Float,
    goal: Float,
    tap: PendingIntent?
  ): ComplicationData? {
    val safeGoal = max(1f, goal)
    val pct = ((consumed / safeGoal) * 100f).toInt()
    val text = PlainComplicationText.Builder("${consumed.toInt()}g").build()
    val desc = PlainComplicationText.Builder("$fullLabel: ${consumed.toInt()} / ${safeGoal.toInt()}g ($pct%)").build()
    val image = monoIcon(context, iconRes)

    return when (type) {
      ComplicationType.RANGED_VALUE -> RangedValueComplicationData.Builder(
        value = min(consumed, safeGoal),
        min = 0f,
        max = safeGoal,
        contentDescription = desc
      ).setText(text).setMonochromaticImage(image).setTapAction(tap).build()

      ComplicationType.SHORT_TEXT -> ShortTextComplicationData.Builder(
        text = text,
        contentDescription = desc
      ).setMonochromaticImage(image).setTapAction(tap).build()

      else -> null
    }
  }
}

class EnergyGoalComplicationService : SuspendingComplicationDataSourceService() {
  override fun getPreviewData(type: ComplicationType): ComplicationData? {
    return buildData(type, consumed = 1450f, goal = 2000f, tap = null)
  }

  override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
    val store = WearSessionManager.getInstance(applicationContext).checkInStore
    val nutrition = store.nutrition.value
    val energy = EnergyDisplay.of(store.watchContext.value)
    val consumed = energy.value(nutrition?.caloriesConsumed ?: 0.0).toFloat()
    val goal = energy.value(
      max(1.0, (nutrition?.caloriesConsumed ?: 0.0) + (nutrition?.caloriesRemaining ?: 2000.0))
    ).toFloat()
    val tap = ComplicationUpdater.tapPendingIntent(applicationContext, WatchPage.GOALS)
    return buildData(request.complicationType, consumed, goal, tap, energy.unit)
  }

  private fun buildData(
    type: ComplicationType,
    consumed: Float,
    goal: Float,
    tap: PendingIntent?,
    energyUnit: String = "kcal"
  ): ComplicationData? {
    val pct = ((consumed / max(1f, goal)) * 100f).toInt()
    val text = PlainComplicationText.Builder("${consumed.toInt()}").build()
    val desc = PlainComplicationText.Builder("Energy: ${consumed.toInt()} / ${goal.toInt()} $energyUnit ($pct%)").build()
    val image = ComplicationUpdater.monoIcon(this, R.drawable.ic_complication_calories)

    return when (type) {
      ComplicationType.RANGED_VALUE -> RangedValueComplicationData.Builder(
        value = min(consumed, goal),
        min = 0f,
        max = max(1f, goal),
        contentDescription = desc
      ).setText(text).setMonochromaticImage(image).setTapAction(tap).build()

      ComplicationType.SHORT_TEXT -> ShortTextComplicationData.Builder(
        text = text,
        contentDescription = desc
      ).setMonochromaticImage(image).setTapAction(tap).build()

      else -> null
    }
  }
}

class ProteinGoalComplicationService : SuspendingComplicationDataSourceService() {
  override fun getPreviewData(type: ComplicationType): ComplicationData? {
    return ComplicationUpdater.buildMacroData(this, type, R.drawable.ic_complication_protein, "Protein", 120f, 160f, null)
  }

  override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
    val store = WearSessionManager.getInstance(applicationContext).checkInStore
    val p = store.nutrition.value?.protein
    val consumed = (p?.consumed ?: 0.0).toFloat()
    val goal = max(1.0, p?.goal ?: 150.0).toFloat()
    val tap = ComplicationUpdater.tapPendingIntent(applicationContext, WatchPage.GOALS)
    return ComplicationUpdater.buildMacroData(this, request.complicationType, R.drawable.ic_complication_protein, "Protein", consumed, goal, tap)
  }
}

class CarbsGoalComplicationService : SuspendingComplicationDataSourceService() {
  override fun getPreviewData(type: ComplicationType): ComplicationData? {
    return ComplicationUpdater.buildMacroData(this, type, R.drawable.ic_complication_carbs, "Carbs", 160f, 220f, null)
  }

  override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
    val store = WearSessionManager.getInstance(applicationContext).checkInStore
    val c = store.nutrition.value?.carbs
    val consumed = (c?.consumed ?: 0.0).toFloat()
    val goal = max(1.0, c?.goal ?: 200.0).toFloat()
    val tap = ComplicationUpdater.tapPendingIntent(applicationContext, WatchPage.GOALS)
    return ComplicationUpdater.buildMacroData(this, request.complicationType, R.drawable.ic_complication_carbs, "Carbs", consumed, goal, tap)
  }
}

class FatGoalComplicationService : SuspendingComplicationDataSourceService() {
  override fun getPreviewData(type: ComplicationType): ComplicationData? {
    return ComplicationUpdater.buildMacroData(this, type, R.drawable.ic_complication_fat, "Fat", 48f, 70f, null)
  }

  override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
    val store = WearSessionManager.getInstance(applicationContext).checkInStore
    val f = store.nutrition.value?.fat
    val consumed = (f?.consumed ?: 0.0).toFloat()
    val goal = max(1.0, f?.goal ?: 65.0).toFloat()
    val tap = ComplicationUpdater.tapPendingIntent(applicationContext, WatchPage.GOALS)
    return ComplicationUpdater.buildMacroData(this, request.complicationType, R.drawable.ic_complication_fat, "Fat", consumed, goal, tap)
  }
}

class WaterGoalComplicationService : SuspendingComplicationDataSourceService() {
  override fun getPreviewData(type: ComplicationType): ComplicationData? {
    return buildData(type, consumed = 1500f, goal = 2500f, unit = "ml", tap = null)
  }

  override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
    val store = WearSessionManager.getInstance(applicationContext).checkInStore
    val consumed = store.effectiveWaterMl.value.toFloat()
    val goal = max(1.0, store.waterGoalMl.value).toFloat()
    val unit = store.waterDisplayUnit.value
    val tap = ComplicationUpdater.tapPendingIntent(applicationContext, WatchPage.WATER)
    return buildData(request.complicationType, consumed, goal, unit, tap)
  }

  private fun buildData(
    type: ComplicationType,
    consumed: Float,
    goal: Float,
    unit: String,
    tap: PendingIntent?
  ): ComplicationData? {
    val displayValue = when (unit.lowercase(Locale.US)) {
      "oz" -> "${(consumed / 29.5735f).roundToInt()}oz"
      "liter", "l" -> String.format(Locale.US, "%.1fL", consumed / 1000f)
      else -> "${consumed.toInt()}"
    }
    val text = PlainComplicationText.Builder(displayValue).build()
    val desc = PlainComplicationText.Builder("Water: $displayValue").build()
    val image = ComplicationUpdater.monoIcon(this, R.drawable.ic_complication_water)

    return when (type) {
      ComplicationType.RANGED_VALUE -> RangedValueComplicationData.Builder(
        value = min(consumed, goal),
        min = 0f,
        max = max(1f, goal),
        contentDescription = desc
      ).setText(text).setMonochromaticImage(image).setTapAction(tap).build()

      ComplicationType.SHORT_TEXT -> ShortTextComplicationData.Builder(
        text = text,
        contentDescription = desc
      ).setMonochromaticImage(image).setTapAction(tap).build()

      else -> null
    }
  }
}

class FastingComplicationService : SuspendingComplicationDataSourceService() {
  override fun getPreviewData(type: ComplicationType): ComplicationData? {
    return buildData(type, elapsedHours = 12.5f, goalHours = 16f, isActive = true, tap = null)
  }

  override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
    val store = WearSessionManager.getInstance(applicationContext).checkInStore
    val fast = store.fast.value
    val nowMs = System.currentTimeMillis()
    val isActive = fast != null
    val goalHours = if (fast != null && fast.targetEndAtMs != null && fast.targetEndAtMs > fast.startedAtMs) {
      ((fast.targetEndAtMs - fast.startedAtMs) / 3600_000.0).toFloat()
    } else 16f
    val elapsedHours = if (fast != null) {
      max(0.0, (nowMs - fast.startedAtMs) / 3600_000.0).toFloat()
    } else 0f
    val tap = ComplicationUpdater.tapPendingIntent(applicationContext, WatchPage.FASTING)
    return buildData(request.complicationType, elapsedHours, max(1f, goalHours), isActive, tap)
  }

  private fun buildData(
    type: ComplicationType,
    elapsedHours: Float,
    goalHours: Float,
    isActive: Boolean,
    tap: PendingIntent?
  ): ComplicationData? {
    val label = if (isActive) String.format(Locale.US, "%.1fh", elapsedHours) else "Idle"
    val text = PlainComplicationText.Builder(label).build()
    val desc = PlainComplicationText.Builder("Fasting: $label / ${goalHours.toInt()}h").build()
    val image = ComplicationUpdater.monoIcon(this, R.drawable.ic_complication_fasting)

    return when (type) {
      ComplicationType.RANGED_VALUE -> RangedValueComplicationData.Builder(
        value = min(elapsedHours, goalHours),
        min = 0f,
        max = max(1f, goalHours),
        contentDescription = desc
      ).setText(text).setMonochromaticImage(image).setTapAction(tap).build()

      ComplicationType.SHORT_TEXT -> ShortTextComplicationData.Builder(
        text = text,
        contentDescription = desc
      ).setMonochromaticImage(image).setTapAction(tap).build()

      else -> null
    }
  }
}

class StepsComplicationService : SuspendingComplicationDataSourceService() {
  override fun getPreviewData(type: ComplicationType): ComplicationData? {
    return buildData(type, today = 6420f, goal = 10000f, tap = null)
  }

  override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
    val store = WearSessionManager.getInstance(applicationContext).checkInStore
    val steps = store.steps.value
    val today = (steps?.count ?: 0).toFloat()
    val goal = max(1, store.stepGoal.value).toFloat()
    val tap = ComplicationUpdater.tapPendingIntent(applicationContext, WatchPage.STEPS)
    return buildData(request.complicationType, today, goal, tap)
  }

  private fun buildData(
    type: ComplicationType,
    today: Float,
    goal: Float,
    tap: PendingIntent?
  ): ComplicationData? {
    val shortStr = if (today >= 1000f) String.format(Locale.US, "%.1fk", today / 1000f) else "${today.toInt()}"
    val text = PlainComplicationText.Builder(shortStr).build()
    val desc = PlainComplicationText.Builder("Steps: ${today.toInt()} / ${goal.toInt()}").build()
    val image = ComplicationUpdater.monoIcon(this, R.drawable.ic_complication_steps)

    return when (type) {
      ComplicationType.RANGED_VALUE -> RangedValueComplicationData.Builder(
        value = min(today, goal),
        min = 0f,
        max = max(1f, goal),
        contentDescription = desc
      ).setText(text).setMonochromaticImage(image).setTapAction(tap).build()

      ComplicationType.SHORT_TEXT -> ShortTextComplicationData.Builder(
        text = text,
        contentDescription = desc
      ).setMonochromaticImage(image).setTapAction(tap).build()

      else -> null
    }
  }
}
