package com.sparkyapps.sparkyfitness.wear

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import androidx.core.content.ContextCompat
import com.SparkyApps.SparkyFitnessMobile.R
import com.google.android.gms.wearable.Asset
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMap
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import java.util.concurrent.atomic.AtomicLong
import org.json.JSONArray
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.util.UUID

class WearSessionManager private constructor(private val appContext: Context) :
  WearSessionTransport {

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

  val checkInStore = CheckInStore(appContext)
  val workoutStore = WorkoutSessionStore(appContext)
  val recordingStore = RecordingStore()
  val runStore = WatchRunStore(appContext)
  val demoStore = ExerciseDemoStore(appContext)
  val mediaStore = MediaControlStore(appContext)
  val customComplicationStore = CustomComplicationStore(appContext)
  val sensorsController = WatchSensorsController(appContext, this)

  private val _requestedPage = MutableStateFlow<WatchPage?>(null)
  val requestedPage: StateFlow<WatchPage?> = _requestedPage.asStateFlow()

  private val _showSleepDetail = MutableStateFlow(false)
  val showSleepDetail: StateFlow<Boolean> = _showSleepDetail.asStateFlow()

  private var telemetryOwner: String = "watch"
  private val seenCommandKeys = LinkedHashSet<String>()
  private val lastContextRequestMs = AtomicLong(0L)
  private val lastDirectRefreshMs = AtomicLong(0L)
  private val outboundSeq = AtomicLong(0L)
  private val refreshRequestSeq = AtomicLong(0L)
  private val lastAppliedRefreshSeq = AtomicLong(0L)
  private var revocationPersistRetryJob: Job? = null
  private val waterReconcileLock = Any()
  private var pendingWaterReconcileState = PendingWaterReconcileState()
  private var pendingWaterReconcileJob: Job? = null

  internal data class PendingWaterReconcileState(
    val ownerId: String? = null,
    val accountGen: Long = 0L,
    val retryCount: Int = 0
  ) {
    val isPending: Boolean get() = !ownerId.isNullOrEmpty() && accountGen > 0L
  }

  private sealed interface OutboundOp {
    data class Send(
      val payload: JSONObject,
      val queueType: String,
      val queueKey: String,
      val enqueuedGeneration: Long,
      val opToken: Long,
      val onResult: ((Boolean) -> Unit)? = null
    ) : OutboundOp

    data class ClearQueued(val retiredThroughGeneration: Long) : OutboundOp
  }

  internal data class PendingWorkoutRecovery(
    val ownerId: String,
    val presetId: String,
    val sessionId: String,
    val accountGen: Long,
    val deliveredToPhone: Boolean = false
  )

  internal enum class CancelledWaterTapAction {
    APPLY_NORMALLY,
    COMPENSATE_DELETE,
    RECONCILE_VIA_REFRESH
  }

  internal enum class WorkoutRecoveryUpdateResult {
    UPDATED,
    NOT_FOUND,
    COMMIT_FAILED
  }

  internal data class MainDirectOutcomeDecision(
    val shouldApplyOnMain: Boolean,
    val postAction: CancelledWaterTapAction
  )

  private val directOutboundChannel = Channel<OutboundOp.Send>(Channel.UNLIMITED)
  private val bridgeOutboundChannel = Channel<OutboundOp>(Channel.UNLIMITED)
  private val dataLayerQueueMutex = Mutex()
  private val inFlightTracker = InFlightClientTracker()
  private val workoutRecoveryPrefs by lazy {
    appContext.getSharedPreferences(WORKOUT_RECOVERY_PREFS, Context.MODE_PRIVATE)
  }
  private val workoutRecoveryLock = Any()

  override fun isClientIdInFlight(clientId: String): Boolean =
    inFlightTracker.isInFlight(clientId)

  private fun enqueueOutboundSend(
    payload: JSONObject,
    queueType: String,
    queueKey: String,
    onResult: ((Boolean) -> Unit)? = null
  ) {
    val clientId = payload.optString("clientId", "")
    val enqueuedGen = checkInStore.currentAccountGeneration()
    val opToken = outboundSeq.incrementAndGet()
    inFlightTracker.register(clientId, opToken, enqueuedGen)
    val op = OutboundOp.Send(
      payload = payload,
      queueType = queueType,
      queueKey = queueKey,
      enqueuedGeneration = enqueuedGen,
      opToken = opToken,
      onResult = onResult
    )
    val type = payload.optString("type", "")
    val sent = if (DIRECT_HTTP_TYPES.contains(type)) {
      directOutboundChannel.trySend(op).isSuccess
    } else {
      bridgeOutboundChannel.trySend(op).isSuccess
    }
    if (!sent) {
      inFlightTracker.release(clientId, opToken)
    }
  }

  private fun firstTime(key: String?): Boolean {
    if (key.isNullOrEmpty()) return true
    if (!seenCommandKeys.add(key)) return false
    if (seenCommandKeys.size > 200) {
      seenCommandKeys.remove(seenCommandKeys.first())
    }
    return true
  }

  init {
    Haptics.init(appContext)
    Haptics.hapticsEnabledProvider = { checkInStore.watchContext.value.effectiveHapticsEnabled }
    Haptics.restBuzzEnabledProvider = { checkInStore.watchContext.value.effectiveRestBuzzEnabled }
    checkInStore.session = this
    workoutStore.session = this
    workoutStore.sensors = sensorsController
    workoutStore.checkInStore = checkInStore
    workoutStore.demoStore = demoStore
    recordingStore.session = this
    recordingStore.sensors = sensorsController
    recordingStore.checkInStore = checkInStore
    runStore.session = this
    runStore.sensors = sensorsController
    runStore.checkInStore = checkInStore
    mediaStore.session = this

    sensorsController.startPassiveStepCounter { stepsToday ->
      checkInStore.updateLiveSteps(stepsToday)
    }
    startOutboundWorker()
    pullInitialDataItems()
  }

  private fun startOutboundWorker() {
    // Direct Watch -> Server HTTP worker for supported health/diary writes only.
    scope.launch(Dispatchers.IO) {
      for (op in directOutboundChannel) {
        val clientId = op.payload.optString("clientId", "")
        val payloadOwner = op.payload.optString("ownerId", "")
        val opGen = op.enqueuedGeneration
        try {
          if (checkInStore.currentAccountGeneration() != opGen) {
            op.onResult?.invoke(false)
            continue
          }
          val activeTimeFormat = checkInStore.watchContext.value.timeFormat
          val payloadType = op.payload.optString("type", "")
          if (payloadType == "waterIntake") {
            if (isWaterIntakePayloadExpired(op.payload.optString("entryDate", ""), CheckInDate.today())) {
              if (clientId.isNotEmpty()) {
                checkInStore.consumeWaterTapCancelled(clientId)
              }
              op.onResult?.invoke(false)
              continue
            }
            if (clientId.isNotEmpty() && checkInStore.consumeWaterTapCancelled(clientId)) {
              op.onResult?.invoke(false)
              continue
            }
          }
          val isFastOp = payloadType == "fastStart" || payloadType == "fastEnd"
          val holdDependentFastOp = shouldHoldDependentFastOp(
            payloadType = payloadType,
            hasEarlierUnsettledOp = isFastOp &&
              checkInStore.hasEarlierUnsettledFastOp(ownerId = payloadOwner, clientId = clientId)
          )
          if (holdDependentFastOp) {
            op.onResult?.invoke(false)
            continue
          }
          val direct = WearDirectApiClient.executeOutbound(
            context = appContext,
            payload = op.payload,
            timeFormat = activeTimeFormat,
            isAccountActive = { checkInStore.currentAccountGeneration() == opGen }
          )
          when (direct) {
            is DirectWriteOutcome.Applied -> {
              if (checkInStore.currentAccountGeneration() != opGen || payloadOwner.isEmpty()) {
                op.onResult?.invoke(false)
              } else {
                val mainDecision = withContext(Dispatchers.Main.immediate) {
                  val accountMatches = checkInStore.currentAccountGeneration() == opGen &&
                    checkInStore.activeOwnerId() == payloadOwner
                  val cancelledOnMain = accountMatches &&
                    payloadType == "waterIntake" &&
                    clientId.isNotEmpty() &&
                    checkInStore.consumeWaterTapCancelled(clientId)
                  val decision = decideMainDirectOutcome(
                    accountMatchesOnMain = accountMatches,
                    isWaterIntake = payloadType == "waterIntake",
                    wasCancelledOnMain = cancelledOnMain,
                    createdEntryId = direct.createdWaterEntryId
                  )
                  if (decision?.shouldApplyOnMain == true) {
                    checkInStore.applyDirectWriteOutcome(clientId, direct)
                  }
                  decision
                }
                when (mainDecision?.postAction) {
                  null -> {
                    op.onResult?.invoke(false)
                  }
                  CancelledWaterTapAction.COMPENSATE_DELETE -> {
                    val createdId = direct.createdWaterEntryId!!
                    val undoClientId = UUID.randomUUID().toString()
                    val undoPayload = OutboundPayloads.waterDelete(
                      clientId = undoClientId,
                      entryId = createdId,
                      ownerId = payloadOwner
                    )
                    val undoOutcome = WearDirectApiClient.executeOutbound(
                      context = appContext,
                      payload = undoPayload,
                      timeFormat = activeTimeFormat,
                      isAccountActive = { checkInStore.currentAccountGeneration() == opGen }
                    )
                    when (undoOutcome) {
                      is DirectWriteOutcome.Applied -> {
                        var undoApplied = false
                        withContext(Dispatchers.Main.immediate) {
                          if (
                            checkInStore.currentAccountGeneration() == opGen &&
                            checkInStore.activeOwnerId() == payloadOwner
                          ) {
                            checkInStore.applyDirectWriteOutcome(undoClientId, undoOutcome)
                            undoApplied = true
                          }
                        }
                        if (undoApplied) {
                          val syncNotice = buildDirectSyncNotice(
                            domain = undoOutcome.syncedDomain,
                            ownerId = payloadOwner,
                            entryDate = null,
                            clientId = undoClientId
                          )
                          val sentLive = sendLiveMessage(syncNotice)
                          if (!sentLive && checkInStore.currentAccountGeneration() == opGen) {
                            enqueueDataItem(
                              type = "watchDirectSynced",
                              key = "${opGen}_${undoOutcome.syncedDomain}_$undoClientId",
                              payload = syncNotice,
                              accountGen = opGen
                            )
                          }
                        }
                      }
                      DirectWriteOutcome.FallbackToPhone -> {
                        if (checkInStore.currentAccountGeneration() == opGen) {
                          val live = sendLiveMessage(undoPayload)
                          if (!live && checkInStore.currentAccountGeneration() == opGen) {
                            enqueueDataItem("waterDelete", undoClientId, undoPayload, opGen)
                          }
                        }
                        refreshLiveFromServerThrottled(force = true)
                      }
                      is DirectWriteOutcome.Rejected -> {
                        refreshLiveFromServerThrottled(force = true)
                      }
                    }
                    op.onResult?.invoke(false)
                  }
                  CancelledWaterTapAction.RECONCILE_VIA_REFRESH -> {
                    val syncEntryDate = direct.entryDate?.takeIf {
                      it.isNotEmpty() && direct.deletedWaterEntryId == null
                    }
                    val syncNotice = buildDirectSyncNotice(
                      domain = direct.syncedDomain,
                      ownerId = payloadOwner,
                      entryDate = syncEntryDate,
                      clientId = clientId,
                      fastStartOutcome = direct.fastStartOutcome
                    )
                    val sentLive = sendLiveMessage(syncNotice)
                    if (!sentLive && checkInStore.currentAccountGeneration() == opGen) {
                      val keySuffix = clientId.ifEmpty { syncEntryDate ?: "latest" }
                      enqueueDataItem(
                        type = "watchDirectSynced",
                        key = "${opGen}_${direct.syncedDomain}_$keySuffix",
                        payload = syncNotice,
                        accountGen = opGen
                      )
                    }
                    refreshLiveFromServerThrottled(force = true)
                    op.onResult?.invoke(false)
                  }
                  CancelledWaterTapAction.APPLY_NORMALLY -> {
                    op.onResult?.invoke(true)
                    val syncEntryDate = direct.entryDate?.takeIf {
                      it.isNotEmpty() && direct.deletedWaterEntryId == null
                    }
                    val syncNotice = buildDirectSyncNotice(
                      domain = direct.syncedDomain,
                      ownerId = payloadOwner,
                      entryDate = syncEntryDate,
                      clientId = clientId,
                      fastStartOutcome = direct.fastStartOutcome
                    )
                    val sentLive = sendLiveMessage(syncNotice)
                    if (!sentLive && checkInStore.currentAccountGeneration() == opGen) {
                      val keySuffix = clientId.ifEmpty { syncEntryDate ?: "latest" }
                      enqueueDataItem(
                        type = "watchDirectSynced",
                        key = "${opGen}_${direct.syncedDomain}_$keySuffix",
                        payload = syncNotice,
                        accountGen = opGen
                      )
                    }
                  }
                }
              }
            }
            is DirectWriteOutcome.Rejected -> {
              if (payloadType == "waterIntake" && clientId.isNotEmpty()) {
                checkInStore.consumeWaterTapCancelled(clientId)
              }
              if (clientId.isNotEmpty() && payloadOwner.isNotEmpty()) {
                withContext(Dispatchers.Main.immediate) {
                  if (
                    checkInStore.currentAccountGeneration() == opGen &&
                    checkInStore.activeOwnerId() == payloadOwner
                  ) {
                    checkInStore.revertDirectRejection(clientId)
                  }
                }
              }
              op.onResult?.invoke(false)
            }
            DirectWriteOutcome.FallbackToPhone -> {
              val waterExpired = payloadType == "waterIntake" &&
                isWaterIntakePayloadExpired(op.payload.optString("entryDate", ""), CheckInDate.today())
              if (waterExpired) {
                if (clientId.isNotEmpty()) {
                  checkInStore.consumeWaterTapCancelled(clientId)
                }
                op.onResult?.invoke(false)
              } else {
                val cancelledOnMain = if (payloadType == "waterIntake" && clientId.isNotEmpty()) {
                  withContext(Dispatchers.Main.immediate) {
                    checkInStore.consumeWaterTapCancelled(clientId)
                  }
                } else {
                  false
                }
                if (cancelledOnMain) {
                  refreshLiveFromServerThrottled(force = true)
                  op.onResult?.invoke(false)
                } else if (checkInStore.currentAccountGeneration() != opGen) {
                  op.onResult?.invoke(false)
                } else {
                  val live = sendLiveMessage(op.payload)
                  if (!live && checkInStore.currentAccountGeneration() == opGen) {
                    enqueueDataItem(op.queueType, op.queueKey, op.payload, opGen)
                  }
                  op.onResult?.invoke(live)
                }
              }
            }
          }
        } finally {
          inFlightTracker.release(clientId, op.opToken)
        }
      }
    }

    // Non-blocking phone-bridge worker for workout telemetry, set logs, runs, and queue clears.
    scope.launch(Dispatchers.IO) {
      for (op in bridgeOutboundChannel) {
        when (op) {
          is OutboundOp.Send -> {
            val clientId = op.payload.optString("clientId", "")
            val opGen = op.enqueuedGeneration
            try {
              if (checkInStore.currentAccountGeneration() != opGen) {
                op.onResult?.invoke(false)
              } else {
                val live = sendLiveMessage(op.payload)
                if (!live && checkInStore.currentAccountGeneration() == opGen) {
                  enqueueDataItem(op.queueType, op.queueKey, op.payload, opGen)
                }
                op.onResult?.invoke(live)
              }
            } finally {
              inFlightTracker.release(clientId, op.opToken)
            }
          }
          is OutboundOp.ClearQueued -> {
            inFlightTracker.clearRetired(op.retiredThroughGeneration)
            dataLayerQueueMutex.withLock {
              try {
                val dataClient = Wearable.getDataClient(appContext)
                val items = dataClient.getDataItems(
                  android.net.Uri.parse("wear://*$PREFIX_WATCH_TO_PHONE"),
                  DataClient.FILTER_PREFIX
                ).await()
                val urisToDelete = mutableListOf<android.net.Uri>()
                try {
                  for (item in items) {
                    val itemGen = DataMapItem.fromDataItem(item).dataMap.getLong("watchAccountGen", 0L)
                    if (itemGen <= op.retiredThroughGeneration) {
                      urisToDelete.add(item.uri)
                    }
                  }
                } finally {
                  items.release()
                }
                for (uri in urisToDelete) {
                  try {
                    dataClient.deleteDataItems(uri, DataClient.FILTER_LITERAL).await()
                  } catch (_: Throwable) {}
                }
              } catch (_: Throwable) {}
            }
          }
        }
      }
    }
  }

  private val inFlightLiveRefreshLock = Any()
  private var inFlightLiveRefresh: CompletableDeferred<Unit>? = null

  /**
   * Coalesces midnight/stale complication wakes so multiple simultaneous callers
   * share one direct Wear → Server refresh batch and await up to [timeoutMs].
   */
  suspend fun refreshLiveFromServerIfStale(timeoutMs: Long = 3_500L) {
    val ownerId = checkInStore.activeOwnerId()?.takeIf { it.isNotEmpty() } ?: return
    val nutritionToday = checkInStore.nutrition.value?.isToday == true
    val waterToday = checkInStore.water.value?.isToday == true
    if (nutritionToday && waterToday) return
    refreshLiveFromServerThrottled(force = false)
    val pending = synchronized(inFlightLiveRefreshLock) { inFlightLiveRefresh } ?: return
    withTimeoutOrNull(timeoutMs) {
      pending.await()
    }
  }

  /**
   * Refreshes today's water, nutrition, medications, weight/body-fat history, and active
   * fast directly from the SparkyFitness server when credentials are available.
   */
  override fun refreshLiveFromServerThrottled(force: Boolean) {
    val now = SystemClock.elapsedRealtime().coerceAtLeast(1L)
    val prev = lastDirectRefreshMs.get()
    if (!force && prev != 0L && now - prev < 8_000L) return
    if (!force && !lastDirectRefreshMs.compareAndSet(prev, now)) return
    if (force) lastDirectRefreshMs.set(now)

    val reqSeq = refreshRequestSeq.incrementAndGet()
    val startGen = checkInStore.currentAccountGeneration()
    val startRev = checkInStore.currentMutationRevision()
    val refreshDone = CompletableDeferred<Unit>()
    synchronized(inFlightLiveRefreshLock) {
      inFlightLiveRefresh = refreshDone
    }
    scope.launch(Dispatchers.IO) {
      try {
        val ownerId = checkInStore.activeOwnerId()?.takeIf { it.isNotEmpty() } ?: run {
          refreshDone.complete(Unit)
          return@launch
        }
        val today = CheckInDate.today()
        val waterUnit = checkInStore.waterDisplayUnit.value
        val timeFormat = checkInStore.watchContext.value.timeFormat
        val medicationsOff = checkInStore.watchContext.value.isFeatureOff("medications")
        val existingMeds = if (medicationsOff) null else checkInStore.currentBaseMedications()
        val existingNutrition = checkInStore.currentBaseNutrition()
        val existingWater = checkInStore.currentBaseWater()
        val snapshot = WearDirectApiClient.fetchLiveRefresh(
          context = appContext,
          ownerId = ownerId,
          today = today,
          waterDisplayUnit = waterUnit,
          existingMedications = existingMeds,
          includeMedications = !medicationsOff,
          timeFormat = timeFormat,
          existingNutrition = existingNutrition,
          existingWater = existingWater,
          isAccountActive = {
            checkInStore.currentAccountGeneration() == startGen &&
              checkInStore.activeOwnerId() == ownerId
          }
        )
        if (snapshot == null) {
          scope.launch {
            try {
              val currentGen = checkInStore.currentAccountGeneration()
              val activeOwner = checkInStore.activeOwnerId()
              val sameAccountAndOwner = startGen == currentGen && activeOwner == ownerId
              val wasRequiredReconcile = force || isPendingWaterReconcileFor(ownerId, startGen)
              if (
                shouldRetryPendingWaterReconcileOnNullOrPartial(
                  wasRequiredReconcile = wasRequiredReconcile,
                  sameAccountAndOwner = sameAccountAndOwner,
                  isCredSessionCurrent = true,
                  snapshotIsNull = true,
                  snapshotSuppliedWater = false
                )
              ) {
                scheduleCoalescedWaterReconcile(ownerId, startGen, useBackoff = true)
              }
            } finally {
              refreshDone.complete(Unit)
            }
          }
          return@launch
        }
        scope.launch {
          try {
            val currentGen = checkInStore.currentAccountGeneration()
            val currentRev = checkInStore.currentMutationRevision()
            val activeOwner = checkInStore.activeOwnerId()
            val currentCredWriteId = WearServerCredentialsStore.currentWriteId(appContext)
            val credCurrent = snapshot.credentialWriteId <= 0L ||
              WearServerCredentialsStore.isWriteIdCurrent(appContext, ownerId, snapshot.credentialWriteId)
            val canApply = shouldApplyLiveRefresh(
              startGen = startGen,
              currentGen = currentGen,
              startRev = startRev,
              currentRev = currentRev,
              expectedOwnerId = ownerId,
              activeOwnerId = activeOwner,
              snapshotOwnerId = snapshot.ownerId,
              snapshotCredWriteId = snapshot.credentialWriteId,
              currentCredWriteId = currentCredWriteId,
              isCredSessionCurrent = credCurrent
            )
            val sameAccountAndOwner = startGen == currentGen &&
              activeOwner == ownerId &&
              snapshot.ownerId == ownerId
            val wasRequiredReconcile = force || isPendingWaterReconcileFor(ownerId, startGen)
            val snapshotSuppliedWater = snapshot.waterConsumedMl != null && snapshot.waterLog != null
            if (canApply && tryAdvanceRefreshSeq(lastAppliedRefreshSeq, reqSeq)) {
              checkInStore.applyDirectServerRefresh(snapshot)
              if (snapshotSuppliedWater) {
                clearPendingWaterReconcileIfMatches(ownerId, startGen)
              } else if (
                shouldRetryPendingWaterReconcileOnNullOrPartial(
                  wasRequiredReconcile = wasRequiredReconcile,
                  sameAccountAndOwner = sameAccountAndOwner,
                  isCredSessionCurrent = credCurrent,
                  snapshotIsNull = false,
                  snapshotSuppliedWater = false
                )
              ) {
                scheduleCoalescedWaterReconcile(ownerId, startGen, useBackoff = true)
              }
            } else {
              val discardedByMutationRevision = sameAccountAndOwner && credCurrent && startRev != currentRev
              if (
                shouldScheduleReplacementWaterReconcile(
                  wasRequiredReconcile = wasRequiredReconcile,
                  sameAccountAndOwner = sameAccountAndOwner,
                  isCredSessionCurrent = credCurrent,
                  discardedByMutationRevision = discardedByMutationRevision
                )
              ) {
                scheduleCoalescedWaterReconcile(ownerId, startGen, useBackoff = false)
              }
            }
          } finally {
            refreshDone.complete(Unit)
          }
        }
      } catch (t: Throwable) {
        refreshDone.complete(Unit)
        throw t
      }
    }
  }

  private fun isPendingWaterReconcileFor(ownerId: String, accountGen: Long): Boolean = synchronized(waterReconcileLock) {
    pendingWaterReconcileState.ownerId == ownerId && pendingWaterReconcileState.accountGen == accountGen
  }

  private fun clearPendingWaterReconcileIfMatches(ownerId: String, accountGen: Long) {
    val jobToCancel = synchronized(waterReconcileLock) {
      val next = clearPendingWaterReconcileOnComplete(pendingWaterReconcileState, ownerId, accountGen)
      if (next == pendingWaterReconcileState) {
        null
      } else {
        pendingWaterReconcileState = next
        val j = pendingWaterReconcileJob
        pendingWaterReconcileJob = null
        j
      }
    }
    jobToCancel?.cancel()
  }

  private fun clearRetiredPendingWaterReconcile(retiredThroughGeneration: Long) {
    val jobToCancel = synchronized(waterReconcileLock) {
      val next = clearPendingWaterReconcileOnAccountRetirement(pendingWaterReconcileState, retiredThroughGeneration)
      if (next == pendingWaterReconcileState) {
        null
      } else {
        pendingWaterReconcileState = next
        val j = pendingWaterReconcileJob
        pendingWaterReconcileJob = null
        j
      }
    }
    jobToCancel?.cancel()
  }

  private fun scheduleCoalescedWaterReconcile(
    ownerId: String,
    accountGen: Long,
    useBackoff: Boolean = false
  ) {
    val (shouldLaunch, delayMs) = synchronized(waterReconcileLock) {
      val maxRetries = if (useBackoff) MAX_WATER_RECONCILE_BACKOFF_RETRIES else MAX_WATER_RECONCILE_RETRIES
      val (nextState, scheduled) = recordPendingWaterReconcile(
        current = pendingWaterReconcileState,
        ownerId = ownerId,
        accountGen = accountGen,
        maxRetries = maxRetries
      )
      pendingWaterReconcileState = nextState
      val waitMs = if (useBackoff) {
        waterReconcileBackoffDelayMs(nextState.retryCount)
      } else {
        WATER_RECONCILE_RETRY_DELAY_MS
      }
      (scheduled && pendingWaterReconcileJob?.isActive != true) to waitMs
    }
    if (!shouldLaunch) return
    val job = scope.launch {
      delay(delayMs)
      val activeForTarget = synchronized(waterReconcileLock) {
        pendingWaterReconcileJob = null
        pendingWaterReconcileState.ownerId == ownerId &&
          pendingWaterReconcileState.accountGen == accountGen
      }
      if (
        activeForTarget &&
        checkInStore.currentAccountGeneration() == accountGen &&
        checkInStore.activeOwnerId() == ownerId
      ) {
        refreshLiveFromServerThrottled(force = true)
      }
    }
    synchronized(waterReconcileLock) {
      if (pendingWaterReconcileState.ownerId == ownerId && pendingWaterReconcileState.accountGen == accountGen) {
        pendingWaterReconcileJob = job
      } else {
        job.cancel()
      }
    }
  }

  /**
   * Transitions to the target [WatchPage] and dismisses any active sleep detail overlay.
   */
  fun requestNavigateTo(page: WatchPage) {
    _showSleepDetail.value = false
    _requestedPage.value = page
  }

  /**
   * Clears the pending page navigation request once the pager has scrolled to it.
   */
  fun consumeRequestedPage() {
    _requestedPage.value = null
  }

  /**
   * Opens the sleep health detail overlay and clears any pending page navigation.
   */
  fun requestSleepDetail() {
    _requestedPage.value = null
    _showSleepDetail.value = true
  }

  /**
   * Closes the sleep health detail overlay.
   */
  fun dismissSleepDetail() {
    _showSleepDetail.value = false
  }

  /**
   * Requests a fresh context push from the phone, throttled to at most once every 15 seconds.
   */
  fun requestContextFromPhoneThrottled() {
    val now = SystemClock.elapsedRealtime().coerceAtLeast(1L)
    val prev = lastContextRequestMs.get()
    if (prev != 0L && now - prev < 15_000L) return
    if (!lastContextRequestMs.compareAndSet(prev, now)) return
    pullInitialDataItems()
  }

  /**
   * Reads persisted DataClient context and queued transfers and requests a live context refresh from the phone.
   */
  fun pullInitialDataItems() {
    val requestStartedAt = SystemClock.elapsedRealtime().coerceAtLeast(1L)
    lastContextRequestMs.set(requestStartedAt)
    scope.launch {
      checkInStore.pruneStaleDayData()
    }
    scope.launch(Dispatchers.IO) {
      try {
        val dataItems = Wearable.getDataClient(appContext).dataItems.await()
        for (item in dataItems) {
          val path = item.uri.path ?: continue
          if (
            path == PATH_CONTEXT ||
            path == PATH_COMPLICATION_CONFIG ||
            path == PATH_CREDENTIALS ||
            path == PATH_REVOCATION
          ) {
            val dataMap = DataMapItem.fromDataItem(item).dataMap
            val raw = dataMap.getString("json") ?: continue
            handleIncomingPayloadString(raw)
          } else if (path.startsWith(PREFIX_PHONE_TO_WATCH_EXERCISE_IMAGE)) {
            val dataMap = DataMapItem.fromDataItem(item).dataMap
            val key = dataMap.getString("key")
            val index = dataMap.getInt("index", -1)
            val validTarget = !key.isNullOrEmpty() && index in 0..ExerciseDemoFiles.MAX_INDEX
            val gen = demoStore.currentGeneration()
            val asset = dataMap.getAsset("asset")
            val bytes = if (validTarget) readExerciseImageBytes(dataMap) else null
            if (validTarget && bytes == null && asset != null) continue
            if (validTarget && bytes != null) {
              demoStore.receive(key!!, index, bytes, workoutStore.activeDemoKeys(), expectedGeneration = gen)
            }
            Wearable.getDataClient(appContext).deleteDataItems(item.uri).await()
          } else if (path.startsWith(PREFIX_PHONE_TO_WATCH)) {
            val dataMap = DataMapItem.fromDataItem(item).dataMap
            val raw = dataMap.getString("json")
            if (raw != null) handleIncomingPayloadString(raw)
            Wearable.getDataClient(appContext).deleteDataItems(item.uri).await()
          }
        }
        dataItems.release()
      } catch (_: Throwable) {}
      withContext(Dispatchers.Main.immediate) {
        if (shouldResendQueuedOnStartup(checkInStore.activeOwnerId())) {
          checkInStore.resendQueued()
        }
      }
      replayPendingWorkoutRecoveries()
      refreshLiveFromServerThrottled()
      try {
        val needsCredentials = WearServerCredentialsStore.load(appContext, checkInStore.activeOwnerId()) == null
        if (!sendLiveMessage(OutboundPayloads.contextRequest(needsCredentials = needsCredentials))) {
          lastContextRequestMs.compareAndSet(requestStartedAt, 0L)
        }
      } catch (_: Throwable) {
        lastContextRequestMs.compareAndSet(requestStartedAt, 0L)
      }
    }
  }

  private suspend fun readExerciseImageBytes(dataMap: DataMap): ByteArray? {
    dataMap.getByteArray("data")?.let { return it }
    val asset = dataMap.getAsset("asset") ?: return null
    return readAssetBytes(asset)
  }

  private suspend fun readAssetBytes(asset: Asset): ByteArray? {
    return try {
      val response = Wearable.getDataClient(appContext).getFdForAsset(asset).await()
      try {
        response.inputStream?.use { it.readBytes() }
      } finally {
        response.release()
      }
    } catch (_: Throwable) {
      null
    }
  }

  fun onMessageReceived(event: MessageEvent) {
    val raw = String(event.data, StandardCharsets.UTF_8)
    handleIncomingPayloadString(raw)
  }

  private enum class DataItemExistence {
    PRESENT,
    ABSENT,
    LOOKUP_FAILED
  }

  fun onDataChanged(events: DataEventBuffer) {
    for (event in events) {
      val item = event.dataItem
      val path = item.uri.path ?: continue
      if (event.type == DataEvent.TYPE_DELETED && shouldHandleDeletedDataPath(path)) {
        val uri = item.uri
        val isContextDelete = path == PATH_CONTEXT
        val deletedItemCtxGen = runCatching {
          DataMapItem.fromDataItem(item).dataMap.getString("json")?.let { raw ->
            JSONObject(raw).optLong("generation", 0L).takeIf { it > 0L }
          }
        }.getOrNull() ?: 0L
        val genAtEvent = checkInStore.currentAccountGeneration()
        val ctxGenAtEvent = checkInStore.currentAcceptedContextGeneration()
        val deletedContextGen = deletedItemCtxGen
        val ctxSeqAtEvent = checkInStore.currentAcceptedContextSeq()
        val credGenAtEvent = WearServerCredentialsStore.lastGeneration(appContext)
        val credWriteIdAtEvent = WearServerCredentialsStore.currentWriteId(appContext)
        scope.launch(Dispatchers.IO) {
          val existence = try {
            val existing = Wearable.getDataClient(appContext).getDataItems(uri, DataClient.FILTER_LITERAL).await()
            try {
              if (existing.count > 0) DataItemExistence.PRESENT else DataItemExistence.ABSENT
            } finally {
              existing.release()
            }
          } catch (_: Throwable) {
            DataItemExistence.LOOKUP_FAILED
          }
          if (existence != DataItemExistence.ABSENT) return@launch
          if (
            isStaleDeleteEvent(
              genAtEvent = genAtEvent,
              currentGen = checkInStore.currentAccountGeneration(),
              ctxGenAtEvent = ctxGenAtEvent,
              currentCtxGen = checkInStore.currentAcceptedContextGeneration(),
              ctxSeqAtEvent = ctxSeqAtEvent,
              currentCtxSeq = checkInStore.currentAcceptedContextSeq(),
              credGenAtEvent = credGenAtEvent,
              currentCredGen = WearServerCredentialsStore.lastGeneration(appContext),
              credWriteIdAtEvent = credWriteIdAtEvent,
              currentCredWriteId = WearServerCredentialsStore.currentWriteId(appContext),
              isContextDelete = isContextDelete
            )
          ) {
            return@launch
          }
          if (isContextDelete) {
            val (shouldRevoke, revGen) = resolveContextDeleteRevocationGeneration(
              deletedContextGen = deletedContextGen,
              currentCredGen = WearServerCredentialsStore.lastGeneration(appContext)
            )
            if (!shouldRevoke) return@launch
            val result = WearServerCredentialsStore.tryClearForRevocation(
              context = appContext,
              generation = revGen,
              activeContextGeneration = checkInStore.currentAcceptedContextGeneration(),
              expectedWriteId = credWriteIdAtEvent
            )
            if (result.accepted) {
              if (!result.persisted) scheduleRevocationPersistRetry(result)
              scope.launch {
                if (
                  checkInStore.currentAccountGeneration() != genAtEvent ||
                  checkInStore.currentAcceptedContextGeneration() > ctxGenAtEvent ||
                  checkInStore.currentAcceptedContextSeq() != ctxSeqAtEvent
                ) {
                  return@launch
                }
                val retiredGen = checkInStore.clearAccountState(
                  newOwnerId = null,
                  expectedCredentialWriteId = result.targetWriteId
                )
                demoStore.clear()
                clearQueuedWatchTransfers(retiredThroughGeneration = retiredGen)
              }
            }
          }
        }
        continue
      }
      if (event.type != DataEvent.TYPE_CHANGED) continue
      if (
        path == PATH_CONTEXT ||
        path == PATH_COMPLICATION_CONFIG ||
        path == PATH_CREDENTIALS ||
        path == PATH_REVOCATION
      ) {
        val raw = DataMapItem.fromDataItem(item).dataMap.getString("json") ?: continue
        handleIncomingPayloadString(raw)
      } else if (path.startsWith(PREFIX_PHONE_TO_WATCH_EXERCISE_IMAGE)) {
        val dataMap = DataMapItem.fromDataItem(item).dataMap
        val key = dataMap.getString("key")
        val index = dataMap.getInt("index", -1)
        val validTarget = !key.isNullOrEmpty() && index in 0..ExerciseDemoFiles.MAX_INDEX
        val inlineBytes = dataMap.getByteArray("data")
        val asset = dataMap.getAsset("asset")
        val gen = demoStore.currentGeneration()
        val uri = item.uri
        scope.launch(Dispatchers.IO) {
          val bytes = if (validTarget) inlineBytes ?: asset?.let { readAssetBytes(it) } else null
          if (validTarget && bytes == null && asset != null) return@launch
          if (validTarget && bytes != null) {
            demoStore.receive(key!!, index, bytes, workoutStore.activeDemoKeys(), expectedGeneration = gen)
          }
          try {
            Wearable.getDataClient(appContext).deleteDataItems(uri).await()
          } catch (_: Throwable) {}
        }
      } else if (path.startsWith(PREFIX_PHONE_TO_WATCH)) {
        val raw = DataMapItem.fromDataItem(item).dataMap.getString("json")
        if (raw != null) handleIncomingPayloadString(raw)
        val uri = item.uri
        scope.launch(Dispatchers.IO) {
          try {
            Wearable.getDataClient(appContext).deleteDataItems(uri).await()
          } catch (_: Throwable) {}
        }
      }
    }
  }

  fun handleIncomingPayloadString(raw: String) {
    val json = try {
      JSONObject(raw)
    } catch (_: Throwable) {
      return
    }
    scope.launch {
      dispatchIncoming(json, raw)
    }
  }

  private fun scheduleRevocationPersistRetry(result: WearServerCredentialsStore.RevocationResult) {
    if (!result.accepted || result.persisted) return
    revocationPersistRetryJob?.cancel()
    revocationPersistRetryJob = scope.launch(Dispatchers.IO) {
      val delaysMs = longArrayOf(2_000L, 5_000L, 12_000L, 30_000L)
      for (waitMs in delaysMs) {
        delay(waitMs)
        if (
          WearServerCredentialsStore.persistPendingRevocationBarrier(
            context = appContext,
            minRevokedGeneration = result.revokedGeneration,
            expectedWriteId = result.targetWriteId
          )
        ) {
          return@launch
        }
      }
    }
  }

  private fun dispatchIncoming(json: JSONObject, raw: String) {
    val type = json.optString("type")
    when {
      type == "accountCleared" -> {
        val gen = json.optLong("generation", 0L).takeIf { it > 0L }
        val genBefore = checkInStore.currentAccountGeneration()
        val activeCtxGen = checkInStore.currentAcceptedContextGeneration()
        scope.launch(Dispatchers.IO) {
          val result = WearServerCredentialsStore.tryClearForRevocation(
            context = appContext,
            generation = gen,
            activeContextGeneration = activeCtxGen
          )
          if (result.accepted) {
            if (!result.persisted) scheduleRevocationPersistRetry(result)
            scope.launch {
              if (
                checkInStore.currentAccountGeneration() != genBefore ||
                checkInStore.currentAcceptedContextGeneration() > activeCtxGen
              ) {
                return@launch
              }
              val retiredGen = checkInStore.clearAccountState(
                newOwnerId = null,
                expectedCredentialWriteId = result.targetWriteId
              )
              demoStore.clear()
              clearQueuedWatchTransfers(retiredThroughGeneration = retiredGen)
            }
          }
        }
      }
      type == "serverCredentials" -> {
        val incomingOwner = json.optString("ownerId", "").trim()
        val isMtlsNotice = json.optBoolean("requiresClientCertificate", false)
        if (incomingOwner.isEmpty() && !isMtlsNotice) {
          val gen = json.optLong("generation", 0L).takeIf { it > 0L }
          val activeCtxGen = checkInStore.currentAcceptedContextGeneration()
          scope.launch(Dispatchers.IO) {
            val result = WearServerCredentialsStore.tryClearForRevocation(
              context = appContext,
              generation = gen,
              activeContextGeneration = activeCtxGen
            )
            if (result.accepted && !result.persisted) {
              scheduleRevocationPersistRetry(result)
            }
          }
          return
        }
        val genBefore = checkInStore.currentAccountGeneration()
        val currentActive = checkInStore.activeOwnerId()
        if (!currentActive.isNullOrEmpty() && incomingOwner.isNotEmpty() && currentActive != incomingOwner) return
        scope.launch(Dispatchers.IO) {
          if (checkInStore.currentAccountGeneration() != genBefore) return@launch
          val activeNow = checkInStore.activeOwnerId()
          if (!activeNow.isNullOrEmpty() && incomingOwner.isNotEmpty() && activeNow != incomingOwner) return@launch
          val outcome = WearServerCredentialsStore.saveWithWatermark(
            context = appContext,
            json = json,
            activeOwnerId = activeNow
          )
          if (checkInStore.currentAccountGeneration() != genBefore) {
            if (outcome is WearServerCredentialsStore.SaveResult.Saved) {
              WearServerCredentialsStore.clearIfWriteIdMatches(appContext, outcome.writeId)
            }
            return@launch
          }
          val incomingGen = json.optLong("generation", 0L)
          val incomingTransportRev = json.optLong("transportRevision", 0L)
          if (outcome is WearServerCredentialsStore.SaveResult.Duplicate && !isMtlsNotice && incomingOwner.isNotEmpty()) {
            scope.launch {
              sendLiveMessage(
                OutboundPayloads.credentialsAck(
                  generation = incomingGen,
                  transportRevision = incomingTransportRev,
                  ownerId = incomingOwner
                )
              )
            }
          }
          if (outcome is WearServerCredentialsStore.SaveResult.Saved) {
            scope.launch {
              if (checkInStore.currentAccountGeneration() != genBefore) {
                scope.launch(Dispatchers.IO) {
                  WearServerCredentialsStore.clearIfWriteIdMatches(appContext, outcome.writeId)
                }
                return@launch
              }
              val activeAfter = checkInStore.activeOwnerId()
              when {
                activeAfter == outcome.ownerId -> {
                  if (!isMtlsNotice) {
                    sendLiveMessage(
                      OutboundPayloads.credentialsAck(
                        generation = incomingGen,
                        transportRevision = incomingTransportRev,
                        ownerId = outcome.ownerId
                      )
                    )
                  }
                  checkInStore.resendQueued()
                  replayPendingWorkoutRecoveries()
                  refreshLiveFromServerThrottled(force = true)
                }
                !activeAfter.isNullOrEmpty() && activeAfter != outcome.ownerId -> {
                  scope.launch(Dispatchers.IO) {
                    WearServerCredentialsStore.clearIfWriteIdMatches(appContext, outcome.writeId)
                  }
                }
                else -> {
                  // Newly paired watch before first context arrives: retain credentials until owner is confirmed.
                  if (!isMtlsNotice) {
                    sendLiveMessage(
                      OutboundPayloads.credentialsAck(
                        generation = incomingGen,
                        transportRevision = incomingTransportRev,
                        ownerId = outcome.ownerId
                      )
                    )
                  }
                }
              }
            }
          }
        }
      }
      type == "exerciseImage" -> {
        val key = json.optString("key")
        val index = json.optInt("index", -1)
        val dataBase64 = json.optString("dataBase64")
        if (key.isNotEmpty() && index in 0..ExerciseDemoFiles.MAX_INDEX && dataBase64.isNotEmpty()) {
          val keepKeys = workoutStore.activeDemoKeys()
          val gen = demoStore.currentGeneration()
          scope.launch(Dispatchers.IO) {
            demoStore.receiveBase64(key, index, dataBase64, keepKeys, expectedGeneration = gen)
          }
        }
      }
      type == "context" || json.has("today") || json.has("caloriesConsumed") || json.has("waterConsumedMl") -> {
        checkInStore.applyRemoteContextJson(json, rawJson = raw)
      }
      type == "ack" -> {
        val clientId = json.optString("clientId")
        val ok = if (json.has("ok")) json.optBoolean("ok", true) else json.optString("status") != "failed"
        val fastKnown = json.optBoolean("fastKnown", false)
        val settledFast = if (fastKnown) ContextPayloadMapper.parseFast(json.optJSONObject("fast")) else null
        if (clientId.isNotEmpty()) {
          checkInStore.acknowledge(
            clientId = clientId,
            ok = ok,
            fastKnown = fastKnown,
            settledFast = settledFast
          )
        } else {
          checkInStore.handleAck(if (ok) "saved" else "failed")
        }
      }
      type == "workoutStart" || type == "workoutPlanUpdate" -> {
        if (
          type == "workoutStart" &&
          !shouldAcceptIncomingWorkoutStart(
            payloadOwnerId = json.optStringOrNull("ownerId"),
            payloadAccountGen = json.optLong("accountGen", 0L),
            activeOwnerId = checkInStore.activeOwnerId(),
            currentAccountGen = checkInStore.currentAccountGeneration()
          )
        ) {
          val staleSessionId = json.optString("sessionId", "")
          if (staleSessionId.isNotEmpty()) {
            clearPendingWorkoutRecoveryBySession(staleSessionId)
          }
          return
        }
        val identity = if (type == "workoutStart") {
          listOf(json.optString("sessionId"), json.optString("armedAt"))
        } else {
          listOf(json.optString("sessionId"), json.optString("revision"))
        }
        if (identity.all { it.isNotEmpty() } &&
          !firstTime("$type:${identity.joinToString("|")}")) return
        val plan = ContextPayloadMapper.parseWorkoutPlan(json, allowEmpty = true) ?: return
        clearPendingWorkoutRecoveryBySession(plan.sessionId)
        workoutStore.startOrUpdatePlan(plan)
        requestNavigateTo(WatchPage.WORKOUT)
        bringAppToForeground()
      }
      type == "workoutStop" -> {
        val sessionId = json.optString("sessionId")
        val identity = listOf(sessionId, json.optString("stoppedAt"))
        if (identity.all { it.isNotEmpty() } &&
          !firstTime("workoutStop:${identity.joinToString("|")}")) return
        clearPendingWorkoutRecoveryBySession(sessionId)
        val discarded = json.optBoolean("discarded", false)
        workoutStore.handleRemoteWorkoutStop(sessionId = sessionId, discarded = discarded)
      }
      type == "setTargetsUpdate" || type == "setTargets" -> {
        val update = ContextPayloadMapper.parseSetTargets(json) ?: return
        workoutStore.applySetTargetsUpdate(update)
      }
      type == "intervalTiming" -> {
        val timing = ContextPayloadMapper.parseIntervalTiming(json) ?: return
        workoutStore.applyIntervalTiming(timing)
      }
      type == "telemetryOwnership" || type == "telemetryOwner" -> {
        val owner = json.optString("owner", "watch")
        telemetryOwner = owner
      }
      type == "recordingState" -> {
        val state = ContextPayloadMapper.parseRecordingState(json) ?: return
        recordingStore.applyRemoteState(state)
        if (recordingStore.isActive) {
          requestNavigateTo(WatchPage.WORKOUT)
        }
      }
      type == "watchRunStart" || type == "runStart" -> {
        val requestId = json.optString("requestId")
        if (requestId.isNotEmpty() && !firstTime("runStart:$requestId")) return
        val req = ContextPayloadMapper.parseRunStartRequest(json) ?: return
        runStore.startRun(req)
        requestNavigateTo(WatchPage.WORKOUT)
        bringAppToForeground()
      }
      type == "watchRunControl" || type == "runControl" -> {
        val action = json.optString("action").ifEmpty { json.optString("control") }
        val controlId = json.optString("controlId").takeIf { it.isNotEmpty() }
        if (controlId != null && !firstTime("runControl:$controlId")) return
        if (action.isNotEmpty()) {
          runStore.handleRemoteControl(action, json)
        }
      }
      type == "runCueAck" -> {
        val id = json.optString("id")
        if (id.isNotEmpty()) {
          runStore.acknowledgeCue(id)
        }
      }
      type == "mediaState" -> {
        mediaStore.applyRemoteMediaState(ContextPayloadMapper.parsePhoneMediaState(json))
      }
      type == "complicationConfig" -> {
        customComplicationStore.applyConfigJson(json)
      }
    }
  }

  private fun bringAppToForeground() {
    try {
      val intent = Intent(appContext, MainActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      }
      appContext.startActivity(intent)
    } catch (_: Throwable) {}
  }

  override fun sendWeightCheckIn(payload: JSONObject, onResult: (Boolean) -> Unit) {
    val key = payload.optString("clientId").ifEmpty { UUID.randomUUID().toString() }
    enqueueOutboundSend(payload, "checkIn", key, onResult)
  }

  private fun loadPendingWorkoutRecoveries(): List<PendingWorkoutRecovery> = synchronized(workoutRecoveryLock) {
    deserializeWorkoutRecoveries(workoutRecoveryPrefs.getString(KEY_PENDING_WORKOUT_RECOVERIES, null))
  }

  private fun persistWorkoutRecoveryIfGenCurrent(recovery: PendingWorkoutRecovery): Boolean = synchronized(workoutRecoveryLock) {
    if (checkInStore.currentAccountGeneration() != recovery.accountGen) return false
    val current = deserializeWorkoutRecoveries(workoutRecoveryPrefs.getString(KEY_PENDING_WORKOUT_RECOVERIES, null))
    val updated = recordWorkoutRecovery(current, recovery)
    val serialized = serializeWorkoutRecoveries(updated)
    val committed = workoutRecoveryPrefs.edit()
      .putString(KEY_PENDING_WORKOUT_RECOVERIES, serialized)
      .commit() || workoutRecoveryPrefs.edit()
      .putString(KEY_PENDING_WORKOUT_RECOVERIES, serialized)
      .commit()
    if (!committed) {
      // Restore prior persisted state in memory if disk commit failed.
      val rollbackEd = workoutRecoveryPrefs.edit()
      if (current.isEmpty()) rollbackEd.remove(KEY_PENDING_WORKOUT_RECOVERIES)
      else rollbackEd.putString(KEY_PENDING_WORKOUT_RECOVERIES, serializeWorkoutRecoveries(current))
      rollbackEd.apply()
    }
    committed
  }

  private fun updateWorkoutRecoveryIfPresent(
    sessionId: String,
    accountGen: Long,
    transform: (PendingWorkoutRecovery) -> PendingWorkoutRecovery
  ): WorkoutRecoveryUpdateResult = synchronized(workoutRecoveryLock) {
    if (checkInStore.currentAccountGeneration() != accountGen) {
      return@synchronized WorkoutRecoveryUpdateResult.NOT_FOUND
    }
    val current = deserializeWorkoutRecoveries(workoutRecoveryPrefs.getString(KEY_PENDING_WORKOUT_RECOVERIES, null))
    val updated = updateExistingWorkoutRecovery(current, sessionId, accountGen, transform)
      ?: return@synchronized WorkoutRecoveryUpdateResult.NOT_FOUND
    val committed = workoutRecoveryPrefs.edit()
      .putString(KEY_PENDING_WORKOUT_RECOVERIES, serializeWorkoutRecoveries(updated))
      .commit()
    if (committed) {
      WorkoutRecoveryUpdateResult.UPDATED
    } else {
      val rollbackEd = workoutRecoveryPrefs.edit()
      if (current.isEmpty()) rollbackEd.remove(KEY_PENDING_WORKOUT_RECOVERIES)
      else rollbackEd.putString(KEY_PENDING_WORKOUT_RECOVERIES, serializeWorkoutRecoveries(current))
      rollbackEd.apply()
      WorkoutRecoveryUpdateResult.COMMIT_FAILED
    }
  }

  private fun pruneRetiredWorkoutRecoveriesLocked(retiredThroughGeneration: Long) = synchronized(workoutRecoveryLock) {
    val current = deserializeWorkoutRecoveries(workoutRecoveryPrefs.getString(KEY_PENDING_WORKOUT_RECOVERIES, null))
    val pruned = pruneRetiredWorkoutRecoveries(current, retiredThroughGeneration)
    if (pruned.size != current.size) {
      val ed = workoutRecoveryPrefs.edit()
      if (pruned.isEmpty()) {
        ed.remove(KEY_PENDING_WORKOUT_RECOVERIES)
      } else {
        ed.putString(KEY_PENDING_WORKOUT_RECOVERIES, serializeWorkoutRecoveries(pruned))
      }
      ed.commit()
    }
  }

  private fun clearPendingWorkoutRecoveryBySession(sessionId: String) {
    if (sessionId.isBlank()) return
    val removed = synchronized(workoutRecoveryLock) {
      val current = deserializeWorkoutRecoveries(workoutRecoveryPrefs.getString(KEY_PENDING_WORKOUT_RECOVERIES, null))
      val matching = current.filter { it.sessionId == sessionId }
      val updated = removeWorkoutRecoveryBySession(current, sessionId)
      if (updated.size != current.size) {
        val ed = workoutRecoveryPrefs.edit()
        if (updated.isEmpty()) ed.remove(KEY_PENDING_WORKOUT_RECOVERIES)
        else ed.putString(KEY_PENDING_WORKOUT_RECOVERIES, serializeWorkoutRecoveries(updated))
        ed.commit()
      }
      matching
    }
    if (removed.isNotEmpty()) {
      scope.launch(Dispatchers.IO) {
        for (rec in removed) {
          deleteQueuedDataItem("workoutStartRequested", "${rec.accountGen}_${rec.sessionId}")
        }
      }
    }
  }

  private fun isWorkoutRecoveryPresentLocked(sessionId: String, accountGen: Long): Boolean =
    synchronized(workoutRecoveryLock) {
      if (checkInStore.currentAccountGeneration() != accountGen) return@synchronized false
      val current = deserializeWorkoutRecoveries(workoutRecoveryPrefs.getString(KEY_PENDING_WORKOUT_RECOVERIES, null))
      isWorkoutRecoveryPresent(current, sessionId, accountGen)
    }

  private suspend fun enqueueWorkoutRecoveryDataItemIfPresent(
    sessionId: String,
    accountGen: Long,
    payload: JSONObject
  ): Boolean {
    val key = "${accountGen}_${sessionId}"
    val stillPresent = isWorkoutRecoveryPresentLocked(sessionId, accountGen)
    if (!shouldEnqueueWorkoutRecoveryFallback(stillPresent, checkInStore.currentAccountGeneration() == accountGen)) {
      return false
    }
    val queued = enqueueDataItem("workoutStartRequested", key, payload, accountGen)
    if (!queued) return false
    val updateResult = updateWorkoutRecoveryIfPresent(sessionId, accountGen) { it.copy(deliveredToPhone = true) }
    if (shouldCleanupWorkoutRecoveryDataItem(queued = true, updateResult = updateResult)) {
      deleteQueuedDataItem("workoutStartRequested", key)
      return false
    }
    return true
  }

  private fun replayPendingWorkoutRecoveries() {
    val currentGen = checkInStore.currentAccountGeneration()
    val ownerId = checkInStore.activeOwnerId()?.takeIf { it.isNotEmpty() } ?: return
    val replayable = replayableWorkoutRecoveries(loadPendingWorkoutRecoveries(), ownerId, currentGen)
    if (replayable.isEmpty()) return
    scope.launch(Dispatchers.IO) {
      for (rec in replayable) {
        if (!isWorkoutRecoveryPresentLocked(rec.sessionId, rec.accountGen) || checkInStore.activeOwnerId() != rec.ownerId) {
          continue
        }
        val recoveryPayload = buildUnconfirmedWorkoutRecoveryPayload(
          OutboundPayloads.workoutStartRequest(rec.presetId, rec.ownerId),
          rec.sessionId,
          rec.accountGen
        )
        val live = sendLiveMessage(recoveryPayload)
        if (!live && !rec.deliveredToPhone) {
          enqueueWorkoutRecoveryDataItemIfPresent(rec.sessionId, rec.accountGen, recoveryPayload)
        }
      }
    }
  }

  override fun sendWorkoutStartRequest(payload: JSONObject, onResult: (Boolean) -> Unit) {
    val startGen = checkInStore.currentAccountGeneration()
    val serverId = payload.optString("serverId", "").ifEmpty { checkInStore.activeOwnerId() ?: "" }
    scope.launch(Dispatchers.IO) {
      if (checkInStore.currentAccountGeneration() != startGen) {
        onResult(false)
        return@launch
      }
      val presetId = payload.optString("presetId", "")
      val existingRecovery = matchingWorkoutRecovery(
        existing = loadPendingWorkoutRecoveries(),
        ownerId = serverId,
        presetId = presetId,
        currentGen = startGen
      )
      val hadExistingRecovery = existingRecovery != null
      val isStartStillActive: () -> Boolean = {
        checkInStore.currentAccountGeneration() == startGen &&
          checkInStore.activeOwnerId() == serverId
      }
      val canAttemptDirect = presetId.isNotEmpty() && serverId.isNotEmpty() && isStartStillActive()
      val candidateSessionId = resolveWorkoutStartSessionId(existingRecovery) { UUID.randomUUID().toString() }
      var prePersistedNewRecovery = false
      if (canAttemptDirect && !hadExistingRecovery) {
        val preRecord = PendingWorkoutRecovery(
          ownerId = serverId,
          presetId = presetId,
          sessionId = candidateSessionId,
          accountGen = startGen,
          deliveredToPhone = false
        )
        if (!persistWorkoutRecoveryIfGenCurrent(preRecord)) {
          onResult(false)
          return@launch
        }
        prePersistedNewRecovery = true
      }

      var directOutcome: PresetWorkoutDirectResult = if (canAttemptDirect) {
        WearDirectApiClient.startPresetWorkoutDirect(
          context = appContext,
          ownerId = serverId,
          presetIdStr = presetId,
          preMintedSessionId = candidateSessionId,
          isAccountActive = isStartStillActive
        )
      } else {
        PresetWorkoutDirectResult.FailedBeforeCreate
      }

      if (
        directOutcome is PresetWorkoutDirectResult.UnconfirmedCreate &&
        isStartStillActive()
      ) {
        val retryOutcome = WearDirectApiClient.startPresetWorkoutDirect(
          context = appContext,
          ownerId = serverId,
          presetIdStr = presetId,
          preMintedSessionId = directOutcome.sessionId,
          isAccountActive = isStartStillActive
        )
        directOutcome = resolvePresetWorkoutRetryOutcome(
          initial = directOutcome,
          retry = retryOutcome
        )
      }

      when (val resolved = directOutcome) {
        is PresetWorkoutDirectResult.Started -> {
          if (
            checkInStore.currentAccountGeneration() != startGen ||
            checkInStore.activeOwnerId() != serverId
          ) {
            onResult(false)
            return@launch
          }
          scope.launch {
            if (
              shouldClearWorkoutRecoveryAfterPlanStore(
                startGen = startGen,
                currentGen = checkInStore.currentAccountGeneration(),
                expectedOwnerId = serverId,
                activeOwnerId = checkInStore.activeOwnerId()
              )
            ) {
              workoutStore.startOrUpdatePlan(resolved.plan)
              clearPendingWorkoutRecoveryBySession(candidateSessionId)
              if (resolved.plan.sessionId != candidateSessionId) {
                clearPendingWorkoutRecoveryBySession(resolved.plan.sessionId)
              }
              requestNavigateTo(WatchPage.WORKOUT)
              bringAppToForeground()
              onResult(true)
            } else {
              onResult(false)
            }
          }
          val syncNotice = JSONObject()
            .put("type", "watchDirectSynced")
            .put("domain", "workout")
            .put("ownerId", serverId)
          val sentLive = sendLiveMessage(syncNotice)
          if (!sentLive && checkInStore.currentAccountGeneration() == startGen) {
            enqueueDataItem("watchDirectSynced", "${startGen}_workout_latest", syncNotice, startGen)
          }
        }
        is PresetWorkoutDirectResult.UnconfirmedCreate -> {
          if (checkInStore.currentAccountGeneration() != startGen) {
            onResult(false)
            return@launch
          }
          if (resolved.sessionId != candidateSessionId || !prePersistedNewRecovery && !hadExistingRecovery) {
            val recoveryRecord = PendingWorkoutRecovery(
              ownerId = serverId,
              presetId = presetId,
              sessionId = resolved.sessionId,
              accountGen = startGen,
              deliveredToPhone = false
            )
            if (!persistWorkoutRecoveryIfGenCurrent(recoveryRecord)) {
              onResult(false)
              return@launch
            }
          }
          val fallbackPayload = buildUnconfirmedWorkoutRecoveryPayload(payload, resolved.sessionId, startGen)
          val live = sendLiveMessage(fallbackPayload)
          if (!live) {
            enqueueWorkoutRecoveryDataItemIfPresent(resolved.sessionId, startGen, fallbackPayload)
          }
          onResult(live)
        }
        PresetWorkoutDirectResult.FailedBeforeCreate -> {
          if (prePersistedNewRecovery && shouldClearRecoveryAfterFailedBeforeCreate(hadExistingRecovery = hadExistingRecovery)) {
            clearPendingWorkoutRecoveryBySession(candidateSessionId)
          }
          if (checkInStore.currentAccountGeneration() != startGen) {
            onResult(false)
            return@launch
          }
          val fallbackPayload = if (existingRecovery != null) {
            buildUnconfirmedWorkoutRecoveryPayload(payload, existingRecovery.sessionId, startGen)
          } else {
            JSONObject(payload.toString()).put("accountGen", startGen)
          }
          val live = sendLiveMessage(fallbackPayload)
          if (!live && existingRecovery != null) {
            enqueueWorkoutRecoveryDataItemIfPresent(existingRecovery.sessionId, startGen, fallbackPayload)
          }
          onResult(live)
        }
      }
    }
  }

  override fun sendMessageOrQueue(payload: JSONObject, queueType: String) {
    val key = payload.optString("clientId").ifEmpty { UUID.randomUUID().toString() }
    enqueueOutboundSend(payload, queueType, key)
  }

  override fun sendLiveOnly(payload: JSONObject) {
    scope.launch(Dispatchers.IO) {
      sendLiveMessage(payload)
    }
  }

  override fun sendLiveWithResult(payload: JSONObject, onResult: (Boolean) -> Unit) {
    scope.launch(Dispatchers.IO) {
      val live = sendLiveMessage(payload)
      onResult(live)
    }
  }

  override fun isPhoneConnected(onResult: (Boolean) -> Unit) {
    scope.launch(Dispatchers.IO) {
      val connected = try {
        Wearable.getNodeClient(appContext).connectedNodes.await().isNotEmpty()
      } catch (_: Throwable) {
        false
      }
      onResult(connected)
    }
  }

  override fun sendWatchRunFinished(result: WatchRunResult) {
    val payload = OutboundPayloads.runFinished(result)
    enqueueOutboundSend(payload, "runFinished", result.clientId)
  }

  override fun sendHeartRateBatch(batch: HeartRateBatch) {
    if (telemetryOwner == "phone") return
    val payload = OutboundPayloads.heartRateBatch(batch)
    enqueueOutboundSend(payload, "heartRateBatch", batch.clientId)
  }

  override fun cancelWaterTap(clientId: String, ownerId: String) {
    if (clientId.isBlank()) return
    val cancelGen = checkInStore.currentAccountGeneration()
    val payload = OutboundPayloads.waterTapCancel(clientId = clientId, ownerId = ownerId)
    scope.launch(Dispatchers.IO) {
      deleteQueuedDataItem("waterIntake", clientId)
      if (checkInStore.currentAccountGeneration() != cancelGen) return@launch
      val live = sendLiveMessage(payload)
      if (shouldEnqueueDurableWaterTapCancel(checkInStore.currentAccountGeneration() == cancelGen, live)) {
        enqueueDataItem(
          type = "waterTapCancel",
          key = waterTapCancelDataItemKey(ownerId, clientId, cancelGen),
          payload = payload,
          accountGen = cancelGen
        )
      }
    }
  }

  override fun clearQueuedWatchTransfers(retiredThroughGeneration: Long) {
    val cutoff = if (retiredThroughGeneration > 0L) {
      retiredThroughGeneration
    } else {
      checkInStore.currentAccountGeneration()
    }
    clearRetiredPendingWaterReconcile(cutoff)
    inFlightTracker.clearRetired(cutoff)
    pruneRetiredWorkoutRecoveriesLocked(cutoff)
    bridgeOutboundChannel.trySend(OutboundOp.ClearQueued(cutoff))
  }

  override fun onOwnerConfirmed() {
    val confirmedGen = checkInStore.currentAccountGeneration()
    val confirmedOwner = checkInStore.activeOwnerId()
    checkInStore.resendQueued()
    replayPendingWorkoutRecoveries()
    refreshLiveFromServerThrottled(force = true)
    if (confirmedOwner.isNullOrEmpty()) return
    scope.launch(Dispatchers.IO) {
      if (
        checkInStore.currentAccountGeneration() != confirmedGen ||
        checkInStore.activeOwnerId() != confirmedOwner
      ) {
        return@launch
      }
      try {
        val items = Wearable.getDataClient(appContext).getDataItems(
          android.net.Uri.parse("wear://*$PATH_CREDENTIALS"),
          DataClient.FILTER_LITERAL
        ).await()
        val payloads = mutableListOf<String>()
        try {
          for (item in items) {
            val raw = DataMapItem.fromDataItem(item).dataMap.getString("json")
            if (!raw.isNullOrEmpty()) {
              payloads.add(raw)
            }
          }
        } finally {
          items.release()
        }
        if (
          checkInStore.currentAccountGeneration() == confirmedGen &&
          checkInStore.activeOwnerId() == confirmedOwner
        ) {
          for (raw in payloads) {
            handleIncomingPayloadString(raw)
          }
        }
      } catch (_: Throwable) {}
    }
  }

  private suspend fun sendLiveMessage(payload: JSONObject): Boolean {
    return try {
      val bytes = payload.toString().toByteArray(StandardCharsets.UTF_8)
      if (bytes.size > MAX_INLINE_WEARABLE_BYTES) return false
      val nodes = Wearable.getNodeClient(appContext).connectedNodes.await()
      if (nodes.isEmpty()) return false
      val msgClient = Wearable.getMessageClient(appContext)
      for (node in nodes) {
        msgClient.sendMessage(node.id, PATH_MESSAGE, bytes).await()
      }
      true
    } catch (_: Throwable) {
      false
    }
  }

  private suspend fun enqueueDataItem(
    type: String,
    key: String,
    payload: JSONObject,
    accountGen: Long = checkInStore.currentAccountGeneration()
  ): Boolean {
    return dataLayerQueueMutex.withLock {
      if (checkInStore.currentAccountGeneration() != accountGen) return false
      try {
        val safeKey = key.replace("/", "_")
        val req = PutDataMapRequest.create("$PREFIX_WATCH_TO_PHONE$type/$safeKey").apply {
          dataMap.putString("json", payload.toString())
          dataMap.putLong("ts", System.currentTimeMillis())
          dataMap.putLong("seq", outboundSeq.incrementAndGet())
          dataMap.putLong("watchAccountGen", accountGen)
        }.asPutDataRequest().setUrgent()
        Wearable.getDataClient(appContext).putDataItem(req).await()
        true
      } catch (_: Throwable) {
        false
      }
    }
  }

  private suspend fun deleteQueuedDataItem(type: String, key: String) {
    dataLayerQueueMutex.withLock {
      try {
        val safeKey = key.replace("/", "_")
        val dataClient = Wearable.getDataClient(appContext)
        val items = dataClient.getDataItems(
          android.net.Uri.parse("wear://*$PREFIX_WATCH_TO_PHONE$type/$safeKey"),
          DataClient.FILTER_LITERAL
        ).await()
        val uris = mutableListOf<android.net.Uri>()
        try {
          for (item in items) {
            uris.add(item.uri)
          }
        } finally {
          items.release()
        }
        for (uri in uris) {
          try {
            dataClient.deleteDataItems(uri, DataClient.FILTER_LITERAL).await()
          } catch (_: Throwable) {}
        }
      } catch (_: Throwable) {}
    }
  }

  companion object {
    const val PATH_CONTEXT = "/sparky/context"
    const val PATH_CREDENTIALS = "/sparky/credentials"
    const val PATH_REVOCATION = "/sparky/revocation"
    const val PATH_COMPLICATION_CONFIG = "/sparky/complicationConfig"
    const val PATH_MESSAGE = "/sparky/message"
    const val PREFIX_PHONE_TO_WATCH = "/sparky/transfer/phone/"
    const val PREFIX_PHONE_TO_WATCH_EXERCISE_IMAGE = "/sparky/transfer/phone/exerciseImage/"
    const val PREFIX_WATCH_TO_PHONE = "/sparky/transfer/watch/"
    private const val MAX_INLINE_WEARABLE_BYTES = 80 * 1024
    private const val WORKOUT_RECOVERY_PREFS = "sparky_wear_workout_recovery"
    private const val KEY_PENDING_WORKOUT_RECOVERIES = "pending_workout_recoveries"
    internal val DIRECT_HTTP_TYPES = setOf(
      "medicationTaken",
      "waterIntake",
      "waterDelete",
      "checkIn",
      "fastStart",
      "fastEnd"
    )

    internal fun serializeWorkoutRecoveries(list: List<PendingWorkoutRecovery>): String {
      val arr = JSONArray()
      for (rec in list) {
        arr.put(
          JSONObject()
            .put("ownerId", rec.ownerId)
            .put("presetId", rec.presetId)
            .put("sessionId", rec.sessionId)
            .put("accountGen", rec.accountGen)
            .put("deliveredToPhone", rec.deliveredToPhone)
        )
      }
      return arr.toString()
    }

    internal fun deserializeWorkoutRecoveries(raw: String?): List<PendingWorkoutRecovery> {
      if (raw.isNullOrBlank()) return emptyList()
      return try {
        val arr = JSONArray(raw)
        val out = mutableListOf<PendingWorkoutRecovery>()
        for (i in 0 until arr.length()) {
          val o = arr.optJSONObject(i) ?: continue
          val ownerId = o.optString("ownerId", "").trim()
          val presetId = o.optString("presetId", "").trim()
          val sessionId = o.optString("sessionId", "").trim()
          val accountGen = o.optLong("accountGen", 0L)
          if (ownerId.isEmpty() || presetId.isEmpty() || sessionId.isEmpty() || accountGen <= 0L) continue
          out.removeAll { it.sessionId == sessionId }
          out.add(
            PendingWorkoutRecovery(
              ownerId = ownerId,
              presetId = presetId,
              sessionId = sessionId,
              accountGen = accountGen,
              deliveredToPhone = o.optBoolean("deliveredToPhone", false)
            )
          )
        }
        out
      } catch (_: Throwable) {
        emptyList()
      }
    }

    internal fun recordWorkoutRecovery(
      existing: List<PendingWorkoutRecovery>,
      recovery: PendingWorkoutRecovery
    ): List<PendingWorkoutRecovery> {
      if (recovery.ownerId.isBlank() || recovery.presetId.isBlank() || recovery.sessionId.isBlank() || recovery.accountGen <= 0L) {
        return existing
      }
      return existing.filterNot {
        it.sessionId == recovery.sessionId ||
          (it.ownerId == recovery.ownerId && it.presetId == recovery.presetId && it.accountGen == recovery.accountGen)
      } + recovery
    }

    internal fun removeWorkoutRecoveryBySession(
      existing: List<PendingWorkoutRecovery>,
      sessionId: String
    ): List<PendingWorkoutRecovery> =
      if (sessionId.isBlank()) existing else existing.filterNot { it.sessionId == sessionId }

    internal fun pruneRetiredWorkoutRecoveries(
      existing: List<PendingWorkoutRecovery>,
      retiredThroughGeneration: Long
    ): List<PendingWorkoutRecovery> = existing.filter { it.accountGen > retiredThroughGeneration }

    internal fun matchingWorkoutRecovery(
      existing: List<PendingWorkoutRecovery>,
      ownerId: String,
      presetId: String,
      currentGen: Long
    ): PendingWorkoutRecovery? = existing.lastOrNull {
      it.ownerId == ownerId && it.presetId == presetId && it.accountGen == currentGen
    }

    internal fun resolveCancelledWaterTapPostAction(
      isWaterIntake: Boolean,
      wasCancelledDuringFlight: Boolean,
      createdEntryId: String?
    ): CancelledWaterTapAction = when {
      !isWaterIntake || !wasCancelledDuringFlight -> CancelledWaterTapAction.APPLY_NORMALLY
      !createdEntryId.isNullOrBlank() -> CancelledWaterTapAction.COMPENSATE_DELETE
      else -> CancelledWaterTapAction.RECONCILE_VIA_REFRESH
    }

    internal fun decideMainDirectOutcome(
      accountMatchesOnMain: Boolean,
      isWaterIntake: Boolean,
      wasCancelledOnMain: Boolean,
      createdEntryId: String?
    ): MainDirectOutcomeDecision? {
      if (!accountMatchesOnMain) return null
      val action = resolveCancelledWaterTapPostAction(
        isWaterIntake = isWaterIntake,
        wasCancelledDuringFlight = wasCancelledOnMain,
        createdEntryId = createdEntryId
      )
      return MainDirectOutcomeDecision(
        shouldApplyOnMain = action != CancelledWaterTapAction.COMPENSATE_DELETE,
        postAction = action
      )
    }

    internal fun isWaterIntakePayloadExpired(
      entryDate: String?,
      localToday: String
    ): Boolean {
      val trimmed = entryDate?.trim().orEmpty()
      return trimmed.isEmpty() || (localToday.isNotBlank() && trimmed != localToday)
    }

    internal fun waterIntakeDataItemPath(clientId: String): String =
      "${PREFIX_WATCH_TO_PHONE}waterIntake/${clientId.replace("/", "_")}"

    internal fun waterTapCancelDataItemKey(ownerId: String, clientId: String, accountGen: Long): String =
      "${accountGen}_${ownerId.replace("/", "_")}_${clientId.replace("/", "_")}"

    internal fun shouldEnqueueDurableWaterTapCancel(
      accountStillCurrent: Boolean,
      liveMessageSucceeded: Boolean
    ): Boolean = accountStillCurrent

    internal fun isWorkoutRecoveryPresent(
      existing: List<PendingWorkoutRecovery>,
      sessionId: String,
      accountGen: Long
    ): Boolean = existing.any { it.sessionId == sessionId && it.accountGen == accountGen }

    internal fun shouldEnqueueWorkoutRecoveryFallback(
      recordStillPresent: Boolean,
      accountGenCurrent: Boolean
    ): Boolean = recordStillPresent && accountGenCurrent

    internal fun shouldCleanupWorkoutRecoveryDataItem(
      queued: Boolean,
      updateResult: WorkoutRecoveryUpdateResult
    ): Boolean = queued && updateResult == WorkoutRecoveryUpdateResult.NOT_FOUND

    internal fun shouldAcceptIncomingWorkoutStart(
      payloadOwnerId: String?,
      payloadAccountGen: Long,
      activeOwnerId: String?,
      currentAccountGen: Long
    ): Boolean {
      val cleanOwner = payloadOwnerId?.trim().orEmpty()
      if (cleanOwner.isNotEmpty() && activeOwnerId != cleanOwner) {
        return false
      }
      if (payloadAccountGen > 0L && payloadAccountGen != currentAccountGen) {
        return false
      }
      return true
    }

    internal fun shouldResendQueuedOnStartup(activeOwnerId: String?): Boolean =
      !activeOwnerId.isNullOrBlank()

    internal fun resolveWorkoutStartSessionId(
      existingRecovery: PendingWorkoutRecovery?,
      generateId: () -> String
    ): String = existingRecovery?.sessionId?.takeIf { it.isNotBlank() } ?: generateId()

    internal fun shouldClearRecoveryAfterFailedBeforeCreate(hadExistingRecovery: Boolean): Boolean =
      !hadExistingRecovery

    private const val WATER_RECONCILE_RETRY_DELAY_MS = 350L
    private const val MAX_WATER_RECONCILE_RETRIES = 5
    private const val MAX_WATER_RECONCILE_BACKOFF_RETRIES = 4
    private val WATER_RECONCILE_BACKOFF_DELAYS_MS = longArrayOf(2_000L, 5_000L, 12_000L, 25_000L)

    internal fun waterReconcileBackoffDelayMs(retryCount: Int): Long {
      val idx = (retryCount - 1).coerceIn(0, WATER_RECONCILE_BACKOFF_DELAYS_MS.lastIndex)
      return WATER_RECONCILE_BACKOFF_DELAYS_MS[idx]
    }

    internal fun shouldClearWorkoutRecoveryAfterPlanStore(
      startGen: Long,
      currentGen: Long,
      expectedOwnerId: String,
      activeOwnerId: String?
    ): Boolean = currentGen == startGen && activeOwnerId == expectedOwnerId

    internal fun shouldRetryPendingWaterReconcileOnNullOrPartial(
      wasRequiredReconcile: Boolean,
      sameAccountAndOwner: Boolean,
      isCredSessionCurrent: Boolean,
      snapshotIsNull: Boolean,
      snapshotSuppliedWater: Boolean
    ): Boolean =
      wasRequiredReconcile &&
        sameAccountAndOwner &&
        isCredSessionCurrent &&
        (snapshotIsNull || !snapshotSuppliedWater)

    internal fun shouldScheduleReplacementWaterReconcile(
      wasRequiredReconcile: Boolean,
      sameAccountAndOwner: Boolean,
      isCredSessionCurrent: Boolean,
      discardedByMutationRevision: Boolean
    ): Boolean = wasRequiredReconcile && sameAccountAndOwner && isCredSessionCurrent && discardedByMutationRevision

    internal fun recordPendingWaterReconcile(
      current: PendingWaterReconcileState,
      ownerId: String,
      accountGen: Long,
      maxRetries: Int = MAX_WATER_RECONCILE_RETRIES
    ): Pair<PendingWaterReconcileState, Boolean> {
      if (ownerId.isBlank() || accountGen <= 0L) return current to false
      val sameTarget = current.ownerId == ownerId && current.accountGen == accountGen
      val nextRetries = if (sameTarget) current.retryCount + 1 else 1
      if (nextRetries > maxRetries) {
        return PendingWaterReconcileState() to false
      }
      return PendingWaterReconcileState(
        ownerId = ownerId,
        accountGen = accountGen,
        retryCount = nextRetries
      ) to true
    }

    internal fun clearPendingWaterReconcileOnComplete(
      current: PendingWaterReconcileState,
      ownerId: String,
      accountGen: Long
    ): PendingWaterReconcileState =
      if (current.ownerId == ownerId && current.accountGen == accountGen) {
        PendingWaterReconcileState()
      } else {
        current
      }

    internal fun clearPendingWaterReconcileOnAccountRetirement(
      current: PendingWaterReconcileState,
      retiredThroughGeneration: Long
    ): PendingWaterReconcileState =
      if (current.isPending && current.accountGen <= retiredThroughGeneration) {
        PendingWaterReconcileState()
      } else {
        current
      }

    internal fun updateExistingWorkoutRecovery(
      existing: List<PendingWorkoutRecovery>,
      sessionId: String,
      accountGen: Long,
      transform: (PendingWorkoutRecovery) -> PendingWorkoutRecovery
    ): List<PendingWorkoutRecovery>? {
      val idx = existing.indexOfFirst { it.sessionId == sessionId && it.accountGen == accountGen }
      if (idx < 0) return null
      val updated = existing.toMutableList()
      updated[idx] = transform(existing[idx])
      return updated
    }

    internal fun replayableWorkoutRecoveries(
      existing: List<PendingWorkoutRecovery>,
      ownerId: String,
      currentGen: Long
    ): List<PendingWorkoutRecovery> = existing.filter {
      it.ownerId == ownerId && it.accountGen == currentGen
    }

    internal fun shouldHoldDependentFastOp(
      payloadType: String,
      hasEarlierUnsettledOp: Boolean
    ): Boolean = (payloadType == "fastStart" || payloadType == "fastEnd") && hasEarlierUnsettledOp

    internal fun shouldDeferFastEndToPhone(
      payloadType: String,
      hasPrecedingPendingStart: Boolean
    ): Boolean = payloadType == "fastEnd" && hasPrecedingPendingStart

    internal fun shouldDeferFastOpToPhone(
      payloadType: String,
      hasEarlierUnsettledOp: Boolean
    ): Boolean = shouldHoldDependentFastOp(payloadType, hasEarlierUnsettledOp)

    internal fun buildUnconfirmedWorkoutRecoveryPayload(
      basePayload: JSONObject,
      sessionId: String,
      accountGen: Long = 0L
    ): JSONObject = JSONObject(basePayload.toString()).apply {
      put("sessionId", sessionId)
      if (accountGen > 0L) put("accountGen", accountGen)
    }

    internal fun resolvePresetWorkoutRetryOutcome(
      initial: PresetWorkoutDirectResult.UnconfirmedCreate,
      retry: PresetWorkoutDirectResult
    ): PresetWorkoutDirectResult = when (retry) {
      is PresetWorkoutDirectResult.Started -> retry
      is PresetWorkoutDirectResult.UnconfirmedCreate -> retry
      PresetWorkoutDirectResult.FailedBeforeCreate -> initial
    }

    internal fun buildDirectSyncNotice(
      domain: String,
      ownerId: String,
      entryDate: String?,
      clientId: String,
      fastStartOutcome: String? = null
    ): JSONObject = JSONObject()
      .put("type", "watchDirectSynced")
      .put("domain", domain)
      .put("ownerId", ownerId)
      .apply {
        if (!entryDate.isNullOrEmpty()) put("entryDate", entryDate)
        if (clientId.isNotEmpty()) put("clientId", clientId)
        if (!fastStartOutcome.isNullOrEmpty()) put("fastStartOutcome", fastStartOutcome)
      }

    internal fun shouldApplyLiveRefresh(
      startGen: Long,
      currentGen: Long,
      startRev: Long,
      currentRev: Long,
      expectedOwnerId: String,
      activeOwnerId: String?,
      snapshotOwnerId: String,
      snapshotCredWriteId: Long,
      currentCredWriteId: Long,
      isCredSessionCurrent: Boolean = true
    ): Boolean =
      currentGen == startGen &&
        currentRev == startRev &&
        activeOwnerId == expectedOwnerId &&
        snapshotOwnerId == expectedOwnerId &&
        (snapshotCredWriteId <= 0L || (currentCredWriteId == snapshotCredWriteId && isCredSessionCurrent))

    internal fun shouldHandleDeletedDataPath(path: String): Boolean =
      path == PATH_CONTEXT

    internal fun resolveContextDeleteRevocationGeneration(
      deletedContextGen: Long,
      currentCredGen: Long
    ): Pair<Boolean, Long?> = when {
      deletedContextGen > 0L -> true to deletedContextGen
      currentCredGen > 0L -> false to null
      else -> true to null
    }

    internal fun isStaleDeleteEvent(
      genAtEvent: Long,
      currentGen: Long,
      ctxGenAtEvent: Long,
      currentCtxGen: Long,
      ctxSeqAtEvent: Long,
      currentCtxSeq: Long,
      credGenAtEvent: Long,
      currentCredGen: Long,
      credWriteIdAtEvent: Long = 0L,
      currentCredWriteId: Long = 0L,
      isContextDelete: Boolean = true
    ): Boolean =
      currentGen != genAtEvent ||
        (isContextDelete && (currentCtxGen > ctxGenAtEvent || currentCtxSeq != ctxSeqAtEvent)) ||
        currentCredGen > credGenAtEvent ||
        currentCredWriteId != credWriteIdAtEvent

    internal fun tryAdvanceRefreshSeq(lastApplied: AtomicLong, reqSeq: Long): Boolean {
      while (true) {
        val current = lastApplied.get()
        if (reqSeq <= current) return false
        if (lastApplied.compareAndSet(current, reqSeq)) return true
      }
    }

    @Volatile
    private var INSTANCE: WearSessionManager? = null

    fun getInstance(context: Context): WearSessionManager {
      return INSTANCE ?: synchronized(this) {
        INSTANCE ?: WearSessionManager(context.applicationContext).also { INSTANCE = it }
      }
    }
  }
}

