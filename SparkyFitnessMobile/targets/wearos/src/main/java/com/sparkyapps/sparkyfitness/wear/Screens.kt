package com.sparkyapps.sparkyfitness.wear

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.gestures.scrollable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberOverscrollEffect
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Backspace
import androidx.compose.material.icons.automirrored.rounded.DirectionsWalk
import androidx.compose.material.icons.automirrored.rounded.Undo
import androidx.compose.material.icons.automirrored.rounded.VolumeDown
import androidx.compose.material.icons.automirrored.rounded.VolumeUp
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Bedtime
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Dialpad
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.LocalCafe
import androidx.compose.material.icons.rounded.LocalDrink
import androidx.compose.material.icons.rounded.LocalFireDepartment
import androidx.compose.material.icons.rounded.Medication
import androidx.compose.material.icons.rounded.MonitorWeight
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.Percent
import androidx.compose.material.icons.rounded.PhoneAndroid
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.RadioButtonUnchecked
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material.icons.rounded.RemoveCircleOutline
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material.icons.rounded.Sync
import androidx.compose.material.icons.rounded.Timer
import androidx.compose.material.icons.rounded.Watch
import androidx.compose.material.icons.rounded.WaterDrop
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalScrollCaptureInProgress
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.AmbientMode
import androidx.wear.compose.foundation.AmbientTickEffect
import androidx.wear.compose.foundation.LocalAmbientModeManager
import androidx.wear.compose.foundation.lazy.ScalingLazyListState
import androidx.wear.compose.foundation.lazy.TransformingLazyColumn
import androidx.wear.compose.foundation.lazy.TransformingLazyColumnState
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberTransformingLazyColumnState
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.Card
import androidx.wear.compose.material3.CardDefaults
import androidx.wear.compose.material3.CircularProgressIndicator
import androidx.wear.compose.material3.ColorScheme
import androidx.wear.compose.material3.CompactButton
import androidx.wear.compose.material3.CompactButtonDefaults
import androidx.wear.compose.material3.EdgeButton
import androidx.wear.compose.material3.EdgeButtonSize
import androidx.wear.compose.material3.FilledIconButton
import androidx.wear.compose.material3.FilledTonalButton
import androidx.wear.compose.material3.FilledTonalIconButton
import androidx.wear.compose.material3.Icon
import androidx.wear.compose.material3.IconButtonDefaults
import androidx.wear.compose.material3.LinearProgressIndicator
import androidx.wear.compose.material3.ListHeader
import androidx.wear.compose.material3.ListHeaderDefaults
import androidx.wear.compose.material3.ListSubHeader
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.ProgressIndicatorDefaults
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.ScrollIndicator
import androidx.wear.compose.material3.SurfaceTransformation
import androidx.wear.compose.material3.Text
import androidx.wear.compose.material3.lazy.rememberTransformationSpec
import androidx.wear.compose.material3.lazy.transformedHeight
import androidx.wear.compose.ui.tooling.preview.WearPreviewDevices
import androidx.wear.compose.ui.tooling.preview.WearPreviewFontScales
import com.SparkyApps.SparkyFitnessMobile.R
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Semantic accent palette for Wear OS metrics, tiles, and charts.
 */
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

private val SparkyDefaultColorScheme = ColorScheme(
  primary = Color(0xFF4ADE80),
  primaryDim = Color(0xFF22C55E),
  primaryContainer = Color(0xFF133323),
  onPrimary = Color(0xFF052E16),
  onPrimaryContainer = Color(0xFFBBF7D0),
  secondary = Color(0xFF38BDF8),
  secondaryDim = Color(0xFF0EA5E9),
  secondaryContainer = Color(0xFF132A3E),
  onSecondary = Color(0xFF082F49),
  onSecondaryContainer = Color(0xFFBAE6FD),
  tertiary = Color(0xFFFBBF24),
  tertiaryDim = Color(0xFFF59E0B),
  tertiaryContainer = Color(0xFF362812),
  onTertiary = Color(0xFF451A03),
  onTertiaryContainer = Color(0xFFFEF08A),
  surfaceContainerLow = Color(0xFF12161F),
  surfaceContainer = Color(0xFF1A2230),
  surfaceContainerHigh = Color(0xFF242F42),
  onSurface = Color(0xFFF1F5F9),
  onSurfaceVariant = Color(0xFF94A3B8),
  outline = Color(0xFF475569),
  outlineVariant = Color(0xFF293548),
  background = Color.Black,
  onBackground = Color(0xFFF8FAFC),
  error = Color(0xFFFB7185),
  errorDim = Color(0xFFF43F5E),
  errorContainer = Color(0xFF3F1621),
  onError = Color(0xFF4C0519),
  onErrorContainer = Color(0xFFFECDD3)
)

/**
 * Wear Compose Material 3 Expressive theme for SparkyFitness.
 * Uses explicit dark OLED container and surface tokens across all watches so
 * semantic foreground colors (Amber, Cyan, Green) always maintain high contrast
 * regardless of Wear OS 6 dynamic wallpaper pastel palettes.
 */
@Composable
fun SparkyWearTheme(content: @Composable () -> Unit) {
  MaterialTheme(
    colorScheme = SparkyDefaultColorScheme,
    content = content
  )
}

/**
 * Canonical Wear Compose M3 [ScreenScaffold] wrapper for [TransformingLazyColumn] screens,
 * guarding [ScrollIndicator] during scroll capture per Material 3 guidelines.
 */
@Composable
fun SparkyListScaffold(
  columnState: TransformingLazyColumnState,
  edgeButton: (@Composable BoxScope.() -> Unit)? = null,
  content: @Composable BoxScope.(PaddingValues) -> Unit
) {
  val indicator: @Composable BoxScope.() -> Unit = {
    if (!LocalScrollCaptureInProgress.current) {
      ScrollIndicator(
        state = columnState,
        modifier = Modifier.align(Alignment.CenterEnd)
      )
    }
  }
  if (edgeButton != null) {
    ScreenScaffold(
      scrollState = columnState,
      edgeButton = edgeButton,
      scrollIndicator = indicator,
      content = content
    )
  } else {
    ScreenScaffold(
      scrollState = columnState,
      scrollIndicator = indicator,
      content = content
    )
  }
}

/**
 * Retains rotary scroll binding for legacy [ScalingLazyListState] callers in [NewWorkoutScreens.kt].
 */
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
internal fun SparkySectionHeader(
  title: String,
  icon: ImageVector,
  accent: Color,
  trailingBadge: (@Composable () -> Unit)? = null,
  modifier: Modifier = Modifier
) {
  Row(
    modifier = modifier,
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(5.dp, Alignment.CenterHorizontally)
  ) {
    Icon(
      imageVector = icon,
      contentDescription = null,
      tint = accent,
      modifier = Modifier.size(15.dp)
    )
    Text(
      text = title,
      style = MaterialTheme.typography.titleSmall,
      color = MaterialTheme.colorScheme.onSurface,
      maxLines = 1,
      overflow = TextOverflow.Ellipsis
    )
    trailingBadge?.invoke()
  }
}

// ============================================================================
// 1. GOALS PAGE
// ============================================================================

@Composable
fun GoalsSummaryPage(store: CheckInStore, isCurrentPage: Boolean = true) {
  val nutrition by store.nutrition.collectAsState()
  val watchContext by store.watchContext.collectAsState()
  val columnState = rememberTransformingLazyColumnState()
  val transformationSpec = rememberTransformationSpec()
  val proteinLabel = stringResource(R.string.common_protein)
  val carbsLabel = stringResource(R.string.common_carbs)
  val fatLabel = stringResource(R.string.common_fat)

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
            title = stringResource(R.string.goals_title),
            icon = Icons.Rounded.LocalFireDepartment,
            accent = SparkyColors.Green
          )
        }
      }

      val snap = nutrition
      if (snap == null) {
        item {
          Card(
            onClick = {},
            enabled = false,
            modifier = Modifier
              .fillMaxWidth()
              .minimumVerticalContentPadding(CardDefaults.minimumVerticalListContentPadding)
              .transformedHeight(this, transformationSpec),
            transformation = SurfaceTransformation(transformationSpec),
            colors = CardDefaults.cardColors(
              containerColor = MaterialTheme.colorScheme.surfaceContainer
            )
          ) {
            Text(
              text = stringResource(R.string.goals_open_phone_to_sync),
              style = MaterialTheme.typography.bodySmall,
              color = MaterialTheme.colorScheme.onSurfaceVariant,
              textAlign = TextAlign.Center,
              modifier = Modifier.fillMaxWidth()
            )
          }
        }
      } else {
        val energy = EnergyDisplay.of(watchContext)
        val consumedInt = energy.whole(snap.caloriesConsumed)
        val remainingInt = energy.whole(snap.caloriesRemaining)
        val burnedInt = energy.whole(snap.caloriesBurned)
        val goalInt = max(1, consumedInt + remainingInt)
        val rawProgress = computeGoalsCalorieRawProgress(snap)

        item {
          Card(
            onClick = {},
            enabled = false,
            modifier = Modifier
              .fillMaxWidth()
              .minimumVerticalContentPadding(CardDefaults.minimumVerticalListContentPadding)
              .transformedHeight(this, transformationSpec),
            transformation = SurfaceTransformation(transformationSpec),
            colors = CardDefaults.cardColors(
              containerColor = MaterialTheme.colorScheme.surfaceContainerLow
            )
          ) {
            Column(
              modifier = Modifier.fillMaxWidth(),
              horizontalAlignment = Alignment.CenterHorizontally
            ) {
              Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier.size(96.dp)
              ) {
                CircularProgressIndicator(
                  progress = { rawProgress.coerceIn(0f, 1.25f) },
                  allowProgressOverflow = true,
                  startAngle = 125f,
                  endAngle = 55f,
                  strokeWidth = 8.dp,
                  colors = ProgressIndicatorDefaults.colors(
                    indicatorColor = if (remainingInt >= 0) SparkyColors.Green else SparkyColors.Amber,
                    trackColor = MaterialTheme.colorScheme.outlineVariant
                  ),
                  modifier = Modifier.fillMaxSize()
                )
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                  Text(
                    text = NumberFormat.getIntegerInstance().format(consumedInt),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1
                  )
                  Text(
                    text = "/ ${NumberFormat.getIntegerInstance().format(goalInt)} ${energy.unit}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1
                  )
                }
              }

              Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(4.dp)
              ) {
                val isOver = remainingInt < 0
                val badgeBg = if (isOver) MaterialTheme.colorScheme.tertiaryContainer else MaterialTheme.colorScheme.primaryContainer
                val badgeFg = if (isOver) MaterialTheme.colorScheme.onTertiaryContainer else MaterialTheme.colorScheme.onPrimaryContainer
                Box(
                  modifier = Modifier
                    .clip(CircleShape)
                    .background(badgeBg)
                    .padding(horizontal = 9.dp, vertical = 3.dp)
                ) {
                  Text(
                    text = if (!isOver) {
                      stringResource(R.string.goals_energy_left, remainingInt, energy.unit)
                    } else {
                      stringResource(R.string.goals_energy_over, abs(remainingInt), energy.unit)
                    },
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = badgeFg,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                  )
                }
                if (burnedInt > 0) {
                  val formattedBurned = NumberFormat.getIntegerInstance(Locale.getDefault()).format(burnedInt)
                  Row(
                    modifier = Modifier
                      .clip(CircleShape)
                      .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                      .padding(horizontal = 7.dp, vertical = 3.dp)
                      .semantics(mergeDescendants = true) {},
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(3.dp)
                  ) {
                    Text(
                      text = "🔥", // i18n-ignore
                      style = MaterialTheme.typography.labelSmall,
                      color = SparkyColors.Amber,
                      maxLines = 1,
                      modifier = Modifier.clearAndSetSemantics {}
                    )
                    Text(
                      text = stringResource(R.string.goals_energy_burned, formattedBurned, energy.unit),
                      style = MaterialTheme.typography.labelSmall,
                      color = SparkyColors.Amber,
                      maxLines = 1,
                      overflow = TextOverflow.Ellipsis
                    )
                  }
                }
              }
            }
          }
        }

        val rowsToRender = snap.rows ?: listOf(
          NutrientRow(
            key = "protein",
            label = proteinLabel,
            unit = "g",
            consumed = snap.protein.consumed,
            goal = snap.protein.goal.takeIf { it > 0 },
            progress = snap.protein.progress
          ),
          NutrientRow(
            key = "carbs",
            label = carbsLabel,
            unit = "g",
            consumed = snap.carbs.consumed,
            goal = snap.carbs.goal.takeIf { it > 0 },
            progress = snap.carbs.progress
          ),
          NutrientRow(
            key = "fat",
            label = fatLabel,
            unit = "g",
            consumed = snap.fat.consumed,
            goal = snap.fat.goal.takeIf { it > 0 },
            progress = snap.fat.progress
          )
        )

        items(rowsToRender, key = { it.key }) { row ->
          val accent = nutrientColor(row.key)
          val hasGoal = row.goal != null && row.goal.isFinite() && row.goal > 0.0
          val pct = computeNutrientRowProgress(row.consumed, row.goal)
          val nutrientLocale = Locale.getDefault()
          val consumedText = formatNutrientAmount(row.consumed, row.goal, nutrientLocale)
          val goalText = if (hasGoal) formatNutrientAmount(row.goal!!, row.goal, nutrientLocale) else null

          Card(
            onClick = {},
            enabled = false,
            modifier = Modifier
              .fillMaxWidth()
              .minimumVerticalContentPadding(CardDefaults.minimumVerticalListContentPadding)
              .transformedHeight(this, transformationSpec),
            transformation = SurfaceTransformation(transformationSpec),
            colors = CardDefaults.cardColors(
              containerColor = MaterialTheme.colorScheme.surfaceContainer
            )
          ) {
            Column(modifier = Modifier.fillMaxWidth()) {
              Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
              ) {
                Row(
                  verticalAlignment = Alignment.CenterVertically,
                  horizontalArrangement = Arrangement.spacedBy(6.dp),
                  modifier = Modifier.weight(1f)
                ) {
                  Box(
                    modifier = Modifier
                      .size(7.dp)
                      .clip(CircleShape)
                      .background(accent)
                  )
                  Text(
                    text = row.label,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                  )
                }
                Text(
                  text = if (hasGoal) "$consumedText / $goalText${row.unit}" else "$consumedText${row.unit}",
                  style = MaterialTheme.typography.labelSmall,
                  fontWeight = FontWeight.SemiBold,
                  color = accent,
                  maxLines = 1
                )
              }
              if (hasGoal) {
                Spacer(Modifier.height(5.dp))
                LinearProgressIndicator(
                  progress = { pct },
                  colors = ProgressIndicatorDefaults.colors(
                    indicatorColor = accent,
                    trackColor = MaterialTheme.colorScheme.outlineVariant
                  ),
                  modifier = Modifier.fillMaxWidth()
                )
              }
            }
          }
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

