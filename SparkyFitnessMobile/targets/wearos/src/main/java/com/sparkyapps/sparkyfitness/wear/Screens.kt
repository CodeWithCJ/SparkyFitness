package com.sparkyapps.sparkyfitness.wear

import android.content.Context
import android.media.AudioManager
import android.os.SystemClock
import android.view.KeyEvent
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.ScalingLazyListState
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.Text
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

object SparkyColors {
  val Green = Color(0xFF22C55E)
  val Cyan = Color(0xFF38BDF8)
  val Amber = Color(0xFFF59E0B)
  val Purple = Color(0xFFA855F7)
  val Rose = Color(0xFFF43F5E)
  val Blue = Color(0xFF3B82F6)
  val CardBg = Color(0xFF1E293B)
  val Muted = Color(0xFF94A3B8)
}

@Composable
fun Modifier.wearRotaryScroll(
  listState: ScalingLazyListState,
  isCurrentPage: Boolean = true
): Modifier {
  val focusRequester = remember { FocusRequester() }
  val scope = rememberCoroutineScope()

  LaunchedEffect(isCurrentPage) {
    if (isCurrentPage) {
      try {
        focusRequester.requestFocus()
      } catch (_: Throwable) {}
    }
  }

  return this
    .onRotaryScrollEvent { event ->
      scope.launch {
        listState.scrollBy(event.verticalScrollPixels)
      }
      true
    }
    .focusRequester(focusRequester)
    .focusable()
}

@Composable
fun Modifier.wearRotaryStepper(
  isCurrentPage: Boolean = true,
  pixelsPerStep: Float = 24f,
  onStep: (Int) -> Unit
): Modifier {
  val focusRequester = remember { FocusRequester() }
  var accumulator by remember { mutableFloatStateOf(0f) }

  LaunchedEffect(isCurrentPage) {
    if (isCurrentPage) {
      accumulator = 0f
      try {
        focusRequester.requestFocus()
      } catch (_: Throwable) {}
    }
  }

  return this
    .onRotaryScrollEvent { event ->
      accumulator += event.verticalScrollPixels
      val steps = (accumulator / pixelsPerStep).toInt()
      if (steps != 0) {
        accumulator -= steps * pixelsPerStep
        onStep(steps)
      }
      true
    }
    .focusRequester(focusRequester)
    .focusable()
}

@Composable
fun GoalsSummaryPage(store: CheckInStore, isCurrentPage: Boolean = true) {
  val nutrition by store.nutrition.collectAsState()
  val listState = rememberScalingLazyListState()

  ScalingLazyColumn(
    state = listState,
    autoCentering = null,
    modifier = Modifier
      .fillMaxSize()
      .wearRotaryScroll(listState, isCurrentPage),
    contentPadding = PaddingValues(start = 14.dp, end = 14.dp, top = 28.dp, bottom = 32.dp),
    horizontalAlignment = Alignment.CenterHorizontally
  ) {
    item {
      Text(
        text = "Today's Goals",
        fontSize = 13.sp,
        fontWeight = FontWeight.SemiBold,
        color = SparkyColors.Green,
        modifier = Modifier.padding(bottom = 6.dp)
      )
    }

    val snap = nutrition
    if (snap == null) {
      item {
        EmptyStateCard("Open SparkyFitness on your phone to sync today's nutrition goals.")
      }
    } else {
      val consumedInt = snap.caloriesConsumed.roundToInt()
      val remainingInt = snap.caloriesRemaining.roundToInt()
      val goalInt = max(1, consumedInt + remainingInt)
      val progress = (snap.calorieProgress.toFloat()).coerceIn(0f, 1f)
      item {
        Column(
          horizontalAlignment = Alignment.CenterHorizontally,
          modifier = Modifier.padding(bottom = 8.dp)
        ) {
          Box(contentAlignment = Alignment.Center, modifier = Modifier.size(94.dp)) {
            CircularProgressIndicator(
              progress = progress,
              modifier = Modifier.fillMaxSize(),
              indicatorColor = SparkyColors.Green,
              trackColor = Color.White.copy(alpha = 0.12f),
              strokeWidth = 7.dp
            )
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
              Text(
                text = "$consumedInt",
                fontSize = 19.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
              )
              Text(
                text = "/ $goalInt kcal",
                fontSize = 10.sp,
                color = SparkyColors.Muted
              )
            }
          }
          Spacer(Modifier.height(6.dp))
          Text(
            text = if (remainingInt >= 0) "$remainingInt kcal left" else "${abs(remainingInt)} kcal over",
            fontSize = 11.sp,
            color = if (remainingInt >= 0) SparkyColors.Muted else SparkyColors.Amber
          )
        }
      }

      val customRows = snap.rows
      if (customRows != null) {
        items(customRows, key = { it.key }) { row ->
          MacroBarRow(
            label = row.label,
            consumed = row.consumed.roundToInt(),
            goal = row.goal?.roundToInt(),
            unit = row.unit,
            color = nutrientColor(row.key)
          )
        }
      } else {
        item {
          MacroBarRow("Protein", snap.protein.consumed.roundToInt(), snap.protein.goal.roundToInt(), "g", SparkyColors.Cyan)
        }
        item {
          MacroBarRow("Carbs", snap.carbs.consumed.roundToInt(), snap.carbs.goal.roundToInt(), "g", SparkyColors.Amber)
        }
        item {
          MacroBarRow("Fat", snap.fat.consumed.roundToInt(), snap.fat.goal.roundToInt(), "g", SparkyColors.Rose)
        }
      }
    }
  }
}

internal fun nutrientColor(key: String): Color = when (key.lowercase(Locale.US)) {
  "protein" -> SparkyColors.Cyan
  "carbs", "carbohydrates" -> SparkyColors.Amber
  "fat" -> SparkyColors.Rose
  "dietary_fiber", "fiber" -> SparkyColors.Green
  "sugars", "sugar" -> SparkyColors.Purple
  else -> SparkyColors.Blue
}