internal class InFlightClientTracker {
  private val lock = Any()
  private val byClientId = mutableMapOf<String, MutableMap<Long, Long>>()

  fun register(clientId: String, opToken: Long, enqueuedGeneration: Long) {
    if (clientId.isEmpty()) return
    synchronized(lock) {
      val tokens = byClientId.getOrPut(clientId) { mutableMapOf() }
      tokens[opToken] = enqueuedGeneration
    }
  }

  fun release(clientId: String, opToken: Long) {
    if (clientId.isEmpty()) return
    synchronized(lock) {
      val tokens = byClientId[clientId] ?: return
      tokens.remove(opToken)
      if (tokens.isEmpty()) {
        byClientId.remove(clientId)
      }
    }
  }

  fun clearRetired(retiredThroughGeneration: Long) {
    synchronized(lock) {
      val iter = byClientId.entries.iterator()
      while (iter.hasNext()) {
        val (_, tokens) = iter.next()
        tokens.entries.removeAll { it.value <= retiredThroughGeneration }
        if (tokens.isEmpty()) {
          iter.remove()
        }
      }
    }
  }

  fun isInFlight(clientId: String): Boolean {
    if (clientId.isEmpty()) return false
    synchronized(lock) {
      return byClientId[clientId]?.isNotEmpty() == true
    }
  }
}