// ============================================================================
// 2. HYDRATION PAGE + LOG SHEET
// ============================================================================

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
  val columnState = rememberTransformingLazyColumnState()
  val transformationSpec = rememberTransformationSpec()
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
  val defaultGlassName = stringResource(R.string.water_default_glass)
  val defaultBottleName = stringResource(R.string.water_default_bottle)
  val effectiveContainers = containers.ifEmpty {
    listOf(
      WaterContainer(id = 1, name = defaultGlassName, servingVolumeMl = 250.0, unit = "ml", isPrimary = true),
      WaterContainer(id = 2, name = defaultBottleName, servingVolumeMl = 500.0, unit = "ml")
    )
  }
  val standardContainers = remember(effectiveContainers) { effectiveContainers.filter { !it.isQuickAdd } }
  val quickAddDrinks = remember(effectiveContainers) { effectiveContainers.filter { it.isQuickAdd } }
  val progress = (consumedMl.toFloat() / max(1.0, goalMl).toFloat()).coerceIn(0f, 1.25f)

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
            title = stringResource(R.string.water_title),
            icon = Icons.Rounded.WaterDrop,
            accent = SparkyColors.Cyan,
            trailingBadge = if (waterSyncState != SyncState.SAVED) {
              {
                Icon(
                  imageVector = if (waterSyncState == SyncState.FAILED) Icons.Rounded.ErrorOutline else Icons.Rounded.Sync,
                  contentDescription = null,
                  tint = if (waterSyncState == SyncState.FAILED) SparkyColors.Rose else SparkyColors.Amber,
                  modifier = Modifier.size(14.dp)
                )
              }
            } else null
          )
        }
      }

      item {
        Card(
          onClick = { if (waterSyncState == SyncState.FAILED) store.retryFailedWaterTaps() },
          enabled = waterSyncState == SyncState.FAILED,
          modifier = Modifier
            .fillMaxWidth()
            .minimumVerticalContentPadding(CardDefaults.minimumVerticalListContentPadding)
            .transformedHeight(this, transformationSpec),
          transformation = SurfaceTransformation(transformationSpec),
          colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow
          )
        ) {
          Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally
          ) {
            Box(
              contentAlignment = Alignment.Center,
              modifier = Modifier.size(92.dp)
            ) {
              CircularProgressIndicator(
                progress = { progress },
                allowProgressOverflow = true,
                startAngle = 125f,
                endAngle = 55f,
                strokeWidth = 8.dp,
                colors = ProgressIndicatorDefaults.colors(
                  indicatorColor = SparkyColors.Cyan,
                  trackColor = MaterialTheme.colorScheme.outlineVariant
                ),
                modifier = Modifier.fillMaxSize()
              )
              Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                  text = watchCtx.formattedWater(consumedMl),
                  style = MaterialTheme.typography.titleMedium,
                  fontWeight = FontWeight.Bold,
                  color = MaterialTheme.colorScheme.onSurface,
                  maxLines = 1
                )
                Text(
                  text = "/ ${watchCtx.formattedWater(goalMl)}",
                  style = MaterialTheme.typography.labelSmall,
                  color = MaterialTheme.colorScheme.onSurfaceVariant,
                  maxLines = 1
                )
              }
            }

            val fromFoodMl = snap?.fromFoodMl
            if (fromFoodMl != null && fromFoodMl > 0.5) {
              Text(
                text = stringResource(R.string.water_includes_from_food, watchCtx.formattedWater(fromFoodMl)),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
              )
            }

            if (waterSyncState == SyncState.FAILED) {
              Spacer(Modifier.height(2.dp))
              Text(
                text = stringResource(R.string.water_sync_failed),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = SparkyColors.Rose,
                textAlign = TextAlign.Center
              )
            } else if (queuedMl > 0.5) {
              Spacer(Modifier.height(2.dp))
              Text(
                text = stringResource(R.string.water_syncing_amount, watchCtx.formattedWater(queuedMl)),
                style = MaterialTheme.typography.labelSmall,
                color = SparkyColors.Amber,
                textAlign = TextAlign.Center
              )
            }
          }
        }
      }

      items(standardContainers, key = { "std_${it.id}" }) { container ->
        val effectiveUnit = container.unit.takeIf { it.isNotBlank() }
          ?: watchCtx.waterDisplayUnit?.takeIf { it.isNotBlank() }
          ?: "ml"
        val formattedVol = formatWaterAmount(container.servingVolumeMl, effectiveUnit)
        Button(
          onClick = { store.tapWaterContainer(container) },
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
              imageVector = Icons.Rounded.LocalDrink,
              contentDescription = null,
              modifier = Modifier.size(ButtonDefaults.IconSize)
            )
          },
          label = {
            Text(
              text = container.name,
              maxLines = 1,
              overflow = TextOverflow.Ellipsis
            )
          },
          secondaryLabel = {
            Text(
              text = "+$formattedVol",
              maxLines = 1,
              fontWeight = FontWeight.Bold
            )
          }
        )
      }

      if (quickAddDrinks.isNotEmpty()) {
        item(key = "quick_add_header") {
          ListSubHeader(
            modifier = Modifier
              .fillMaxWidth()
              .minimumVerticalContentPadding(
                ListHeaderDefaults.minimumTopListContentPadding,
                ListHeaderDefaults.minimumBottomListContentPadding
              )
              .transformedHeight(this, transformationSpec),
            transformation = SurfaceTransformation(transformationSpec),
            icon = {
              Icon(
                imageVector = Icons.Rounded.Bolt,
                contentDescription = null,
                tint = SparkyColors.Amber,
                modifier = Modifier.size(14.dp)
              )
            },
            label = {
              Text(
                text = stringResource(R.string.water_quick_add_header),
                style = MaterialTheme.typography.labelMedium,
                color = SparkyColors.Amber
              )
            }
          )
        }

        items(quickAddDrinks, key = { "qa_${it.id}" }) { preset ->
          val effectiveUnit = preset.unit.takeIf { it.isNotBlank() }
            ?: watchCtx.waterDisplayUnit?.takeIf { it.isNotBlank() }
            ?: "ml"
          val volLabel = if (preset.servingVolumeMl > 0.05) {
            "+${formatWaterAmount(preset.servingVolumeMl, effectiveUnit)}"
          } else {
            "+"
          }
          Button(
            onClick = { store.tapWaterContainer(preset) },
            modifier = Modifier
              .fillMaxWidth()
              .minimumVerticalContentPadding(ButtonDefaults.minimumVerticalListContentPadding)
              .transformedHeight(this, transformationSpec),
            transformation = SurfaceTransformation(transformationSpec),
            colors = ButtonDefaults.buttonColors(
              containerColor = MaterialTheme.colorScheme.tertiaryContainer,
              contentColor = MaterialTheme.colorScheme.onSurface,
              secondaryContentColor = SparkyColors.Amber,
              iconColor = SparkyColors.Amber
            ),
            icon = {
              Icon(
                imageVector = Icons.Rounded.LocalCafe,
                contentDescription = null,
                modifier = Modifier.size(ButtonDefaults.IconSize)
              )
            },
            label = {
              Text(
                text = preset.name,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
              )
            },
            secondaryLabel = {
              Text(
                text = volLabel,
                maxLines = 1,
                fontWeight = FontWeight.Bold
              )
            }
          )
        }
      }

      if (logEntries.isNotEmpty()) {
        item(key = "water_actions") {
          Row(
            modifier = Modifier
              .fillMaxWidth()
              .minimumVerticalContentPadding(CompactButtonDefaults.minimumVerticalListContentPadding)
              .transformedHeight(this, transformationSpec),
            horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically
          ) {
            CompactButton(
              onClick = { showLogSheet = true },
              colors = ButtonDefaults.filledTonalButtonColors(),
              icon = {
                Icon(
                  imageVector = Icons.Rounded.History,
                  contentDescription = null,
                  modifier = Modifier.size(CompactButtonDefaults.ExtraSmallIconSize)
                )
              },
              label = {
                Text(
                  text = stringResource(R.string.water_log_count, logEntries.size),
                  maxLines = 1,
                  overflow = TextOverflow.Ellipsis
                )
              }
            )
            CompactButton(
              onClick = { store.deleteLastWaterEntry() },
              colors = ButtonDefaults.outlinedButtonColors(),
              border = ButtonDefaults.outlinedButtonBorder(enabled = true),
              icon = {
                Icon(
                  imageVector = Icons.AutoMirrored.Rounded.Undo,
                  contentDescription = null,
                  modifier = Modifier.size(CompactButtonDefaults.ExtraSmallIconSize)
                )
              },
              label = {
                Text(
                  text = stringResource(R.string.water_undo_last),
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
}

@Composable
private fun WaterLogView(
  entries: List<WaterLogEntry>,
  watchCtx: WatchContext,
  onDelete: (WaterLogEntry) -> Unit,
  onClose: () -> Unit
) {
  var confirmEntry by remember { mutableStateOf<WaterLogEntry?>(null) }
  val columnState = rememberTransformingLazyColumnState()
  val transformationSpec = rememberTransformationSpec()

  BackHandler {
    if (confirmEntry != null) {
      confirmEntry = null
    } else {
      onClose()
    }
  }

  val pendingDelete = confirmEntry
  if (pendingDelete != null) {
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
        Icon(
          imageVector = Icons.Rounded.DeleteOutline,
          contentDescription = null,
          tint = SparkyColors.Rose,
          modifier = Modifier.size(22.dp)
        )
        Spacer(Modifier.height(4.dp))
        Text(
          text = stringResource(R.string.water_remove_drink_title),
          style = MaterialTheme.typography.titleSmall,
          color = MaterialTheme.colorScheme.onSurface,
          textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(2.dp))
        Text(
          text = "${pendingDelete.name} (${watchCtx.formattedWater(pendingDelete.volumeMl)})",
          style = MaterialTheme.typography.bodySmall,
          color = SparkyColors.Cyan,
          textAlign = TextAlign.Center,
          maxLines = 2,
          overflow = TextOverflow.Ellipsis
        )
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
          FilledTonalIconButton(onClick = { confirmEntry = null }) {
            Icon(Icons.Rounded.Close, contentDescription = stringResource(R.string.common_no))
          }
          FilledIconButton(
            onClick = {
              onDelete(pendingDelete)
              confirmEntry = null
            },
            colors = IconButtonDefaults.filledIconButtonColors(
              containerColor = SparkyColors.Rose,
              contentColor = Color.White
            )
          ) {
            Icon(Icons.Rounded.Check, contentDescription = stringResource(R.string.common_yes))
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
          SparkySectionHeader(
            title = stringResource(R.string.water_todays_drinks_title),
            icon = Icons.Rounded.History,
            accent = SparkyColors.Cyan
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
      if (entries.isEmpty()) {
        item {
          EmptyStateCard(
            message = stringResource(R.string.water_no_drinks_logged),
            modifier = Modifier
              .minimumVerticalContentPadding(CardDefaults.minimumVerticalListContentPadding)
              .transformedHeight(this, transformationSpec)
          )
        }
      } else {
        items(entries, key = { it.id }) { entry ->
          Button(
            onClick = { confirmEntry = entry },
            modifier = Modifier
              .fillMaxWidth()
              .minimumVerticalContentPadding(ButtonDefaults.minimumVerticalListContentPadding)
              .transformedHeight(this, transformationSpec),
            transformation = SurfaceTransformation(transformationSpec),
            colors = ButtonDefaults.filledTonalButtonColors(),
            icon = {
              Icon(
                imageVector = Icons.Rounded.RemoveCircleOutline,
                contentDescription = null,
                tint = SparkyColors.Rose,
                modifier = Modifier.size(ButtonDefaults.IconSize)
              )
            },
            label = {
              Text(
                text = entry.name,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
              )
            },
            secondaryLabel = {
              Column {
                Text(
                  text = watchCtx.formattedWater(entry.volumeMl),
                  maxLines = 1
                )
                if (entry.time.isNotBlank()) {
                  Text(
                    text = entry.time,
                    maxLines = 1
                  )
                }
              }
            }
          )
        }
      }
    }
  }
}

// ============================================================================
// 3. MEDICATIONS PAGE
// ============================================================================

@Composable
fun MedicationListPage(store: CheckInStore, isCurrentPage: Boolean = true) {
  val medSnap by store.medications.collectAsState()
  val doses = medSnap?.doses.orEmpty()
  val columnState = rememberTransformingLazyColumnState()
  val transformationSpec = rememberTransformationSpec()

  SparkyListScaffold(columnState = columnState) { contentPadding ->
    TransformingLazyColumn(
      state = columnState,
      contentPadding = contentPadding,
      modifier = Modifier.fillMaxSize(),
      horizontalAlignment = Alignment.CenterHorizontally
    ) {
      val taken = doses.count { it.status == MedicationDoseStatus.TAKEN }
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
            title = if (doses.isEmpty()) {
              stringResource(R.string.meds_title_empty)
            } else {
              stringResource(R.string.meds_title_count, taken, doses.size)
            },
            icon = Icons.Rounded.Medication,
            accent = SparkyColors.Purple
          )
        }
      }

      if (doses.isNotEmpty()) {
        item(key = "meds_progress") {
          val pct = (taken.toFloat() / max(1, doses.size).toFloat()).coerceIn(0f, 1f)
          LinearProgressIndicator(
            progress = { pct },
            colors = ProgressIndicatorDefaults.colors(
              indicatorColor = SparkyColors.Green,
              trackColor = MaterialTheme.colorScheme.outlineVariant
            ),
            modifier = Modifier
              .fillMaxWidth(0.78f)
              .minimumVerticalContentPadding(CardDefaults.minimumVerticalListContentPadding)
              .transformedHeight(this, transformationSpec)
          )
        }
      }

      if (doses.isEmpty()) {
        item {
          Card(
            onClick = {},
            enabled = false,
            modifier = Modifier
              .fillMaxWidth()
              .minimumVerticalContentPadding(CardDefaults.minimumVerticalListContentPadding)
              .transformedHeight(this, transformationSpec),
            transformation = SurfaceTransformation(transformationSpec),
            colors = CardDefaults.cardColors(
              containerColor = MaterialTheme.colorScheme.surfaceContainer
            )
          ) {
            Text(
              text = stringResource(R.string.meds_none_scheduled),
              style = MaterialTheme.typography.bodySmall,
              color = MaterialTheme.colorScheme.onSurfaceVariant,
              textAlign = TextAlign.Center,
              modifier = Modifier.fillMaxWidth()
            )
          }
        }
      } else {
        items(doses, key = { it.id }) { dose ->
          val isTaken = dose.status == MedicationDoseStatus.TAKEN
          val isSkipped = dose.status == MedicationDoseStatus.SKIPPED
          val statusDesc = stringResource(
            when {
              isTaken -> R.string.meds_status_taken
              isSkipped -> R.string.meds_status_skipped
              else -> R.string.meds_status_pending
            }
          )
          val sub = listOfNotNull(
            dose.detail.takeIf { it.isNotBlank() },
            dose.time.takeIf { it.isNotBlank() }
          ).joinToString(" · ")

          Button(
            onClick = { store.toggleMedication(dose) },
            modifier = Modifier
              .fillMaxWidth()
              .semantics { stateDescription = statusDesc }
              .minimumVerticalContentPadding(ButtonDefaults.minimumVerticalListContentPadding)
              .transformedHeight(this, transformationSpec),
            transformation = SurfaceTransformation(transformationSpec),
            colors = ButtonDefaults.buttonColors(
              containerColor = when {
                isTaken -> MaterialTheme.colorScheme.primaryContainer
                isSkipped -> MaterialTheme.colorScheme.surfaceContainerLow
                else -> MaterialTheme.colorScheme.surfaceContainer
              },
              contentColor = MaterialTheme.colorScheme.onSurface,
              secondaryContentColor = if (isTaken) SparkyColors.Green else MaterialTheme.colorScheme.onSurfaceVariant,
              iconColor = when {
                isTaken -> SparkyColors.Green
                isSkipped -> SparkyColors.Muted
                else -> SparkyColors.Purple
              }
            ),
            icon = {
              Icon(
                imageVector = if (isTaken) Icons.Rounded.CheckCircle else Icons.Rounded.RadioButtonUnchecked,
                contentDescription = null,
                modifier = Modifier.size(ButtonDefaults.IconSize)
              )
            },
            label = {
              Text(
                text = dose.name,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
              )
            },
            secondaryLabel = if (sub.isNotEmpty()) {
              {
                Text(
                  text = sub,
                  maxLines = 1,
                  overflow = TextOverflow.Ellipsis
                )
              }
            } else null
          )
        }
      }
    }
  }
}

// ============================================================================
// 4. WEIGHT CHECK-IN PAGE + KEYPAD
// ============================================================================

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
  var showKeypadFor by remember { mutableStateOf<String?>(null) }

  if (showKeypadFor != null) {
    val mode = showKeypadFor!!
    WatchKeypadSheet(
      title = if (mode == "weight") {
        stringResource(R.string.weight_keypad_title, unit.suffix)
      } else {
        stringResource(R.string.weight_body_fat_title)
      },
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
    ScreenScaffold { contentPadding ->
      Column(
        modifier = Modifier
          .fillMaxSize()
          .wearRotaryStepper(isCurrentPage = isCurrentPage) { steps ->
            store.nudgeBodyFat(steps)
            Haptics.click()
          }
          .padding(contentPadding)
          .padding(horizontal = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
      ) {
        SparkySectionHeader(
          title = stringResource(R.string.weight_body_fat_title),
          icon = Icons.Rounded.Percent,
          accent = SparkyColors.Cyan
        )
        Spacer(Modifier.height(6.dp))
        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
          FilledTonalIconButton(
            onClick = {
              store.nudgeBodyFat(-1)
              Haptics.click()
            },
            shapes = IconButtonDefaults.animatedShapes(),
            modifier = Modifier.size(36.dp)
          ) {
            Icon(Icons.Rounded.Remove, contentDescription = stringResource(R.string.stepper_decrease_body_fat))
          }
          Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
              .clip(RoundedCornerShape(14.dp))
              .background(MaterialTheme.colorScheme.surfaceContainer)
              .clickable { showKeypadFor = "bodyfat" }
              .padding(horizontal = 12.dp, vertical = 6.dp)
          ) {
            Text(
              text = String.format(Locale.getDefault(), "%.1f%%", draftBodyFat),
              style = MaterialTheme.typography.titleLarge,
              fontWeight = FontWeight.Bold,
              color = MaterialTheme.colorScheme.onSurface
            )
            Text(
              text = stringResource(R.string.weight_tap_to_type),
              style = MaterialTheme.typography.labelSmall,
              color = MaterialTheme.colorScheme.onSurfaceVariant
            )
          }
          FilledTonalIconButton(
            onClick = {
              store.nudgeBodyFat(1)
              Haptics.click()
            },
            shapes = IconButtonDefaults.animatedShapes(),
            modifier = Modifier.size(36.dp)
          ) {
            Icon(Icons.Rounded.Add, contentDescription = stringResource(R.string.stepper_increase_body_fat))
          }
        }
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
          CompactButton(
            onClick = {
              editingBodyFat = false
              store.saveWeight(includeBodyFat = false)
            },
            colors = ButtonDefaults.filledTonalButtonColors(),
            label = { Text(stringResource(R.string.common_skip)) }
          )
          CompactButton(
            onClick = {
              editingBodyFat = false
              store.saveWeight(includeBodyFat = true)
            },
            colors = ButtonDefaults.buttonColors(
              containerColor = SparkyColors.Green,
              contentColor = Color.Black
            ),
            label = { Text(stringResource(R.string.common_save)) }
          )
        }
      }
    }
    return
  }

  val delta = store.deltaFromLatest
  val implausible = store.isWeightDeltaImplausible
  val deltaText = when {
    history.isEmpty() -> stringResource(R.string.weight_no_prior)
    delta == null || abs(delta) < 0.05 -> stringResource(R.string.weight_same_as_last)
    delta > 0 -> String.format(Locale.getDefault(), "+%.1f %s", delta, unit.suffix)
    else -> String.format(Locale.getDefault(), "%.1f %s", delta, unit.suffix)
  }

  ScreenScaffold { contentPadding ->
    Column(
      modifier = Modifier
        .fillMaxSize()
        .wearRotaryStepper(isCurrentPage = isCurrentPage) { steps ->
          store.nudge(steps)
          Haptics.click()
        }
        .padding(contentPadding)
        .padding(horizontal = 10.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.Center
    ) {
      SparkySectionHeader(
        title = stringResource(R.string.weight_title),
        icon = Icons.Rounded.MonitorWeight,
        accent = SparkyColors.Green
      )
      Spacer(Modifier.height(5.dp))

      Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
      ) {
        FilledTonalIconButton(
          onClick = {
            store.nudge(-1)
            Haptics.click()
          },
          shapes = IconButtonDefaults.animatedShapes(),
          modifier = Modifier.size(36.dp)
        ) {
          Icon(Icons.Rounded.Remove, contentDescription = stringResource(R.string.stepper_decrease_weight))
        }
        Column(
          horizontalAlignment = Alignment.CenterHorizontally,
          modifier = Modifier
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceContainer)
            .clickable { showKeypadFor = "weight" }
            .padding(horizontal = 12.dp, vertical = 5.dp)
        ) {
          Text(
            text = String.format(Locale.getDefault(), "%.1f", draftWeight),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface
          )
          Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(3.dp)
          ) {
            Text(
              text = unit.suffix.uppercase(Locale.US),
              style = MaterialTheme.typography.labelSmall,
              color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Icon(
              imageVector = Icons.Rounded.Dialpad,
              contentDescription = null,
              tint = MaterialTheme.colorScheme.onSurfaceVariant,
              modifier = Modifier.size(10.dp)
            )
          }
        }
        FilledTonalIconButton(
          onClick = {
            store.nudge(1)
            Haptics.click()
          },
          shapes = IconButtonDefaults.animatedShapes(),
          modifier = Modifier.size(36.dp)
        ) {
          Icon(Icons.Rounded.Add, contentDescription = stringResource(R.string.stepper_increase_weight))
        }
      }

      Spacer(Modifier.height(4.dp))
      Text(
        text = if (implausible && delta != null) "⚠ $deltaText" else deltaText,
        style = MaterialTheme.typography.labelSmall,
        color = if (implausible) SparkyColors.Amber else MaterialTheme.colorScheme.onSurfaceVariant,
        maxLines = 1
      )
      Spacer(Modifier.height(6.dp))

      Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        if (history.isEmpty()) {
          CompactButton(
            onClick = { showFirstRun = true },
            colors = ButtonDefaults.filledTonalButtonColors(),
            label = { Text(stringResource(R.string.weight_set_start), maxLines = 1) }
          )
        } else {
          CompactButton(
            onClick = { editingBodyFat = true },
            colors = ButtonDefaults.buttonColors(
              containerColor = MaterialTheme.colorScheme.secondaryContainer,
              contentColor = SparkyColors.Cyan
            ),
            label = {
              Text(
                text = if (hasBodyFatSeed) {
                  stringResource(R.string.weight_bf_short, draftBodyFat)
                } else {
                  stringResource(R.string.weight_add_bf)
                },
                maxLines = 1
              )
            }
          )
        }
        val saveLabel = when {
          syncState == SyncState.QUEUED -> stringResource(R.string.weight_queued)
          syncState == SyncState.FAILED -> stringResource(R.string.common_retry)
          implausible && delta != null -> {
            val sign = if (delta > 0) "+" else ""
            stringResource(R.string.weight_save_delta, sign, delta)
          }
          else -> stringResource(R.string.common_save)
        }
        CompactButton(
          onClick = { store.saveWeight() },
          colors = ButtonDefaults.buttonColors(
            containerColor = if (implausible) SparkyColors.Amber else SparkyColors.Green,
            contentColor = Color.Black
          ),
          label = { Text(saveLabel, maxLines = 1) }
        )
      }
    }
  }
}

