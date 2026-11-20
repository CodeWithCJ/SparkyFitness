package expo.modules.watchconnectivity.garmin

import android.content.Context
import android.content.SharedPreferences
import android.content.pm.ApplicationInfo
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

/**
 * How long the binder probe waits for anything to arrive through the binder
 * service (the app info answer takes a Bluetooth round trip to the watch)
 * before the link goes back to broadcasts.
 */
private const val BINDER_PROBE_TIMEOUT_MS = 15_000L

/**
 * The link's own switches, apart from the module's larger preferences file:
 * the enabled flag is read on the main thread inside Application.onCreate.
 */
private const val LINK_PREFS_NAME = "sparky_garmin_link"
private const val ENABLED_KEY = "enabled"
private const val BINDER_RECORD_KEY = "binderRecord"
private const val SEND_SEQ_KEY = "sendSeq"
private const val SEND_ORIGIN_KEY = "sendOrigin"
private const val SEND_INSTALL_KEY = "sendInstall"
private const val SIMULATOR_KEY = "simulator"

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

/** A binder registration waiting for its first delivery; [timeout] goes back to broadcasts. */
private class BinderProbe(val startedAt: Long, val timeout: Runnable)

/**
 * The phone side of the Garmin bridge (`agent-docs/garmin.md`, "Phone side").
 *
 * Mechanics only: it reports watches, sends one message at a time and keeps
 * the snapshot message JS hands it. What each watch gets, and when, is
 * decided in TypeScript (`services/garminSync.ts`, shared with a future iOS
 * transport), so the link never builds, diffs or splits a snapshot. When a
 * watch needs everything again it tells JS (`onGarminResync`); only while
 * nothing in JS listens for that does it answer the watch itself, with the
 * cached message as is, and before JS has listened in this process only a
 * watch that asked ([GarminResyncPolicy]).
 *
 * JS calls `startGarmin` (through [startFromJs]) only in builds where the
 * Garmin feature is on, which keeps the SDK, and the exported broadcast
 * receiver it registers, off every other install. That call is remembered,
 * so a later process starts the link before any JS ([startAtProcessStart]),
 * until JS calls `stopGarmin` ([stop]). Until a start the status reads
 * unavailable and every send fails.
 *
 * Delivery (`agent-docs/garmin.md`, "Binder delivery"): once the SDK is ready
 * the link tries Garmin's binder service, which lets Garmin Connect start
 * this process to deliver, and keeps it only when something actually arrives
 * through it ([startBinderProbe]); otherwise it stays on broadcasts.
 *
 * Connect IQ's `initialize` needs a Looper, its broadcast receiver calls back
 * on the main thread, and the SDK keeps its listeners in plain HashMaps, so
 * every SDK call and all of this object's state stay on the main thread
 * (binder-service callbacks come on a binder thread and are posted there).
 * Cleaning values, size estimates and the snapshot cache run on [worker].
 */
