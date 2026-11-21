package expo.modules.watchconnectivity

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.media.MediaMetadata
import android.media.VolumeProvider
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import android.view.KeyEvent
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.concurrent.ConcurrentHashMap

private const val MEDIA_TAG = "PhoneMediaBridge"
private const val MEDIA_PREFS_NAME = "sparky_phone_media_bridge"
private const val KEY_SNAPSHOT_EPOCH = "snapshot_epoch"
private const val VOLUME_CHANGED_ACTION = "android.media.VOLUME_CHANGED_ACTION"
private const val EXTRA_VOLUME_STREAM_TYPE = "android.media.EXTRA_VOLUME_STREAM_TYPE"
private const val AUTO_STOP_OBSERVING_MS = 15 * 60_000L
private const val FOLLOW_UP_SYNC_DELAY_MS = 350L

/**
 * Bridges active phone media playback state and controls to the Wear OS
 * companion app.
 *
 * - Transport commands (`playPause`, `play`, `pause`, `next`, `previous`) and
 *   volume adjustments work out of the box with zero extra permissions via
 *   [AudioManager] fallback.
 * - When the user optionally enables Notification Access for
 *   [SparkyMediaListenerService], this bridge also reads active
 *   [MediaSessionManager] sessions for real-time track title, artist, album,
 *   source app, and direct [MediaController.TransportControls] dispatch.
 */
internal object PhoneMediaBridge {
  private val mainHandler = Handler(Looper.getMainLooper())
  private val appLabelCache = ConcurrentHashMap<String, String>()

  private var observing = false
  private var observationGeneration = 0L
  private var activeVisitEpoch = 0L
  private var activeVisitId = 0L
  private var activeVisitStopped = false
  private var snapshotEpoch = 0L
  private var snapshotSeq = 0L
  private var lastSnapshotTimestampMs = 0L
  private var observedAppContext: Context? = null
  private var sessionsChangedListener: MediaSessionManager.OnActiveSessionsChangedListener? = null
  private var boundController: MediaController? = null
  private var boundCallback: MediaController.Callback? = null
  private var volumeReceiver: BroadcastReceiver? = null
  private var autoStopRunnable: Runnable? = null

  private data class MediaSnapshotKey(
    val title: String?,
    val artist: String?,
    val album: String?,
    val appName: String?,
    val isPlaying: Boolean,
    val volume: Int,
    val maxVolume: Int,
    val hasSession: Boolean,
    val hasMetadataAccess: Boolean
  )

  private sealed interface VolumeEndpoint {
    data class RemoteAdjustable(val controller: MediaController, val info: MediaController.PlaybackInfo) : VolumeEndpoint
    data object RemoteFixed : VolumeEndpoint
    data object LocalStream : VolumeEndpoint
  }

  @Volatile
  private var lastSentSnapshot: MediaSnapshotKey? = null

  @Volatile
  private var followUpJob: Job? = null

