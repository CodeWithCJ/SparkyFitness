package com.sparkyapps.sparkyfitness.wear

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.basicMarquee
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.EmojiEvents
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FitnessCenter
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Icon
import androidx.wear.compose.material.Text
import com.SparkyApps.SparkyFitnessMobile.R
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

// ---- Palette & Styling matching PR #3557 mockups ----

internal data class SetTint(val r: Float, val g: Float, val b: Float) {
  val color: Color get() = Color(r, g, b, 1f)
  val light: Color get() = mixed(0.5f, 1f, 1f, 1f)
  val pill: Color get() = mixed(0.24f)
  val pillIcon: Color get() = mixed(0.22f)
  val tile: Color get() = mixed(0.28f, 4f / 255f, 18f / 255f, 46f / 255f)
  val badge: Color get() = mixed(0.45f)

  fun mixed(share: Float, br: Float = 0f, bg: Float = 0f, bb: Float = 0f): Color = Color(
    red = r * share + br * (1f - share),
    green = g * share + bg * (1f - share),
    blue = b * share + bb * (1f - share),
    alpha = 1f
  )

  companion object {
    val Blue = SetTint(90f / 255f, 176f / 255f, 255f / 255f)
    val Hold = SetTint(245f / 255f, 177f / 255f, 61f / 255f)
    val Surface = Color(0xFF1F2023)
    val Grey = Color(0xFFA6A9B0)
    val LightGrey = Color(0xFFC7CAD1)
    val Green = Color(0xFF34C77B)
    val Destructive = Color(0xFFFF8A8E)
    val Orange = Color(0xFFF97316)
    val HeartDefault = Color(0xFFED5E63)
  }
}

internal object SetSupersetPalette {
  private val rgb = listOf(
    Triple(186f, 117f, 237f),
    Triple(209f, 138f, 97f),
    Triple(145f, 102f, 204f),
    Triple(106f, 164f, 111f),
    Triple(204f, 102f, 136f),
    Triple(90f, 173f, 175f),
    Triple(212f, 169f, 84f),
    Triple(110f, 118f, 135f)
  )

  fun tint(run: Int): SetTint {
    val (r, g, b) = rgb[abs(run) % rgb.size]
    fun light(v: Float): Float = (v + (255f - v) * 0.45f) / 255f
    return SetTint(light(r), light(g), light(b))
  }

  fun color(run: Int): Color = tint(run).color
}

private enum class NewWorkoutPageKind {
  DEMO, METRICS, SET, MORE
}

private enum class ConfirmAction {
  DELETE_SET, DELETE_EXERCISE, FINISH, DISCARD
}

// ---- Main New Workout Container ----

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun NewActiveWorkoutView(
  checkInStore: CheckInStore,
  workoutStore: WorkoutSessionStore,
  isCurrentPage: Boolean
) {
  val plan by workoutStore.plan.collectAsState()
  val steps by workoutStore.steps.collectAsState()
  val stepIndex by workoutStore.stepIndex.collectAsState()
  val phase by workoutStore.phase.collectAsState()
  val watchCtx by checkInStore.watchContext.collectAsState()
  val completedIds by workoutStore.completedSetIdsFlow.collectAsState()
  val loggedOrder by workoutStore.loggedSetOrder.collectAsState()
  val setValuesMap by workoutStore.setValuesFlow.collectAsState()
  val pendingRpe by workoutStore.pendingRpe.collectAsState()
  val prExercise by workoutStore.prBannerExercise.collectAsState()
  val prSetId by workoutStore.prBannerSetId.collectAsState()
  val demoRevision by (workoutStore.demoStore?.revision?.collectAsState() ?: remember { mutableStateOf(0) })

  var showingExercises by remember { mutableStateOf(false) }
  var editingPrevious by remember { mutableStateOf(false) }
  var showingPlates by remember { mutableStateOf(false) }
  var showingSetType by remember { mutableStateOf(false) }
  var showingSwap by remember { mutableStateOf(false) }
  var showingAddExercise by remember { mutableStateOf(false) }
  var showingWater by remember { mutableStateOf(false) }
  var confirmAction by remember { mutableStateOf<ConfirmAction?>(null) }
  var keypadField by remember { mutableStateOf<String?>(null) } // "weight" | "reps" | "distance"
  var topLineMetricsOverride by remember { mutableStateOf<Boolean?>(null) }

  val currentStep = steps.getOrNull(stepIndex)
  val currentExercise = remember(plan, currentStep?.exerciseEntryId) {
    plan?.exercises?.firstOrNull { it.exerciseEntryId == currentStep?.exerciseEntryId }
  }
  val demoImages = remember(currentExercise?.imageKey, currentExercise?.imageCount, demoRevision) {
    workoutStore.demoStore?.images(currentExercise?.imageKey, currentExercise?.imageCount ?: 2).orEmpty()
  }
  val hasDemo = demoImages.isNotEmpty() && currentExercise != null

  val pageKinds = remember(hasDemo) {
    buildList {
      if (hasDemo) add(NewWorkoutPageKind.DEMO)
      add(NewWorkoutPageKind.METRICS)
      add(NewWorkoutPageKind.SET)
      add(NewWorkoutPageKind.MORE)
    }
  }
  val setPageIdx = pageKinds.indexOf(NewWorkoutPageKind.SET).coerceAtLeast(0)
  val pagerState = rememberPagerState(initialPage = setPageIdx, pageCount = { pageKinds.size })
  val coroutineScope = rememberCoroutineScope()

  // Keep user on Set page when step changes or plan first arms
  LaunchedEffect(currentStep?.setId) {
    val targetIdx = pageKinds.indexOf(NewWorkoutPageKind.SET)
    if (targetIdx >= 0 && pagerState.currentPage != targetIdx) {
      pagerState.scrollToPage(targetIdx)
    }
  }

  // If demo images arrive while on Set/Metrics/More, shift pager index to stay on same logical page
  var prevHasDemo by remember { mutableStateOf(hasDemo) }
  LaunchedEffect(hasDemo) {
    if (hasDemo != prevHasDemo) {
      val shifted = (pagerState.currentPage + if (hasDemo) 1 else -1).coerceIn(0, pageKinds.lastIndex)
      pagerState.scrollToPage(shifted)
      prevHasDemo = hasDemo
    }
  }

  val anyOverlayOpen = showingExercises || editingPrevious || showingPlates ||
    showingSetType || showingSwap || showingAddExercise || showingWater ||
    confirmAction != null || keypadField != null || pendingRpe != null || prExercise != null

  BackHandler(enabled = anyOverlayOpen) {
    when {
      keypadField != null -> keypadField = null
      confirmAction != null -> confirmAction = null
      showingPlates -> showingPlates = false
      showingSetType -> showingSetType = false
      showingSwap -> showingSwap = false
      showingAddExercise -> showingAddExercise = false
      showingWater -> showingWater = false
      editingPrevious -> editingPrevious = false
      showingExercises -> showingExercises = false
      pendingRpe != null -> workoutStore.submitPendingRpe(null)
      prExercise != null -> workoutStore.dismissPrBanner()
    }
  }

  Box(
    modifier = Modifier
      .fillMaxSize()
      .background(Color.Black)
  ) {
    VerticalPager(
      state = pagerState,
      userScrollEnabled = !anyOverlayOpen,
      modifier = Modifier.fillMaxSize()
    ) { pagePos ->
      val kind = pageKinds.getOrElse(pagePos) { NewWorkoutPageKind.SET }
      val pageActive = isCurrentPage && !anyOverlayOpen && pagerState.currentPage == pagePos
      when (kind) {
        NewWorkoutPageKind.DEMO -> {
          val ex = currentExercise
          if (ex != null && demoImages.isNotEmpty()) {
            WorkoutDemoPage(
              name = ex.name,
              caption = listOfNotNull(ex.equipment, ex.muscle).joinToString(" · "),
              images = demoImages,
              animating = pageActive
            )
          }
        }
        NewWorkoutPageKind.METRICS -> {
          WorkoutMetricsPage(
            workoutStore = workoutStore,
            watchCtx = watchCtx,
            completedCount = completedIds.size,
            totalCount = steps.size
          )
        }
        NewWorkoutPageKind.SET -> {
          NewWorkoutSetScreen(
            workoutStore = workoutStore,
            watchCtx = watchCtx,
            currentStep = currentStep,
            completedIds = completedIds,
            loggedCount = loggedOrder.size,
            setValuesMap = setValuesMap,
            isResting = phase == WorkoutSessionStore.Phase.REST,
            showsMetrics = topLineMetricsOverride ?: watchCtx.effectiveWorkoutTopLineIsMetrics,
            onToggleTopLine = {
              val cur = topLineMetricsOverride ?: watchCtx.effectiveWorkoutTopLineIsMetrics
              topLineMetricsOverride = !cur
              Haptics.click()
            },
            onOpenList = { showingExercises = true },
            onEditPrevious = { editingPrevious = true },
            onEditField = { field -> keypadField = field },
            onFinishWorkout = { workoutStore.finishWorkout(notifyPhone = true) }
          )
        }
        NewWorkoutPageKind.MORE -> {
          WorkoutMorePage(
            workoutStore = workoutStore,
            watchCtx = watchCtx,
            currentStep = currentStep,
            setValuesMap = setValuesMap,
            loggedOrder = loggedOrder,
            isCurrentPage = pageActive,
            onOpenList = { showingExercises = true },
            onOpenPlates = { showingPlates = true },
            onOpenSetType = { showingSetType = true },
            onOpenSwap = { showingSwap = true },
            onOpenAddExercise = { showingAddExercise = true },
            onOpenWater = { showingWater = true },
            onRequestConfirm = { confirmAction = it },
            onBackToSet = {
              coroutineScope.launch {
                pagerState.animateScrollToPage(setPageIdx)
              }
            }
          )
        }
      }
    }

    // ---- Overlays ----

    if (showingExercises) {
      ExerciseListOverlay(
        workoutStore = workoutStore,
        completedIds = completedIds,
        onSelect = { entryId ->
          workoutStore.jumpToExercise(entryId)
          showingExercises = false
        },
        onClose = { showingExercises = false }
      )
    }

    if (editingPrevious) {
      EditPreviousSetOverlay(
        workoutStore = workoutStore,
        onClose = { editingPrevious = false }
      )
    }

    if (showingPlates && currentStep?.plates != null) {
      val vals = workoutStore.valuesFor(currentStep)
      val curWeightKg = vals.weightKg ?: currentStep.plates.barWeight.let {
        WatchPlates.toKg(it, currentStep.plates)
      }
      PlatesCalculatorOverlay(
        config = currentStep.plates,
        initialWeightKg = curWeightKg,
        onUse = { kg ->
          workoutStore.setValue(currentStep.setId, weightKg = kg, notifyPhone = true)
          showingPlates = false
        },
        onClose = { showingPlates = false }
      )
    }

    if (showingSetType && currentStep != null) {
      SetTypeOverlay(
        currentType = currentStep.setType,
        onPick = { type ->
          workoutStore.applyEdit(WorkoutEditAction.SetSetType(currentStep.setId, type))
          showingSetType = false
        },
        onClose = { showingSetType = false }
      )
    }

    if (showingSwap && currentStep != null) {
      SwapExerciseOverlay(
        workoutStore = workoutStore,
        anchorEntryId = currentStep.exerciseEntryId,
        onClose = { showingSwap = false }
      )
    }

    if (showingAddExercise) {
      AddExerciseOverlay(
        suggested = watchCtx.suggestedExercises.orEmpty(),
        onAdd = { exerciseId ->
          workoutStore.applyEdit(WorkoutEditAction.AddExercise(exerciseId))
          showingAddExercise = false
        },
        onClose = { showingAddExercise = false }
      )
    }

    if (showingWater) {
      Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        WaterPage(store = checkInStore, isCurrentPage = true)
        Box(
          modifier = Modifier
            .align(Alignment.BottomCenter)
            .padding(bottom = 8.dp)
            .clip(CircleShape)
            .background(SetTint.Surface)
            .clickable {
              Haptics.click()
              showingWater = false
            }
            .padding(horizontal = 14.dp, vertical = 5.dp)
        ) {
          Text(
            text = stringResource(R.string.common_done),
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color.White
          )
        }
      }
    }

    if (keypadField != null && currentStep != null) {
      val field = keypadField!!
      val vals = workoutStore.valuesFor(currentStep)
      val unit = workoutStore.weightUnit
      val carryFactor = if (workoutStore.usesMiles) 1093.6133 else 1000.0
      val carrySuffix = stringResource(
        if (workoutStore.usesMiles) R.string.workout_new_unit_yd else R.string.workout_new_unit_m
      )
      val initialVal = when (field) {
        "weight" -> (vals.weightKg ?: 0.0).let { unit.displayedFromKg(it) }
        "distance" -> ((vals.distanceKm ?: 0.05) * carryFactor * 10.0).roundToInt() / 10.0
        else -> vals.reps ?: 10.0
      }
      val titleStr = when (field) {
        "weight" -> stringResource(R.string.weight_keypad_title, unit.suffix)
        "distance" -> stringResource(R.string.run_keypad_distance, carrySuffix)
        else -> stringResource(R.string.workout_keypad_reps)
      }
      WatchKeypadSheet(
        title = titleStr,
        initialValue = initialVal,
        allowDecimal = field != "reps",
        allowNegative = field == "weight" && currentStep.bodyweight,
        allowZero = field == "weight" && currentStep.bodyweight,
        onConfirm = { entered ->
          when (field) {
            "weight" -> workoutStore.setValue(currentStep.setId, weightKg = unit.toKg(entered), notifyPhone = true)
            "distance" -> workoutStore.setValue(currentStep.setId, distanceKm = entered / carryFactor, notifyPhone = true)
            else -> workoutStore.setValue(currentStep.setId, reps = entered, notifyPhone = true)
          }
          keypadField = null
        },
        onCancel = { keypadField = null }
      )
    }

    confirmAction?.let { action ->
      ConfirmDialogOverlay(
        title = when (action) {
          ConfirmAction.DELETE_SET -> stringResource(R.string.workout_new_confirm_delete_set)
          ConfirmAction.DELETE_EXERCISE -> stringResource(
            R.string.workout_new_confirm_delete_exercise,
            currentStep?.exerciseName ?: ""
          )
          ConfirmAction.FINISH -> stringResource(R.string.workout_new_confirm_finish)
          ConfirmAction.DISCARD -> stringResource(R.string.workout_new_confirm_discard)
        },
        message = when (action) {
          ConfirmAction.DELETE_SET -> stringResource(R.string.workout_new_confirm_delete_set_msg)
          ConfirmAction.DELETE_EXERCISE -> stringResource(R.string.workout_new_confirm_delete_exercise_msg)
          else -> null
        },
        confirmLabel = when (action) {
          ConfirmAction.FINISH -> stringResource(R.string.workout_new_finish)
          ConfirmAction.DISCARD -> stringResource(R.string.workout_new_tile_discard)
          else -> stringResource(R.string.workout_new_delete)
        },
        destructive = action != ConfirmAction.FINISH,
        onConfirm = {
          when (action) {
            ConfirmAction.DELETE_SET -> currentStep?.let {
              workoutStore.applyEdit(WorkoutEditAction.DeleteSet(it.setId))
            }
            ConfirmAction.DELETE_EXERCISE -> currentStep?.let {
              workoutStore.applyEdit(WorkoutEditAction.DeleteExercise(it.exerciseEntryId))
            }
            ConfirmAction.FINISH -> workoutStore.finishWorkout(notifyPhone = true)
            ConfirmAction.DISCARD -> workoutStore.discardWorkout(notifyPhone = true)
          }
          confirmAction = null
        },
        onCancel = { confirmAction = null }
      )
    }

    pendingRpe?.let { pending ->
      RpePickerOverlay(
        setNumber = pending.step.setIndexInExercise,
        onDone = { rpe -> workoutStore.submitPendingRpe(rpe) }
      )
    }

    prExercise?.let { exName ->
      val prStep = prSetId?.let { id -> steps.firstOrNull { it.setId == id } }
      val detail = prStep?.let { formatSetTarget(it, workoutStore, spaced = true) }
      NewPrOverlay(
        exerciseName = exName,
        detail = detail,
        onContinue = { workoutStore.dismissPrBanner() }
      )
    }
  }
}