@Composable
fun WatchKeypadSheet(
  title: String,
  initialValue: Double,
  allowDecimal: Boolean,
  allowNegative: Boolean = false,
  allowZero: Boolean = false,
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
      .padding(horizontal = 10.dp, vertical = 16.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.SpaceBetween
  ) {
    Text(
      text = title,
      style = MaterialTheme.typography.labelSmall,
      color = MaterialTheme.colorScheme.onSurfaceVariant,
      maxLines = 1
    )
    Row(
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
      if (allowNegative) {
        Box(
          modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(MaterialTheme.colorScheme.surfaceContainer)
            .clickable {
              text = if (text.startsWith("-")) text.removePrefix("-") else "-$text"
              Haptics.click()
            }
            .padding(horizontal = 7.dp, vertical = 3.dp)
        ) {
          Text(
            text = "±",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurface,
            fontWeight = FontWeight.Bold
          )
        }
      }
      Text(
        text = text.ifEmpty { "0" },
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.onSurface
      )
      Box(
        modifier = Modifier
          .clip(RoundedCornerShape(8.dp))
          .background(MaterialTheme.colorScheme.surfaceContainer)
          .clickable {
            if (text.isNotEmpty()) text = text.dropLast(1)
            Haptics.click()
          }
          .padding(horizontal = 7.dp, vertical = 4.dp),
        contentAlignment = Alignment.Center
      ) {
        Icon(
          imageVector = Icons.AutoMirrored.Rounded.Backspace,
          contentDescription = stringResource(R.string.keypad_backspace),
          tint = MaterialTheme.colorScheme.onSurfaceVariant,
          modifier = Modifier.size(13.dp)
        )
      }
    }

    val rows = listOf(
      listOf("1", "2", "3"),
      listOf("4", "5", "6"),
      listOf("7", "8", "9"),
      listOf(if (allowDecimal) "." else "C", "0", "✓")
    )
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
      for (row in rows) {
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
          for (key in row) {
            val isConfirm = key == "✓"
            Box(
              modifier = Modifier
                .width(40.dp)
                .height(23.dp)
                .clip(RoundedCornerShape(9.dp))
                .background(if (isConfirm) SparkyColors.Green else MaterialTheme.colorScheme.surfaceContainer)
                .clickable {
                  Haptics.click()
                  when (key) {
                    "✓" -> {
                      val parsed = text.toDoubleOrNull()
                      val valid = when {
                        parsed == null -> false
                        allowNegative -> true
                        allowZero -> parsed >= 0.0
                        else -> parsed > 0.0
                      }
                      if (valid && parsed != null) onConfirm(parsed) else onCancel()
                    }
                    "C" -> text = ""
                    "." -> if (!text.contains(".")) text += if (text.isEmpty() || text == "-") "0." else "."
                    else -> if (text.length < 7) text += key
                  }
                },
              contentAlignment = Alignment.Center
            ) {
              if (isConfirm) {
                Icon(
                  imageVector = Icons.Rounded.Check,
                  contentDescription = stringResource(R.string.common_done),
                  tint = Color.Black,
                  modifier = Modifier.size(14.dp)
                )
              } else {
                Text(
                  text = key,
                  style = MaterialTheme.typography.labelMedium,
                  fontWeight = FontWeight.Bold,
                  color = MaterialTheme.colorScheme.onSurface
                )
              }
            }
          }
        }
      }
    }

    Text(
      text = stringResource(R.string.common_cancel),
      style = MaterialTheme.typography.labelSmall,
      color = MaterialTheme.colorScheme.onSurfaceVariant,
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

  ScreenScaffold { contentPadding ->
    Column(
      modifier = Modifier
        .fillMaxSize()
        .background(Color.Black)
        .wearRotaryStepper(isCurrentPage = true) { steps ->
          value = (value + steps * 1.0).coerceIn(20.0, 500.0)
          Haptics.click()
        }
        .padding(contentPadding)
        .padding(horizontal = 12.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.Center
    ) {
      Text(
        text = stringResource(R.string.weight_starting_title),
        style = MaterialTheme.typography.titleSmall,
        color = SparkyColors.Green
      )
      Spacer(Modifier.height(6.dp))
      Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        WeightUnit.entries.forEach { u ->
          val selected = unit == u
          CompactButton(
            onClick = {
              if (!selected) {
                value = if (u == WeightUnit.LBS) (value * 2.2).roundToInt().toDouble() else (value / 2.2).roundToInt().toDouble()
                unit = u
              }
            },
            colors = if (selected) {
              ButtonDefaults.buttonColors(containerColor = SparkyColors.Green, contentColor = Color.Black)
            } else {
              ButtonDefaults.filledTonalButtonColors()
            },
            label = { Text(u.suffix.uppercase(Locale.US)) }
          )
        }
      }
      Spacer(Modifier.height(6.dp))
      Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
      ) {
        FilledTonalIconButton(
          onClick = { value = max(20.0, value - 5.0) },
          modifier = Modifier.size(34.dp)
        ) {
          Icon(Icons.Rounded.Remove, contentDescription = stringResource(R.string.stepper_decrease_weight_by_5))
        }
        Text(
          text = NumberFormat.getIntegerInstance(Locale.getDefault()).apply {
            isGroupingUsed = false
          }.format(value.roundToInt()),
          style = MaterialTheme.typography.titleLarge,
          fontWeight = FontWeight.Bold,
          color = MaterialTheme.colorScheme.onSurface
        )
        FilledTonalIconButton(
          onClick = { value = min(500.0, value + 5.0) },
          modifier = Modifier.size(34.dp)
        ) {
          Icon(Icons.Rounded.Add, contentDescription = stringResource(R.string.stepper_increase_weight_by_5))
        }
      }
      Spacer(Modifier.height(8.dp))
      Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        CompactButton(
          onClick = onCancel,
          colors = ButtonDefaults.filledTonalButtonColors(),
          label = { Text(stringResource(R.string.common_cancel)) }
        )
        CompactButton(
          onClick = { onApply(value, unit) },
          colors = ButtonDefaults.buttonColors(containerColor = SparkyColors.Green, contentColor = Color.Black),
          label = { Text(stringResource(R.string.common_done)) }
        )
      }
    }
  }
}

