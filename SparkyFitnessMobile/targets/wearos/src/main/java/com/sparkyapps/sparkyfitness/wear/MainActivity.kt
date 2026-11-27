package com.sparkyapps.sparkyfitness.wear

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.wear.compose.foundation.LocalAmbientModeManager
import androidx.wear.compose.foundation.pager.HorizontalPager
import androidx.wear.compose.foundation.pager.PagerDefaults
import androidx.wear.compose.foundation.pager.rememberPagerState
import androidx.wear.compose.foundation.rememberAmbientModeManager
import androidx.wear.compose.material3.AnimatedPage
import androidx.wear.compose.material3.AppScaffold
import androidx.wear.compose.material3.HorizontalPagerScaffold
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.PagerScaffoldDefaults

class MainActivity : ComponentActivity() {
  private lateinit var sessionManager: WearSessionManager

  @Deprecated("Deprecated in Java")
  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<String>,
    grantResults: IntArray
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    sessionManager.sensorsController.startPassiveStepCounter { stepsToday ->
      sessionManager.checkInStore.updateLiveSteps(stepsToday)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    sessionManager = WearSessionManager.getInstance(applicationContext)
    requestNeededPermissions()
    handleNavigationIntent(intent)

    setContent {
      val ambientModeManager = rememberAmbientModeManager()
      CompositionLocalProvider(LocalAmbientModeManager provides ambientModeManager) {
        SparkyWearTheme {
          val workoutPhase by sessionManager.workoutStore.phase.collectAsState()
          val runPhase by sessionManager.runStore.phase.collectAsState()
          val recordingState by sessionManager.recordingStore.state.collectAsState()
          val keepScreenOn = workoutPhase != WorkoutSessionStore.Phase.IDLE ||
            runPhase != WatchRunStore.RunPhase.IDLE ||
            recordingState != null

          LaunchedEffect(keepScreenOn) {
            if (keepScreenOn) {
              window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            } else {
              window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
          }

          SparkyWearRoot(sessionManager = sessionManager)
        }
      }
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleNavigationIntent(intent)
  }

  override fun onResume() {
    super.onResume()
    sessionManager.checkInStore.pruneStaleDayData()
    sessionManager.pullInitialDataItems()
    sessionManager.mediaStore.setAppForeground(true)
    ComplicationUpdater.requestAll(applicationContext)
    TileUpdater.requestAll(applicationContext)
  }

  override fun onPause() {
    sessionManager.mediaStore.setAppForeground(false)
    super.onPause()
  }

  private fun handleNavigationIntent(intent: Intent?) {
    if (intent == null) return
    val targetPageExtra = intent.getStringExtra("target_page")
    if (targetPageExtra != null) {
      if (targetPageExtra == "sleep") {
        sessionManager.requestSleepDetail()
        return
      }
      WatchPage.fromKey(targetPageExtra)?.let { page ->
        sessionManager.requestNavigateTo(page)
        return
      }
    }
    val data = intent.data ?: return
    if (data.scheme == "sparkyfitness" && data.host == "watch") {
      val seg = data.pathSegments.firstOrNull()
      if (seg == "sleep") {
        sessionManager.requestSleepDetail()
        return
      }
      val page = when (seg) {
        "goals" -> WatchPage.GOALS
        "water" -> WatchPage.WATER
        "meds", "medications" -> WatchPage.MEDICATIONS
        "weight", "entry" -> WatchPage.ENTRY
        "trend" -> WatchPage.TREND
        "workout", "run" -> WatchPage.WORKOUT
        "nowPlaying", "now_playing" -> WatchPage.NOW_PLAYING
        "fasting" -> WatchPage.FASTING
        "steps" -> WatchPage.STEPS
        else -> null
      }
      if (page != null) {
        sessionManager.requestNavigateTo(page)
      }
    }
  }

  private fun requestNeededPermissions() {
    val perms = listOf(
      Manifest.permission.BODY_SENSORS,
      Manifest.permission.ACTIVITY_RECOGNITION,
      Manifest.permission.ACCESS_FINE_LOCATION,
      Manifest.permission.ACCESS_COARSE_LOCATION
    ).filter {
      ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
    }
    if (perms.isNotEmpty()) {
      ActivityCompat.requestPermissions(this, perms.toTypedArray(), 1001)
    }
  }
}

/**
 * Root Wear OS Material 3 Expressive container: single [AppScaffold] hosting either
 * the modal [SleepDetailPage] or the [HorizontalPagerScaffold] deck of enabled watch pages.
 */
@Composable
fun SparkyWearRoot(sessionManager: WearSessionManager) {
  val enabledPages by sessionManager.checkInStore.enabledPages.collectAsState()
  val requestedPage by sessionManager.requestedPage.collectAsState()
  val showSleepDetail by sessionManager.showSleepDetail.collectAsState()
  val pages = if (enabledPages.isNotEmpty()) enabledPages else WatchPage.defaultOrder

  BackHandler(enabled = showSleepDetail) {
    sessionManager.dismissSleepDetail()
  }

  val pagerState = rememberPagerState(
    initialPage = 0,
    pageCount = { pages.size }
  )

  LaunchedEffect(requestedPage, pages) {
    val rawTarget = requestedPage ?: return@LaunchedEffect
    val target = CheckInStore.resolveNavigationPage(rawTarget, pages)
    val idx = pages.indexOf(target)
    if (idx >= 0) {
      pagerState.scrollToPage(idx)
    }
    sessionManager.consumeRequestedPage()
  }

  AppScaffold(
    modifier = Modifier
      .fillMaxSize()
      .background(Color.Black)
  ) {
    if (showSleepDetail) {
      SleepDetailPage(
        store = sessionManager.checkInStore,
        onDismiss = { sessionManager.dismissSleepDetail() }
      )
    } else {
      HorizontalPagerScaffold(pagerState = pagerState) {
        HorizontalPager(
          state = pagerState,
          modifier = Modifier.fillMaxSize(),
          flingBehavior = PagerDefaults.snapFlingBehavior(
            state = pagerState,
            maxFlingPages = 1,
            snapPositionalThreshold = PagerScaffoldDefaults.HighSnapPositionalThreshold,
            snapAnimationSpec = MaterialTheme.motionScheme.defaultSpatialSpec()
          ),
          rotaryScrollableBehavior = null
        ) { pageIdx ->
          AnimatedPage(pageIndex = pageIdx, pagerState = pagerState) {
            val isCurrentPage = pagerState.currentPage == pageIdx && !pagerState.isScrollInProgress
            when (pages.getOrElse(pageIdx) { WatchPage.GOALS }) {
              WatchPage.GOALS -> GoalsSummaryPage(store = sessionManager.checkInStore, isCurrentPage = isCurrentPage)
              WatchPage.WATER -> WaterPage(store = sessionManager.checkInStore, isCurrentPage = isCurrentPage)
              WatchPage.MEDICATIONS -> MedicationListPage(store = sessionManager.checkInStore, isCurrentPage = isCurrentPage)
              WatchPage.ENTRY -> WeightEntryPage(store = sessionManager.checkInStore, isCurrentPage = isCurrentPage)
              WatchPage.TREND -> TrendChartPage(store = sessionManager.checkInStore, isCurrentPage = isCurrentPage)
              WatchPage.WORKOUT -> WorkoutContainerPage(
                checkInStore = sessionManager.checkInStore,
                workoutStore = sessionManager.workoutStore,
                recordingStore = sessionManager.recordingStore,
                runStore = sessionManager.runStore,
                isCurrentPage = isCurrentPage
              )
              WatchPage.NOW_PLAYING -> NowPlayingPage(
                store = sessionManager.mediaStore,
                isCurrentPage = isCurrentPage
              )
              WatchPage.FASTING -> FastingPage(store = sessionManager.checkInStore, isCurrentPage = isCurrentPage)
              WatchPage.STEPS -> StepsPage(store = sessionManager.checkInStore, isCurrentPage = isCurrentPage)
            }
          }
        }
      }
    }
  }
}