@Composable
private fun MacroBarRow(label: String, consumed: Int, goal: Int?, unit: String, color: Color) {
  val hasGoal = goal != null && goal > 0
  val pct = if (hasGoal) (consumed.toFloat() / max(1, goal!!).toFloat()).coerceIn(0f, 1f) else 0f
  Column(
    modifier = Modifier
      .fillMaxWidth()
      .padding(vertical = 3.dp)
      .clip(RoundedCornerShape(10.dp))
      .background(SparkyColors.CardBg)
      .padding(horizontal = 10.dp, vertical = 6.dp)
  ) {
    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.SpaceBetween
    ) {
      Text(label, fontSize = 11.sp, fontWeight = FontWeight.Medium, color = Color.White)
      Text(
        text = if (hasGoal) "$consumed / ${goal}$unit" else "$consumed$unit",
        fontSize = 11.sp,
        color = SparkyColors.Muted
      )
    }
    if (hasGoal) {
      Spacer(Modifier.height(4.dp))
      Box(
        modifier = Modifier
          .fillMaxWidth()
          .height(5.dp)
          .clip(RoundedCornerShape(3.dp))
          .background(Color.White.copy(alpha = 0.12f))
      ) {
        Box(
          modifier = Modifier
            .fillMaxWidth(pct)
            .height(5.dp)
            .clip(RoundedCornerShape(3.dp))
            .background(color)
        )
      }
    }
  }
}

@Composable
fun WaterPage(store: CheckInStore, isCurrentPage: Boolean = true) {
  val water by store.water.collectAsState()
  val consumedMl by store.effectiveWaterMl.collectAsState()
  val queuedMl by store.queuedWaterMl.collectAsState()
  val logEntries by store.waterLogEntries.collectAsState()
  val waterSyncState by store.waterSyncState.collectAsState()
  val containers by store.waterContainers.collectAsState()
  val goalMl by store.waterGoalMl.collectAsState()
  val watchCtx by store.watchContext.collectAsState()
  val listState = rememberScalingLazyListState()
  var showLogSheet by remember { mutableStateOf(false) }

  if (showLogSheet) {
    WaterLogView(
      entries = logEntries,
      watchCtx = watchCtx,
      onDelete = { entry -> store.deleteWaterEntry(entry) },
      onClose = { showLogSheet = false }
    )
    return
  }

  val snap = water
  val effectiveContainers = containers.ifEmpty {
    listOf(
      WaterContainer(id = 1, name = "Glass", servingVolumeMl = 250.0, unit = "ml"),
      WaterContainer(id = 2, name = "Bottle", servingVolumeMl = 500.0, unit = "ml")
    )
  }

  ScalingLazyColumn(
    state = listState,
    autoCentering = null,
    modifier = Modifier
      .fillMaxSize()
      .wearRotaryScroll(listState, isCurrentPage),
    contentPadding = PaddingValues(start = 14.dp, end = 14.dp, top = 28.dp, bottom = 32.dp),
    horizontalAlignment = Alignment.CenterHorizontally
  ) {
    item {
      Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier.padding(bottom = 6.dp)
      ) {
        Text(
          text = "Hydration",
          fontSize = 13.sp,
          fontWeight = FontWeight.SemiBold,
          color = SparkyColors.Cyan
        )
        val badgeText = when (waterSyncState) {
          SyncState.QUEUED -> "↻"
          SyncState.FAILED -> "!"
          SyncState.SAVED -> null
        }
        if (badgeText != null) {
          Text(
            text = badgeText,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            color = if (waterSyncState == SyncState.FAILED) SparkyColors.Rose else SparkyColors.Amber
          )
        }
      }
    }

    val progress = (consumedMl.toFloat() / max(1.0, goalMl).toFloat()).coerceIn(0f, 1f)

    item {
      Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.padding(bottom = 8.dp)
      ) {
        Box(
          contentAlignment = Alignment.Center,
          modifier = Modifier.size(90.dp)
        ) {
          CircularProgressIndicator(
            progress = progress,
            modifier = Modifier.fillMaxSize(),
            indicatorColor = SparkyColors.Cyan,
            trackColor = Color.White.copy(alpha = 0.12f),
            strokeWidth = 7.dp
          )
          Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
              text = watchCtx.formattedWater(consumedMl),
              fontSize = 15.sp,
              fontWeight = FontWeight.Bold,
              color = Color.White
            )
            Text(
              text = "/ ${watchCtx.formattedWater(goalMl)}",
              fontSize = 10.sp,
              color = SparkyColors.Muted
            )
          }
        }

        val fromFoodMl = snap?.fromFoodMl
        if (fromFoodMl != null && fromFoodMl > 0.5) {
          Spacer(Modifier.height(3.dp))
          Text(
            text = "Includes ${watchCtx.formattedWater(fromFoodMl)} from food",
            fontSize = 9.sp,
            color = SparkyColors.Muted
          )
        }

        if (waterSyncState == SyncState.FAILED) {
          Spacer(Modifier.height(3.dp))
          Text(
            text = "Sync failed • Tap to retry",
            fontSize = 10.sp,
            color = SparkyColors.Rose,
            modifier = Modifier.clickable { store.retryFailedWaterTaps() }
          )
        } else if (queuedMl > 0.5) {
          Spacer(Modifier.height(3.dp))
          Text(
            text = "+${watchCtx.formattedWater(queuedMl)} syncing…",
            fontSize = 9.sp,
            color = SparkyColors.Amber
          )
        }
      }
    }

    items(effectiveContainers, key = { it.id }) { container ->
      Row(
        modifier = Modifier
          .fillMaxWidth()
          .padding(vertical = 2.dp)
          .clip(RoundedCornerShape(10.dp))
          .background(SparkyColors.CardBg)
          .clickable { store.tapWaterContainer(container) }
          .padding(horizontal = 10.dp, vertical = 7.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
      ) {
        Text(
          text = container.name,
          fontSize = 12.sp,
          fontWeight = FontWeight.SemiBold,
          color = Color.White,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis,
          modifier = Modifier.weight(1f)
        )
        Text(
          text = "+${container.displayVolume}",
          fontSize = 11.sp,
          fontWeight = FontWeight.Bold,
          color = SparkyColors.Cyan
        )
      }
    }

    if (logEntries.isNotEmpty()) {
      item {
        Row(
          modifier = Modifier.padding(top = 6.dp),
          horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
          SmallPillButton(
            label = "Log (${logEntries.size})",
            color = SparkyColors.CardBg,
            textColor = SparkyColors.Cyan,
            onClick = { showLogSheet = true }
          )
          SmallPillButton(
            label = "Undo Last",
            color = SparkyColors.CardBg,
            textColor = SparkyColors.Muted,
            onClick = { store.deleteLastWaterEntry() }
          )
        }
      }
    }
  }
}