// ============================================================================
// 5. BODY TRENDS PAGE (DUAL-METRIC WEIGHT + BODY FAT % HEADER & SEGMENTED CHART)
// ============================================================================

/**
 * Pure presentation model for [TrendChartPage] so both Weight and Body Fat %
 * from synced smart scales are always visible even when the Check-In page is hidden
 * or when fewer than two Body Fat % readings exist in the 14-day window.
 */
data class TrendPageModel(
  val latestWeightDisplay: Double?,
  val weightDeltaDisplay: Double?,
  val latestBodyFatPercent: Double?,
  val bodyFatDeltaPercent: Double?,
  val weightSamples: List<HistoryPoint>,
  val bodyFatSamples: List<HistoryPoint>,
  val unitSuffix: String
) {
  val hasAnyBodyFat: Boolean
    get() = latestBodyFatPercent != null || bodyFatSamples.isNotEmpty()
}

internal fun computeGoalsCalorieRawProgress(snap: NutritionSnapshot): Float {
  val effectiveGoal = snap.caloriesConsumed + snap.caloriesRemaining
  val raw = if (effectiveGoal > 0.0) {
    snap.caloriesConsumed / effectiveGoal
  } else {
    snap.calorieProgress
  }
  return if (raw.isFinite()) raw.toFloat().coerceAtLeast(0f) else 0f
}

internal fun computeNutrientRowProgress(consumed: Double, goal: Double?): Float {
  if (goal == null || !goal.isFinite() || goal <= 0.0 || !consumed.isFinite()) return 0f
  return (consumed / goal).toFloat().coerceIn(0f, 1f)
}

