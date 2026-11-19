package expo.modules.watchconnectivity.garmin

import android.content.Context
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import com.garmin.android.connectiq.ConnectIQ
import com.garmin.android.connectiq.IQApp
import com.garmin.android.connectiq.IQDevice
import com.garmin.android.connectiq.exception.InvalidStateException
import com.garmin.android.connectiq.exception.ServiceUnavailableException
import expo.modules.watchconnectivity.PREFS_NAME
import expo.modules.watchconnectivity.WatchConnectivityHub
import expo.modules.watchconnectivity.WatchConnectivityModule
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** Connect IQ app id of `targets/garmin`; it is the `id` in its manifest.xml, change both together. */
internal const val GARMIN_APP_ID = "e3c1758fa6d74590a5d47005e5806904"

private const val TAG = "GarminLink"
private const val GARMIN_CONNECT_PACKAGE = "com.garmin.android.apps.connectmobile"

/**
 * The SDK's answer to a send can come late (Garmin Connect busy syncing) or
 * never (the watch went away), so a send without one by then counts as failed
 * and its watch is held back for a while ([GarminAbandonedSends]).
 */
private const val SEND_TIMEOUT_MS = 30_000L
private const val OPEN_APP_TIMEOUT_MS = 30_000L
private const val RETRY_BASE_MS = 2_000L
private const val RETRY_MAX_MS = 5 * 60_000L
private const val STATUS_REFRESH_MIN_MS = 10_000L

/**
 * How long `initialize` may wait for the SDK's bind to Garmin Connect before
 * the link counts it as failed and tries again.
 */
private const val INITIALIZE_TIMEOUT_MS = 20_000L

// A start skips a backed-off retry at most this often (see retryNowIfBackedOff).
private const val IMMEDIATE_RETRY_MIN_INTERVAL_MS = 30_000L

private enum class LinkState(val wire: String) {
  UNAVAILABLE("unavailable"),
  STARTING("starting"),
  READY("ready"),
  ERROR("error")
}

private class DeviceEntry(val id: Long, var device: IQDevice) {
  var name: String = device.friendlyName ?: ""
  var connected = false
  var app = GarminAppState.UNKNOWN

  /**
   * The watch sent a message since it last connected, so the app is on it;
   * a `getApplicationInfo` answer cannot take that back (GarminAppStatePolicy).
   */
  var heardSinceConnect = false

  /** The SDK generation this watch's event listeners were registered under. */
  var registeredGeneration = -1
}

/**
 * One message waiting for, or in, the SDK. [onResult] answers a JS
 * `sendGarminMessage`; it is null for a message the link sends on its own (a
 * replay of the cache, `accountCleared`). A job is taken off the queue, or
 * out of `inFlight`, before it is answered, so it is answered once.
 */
private class SendJob(
  val deviceId: Long,
  val outbound: GarminOutboundMessage,
  /** A replay of the cache, sent while nothing in JS listens for resyncs. */
  val replay: Boolean,
  val onResult: ((GarminSendResult) -> Unit)?
)

private class InFlight(
  val seq: Long,
  val job: SendJob,
  val timeout: Runnable
) {
  /**
   * `sendMessage` returned, so the SDK holds this send's listener and may
   * still answer it after the link gives up on it.
   */
  var handedToSdk = false
}

/**
 * The phone side of the Garmin bridge (`agent-docs/garmin.md`, "Phone side").
 *
 * Mechanics only: it reports watches, sends one message at a time and keeps
 * the snapshot message JS hands it. What each watch gets, and when, is
 * decided in TypeScript (`services/garminSync.ts`, shared with a future iOS
 * transport), so the link never builds, diffs or splits a snapshot. When a
 * watch needs everything again it tells JS (`onGarminResync`); only while
 * nothing in JS listens for that does it answer the watch itself, with the
 * cached message as is.
 *
 * Nothing starts on its own: JS calls `startGarmin` (through [startFromJs])
 * only in builds where the Garmin feature is on, which keeps the SDK, and the
 * exported broadcast receiver it registers in this mode, off every other
 * install. Until then the status reads unavailable and every send fails.
 *
 * Connect IQ's `initialize` needs a Looper and its broadcast receiver calls
 * back on the main thread, and the SDK keeps its listeners in plain HashMaps,
 * so every SDK call and all of this object's state stay on the main thread.
 * Cleaning values, size estimates and SharedPreferences run on [worker].
 */
