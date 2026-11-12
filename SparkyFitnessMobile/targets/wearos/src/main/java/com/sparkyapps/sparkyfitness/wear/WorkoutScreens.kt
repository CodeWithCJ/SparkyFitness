package com.sparkyapps.sparkyfitness.wear

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.itemsIndexed
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Text
import com.SparkyApps.SparkyFitnessMobile.R
import kotlinx.coroutines.delay
import java.util.Locale
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

@Composable
fun WorkoutContainerPage(
  checkInStore: CheckInStore,
  workoutStore: WorkoutSessionStore,
  recordingStore: RecordingStore,
  runStore: WatchRunStore,
  isCurrentPage: Boolean = true
) {
  val runPhase by runStore.phase.collectAsState()
  val recordingState by recordingStore.state.collectAsState()
  val workoutPhase by workoutStore.phase.collectAsState()

  when {
    runPhase != WatchRunStore.RunPhase.IDLE -> {
      WatchRunActiveView(runStore = runStore, isCurrentPage = isCurrentPage)
    }
    recordingState != null && workoutPhase == WorkoutSessionStore.Phase.IDLE -> {
      RecordingRemoteView(recordingStore = recordingStore, state = recordingState!!)
    }
    workoutPhase != WorkoutSessionStore.Phase.IDLE -> {
      ActiveWorkoutView(
        checkInStore = checkInStore,
        workoutStore = workoutStore,
        isCurrentPage = isCurrentPage
      )
    }
    else -> {
      WorkoutIdlePickerView(
        checkInStore = checkInStore,
        workoutStore = workoutStore,
        runStore = runStore,
        isCurrentPage = isCurrentPage
      )
    }
  }
}

@Composable
private fun WorkoutIdlePickerView(
  checkInStore: CheckInStore,
  workoutStore: WorkoutSessionStore,
  runStore: WatchRunStore,
  isCurrentPage: Boolean
) {
  val startable by checkInStore.startableWorkouts.collectAsState()
  val scheduled by checkInStore.scheduledWorkouts.collectAsState()
  val watchCtx by checkInStore.watchContext.collectAsState()
  val startingId by workoutStore.startingPresetId.collectAsState()
  val errorMessage by workoutStore.startErrorMessage.collectAsState()
  val listState = rememberScalingLazyListState()
  var showCardioLauncher by remember { mutableStateOf(false) }

  if (showCardioLauncher) {
    CardioChoicesView(
      runPlans = watchCtx.runPlans.orEmpty(),
      onStart = { kind, place, plan, paceAlert, hrAlert ->
        showCardioLauncher = false
        runStore.startLocalRun(
          kind = kind,
          place = place,
          plan = plan,
          paceAlert = paceAlert,
          heartRateAlert = hrAlert
        )
      },
      onCancel = { showCardioLauncher = false }
    )
    return
  }

  ScalingLazyColumn(
    state = listState,
    autoCentering = null,
    modifier = Modifier
      .fillMaxSize()
      .wearRotaryScroll(listState, isCurrentPage),
    contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 28.dp, bottom = 32.dp),
    horizontalAlignment = Alignment.CenterHorizontally
  ) {
    item {
      Text(
        text = stringResource(R.string.workout_title),
        fontSize = 13.sp,
        fontWeight = FontWeight.SemiBold,
        color = SparkyColors.Green,
        modifier = Modifier.padding(bottom = 6.dp)
      )
    }

    if (errorMessage != null) {
      item {
        Column(
          modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 6.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(SparkyColors.Rose.copy(alpha = 0.2f))
            .clickable { workoutStore.clearStartError() }
            .padding(8.dp),
          horizontalAlignment = Alignment.CenterHorizontally
        ) {
          Text(
            text = errorMessage ?: "",
            fontSize = 10.sp,
            color = SparkyColors.Rose,
            textAlign = TextAlign.Center
          )
        }
      }
    }

    item {
      Row(
        modifier = Modifier
          .fillMaxWidth()
          .padding(vertical = 3.dp)
          .clip(RoundedCornerShape(12.dp))
          .background(SparkyColors.Cyan.copy(alpha = 0.2f))
          .clickable { showCardioLauncher = true }
          .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
      ) {
        Column(modifier = Modifier.weight(1f)) {
          Text(
            text = stringResource(R.string.workout_cardio_title),
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            color = SparkyColors.Cyan,
            maxLines = 1
          )
          Text(
            text = stringResource(R.string.workout_cardio_subtitle),
            fontSize = 9.sp,
            color = SparkyColors.Muted,
            maxLines = 1
          )
        }
        Text(
          text = "▶",
          fontSize = 13.sp,
          fontWeight = FontWeight.Bold,
          color = SparkyColors.Cyan
        )
      }
    }

    if (scheduled.isEmpty() && startable.isEmpty()) {
      item {
        EmptyStateCard(stringResource(R.string.workout_empty_state))
      }
    } else {
      items(scheduled, key = { "sched_${it.presetId}" }) { item ->
        val isStarting = startingId == item.presetId
        Row(
          modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(SparkyColors.CardBg)
            .clickable(enabled = startingId == null) {
              workoutStore.requestStartPreset(item.presetId)
            }
            .padding(horizontal = 10.dp, vertical = 8.dp),
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.SpaceBetween
        ) {
          Column(modifier = Modifier.weight(1f)) {
            Text(
              text = item.name,
              fontSize = 12.sp,
              fontWeight = FontWeight.SemiBold,
              color = Color.White,
              maxLines = 1,
              overflow = TextOverflow.Ellipsis
            )
            val meta = listOfNotNull(item.planName.takeIf { it.isNotBlank() }, item.caption.takeIf { it.isNotBlank() })
              .joinToString(" • ")
            if (meta.isNotEmpty()) {
              Text(text = meta, fontSize = 10.sp, color = SparkyColors.Muted, maxLines = 1)
            }
          }
          Spacer(Modifier.width(6.dp))
          Text(
            text = if (isStarting) "…" else "▶",
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            color = SparkyColors.Green
          )
        }
      }

      items(startable, key = { "start_${it.presetId}" }) { item ->
        val isStarting = startingId == item.presetId
        Row(
          modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(SparkyColors.CardBg)
            .clickable(enabled = startingId == null) {
              workoutStore.requestStartPreset(item.presetId)
            }
            .padding(horizontal = 10.dp, vertical = 8.dp),
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.SpaceBetween
        ) {
          Text(
            text = item.name,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color.White,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
          )
          Spacer(Modifier.width(6.dp))
          Text(
            text = if (isStarting) "…" else "▶",
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            color = SparkyColors.Green
          )
        }
      }
    }
  }
}