// ---- Page 1: Exercise Demo ----

@Composable
private fun WorkoutDemoPage(
  name: String,
  caption: String,
  images: List<ImageBitmap>,
  animating: Boolean
) {
  var showEnd by remember(images) { mutableStateOf(false) }

  LaunchedEffect(animating, images.size) {
    if (!animating || images.size < 2) {
      showEnd = false
      return@LaunchedEffect
    }
    while (true) {
      delay(1000L)
      showEnd = !showEnd
    }
  }

  val endAlpha by animateFloatAsState(
    targetValue = if (showEnd && images.size > 1) 1f else 0f,
    animationSpec = tween(durationMillis = 380),
    label = "demoCrossfade"
  )

  Box(
    modifier = Modifier
      .fillMaxSize()
      .background(Color(0xFF1F1F1F))
  ) {
    Image(
      bitmap = images[0],
      contentDescription = name,
      contentScale = ContentScale.Crop,
      modifier = Modifier.fillMaxSize()
    )
    if (images.size > 1) {
      Image(
        bitmap = images[1],
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = Modifier
          .fillMaxSize()
          .alpha(endAlpha)
      )
    }
    // Subtle top scrim for TimeText readability
    Box(
      modifier = Modifier
        .fillMaxWidth()
        .height(34.dp)
        .align(Alignment.TopCenter)
        .background(
          Brush.verticalGradient(
            colors = listOf(Color.Black.copy(alpha = 0.6f), Color.Transparent)
          )
        )
    )
    // Bottom dark gradient scrim + name + equipment · muscle
    Box(
      modifier = Modifier
        .fillMaxWidth()
        .height(92.dp)
        .align(Alignment.BottomCenter)
        .background(
          Brush.verticalGradient(
            colors = listOf(
              Color.Transparent,
              Color.Black.copy(alpha = 0.65f),
              Color.Black.copy(alpha = 0.94f)
            )
          )
        )
    )
    Column(
      modifier = Modifier
        .align(Alignment.BottomCenter)
        .fillMaxWidth()
        .padding(horizontal = 22.dp)
        .padding(bottom = 22.dp),
      horizontalAlignment = Alignment.CenterHorizontally
    ) {
      Text(
        text = name,
        fontSize = 15.sp,
        fontWeight = FontWeight.Bold,
        color = Color.White,
        maxLines = 1,
        modifier = if (animating) Modifier.basicMarquee() else Modifier
      )
      if (caption.isNotEmpty()) {
        Text(
          text = caption,
          fontSize = 11.sp,
          color = SetTint.LightGrey,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis
        )
      }
    }
  }
}

// ---- Page 2: Live Metrics ----

@Composable
private fun WorkoutMetricsPage(
  workoutStore: WorkoutSessionStore,
  watchCtx: WatchContext,
  completedCount: Int,
  totalCount: Int
) {
  val elapsedSec by workoutStore.elapsedSeconds.collectAsState()
  val hr by workoutStore.currentHeartRate.collectAsState()
  val calories by workoutStore.activeCalories.collectAsState()
  val energy = EnergyDisplay.of(watchCtx)
  val hrColor = Color(WatchHeartRateZone.colorHex(hr, watchCtx.heartRateZoneFloors))

  Column(
    modifier = Modifier
      .fillMaxSize()
      .padding(horizontal = 36.dp)
      .padding(top = 30.dp, bottom = 26.dp),
    verticalArrangement = Arrangement.Center,
    horizontalAlignment = Alignment.Start
  ) {
    Text(
      text = stringResource(R.string.workout_new_live_title),
      fontSize = 13.sp,
      fontWeight = FontWeight.SemiBold,
      color = Color.White
    )
    Spacer(Modifier.height(4.dp))
    Text(
      text = formatCompactElapsed(elapsedSec),
      fontSize = 26.sp,
      fontWeight = FontWeight.SemiBold,
      color = SetTint.Blue.light,
      maxLines = 1
    )
    Row(
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(5.dp)
    ) {
      Text(
        text = hr?.roundToInt()?.toString() ?: "--",
        fontSize = 26.sp,
        fontWeight = FontWeight.SemiBold,
        color = hrColor,
        maxLines = 1
      )
      Icon(
        imageVector = Icons.Rounded.Favorite,
        contentDescription = null,
        tint = hrColor,
        modifier = Modifier.size(20.dp)
      )
    }
    Row(
      verticalAlignment = Alignment.Bottom,
      horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
      Text(
        text = if (calories > 0.0) "${energy.whole(calories)}" else "--",
        fontSize = 25.sp,
        fontWeight = FontWeight.SemiBold,
        color = Color.White,
        maxLines = 1
      )
      Text(
        text = energy.unit.uppercase(Locale.US),
        fontSize = 11.sp,
        fontWeight = FontWeight.Bold,
        color = SetTint.Hold.color,
        modifier = Modifier.padding(bottom = 4.dp)
      )
    }
    if (totalCount > 0) {
      Spacer(Modifier.height(2.dp))
      Row(
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
      ) {
        Text(
          text = stringResource(R.string.workout_new_sets_progress, completedCount, totalCount),
          fontSize = 20.sp,
          fontWeight = FontWeight.SemiBold,
          color = Color.White,
          maxLines = 1
        )
        Text(
          text = stringResource(R.string.workout_new_sets_unit),
          fontSize = 10.sp,
          fontWeight = FontWeight.Bold,
          color = SetTint.Blue.color,
          modifier = Modifier.padding(bottom = 3.dp)
        )
      }
    }
  }
}

// ---- Page 3: Main Set / Rest / Hold / Workout Complete ----