internal object GarminLink {
  private val main = Handler(Looper.getMainLooper())
  private val worker: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "SparkyGarmin").apply { isDaemon = true }
  }
  private val app = IQApp(GARMIN_APP_ID)

  private val started = AtomicBoolean(false)

  @Volatile
  private var currentStatus: Map<String, Any?> = statusMap(LinkState.UNAVAILABLE, null, emptyList())

  // Main thread only from here down.
  private var appContext: Context? = null
  private var connectIQ: ConnectIQ? = null

  /** Bumped on every (re)initialize so a replaced SDK's late callbacks are ignored. */
  private var sdkGeneration = 0
  private var sdkReady = false
  private var state = LinkState.UNAVAILABLE
  private var error: String? = null
  private var retryAttempt = 0
  private var retryRunnable: Runnable? = null
  private var initWatchdog: Runnable? = null
  private var lastRefreshAt = 0L

  /**
   * The module whose JS has an `onGarminResync` listener, kept by Expo's
   * OnStartObserving/OnStopObserving for that event ([setResyncListening]).
   */
  private var resyncListener: WatchConnectivityModule? = null

  private val devices = LinkedHashMap<Long, DeviceEntry>()

  /**
   * The latest full snapshot message from JS, for replays. Every read and
   * write of the stored copy runs on [worker] and posts here in that order,
   * so this always follows the latest one.
   */
  private var cached: GarminOutboundMessage? = null

  // The stored snapshot could not be read at start (unreadable prefs, a format
  // fromJson rejects). Until JS writes or clears it, "nothing cached" is not
  // known to mean signed out, so a watch is not sent accountCleared for it.
  private var cacheUnreadable = false

  // When a start last skipped a backed-off retry; see [retryNowIfBackedOff].
  private var lastImmediateRetryAt = 0L
  private val queue = ArrayDeque<SendJob>()
  private var inFlight: InFlight? = null
  private var sendSeq = 0L
  private val abandoned = GarminAbandonedSends()

  private val pendingOpens = HashMap<Long, MutableList<(String) -> Unit>>()
  private val openTimeouts = HashMap<Long, Runnable>()

  fun isGarminConnectInstalled(context: Context): Boolean {
    return try {
      val pm = context.packageManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        pm.getPackageInfo(GARMIN_CONNECT_PACKAGE, PackageManager.PackageInfoFlags.of(0))
      } else {
        @Suppress("DEPRECATION")
        pm.getPackageInfo(GARMIN_CONNECT_PACKAGE, 0)
      }
      true
    } catch (_: PackageManager.NameNotFoundException) {
      false
    } catch (e: Throwable) {
      Log.w(TAG, "Garmin Connect lookup failed: ${e.message}")
      false
    }
  }

  /**
   * Starts the link if Garmin Connect is installed; safe to call again.
   * Returns whether Garmin Connect is installed.
   */
  private fun start(context: Context): Boolean {
    val appCtx = context.applicationContext
    if (!isGarminConnectInstalled(appCtx)) return false
    if (!started.compareAndSet(false, true)) return true
    currentStatus = statusMap(LinkState.STARTING, null, emptyList())
    worker.execute {
      val stored = readCache(appCtx)
      main.post {
        appContext = appCtx
        cached = stored.message
        cacheUnreadable = stored.failed
        initialize()
      }
    }
    return true
  }

  /**
   * `startGarmin`: starts the link unless it runs (the install is checked
   * again on every call, so Garmin Connect installed later is picked up),
   * re-reads the known watches at once so one paired since is registered,
   * then answers with the status, on the main thread.
   *
   * JS calls it on every return to the foreground (and before a publish
   * while the link is not ready), so a link stuck in an error with a retry
   * backed off (up to [RETRY_MAX_MS]) tries again now, at most once per
   * [IMMEDIATE_RETRY_MIN_INTERVAL_MS]: whoever re-enabled or updated Garmin
   * Connect and came back sees it work at once instead of minutes later.
   */
  fun startFromJs(context: Context, onStatus: (Map<String, Any?>) -> Unit) {
    start(context)
    main.post {
      retryNowIfBackedOff()
      refreshFromJs(force = true)
      onStatus(currentStatus)
    }
  }

  /** The status as it is; also re-reads the watches, at most every 10 s. Starts nothing. */
  fun status(): Map<String, Any?> {
    main.post { refreshFromJs(force = false) }
    return currentStatus
  }

  /**
   * Whether [module]'s JS has an `onGarminResync` listener. Without one a
   * resync replays the cache instead of being emitted to nobody.
   */
  fun setResyncListening(module: WatchConnectivityModule, listening: Boolean) {
    main.post {
      if (listening) {
        resyncListener = module
      } else if (resyncListener === module) {
        resyncListener = null
      }
    }
  }

  /**
   * Sends [raw] to one watch exactly as given, once its values are cleaned
   * for Connect IQ. [onResult] gets the outcome once, on any thread. Messages
   * go out one at a time across all watches, in the order they arrive; one
   * over the cap is answered `tooLarge` without reaching the SDK. Before
   * `startGarmin` it is answered `failed`.
   */
  fun sendMessage(
    deviceId: String,
    raw: Map<String, Any?>,
    onResult: (GarminSendResult) -> Unit
  ) {
    val answered = AtomicBoolean(false)
    val answer: (GarminSendResult) -> Unit = { result ->
      if (answered.compareAndSet(false, true)) {
        try {
          onResult(result)
        } catch (e: Throwable) {
          Log.w(TAG, "Garmin send result not delivered: ${e.message}")
        }
      }
    }
    if (!started.get()) {
      answer(GarminSendResult.FAILED)
      return
    }
    val id = deviceId.toLongOrNull()
    if (id == null) {
      answer(GarminSendResult.NOT_CONNECTED)
      return
    }
    worker.execute {
      val outbound = try {
        GarminOutboundMessage.prepare(raw)
      } catch (e: Throwable) {
        Log.w(TAG, "Garmin message could not be prepared: ${e.message}")
        answer(GarminSendResult.FAILED)
        return@execute
      }
      if (!outbound.fits()) {
        logTooLarge(outbound)
        answer(GarminSendResult.TOO_LARGE)
        return@execute
      }
      main.post {
        queue.addLast(SendJob(id, outbound, replay = false, onResult = answer))
        pump()
      }
    }
  }

  /**
   * Keeps [raw], the latest full `snapshot` message, for replays while
   * nothing in JS listens for resyncs; null deletes it. It is stored as given
   * (values cleaned) and the link never reads its content; JS can read it back
   * with `getGarminSnapshotCache`. [onDone] gets null, or what went wrong, on
   * the worker thread.
   */
  fun setSnapshotCache(context: Context, raw: Map<String, Any?>?, onDone: (Throwable?) -> Unit) {
    val appCtx = context.applicationContext
    worker.execute {
      val outbound = try {
        raw?.let { GarminOutboundMessage.prepare(it) }
      } catch (e: Throwable) {
        Log.w(TAG, "Garmin snapshot could not be prepared: ${e.message}")
        onDone(e)
        return@execute
      }
      var failure: Throwable? = null
      try {
        val editor = prefs(appCtx).edit()
        if (outbound != null) {
          editor.putString(GARMIN_SNAPSHOT_CACHE_KEY, outbound.toJson())
        } else {
          editor.remove(GARMIN_SNAPSHOT_CACHE_KEY)
        }
        editor.apply()
      } catch (e: Throwable) {
        Log.w(TAG, "Failed to store the Garmin snapshot: ${e.message}")
        failure = e
      }
      // The copy in memory is still the latest one if the write failed.
      main.post {
        cached = outbound
        cacheUnreadable = false
      }
      onDone(failure)
    }
  }

  /**
   * The cached snapshot message as stored (values cleaned), or null when
   * nothing is stored, to [onResult] on the worker thread, with `failed` true
   * when the stored copy could not be read (JS must not take that for signed
   * out). Read there so it follows every earlier [setSnapshotCache] and
   * [clearAccount].
   */
  fun readSnapshotCache(context: Context, onResult: (Map<String, Any>?, Boolean) -> Unit) {
    val appCtx = context.applicationContext
    worker.execute {
      val read = readCache(appCtx)
      onResult(read.message?.message, read.failed)
    }
  }

  /**
   * Part of signing out (`clearGarminAccount`, `clearServerCredentials`):
   * forget the cached snapshot, answer waiting sends `failed` and empty every
   * connected watch. [onDone] runs on the main thread once that is queued.
   */
  fun clearAccount(context: Context, onDone: () -> Unit = {}) {
    val appCtx = context.applicationContext
    worker.execute {
      try {
        prefs(appCtx).edit().remove(GARMIN_SNAPSHOT_CACHE_KEY).apply()
      } catch (e: Throwable) {
        Log.w(TAG, "Failed to delete the Garmin snapshot: ${e.message}")
      }
      main.post {
        cached = null
        cacheUnreadable = false
        // Whatever still waits carries the previous account's data.
        failQueued(GarminSendResult.FAILED) { it.outbound.type != GARMIN_TYPE_ACCOUNT_CLEARED }
        if (sdkReady) {
          for (entry in devices.values) {
            if (entry.connected) enqueueControl(entry.id, GARMIN_TYPE_ACCOUNT_CLEARED, front = false)
          }
        }
        pump()
        onDone()
      }
    }
  }

  /**
   * Shows Garmin's "open app" prompt on the watch. [onResult] gets one of
   * promptShown, promptNotShown, notInstalled, alreadyRunning, failed or
   * noDevice, on the main thread; failed before `startGarmin`.
   */
  fun openApp(deviceId: String, onResult: (String) -> Unit) {
    main.post {
      if (!started.get()) {
        onResult("failed")
        return@post
      }
      val entry = deviceId.toLongOrNull()?.let { devices[it] }
      val ciq = connectIQ
      if (entry == null || !entry.connected) {
        onResult("noDevice")
        return@post
      }
      if (!sdkReady || ciq == null) {
        onResult("failed")
        return@post
      }
      // The SDK keeps one open listener per app and watch, so a second
      // request while one is waiting shares its answer instead of replacing it.
      pendingOpens[entry.id]?.let {
        it.add(onResult)
        return@post
      }
      pendingOpens[entry.id] = mutableListOf(onResult)
      val id = entry.id
      val timeout = Runnable { finishOpen(id, "failed") }
      openTimeouts[id] = timeout
      main.postDelayed(timeout, OPEN_APP_TIMEOUT_MS)
      try {
        ciq.openApplication(entry.device, app) { _, _, status ->
          main.post { onOpenResponse(id, status) }
        }
      } catch (e: Throwable) {
        Log.w(TAG, "openApplication failed: ${e.message}")
        finishOpen(id, "failed")
        onSdkCallFailed(e)
      }
    }
  }

  // ---- SDK lifecycle ----

  private fun initialize() {
    val ctx = appContext ?: return
    sdkGeneration += 1
    val generation = sdkGeneration
    setState(LinkState.STARTING, null)
    // SDK 2.4.0 ignores bindService's result and its connection has no
    // onNullBinding or onBindingDied, so a bind Garmin Connect refuses
    // (disabled, or held back by an autostart rule) never calls back. Without
    // this the link would stay "starting", failing every send, until the
    // process dies. The generation keeps a stale timer off a later attempt.
    cancelInitWatchdog()
    val watchdog = Runnable {
      if (generation == sdkGeneration && !sdkReady) {
        initWatchdog = null
        Log.w(TAG, "Connect IQ did not bind within $INITIALIZE_TIMEOUT_MS ms")
        setState(LinkState.ERROR, "bindTimeout")
        scheduleReinitialize()
      }
    }
    initWatchdog = watchdog
    main.postDelayed(watchdog, INITIALIZE_TIMEOUT_MS)
    try {
      val ciq = ConnectIQ.getInstance(ctx, ConnectIQ.IQConnectType.WIRELESS)
      connectIQ = ciq
      // autoUI stays false: Garmin's install and upgrade dialogs must never
      // reach people who do not use Garmin.
      ciq.initialize(ctx, false, sdkListener(generation))
    } catch (e: Throwable) {
      Log.w(TAG, "Connect IQ initialize failed: ${e.message}")
      cancelInitWatchdog()
      setState(LinkState.ERROR, "initializeFailed")
      scheduleReinitialize()
    }
  }

  private fun cancelInitWatchdog() {
    initWatchdog?.let { main.removeCallbacks(it) }
    initWatchdog = null
  }

  private fun sdkListener(generation: Int) = object : ConnectIQ.ConnectIQListener {
    override fun onSdkReady() {
      main.post { if (generation == sdkGeneration) onSdkReady() }
    }

    override fun onInitializeError(status: ConnectIQ.IQSdkErrorStatus?) {
      main.post { if (generation == sdkGeneration) onInitializeError(status) }
    }

    override fun onSdkShutDown() {
      main.post { if (generation == sdkGeneration) onSdkLost() }
    }
  }

  private fun onSdkReady() {
    sdkReady = true
    cancelInitWatchdog()
    cancelRetry()
    setState(LinkState.READY, null)
    refreshDevices(sdkJustReady = true)
    pump()
  }

  private fun onInitializeError(status: ConnectIQ.IQSdkErrorStatus?) {
    Log.w(TAG, "Connect IQ initialize error: $status")
    sdkReady = false
    cancelInitWatchdog()
    when (status) {
      ConnectIQ.IQSdkErrorStatus.GCM_NOT_INSTALLED -> becomeUnavailable()
      ConnectIQ.IQSdkErrorStatus.GCM_UPGRADE_NEEDED -> {
        setState(LinkState.ERROR, "garminConnectUpgradeNeeded")
        scheduleReinitialize()
      }
      else -> {
        setState(LinkState.ERROR, "serviceError")
        scheduleReinitialize()
      }
    }
  }

  /** Garmin Connect's service went away (updated, killed or uninstalled). */
  private fun onSdkLost() {
    sdkReady = false
    markAllDisconnected()
    // An error already shown stays shown until a retry gets further.
    if (state == LinkState.READY) setState(LinkState.STARTING, null) else publishStatus()
    // Android usually rebinds by itself and onSdkReady comes again; the
    // retry only runs if it does not.
    scheduleReinitialize()
  }

  /** An SDK call threw because the service is gone or the SDK is not ready. */
  private fun onSdkCallFailed(e: Throwable) {
    if (e !is InvalidStateException && e !is ServiceUnavailableException) return
    if (!sdkReady) return
    Log.w(TAG, "Connect IQ service unavailable: ${e.message}")
    sdkReady = false
    markAllDisconnected()
    setState(LinkState.ERROR, "serviceUnavailable")
    scheduleReinitialize()
  }

  private fun scheduleReinitialize() {
    if (retryRunnable != null) return
    val delay = (RETRY_BASE_MS shl retryAttempt.coerceAtMost(8)).coerceAtMost(RETRY_MAX_MS)
    retryAttempt += 1
    val runnable = Runnable {
      retryRunnable = null
      reinitialize()
    }
    retryRunnable = runnable
    main.postDelayed(runnable, delay)
  }

  private fun cancelRetry() {
    retryRunnable?.let { main.removeCallbacks(it) }
    retryRunnable = null
  }

  /**
   * A link in [LinkState.ERROR] with a retry waiting (bindTimeout,
   * serviceError, initializeFailed, an upgrade needed...) skips the wait and
   * starts the backoff afresh. A link that is starting, or one whose service
   * went away and that Android may still rebind, is left alone.
   */
  private fun retryNowIfBackedOff() {
    if (!started.get() || sdkReady || state != LinkState.ERROR || retryRunnable == null) return
    // JS also starts the link before a publish while it is not ready, which
    // can be every context push; one immediate retry per window keeps that
    // from turning the backoff into a bind loop.
    val now = SystemClock.uptimeMillis()
    if (lastImmediateRetryAt != 0L && now - lastImmediateRetryAt < IMMEDIATE_RETRY_MIN_INTERVAL_MS) return
    lastImmediateRetryAt = now
    cancelRetry()
    retryAttempt = 0
    reinitialize()
  }

  private fun reinitialize() {
    val ctx = appContext ?: return
    if (sdkReady) return
    if (!isGarminConnectInstalled(ctx)) {
      becomeUnavailable()
      return
    }
    shutdownSdk()
    initialize()
  }

  private fun shutdownSdk() {
    // shutdown() calls onSdkShutDown synchronously; the bump makes it stale.
    sdkGeneration += 1
    sdkReady = false
    cancelInitWatchdog()
    val ctx = appContext
    val ciq = connectIQ
    if (ctx != null && ciq != null) {
      try {
        ciq.shutdown(ctx)
      } catch (_: Throwable) {}
    }
    markAllDisconnected()
  }

  private fun becomeUnavailable() {
    cancelRetry()
    shutdownSdk()
    connectIQ = null
    devices.clear()
    // Already empty after shutdownSdk; kept so no JS send can wait forever.
    failQueued(GarminSendResult.FAILED) { true }
    // Nothing is sent until a later start, which begins afresh.
    abandoned.clear()
    retryAttempt = 0
    started.set(false)
    setState(LinkState.UNAVAILABLE, null)
  }

  /** Called with [sdkReady] already false, so every waiting send fails. */
  private fun markAllDisconnected() {
    for (entry in devices.values) {
      entry.connected = false
      entry.heardSinceConnect = false
      entry.registeredGeneration = -1
    }
    inFlight?.let { abandonSend(it.seq, GarminSendResult.FAILED) }
    failQueued(GarminSendResult.FAILED) { true }
    for (id in pendingOpens.keys.toList()) finishOpen(id, "failed")
  }

  // ---- Devices ----

  private val deviceListener = ConnectIQ.IQDeviceEventListener { device, status ->
    if (device != null) main.post { onDeviceStatus(device, status) }
  }

  private val appListener = ConnectIQ.IQApplicationEventListener { device, _, messageData, status ->
    if (device == null) return@IQApplicationEventListener
    if (status != ConnectIQ.IQMessageStatus.SUCCESS) {
      Log.w(TAG, "Garmin message could not be read: $status")
      return@IQApplicationEventListener
    }
    val items = messageData?.toList() ?: emptyList()
    worker.execute {
      val payloads = items.mapNotNull { item -> (item as? Map<*, *>)?.let { GarminWire.toConnectIqMap(it) } }
      main.post { onInbound(device, payloads) }
    }
  }

  /**
   * Re-reads the known watches for JS: the SDK only reports watches it was
   * told about, so a watch paired after the link started is found here, never
   * by its own messages or status. `garminStatus` is throttled; `startGarmin`
   * passes [force].
   */
  private fun refreshFromJs(force: Boolean) {
    if (!sdkReady) return
    val now = SystemClock.uptimeMillis()
    if (!force && lastRefreshAt != 0L && now - lastRefreshAt < STATUS_REFRESH_MIN_MS) return
    lastRefreshAt = now
    refreshDevices(sdkJustReady = false)
    for (entry in devices.values) {
      if (entry.app != GarminAppState.INSTALLED) requestAppInfo(entry)
    }
  }

  /**
   * Reads the known watches and their connection. With [sdkJustReady] every
   * connected watch is resynced (`ready`): the service was away, so nothing
   * says what reached them meanwhile. Otherwise only watches that just
   * connected are (`connected`).
   */
  private fun refreshDevices(sdkJustReady: Boolean) {
    val ciq = connectIQ ?: return
    if (!sdkReady) return
    val known = try {
      ciq.knownDevices.orEmpty()
    } catch (e: Throwable) {
      onSdkCallFailed(e)
      return
    }
    val seen = HashSet<Long>()
    val justConnected = ArrayList<DeviceEntry>()
    for (device in known.filterNotNull()) {
      val id = device.deviceIdentifier
      seen.add(id)
      val entry = devices.getOrPut(id) { DeviceEntry(id, device) }
      entry.device = device
      device.friendlyName?.takeIf { it.isNotBlank() }?.let { entry.name = it }
      val newlyRegistered = entry.registeredGeneration != sdkGeneration
      if (newlyRegistered) {
        try {
          ciq.registerForDeviceEvents(device, deviceListener)
          ciq.registerForAppEvents(device, app, appListener)
          entry.registeredGeneration = sdkGeneration
        } catch (e: Throwable) {
          onSdkCallFailed(e)
          return
        }
      }
      val status = try {
        ciq.getDeviceStatus(device)
      } catch (e: Throwable) {
        onSdkCallFailed(e)
        return
      }
      if (updateConnection(entry, status == IQDevice.IQDeviceStatus.CONNECTED)) justConnected.add(entry)
      // A watch that connects asks again in updateConnection.
      if (newlyRegistered && !entry.connected) requestAppInfo(entry)
    }
    for (id in devices.keys.filter { it !in seen }) forgetDevice(id)
    // Reset only once the service answered, so a service that is ready but
    // fails every call keeps backing off instead of retrying every 2 s.
    retryAttempt = 0
    // The status goes first so JS knows the watch when the resync arrives.
    publishStatus()
    if (sdkJustReady) {
      for (entry in devices.values.toList()) resync(entry, GarminResyncReason.READY)
    } else {
      for (entry in justConnected) resync(entry, GarminResyncReason.CONNECTED)
    }
    pump()
  }

  private fun forgetDevice(id: Long) {
    val entry = devices.remove(id) ?: return
    try {
      connectIQ?.unregisterForEvents(entry.device)
    } catch (_: Throwable) {}
    dropDeviceWork(id)
  }

  private fun onDeviceStatus(device: IQDevice, status: IQDevice.IQDeviceStatus?) {
    if (!sdkReady) return
    val entry = devices[device.deviceIdentifier] ?: return
    entry.device = device
    device.friendlyName?.takeIf { it.isNotBlank() }?.let { entry.name = it }
    val justConnected = updateConnection(entry, status == IQDevice.IQDeviceStatus.CONNECTED)
    publishStatus()
    if (justConnected) resync(entry, GarminResyncReason.CONNECTED)
    pump()
  }

  /** Returns true when the watch just connected; the caller resyncs it after publishing the status. */
  private fun updateConnection(entry: DeviceEntry, connected: Boolean): Boolean {
    if (connected == entry.connected) return false
    entry.connected = connected
    if (connected) {
      requestAppInfo(entry)
      return true
    }
    entry.heardSinceConnect = false
    dropDeviceWork(entry.id)
    return false
  }

  private fun dropDeviceWork(id: Long) {
    failQueued(GarminSendResult.NOT_CONNECTED) { it.deviceId == id }
    inFlight?.let { if (it.job.deviceId == id) abandonSend(it.seq, GarminSendResult.NOT_CONNECTED) }
    finishOpen(id, "noDevice")
  }

  private fun requestAppInfo(entry: DeviceEntry) {
    val ciq = connectIQ ?: return
    if (!sdkReady) return
    val id = entry.id
    try {
      ciq.getApplicationInfo(
        GARMIN_APP_ID,
        entry.device,
        object : ConnectIQ.IQApplicationInfoListener {
          override fun onApplicationInfoReceived(info: IQApp?) {
            val appState = when (info?.status) {
              IQApp.IQAppStatus.INSTALLED -> GarminAppState.INSTALLED
              IQApp.IQAppStatus.NOT_INSTALLED, IQApp.IQAppStatus.NOT_SUPPORTED -> GarminAppState.NOT_INSTALLED
              else -> GarminAppState.UNKNOWN
            }
            main.post { setAppStateFromInfo(id, appState) }
          }

          override fun onApplicationNotInstalled(applicationId: String?) {
            main.post { setAppStateFromInfo(id, GarminAppState.NOT_INSTALLED) }
          }
        }
      )
    } catch (e: Throwable) {
      Log.w(TAG, "getApplicationInfo failed: ${e.message}")
      onSdkCallFailed(e)
    }
  }

  private fun setAppState(id: Long, appState: GarminAppState) {
    val entry = devices[id] ?: return
    if (entry.app == appState) return
    entry.app = appState
    publishStatus()
  }

  private fun setAppStateFromInfo(id: Long, reported: GarminAppState) {
    val entry = devices[id] ?: return
    setAppState(id, GarminAppStatePolicy.afterAppInfo(entry.app, reported, entry.heardSinceConnect))
  }

  private fun onInbound(device: IQDevice, payloads: List<Map<String, Any>>) {
    val ctx = appContext ?: return
    val id = device.deviceIdentifier
    // The SDK delivers messages only from watches registered in
    // refreshDevices, so a watch is always known here; one paired since the
    // link started is found by the re-read `startGarmin` and `garminStatus`
    // do, not by its messages.
    val entry = devices[id]
    var justConnected = false
    if (entry != null) {
      // Only an installed, running app can send, whatever getApplicationInfo said.
      justConnected = updateConnection(entry, true)
      entry.heardSinceConnect = true
      setAppState(id, GarminAppState.INSTALLED)
    }
    var requested = false
    for (payload in payloads) {
      val type = payload["type"] as? String
      if (type !in GARMIN_INBOUND_TYPES) {
        Log.w(TAG, "Ignored Garmin message of type $type")
        continue
      }
      if (type == GARMIN_TYPE_REQUEST_CONTEXT) requested = true
      WatchConnectivityHub.handleGarminPayload(ctx, payload)
    }
    publishStatus()
    if (entry != null) {
      // One full send answers both a reconnect and a request.
      when {
        requested -> resync(entry, GarminResyncReason.REQUESTED)
        justConnected -> resync(entry, GarminResyncReason.CONNECTED)
      }
    }
    pump()
  }

  /**
   * The watch needs the latest snapshot in full. JS decides what that is
   * while it listens; otherwise the cached message goes out as is.
   */
  private fun resync(entry: DeviceEntry, reason: GarminResyncReason) {
    // A watch that is away, or a service that is not ready, gets its turn
    // when it connects or the service is ready (`connected` / `ready`).
    if (!sdkReady || !entry.connected) return
    // A listener on a module that is no longer the active one (destroyed
    // before OnStopObserving ran) counts as none.
    val listener = resyncListener?.takeIf { it === WatchConnectivityHub.activeModule }
    val cache = cached
    // An unreadable cache says nothing about the account: replay nothing and
    // send no accountCleared; the next push, or JS once it listens, answers.
    if (listener == null && cache == null && cacheUnreadable) return
    when (GarminResyncPolicy.decide(jsListening = listener != null, reason = reason, hasCache = cache != null)) {
      GarminResyncAction.EMIT_TO_JS -> listener?.emitEvent(
        "onGarminResync",
        mapOf("deviceId" to entry.id.toString(), "reason" to reason.wire)
      )
      GarminResyncAction.REPLAY_CACHE -> if (cache != null) {
        enqueueReplay(entry.id, cache, front = reason == GarminResyncReason.REQUESTED)
      }
      GarminResyncAction.SEND_ACCOUNT_CLEARED -> enqueueControl(entry.id, GARMIN_TYPE_ACCOUNT_CLEARED, front = true)
      GarminResyncAction.NOTHING -> {}
    }
  }

  // ---- Open app ----

  private fun onOpenResponse(id: Long, status: ConnectIQ.IQOpenApplicationStatus?) {
    val result = when (status) {
      ConnectIQ.IQOpenApplicationStatus.PROMPT_SHOWN_ON_DEVICE -> "promptShown"
      ConnectIQ.IQOpenApplicationStatus.PROMPT_NOT_SHOWN_ON_DEVICE -> "promptNotShown"
      ConnectIQ.IQOpenApplicationStatus.APP_IS_NOT_INSTALLED -> "notInstalled"
      ConnectIQ.IQOpenApplicationStatus.APP_IS_ALREADY_RUNNING -> "alreadyRunning"
      else -> "failed"
    }
    when (status) {
      ConnectIQ.IQOpenApplicationStatus.APP_IS_NOT_INSTALLED -> setAppState(id, GarminAppState.NOT_INSTALLED)
      ConnectIQ.IQOpenApplicationStatus.PROMPT_SHOWN_ON_DEVICE,
      ConnectIQ.IQOpenApplicationStatus.APP_IS_ALREADY_RUNNING -> setAppState(id, GarminAppState.INSTALLED)
      else -> {}
    }
    finishOpen(id, result)
  }

  private fun finishOpen(id: Long, result: String) {
    openTimeouts.remove(id)?.let { main.removeCallbacks(it) }
    val waiting = pendingOpens.remove(id) ?: return
    for (callback in waiting) {
      try {
        callback(result)
      } catch (_: Throwable) {}
    }
  }

  // ---- Send queue ----

  private fun enqueueReplay(deviceId: Long, message: GarminOutboundMessage, front: Boolean) {
    // One replay per watch is enough; the newest copy replaces a waiting one.
    queue.removeAll { it.replay && it.deviceId == deviceId }
    val job = SendJob(deviceId, message, replay = true, onResult = null)
    if (front) queue.addFirst(job) else queue.addLast(job)
  }

  private fun enqueueControl(deviceId: Long, type: String, front: Boolean) {
    val job = SendJob(deviceId, GarminOutboundMessage.control(type), replay = false, onResult = null)
    if (front) queue.addFirst(job) else queue.addLast(job)
  }

  /**
   * Sends the next job; one message is in flight at a time across all
   * watches. Jobs that cannot go out are answered here at once rather than
   * kept, so a JS send never waits for a service or watch that may not return.
   *
   * The one exception is a watch whose last send was given up
   * ([GarminAbandonedSends]): its jobs stay queued, in order, until the late
   * status comes or the grace period passes, while other watches' jobs go
   * ahead. Waiting is preferred over answering them `failed`: JS would only
   * keep the watch for a full resend on its next publish, which can be hours
   * away, so the watch would show older figures meanwhile. The wait is
   * bounded (30 s grace plus the 30 s send timeout), and a disconnect or a
   * sign-out still answers them at once.
   */
  private fun pump() {
    while (inFlight == null) {
      if (queue.isEmpty()) return
      val ciq = connectIQ
      if (!sdkReady || ciq == null) {
        failQueued(GarminSendResult.FAILED) { true }
        return
      }
      val now = SystemClock.uptimeMillis()
      // A job for a watch that is gone or away is answered at once, given-up
      // send or not.
      val index = queue.indexOfFirst { job ->
        devices[job.deviceId]?.connected != true || !abandoned.blocks(job.deviceId, now)
      }
      // Every waiting job is for a watch still in its grace period; the pump
      // posted when it was given up runs again then.
      if (index < 0) return
      val job = queue.removeAt(index)
      val entry = devices[job.deviceId]
      if (entry == null || !entry.connected) {
        complete(job, GarminSendResult.NOT_CONNECTED)
        continue
      }
      // JS messages were measured when they arrived; this catches a cached
      // snapshot that is over the cap, which the link cannot split.
      if (!job.outbound.fits()) {
        logTooLarge(job.outbound)
        complete(job, GarminSendResult.TOO_LARGE)
        continue
      }
      send(ciq, entry, job)
    }
  }

  private fun send(ciq: ConnectIQ, entry: DeviceEntry, job: SendJob) {
    val seq = ++sendSeq
    val deviceId = entry.id
    val timeout = Runnable { abandonSend(seq, GarminSendResult.FAILED) }
    val current = InFlight(seq, job, timeout)
    inFlight = current
    main.postDelayed(timeout, SEND_TIMEOUT_MS)
    try {
      // The listener can run inside this call (a format error), so the result
      // is always handled on a later turn of the main loop.
      ciq.sendMessage(entry.device, app, job.outbound.message) { _, _, status ->
        main.post { onSendStatus(deviceId, seq, status) }
      }
      current.handedToSdk = true
    } catch (e: Throwable) {
      // A send that threw was not taken, so no late status is expected and
      // the watch is not held back.
      Log.w(TAG, "Garmin ${label(job)} send threw: ${e.message}")
      main.post { finishSend(seq, GarminSendResult.FAILED) }
      onSdkCallFailed(e)
    }
  }

  /**
   * The SDK answered send [seq]. It finishes that send while it is in
   * flight; after the link gave up on it, it only frees its watch. Nothing
   * newer was sent to that watch meanwhile (the abandon holds it back), so
   * the SDK still had this send's own listener and the status is its own.
   */
  private fun onSendStatus(deviceId: Long, seq: Long, status: ConnectIQ.IQMessageStatus?) {
    val current = inFlight
    if (current != null && current.seq == seq) {
      finishSend(seq, GarminSendResult.fromStatus(status))
      return
    }
    if (abandoned.lateStatus(deviceId, seq)) {
      Log.w(TAG, "Late Garmin send status discarded: $status")
      pump()
    }
  }

  /**
   * Answers the in-flight send [seq] with [result] without waiting for its
   * SDK status (it timed out, or its watch or the service went away). If the
   * SDK took it, its watch gets nothing more until that status comes or the
   * grace period passes.
   */
  private fun abandonSend(seq: Long, result: GarminSendResult) {
    val current = inFlight ?: return
    if (current.seq != seq) return
    if (current.handedToSdk) {
      abandoned.abandon(current.job.deviceId, seq, SystemClock.uptimeMillis())
      main.postDelayed({ pump() }, GARMIN_ABANDONED_SEND_GRACE_MS)
    }
    finishSend(seq, result)
  }

  private fun finishSend(seq: Long, result: GarminSendResult) {
    val current = inFlight ?: return
    if (current.seq != seq) return
    inFlight = null
    main.removeCallbacks(current.timeout)
    complete(current.job, result)
    pump()
  }

  /** Takes the matching jobs off the queue and answers each with [result]. */
  private fun failQueued(result: GarminSendResult, predicate: (SendJob) -> Boolean) {
    val dropped = queue.filter(predicate)
    if (dropped.isEmpty()) return
    queue.removeAll(predicate)
    for (job in dropped) complete(job, result)
  }

  private fun complete(job: SendJob, result: GarminSendResult) {
    if (result != GarminSendResult.SENT) {
      Log.w(TAG, "Garmin ${label(job)} not delivered: ${result.wire}")
    }
    job.onResult?.invoke(result)
  }

  private fun label(job: SendJob): String = job.outbound.type ?: "message"

  private fun logTooLarge(outbound: GarminOutboundMessage) {
    Log.w(
      TAG,
      "Garmin ${outbound.type ?: "message"} is about ${outbound.estimatedBytes} bytes, " +
        "over $GARMIN_MESSAGE_BYTE_CAP; not sent"
    )
  }

  // ---- Status ----

  private fun setState(newState: LinkState, newError: String?) {
    state = newState
    error = newError
    publishStatus()
  }

  private fun publishStatus() {
    val deviceList = devices.values.map { entry ->
      mapOf(
        "id" to entry.id.toString(),
        "name" to entry.name,
        "connected" to entry.connected,
        "app" to entry.app.wire
      )
    }
    val next = statusMap(state, error, deviceList)
    if (next == currentStatus) return
    currentStatus = next
    WatchConnectivityHub.activeModule?.emitEvent("onGarminStatusChange", next)
  }

  private fun statusMap(state: LinkState, error: String?, deviceList: List<Map<String, Any>>): Map<String, Any?> {
    val out = LinkedHashMap<String, Any?>()
    out["state"] = state.wire
    if (error != null) out["error"] = error
    out["devices"] = deviceList
    return out
  }

  // ---- Storage ----

  private fun prefs(context: Context): SharedPreferences =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  /** What the stored snapshot read gave: a message, nothing stored, or a failure. */
  private class CacheRead(val message: GarminOutboundMessage?, val failed: Boolean)

  private fun readCache(context: Context): CacheRead {
    return try {
      val json = prefs(context).getString(GARMIN_SNAPSHOT_CACHE_KEY, null)
        ?: return CacheRead(null, failed = false)
      val message = GarminOutboundMessage.fromJson(json)
      if (message == null) Log.w(TAG, "The stored Garmin snapshot could not be parsed")
      CacheRead(message, failed = message == null)
    } catch (e: Throwable) {
      Log.w(TAG, "Failed to read the Garmin snapshot: ${e.message}")
      CacheRead(null, failed = true)
    }
  }
}