@Composable
private fun WaterLogView(
  entries: List<WaterLogEntry>,
  watchCtx: WatchContext,
  onDelete: (WaterLogEntry) -> Unit,
  onClose: () -> Unit
) {
  var confirmEntry by remember { mutableStateOf<WaterLogEntry?>(null) }
  val listState = rememberScalingLazyListState()

  val pendingDelete = confirmEntry
  if (pendingDelete != null) {
    Column(
      modifier = Modifier
        .fillMaxSize()
        .background(Color.Black)
        .padding(14.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.Center
    ) {
      Text("Remove Drink?", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White)
      Spacer(Modifier.height(4.dp))
      Text(
        text = "${pendingDelete.name} (${watchCtx.formattedWater(pendingDelete.volumeMl)})",
        fontSize = 11.sp,
        color = SparkyColors.Cyan,
        textAlign = TextAlign.Center
      )
      Spacer(Modifier.height(10.dp))
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        SmallPillButton("No", SparkyColors.CardBg, SparkyColors.Muted) {
          confirmEntry = null
        }
        SmallPillButton("Yes", SparkyColors.Rose, Color.White) {
          onDelete(pendingDelete)
          confirmEntry = null
        }
      }
    }
    return
  }

  ScalingLazyColumn(
    state = listState,
    autoCentering = null,
    modifier = Modifier
      .fillMaxSize()
      .background(Color.Black)
      .wearRotaryScroll(listState, isCurrentPage = true),
    contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 28.dp, bottom = 32.dp),
    horizontalAlignment = Alignment.CenterHorizontally
  ) {
    item {
      Text(
        text = "Today's Drinks",
        fontSize = 12.sp,
        fontWeight = FontWeight.Bold,
        color = SparkyColors.Cyan,
        modifier = Modifier.padding(bottom = 4.dp)
      )
    }
    item {
      SmallPillButton("Done", SparkyColors.CardBg, Color.White, onClose)
    }
    if (entries.isEmpty()) {
      item {
        EmptyStateCard("No drinks logged today.")
      }
    } else {
      items(entries.reversed(), key = { it.id }) { entry ->
        Row(
          modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(SparkyColors.CardBg)
            .clickable { confirmEntry = entry }
            .padding(horizontal = 10.dp, vertical = 7.dp),
          horizontalArrangement = Arrangement.SpaceBetween,
          verticalAlignment = Alignment.CenterVertically
        ) {
          Column(modifier = Modifier.weight(1f)) {
            Text(
              text = entry.name,
              fontSize = 11.sp,
              fontWeight = FontWeight.SemiBold,
              color = Color.White,
              maxLines = 1,
              overflow = TextOverflow.Ellipsis
            )
            Text(
              text = entry.time,
              fontSize = 9.sp,
              color = SparkyColors.Muted
            )
          }
          Text(
            text = "${watchCtx.formattedWater(entry.volumeMl)} ✕",
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
            color = SparkyColors.Rose
          )
        }
      }
    }
  }
}

@Composable
fun MedicationListPage(store: CheckInStore, isCurrentPage: Boolean = true) {
  val medSnap by store.medications.collectAsState()
  val doses = medSnap?.doses.orEmpty()
  val listState = rememberScalingLazyListState()

  ScalingLazyColumn(
    state = listState,
    autoCentering = null,
    modifier = Modifier
      .fillMaxSize()
      .wearRotaryScroll(listState, isCurrentPage),
    contentPadding = PaddingValues(start = 14.dp, end = 14.dp, top = 28.dp, bottom = 32.dp),
    horizontalAlignment = Alignment.CenterHorizontally
  ) {
    item {
      val taken = doses.count { it.status == MedicationDoseStatus.TAKEN }
      Text(
        text = if (doses.isEmpty()) "Medications" else "Meds ($taken/${doses.size})",
        fontSize = 13.sp,
        fontWeight = FontWeight.SemiBold,
        color = SparkyColors.Purple,
        modifier = Modifier.padding(bottom = 6.dp)
      )
    }

    if (doses.isEmpty()) {
      item {
        EmptyStateCard("No medications scheduled for today.")
      }
    } else {
      items(doses, key = { it.id }) { dose ->
        val isTaken = dose.status == MedicationDoseStatus.TAKEN
        Row(
          modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (isTaken) SparkyColors.Green.copy(alpha = 0.18f) else SparkyColors.CardBg)
            .clickable { store.toggleMedication(dose) }
            .padding(horizontal = 10.dp, vertical = 8.dp),
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.SpaceBetween
        ) {
          Column(modifier = Modifier.weight(1f)) {
            Text(
              text = dose.name,
              fontSize = 13.sp,
              fontWeight = FontWeight.SemiBold,
              color = Color.White,
              maxLines = 1,
              overflow = TextOverflow.Ellipsis
            )
            val sub = listOfNotNull(dose.detail.takeIf { it.isNotBlank() }, dose.time.takeIf { it.isNotBlank() })
              .joinToString(" • ")
            if (sub.isNotEmpty()) {
              Text(text = sub, fontSize = 10.sp, color = SparkyColors.Muted, maxLines = 1)
            }
          }
          Spacer(Modifier.width(6.dp))
          Box(
            modifier = Modifier
              .size(22.dp)
              .clip(CircleShape)
              .background(if (isTaken) SparkyColors.Green else Color.White.copy(alpha = 0.14f)),
            contentAlignment = Alignment.Center
          ) {
            Text(
              text = if (isTaken) "✓" else "○",
              fontSize = 12.sp,
              fontWeight = FontWeight.Bold,
              color = if (isTaken) Color.Black else SparkyColors.Muted
            )
          }
        }
      }
    }
  }
}