@Composable
private fun NewWorkoutSetScreen(
  workoutStore: WorkoutSessionStore,
  watchCtx: WatchContext,
  currentStep: WorkoutStep?,
  completedIds: Set<String>,
  loggedCount: Int,
  setValuesMap: Map<String, SetValues>,
  isResting: Boolean,
  showsMetrics: Boolean,
  onToggleTopLine: () -> Unit,
  onOpenList: () -> Unit,
  onEditPrevious: () -> Unit,
  onEditField: (String) -> Unit,
  onFinishWorkout: () -> Unit
) {
  val plan by workoutStore.plan.collectAsState()
  val elapsedSec by workoutStore.elapsedSeconds.collectAsState()
  val capRemaining by workoutStore.capRemainingSeconds.collectAsState()
  val hr by workoutStore.currentHeartRate.collectAsState()
  val calories by workoutStore.activeCalories.collectAsState()
  val getReadySetId by workoutStore.getReadySetId.collectAsState()
  val getReadyEndsAtMs by workoutStore.getReadyEndsAtMs.collectAsState()
  val holdSetId by workoutStore.holdSetId.collectAsState()
  val holdEndsAtMs by workoutStore.holdEndsAtMs.collectAsState()
  val holdTotalSec by workoutStore.holdTotalSeconds.collectAsState()
  val stopwatchSetId by workoutStore.stopwatchSetId.collectAsState()
  val stopwatchStartedAtMs by workoutStore.stopwatchStartedAtMs.collectAsState()
  val stopwatchStopped by workoutStore.stopwatchStoppedSeconds.collectAsState()

  val isGetReady = currentStep != null && getReadySetId == currentStep.setId && getReadyEndsAtMs != null
  val isHoldRunning = currentStep != null && holdSetId == currentStep.setId && holdEndsAtMs != null
  val stepTint = currentStep?.supersetRun?.let { SetSupersetPalette.tint(it) } ?: SetTint.Blue

  Column(
    modifier = Modifier
      .fillMaxSize()
      .padding(horizontal = 16.dp)
      .padding(top = 30.dp, bottom = 24.dp),
    horizontalAlignment = Alignment.CenterHorizontally
  ) {
    // Top row: Exercise Pill + Top Line (time or live metrics), inset for round bezel
    if (currentStep != null) {
      Row(
        modifier = Modifier
          .fillMaxWidth()
          .padding(horizontal = 22.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
      ) {
        SetPill(
          step = currentStep,
          workoutStore = workoutStore,
          tint = stepTint,
          onClick = onOpenList
        )
        if (!isResting && !isGetReady && !isHoldRunning) {
          WorkoutTopLine(
            elapsedSec = elapsedSec,
            hr = hr,
            calories = calories,
            watchCtx = watchCtx,
            showsMetrics = showsMetrics,
            onToggle = onToggleTopLine
          )
        }
      }
    }

    val formatTag = plan?.workoutFormat?.takeIf { !it.equals("standard", ignoreCase = true) }?.uppercase(Locale.US)
    if (formatTag != null && !isGetReady && !isHoldRunning) {
      val caption = if (capRemaining != null) "$formatTag ${formatCompactElapsed(capRemaining!!)}" else formatTag
      Text(
        text = caption,
        fontSize = 10.sp,
        fontWeight = FontWeight.SemiBold,
        color = SetTint.Hold.color,
        maxLines = 1
      )
    }

    when {
      isResting -> {
        NewRestView(
          workoutStore = workoutStore,
          watchCtx = watchCtx,
          nextStep = currentStep,
          onOpenList = onOpenList
        )
      }
      isGetReady -> {
        HoldGetReadyView(
          step = currentStep!!,
          endsAtMs = getReadyEndsAtMs!!,
          workoutStore = workoutStore,
          onSkip = { workoutStore.skipGetReady() }
        )
      }
      isHoldRunning -> {
        HoldRunningView(
          step = currentStep!!,
          endsAtMs = holdEndsAtMs!!,
          totalSeconds = holdTotalSec,
          workoutStore = workoutStore,
          watchCtx = watchCtx,
          completedIds = completedIds,
          onEndEarly = { workoutStore.completeCurrentSet() }
        )
      }
      currentStep != null -> {
        val values = remember(currentStep, setValuesMap) { workoutStore.valuesFor(currentStep) }
        val isCompleted = completedIds.contains(currentStep.setId)
        val unit = workoutStore.weightUnit
        val holdSec = values.durationSec ?: currentStep.targetDurationSec
        val isTimed = currentStep.timed
        val standardTiles = !(isTimed || currentStep.carry || currentStep.bodyweight || currentStep.supersetRun != null)

        Spacer(Modifier.height(3.dp))
        Text(
          text = currentStep.exerciseName,
          fontSize = 17.sp,
          fontWeight = FontWeight.Bold,
          color = Color.White,
          maxLines = 1,
          modifier = Modifier
            .fillMaxWidth()
            .basicMarquee()
        )

        // Detail line (equipment / superset partner / set label) + tappable set dots
        Row(
          modifier = Modifier
            .fillMaxWidth()
            .padding(top = 1.dp, bottom = 5.dp),
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.SpaceBetween
        ) {
          val baseCaption = when {
            currentStep.supersetWith != null -> stringResource(R.string.workout_new_superset_with, currentStep.supersetWith)
            currentStep.equipment != null -> currentStep.equipment
            else -> localizedSetProgressLabel(currentStep)
          }
          val caption = if (isCompleted) {
            "$baseCaption · ${stringResource(R.string.workout_new_logged_tag)}"
          } else {
            baseCaption
          }
          Text(
            text = caption,
            fontSize = 11.sp,
            color = if (currentStep.supersetRun != null) stepTint.color else SetTint.Grey,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
          )
          Spacer(Modifier.width(4.dp))
          SetProgressDots(
            step = currentStep,
            allSteps = workoutStore.steps.collectAsState().value,
            completedIds = completedIds,
            onSelect = { id -> workoutStore.goToStep(id) }
          )
        }

        // Value tiles
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.spacedBy(5.dp)
        ) {
          if (!isTimed || values.weightKg != null || currentStep.weighted) {
            val bw = currentStep.bodyweight
            val displayedW = values.weightKg?.let { unit.displayedFromKg(it) }
            val wText = if (bw) formatBodyweightText(displayedW) else formatNumberClean(displayedW)
            val wLabel = when {
              bw && (displayedW ?: 0.0) < 0.0 -> stringResource(R.string.workout_new_field_assisted)
              bw -> stringResource(R.string.workout_new_field_added)
              else -> stringResource(R.string.workout_new_field_weight)
            }
            val wSuffix = if (bw && (displayedW ?: 0.0) == 0.0) null else if (unit == WeightUnit.LBS) "lb" else "kg"
            ValueTile(
              label = wLabel,
              value = wText,
              suffix = wSuffix,
              fill = if (standardTiles) SetTint.Blue.tile else SetTint.Blue.mixed(0.26f),
              showBadge = standardTiles,
              modifier = Modifier.weight(1f),
              onClick = { onEditField("weight") }
            )
          }
          when {
            holdSec != null && holdSec > 0 -> {
              val (hVal, hSuf) = formatHoldParts(holdSec)
              HoldActionTile(
                label = stringResource(R.string.workout_new_field_hold),
                value = hVal,
                suffix = hSuf,
                note = null,
                running = false,
                modifier = Modifier.weight(1f),
                onClick = { workoutStore.beginHold(currentStep.setId, holdSec) }
              )
            }
            isTimed -> {
              var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
              val swRunning = stopwatchSetId == currentStep.setId && stopwatchStartedAtMs != null
              LaunchedEffect(swRunning) {
                while (swRunning) {
                  nowMs = System.currentTimeMillis()
                  delay(500L)
                }
              }
              val swElapsed = if (swRunning && stopwatchStartedAtMs != null) {
                max(0, ((nowMs - stopwatchStartedAtMs!!) / 1000L).toInt())
              } else {
                stopwatchStopped[currentStep.setId]
              }
              val prevSec = if (swElapsed == null) values.previousDurationSec else null
              HoldActionTile(
                label = stringResource(R.string.workout_new_field_time),
                value = formatCompactElapsed(swElapsed ?: 0),
                suffix = null,
                note = prevSec?.let { stringResource(R.string.workout_new_last_hold, formatCompactElapsed(it)) },
                running = swRunning,
                modifier = Modifier.weight(1f),
                onClick = {
                  if (swRunning) workoutStore.stopStopwatch(currentStep.setId)
                  else if (swElapsed == null) workoutStore.startStopwatch(currentStep.setId)
                }
              )
            }
            currentStep.carry -> {
              val carryFactor = if (workoutStore.usesMiles) 1093.6133 else 1000.0
              val carrySuffix = stringResource(
                if (workoutStore.usesMiles) R.string.workout_new_unit_yd else R.string.workout_new_unit_m
              )
              val distDisp = values.distanceKm?.let { ((it * carryFactor) * 10.0).roundToInt() / 10.0 }
              ValueTile(
                label = stringResource(R.string.workout_new_field_distance),
                value = formatNumberClean(distDisp),
                suffix = carrySuffix,
                fill = SetTint.Blue.mixed(0.26f),
                showBadge = false,
                modifier = Modifier.weight(1f),
                onClick = { onEditField("distance") }
              )
            }
            else -> {
              ValueTile(
                label = stringResource(R.string.workout_new_field_reps),
                value = formatNumberClean(values.reps),
                suffix = null,
                fill = if (standardTiles) SetTint.Blue.tile else SetTint.Blue.mixed(0.26f),
                showBadge = standardTiles,
                modifier = Modifier.weight(1f),
                onClick = { onEditField("reps") }
              )
            }
          }
        }

        Spacer(Modifier.weight(1f))

        // Bottom row: ‹ Edit Previous Set + Log set / Undo (inset for round bezel)
        val restAfterSec = workoutStore.restAfterCurrentSet()
        val thenPartner = workoutStore.supersetPartnerNext(currentStep)
        Row(
          modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp),
          horizontalArrangement = Arrangement.spacedBy(5.dp),
          verticalAlignment = Alignment.CenterVertically
        ) {
          RoundNavButton(
            glyph = "‹",
            enabled = loggedCount > 0,
            sizeDp = 34,
            onClick = onEditPrevious
          )
          Box(
            modifier = Modifier
              .weight(1f)
              .height(34.dp)
              .clip(CircleShape)
              .background(if (isCompleted) SetTint.Orange.copy(alpha = 0.22f) else SetTint.Blue.color)
              .clickable {
                if (isCompleted) {
                  workoutStore.uncompleteStep(currentStep)
                } else {
                  workoutStore.completeCurrentSet()
                }
              }
              .padding(horizontal = 10.dp),
            contentAlignment = Alignment.Center
          ) {
            Row(
              verticalAlignment = Alignment.CenterVertically,
              horizontalArrangement = Arrangement.spacedBy(5.dp)
            ) {
              Text(
                text = if (isCompleted) {
                  stringResource(R.string.workout_new_undo)
                } else {
                  stringResource(R.string.workout_new_log_set)
                },
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = if (isCompleted) SetTint.Orange else Color.Black,
                maxLines = 1
              )
              if (!isCompleted && thenPartner != null) {
                Text(
                  text = stringResource(R.string.workout_new_then_next, thenPartner),
                  fontSize = 10.sp,
                  fontWeight = FontWeight.SemiBold,
                  color = Color.Black.copy(alpha = 0.62f),
                  maxLines = 1
                )
              } else if (!isCompleted && restAfterSec > 0) {
                Text(
                  text = stringResource(R.string.workout_new_rest_time, formatCompactElapsed(restAfterSec)),
                  fontSize = 10.sp,
                  fontWeight = FontWeight.SemiBold,
                  color = Color.Black.copy(alpha = 0.62f),
                  maxLines = 1
                )
              }
            }
          }
        }
      }
      else -> {
        // All sets completed
        Column(
          modifier = Modifier.fillMaxSize(),
          verticalArrangement = Arrangement.Center,
          horizontalAlignment = Alignment.CenterHorizontally
        ) {
          Text(
            text = stringResource(R.string.workout_new_workout_complete),
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White,
            textAlign = TextAlign.Center
          )
          Spacer(Modifier.height(10.dp))
          Box(
            modifier = Modifier
              .clip(CircleShape)
              .background(SetTint.Green)
              .clickable {
                Haptics.click()
                onFinishWorkout()
              }
              .padding(horizontal = 24.dp, vertical = 10.dp)
          ) {
            Text(
              text = stringResource(R.string.workout_new_finish),
              fontSize = 13.sp,
              fontWeight = FontWeight.Bold,
              color = Color.Black
            )
          }
        }
      }
    }
  }
}

@Composable
private fun SetPill(
  step: WorkoutStep,
  workoutStore: WorkoutSessionStore,
  tint: SetTint,
  onClick: () -> Unit
) {
  val (posIdx, posTotal) = workoutStore.exercisePosition(step)
  val badge = workoutStore.supersetBadge(step)
  Row(
    modifier = Modifier
      .height(28.dp)
      .clip(CircleShape)
      .background(tint.pill)
      .clickable {
        Haptics.click()
        onClick()
      }
      .padding(start = 3.dp, end = 9.dp),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(4.dp)
  ) {
    Box(
      modifier = Modifier
        .size(22.dp)
        .clip(CircleShape)
        .background(tint.pillIcon),
      contentAlignment = Alignment.Center
    ) {
      if (badge != null) {
        Text(
          text = badge,
          fontSize = 9.sp,
          fontWeight = FontWeight.Bold,
          color = tint.color
        )
      } else {
        Icon(
          imageVector = Icons.Rounded.FitnessCenter,
          contentDescription = null,
          tint = tint.color,
          modifier = Modifier.size(13.dp)
        )
      }
    }
    Text(
      text = "$posIdx/$posTotal",
      fontSize = 11.sp,
      fontWeight = FontWeight.SemiBold,
      color = tint.color
    )
  }
}

@Composable
private fun WorkoutTopLine(
  elapsedSec: Int,
  hr: Double?,
  calories: Double,
  watchCtx: WatchContext,
  showsMetrics: Boolean,
  onToggle: () -> Unit
) {
  val energy = EnergyDisplay.of(watchCtx)
  val hrColor = Color(WatchHeartRateZone.colorHex(hr, watchCtx.heartRateZoneFloors))
  Row(
    modifier = Modifier
      .clip(RoundedCornerShape(8.dp))
      .clickable(onClick = onToggle)
      .padding(horizontal = 4.dp, vertical = 2.dp),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(5.dp)
  ) {
    if (showsMetrics) {
      Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp)
      ) {
        Icon(
          imageVector = Icons.Rounded.Favorite,
          contentDescription = null,
          tint = hrColor,
          modifier = Modifier.size(11.dp)
        )
        Text(
          text = hr?.roundToInt()?.toString() ?: "--",
          fontSize = 12.sp,
          fontWeight = FontWeight.SemiBold,
          color = hrColor
        )
      }
      Text(
        text = if (calories > 0.0) "${energy.whole(calories)} ${energy.unit}" else "-- ${energy.unit}",
        fontSize = 11.sp,
        fontWeight = FontWeight.SemiBold,
        color = SetTint.Blue.light
      )
    } else {
      Text(
        text = formatCompactElapsed(elapsedSec),
        fontSize = 14.sp,
        fontWeight = FontWeight.SemiBold,
        color = SetTint.Blue.light
      )
    }
  }
}

@Composable
private fun ValueTile(
  label: String,
  value: String,
  suffix: String?,
  fill: Color,
  showBadge: Boolean,
  modifier: Modifier = Modifier,
  onClick: () -> Unit
) {
  Box(
    modifier = modifier
      .height(54.dp)
      .clip(RoundedCornerShape(12.dp))
      .background(fill)
      .clickable {
        Haptics.click()
        onClick()
      }
      .padding(horizontal = 8.dp, vertical = 6.dp)
  ) {
    Column(
      modifier = Modifier.fillMaxSize(),
      verticalArrangement = Arrangement.SpaceBetween,
      horizontalAlignment = Alignment.Start
    ) {
      Text(
        text = label,
        fontSize = 9.sp,
        fontWeight = FontWeight.SemiBold,
        color = SetTint.Blue.color,
        maxLines = 1
      )
      Row(
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(2.dp)
      ) {
        Text(
          text = value,
          fontSize = 20.sp,
          fontWeight = FontWeight.Bold,
          color = SetTint.Blue.color,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis
        )
        if (suffix != null) {
          Text(
            text = suffix,
            fontSize = 10.sp,
            fontWeight = FontWeight.Medium,
            color = SetTint.Blue.color,
            modifier = Modifier.padding(bottom = 2.dp)
          )
        }
      }
    }
    if (showBadge) {
      Box(
        modifier = Modifier
          .align(Alignment.TopEnd)
          .size(12.dp)
          .clip(CircleShape)
          .background(SetTint.Blue.badge),
        contentAlignment = Alignment.Center
      ) {
        Text("±", fontSize = 8.sp, fontWeight = FontWeight.Bold, color = Color.Black)
      }
    }
  }
}

@Composable
private fun HoldActionTile(
  label: String,
  value: String,
  suffix: String?,
  note: String?,
  running: Boolean,
  modifier: Modifier = Modifier,
  onClick: () -> Unit
) {
  val amber = SetTint.Hold
  Box(
    modifier = modifier
      .height(54.dp)
      .clip(RoundedCornerShape(12.dp))
      .background(amber.mixed(0.26f))
      .clickable {
        Haptics.click()
        onClick()
      }
      .padding(horizontal = 8.dp, vertical = 6.dp)
  ) {
    Column(
      modifier = Modifier.fillMaxSize(),
      verticalArrangement = Arrangement.SpaceBetween,
      horizontalAlignment = Alignment.Start
    ) {
      Text(
        text = label,
        fontSize = 9.sp,
        fontWeight = FontWeight.SemiBold,
        color = amber.color,
        maxLines = 1
      )
      Row(
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(2.dp)
      ) {
        Text(
          text = value,
          fontSize = 19.sp,
          fontWeight = FontWeight.Bold,
          color = amber.color,
          maxLines = 1
        )
        if (suffix != null) {
          Text(
            text = suffix,
            fontSize = 10.sp,
            fontWeight = FontWeight.Medium,
            color = amber.color,
            modifier = Modifier.padding(bottom = 2.dp)
          )
        }
        if (note != null) {
          Text(
            text = note,
            fontSize = 9.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color.White.copy(alpha = 0.85f),
            maxLines = 1,
            modifier = Modifier.padding(start = 3.dp, bottom = 2.dp)
          )
        }
      }
    }
    Box(
      modifier = Modifier
        .align(Alignment.TopEnd)
        .size(20.dp)
        .clip(CircleShape)
        .background(if (running) Color(0xFFEF4444) else SetTint.Green),
      contentAlignment = Alignment.Center
    ) {
      Icon(
        imageVector = if (running) Icons.Rounded.Stop else Icons.Rounded.PlayArrow,
        contentDescription = null,
        tint = Color.Black,
        modifier = Modifier.size(13.dp)
      )
    }
  }
}

@Composable
private fun SetProgressDots(
  step: WorkoutStep,
  allSteps: List<WorkoutStep>,
  completedIds: Set<String>,
  onSelect: ((String) -> Unit)? = null
) {
  val sets = remember(allSteps, step.exerciseEntryId) {
    allSteps.filter { it.exerciseEntryId == step.exerciseEntryId }
  }
  if (sets.size <= 6) {
    Row(
      horizontalArrangement = Arrangement.spacedBy(3.dp),
      verticalAlignment = Alignment.CenterVertically
    ) {
      sets.forEach { s ->
        val isCur = s.setId == step.setId
        val isWarmup = s.setType.equals("warmup", ignoreCase = true)
        val dotColor = when {
          isCur -> Color.White
          completedIds.contains(s.setId) -> if (isWarmup) SetTint.Orange else SetTint.Blue.color
          else -> Color.White.copy(alpha = 0.28f)
        }
        Box(
          modifier = Modifier
            .size(if (onSelect != null) 12.dp else 8.dp)
            .let { m ->
              if (onSelect != null && !isCur) m.clickable { onSelect(s.setId) } else m
            },
          contentAlignment = Alignment.Center
        ) {
          Box(
            modifier = Modifier
              .size(if (isCur) 7.dp else 5.dp)
              .clip(CircleShape)
              .background(dotColor)
          )
        }
      }
    }
  } else {
    val isWarmup = step.setType.equals("warmup", ignoreCase = true)
    Text(
      text = "${step.setIndexInExercise}/${step.totalSetsInExercise}",
      fontSize = 10.sp,
      fontWeight = FontWeight.SemiBold,
      color = if (isWarmup) SetTint.Orange else SetTint.Blue.color
    )
  }
}