class WearDataListenerService : WearableListenerService() {
  override fun onMessageReceived(event: MessageEvent) {
    super.onMessageReceived(event)
    val raw = String(event.data, StandardCharsets.UTF_8)
    WearSessionManager.getInstance(applicationContext).handleIncomingPayloadString(raw)
  }

  override fun onDataChanged(events: DataEventBuffer) {
    super.onDataChanged(events)
    WearSessionManager.getInstance(applicationContext).onDataChanged(events)
  }
}

class WatchSensorsController(
  private val context: Context,
  private val transport: WearSessionTransport
) {
  private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
  private val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

  private var hrListener: SensorEventListener? = null
  private var indoorStepListener: SensorEventListener? = null
  private var locationListener: LocationListener? = null
  private var batchFlushJob: Job? = null
  private var calorieTickerJob: Job? = null

  private val pendingHrSamples = mutableListOf<HeartRateSample>()
  private var lastLocation: Location? = null
  private var accumulatedDistanceMeters = 0.0
  private var accumulatedCalories = 0.0
  private var reportedCalories = 0.0
  private var latestHrBpm: Double? = null

  private val _gpsAccuracyMeters = MutableStateFlow<Double?>(null)
  val gpsAccuracyMeters: StateFlow<Double?> = _gpsAccuracyMeters.asStateFlow()

  private val _currentSpeedMps = MutableStateFlow(0.0)
  val currentSpeedMps: StateFlow<Double> = _currentSpeedMps.asStateFlow()
  @Volatile private var lastSpeedUpdateMs = 0L

  fun effectiveSpeedMps(staleAfterMs: Long = 5000L): Double =
    if (System.currentTimeMillis() - lastSpeedUpdateMs > staleAfterMs) 0.0 else _currentSpeedMps.value

  fun startPassiveStepCounter(onStepsToday: (Int) -> Unit) {
    val sm = sensorManager ?: return
    val stepSensor = sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) ?: return
    val prefs = context.getSharedPreferences("sparky_wear_steps", Context.MODE_PRIVATE)

    val listener = object : SensorEventListener {
      override fun onSensorChanged(event: SensorEvent?) {
        val totalSinceBoot = event?.values?.firstOrNull()?.toInt() ?: return
        val today = CheckInDate.today()
        val savedDate = prefs.getString("baseline_date", null)
        var baseline = prefs.getInt("baseline_value", -1)
        if (savedDate != today || baseline < 0 || totalSinceBoot < baseline) {
          baseline = totalSinceBoot
          prefs.edit()
            .putString("baseline_date", today)
            .putInt("baseline_value", baseline)
            .apply()
        }
        val todaySteps = (totalSinceBoot - baseline).coerceAtLeast(0)
        onStepsToday(todaySteps)
      }

      override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    }
    try {
      sm.registerListener(listener, stepSensor, SensorManager.SENSOR_DELAY_NORMAL)
    } catch (_: Throwable) {}
  }

  @SuppressLint("MissingPermission")
  fun startWorkoutSensors(
    sessionId: String,
    exerciseEntryIdProvider: () -> String,
    enableGps: Boolean,
    indoorStrideMeters: Double = 0.0,
    sendAsRecordingHr: Boolean = false,
    onHeartRate: (Double) -> Unit,
    onCalories: (Double) -> Unit,
    onDistance: (Double) -> Unit,
    onLocationPoint: ((Double, Double, Long) -> Unit)? = null
  ) {
    stopWorkoutSensors()
    WorkoutSensorForegroundService.start(context, enableGps)
    pendingHrSamples.clear()
    lastLocation = null
    accumulatedDistanceMeters = 0.0
    accumulatedCalories = 0.0
    reportedCalories = 0.0
    latestHrBpm = null
    _gpsAccuracyMeters.value = null
    _currentSpeedMps.value = 0.0
    lastSpeedUpdateMs = 0L

    val sm = sensorManager
    val hasSensorsPerm = ContextCompat.checkSelfPermission(
      context,
      Manifest.permission.BODY_SENSORS
    ) == PackageManager.PERMISSION_GRANTED

    if (sm != null && hasSensorsPerm) {
      val hrSensor = sm.getDefaultSensor(Sensor.TYPE_HEART_RATE)
      if (hrSensor != null) {
        val listener = object : SensorEventListener {
          override fun onSensorChanged(event: SensorEvent?) {
            val bpm = event?.values?.firstOrNull()?.toDouble() ?: return
            if (bpm <= 30.0 || bpm >= 240.0) return
            latestHrBpm = bpm
            val nowMs = System.currentTimeMillis()
            val iso = ContextPayloadMapper.formatIso(nowMs)
            synchronized(pendingHrSamples) {
              pendingHrSamples.add(HeartRateSample(t = iso, bpm = bpm))
            }
            transport.sendLiveOnly(
              OutboundPayloads.liveHeartRate(sessionId, exerciseEntryIdProvider(), bpm, nowMs)
            )
            onHeartRate(bpm)
          }

          override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
        }
        hrListener = listener
        try {
          sm.registerListener(listener, hrSensor, SensorManager.SENSOR_DELAY_NORMAL)
        } catch (_: Throwable) {}
      }
    }

    batchFlushJob = scope.launch {
      while (isActive) {
        delay(5000)
        val batch: List<HeartRateSample> = synchronized(pendingHrSamples) {
          val copy = pendingHrSamples.toList()
          pendingHrSamples.clear()
          copy
        }
        if (batch.isNotEmpty()) {
          val energyDelta = (accumulatedCalories - reportedCalories).coerceAtLeast(0.0)
          reportedCalories = accumulatedCalories
          if (sendAsRecordingHr) {
            val clientId = UUID.randomUUID().toString()
            transport.sendMessageOrQueue(
              OutboundPayloads.recordingHeartRate(sessionId, clientId, batch),
              "recordingHeartRate"
            )
          } else {
            transport.sendHeartRateBatch(
              HeartRateBatch(
                clientId = UUID.randomUUID().toString(),
                sessionId = sessionId,
                exerciseEntryId = exerciseEntryIdProvider(),
                samples = batch,
                activeEnergyKcal = energyDelta.takeIf { it > 0 }
              )
            )
          }
        }
      }
    }

    calorieTickerJob = scope.launch {
      while (isActive) {
        delay(5000)
        val hr = latestHrBpm ?: continue
        val kcalPerMin = ((hr - 60.0).coerceAtLeast(25.0)) * 0.085
        accumulatedCalories += (kcalPerMin / 12.0)
        onCalories(accumulatedCalories)
      }
    }

    val hasFineLoc = ContextCompat.checkSelfPermission(
      context,
      Manifest.permission.ACCESS_FINE_LOCATION
    ) == PackageManager.PERMISSION_GRANTED

    val lm = locationManager
    if (enableGps && hasFineLoc && lm != null) {
      try {
        val listener = LocationListener { loc ->
          if (loc.hasAccuracy()) {
            _gpsAccuracyMeters.value = loc.accuracy.toDouble()
          }
          val prev = lastLocation
          if (prev != null) {
            val delta = prev.distanceTo(loc).toDouble()
            val dtSec = ((loc.time - prev.time) / 1000.0).coerceAtLeast(0.5)
            _currentSpeedMps.value = if (loc.hasSpeed()) loc.speed.toDouble() else (delta / dtSec)
            lastSpeedUpdateMs = System.currentTimeMillis()
            if (delta in 0.5..100.0) {
              accumulatedDistanceMeters += delta
              onDistance(accumulatedDistanceMeters)
            }
          }
          lastLocation = loc
          onLocationPoint?.invoke(loc.latitude, loc.longitude, loc.time)
        }
        locationListener = listener
        lm.requestLocationUpdates(
          LocationManager.GPS_PROVIDER,
          3000L,
          2f,
          listener,
          Looper.getMainLooper()
        )
      } catch (_: Throwable) {}
    } else if (!enableGps && indoorStrideMeters > 0.0 && sm != null) {
      val stepSensor = sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
      if (stepSensor != null) {
        var lastSteps = -1
        var lastStepAtMs = System.currentTimeMillis()
        val sListener = object : SensorEventListener {
          override fun onSensorChanged(event: SensorEvent?) {
            val total = event?.values?.firstOrNull()?.toInt() ?: return
            val nowMs = System.currentTimeMillis()
            if (lastSteps >= 0 && total > lastSteps) {
              val stepDelta = (total - lastSteps).coerceAtMost(30)
              val distDelta = stepDelta * indoorStrideMeters
              val dtSec = ((nowMs - lastStepAtMs) / 1000.0).coerceAtLeast(0.5)
              _currentSpeedMps.value = distDelta / dtSec
              lastSpeedUpdateMs = nowMs
              accumulatedDistanceMeters += distDelta
              onDistance(accumulatedDistanceMeters)
            }
            lastSteps = total
            lastStepAtMs = nowMs
          }

          override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
        }
        indoorStepListener = sListener
        try {
          sm.registerListener(sListener, stepSensor, SensorManager.SENSOR_DELAY_NORMAL)
        } catch (_: Throwable) {}
      }
    }
  }

  fun stopWorkoutSensors() {
    batchFlushJob?.cancel()
    batchFlushJob = null
    calorieTickerJob?.cancel()
    calorieTickerJob = null

    hrListener?.let { listener ->
      try {
        sensorManager?.unregisterListener(listener)
      } catch (_: Throwable) {}
    }
    hrListener = null

    indoorStepListener?.let { listener ->
      try {
        sensorManager?.unregisterListener(listener)
      } catch (_: Throwable) {}
    }
    indoorStepListener = null

    locationListener?.let { listener ->
      try {
        locationManager?.removeUpdates(listener)
      } catch (_: Throwable) {}
    }
    locationListener = null
    _gpsAccuracyMeters.value = null
    _currentSpeedMps.value = 0.0
    lastSpeedUpdateMs = 0L
    WorkoutSensorForegroundService.stop(context)
  }
}