@Composable
fun WeightEntryPage(store: CheckInStore, isCurrentPage: Boolean = true) {
  val draftWeight by store.draftWeight.collectAsState()
  val draftBodyFat by store.draftBodyFat.collectAsState()
  val hasBodyFatSeed by store.hasBodyFatSeed.collectAsState()
  val unit by store.unit.collectAsState()
  val history by store.history.collectAsState()
  val syncState by store.syncState.collectAsState()

  var showFirstRun by remember { mutableStateOf(false) }
  var editingBodyFat by remember { mutableStateOf(false) }
  var showKeypadFor by remember { mutableStateOf<String?>(null) } // "weight" | "bodyfat"

  if (showKeypadFor != null) {
    val mode = showKeypadFor!!
    WatchKeypadSheet(
      title = if (mode == "weight") "Weight (${unit.suffix})" else "Body Fat %",
      initialValue = if (mode == "weight") draftWeight else draftBodyFat,
      allowDecimal = true,
      onConfirm = { v ->
        if (mode == "weight") store.setDraftWeight(v) else store.setDraftBodyFat(v)
        showKeypadFor = null
      },
      onCancel = { showKeypadFor = null }
    )
    return
  }

  if (showFirstRun) {
    FirstRunWeightOverlay(
      initialUnit = unit,
      onApply = { weightVal, selectedUnit ->
        store.applyStartingWeight(weightVal, selectedUnit)
        showFirstRun = false
      },
      onCancel = { showFirstRun = false }
    )
    return
  }

  if (editingBodyFat) {
    Column(
      modifier = Modifier
        .fillMaxSize()
        .wearRotaryStepper(isCurrentPage = isCurrentPage) { steps ->
          store.nudgeBodyFat(steps)
          Haptics.click()
        }
        .padding(horizontal = 12.dp, vertical = 14.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.Center
    ) {
      Text(
        text = "Body Fat %",
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        color = SparkyColors.Cyan
      )
      Spacer(Modifier.height(4.dp))
      Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
      ) {
        RoundStepperButton("−") {
          store.nudgeBodyFat(-1)
          Haptics.click()
        }
        Column(
          horizontalAlignment = Alignment.CenterHorizontally,
          modifier = Modifier.clickable { showKeypadFor = "bodyfat" }
        ) {
          Text(
            text = String.format(Locale.US, "%.1f%%", draftBodyFat),
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White
          )
          Text(
            text = "TAP TO TYPE",
            fontSize = 8.sp,
            color = SparkyColors.Muted
          )
        }
        RoundStepperButton("+") {
          store.nudgeBodyFat(1)
          Haptics.click()
        }
      }
      Spacer(Modifier.height(8.dp))
      Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        SmallPillButton("Skip", SparkyColors.CardBg, SparkyColors.Muted) {
          editingBodyFat = false
          store.saveWeight(includeBodyFat = false)
        }
        SmallPillButton("Save", SparkyColors.Green, Color.Black) {
          editingBodyFat = false
          store.saveWeight(includeBodyFat = true)
        }
      }
    }
    return
  }

  val delta = store.deltaFromLatest
  val implausible = store.isWeightDeltaImplausible
  val deltaText = when {
    history.isEmpty() -> "No prior weight"
    delta == null || abs(delta) < 0.05 -> "Same as last"
    delta > 0 -> String.format(Locale.US, "+%.1f %s", delta, unit.suffix)
    else -> String.format(Locale.US, "%.1f %s", delta, unit.suffix)
  }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .wearRotaryStepper(isCurrentPage = isCurrentPage) { steps ->
        store.nudge(steps)
        Haptics.click()
      }
      .padding(horizontal = 12.dp, vertical = 12.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center
  ) {
    Text(
      text = "Weight Check-In",
      fontSize = 12.sp,
      fontWeight = FontWeight.SemiBold,
      color = SparkyColors.Green
    )
    Spacer(Modifier.height(3.dp))

    Row(
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
      RoundStepperButton("−") {
        store.nudge(-1)
        Haptics.click()
      }
      Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.clickable { showKeypadFor = "weight" }
      ) {
        Text(
          text = String.format(Locale.US, "%.1f", draftWeight),
          fontSize = 25.sp,
          fontWeight = FontWeight.Bold,
          color = Color.White
        )
        Text(
          text = unit.suffix.uppercase(),
          fontSize = 9.sp,
          color = SparkyColors.Muted
        )
      }
      RoundStepperButton("+") {
        store.nudge(1)
        Haptics.click()
      }
    }

    Spacer(Modifier.height(3.dp))
    Text(
      text = if (implausible && delta != null) "⚠ $deltaText" else deltaText,
      fontSize = 10.sp,
      color = if (implausible) SparkyColors.Amber else SparkyColors.Muted
    )
    Spacer(Modifier.height(5.dp))

    Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
      if (history.isEmpty()) {
        SmallPillButton("Set Start", SparkyColors.CardBg, SparkyColors.Muted) {
          showFirstRun = true
        }
      } else {
        SmallPillButton(
          label = if (hasBodyFatSeed) String.format(Locale.US, "BF %.1f%%", draftBodyFat) else "+BF%",
          color = SparkyColors.CardBg,
          textColor = SparkyColors.Cyan,
          onClick = { editingBodyFat = true }
        )
      }
      val saveLabel = when {
        syncState == SyncState.QUEUED -> "Queued ✓"
        syncState == SyncState.FAILED -> "Retry"
        implausible && delta != null -> {
          val sign = if (delta > 0) "+" else ""
          String.format(Locale.US, "Save %s%.1f", sign, delta)
        }
        else -> "Save"
      }
      SmallPillButton(
        label = saveLabel,
        color = if (implausible) SparkyColors.Amber else SparkyColors.Green,
        textColor = Color.Black,
        onClick = { store.saveWeight() }
      )
    }
  }
}