@Composable
private fun RoundNavButton(
  glyph: String,
  enabled: Boolean = true,
  sizeDp: Int = 34,
  onClick: () -> Unit
) {
  Box(
    modifier = Modifier
      .size(sizeDp.dp)
      .clip(CircleShape)
      .background(SetTint.Surface)
      .alpha(if (enabled) 1f else 0.35f)
      .clickable(enabled = enabled) {
        Haptics.click()
        onClick()
      },
    contentAlignment = Alignment.Center
  ) {
    Text(
      text = glyph,
      fontSize = 18.sp,
      fontWeight = FontWeight.Medium,
      color = Color.White
    )
  }
}

// ---- Get Ready & Running Hold Rings ----

@Composable
private fun HoldGetReadyView(
  step: WorkoutStep,
  endsAtMs: Long,
  workoutStore: WorkoutSessionStore,
  onSkip: () -> Unit
) {
  var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
  LaunchedEffect(endsAtMs) {
    while (System.currentTimeMillis() < endsAtMs) {
      nowMs = System.currentTimeMillis()
      delay(50L)
    }
  }
  val totalMs = WorkoutSessionStore.GET_READY_SECONDS * 1000.0
  val leftMs = max(0.0, (endsAtMs - nowMs).toDouble())
  val number = max(1, ceil(leftMs / 1000.0).toInt())
  val fraction = (leftMs / totalMs).toFloat().coerceIn(0f, 1f)
  val amber = SetTint.Hold
  val weightKg = workoutStore.valuesFor(step).weightKg
  val unit = workoutStore.weightUnit

  Column(
    modifier = Modifier
      .fillMaxSize()
      .clickable {
        Haptics.click()
        onSkip()
      },
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center
  ) {
    Box(modifier = Modifier.size(96.dp), contentAlignment = Alignment.Center) {
      CountdownRingCanvas(fraction = fraction, color = amber.color, trackColor = amber.mixed(0.26f), strokeDp = 8f)
      Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
          text = "$number",
          fontSize = 36.sp,
          fontWeight = FontWeight.Bold,
          color = amber.color
        )
        Text(
          text = stringResource(R.string.workout_new_get_ready),
          fontSize = 10.sp,
          fontWeight = FontWeight.SemiBold,
          color = SetTint.LightGrey
        )
      }
    }
    Spacer(Modifier.height(4.dp))
    val titleLine = if (weightKg != null && weightKg > 0.0) {
      "${step.exerciseName} · ${formatNumberClean(unit.displayedFromKg(weightKg))} ${unit.suffix}"
    } else {
      step.exerciseName
    }
    Text(
      text = titleLine,
      fontSize = 12.sp,
      fontWeight = FontWeight.SemiBold,
      color = Color.White,
      maxLines = 1,
      overflow = TextOverflow.Ellipsis
    )
    Text(
      text = stringResource(R.string.workout_new_tap_to_skip),
      fontSize = 10.sp,
      color = SetTint.LightGrey
    )
  }
}

@Composable
private fun HoldRunningView(
  step: WorkoutStep,
  endsAtMs: Long,
  totalSeconds: Int,
  workoutStore: WorkoutSessionStore,
  watchCtx: WatchContext,
  completedIds: Set<String>,
  onEndEarly: () -> Unit
) {
  val hr by workoutStore.currentHeartRate.collectAsState()
  var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
  LaunchedEffect(endsAtMs) {
    while (System.currentTimeMillis() < endsAtMs) {
      nowMs = System.currentTimeMillis()
      delay(250L)
    }
    nowMs = endsAtMs
  }
  val rem = max(0, ((endsAtMs - nowMs + 500L) / 1000L).toInt())
  val fraction = if (totalSeconds > 0) (rem.toFloat() / totalSeconds.toFloat()).coerceIn(0f, 1f) else 0f
  val amber = SetTint.Hold
  val hrColor = Color(WatchHeartRateZone.colorHex(hr, watchCtx.heartRateZoneFloors))
  val weightKg = workoutStore.valuesFor(step).weightKg
  val unit = workoutStore.weightUnit

  Column(
    modifier = Modifier.fillMaxSize(),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center
  ) {
    Box(
      modifier = Modifier
        .size(96.dp)
        .clip(CircleShape)
        .clickable {
          Haptics.click()
          onEndEarly()
        },
      contentAlignment = Alignment.Center
    ) {
      CountdownRingCanvas(fraction = fraction, color = amber.color, trackColor = amber.mixed(0.26f), strokeDp = 8f)
      Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
          text = stringResource(R.string.workout_new_short_sec, rem),
          fontSize = 30.sp,
          fontWeight = FontWeight.Bold,
          color = amber.color
        )
        if (hr != null) {
          Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(2.dp)
          ) {
            Icon(Icons.Rounded.Favorite, null, tint = hrColor, modifier = Modifier.size(11.dp))
            Text("${hr!!.roundToInt()}", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = hrColor)
          }
        }
      }
    }
    Spacer(Modifier.height(4.dp))
    SetProgressDots(
      step = step,
      allSteps = workoutStore.steps.collectAsState().value,
      completedIds = completedIds
    )
    Text(
      text = step.exerciseName,
      fontSize = 13.sp,
      fontWeight = FontWeight.SemiBold,
      color = Color.White,
      maxLines = 1,
      modifier = Modifier.basicMarquee()
    )
    if (weightKg != null && weightKg > 0.0) {
      Text(
        text = "${formatNumberClean(unit.displayedFromKg(weightKg))} ${unit.suffix}",
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        color = amber.color
      )
    }
    Text(
      text = stringResource(R.string.workout_new_tap_ring_end),
      fontSize = 9.sp,
      color = SetTint.LightGrey
    )
  }
}

// ---- Rest Countdown View ----

@Composable
private fun NewRestView(
  workoutStore: WorkoutSessionStore,
  watchCtx: WatchContext,
  nextStep: WorkoutStep?,
  onOpenList: () -> Unit
) {
  val remainingSec by workoutStore.restRemainingSeconds.collectAsState()
  val totalSec by workoutStore.restDurationSeconds.collectAsState()
  val pausedRem by workoutStore.restPausedRemaining.collectAsState()
  val hr by workoutStore.currentHeartRate.collectAsState()
  val completedIds by workoutStore.completedSetIdsFlow.collectAsState()

  val isPaused = pausedRem != null
  val shownRem = pausedRem ?: remainingSec
  val fraction = if (totalSec > 0) (shownRem.toFloat() / totalSec.toFloat()).coerceIn(0f, 1f) else 0f
  val hrColor = Color(WatchHeartRateZone.colorHex(hr, watchCtx.heartRateZoneFloors))
  val targetLine = nextStep?.let { formatNextTarget(it, workoutStore) }

  Column(
    modifier = Modifier.fillMaxSize(),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.SpaceBetween
  ) {
    Box(
      modifier = Modifier
        .padding(top = 2.dp)
        .size(82.dp),
      contentAlignment = Alignment.Center
    ) {
      CountdownRingCanvas(
        fraction = fraction,
        color = SetTint.Blue.color,
        trackColor = SetTint.Blue.mixed(0.26f),
        strokeDp = 7f
      )
      Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
          text = formatCompactElapsed(shownRem),
          fontSize = 22.sp,
          fontWeight = FontWeight.Bold,
          color = SetTint.Blue.color
        )
        if (isPaused) {
          Text(
            text = stringResource(R.string.workout_new_paused),
            fontSize = 9.sp,
            fontWeight = FontWeight.SemiBold,
            color = SetTint.Orange
          )
        } else if (hr != null) {
          Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(2.dp)
          ) {
            Icon(Icons.Rounded.Favorite, null, tint = hrColor, modifier = Modifier.size(10.dp))
            Text("${hr!!.roundToInt()}", fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = hrColor)
          }
        }
      }
    }

    // -15 / Skip / +15 controls
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .alpha(if (isPaused) 0.4f else 1f),
      horizontalArrangement = Arrangement.spacedBy(5.dp)
    ) {
      RestPillButton(
        label = stringResource(R.string.workout_new_rest_back),
        bg = SetTint.Surface,
        fg = Color.White,
        enabled = !isPaused,
        modifier = Modifier.weight(1f)
      ) { workoutStore.adjustRest(-15) }
      RestPillButton(
        label = stringResource(R.string.common_skip),
        bg = Color.White,
        fg = Color.Black,
        enabled = !isPaused,
        modifier = Modifier.weight(1.25f)
      ) { workoutStore.skipRest() }
      RestPillButton(
        label = stringResource(R.string.workout_new_rest_forward),
        bg = SetTint.Surface,
        fg = Color.White,
        enabled = !isPaused,
        modifier = Modifier.weight(1f)
      ) { workoutStore.adjustRest(15) }
    }

    // Up Next block (tap opens Exercise List)
    if (nextStep != null) {
      Column(
        modifier = Modifier
          .fillMaxWidth()
          .padding(horizontal = 22.dp)
          .clip(RoundedCornerShape(10.dp))
          .clickable {
            Haptics.click()
            onOpenList()
          }
          .padding(horizontal = 4.dp, vertical = 2.dp),
        horizontalAlignment = Alignment.Start
      ) {
        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
          Text(
            text = stringResource(R.string.workout_new_next_prefix),
            fontSize = 11.sp,
            color = SetTint.Grey
          )
          Text(
            text = nextStep.exerciseName,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            color = nextStep.supersetRun?.let { SetSupersetPalette.color(it) } ?: Color.White,
            maxLines = 1,
            modifier = Modifier.weight(1f).basicMarquee()
          )
        }
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.SpaceBetween,
          verticalAlignment = Alignment.CenterVertically
        ) {
          if (targetLine != null) {
            Text(
              text = targetLine,
              fontSize = 12.sp,
              fontWeight = FontWeight.SemiBold,
              color = SetTint.Blue.light,
              maxLines = 1,
              overflow = TextOverflow.Ellipsis,
              modifier = Modifier.weight(1f)
            )
          }
          SetProgressDots(
            step = nextStep,
            allSteps = workoutStore.steps.collectAsState().value,
            completedIds = completedIds
          )
        }
      }
    }
  }
}

@Composable
private fun RestPillButton(
  label: String,
  bg: Color,
  fg: Color,
  enabled: Boolean,
  modifier: Modifier = Modifier,
  onClick: () -> Unit
) {
  Box(
    modifier = modifier
      .height(32.dp)
      .clip(CircleShape)
      .background(bg)
      .clickable(enabled = enabled, onClick = onClick),
    contentAlignment = Alignment.Center
  ) {
    Text(
      text = label,
      fontSize = 11.sp,
      fontWeight = FontWeight.Bold,
      color = fg,
      maxLines = 1
    )
  }
}

@Composable
private fun CountdownRingCanvas(
  fraction: Float,
  color: Color,
  trackColor: Color,
  strokeDp: Float
) {
  Canvas(modifier = Modifier.fillMaxSize()) {
    val strokePx = strokeDp.dp.toPx()
    val inset = strokePx / 2f + 2f
    val arcSize = Size(size.width - inset * 2f, size.height - inset * 2f)
    val topLeft = Offset(inset, inset)
    drawArc(
      color = trackColor,
      startAngle = -90f,
      sweepAngle = 360f,
      useCenter = false,
      topLeft = topLeft,
      size = arcSize,
      style = Stroke(width = strokePx, cap = StrokeCap.Round)
    )
    drawArc(
      color = color,
      startAngle = -90f,
      sweepAngle = 360f * fraction.coerceIn(0f, 1f),
      useCenter = false,
      topLeft = topLeft,
      size = arcSize,
      style = Stroke(width = strokePx, cap = StrokeCap.Round)
    )
  }
}

// ---- Page 4: More Scrolling List ----