@Composable
private fun CardioChoicesView(
  runPlans: List<WatchRunPlan>,
  onStart: (kind: String, place: String, plan: WatchRunPlan?, paceAlert: Boolean, hrAlert: Boolean) -> Unit,
  onCancel: () -> Unit
) {
  var kind by remember { mutableStateOf("run") }
  var place by remember { mutableStateOf("outdoor") }
  var selectedPlan by remember { mutableStateOf<WatchRunPlan?>(null) }
  var paceAlert by remember { mutableStateOf(false) }
  var hrAlert by remember { mutableStateOf(false) }
  val listState = rememberScalingLazyListState()

  ScalingLazyColumn(
    state = listState,
    autoCentering = null,
    verticalArrangement = Arrangement.spacedBy(4.dp),
    modifier = Modifier
      .fillMaxSize()
      .background(Color.Black)
      .wearRotaryScroll(listState, isCurrentPage = true),
    contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 26.dp, bottom = 32.dp),
    horizontalAlignment = Alignment.CenterHorizontally
  ) {
    item {
      Text(
        text = stringResource(R.string.cardio_start_title),
        fontSize = 12.sp,
        fontWeight = FontWeight.Bold,
        color = SparkyColors.Cyan
      )
    }

    item {
      Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        SmallPillButton(
          label = stringResource(R.string.cardio_kind_run),
          color = if (kind == "run") SparkyColors.Cyan else SparkyColors.CardBg,
          textColor = if (kind == "run") Color.Black else Color.White,
          onClick = { kind = "run" }
        )
        SmallPillButton(
          label = stringResource(R.string.cardio_kind_walk),
          color = if (kind == "walk") SparkyColors.Cyan else SparkyColors.CardBg,
          textColor = if (kind == "walk") Color.Black else Color.White,
          onClick = { kind = "walk" }
        )
      }
    }

    item {
      Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        SmallPillButton(
          label = stringResource(R.string.cardio_place_outdoor),
          color = if (place == "outdoor") SparkyColors.Green else SparkyColors.CardBg,
          textColor = if (place == "outdoor") Color.Black else Color.White,
          onClick = { place = "outdoor" }
        )
        SmallPillButton(
          label = stringResource(R.string.cardio_place_indoor),
          color = if (place == "indoor") SparkyColors.Green else SparkyColors.CardBg,
          textColor = if (place == "indoor") Color.Black else Color.White,
          onClick = { place = "indoor" }
        )
      }
    }

    if (runPlans.isNotEmpty()) {
      item {
        val label = selectedPlan?.name ?: stringResource(R.string.cardio_plan_free)
        SmallPillButton(
          label = label,
          color = SparkyColors.CardBg,
          textColor = SparkyColors.Amber,
          onClick = {
            val idx = if (selectedPlan == null) 0 else (runPlans.indexOf(selectedPlan) + 1)
            selectedPlan = if (idx < runPlans.size) runPlans[idx] else null
          }
        )
      }
    }

    item {
      Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        SmallPillButton(
          label = if (paceAlert) stringResource(R.string.cardio_pace_checked) else stringResource(R.string.cardio_pace),
          color = if (paceAlert) SparkyColors.Amber.copy(alpha = 0.3f) else SparkyColors.CardBg,
          textColor = if (paceAlert) SparkyColors.Amber else SparkyColors.Muted,
          onClick = { paceAlert = !paceAlert }
        )
        SmallPillButton(
          label = if (hrAlert) stringResource(R.string.cardio_hr_checked) else stringResource(R.string.cardio_hr),
          color = if (hrAlert) SparkyColors.Rose.copy(alpha = 0.3f) else SparkyColors.CardBg,
          textColor = if (hrAlert) SparkyColors.Rose else SparkyColors.Muted,
          onClick = { hrAlert = !hrAlert }
        )
      }
    }

    item {
      Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        SmallPillButton(stringResource(R.string.cardio_back), SparkyColors.CardBg, SparkyColors.Muted, onCancel)
        SmallPillButton(stringResource(R.string.cardio_start_btn), SparkyColors.Green, Color.Black) {
          onStart(kind, place, selectedPlan, paceAlert, hrAlert)
        }
      }
    }
  }
}