@Composable
fun WatchKeypadSheet(
  title: String,
  initialValue: Double,
  allowDecimal: Boolean,
  onConfirm: (Double) -> Unit,
  onCancel: () -> Unit
) {
  var text by remember {
    mutableStateOf(
      if (allowDecimal) String.format(Locale.US, "%.1f", initialValue).removeSuffix(".0")
      else "${initialValue.roundToInt()}"
    )
  }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(Color.Black)
      .padding(horizontal = 10.dp, vertical = 8.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.SpaceBetween
  ) {
    Text(title, fontSize = 10.sp, color = SparkyColors.Muted, maxLines = 1)
    Row(
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
      Text(
        text = text.ifEmpty { "0" },
        fontSize = 18.sp,
        fontWeight = FontWeight.Bold,
        color = Color.White
      )
      Box(
        modifier = Modifier
          .clip(RoundedCornerShape(6.dp))
          .background(SparkyColors.CardBg)
          .clickable {
            if (text.isNotEmpty()) text = text.dropLast(1)
            Haptics.click()
          }
          .padding(horizontal = 6.dp, vertical = 2.dp)
      ) {
        Text("⌫", fontSize = 11.sp, color = SparkyColors.Muted)
      }
    }

    val rows = listOf(
      listOf("1", "2", "3"),
      listOf("4", "5", "6"),
      listOf("7", "8", "9"),
      listOf(if (allowDecimal) "." else "C", "0", "✓")
    )
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
      for (row in rows) {
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
          for (key in row) {
            Box(
              modifier = Modifier
                .width(38.dp)
                .height(22.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(if (key == "✓") SparkyColors.Green else SparkyColors.CardBg)
                .clickable {
                  Haptics.click()
                  when (key) {
                    "✓" -> {
                      val parsed = text.toDoubleOrNull()
                      if (parsed != null && parsed > 0) onConfirm(parsed) else onCancel()
                    }
                    "C" -> text = ""
                    "." -> if (!text.contains(".")) text += "."
                    else -> if (text.length < 6) text += key
                  }
                },
              contentAlignment = Alignment.Center
            ) {
              Text(
                text = key,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = if (key == "✓") Color.Black else Color.White
              )
            }
          }
        }
      }
    }

    Text(
      text = "Cancel",
      fontSize = 10.sp,
      color = SparkyColors.Muted,
      modifier = Modifier.clickable { onCancel() }
    )
  }
}

