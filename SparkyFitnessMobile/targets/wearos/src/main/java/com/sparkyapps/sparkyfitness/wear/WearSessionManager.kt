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
import androidx.core.content.ContextCompat
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.util.concurrent.atomic.AtomicLong
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
  val sensorsController = WatchSensorsController(appContext, this)

  private val _requestedPage = MutableStateFlow<WatchPage?>(null)
  val requestedPage: StateFlow<WatchPage?> = _requestedPage.asStateFlow()

  private val _showSleepDetail = MutableStateFlow(false)
  val showSleepDetail: StateFlow<Boolean> = _showSleepDetail.asStateFlow()

  private var telemetryOwner: String = "watch"
  private val seenCommandKeys = LinkedHashSet<String>()
  private val lastContextRequestMs = AtomicLong(0L)

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
    checkInStore.session = this
    workoutStore.session = this
    workoutStore.sensors = sensorsController
    workoutStore.checkInStore = checkInStore
    recordingStore.session = this
    recordingStore.sensors = sensorsController
    recordingStore.checkInStore = checkInStore
    runStore.session = this
    runStore.sensors = sensorsController
    runStore.checkInStore = checkInStore

    sensorsController.startPassiveStepCounter { stepsToday ->
      checkInStore.updateLiveSteps(stepsToday)
    }
    pullInitialDataItems()
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
    val now = System.currentTimeMillis()
    val prev = lastContextRequestMs.get()
    if (now - prev < 15_000L) return
    if (!lastContextRequestMs.compareAndSet(prev, now)) return
    pullInitialDataItems()
  }

  /**
   * Reads persisted DataClient context and queued transfers and requests a live context refresh from the phone.
   */
  fun pullInitialDataItems() {
    val requestStartedAt = System.currentTimeMillis()
    lastContextRequestMs.set(requestStartedAt)
    scope.launch {
      checkInStore.pruneStaleDayData()
    }
    scope.launch(Dispatchers.IO) {
      try {
        val dataItems = Wearable.getDataClient(appContext).dataItems.await()
        for (item in dataItems) {
          val path = item.uri.path ?: continue
          if (path == PATH_CONTEXT) {
            val dataMap = DataMapItem.fromDataItem(item).dataMap
            val raw = dataMap.getString("json") ?: continue
            handleIncomingPayloadString(raw)
          } else if (path.startsWith(PREFIX_PHONE_TO_WATCH)) {
            val dataMap = DataMapItem.fromDataItem(item).dataMap
            val raw = dataMap.getString("json")
            if (raw != null) handleIncomingPayloadString(raw)
            Wearable.getDataClient(appContext).deleteDataItems(item.uri).await()
          }
        }
        dataItems.release()
      } catch (_: Throwable) {}
      try {
        if (!sendLiveMessage(OutboundPayloads.contextRequest())) {
          lastContextRequestMs.compareAndSet(requestStartedAt, 0L)
        }
      } catch (_: Throwable) {
        lastContextRequestMs.compareAndSet(requestStartedAt, 0L)
      }
    }
  }

  fun onMessageReceived(event: MessageEvent) {
    val raw = String(event.data, StandardCharsets.UTF_8)
    handleIncomingPayloadString(raw)
  }

  fun onDataChanged(events: DataEventBuffer) {
    for (event in events) {
      val item = event.dataItem
      val path = item.uri.path ?: continue
      if (event.type == DataEvent.TYPE_DELETED && path == PATH_CONTEXT) {
        scope.launch {
          checkInStore.clearAccountState(newOwnerId = null)
          clearQueuedWatchTransfers()
        }
        continue
      }
      if (event.type != DataEvent.TYPE_CHANGED) continue
      if (path == PATH_CONTEXT) {
        val raw = DataMapItem.fromDataItem(item).dataMap.getString("json") ?: continue
        handleIncomingPayloadString(raw)
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

  private fun dispatchIncoming(json: JSONObject, raw: String) {
    val type = json.optString("type")
    when {
      type == "accountCleared" -> {
        checkInStore.clearAccountState(newOwnerId = null)
        clearQueuedWatchTransfers()
      }
      type == "context" || json.has("today") || json.has("caloriesConsumed") || json.has("waterConsumedMl") -> {
        checkInStore.applyRemoteContextJson(json, rawJson = raw)
      }
      type == "ack" -> {
        val clientId = json.optString("clientId")
        val ok = if (json.has("ok")) json.optBoolean("ok", true) else json.optString("status") != "failed"
        if (clientId.isNotEmpty()) {
          checkInStore.acknowledge(clientId, ok)
        } else {
          checkInStore.handleAck(if (ok) "saved" else "failed")
        }
      }
      type == "workoutStart" || type == "workoutPlanUpdate" -> {
        val identity = if (type == "workoutStart") {
          listOf(json.optString("sessionId"), json.optString("armedAt"))
        } else {
          listOf(json.optString("sessionId"), json.optString("revision"))
        }
        if (identity.all { it.isNotEmpty() } &&
          !firstTime("$type:${identity.joinToString("|")}")) return
        val plan = ContextPayloadMapper.parseWorkoutPlan(json, allowEmpty = true) ?: return
        workoutStore.startOrUpdatePlan(plan)
        requestNavigateTo(WatchPage.WORKOUT)
        bringAppToForeground()
      }
      type == "workoutStop" -> {
        val identity = listOf(json.optString("sessionId"), json.optString("stoppedAt"))
        if (identity.all { it.isNotEmpty() } &&
          !firstTime("workoutStop:${identity.joinToString("|")}")) return
        workoutStore.discardWorkout(notifyPhone = false)
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
    scope.launch(Dispatchers.IO) {
      val live = sendLiveMessage(payload)
      if (!live) {
        enqueueDataItem("checkIn", payload.optString("clientId", UUID.randomUUID().toString()), payload)
      }
      onResult(live)
    }
  }

  override fun sendWorkoutStartRequest(payload: JSONObject, onResult: (Boolean) -> Unit) {
    scope.launch(Dispatchers.IO) {
      val live = sendLiveMessage(payload)
      onResult(live)
    }
  }

  override fun sendMessageOrQueue(payload: JSONObject, queueType: String) {
    scope.launch(Dispatchers.IO) {
      val live = sendLiveMessage(payload)
      if (!live) {
        val key = payload.optString("clientId").ifEmpty { UUID.randomUUID().toString() }
        enqueueDataItem(queueType, key, payload)
      }
    }
  }

  override fun sendLiveOnly(payload: JSONObject) {
    scope.launch(Dispatchers.IO) {
      sendLiveMessage(payload)
    }
  }

  override fun sendWatchRunFinished(result: WatchRunResult) {
    val payload = OutboundPayloads.runFinished(result)
    scope.launch(Dispatchers.IO) {
      val live = sendLiveMessage(payload)
      if (!live) {
        enqueueDataItem("runFinished", result.clientId, payload)
      }
    }
  }

  override fun sendHeartRateBatch(batch: HeartRateBatch) {
    if (telemetryOwner == "phone") return
    val payload = OutboundPayloads.heartRateBatch(batch)
    scope.launch(Dispatchers.IO) {
      val live = sendLiveMessage(payload)
      if (!live) {
        enqueueDataItem("heartRateBatch", batch.clientId, payload)
      }
    }
  }

  override fun clearQueuedWatchTransfers() {
    scope.launch(Dispatchers.IO) {
      try {
        Wearable.getDataClient(appContext).deleteDataItems(
          android.net.Uri.parse("wear://*$PREFIX_WATCH_TO_PHONE"),
          DataClient.FILTER_PREFIX
        ).await()
      } catch (_: Throwable) {}
    }
  }

  private suspend fun sendLiveMessage(payload: JSONObject): Boolean {
    return try {
      val nodes = Wearable.getNodeClient(appContext).connectedNodes.await()
      if (nodes.isEmpty()) return false
      val bytes = payload.toString().toByteArray(StandardCharsets.UTF_8)
      val msgClient = Wearable.getMessageClient(appContext)
      for (node in nodes) {
        msgClient.sendMessage(node.id, PATH_MESSAGE, bytes).await()
      }
      true
    } catch (_: Throwable) {
      false
    }
  }

  private suspend fun enqueueDataItem(type: String, key: String, payload: JSONObject) {
    try {
      val safeKey = key.replace("/", "_")
      val req = PutDataMapRequest.create("$PREFIX_WATCH_TO_PHONE$type/$safeKey").apply {
        dataMap.putString("json", payload.toString())
        dataMap.putLong("ts", System.currentTimeMillis())
      }.asPutDataRequest().setUrgent()
      Wearable.getDataClient(appContext).putDataItem(req).await()
    } catch (_: Throwable) {}
  }

  companion object {
    const val PATH_CONTEXT = "/sparky/context"
    const val PATH_MESSAGE = "/sparky/message"
    const val PREFIX_PHONE_TO_WATCH = "/sparky/transfer/phone/"
    const val PREFIX_WATCH_TO_PHONE = "/sparky/transfer/watch/"

    @Volatile
    private var INSTANCE: WearSessionManager? = null

    fun getInstance(context: Context): WearSessionManager {
      return INSTANCE ?: synchronized(this) {
        INSTANCE ?: WearSessionManager(context.applicationContext).also { INSTANCE = it }
      }
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
          "Workout Tracking",
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
        .setContentTitle("SparkyFitness")
        .setContentText(if (enableGps) "Recording run & heart rate" else "Recording workout")
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