internal fun formatNutrientAmount(
  value: Double,
  goal: Double? = null,
  locale: Locale = Locale.getDefault()
): String {
  val safeVal = if (value.isFinite()) value else 0.0
  val safeGoal = goal?.takeIf { it.isFinite() && it > 0.0 }
  val needsDecimals = (safeGoal != null && safeGoal < 10.0) ||
    (abs(safeVal) > 0.0 && abs(safeVal) < 10.0 && abs(safeVal - safeVal.roundToInt()) >= 0.05) ||
    (safeGoal != null && abs(safeGoal - safeGoal.roundToInt()) >= 0.05)
  return if (needsDecimals) {
    val rounded = (safeVal * 10.0).roundToInt() / 10.0
    NumberFormat.getNumberInstance(locale).apply {
      isGroupingUsed = false
      minimumFractionDigits = if (abs(rounded - rounded.roundToInt()) < 1e-6) 0 else 1
      maximumFractionDigits = 1
    }.format(if (abs(rounded) < 1e-6) 0.0 else rounded)
  } else {
    NumberFormat.getIntegerInstance(locale).apply {
      isGroupingUsed = false
    }.format(safeVal.roundToInt())
  }
}

internal fun formatBodyFatPercent(
  value: Double,
  locale: Locale = Locale.getDefault(),
  showPositiveSign: Boolean = false
): String {
  val normalized = if (abs(value) < 0.05) 0.0 else value
  val fmt = NumberFormat.getPercentInstance(locale).apply {
    minimumFractionDigits = 1
    maximumFractionDigits = 1
  }
  val formatted = fmt.format(normalized / 100.0)
  return if (showPositiveSign && normalized > 0.0) "+$formatted" else formatted
}

internal fun formatBodyFatDeltaPp(
  delta: Double,
  unitLabel: String,
  locale: Locale = Locale.getDefault()
): String {
  val normalized = if (abs(delta) < 0.05) 0.0 else delta
  val fmt = NumberFormat.getNumberInstance(locale).apply {
    minimumFractionDigits = 1
    maximumFractionDigits = 1
    isGroupingUsed = false
  }
  val formatted = fmt.format(normalized)
  val signed = if (normalized > 0.0) "+$formatted" else formatted
  return "$signed $unitLabel"
}

object TrendModels {
  fun buildTrendPageModel(
    watchCtx: WatchContext,
    history: List<HistoryPoint>,
    unit: WeightUnit = watchCtx.effectiveWeightUnit,
    today: String = CheckInDate.today()
  ): TrendPageModel {
    val weightByDay = sortedMapOf<String, HistoryPoint>()
    val bfByDay = sortedMapOf<String, Double>()

    for (pt in watchCtx.bodyFatHistory) {
      if (pt.day.isNotBlank() && pt.day <= today && pt.bodyFatPercentage != null && pt.bodyFatPercentage > 0.0) {
        bfByDay[pt.day] = pt.bodyFatPercentage
      }
    }

    for (pt in history) {
      if (pt.day.isNotBlank() && pt.day <= today) {
        if (pt.weightKg > 0.0) {
          weightByDay[pt.day] = pt
        }
        if (pt.bodyFatPercentage != null && pt.bodyFatPercentage > 0.0) {
          bfByDay[pt.day] = pt.bodyFatPercentage
        }
      }
    }

    val ctxLastDay = watchCtx.lastEntryDate?.takeIf { it.isNotBlank() && it <= today }
    val ctxLastKg = watchCtx.lastWeightKg?.takeIf { it > 0.0 }
    val ctxLastBf = watchCtx.lastBodyFatPercentage?.takeIf { it > 0.0 }
    val ctxLastBfDay = watchCtx.lastBodyFatDate?.takeIf { it.isNotBlank() && it <= today }
    if (ctxLastDay != null && ctxLastKg != null && !weightByDay.containsKey(ctxLastDay)) {
      weightByDay[ctxLastDay] = HistoryPoint(ctxLastDay, ctxLastKg)
    }
    if (ctxLastBfDay != null && ctxLastBf != null && !bfByDay.containsKey(ctxLastBfDay)) {
      bfByDay[ctxLastBfDay] = ctxLastBf
    }

    val rawCtxToday = watchCtx.today?.trim()
    val ctxTodayDay = when {
      rawCtxToday.isNullOrEmpty() -> today
      rawCtxToday <= today -> rawCtxToday
      else -> null
    }
    val ctxTodayKg = if (ctxTodayDay != null) watchCtx.todayWeightKg?.takeIf { it > 0.0 } else null
    val ctxTodayBf = if (ctxTodayDay != null) watchCtx.todayBodyFatPercentage?.takeIf { it > 0.0 } else null
    if (ctxTodayDay != null && ctxTodayKg != null) {
      if (ctxTodayDay == today || !weightByDay.containsKey(ctxTodayDay)) {
        val prevBf = weightByDay[ctxTodayDay]?.bodyFatPercentage
        weightByDay[ctxTodayDay] = HistoryPoint(ctxTodayDay, ctxTodayKg, ctxTodayBf ?: prevBf)
      }
    }
    if (ctxTodayDay != null && ctxTodayBf != null) {
      if (ctxTodayDay == today || !bfByDay.containsKey(ctxTodayDay)) {
        bfByDay[ctxTodayDay] = ctxTodayBf
      }
    }

    val cutoffDay = try {
      val fmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
      val parsedToday = fmt.parse(today)
      if (parsedToday != null) {
        val cal = Calendar.getInstance().apply {
          time = parsedToday
          add(Calendar.DAY_OF_YEAR, -13)
        }
        fmt.format(cal.time)
      } else {
        ""
      }
    } catch (_: Throwable) {
      ""
    }

    val latestKg = weightByDay.values.lastOrNull()?.weightKg
      ?: (if (watchCtx.today == null || watchCtx.today <= today) ctxTodayKg else null)
      ?: (if (watchCtx.lastEntryDate == null || watchCtx.lastEntryDate <= today) ctxLastKg else null)
    val latestWeightDisplay = latestKg?.let { unit.displayedFromKg(it) }

    val latestBf = bfByDay.values.lastOrNull()
      ?: (if (ctxTodayDay == today) ctxTodayBf else null)
      ?: (if (ctxLastBfDay != null || (watchCtx.lastBodyFatDate == null && (watchCtx.lastEntryDate == null || watchCtx.lastEntryDate <= today))) ctxLastBf else null)

    val weightSamples = weightByDay.values
      .filter { cutoffDay.isEmpty() || (it.day >= cutoffDay && it.day <= today) }
      .takeLast(14)
    val bfSamples = bfByDay.entries
      .filter { (day, _) -> cutoffDay.isEmpty() || (day >= cutoffDay && day <= today) }
      .map { (day, bf) ->
        HistoryPoint(day = day, weightKg = weightByDay[day]?.weightKg ?: 0.0, bodyFatPercentage = bf)
      }
      .takeLast(14)

    val weightDelta = if (weightSamples.size >= 2) {
      val first = unit.displayedFromKg(weightSamples.first().weightKg)
      val last = unit.displayedFromKg(weightSamples.last().weightKg)
      ((last - first) * 10.0).roundToInt() / 10.0
    } else null

    val bfDelta = if (bfSamples.size >= 2) {
      val first = bfSamples.first().bodyFatPercentage ?: 0.0
      val last = bfSamples.last().bodyFatPercentage ?: 0.0
      ((last - first) * 10.0).roundToInt() / 10.0
    } else null

    return TrendPageModel(
      latestWeightDisplay = latestWeightDisplay,
      weightDeltaDisplay = weightDelta,
      latestBodyFatPercent = latestBf,
      bodyFatDeltaPercent = bfDelta,
      weightSamples = weightSamples,
      bodyFatSamples = bfSamples,
      unitSuffix = unit.suffix
    )
  }
}