@Composable
private fun FirstRunWeightOverlay(
  initialUnit: WeightUnit,
  onApply: (Double, WeightUnit) -> Unit,
  onCancel: () -> Unit
) {
  var unit by remember { mutableStateOf(initialUnit) }
  var value by remember { mutableDoubleStateOf(if (initialUnit == WeightUnit.KG) 75.0 else 165.0) }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(Color.Black)
      .wearRotaryStepper(isCurrentPage = true) { steps ->
        value = (value + steps * 1.0).coerceIn(20.0, 500.0)
        Haptics.click()
      }
      .padding(12.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center
  ) {
    Text("Starting Weight", fontSize = 12.sp, color = SparkyColors.Green)
    Spacer(Modifier.height(4.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
      WeightUnit.entries.forEach { u ->
        SmallPillButton(
          label = u.suffix.uppercase(),
          color = if (unit == u) SparkyColors.Green else SparkyColors.CardBg,
          textColor = if (unit == u) Color.Black else Color.White,
          onClick = {
            if (unit != u) {
              value = if (u == WeightUnit.LBS) (value * 2.2).roundToInt().toDouble() else (value / 2.2).roundToInt().toDouble()
              unit = u
            }
          }
        )
      }
    }
    Spacer(Modifier.height(6.dp))
    Row(
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
      RoundStepperButton("-5") { value = max(20.0, value - 5.0) }
      Text(String.format(Locale.US, "%.0f", value), fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color.White)
      RoundStepperButton("+5") { value = min(500.0, value + 5.0) }
    }
    Spacer(Modifier.height(8.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
      SmallPillButton("Cancel", SparkyColors.CardBg, SparkyColors.Muted, onCancel)
      SmallPillButton("Done", SparkyColors.Green, Color.Black) { onApply(value, unit) }
    }
  }
}

@Composable
fun TrendChartPage(store: CheckInStore, isCurrentPage: Boolean = true) {
  val history by store.history.collectAsState()
  val unit by store.unit.collectAsState()
  var showBodyFat by remember { mutableStateOf(false) }

  val bfPoints = remember(history) { history.filter { it.bodyFatPercentage != null }.takeLast(14) }
  val canShowBf = bfPoints.size >= 2

  Column(
    modifier = Modifier
      .fillMaxSize()
      .wearRotaryStepper(isCurrentPage = isCurrentPage, pixelsPerStep = 40f) { _ ->
        if (canShowBf) {
          showBodyFat = !showBodyFat
          Haptics.click()
        }
      }
      .padding(horizontal = 14.dp, vertical = 22.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center
  ) {
    Row(
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(6.dp),
      modifier = Modifier
        .padding(bottom = 6.dp)
        .clickable(enabled = canShowBf) {
          showBodyFat = !showBodyFat
          Haptics.click()
        }
    ) {
      Text(
        text = if (showBodyFat && canShowBf) "Body Fat Trend" else "Weight Trend",
        fontSize = 13.sp,
        fontWeight = FontWeight.SemiBold,
        color = if (showBodyFat && canShowBf) SparkyColors.Cyan else SparkyColors.Green
      )
      if (canShowBf) {
        Text(
          text = "⇅",
          fontSize = 11.sp,
          color = SparkyColors.Muted
        )
      }
    }

    if (showBodyFat && canShowBf) {
      val values = bfPoints.map { it.bodyFatPercentage ?: 0.0 }
      val minVal = values.minOrNull() ?: 0.0
      val maxVal = values.maxOrNull() ?: 1.0
      val span = max(0.5, maxVal - minVal)
      val totalDelta = values.last() - values.first()

      Canvas(
        modifier = Modifier
          .fillMaxWidth()
          .height(68.dp)
          .clip(RoundedCornerShape(10.dp))
          .background(SparkyColors.CardBg)
          .padding(8.dp)
      ) {
        val w = size.width
        val h = size.height
        val path = Path()
        values.forEachIndexed { idx, v ->
          val x = if (values.size <= 1) w / 2f else (idx.toFloat() / (values.size - 1).toFloat()) * w
          val y = h - (((v - minVal) / span).toFloat() * h)
          if (idx == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        drawPath(
          path = path,
          color = SparkyColors.Cyan,
          style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round)
        )
        values.forEachIndexed { idx, v ->
          val x = if (values.size <= 1) w / 2f else (idx.toFloat() / (values.size - 1).toFloat()) * w
          val y = h - (((v - minVal) / span).toFloat() * h)
          drawCircle(
            color = Color.White,
            radius = if (idx == values.lastIndex) 4.dp.toPx() else 2.dp.toPx(),
            center = Offset(x, y)
          )
        }
      }

      Spacer(Modifier.height(6.dp))
      val sign = if (totalDelta > 0) "+" else ""
      Text(
        text = String.format(
          Locale.US,
          "Last %d: %s%.1f%% (%.1f–%.1f%%)",
          values.size,
          sign,
          totalDelta,
          minVal,
          maxVal
        ),
        fontSize = 10.sp,
        color = SparkyColors.Muted,
        textAlign = TextAlign.Center
      )
    } else if (history.size < 2) {
      EmptyStateCard("Log at least 2 weight check-ins to see your trend chart.")
    } else {
      val samples = history.takeLast(14)
      val values = samples.map { unit.fromKg(it.weightKg) }
      val rolling = store.rollingMean(samples, window = 7)
      val minVal = values.minOrNull() ?: 0.0
      val maxVal = values.maxOrNull() ?: 1.0
      val span = max(0.5, maxVal - minVal)
      val totalDelta = values.last() - values.first()

      Canvas(
        modifier = Modifier
          .fillMaxWidth()
          .height(68.dp)
          .clip(RoundedCornerShape(10.dp))
          .background(SparkyColors.CardBg)
          .padding(8.dp)
      ) {
        val w = size.width
        val h = size.height

        if (rolling.size >= 2) {
          val meanPath = Path()
          rolling.forEachIndexed { idx, (_, mv) ->
            val x = (idx.toFloat() / (values.size - 1).toFloat()) * w
            val y = h - (((mv - minVal) / span).toFloat() * h)
            if (idx == 0) meanPath.moveTo(x, y) else meanPath.lineTo(x, y)
          }
          drawPath(
            path = meanPath,
            color = SparkyColors.Cyan.copy(alpha = 0.55f),
            style = Stroke(width = 1.75.dp.toPx(), cap = StrokeCap.Round)
          )
        }

        val path = Path()
        values.forEachIndexed { idx, v ->
          val x = if (values.size <= 1) w / 2f else (idx.toFloat() / (values.size - 1).toFloat()) * w
          val y = h - (((v - minVal) / span).toFloat() * h)
          if (idx == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        drawPath(
          path = path,
          color = SparkyColors.Green,
          style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round)
        )
        samples.forEachIndexed { idx, pt ->
          val v = values[idx]
          val x = if (values.size <= 1) w / 2f else (idx.toFloat() / (values.size - 1).toFloat()) * w
          val y = h - (((v - minVal) / span).toFloat() * h)
          val unconfirmed = store.isDayUnconfirmed(pt.day)
          if (unconfirmed) {
            drawCircle(
              color = SparkyColors.Amber,
              radius = 4.dp.toPx(),
              center = Offset(x, y),
              style = Stroke(width = 1.5.dp.toPx())
            )
          } else {
            drawCircle(
              color = Color.White,
              radius = if (idx == values.lastIndex) 4.dp.toPx() else 2.dp.toPx(),
              center = Offset(x, y)
            )
          }
        }
      }

      Spacer(Modifier.height(6.dp))
      val sign = if (totalDelta > 0) "+" else ""
      Text(
        text = String.format(
          Locale.US,
          "Last %d: %s%.1f %s (%.1f–%.1f)",
          values.size,
          sign,
          totalDelta,
          unit.suffix,
          minVal,
          maxVal
        ),
        fontSize = 10.sp,
        color = SparkyColors.Muted,
        textAlign = TextAlign.Center
      )
    }
  }
}

@Composable
fun NowPlayingPage(isCurrentPage: Boolean = true) {
  val context = LocalContext.current
  val audioManager = remember(context) {
    context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
  }

  fun sendMediaKey(keyCode: Int) {
    val am = audioManager ?: return
    try {
      val now = SystemClock.uptimeMillis()
      am.dispatchMediaKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_DOWN, keyCode, 0))
      am.dispatchMediaKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_UP, keyCode, 0))
      Haptics.click()
    } catch (_: Throwable) {}
  }

  fun adjustVolume(direction: Int) {
    val am = audioManager ?: return
    try {
      am.adjustStreamVolume(
        AudioManager.STREAM_MUSIC,
        if (direction > 0) AudioManager.ADJUST_RAISE else AudioManager.ADJUST_LOWER,
        AudioManager.FLAG_SHOW_UI
      )
      Haptics.click()
    } catch (_: Throwable) {}
  }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .wearRotaryStepper(isCurrentPage = isCurrentPage, pixelsPerStep = 28f) { steps ->
        if (steps > 0) adjustVolume(1) else if (steps < 0) adjustVolume(-1)
      }
      .padding(horizontal = 14.dp, vertical = 18.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center
  ) {
    Text(
      text = "Now Playing",
      fontSize = 13.sp,
      fontWeight = FontWeight.SemiBold,
      color = SparkyColors.Cyan
    )
    Spacer(Modifier.height(10.dp))
    Row(
      horizontalArrangement = Arrangement.spacedBy(10.dp),
      verticalAlignment = Alignment.CenterVertically
    ) {
      RoundStepperButton("⏮") { sendMediaKey(KeyEvent.KEYCODE_MEDIA_PREVIOUS) }
      Box(
        modifier = Modifier
          .size(44.dp)
          .clip(CircleShape)
          .background(SparkyColors.Cyan)
          .clickable { sendMediaKey(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) },
        contentAlignment = Alignment.Center
      ) {
        Text("⏯", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Color.Black)
      }
      RoundStepperButton("⏭") { sendMediaKey(KeyEvent.KEYCODE_MEDIA_NEXT) }
    }
    Spacer(Modifier.height(10.dp))
    Row(
      horizontalArrangement = Arrangement.spacedBy(8.dp),
      verticalAlignment = Alignment.CenterVertically
    ) {
      SmallPillButton("Vol −", SparkyColors.CardBg, Color.White) { adjustVolume(-1) }
      SmallPillButton("Vol +", SparkyColors.CardBg, Color.White) { adjustVolume(1) }
    }
  }
}

@Composable
fun FastingPage(store: CheckInStore, isCurrentPage: Boolean = true) {
  val fast by store.fast.collectAsState()
  var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
  val listState = rememberScalingLazyListState()

  LaunchedEffect(Unit) {
    while (true) {
      delay(1000)
      nowMs = System.currentTimeMillis()
    }
  }

  val activeFast = fast

  ScalingLazyColumn(
    state = listState,
    autoCentering = null,
    modifier = Modifier
      .fillMaxSize()
      .wearRotaryScroll(listState, isCurrentPage),
    contentPadding = PaddingValues(start = 14.dp, end = 14.dp, top = 28.dp, bottom = 32.dp),
    horizontalAlignment = Alignment.CenterHorizontally
  ) {
    item {
      Text(
        text = if (activeFast != null) "Fasting (${activeFast.label ?: "16:8"})" else "Fasting",
        fontSize = 13.sp,
        fontWeight = FontWeight.SemiBold,
        color = SparkyColors.Amber,
        modifier = Modifier.padding(bottom = 6.dp)
      )
    }

    if (activeFast != null) {
      val elapsedSec = max(0, ((nowMs - activeFast.startedAtMs) / 1000L).toInt())
      val goalSec = if (activeFast.targetEndAtMs != null && activeFast.targetEndAtMs > activeFast.startedAtMs) {
        ((activeFast.targetEndAtMs - activeFast.startedAtMs) / 1000L).toInt()
      } else 16 * 3600
      val progress = (elapsedSec.toFloat() / max(1, goalSec).toFloat()).coerceIn(0f, 1f)
      val hrs = elapsedSec / 3600
      val mins = (elapsedSec % 3600) / 60

      item {
        Box(
          contentAlignment = Alignment.Center,
          modifier = Modifier
            .padding(bottom = 8.dp)
            .size(90.dp)
        ) {
          CircularProgressIndicator(
            progress = progress,
            modifier = Modifier.fillMaxSize(),
            indicatorColor = SparkyColors.Amber,
            trackColor = Color.White.copy(alpha = 0.12f),
            strokeWidth = 7.dp
          )
          Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
              text = String.format(Locale.US, "%dh %02dm", hrs, mins),
              fontSize = 15.sp,
              fontWeight = FontWeight.Bold,
              color = Color.White
            )
            Text(
              text = "${(progress * 100).toInt()}% of ${goalSec / 3600}h",
              fontSize = 10.sp,
              color = SparkyColors.Muted
            )
          }
        }
      }

      item {
        SmallPillButton(
          label = "End Fast",
          color = SparkyColors.Rose,
          textColor = Color.White,
          onClick = { store.endFast() }
        )
      }
    } else {
      item {
        Text(
          text = "Start a Fast",
          fontSize = 11.sp,
          color = SparkyColors.Muted,
          modifier = Modifier.padding(bottom = 6.dp)
        )
      }
      val presets = listOf(
        "16:8" to 16.0,
        "18:6" to 18.0,
        "20:4" to 20.0,
        "OMAD" to 23.0
      )
      items(presets) { (label, hours) ->
        Row(
          modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(SparkyColors.CardBg)
            .clickable { store.startFast(label, hours) }
            .padding(horizontal = 12.dp, vertical = 8.dp),
          horizontalArrangement = Arrangement.SpaceBetween,
          verticalAlignment = Alignment.CenterVertically
        ) {
          Text(label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
          Text("${hours.toInt()}h", fontSize = 11.sp, color = SparkyColors.Amber)
        }
      }
    }
  }
}