@Composable
private fun ActiveWorkoutView(
  checkInStore: CheckInStore,
  workoutStore: WorkoutSessionStore,
  isCurrentPage: Boolean
) {
  val phase by workoutStore.phase.collectAsState()
  val plan by workoutStore.plan.collectAsState()
  val steps by workoutStore.steps.collectAsState()
  val stepIndex by workoutStore.stepIndex.collectAsState()
  val draftReps by workoutStore.draftReps.collectAsState()
  val draftWeight by workoutStore.draftWeight.collectAsState()
  val draftDuration by workoutStore.draftDurationSeconds.collectAsState()
  val draftDistanceKm by workoutStore.draftDistanceKm.collectAsState()
  val restRemaining by workoutStore.restRemainingSeconds.collectAsState()
  val elapsedSec by workoutStore.elapsedSeconds.collectAsState()
  val capRemainingSec by workoutStore.capRemainingSeconds.collectAsState()
  val setTimerRunning by workoutStore.setTimerRunning.collectAsState()
  val setTimerElapsed by workoutStore.setTimerElapsedSeconds.collectAsState()
  val prBanner by workoutStore.activePrBanner.collectAsState()
  val heartRate by workoutStore.currentHeartRate.collectAsState()
  val calories by workoutStore.activeCalories.collectAsState()
  val summary by workoutStore.completedSummary.collectAsState()
  val watchCtx by checkInStore.watchContext.collectAsState()

  var showOptionsSheet by remember { mutableStateOf(false) }
  var showKeypadFor by remember { mutableStateOf<String?>(null) } // "reps" | "weight"

  if (phase == WorkoutSessionStore.Phase.ASKING_PRESET_UPDATE) {
    PresetUpdatePromptView(
      workoutName = plan?.workoutName ?: stringResource(R.string.workout_preset_fallback),
      onAnswer = { update -> workoutStore.answerPresetUpdate(update) }
    )
    return
  }

  if (phase == WorkoutSessionStore.Phase.COMPLETED && summary != null) {
    WorkoutSummaryView(
      summary = summary!!,
      onDone = { workoutStore.dismissSummary() },
      energy = EnergyDisplay.of(watchCtx)
    )
    return
  }

  if (showKeypadFor != null) {
    val mode = showKeypadFor!!
    WatchKeypadSheet(
      title = if (mode == "reps") {
        stringResource(R.string.workout_keypad_reps)
      } else {
        stringResource(R.string.weight_keypad_title, workoutStore.weightUnit.suffix)
      },
      initialValue = if (mode == "reps") draftReps.toDouble() else draftWeight,
      allowDecimal = mode == "weight",
      onConfirm = { v ->
        if (mode == "reps") workoutStore.setDraftReps(v.roundToInt())
        else workoutStore.setDraftWeight(v)
        showKeypadFor = null
      },
      onCancel = { showKeypadFor = null }
    )
    return
  }

  if (showOptionsSheet) {
    WorkoutOptionsSheet(
      steps = steps,
      currentIndex = stepIndex,
      suggestedExercises = watchCtx.suggestedExercises.orEmpty(),
      onJumpToStep = { idx ->
        workoutStore.jumpToStep(idx)
        showOptionsSheet = false
      },
      onEditAction = { action ->
        workoutStore.applyEdit(action)
        showOptionsSheet = false
      },
      onSkipExercise = {
        workoutStore.skipCurrentExercise()
        showOptionsSheet = false
      },
      onFinishWorkout = {
        workoutStore.finishWorkout(notifyPhone = true)
        showOptionsSheet = false
      },
      onDiscardWorkout = {
        workoutStore.discardWorkout(notifyPhone = true)
        showOptionsSheet = false
      },
      onClose = { showOptionsSheet = false }
    )
    return
  }

  if (phase == WorkoutSessionStore.Phase.REST) {
    RestTimerView(
      remainingSeconds = restRemaining,
      nextStep = steps.getOrNull(stepIndex),
      heartRate = heartRate,
      prBanner = prBanner,
      onAdd15 = { workoutStore.addRestSeconds(15) },
      onSkip = { workoutStore.skipRest() }
    )
    return
  }

  if (phase == WorkoutSessionStore.Phase.RPE_PROMPT) {
    RpePromptView(
      onSubmit = { rpe -> workoutStore.submitRpe(rpe) },
      onSkip = { workoutStore.submitRpe(null) }
    )
    return
  }

  val curPlan = plan
  if (steps.isEmpty() && curPlan != null) {
    CardioWorkoutView(
      title = curPlan.workoutName,
      elapsedSeconds = elapsedSec,
      heartRate = heartRate,
      calories = calories,
      onFinish = { workoutStore.finishWorkout(notifyPhone = true) },
      energy = EnergyDisplay.of(watchCtx)
    )
    return
  }

  val step = steps.getOrNull(stepIndex) ?: return
  val unitLabel = workoutStore.weightUnit.suffix
  var adjustMode by remember { mutableStateOf("reps") }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .wearRotaryStepper(isCurrentPage = isCurrentPage) { dir ->
        when {
          step.timed -> workoutStore.adjustDuration(dir * 5)
          adjustMode == "distance" && step.carry -> workoutStore.adjustDistance(dir)
          adjustMode == "weight" && (!step.bodyweight || step.weighted) -> workoutStore.adjustWeight(dir)
          else -> workoutStore.adjustReps(dir)
        }
      }
      .padding(horizontal = 10.dp, vertical = 8.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.SpaceBetween
  ) {
    // Top telemetry / PR / Interval Cap row
    if (prBanner != null) {
      Text(
        text = prBanner!!,
        fontSize = 11.sp,
        fontWeight = FontWeight.Bold,
        color = SparkyColors.Amber
      )
    } else {
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
      ) {
        val formatTag = curPlan?.workoutFormat?.takeIf { it != "standard" }?.uppercase()
        val leftText = if (formatTag != null && capRemainingSec != null) {
          "$formatTag ${formatDuration(capRemainingSec!!)}"
        } else {
          formatDuration(elapsedSec)
        }
        Text(
          text = leftText,
          fontSize = 10.sp,
          color = if (formatTag != null) SparkyColors.Amber else SparkyColors.Muted
        )
        Text(
          text = if (heartRate != null) {
            "♥ ${heartRate!!.toInt()}"
          } else {
            stringResource(R.string.workout_set_counter, step.setIndexInExercise, step.totalSetsInExercise)
          },
          fontSize = 10.sp,
          color = if (heartRate != null) SparkyColors.Rose else SparkyColors.Green
        )
      }
    }

    // Exercise name + superset / setType badges
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
      Text(
        text = step.exerciseName,
        fontSize = 13.sp,
        fontWeight = FontWeight.Bold,
        color = Color.White,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis
      )
      Row(
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically
      ) {
        Text(
          text = stringResource(R.string.workout_set_counter, step.setIndexInExercise, step.totalSetsInExercise),
          fontSize = 10.sp,
          color = SparkyColors.Green
        )
        if (step.supersetRun != null) {
          Text(
            text = stringResource(R.string.workout_superset_badge, step.supersetRun),
            fontSize = 9.sp,
            fontWeight = FontWeight.Bold,
            color = SparkyColors.Purple
          )
        }
        val st = step.setType?.lowercase()
        if (st != null && st != "normal") {
          val localizedSetType = localizedSetTypeLabel(st)
          Text(
            text = "• ${localizedSetType.uppercase()}",
            fontSize = 9.sp,
            fontWeight = FontWeight.Bold,
            color = SparkyColors.Amber
          )
        }
      }
    }

    // Value adjusters (Timed vs Carry/Weight/Reps)
    if (step.timed) {
      Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
          if (!setTimerRunning) {
            RoundStepperButton("-5") { workoutStore.adjustDuration(-5) }
          }
          val displaySec = if (setTimerRunning) setTimerElapsed else draftDuration
          Text(
            text = "${displaySec}s",
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            color = if (setTimerRunning) SparkyColors.Cyan else Color.White
          )
          if (!setTimerRunning) {
            RoundStepperButton("+5") { workoutStore.adjustDuration(5) }
          }
        }
      }
    } else {
      Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
      ) {
        Column(
          modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(if (adjustMode == "reps") SparkyColors.Green.copy(alpha = 0.22f) else SparkyColors.CardBg)
            .clickable {
              if (adjustMode == "reps") showKeypadFor = "reps" else adjustMode = "reps"
            }
            .padding(horizontal = 7.dp, vertical = 3.dp),
          horizontalAlignment = Alignment.CenterHorizontally
        ) {
          Text("$draftReps", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = Color.White)
          Text(stringResource(R.string.workout_reps_label), fontSize = 8.sp, color = SparkyColors.Muted)
        }

        if (!step.bodyweight || step.weighted) {
          Column(
            modifier = Modifier
              .clip(RoundedCornerShape(8.dp))
              .background(if (adjustMode == "weight") SparkyColors.Green.copy(alpha = 0.22f) else SparkyColors.CardBg)
              .clickable {
                if (adjustMode == "weight") showKeypadFor = "weight" else adjustMode = "weight"
              }
              .padding(horizontal = 7.dp, vertical = 3.dp),
            horizontalAlignment = Alignment.CenterHorizontally
          ) {
            Text(
              String.format(Locale.US, "%.1f", draftWeight),
              fontSize = 15.sp,
              fontWeight = FontWeight.Bold,
              color = Color.White
            )
            Text(unitLabel, fontSize = 8.sp, color = SparkyColors.Muted)
          }
        }

        if (step.carry) {
          val distDisplay = if (workoutStore.usesMiles) {
            String.format(Locale.US, "%.0fft", draftDistanceKm * 3280.84)
          } else {
            String.format(Locale.US, "%.0fm", draftDistanceKm * 1000.0)
          }
          Column(
            modifier = Modifier
              .clip(RoundedCornerShape(8.dp))
              .background(if (adjustMode == "distance") SparkyColors.Cyan.copy(alpha = 0.22f) else SparkyColors.CardBg)
              .clickable { adjustMode = "distance" }
              .padding(horizontal = 6.dp, vertical = 3.dp),
            horizontalAlignment = Alignment.CenterHorizontally
          ) {
            Text(distDisplay, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color.White)
            Text(stringResource(R.string.workout_carry_label), fontSize = 8.sp, color = SparkyColors.Muted)
          }
        }

        RoundStepperButton("−") {
          when {
            adjustMode == "distance" && step.carry -> workoutStore.adjustDistance(-1)
            adjustMode == "weight" && (!step.bodyweight || step.weighted) -> workoutStore.adjustWeight(-1)
            else -> workoutStore.adjustReps(-1)
          }
        }
        RoundStepperButton("+") {
          when {
            adjustMode == "distance" && step.carry -> workoutStore.adjustDistance(1)
            adjustMode == "weight" && (!step.bodyweight || step.weighted) -> workoutStore.adjustWeight(1)
            else -> workoutStore.adjustReps(1)
          }
        }
      }
    }

    // Bottom action buttons
    Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
      SmallPillButton(
        label = "•••",
        color = SparkyColors.CardBg,
        textColor = SparkyColors.Muted,
        onClick = { showOptionsSheet = true }
      )
      if (step.timed) {
        SmallPillButton(
          label = if (setTimerRunning) {
            stringResource(R.string.workout_timer_stop)
          } else {
            stringResource(R.string.workout_timer_start)
          },
          color = if (setTimerRunning) SparkyColors.Amber else SparkyColors.Cyan,
          textColor = Color.Black,
          onClick = {
            if (setTimerRunning) workoutStore.stopSetTimer() else workoutStore.startSetTimer()
          }
        )
      }
      SmallPillButton(
        label = stringResource(R.string.workout_done_check),
        color = SparkyColors.Green,
        textColor = Color.Black,
        onClick = { workoutStore.completeCurrentSet() }
      )
    }
  }
}