@Composable
fun TrendChartPage(store: CheckInStore, isCurrentPage: Boolean = true) {
  val context = LocalContext.current
  val history by store.history.collectAsState()
  val unit by store.unit.collectAsState()
  val watchCtx by store.watchContext.collectAsState()
  val storeToday by store.localDay.collectAsState()
  val columnState = rememberTransformingLazyColumnState()
  val transformationSpec = rememberTransformationSpec()
  var showBodyFat by remember { mutableStateOf(false) }
  var today by remember { mutableStateOf(CheckInDate.today()) }

  LaunchedEffect(storeToday, isCurrentPage) {
    val current = CheckInDate.today()
    if (today != current) {
      today = current
    }
  }

  DisposableEffect(context) {
    val syncLocalDay = {
      val current = CheckInDate.today()
      if (today != current) {
        today = current
        store.pruneStaleDayData()
      }
    }
    syncLocalDay()
    val lifecycle = (context as? LifecycleOwner)?.lifecycle
    val lifecycleObserver = LifecycleEventObserver { _, event ->
      if (event == Lifecycle.Event.ON_RESUME) {
        syncLocalDay()
      }
    }
    lifecycle?.addObserver(lifecycleObserver)
    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_DATE_CHANGED)
      addAction(Intent.ACTION_TIME_CHANGED)
      addAction(Intent.ACTION_TIMEZONE_CHANGED)
    }
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(ctx: Context?, intent: Intent?) {
        syncLocalDay()
      }
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        context.registerReceiver(receiver, filter)
      }
    } catch (_: Throwable) {}
    onDispose {
      lifecycle?.removeObserver(lifecycleObserver)
      try {
        context.unregisterReceiver(receiver)
      } catch (_: Throwable) {}
    }
  }

  val model = remember(watchCtx, history, unit, today) {
    TrendModels.buildTrendPageModel(watchCtx, history, unit, today)
  }

  SparkyListScaffold(columnState = columnState) { contentPadding ->
    TransformingLazyColumn(
      state = columnState,
      contentPadding = contentPadding,
      modifier = Modifier.fillMaxSize(),
      horizontalAlignment = Alignment.CenterHorizontally
    ) {
      item(key = "trend_header") {
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
            title = stringResource(R.string.trend_page_title),
            icon = Icons.Rounded.MonitorWeight,
            accent = if (showBodyFat && model.hasAnyBodyFat) SparkyColors.Cyan else SparkyColors.Green
          )
        }
      }

      // Dual-metric Hero Card: ALWAYS shows both latest Weight AND latest Body Fat %
      item(key = "trend_dual_hero") {
        Card(
          onClick = {
            if (model.hasAnyBodyFat) {
              showBodyFat = !showBodyFat
              Haptics.click()
            }
          },
          enabled = model.hasAnyBodyFat,
          modifier = Modifier
            .fillMaxWidth()
            .minimumVerticalContentPadding(CardDefaults.minimumVerticalListContentPadding)
            .transformedHeight(this, transformationSpec),
          transformation = SurfaceTransformation(transformationSpec),
          colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow
          )
        ) {
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically
          ) {
            val weightSelected = !(showBodyFat && model.hasAnyBodyFat)
            Column(
              modifier = Modifier
                .weight(1f)
                .clip(RoundedCornerShape(12.dp))
                .background(
                  if (weightSelected) SparkyColors.Green.copy(alpha = 0.16f)
                  else MaterialTheme.colorScheme.surfaceContainer
                )
                .border(
                  width = 1.dp,
                  color = if (weightSelected) SparkyColors.Green.copy(alpha = 0.65f) else Color.Transparent,
                  shape = RoundedCornerShape(12.dp)
                )
                .clickable {
                  if (showBodyFat) {
                    showBodyFat = false
                    Haptics.click()
                  }
                }
                .padding(horizontal = 6.dp, vertical = 6.dp),
              horizontalAlignment = Alignment.CenterHorizontally
            ) {
              Text(
                text = stringResource(R.string.trend_tab_weight).uppercase(Locale.US),
                style = MaterialTheme.typography.labelSmall,
                color = SparkyColors.Green,
                maxLines = 1
              )
              Text(
                text = model.latestWeightDisplay?.let {
                  String.format(Locale.getDefault(), "%.1f", it)
                } ?: "—",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1
              )
              val wDeltaText = model.weightDeltaDisplay?.let { d ->
                val sign = if (d > 0) "+" else ""
                String.format(Locale.getDefault(), "%s%.1f %s", sign, d, model.unitSuffix)
              } ?: model.unitSuffix
              Text(
                text = wDeltaText,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1
              )
            }

            if (model.hasAnyBodyFat) {
              val bfSelected = showBodyFat
              Column(
                modifier = Modifier
                  .weight(1f)
                  .clip(RoundedCornerShape(12.dp))
                  .background(
                    if (bfSelected) SparkyColors.Cyan.copy(alpha = 0.16f)
                    else MaterialTheme.colorScheme.surfaceContainer
                  )
                  .border(
                    width = 1.dp,
                    color = if (bfSelected) SparkyColors.Cyan.copy(alpha = 0.65f) else Color.Transparent,
                    shape = RoundedCornerShape(12.dp)
                  )
                  .clickable {
                    if (!showBodyFat) {
                      showBodyFat = true
                      Haptics.click()
                    }
                  }
                  .padding(horizontal = 6.dp, vertical = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally
              ) {
                Text(
                  text = stringResource(R.string.trend_tab_body_fat).uppercase(Locale.US),
                  style = MaterialTheme.typography.labelSmall,
                  color = SparkyColors.Cyan,
                  maxLines = 1
                )
                Text(
                  text = model.latestBodyFatPercent?.let {
                    formatBodyFatPercent(it, Locale.getDefault(), showPositiveSign = false)
                  } ?: "—",
                  style = MaterialTheme.typography.titleMedium,
                  fontWeight = FontWeight.Bold,
                  color = MaterialTheme.colorScheme.onSurface,
                  maxLines = 1
                )
                val ppUnit = stringResource(R.string.trend_bf_delta_unit_pp)
                val bfDeltaText = model.bodyFatDeltaPercent?.let { d ->
                  formatBodyFatDeltaPp(d, ppUnit, Locale.getDefault())
                } ?: stringResource(R.string.weight_body_fat_title)
                Text(
                  text = bfDeltaText,
                  style = MaterialTheme.typography.labelSmall,
                  color = MaterialTheme.colorScheme.onSurfaceVariant,
                  maxLines = 1
                )
              }
            }
          }
        }
      }

      // Visible segmented toggle row when Body Fat % data is available
      if (model.hasAnyBodyFat) {
        item(key = "trend_segmented_toggle") {
          Row(
            modifier = Modifier
              .fillMaxWidth()
              .selectableGroup()
              .minimumVerticalContentPadding(CompactButtonDefaults.minimumVerticalListContentPadding)
              .transformedHeight(this, transformationSpec),
            horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically
          ) {
            CompactButton(
              onClick = {
                showBodyFat = false
                Haptics.click()
              },
              modifier = Modifier.semantics {
                selected = !showBodyFat
                role = Role.Tab
              },
              colors = if (!showBodyFat) {
                ButtonDefaults.buttonColors(containerColor = SparkyColors.Green, contentColor = Color.Black)
              } else {
                ButtonDefaults.filledTonalButtonColors()
              },
              label = { Text(stringResource(R.string.trend_tab_weight), maxLines = 1) }
            )
            CompactButton(
              onClick = {
                showBodyFat = true
                Haptics.click()
              },
              modifier = Modifier.semantics {
                selected = showBodyFat
                role = Role.Tab
              },
              colors = if (showBodyFat) {
                ButtonDefaults.buttonColors(containerColor = SparkyColors.Cyan, contentColor = Color.Black)
              } else {
                ButtonDefaults.filledTonalButtonColors()
              },
              label = { Text(stringResource(R.string.trend_tab_body_fat), maxLines = 1) }
            )
          }
        }
      }

      // Active chart card
      item(key = "trend_chart_card") {
        if (showBodyFat && model.hasAnyBodyFat) {
          val bfPoints = model.bodyFatSamples
          if (bfPoints.size >= 2) {
            val values = bfPoints.map { it.bodyFatPercentage ?: 0.0 }
            val minVal = values.minOrNull() ?: 0.0
            val maxVal = values.maxOrNull() ?: 1.0
            val totalDelta = model.bodyFatDeltaPercent ?: (values.last() - values.first())
            val summaryLocale = Locale.getDefault()
            val ppUnit = stringResource(R.string.trend_bf_delta_unit_pp)

            Card(
              onClick = {},
              enabled = false,
              modifier = Modifier
                .fillMaxWidth()
                .minimumVerticalContentPadding(CardDefaults.minimumVerticalListContentPadding)
                .transformedHeight(this, transformationSpec),
              transformation = SurfaceTransformation(transformationSpec),
              colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceContainer
              )
            ) {
              Column(modifier = Modifier.fillMaxWidth()) {
                SparkyTrendLineCanvas(
                  values = values,
                  rollingMean = emptyList(),
                  lineColor = SparkyColors.Cyan,
                  meanColor = SparkyColors.Purple,
                  unconfirmedIndices = emptySet(),
                  modifier = Modifier
                    .fillMaxWidth()
                    .height(74.dp)
                )
                Spacer(Modifier.height(6.dp))
                Text(
                  text = stringResource(
                    R.string.trend_bf_summary_pp,
                    values.size,
                    formatBodyFatDeltaPp(totalDelta, ppUnit, summaryLocale),
                    formatBodyFatPercent(minVal, summaryLocale, showPositiveSign = false),
                    formatBodyFatPercent(maxVal, summaryLocale, showPositiveSign = false)
                  ),
                  style = MaterialTheme.typography.labelSmall,
                  color = MaterialTheme.colorScheme.onSurfaceVariant,
                  textAlign = TextAlign.Center,
                  modifier = Modifier.fillMaxWidth()
                )
              }
            }
          } else {
            EmptyStateCard(
              message = when {
                bfPoints.size == 1 -> stringResource(R.string.trend_single_bf_note)
                model.latestBodyFatPercent != null -> stringResource(R.string.trend_window_bf_note)
                else -> stringResource(R.string.trend_empty_bf_state)
              },
              modifier = Modifier
                .minimumVerticalContentPadding(CardDefaults.minimumVerticalListContentPadding)
                .transformedHeight(this, transformationSpec)
            )
          }
        } else {
          val samples = model.weightSamples
          if (samples.size < 2) {
            EmptyStateCard(
              message = stringResource(R.string.trend_empty_state),
              modifier = Modifier
                .minimumVerticalContentPadding(CardDefaults.minimumVerticalListContentPadding)
                .transformedHeight(this, transformationSpec)
            )
          } else {
            val values = samples.map { unit.fromKg(it.weightKg) }
            val rolling = store.rollingMean(samples, window = 7)
            val minVal = values.minOrNull() ?: 0.0
            val maxVal = values.maxOrNull() ?: 1.0
            val totalDelta = model.weightDeltaDisplay ?: (values.last() - values.first())
            val sign = if (totalDelta > 0) "+" else ""
            val unconfirmedSet = samples.mapIndexedNotNull { idx, pt ->
              if (store.isDayUnconfirmed(pt.day)) idx else null
            }.toSet()

            Card(
              onClick = {},
              enabled = false,
              modifier = Modifier
                .fillMaxWidth()
                .minimumVerticalContentPadding(CardDefaults.minimumVerticalListContentPadding)
                .transformedHeight(this, transformationSpec),
              transformation = SurfaceTransformation(transformationSpec),
              colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceContainer
              )
            ) {
              Column(modifier = Modifier.fillMaxWidth()) {
                SparkyTrendLineCanvas(
                  values = values,
                  rollingMean = rolling,
                  lineColor = SparkyColors.Green,
                  meanColor = SparkyColors.Cyan,
                  unconfirmedIndices = unconfirmedSet,
                  modifier = Modifier
                    .fillMaxWidth()
                    .height(74.dp)
                )
                Spacer(Modifier.height(6.dp))
                Text(
                  text = stringResource(
                    R.string.trend_weight_summary,
                    values.size,
                    sign,
                    totalDelta,
                    unit.suffix,
                    minVal,
                    maxVal
                  ),
                  style = MaterialTheme.typography.labelSmall,
                  color = MaterialTheme.colorScheme.onSurfaceVariant,
                  textAlign = TextAlign.Center,
                  modifier = Modifier.fillMaxWidth()
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
private fun SparkyTrendLineCanvas(
  values: List<Double>,
  rollingMean: List<Pair<Int, Double>>,
  lineColor: Color,
  meanColor: Color,
  unconfirmedIndices: Set<Int>,
  modifier: Modifier = Modifier
) {
  val minVal = values.minOrNull() ?: 0.0
  val maxVal = values.maxOrNull() ?: 1.0
  val span = max(0.4, maxVal - minVal)

  Canvas(
    modifier = modifier
      .clip(RoundedCornerShape(10.dp))
      .background(Color(0xFF101622))
      .padding(horizontal = 8.dp, vertical = 8.dp)
  ) {
    val w = size.width
    val h = size.height
    val gridColor = Color.White.copy(alpha = 0.07f)

    // Subtle horizontal guide rails (top, mid, bottom)
    for (frac in listOf(0f, 0.5f, 1f)) {
      drawLine(
        color = gridColor,
        start = Offset(0f, h * frac),
        end = Offset(w, h * frac),
        strokeWidth = 1.dp.toPx()
      )
    }

    fun pointOffset(index: Int, value: Double): Offset {
      val x = if (values.size <= 1) w / 2f else (index.toFloat() / (values.size - 1).toFloat()) * w
      val normalized = ((value - minVal) / span).toFloat().coerceIn(0f, 1f)
      val y = h - (normalized * h)
      return Offset(x, y)
    }

    val pts = values.mapIndexed { idx, v -> pointOffset(idx, v) }
    if (pts.size >= 2) {
      val linePath = Path().apply {
        moveTo(pts.first().x, pts.first().y)
        for (i in 1 until pts.size) {
          val prev = pts[i - 1]
          val cur = pts[i]
          val midX = (prev.x + cur.x) / 2f
          cubicTo(midX, prev.y, midX, cur.y, cur.x, cur.y)
        }
      }
      val fillPath = Path().apply {
        addPath(linePath)
        lineTo(pts.last().x, h)
        lineTo(pts.first().x, h)
        close()
      }
      drawPath(
        path = fillPath,
        brush = Brush.verticalGradient(
          colors = listOf(lineColor.copy(alpha = 0.32f), lineColor.copy(alpha = 0.02f)),
          startY = 0f,
          endY = h
        )
      )

      if (rollingMean.size >= 2) {
        val meanPath = Path()
        rollingMean.forEachIndexed { idx, (ptIdx, mv) ->
          val off = pointOffset(ptIdx, mv)
          if (idx == 0) meanPath.moveTo(off.x, off.y) else meanPath.lineTo(off.x, off.y)
        }
        drawPath(
          path = meanPath,
          color = meanColor.copy(alpha = 0.65f),
          style = Stroke(
            width = 1.75.dp.toPx(),
            cap = StrokeCap.Round,
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 5f), 0f)
          )
        )
      }

      drawPath(
        path = linePath,
        color = lineColor,
        style = Stroke(width = 2.75.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
      )
    }

    pts.forEachIndexed { idx, center ->
      val isLatest = idx == pts.lastIndex
      if (unconfirmedIndices.contains(idx)) {
        drawCircle(
          color = SparkyColors.Amber,
          radius = 4.dp.toPx(),
          center = center,
          style = Stroke(width = 1.6.dp.toPx())
        )
      } else {
        if (isLatest) {
          drawCircle(
            color = lineColor.copy(alpha = 0.28f),
            radius = 6.5.dp.toPx(),
            center = center
          )
        }
        drawCircle(
          color = if (isLatest) Color.White else lineColor,
          radius = if (isLatest) 3.5.dp.toPx() else 2.dp.toPx(),
          center = center
        )
      }
    }
  }
}

// ============================================================================
// 6. NOW PLAYING PAGE
// ============================================================================

@Composable
fun NowPlayingPage(store: MediaControlStore, isCurrentPage: Boolean = true) {
  val phoneMedia by store.phoneMedia.collectAsState()
  val phoneReachable by store.phoneReachable.collectAsState()
  val manualTarget by store.manualTarget.collectAsState()
  val watchPlaying by store.watchPlaying.collectAsState()
  val watchVolume by store.watchVolume.collectAsState()
  val watchMaxVolume by store.watchMaxVolume.collectAsState()

  DisposableEffect(isCurrentPage) {
    store.setPageVisible(isCurrentPage)
    onDispose {
      if (isCurrentPage) {
        store.setPageVisible(false)
      }
    }
  }

  val target = MediaControlLogic.resolveEffectiveTarget(
    manualTarget = manualTarget,
    phoneReachable = phoneReachable,
    watchMusicActive = watchPlaying,
    phoneMedia = phoneMedia
  )
  val isPhoneTarget = target == MediaTarget.PHONE
  val isPlaying = if (isPhoneTarget) phoneMedia?.isPlaying == true else watchPlaying
  val volumePercent = if (isPhoneTarget) {
    phoneMedia?.volumePercent
  } else if (watchMaxVolume > 0) {
    ((watchVolume.coerceIn(0, watchMaxVolume) * 100f) / watchMaxVolume).roundToInt()
  } else {
    null
  }

  val primaryText: String
  val secondaryText: String?
  val primaryColor: Color
  if (isPhoneTarget) {
    val remote = phoneMedia
    when {
      remote?.title != null -> {
        primaryText = remote.title
        secondaryText = remote.secondaryLabel
        primaryColor = MaterialTheme.colorScheme.onSurface
      }
      remote != null && !remote.hasMetadataAccess -> {
        primaryText = stringResource(
          if (remote.isPlaying) R.string.now_playing_playing_on_phone else R.string.now_playing_phone_media
        )
        secondaryText = stringResource(R.string.now_playing_enable_track_info)
        primaryColor = SparkyColors.Cyan
      }
      remote != null && remote.hasMetadataAccess -> {
        if (remote.isPlaying) {
          primaryText = stringResource(R.string.now_playing_playing_on_phone)
          secondaryText = remote.secondaryLabel
          primaryColor = SparkyColors.Cyan
        } else if (remote.hasSession) {
          primaryText = remote.appName ?: stringResource(R.string.now_playing_phone_media)
          secondaryText = remote.artist
          primaryColor = SparkyColors.Cyan
        } else {
          primaryText = stringResource(R.string.now_playing_nothing_playing)
          secondaryText = null
          primaryColor = MaterialTheme.colorScheme.onSurfaceVariant
        }
      }
      else -> {
        primaryText = stringResource(R.string.now_playing_title)
        secondaryText = null
        primaryColor = SparkyColors.Cyan
      }
    }
  } else {
    primaryText = stringResource(
      if (watchPlaying) R.string.now_playing_playing_on_watch else R.string.now_playing_watch_media
    )
    secondaryText = null
    primaryColor = SparkyColors.Cyan
  }

  ScreenScaffold { contentPadding ->
    Column(
      modifier = Modifier
        .fillMaxSize()
        .wearRotaryStepper(isCurrentPage = isCurrentPage, pixelsPerStep = 28f) { steps ->
          if (steps != 0) store.adjustVolume(steps, target)
        }
        .padding(contentPadding)
        .padding(horizontal = 12.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.Center
    ) {
      CompactButton(
        onClick = { if (phoneReachable) store.toggleTarget() },
        enabled = phoneReachable,
        colors = ButtonDefaults.filledTonalButtonColors(),
        icon = {
          Icon(
            imageVector = if (isPhoneTarget) Icons.Rounded.PhoneAndroid else Icons.Rounded.Watch,
            contentDescription = null,
            tint = if (isPhoneTarget) SparkyColors.Cyan else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(CompactButtonDefaults.ExtraSmallIconSize)
          )
        },
        label = {
          Text(
            text = stringResource(
              if (isPhoneTarget) R.string.now_playing_source_phone else R.string.now_playing_source_watch
            ),
            maxLines = 1
          )
        }
      )

      Spacer(Modifier.height(5.dp))

      Text(
        text = primaryText,
        style = MaterialTheme.typography.titleSmall,
        color = primaryColor,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth()
      )
      if (secondaryText != null) {
        Text(
          text = secondaryText,
          style = MaterialTheme.typography.labelSmall,
          color = MaterialTheme.colorScheme.onSurfaceVariant,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis,
          textAlign = TextAlign.Center,
          modifier = Modifier
            .fillMaxWidth()
            .padding(top = 1.dp)
        )
      }

      Spacer(Modifier.height(7.dp))

      Row(
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically
      ) {
        FilledTonalIconButton(
          onClick = { store.sendTransport(MediaTransportAction.PREVIOUS, target) },
          shapes = IconButtonDefaults.animatedShapes(),
          modifier = Modifier.size(38.dp)
        ) {
          Icon(
            imageVector = Icons.Rounded.SkipPrevious,
            contentDescription = stringResource(R.string.now_playing_previous)
          )
        }
        FilledIconButton(
          onClick = { store.sendTransport(MediaTransportAction.PLAY_PAUSE, target) },
          shapes = IconButtonDefaults.animatedShapes(),
          colors = IconButtonDefaults.filledIconButtonColors(
            containerColor = SparkyColors.Cyan,
            contentColor = Color.Black
          ),
          modifier = Modifier.size(48.dp)
        ) {
          Icon(
            imageVector = if (isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
            contentDescription = stringResource(
              if (isPlaying) R.string.now_playing_pause else R.string.now_playing_play
            )
          )
        }
        FilledTonalIconButton(
          onClick = { store.sendTransport(MediaTransportAction.NEXT, target) },
          shapes = IconButtonDefaults.animatedShapes(),
          modifier = Modifier.size(38.dp)
        ) {
          Icon(
            imageVector = Icons.Rounded.SkipNext,
            contentDescription = stringResource(R.string.now_playing_next)
          )
        }
      }

      Spacer(Modifier.height(6.dp))

      Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
      ) {
        FilledTonalIconButton(
          onClick = { store.adjustVolume(-1, target) },
          modifier = Modifier.size(28.dp)
        ) {
          Icon(
            imageVector = Icons.AutoMirrored.Rounded.VolumeDown,
            contentDescription = stringResource(R.string.now_playing_vol_down),
            modifier = Modifier.size(16.dp)
          )
        }
        if (volumePercent != null) {
          val formattedVolume = NumberFormat.getPercentInstance(Locale.getDefault())
            .format(volumePercent / 100.0)
          Text(
            text = formattedVolume,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.widthIn(min = 32.dp)
          )
        }
        FilledTonalIconButton(
          onClick = { store.adjustVolume(1, target) },
          modifier = Modifier.size(28.dp)
        ) {
          Icon(
            imageVector = Icons.AutoMirrored.Rounded.VolumeUp,
            contentDescription = stringResource(R.string.now_playing_vol_up),
            modifier = Modifier.size(16.dp)
          )
        }
      }
    }
  }
}

// ============================================================================
// 7. FASTING PAGE
// ============================================================================

@Composable
fun FastingPage(store: CheckInStore, isCurrentPage: Boolean = true) {
  val fast by store.fast.collectAsState()
  val fastSyncState by store.fastSyncState.collectAsState()
  var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
  val columnState = rememberTransformingLazyColumnState()
  val transformationSpec = rememberTransformationSpec()
  val ambientModeManager = LocalAmbientModeManager.current
  val isAmbient = ambientModeManager?.currentAmbientMode is AmbientMode.Ambient

  ambientModeManager?.AmbientTickEffect {
    nowMs = System.currentTimeMillis()
  }

  LaunchedEffect(isAmbient) {
    nowMs = System.currentTimeMillis()
    if (!isAmbient) {
      while (true) {
        delay(1000L)
        nowMs = System.currentTimeMillis()
      }
    }
  }

  val activeFast = fast

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
            title = if (activeFast != null) {
              stringResource(R.string.fasting_title_active, activeFast.label ?: "16:8")
            } else {
              stringResource(R.string.fasting_title)
            },
            icon = Icons.Rounded.Timer,
            accent = SparkyColors.Amber,
            trailingBadge = if (fastSyncState != SyncState.SAVED) {
              {
                Icon(
                  imageVector = if (fastSyncState == SyncState.FAILED) Icons.Rounded.ErrorOutline else Icons.Rounded.Sync,
                  contentDescription = stringResource(
                    if (fastSyncState == SyncState.FAILED) R.string.fasting_sync_failed else R.string.fasting_sync_queued
                  ),
                  tint = if (fastSyncState == SyncState.FAILED) SparkyColors.Rose else SparkyColors.Amber,
                  modifier = Modifier.size(14.dp)
                )
              }
            } else null
          )
        }
      }

      if (activeFast != null) {
        val elapsedSec = max(0, ((nowMs - activeFast.startedAtMs) / 1000L).toInt())
        val goalSec = if (activeFast.targetEndAtMs != null && activeFast.targetEndAtMs > activeFast.startedAtMs) {
          ((activeFast.targetEndAtMs - activeFast.startedAtMs) / 1000L).toInt()
        } else 16 * 3600
        val rawRatio = elapsedSec.toFloat() / max(1, goalSec).toFloat()
        val progress = rawRatio.coerceIn(0f, 1.25f)
        val hrs = elapsedSec / 3600
        val mins = (elapsedSec % 3600) / 60

        item(key = "fast_gauge") {
          Card(
            onClick = {},
            enabled = false,
            modifier = Modifier
              .fillMaxWidth()
              .minimumVerticalContentPadding(CardDefaults.minimumVerticalListContentPadding)
              .transformedHeight(this, transformationSpec),
            transformation = SurfaceTransformation(transformationSpec),
            colors = CardDefaults.cardColors(
              containerColor = MaterialTheme.colorScheme.surfaceContainerLow
            )
          ) {
            Column(
              modifier = Modifier.fillMaxWidth(),
              horizontalAlignment = Alignment.CenterHorizontally
            ) {
              Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier.size(96.dp)
              ) {
                CircularProgressIndicator(
                  progress = { progress },
                  allowProgressOverflow = true,
                  startAngle = 125f,
                  endAngle = 55f,
                  strokeWidth = 8.dp,
                  colors = ProgressIndicatorDefaults.colors(
                    indicatorColor = if (progress >= 1f) SparkyColors.Green else SparkyColors.Amber,
                    trackColor = MaterialTheme.colorScheme.outlineVariant
                  ),
                  modifier = Modifier.fillMaxSize()
                )
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                  Text(
                    text = stringResource(R.string.fasting_elapsed_hm, hrs, mins),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                  )
                  Text(
                    text = stringResource(
                      R.string.fasting_progress_of,
                      (rawRatio.coerceIn(0f, 9.99f) * 100f).toInt(),
                      goalSec / 3600
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                  )
                }
              }
            }
          }
        }

        item(key = "fast_end") {
          FilledTonalButton(
            onClick = { store.endFast() },
            modifier = Modifier
              .fillMaxWidth()
              .minimumVerticalContentPadding(ButtonDefaults.minimumVerticalListContentPadding)
              .transformedHeight(this, transformationSpec),
            transformation = SurfaceTransformation(transformationSpec),
            colors = ButtonDefaults.buttonColors(
              containerColor = MaterialTheme.colorScheme.errorContainer,
              contentColor = MaterialTheme.colorScheme.onErrorContainer,
              iconColor = SparkyColors.Rose
            ),
            icon = {
              Icon(
                imageVector = Icons.Rounded.Stop,
                contentDescription = null,
                modifier = Modifier.size(ButtonDefaults.IconSize)
              )
            },
            label = {
              Text(
                text = stringResource(R.string.fasting_end_button),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
              )
            }
          )
        }
      } else {
        item(key = "fast_prompt") {
          Text(
            text = stringResource(R.string.fasting_start_prompt),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
              .minimumVerticalContentPadding(ListHeaderDefaults.minimumBottomListContentPadding)
              .transformedHeight(this, transformationSpec)
          )
        }
        val presets = listOf(
          "16:8" to 16.0,
          "18:6" to 18.0,
          "20:4" to 20.0,
          "OMAD" to 23.0
        )
        items(presets, key = { it.first }) { (label, hours) ->
          Button(
            onClick = { store.startFast(label, hours) },
            modifier = Modifier
              .fillMaxWidth()
              .minimumVerticalContentPadding(ButtonDefaults.minimumVerticalListContentPadding)
              .transformedHeight(this, transformationSpec),
            transformation = SurfaceTransformation(transformationSpec),
            colors = ButtonDefaults.buttonColors(
              containerColor = MaterialTheme.colorScheme.surfaceContainer,
              contentColor = MaterialTheme.colorScheme.onSurface,
              secondaryContentColor = SparkyColors.Amber,
              iconColor = SparkyColors.Amber
            ),
            icon = {
              Icon(
                imageVector = Icons.Rounded.Timer,
                contentDescription = null,
                modifier = Modifier.size(ButtonDefaults.IconSize)
              )
            },
            label = {
              Text(text = label, maxLines = 1)
            },
            secondaryLabel = {
              Text(
                text = stringResource(R.string.fasting_duration_hours, hours.toInt()),
                maxLines = 1,
                fontWeight = FontWeight.SemiBold
              )
            }
          )
        }
      }
    }
  }
}