@Composable
fun StepsPage(store: CheckInStore, isCurrentPage: Boolean = true) {
  val steps by store.steps.collectAsState()
  val stepGoal by store.stepGoal.collectAsState()
  val today = steps?.count ?: 0
  val goal = max(1, stepGoal)
  val progress = (today.toFloat() / goal.toFloat()).coerceIn(0f, 1f)
  val remaining = max(0, goal - today)
  val listState = rememberScalingLazyListState()

  ScalingLazyColumn(
    state = listState,
    autoCentering = null,
    modifier = Modifier
      .fillMaxSize()
      .wearRotaryScroll(listState, isCurrentPage),
    contentPadding = PaddingValues(start = 14.dp, end = 14.dp, top = 28.dp, bottom = 32.dp),
    horizontalAlignment = Alignment.CenterHorizontally
  ) {
    item {
      Text(
        text = "Daily Steps",
        fontSize = 13.sp,
        fontWeight = FontWeight.SemiBold,
        color = SparkyColors.Green,
        modifier = Modifier.padding(bottom = 8.dp)
      )
    }

    item {
      Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.size(96.dp)) {
          CircularProgressIndicator(
            progress = progress,
            modifier = Modifier.fillMaxSize(),
            indicatorColor = SparkyColors.Green,
            trackColor = Color.White.copy(alpha = 0.12f),
            strokeWidth = 8.dp
          )
          Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
              text = String.format(Locale.US, "%,d", today),
              fontSize = 18.sp,
              fontWeight = FontWeight.Bold,
              color = Color.White
            )
            Text(
              text = "/ ${String.format(Locale.US, "%,d", goal)}",
              fontSize = 10.sp,
              color = SparkyColors.Muted
            )
          }
        }

        Spacer(Modifier.height(8.dp))
        Text(
          text = if (remaining > 0) "${String.format(Locale.US, "%,d", remaining)} steps to goal" else "Goal reached! 🎉",
          fontSize = 11.sp,
          color = if (remaining > 0) SparkyColors.Muted else SparkyColors.Green
        )
      }
    }
  }
}