@Composable
private fun WorkoutMorePage(
  workoutStore: WorkoutSessionStore,
  watchCtx: WatchContext,
  currentStep: WorkoutStep?,
  setValuesMap: Map<String, SetValues>,
  loggedOrder: List<String>,
  isCurrentPage: Boolean,
  onOpenList: () -> Unit,
  onOpenPlates: () -> Unit,
  onOpenSetType: () -> Unit,
  onOpenSwap: () -> Unit,
  onOpenAddExercise: () -> Unit,
  onOpenWater: () -> Unit,
  onRequestConfirm: (ConfirmAction) -> Unit,
  onBackToSet: () -> Unit
) {
  val listState = rememberScalingLazyListState()
  val upcoming = workoutStore.upcomingExercises
  val nextUp = upcoming.firstOrNull()
  val lastLoggedStep = workoutStore.loggedSteps.lastOrNull()

  val platesSummary: String? = remember(currentStep, setValuesMap) {
    val cfg = currentStep?.plates ?: return@remember null
    val wKg = workoutStore.valuesFor(currentStep).weightKg?.takeIf { it > 0.0 } ?: return@remember null
    when (val res = WatchPlates.calculate(wKg, cfg)) {
      is WatchPlates.Result.Exact -> if (res.load.plates.isEmpty()) "__BAR_ONLY__" else WatchPlates.summary(res.load.plates)
      else -> "__NOT_EXACT__"
    }
  }
  val resolvedPlatesSubtitle = when (platesSummary) {
    null -> null
    "__BAR_ONLY__" -> stringResource(R.string.workout_new_plates_bar_only)
    "__NOT_EXACT__" -> stringResource(R.string.workout_new_plates_not_exact)
    else -> platesSummary
  }

  ScalingLazyColumn(
    state = listState,
    autoCentering = null,
    verticalArrangement = Arrangement.spacedBy(5.dp),
    contentPadding = PaddingValues(start = 14.dp, end = 14.dp, top = 26.dp, bottom = 30.dp),
    modifier = Modifier
      .fillMaxSize()
      .wearRotaryScroll(listState, isCurrentPage)
  ) {
    item {
      Text(
        text = stringResource(R.string.workout_new_more_title),
        fontSize = 13.sp,
        fontWeight = FontWeight.SemiBold,
        color = SetTint.Blue.color,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().padding(bottom = 2.dp)
      )
    }

    // Up Next card
    item {
      Column(
        modifier = Modifier
          .fillMaxWidth()
          .clip(RoundedCornerShape(14.dp))
          .background(SetTint.Blue.mixed(0.26f, 4f / 255f, 18f / 255f, 46f / 255f))
          .padding(9.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp)
      ) {
        if (nextUp != null) {
          Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
          ) {
            Text(
              text = stringResource(R.string.workout_new_next_prefix),
              fontSize = 12.sp,
              color = SetTint.LightGrey
            )
            Text(
              text = nextUp.exerciseName,
              fontSize = 12.sp,
              fontWeight = FontWeight.SemiBold,
              color = nextUp.supersetRun?.let { SetSupersetPalette.color(it) } ?: Color.White,
              maxLines = 1,
              modifier = Modifier.weight(1f).basicMarquee()
            )
          }
          formatSetTarget(nextUp, workoutStore, spaced = true)?.let { target ->
            Text(
              text = target,
              fontSize = 14.sp,
              fontWeight = FontWeight.SemiBold,
              color = SetTint.Blue.light,
              maxLines = 1
            )
          }
          Text(
            text = pluralStringResource(
              R.plurals.workout_new_up_next_sets,
              nextUp.totalSetsInExercise,
              nextUp.totalSetsInExercise
            ),
            fontSize = 11.sp,
            color = SetTint.LightGrey
          )
        } else {
          Text(
            text = stringResource(R.string.workout_new_last_exercise),
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color.White
          )
        }
        Spacer(Modifier.height(2.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(5.dp), modifier = Modifier.fillMaxWidth()) {
          if (nextUp != null && watchCtx.effectiveExerciseDoNow && currentStep != null) {
            Box(
              modifier = Modifier
                .weight(1f)
                .height(28.dp)
                .clip(CircleShape)
                .background(SetTint.Surface)
                .clickable {
                  Haptics.click()
                  workoutStore.applyEdit(
                    WorkoutEditAction.DoExerciseNow(nextUp.exerciseEntryId, currentStep.exerciseEntryId)
                  )
                  onBackToSet()
                },
              contentAlignment = Alignment.Center
            ) {
              Text(
                text = stringResource(R.string.workout_new_do_first),
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                color = Color.White,
                maxLines = 1
              )
            }
          }
          Box(
            modifier = Modifier
              .weight(1f)
              .height(28.dp)
              .clip(CircleShape)
              .background(SetTint.Surface)
              .clickable {
                Haptics.click()
                onOpenList()
              },
            contentAlignment = Alignment.Center
          ) {
            Text(
              text = stringResource(R.string.workout_new_list),
              fontSize = 11.sp,
              fontWeight = FontWeight.SemiBold,
              color = Color.White,
              maxLines = 1
            )
          }
        }
      }
    }

    // THIS SET section
    if (currentStep != null) {
      item { MoreSectionHeader(stringResource(R.string.workout_new_section_this_set)) }
      item {
        val typeStr = localizedMoreSetType(currentStep.setType)
        Row(horizontalArrangement = Arrangement.spacedBy(5.dp), modifier = Modifier.fillMaxWidth()) {
          MoreActionTile(
            title = stringResource(R.string.workout_new_tile_type),
            subtitle = typeStr,
            modifier = Modifier.weight(1f),
            onClick = onOpenSetType
          )
          if (resolvedPlatesSubtitle != null) {
            MoreActionTile(
              title = stringResource(R.string.workout_new_tile_plates),
              subtitle = resolvedPlatesSubtitle,
              modifier = Modifier.weight(1f),
              onClick = onOpenPlates
            )
          } else {
            MoreActionTile(
              title = stringResource(R.string.workout_new_tile_add_set),
              subtitle = stringResource(R.string.workout_new_tile_add_set_hint),
              modifier = Modifier.weight(1f),
              onClick = { workoutStore.applyEdit(WorkoutEditAction.AddSet(currentStep.exerciseEntryId)) }
            )
          }
        }
      }
      item {
        Row(horizontalArrangement = Arrangement.spacedBy(5.dp), modifier = Modifier.fillMaxWidth()) {
          if (resolvedPlatesSubtitle != null) {
            MoreActionTile(
              title = stringResource(R.string.workout_new_tile_add_set),
              subtitle = stringResource(R.string.workout_new_tile_add_set_hint),
              modifier = Modifier.weight(1f),
              onClick = { workoutStore.applyEdit(WorkoutEditAction.AddSet(currentStep.exerciseEntryId)) }
            )
            MoreActionTile(
              title = stringResource(R.string.workout_new_tile_delete_set),
              destructive = true,
              modifier = Modifier.weight(1f),
              onClick = { onRequestConfirm(ConfirmAction.DELETE_SET) }
            )
          } else {
            MoreActionTile(
              title = stringResource(R.string.workout_new_tile_delete_set),
              destructive = true,
              modifier = Modifier.weight(1f),
              onClick = { onRequestConfirm(ConfirmAction.DELETE_SET) }
            )
            Spacer(Modifier.weight(1f))
          }
        }
      }

      // EXERCISE section
      item { MoreSectionHeader(stringResource(R.string.workout_new_section_exercise)) }
      if (upcoming.isNotEmpty()) {
        item {
          Row(horizontalArrangement = Arrangement.spacedBy(5.dp), modifier = Modifier.fillMaxWidth()) {
            if (watchCtx.effectiveExerciseDoNow) {
              MoreActionTile(
                title = stringResource(R.string.workout_new_tile_swap),
                modifier = Modifier.weight(1f),
                onClick = onOpenSwap
              )
            }
            MoreActionTile(
              title = stringResource(R.string.workout_new_tile_skip),
              subtitle = stringResource(R.string.workout_new_tile_skip_hint),
              modifier = Modifier.weight(1f),
              onClick = {
                workoutStore.jumpToExercise(upcoming.first().exerciseEntryId)
                onBackToSet()
              }
            )
            if (!watchCtx.effectiveExerciseDoNow) {
              Spacer(Modifier.weight(1f))
            }
          }
        }
      }
      item {
        Row(horizontalArrangement = Arrangement.spacedBy(5.dp), modifier = Modifier.fillMaxWidth()) {
          MoreActionTile(
            title = stringResource(R.string.workout_new_tile_delete_exercise),
            destructive = true,
            modifier = Modifier.weight(1f),
            onClick = { onRequestConfirm(ConfirmAction.DELETE_EXERCISE) }
          )
          Spacer(Modifier.weight(1f))
        }
      }
    }

    // WORKOUT section
    item { MoreSectionHeader(stringResource(R.string.workout_new_section_workout)) }
    item {
      Row(horizontalArrangement = Arrangement.spacedBy(5.dp), modifier = Modifier.fillMaxWidth()) {
        MoreActionTile(
          title = stringResource(R.string.workout_new_tile_water),
          modifier = Modifier.weight(1f),
          onClick = onOpenWater
        )
        MoreActionTile(
          title = stringResource(R.string.workout_new_tile_undo_set),
          subtitle = stringResource(R.string.workout_new_tile_undo_set_hint),
          enabled = lastLoggedStep != null && loggedOrder.isNotEmpty(),
          modifier = Modifier.weight(1f),
          onClick = {
            if (lastLoggedStep != null && workoutStore.uncompleteStep(lastLoggedStep)) {
              onBackToSet()
            }
          }
        )
      }
    }
    item {
      Row(horizontalArrangement = Arrangement.spacedBy(5.dp), modifier = Modifier.fillMaxWidth()) {
        MoreActionTile(
          title = stringResource(R.string.workout_new_tile_add_exercise),
          modifier = Modifier.weight(1f),
          onClick = onOpenAddExercise
        )
        MoreActionTile(
          title = stringResource(R.string.workout_new_tile_discard),
          destructive = true,
          modifier = Modifier.weight(1f),
          onClick = { onRequestConfirm(ConfirmAction.DISCARD) }
        )
      }
    }
    item {
      Box(
        modifier = Modifier
          .fillMaxWidth()
          .padding(top = 2.dp)
          .height(38.dp)
          .clip(RoundedCornerShape(12.dp))
          .background(Color.White)
          .clickable {
            Haptics.click()
            onRequestConfirm(ConfirmAction.FINISH)
          },
        contentAlignment = Alignment.Center
      ) {
        Text(
          text = stringResource(R.string.workout_finish_btn),
          fontSize = 13.sp,
          fontWeight = FontWeight.Bold,
          color = Color.Black
        )
      }
    }
  }
}

@Composable
private fun MoreSectionHeader(title: String) {
  Text(
    text = title,
    fontSize = 10.sp,
    fontWeight = FontWeight.Bold,
    color = SetTint.Grey,
    modifier = Modifier
      .fillMaxWidth()
      .padding(start = 4.dp, top = 4.dp)
  )
}

@Composable
private fun MoreActionTile(
  title: String,
  subtitle: String? = null,
  destructive: Boolean = false,
  enabled: Boolean = true,
  modifier: Modifier = Modifier,
  onClick: () -> Unit
) {
  Column(
    modifier = modifier
      .height(54.dp)
      .clip(RoundedCornerShape(12.dp))
      .background(SetTint.Surface)
      .alpha(if (enabled) 1f else 0.35f)
      .clickable(enabled = enabled) {
        Haptics.click()
        onClick()
      }
      .padding(horizontal = 8.dp, vertical = 6.dp),
    verticalArrangement = Arrangement.Center,
    horizontalAlignment = Alignment.Start
  ) {
    Text(
      text = title,
      fontSize = 13.sp,
      fontWeight = FontWeight.SemiBold,
      color = if (destructive) SetTint.Destructive else Color.White,
      maxLines = 2,
      overflow = TextOverflow.Ellipsis
    )
    if (subtitle != null) {
      Text(
        text = subtitle,
        fontSize = 10.sp,
        color = SetTint.LightGrey,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis
      )
    }
  }
}

// ---- Overlay: Plate Calculator ----

@Composable
private fun PlatesCalculatorOverlay(
  config: WatchPlateConfig,
  initialWeightKg: Double,
  onUse: (Double) -> Unit,
  onClose: () -> Unit
) {
  var targetKg by remember(initialWeightKg) { mutableStateOf(initialWeightKg) }
  val result = remember(targetKg, config) { WatchPlates.calculate(targetKg, config) }
  val isExact = result is WatchPlates.Result.Exact
  val shownLoad = when (result) {
    is WatchPlates.Result.Exact -> result.load
    is WatchPlates.Result.Inexact -> result.below ?: result.above
    WatchPlates.Result.Invalid -> null
  }
  val displayNum = WatchPlates.number(WatchPlates.inUnit(targetKg, config))
  val unitLabel = config.unit

  fun step(up: Boolean) {
    WatchPlates.nextLoadable(targetKg, up = up, config = config)?.let { next ->
      targetKg = next
      Haptics.click()
    }
  }

  val endInset = 24.dp

  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(Color.Black)
      .wearRotaryStepper(isCurrentPage = true) { steps ->
        val up = steps > 0
        repeat(abs(steps).coerceAtMost(5)) { step(up) }
      }
      .padding(horizontal = 14.dp)
      .padding(top = 30.dp, bottom = 24.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.SpaceBetween
  ) {
    // Top row: −  105 lbs  +
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .padding(horizontal = endInset),
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.SpaceBetween
    ) {
      RoundNavButton("−") { step(up = false) }
      Row(
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(2.dp)
      ) {
        Text(
          text = displayNum,
          fontSize = 22.sp,
          fontWeight = FontWeight.Bold,
          color = Color.White,
          maxLines = 1
        )
        Text(
          text = unitLabel,
          fontSize = 11.sp,
          fontWeight = FontWeight.SemiBold,
          color = SetTint.LightGrey,
          modifier = Modifier.padding(bottom = 3.dp)
        )
      }
      RoundNavButton("+") { step(up = true) }
    }

    // Barbell visual
    BarbellDrawing(
      config = config,
      plates = shownLoad?.plates.orEmpty(),
      dim = !isExact,
      modifier = Modifier
        .fillMaxWidth()
        .height(48.dp)
        .padding(horizontal = 4.dp)
    )

    // Plates breakdown + bar weight
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
      val captionText = when (result) {
        is WatchPlates.Result.Exact -> {
          if (result.load.plates.isEmpty()) stringResource(R.string.workout_new_plates_bar_only)
          else WatchPlates.captionList(result.load.plates)
        }
        is WatchPlates.Result.Inexact -> {
          val nearest = listOfNotNull(result.below, result.above)
            .joinToString(" / ") { WatchPlates.number(it.total) }
          stringResource(R.string.workout_new_plates_closest, nearest)
        }
        WatchPlates.Result.Invalid -> stringResource(R.string.workout_new_plates_unavailable)
      }
      Text(
        text = captionText,
        fontSize = 13.sp,
        fontWeight = FontWeight.SemiBold,
        color = if (isExact) Color.White else SetTint.Hold.color,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis
      )
      Text(
        text = stringResource(R.string.workout_new_plates_bar_line, WatchPlates.number(config.barWeight), unitLabel),
        fontSize = 10.sp,
        color = SetTint.LightGrey
      )
    }

    // Use button (or close on tap if disabled)
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .padding(horizontal = endInset),
      horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
      RoundNavButton("‹", onClick = onClose)
      Box(
        modifier = Modifier
          .weight(1f)
          .height(36.dp)
          .clip(CircleShape)
          .background(Color.White)
          .alpha(if (isExact) 1f else 0.35f)
          .clickable(enabled = isExact) {
            Haptics.success()
            onUse(targetKg)
          },
        contentAlignment = Alignment.Center
      ) {
        Text(
          text = stringResource(R.string.workout_new_plates_use, displayNum, unitLabel),
          fontSize = 13.sp,
          fontWeight = FontWeight.Bold,
          color = Color.Black,
          maxLines = 1
        )
      }
    }
  }
}