internal object GarminLink {
  private val main = Handler(Looper.getMainLooper())
  private val worker: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "SparkyGarmin").apply { isDaemon = true }
  }
  private val app = IQApp(GARMIN_APP_ID)

  private val started = AtomicBoolean(false)

  @Volatile
  private var currentStatus: Map<String, Any?> =
    statusMap(LinkState.UNAVAILABLE, null, emptyList(), GarminDelivery.NONE)

  // Main thread only from here down.
  private var appContext: Context? = null
  private var connectIQ: ConnectIQ? = null

  /** Bumped on every (re)initialize so a replaced SDK's late callbacks are ignored. */
  private var sdkGeneration = 0
  private var sdkReady = false

  /**
   * The current SDK instance called onSdkReady, so calls that need an
   * initialised SDK, unregistering binder delivery among them, can run.
   * Unlike [sdkReady] it is set before the cache wait and the probe.
   */
  private var sdkBound = false
  private var state = LinkState.UNAVAILABLE
  private var error: String? = null
  private var retryAttempt = 0
  private var retryRunnable: Runnable? = null
  private var initWatchdog: Runnable? = null
  private var lastRefreshAt = 0L

  /**
   * The current SDK instance was switched to binder delivery
   * (`registerAppToUseBinderService`): its broadcast receiver is gone and
   * messages reach [binderAppListener]. Reported as `binder` only once the
   * probe confirmed it, since the link is not ready before then.
   */
  private var binderMode = false
  private var binderProbe: BinderProbe? = null

  /**
   * This start of the link talks to the Connect IQ simulator on the computer
   * over ADB (`IQConnectType.TETHERED`) instead of watches through Garmin
   * Connect. Development only ([isSimulatorOn]): Garmin Connect is not
   * needed, and binder delivery is never tried.
   */
  private var simulator = false

  /**
   * The mode the first start of this process chose; later starts keep it.
   * The SDK cannot close its ADB connection (its server thread outlives
   * `shutdown` and would call into the old instance), so the link never
   * leaves the simulator mode, nor enters it, within one process: a change of
   * the switch takes effect when the app starts again.
   */
  private var simulatorChosen: Boolean? = null

  /** Sends to the simulator run here: the SDK writes to its socket on the calling thread. */
  private val simulatorSender by lazy {
    java.util.concurrent.Executors.newSingleThreadExecutor { runnable -> Thread(runnable, "SparkyGarminSim") }
  }

  /** What the last binder attempt showed; read when the link starts. */
  private var binderRecord: GarminBinderRecord? = null

  /**
   * A probe in this start of the link only timed out after an earlier
   * confirmation, and the registration was kept ([revertToBroadcast]). The
   * next probe waits for the next start, so a watch busy for a minute cannot
   * run up three timeouts (a rejection) within one start. Cleared when the
   * link starts again or becomes unavailable, and when something arrives
   * through the binder meanwhile ([onBinderDelivery]), after which the next
   * time the SDK is ready probes again.
   */
  private var binderProbeDeferred = false

  /**
   * The snapshot cache has been read since the process started. onSdkReady
   * waits for it ([readyAwaitingCache]) because the SDK can be started on the
   * main thread before the read on [worker] lands, and a resync must not take
   * "not read yet" for "signed out".
   */
  private var cacheLoaded = false
  private var readyAwaitingCache = false

  /**
   * The `seq` of the last message handed to the SDK ([GarminSendSequence])
   * and this install's `origin`, both kept in the link's preferences so the
   * numbering keeps rising across process starts. Loaded when the link
   * starts, before anything can be sent.
   */
  private var lastWireSeq = 0L
  private var wireOrigin: String? = null

  /**
   * Watches that sent `requestContext` before the SDK was ready (Garmin
   * Connect delivers through the binder service as soon as it has bound it,
   * which is how it wakes this process). The ready resync answers them as a
   * request rather than a plain `ready`.
   */
  private val pendingRequests = HashSet<Long>()

  /**
   * The module whose JS has an `onGarminResync` listener, kept by Expo's
   * OnStartObserving/OnStopObserving for that event ([setResyncListening]).
   */
  private var resyncListener: WatchConnectivityModule? = null

  /**
   * JS has listened for `onGarminResync` at least once since the process
   * started; until then a resync answers only a watch that asked.
   */
  private var jsHasListened = false

  /**
   * `stopGarmin` calls waiting for the SDK to bind so that binder delivery
   * can be unregistered first ([stop]); answered when the link is unavailable.
   */
  private var pendingStop: MutableList<() -> Unit>? = null

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
   *
   * Called on the main thread, it initialises the SDK before returning. At
   * process start that must happen inside Application.onCreate: when Garmin
   * Connect started the process to deliver through the binder service, it
   * hands the message over as soon as the service is bound, which is the next
   * thing the main thread does, and the SDK drops a message that arrives
   * before it is initialised with a listener set.
   */
  private fun start(context: Context): Boolean {
    val appCtx = context.applicationContext
    val useSimulator = simulatorChosen ?: isSimulatorOn(appCtx)
    if (!useSimulator && !isGarminConnectInstalled(appCtx)) return false
    if (!started.compareAndSet(false, true)) return true
    simulator = useSimulator
    simulatorChosen = useSimulator
    Log.i(TAG, if (useSimulator) "Garmin link starting on the Connect IQ simulator (ADB)" else "Garmin link starting through Garmin Connect")
    currentStatus = statusMap(LinkState.STARTING, null, emptyList(), GarminDelivery.NONE)
    worker.execute {
      val stored = readCache(appCtx)
      main.post {
        cached = stored.message
        cacheUnreadable = stored.failed
        markCacheLoaded()
      }
    }
    val begin = Runnable {
      appContext = appCtx
      // The origin first: a new one (another install) starts its numbering
      // afresh and forgets a binder record restored with the preferences.
      if (wireOrigin == null) wireOrigin = readOrCreateWireOrigin(appCtx)
      lastWireSeq = maxOf(lastWireSeq, readWireSeq(appCtx))
      binderRecord = readBinderRecord(appCtx)
      binderProbeDeferred = false
      initialize()
    }
    if (isMainThread()) begin.run() else main.post(begin)
    return true
  }

  /**
   * Starts the link at process start, before any JS, when the last word from
   * JS was `startGarmin` rather than `stopGarmin` and Garmin Connect is
   * installed (`WatchConnectivityPackage`). A process Garmin Connect started
   * to deliver a message then has the SDK and its listener in place; while JS
   * is not running, a request is answered from the cache and other messages
   * go to the hub's inbound queue, as for any message without JS. Nothing is
   * pushed to a watch that did not ask until JS has listened, so a background
   * start (a widget, an alarm, a job) leaves the watches alone. Never throws:
   * it runs inside Application.onCreate.
   */
  fun startAtProcessStart(context: Context) {
    try {
      val appCtx = context.applicationContext
      if (!linkPrefs(appCtx).getBoolean(ENABLED_KEY, false)) return
      start(appCtx)
    } catch (e: Throwable) {
      Log.w(TAG, "Garmin link not started at process start: ${e.message}")
    }
  }

  /**
   * `stopGarmin`: turns the link off and forgets that JS turned it on, so a
   * later process start leaves the SDK alone. When binder delivery is on, or
   * the stored record says Garmin Connect may hold a registration from an
   * earlier attempt ([GarminBinderPolicy.mayHoldRegistration]), it is
   * unregistered first so Garmin Connect stops waking the process, and the
   * record is cleared so the next start probes again. That needs a bound SDK:
   * a stop while the SDK is still binding waits for onSdkReady, at most until
   * the init watchdog ([INITIALIZE_TIMEOUT_MS]), and one while a retry is
   * backed off binds again first. The snapshot cache is kept (signing out
   * clears it). [onDone] runs on the main thread. Without [context] it uses
   * the one the link started with.
   *
   * Best effort: Garmin Connect never confirms the one-way unregister, and
   * only a stop in a process where the link runs sends it. When the SDK does
   * not bind in time, or the call throws, the record is kept, but with the
   * flag cleared nothing sends it again until the link is started and
   * stopped once more.
   */
  fun stop(context: Context?, onDone: () -> Unit) {
    val appCtx = context?.applicationContext
    main.post {
      val ctx = appCtx ?: appContext
      if (ctx != null) {
        setEnabled(ctx, false)
        saveSimulator(ctx, false)
      }
      val waiting = pendingStop
      if (waiting != null) {
        waiting.add(onDone)
        return@post
      }
      if (!started.get() && connectIQ == null) {
        onDone()
        return@post
      }
      if (simulator) {
        // The ADB connection cannot be closed (see simulatorChosen); with the
        // flags cleared it is gone at the next start of the app.
        Log.i(TAG, "Garmin link stays on the simulator until the app starts again")
        onDone()
        return@post
      }
      val unregister = binderMayBeRegistered()
      if (unregister && !sdkBound && bindForUnregister()) {
        pendingStop = mutableListOf(onDone)
        return@post
      }
      becomeUnavailable(unregisterBinder = unregister)
      onDone()
    }
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
    val appCtx = context.applicationContext
    start(appCtx)
    main.post {
      // A stop still waiting for the SDK is overtaken: the link stays on and
      // the stop is answered as it is.
      answerPendingStop()
      // Remembered for the next process start (startAtProcessStart), whether
      // or not Garmin Connect is installed now.
      setEnabled(appCtx, true)
      retryNowIfBackedOff()
      refreshFromJs(force = true)
      onStatus(currentStatus)
    }
  }

  /**
   * Whether Garmin can be used here: Garmin Connect is installed, or the
   * simulator switch is on ([isSimulatorOn]). What JS's `isGarminAvailable`
   * reads.
   */
  fun isAvailable(context: Context): Boolean = isSimulatorOn(context) || isGarminConnectInstalled(context)

  /**
   * The development switch in Settings > Garmin: the link talks to the
   * Connect IQ simulator over ADB (`adb forward tcp:7381 tcp:7381`, then
   * Connection > Start in the simulator) instead of watches through Garmin
   * Connect. Only a debuggable build honours it, so a release build never
   * opens the ADB port, whatever a development build left in the preferences.
   */
  fun isSimulatorOn(context: Context): Boolean {
    val appCtx = context.applicationContext
    if ((appCtx.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) == 0) return false
    return try {
      linkPrefs(appCtx).getBoolean(SIMULATOR_KEY, false)
    } catch (e: Throwable) {
      false
    }
  }

  /**
   * Turns the simulator switch on or off, then answers like [startFromJs]. A
   * link that already runs keeps its mode until the app starts again
   * ([simulatorChosen]); one not started yet in this process starts in the
   * new mode.
   */
  fun setSimulator(context: Context, on: Boolean, onStatus: (Map<String, Any?>) -> Unit) {
    val appCtx = context.applicationContext
    main.post {
      saveSimulator(appCtx, on)
      val running = simulatorChosen
      if (running != null && running != isSimulatorOn(appCtx)) {
        Log.i(TAG, "Garmin simulator switch saved; it takes effect when the app starts again")
      }
      startFromJs(appCtx, onStatus)
    }
  }

  private fun saveSimulator(context: Context, on: Boolean) {
    try {
      val editor = linkPrefs(context).edit()
      if (on) editor.putBoolean(SIMULATOR_KEY, true) else editor.remove(SIMULATOR_KEY)
      editor.commit()
    } catch (e: Throwable) {
      Log.w(TAG, "Failed to store the Garmin simulator switch: ${e.message}")
    }
  }

  /** The status as it is; also re-reads the watches, at most every 10 s. Starts nothing. */
  fun status(): Map<String, Any?> {
    main.post { refreshFromJs(force = false) }
    return currentStatus
  }

  /**
   * Whether [module]'s JS has an `onGarminResync` listener. Without one a
   * resync replays the cache instead of being emitted to nobody, once JS has
   * listened in this process ([jsHasListened]).
   */
  fun setResyncListening(module: WatchConnectivityModule, listening: Boolean) {
    main.post {
      if (listening) {
        resyncListener = module
        jsHasListened = true
      } else if (resyncListener === module) {
        resyncListener = null
      }
    }
  }

  /**
   * Sends [raw] to one watch as given, once its values are cleaned for
   * Connect IQ, with `seq` and `origin` added at send time. [onResult] gets the outcome once, on any thread. Messages
   * go out one at a time across all watches, in the order they arrive; one
   * over the cap is answered `tooLarge` without reaching the SDK. Until the
   * link is started (`startGarmin`, or the process start with the link turned
   * on) it is answered `failed`.
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
          val install = ownInstallTime(appCtx)
          if (install != null) {
            editor.putLong(GARMIN_SNAPSHOT_INSTALL_KEY, install)
          } else {
            editor.remove(GARMIN_SNAPSHOT_INSTALL_KEY)
          }
        } else {
          editor.remove(GARMIN_SNAPSHOT_CACHE_KEY)
          editor.remove(GARMIN_SNAPSHOT_INSTALL_KEY)
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
        markCacheLoaded()
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
        prefs(appCtx).edit().remove(GARMIN_SNAPSHOT_CACHE_KEY).remove(GARMIN_SNAPSHOT_INSTALL_KEY).apply()
      } catch (e: Throwable) {
        Log.w(TAG, "Failed to delete the Garmin snapshot: ${e.message}")
      }
      main.post {
        cached = null
        cacheUnreadable = false
        markCacheLoaded()
        // Whatever still waits carries the previous account's data.
        failQueued(GarminSendResult.FAILED) { it.outbound.type != GARMIN_TYPE_ACCOUNT_CLEARED }
        if (sdkReady) {
          for (entry in devices.values) {
            if (entry.connected) enqueueAccountCleared(entry.id, front = false)
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
   * noDevice, on the main thread; failed until the link is started.
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
          postFromSdk { onOpenResponse(id, status) }
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
        // A stop waiting to unregister goes ahead without it.
        if (pendingStop != null) {
          becomeUnavailable()
          return@Runnable
        }
        setState(LinkState.ERROR, "bindTimeout")
        scheduleReinitialize()
      }
    }
    initWatchdog = watchdog
    main.postDelayed(watchdog, INITIALIZE_TIMEOUT_MS)
    val ciq = try {
      val type = if (simulator) ConnectIQ.IQConnectType.TETHERED else ConnectIQ.IQConnectType.WIRELESS
      ConnectIQ.getInstance(ctx, type).also { instance ->
        connectIQ = instance
        // autoUI stays false: Garmin's install and upgrade dialogs must never
        // reach people who do not use Garmin.
        instance.initialize(ctx, false, sdkListener(generation))
      }
    } catch (e: Throwable) {
      Log.w(TAG, "Connect IQ initialize failed: ${e.message}")
      cancelInitWatchdog()
      setState(LinkState.ERROR, "initializeFailed")
      scheduleReinitialize()
      return
    }
    try {
      // Set at once, not after onSdkReady (see binderAppListener). It only
      // stores the listener in the SDK; nothing is sent to Garmin Connect.
      ciq.registerForAppEvents(binderAppListener)
    } catch (e: Throwable) {
      Log.w(TAG, "Garmin binder listener not set: ${e.message}")
    }
  }

  private fun cancelInitWatchdog() {
    initWatchdog?.let { main.removeCallbacks(it) }
    initWatchdog = null
  }

  // Qualified with this@GarminLink: inside this object an unqualified
  // onSdkReady() or onInitializeError() is the listener's own method, so the
  // callback would post itself again forever and the link would never get
  // ready (the init watchdog then reports bindTimeout).
  private fun sdkListener(generation: Int) = object : ConnectIQ.ConnectIQListener {
    override fun onSdkReady() {
      main.post { if (generation == sdkGeneration) this@GarminLink.onSdkReady() }
    }

    override fun onInitializeError(status: ConnectIQ.IQSdkErrorStatus?) {
      main.post { if (generation == sdkGeneration) this@GarminLink.onInitializeError(status) }
    }

    override fun onSdkShutDown() {
      main.post { if (generation == sdkGeneration) onSdkLost() }
    }
  }

  private fun onSdkReady() {
    cancelInitWatchdog()
    cancelRetry()
    sdkBound = true
    if (pendingStop != null) {
      // A stop waited for this to unregister binder delivery (see stop).
      becomeUnavailable(unregisterBinder = true)
      return
    }
    if (binderMode) {
      // Android rebound Garmin Connect's service (it restarted) to an
      // instance already switched to the binder. Registering again on it
      // would throw half way (the SDK unregisters its receiver a second time),
      // so the link starts over on a fresh instance and probes again.
      shutdownSdk()
      initialize()
      return
    }
    if (!cacheLoaded) {
      readyAwaitingCache = true
      return
    }
    if (startBinderProbe()) return
    becomeReady()
  }

  private fun markCacheLoaded() {
    cacheLoaded = true
    if (readyAwaitingCache) {
      readyAwaitingCache = false
      onSdkReady()
    }
  }

  private fun becomeReady() {
    sdkReady = true
    setState(LinkState.READY, null)
    refreshDevices(sdkJustReady = true)
    pump()
  }

  // ---- Binder delivery ----

  /**
   * Tries binder delivery when [GarminBinderPolicy] allows it and a watch is
   * connected. Returns true while a probe runs: the link then stays starting
   * (sends fail as during any start) until something arrives through the
   * binder ([confirmBinder]) or [BINDER_PROBE_TIMEOUT_MS] passes
   * ([revertToBroadcast]).
   *
   * The probe is needed because registering proves nothing. SDK 2.4.0 sends
   * Garmin Connect a one-way call, so a registration Garmin Connect ignores
   * (no approval yet, or a version without it) raises no error, yet the SDK
   * has already unregistered its broadcast receiver; without the probe the
   * link would stop hearing the watch. A connected watch is needed for an
   * answer (its app info), so without one the link stays on broadcasts until
   * the SDK is next ready (the next start, or a rebind after the service
   * was lost).
   */
  private fun startBinderProbe(): Boolean {
    val ctx = appContext ?: return false
    val ciq = connectIQ ?: return false
    val garminConnectVersion = garminConnectVersion(ctx) ?: return false
    if (!GarminBinderPolicy.shouldAttempt(binderRecord, garminConnectVersion, System.currentTimeMillis())) {
      return false
    }
    if (binderProbeDeferred) {
      Log.i(TAG, "Garmin binder delivery not tried again until the link next starts")
      return false
    }
    // The simulator has no Garmin Connect to register with.
    if (simulator) return false
    val connected = try {
      ciq.knownDevices.orEmpty().filterNotNull().filter {
        ciq.getDeviceStatus(it) == IQDevice.IQDeviceStatus.CONNECTED
      }
    } catch (e: Throwable) {
      // becomeReady reads the watches again and handles a failing service.
      return false
    }
    if (connected.isEmpty()) {
      Log.i(TAG, "Garmin binder delivery not tried: no watch connected to answer the probe")
      return false
    }
    Log.i(TAG, "Trying Garmin binder delivery (Garmin Connect $garminConnectVersion)")
    try {
      ciq.registerAppToUseBinderService(GARMIN_APP_ID)
    } catch (e: InvalidStateException) {
      // Thrown before the SDK changed anything: broadcasts work as before.
      Log.w(TAG, "Garmin binder registration refused, staying on broadcasts: ${e.message}")
      return false
    } catch (e: ServiceUnavailableException) {
      Log.w(TAG, "Garmin binder registration failed, staying on broadcasts: ${e.message}")
      return false
    } catch (e: Throwable) {
      // Thrown after Garmin Connect was told, so the SDK may be half switched.
      Log.w(TAG, "Garmin binder registration threw: ${e.message}")
      binderMode = true
      revertToBroadcast("registration threw", timedOut = false)
      return true
    }
    binderMode = true
    val timeout = Runnable {
      if (binderProbe != null) {
        revertToBroadcast("nothing arrived through it within $BINDER_PROBE_TIMEOUT_MS ms", timedOut = true)
      }
    }
    binderProbe = BinderProbe(SystemClock.uptimeMillis(), timeout)
    main.postDelayed(timeout, BINDER_PROBE_TIMEOUT_MS)
    for (device in connected) {
      try {
        ciq.getApplicationInfo(GARMIN_APP_ID, device, appInfoListener(device.deviceIdentifier))
      } catch (e: Throwable) {
        Log.w(TAG, "Garmin binder probe could not ask for app info: ${e.message}")
      }
    }
    return true
  }

  /**
   * Something arrived through the binder service: a binder-thread callback
   * ([postFromSdk]) or a message to [binderAppListener]. With a probe running
   * that confirms it. In broadcast mode it means Garmin Connect still holds a
   * registration (the one kept after an inconclusive probe, one from an
   * earlier run, or one whose unregister was lost; it then delivers there
   * whatever the SDK thinks), so the record says confirmed
   * and the next time the SDK becomes ready tries binder delivery again,
   * even in this start of the link ([binderProbeDeferred] no longer holds).
   * Until then the link stays on broadcasts and reports `broadcast`.
   */
  private fun onBinderDelivery() {
    if (binderProbe != null) {
      confirmBinder()
      return
    }
    if (binderMode || binderRecord?.outcome == GarminBinderOutcome.CONFIRMED) return
    Log.i(TAG, "Garmin Connect delivered through the binder service while the link was on broadcasts")
    binderProbeDeferred = false
    saveBinderRecord(GarminBinderOutcome.CONFIRMED)
  }

  private fun confirmBinder() {
    val probe = binderProbe ?: return
    binderProbe = null
    main.removeCallbacks(probe.timeout)
    Log.i(TAG, "Garmin binder delivery confirmed after ${SystemClock.uptimeMillis() - probe.startedAt} ms")
    saveBinderRecord(GarminBinderOutcome.CONFIRMED)
    becomeReady()
  }

  /**
   * Back to today's broadcast mode on a fresh SDK instance, remembering the
   * failure ([GarminBinderPolicy.afterFailure]). A probe that only [timedOut]
   * after a confirmation is tried again the next time the link starts (not
   * in this start, unless the binder answers meanwhile:
   * [binderProbeDeferred]), since one slow answer says nothing about
   * approval; Garmin Connect is then not told to forget the
   * registration, so a late answer through the binder still arrives
   * ([onBinderDelivery]) and the watch can still wake the process. Anything
   * else unregisters and waits a day.
   */
  private fun revertToBroadcast(reason: String, timedOut: Boolean) {
    Log.w(TAG, "Garmin binder delivery not confirmed ($reason); back to broadcasts")
    val version = appContext?.let { garminConnectVersion(it) }
    var keepRegistration = false
    if (version != null) {
      val record = GarminBinderPolicy.afterFailure(binderRecord, timedOut, version, System.currentTimeMillis())
      storeBinderRecord(record)
      keepRegistration = record.outcome == GarminBinderOutcome.UNCONFIRMED
    }
    // The fresh instance's onSdkReady would otherwise probe again at once.
    binderProbeDeferred = keepRegistration
    shutdownSdk(unregisterBinder = !keepRegistration)
    initialize()
  }

  /** Binder delivery is on, or Garmin Connect may hold a registration from an earlier attempt. */
  private fun binderMayBeRegistered(): Boolean =
    !simulator && (binderMode || GarminBinderPolicy.mayHoldRegistration(binderRecord))

  /**
   * Makes sure an onSdkReady, or the init watchdog, comes for a stop that
   * must unregister: true while an initialize is in flight, or after starting
   * one in place of a backed-off retry. False when nothing can bind (Garmin
   * Connect gone, initialize threw), so the stop goes ahead without it.
   */
  private fun bindForUnregister(): Boolean {
    if (initWatchdog != null) return true
    val ctx = appContext ?: return false
    if (!simulator && !isGarminConnectInstalled(ctx)) return false
    cancelRetry()
    shutdownSdk()
    initialize()
    return initWatchdog != null
  }

  private fun cancelBinderProbe() {
    binderProbe?.let { main.removeCallbacks(it.timeout) }
    binderProbe = null
  }

  /**
   * SDK 2.4.0 keeps binder mode on its singleton through shutdown, so a
   * broadcast initialize on the same instance would register a receiver its
   * shutdown then never unregisters. Changing the connection type is the
   * SDK's public way to replace the singleton: getInstance shuts the old one
   * down (a shut-down one refuses, which getInstance ignores) and the
   * TETHERED one in between is only constructed (its ADB connection starts in
   * initialize, which never runs).
   */
  private fun replaceSdkInstance(ctx: Context) {
    try {
      ConnectIQ.getInstance(ctx, ConnectIQ.IQConnectType.TETHERED)
      ConnectIQ.getInstance(ctx, ConnectIQ.IQConnectType.WIRELESS)
    } catch (e: Throwable) {
      Log.w(TAG, "Connect IQ instance not replaced: ${e.message}")
    }
  }

  private fun onInitializeError(status: ConnectIQ.IQSdkErrorStatus?) {
    Log.w(TAG, "Connect IQ initialize error: $status")
    sdkReady = false
    sdkBound = false
    cancelInitWatchdog()
    cancelBinderProbe()
    // A stop waiting to unregister goes ahead without it.
    if (pendingStop != null) {
      becomeUnavailable()
      return
    }
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
    if (simulator) {
      markAllDisconnected()
      publishStatus()
      return
    }
    sdkReady = false
    sdkBound = false
    // A probe cut short says nothing about approval; the next ready tries again.
    cancelBinderProbe()
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
    // The simulator's SDK throws while no simulator is connected; it is not
    // a lost service, and the link must never restart it.
    if (simulator) {
      Log.d(TAG, "Connect IQ simulator call failed: ${e.message}")
      return
    }
    Log.w(TAG, "Connect IQ service unavailable: ${e.message}")
    sdkReady = false
    markAllDisconnected()
    setState(LinkState.ERROR, "serviceUnavailable")
    scheduleReinitialize()
  }

  private fun scheduleReinitialize() {
    // The simulator's SDK cannot be started twice in one process.
    if (simulator) return
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
    if (sdkReady || simulator) return
    if (!simulator && !isGarminConnectInstalled(ctx)) {
      becomeUnavailable()
      return
    }
    shutdownSdk()
    initialize()
  }

  /**
   * Shuts the SDK down. With [unregisterBinder], Garmin Connect is first told
   * to forget the binder registration (it would otherwise keep delivering
   * there and waking the process); that needs a bound SDK (the SDK refuses
   * otherwise). A restart after a lost service keeps it, since the next ready
   * registers again. Returns whether the unregister call went out.
   */
  private fun shutdownSdk(unregisterBinder: Boolean = false): Boolean {
    // Never on the simulator's SDK (see simulatorChosen).
    if (simulator) return false
    val bound = sdkBound
    // shutdown() calls onSdkShutDown synchronously; the bump makes it stale.
    sdkGeneration += 1
    sdkReady = false
    sdkBound = false
    readyAwaitingCache = false
    cancelInitWatchdog()
    cancelBinderProbe()
    val ctx = appContext
    val ciq = connectIQ
    var unregistered = false
    if (ctx != null && ciq != null) {
      if (unregisterBinder && !simulator && (bound || binderMode)) {
        try {
          // Also shuts the SDK down. It works on a broadcast-mode instance too.
          ciq.unregisterAppFromUsingBinderService(GARMIN_APP_ID, ctx)
          unregistered = true
        } catch (e: Throwable) {
          Log.w(TAG, "Garmin binder delivery not unregistered: ${e.message}")
        }
      }
      if (!unregistered) {
        try {
          ciq.shutdown(ctx)
        } catch (_: Throwable) {}
      }
    }
    // An instance that unregistered is replaced too: what the SDK keeps on
    // its singleton after that call is not documented.
    if (binderMode || unregistered) {
      binderMode = false
      connectIQ = null
      if (ctx != null) replaceSdkInstance(ctx)
    }
    markAllDisconnected()
    return unregistered
  }

  private fun becomeUnavailable(unregisterBinder: Boolean = false) {
    cancelRetry()
    binderProbeDeferred = false
    // Once unregistered the record is cleared, so the next start probes
    // again instead of trusting a confirmation for a registration that is gone.
    if (shutdownSdk(unregisterBinder)) clearBinderRecord()
    connectIQ = null
    devices.clear()
    pendingRequests.clear()
    // Already empty after shutdownSdk; kept so no JS send can wait forever.
    failQueued(GarminSendResult.FAILED) { true }
    // Nothing is sent until a later start, which begins afresh.
    abandoned.clear()
    retryAttempt = 0
    started.set(false)
    setState(LinkState.UNAVAILABLE, null)
    answerPendingStop()
  }

  private fun answerPendingStop() {
    val waiting = pendingStop ?: return
    pendingStop = null
    for (callback in waiting) {
      try {
        callback()
      } catch (e: Throwable) {
        Log.w(TAG, "Garmin stop not answered: ${e.message}")
      }
    }
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

  private fun isMainThread(): Boolean = Looper.myLooper() === Looper.getMainLooper()

  /**
   * Runs [action] on the main thread for an SDK callback. The broadcast
   * receiver calls back on the main thread; the binder service calls the
   * device, app info, open and send listeners on a binder thread. A callback
   * off the main thread therefore proves that Garmin Connect delivers through
   * the binder ([onBinderDelivery]), which is what the probe waits for.
   */
  private fun postFromSdk(action: () -> Unit) {
    val viaBinder = !isMainThread()
    main.post {
      if (viaBinder) onBinderDelivery()
      action()
    }
  }

  private val deviceListener = ConnectIQ.IQDeviceEventListener { device, status ->
    postFromSdk { if (device != null) onDeviceStatus(device, status) }
  }

  /** One per watch, in broadcast mode; the SDK's receiver calls it on the main thread. */
  private val appListener = ConnectIQ.IQApplicationEventListener { device, _, messageData, status ->
    onAppMessage(device, messageData, status)
  }

  /**
   * The SDK's single listener for messages through the binder service. It
   * gets every message Garmin Connect delivers there, from any watch, known
   * to the link or not, with whatever app id Garmin Connect names, so the id
   * is checked here. Messages come on the main thread, apart from an empty
   * one, which is reported on the binder thread. It is set right after
   * each initialize rather than after onSdkReady: Garmin Connect, holding a
   * registration, delivers as soon as it has bound the service (the bind that
   * starts this process), and the SDK drops a message that finds no listener.
   * The broadcast receiver never calls it.
   */
  private val binderAppListener = ConnectIQ.IQApplicationEventListener { device, app, messageData, status ->
    main.post { onBinderDelivery() }
    if (!isGarminAppId(app?.applicationId)) {
      Log.w(TAG, "Ignored a Garmin message for app ${app?.applicationId}")
      return@IQApplicationEventListener
    }
    onAppMessage(device, messageData, status)
  }

  private fun onAppMessage(device: IQDevice?, messageData: List<Any?>?, status: ConnectIQ.IQMessageStatus?) {
    if (device == null) return
    if (status != ConnectIQ.IQMessageStatus.SUCCESS) {
      Log.w(TAG, "Garmin message could not be read: $status")
      return
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
          // In binder mode every watch's messages reach binderAppListener. The
          // per-watch registration is the broadcast one (it asks Garmin
          // Connect for broadcasts) and the SDK says not to use it there.
          if (!binderMode) ciq.registerForAppEvents(device, app, appListener)
          // The simulator's SDK names every message's app "" (and the
          // device "Simulator"), whatever app runs in the simulator.
          if (simulator) ciq.registerForAppEvents(device, IQApp(""), appListener)
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
      for (entry in devices.values.toList()) {
        val reason = if (entry.id in pendingRequests) GarminResyncReason.REQUESTED else GarminResyncReason.READY
        resync(entry, reason)
      }
      pendingRequests.clear()
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
    // The simulator runs this app by definition, and its SDK throws while no
    // simulator is connected.
    if (simulator) {
      if (entry.connected) setAppState(entry.id, GarminAppState.INSTALLED)
      return
    }
    try {
      ciq.getApplicationInfo(GARMIN_APP_ID, entry.device, appInfoListener(entry.id))
    } catch (e: Throwable) {
      Log.w(TAG, "getApplicationInfo failed: ${e.message}")
      onSdkCallFailed(e)
    }
  }

  private fun appInfoListener(id: Long) = object : ConnectIQ.IQApplicationInfoListener {
    override fun onApplicationInfoReceived(info: IQApp?) {
      val appState = when (info?.status) {
        IQApp.IQAppStatus.INSTALLED -> GarminAppState.INSTALLED
        IQApp.IQAppStatus.NOT_INSTALLED, IQApp.IQAppStatus.NOT_SUPPORTED -> GarminAppState.NOT_INSTALLED
        else -> GarminAppState.UNKNOWN
      }
      postFromSdk { setAppStateFromInfo(id, appState) }
    }

    override fun onApplicationNotInstalled(applicationId: String?) {
      postFromSdk { setAppStateFromInfo(id, GarminAppState.NOT_INSTALLED) }
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
    if (!sdkReady) {
      // Only the binder service delivers this early: Garmin Connect hands the
      // message over as soon as it has bound it, before (or while) the SDK
      // gets ready. The ready resync answers it, as a request if it was one.
      if (requested) pendingRequests.add(id)
      return
    }
    // Through broadcasts the SDK delivers only from watches registered in
    // refreshDevices; through the binder service any watch can send, so one
    // paired since the link started is registered by reading the watches.
    var entry = devices[id]
    if (entry == null) {
      refreshDevices(sdkJustReady = false)
      entry = devices[id]
    }
    var justConnected = false
    if (entry != null) {
      // Only an installed, running app can send, whatever getApplicationInfo said.
      justConnected = updateConnection(entry, true)
      entry.heardSinceConnect = true
      setAppState(id, GarminAppState.INSTALLED)
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
    val action = GarminResyncPolicy.decide(
      jsListening = listener != null,
      jsHasListened = jsHasListened,
      reason = reason,
      hasCache = cache != null
    )
    when (action) {
      GarminResyncAction.EMIT_TO_JS -> listener?.emitEvent(
        "onGarminResync",
        mapOf("deviceId" to entry.id.toString(), "reason" to reason.wire)
      )
      GarminResyncAction.REPLAY_CACHE -> if (cache != null) {
        enqueueReplay(entry.id, cache, front = reason == GarminResyncReason.REQUESTED)
      }
      GarminResyncAction.SEND_ACCOUNT_CLEARED -> enqueueAccountCleared(entry.id, front = true)
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

  private fun enqueueAccountCleared(deviceId: Long, front: Boolean) {
    val job = SendJob(deviceId, GarminOutboundMessage.accountCleared(), replay = false, onResult = null)
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
    // Every message leaves with a `seq` above the last one's, stored first,
    // so the watch can tell a copy it gets again or late from a newer message
    // (a resend gets a new one too).
    // Set in start() before the SDK can be ready; the fallback is defensive.
    val origin = wireOrigin ?: GarminSendSequence.newOrigin().also { wireOrigin = it }
    val wireSeq = GarminSendSequence.next(lastWireSeq, System.currentTimeMillis())
    lastWireSeq = wireSeq
    saveWireSeq(wireSeq)
    if (simulator) {
      sendToSimulator(ciq, entry, job, seq, current, job.outbound.sentAs(wireSeq, origin))
      return
    }
    try {
      // The listener can run inside this call (a format error), so the result
      // is always handled on a later turn of the main loop.
      ciq.sendMessage(entry.device, app, job.outbound.sentAs(wireSeq, origin)) { _, _, status ->
        postFromSdk { onSendStatus(deviceId, seq, status) }
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
   * [send] for the simulator's SDK, which pauses to mimic Bluetooth speed and
   * then writes to its socket on the calling thread (a network call Android
   * refuses on the main thread). Its answer comes back on the main thread.
   */
  private fun sendToSimulator(
    ciq: ConnectIQ,
    entry: DeviceEntry,
    job: SendJob,
    seq: Long,
    current: InFlight,
    message: Map<String, Any>
  ) {
    val deviceId = entry.id
    val device = entry.device
    current.handedToSdk = true
    simulatorSender.execute {
      try {
        ciq.sendMessage(device, app, message) { _, _, status ->
          main.post { onSendStatus(deviceId, seq, status) }
        }
      } catch (e: Throwable) {
        Log.w(TAG, "Garmin ${label(job)} send to the simulator threw: ${e.message}")
        main.post { finishSend(seq, GarminSendResult.FAILED) }
      }
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
        "over $GARMIN_SEND_CAP_BYTES ($GARMIN_MESSAGE_BYTE_CAP less room for seq and origin); not sent"
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
    val delivery = when {
      !sdkReady -> GarminDelivery.NONE
      simulator -> GarminDelivery.SIMULATOR
      binderMode -> GarminDelivery.BINDER
      else -> GarminDelivery.BROADCAST
    }
    val next = statusMap(state, error, deviceList, delivery)
    if (next == currentStatus) return
    currentStatus = next
    WatchConnectivityHub.activeModule?.emitEvent("onGarminStatusChange", next)
  }

  private fun statusMap(
    state: LinkState,
    error: String?,
    deviceList: List<Map<String, Any>>,
    delivery: GarminDelivery
  ): Map<String, Any?> {
    val out = LinkedHashMap<String, Any?>()
    out["state"] = state.wire
    if (error != null) out["error"] = error
    out["devices"] = deviceList
    out["delivery"] = delivery.wire
    return out
  }

  // ---- Storage ----

  private fun prefs(context: Context): SharedPreferences =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  private fun linkPrefs(context: Context): SharedPreferences =
    context.getSharedPreferences(LINK_PREFS_NAME, Context.MODE_PRIVATE)

  // The link's own preferences are a few bytes and are already loaded at
  // process start, so they are read and written on the main thread: apply()
  // (disk write in the background) for the flag and the binder record,
  // commit() for the send number and origin (see saveWireSeq).
  private fun readWireSeq(context: Context): Long =
    try {
      linkPrefs(context).getLong(SEND_SEQ_KEY, 0L)
    } catch (e: Throwable) {
      0L
    }

  // commit(), not apply(): a number handed out must be on disk before the
  // message goes, or a process killed before the write, with the clock set
  // back, would hand it out again and the watch would drop that message.
  private fun saveWireSeq(seq: Long) {
    val ctx = appContext ?: return
    try {
      linkPrefs(ctx).edit().putLong(SEND_SEQ_KEY, seq).commit()
    } catch (e: Throwable) {
      Log.w(TAG, "Failed to store the Garmin send number: ${e.message}")
    }
  }

  // The stored origin when it was made by this install; otherwise (none yet,
  // or preferences Android restored on a reinstall or copied to another
  // phone) a new one, with its numbering started afresh.
  private fun readOrCreateWireOrigin(context: Context): String {
    val prefs = linkPrefs(context)
    val install = ownInstallTime(context)
    val stored = try {
      prefs.getString(SEND_ORIGIN_KEY, null)
    } catch (e: Throwable) {
      null
    }
    val storedInstall = try {
      prefs.getLong(SEND_INSTALL_KEY, 0L)
    } catch (e: Throwable) {
      0L
    }
    if (stored != null && GarminSendSequence.originIsCurrent(stored, storedInstall, install)) return stored
    val created = GarminSendSequence.newOrigin()
    try {
      val editor = prefs.edit().putString(SEND_ORIGIN_KEY, created).remove(SEND_SEQ_KEY).remove(BINDER_RECORD_KEY)
      if (install != null) editor.putLong(SEND_INSTALL_KEY, install)
      editor.commit()
    } catch (e: Throwable) {
      Log.w(TAG, "Failed to store the Garmin send origin: ${e.message}")
    }
    return created
  }

  /** This app's install time, or null when it cannot be read. */
  private fun ownInstallTime(context: Context): Long? = try {
    val pm = context.packageManager
    val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      pm.getPackageInfo(context.packageName, PackageManager.PackageInfoFlags.of(0))
    } else {
      @Suppress("DEPRECATION")
      pm.getPackageInfo(context.packageName, 0)
    }
    info.firstInstallTime
  } catch (e: Throwable) {
    null
  }

  private fun setEnabled(context: Context, enabled: Boolean) {
    try {
      val editor = linkPrefs(context).edit()
      if (enabled) editor.putBoolean(ENABLED_KEY, true) else editor.remove(ENABLED_KEY)
      editor.apply()
    } catch (e: Throwable) {
      Log.w(TAG, "Failed to store the Garmin link switch: ${e.message}")
    }
  }

  private fun readBinderRecord(context: Context): GarminBinderRecord? = try {
    GarminBinderRecord.decode(linkPrefs(context).getString(BINDER_RECORD_KEY, null))
  } catch (e: Throwable) {
    Log.w(TAG, "Failed to read the Garmin binder record: ${e.message}")
    null
  }

  private fun saveBinderRecord(outcome: GarminBinderOutcome) {
    val ctx = appContext ?: return
    val version = garminConnectVersion(ctx) ?: return
    storeBinderRecord(GarminBinderRecord(outcome, version, System.currentTimeMillis()))
  }

  private fun storeBinderRecord(record: GarminBinderRecord) {
    binderRecord = record
    val ctx = appContext ?: return
    try {
      linkPrefs(ctx).edit().putString(BINDER_RECORD_KEY, record.encode()).apply()
    } catch (e: Throwable) {
      Log.w(TAG, "Failed to store the Garmin binder record: ${e.message}")
    }
  }

  private fun clearBinderRecord() {
    binderRecord = null
    val ctx = appContext ?: return
    try {
      linkPrefs(ctx).edit().remove(BINDER_RECORD_KEY).apply()
    } catch (e: Throwable) {
      Log.w(TAG, "Failed to delete the Garmin binder record: ${e.message}")
    }
  }

  /** Garmin Connect's version code, or null when it is not installed. */
  private fun garminConnectVersion(context: Context): Long? = try {
    val pm = context.packageManager
    val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      pm.getPackageInfo(GARMIN_CONNECT_PACKAGE, PackageManager.PackageInfoFlags.of(0))
    } else {
      @Suppress("DEPRECATION")
      pm.getPackageInfo(GARMIN_CONNECT_PACKAGE, 0)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      info.longVersionCode
    } else {
      @Suppress("DEPRECATION")
      info.versionCode.toLong()
    }
  } catch (_: Throwable) {
    null
  }

  /** What the stored snapshot read gave: a message, nothing stored, or a failure. */
  private class CacheRead(val message: GarminOutboundMessage?, val failed: Boolean)

  private fun readCache(context: Context): CacheRead {
    return try {
      val prefs = prefs(context)
      val json = prefs.getString(GARMIN_SNAPSHOT_CACHE_KEY, null)
        ?: return CacheRead(null, failed = false)
      // Written by another install (restored from a backup or copied from
      // another phone): no account here has published it, so it reads as
      // empty, and goes.
      val install = ownInstallTime(context)
      if (install != null && prefs.getLong(GARMIN_SNAPSHOT_INSTALL_KEY, 0L) != install) {
        prefs.edit().remove(GARMIN_SNAPSHOT_CACHE_KEY).remove(GARMIN_SNAPSHOT_INSTALL_KEY).apply()
        return CacheRead(null, failed = false)
      }
      val message = GarminOutboundMessage.fromJson(json)
      if (message == null) Log.w(TAG, "The stored Garmin snapshot could not be parsed")
      CacheRead(message, failed = message == null)
    } catch (e: Throwable) {
      Log.w(TAG, "Failed to read the Garmin snapshot: ${e.message}")
      CacheRead(null, failed = true)
    }
  }
}