@Composable
fun EmptyStateCard(message: String) {
  Box(
    modifier = Modifier
      .fillMaxWidth()
      .clip(RoundedCornerShape(12.dp))
      .background(SparkyColors.CardBg)
      .padding(12.dp),
    contentAlignment = Alignment.Center
  ) {
    Text(
      text = message,
      fontSize = 11.sp,
      color = SparkyColors.Muted,
      textAlign = TextAlign.Center
    )
  }
}

@Composable
fun SmallPillButton(
  label: String,
  color: Color,
  textColor: Color,
  onClick: () -> Unit
) {
  Box(
    modifier = Modifier
      .clip(RoundedCornerShape(16.dp))
      .background(color)
      .clickable(onClick = onClick)
      .padding(horizontal = 12.dp, vertical = 6.dp),
    contentAlignment = Alignment.Center
  ) {
    Text(
      text = label,
      fontSize = 11.sp,
      fontWeight = FontWeight.SemiBold,
      color = textColor
    )
  }
}

@Composable
fun RoundStepperButton(label: String, onClick: () -> Unit) {
  Box(
    modifier = Modifier
      .size(32.dp)
      .clip(CircleShape)
      .background(SparkyColors.CardBg)
      .clickable(onClick = onClick),
    contentAlignment = Alignment.Center
  ) {
    Text(
      text = label,
      fontSize = 15.sp,
      fontWeight = FontWeight.Bold,
      color = Color.White
    )
  }
}

@Composable
fun SleepDetailPage(store: CheckInStore, onDismiss: () -> Unit) {
  val sleep by store.sleep.collectAsState()
  val model = remember(sleep) { TileModels.buildSleepTileModel(sleep) }
  val listState = rememberScalingLazyListState()

  ScalingLazyColumn(
    state = listState,
    autoCentering = null,
    modifier = Modifier
      .fillMaxSize()
      .background(Color.Black)
      .wearRotaryScroll(listState, true),
    contentPadding = PaddingValues(start = 14.dp, end = 14.dp, top = 28.dp, bottom = 32.dp),
    horizontalAlignment = Alignment.CenterHorizontally
  ) {
    item {
      Text(
        text = "Sleep Health",
        fontSize = 13.sp,
        fontWeight = FontWeight.SemiBold,
        color = SparkyColors.Purple,
        modifier = Modifier.padding(bottom = 6.dp)
      )
    }

    if (!model.hasData) {
      item {
        EmptyStateCard("Open SparkyFitness on your phone to sync today's sleep data.")
      }
    } else {
      item {
        Column(
          horizontalAlignment = Alignment.CenterHorizontally,
          modifier = Modifier.padding(bottom = 8.dp)
        ) {
          Text(
            text = model.durationText,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White
          )
          model.scoreText?.let { score ->
            Text(
              text = score,
              fontSize = 12.sp,
              fontWeight = FontWeight.SemiBold,
              color = SparkyColors.Purple
            )
          }
          model.windowText?.let { window ->
            Text(
              text = window,
              fontSize = 11.sp,
              color = SparkyColors.Muted
            )
          }
        }
      }

      if (model.stages.isNotEmpty()) {
        items(model.stages, key = { it.label }) { stage ->
          Row(
            modifier = Modifier
              .fillMaxWidth()
              .padding(vertical = 2.dp)
              .clip(RoundedCornerShape(10.dp))
              .background(SparkyColors.CardBg)
              .padding(horizontal = 10.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
          ) {
            Text(
              text = stage.label,
              fontSize = 11.sp,
              fontWeight = FontWeight.SemiBold,
              color = Color.White
            )
            Text(
              text = stage.durationText,
              fontSize = 11.sp,
              fontWeight = FontWeight.Bold,
              color = Color(stage.colorArgb)
            )
          }
        }
      }

      model.biometricsText?.let { bio ->
        item {
          Spacer(Modifier.height(4.dp))
          Text(
            text = bio,
            fontSize = 11.sp,
            color = SparkyColors.Muted,
            textAlign = TextAlign.Center
          )
        }
      }
    }

    item {
      Spacer(Modifier.height(8.dp))
      SmallPillButton(
        label = "Close",
        color = SparkyColors.CardBg,
        textColor = Color.White,
        onClick = onDismiss
      )
    }
  }
}