@Composable
private fun BarbellDrawing(
  config: WatchPlateConfig,
  plates: List<WatchPlates.Count>,
  dim: Boolean,
  modifier: Modifier = Modifier
) {
  val flat = remember(plates) { plates.flatMap { c -> List(c.count) { c.weight } } }
  Canvas(modifier = modifier.alpha(if (dim) 0.4f else 1f)) {
    val h = size.height
    val w = size.width
    val centerY = h / 2f
    val gap = 1.5.dp.toPx()
    val stopWidth = 6.dp.toPx()
    val stopH = h * 0.34f
    val collarW = 4.dp.toPx()
    val maxPlateW = 10.dp.toPx()
    val plateW = min(maxPlateW, (w * 0.62f) / max(flat.size, 6).toFloat())

    var x = 0f
    // Bar stop
    drawRoundRect(
      color = Color(0xFF8C8C8C),
      topLeft = Offset(x, centerY - stopH / 2f),
      size = Size(stopWidth, stopH),
      cornerRadius = CornerRadius(2.dp.toPx())
    )
    x += stopWidth + gap

    // Plates
    for (plateWeight in flat) {
      val kgWeight = if (config.unit == "lbs") plateWeight * WeightRounding.KG_PER_LB else plateWeight
      val plateColor = competitionPlateColor(kgWeight)
      val plateH = max(h * 0.28f, h * min(1f, (0.38 + kgWeight / 25.0 * 0.62).toFloat()))
      drawRoundRect(
        color = plateColor,
        topLeft = Offset(x, centerY - plateH / 2f),
        size = Size(plateW, plateH),
        cornerRadius = CornerRadius(2.5.dp.toPx())
      )
      x += plateW + gap
    }

    // Collar
    if (config.collarWeight > 0.0) {
      val collarH = h * 0.30f
      drawRoundRect(
        color = Color(0xFFCCCCCC),
        topLeft = Offset(x, centerY - collarH / 2f),
        size = Size(collarW, collarH),
        cornerRadius = CornerRadius(1.5.dp.toPx())
      )
      x += collarW + gap
    }

    // Bar sleeve
    val sleeveH = h * 0.12f
    val sleeveW = max(10.dp.toPx(), w - x)
    drawRoundRect(
      color = Color(0xFFB3B3B3),
      topLeft = Offset(x, centerY - sleeveH / 2f),
      size = Size(sleeveW, sleeveH),
      cornerRadius = CornerRadius(2.dp.toPx())
    )
  }
}

private fun competitionPlateColor(kg: Double): Color = when {
  kg >= 25.0 -> Color(0xFFE64045) // Red
  kg >= 20.0 -> Color(0xFF4285F5) // Blue
  kg >= 15.0 -> Color(0xFFF5CC40) // Yellow
  kg >= 10.0 -> Color(0xFF4DBF66) // Green
  kg >= 5.0 -> Color(0xFFEBEBEB)  // White
  kg >= 2.5 -> Color(0xFFF28C33)  // Orange
  else -> Color(0xFF9E9E9E)       // Light grey
}

// ---- Overlay: Edit Previous Set ----

@Composable
private fun EditPreviousSetOverlay(
  workoutStore: WorkoutSessionStore,
  onClose: () -> Unit
) {
  val steps by workoutStore.steps.collectAsState()
  val loggedOrder by workoutStore.loggedSetOrder.collectAsState()
  val completedIds by workoutStore.completedSetIdsFlow.collectAsState()
  val logged = remember(steps, loggedOrder) {
    val byId = steps.associateBy { it.setId }
    loggedOrder.mapNotNull { byId[it] }
  }

  var index by remember { mutableIntStateOf(max(0, logged.lastIndex)) }
  var selectedId by remember { mutableStateOf(logged.lastOrNull()?.setId) }
  var draftWeightKg by remember { mutableStateOf<Double?>(null) }
  var draftReps by remember { mutableStateOf<Double?>(null) }
  var draftDistanceKm by remember { mutableStateOf<Double?>(null) }
  var draftSetId by remember { mutableStateOf<String?>(null) }
  var editingField by remember { mutableStateOf<String?>(null) }

  // Reconcile if a set was unlogged externally
  LaunchedEffect(logged) {
    if (draftSetId != null && logged.none { it.setId == draftSetId }) {
      draftWeightKg = null
      draftReps = null
      draftDistanceKm = null
      draftSetId = null
    }
    if (logged.isEmpty()) {
      onClose()
      return@LaunchedEffect
    }
    val found = selectedId?.let { id -> logged.indexOfFirst { it.setId == id } }
    if (found != null && found >= 0) {
      index = found
    } else {
      index = index.coerceIn(0, logged.lastIndex)
      selectedId = logged[index].setId
    }
  }

  val step = logged.getOrNull(index)
  if (step == null) {
    Box(
      modifier = Modifier.fillMaxSize().background(Color.Black).clickable { onClose() },
      contentAlignment = Alignment.Center
    ) {
      Text(
        text = stringResource(R.string.workout_new_no_logged_sets),
        fontSize = 12.sp,
        color = SetTint.Grey
      )
    }
    return
  }

  val baseVals = workoutStore.valuesFor(step)
  val curWeightKg = if (draftSetId == step.setId && draftWeightKg != null) draftWeightKg else baseVals.weightKg
  val curReps = if (draftSetId == step.setId && draftReps != null) draftReps else baseVals.reps
  val curDistKm = if (draftSetId == step.setId && draftDistanceKm != null) draftDistanceKm else baseVals.distanceKm
  val unit = workoutStore.weightUnit
  val carryFactor = if (workoutStore.usesMiles) 1093.6133 else 1000.0
  val carrySuffix = stringResource(
    if (workoutStore.usesMiles) R.string.workout_new_unit_yd else R.string.workout_new_unit_m
  )

  if (editingField != null) {
    val field = editingField!!
    val initialVal = when (field) {
      "weight" -> (curWeightKg ?: 0.0).let { unit.displayedFromKg(it) }
      "distance" -> ((curDistKm ?: 0.05) * carryFactor * 10.0).roundToInt() / 10.0
      else -> curReps ?: 10.0
    }
    WatchKeypadSheet(
      title = when (field) {
        "weight" -> stringResource(R.string.weight_keypad_title, unit.suffix)
        "distance" -> stringResource(R.string.run_keypad_distance, carrySuffix)
        else -> stringResource(R.string.workout_keypad_reps)
      },
      initialValue = initialVal,
      allowDecimal = field != "reps",
      allowNegative = field == "weight" && step.bodyweight,
      allowZero = field == "weight" && step.bodyweight,
      onConfirm = { entered ->
        if (draftSetId != step.setId) {
          draftWeightKg = null
          draftReps = null
          draftDistanceKm = null
          draftSetId = step.setId
        }
        when (field) {
          "weight" -> draftWeightKg = unit.toKg(entered)
          "distance" -> draftDistanceKm = entered / carryFactor
          else -> draftReps = entered
        }
        editingField = null
      },
      onCancel = { editingField = null }
    )
    return
  }

  fun selectAt(pos: Int) {
    draftWeightKg = null
    draftReps = null
    draftDistanceKm = null
    draftSetId = null
    index = pos
    selectedId = logged.getOrNull(pos)?.setId
  }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(Color.Black)
      .padding(horizontal = 16.dp)
      .padding(top = 28.dp, bottom = 24.dp),
    horizontalAlignment = Alignment.CenterHorizontally
  ) {
    // Top pill: ✎ Set N
    Row(
      modifier = Modifier
        .height(28.dp)
        .clip(CircleShape)
        .background(SetTint.Blue.pill)
        .padding(start = 3.dp, end = 10.dp),
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(5.dp)
    ) {
      Box(
        modifier = Modifier.size(22.dp).clip(CircleShape).background(SetTint.Blue.pillIcon),
        contentAlignment = Alignment.Center
      ) {
        Icon(Icons.Rounded.Edit, null, tint = SetTint.Blue.color, modifier = Modifier.size(13.dp))
      }
      Text(
        text = stringResource(R.string.workout_new_editing_set, step.setIndexInExercise),
        fontSize = 11.sp,
        fontWeight = FontWeight.SemiBold,
        color = SetTint.Blue.color
      )
    }

    Spacer(Modifier.height(4.dp))
    Text(
      text = step.exerciseName,
      fontSize = 16.sp,
      fontWeight = FontWeight.Bold,
      color = Color.White,
      maxLines = 1,
      modifier = Modifier.fillMaxWidth().basicMarquee()
    )

    Row(
      modifier = Modifier.fillMaxWidth().padding(top = 1.dp, bottom = 5.dp),
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.SpaceBetween
    ) {
      val label = "${step.equipment ?: localizedSetProgressLabel(step)} · ${stringResource(R.string.workout_new_logged_tag)}"
      Text(
        text = label,
        fontSize = 10.sp,
        color = SetTint.Grey,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier.weight(1f)
      )
      SetProgressDots(step = step, allSteps = steps, completedIds = completedIds)
    }

    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
      val holdSec = baseVals.durationSec ?: step.targetDurationSec
      if (!step.timed || curWeightKg != null || step.weighted) {
        val dispW = curWeightKg?.let { unit.displayedFromKg(it) }
        ValueTile(
          label = stringResource(R.string.workout_new_field_weight),
          value = if (step.bodyweight) formatBodyweightText(dispW) else formatNumberClean(dispW),
          suffix = if (unit == WeightUnit.LBS) "lb" else "kg",
          fill = SetTint.Blue.tile,
          showBadge = true,
          modifier = Modifier.weight(1f),
          onClick = { editingField = "weight" }
        )
      }
      when {
        step.timed && holdSec != null -> {
          ValueTile(
            label = stringResource(R.string.workout_new_field_time),
            value = formatShortDuration(holdSec),
            suffix = null,
            fill = SetTint.Blue.mixed(0.20f),
            showBadge = false,
            modifier = Modifier.weight(1f),
            onClick = {}
          )
        }
        step.carry -> {
          val distDisp = curDistKm?.let { ((it * carryFactor) * 10.0).roundToInt() / 10.0 }
          ValueTile(
            label = stringResource(R.string.workout_new_field_distance),
            value = formatNumberClean(distDisp),
            suffix = carrySuffix,
            fill = SetTint.Blue.tile,
            showBadge = true,
            modifier = Modifier.weight(1f),
            onClick = { editingField = "distance" }
          )
        }
        !step.timed -> {
          ValueTile(
            label = stringResource(R.string.workout_new_field_reps),
            value = formatNumberClean(curReps),
            suffix = null,
            fill = SetTint.Blue.tile,
            showBadge = true,
            modifier = Modifier.weight(1f),
            onClick = { editingField = "reps" }
          )
        }
      }
    }

    Spacer(Modifier.weight(1f))

    // Bottom: ‹ Save ›
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .padding(horizontal = 18.dp),
      horizontalArrangement = Arrangement.spacedBy(5.dp),
      verticalAlignment = Alignment.CenterVertically
    ) {
      val older = LoggedSetOrder.older(index)
      RoundNavButton(glyph = "‹", enabled = older != null) {
        if (older != null) selectAt(older)
      }
      Box(
        modifier = Modifier
          .weight(1f)
          .height(38.dp)
          .clip(CircleShape)
          .background(Color.White)
          .clickable {
            Haptics.success()
            if (draftSetId == step.setId && (draftWeightKg != null || draftReps != null || draftDistanceKm != null)) {
              workoutStore.setValue(
                setId = step.setId,
                weightKg = draftWeightKg,
                reps = draftReps,
                distanceKm = draftDistanceKm,
                notifyPhone = true
              )
            }
            onClose()
          },
        contentAlignment = Alignment.Center
      ) {
        Text(
          text = stringResource(R.string.common_save),
          fontSize = 13.sp,
          fontWeight = FontWeight.Bold,
          color = Color.Black
        )
      }
      RoundNavButton(glyph = "›", enabled = true) {
        when (val next = LoggedSetOrder.newer(index, logged.size)) {
          is LoggedSetOrder.Newer.SetIndex -> selectAt(next.index)
          LoggedSetOrder.Newer.Current -> onClose()
        }
      }
    }
  }
}

// ---- Overlay: Exercise List ----

@Composable
private fun ExerciseListOverlay(
  workoutStore: WorkoutSessionStore,
  completedIds: Set<String>,
  onSelect: (String) -> Unit,
  onClose: () -> Unit
) {
  val plan by workoutStore.plan.collectAsState()
  val exercises = plan?.exercises.orEmpty()
  val currentEntryId = workoutStore.currentStep?.exerciseEntryId
  val listState = rememberScalingLazyListState()

  ScalingLazyColumn(
    state = listState,
    autoCentering = null,
    verticalArrangement = Arrangement.spacedBy(5.dp),
    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 32.dp, bottom = 36.dp),
    modifier = Modifier
      .fillMaxSize()
      .background(Color.Black)
      .wearRotaryScroll(listState, isCurrentPage = true)
  ) {
    item {
      Text(
        text = plan?.workoutName ?: stringResource(R.string.workout_new_fallback_title),
        fontSize = 13.sp,
        fontWeight = FontWeight.SemiBold,
        color = SetTint.Blue.color,
        textAlign = TextAlign.Center,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier
          .fillMaxWidth()
          .clickable {
            Haptics.click()
            onClose()
          }
          .padding(horizontal = 16.dp, vertical = 4.dp)
      )
    }
    items(exercises, key = { it.exerciseEntryId }) { ex ->
      val isCur = ex.exerciseEntryId == currentEntryId
      val done = ex.sets.count { completedIds.contains(it.setId) }
      val allDone = ex.sets.isNotEmpty() && done == ex.sets.size
      val shape = RoundedCornerShape(12.dp)
      Box(
        modifier = Modifier
          .fillMaxWidth()
          .clip(shape)
          .background(if (isCur) SetTint.Blue.mixed(0.26f) else SetTint.Surface)
          .clickable {
            Haptics.click()
            onSelect(ex.exerciseEntryId)
          }
      ) {
        if (ex.supersetRun != null) {
          Box(
            modifier = Modifier
              .align(Alignment.CenterStart)
              .width(3.dp)
              .height(34.dp)
              .background(SetSupersetPalette.color(ex.supersetRun))
          )
        }
        Row(
          modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 10.dp, vertical = 9.dp),
          horizontalArrangement = Arrangement.SpaceBetween,
          verticalAlignment = Alignment.CenterVertically
        ) {
          Text(
            text = ex.name,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            color = if (isCur) SetTint.Blue.color else Color.White,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
          )
          Spacer(Modifier.width(6.dp))
          Text(
            text = "$done/${ex.sets.size}",
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = when {
              allDone -> SetTint.Green
              isCur -> SetTint.Blue.color
              else -> Color.White
            }
          )
        }
      }
    }
  }
}