// ============================================================================
// 8. DAILY STEPS PAGE
// ============================================================================

@Composable
fun StepsPage(store: CheckInStore, isCurrentPage: Boolean = true) {
  val steps by store.steps.collectAsState()
  val stepGoal by store.stepGoal.collectAsState()
  val today = steps?.count ?: 0
  val goal = max(1, stepGoal)
  val progress = (today.toFloat() / goal.toFloat()).coerceIn(0f, 1.25f)
  val remaining = max(0, goal - today)
  val columnState = rememberTransformingLazyColumnState()
  val transformationSpec = rememberTransformationSpec()

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
            title = stringResource(R.string.steps_title),
            icon = Icons.AutoMirrored.Rounded.DirectionsWalk,
            accent = SparkyColors.Green
          )
        }
      }

      item {
        Card(
          onClick = {},
          enabled = false,
          modifier = Modifier
            .fillMaxWidth()
            .minimumVerticalContentPadding(CardDefaults.minimumVerticalListContentPadding)
            .transformedHeight(this, transformationSpec),
          transformation = SurfaceTransformation(transformationSpec),
          colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow
          )
        ) {
          Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally
          ) {
            Box(contentAlignment = Alignment.Center, modifier = Modifier.size(102.dp)) {
              CircularProgressIndicator(
                progress = { progress },
                allowProgressOverflow = true,
                startAngle = 125f,
                endAngle = 55f,
                strokeWidth = 9.dp,
                colors = ProgressIndicatorDefaults.colors(
                  indicatorColor = SparkyColors.Green,
                  trackColor = MaterialTheme.colorScheme.outlineVariant
                ),
                modifier = Modifier.fillMaxSize()
              )
              Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                  text = NumberFormat.getIntegerInstance().format(today),
                  style = MaterialTheme.typography.titleLarge,
                  fontWeight = FontWeight.Bold,
                  color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                  text = "/ ${NumberFormat.getIntegerInstance().format(goal)}",
                  style = MaterialTheme.typography.labelSmall,
                  color = MaterialTheme.colorScheme.onSurfaceVariant
                )
              }
            }

            Spacer(Modifier.height(4.dp))
            Box(
              modifier = Modifier
                .clip(CircleShape)
                .background(
                  if (remaining == 0) MaterialTheme.colorScheme.primaryContainer
                  else MaterialTheme.colorScheme.surfaceContainerHigh
                )
                .padding(horizontal = 10.dp, vertical = 3.dp)
            ) {
              Text(
                text = if (remaining > 0) {
                  stringResource(R.string.steps_remaining, NumberFormat.getIntegerInstance().format(remaining))
                } else {
                  stringResource(R.string.steps_goal_reached)
                },
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = if (remaining > 0) MaterialTheme.colorScheme.onSurfaceVariant else SparkyColors.Green,
                maxLines = 1
              )
            }
          }
        }
      }
    }
  }
}

