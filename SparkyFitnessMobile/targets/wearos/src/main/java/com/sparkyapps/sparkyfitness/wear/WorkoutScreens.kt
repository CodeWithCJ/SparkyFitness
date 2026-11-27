package com.sparkyapps.sparkyfitness.wear

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.scrollable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberOverscrollEffect
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.DirectionsRun
import androidx.compose.material.icons.automirrored.rounded.VolumeUp
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.EmojiEvents
import androidx.compose.material.icons.rounded.EventAvailable
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FitnessCenter
import androidx.compose.material.icons.rounded.Flag
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.RadioButtonUnchecked
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material.icons.rounded.Timer
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.TransformingLazyColumn
import androidx.wear.compose.foundation.lazy.TransformingLazyColumnItemScope
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.itemsIndexed
import androidx.wear.compose.foundation.lazy.rememberTransformingLazyColumnState
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.Card
import androidx.wear.compose.material3.CardDefaults
import androidx.wear.compose.material3.CircularProgressIndicator
import androidx.wear.compose.material3.CompactButton
import androidx.wear.compose.material3.CompactButtonDefaults
import androidx.wear.compose.material3.EdgeButton
import androidx.wear.compose.material3.EdgeButtonSize
import androidx.wear.compose.material3.FilledIconButton
import androidx.wear.compose.material3.FilledTonalButton
import androidx.wear.compose.material3.FilledTonalIconButton
import androidx.wear.compose.material3.Icon
import androidx.wear.compose.material3.IconButtonDefaults
import androidx.wear.compose.material3.ListHeader
import androidx.wear.compose.material3.ListHeaderDefaults
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.SurfaceTransformation
import androidx.wear.compose.material3.Text
import androidx.wear.compose.material3.lazy.rememberTransformationSpec
import androidx.wear.compose.material3.lazy.transformedHeight
import androidx.wear.compose.material3.touchTargetAwareSize
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
  val columnState = rememberTransformingLazyColumnState()
  val transformationSpec = rememberTransformationSpec()
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

  SparkyListScaffold(columnState = columnState) { contentPadding ->
    TransformingLazyColumn(
      state = columnState,
      contentPadding = contentPadding,
      modifier = Modifier.fillMaxSize(),
      horizontalAlignment = Alignment.CenterHorizontally
    ) {
      item {
        ListHeader(
          modifier = Modifier
            .fillMaxWidth()
            .minimumVerticalContentPadding(
              ListHeaderDefaults.minimumTopListContentPadding,
              ListHeaderDefaults.minimumBottomListContentPadding
            )
            .transformedHeight(this, transformationSpec),
          transformation = SurfaceTransformation(transformationSpec)
        ) {
          SparkySectionHeader(
            title = stringResource(R.string.workout_title),
            icon = Icons.Rounded.FitnessCenter,
            accent = SparkyColors.Green
          )
        }
      }

      if (errorMessage != null) {
        item(key = "workout_start_error") {
          Card(
            onClick = { workoutStore.clearStartError() },
            modifier = Modifier
              .fillMaxWidth()
              .minimumVerticalContentPadding(CardDefaults.minimumVerticalListContentPadding)
              .transformedHeight(this, transformationSpec),
            transformation = SurfaceTransformation(transformationSpec),
            colors = CardDefaults.cardColors(
              containerColor = MaterialTheme.colorScheme.errorContainer
            )
          ) {
            Text(
              text = errorMessage ?: "",
              style = MaterialTheme.typography.bodySmall,
              color = MaterialTheme.colorScheme.onErrorContainer,
              textAlign = TextAlign.Center,
              modifier = Modifier.fillMaxWidth()
            )
          }
        }
      }

      item(key = "cardio_launcher") {
        Button(
          onClick = { showCardioLauncher = true },
          modifier = Modifier
            .fillMaxWidth()
            .minimumVerticalContentPadding(ButtonDefaults.minimumVerticalListContentPadding)
            .transformedHeight(this, transformationSpec),
          transformation = SurfaceTransformation(transformationSpec),
          colors = ButtonDefaults.buttonColors(
            containerColor = MaterialTheme.colorScheme.secondaryContainer,
            contentColor = MaterialTheme.colorScheme.onSurface,
            secondaryContentColor = SparkyColors.Cyan,
            iconColor = SparkyColors.Cyan
          ),
          icon = {
            Icon(
              imageVector = Icons.AutoMirrored.Rounded.DirectionsRun,
              contentDescription = null,
              modifier = Modifier.size(ButtonDefaults.IconSize)
            )
          },
          label = {
            Text(
              text = stringResource(R.string.workout_cardio_title),
              maxLines = 1,
              overflow = TextOverflow.Ellipsis
            )
          },
          secondaryLabel = {
            Text(
              text = stringResource(R.string.workout_cardio_subtitle),
              maxLines = 1,
              overflow = TextOverflow.Ellipsis
            )
          }
        )
      }

      if (scheduled.isEmpty() && startable.isEmpty()) {
        item {
          EmptyStateCard(
            message = stringResource(R.string.workout_empty_state),
            modifier = Modifier
              .minimumVerticalContentPadding(CardDefaults.minimumVerticalListContentPadding)
              .transformedHeight(this, transformationSpec)
          )
        }
      } else {
        items(scheduled, key = { "sched_${it.presetId}" }) { item ->
          val isStarting = startingId == item.presetId
          val meta = listOfNotNull(
            item.planName.takeIf { it.isNotBlank() },
            item.caption.takeIf { it.isNotBlank() }
          ).joinToString(" · ")

          Button(
            onClick = { workoutStore.requestStartPreset(item.presetId) },
            enabled = startingId == null,
            modifier = Modifier
              .fillMaxWidth()
              .minimumVerticalContentPadding(ButtonDefaults.minimumVerticalListContentPadding)
              .transformedHeight(this, transformationSpec),
            transformation = SurfaceTransformation(transformationSpec),
            colors = ButtonDefaults.buttonColors(
              containerColor = MaterialTheme.colorScheme.primaryContainer,
              contentColor = MaterialTheme.colorScheme.onSurface,
              secondaryContentColor = SparkyColors.Green,
              iconColor = SparkyColors.Green
            ),
            icon = {
              if (isStarting) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
              } else {
                Icon(
                  imageVector = Icons.Rounded.EventAvailable,
                  contentDescription = null,
                  modifier = Modifier.size(ButtonDefaults.IconSize)
                )
              }
            },
            label = {
              Text(
                text = item.name,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
              )
            },
            secondaryLabel = if (meta.isNotEmpty()) {
              {
                Text(
                  text = meta,
                  maxLines = 1,
                  overflow = TextOverflow.Ellipsis
                )
              }
            } else null
          )
        }

        items(startable, key = { "start_${it.presetId}" }) { item ->
          val isStarting = startingId == item.presetId
          Button(
            onClick = { workoutStore.requestStartPreset(item.presetId) },
            enabled = startingId == null,
            modifier = Modifier
              .fillMaxWidth()
              .minimumVerticalContentPadding(ButtonDefaults.minimumVerticalListContentPadding)
              .transformedHeight(this, transformationSpec),
            transformation = SurfaceTransformation(transformationSpec),
            colors = ButtonDefaults.filledTonalButtonColors(),
            icon = {
              if (isStarting) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
              } else {
                Icon(
                  imageVector = Icons.Rounded.PlayArrow,
                  contentDescription = null,
                  tint = SparkyColors.Green,
                  modifier = Modifier.size(ButtonDefaults.IconSize)
                )
              }
            },
            label = {
              Text(
                text = item.name,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
              )
            }
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
  val columnState = rememberTransformingLazyColumnState()
  val transformationSpec = rememberTransformationSpec()

  SparkyListScaffold(
    columnState = columnState,
    edgeButton = {
      EdgeButton(
        onClick = { onStart(kind, place, selectedPlan, paceAlert, hrAlert) },
        buttonSize = EdgeButtonSize.Medium,
        modifier = Modifier.scrollable(
          columnState,
          orientation = Orientation.Vertical,
          reverseDirection = true,
          overscrollEffect = rememberOverscrollEffect()
        )
      ) {
        Icon(
          imageVector = Icons.Rounded.PlayArrow,
          contentDescription = stringResource(R.string.cardio_start_btn),
          modifier = Modifier.size(ButtonDefaults.IconSize)
        )
      }
    }
  ) { contentPadding ->
    TransformingLazyColumn(
      state = columnState,
      contentPadding = contentPadding,
      modifier = Modifier
        .fillMaxSize()
        .background(Color.Black),
      horizontalAlignment = Alignment.CenterHorizontally
    ) {
      item {
        ListHeader(
          modifier = Modifier
            .fillMaxWidth()
            .minimumVerticalContentPadding(
              ListHeaderDefaults.minimumTopListContentPadding,
              ListHeaderDefaults.minimumBottomListContentPadding
            )
            .transformedHeight(this, transformationSpec),
          transformation = SurfaceTransformation(transformationSpec)
        ) {
          SparkySectionHeader(
            title = stringResource(R.string.cardio_start_title),
            icon = Icons.AutoMirrored.Rounded.DirectionsRun,
            accent = SparkyColors.Cyan
          )
        }
      }

      item {
        Row(
          modifier = Modifier
            .selectableGroup()
            .minimumVerticalContentPadding(CompactButtonDefaults.minimumVerticalListContentPadding)
            .transformedHeight(this, transformationSpec),
          horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
          CompactButton(
            onClick = { kind = "run" },
            modifier = Modifier.semantics {
              selected = kind == "run"
              role = Role.RadioButton
            },
            colors = if (kind == "run") {
              ButtonDefaults.buttonColors(containerColor = SparkyColors.Cyan, contentColor = Color.Black)
            } else ButtonDefaults.filledTonalButtonColors(),
            label = { Text(stringResource(R.string.cardio_kind_run)) }
          )
          CompactButton(
            onClick = { kind = "walk" },
            modifier = Modifier.semantics {
              selected = kind == "walk"
              role = Role.RadioButton
            },
            colors = if (kind == "walk") {
              ButtonDefaults.buttonColors(containerColor = SparkyColors.Cyan, contentColor = Color.Black)
            } else ButtonDefaults.filledTonalButtonColors(),
            label = { Text(stringResource(R.string.cardio_kind_walk)) }
          )
        }
      }

      item {
        Row(
          modifier = Modifier
            .selectableGroup()
            .minimumVerticalContentPadding(CompactButtonDefaults.minimumVerticalListContentPadding)
            .transformedHeight(this, transformationSpec),
          horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
          CompactButton(
            onClick = { place = "outdoor" },
            modifier = Modifier.semantics {
              selected = place == "outdoor"
              role = Role.RadioButton
            },
            colors = if (place == "outdoor") {
              ButtonDefaults.buttonColors(containerColor = SparkyColors.Green, contentColor = Color.Black)
            } else ButtonDefaults.filledTonalButtonColors(),
            label = { Text(stringResource(R.string.cardio_place_outdoor)) }
          )
          CompactButton(
            onClick = { place = "indoor" },
            modifier = Modifier.semantics {
              selected = place == "indoor"
              role = Role.RadioButton
            },
            colors = if (place == "indoor") {
              ButtonDefaults.buttonColors(containerColor = SparkyColors.Green, contentColor = Color.Black)
            } else ButtonDefaults.filledTonalButtonColors(),
            label = { Text(stringResource(R.string.cardio_place_indoor)) }
          )
        }
      }

      if (runPlans.isNotEmpty()) {
        item {
          val label = selectedPlan?.name ?: stringResource(R.string.cardio_plan_free)
          FilledTonalButton(
            onClick = {
              val idx = if (selectedPlan == null) 0 else (runPlans.indexOf(selectedPlan) + 1)
              selectedPlan = if (idx < runPlans.size) runPlans[idx] else null
            },
            modifier = Modifier
              .fillMaxWidth()
              .minimumVerticalContentPadding(ButtonDefaults.minimumVerticalListContentPadding)
              .transformedHeight(this, transformationSpec),
            transformation = SurfaceTransformation(transformationSpec),
            label = { Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis) }
          )
        }
      }

      item {
        Row(
          modifier = Modifier
            .minimumVerticalContentPadding(CompactButtonDefaults.minimumVerticalListContentPadding)
            .transformedHeight(this, transformationSpec),
          horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
          CompactButton(
            onClick = { paceAlert = !paceAlert },
            colors = if (paceAlert) {
              ButtonDefaults.buttonColors(
                containerColor = SparkyColors.Amber.copy(alpha = 0.28f),
                contentColor = SparkyColors.Amber
              )
            } else ButtonDefaults.filledTonalButtonColors(),
            label = {
              Text(if (paceAlert) stringResource(R.string.cardio_pace_checked) else stringResource(R.string.cardio_pace))
            }
          )
          CompactButton(
            onClick = { hrAlert = !hrAlert },
            colors = if (hrAlert) {
              ButtonDefaults.buttonColors(
                containerColor = SparkyColors.Rose.copy(alpha = 0.28f),
                contentColor = SparkyColors.Rose
              )
            } else ButtonDefaults.filledTonalButtonColors(),
            label = {
              Text(if (hrAlert) stringResource(R.string.cardio_hr_checked) else stringResource(R.string.cardio_hr))
            }
          )
        }
      }

      item {
        CompactButton(
          onClick = onCancel,
          modifier = Modifier
            .minimumVerticalContentPadding(CompactButtonDefaults.minimumVerticalListContentPadding)
            .transformedHeight(this, transformationSpec),
          colors = ButtonDefaults.outlinedButtonColors(),
          border = ButtonDefaults.outlinedButtonBorder(enabled = true),
          label = { Text(stringResource(R.string.cardio_back)) }
        )
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
  var showKeypadFor by remember { mutableStateOf<String?>(null) }

  if (phase == WorkoutSessionStore.Phase.ASKING_PRESET_UPDATE) {
    PresetUpdatePromptView(
      workoutName = plan?.workoutName ?: stringResource(R.string.workout_preset_fallback),
      onAnswer = { update -> workoutStore.answerPresetUpdate(update) }
    )
    return
  }

  if (phase == WorkoutSessionStore.Phase.COMPLETED && summary != null) {
    if (watchCtx.effectiveNewWorkout) {
      ScreenScaffold(timeText = {}) {
        WorkoutFinishSummaryView(
          summary = summary!!,
          workoutStore = workoutStore,
          watchCtx = watchCtx,
          onDone = { workoutStore.dismissSummary() }
        )
      }
    } else {
      WorkoutSummaryView(
        summary = summary!!,
        onDone = { workoutStore.dismissSummary() },
        energy = EnergyDisplay.of(watchCtx)
      )
    }
    return
  }

  // Keep custom New Workout View HUD intact inside a clean ScreenScaffold
  if (watchCtx.effectiveNewWorkout && !(steps.isEmpty() && plan != null)) {
    ScreenScaffold {
      NewActiveWorkoutView(
        checkInStore = checkInStore,
        workoutStore = workoutStore,
        isCurrentPage = isCurrentPage
      )
    }
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

  ScreenScaffold { contentPadding ->
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
        .padding(contentPadding)
        .padding(horizontal = 10.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.SpaceBetween
    ) {
      if (prBanner != null) {
        Text(
          text = prBanner!!,
          style = MaterialTheme.typography.labelMedium,
          fontWeight = FontWeight.Bold,
          color = SparkyColors.Amber
        )
      } else {
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.SpaceBetween,
          verticalAlignment = Alignment.CenterVertically
        ) {
          val formatTag = curPlan?.workoutFormat?.takeIf { it != "standard" }?.uppercase(Locale.US)
          val leftText = if (formatTag != null && capRemainingSec != null) {
            "$formatTag ${formatDuration(capRemainingSec!!)}"
          } else {
            formatDuration(elapsedSec)
          }
          Text(
            text = leftText,
            style = MaterialTheme.typography.labelSmall,
            color = if (formatTag != null) SparkyColors.Amber else MaterialTheme.colorScheme.onSurfaceVariant
          )
          Text(
            text = if (heartRate != null) {
              "♥ ${heartRate!!.toInt()}"
            } else {
              stringResource(R.string.workout_set_counter, step.setIndexInExercise, step.totalSetsInExercise)
            },
            style = MaterialTheme.typography.labelSmall,
            color = if (heartRate != null) SparkyColors.Rose else SparkyColors.Green
          )
        }
      }

      Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
          text = step.exerciseName,
          style = MaterialTheme.typography.titleSmall,
          fontWeight = FontWeight.Bold,
          color = MaterialTheme.colorScheme.onSurface,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis
        )
        Row(
          horizontalArrangement = Arrangement.spacedBy(4.dp),
          verticalAlignment = Alignment.CenterVertically
        ) {
          Text(
            text = stringResource(R.string.workout_set_counter, step.setIndexInExercise, step.totalSetsInExercise),
            style = MaterialTheme.typography.labelSmall,
            color = SparkyColors.Green
          )
          if (step.supersetRun != null) {
            Text(
              text = stringResource(R.string.workout_superset_badge, max(1, step.supersetRun + 1)),
              style = MaterialTheme.typography.labelSmall,
              fontWeight = FontWeight.Bold,
              color = SparkyColors.Purple
            )
          }
          val rawSetType = step.setType?.trim()?.takeIf { it.isNotEmpty() }
          if (rawSetType != null && !rawSetType.equals("normal", ignoreCase = true)) {
            val localizedSetType = localizedSetTypeLabel(rawSetType)
            Text(
              text = "· ${localizedSetType.uppercase(Locale.US)}",
              style = MaterialTheme.typography.labelSmall,
              fontWeight = FontWeight.Bold,
              color = SparkyColors.Amber
            )
          }
        }
      }

      if (step.timed) {
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
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = if (setTimerRunning) SparkyColors.Cyan else MaterialTheme.colorScheme.onSurface
          )
          if (!setTimerRunning) {
            RoundStepperButton("+5") { workoutStore.adjustDuration(5) }
          }
        }
      } else {
        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
          Column(
            modifier = Modifier
              .clip(RoundedCornerShape(10.dp))
              .background(if (adjustMode == "reps") SparkyColors.Green.copy(alpha = 0.24f) else MaterialTheme.colorScheme.surfaceContainer)
              .clickable {
                if (adjustMode == "reps") showKeypadFor = "reps" else adjustMode = "reps"
              }
              .padding(horizontal = 8.dp, vertical = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally
          ) {
            Text("$draftReps", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
            Text(stringResource(R.string.workout_reps_label), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
          }

          if (!step.bodyweight || step.weighted) {
            Column(
              modifier = Modifier
                .clip(RoundedCornerShape(10.dp))
                .background(if (adjustMode == "weight") SparkyColors.Green.copy(alpha = 0.24f) else MaterialTheme.colorScheme.surfaceContainer)
                .clickable {
                  if (adjustMode == "weight") showKeypadFor = "weight" else adjustMode = "weight"
                }
                .padding(horizontal = 8.dp, vertical = 4.dp),
              horizontalAlignment = Alignment.CenterHorizontally
            ) {
              Text(
                formatWorkoutLocaleDecimal(draftWeight, fractionDigits = 1),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
              )
              Text(unitLabel, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
          }

          if (step.carry) {
            val carryFactor = if (workoutStore.usesMiles) 1093.6133 else 1000.0
            val carryUnit = stringResource(
              if (workoutStore.usesMiles) R.string.workout_new_unit_yd else R.string.workout_new_unit_m
            )
            val distDisplay = String.format(Locale.getDefault(), "%.0f%s", draftDistanceKm * carryFactor, carryUnit)
            Column(
              modifier = Modifier
                .clip(RoundedCornerShape(10.dp))
                .background(if (adjustMode == "distance") SparkyColors.Cyan.copy(alpha = 0.24f) else MaterialTheme.colorScheme.surfaceContainer)
                .clickable { adjustMode = "distance" }
                .padding(horizontal = 6.dp, vertical = 4.dp),
              horizontalAlignment = Alignment.CenterHorizontally
            ) {
              Text(distDisplay, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
              Text(stringResource(R.string.workout_carry_label), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
          }

          val isDistanceAdjust = adjustMode == "distance" && step.carry
          val isWeightAdjust = adjustMode == "weight" && (!step.bodyweight || step.weighted)
          val decreaseDesc = stringResource(
            when {
              isDistanceAdjust -> R.string.stepper_decrease_distance
              isWeightAdjust -> R.string.stepper_decrease_weight
              else -> R.string.stepper_decrease_reps
            }
          )
          val increaseDesc = stringResource(
            when {
              isDistanceAdjust -> R.string.stepper_increase_distance
              isWeightAdjust -> R.string.stepper_increase_weight
              else -> R.string.stepper_increase_reps
            }
          )
          FilledTonalIconButton(
            onClick = {
              when {
                isDistanceAdjust -> workoutStore.adjustDistance(-1)
                isWeightAdjust -> workoutStore.adjustWeight(-1)
                else -> workoutStore.adjustReps(-1)
              }
            },
            modifier = Modifier.size(30.dp)
          ) {
            Icon(Icons.Rounded.Remove, contentDescription = decreaseDesc, modifier = Modifier.size(16.dp))
          }
          FilledTonalIconButton(
            onClick = {
              when {
                isDistanceAdjust -> workoutStore.adjustDistance(1)
                isWeightAdjust -> workoutStore.adjustWeight(1)
                else -> workoutStore.adjustReps(1)
              }
            },
            modifier = Modifier.size(30.dp)
          ) {
            Icon(Icons.Rounded.Add, contentDescription = increaseDesc, modifier = Modifier.size(16.dp))
          }
        }
      }

      Row(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically
      ) {
        FilledTonalIconButton(
          onClick = { showOptionsSheet = true },
          modifier = Modifier.size(34.dp)
        ) {
          Icon(Icons.Rounded.MoreHoriz, contentDescription = stringResource(R.string.workout_options_title))
        }
        if (step.timed) {
          CompactButton(
            onClick = {
              if (setTimerRunning) workoutStore.stopSetTimer() else workoutStore.startSetTimer()
            },
            colors = ButtonDefaults.buttonColors(
              containerColor = if (setTimerRunning) SparkyColors.Amber else SparkyColors.Cyan,
              contentColor = Color.Black
            ),
            label = {
              Text(
                if (setTimerRunning) stringResource(R.string.workout_timer_stop)
                else stringResource(R.string.workout_timer_start),
                maxLines = 1
              )
            }
          )
        }
        FilledIconButton(
          onClick = { workoutStore.completeCurrentSet() },
          colors = IconButtonDefaults.filledIconButtonColors(
            containerColor = SparkyColors.Green,
            contentColor = Color.Black
          ),
          modifier = Modifier.size(38.dp)
        ) {
          Icon(Icons.Rounded.Check, contentDescription = stringResource(R.string.workout_done_check))
        }
      }
    }
  }
}

private fun formatWorkoutLocaleDecimal(
  value: Double,
  fractionDigits: Int,
  locale: Locale = Locale.getDefault()
): String = java.text.NumberFormat.getNumberInstance(locale).apply {
  isGroupingUsed = false
  minimumFractionDigits = fractionDigits
  maximumFractionDigits = fractionDigits
}.format(value)

@Composable
private fun localizedSetTypeLabel(rawType: String): String = when (rawType.trim().lowercase(Locale.US)) {
  "normal" -> stringResource(R.string.workout_set_type_normal)
  "warmup", "warm-up" -> stringResource(R.string.workout_set_type_warmup)
  "drop", "drop set" -> stringResource(R.string.workout_set_type_drop)
  "failure" -> stringResource(R.string.workout_set_type_failure)
  else -> rawType.trim()
}

@Composable
private fun PresetUpdatePromptView(
  workoutName: String,
  onAnswer: (Boolean) -> Unit
) {
  ScreenScaffold { contentPadding ->
    Column(
      modifier = Modifier
        .fillMaxSize()
        .background(Color.Black)
        .padding(contentPadding)
        .padding(horizontal = 14.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.Center
    ) {
      Text(
        text = stringResource(R.string.workout_preset_update_title),
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.Bold,
        color = SparkyColors.Amber
      )
      Spacer(Modifier.height(4.dp))
      Text(
        text = stringResource(R.string.workout_preset_update_desc, workoutName),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = TextAlign.Center
      )
      Spacer(Modifier.height(10.dp))
      Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        CompactButton(
          onClick = { onAnswer(false) },
          colors = ButtonDefaults.filledTonalButtonColors(),
          label = { Text(stringResource(R.string.workout_preset_keep_old)) }
        )
        CompactButton(
          onClick = { onAnswer(true) },
          colors = ButtonDefaults.buttonColors(containerColor = SparkyColors.Green, contentColor = Color.Black),
          label = { Text(stringResource(R.string.workout_preset_update_btn)) }
        )
      }
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
  ScreenScaffold { contentPadding ->
    Column(
      modifier = Modifier
        .fillMaxSize()
        .padding(contentPadding)
        .padding(horizontal = 12.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.Center
    ) {
      if (prBanner != null) {
        Text(prBanner, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = SparkyColors.Amber)
        Spacer(Modifier.height(2.dp))
      }
      SparkySectionHeader(
        title = stringResource(R.string.workout_rest_title),
        icon = Icons.Rounded.Timer,
        accent = SparkyColors.Cyan
      )
      Text(
        text = formatDuration(remainingSeconds),
        style = MaterialTheme.typography.displaySmall,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.onSurface
      )
      if (heartRate != null) {
        Text("♥ ${heartRate.toInt()} bpm", style = MaterialTheme.typography.labelSmall, color = SparkyColors.Rose)
      }
      if (nextStep != null) {
        Spacer(Modifier.height(2.dp))
        Text(
          text = stringResource(R.string.workout_rest_next, nextStep.exerciseName, nextStep.setIndexInExercise),
          style = MaterialTheme.typography.labelSmall,
          color = MaterialTheme.colorScheme.onSurfaceVariant,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis
        )
      }
      Spacer(Modifier.height(8.dp))
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        CompactButton(
          onClick = onAdd15,
          colors = ButtonDefaults.filledTonalButtonColors(),
          label = { Text(stringResource(R.string.workout_rest_add_15)) }
        )
        CompactButton(
          onClick = onSkip,
          colors = ButtonDefaults.buttonColors(containerColor = SparkyColors.Cyan, contentColor = Color.Black),
          label = { Text(stringResource(R.string.common_skip)) }
        )
      }
    }
  }
}

@Composable
private fun RpePromptView(
  onSubmit: (Double) -> Unit,
  onSkip: () -> Unit
) {
  var rpe by remember { mutableDoubleStateOf(8.0) }
  ScreenScaffold { contentPadding ->
    Column(
      modifier = Modifier
        .fillMaxSize()
        .wearRotaryStepper(isCurrentPage = true) { steps ->
          rpe = (rpe + steps * 0.5).coerceIn(5.0, 10.0)
          Haptics.click()
        }
        .padding(contentPadding)
        .padding(horizontal = 12.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.Center
    ) {
      Text(
        text = stringResource(R.string.workout_rpe_title),
        style = MaterialTheme.typography.titleSmall,
        color = SparkyColors.Amber
      )
      Spacer(Modifier.height(6.dp))
      Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
      ) {
        FilledTonalIconButton(
          onClick = { rpe = max(5.0, rpe - 0.5) },
          modifier = Modifier.size(34.dp)
        ) {
          Icon(Icons.Rounded.Remove, contentDescription = stringResource(R.string.stepper_decrease_effort))
        }
        Text(
          text = formatWorkoutLocaleDecimal(rpe, fractionDigits = 1),
          style = MaterialTheme.typography.titleLarge,
          fontWeight = FontWeight.Bold,
          color = MaterialTheme.colorScheme.onSurface
        )
        FilledTonalIconButton(
          onClick = { rpe = min(10.0, rpe + 0.5) },
          modifier = Modifier.size(34.dp)
        ) {
          Icon(Icons.Rounded.Add, contentDescription = stringResource(R.string.stepper_increase_effort))
        }
      }
      Spacer(Modifier.height(8.dp))
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        CompactButton(
          onClick = onSkip,
          colors = ButtonDefaults.filledTonalButtonColors(),
          label = { Text(stringResource(R.string.common_skip)) }
        )
        CompactButton(
          onClick = { onSubmit(rpe) },
          colors = ButtonDefaults.buttonColors(containerColor = SparkyColors.Amber, contentColor = Color.Black),
          label = { Text(stringResource(R.string.common_save)) }
        )
      }
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
  ScreenScaffold { contentPadding ->
    Column(
      modifier = Modifier
        .fillMaxSize()
        .padding(contentPadding)
        .padding(horizontal = 12.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.Center
    ) {
      Text(
        text = title,
        style = MaterialTheme.typography.titleSmall,
        color = SparkyColors.Green,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis
      )
      Spacer(Modifier.height(4.dp))
      Text(
        text = formatDuration(elapsedSeconds),
        style = MaterialTheme.typography.displaySmall,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.onSurface
      )
      Spacer(Modifier.height(4.dp))
      Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
          text = if (heartRate != null) "♥ ${heartRate.toInt()}" else "♥ --",
          style = MaterialTheme.typography.labelMedium,
          color = SparkyColors.Rose
        )
        Text(
          text = "${energy.value(calories).toInt()} ${energy.unit}",
          style = MaterialTheme.typography.labelMedium,
          color = SparkyColors.Amber
        )
      }
      Spacer(Modifier.height(10.dp))
      CompactButton(
        onClick = onFinish,
        colors = ButtonDefaults.buttonColors(containerColor = SparkyColors.Rose, contentColor = Color.White),
        icon = {
          Icon(
            Icons.Rounded.Stop,
            contentDescription = null,
            modifier = Modifier.size(CompactButtonDefaults.ExtraSmallIconSize)
          )
        },
        label = { Text(stringResource(R.string.workout_end_btn)) }
      )
    }
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
  val columnState = rememberTransformingLazyColumnState()
  val addColumnState = rememberTransformingLazyColumnState()
  val transformationSpec = rememberTransformationSpec()
  val currentStep = steps.getOrNull(currentIndex)

  BackHandler {
    if (showAddExercisePicker) {
      showAddExercisePicker = false
    } else {
      onClose()
    }
  }

  if (showAddExercisePicker) {
    SparkyListScaffold(
      columnState = addColumnState,
      edgeButton = {
        EdgeButton(
          onClick = { showAddExercisePicker = false },
          buttonSize = EdgeButtonSize.Small,
          modifier = Modifier.scrollable(
            addColumnState,
            orientation = Orientation.Vertical,
            reverseDirection = true,
            overscrollEffect = rememberOverscrollEffect()
          )
        ) {
          Text(stringResource(R.string.common_cancel))
        }
      }
    ) { contentPadding ->
      TransformingLazyColumn(
        state = addColumnState,
        contentPadding = contentPadding,
        modifier = Modifier
          .fillMaxSize()
          .background(Color.Black),
        horizontalAlignment = Alignment.CenterHorizontally
      ) {
        item {
          ListHeader(
            modifier = Modifier
              .fillMaxWidth()
              .minimumVerticalContentPadding(
                ListHeaderDefaults.minimumTopListContentPadding,
                ListHeaderDefaults.minimumBottomListContentPadding
              )
              .transformedHeight(this, transformationSpec),
            transformation = SurfaceTransformation(transformationSpec)
          ) {
            Text(
              text = stringResource(R.string.workout_add_exercise_title),
              style = MaterialTheme.typography.titleSmall,
              color = SparkyColors.Cyan
            )
          }
        }
        item {
          CompactButton(
            onClick = { showAddExercisePicker = false },
            modifier = Modifier
              .minimumVerticalContentPadding(CompactButtonDefaults.minimumVerticalListContentPadding)
              .transformedHeight(this, transformationSpec),
            colors = ButtonDefaults.filledTonalButtonColors(),
            icon = {
              Icon(
                imageVector = Icons.Rounded.Close,
                contentDescription = null,
                modifier = Modifier.size(14.dp)
              )
            },
            label = { Text(stringResource(R.string.cardio_back), maxLines = 1) }
          )
        }
        if (suggestedExercises.isEmpty()) {
          item {
            EmptyStateCard(
              message = stringResource(R.string.workout_no_recent_exercises),
              modifier = Modifier
                .minimumVerticalContentPadding(CardDefaults.minimumVerticalListContentPadding)
                .transformedHeight(this, transformationSpec)
            )
          }
        } else {
          items(suggestedExercises, key = { it.exerciseId }) { ex ->
            Button(
              onClick = {
                showAddExercisePicker = false
                onEditAction(WorkoutEditAction.AddExercise(ex.exerciseId))
              },
              modifier = Modifier
                .fillMaxWidth()
                .minimumVerticalContentPadding(ButtonDefaults.minimumVerticalListContentPadding)
                .transformedHeight(this, transformationSpec),
              transformation = SurfaceTransformation(transformationSpec),
              colors = ButtonDefaults.filledTonalButtonColors(),
              icon = {
                Icon(Icons.Rounded.Add, contentDescription = null, tint = SparkyColors.Green)
              },
              label = { Text(ex.name, maxLines = 1, overflow = TextOverflow.Ellipsis) }
            )
          }
        }
      }
    }
    return
  }

  SparkyListScaffold(
    columnState = columnState,
    edgeButton = {
      EdgeButton(
        onClick = onClose,
        buttonSize = EdgeButtonSize.Small,
        modifier = Modifier.scrollable(
          columnState,
          orientation = Orientation.Vertical,
          reverseDirection = true,
          overscrollEffect = rememberOverscrollEffect()
        )
      ) {
        Text(stringResource(R.string.common_done))
      }
    }
  ) { contentPadding ->
    TransformingLazyColumn(
      state = columnState,
      contentPadding = contentPadding,
      modifier = Modifier
        .fillMaxSize()
        .background(Color.Black),
      horizontalAlignment = Alignment.CenterHorizontally
    ) {
      item {
        ListHeader(
          modifier = Modifier
            .fillMaxWidth()
            .minimumVerticalContentPadding(
              ListHeaderDefaults.minimumTopListContentPadding,
              ListHeaderDefaults.minimumBottomListContentPadding
            )
            .transformedHeight(this, transformationSpec),
          transformation = SurfaceTransformation(transformationSpec)
        ) {
          Text(
            text = stringResource(R.string.workout_options_title),
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.onSurface
          )
        }
      }
      item {
        CompactButton(
          onClick = onClose,
          modifier = Modifier
            .minimumVerticalContentPadding(CompactButtonDefaults.minimumVerticalListContentPadding)
            .transformedHeight(this, transformationSpec),
          colors = ButtonDefaults.filledTonalButtonColors(),
          icon = {
            Icon(
              imageVector = Icons.Rounded.Close,
              contentDescription = null,
              modifier = Modifier.size(14.dp)
            )
          },
          label = { Text(stringResource(R.string.common_close), maxLines = 1) }
        )
      }

      if (currentStep != null) {
        item {
          Row(
            modifier = Modifier
              .minimumVerticalContentPadding(CompactButtonDefaults.minimumVerticalListContentPadding)
              .transformedHeight(this, transformationSpec),
            horizontalArrangement = Arrangement.spacedBy(5.dp)
          ) {
            CompactButton(
              onClick = { onEditAction(WorkoutEditAction.AddSet(currentStep.exerciseEntryId)) },
              colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.secondaryContainer,
                contentColor = SparkyColors.Cyan
              ),
              label = { Text(stringResource(R.string.workout_add_set)) }
            )
            val setTypes = listOf("normal", "warmup", "drop", "failure")
            val rawCurType = currentStep.setType?.trim()?.takeIf { it.isNotEmpty() } ?: "normal"
            val normalizedCurType = when (rawCurType.lowercase(Locale.US)) {
              "warm-up" -> "warmup"
              "drop set" -> "drop"
              else -> rawCurType.lowercase(Locale.US)
            }
            val curIdx = setTypes.indexOf(normalizedCurType)
            val nextType = setTypes[(if (curIdx >= 0) curIdx + 1 else 0) % setTypes.size]
            val localizedCurType = localizedSetTypeLabel(rawCurType)
            CompactButton(
              onClick = { onEditAction(WorkoutEditAction.SetSetType(currentStep.setId, nextType)) },
              colors = ButtonDefaults.filledTonalButtonColors(),
              label = { Text(stringResource(R.string.workout_set_type_label, localizedCurType)) }
            )
          }
        }

        if (currentStep.totalSetsInExercise > 1) {
          item {
            FilledTonalButton(
              onClick = { onEditAction(WorkoutEditAction.DeleteSet(currentStep.setId)) },
              modifier = Modifier
                .fillMaxWidth()
                .minimumVerticalContentPadding(ButtonDefaults.minimumVerticalListContentPadding)
                .transformedHeight(this, transformationSpec),
              transformation = SurfaceTransformation(transformationSpec),
              colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.errorContainer,
                contentColor = SparkyColors.Rose,
                iconColor = SparkyColors.Rose
              ),
              icon = { Icon(Icons.Rounded.DeleteOutline, contentDescription = null) },
              label = { Text(stringResource(R.string.workout_delete_set)) }
            )
          }
        }
      }

      if (suggestedExercises.isNotEmpty()) {
        item {
          FilledTonalButton(
            onClick = { showAddExercisePicker = true },
            modifier = Modifier
              .fillMaxWidth()
              .minimumVerticalContentPadding(ButtonDefaults.minimumVerticalListContentPadding)
              .transformedHeight(this, transformationSpec),
            transformation = SurfaceTransformation(transformationSpec),
            icon = { Icon(Icons.Rounded.Add, contentDescription = null, tint = SparkyColors.Green) },
            label = { Text(stringResource(R.string.workout_add_exercise_btn)) }
          )
        }
      }

      if (currentStep != null && steps.map { it.exerciseEntryId }.distinct().size > 1) {
        item {
          FilledTonalButton(
            onClick = { onEditAction(WorkoutEditAction.DeleteExercise(currentStep.exerciseEntryId)) },
            modifier = Modifier
              .fillMaxWidth()
              .minimumVerticalContentPadding(ButtonDefaults.minimumVerticalListContentPadding)
              .transformedHeight(this, transformationSpec),
            transformation = SurfaceTransformation(transformationSpec),
            colors = ButtonDefaults.buttonColors(
              containerColor = MaterialTheme.colorScheme.errorContainer,
              contentColor = SparkyColors.Rose,
              iconColor = SparkyColors.Rose
            ),
            icon = { Icon(Icons.Rounded.DeleteOutline, contentDescription = null) },
            label = { Text(stringResource(R.string.workout_delete_exercise)) }
          )
        }
      }

      item {
        FilledTonalButton(
          onClick = onSkipExercise,
          modifier = Modifier
            .fillMaxWidth()
            .minimumVerticalContentPadding(ButtonDefaults.minimumVerticalListContentPadding)
            .transformedHeight(this, transformationSpec),
          transformation = SurfaceTransformation(transformationSpec),
          icon = { Icon(Icons.Rounded.SkipNext, contentDescription = null, tint = SparkyColors.Amber) },
          label = { Text(stringResource(R.string.workout_skip_exercise)) }
        )
      }
      item {
        Button(
          onClick = onFinishWorkout,
          modifier = Modifier
            .fillMaxWidth()
            .minimumVerticalContentPadding(ButtonDefaults.minimumVerticalListContentPadding)
            .transformedHeight(this, transformationSpec),
          transformation = SurfaceTransformation(transformationSpec),
          colors = ButtonDefaults.buttonColors(containerColor = SparkyColors.Green, contentColor = Color.Black),
          icon = { Icon(Icons.Rounded.Check, contentDescription = null) },
          label = { Text(stringResource(R.string.workout_finish_btn)) }
        )
      }
      item {
        FilledTonalButton(
          onClick = onDiscardWorkout,
          modifier = Modifier
            .fillMaxWidth()
            .minimumVerticalContentPadding(ButtonDefaults.minimumVerticalListContentPadding)
            .transformedHeight(this, transformationSpec),
          transformation = SurfaceTransformation(transformationSpec),
          colors = ButtonDefaults.buttonColors(
            containerColor = MaterialTheme.colorScheme.errorContainer,
            contentColor = SparkyColors.Rose,
            iconColor = SparkyColors.Rose
          ),
          icon = { Icon(Icons.Rounded.DeleteOutline, contentDescription = null) },
          label = { Text(stringResource(R.string.workout_discard_btn)) }
        )
      }

      itemsIndexed(steps) { idx, st ->
        val isCur = idx == currentIndex
        Button(
          onClick = { onJumpToStep(idx) },
          modifier = Modifier
            .fillMaxWidth()
            .minimumVerticalContentPadding(ButtonDefaults.minimumVerticalListContentPadding)
            .transformedHeight(this, transformationSpec),
          transformation = SurfaceTransformation(transformationSpec),
          colors = if (isCur) {
            ButtonDefaults.buttonColors(
              containerColor = MaterialTheme.colorScheme.primaryContainer,
              contentColor = MaterialTheme.colorScheme.onSurface,
              secondaryContentColor = SparkyColors.Green
            )
          } else ButtonDefaults.filledTonalButtonColors(),
          label = { Text(st.exerciseName, maxLines = 1, overflow = TextOverflow.Ellipsis) },
          secondaryLabel = { Text(stringResource(R.string.workout_step_set_short, st.setIndexInExercise)) }
        )
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
  ScreenScaffold { contentPadding ->
    Column(
      modifier = Modifier
        .fillMaxSize()
        .padding(contentPadding)
        .padding(horizontal = 14.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.Center
    ) {
      Icon(
        imageVector = Icons.Rounded.EmojiEvents,
        contentDescription = null,
        tint = SparkyColors.Green,
        modifier = Modifier.size(24.dp)
      )
      Spacer(Modifier.height(4.dp))
      Text(
        text = stringResource(R.string.workout_complete_title),
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.Bold,
        color = SparkyColors.Green
      )
      Text(
        text = summary.workoutName,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurface,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis
      )
      Spacer(Modifier.height(4.dp))
      Text(
        text = pluralStringResource(
          R.plurals.workout_summary_sets_duration,
          summary.setsCompleted,
          summary.setsCompleted,
          formatDuration(summary.durationSeconds)
        ),
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant
      )
      if (summary.averageBpm != null || summary.activeEnergyKcal != null) {
        val parts = mutableListOf<String>()
        summary.averageBpm?.let { parts.add(stringResource(R.string.workout_summary_avg_hr, it.toInt())) }
        summary.activeEnergyKcal?.let { parts.add("${energy.value(it).toInt()} ${energy.unit}") }
        Text(parts.joinToString(" · "), style = MaterialTheme.typography.labelSmall, color = SparkyColors.Amber)
      }
      Spacer(Modifier.height(8.dp))
      CompactButton(
        onClick = onDone,
        colors = ButtonDefaults.buttonColors(containerColor = SparkyColors.Green, contentColor = Color.Black),
        label = { Text(stringResource(R.string.common_done)) }
      )
    }
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

  ScreenScaffold { contentPadding ->
    Column(
      modifier = Modifier
        .fillMaxSize()
        .padding(contentPadding)
        .padding(horizontal = 10.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.Center
    ) {
      Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
      ) {
        Text(
          text = activityLabel,
          style = MaterialTheme.typography.titleSmall,
          color = SparkyColors.Cyan
        )
        if (liveHr != null) {
          Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(2.dp)
          ) {
            Icon(Icons.Rounded.Favorite, contentDescription = null, tint = SparkyColors.Rose, modifier = Modifier.size(12.dp))
            Text(
              text = "${liveHr!!.toInt()}",
              style = MaterialTheme.typography.labelMedium,
              fontWeight = FontWeight.Bold,
              color = SparkyColors.Rose
            )
          }
        }
      }
      Text(
        text = formatDuration(elapsedSeconds),
        style = MaterialTheme.typography.titleLarge,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.onSurface
      )
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
          text = distDisplay,
          style = MaterialTheme.typography.labelMedium,
          fontWeight = FontWeight.SemiBold,
          color = SparkyColors.Green
        )
        if (paceDisplay != null) {
          Text(
            text = paceDisplay,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
          )
        }
      }
      if (state.interval != null) {
        Text(
          text = "${state.interval.label}: ${formatDuration(state.interval.remaining.toInt())}",
          style = MaterialTheme.typography.labelSmall,
          color = SparkyColors.Amber,
          maxLines = 1
        )
      }
      Spacer(Modifier.height(8.dp))
      Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
      ) {
        FilledIconButton(
          onClick = { recordingStore.sendAction(if (isPaused) "resume" else "pause") },
          shapes = IconButtonDefaults.animatedShapes(),
          colors = IconButtonDefaults.filledIconButtonColors(
            containerColor = if (isPaused) SparkyColors.Green else SparkyColors.Amber,
            contentColor = Color.Black
          ),
          modifier = Modifier.size(38.dp)
        ) {
          Icon(
            imageVector = if (isPaused) Icons.Rounded.PlayArrow else Icons.Rounded.Pause,
            contentDescription = stringResource(if (isPaused) R.string.recording_resume else R.string.recording_pause)
          )
        }
        CompactButton(
          onClick = { recordingStore.sendAction("lap") },
          colors = ButtonDefaults.filledTonalButtonColors(),
          icon = {
            Icon(
              Icons.Rounded.Flag,
              contentDescription = null,
              modifier = Modifier.size(CompactButtonDefaults.ExtraSmallIconSize)
            )
          },
          label = {
            Text(
              if (state.lapCount > 0) stringResource(R.string.recording_lap_count, state.lapCount)
              else stringResource(R.string.recording_lap)
            )
          }
        )
        FilledIconButton(
          onClick = { recordingStore.sendAction("finish") },
          shapes = IconButtonDefaults.animatedShapes(),
          colors = IconButtonDefaults.filledIconButtonColors(
            containerColor = SparkyColors.Rose,
            contentColor = Color.White
          ),
          modifier = Modifier.size(38.dp)
        ) {
          Icon(Icons.Rounded.Stop, contentDescription = stringResource(R.string.recording_stop))
        }
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
    ScreenScaffold { contentPadding ->
      Column(
        modifier = Modifier
          .fillMaxSize()
          .padding(contentPadding)
          .padding(horizontal = 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
      ) {
        Icon(Icons.Rounded.CheckCircle, contentDescription = null, tint = SparkyColors.Green, modifier = Modifier.size(24.dp))
        Spacer(Modifier.height(4.dp))
        Text(
          text = stringResource(R.string.run_saved_title),
          style = MaterialTheme.typography.titleSmall,
          fontWeight = FontWeight.Bold,
          color = SparkyColors.Green
        )
        Text(
          text = "$distLabel · ${formatDuration(elapsed)}",
          style = MaterialTheme.typography.bodyMedium,
          color = MaterialTheme.colorScheme.onSurface
        )
        if (lapCount > 0) {
          Text(
            text = pluralStringResource(R.plurals.run_laps_count, lapCount, lapCount),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
          )
        }
        Spacer(Modifier.height(10.dp))
        CompactButton(
          onClick = { runStore.dismiss() },
          colors = ButtonDefaults.buttonColors(containerColor = SparkyColors.Green, contentColor = Color.Black),
          label = { Text(stringResource(R.string.common_done)) }
        )
      }
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

  ScreenScaffold { contentPadding ->
    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
      val hasMultiStep = (plan?.steps?.size ?: 0) > 1
      val compactHeight = maxHeight < 205.dp
      val isPaused = phase == WatchRunStore.RunPhase.PAUSED
      val lapDescription = if (lapCount > 0) {
        stringResource(R.string.recording_lap_count, lapCount)
      } else {
        stringResource(R.string.recording_lap)
      }

      Column(
        modifier = Modifier
          .fillMaxSize()
          .padding(contentPadding)
          .padding(horizontal = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween
      ) {
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
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = if (autoPaused || alertBanner != null) SparkyColors.Amber else SparkyColors.Cyan,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
          )
        }

        Text(
          text = if (stepRemaining != null) formatDuration(stepRemaining!!) else formatDuration(elapsed),
          style = if (compactHeight) {
            MaterialTheme.typography.titleMedium
          } else {
            MaterialTheme.typography.titleLarge
          },
          fontWeight = FontWeight.Bold,
          color = MaterialTheme.colorScheme.onSurface
        )

        Column(horizontalAlignment = Alignment.CenterHorizontally) {
          Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
              text = distDisplay,
              style = MaterialTheme.typography.titleSmall,
              fontWeight = FontWeight.SemiBold,
              color = SparkyColors.Green
            )
            if (paceDisplay != null) {
              Text(
                text = paceDisplay,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
              )
            }
          }
          if (heartRate != null) {
            Text("♥ ${heartRate!!.toInt()} bpm", style = MaterialTheme.typography.labelSmall, color = SparkyColors.Rose)
          }
        }

        // Always lay out active run controls in two rows with dedicated 48dp touch targets
        // so Finish never shares or overlaps hit bounds with Pause/Resume, Lap, Skip, or Settings.
        Column(
          horizontalAlignment = Alignment.CenterHorizontally,
          verticalArrangement = Arrangement.spacedBy(0.dp)
        ) {
          if (hasMultiStep) {
            Row(
              horizontalArrangement = Arrangement.spacedBy(4.dp),
              verticalAlignment = Alignment.CenterVertically
            ) {
              FilledIconButton(
                onClick = { if (isPaused) runStore.resume() else runStore.pause() },
                shapes = IconButtonDefaults.animatedShapes(),
                colors = IconButtonDefaults.filledIconButtonColors(
                  containerColor = if (isPaused) SparkyColors.Green else SparkyColors.Amber,
                  contentColor = Color.Black
                ),
                modifier = Modifier.touchTargetAwareSize(34.dp)
              ) {
                Icon(
                  imageVector = if (isPaused) Icons.Rounded.PlayArrow else Icons.Rounded.Pause,
                  contentDescription = stringResource(
                    if (isPaused) R.string.recording_resume else R.string.recording_pause
                  ),
                  modifier = Modifier.size(18.dp)
                )
              }
              FilledTonalIconButton(
                onClick = { runStore.markLap() },
                modifier = Modifier
                  .touchTargetAwareSize(32.dp)
                  .semantics { contentDescription = lapDescription }
              ) {
                if (lapCount > 0) {
                  Text(
                    "L$lapCount",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.clearAndSetSemantics {}
                  )
                } else {
                  Icon(Icons.Rounded.Flag, contentDescription = null, modifier = Modifier.size(15.dp))
                }
              }
              FilledIconButton(
                onClick = { runStore.finish() },
                shapes = IconButtonDefaults.animatedShapes(),
                colors = IconButtonDefaults.filledIconButtonColors(
                  containerColor = SparkyColors.Rose,
                  contentColor = Color.White
                ),
                modifier = Modifier.touchTargetAwareSize(34.dp)
              ) {
                Icon(
                  Icons.Rounded.Stop,
                  contentDescription = stringResource(R.string.workout_finish_btn),
                  modifier = Modifier.size(18.dp)
                )
              }
            }
            Row(
              horizontalArrangement = Arrangement.spacedBy(8.dp),
              verticalAlignment = Alignment.CenterVertically
            ) {
              FilledTonalIconButton(
                onClick = { runStore.skipStep() },
                modifier = Modifier.touchTargetAwareSize(32.dp)
              ) {
                Icon(
                  Icons.Rounded.SkipNext,
                  contentDescription = stringResource(R.string.workout_new_tile_skip),
                  modifier = Modifier.size(16.dp)
                )
              }
              FilledTonalIconButton(
                onClick = { showSettings = true },
                modifier = Modifier.touchTargetAwareSize(32.dp)
              ) {
                Icon(
                  Icons.Rounded.Settings,
                  contentDescription = stringResource(R.string.run_settings_title),
                  modifier = Modifier.size(16.dp)
                )
              }
            }
          } else {
            Row(
              horizontalArrangement = Arrangement.spacedBy(12.dp),
              verticalAlignment = Alignment.CenterVertically
            ) {
              FilledIconButton(
                onClick = { if (isPaused) runStore.resume() else runStore.pause() },
                shapes = IconButtonDefaults.animatedShapes(),
                colors = IconButtonDefaults.filledIconButtonColors(
                  containerColor = if (isPaused) SparkyColors.Green else SparkyColors.Amber,
                  contentColor = Color.Black
                ),
                modifier = Modifier.touchTargetAwareSize(36.dp)
              ) {
                Icon(
                  imageVector = if (isPaused) Icons.Rounded.PlayArrow else Icons.Rounded.Pause,
                  contentDescription = stringResource(
                    if (isPaused) R.string.recording_resume else R.string.recording_pause
                  ),
                  modifier = Modifier.size(18.dp)
                )
              }
              FilledTonalIconButton(
                onClick = { runStore.markLap() },
                modifier = Modifier
                  .touchTargetAwareSize(34.dp)
                  .semantics { contentDescription = lapDescription }
              ) {
                if (lapCount > 0) {
                  Text(
                    "L$lapCount",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.clearAndSetSemantics {}
                  )
                } else {
                  Icon(Icons.Rounded.Flag, contentDescription = null, modifier = Modifier.size(15.dp))
                }
              }
            }
            Row(
              horizontalArrangement = Arrangement.spacedBy(12.dp),
              verticalAlignment = Alignment.CenterVertically
            ) {
              FilledTonalIconButton(
                onClick = { showSettings = true },
                modifier = Modifier.touchTargetAwareSize(34.dp)
              ) {
                Icon(
                  Icons.Rounded.Settings,
                  contentDescription = stringResource(R.string.run_settings_title),
                  modifier = Modifier.size(16.dp)
                )
              }
              FilledIconButton(
                onClick = { runStore.finish() },
                shapes = IconButtonDefaults.animatedShapes(),
                colors = IconButtonDefaults.filledIconButtonColors(
                  containerColor = SparkyColors.Rose,
                  contentColor = Color.White
                ),
                modifier = Modifier.touchTargetAwareSize(36.dp)
              ) {
                Icon(
                  Icons.Rounded.Stop,
                  contentDescription = stringResource(R.string.workout_finish_btn),
                  modifier = Modifier.size(18.dp)
                )
              }
            }
          }
        }
      }
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
  val columnState = rememberTransformingLazyColumnState()
  val transformationSpec = rememberTransformationSpec()
  val onStr = stringResource(R.string.run_setting_on)
  val offStr = stringResource(R.string.run_setting_off)

  SparkyListScaffold(
    columnState = columnState,
    edgeButton = {
      EdgeButton(
        onClick = onClose,
        buttonSize = EdgeButtonSize.Small,
        modifier = Modifier.scrollable(
          columnState,
          orientation = Orientation.Vertical,
          reverseDirection = true,
          overscrollEffect = rememberOverscrollEffect()
        )
      ) {
        Text(stringResource(R.string.common_done))
      }
    }
  ) { contentPadding ->
    TransformingLazyColumn(
      state = columnState,
      contentPadding = contentPadding,
      modifier = Modifier
        .fillMaxSize()
        .background(Color.Black),
      horizontalAlignment = Alignment.CenterHorizontally
    ) {
      item {
        ListHeader(
          modifier = Modifier
            .fillMaxWidth()
            .minimumVerticalContentPadding(
              ListHeaderDefaults.minimumTopListContentPadding,
              ListHeaderDefaults.minimumBottomListContentPadding
            )
            .transformedHeight(this, transformationSpec),
          transformation = SurfaceTransformation(transformationSpec)
        ) {
          SparkySectionHeader(
            title = stringResource(R.string.run_settings_title),
            icon = Icons.Rounded.Settings,
            accent = SparkyColors.Cyan
          )
        }
      }

      @Composable
      fun TransformingLazyColumnItemScope.SettingToggleRow(
        label: String,
        active: Boolean,
        accent: Color,
        onClick: () -> Unit,
        modifier: Modifier
      ) {
        Button(
          onClick = onClick,
          modifier = modifier,
          transformation = SurfaceTransformation(transformationSpec),
          colors = ButtonDefaults.buttonColors(
            containerColor = if (active) accent.copy(alpha = 0.22f) else MaterialTheme.colorScheme.surfaceContainer,
            contentColor = MaterialTheme.colorScheme.onSurface,
            iconColor = if (active) accent else MaterialTheme.colorScheme.onSurfaceVariant
          ),
          icon = {
            Icon(
              imageVector = if (active) Icons.Rounded.CheckCircle else Icons.Rounded.RadioButtonUnchecked,
              contentDescription = null,
              modifier = Modifier.size(ButtonDefaults.IconSize)
            )
          },
          label = { Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        )
      }

      item {
        SettingToggleRow(
          label = stringResource(R.string.run_setting_auto_pause, if (settings.autoPause) onStr else offStr),
          active = settings.autoPause,
          accent = SparkyColors.Green,
          onClick = onToggleAutoPause,
          modifier = Modifier
            .fillMaxWidth()
            .minimumVerticalContentPadding(ButtonDefaults.minimumVerticalListContentPadding)
            .transformedHeight(this, transformationSpec)
        )
      }
      item {
        SettingToggleRow(
          label = stringResource(R.string.run_setting_voice_cues, if (settings.voiceCues) onStr else offStr),
          active = settings.voiceCues,
          accent = SparkyColors.Cyan,
          onClick = onToggleVoiceCues,
          modifier = Modifier
            .fillMaxWidth()
            .minimumVerticalContentPadding(ButtonDefaults.minimumVerticalListContentPadding)
            .transformedHeight(this, transformationSpec)
        )
      }
      item {
        SettingToggleRow(
          label = stringResource(R.string.run_setting_pace_alerts, if (paceAlert) onStr else offStr),
          active = paceAlert,
          accent = SparkyColors.Amber,
          onClick = onTogglePaceAlert,
          modifier = Modifier
            .fillMaxWidth()
            .minimumVerticalContentPadding(ButtonDefaults.minimumVerticalListContentPadding)
            .transformedHeight(this, transformationSpec)
        )
      }
      item {
        SettingToggleRow(
          label = stringResource(R.string.run_setting_hr_alerts, if (hrAlert) onStr else offStr),
          active = hrAlert,
          accent = SparkyColors.Rose,
          onClick = onToggleHrAlert,
          modifier = Modifier
            .fillMaxWidth()
            .minimumVerticalContentPadding(ButtonDefaults.minimumVerticalListContentPadding)
            .transformedHeight(this, transformationSpec)
        )
      }
      item {
        FilledTonalButton(
          onClick = onTestVoice,
          modifier = Modifier
            .fillMaxWidth()
            .minimumVerticalContentPadding(ButtonDefaults.minimumVerticalListContentPadding)
            .transformedHeight(this, transformationSpec),
          transformation = SurfaceTransformation(transformationSpec),
          icon = { Icon(Icons.AutoMirrored.Rounded.VolumeUp, contentDescription = null) },
          label = { Text(stringResource(R.string.run_setting_test_voice), maxLines = 1) }
        )
      }
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

  ScreenScaffold { contentPadding ->
    Column(
      modifier = Modifier
        .fillMaxSize()
        .background(Color.Black)
        .wearRotaryStepper(isCurrentPage = true) { steps ->
          displayVal = max(0.01, ((displayVal + steps * 0.05) * 100.0).roundToInt() / 100.0)
          Haptics.click()
        }
        .padding(contentPadding)
        .padding(horizontal = 12.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.Center
    ) {
      Text(
        text = stringResource(R.string.run_treadmill_distance_title),
        style = MaterialTheme.typography.titleSmall,
        color = SparkyColors.Cyan
      )
      Spacer(Modifier.height(4.dp))
      Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
      ) {
        FilledTonalIconButton(
          onClick = {
            displayVal = max(0.01, ((displayVal - 0.05) * 100.0).roundToInt() / 100.0)
            Haptics.click()
          },
          modifier = Modifier.size(34.dp)
        ) {
          Icon(Icons.Rounded.Remove, contentDescription = stringResource(R.string.stepper_decrease_distance))
        }
        Column(
          horizontalAlignment = Alignment.CenterHorizontally,
          modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceContainer)
            .clickable { showKeypad = true }
            .padding(horizontal = 10.dp, vertical = 4.dp)
        ) {
          Text(
            text = formatWorkoutLocaleDecimal(displayVal, fractionDigits = 2),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface
          )
          Text(
            text = unitLabel.uppercase(Locale.US),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
          )
        }
        FilledTonalIconButton(
          onClick = {
            displayVal = ((displayVal + 0.05) * 100.0).roundToInt() / 100.0
            Haptics.click()
          },
          modifier = Modifier.size(34.dp)
        ) {
          Icon(Icons.Rounded.Add, contentDescription = stringResource(R.string.stepper_increase_distance))
        }
      }
      Spacer(Modifier.height(8.dp))
      Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        CompactButton(
          onClick = onSkip,
          colors = ButtonDefaults.filledTonalButtonColors(),
          label = { Text(stringResource(R.string.common_skip)) }
        )
        CompactButton(
          onClick = { onConfirm(displayVal * unitFactor) },
          colors = ButtonDefaults.buttonColors(containerColor = SparkyColors.Green, contentColor = Color.Black),
          label = { Text(stringResource(R.string.common_save)) }
        )
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