// ---- Overlay: Effort Track & Set RPE Picker ----

@Composable
internal fun EffortTrackBar(
  values: List<Double>,
  selectedIndex: Int,
  uniformColor: Color? = null,
  onSelectIndex: (Int) -> Unit,
  modifier: Modifier = Modifier
) {
  var trackWidthPx by remember { mutableIntStateOf(1) }
  val currentSelectedIndex by rememberUpdatedState(selectedIndex)
  val currentOnSelectIndex by rememberUpdatedState(onSelectIndex)
  val dense = values.size > 10

  fun indexForX(x: Float): Int {
    val fraction = (x / max(1, trackWidthPx).toFloat()).coerceIn(0f, 0.999f)
    return (fraction * values.size).toInt().coerceIn(0, values.lastIndex)
  }

  Row(
    modifier = modifier
      .fillMaxWidth()
      .height(26.dp)
      .onSizeChanged { trackWidthPx = it.width }
      .pointerInput(values) {
        detectTapGestures { offset ->
          val next = indexForX(offset.x)
          if (next != currentSelectedIndex) {
            Haptics.click()
            currentOnSelectIndex(next)
          }
        }
      }
      .pointerInput(values) {
        detectHorizontalDragGestures { change, _ ->
          change.consume()
          val next = indexForX(change.position.x)
          if (next != currentSelectedIndex) {
            Haptics.click()
            currentOnSelectIndex(next)
          }
        }
      },
    horizontalArrangement = Arrangement.spacedBy(if (dense) 2.dp else 3.dp),
    verticalAlignment = Alignment.CenterVertically
  ) {
    values.forEachIndexed { i, v ->
      val segColor = uniformColor ?: Color(EffortBand.fromScore(v).colorHex)
      if (i == selectedIndex) {
        Box(
          modifier = Modifier
            .width(12.dp)
            .height(22.dp)
            .clip(RoundedCornerShape(6.dp))
            .background(segColor)
            .padding(2.dp)
            .clip(RoundedCornerShape(4.dp))
            .background(Color.White)
        )
      } else {
        Box(
          modifier = Modifier
            .weight(1f)
            .height(if (dense) 7.dp else 9.dp)
            .clip(RoundedCornerShape(3.dp))
            .background(if (i < selectedIndex) segColor else Color(0xFF2A2C30))
        )
      }
    }
  }
}

@Composable
private fun RpePickerOverlay(
  setNumber: Int,
  onDone: (Double?) -> Unit
) {
  val rpeValues = remember {
    listOf(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0)
  }
  var idx by remember { mutableIntStateOf(rpeValues.indexOf(8.0)) }
  val value = rpeValues[idx]

  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(Color.Black)
      .wearRotaryStepper(isCurrentPage = true) { steps ->
        val next = (idx + steps).coerceIn(0, rpeValues.lastIndex)
        if (next != idx) {
          idx = next
          Haptics.click()
        }
      }
      .padding(horizontal = 18.dp)
      .padding(top = 28.dp, bottom = 26.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.SpaceBetween
  ) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
      Text(
        text = stringResource(R.string.workout_new_how_hard),
        fontSize = 15.sp,
        fontWeight = FontWeight.SemiBold,
        color = Color.White,
        textAlign = TextAlign.Center
      )
      Text(
        text = stringResource(R.string.workout_new_set_done, setNumber),
        fontSize = 11.sp,
        color = SetTint.Grey,
        textAlign = TextAlign.Center
      )
    }

    Row(
      verticalAlignment = Alignment.Bottom,
      horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
      Text(
        text = formatNumberClean(value),
        fontSize = 34.sp,
        fontWeight = FontWeight.Bold,
        color = Color.White
      )
      Text(
        text = localizedRpeShort(value),
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        color = SetTint.Blue.color,
        modifier = Modifier.padding(bottom = 5.dp)
      )
    }

    EffortTrackBar(
      values = rpeValues,
      selectedIndex = idx,
      uniformColor = SetTint.Blue.color,
      onSelectIndex = { idx = it }
    )

    Row(
      modifier = Modifier
        .fillMaxWidth()
        .padding(horizontal = 18.dp),
      horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
      RestPillButton(
        label = stringResource(R.string.common_skip),
        bg = SetTint.Surface,
        fg = Color.White,
        enabled = true,
        modifier = Modifier.weight(1f)
      ) {
        Haptics.click()
        onDone(null)
      }
      RestPillButton(
        label = stringResource(R.string.common_save),
        bg = Color.White,
        fg = Color.Black,
        enabled = true,
        modifier = Modifier.weight(1f)
      ) {
        Haptics.success()
        onDone(value)
      }
    }
  }
}

// ---- Overlay: Full-Screen New PR Celebration ----

@Composable
private fun NewPrOverlay(
  exerciseName: String,
  detail: String?,
  onContinue: () -> Unit
) {
  val shownAtMs = remember { System.currentTimeMillis() }
  var elapsedMs by remember { mutableLongStateOf(0L) }
  LaunchedEffect(Unit) {
    while (elapsedMs < 5000L) {
      elapsedMs = System.currentTimeMillis() - shownAtMs
      delay(50L)
    }
  }
  val leftSec = max(0, 5 - (elapsedMs / 1000L).toInt())
  val fillFraction = (1f - elapsedMs / 5000f).coerceIn(0f, 1f)
  val ink = Color(0xFF1A1200)

  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(
        Brush.verticalGradient(
          colors = listOf(Color(0xFFFFD35C), Color(0xFFF5A623), Color(0xFFE0820F))
        )
      )
      .padding(horizontal = 26.dp)
      .padding(top = 28.dp, bottom = 26.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.SpaceBetween
  ) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
      Icon(
        imageVector = Icons.Rounded.EmojiEvents,
        contentDescription = null,
        tint = ink,
        modifier = Modifier.size(30.dp)
      )
      Text(
        text = stringResource(R.string.workout_new_pr_title),
        fontSize = 22.sp,
        fontWeight = FontWeight.Bold,
        color = ink,
        maxLines = 1
      )
      if (exerciseName.isNotEmpty()) {
        Text(
          text = exerciseName,
          fontSize = 12.sp,
          fontWeight = FontWeight.SemiBold,
          color = ink,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis
        )
      }
      if (detail != null) {
        Text(
          text = detail,
          fontSize = 22.sp,
          fontWeight = FontWeight.Bold,
          color = ink,
          maxLines = 1
        )
      }
    }

    Box(
      modifier = Modifier
        .fillMaxWidth()
        .padding(horizontal = 12.dp)
        .height(34.dp)
        .clip(CircleShape)
        .background(ink)
        .clickable {
          Haptics.click()
          onContinue()
        },
      contentAlignment = Alignment.CenterStart
    ) {
      Box(
        modifier = Modifier
          .fillMaxHeight()
          .fillMaxWidth(fillFraction)
          .background(Color.White.copy(alpha = 0.28f))
      )
      Text(
        text = stringResource(R.string.workout_new_pr_continue, leftSec),
        fontSize = 12.sp,
        fontWeight = FontWeight.Bold,
        color = Color(0xFFFFD35C),
        modifier = Modifier.align(Alignment.Center)
      )
    }
  }
}

// ---- Single Scrolling Finish Summary (New Workout View) ----

@Composable
fun WorkoutFinishSummaryView(
  summary: WorkoutSummary,
  workoutStore: WorkoutSessionStore,
  watchCtx: WatchContext,
  onDone: () -> Unit
) {
  val listState = rememberScalingLazyListState()
  val unit = workoutStore.weightUnit
  val energy = EnergyDisplay.of(watchCtx)
  var presetAnswered by remember(summary.sessionId) { mutableStateOf(false) }
  var effortIdx by remember(summary.sessionId) { mutableIntStateOf(4) } // starts at 5 (1..10)
  var effortSaved by remember(summary.sessionId) { mutableStateOf(false) }
  var effortSkipped by remember(summary.sessionId) { mutableStateOf(false) }
  val effortScores = remember { (1..10).map { it.toDouble() } }

  val volumeText = remember(summary.volumeKg, unit) {
    val value = unit.fromKg(summary.volumeKg).roundToInt()
    "${NumberFormat.getIntegerInstance().format(value)} ${unit.suffix}"
  }
  val hrText = remember(summary.averageBpm, summary.maxBpm) {
    when {
      summary.averageBpm != null && summary.maxBpm != null ->
        "${summary.averageBpm.roundToInt()} / ${summary.maxBpm.roundToInt()}"
      summary.averageBpm != null -> "${summary.averageBpm.roundToInt()}"
      summary.maxBpm != null -> "${summary.maxBpm.roundToInt()}"
      else -> null
    }
  }

  ScalingLazyColumn(
    state = listState,
    autoCentering = null,
    verticalArrangement = Arrangement.spacedBy(4.dp),
    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 26.dp, bottom = 32.dp),
    modifier = Modifier
      .fillMaxSize()
      .background(Color.Black)
      .wearRotaryScroll(listState, isCurrentPage = true)
  ) {
    item {
      Text(
        text = stringResource(R.string.workout_new_done_title),
        fontSize = 14.sp,
        fontWeight = FontWeight.SemiBold,
        color = SetTint.Green,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp)
      )
    }
    item { SummaryStatRow(stringResource(R.string.workout_new_summary_time), formatCompactElapsed(summary.durationSeconds)) }
    item { SummaryStatRow(stringResource(R.string.workout_new_summary_sets), "${summary.setsCompleted}") }
    if (summary.volumeKg > 0.0) {
      item { SummaryStatRow(stringResource(R.string.workout_new_summary_volume), volumeText) }
    }
    if (hrText != null) {
      item { SummaryStatRow(stringResource(R.string.workout_new_summary_avg_max_hr), hrText) }
    }
    if (summary.activeEnergyKcal != null && summary.activeEnergyKcal > 0.0) {
      item {
        SummaryStatRow(
          stringResource(R.string.workout_new_summary_active),
          "${energy.whole(summary.activeEnergyKcal)} ${energy.unit}"
        )
      }
    }

    // How hard? (1-10 Workout Effort)
    item {
      val rating = effortIdx + 1
      val band = EffortBand.fromScore(rating.toDouble())
      Column(
        modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
      ) {
        Text(
          text = stringResource(R.string.workout_new_how_hard),
          fontSize = 14.sp,
          fontWeight = FontWeight.SemiBold,
          color = Color.White
        )
        if (effortSaved) {
          Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
          ) {
            Icon(Icons.Rounded.Check, null, tint = SetTint.Green, modifier = Modifier.size(16.dp))
            Text(
              text = stringResource(R.string.workout_new_effort_saved),
              fontSize = 13.sp,
              fontWeight = FontWeight.SemiBold,
              color = SetTint.Green
            )
          }
        } else if (!effortSkipped) {
          Row(
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
          ) {
            Text(
              text = "$rating",
              fontSize = 34.sp,
              fontWeight = FontWeight.Bold,
              color = Color.White
            )
            Text(
              text = localizedEffortBand(band),
              fontSize = 14.sp,
              fontWeight = FontWeight.SemiBold,
              color = Color(band.colorHex),
              modifier = Modifier.padding(bottom = 5.dp)
            )
          }
          EffortTrackBar(
            values = effortScores,
            selectedIndex = effortIdx,
            onSelectIndex = { effortIdx = it }
          )
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
          ) {
            RestPillButton(
              label = stringResource(R.string.common_skip),
              bg = SetTint.Surface,
              fg = Color.White,
              enabled = true,
              modifier = Modifier.weight(1f)
            ) {
              Haptics.click()
              effortSkipped = true
            }
            RestPillButton(
              label = stringResource(R.string.common_save),
              bg = Color.White,
              fg = Color.Black,
              enabled = true,
              modifier = Modifier.weight(1f)
            ) {
              workoutStore.rateWorkoutEffort(summary.sessionId, rating)
              effortSaved = true
            }
          }
        }
      }
    }

    // Inline Update Workout card when changed from preset
    if (summary.changedPresetName != null && !presetAnswered) {
      item {
        Column(
          modifier = Modifier
            .fillMaxWidth()
            .padding(top = 8.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(SetTint.Surface)
            .padding(10.dp),
          verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
          Text(
            text = stringResource(R.string.workout_new_changed_preset, summary.changedPresetName),
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color.White,
            maxLines = 2
          )
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
          ) {
            RestPillButton(
              label = stringResource(R.string.workout_preset_update_btn),
              bg = Color.White,
              fg = Color.Black,
              enabled = true,
              modifier = Modifier.weight(1f)
            ) {
              presetAnswered = true
              workoutStore.sendPresetUpdateAnswer(summary.sessionId, update = true)
            }
            RestPillButton(
              label = stringResource(R.string.workout_new_keep_short),
              bg = Color(0xFF2F3136),
              fg = Color.White,
              enabled = true,
              modifier = Modifier.weight(1f)
            ) {
              presetAnswered = true
              workoutStore.sendPresetUpdateAnswer(summary.sessionId, update = false)
            }
          }
        }
      }
    }

    // Done button
    item {
      Box(
        modifier = Modifier
          .fillMaxWidth()
          .padding(top = 10.dp)
          .height(38.dp)
          .clip(CircleShape)
          .background(Color.White)
          .clickable {
            Haptics.click()
            if (summary.changedPresetName != null && !presetAnswered) {
              presetAnswered = true
              workoutStore.sendPresetUpdateAnswer(summary.sessionId, update = false)
            }
            onDone()
          },
        contentAlignment = Alignment.Center
      ) {
        Text(
          text = stringResource(R.string.common_done),
          fontSize = 13.sp,
          fontWeight = FontWeight.Bold,
          color = Color.Black
        )
      }
    }
  }
}