@Composable
private fun localizedSetTypeLabel(rawType: String): String = when (rawType.lowercase(Locale.US)) {
  "warmup" -> stringResource(R.string.workout_set_type_warmup)
  "drop" -> stringResource(R.string.workout_set_type_drop)
  "failure" -> stringResource(R.string.workout_set_type_failure)
  else -> stringResource(R.string.workout_set_type_normal)
}

@Composable
private fun PresetUpdatePromptView(
  workoutName: String,
  onAnswer: (Boolean) -> Unit
) {
  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(Color.Black)
      .padding(14.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center
  ) {
    Text(stringResource(R.string.workout_preset_update_title), fontSize = 13.sp, fontWeight = FontWeight.Bold, color = SparkyColors.Amber)
    Spacer(Modifier.height(4.dp))
    Text(
      text = stringResource(R.string.workout_preset_update_desc, workoutName),
      fontSize = 10.sp,
      color = SparkyColors.Muted,
      textAlign = TextAlign.Center
    )
    Spacer(Modifier.height(10.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
      SmallPillButton(stringResource(R.string.workout_preset_keep_old), SparkyColors.CardBg, Color.White) { onAnswer(false) }
      SmallPillButton(stringResource(R.string.workout_preset_update_btn), SparkyColors.Green, Color.Black) { onAnswer(true) }
    }
  }
}

@Composable
private fun RestTimerView(
  remainingSeconds: Int,
  nextStep: WorkoutStep?,
  heartRate: Double?,
  prBanner: String?,
  onAdd15: () -> Unit,
  onSkip: () -> Unit
) {
  Column(
    modifier = Modifier
      .fillMaxSize()
      .padding(12.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center
  ) {
    if (prBanner != null) {
      Text(prBanner, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = SparkyColors.Amber)
      Spacer(Modifier.height(2.dp))
    }
    Text(stringResource(R.string.workout_rest_title), fontSize = 12.sp, color = SparkyColors.Cyan, fontWeight = FontWeight.SemiBold)
    Text(
      text = formatDuration(remainingSeconds),
      fontSize = 28.sp,
      fontWeight = FontWeight.Bold,
      color = Color.White
    )
    if (heartRate != null) {
      Text("♥ ${heartRate.toInt()} bpm", fontSize = 11.sp, color = SparkyColors.Rose)
    }
    if (nextStep != null) {
      Spacer(Modifier.height(2.dp))
      Text(
        text = stringResource(R.string.workout_rest_next, nextStep.exerciseName, nextStep.setIndexInExercise),
        fontSize = 10.sp,
        color = SparkyColors.Muted,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis
      )
    }
    Spacer(Modifier.height(8.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      SmallPillButton(stringResource(R.string.workout_rest_add_15), SparkyColors.CardBg, Color.White, onAdd15)
      SmallPillButton(stringResource(R.string.common_skip), SparkyColors.Cyan, Color.Black, onSkip)
    }
  }
}

@Composable
private fun RpePromptView(
  onSubmit: (Double) -> Unit,
  onSkip: () -> Unit
) {
  var rpe by remember { mutableDoubleStateOf(8.0) }
  Column(
    modifier = Modifier
      .fillMaxSize()
      .wearRotaryStepper(isCurrentPage = true) { steps ->
        rpe = (rpe + steps * 0.5).coerceIn(5.0, 10.0)
        Haptics.click()
      }
      .padding(12.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center
  ) {
    Text(stringResource(R.string.workout_rpe_title), fontSize = 12.sp, color = SparkyColors.Amber)
    Spacer(Modifier.height(6.dp))
    Row(
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
      RoundStepperButton("−") { rpe = max(5.0, rpe - 0.5) }
      Text(
        text = String.format(Locale.US, "%.1f", rpe),
        fontSize = 24.sp,
        fontWeight = FontWeight.Bold,
        color = Color.White
      )
      RoundStepperButton("+") { rpe = min(10.0, rpe + 0.5) }
    }
    Spacer(Modifier.height(8.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      SmallPillButton(stringResource(R.string.common_skip), SparkyColors.CardBg, SparkyColors.Muted, onSkip)
      SmallPillButton(stringResource(R.string.common_save), SparkyColors.Amber, Color.Black) { onSubmit(rpe) }
    }
  }
}

@Composable
private fun CardioWorkoutView(
  title: String,
  elapsedSeconds: Int,
  heartRate: Double?,
  calories: Double,
  onFinish: () -> Unit,
  energy: EnergyDisplay = EnergyDisplay.KCAL
) {
  Column(
    modifier = Modifier
      .fillMaxSize()
      .padding(12.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center
  ) {
    Text(title, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = SparkyColors.Green, maxLines = 1)
    Spacer(Modifier.height(4.dp))
    Text(formatDuration(elapsedSeconds), fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Color.White)
    Spacer(Modifier.height(4.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
      Text(
        text = if (heartRate != null) "♥ ${heartRate.toInt()}" else "♥ --",
        fontSize = 12.sp,
        color = SparkyColors.Rose
      )
      Text(
        text = "${energy.value(calories).toInt()} ${energy.unit}",
        fontSize = 12.sp,
        color = SparkyColors.Amber
      )
    }
    Spacer(Modifier.height(10.dp))
    SmallPillButton(stringResource(R.string.workout_end_btn), SparkyColors.Rose, Color.White, onFinish)
  }
}

@Composable
private fun WorkoutOptionsSheet(
  steps: List<WorkoutStep>,
  currentIndex: Int,
  suggestedExercises: List<SuggestedExercise>,
  onJumpToStep: (Int) -> Unit,
  onEditAction: (WorkoutEditAction) -> Unit,
  onSkipExercise: () -> Unit,
  onFinishWorkout: () -> Unit,
  onDiscardWorkout: () -> Unit,
  onClose: () -> Unit
) {
  var showAddExercisePicker by remember { mutableStateOf(false) }
  val listState = rememberScalingLazyListState()
  val currentStep = steps.getOrNull(currentIndex)

  if (showAddExercisePicker) {
    ScalingLazyColumn(
      state = rememberScalingLazyListState(),
      autoCentering = null,
      verticalArrangement = Arrangement.spacedBy(4.dp),
      modifier = Modifier
        .fillMaxSize()
        .background(Color.Black),
      contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 28.dp, bottom = 32.dp),
      horizontalAlignment = Alignment.CenterHorizontally
    ) {
      item {
        Text(stringResource(R.string.workout_add_exercise_title), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = SparkyColors.Cyan)
      }
      item {
        SmallPillButton(stringResource(R.string.common_cancel), SparkyColors.CardBg, SparkyColors.Muted) {
          showAddExercisePicker = false
        }
      }
      if (suggestedExercises.isEmpty()) {
        item {
          EmptyStateCard(stringResource(R.string.workout_no_recent_exercises))
        }
      } else {
        items(suggestedExercises, key = { it.exerciseId }) { ex ->
          Row(
            modifier = Modifier
              .fillMaxWidth()
              .clip(RoundedCornerShape(10.dp))
              .background(SparkyColors.CardBg)
              .clickable {
                showAddExercisePicker = false
                onEditAction(WorkoutEditAction.AddExercise(ex.exerciseId))
              }
              .padding(horizontal = 10.dp, vertical = 7.dp),
            horizontalArrangement = Arrangement.SpaceBetween
          ) {
            Text(ex.name, fontSize = 11.sp, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("+", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = SparkyColors.Green)
          }
        }
      }
    }
    return
  }

  ScalingLazyColumn(
    state = listState,
    autoCentering = null,
    verticalArrangement = Arrangement.spacedBy(4.dp),
    modifier = Modifier
      .fillMaxSize()
      .background(Color.Black)
      .wearRotaryScroll(listState, isCurrentPage = true),
    contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 28.dp, bottom = 32.dp),
    horizontalAlignment = Alignment.CenterHorizontally
  ) {
    item {
      Text(
        stringResource(R.string.workout_options_title),
        fontSize = 12.sp,
        fontWeight = FontWeight.Bold,
        color = Color.White,
        modifier = Modifier.padding(bottom = 2.dp)
      )
    }
    item {
      SmallPillButton(stringResource(R.string.workout_back_to_set), SparkyColors.CardBg, Color.White, onClose)
    }

    if (currentStep != null) {
      item {
        Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
          SmallPillButton(stringResource(R.string.workout_add_set), SparkyColors.Cyan.copy(alpha = 0.25f), SparkyColors.Cyan) {
            onEditAction(WorkoutEditAction.AddSet(currentStep.exerciseEntryId))
          }
          val setTypes = listOf("normal", "warmup", "drop", "failure")
          val curType = currentStep.setType?.lowercase() ?: "normal"
          val nextType = setTypes[(setTypes.indexOf(curType) + 1) % setTypes.size]
          val localizedCurType = localizedSetTypeLabel(curType)
          SmallPillButton(stringResource(R.string.workout_set_type_label, localizedCurType), SparkyColors.CardBg, SparkyColors.Amber) {
            onEditAction(WorkoutEditAction.SetSetType(currentStep.setId, nextType))
          }
        }
      }

      if (currentStep.totalSetsInExercise > 1) {
        item {
          SmallPillButton(stringResource(R.string.workout_delete_set), SparkyColors.Rose.copy(alpha = 0.2f), SparkyColors.Rose) {
            onEditAction(WorkoutEditAction.DeleteSet(currentStep.setId))
          }
        }
      }
    }

    if (suggestedExercises.isNotEmpty()) {
      item {
        SmallPillButton(stringResource(R.string.workout_add_exercise_btn), SparkyColors.CardBg, SparkyColors.Green) {
          showAddExercisePicker = true
        }
      }
    }

    if (currentStep != null && steps.map { it.exerciseEntryId }.distinct().size > 1) {
      item {
        SmallPillButton(stringResource(R.string.workout_delete_exercise), SparkyColors.Rose.copy(alpha = 0.2f), SparkyColors.Rose) {
          onEditAction(WorkoutEditAction.DeleteExercise(currentStep.exerciseEntryId))
        }
      }
    }

    item {
      SmallPillButton(stringResource(R.string.workout_skip_exercise), SparkyColors.Amber.copy(alpha = 0.25f), SparkyColors.Amber, onSkipExercise)
    }
    item {
      SmallPillButton(stringResource(R.string.workout_finish_btn), SparkyColors.Green, Color.Black, onFinishWorkout)
    }
    item {
      SmallPillButton(stringResource(R.string.workout_discard_btn), SparkyColors.Rose.copy(alpha = 0.25f), SparkyColors.Rose, onDiscardWorkout)
    }
    itemsIndexed(steps) { idx, st ->
      val isCur = idx == currentIndex
      Row(
        modifier = Modifier
          .fillMaxWidth()
          .padding(vertical = 2.dp)
          .clip(RoundedCornerShape(8.dp))
          .background(if (isCur) SparkyColors.Green.copy(alpha = 0.2f) else SparkyColors.CardBg)
          .clickable { onJumpToStep(idx) }
          .padding(horizontal = 8.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween
      ) {
        Text(
          text = st.exerciseName,
          fontSize = 11.sp,
          color = Color.White,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis,
          modifier = Modifier.weight(1f)
        )
        Text("S${st.setIndexInExercise}", fontSize = 10.sp, color = SparkyColors.Muted)
      }
    }
  }
}

@Composable
private fun WorkoutSummaryView(
  summary: WorkoutSummary,
  onDone: () -> Unit,
  energy: EnergyDisplay = EnergyDisplay.KCAL
) {
  Column(
    modifier = Modifier
      .fillMaxSize()
      .padding(14.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center
  ) {
    Text(stringResource(R.string.workout_complete_title), fontSize = 13.sp, fontWeight = FontWeight.Bold, color = SparkyColors.Green)
    Spacer(Modifier.height(4.dp))
    Text(summary.workoutName, fontSize = 11.sp, color = Color.White, maxLines = 1)
    Spacer(Modifier.height(6.dp))
    Text(
      text = pluralStringResource(
        R.plurals.workout_summary_sets_duration,
        summary.setsCompleted,
        summary.setsCompleted,
        formatDuration(summary.durationSeconds)
      ),
      fontSize = 11.sp,
      color = SparkyColors.Muted
    )
    if (summary.averageBpm != null || summary.activeEnergyKcal != null) {
      val parts = mutableListOf<String>()
      summary.averageBpm?.let { parts.add(stringResource(R.string.workout_summary_avg_hr, it.toInt())) }
      summary.activeEnergyKcal?.let { parts.add("${energy.value(it).toInt()} ${energy.unit}") }
      Text(parts.joinToString(" • "), fontSize = 11.sp, color = SparkyColors.Amber)
    }
    Spacer(Modifier.height(10.dp))
    SmallPillButton(stringResource(R.string.common_done), SparkyColors.Green, Color.Black, onDone)
  }
}

@Composable
private fun RecordingRemoteView(
  recordingStore: RecordingStore,
  state: RecordingState
) {
  val liveHr by recordingStore.liveHeartRate.collectAsState()
  var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
  LaunchedEffect(Unit) {
    while (true) {
      delay(1000)
      nowMs = System.currentTimeMillis()
    }
  }
  val activeElapsedMs = if (state.status == "paused" && state.pausedAtMs != null) {
    max(0L, state.pausedAtMs - state.startedAtMs - state.pausedMs.toLong())
  } else {
    max(0L, nowMs - state.startedAtMs - state.pausedMs.toLong())
  }
  val elapsedSeconds = (activeElapsedMs / 1000L).toInt()
  val distDisplay = if (state.usesMiles) {
    String.format(Locale.US, "%.2f mi", state.distanceMeters / 1609.344)
  } else {
    String.format(Locale.US, "%.2f km", state.distanceMeters / 1000.0)
  }
  val paceDisplay = state.paceSeconds?.takeIf { it > 0 && it < 3600 }?.let { sec ->
    val unitSuffix = if (state.usesMiles) "/mi" else "/km"
    "${formatDuration(sec.toInt())}$unitSuffix"
  }
  val isPaused = state.status == "paused"
  val activityLabel = when (state.activity.lowercase(Locale.US)) {
    "walk" -> stringResource(R.string.recording_activity_walk)
    "run" -> stringResource(R.string.recording_activity_run)
    "ride" -> stringResource(R.string.recording_activity_ride)
    else -> state.activity.replaceFirstChar { it.uppercase() }
  }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .padding(10.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center
  ) {
    Row(
      horizontalArrangement = Arrangement.spacedBy(8.dp),
      verticalAlignment = Alignment.CenterVertically
    ) {
      Text(
        text = activityLabel,
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        color = SparkyColors.Cyan
      )
      if (liveHr != null) {
        Text(
          text = "♥ ${liveHr!!.toInt()}",
          fontSize = 11.sp,
          fontWeight = FontWeight.Bold,
          color = SparkyColors.Rose
        )
      }
    }
    Text(
      text = formatDuration(elapsedSeconds),
      fontSize = 23.sp,
      fontWeight = FontWeight.Bold,
      color = Color.White
    )
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      Text(
        text = distDisplay,
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        color = SparkyColors.Green
      )
      if (paceDisplay != null) {
        Text(
          text = paceDisplay,
          fontSize = 12.sp,
          color = SparkyColors.Muted
        )
      }
    }
    if (state.interval != null) {
      Text(
        text = "${state.interval.label}: ${formatDuration(state.interval.remaining.toInt())}",
        fontSize = 10.sp,
        color = SparkyColors.Amber,
        maxLines = 1
      )
    }
    Spacer(Modifier.height(6.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
      if (isPaused) {
        SmallPillButton(stringResource(R.string.recording_resume), SparkyColors.Green, Color.Black) {
          recordingStore.sendAction("resume")
        }
      } else {
        SmallPillButton(stringResource(R.string.recording_pause), SparkyColors.Amber, Color.Black) {
          recordingStore.sendAction("pause")
        }
      }
      SmallPillButton(
        label = if (state.lapCount > 0) stringResource(R.string.recording_lap_count, state.lapCount) else stringResource(R.string.recording_lap),
        color = SparkyColors.CardBg,
        textColor = Color.White
      ) {
        recordingStore.sendAction("lap")
      }
      SmallPillButton(stringResource(R.string.recording_stop), SparkyColors.Rose, Color.White) {
        recordingStore.sendAction("finish")
      }
    }
  }
}

@Composable
private fun WatchRunActiveView(runStore: WatchRunStore, isCurrentPage: Boolean) {
  val phase by runStore.phase.collectAsState()
  val req by runStore.request.collectAsState()
  val settings by runStore.settings.collectAsState()
  val paceAlert by runStore.paceAlertEnabled.collectAsState()
  val hrAlert by runStore.heartRateAlertEnabled.collectAsState()
  val autoPaused by runStore.autoPaused.collectAsState()
  val elapsed by runStore.elapsedSeconds.collectAsState()
  val distanceMeters by runStore.distanceMeters.collectAsState()
  val heartRate by runStore.heartRate.collectAsState()
  val stepIdx by runStore.currentStepIndex.collectAsState()
  val stepRemaining by runStore.stepRemainingSeconds.collectAsState()
  val lapCount by runStore.lapCount.collectAsState()
  val alertBanner by runStore.activeAlertBanner.collectAsState()
  val gpsAcc = runStore.sensors?.gpsAccuracyMeters?.collectAsState()?.value

  var showSettings by remember { mutableStateOf(false) }

  if (phase == WatchRunStore.RunPhase.CONFIRMING_DISTANCE) {
    TreadmillDistanceView(
      estimatedMeters = distanceMeters,
      usesMiles = runStore.usesMiles,
      onConfirm = { actualMeters -> runStore.confirmDistance(actualMeters) },
      onSkip = { runStore.confirmDistance(null) }
    )
    return
  }

  if (phase == WatchRunStore.RunPhase.COMPLETED) {
    val distLabel = if (runStore.usesMiles) {
      String.format(Locale.US, "%.2f mi", distanceMeters / 1609.344)
    } else {
      String.format(Locale.US, "%.2f km", distanceMeters / 1000.0)
    }
    Column(
      modifier = Modifier
        .fillMaxSize()
        .padding(14.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.Center
    ) {
      Text(stringResource(R.string.run_saved_title), fontSize = 14.sp, fontWeight = FontWeight.Bold, color = SparkyColors.Green)
      Spacer(Modifier.height(4.dp))
      Text(
        text = "$distLabel • ${formatDuration(elapsed)}",
        fontSize = 12.sp,
        color = Color.White
      )
      if (lapCount > 0) {
        Text(pluralStringResource(R.plurals.run_laps_count, lapCount, lapCount), fontSize = 10.sp, color = SparkyColors.Muted)
      }
      Spacer(Modifier.height(10.dp))
      SmallPillButton(stringResource(R.string.common_done), SparkyColors.Green, Color.Black) { runStore.dismiss() }
    }
    return
  }

  if (showSettings) {
    WatchRunSettingsSheet(
      settings = settings,
      paceAlert = paceAlert,
      hrAlert = hrAlert,
      onToggleAutoPause = { runStore.toggleAutoPause() },
      onToggleVoiceCues = { runStore.toggleVoiceCues() },
      onTogglePaceAlert = { runStore.togglePaceAlert() },
      onToggleHrAlert = { runStore.toggleHeartRateAlert() },
      onTestVoice = { runStore.testVoiceCue() },
      onClose = { showSettings = false }
    )
    return
  }

  val plan = req?.plan
  val curStep = plan?.steps?.getOrNull(stepIdx)
  val isOutdoor = req?.place == "outdoor"
  val usesMiles = runStore.usesMiles
  val distDisplay = if (usesMiles) {
    String.format(Locale.US, "%.2f mi", distanceMeters / 1609.344)
  } else {
    String.format(Locale.US, "%.2f km", distanceMeters / 1000.0)
  }
  val paceSecKm = runStore.currentPaceSecondsPerKm
  val paceDisplay = paceSecKm?.let { secKm ->
    val secPerUnit = if (usesMiles) (secKm * 1.609344).toInt() else secKm.toInt()
    "${formatDuration(secPerUnit)}/${if (usesMiles) "mi" else "km"}"
  }
  val fallbackKindLabel = when (req?.kind?.lowercase(Locale.US)) {
    "walk" -> stringResource(R.string.cardio_kind_walk)
    "run" -> stringResource(R.string.cardio_kind_run)
    else -> req?.kind?.replaceFirstChar { it.uppercase() } ?: stringResource(R.string.cardio_kind_run)
  }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .padding(horizontal = 10.dp, vertical = 8.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.SpaceBetween
  ) {
    // Top header + GPS indicator
    Row(
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(5.dp)
    ) {
      if (isOutdoor) {
        val gpsColor = when {
          gpsAcc == null -> SparkyColors.Muted
          gpsAcc <= 15.0 -> SparkyColors.Green
          gpsAcc <= 35.0 -> SparkyColors.Amber
          else -> SparkyColors.Rose
        }
        Box(
          modifier = Modifier
            .size(6.dp)
            .clip(CircleShape)
            .background(gpsColor)
        )
      }
      Text(
        text = when {
          autoPaused -> stringResource(R.string.run_auto_paused)
          alertBanner != null -> alertBanner!!
          else -> curStep?.label ?: plan?.name ?: fallbackKindLabel
        },
        fontSize = 11.sp,
        fontWeight = FontWeight.SemiBold,
        color = if (autoPaused || alertBanner != null) SparkyColors.Amber else SparkyColors.Cyan,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis
      )
    }

    // Main timer
    Text(
      text = if (stepRemaining != null) formatDuration(stepRemaining!!) else formatDuration(elapsed),
      fontSize = 24.sp,
      fontWeight = FontWeight.Bold,
      color = Color.White
    )

    // Distance + Pace + HR
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
          text = distDisplay,
          fontSize = 12.sp,
          fontWeight = FontWeight.SemiBold,
          color = SparkyColors.Green
        )
        if (paceDisplay != null) {
          Text(
            text = paceDisplay,
            fontSize = 11.sp,
            color = SparkyColors.Muted
          )
        }
      }
      if (heartRate != null) {
        Text("♥ ${heartRate!!.toInt()} bpm", fontSize = 11.sp, color = SparkyColors.Rose)
      }
    }

    // Controls row
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
      if (phase == WatchRunStore.RunPhase.PAUSED) {
        SmallPillButton("▶", SparkyColors.Green, Color.Black) { runStore.resume() }
      } else {
        SmallPillButton("⏸", SparkyColors.Amber, Color.Black) { runStore.pause() }
      }
      SmallPillButton(
        label = if (lapCount > 0) "L$lapCount" else stringResource(R.string.recording_lap),
        color = SparkyColors.CardBg,
        textColor = Color.White
      ) {
        runStore.markLap()
      }
      if ((plan?.steps?.size ?: 0) > 1) {
        SmallPillButton("⏭", SparkyColors.CardBg, Color.White) { runStore.skipStep() }
      }
      SmallPillButton("⚙", SparkyColors.CardBg, SparkyColors.Muted) { showSettings = true }
      SmallPillButton("⏹", SparkyColors.Rose, Color.White) { runStore.finish() }
    }
  }
}

@Composable
private fun WatchRunSettingsSheet(
  settings: WatchRunSettings,
  paceAlert: Boolean,
  hrAlert: Boolean,
  onToggleAutoPause: () -> Unit,
  onToggleVoiceCues: () -> Unit,
  onTogglePaceAlert: () -> Unit,
  onToggleHrAlert: () -> Unit,
  onTestVoice: () -> Unit,
  onClose: () -> Unit
) {
  val listState = rememberScalingLazyListState()
  val onStr = stringResource(R.string.run_setting_on)
  val offStr = stringResource(R.string.run_setting_off)

  ScalingLazyColumn(
    state = listState,
    autoCentering = null,
    verticalArrangement = Arrangement.spacedBy(4.dp),
    modifier = Modifier
      .fillMaxSize()
      .background(Color.Black)
      .wearRotaryScroll(listState, isCurrentPage = true),
    contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 26.dp, bottom = 32.dp),
    horizontalAlignment = Alignment.CenterHorizontally
  ) {
    item {
      Text(stringResource(R.string.run_settings_title), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = SparkyColors.Cyan)
    }
    item {
      SmallPillButton(stringResource(R.string.common_done), SparkyColors.CardBg, Color.White, onClose)
    }
    item {
      SmallPillButton(
        label = stringResource(R.string.run_setting_auto_pause, if (settings.autoPause) onStr else offStr),
        color = if (settings.autoPause) SparkyColors.Green.copy(alpha = 0.25f) else SparkyColors.CardBg,
        textColor = if (settings.autoPause) SparkyColors.Green else Color.White,
        onClick = onToggleAutoPause
      )
    }
    item {
      SmallPillButton(
        label = stringResource(R.string.run_setting_voice_cues, if (settings.voiceCues) onStr else offStr),
        color = if (settings.voiceCues) SparkyColors.Cyan.copy(alpha = 0.25f) else SparkyColors.CardBg,
        textColor = if (settings.voiceCues) SparkyColors.Cyan else Color.White,
        onClick = onToggleVoiceCues
      )
    }
    item {
      SmallPillButton(
        label = stringResource(R.string.run_setting_pace_alerts, if (paceAlert) onStr else offStr),
        color = if (paceAlert) SparkyColors.Amber.copy(alpha = 0.25f) else SparkyColors.CardBg,
        textColor = if (paceAlert) SparkyColors.Amber else Color.White,
        onClick = onTogglePaceAlert
      )
    }
    item {
      SmallPillButton(
        label = stringResource(R.string.run_setting_hr_alerts, if (hrAlert) onStr else offStr),
        color = if (hrAlert) SparkyColors.Rose.copy(alpha = 0.25f) else SparkyColors.CardBg,
        textColor = if (hrAlert) SparkyColors.Rose else Color.White,
        onClick = onToggleHrAlert
      )
    }
    item {
      SmallPillButton(stringResource(R.string.run_setting_test_voice), SparkyColors.CardBg, SparkyColors.Muted, onTestVoice)
    }
  }
}

@Composable
private fun TreadmillDistanceView(
  estimatedMeters: Double,
  usesMiles: Boolean,
  onConfirm: (Double) -> Unit,
  onSkip: () -> Unit
) {
  val unitFactor = if (usesMiles) 1609.344 else 1000.0
  val unitLabel = if (usesMiles) "mi" else "km"
  var displayVal by remember {
    mutableDoubleStateOf(
      max(0.05, ((estimatedMeters / unitFactor) * 100.0).roundToInt() / 100.0)
    )
  }
  var showKeypad by remember { mutableStateOf(false) }

  if (showKeypad) {
    WatchKeypadSheet(
      title = stringResource(R.string.run_keypad_distance, unitLabel),
      initialValue = displayVal,
      allowDecimal = true,
      onConfirm = { v ->
        displayVal = max(0.01, v)
        showKeypad = false
      },
      onCancel = { showKeypad = false }
    )
    return
  }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(Color.Black)
      .wearRotaryStepper(isCurrentPage = true) { steps ->
        displayVal = max(0.01, ((displayVal + steps * 0.05) * 100.0).roundToInt() / 100.0)
        Haptics.click()
      }
      .padding(12.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center
  ) {
    Text(stringResource(R.string.run_treadmill_distance_title), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = SparkyColors.Cyan)
    Spacer(Modifier.height(4.dp))
    Row(
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
      RoundStepperButton("−") {
        displayVal = max(0.01, ((displayVal - 0.05) * 100.0).roundToInt() / 100.0)
        Haptics.click()
      }
      Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.clickable { showKeypad = true }
      ) {
        Text(
          text = String.format(Locale.US, "%.2f", displayVal),
          fontSize = 22.sp,
          fontWeight = FontWeight.Bold,
          color = Color.White
        )
        Text(unitLabel.uppercase(), fontSize = 9.sp, color = SparkyColors.Muted)
      }
      RoundStepperButton("+") {
        displayVal = ((displayVal + 0.05) * 100.0).roundToInt() / 100.0
        Haptics.click()
      }
    }
    Spacer(Modifier.height(8.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
      SmallPillButton(stringResource(R.string.common_skip), SparkyColors.CardBg, SparkyColors.Muted, onSkip)
      SmallPillButton(stringResource(R.string.common_save), SparkyColors.Green, Color.Black) {
        onConfirm(displayVal * unitFactor)
      }
    }
  }
}

fun formatDuration(totalSeconds: Int): String {
  val sec = max(0, totalSeconds)
  val hrs = sec / 3600
  val mins = (sec % 3600) / 60
  val rem = sec % 60
  return if (hrs > 0) {
    String.format(Locale.US, "%d:%02d:%02d", hrs, mins, rem)
  } else {
    String.format(Locale.US, "%02d:%02d", mins, rem)
  }
}