  fun isMediaAccessEnabled(context: Context): Boolean {
    val appCtx = context.applicationContext
    val cn = SparkyMediaListenerService.componentName(appCtx)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      val nm = appCtx.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
      if (nm != null) {
        return try {
          nm.isNotificationListenerAccessGranted(cn)
        } catch (_: Throwable) {
          isEnabledViaSecureSettings(appCtx, cn)
        }
      }
    }
    return isEnabledViaSecureSettings(appCtx, cn)
  }

  private fun isEnabledViaSecureSettings(context: Context, target: ComponentName): Boolean {
    return try {
      val flat = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners")
        ?: return false
      flat.split(':').any { entry ->
        ComponentName.unflattenFromString(entry) == target
      }
    } catch (_: Throwable) {
      false
    }
  }

  fun openMediaAccessSettings(context: Context) {
    val appCtx = context.applicationContext
    val cn = SparkyMediaListenerService.componentName(appCtx)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val detailIntent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS).apply {
        putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, cn.flattenToString())
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      try {
        appCtx.startActivity(detailIntent)
        return
      } catch (_: Throwable) {
        // Fall back to the general Notification Access list below.
      }
    }
    val fallbackIntent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    appCtx.startActivity(fallbackIntent)
  }

  fun onListenerConnectionChanged(context: Context, connected: Boolean) {
    val appCtx = context.applicationContext
    mainHandler.post {
      if (!observing) return@post
      if (connected) {
        attachSessionObserversOnMain(appCtx)
      } else {
        detachSessionObserversOnMain(appCtx)
      }
      pushStateSnapshot(appCtx, force = true)
    }
  }

  private fun compareVisit(
    epoch: Long,
    visitId: Long,
    activeEpoch: Long,
    activeId: Long
  ): Int {
    return if (epoch != activeEpoch) {
      epoch.compareTo(activeEpoch)
    } else {
      visitId.compareTo(activeId)
    }
  }

  private fun ensureSnapshotEpochOnMain(appCtx: Context): Long {
    if (snapshotEpoch > 0L) return snapshotEpoch
    val now = System.currentTimeMillis()
    val next = try {
      val prefs = appCtx.getSharedPreferences(MEDIA_PREFS_NAME, Context.MODE_PRIVATE)
      val stored = prefs.getLong(KEY_SNAPSHOT_EPOCH, 0L)
      val computed = maxOf(stored + 1L, now)
      prefs.edit().putLong(KEY_SNAPSHOT_EPOCH, computed).apply()
      computed
    } catch (_: Throwable) {
      maxOf(1L, now)
    }
    snapshotEpoch = next
    return next
  }

  fun setWatchObserving(
    context: Context,
    active: Boolean,
    epoch: Long? = null,
    visitId: Long? = null
  ) {
    val appCtx = context.applicationContext
    mainHandler.post {
      val incomingEpoch = epoch ?: 0L
      if (active) {
        if (visitId != null) {
          val cmp = compareVisit(incomingEpoch, visitId, activeVisitEpoch, activeVisitId)
          if (cmp < 0 || (cmp == 0 && activeVisitStopped)) {
            return@post
          }
          activeVisitEpoch = incomingEpoch
          activeVisitId = visitId
          activeVisitStopped = false
        }
        val wasObserving = observing
        observedAppContext = appCtx
        if (!wasObserving) {
          observationGeneration += 1
          observing = true
          rescheduleAutoStopOnMain(appCtx)
          detachVolumeReceiverOnMain(appCtx)
          attachVolumeReceiverOnMain(appCtx)
          attachSessionObserversOnMain(appCtx)
        } else {
          // Renew the lease without tearing down healthy observer registrations.
          rescheduleAutoStopOnMain(appCtx)
          if (volumeReceiver == null) {
            attachVolumeReceiverOnMain(appCtx)
          }
          if (isMediaAccessEnabled(appCtx) && sessionsChangedListener == null) {
            attachSessionObserversOnMain(appCtx)
          }
        }
        // Always reply to explicit requests so a dropped send during a disconnect can recover.
        pushStateSnapshot(appCtx, force = true)
      } else {
        if (visitId != null) {
          val cmp = compareVisit(incomingEpoch, visitId, activeVisitEpoch, activeVisitId)
          if (cmp < 0) {
            return@post
          }
          activeVisitEpoch = incomingEpoch
          activeVisitId = visitId
          activeVisitStopped = true
        }
        stopObservingOnMain()
      }
    }
  }

  fun handleCommand(context: Context, action: String, steps: Int = 1) {
    if (action.isBlank()) return
    val stepCount = steps.coerceIn(1, 5)
    val appCtx = context.applicationContext
    mainHandler.post {
      if (observing) {
        rescheduleAutoStopOnMain(appCtx)
      }
      val audioManager = appCtx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
      val controller = resolveActiveController(appCtx)
      if (observing && controller != null) {
        bindControllerOnMain(appCtx, controller)
      }
      var isTransport = false

      when (action) {
        "playPause", "play", "pause", "next", "previous" -> {
          isTransport = true
          val handled = controller != null && dispatchTransportToController(controller, action)
          if (!handled && audioManager != null) {
            val fallbackKey = when (action) {
              "playPause" -> KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
              "play" -> KeyEvent.KEYCODE_MEDIA_PLAY
              "pause" -> KeyEvent.KEYCODE_MEDIA_PAUSE
              "next" -> KeyEvent.KEYCODE_MEDIA_NEXT
              "previous" -> KeyEvent.KEYCODE_MEDIA_PREVIOUS
              else -> KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
            }
            dispatchMediaKey(audioManager, fallbackKey)
          }
        }
        "volumeUp", "volumeDown" -> {
          val direction = if (action == "volumeUp") {
            AudioManager.ADJUST_RAISE
          } else {
            AudioManager.ADJUST_LOWER
          }
          when (val endpoint = resolveVolumeEndpoint(controller)) {
            is VolumeEndpoint.RemoteAdjustable -> {
              try {
                repeat(stepCount) {
                  endpoint.controller.adjustVolume(direction, AudioManager.FLAG_SHOW_UI)
                }
              } catch (e: Throwable) {
                Log.w(MEDIA_TAG, "controller.adjustVolume failed: ${e.message}")
              }
            }
            VolumeEndpoint.RemoteFixed -> {
              // Fixed-volume remote routes cannot be adjusted and must not mutate handset volume.
            }
            VolumeEndpoint.LocalStream -> {
              try {
                repeat(stepCount) {
                  audioManager?.adjustStreamVolume(
                    AudioManager.STREAM_MUSIC,
                    direction,
                    AudioManager.FLAG_SHOW_UI
                  )
                }
              } catch (_: Throwable) {}
            }
          }
        }
        else -> return@post
      }

      pushStateSnapshot(appCtx, force = true)
      if (isTransport) {
        followUpJob?.cancel()
        followUpJob = WatchConnectivityHub.scope.launch {
          delay(FOLLOW_UP_SYNC_DELAY_MS)
          mainHandler.post {
            pushStateSnapshot(appCtx, force = false)
          }
        }
      }
    }
  }

  private fun dispatchTransportToController(controller: MediaController, action: String): Boolean {
    val actions = controller.playbackState?.actions ?: 0L
    return try {
      when (action) {
        "playPause" -> {
          val playing = isControllerActivelyPlaying(controller)
          when {
            playing && (actions and PlaybackState.ACTION_PAUSE) != 0L -> {
              controller.transportControls.pause()
              true
            }
            !playing && (actions and PlaybackState.ACTION_PLAY) != 0L -> {
              controller.transportControls.play()
              true
            }
            else -> dispatchMediaKeyToController(controller, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE)
          }
        }
        "play" -> {
          if ((actions and PlaybackState.ACTION_PLAY) != 0L) {
            controller.transportControls.play()
            true
          } else {
            dispatchMediaKeyToController(controller, KeyEvent.KEYCODE_MEDIA_PLAY)
          }
        }
        "pause" -> {
          if ((actions and PlaybackState.ACTION_PAUSE) != 0L) {
            controller.transportControls.pause()
            true
          } else {
            dispatchMediaKeyToController(controller, KeyEvent.KEYCODE_MEDIA_PAUSE)
          }
        }
        "next" -> {
          if ((actions and PlaybackState.ACTION_SKIP_TO_NEXT) != 0L) {
            controller.transportControls.skipToNext()
            true
          } else {
            dispatchMediaKeyToController(controller, KeyEvent.KEYCODE_MEDIA_NEXT)
          }
        }
        "previous" -> {
          if ((actions and PlaybackState.ACTION_SKIP_TO_PREVIOUS) != 0L) {
            controller.transportControls.skipToPrevious()
            true
          } else {
            dispatchMediaKeyToController(controller, KeyEvent.KEYCODE_MEDIA_PREVIOUS)
          }
        }
        else -> false
      }
    } catch (_: Throwable) {
      false
    }
  }

  private fun dispatchMediaKeyToController(controller: MediaController, keyCode: Int): Boolean {
    val now = SystemClock.uptimeMillis()
    val downSent = controller.dispatchMediaButtonEvent(
      KeyEvent(now, now, KeyEvent.ACTION_DOWN, keyCode, 0)
    )
    val upSent = controller.dispatchMediaButtonEvent(
      KeyEvent(now, now, KeyEvent.ACTION_UP, keyCode, 0)
    )
    return downSent || upSent
  }

  private fun dispatchMediaKey(audioManager: AudioManager, keyCode: Int) {
    try {
      val now = SystemClock.uptimeMillis()
      audioManager.dispatchMediaKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_DOWN, keyCode, 0))
      audioManager.dispatchMediaKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_UP, keyCode, 0))
    } catch (e: Throwable) {
      Log.w(MEDIA_TAG, "dispatchMediaKeyEvent($keyCode) failed: ${e.message}")
    }
  }

  private fun rescheduleAutoStopOnMain(appCtx: Context) {
    autoStopRunnable?.let { mainHandler.removeCallbacks(it) }
    val runnable = Runnable { stopObservingOnMain() }
    autoStopRunnable = runnable
    mainHandler.postDelayed(runnable, AUTO_STOP_OBSERVING_MS)
  }

  private fun stopObservingOnMain() {
    observationGeneration += 1
    observing = false
    autoStopRunnable?.let { mainHandler.removeCallbacks(it) }
    autoStopRunnable = null
    followUpJob?.cancel()
    followUpJob = null
    val appCtx = observedAppContext
    if (appCtx != null) {
      detachSessionObserversOnMain(appCtx)
      detachVolumeReceiverOnMain(appCtx)
    }
    observedAppContext = null
    lastSentSnapshot = null
  }

  private fun attachVolumeReceiverOnMain(appCtx: Context) {
    if (volumeReceiver != null) return
    val gen = observationGeneration
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        if (!observing || gen != observationGeneration || volumeReceiver !== this) return
        if (intent?.action != VOLUME_CHANGED_ACTION) return
        val stream = intent.getIntExtra(EXTRA_VOLUME_STREAM_TYPE, -1)
        if (stream == AudioManager.STREAM_MUSIC || stream == -1) {
          pushStateSnapshot(appCtx, force = false)
        }
      }
    }
    val filter = IntentFilter(VOLUME_CHANGED_ACTION)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        appCtx.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        @Suppress("DEPRECATION")
        appCtx.registerReceiver(receiver, filter)
      }
      volumeReceiver = receiver
    } catch (e: Throwable) {
      Log.w(MEDIA_TAG, "registerReceiver(VOLUME_CHANGED_ACTION) failed: ${e.message}")
    }
  }

  private fun detachVolumeReceiverOnMain(appCtx: Context) {
    val receiver = volumeReceiver ?: return
    volumeReceiver = null
    try {
      appCtx.unregisterReceiver(receiver)
    } catch (_: Throwable) {}
  }

  private fun attachSessionObserversOnMain(appCtx: Context) {
    detachSessionObserversOnMain(appCtx)
    if (!observing || !isMediaAccessEnabled(appCtx)) return
    val msm = appCtx.getSystemService(Context.MEDIA_SESSION_SERVICE) as? MediaSessionManager ?: return
    val cn = SparkyMediaListenerService.componentName(appCtx)
    val gen = observationGeneration
    lateinit var listener: MediaSessionManager.OnActiveSessionsChangedListener
    listener = MediaSessionManager.OnActiveSessionsChangedListener { controllers ->
      if (!observing || gen != observationGeneration || sessionsChangedListener !== listener) return@OnActiveSessionsChangedListener
      val preferred = selectPreferredController(controllers.orEmpty(), appCtx.packageName)
      bindControllerOnMain(appCtx, preferred)
      pushStateSnapshot(appCtx, force = false)
    }
    var registered = false
    try {
      msm.addOnActiveSessionsChangedListener(listener, cn, mainHandler)
      sessionsChangedListener = listener
      registered = true
      val active = msm.getActiveSessions(cn)
      bindControllerOnMain(appCtx, selectPreferredController(active, appCtx.packageName))
    } catch (e: SecurityException) {
      Log.w(MEDIA_TAG, "MediaSessionManager access denied: ${e.message}")
      if (registered) {
        try {
          msm.removeOnActiveSessionsChangedListener(listener)
        } catch (_: Throwable) {}
      }
      sessionsChangedListener = null
    } catch (e: Throwable) {
      Log.w(MEDIA_TAG, "Failed to observe active media sessions: ${e.message}")
      if (registered) {
        try {
          msm.removeOnActiveSessionsChangedListener(listener)
        } catch (_: Throwable) {}
      }
      sessionsChangedListener = null
    }
  }

  private fun detachSessionObserversOnMain(appCtx: Context) {
    unbindControllerOnMain()
    val listener = sessionsChangedListener ?: return
    sessionsChangedListener = null
    try {
      val msm = appCtx.getSystemService(Context.MEDIA_SESSION_SERVICE) as? MediaSessionManager
      msm?.removeOnActiveSessionsChangedListener(listener)
    } catch (_: Throwable) {}
  }

  private fun bindControllerOnMain(appCtx: Context, controller: MediaController?) {
    if (!observing) {
      unbindControllerOnMain()
      return
    }
    if (boundController?.sessionToken == controller?.sessionToken) return
    unbindControllerOnMain()
    if (controller == null) return
    val gen = observationGeneration
    val callback = object : MediaController.Callback() {
      override fun onPlaybackStateChanged(state: PlaybackState?) {
        if (!observing || gen != observationGeneration || boundCallback !== this) return
        pushStateSnapshot(appCtx, force = false)
      }

      override fun onMetadataChanged(metadata: MediaMetadata?) {
        if (!observing || gen != observationGeneration || boundCallback !== this) return
        pushStateSnapshot(appCtx, force = false)
      }

      override fun onAudioInfoChanged(info: MediaController.PlaybackInfo) {
        if (!observing || gen != observationGeneration || boundCallback !== this) return
        pushStateSnapshot(appCtx, force = false)
      }

      override fun onSessionDestroyed() {
        if (!observing || gen != observationGeneration || boundCallback !== this) return
        unbindControllerOnMain()
        val next = resolveActiveController(appCtx)
        if (observing && gen == observationGeneration && next != null) {
          bindControllerOnMain(appCtx, next)
        }
        pushStateSnapshot(appCtx, force = false)
      }
    }
    try {
      controller.registerCallback(callback, mainHandler)
      boundController = controller
      boundCallback = callback
    } catch (_: Throwable) {}
  }

  private fun unbindControllerOnMain() {
    val controller = boundController
    val callback = boundCallback
    boundController = null
    boundCallback = null
    if (controller != null && callback != null) {
      try {
        controller.unregisterCallback(callback)
      } catch (_: Throwable) {}
    }
  }

  private fun resolveActiveController(appCtx: Context): MediaController? {
    if (!isMediaAccessEnabled(appCtx)) return null
    val msm = appCtx.getSystemService(Context.MEDIA_SESSION_SERVICE) as? MediaSessionManager ?: return null
    val cn = SparkyMediaListenerService.componentName(appCtx)
    val controllers = try {
      msm.getActiveSessions(cn)
    } catch (_: Throwable) {
      emptyList()
    }
    return selectPreferredController(controllers, appCtx.packageName)
  }

  private fun selectPreferredController(
    controllers: List<MediaController>,
    ownPackage: String
  ): MediaController? {
    val external = controllers.filter { it.packageName != ownPackage }
    if (external.isEmpty()) return null
    external.firstOrNull { isControllerActivelyPlaying(it) }?.let { return it }
    external.firstOrNull { controller ->
      val state = controller.playbackState?.state ?: PlaybackState.STATE_NONE
      state != PlaybackState.STATE_ERROR && hasDisplayMetadata(controller.metadata)
    }?.let { return it }
    return external.firstOrNull()
  }

  private fun resolveVolumeEndpoint(controller: MediaController?): VolumeEndpoint {
    val info = controller?.playbackInfo ?: return VolumeEndpoint.LocalStream
    if (info.playbackType != MediaController.PlaybackInfo.PLAYBACK_TYPE_REMOTE) {
      return VolumeEndpoint.LocalStream
    }
    if (info.volumeControl == VolumeProvider.VOLUME_CONTROL_FIXED || info.maxVolume <= 0) {
      return VolumeEndpoint.RemoteFixed
    }
    return VolumeEndpoint.RemoteAdjustable(controller, info)
  }

  private fun isControllerActivelyPlaying(controller: MediaController): Boolean {
    val state = controller.playbackState?.state ?: return false
    return state == PlaybackState.STATE_PLAYING ||
      state == PlaybackState.STATE_BUFFERING ||
      state == PlaybackState.STATE_FAST_FORWARDING ||
      state == PlaybackState.STATE_REWINDING
  }

  private fun hasDisplayMetadata(metadata: MediaMetadata?): Boolean {
    if (metadata == null) return false
    return extractTitle(metadata) != null || extractArtist(metadata) != null
  }

  private fun extractTitle(metadata: MediaMetadata?): String? {
    if (metadata == null) return null
    return metadata.getString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE)?.trim()?.takeIf { it.isNotEmpty() }
      ?: metadata.getString(MediaMetadata.METADATA_KEY_TITLE)?.trim()?.takeIf { it.isNotEmpty() }
  }

  private fun extractArtist(metadata: MediaMetadata?): String? {
    if (metadata == null) return null
    return metadata.getString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE)?.trim()?.takeIf { it.isNotEmpty() }
      ?: metadata.getString(MediaMetadata.METADATA_KEY_ARTIST)?.trim()?.takeIf { it.isNotEmpty() }
      ?: metadata.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST)?.trim()?.takeIf { it.isNotEmpty() }
      ?: metadata.getString(MediaMetadata.METADATA_KEY_ALBUM)?.trim()?.takeIf { it.isNotEmpty() }
  }

  private fun extractAlbum(metadata: MediaMetadata?): String? {
    return metadata?.getString(MediaMetadata.METADATA_KEY_ALBUM)?.trim()?.takeIf { it.isNotEmpty() }
  }

  private fun resolveAppLabel(appCtx: Context, packageName: String?): String? {
    if (packageName.isNullOrBlank()) return null
    appLabelCache[packageName]?.let { return it }
    return try {
      val pm = appCtx.packageManager
      val appInfo = pm.getApplicationInfo(packageName, 0)
      val label = pm.getApplicationLabel(appInfo)?.toString()?.trim()?.takeIf { it.isNotEmpty() }
      if (label != null) {
        if (appLabelCache.size > 32) appLabelCache.clear()
        appLabelCache[packageName] = label
      }
      label
    } catch (_: Throwable) {
      null
    }
  }

  private fun pushStateSnapshot(appCtx: Context, force: Boolean) {
    val hasAccess = isMediaAccessEnabled(appCtx)
    val controller = if (hasAccess) {
      resolveActiveController(appCtx).also { preferred ->
        if (observing) {
          bindControllerOnMain(appCtx, preferred)
        }
      }
    } else {
      if (observing) {
        unbindControllerOnMain()
      }
      null
    }
    val audioManager = appCtx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    val metadata = controller?.metadata
    val title = extractTitle(metadata)
    val artist = extractArtist(metadata)
    val album = extractAlbum(metadata)
    val appName = resolveAppLabel(appCtx, controller?.packageName)
    val isPlaying = when {
      controller != null -> isControllerActivelyPlaying(controller)
      audioManager != null -> try {
        audioManager.isMusicActive
      } catch (_: Throwable) {
        false
      }
      else -> false
    }
    val hasSession = controller != null || isPlaying

    val volume: Int
    val maxVolume: Int
    when (val endpoint = resolveVolumeEndpoint(controller)) {
      is VolumeEndpoint.RemoteAdjustable -> {
        volume = endpoint.info.currentVolume
        maxVolume = endpoint.info.maxVolume
      }
      VolumeEndpoint.RemoteFixed -> {
        volume = 0
        maxVolume = 0
      }
      VolumeEndpoint.LocalStream -> {
        if (audioManager != null) {
          volume = try {
            audioManager.getStreamVolume(AudioManager.STREAM_MUSIC)
          } catch (_: Throwable) {
            0
          }
          maxVolume = try {
            audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
          } catch (_: Throwable) {
            0
          }
        } else {
          volume = 0
          maxVolume = 0
        }
      }
    }

    val snapshotKey = MediaSnapshotKey(
      title = title,
      artist = artist,
      album = album,
      appName = appName,
      isPlaying = isPlaying,
      volume = volume,
      maxVolume = maxVolume,
      hasSession = hasSession,
      hasMetadataAccess = hasAccess
    )

    if (!force && snapshotKey == lastSentSnapshot) return
    lastSentSnapshot = snapshotKey

    val epoch = ensureSnapshotEpochOnMain(appCtx)
    val seq = ++snapshotSeq
    val now = System.currentTimeMillis()
    val updatedAt = maxOf(lastSnapshotTimestampMs + 1L, now)
    lastSnapshotTimestampMs = updatedAt

    val payload = mutableMapOf<String, Any?>(
      "type" to "mediaState",
      "isPlaying" to isPlaying,
      "volume" to volume,
      "maxVolume" to maxVolume,
      "hasSession" to hasSession,
      "hasMetadataAccess" to hasAccess,
      "epoch" to epoch.toDouble(),
      "seq" to seq.toDouble(),
      "updatedAt" to updatedAt.toDouble()
    )
    if (title != null) payload["title"] = title
    if (artist != null) payload["artist"] = artist
    if (album != null) payload["album"] = album
    if (appName != null) payload["appName"] = appName

    WatchConnectivityHub.scope.launch {
      WatchConnectivityHub.sendMessageOrTransfer(appCtx, payload, durable = false)
    }
  }
}