@Composable
private fun SummaryStatRow(label: String, value: String) {
  Row(
    modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically
  ) {
    Text(text = label, fontSize = 12.sp, color = SetTint.LightGrey)
    Text(text = value, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
  }
}

// ---- Small Secondary Overlays (Set Type, Swap, Add Exercise, Confirmation) ----

@Composable
private fun SetTypeOverlay(
  currentType: String?,
  onPick: (String) -> Unit,
  onClose: () -> Unit
) {
  val listState = rememberScalingLazyListState()
  val types = listOf("normal", "warmup", "drop", "failure")
  val active = currentType?.lowercase(Locale.US) ?: "normal"

  ScalingLazyColumn(
    state = listState,
    autoCentering = null,
    verticalArrangement = Arrangement.spacedBy(5.dp),
    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 32.dp, bottom = 36.dp),
    modifier = Modifier
      .fillMaxSize()
      .background(Color.Black)
      .wearRotaryScroll(listState, isCurrentPage = true)
  ) {
    item {
      Text(
        text = stringResource(R.string.workout_new_set_type_title),
        fontSize = 13.sp,
        fontWeight = FontWeight.SemiBold,
        color = SetTint.Blue.color,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().clickable { onClose() }.padding(bottom = 2.dp)
      )
    }
    items(types) { t ->
      val isSel = t == active
      Row(
        modifier = Modifier
          .fillMaxWidth()
          .clip(RoundedCornerShape(12.dp))
          .background(if (isSel) SetTint.Blue.mixed(0.28f) else SetTint.Surface)
          .clickable {
            Haptics.click()
            onPick(t)
          }
          .padding(horizontal = 12.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
      ) {
        Text(
          text = localizedMoreSetType(t),
          fontSize = 13.sp,
          fontWeight = FontWeight.SemiBold,
          color = if (isSel) SetTint.Blue.color else Color.White
        )
        if (isSel) {
          Icon(Icons.Rounded.Check, null, tint = SetTint.Blue.color, modifier = Modifier.size(16.dp))
        }
      }
    }
  }
}

@Composable
private fun SwapExerciseOverlay(
  workoutStore: WorkoutSessionStore,
  anchorEntryId: String,
  onClose: () -> Unit
) {
  val upcoming = workoutStore.upcomingExercises
  val listState = rememberScalingLazyListState()

  ScalingLazyColumn(
    state = listState,
    autoCentering = null,
    verticalArrangement = Arrangement.spacedBy(5.dp),
    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 32.dp, bottom = 36.dp),
    modifier = Modifier
      .fillMaxSize()
      .background(Color.Black)
      .wearRotaryScroll(listState, isCurrentPage = true)
  ) {
    item {
      Text(
        text = stringResource(R.string.workout_new_do_now_title),
        fontSize = 13.sp,
        fontWeight = FontWeight.SemiBold,
        color = SetTint.Blue.color,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().clickable { onClose() }.padding(bottom = 2.dp)
      )
    }
    items(upcoming, key = { it.exerciseEntryId }) { step ->
      Column(
        modifier = Modifier
          .fillMaxWidth()
          .clip(RoundedCornerShape(12.dp))
          .background(SetTint.Surface)
          .clickable {
            Haptics.click()
            workoutStore.applyEdit(
              WorkoutEditAction.DoExerciseNow(step.exerciseEntryId, anchorEntryId)
            )
            onClose()
          }
          .padding(horizontal = 10.dp, vertical = 8.dp)
      ) {
        Text(
          text = step.exerciseName,
          fontSize = 12.sp,
          fontWeight = FontWeight.SemiBold,
          color = Color.White,
          maxLines = 2
        )
        formatSetTarget(step, workoutStore, spaced = true)?.let { target ->
          Text(text = target, fontSize = 10.sp, color = SetTint.LightGrey)
        }
      }
    }
  }
}

@Composable
private fun AddExerciseOverlay(
  suggested: List<SuggestedExercise>,
  onAdd: (String) -> Unit,
  onClose: () -> Unit
) {
  val listState = rememberScalingLazyListState()
  ScalingLazyColumn(
    state = listState,
    autoCentering = null,
    verticalArrangement = Arrangement.spacedBy(5.dp),
    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 32.dp, bottom = 36.dp),
    modifier = Modifier
      .fillMaxSize()
      .background(Color.Black)
      .wearRotaryScroll(listState, isCurrentPage = true)
  ) {
    item {
      Text(
        text = stringResource(R.string.workout_add_exercise_title),
        fontSize = 13.sp,
        fontWeight = FontWeight.SemiBold,
        color = SetTint.Blue.color,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().clickable { onClose() }
      )
    }
    if (suggested.isEmpty()) {
      item { EmptyStateCard(stringResource(R.string.workout_no_recent_exercises)) }
    } else {
      items(suggested, key = { it.exerciseId }) { ex ->
        Row(
          modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(SetTint.Surface)
            .clickable {
              Haptics.click()
              onAdd(ex.exerciseId)
            }
            .padding(horizontal = 10.dp, vertical = 9.dp),
          horizontalArrangement = Arrangement.SpaceBetween,
          verticalAlignment = Alignment.CenterVertically
        ) {
          Text(
            text = ex.name,
            fontSize = 12.sp,
            color = Color.White,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
          )
          Text("+", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = SetTint.Green)
        }
      }
    }
  }
}

@Composable
private fun ConfirmDialogOverlay(
  title: String,
  message: String?,
  confirmLabel: String,
  destructive: Boolean,
  onConfirm: () -> Unit,
  onCancel: () -> Unit
) {
  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(Color.Black)
      .padding(horizontal = 24.dp, vertical = 28.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center
  ) {
    Text(
      text = title,
      fontSize = 14.sp,
      fontWeight = FontWeight.Bold,
      color = Color.White,
      textAlign = TextAlign.Center,
      maxLines = 2
    )
    if (message != null) {
      Spacer(Modifier.height(4.dp))
      Text(
        text = message,
        fontSize = 11.sp,
        color = SetTint.LightGrey,
        textAlign = TextAlign.Center
      )
    }
    Spacer(Modifier.height(12.dp))
    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
      RestPillButton(
        label = stringResource(R.string.common_cancel),
        bg = SetTint.Surface,
        fg = Color.White,
        enabled = true,
        modifier = Modifier.weight(1f),
        onClick = onCancel
      )
      RestPillButton(
        label = confirmLabel,
        bg = if (destructive) Color(0xFFEF4444) else Color.White,
        fg = if (destructive) Color.White else Color.Black,
        enabled = true,
        modifier = Modifier.weight(1f),
        onClick = onConfirm
      )
    }
  }
}

// ---- Formatting & Localization Helpers ----

internal fun formatCompactElapsed(totalSeconds: Int): String {
  val s = max(0, totalSeconds)
  val hrs = s / 3600
  val mins = (s % 3600) / 60
  val rem = s % 60
  val locale = Locale.getDefault()
  return if (hrs > 0) {
    String.format(locale, "%d:%02d:%02d", hrs, mins, rem)
  } else {
    String.format(locale, "%d:%02d", mins, rem)
  }
}

@Composable
internal fun formatShortDuration(seconds: Int): String {
  val s = max(0, seconds)
  if (s < 60) return stringResource(R.string.workout_new_short_sec, s)
  if (s % 3600 == 0) return stringResource(R.string.workout_new_short_hour, s / 3600)
  if (s % 60 == 0 && s < 3600) return stringResource(R.string.workout_new_short_min, s / 60)
  return formatCompactElapsed(s)
}

@Composable
internal fun formatHoldParts(seconds: Int): Pair<String, String?> {
  val s = max(0, seconds)
  return when {
    s < 60 -> "$s" to stringResource(R.string.workout_new_unit_sec)
    s % 60 == 0 -> "${s / 60}" to stringResource(R.string.workout_new_unit_min)
    else -> formatCompactElapsed(s) to null
  }
}

internal fun formatNumberClean(value: Double?, locale: Locale = Locale.getDefault()): String {
  if (value == null) return "–"
  val nf = NumberFormat.getNumberInstance(locale).apply {
    isGroupingUsed = false
    minimumFractionDigits = 0
    maximumFractionDigits = 1
  }
  val rounded = value.roundToInt().toDouble()
  return if (abs(value - rounded) < 1e-6) {
    nf.format(rounded.toInt())
  } else {
    nf.format(value)
  }
}

@Composable
internal fun formatBodyweightText(value: Double?): String {
  if (value == null || abs(value) < 1e-6) return stringResource(R.string.workout_new_bw_label)
  val mag = formatNumberClean(abs(value))
  return if (value > 0.0) "+$mag" else "−$mag"
}

@Composable
private fun formatSetTarget(step: WorkoutStep, workoutStore: WorkoutSessionStore, spaced: Boolean): String? {
  val v = workoutStore.valuesFor(step)
  val unit = workoutStore.weightUnit
  val gap = if (spaced) " " else ""
  val weight = v.weightKg?.let { "${formatNumberClean(unit.displayedFromKg(it))}$gap${unit.suffix}" }
  val holdSec = v.durationSec ?: step.targetDurationSec
  if (holdSec != null && holdSec > 0) {
    val clk = formatCompactElapsed(holdSec)
    return weight?.let { "$it × $clk" } ?: clk
  }
  if (step.carry && v.distanceKm != null) {
    val carryFactor = if (workoutStore.usesMiles) 1093.6133 else 1000.0
    val carrySuffix = stringResource(
      if (workoutStore.usesMiles) R.string.workout_new_unit_yd else R.string.workout_new_unit_m
    )
    val dist = "${(v.distanceKm * carryFactor).roundToInt()} $carrySuffix"
    return weight?.let { "$it × $dist" } ?: dist
  }
  val reps = v.reps
  return when {
    weight != null && reps != null -> "$weight × ${reps.roundToInt()}"
    reps != null -> {
      val count = reps.roundToInt()
      pluralStringResource(R.plurals.workout_new_reps_target, count, count)
    }
    else -> null
  }
}

@Composable
private fun formatNextTarget(step: WorkoutStep, workoutStore: WorkoutSessionStore): String? {
  val v = workoutStore.valuesFor(step)
  val unit = workoutStore.weightUnit
  val weight = v.weightKg?.let { "${formatNumberClean(unit.displayedFromKg(it))} ${unit.suffix}" }
  val holdSec = v.durationSec ?: step.targetDurationSec
  if (step.timed && (holdSec == null || holdSec <= 0)) {
    val timed = stringResource(R.string.workout_new_next_timed)
    return weight?.let { "$it × $timed" } ?: timed
  }
  if (step.bodyweight && !step.carry && v.reps != null) {
    val bwLabel = stringResource(R.string.workout_new_bw_label)
    val kg = v.weightKg
    val repsCount = v.reps.roundToInt()
    if (kg == null || abs(kg) < 1e-6) {
      return stringResource(R.string.workout_new_bw_reps, bwLabel, repsCount)
    }
    val sign = if (kg > 0.0) "+" else "−"
    return stringResource(
      R.string.workout_new_bw_delta_reps,
      bwLabel,
      sign,
      formatNumberClean(unit.displayedFromKg(abs(kg))),
      repsCount
    )
  }
  return formatSetTarget(step, workoutStore, spaced = true)
}

@Composable
private fun localizedSetProgressLabel(step: WorkoutStep): String = when (step.setType?.lowercase(Locale.US)) {
  "warmup" -> stringResource(R.string.workout_new_warmup_of, step.setIndexInExercise, step.totalSetsInExercise)
  "drop" -> stringResource(R.string.workout_new_drop_of, step.setIndexInExercise, step.totalSetsInExercise)
  "failure" -> stringResource(R.string.workout_new_failure_of, step.setIndexInExercise, step.totalSetsInExercise)
  else -> stringResource(R.string.workout_new_set_of, step.setIndexInExercise, step.totalSetsInExercise)
}

@Composable
private fun localizedMoreSetType(raw: String?): String = when (raw?.lowercase(Locale.US)) {
  "warmup" -> stringResource(R.string.workout_set_type_warmup)
  "drop" -> stringResource(R.string.workout_set_type_drop)
  "failure" -> stringResource(R.string.workout_set_type_failure)
  else -> stringResource(R.string.workout_set_type_normal)
}

@Composable
private fun localizedEffortBand(band: EffortBand): String = when (band) {
  EffortBand.EASY -> stringResource(R.string.workout_new_effort_easy)
  EffortBand.MODERATE -> stringResource(R.string.workout_new_effort_moderate)
  EffortBand.HARD -> stringResource(R.string.workout_new_effort_hard)
  EffortBand.ALL_OUT -> stringResource(R.string.workout_new_effort_all_out)
}

@Composable
private fun localizedRpeShort(value: Double): String = when (value) {
  10.0 -> stringResource(R.string.workout_new_rpe_short_10)
  9.5 -> stringResource(R.string.workout_new_rpe_short_9_5)
  9.0 -> stringResource(R.string.workout_new_rpe_short_9)
  8.5 -> stringResource(R.string.workout_new_rpe_short_8_5)
  8.0 -> stringResource(R.string.workout_new_rpe_short_8)
  7.5 -> stringResource(R.string.workout_new_rpe_short_7_5)
  7.0 -> stringResource(R.string.workout_new_rpe_short_7)
  6.5 -> stringResource(R.string.workout_new_rpe_short_6_5)
  6.0 -> stringResource(R.string.workout_new_rpe_short_6)
  5.0 -> stringResource(R.string.workout_new_rpe_short_5)
  4.0 -> stringResource(R.string.workout_new_rpe_short_4)
  3.0 -> stringResource(R.string.workout_new_rpe_short_3)
  else -> stringResource(R.string.workout_new_rpe_short_low)
}