// ============================================================================
// 9. SLEEP DETAIL PAGE & SHARED PRIMITIVES
// ============================================================================

@Composable
fun EmptyStateCard(message: String, modifier: Modifier = Modifier) {
  Box(
    modifier = modifier
      .fillMaxWidth()
      .clip(RoundedCornerShape(16.dp))
      .background(MaterialTheme.colorScheme.surfaceContainer)
      .padding(12.dp),
    contentAlignment = Alignment.Center
  ) {
    Text(
      text = message,
      style = MaterialTheme.typography.bodySmall,
      color = MaterialTheme.colorScheme.onSurfaceVariant,
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
  CompactButton(
    onClick = onClick,
    colors = ButtonDefaults.buttonColors(
      containerColor = color,
      contentColor = textColor
    ),
    label = {
      Text(
        text = label,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis
      )
    }
  )
}

@Composable
fun RoundStepperButton(label: String, onClick: () -> Unit) {
  FilledTonalIconButton(
    onClick = onClick,
    shapes = IconButtonDefaults.animatedShapes(),
    modifier = Modifier.size(34.dp)
  ) {
    Text(
      text = label,
      style = MaterialTheme.typography.titleSmall,
      fontWeight = FontWeight.Bold,
      color = MaterialTheme.colorScheme.onSurface
    )
  }
}

@Composable
fun SleepDetailPage(store: CheckInStore, onDismiss: () -> Unit) {
  val sleep by store.sleep.collectAsState()
  val context = LocalContext.current
  val model = remember(sleep) { TileModels.buildSleepTileModel(sleep) }
  val columnState = rememberTransformingLazyColumnState()
  val transformationSpec = rememberTransformationSpec()

  SparkyListScaffold(
    columnState = columnState,
    edgeButton = {
      EdgeButton(
        onClick = onDismiss,
        buttonSize = EdgeButtonSize.Small,
        modifier = Modifier.scrollable(
          columnState,
          orientation = Orientation.Vertical,
          reverseDirection = true,
          overscrollEffect = rememberOverscrollEffect()
        )
      ) {
        Text(stringResource(R.string.common_close))
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
            title = stringResource(R.string.sleep_title),
            icon = Icons.Rounded.Bedtime,
            accent = SparkyColors.Purple
          )
        }
      }

      if (!model.hasData) {
        item {
          EmptyStateCard(
            message = stringResource(R.string.sleep_open_phone_to_sync),
            modifier = Modifier
              .minimumVerticalContentPadding(CardDefaults.minimumVerticalListContentPadding)
              .transformedHeight(this, transformationSpec)
          )
        }
      } else {
        item(key = "sleep_hero") {
          val resolvedDuration = TileModels.formatSleepDuration(context, model)
          val resolvedWindow = TileModels.formatSleepWindow(context, model.window)
          Card(
            onClick = {},
            enabled = false,
            modifier = Modifier
              .fillMaxWidth()
              .minimumVerticalContentPadding(CardDefaults.minimumVerticalListContentPadding)
              .transformedHeight(this, transformationSpec),
            transformation = SurfaceTransformation(transformationSpec),
            colors = CardDefaults.cardColors(
              containerColor = MaterialTheme.colorScheme.surfaceContainerLow
            )
          ) {
            Column(
              modifier = Modifier.fillMaxWidth(),
              horizontalAlignment = Alignment.CenterHorizontally
            ) {
              Text(
                text = resolvedDuration,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
              )
              model.sleepScore?.let { score ->
                Spacer(Modifier.height(2.dp))
                Box(
                  modifier = Modifier
                    .clip(CircleShape)
                    .background(SparkyColors.Purple.copy(alpha = 0.22f))
                    .padding(horizontal = 9.dp, vertical = 2.dp)
                ) {
                  Text(
                    text = stringResource(R.string.tile_sleep_score, score),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = SparkyColors.Purple
                  )
                }
              }
              Spacer(Modifier.height(3.dp))
              Text(
                text = resolvedWindow,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
              )
            }
          }
        }

        if (model.stages.isNotEmpty()) {
          items(model.stages, key = { it.label }) { stage ->
            val stageLabel = if (stage.labelRes != 0) stringResource(stage.labelRes) else stage.label
            val stageColor = Color(stage.colorArgb)
            Card(
              onClick = {},
              enabled = false,
              modifier = Modifier
                .fillMaxWidth()
                .minimumVerticalContentPadding(CardDefaults.minimumVerticalListContentPadding)
                .transformedHeight(this, transformationSpec),
              transformation = SurfaceTransformation(transformationSpec),
              colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceContainer
              )
            ) {
              Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
              ) {
                Row(
                  verticalAlignment = Alignment.CenterVertically,
                  horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                  Box(
                    modifier = Modifier
                      .size(7.dp)
                      .clip(CircleShape)
                      .background(stageColor)
                  )
                  Text(
                    text = stageLabel,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface
                  )
                }
                Text(
                  text = stage.durationText,
                  style = MaterialTheme.typography.labelMedium,
                  fontWeight = FontWeight.Bold,
                  color = stageColor
                )
              }
            }
          }
        }

        model.biometricsText?.let { bio ->
          item(key = "sleep_bio") {
            Card(
              onClick = {},
              enabled = false,
              modifier = Modifier
                .fillMaxWidth()
                .minimumVerticalContentPadding(CardDefaults.minimumVerticalListContentPadding)
                .transformedHeight(this, transformationSpec),
              transformation = SurfaceTransformation(transformationSpec),
              colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceContainerLow
              )
            ) {
              Text(
                text = bio,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth()
              )
            }
          }
        }
      }
    }
  }
}

@WearPreviewDevices
@WearPreviewFontScales
@Composable
private fun TrendDualMetricPreview() {
  SparkyWearTheme {
    ScreenScaffold { contentPadding ->
      Column(
        modifier = Modifier
          .fillMaxSize()
          .background(Color.Black)
          .padding(contentPadding),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
      ) {
        SparkyTrendLineCanvas(
          values = listOf(81.8, 81.4, 81.6, 81.1, 80.9, 80.6),
          rollingMean = listOf(0 to 81.8, 1 to 81.6, 2 to 81.6, 3 to 81.48, 4 to 81.36, 5 to 81.23),
          lineColor = SparkyColors.Green,
          meanColor = SparkyColors.Cyan,
          unconfirmedIndices = emptySet(),
          modifier = Modifier
            .fillMaxWidth()
            .height(74.dp)
        )
      }
    }
  }
}