class WorkoutSensorForegroundService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopForegroundService()
      return START_NOT_STICKY
    }
    val enableGps = intent?.getBooleanExtra(EXTRA_ENABLE_GPS, false) ?: false
    if (!promoteToForeground(enableGps)) {
      return START_NOT_STICKY
    }
    acquireWakeLock()
    return START_STICKY
  }

  override fun onDestroy() {
    releaseWakeLock()
    super.onDestroy()
  }

  private fun promoteToForeground(enableGps: Boolean): Boolean {
    return try {
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
        val channel = NotificationChannel(
          CHANNEL_ID,
          getString(R.string.notification_channel_workout_tracking),
          NotificationManager.IMPORTANCE_LOW
        ).apply {
          setShowBadge(false)
        }
        nm.createNotificationChannel(channel)
      }
      val launchIntent = Intent(this, MainActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      }
      val pi = PendingIntent.getActivity(
        this,
        0,
        launchIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Notification.Builder(this, CHANNEL_ID)
      } else {
        @Suppress("DEPRECATION")
        Notification.Builder(this)
      }
      val notification = builder
        .setContentTitle(getString(R.string.app_name))
        .setContentText(
          if (enableGps) getString(R.string.notification_recording_run_hr)
          else getString(R.string.notification_recording_workout)
        )
        .setSmallIcon(android.R.drawable.ic_menu_compass)
        .setContentIntent(pi)
        .setOngoing(true)
        .build()

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        var fgsType = 0
        val hasSensors = ContextCompat.checkSelfPermission(
          this,
          Manifest.permission.BODY_SENSORS
        ) == PackageManager.PERMISSION_GRANTED || ContextCompat.checkSelfPermission(
          this,
          Manifest.permission.ACTIVITY_RECOGNITION
        ) == PackageManager.PERMISSION_GRANTED
        if (hasSensors && Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
          fgsType = fgsType or ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH
        }
        val hasLocation = ContextCompat.checkSelfPermission(
          this,
          Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED || ContextCompat.checkSelfPermission(
          this,
          Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        if (enableGps && hasLocation) {
          fgsType = fgsType or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
        }
        if (fgsType != 0) {
          startForeground(NOTIFICATION_ID, notification, fgsType)
        } else {
          startForeground(NOTIFICATION_ID, notification)
        }
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
      true
    } catch (_: Throwable) {
      releaseWakeLock()
      stopSelf()
      false
    }
  }

  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) return
    try {
      val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
      wakeLock = pm.newWakeLock(
        PowerManager.PARTIAL_WAKE_LOCK,
        "SparkyFitness:WearWorkoutSensors"
      ).apply {
        setReferenceCounted(false)
        acquire(4 * 60 * 60 * 1000L)
      }
    } catch (_: Throwable) {}
  }

  private fun releaseWakeLock() {
    try {
      wakeLock?.let { if (it.isHeld) it.release() }
    } catch (_: Throwable) {}
    wakeLock = null
  }

  private fun stopForegroundService() {
    releaseWakeLock()
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        stopForeground(STOP_FOREGROUND_REMOVE)
      } else {
        @Suppress("DEPRECATION")
        stopForeground(true)
      }
    } catch (_: Throwable) {}
    stopSelf()
  }

  companion object {
    private const val CHANNEL_ID = "sparky_wear_workout_channel"
    private const val NOTIFICATION_ID = 3052
    private const val ACTION_START = "com.sparkyapps.sparkyfitness.wear.START_SENSORS"
    private const val ACTION_STOP = "com.sparkyapps.sparkyfitness.wear.STOP_SENSORS"
    private const val EXTRA_ENABLE_GPS = "enable_gps"

    fun start(context: Context, enableGps: Boolean) {
      try {
        val appCtx = context.applicationContext
        val intent = Intent(appCtx, WorkoutSensorForegroundService::class.java).apply {
          action = ACTION_START
          putExtra(EXTRA_ENABLE_GPS, enableGps)
        }
        ContextCompat.startForegroundService(appCtx, intent)
      } catch (_: Throwable) {}
    }

    fun stop(context: Context) {
      try {
        val appCtx = context.applicationContext
        appCtx.stopService(Intent(appCtx, WorkoutSensorForegroundService::class.java))
      } catch (_: Throwable) {}
    }
  }
}
