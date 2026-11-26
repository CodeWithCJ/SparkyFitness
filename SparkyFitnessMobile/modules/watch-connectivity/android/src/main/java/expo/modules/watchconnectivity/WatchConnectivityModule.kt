package expo.modules.watchconnectivity

import android.app.Activity
import android.app.Application
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import androidx.wear.remote.interactions.RemoteActivityHelper
import com.facebook.react.bridge.ReadableMap
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.wearable.Asset
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.security.KeyStore
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.util.LinkedHashMap
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private const val TAG = "WatchConnectivity"
private const val PREFS_NAME = "sparky_watch_connectivity"
private const val TELEMETRY_OWNER_KEY = "sparky.watchTelemetryOwner"
private const val PAIRED_CACHE_KEY = "sparky.watchPairedCache"
private const val SERVER_URL_KEY = "sparky.serverBaseUrl"
private const val SERVER_HEADERS_KEY = "sparky.serverHeadersJson"
private const val ENCRYPTED_HEADERS_KEY = "sparky.serverHeadersEncrypted"
private const val CREDENTIALS_GENERATION_KEY = "credentials_generation"
private const val CREDENTIALS_TRANSPORT_REV_KEY = "sparky.credentialsTransportRevision"
private const val LAST_RECORDED_TRANSPORT_GEN_KEY = "sparky.lastRecordedTransportGen"
private const val LAST_RECORDED_MTLS_KEY = "sparky.lastRecordedRequiresMtls"
private const val PENDING_REVOCATION_GENERATION_KEY = "sparky.pendingRevocationGeneration"
private const val LAST_REVOKED_CONTEXT_GEN_KEY = "sparky.lastRevokedContextGeneration"
private const val LAST_REVOKED_CREDENTIALS_GEN_KEY = "sparky.lastRevokedCredentialsGeneration"
private const val LAST_REVOKED_MARKER_GEN_KEY = "sparky.lastRevokedMarkerGeneration"
private const val SETTLED_FAST_END_IDS_KEY = "sparky.settledFastEndClientIds"
private const val SETTLED_FAST_START_IDS_KEY = "sparky.settledFastStartClientIds"
private const val CANCELLED_WATER_TAP_IDS_KEY = "sparky.cancelledWaterTapIds"
private const val CREATED_WATER_ENTRY_IDS_KEY = "sparky.createdWaterEntryIds"
private const val UNCERTAIN_WATER_WRITES_KEY = "sparky.uncertainWaterWrites"
private const val CREDENTIALS_KEY_ALIAS = "sparky_watch_credentials_key"
private const val LAST_CONTEXT_JSON_KEY = "sparky.lastContextJson"
private const val LAST_CACHED_CONTEXT_SEQ_KEY = "sparky.lastCachedContextSeq"
private const val LAST_PUBLISHED_CONTEXT_GEN_KEY = "sparky.lastPublishedContextGen"
private const val LAST_PUBLISHED_CONTEXT_SEQ_KEY = "sparky.lastPublishedContextSeq"
private const val LAST_ACKED_CREDENTIALS_GEN_KEY = "sparky.lastAckedCredentialsGen"
private const val LAST_ACKED_CREDENTIALS_REV_KEY = "sparky.lastAckedCredentialsRev"
private const val PENDING_FORCED_CRED_REPUBLISH_GEN_KEY = "sparky.pendingForcedCredRepublishGen"
private const val PENDING_FORCED_CRED_REPUBLISH_REV_KEY = "sparky.pendingForcedCredRepublishRev"
private const val PENDING_ACKED_CRED_CLEANUP_GEN_KEY = "sparky.pendingAckedCredCleanupGen"
private const val PENDING_ACKED_CRED_CLEANUP_REV_KEY = "sparky.pendingAckedCredCleanupRev"
private const val LAST_COMPLICATION_CONFIG_JSON_KEY = "sparky.lastComplicationConfigJson"
private const val LAST_COMPLICATION_CONFIG_REV_KEY = "sparky.lastComplicationConfigRevision"
private const val HEART_RATE_QUEUE_LIMIT = 10_080
private const val HEART_RATE_BATCH_BYTE_LIMIT = 1_048_576
private const val RUN_QUEUE_LIMIT = 50
private const val INBOUND_QUEUE_LIMIT = 100
private const val FOREGROUND_FAST_START_TTL_MS = 60_000L
private const val HEADLESS_HTTP_OWNER_RETIRED = -2
private const val COMMITTED_WATER_TAP_NO_ROW_ID = "__committed_no_row_id__"

internal object WatchConnectivityHub {
  private data class InFlightForegroundFastStart(
    val ownerId: String,
    val clientId: String,
    val dispatchedAtMs: Long
  )

  val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val remoteExecutor = Executors.newSingleThreadExecutor()

  val isSupportedFlag = AtomicBoolean(false)
  val isPairedFlag = AtomicBoolean(false)
  val isReachableFlag = AtomicBoolean(false)
  val isAppInForeground = AtomicBoolean(false)
  val lastWorkoutArmedAtMs = AtomicLong(0L)
  private val lifecycleRegistered = AtomicBoolean(false)
  private var startedActivitiesCount = 0

  @Volatile
  var activeModule: WatchConnectivityModule? = null

  private val hrLock = Any()
  private var hrQueueLoaded = false
  private val hrQueue = mutableListOf<QueuedHrBatch>()
  private var droppedHrBatches = 0

  private val runLock = Any()
  private var runQueueLoaded = false
  private val runQueue = mutableListOf<Map<String, Any?>>()

  private val inboundLock = Any()
  private val inFlightForegroundFastStarts = mutableListOf<InFlightForegroundFastStart>()
  private val recentlyExpiredForegroundFastStarts = LinkedHashMap<String, String>()
  private val waterCancelLock = Any()
  private var waterCancelStateLoaded = false
  private val cancelledWaterTapIdsByOwner = HashMap<String, LinkedHashSet<String>>()
  private val createdWaterEntryIdByOwnerClient = HashMap<String, LinkedHashMap<String, String>>()
  private val uncertainWaterWritesByOwnerClient = HashMap<String, LinkedHashMap<String, String>>()
  private val credentialPublishRetryLock = Any()
  private var credentialPublishRetryJob: Job? = null
  private var credentialPublishRetryGeneration = 0L
  private var credentialPublishRetryRevision = 0L
  private var credentialPublishRetryAttempt = 0
  private val complicationConfigMutex = Mutex()
  private val credentialsStateLock = Any()
  private val credentialsMutex = Mutex()
  private var pendingRevocationGeneration = 0L
  private var lastRevokedContextGeneration = 0L
  private var lastRevokedCredentialsGeneration = 0L
  private var lastRevokedMarkerGeneration = 0L
  private var lastRevokedTransportGeneration = 0L
  private var lastPublishedTransportGeneration = 0L
  private var lastPublishedTransportRevision = 0L
  private var lastPublishedRequiresMtls: Boolean? = null
  private var lastPublishedContextGeneration = 0L
  private var lastPublishedContextSeq = 0L
  val nextContextIngressSeq = AtomicLong(0L)
  private var highestAcceptedIngressSeq = 0L

  private val REVOCATION_RETRY_DELAYS_MS = longArrayOf(2_000L, 5_000L, 12_000L, 30_000L)
  private val revocationRetryLock = Any()
  private var revocationRetryJob: Job? = null
  private var revocationRetryGeneration = 0L
  private var revocationRetryAttempt = 0

  private data class RevocationWatermarks(
    val pending: Long,
    val revokedCtx: Long,
    val revokedCreds: Long,
    val revokedMarker: Long
  ) {
    val hasUnfinished: Boolean
      get() = pending > revokedCtx || pending > revokedCreds || pending > revokedMarker
  }

  private val headlessMedicationMutexLock = Any()
  private val headlessMedicationMutexes = LinkedHashMap<String, Mutex>(64, 0.75f, true)
  private val headlessWaterMutexLock = Any()
  private val headlessWaterMutexes = LinkedHashMap<String, Mutex>(32, 0.75f, true)
  private val headlessCheckInMutexLock = Any()
  private val headlessCheckInMutexes = LinkedHashMap<String, Mutex>(32, 0.75f, true)
  private val headlessFastMutexLock = Any()
  private val headlessFastMutexes = LinkedHashMap<String, Mutex>(32, 0.75f, true)

  data class HeadlessCredentials(
    val appCtx: Context,
    val ownerId: String,
    val baseUrl: String,
    val headers: Map<String, String>,
    val generation: Long
  )

  private data class CredentialTransportSnapshot(
    val generation: Long,
    val ownerId: String,
    val baseUrl: String?,
    val headersObj: JSONObject?
  )

  private data class CredentialSyncEval(
    val snap: CredentialTransportSnapshot,
    val unfinishedRevokeNow: Boolean,
    val transportRev: Long,
    val alreadyAcked: Boolean
  )

  data class QueuedHrBatch(
    val event: Map<String, Any?>,
    val fileName: String,
    var stored: Boolean
  )

  fun initialize(context: Context) {
    val appCtx = context.applicationContext
    if (lifecycleRegistered.compareAndSet(false, true)) {
      (appCtx as? Application)?.registerActivityLifecycleCallbacks(
        object : Application.ActivityLifecycleCallbacks {
          override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
          override fun onActivityStarted(activity: Activity) {
            val enteredForeground = synchronized(this) {
              val wasBackground = startedActivitiesCount == 0
              startedActivitiesCount += 1
              isAppInForeground.set(startedActivitiesCount > 0)
              wasBackground
            }
            if (enteredForeground && activeModule != null) {
              flushQueuedInboundEvents(appCtx)
            }
          }
          override fun onActivityResumed(activity: Activity) {
            isAppInForeground.set(true)
          }
          override fun onActivityPaused(activity: Activity) {}
          override fun onActivityStopped(activity: Activity) {
            synchronized(this) {
              startedActivitiesCount = (startedActivitiesCount - 1).coerceAtLeast(0)
              isAppInForeground.set(startedActivitiesCount > 0)
            }
          }
          override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
          override fun onActivityDestroyed(activity: Activity) {}
        }
      )
    }
    val gmsAvailable = try {
      GoogleApiAvailability.getInstance()
        .isGooglePlayServicesAvailable(appCtx) == ConnectionResult.SUCCESS
    } catch (_: Throwable) {
      false
    }
    isSupportedFlag.set(gmsAvailable)
    ensureClientCertificateInstalled(appCtx)
    val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    if (prefs.getBoolean(PAIRED_CACHE_KEY, false)) {
      isPairedFlag.set(true)
    }
    if (!gmsAvailable) return

    refreshNodes(appCtx)
    scope.launch {
      syncCredentialsTransport(appCtx, forcePublish = false)
    }
  }

  private fun credentialsKey(): SecretKey {
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (ks.getEntry(CREDENTIALS_KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
    val spec = KeyGenParameterSpec.Builder(
      CREDENTIALS_KEY_ALIAS,
      KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
    )
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setKeySize(256)
      .build()
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
      init(spec)
      generateKey()
    }
  }

  private fun encryptHeaders(headersJson: String): String {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, credentialsKey())
    val ct = cipher.doFinal(headersJson.toByteArray(Charsets.UTF_8))
    val ivB64 = Base64.encodeToString(cipher.iv, Base64.NO_WRAP)
    val ctB64 = Base64.encodeToString(ct, Base64.NO_WRAP)
    return "$ivB64:$ctB64"
  }

  private fun decryptHeaders(blob: String): String {
    val parts = blob.split(":", limit = 2)
    require(parts.size == 2) { "Invalid encrypted headers format" }
    val iv = Base64.decode(parts[0], Base64.NO_WRAP)
    val ct = Base64.decode(parts[1], Base64.NO_WRAP)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, credentialsKey(), GCMParameterSpec(128, iv))
    return String(cipher.doFinal(ct), Charsets.UTF_8)
  }

  private fun ensureClientCertificateInstalled(context: Context) {
    try {
      val cls = Class.forName("expo.modules.clientcertificate.ClientCertificateStore")
      val instance = cls.getField("INSTANCE").get(null) ?: return
      val installMethod = cls.getMethod("install", Context::class.java, String::class.java)
      installMethod.invoke(instance, context.applicationContext, "WatchConnectivity")
    } catch (_: Throwable) {
      // Optional client-certificate module absent or unavailable.
    }
  }

  private fun isPhoneClientCertificateConfigured(context: Context): Boolean {
    ensureClientCertificateInstalled(context)
    return try {
      val cls = Class.forName("expo.modules.clientcertificate.ClientCertificateStore")
      val instance = cls.getField("INSTANCE").get(null) ?: return false
      val infoMethod = cls.getMethod("info")
      infoMethod.invoke(instance) != null
    } catch (_: Throwable) {
      false
    }
  }

  private fun invalidateCredentialsStateLocked(
    appCtx: Context,
    newOwnerId: String? = null
  ) {
    val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val nextGen = maxOf(
      prefs.getLong(CREDENTIALS_GENERATION_KEY, 0L),
      pendingRevocationGeneration,
      prefs.getLong(PENDING_REVOCATION_GENERATION_KEY, 0L)
    ) + 1L
    val nextTransportRev = maxOf(
      prefs.getLong(CREDENTIALS_TRANSPORT_REV_KEY, 0L),
      nextGen
    ) + 1L
    synchronized(hrLock) {
      val editor = prefs.edit()
        .remove(SERVER_URL_KEY)
        .remove(SERVER_HEADERS_KEY)
        .remove(ENCRYPTED_HEADERS_KEY)
        .remove(LAST_CONTEXT_JSON_KEY)
        .remove(SETTLED_FAST_END_IDS_KEY)
        .remove(SETTLED_FAST_START_IDS_KEY)
        .remove(CANCELLED_WATER_TAP_IDS_KEY)
        .remove(CREATED_WATER_ENTRY_IDS_KEY)
        .putLong(CREDENTIALS_GENERATION_KEY, nextGen)
        .putLong(CREDENTIALS_TRANSPORT_REV_KEY, nextTransportRev)
        .putLong(LAST_RECORDED_TRANSPORT_GEN_KEY, nextGen)
        .putInt(LAST_RECORDED_MTLS_KEY, -1)
        .putLong(PENDING_REVOCATION_GENERATION_KEY, nextGen)
        .remove(LAST_ACKED_CREDENTIALS_GEN_KEY)
        .remove(LAST_ACKED_CREDENTIALS_REV_KEY)
        .remove(PENDING_FORCED_CRED_REPUBLISH_GEN_KEY)
        .remove(PENDING_FORCED_CRED_REPUBLISH_REV_KEY)
        .remove(PENDING_ACKED_CRED_CLEANUP_GEN_KEY)
        .remove(PENDING_ACKED_CRED_CLEANUP_REV_KEY)
      if (newOwnerId != null) {
        editor.putString(TELEMETRY_OWNER_KEY, newOwnerId)
      }
      editor.apply()
    }
    pendingRevocationGeneration = maxOf(pendingRevocationGeneration, nextGen)
    lastPublishedRequiresMtls = null
    clearAllInFlightForegroundFastStarts()
    clearWaterCancellationState(appCtx)
    cancelCredentialPublishRetry()
    try {
      KeyStore.getInstance("AndroidKeyStore").apply {
        load(null)
        if (containsAlias(CREDENTIALS_KEY_ALIAS)) deleteEntry(CREDENTIALS_KEY_ALIAS)
      }
    } catch (e: Throwable) {
      Log.w(TAG, "Failed to delete credentials key: ${e.message}")
    }
  }

  private fun readRevocationWatermarksLocked(appCtx: Context): RevocationWatermarks {
    val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val pending = maxOf(
      pendingRevocationGeneration,
      prefs.getLong(PENDING_REVOCATION_GENERATION_KEY, 0L)
    )
    val revokedCtx = maxOf(
      lastRevokedContextGeneration,
      prefs.getLong(LAST_REVOKED_CONTEXT_GEN_KEY, 0L)
    )
    val revokedCreds = maxOf(
      lastRevokedCredentialsGeneration,
      prefs.getLong(LAST_REVOKED_CREDENTIALS_GEN_KEY, 0L)
    )
    val revokedMarker = maxOf(
      lastRevokedMarkerGeneration,
      prefs.getLong(LAST_REVOKED_MARKER_GEN_KEY, 0L)
    )
    pendingRevocationGeneration = pending
    lastRevokedContextGeneration = revokedCtx
    lastRevokedCredentialsGeneration = revokedCreds
    lastRevokedMarkerGeneration = revokedMarker
    lastRevokedTransportGeneration = minOf(revokedCtx, revokedCreds, revokedMarker)
    return RevocationWatermarks(pending, revokedCtx, revokedCreds, revokedMarker)
  }

  private fun readPublishedContextWatermarksLocked(appCtx: Context): Pair<Long, Long> {
    val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val gen = maxOf(
      lastPublishedContextGeneration,
      prefs.getLong(LAST_PUBLISHED_CONTEXT_GEN_KEY, 0L)
    )
    val seq = maxOf(
      lastPublishedContextSeq,
      prefs.getLong(LAST_PUBLISHED_CONTEXT_SEQ_KEY, 0L)
    )
    lastPublishedContextGeneration = gen
    lastPublishedContextSeq = seq
    return gen to seq
  }

  private fun recordContextPublishedLocked(appCtx: Context, generation: Long, seq: Long) {
    val (prevGen, prevSeq) = readPublishedContextWatermarksLocked(appCtx)
    val nextGen = maxOf(prevGen, generation)
    val nextSeq = maxOf(prevSeq, seq)
    lastPublishedContextGeneration = nextGen
    lastPublishedContextSeq = nextSeq
    if (nextGen != prevGen || nextSeq != prevSeq) {
      appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putLong(LAST_PUBLISHED_CONTEXT_GEN_KEY, nextGen)
        .putLong(LAST_PUBLISHED_CONTEXT_SEQ_KEY, nextSeq)
        .apply()
    }
  }

  private fun isContextCacheAuthorizedLocked(
    appCtx: Context,
    expectedOwner: String,
    expectedGeneration: Long
  ): Boolean {
    if (expectedOwner.isEmpty()) return false
    val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val currentOwner = prefs.getString(TELEMETRY_OWNER_KEY, "") ?: ""
    val currentGen = prefs.getLong(CREDENTIALS_GENERATION_KEY, 0L)
    val wm = readRevocationWatermarksLocked(appCtx)
    return currentOwner == expectedOwner &&
      currentGen == expectedGeneration &&
      (wm.pending == 0L || expectedGeneration > wm.pending)
  }

  private fun isContextPublishAuthorizedLocked(
    appCtx: Context,
    expectedOwner: String,
    expectedGeneration: Long
  ): Boolean {
    if (!isContextCacheAuthorizedLocked(appCtx, expectedOwner, expectedGeneration)) return false
    val wm = readRevocationWatermarksLocked(appCtx)
    return !wm.hasUnfinished
  }

  private suspend fun runPendingRevocationDeletesUnderMutex(appCtx: Context): Pair<Long, Boolean> {
    val wm = synchronized(credentialsStateLock) {
      readRevocationWatermarksLocked(appCtx)
    }
    val revokeGen = wm.pending
    if (revokeGen <= 0L || !wm.hasUnfinished) {
      return revokeGen to false
    }
    val revocationJson = JSONObject()
      .put("type", "accountCleared")
      .put("generation", revokeGen)
      .toString()
    try {
      sendLiveBytes(appCtx, "/sparky/message", revocationJson.toByteArray(Charsets.UTF_8))
    } catch (_: Throwable) {}

    var markerDone = revokeGen <= wm.revokedMarker
    if (!markerDone) {
      try {
        val req = PutDataMapRequest.create("/sparky/revocation").apply {
          dataMap.putString("json", revocationJson)
          dataMap.putLong("sentAt", System.currentTimeMillis())
        }.asPutDataRequest().setUrgent()
        Wearable.getDataClient(appCtx).putDataItem(req).await()
        markerDone = true
        synchronized(credentialsStateLock) {
          if (revokeGen > lastRevokedMarkerGeneration) {
            lastRevokedMarkerGeneration = revokeGen
          }
          appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putLong(LAST_REVOKED_MARKER_GEN_KEY, lastRevokedMarkerGeneration)
            .apply()
          lastRevokedTransportGeneration = minOf(
            lastRevokedContextGeneration,
            lastRevokedCredentialsGeneration,
            lastRevokedMarkerGeneration
          )
        }
      } catch (e: Throwable) {
        Log.w(TAG, "Revocation marker putDataItem failed: ${e.message}")
      }
    }

    var ctxDone = revokeGen <= wm.revokedCtx
    if (!ctxDone) {
      try {
        Wearable.getDataClient(appCtx).deleteDataItems(
          Uri.parse("wear://*/sparky/context"),
          DataClient.FILTER_LITERAL
        ).await()
        ctxDone = true
        synchronized(credentialsStateLock) {
          if (revokeGen > lastRevokedContextGeneration) {
            lastRevokedContextGeneration = revokeGen
          }
          appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putLong(LAST_REVOKED_CONTEXT_GEN_KEY, lastRevokedContextGeneration)
            .apply()
          lastRevokedTransportGeneration = minOf(
            lastRevokedContextGeneration,
            lastRevokedCredentialsGeneration,
            lastRevokedMarkerGeneration
          )
        }
      } catch (e: Throwable) {
        Log.w(TAG, "Revocation context delete failed: ${e.message}")
      }
    }

    var credsDone = revokeGen <= wm.revokedCreds
    if (!credsDone) {
      try {
        Wearable.getDataClient(appCtx).deleteDataItems(
          Uri.parse("wear://*/sparky/credentials"),
          DataClient.FILTER_LITERAL
        ).await()
        credsDone = true
        synchronized(credentialsStateLock) {
          if (revokeGen > lastRevokedCredentialsGeneration) {
            lastRevokedCredentialsGeneration = revokeGen
          }
          appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putLong(LAST_REVOKED_CREDENTIALS_GEN_KEY, lastRevokedCredentialsGeneration)
            .apply()
          lastRevokedTransportGeneration = minOf(
            lastRevokedContextGeneration,
            lastRevokedCredentialsGeneration,
            lastRevokedMarkerGeneration
          )
        }
      } catch (e: Throwable) {
        Log.w(TAG, "Revocation credentials delete failed: ${e.message}")
      }
    }

    return revokeGen to !(markerDone && ctxDone && credsDone)
  }

  private data class DeferredContextSnapshot(
    val owner: String,
    val generation: Long,
    val seq: Long,
    val json: String
  )

  private suspend fun publishDeferredContextUnderMutexIfReady(appCtx: Context) {
    val deferred = synchronized(credentialsStateLock) {
      val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val currentOwner = prefs.getString(TELEMETRY_OWNER_KEY, "") ?: ""
      val currentGen = prefs.getLong(CREDENTIALS_GENERATION_KEY, 0L)
      if (!isContextPublishAuthorizedLocked(appCtx, currentOwner, currentGen)) return@synchronized null
      val cachedSeq = prefs.getLong(LAST_CACHED_CONTEXT_SEQ_KEY, 0L)
      val (publishedGen, publishedSeq) = readPublishedContextWatermarksLocked(appCtx)
      if (currentGen > 0L && currentGen <= publishedGen && cachedSeq <= publishedSeq) {
        return@synchronized null
      }
      val raw = prefs.getString(LAST_CONTEXT_JSON_KEY, null) ?: return@synchronized null
      val stamped = try {
        val obj = JSONObject(raw)
        val ctxOwner = obj.optString("workoutServerId", "")
        if (ctxOwner.isNotEmpty() && ctxOwner != currentOwner) return@synchronized null
        val ctxGen = obj.optLong("contextGeneration", currentGen)
        if (ctxGen != currentGen) return@synchronized null
        obj.put("contextGeneration", currentGen)
        obj.put("contextSeq", cachedSeq)
        obj.toString()
      } catch (_: Throwable) {
        null
      } ?: return@synchronized null
      DeferredContextSnapshot(currentOwner, currentGen, cachedSeq, stamped)
    } ?: return

    val durableOk = try {
      val req = PutDataMapRequest.create("/sparky/context").apply {
        dataMap.putString("json", deferred.json)
        dataMap.putLong("pushedAt", System.currentTimeMillis())
      }.asPutDataRequest().setUrgent()
      Wearable.getDataClient(appCtx).putDataItem(req).await()
      true
    } catch (e: Throwable) {
      Log.w(TAG, "Deferred context DataClient failed: ${e.message}")
      false
    }

    val stillAllowed = synchronized(credentialsStateLock) {
      val latestCachedSeq = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .getLong(LAST_CACHED_CONTEXT_SEQ_KEY, 0L)
      val (_, publishedSeq) = readPublishedContextWatermarksLocked(appCtx)
      val ok = isContextPublishAuthorizedLocked(appCtx, deferred.owner, deferred.generation) &&
        deferred.seq >= latestCachedSeq &&
        deferred.seq >= publishedSeq
      if (ok && durableOk) {
        recordContextPublishedLocked(appCtx, deferred.generation, deferred.seq)
      }
      ok
    }
    if (!stillAllowed) return
    sendLiveBytes(appCtx, "/sparky/context", deferred.json.toByteArray(Charsets.UTF_8))
  }

  private fun jsonHeaderObjectsEqual(a: JSONObject?, b: JSONObject): Boolean {
    if (a == null || a.length() != b.length()) return false
    val keys = b.keys()
    while (keys.hasNext()) {
      val k = keys.next()
      if (!a.has(k) || a.optString(k, "") != b.optString(k, "")) return false
    }
    return true
  }

  fun setServerCredentials(
    context: Context,
    baseUrl: String,
    headers: Map<String, Any?>,
    expectedOwnerId: String? = null
  ) {
    val appCtx = context.applicationContext
    val cleanBaseUrl = baseUrl.trim().trimEnd('/')
    val headersObj = JSONObject()
    for ((k, v) in headers) {
      if (v is String && v.isNotBlank()) headersObj.put(k, v)
    }
    if (cleanBaseUrl.isBlank() || headersObj.length() == 0) {
      clearServerCredentials(appCtx)
      return
    }
    val saveOutcome = synchronized(credentialsStateLock) {
      try {
        val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val wm = readRevocationWatermarksLocked(appCtx)
        val prevGen = prefs.getLong(CREDENTIALS_GENERATION_KEY, 0L)
        val currentOwner = prefs.getString(TELEMETRY_OWNER_KEY, "") ?: ""
        val cleanExpectedOwner = expectedOwnerId?.trim()
        if (cleanExpectedOwner != null && cleanExpectedOwner != currentOwner) {
          return@synchronized 1
        }
        val existingUrl = prefs.getString(SERVER_URL_KEY, null)?.takeIf { it.isNotEmpty() }
        val existingHeaders = prefs.getString(ENCRYPTED_HEADERS_KEY, null)?.let { blob ->
          try {
            JSONObject(decryptHeaders(blob)).takeIf { it.length() > 0 }
          } catch (_: Throwable) {
            null
          }
        }
        val activeUnrevoked = prevGen > 0L && (wm.pending == 0L || prevGen > wm.pending)
        if (activeUnrevoked && existingUrl == cleanBaseUrl && jsonHeaderObjectsEqual(existingHeaders, headersObj)) {
          return@synchronized 1
        }
        val nextGen = maxOf(prevGen, wm.pending) + 1L
        val nextTransportRev = maxOf(
          prefs.getLong(CREDENTIALS_TRANSPORT_REV_KEY, 0L),
          nextGen
        ) + 1L
        val encrypted = encryptHeaders(headersObj.toString())
        val editor = prefs.edit()
          .remove(SERVER_HEADERS_KEY)
          .putString(SERVER_URL_KEY, cleanBaseUrl)
          .putString(ENCRYPTED_HEADERS_KEY, encrypted)
          .putLong(CREDENTIALS_GENERATION_KEY, nextGen)
          .putLong(CREDENTIALS_TRANSPORT_REV_KEY, nextTransportRev)
          .putLong(LAST_RECORDED_TRANSPORT_GEN_KEY, nextGen)
          .putInt(LAST_RECORDED_MTLS_KEY, -1)
          .remove(LAST_ACKED_CREDENTIALS_GEN_KEY)
          .remove(LAST_ACKED_CREDENTIALS_REV_KEY)
          .remove(PENDING_FORCED_CRED_REPUBLISH_GEN_KEY)
          .remove(PENDING_FORCED_CRED_REPUBLISH_REV_KEY)
          .remove(PENDING_ACKED_CRED_CLEANUP_GEN_KEY)
          .remove(PENDING_ACKED_CRED_CLEANUP_REV_KEY)
        if (currentOwner.isNotEmpty() && !wm.hasUnfinished && activeUnrevoked) {
          val rawCtx = prefs.getString(LAST_CONTEXT_JSON_KEY, null)
          if (!rawCtx.isNullOrEmpty()) {
            try {
              val ctxObj = JSONObject(rawCtx)
              val ctxOwner = ctxObj.optString("workoutServerId", "").trim()
              val ctxGen = ctxObj.optLong("contextGeneration", 0L)
              if (ctxOwner == currentOwner && ctxGen == prevGen) {
                val nextSeq = prefs.getLong(LAST_CACHED_CONTEXT_SEQ_KEY, 0L) + 1L
                ctxObj.put("contextGeneration", nextGen)
                ctxObj.put("contextSeq", nextSeq)
                editor
                  .putString(LAST_CONTEXT_JSON_KEY, ctxObj.toString())
                  .putLong(LAST_CACHED_CONTEXT_SEQ_KEY, nextSeq)
              }
            } catch (_: Throwable) {}
          }
        }
        editor.apply()
        2
      } catch (e: Throwable) {
        Log.w(TAG, "Failed to encrypt server credentials: ${e.message}")
        0
      }
    }
    if (saveOutcome == 0) {
      clearServerCredentials(appCtx)
      return
    }
    flushQueuedInboundEvents(appCtx)
    scope.launch(start = CoroutineStart.UNDISPATCHED) {
      syncCredentialsTransport(appCtx, forcePublish = saveOutcome == 2)
    }
  }

  fun clearServerCredentials(context: Context) {
    val appCtx = context.applicationContext
    synchronized(credentialsStateLock) {
      invalidateCredentialsStateLocked(appCtx, newOwnerId = null)
      synchronized(inboundLock) {
        purgeInboundQueueLocked(appCtx, retainOwnerId = "")
      }
    }
    scope.launch(start = CoroutineStart.UNDISPATCHED) {
      syncCredentialsTransport(appCtx, forcePublish = false)
    }
  }

  private fun readCredentialTransportSnapshotLocked(appCtx: Context): CredentialTransportSnapshot {
    val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val ownerId = prefs.getString(TELEMETRY_OWNER_KEY, "") ?: ""
    val baseUrl = prefs.getString(SERVER_URL_KEY, null)?.takeIf { it.isNotEmpty() }
    val headersObj = prefs.getString(ENCRYPTED_HEADERS_KEY, null)?.let { blob ->
      try {
        JSONObject(decryptHeaders(blob)).takeIf { it.length() > 0 }
      } catch (_: Throwable) {
        null
      }
    }
    val wm = readRevocationWatermarksLocked(appCtx)
    var generation = prefs.getLong(CREDENTIALS_GENERATION_KEY, 0L)
    if (generation <= 0L && wm.pending == 0L && ownerId.isNotEmpty() && baseUrl != null && headersObj != null) {
      generation = 1L
      prefs.edit().putLong(CREDENTIALS_GENERATION_KEY, generation).apply()
    }
    return CredentialTransportSnapshot(
      generation = generation,
      ownerId = ownerId,
      baseUrl = baseUrl,
      headersObj = headersObj
    )
  }

  private fun resolveTransportRevisionLocked(
    appCtx: Context,
    generation: Long,
    requiresClientCert: Boolean
  ): Long {
    val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    var rev = prefs.getLong(CREDENTIALS_TRANSPORT_REV_KEY, 0L)
    val recordedGen = prefs.getLong(LAST_RECORDED_TRANSPORT_GEN_KEY, 0L)
    val recordedMtlsInt = prefs.getInt(LAST_RECORDED_MTLS_KEY, -1)
    val desiredMtlsInt = if (requiresClientCert) 1 else 0
    if (rev <= 0L || generation > recordedGen || recordedMtlsInt != desiredMtlsInt) {
      val bumped = if (recordedMtlsInt == -1 && generation == recordedGen && rev > 0L) {
        rev
      } else {
        maxOf(rev, generation) + 1L
      }
      rev = bumped
      prefs.edit()
        .putLong(CREDENTIALS_TRANSPORT_REV_KEY, rev)
        .putLong(LAST_RECORDED_TRANSPORT_GEN_KEY, generation)
        .putInt(LAST_RECORDED_MTLS_KEY, desiredMtlsInt)
        .apply()
    }
    return rev
  }

  private fun scheduleRevocationRetry(appCtx: Context, targetGeneration: Long) {
    if (targetGeneration <= 0L) return
    synchronized(revocationRetryLock) {
      if (targetGeneration > revocationRetryGeneration) {
        revocationRetryJob?.cancel()
        revocationRetryJob = null
        revocationRetryGeneration = targetGeneration
        revocationRetryAttempt = 0
      }
      if (revocationRetryJob?.isActive == true) return
      if (revocationRetryAttempt >= REVOCATION_RETRY_DELAYS_MS.size) return
      val delayMs = REVOCATION_RETRY_DELAYS_MS[revocationRetryAttempt]
      revocationRetryAttempt += 1
      var launchedJob: Job? = null
      launchedJob = scope.launch {
        delay(delayMs)
        synchronized(revocationRetryLock) {
          if (revocationRetryJob === launchedJob) {
            revocationRetryJob = null
          }
        }
        syncCredentialsTransport(appCtx, forcePublish = false)
      }
      revocationRetryJob = launchedJob
    }
  }

  private fun cancelRevocationRetry() {
    synchronized(revocationRetryLock) {
      revocationRetryJob?.cancel()
      revocationRetryJob = null
      revocationRetryGeneration = 0L
      revocationRetryAttempt = 0
    }
  }

  private fun resetRevocationRetryBudgetOnReconnect() {
    synchronized(revocationRetryLock) {
      if (revocationRetryGeneration > 0L) {
        revocationRetryAttempt = 0
      }
    }
    synchronized(credentialPublishRetryLock) {
      if (credentialPublishRetryGeneration > 0L) {
        credentialPublishRetryAttempt = 0
      }
    }
  }

  private fun scheduleCredentialPublishRetry(
    appCtx: Context,
    targetGeneration: Long,
    targetRevision: Long
  ) {
    if (targetGeneration <= 0L || targetRevision <= 0L) return
    synchronized(credentialPublishRetryLock) {
      if (
        targetGeneration != credentialPublishRetryGeneration ||
        targetRevision != credentialPublishRetryRevision
      ) {
        credentialPublishRetryJob?.cancel()
        credentialPublishRetryJob = null
        credentialPublishRetryGeneration = targetGeneration
        credentialPublishRetryRevision = targetRevision
        credentialPublishRetryAttempt = 0
      }
      if (credentialPublishRetryJob?.isActive == true) return
      if (credentialPublishRetryAttempt >= REVOCATION_RETRY_DELAYS_MS.size) return
      val delayMs = REVOCATION_RETRY_DELAYS_MS[credentialPublishRetryAttempt]
      credentialPublishRetryAttempt += 1
      var launchedJob: Job? = null
      launchedJob = scope.launch {
        delay(delayMs)
        synchronized(credentialPublishRetryLock) {
          if (credentialPublishRetryJob === launchedJob) {
            credentialPublishRetryJob = null
          }
        }
        val curRequiresMtls = isPhoneClientCertificateConfigured(appCtx)
        val stillMatchingTarget = synchronized(credentialsStateLock) {
          val wm = readRevocationWatermarksLocked(appCtx)
          val cur = readCredentialTransportSnapshotLocked(appCtx)
          val curValid =
            !wm.hasUnfinished &&
              cur.ownerId.isNotEmpty() &&
              cur.baseUrl != null &&
              cur.headersObj != null &&
              cur.generation > 0L &&
              (wm.pending == 0L || cur.generation > wm.pending)
          if (!curValid) return@synchronized false
          val curRev = resolveTransportRevisionLocked(appCtx, cur.generation, curRequiresMtls)
          cur.generation == targetGeneration && curRev == targetRevision
        }
        if (stillMatchingTarget) {
          syncCredentialsTransport(appCtx, forcePublish = false)
        }
      }
      credentialPublishRetryJob = launchedJob
    }
  }

  private fun cancelCredentialPublishRetry() {
    synchronized(credentialPublishRetryLock) {
      credentialPublishRetryJob?.cancel()
      credentialPublishRetryJob = null
      credentialPublishRetryGeneration = 0L
      credentialPublishRetryRevision = 0L
      credentialPublishRetryAttempt = 0
    }
  }

  private suspend fun publishWatchCredentials(context: Context, forcePublish: Boolean = true) {
    syncCredentialsTransport(context.applicationContext, forcePublish = forcePublish)
  }

  private fun handleCredentialsAck(context: Context, payload: Map<String, Any?>) {
    val ackGen = asDouble(payload["generation"])?.toLong() ?: 0L
    val ackRev = asDouble(payload["transportRevision"])?.toLong() ?: 0L
    val ackOwner = (payload["ownerId"] as? String)?.trim() ?: ""
    if (ackGen <= 0L || ackRev <= 0L || ackOwner.isEmpty()) return
    val appCtx = context.applicationContext
    val matched = synchronized(credentialsStateLock) {
      val wm = readRevocationWatermarksLocked(appCtx)
      val curSnap = readCredentialTransportSnapshotLocked(appCtx)
      val requiresClientCert = isPhoneClientCertificateConfigured(appCtx)
      val curRev = if (!wm.hasUnfinished && curSnap.generation > 0L) {
        resolveTransportRevisionLocked(appCtx, curSnap.generation, requiresClientCert)
      } else {
        0L
      }
      val isMatch =
        !wm.hasUnfinished &&
          curSnap.ownerId == ackOwner &&
          curSnap.generation == ackGen &&
          curRev == ackRev &&
          (wm.pending == 0L || curSnap.generation > wm.pending)
      if (isMatch) {
        appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
          .edit()
          .putLong(LAST_ACKED_CREDENTIALS_GEN_KEY, ackGen)
          .putLong(LAST_ACKED_CREDENTIALS_REV_KEY, ackRev)
          .putLong(PENDING_ACKED_CRED_CLEANUP_GEN_KEY, ackGen)
          .putLong(PENDING_ACKED_CRED_CLEANUP_REV_KEY, ackRev)
          .apply()
      }
      isMatch
    }
    if (!matched) return
    scope.launch {
      val backoffMs = longArrayOf(0L, 2_000L, 5_000L, 12_000L, 30_000L)
      for (waitMs in backoffMs) {
        if (waitMs > 0L) delay(waitMs)
        val deletedOrStale = credentialsMutex.withLock {
          withContext(Dispatchers.IO) {
            deletePendingAckedCredentialsUnderMutex(appCtx, expectedGen = ackGen, expectedRev = ackRev)
          }
        }
        if (deletedOrStale) return@launch
      }
    }
  }

  private suspend fun deletePendingAckedCredentialsUnderMutex(
    appCtx: Context,
    expectedGen: Long? = null,
    expectedRev: Long? = null
  ): Boolean {
    val targetPair = synchronized(credentialsStateLock) {
      val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val cleanupGen = prefs.getLong(PENDING_ACKED_CRED_CLEANUP_GEN_KEY, 0L)
      val cleanupRev = prefs.getLong(PENDING_ACKED_CRED_CLEANUP_REV_KEY, 0L)
      if (cleanupGen <= 0L || cleanupRev <= 0L) return@synchronized null
      if ((expectedGen != null && cleanupGen != expectedGen) || (expectedRev != null && cleanupRev != expectedRev)) {
        return@synchronized null
      }
      val wm = readRevocationWatermarksLocked(appCtx)
      val curSnap = readCredentialTransportSnapshotLocked(appCtx)
      val requiresClientCert = isPhoneClientCertificateConfigured(appCtx)
      val curRev = if (!wm.hasUnfinished && curSnap.generation > 0L) {
        resolveTransportRevisionLocked(appCtx, curSnap.generation, requiresClientCert)
      } else {
        0L
      }
      val stillMatchesCurrent =
        !wm.hasUnfinished &&
          curSnap.ownerId.isNotEmpty() &&
          curSnap.generation == cleanupGen &&
          curRev == cleanupRev &&
          (wm.pending == 0L || curSnap.generation > wm.pending)
      if (!stillMatchesCurrent) {
        prefs.edit()
          .remove(PENDING_ACKED_CRED_CLEANUP_GEN_KEY)
          .remove(PENDING_ACKED_CRED_CLEANUP_REV_KEY)
          .apply()
        return@synchronized null
      }
      cleanupGen to cleanupRev
    } ?: return true

    return try {
      Wearable.getDataClient(appCtx).deleteDataItems(
        Uri.parse("wear://*/sparky/credentials"),
        DataClient.FILTER_LITERAL
      ).await()
      synchronized(credentialsStateLock) {
        val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (
          prefs.getLong(PENDING_ACKED_CRED_CLEANUP_GEN_KEY, 0L) == targetPair.first &&
          prefs.getLong(PENDING_ACKED_CRED_CLEANUP_REV_KEY, 0L) == targetPair.second
        ) {
          prefs.edit()
            .remove(PENDING_ACKED_CRED_CLEANUP_GEN_KEY)
            .remove(PENDING_ACKED_CRED_CLEANUP_REV_KEY)
            .apply()
        }
      }
      true
    } catch (e: Throwable) {
      Log.w(TAG, "Failed to delete acked credentials DataItem: ${e.message}")
      false
    }
  }

  private suspend fun syncCredentialsTransport(appCtx: Context, forcePublish: Boolean) {
    credentialsMutex.withLock {
      withContext(Dispatchers.IO) {
        var forceRemaining = forcePublish
        var lastDurableFailed = false
        var lastFailedGen = 0L
        var lastFailedRev = 0L
        while (true) {
          val (revokeGen, revocationIncomplete) = runPendingRevocationDeletesUnderMutex(appCtx)
          if (!revocationIncomplete) {
            deletePendingAckedCredentialsUnderMutex(appCtx)
          }
          val requiresClientCert = isPhoneClientCertificateConfigured(appCtx)

          val (snap, unfinishedRevokeNow, transportRev, alreadyAcked) = synchronized(credentialsStateLock) {
            val wm = readRevocationWatermarksLocked(appCtx)
            val curSnap = readCredentialTransportSnapshotLocked(appCtx)
            val validForRev =
              !wm.hasUnfinished &&
                curSnap.ownerId.isNotEmpty() &&
                curSnap.baseUrl != null &&
                curSnap.headersObj != null &&
                curSnap.generation > 0L &&
                (pendingRevocationGeneration == 0L || curSnap.generation > pendingRevocationGeneration)
            val rev = if (validForRev) {
              resolveTransportRevisionLocked(appCtx, curSnap.generation, requiresClientCert)
            } else {
              0L
            }
            val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val forcedGen = prefs.getLong(PENDING_FORCED_CRED_REPUBLISH_GEN_KEY, 0L)
            val forcedRev = prefs.getLong(PENDING_FORCED_CRED_REPUBLISH_REV_KEY, 0L)
            val hasPersistedForce =
              curSnap.generation > 0L &&
                rev > 0L &&
                forcedGen == curSnap.generation &&
                forcedRev == rev
            if ((forcedGen > 0L || forcedRev > 0L) && !hasPersistedForce && validForRev) {
              prefs.edit()
                .remove(PENDING_FORCED_CRED_REPUBLISH_GEN_KEY)
                .remove(PENDING_FORCED_CRED_REPUBLISH_REV_KEY)
                .apply()
            }
            val effectiveForce = forceRemaining || hasPersistedForce
            val ackedGen = prefs.getLong(LAST_ACKED_CREDENTIALS_GEN_KEY, 0L)
            val ackedRev = prefs.getLong(LAST_ACKED_CREDENTIALS_REV_KEY, 0L)
            val isAcked =
              !effectiveForce &&
                curSnap.generation > 0L &&
                rev > 0L &&
                ackedGen == curSnap.generation &&
                ackedRev == rev
            arrayOf(curSnap, wm.hasUnfinished, rev, isAcked)
          }.let { arr ->
            @Suppress("UNCHECKED_CAST")
            CredentialSyncEval(
              arr[0] as CredentialTransportSnapshot,
              arr[1] as Boolean,
              arr[2] as Long,
              arr[3] as Boolean
            )
          }
          val hasValidCredentials =
            !unfinishedRevokeNow &&
              snap.ownerId.isNotEmpty() &&
              snap.baseUrl != null &&
              snap.headersObj != null &&
              snap.generation > 0L &&
              transportRev > 0L &&
              (pendingRevocationGeneration == 0L || snap.generation > pendingRevocationGeneration)

          var durableFailedInPass = false
          var attemptedGenInPass = 0L
          var attemptedRevInPass = 0L
          var attemptedMtlsInPass: Boolean? = null

          val hasPersistedForceNow = synchronized(credentialsStateLock) {
            val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.getLong(PENDING_FORCED_CRED_REPUBLISH_GEN_KEY, 0L) == snap.generation &&
              prefs.getLong(PENDING_FORCED_CRED_REPUBLISH_REV_KEY, 0L) == transportRev
          }

          if (
            hasValidCredentials &&
            !alreadyAcked &&
            (forceRemaining ||
              hasPersistedForceNow ||
              snap.generation > lastPublishedTransportGeneration ||
              transportRev > lastPublishedTransportRevision ||
              lastPublishedRequiresMtls != requiresClientCert)
          ) {
            forceRemaining = false
            val stillValidBeforeWrite = synchronized(credentialsStateLock) {
              val wm = readRevocationWatermarksLocked(appCtx)
              val cur = readCredentialTransportSnapshotLocked(appCtx)
              val curRev = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getLong(CREDENTIALS_TRANSPORT_REV_KEY, 0L)
              cur.generation == snap.generation &&
                curRev == transportRev &&
                cur.ownerId == snap.ownerId &&
                cur.baseUrl == snap.baseUrl &&
                (wm.pending == 0L || snap.generation > wm.pending) &&
                !wm.hasUnfinished
            }
            if (!stillValidBeforeWrite) continue

            if (requiresClientCert) {
              val mtlsNoticeJson = JSONObject()
                .put("type", "serverCredentials")
                .put("generation", snap.generation)
                .put("transportRevision", transportRev)
                .put("ownerId", snap.ownerId)
                .put("requiresClientCertificate", true)
                .toString()

              var durableSucceeded = false
              try {
                val req = PutDataMapRequest.create("/sparky/credentials").apply {
                  dataMap.putString("json", mtlsNoticeJson)
                  dataMap.putLong("sentAt", System.currentTimeMillis())
                }.asPutDataRequest().setUrgent()
                Wearable.getDataClient(appCtx).putDataItem(req).await()
                durableSucceeded = true
              } catch (e: Throwable) {
                Log.w(TAG, "mTLS watch credentials DataItem publish failed: ${e.message}")
              }
              val stillSameMtls = isPhoneClientCertificateConfigured(appCtx) == requiresClientCert
              val stillValidBeforeLive = stillSameMtls && synchronized(credentialsStateLock) {
                val wm = readRevocationWatermarksLocked(appCtx)
                val cur = readCredentialTransportSnapshotLocked(appCtx)
                val curRev = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                  .getLong(CREDENTIALS_TRANSPORT_REV_KEY, 0L)
                cur.generation == snap.generation &&
                  curRev == transportRev &&
                  cur.ownerId == snap.ownerId &&
                  cur.baseUrl == snap.baseUrl &&
                  (wm.pending == 0L || snap.generation > wm.pending) &&
                  !wm.hasUnfinished
              }
              if (!stillValidBeforeLive) continue

              sendLiveBytes(appCtx, "/sparky/message", mtlsNoticeJson.toByteArray(Charsets.UTF_8))
              if (durableSucceeded) {
                synchronized(credentialsStateLock) {
                  val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                  if (
                    prefs.getLong(PENDING_FORCED_CRED_REPUBLISH_GEN_KEY, 0L) == snap.generation &&
                    prefs.getLong(PENDING_FORCED_CRED_REPUBLISH_REV_KEY, 0L) == transportRev
                  ) {
                    prefs.edit()
                      .remove(PENDING_FORCED_CRED_REPUBLISH_GEN_KEY)
                      .remove(PENDING_FORCED_CRED_REPUBLISH_REV_KEY)
                      .apply()
                  }
                  if (
                    snap.generation > lastPublishedTransportGeneration ||
                      (snap.generation == lastPublishedTransportGeneration &&
                        transportRev >= lastPublishedTransportRevision)
                  ) {
                    lastPublishedTransportGeneration = snap.generation
                    lastPublishedTransportRevision = transportRev
                    lastPublishedRequiresMtls = true
                  }
                }
              } else {
                durableFailedInPass = true
                attemptedGenInPass = snap.generation
                attemptedRevInPass = transportRev
                attemptedMtlsInPass = true
              }
            } else {
              val payloadJson = JSONObject()
                .put("type", "serverCredentials")
                .put("generation", snap.generation)
                .put("transportRevision", transportRev)
                .put("ownerId", snap.ownerId)
                .put("baseUrl", snap.baseUrl)
                .put("headers", snap.headersObj)
                .toString()

              var durableSucceeded = false
              try {
                val req = PutDataMapRequest.create("/sparky/credentials").apply {
                  dataMap.putString("json", payloadJson)
                  dataMap.putLong("sentAt", System.currentTimeMillis())
                }.asPutDataRequest().setUrgent()
                Wearable.getDataClient(appCtx).putDataItem(req).await()
                durableSucceeded = true
              } catch (e: Throwable) {
                Log.w(TAG, "publishWatchCredentials DataClient failed: ${e.message}")
              }

              val stillSameMtls = isPhoneClientCertificateConfigured(appCtx) == requiresClientCert
              val stillValidBeforeLive = stillSameMtls && synchronized(credentialsStateLock) {
                val wm = readRevocationWatermarksLocked(appCtx)
                val cur = readCredentialTransportSnapshotLocked(appCtx)
                val curRev = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                  .getLong(CREDENTIALS_TRANSPORT_REV_KEY, 0L)
                cur.generation == snap.generation &&
                  curRev == transportRev &&
                  cur.ownerId == snap.ownerId &&
                  cur.baseUrl == snap.baseUrl &&
                  (wm.pending == 0L || snap.generation > wm.pending) &&
                  !wm.hasUnfinished
              }
              if (!stillValidBeforeLive) continue

              sendLiveBytes(appCtx, "/sparky/message", payloadJson.toByteArray(Charsets.UTF_8))
              if (durableSucceeded) {
                synchronized(credentialsStateLock) {
                  val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                  if (
                    prefs.getLong(PENDING_FORCED_CRED_REPUBLISH_GEN_KEY, 0L) == snap.generation &&
                    prefs.getLong(PENDING_FORCED_CRED_REPUBLISH_REV_KEY, 0L) == transportRev
                  ) {
                    prefs.edit()
                      .remove(PENDING_FORCED_CRED_REPUBLISH_GEN_KEY)
                      .remove(PENDING_FORCED_CRED_REPUBLISH_REV_KEY)
                      .apply()
                  }
                  if (
                    snap.generation > lastPublishedTransportGeneration ||
                      (snap.generation == lastPublishedTransportGeneration &&
                        transportRev >= lastPublishedTransportRevision)
                  ) {
                    lastPublishedTransportGeneration = snap.generation
                    lastPublishedTransportRevision = transportRev
                    lastPublishedRequiresMtls = false
                  }
                }
              } else {
                durableFailedInPass = true
                attemptedGenInPass = snap.generation
                attemptedRevInPass = transportRev
                attemptedMtlsInPass = false
              }
            }
          } else {
            forceRemaining = false
          }

          if (!revocationIncomplete) {
            publishDeferredContextUnderMutexIfReady(appCtx)
          }

          val curRequiresMtls = isPhoneClientCertificateConfigured(appCtx)
          val needsAnotherPass = synchronized(credentialsStateLock) {
            val wm = readRevocationWatermarksLocked(appCtx)
            val cur = readCredentialTransportSnapshotLocked(appCtx)
            val newerRevokeArrived = wm.pending > revokeGen && wm.hasUnfinished
            val curValid =
              !wm.hasUnfinished &&
                cur.ownerId.isNotEmpty() &&
                cur.baseUrl != null &&
                cur.headersObj != null &&
                cur.generation > 0L &&
                (wm.pending == 0L || cur.generation > wm.pending)
            val curRev = if (curValid) {
              resolveTransportRevisionLocked(appCtx, cur.generation, curRequiresMtls)
            } else {
              0L
            }
            val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val forcedGen = prefs.getLong(PENDING_FORCED_CRED_REPUBLISH_GEN_KEY, 0L)
            val forcedRev = prefs.getLong(PENDING_FORCED_CRED_REPUBLISH_REV_KEY, 0L)
            val pendingForcedNow =
              curValid &&
                cur.generation > 0L &&
                curRev > 0L &&
                forcedGen == cur.generation &&
                forcedRev == curRev
            val ackedGen = prefs.getLong(LAST_ACKED_CREDENTIALS_GEN_KEY, 0L)
            val ackedRev = prefs.getLong(LAST_ACKED_CREDENTIALS_REV_KEY, 0L)
            val isAckedCurrent =
              !pendingForcedNow &&
                curValid &&
                cur.generation > 0L &&
                curRev > 0L &&
                ackedGen == cur.generation &&
                ackedRev == curRev
            val unpublishedChange =
              pendingForcedNow ||
                (!isAckedCurrent &&
                  (cur.generation > lastPublishedTransportGeneration ||
                    curRev > lastPublishedTransportRevision ||
                    lastPublishedRequiresMtls != curRequiresMtls))
            val canRetryNow =
              !durableFailedInPass ||
                cur.generation != attemptedGenInPass ||
                curRev != attemptedRevInPass ||
                curRequiresMtls != attemptedMtlsInPass
            newerRevokeArrived || (!revocationIncomplete && curValid && unpublishedChange && canRetryNow)
          }
          lastDurableFailed = durableFailedInPass
          lastFailedGen = if (durableFailedInPass) attemptedGenInPass else 0L
          lastFailedRev = if (durableFailedInPass) attemptedRevInPass else 0L
          if (!needsAnotherPass) break
        }

        val finalWm = synchronized(credentialsStateLock) {
          readRevocationWatermarksLocked(appCtx)
        }
        val forcedRetryTarget = synchronized(credentialsStateLock) {
          val wm = readRevocationWatermarksLocked(appCtx)
          val cur = readCredentialTransportSnapshotLocked(appCtx)
          val curMtls = isPhoneClientCertificateConfigured(appCtx)
          val curValid =
            !wm.hasUnfinished &&
              cur.ownerId.isNotEmpty() &&
              cur.baseUrl != null &&
              cur.headersObj != null &&
              cur.generation > 0L &&
              (wm.pending == 0L || cur.generation > wm.pending)
          if (!curValid) {
            null
          } else {
            val curRev = resolveTransportRevisionLocked(appCtx, cur.generation, curMtls)
            val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val fg = prefs.getLong(PENDING_FORCED_CRED_REPUBLISH_GEN_KEY, 0L)
            val fr = prefs.getLong(PENDING_FORCED_CRED_REPUBLISH_REV_KEY, 0L)
            if (fg == cur.generation && fr == curRev) cur.generation to curRev else null
          }
        }
        if (finalWm.hasUnfinished) {
          cancelCredentialPublishRetry()
          scheduleRevocationRetry(appCtx, finalWm.pending)
        } else {
          cancelRevocationRetry()
          if (forcedRetryTarget != null) {
            scheduleCredentialPublishRetry(appCtx, forcedRetryTarget.first, forcedRetryTarget.second)
          } else if (lastDurableFailed && lastFailedGen > 0L && lastFailedRev > 0L) {
            scheduleCredentialPublishRetry(appCtx, lastFailedGen, lastFailedRev)
          } else {
            cancelCredentialPublishRetry()
          }
        }
      }
    }
  }

  fun refreshNodes(context: Context) {
    val appCtx = context.applicationContext
    scope.launch {
      try {
        val nodes = Wearable.getNodeClient(appCtx).connectedNodes.await()
        val connected = nodes.isNotEmpty()
        val prevReachable = isReachableFlag.getAndSet(connected)
        if (connected) {
          isPairedFlag.set(true)
          appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(PAIRED_CACHE_KEY, true)
            .apply()
        }
        if (prevReachable != connected) {
          activeModule?.emitEvent("onReachabilityChange", mapOf("isReachable" to connected))
          if (connected) {
            resetRevocationRetryBudgetOnReconnect()
            syncCredentialsTransport(appCtx, forcePublish = false)
          }
        }
      } catch (e: Throwable) {
        Log.w(TAG, "refreshNodes failed: ${e.message}")
      }
    }
  }

  fun onNodeSeen(context: Context, nodeId: String) {
    val appCtx = context.applicationContext
    if (nodeId.isNotEmpty()) {
      isPairedFlag.set(true)
      val changed = !isReachableFlag.getAndSet(true)
      appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putBoolean(PAIRED_CACHE_KEY, true)
        .apply()
      if (changed) {
        activeModule?.emitEvent("onReachabilityChange", mapOf("isReachable" to true))
        scope.launch {
          resetRevocationRetryBudgetOnReconnect()
          syncCredentialsTransport(appCtx, forcePublish = false)
        }
      }
    }
  }

  suspend fun putApplicationContext(
    context: Context,
    payload: Map<String, Any?>,
    ingressSeq: Long = nextContextIngressSeq.incrementAndGet()
  ) {
    val appCtx = context.applicationContext
    val cleaned = withoutNulls(payload).toMutableMap()
    cleaned["type"] = "context"
    val contextOwner = (cleaned["workoutServerId"] as? String)?.trim() ?: ""
    val authorizedSnapshot = synchronized(credentialsStateLock) {
      if (ingressSeq < highestAcceptedIngressSeq) {
        return@synchronized null
      }
      highestAcceptedIngressSeq = ingressSeq
      val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      if (contextOwner.isEmpty()) {
        prefs.edit().remove(LAST_CONTEXT_JSON_KEY).apply()
        return@synchronized null
      }
      val expectedGeneration = prefs.getLong(CREDENTIALS_GENERATION_KEY, 0L)
      if (!isContextCacheAuthorizedLocked(appCtx, contextOwner, expectedGeneration)) {
        return@synchronized null
      }
      val nextSeq = prefs.getLong(LAST_CACHED_CONTEXT_SEQ_KEY, 0L) + 1L
      cleaned["contextGeneration"] = expectedGeneration
      cleaned["contextSeq"] = nextSeq
      val json = mapToJsonObject(cleaned).toString()
      prefs.edit()
        .putString(LAST_CONTEXT_JSON_KEY, json)
        .putLong(LAST_CACHED_CONTEXT_SEQ_KEY, nextSeq)
        .apply()
      Triple(expectedGeneration, nextSeq, json)
    } ?: return
    publishAuthorizedContextJson(
      appCtx = appCtx,
      expectedOwner = contextOwner,
      expectedGeneration = authorizedSnapshot.first,
      expectedSeq = authorizedSnapshot.second,
      json = authorizedSnapshot.third
    )
  }

  private suspend fun publishAuthorizedContextJson(
    appCtx: Context,
    expectedOwner: String,
    expectedGeneration: Long,
    expectedSeq: Long,
    json: String
  ) {
    credentialsMutex.withLock {
      withContext(Dispatchers.IO) {
        val (_, revocationIncomplete) = runPendingRevocationDeletesUnderMutex(appCtx)
        if (revocationIncomplete) return@withContext

        val allowedBeforePut = synchronized(credentialsStateLock) {
          if (!isContextPublishAuthorizedLocked(appCtx, expectedOwner, expectedGeneration)) {
            return@synchronized false
          }
          val latestCachedSeq = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getLong(LAST_CACHED_CONTEXT_SEQ_KEY, 0L)
          val (_, publishedSeq) = readPublishedContextWatermarksLocked(appCtx)
          expectedSeq >= latestCachedSeq && expectedSeq >= publishedSeq
        }
        if (!allowedBeforePut) return@withContext

        val durableOk = try {
          val req = PutDataMapRequest.create("/sparky/context").apply {
            dataMap.putString("json", json)
            dataMap.putLong("pushedAt", System.currentTimeMillis())
          }.asPutDataRequest().setUrgent()
          Wearable.getDataClient(appCtx).putDataItem(req).await()
          true
        } catch (e: Throwable) {
          Log.w(TAG, "putApplicationContext DataClient failed: ${e.message}")
          false
        }

        val allowedBeforeLive = synchronized(credentialsStateLock) {
          val latestCachedSeq = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getLong(LAST_CACHED_CONTEXT_SEQ_KEY, 0L)
          val (_, publishedSeq) = readPublishedContextWatermarksLocked(appCtx)
          val ok = isContextPublishAuthorizedLocked(appCtx, expectedOwner, expectedGeneration) &&
            expectedSeq >= latestCachedSeq &&
            expectedSeq >= publishedSeq
          if (ok && durableOk) {
            recordContextPublishedLocked(appCtx, expectedGeneration, expectedSeq)
          }
          ok
        }
        if (!allowedBeforeLive) return@withContext

        sendLiveBytes(appCtx, "/sparky/context", json.toByteArray(Charsets.UTF_8))
      }
    }
  }

  private suspend fun replayCachedContextIfAuthorized(context: Context) {
    val appCtx = context.applicationContext
    credentialsMutex.withLock {
      withContext(Dispatchers.IO) {
        val (_, revocationIncomplete) = runPendingRevocationDeletesUnderMutex(appCtx)
        if (revocationIncomplete) return@withContext

        val snapshot = synchronized(credentialsStateLock) {
          val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
          val currentOwner = prefs.getString(TELEMETRY_OWNER_KEY, "") ?: ""
          val expectedGen = prefs.getLong(CREDENTIALS_GENERATION_KEY, 0L)
          if (!isContextPublishAuthorizedLocked(appCtx, currentOwner, expectedGen)) {
            return@synchronized null
          }
          val cachedSeq = prefs.getLong(LAST_CACHED_CONTEXT_SEQ_KEY, 0L)
          val (_, publishedSeq) = readPublishedContextWatermarksLocked(appCtx)
          if (cachedSeq < publishedSeq) {
            return@synchronized null
          }
          val raw = prefs.getString(LAST_CONTEXT_JSON_KEY, null) ?: return@synchronized null
          val stamped = try {
            val obj = JSONObject(raw)
            val ctxOwner = obj.optString("workoutServerId", "")
            if (ctxOwner.isNotEmpty() && ctxOwner != currentOwner) return@synchronized null
            val ctxGen = obj.optLong("contextGeneration", expectedGen)
            if (ctxGen != expectedGen) return@synchronized null
            obj.put("contextGeneration", expectedGen)
            obj.put("contextSeq", cachedSeq)
            obj.toString()
          } catch (_: Throwable) {
            null
          } ?: return@synchronized null
          DeferredContextSnapshot(currentOwner, expectedGen, cachedSeq, stamped)
        } ?: return@withContext

        val durableOk = try {
          val req = PutDataMapRequest.create("/sparky/context").apply {
            dataMap.putString("json", snapshot.json)
            dataMap.putLong("pushedAt", System.currentTimeMillis())
          }.asPutDataRequest().setUrgent()
          Wearable.getDataClient(appCtx).putDataItem(req).await()
          true
        } catch (e: Throwable) {
          Log.w(TAG, "replayCachedContext DataClient failed: ${e.message}")
          false
        }

        val allowedBeforeLive = synchronized(credentialsStateLock) {
          val latestCachedSeq = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getLong(LAST_CACHED_CONTEXT_SEQ_KEY, 0L)
          val (_, publishedSeq) = readPublishedContextWatermarksLocked(appCtx)
          val ok = isContextPublishAuthorizedLocked(appCtx, snapshot.owner, snapshot.generation) &&
            snapshot.seq >= latestCachedSeq &&
            snapshot.seq >= publishedSeq
          if (ok && durableOk) {
            recordContextPublishedLocked(appCtx, snapshot.generation, snapshot.seq)
          }
          ok
        }
        if (!allowedBeforeLive) return@withContext

        sendLiveBytes(appCtx, "/sparky/context", snapshot.json.toByteArray(Charsets.UTF_8))
      }
    }
  }

  suspend fun sendComplicationConfig(context: Context, payload: Map<String, Any?>): Boolean {
    val appCtx = context.applicationContext
    val cleaned = withoutNulls(payload).toMutableMap()
    cleaned["type"] = "complicationConfig"
    val incomingRevision = (cleaned["revision"] as? Number)?.toLong() ?: 0L
    val json = mapToJsonObject(cleaned).toString()

    return complicationConfigMutex.withLock {
      val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val cachedRevision = prefs.getLong(LAST_COMPLICATION_CONFIG_REV_KEY, 0L)
      if (incomingRevision < cachedRevision) return@withLock true
      prefs.edit()
        .putString(LAST_COMPLICATION_CONFIG_JSON_KEY, json)
        .putLong(LAST_COMPLICATION_CONFIG_REV_KEY, incomingRevision)
        .apply()
      publishRawComplicationConfigJson(appCtx, json)
    }
  }

  private suspend fun replayCachedComplicationConfig(context: Context) {
    val appCtx = context.applicationContext
    complicationConfigMutex.withLock {
      val cached = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .getString(LAST_COMPLICATION_CONFIG_JSON_KEY, null)
        ?: return@withLock
      publishRawComplicationConfigJson(appCtx, cached)
    }
  }

  private suspend fun publishRawComplicationConfigJson(appCtx: Context, json: String): Boolean {
    val bytes = json.toByteArray(Charsets.UTF_8)
    var dataQueued = false

    try {
      val req = PutDataMapRequest.create("/sparky/complicationConfig").apply {
        dataMap.putString("json", json)
        dataMap.putLong("sentAt", System.currentTimeMillis())
      }.asPutDataRequest().setUrgent()
      Wearable.getDataClient(appCtx).putDataItem(req).await()
      dataQueued = true
    } catch (e: Throwable) {
      Log.w(TAG, "sendComplicationConfig DataClient failed: ${e.message}")
    }

    val liveSent = sendLiveBytes(appCtx, "/sparky/message", bytes)
    return dataQueued || liveSent
  }

  data class TransferDeliveryResult(
    val liveSent: Boolean,
    val durableQueued: Boolean
  )

  suspend fun sendMessageOrTransfer(
    context: Context,
    payload: Map<String, Any?>,
    durable: Boolean,
    slotKey: String? = null
  ): TransferDeliveryResult {
    val appCtx = context.applicationContext
    val cleaned = withoutNulls(payload)
    val type = cleaned["type"] as? String ?: "message"
    val json = mapToJsonObject(cleaned).toString()
    val bytes = json.toByteArray(Charsets.UTF_8)

    val liveSent = sendLiveBytes(appCtx, "/sparky/message", bytes)
    var durableQueued = false

    if (durable) {
      val key = slotKey ?: (cleaned["sessionId"] as? String) ?: UUID.randomUUID().toString()
      val path = "/sparky/transfer/phone/$type/$key"
      try {
        val req = PutDataMapRequest.create(path).apply {
          dataMap.putString("json", json)
          dataMap.putLong("sentAt", System.currentTimeMillis())
        }.asPutDataRequest().setUrgent()
        Wearable.getDataClient(appCtx).putDataItem(req).await()
        durableQueued = true
      } catch (e: Throwable) {
        Log.w(TAG, "durable transfer ($path) failed: ${e.message}")
      }
    }
    return TransferDeliveryResult(liveSent = liveSent, durableQueued = durableQueued)
  }

  private suspend fun sendLiveBytes(context: Context, path: String, bytes: ByteArray): Boolean {
    return try {
      val nodes = Wearable.getNodeClient(context).connectedNodes.await()
      val connected = nodes.isNotEmpty()
      val prev = isReachableFlag.getAndSet(connected)
      if (connected) {
        isPairedFlag.set(true)
      }
      if (prev != connected) {
        activeModule?.emitEvent("onReachabilityChange", mapOf("isReachable" to connected))
      }
      val msgClient = Wearable.getMessageClient(context)
      var delivered = false
      for (node in nodes) {
        try {
          msgClient.sendMessage(node.id, path, bytes).await()
          delivered = true
        } catch (e: Throwable) {
          Log.w(TAG, "sendMessage to ${node.id} failed: ${e.message}")
        }
      }
      delivered
    } catch (e: Throwable) {
      Log.w(TAG, "sendLiveBytes failed: ${e.message}")
      false
    }
  }

  private const val MAX_INLINE_WEARABLE_BYTES = 80 * 1024

  suspend fun sendExerciseImage(context: Context, key: String, index: Int, bytes: ByteArray) {
    val appCtx = context.applicationContext
    val safeKey = key.replace(Regex("[^a-zA-Z0-9_-]"), "_")
    // Wearable MessageClient and inline DataItem payloads cap at ~100 KB.
    // Only send live when the Base64-encoded JSON fits comfortably under that
    // cap; otherwise go straight to a durable DataClient transfer using an
    // Asset for oversized images.
    val livePayload = if (bytes.size <= 58 * 1024) {
      JSONObject().apply {
        put("type", "exerciseImage")
        put("key", key)
        put("index", index)
        put("dataBase64", Base64.encodeToString(bytes, Base64.NO_WRAP))
      }.toString().toByteArray(Charsets.UTF_8)
    } else {
      null
    }
    val sentLive = livePayload != null &&
      livePayload.size <= MAX_INLINE_WEARABLE_BYTES &&
      sendLiveBytes(appCtx, "/sparky/message", livePayload)
    if (!sentLive) {
      val path = "/sparky/transfer/phone/exerciseImage/${safeKey}_$index"
      try {
        val req = PutDataMapRequest.create(path).apply {
          dataMap.putString("key", key)
          dataMap.putInt("index", index)
          if (bytes.size <= MAX_INLINE_WEARABLE_BYTES) {
            dataMap.putByteArray("data", bytes)
          } else {
            dataMap.putAsset("asset", Asset.createFromBytes(bytes))
          }
          dataMap.putLong("sentAt", System.currentTimeMillis())
        }.asPutDataRequest().setUrgent()
        Wearable.getDataClient(appCtx).putDataItem(req).await()
      } catch (e: Throwable) {
        Log.w(TAG, "durable exerciseImage transfer ($path) failed: ${e.message}")
      }
    }
  }

  fun launchWatchApp(context: Context, page: String = "workout") {
    val appCtx = context.applicationContext
    scope.launch {
      try {
        val nodes = Wearable.getNodeClient(appCtx).connectedNodes.await()
        if (nodes.isEmpty()) return@launch
        val helper = RemoteActivityHelper(appCtx, remoteExecutor)
        val intent = Intent(Intent.ACTION_VIEW)
          .addCategory(Intent.CATEGORY_BROWSABLE)
          .setData(Uri.parse("sparkyfitness://watch/$page"))
        for (node in nodes) {
          try {
            helper.startRemoteActivity(intent, node.id)
          } catch (_: Throwable) {}
        }
      } catch (_: Throwable) {}
    }
  }

  fun handleIncomingJson(context: Context, json: String) {
    val payload = try {
      jsonObjectToMap(JSONObject(json))
    } catch (e: Throwable) {
      Log.w(TAG, "Invalid incoming JSON from watch: ${e.message}")
      return
    }
    routePayload(context.applicationContext, payload, json)
  }

  private fun inboundQueueFile(context: Context): File {
    val dir = File(context.applicationContext.filesDir, "WatchInboundQueue")
    if (!dir.exists()) dir.mkdirs()
    return File(dir, "pending.json")
  }

  private fun purgeInboundQueueLocked(context: Context, retainOwnerId: String) {
    val file = inboundQueueFile(context)
    if (!file.exists()) return
    val cleanRetain = retainOwnerId.trim()
    if (cleanRetain.isEmpty()) {
      file.delete()
      return
    }
    val retained = JSONArray()
    try {
      val arr = JSONArray(file.readText(Charsets.UTF_8))
      for (i in 0 until arr.length()) {
        val raw = arr.optString(i, "")
        if (raw.isEmpty()) continue
        val keep = try {
          val obj = JSONObject(raw)
          val itemOwner = obj.optString("ownerId", "").trim().ifEmpty {
            obj.optString("serverId", "").trim()
          }
          itemOwner.isNotEmpty() && itemOwner == cleanRetain
        } catch (_: Throwable) {
          false
        }
        if (keep) {
          retained.put(raw)
        }
      }
    } catch (_: Throwable) {
      file.delete()
      return
    }
    if (retained.length() == 0) {
      file.delete()
    } else {
      try {
        file.writeText(retained.toString(), Charsets.UTF_8)
      } catch (_: Throwable) {
        file.delete()
      }
    }
  }

  private fun pruneExpiredForegroundFastStartsLocked(nowMs: Long = System.currentTimeMillis()) {
    val iter = inFlightForegroundFastStarts.iterator()
    while (iter.hasNext()) {
      val entry = iter.next()
      val ageMs = nowMs - entry.dispatchedAtMs
      if (ageMs > FOREGROUND_FAST_START_TTL_MS || ageMs < -FOREGROUND_FAST_START_TTL_MS) {
        recentlyExpiredForegroundFastStarts.remove(entry.clientId)
        recentlyExpiredForegroundFastStarts[entry.clientId] = entry.ownerId
        while (recentlyExpiredForegroundFastStarts.size > 100) {
          val oldest = recentlyExpiredForegroundFastStarts.keys.iterator().next()
          recentlyExpiredForegroundFastStarts.remove(oldest)
        }
        iter.remove()
      }
    }
  }

  private fun hasInFlightForegroundFastStartLocked(
    ownerId: String,
    nowMs: Long = System.currentTimeMillis()
  ): Boolean {
    pruneExpiredForegroundFastStartsLocked(nowMs)
    return inFlightForegroundFastStarts.any { it.ownerId == ownerId }
  }

  private fun registerInFlightForegroundFastStart(ownerId: String, clientId: String) {
    val cleanOwner = ownerId.trim()
    val cleanId = clientId.trim()
    if (cleanOwner.isEmpty() || cleanId.isEmpty()) return
    val nowMs = System.currentTimeMillis()
    synchronized(inboundLock) {
      pruneExpiredForegroundFastStartsLocked(nowMs)
      recentlyExpiredForegroundFastStarts.remove(cleanId)
      inFlightForegroundFastStarts.removeAll { it.ownerId == cleanOwner && it.clientId == cleanId }
      inFlightForegroundFastStarts.add(InFlightForegroundFastStart(cleanOwner, cleanId, nowMs))
    }
  }

  internal fun clearInFlightForegroundFastStart(
    clientId: String,
    ownerId: String? = null
  ): Set<String> {
    val cleanId = clientId.trim()
    if (cleanId.isEmpty()) return emptySet()
    val cleanOwner = ownerId?.trim()
    synchronized(inboundLock) {
      pruneExpiredForegroundFastStartsLocked()
      val clearedOwners = LinkedHashSet<String>()
      val iter = inFlightForegroundFastStarts.iterator()
      while (iter.hasNext()) {
        val entry = iter.next()
        if (entry.clientId == cleanId && (cleanOwner == null || entry.ownerId == cleanOwner)) {
          clearedOwners.add(entry.ownerId)
          iter.remove()
        }
      }
      val expiredOwner = recentlyExpiredForegroundFastStarts[cleanId]
      if (expiredOwner != null && (cleanOwner == null || expiredOwner == cleanOwner)) {
        recentlyExpiredForegroundFastStarts.remove(cleanId)
        clearedOwners.add(expiredOwner)
      }
      return clearedOwners
    }
  }

  private fun clearAllInFlightForegroundFastStarts() {
    synchronized(inboundLock) {
      inFlightForegroundFastStarts.clear()
      recentlyExpiredForegroundFastStarts.clear()
    }
  }

  private fun writeInboundQueueAtomicallyLocked(file: File, retained: JSONArray): Boolean {
    if (retained.length() == 0) {
      return !file.exists() || file.delete()
    }
    val parent = file.parentFile ?: return false
    val tmp = File(parent, "${file.name}.tmp.${UUID.randomUUID()}")
    return try {
      tmp.writeText(retained.toString(), Charsets.UTF_8)
      if (tmp.renameTo(file)) {
        true
      } else {
        tmp.delete()
        false
      }
    } catch (_: Throwable) {
      try {
        tmp.delete()
      } catch (_: Throwable) {}
      false
    }
  }

  private fun hasQueuedFastStartForOwner(context: Context, ownerId: String): Boolean {
    if (ownerId.isEmpty()) return false
    synchronized(inboundLock) {
      if (hasInFlightForegroundFastStartLocked(ownerId)) return true
      val file = inboundQueueFile(context)
      if (!file.exists()) return false
      return try {
        val arr = JSONArray(file.readText(Charsets.UTF_8))
        for (i in 0 until arr.length()) {
          val raw = arr.optString(i, "")
          if (raw.isEmpty()) continue
          val matches = try {
            val obj = JSONObject(raw)
            obj.optString("type", "") == "fastStart" &&
              obj.optString("ownerId", "").trim() == ownerId
          } catch (_: Throwable) {
            false
          }
          if (matches) return true
        }
        false
      } catch (_: Throwable) {
        false
      }
    }
  }

  internal fun removeQueuedInboundEvent(
    context: Context,
    clientId: String,
    type: String? = null,
    ownerId: String? = null
  ): Boolean {
    val cleanId = clientId.trim()
    if (cleanId.isEmpty()) return false
    synchronized(inboundLock) {
      val file = inboundQueueFile(context)
      if (!file.exists()) return false
      val retained = JSONArray()
      var removedAny = false
      try {
        val arr = JSONArray(file.readText(Charsets.UTF_8))
        for (i in 0 until arr.length()) {
          val raw = arr.optString(i, "")
          if (raw.isEmpty()) continue
          val matches = try {
            val obj = JSONObject(raw)
            val idMatch = obj.optString("clientId", "").trim() == cleanId
            val typeMatch = type == null || obj.optString("type", "") == type
            val ownerMatch = ownerId == null || obj.optString("ownerId", "").trim() == ownerId
            idMatch && typeMatch && ownerMatch
          } catch (_: Throwable) {
            false
          }
          if (matches) {
            removedAny = true
          } else {
            retained.put(raw)
          }
        }
      } catch (_: Throwable) {
        return false
      }
      if (!removedAny) return false
      return writeInboundQueueAtomicallyLocked(file, retained)
    }
  }

  internal fun removeQueuedWorkoutRecovery(
    context: Context,
    sessionId: String,
    serverId: String? = null
  ): Boolean {
    val cleanSessionId = sessionId.trim()
    if (cleanSessionId.isEmpty()) return false
    synchronized(inboundLock) {
      val file = inboundQueueFile(context)
      if (!file.exists()) return false
      val retained = JSONArray()
      var removedAny = false
      try {
        val arr = JSONArray(file.readText(Charsets.UTF_8))
        for (i in 0 until arr.length()) {
          val raw = arr.optString(i, "")
          if (raw.isEmpty()) continue
          val matches = try {
            val obj = JSONObject(raw)
            obj.optString("type", "").trim() == "workoutStartRequested" &&
              obj.optString("sessionId", "").trim() == cleanSessionId &&
              (serverId == null || obj.optString("serverId", "").trim() == serverId)
          } catch (_: Throwable) {
            false
          }
          if (matches) {
            removedAny = true
          } else {
            retained.put(raw)
          }
        }
      } catch (_: Throwable) {
        return false
      }
      if (!removedAny) return false
      return writeInboundQueueAtomicallyLocked(file, retained)
    }
  }

  internal fun clearFastStartAndCollectDrainOwners(
    context: Context,
    clientId: String,
    ok: Boolean
  ): Set<String> {
    val ownersToDrain = LinkedHashSet(clearInFlightForegroundFastStart(clientId))
    val removedQueuedFastStart = removeQueuedInboundEvent(context, clientId, type = "fastStart")
    removeQueuedInboundEvent(context, clientId)
    if (removedQueuedFastStart) {
      val activeOwner = activeOwnerId(context)
      if (activeOwner.isNotEmpty()) {
        ownersToDrain.add(activeOwner)
      }
    }
    for (ownerId in ownersToDrain) {
      recordFastStartClientSettled(context, ownerId, clientId, ok = ok)
    }
    return ownersToDrain
  }

  private fun peekQueuedFastEndsForOwnerIfNoQueuedStart(
    context: Context,
    ownerId: String
  ): List<String> {
    if (ownerId.isEmpty()) return emptyList()
    synchronized(inboundLock) {
      if (hasInFlightForegroundFastStartLocked(ownerId)) return emptyList()
      val file = inboundQueueFile(context)
      if (!file.exists()) return emptyList()
      val arr = try {
        JSONArray(file.readText(Charsets.UTF_8))
      } catch (_: Throwable) {
        return emptyList()
      }
      for (i in 0 until arr.length()) {
        val raw = arr.optString(i, "")
        if (raw.isEmpty()) continue
        val isQueuedStart = try {
          val obj = JSONObject(raw)
          obj.optString("type", "") == "fastStart" &&
            obj.optString("ownerId", "").trim() == ownerId
        } catch (_: Throwable) {
          false
        }
        if (isQueuedStart) return emptyList()
      }
      val pendingEnds = mutableListOf<String>()
      for (i in 0 until arr.length()) {
        val raw = arr.optString(i, "")
        if (raw.isEmpty()) continue
        val isQueuedEnd = try {
          val obj = JSONObject(raw)
          obj.optString("type", "") == "fastEnd" &&
            obj.optString("ownerId", "").trim() == ownerId
        } catch (_: Throwable) {
          false
        }
        if (isQueuedEnd) {
          pendingEnds.add(raw)
        }
      }
      return pendingEnds
    }
  }

  private fun enqueueInboundJson(context: Context, rawJson: String) {
    synchronized(inboundLock) {
      val file = inboundQueueFile(context)
      val arr = if (file.exists()) {
        try {
          JSONArray(file.readText(Charsets.UTF_8))
        } catch (_: Throwable) {
          JSONArray()
        }
      } else {
        JSONArray()
      }
      val incomingKey = try {
        val obj = JSONObject(rawJson)
        val type = obj.optString("type", "").trim()
        val clientId = obj.optString("clientId", "").trim()
        val dedupeId = clientId.ifEmpty {
          if (type == "workoutStartRequested") obj.optString("sessionId", "").trim() else ""
        }
        val owner = obj.optString("ownerId", "").trim().ifEmpty {
          obj.optString("serverId", "").trim()
        }
        if (type.isNotEmpty() && dedupeId.isNotEmpty()) Triple(type, owner, dedupeId) else null
      } catch (_: Throwable) {
        null
      }
      if (incomingKey != null) {
        for (i in 0 until arr.length()) {
          val existingRaw = arr.optString(i, "")
          if (existingRaw.isEmpty()) continue
          val matches = try {
            val obj = JSONObject(existingRaw)
            val existingType = obj.optString("type", "").trim()
            val existingClientId = obj.optString("clientId", "").trim()
            val existingDedupeId = existingClientId.ifEmpty {
              if (existingType == "workoutStartRequested") obj.optString("sessionId", "").trim() else ""
            }
            val existingOwner = obj.optString("ownerId", "").trim().ifEmpty {
              obj.optString("serverId", "").trim()
            }
            existingType == incomingKey.first &&
              existingOwner == incomingKey.second &&
              existingDedupeId == incomingKey.third
          } catch (_: Throwable) {
            false
          }
          if (matches) {
            return
          }
        }
      }
      arr.put(rawJson)
      val trimmed = JSONArray()
      val start = (arr.length() - INBOUND_QUEUE_LIMIT).coerceAtLeast(0)
      for (i in start until arr.length()) {
        trimmed.put(arr.getString(i))
      }
      writeInboundQueueAtomicallyLocked(file, trimmed)
    }
  }

  fun flushQueuedInboundEvents(context: Context) {
    val appCtx = context.applicationContext
    scope.launch {
      delay(800L)
      if (activeModule == null) return@launch
      val items = synchronized(inboundLock) {
        val file = inboundQueueFile(appCtx)
        if (!file.exists()) return@synchronized emptyList<String>()
        val list = try {
          val arr = JSONArray(file.readText(Charsets.UTF_8))
          (0 until arr.length()).mapNotNull { arr.optString(it).takeIf { s -> s.isNotEmpty() } }
        } catch (_: Throwable) {
          emptyList()
        }
        file.delete()
        list
      }
      for (raw in items) {
        handleIncomingJson(appCtx, raw)
      }
    }
  }

  private fun acquireHeadlessCredentials(context: Context, expectedOwner: String): HeadlessCredentials? {
    if (expectedOwner.isEmpty()) return null
    val appCtx = context.applicationContext
    synchronized(credentialsStateLock) {
      val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val currentOwner = prefs.getString(TELEMETRY_OWNER_KEY, "") ?: ""
      if (currentOwner.isEmpty() || currentOwner != expectedOwner) return null
      val baseUrl = prefs.getString(SERVER_URL_KEY, null)?.takeIf { it.isNotEmpty() } ?: return null
      val blob = prefs.getString(ENCRYPTED_HEADERS_KEY, null)?.takeIf { it.isNotEmpty() } ?: return null
      val headersRaw = try {
        decryptHeaders(blob)
      } catch (e: Throwable) {
        Log.w(TAG, "Failed to decrypt server credentials: ${e.message}")
        return null
      }
      val headerMap = try {
        val hObj = JSONObject(headersRaw)
        val out = mutableMapOf<String, String>()
        val keys = hObj.keys()
        while (keys.hasNext()) {
          val k = keys.next()
          val v = hObj.optString(k, "")
          if (v.isNotEmpty()) out[k] = v
        }
        out
      } catch (_: Throwable) {
        return null
      }
      if (headerMap.isEmpty()) return null
      val wm = readRevocationWatermarksLocked(appCtx)
      val generation = prefs.getLong(CREDENTIALS_GENERATION_KEY, 0L)
      if (wm.pending > 0L && generation <= wm.pending) return null
      return HeadlessCredentials(
        appCtx = appCtx,
        ownerId = currentOwner,
        baseUrl = baseUrl,
        headers = headerMap,
        generation = generation
      )
    }
  }

  private fun isHeadlessOwnerStillActive(context: Context, creds: HeadlessCredentials): Boolean {
    val appCtx = context.applicationContext
    synchronized(credentialsStateLock) {
      val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val currentOwner = prefs.getString(TELEMETRY_OWNER_KEY, "") ?: ""
      val currentUrl = prefs.getString(SERVER_URL_KEY, null)?.takeIf { it.isNotEmpty() }
      val currentGen = prefs.getLong(CREDENTIALS_GENERATION_KEY, 0L)
      val wm = readRevocationWatermarksLocked(appCtx)
      return currentOwner.isNotEmpty() &&
        currentOwner == creds.ownerId &&
        currentUrl == creds.baseUrl &&
        currentGen == creds.generation &&
        (wm.pending == 0L || currentGen > wm.pending)
    }
  }

  private fun checkInOwnerMutex(ownerId: String): Mutex {
    synchronized(headlessCheckInMutexLock) {
      val existing = headlessCheckInMutexes[ownerId]
      if (existing != null) return existing
      val created = Mutex()
      headlessCheckInMutexes[ownerId] = created
      if (headlessCheckInMutexes.size > 64) {
        val iter = headlessCheckInMutexes.entries.iterator()
        while (iter.hasNext() && headlessCheckInMutexes.size > 32) {
          val entry = iter.next()
          if (entry.key != ownerId && !entry.value.isLocked) {
            iter.remove()
          }
        }
      }
      return created
    }
  }

  private fun fastOwnerMutex(ownerId: String): Mutex {
    synchronized(headlessFastMutexLock) {
      val existing = headlessFastMutexes[ownerId]
      if (existing != null) return existing
      val created = Mutex()
      headlessFastMutexes[ownerId] = created
      if (headlessFastMutexes.size > 64) {
        val iter = headlessFastMutexes.entries.iterator()
        while (iter.hasNext() && headlessFastMutexes.size > 32) {
          val entry = iter.next()
          if (entry.key != ownerId && !entry.value.isLocked) {
            iter.remove()
          }
        }
      }
      return created
    }
  }

  private data class SettledFastEndOutcome(
    val fastKnown: Boolean,
    val fast: JSONObject?
  )

  internal fun buildFastAckPayload(
    clientId: String,
    ok: Boolean,
    fastKnown: Boolean = false,
    fast: JSONObject? = null
  ): Map<String, Any?> {
    val payload = mutableMapOf<String, Any?>(
      "type" to "ack",
      "clientId" to clientId,
      "ok" to ok
    )
    if (fastKnown) {
      payload["fastKnown"] = true
      if (fast != null) {
        payload["fast"] = jsonObjectToMap(fast)
      }
    }
    return payload
  }

  private fun getSettledFastEndOutcome(
    context: Context,
    ownerId: String,
    clientId: String
  ): SettledFastEndOutcome? {
    if (ownerId.isEmpty() || clientId.isEmpty()) return null
    val appCtx = context.applicationContext
    synchronized(credentialsStateLock) {
      val raw = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .getString(SETTLED_FAST_END_IDS_KEY, null) ?: return null
      return try {
        val root = JSONObject(raw)
        val arr = root.optJSONArray(ownerId) ?: return null
        for (i in arr.length() - 1 downTo 0) {
          val item = arr.opt(i)
          when (item) {
            is JSONObject -> {
              if (item.optString("clientId", "") == clientId) {
                val known = item.optBoolean("fastKnown", false)
                val fastObj = if (known && item.has("fast") && !item.isNull("fast")) {
                  item.optJSONObject("fast")
                } else {
                  null
                }
                return SettledFastEndOutcome(fastKnown = known, fast = fastObj)
              }
            }
            is String -> {
              if (item == clientId) {
                return SettledFastEndOutcome(fastKnown = false, fast = null)
              }
            }
          }
        }
        null
      } catch (_: Throwable) {
        null
      }
    }
  }

  private fun recordFastEndClientSettled(
    context: Context,
    ownerId: String,
    clientId: String,
    fast: JSONObject?
  ) {
    if (ownerId.isEmpty() || clientId.isEmpty()) return
    val appCtx = context.applicationContext
    synchronized(credentialsStateLock) {
      val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val root = try {
        prefs.getString(SETTLED_FAST_END_IDS_KEY, null)?.let { JSONObject(it) } ?: JSONObject()
      } catch (_: Throwable) {
        JSONObject()
      }
      val existingArr = root.optJSONArray(ownerId)
      val deduped = LinkedHashMap<String, JSONObject>()
      if (existingArr != null) {
        for (i in 0 until existingArr.length()) {
          val item = existingArr.opt(i)
          when (item) {
            is JSONObject -> {
              val id = item.optString("clientId", "")
              if (id.isNotEmpty()) {
                deduped.remove(id)
                deduped[id] = item
              }
            }
            is String -> {
              if (item.isNotEmpty()) {
                deduped.remove(item)
                deduped[item] = JSONObject()
                  .put("clientId", item)
                  .put("fastKnown", false)
              }
            }
          }
        }
      }
      val entryObj = JSONObject().apply {
        put("clientId", clientId)
        put("fastKnown", true)
        if (fast != null) {
          put("fast", fast)
        }
      }
      deduped.remove(clientId)
      deduped[clientId] = entryObj
      val nextArr = JSONArray()
      for (entry in deduped.values.toList().takeLast(50)) {
        nextArr.put(entry)
      }
      root.put(ownerId, nextArr)
      prefs.edit().putString(SETTLED_FAST_END_IDS_KEY, root.toString()).apply()
    }
  }

  private fun getSettledFastStartOutcome(
    context: Context,
    ownerId: String,
    clientId: String
  ): Boolean? {
    if (ownerId.isEmpty() || clientId.isEmpty()) return null
    val appCtx = context.applicationContext
    synchronized(credentialsStateLock) {
      val raw = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .getString(SETTLED_FAST_START_IDS_KEY, null) ?: return null
      return try {
        val root = JSONObject(raw)
        val arr = root.optJSONArray(ownerId) ?: return null
        for (i in arr.length() - 1 downTo 0) {
          val item = arr.opt(i)
          when (item) {
            is JSONObject -> {
              if (item.optString("clientId", "") == clientId) {
                return item.optBoolean("ok", true)
              }
            }
            is String -> {
              if (item == clientId) {
                return true
              }
            }
          }
        }
        null
      } catch (_: Throwable) {
        null
      }
    }
  }

  private fun recordFastStartClientSettled(
    context: Context,
    ownerId: String,
    clientId: String,
    ok: Boolean
  ) {
    if (ownerId.isEmpty() || clientId.isEmpty()) return
    val appCtx = context.applicationContext
    synchronized(credentialsStateLock) {
      val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val root = try {
        prefs.getString(SETTLED_FAST_START_IDS_KEY, null)?.let { JSONObject(it) } ?: JSONObject()
      } catch (_: Throwable) {
        JSONObject()
      }
      val existingArr = root.optJSONArray(ownerId)
      val deduped = LinkedHashMap<String, JSONObject>()
      if (existingArr != null) {
        for (i in 0 until existingArr.length()) {
          val item = existingArr.opt(i)
          when (item) {
            is JSONObject -> {
              val id = item.optString("clientId", "")
              if (id.isNotEmpty()) {
                deduped.remove(id)
                deduped[id] = item
              }
            }
            is String -> {
              if (item.isNotEmpty()) {
                deduped.remove(item)
                deduped[item] = JSONObject()
                  .put("clientId", item)
                  .put("ok", true)
              }
            }
          }
        }
      }
      val entryObj = JSONObject()
        .put("clientId", clientId)
        .put("ok", ok)
      deduped.remove(clientId)
      deduped[clientId] = entryObj
      val nextArr = JSONArray()
      for (entry in deduped.values.toList().takeLast(50)) {
        nextArr.put(entry)
      }
      root.put(ownerId, nextArr)
      prefs.edit().putString(SETTLED_FAST_START_IDS_KEY, root.toString()).apply()
    }
    clearInFlightForegroundFastStart(clientId, ownerId)
  }

  private fun fetchFreshFastState(creds: HeadlessCredentials): Pair<Boolean, JSONObject?> {
    val (curStatus, curBody) = performHeadlessHttp(creds, "/api/fasting/current", "GET", null)
    if (curStatus in 200..299 && curBody != null) {
      val curTrimmed = curBody.trim()
      if (curTrimmed == "null") {
        return true to null
      } else if (curTrimmed.isNotEmpty()) {
        return try {
          val curObj = JSONObject(curTrimmed)
          val parsed = toWatchFastJson(curObj)
          if (parsed != null || curObj.optBoolean("is_eating_window", false)) {
            true to parsed
          } else {
            false to null
          }
        } catch (_: Throwable) {
          false to null
        }
      }
    }
    return false to null
  }

  private fun medicationDoseMutex(
    ownerId: String,
    entryDate: String,
    medicationId: String,
    scheduleId: String
  ): Mutex {
    val key = "$ownerId|$entryDate|$medicationId|$scheduleId"
    synchronized(headlessMedicationMutexLock) {
      val existing = headlessMedicationMutexes[key]
      if (existing != null) return existing
      val created = Mutex()
      headlessMedicationMutexes[key] = created
      if (headlessMedicationMutexes.size > 256) {
        val iter = headlessMedicationMutexes.entries.iterator()
        while (iter.hasNext() && headlessMedicationMutexes.size > 128) {
          val entry = iter.next()
          if (entry.key != key && !entry.value.isLocked) {
            iter.remove()
          }
        }
      }
      return created
    }
  }

  private fun parseIsoMillis(iso: String?): Long? {
    val trimmed = iso?.trim()?.takeIf { it.isNotEmpty() } ?: return null
    return try {
      Instant.parse(trimmed).toEpochMilli()
    } catch (_: Throwable) {
      try {
        OffsetDateTime.parse(trimmed).toInstant().toEpochMilli()
      } catch (_: Throwable) {
        null
      }
    }
  }

  private fun toWatchFastJson(fastObj: JSONObject): JSONObject? {
    if (fastObj.optBoolean("is_eating_window", false)) return null
    val startStr = if (fastObj.has("start_time") && !fastObj.isNull("start_time")) {
      fastObj.optString("start_time", "")
    } else ""
    val startedAt = parseIsoMillis(startStr) ?: return null
    val targetStr = if (fastObj.has("target_end_time") && !fastObj.isNull("target_end_time")) {
      fastObj.optString("target_end_time", "")
    } else null
    val targetEndAt = parseIsoMillis(targetStr)
    val label = if (fastObj.has("fasting_type") && !fastObj.isNull("fasting_type")) {
      fastObj.optString("fasting_type", "").takeIf { it.isNotEmpty() }
    } else null
    val manualId = if (!fastObj.optBoolean("is_auto_calculated", false) && fastObj.has("id") && !fastObj.isNull("id")) {
      fastObj.optString("id", "").trim().takeIf { it.isNotEmpty() }
    } else null
    return JSONObject().apply {
      if (manualId != null) put("id", manualId)
      put("startedAt", startedAt)
      put("targetEndAt", targetEndAt ?: JSONObject.NULL)
      put("label", label ?: JSONObject.NULL)
    }
  }

  private fun waterOwnerMutex(ownerId: String): Mutex {
    synchronized(headlessWaterMutexLock) {
      val existing = headlessWaterMutexes[ownerId]
      if (existing != null) return existing
      val created = Mutex()
      headlessWaterMutexes[ownerId] = created
      if (headlessWaterMutexes.size > 64) {
        val iter = headlessWaterMutexes.entries.iterator()
        while (iter.hasNext() && headlessWaterMutexes.size > 32) {
          val entry = iter.next()
          if (entry.key != ownerId && !entry.value.isLocked) {
            iter.remove()
          }
        }
      }
      return created
    }
  }

  private fun performHeadlessHttp(
    creds: HeadlessCredentials,
    endpoint: String,
    method: String,
    bodyJson: JSONObject?
  ): Pair<Int, String?> {
    if (!isHeadlessOwnerStillActive(creds.appCtx, creds)) {
      return HEADLESS_HTTP_OWNER_RETIRED to null
    }
    var conn: HttpURLConnection? = null
    return try {
      ensureClientCertificateInstalled(creds.appCtx)
      if (!isHeadlessOwnerStillActive(creds.appCtx, creds)) {
        return HEADLESS_HTTP_OWNER_RETIRED to null
      }
      conn = (URL("${creds.baseUrl}$endpoint").openConnection() as HttpURLConnection).apply {
        (this as? javax.net.ssl.HttpsURLConnection)?.sslSocketFactory =
          javax.net.ssl.HttpsURLConnection.getDefaultSSLSocketFactory()
        requestMethod = method
        connectTimeout = 10_000
        readTimeout = 10_000
        instanceFollowRedirects = false
        for ((k, v) in creds.headers) {
          setRequestProperty(k, v)
        }
        if (bodyJson != null) {
          doOutput = true
          setRequestProperty("Content-Type", "application/json")
        }
      }
      if (bodyJson != null) {
        conn.outputStream.use { os ->
          os.write(bodyJson.toString().toByteArray(Charsets.UTF_8))
        }
      }
      val status = conn.responseCode
      val respText = try {
        val stream = if (status in 200..299) conn.inputStream else conn.errorStream
        stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
      } catch (_: Throwable) {
        null
      }
      status to respText
    } catch (e: Throwable) {
      Log.w(TAG, "performHeadlessHttp ($method $endpoint) failed: ${e.message}")
      -1 to null
    } finally {
      conn?.disconnect()
    }
  }

  private fun readCachedContextSeq(context: Context): Long {
    val appCtx = context.applicationContext
    return synchronized(credentialsStateLock) {
      appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .getLong(LAST_CACHED_CONTEXT_SEQ_KEY, 0L)
    }
  }

  private data class HeadlessContextPatchResult(
    val generation: Long,
    val seq: Long,
    val json: String,
    val waterTotalApplied: Boolean
  )

  private fun ensureWaterCancelStateLoadedLocked(appCtx: Context) {
    if (waterCancelStateLoaded) return
    waterCancelStateLoaded = true
    val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    prefs.getString(CANCELLED_WATER_TAP_IDS_KEY, null)?.let { raw ->
      try {
        val root = JSONObject(raw)
        val keys = root.keys()
        while (keys.hasNext()) {
          val owner = keys.next().trim()
          if (owner.isEmpty()) continue
          val arr = root.optJSONArray(owner) ?: continue
          val set = cancelledWaterTapIdsByOwner.getOrPut(owner) { LinkedHashSet() }
          for (i in 0 until arr.length()) {
            val id = arr.optString(i, "").trim()
            if (id.isNotEmpty()) set.add(id)
          }
          while (set.size > 100) {
            val oldest = set.iterator().next()
            set.remove(oldest)
          }
        }
      } catch (_: Throwable) {}
    }
    prefs.getString(CREATED_WATER_ENTRY_IDS_KEY, null)?.let { raw ->
      try {
        val root = JSONObject(raw)
        val keys = root.keys()
        while (keys.hasNext()) {
          val owner = keys.next().trim()
          if (owner.isEmpty()) continue
          val obj = root.optJSONObject(owner) ?: continue
          val map = createdWaterEntryIdByOwnerClient.getOrPut(owner) { LinkedHashMap() }
          val idKeys = obj.keys()
          while (idKeys.hasNext()) {
            val clientId = idKeys.next().trim()
            val entryId = obj.optString(clientId, "").trim()
            if (clientId.isNotEmpty() && entryId.isNotEmpty()) {
              map[clientId] = entryId
            }
          }
          while (map.size > 100) {
            val oldest = map.keys.iterator().next()
            map.remove(oldest)
          }
        }
      } catch (_: Throwable) {}
    }
    prefs.getString(UNCERTAIN_WATER_WRITES_KEY, null)?.let { raw ->
      try {
        val root = JSONObject(raw)
        val keys = root.keys()
        while (keys.hasNext()) {
          val owner = keys.next().trim()
          if (owner.isEmpty()) continue
          val obj = root.optJSONObject(owner) ?: continue
          val map = uncertainWaterWritesByOwnerClient.getOrPut(owner) { LinkedHashMap() }
          val idKeys = obj.keys()
          while (idKeys.hasNext()) {
            val clientId = idKeys.next().trim()
            val entryDate = obj.optString(clientId, "").trim()
            if (clientId.isNotEmpty() && entryDate.isNotEmpty()) {
              map[clientId] = entryDate
            }
          }
          while (map.size > 100) {
            val oldest = map.keys.iterator().next()
            map.remove(oldest)
          }
        }
      } catch (_: Throwable) {}
    }
  }

  private fun persistWaterCancelStateLocked(appCtx: Context) {
    val cancelledRoot = JSONObject()
    for ((owner, ids) in cancelledWaterTapIdsByOwner) {
      if (ids.isEmpty()) continue
      val arr = JSONArray()
      for (id in ids) arr.put(id)
      cancelledRoot.put(owner, arr)
    }
    val createdRoot = JSONObject()
    for ((owner, entries) in createdWaterEntryIdByOwnerClient) {
      if (entries.isEmpty()) continue
      val obj = JSONObject()
      for ((clientId, entryId) in entries) obj.put(clientId, entryId)
      createdRoot.put(owner, obj)
    }
    val uncertainRoot = JSONObject()
    for ((owner, entries) in uncertainWaterWritesByOwnerClient) {
      if (entries.isEmpty()) continue
      val obj = JSONObject()
      for ((clientId, entryDate) in entries) obj.put(clientId, entryDate)
      uncertainRoot.put(owner, obj)
    }
    val editor = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
    if (cancelledRoot.length() > 0) {
      editor.putString(CANCELLED_WATER_TAP_IDS_KEY, cancelledRoot.toString())
    } else {
      editor.remove(CANCELLED_WATER_TAP_IDS_KEY)
    }
    if (createdRoot.length() > 0) {
      editor.putString(CREATED_WATER_ENTRY_IDS_KEY, createdRoot.toString())
    } else {
      editor.remove(CREATED_WATER_ENTRY_IDS_KEY)
    }
    if (uncertainRoot.length() > 0) {
      editor.putString(UNCERTAIN_WATER_WRITES_KEY, uncertainRoot.toString())
    } else {
      editor.remove(UNCERTAIN_WATER_WRITES_KEY)
    }
    editor.apply()
  }

  private fun markWaterTapCancelled(context: Context, ownerId: String, clientId: String) {
    val cleanOwner = ownerId.trim()
    val cleanId = clientId.trim()
    if (cleanOwner.isEmpty() || cleanId.isEmpty()) return
    val appCtx = context.applicationContext
    synchronized(waterCancelLock) {
      ensureWaterCancelStateLoadedLocked(appCtx)
      val set = cancelledWaterTapIdsByOwner.getOrPut(cleanOwner) { LinkedHashSet() }
      set.remove(cleanId)
      set.add(cleanId)
      while (set.size > 100) {
        val oldest = set.iterator().next()
        set.remove(oldest)
      }
      persistWaterCancelStateLocked(appCtx)
    }
  }

  private fun isWaterTapCancelled(context: Context, ownerId: String, clientId: String): Boolean {
    val cleanOwner = ownerId.trim()
    val cleanId = clientId.trim()
    if (cleanOwner.isEmpty() || cleanId.isEmpty()) return false
    val appCtx = context.applicationContext
    synchronized(waterCancelLock) {
      ensureWaterCancelStateLoadedLocked(appCtx)
      return cancelledWaterTapIdsByOwner[cleanOwner]?.contains(cleanId) == true
    }
  }

  private fun recordCreatedWaterEntryId(context: Context, ownerId: String, clientId: String, entryId: String) {
    val cleanOwner = ownerId.trim()
    val cleanId = clientId.trim()
    val cleanEntryId = entryId.trim()
    if (cleanOwner.isEmpty() || cleanId.isEmpty() || cleanEntryId.isEmpty()) return
    val appCtx = context.applicationContext
    synchronized(waterCancelLock) {
      ensureWaterCancelStateLoadedLocked(appCtx)
      val map = createdWaterEntryIdByOwnerClient.getOrPut(cleanOwner) { LinkedHashMap() }
      map.remove(cleanId)
      map[cleanId] = cleanEntryId
      while (map.size > 100) {
        val oldest = map.keys.iterator().next()
        map.remove(oldest)
      }
      persistWaterCancelStateLocked(appCtx)
    }
  }

  private fun peekCreatedWaterEntryId(context: Context, ownerId: String, clientId: String): String? {
    val cleanOwner = ownerId.trim()
    val cleanId = clientId.trim()
    if (cleanOwner.isEmpty() || cleanId.isEmpty()) return null
    val appCtx = context.applicationContext
    synchronized(waterCancelLock) {
      ensureWaterCancelStateLoadedLocked(appCtx)
      return createdWaterEntryIdByOwnerClient[cleanOwner]?.get(cleanId)
    }
  }

  private fun consumeCreatedWaterEntryId(context: Context, ownerId: String, clientId: String): String? {
    val cleanOwner = ownerId.trim()
    val cleanId = clientId.trim()
    if (cleanOwner.isEmpty() || cleanId.isEmpty()) return null
    val appCtx = context.applicationContext
    synchronized(waterCancelLock) {
      ensureWaterCancelStateLoadedLocked(appCtx)
      val removed = createdWaterEntryIdByOwnerClient[cleanOwner]?.remove(cleanId)
      if (removed != null) {
        persistWaterCancelStateLocked(appCtx)
      }
      return removed
    }
  }

  private fun recordUncertainWaterWrite(context: Context, ownerId: String, clientId: String, entryDate: String) {
    val cleanOwner = ownerId.trim()
    val cleanId = clientId.trim()
    val cleanDate = entryDate.trim()
    if (cleanOwner.isEmpty() || cleanId.isEmpty() || cleanDate.isEmpty()) return
    val appCtx = context.applicationContext
    synchronized(waterCancelLock) {
      ensureWaterCancelStateLoadedLocked(appCtx)
      val map = uncertainWaterWritesByOwnerClient.getOrPut(cleanOwner) { LinkedHashMap() }
      map.remove(cleanId)
      map[cleanId] = cleanDate
      while (map.size > 100) {
        val oldest = map.keys.iterator().next()
        map.remove(oldest)
      }
      persistWaterCancelStateLocked(appCtx)
    }
  }

  private fun peekUncertainWaterWriteDate(context: Context, ownerId: String, clientId: String): String? {
    val cleanOwner = ownerId.trim()
    val cleanId = clientId.trim()
    if (cleanOwner.isEmpty() || cleanId.isEmpty()) return null
    val appCtx = context.applicationContext
    synchronized(waterCancelLock) {
      ensureWaterCancelStateLoadedLocked(appCtx)
      return uncertainWaterWritesByOwnerClient[cleanOwner]?.get(cleanId)
    }
  }

  private fun consumeUncertainWaterWrite(context: Context, ownerId: String, clientId: String): String? {
    val cleanOwner = ownerId.trim()
    val cleanId = clientId.trim()
    if (cleanOwner.isEmpty() || cleanId.isEmpty()) return null
    val appCtx = context.applicationContext
    synchronized(waterCancelLock) {
      ensureWaterCancelStateLoadedLocked(appCtx)
      val removed = uncertainWaterWritesByOwnerClient[cleanOwner]?.remove(cleanId)
      if (removed != null) {
        persistWaterCancelStateLocked(appCtx)
      }
      return removed
    }
  }

  private fun clearWaterCancellationState(appCtx: Context) {
    synchronized(waterCancelLock) {
      waterCancelStateLoaded = true
      cancelledWaterTapIdsByOwner.clear()
      createdWaterEntryIdByOwnerClient.clear()
      uncertainWaterWritesByOwnerClient.clear()
      appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .remove(CANCELLED_WATER_TAP_IDS_KEY)
        .remove(CREATED_WATER_ENTRY_IDS_KEY)
        .remove(UNCERTAIN_WATER_WRITES_KEY)
        .apply()
    }
  }

  private fun extractExplicitWaterEntryId(respText: String?): String? {
    if (respText.isNullOrBlank()) return null
    return try {
      val obj = JSONObject(respText)
      for (key in listOf("log_entry_id", "water_intake_entry_id", "entry_id")) {
        if (obj.has(key) && !obj.isNull(key)) {
          val v = obj.optString(key, "").trim()
          if (v.isNotEmpty()) return v
        }
      }
      val nested = obj.optJSONObject("entry")
      if (nested != null && nested.has("id") && !nested.isNull("id")) {
        val v = nested.optString("id", "").trim()
        if (v.isNotEmpty()) return v
      }
      null
    } catch (_: Throwable) {
      null
    }
  }

  private sealed class WaterLogLookupResult {
    data class Found(val entryId: String) : WaterLogLookupResult()
    data object Absent : WaterLogLookupResult()
    data object TransientError : WaterLogLookupResult()
  }

  private fun findWaterLogEntryIdByClientIdWithStatus(
    creds: HeadlessCredentials,
    entryDate: String,
    clientId: String
  ): WaterLogLookupResult {
    val cleanId = clientId.trim()
    if (entryDate.isBlank() || cleanId.isEmpty()) return WaterLogLookupResult.TransientError
    val encDate = URLEncoder.encode(entryDate, "UTF-8")
    val (status, body) = performHeadlessHttp(
      creds,
      "/api/v2/measurements/water-intake/$encDate/log",
      "GET",
      null
    )
    if (status !in 200..299 || body.isNullOrBlank()) return WaterLogLookupResult.TransientError
    return try {
      val arr = JSONArray(body)
      for (i in 0 until arr.length()) {
        val item = arr.optJSONObject(i) ?: continue
        val rowClientId = if (item.has("client_id") && !item.isNull("client_id")) {
          item.optString("client_id", "").trim()
        } else ""
        if (rowClientId == cleanId) {
          val id = if (item.has("id") && !item.isNull("id")) {
            item.optString("id", "").trim()
          } else ""
          if (id.isNotEmpty()) return WaterLogLookupResult.Found(id)
        }
      }
      WaterLogLookupResult.Absent
    } catch (_: Throwable) {
      WaterLogLookupResult.TransientError
    }
  }

  private fun findWaterLogEntryIdByClientId(
    creds: HeadlessCredentials,
    entryDate: String,
    clientId: String
  ): String? {
    return when (val result = findWaterLogEntryIdByClientIdWithStatus(creds, entryDate, clientId)) {
      is WaterLogLookupResult.Found -> result.entryId
      else -> null
    }
  }

  private suspend fun executeCompensatingWaterDeleteHeadless(
    context: Context,
    creds: HeadlessCredentials,
    payloadOwner: String,
    clientId: String,
    entryId: String
  ): Boolean {
    val (delStatus, _) = performHeadlessHttp(
      creds,
      "/api/v2/measurements/water-intake/log/${Uri.encode(entryId)}",
      "DELETE",
      null
    )
    if (delStatus == HEADLESS_HTTP_OWNER_RETIRED) return true
    if (delStatus == 400 || delStatus == 422) {
      consumeCreatedWaterEntryId(context, payloadOwner, clientId)
      removeQueuedInboundEvent(context, clientId, type = "waterTapCancel", ownerId = payloadOwner)
      if (isHeadlessOwnerStillActive(context, creds) && clientId.isNotEmpty()) {
        sendMessageOrTransfer(
          context,
          mapOf("type" to "ack", "clientId" to clientId, "ok" to false),
          durable = false
        )
      }
      return true
    }
    if (delStatus !in 200..299 && delStatus != 404) return false
    consumeCreatedWaterEntryId(context, payloadOwner, clientId)
    removeQueuedInboundEvent(context, clientId, type = "waterTapCancel", ownerId = payloadOwner)
    if (!isHeadlessOwnerStillActive(context, creds)) return true
    val today = LocalDate.now().toString()
    val seqBeforeRead = readCachedContextSeq(context)
    val (totalStatus, totalBody) = performHeadlessHttp(
      creds,
      "/api/measurements/water-intake/${URLEncoder.encode(today, "UTF-8")}",
      "GET",
      null
    )
    if (totalStatus == HEADLESS_HTTP_OWNER_RETIRED) return true
    val newWaterMl = try {
      if (totalStatus in 200..299) {
        totalBody?.let { JSONObject(it).optDouble("water_ml") }?.takeIf { !it.isNaN() }
      } else null
    } catch (_: Throwable) {
      null
    }
    if (!isHeadlessOwnerStillActive(context, creds)) return true
    val waterTotalApplied = patchCachedContextAfterHeadlessWrite(
      context = context,
      expectedOwner = payloadOwner,
      expectedGeneration = creds.generation,
      clientId = "",
      entryDate = today,
      newWaterConsumedMl = newWaterMl,
      waterReadAfterSeq = seqBeforeRead,
      deletedWaterEntryId = entryId
    )
    if (newWaterMl == null || !waterTotalApplied) {
      scheduleWaterTotalReconcile(
        context = context,
        ownerId = payloadOwner,
        expectedGeneration = creds.generation,
        clientId = "",
        entryDate = today,
        deletedWaterEntryId = entryId
      )
    }
    if (clientId.isNotEmpty()) {
      sendMessageOrTransfer(
        context,
        mapOf("type" to "ack", "clientId" to clientId, "ok" to true),
        durable = false
      )
    }
    activeModule?.emitEvent(
      "onWatchServerSynced",
      mapOf("domain" to "water", "ownerId" to payloadOwner, "entryDate" to today)
    )
    return true
  }

  private suspend fun patchCachedContextAfterHeadlessWrite(
    context: Context,
    expectedOwner: String,
    expectedGeneration: Long,
    clientId: String,
    entryDate: String? = null,
    newWaterConsumedMl: Double? = null,
    waterReadAfterSeq: Long? = null,
    deletedWaterEntryId: String? = null,
    medicationDoseId: String? = null,
    medicationStatus: String? = null,
    updateFast: Boolean = false,
    fastUpdate: JSONObject? = null,
    hasCheckIn: Boolean = false,
    checkInWeightKg: Double? = null,
    checkInBodyFat: Double? = null,
    checkInReadAfterSeq: Long? = null
  ): Boolean {
    if (expectedOwner.isEmpty()) return false
    val appCtx = context.applicationContext
    val updatedSnapshot = synchronized(credentialsStateLock) {
      val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val currentGeneration = prefs.getLong(CREDENTIALS_GENERATION_KEY, 0L)
      if (currentGeneration != expectedGeneration) {
        return@synchronized null
      }
      if (!isContextCacheAuthorizedLocked(appCtx, expectedOwner, expectedGeneration)) {
        return@synchronized null
      }
      val raw = prefs.getString(LAST_CONTEXT_JSON_KEY, null) ?: return@synchronized null
      try {
        val obj = JSONObject(raw)
        val ctxOwner = obj.optString("workoutServerId", "")
        if (ctxOwner.isNotEmpty() && ctxOwner != expectedOwner) return@synchronized null
        val isSameDay = !entryDate.isNullOrEmpty() && obj.optString("today", "") == entryDate
        val currentCachedSeq = prefs.getLong(LAST_CACHED_CONTEXT_SEQ_KEY, 0L)
        if (hasCheckIn) {
          if (entryDate.isNullOrEmpty() || checkInWeightKg == null || checkInWeightKg <= 0.0) {
            return@synchronized null
          }
          if (checkInReadAfterSeq != null && currentCachedSeq != checkInReadAfterSeq) {
            return@synchronized null
          }
          if (isSameDay) {
            obj.put("todayWeightKg", checkInWeightKg)
            if (checkInBodyFat != null && checkInBodyFat > 0.0) {
              obj.put("todayBodyFatPercentage", checkInBodyFat)
            }
          }
          if (checkInBodyFat != null && checkInBodyFat > 0.0) {
            val existingBfHistory = obj.optJSONArray("bodyFatHistory") ?: JSONArray()
            val bfByDay = LinkedHashMap<String, JSONObject>()
            for (i in 0 until existingBfHistory.length()) {
              val bObj = existingBfHistory.optJSONObject(i) ?: continue
              val d = bObj.optString("day", "")
              if (d.isNotEmpty()) bfByDay[d] = bObj
            }
            bfByDay[entryDate] = JSONObject().apply {
              put("day", entryDate)
              put("bodyFatPercentage", checkInBodyFat)
            }
            val nextBfHistory = JSONArray()
            for ((_, bfObj) in bfByDay.entries.sortedBy { it.key }) {
              nextBfHistory.put(bfObj)
            }
            obj.put("bodyFatHistory", nextBfHistory)
          }
          val existingHistory = obj.optJSONArray("history") ?: JSONArray()
          val rowsByDay = LinkedHashMap<String, JSONObject>()
          for (i in 0 until existingHistory.length()) {
            val hObj = existingHistory.optJSONObject(i) ?: continue
            val d = hObj.optString("day", "")
            if (d.isNotEmpty()) rowsByDay[d] = hObj
          }
          val priorPoint = rowsByDay[entryDate]
          val updatedPoint = JSONObject().apply {
            put("day", entryDate)
            put("weightKg", checkInWeightKg)
            if (checkInBodyFat != null && checkInBodyFat > 0.0) {
              put("bodyFatPercentage", checkInBodyFat)
            } else if (priorPoint != null && priorPoint.has("bodyFatPercentage") && !priorPoint.isNull("bodyFatPercentage")) {
              val priorBf = priorPoint.optDouble("bodyFatPercentage")
              if (!priorBf.isNaN() && priorBf > 0.0) {
                put("bodyFatPercentage", priorBf)
              }
            }
          }
          rowsByDay[entryDate] = updatedPoint
          val nextHistory = JSONArray()
          for ((_, rowObj) in rowsByDay.entries.sortedBy { it.key }) {
            nextHistory.put(rowObj)
          }
          obj.put("history", nextHistory)
        }
        val nextSeq = currentCachedSeq + 1L
        obj.put("pushedAt", System.currentTimeMillis())
        obj.put("contextGeneration", expectedGeneration)
        obj.put("contextSeq", nextSeq)
        var waterTotalApplied = false
        if (
          isSameDay &&
          newWaterConsumedMl != null &&
          (waterReadAfterSeq == null || currentCachedSeq == waterReadAfterSeq)
        ) {
          obj.put("waterConsumedMl", newWaterConsumedMl)
          waterTotalApplied = true
        }
        if (!deletedWaterEntryId.isNullOrEmpty()) {
          val logArr = obj.optJSONArray("waterLog")
          if (logArr != null) {
            val nextLog = JSONArray()
            for (i in 0 until logArr.length()) {
              val item = logArr.optJSONObject(i) ?: continue
              if (item.optString("id", "") != deletedWaterEntryId) {
                nextLog.put(item)
              }
            }
            obj.put("waterLog", nextLog)
          }
        }
        if (isSameDay && medicationDoseId != null && medicationStatus != null) {
          val medsArr = obj.optJSONArray("medications")
          if (medsArr != null) {
            for (i in 0 until medsArr.length()) {
              val dObj = medsArr.optJSONObject(i) ?: continue
              if (dObj.optString("id") == medicationDoseId) {
                dObj.put("status", medicationStatus)
              }
            }
          }
        }
        if (updateFast) {
          obj.put("fast", fastUpdate ?: JSONObject.NULL)
          obj.put("fastKnown", true)
        }
        if (clientId.isNotEmpty()) {
          val existingAcked = obj.optJSONArray("ackedClientIds") ?: JSONArray()
          val deduped = LinkedHashSet<String>()
          for (i in 0 until existingAcked.length()) {
            val id = existingAcked.optString(i, "")
            if (id.isNotEmpty()) deduped.add(id)
          }
          deduped.add(clientId)
          val trimmedAcked = JSONArray()
          for (id in deduped.toList().takeLast(20)) {
            trimmedAcked.put(id)
          }
          obj.put("ackedClientIds", trimmedAcked)
        }
        val nextJson = obj.toString()
        prefs.edit()
          .putString(LAST_CONTEXT_JSON_KEY, nextJson)
          .putLong(LAST_CACHED_CONTEXT_SEQ_KEY, nextSeq)
          .apply()
        HeadlessContextPatchResult(expectedGeneration, nextSeq, nextJson, waterTotalApplied)
      } catch (_: Throwable) {
        null
      }
    } ?: return false
    publishAuthorizedContextJson(
      appCtx = appCtx,
      expectedOwner = expectedOwner,
      expectedGeneration = updatedSnapshot.generation,
      expectedSeq = updatedSnapshot.seq,
      json = updatedSnapshot.json
    )
    return updatedSnapshot.waterTotalApplied
  }

  private fun normalizeMedicationDayString(raw: String?): String? {
    val trimmed = raw?.trim()?.takeIf { it.length >= 10 } ?: return null
    val candidate = trimmed.substring(0, 10)
    return try {
      LocalDate.parse(candidate).toString()
    } catch (_: Throwable) {
      null
    }
  }

  private fun isHeadlessMedicationScheduleDueOnDate(
    schedObj: JSONObject,
    dateString: String
  ): Boolean {
    if (schedObj.has("active") && !schedObj.isNull("active") && !schedObj.optBoolean("active", true)) {
      return false
    }
    val type = if (schedObj.has("schedule_type_id") && !schedObj.isNull("schedule_type_id")) {
      schedObj.optString("schedule_type_id", "").trim()
    } else ""
    if (type.isEmpty() || type == "prn") return false

    val targetDate = try {
      LocalDate.parse(dateString)
    } catch (_: Throwable) {
      return false
    }
    val startDateStr = if (schedObj.has("start_date") && !schedObj.isNull("start_date")) {
      normalizeMedicationDayString(schedObj.optString("start_date", ""))
    } else null
    val endDateStr = if (schedObj.has("end_date") && !schedObj.isNull("end_date")) {
      normalizeMedicationDayString(schedObj.optString("end_date", ""))
    } else null
    if (startDateStr == null && schedObj.has("created_at") && !schedObj.isNull("created_at")) {
      val createdMs = parseIsoMillis(schedObj.optString("created_at", ""))
      if (createdMs != null) {
        val fallbackStart = Instant.ofEpochMilli(createdMs).atZone(ZoneId.systemDefault()).toLocalDate().toString()
        if (dateString < fallbackStart) return false
      }
    }
    if (startDateStr != null && dateString < startDateStr) return false
    if (endDateStr != null && dateString > endDateStr) return false

    return when (type) {
      "daily", "taper" -> true
      "weekly", "specific_days" -> {
        val daysArr = schedObj.optJSONArray("days_of_week") ?: return false
        if (daysArr.length() == 0) return false
        val jsDow = targetDate.dayOfWeek.value % 7
        var matched = false
        for (i in 0 until daysArr.length()) {
          if (!daysArr.isNull(i) && daysArr.optInt(i, -1) == jsDow) {
            matched = true
            break
          }
        }
        matched
      }
      "every_n_days" -> {
        val intervalDays = if (schedObj.has("interval_days") && !schedObj.isNull("interval_days")) {
          schedObj.optInt("interval_days", -1)
        } else -1
        if (intervalDays <= 0) return false
        val anchorDate = try {
          LocalDate.parse(startDateStr ?: "2020-01-01")
        } catch (_: Throwable) {
          return false
        }
        val diff = ChronoUnit.DAYS.between(anchorDate, targetDate)
        diff >= 0L && diff % intervalDays.toLong() == 0L
      }
      "monthly" -> {
        val targetDom = if (schedObj.has("day_of_month") && !schedObj.isNull("day_of_month")) {
          schedObj.optInt("day_of_month", -1)
        } else -1
        if (targetDom <= 0) return false
        val dom = targetDate.dayOfMonth
        if (dom == targetDom) return true
        val lastDay = targetDate.lengthOfMonth()
        targetDom > dom && dom == lastDay && targetDom >= lastDay
      }
      "cyclic" -> {
        val onDays = if (schedObj.has("cycle_on_days") && !schedObj.isNull("cycle_on_days")) {
          schedObj.optInt("cycle_on_days", -1)
        } else -1
        if (onDays <= 0) return false
        val offDays = if (schedObj.has("cycle_off_days") && !schedObj.isNull("cycle_off_days")) {
          schedObj.optInt("cycle_off_days", 0).coerceAtLeast(0)
        } else 0
        val period = (onDays + offDays).toLong()
        val anchorDate = try {
          LocalDate.parse(startDateStr ?: "2020-01-01")
        } catch (_: Throwable) {
          return false
        }
        val diff = ChronoUnit.DAYS.between(anchorDate, targetDate)
        diff >= 0L && (diff % period) < onDays.toLong()
      }
      else -> false
    }
  }

  private fun hasHeadlessLegacyMedicationEntry(
    entries: JSONArray,
    medicationId: String
  ): Boolean {
    for (i in 0 until entries.length()) {
      val row = entries.optJSONObject(i) ?: continue
      val eMed = if (row.has("medication_id") && !row.isNull("medication_id")) row.optString("medication_id") else ""
      val eSched = if (row.has("schedule_id") && !row.isNull("schedule_id")) row.optString("schedule_id").takeIf { it.isNotEmpty() } else null
      val eStatus = if (row.has("status") && !row.isNull("status")) row.optString("status") else ""
      if (eMed == medicationId && eSched == null && eStatus != "prn_taken") {
        return true
      }
    }
    return false
  }

  private enum class HeadlessLegacyMedicationFallback {
    ALLOW_LEGACY,
    DISALLOW_LEGACY,
    RETRY_LATER,
    OWNER_RETIRED
  }

  private fun resolveHeadlessLegacyMedicationFallback(
    creds: HeadlessCredentials,
    entryDate: String,
    medicationId: String,
    scheduleId: String
  ): HeadlessLegacyMedicationFallback {
    if (scheduleId.isEmpty()) return HeadlessLegacyMedicationFallback.DISALLOW_LEGACY
    val (mStatus, mBody) = performHeadlessHttp(
      creds,
      "/api/v2/medications?activeOnly=true",
      "GET",
      null
    )
    if (mStatus == HEADLESS_HTTP_OWNER_RETIRED) {
      return HeadlessLegacyMedicationFallback.OWNER_RETIRED
    }
    if (mStatus !in 200..299 || mBody.isNullOrBlank()) {
      return HeadlessLegacyMedicationFallback.RETRY_LATER
    }
    return try {
      val medsArr = JSONArray(mBody)
      for (i in 0 until medsArr.length()) {
        val medObj = medsArr.optJSONObject(i) ?: continue
        val id = if (medObj.has("id") && !medObj.isNull("id")) medObj.optString("id", "").trim() else ""
        if (id != medicationId) continue
        if (medObj.has("is_active") && !medObj.isNull("is_active") && !medObj.optBoolean("is_active", true)) {
          return HeadlessLegacyMedicationFallback.DISALLOW_LEGACY
        }
        val schedules = medObj.optJSONArray("schedules")
          ?: return HeadlessLegacyMedicationFallback.DISALLOW_LEGACY
        var dueCount = 0
        var matchedSchedule = false
        for (j in 0 until schedules.length()) {
          val schedObj = schedules.optJSONObject(j) ?: continue
          if (!isHeadlessMedicationScheduleDueOnDate(schedObj, entryDate)) continue
          dueCount += 1
          val sId = if (schedObj.has("id") && !schedObj.isNull("id")) schedObj.optString("id", "").trim() else ""
          if (sId == scheduleId) {
            matchedSchedule = true
          }
        }
        return if (dueCount == 1 && matchedSchedule) {
          HeadlessLegacyMedicationFallback.ALLOW_LEGACY
        } else {
          HeadlessLegacyMedicationFallback.DISALLOW_LEGACY
        }
      }
      HeadlessLegacyMedicationFallback.DISALLOW_LEGACY
    } catch (_: Throwable) {
      HeadlessLegacyMedicationFallback.RETRY_LATER
    }
  }

  private fun findHeadlessMedicationDoseEntry(
    entries: JSONArray,
    medicationId: String,
    scheduleId: String,
    allowLegacyFallback: Boolean
  ): JSONObject? {
    val asNeeded = scheduleId.isEmpty()
    var exactMatch: JSONObject? = null
    var legacyFallback: JSONObject? = null
    for (i in 0 until entries.length()) {
      val row = entries.optJSONObject(i) ?: continue
      val eMed = if (row.has("medication_id") && !row.isNull("medication_id")) row.optString("medication_id") else ""
      val eSched = if (row.has("schedule_id") && !row.isNull("schedule_id")) row.optString("schedule_id").takeIf { it.isNotEmpty() } else null
      val eStatus = if (row.has("status") && !row.isNull("status")) row.optString("status") else ""
      if (asNeeded) {
        if (eMed == medicationId && eStatus == "prn_taken") {
          exactMatch = row
          break
        }
      } else if (eSched == scheduleId) {
        exactMatch = row
        break
      } else if (
        allowLegacyFallback &&
        legacyFallback == null &&
        eMed == medicationId &&
        eSched == null &&
        eStatus != "prn_taken"
      ) {
        legacyFallback = row
      }
    }
    return exactMatch ?: if (allowLegacyFallback) legacyFallback else null
  }

  private suspend fun performHeadlessMedicationTaken(
    context: Context,
    clientId: String,
    entryDate: String,
    medicationId: String,
    scheduleId: String,
    taken: Boolean,
    skipped: Boolean,
    payloadOwner: String,
    rawJson: String?
  ) {
    if (entryDate.isEmpty() || medicationId.isEmpty() || payloadOwner.isEmpty()) return
    val doseMutex = medicationDoseMutex(payloadOwner, entryDate, medicationId, scheduleId)
    doseMutex.withLock {
      withContext(Dispatchers.IO) {
        val creds = acquireHeadlessCredentials(context, payloadOwner)
        if (creds == null) {
          if (rawJson != null) enqueueInboundJson(context, rawJson)
          return@withContext
        }
        val encDate = URLEncoder.encode(entryDate, "UTF-8")
        val encMed = URLEncoder.encode(medicationId, "UTF-8")
        val (lStatus, lBody) = performHeadlessHttp(
          creds,
          "/api/v2/medications/entries?fromDate=$encDate&toDate=$encDate&medicationId=$encMed",
          "GET",
          null
        )
        if (lStatus == HEADLESS_HTTP_OWNER_RETIRED) {
          return@withContext
        }
        if (lStatus !in 200..299 || lBody.isNullOrBlank()) {
          if (lStatus == 400 || lStatus == 422) {
            removeQueuedInboundEvent(context, clientId, type = "medicationTaken", ownerId = payloadOwner)
            if (isHeadlessOwnerStillActive(context, creds)) {
              sendMessageOrTransfer(context, mapOf("type" to "ack", "clientId" to clientId, "ok" to false), durable = false)
            }
          } else if (rawJson != null) {
            enqueueInboundJson(context, rawJson)
          }
          return@withContext
        }
        if (!isHeadlessOwnerStillActive(context, creds)) {
          return@withContext
        }
        try {
          val entries = JSONArray(lBody)
          val asNeeded = scheduleId.isEmpty()
          var existing = findHeadlessMedicationDoseEntry(
            entries,
            medicationId,
            scheduleId,
            allowLegacyFallback = false
          )
          if (existing == null && !asNeeded && hasHeadlessLegacyMedicationEntry(entries, medicationId)) {
            val legacyDecision = resolveHeadlessLegacyMedicationFallback(
              creds = creds,
              entryDate = entryDate,
              medicationId = medicationId,
              scheduleId = scheduleId
            )
            when (legacyDecision) {
              HeadlessLegacyMedicationFallback.OWNER_RETIRED -> return@withContext
              HeadlessLegacyMedicationFallback.RETRY_LATER -> {
                if (rawJson != null && isHeadlessOwnerStillActive(context, creds)) {
                  enqueueInboundJson(context, rawJson)
                }
                return@withContext
              }
              HeadlessLegacyMedicationFallback.ALLOW_LEGACY -> {
                if (!isHeadlessOwnerStillActive(context, creds)) return@withContext
                existing = findHeadlessMedicationDoseEntry(
                  entries,
                  medicationId,
                  scheduleId,
                  allowLegacyFallback = true
                )
              }
              HeadlessLegacyMedicationFallback.DISALLOW_LEGACY -> {
                if (!isHeadlessOwnerStillActive(context, creds)) return@withContext
              }
            }
          }
          val existingId = existing?.optString("id", "")?.takeIf { it.isNotEmpty() }
          val existingStatus = existing?.optString("status", "") ?: ""
          val isTaken = existingStatus == "taken" || existingStatus == "prn_taken"
          val isSkipped = existingStatus == "skipped"
          val wantSkip = skipped && !asNeeded
          val nowIso = Instant.ofEpochMilli(System.currentTimeMillis()).toString()

          val (wStatus, _) = when {
            !wantSkip && !taken -> {
              if (existingId != null && (isTaken || isSkipped)) {
                performHeadlessHttp(creds, "/api/v2/medications/entries/${Uri.encode(existingId)}", "DELETE", null)
              } else {
                200 to "{}"
              }
            }
            if (wantSkip) isSkipped else isTaken -> 200 to "{}"
            existingId != null -> {
              val targetSt = if (wantSkip) "skipped" else "taken"
              val body = JSONObject().apply {
                if (scheduleId.isNotEmpty()) put("schedule_id", scheduleId)
                put("status", targetSt)
                if (targetSt != "skipped") put("taken_at", nowIso)
              }
              performHeadlessHttp(creds, "/api/v2/medications/entries/${Uri.encode(existingId)}", "PUT", body)
            }
            else -> {
              val targetSt = if (asNeeded) "prn_taken" else if (wantSkip) "skipped" else "taken"
              val body = JSONObject().apply {
                put("medication_id", medicationId)
                if (scheduleId.isNotEmpty()) put("schedule_id", scheduleId)
                put("status", targetSt)
                put("entry_date", entryDate)
                if (targetSt != "skipped") put("taken_at", nowIso)
              }
              performHeadlessHttp(creds, "/api/v2/medications/entries", "POST", body)
            }
          }
          if (wStatus == HEADLESS_HTTP_OWNER_RETIRED) {
            return@withContext
          }
          if (wStatus in 200..299 || (!wantSkip && !taken && wStatus == 404)) {
            removeQueuedInboundEvent(context, clientId, type = "medicationTaken", ownerId = payloadOwner)
            if (!isHeadlessOwnerStillActive(context, creds)) return@withContext
            val nextDoseStatus = when {
              wantSkip -> "skipped"
              taken -> "taken"
              else -> "pending"
            }
            sendMessageOrTransfer(context, mapOf("type" to "ack", "clientId" to clientId, "ok" to true), durable = false)
            patchCachedContextAfterHeadlessWrite(
              context = context,
              expectedOwner = payloadOwner,
              expectedGeneration = creds.generation,
              clientId = clientId,
              entryDate = entryDate,
              medicationDoseId = "$medicationId:$scheduleId",
              medicationStatus = nextDoseStatus
            )
            activeModule?.emitEvent(
              "onWatchServerSynced",
              mapOf("domain" to "medications", "ownerId" to payloadOwner, "entryDate" to entryDate)
            )
          } else if (wStatus == 400 || wStatus == 422) {
            removeQueuedInboundEvent(context, clientId, type = "medicationTaken", ownerId = payloadOwner)
            if (isHeadlessOwnerStillActive(context, creds)) {
              sendMessageOrTransfer(context, mapOf("type" to "ack", "clientId" to clientId, "ok" to false), durable = false)
            }
          } else if (rawJson != null) {
            enqueueInboundJson(context, rawJson)
          }
        } catch (_: Throwable) {
          if (rawJson != null) enqueueInboundJson(context, rawJson)
        }
      }
    }
  }

  private suspend fun performHeadlessFastStart(
    context: Context,
    clientId: String,
    presetId: String,
    requestedStartedAt: Long?,
    payloadOwner: String,
    rawJson: String?
  ) {
    val creds = acquireHeadlessCredentials(context, payloadOwner)
    if (creds == null) {
      if (rawJson != null) enqueueInboundJson(context, rawJson)
      return
    }
    val settledStartOk = if (clientId.isNotEmpty()) {
      getSettledFastStartOutcome(context, payloadOwner, clientId)
    } else {
      null
    }
    if (settledStartOk != null) {
      if (settledStartOk) {
        val (freshKnown, freshFast) = fetchFreshFastState(creds)
        if (!freshKnown) {
          if (rawJson != null && isHeadlessOwnerStillActive(context, creds)) {
            enqueueInboundJson(context, rawJson)
          }
          return
        }
        removeQueuedInboundEvent(context, clientId, type = "fastStart", ownerId = payloadOwner)
        clearInFlightForegroundFastStart(clientId, payloadOwner)
        if (isHeadlessOwnerStillActive(context, creds)) {
          sendMessageOrTransfer(
            context,
            buildFastAckPayload(
              clientId = clientId,
              ok = true,
              fastKnown = true,
              fast = freshFast
            ),
            durable = false
          )
          drainQueuedFastEndsForOwner(context, payloadOwner)
        }
      } else {
        removeQueuedInboundEvent(context, clientId, type = "fastStart", ownerId = payloadOwner)
        clearInFlightForegroundFastStart(clientId, payloadOwner)
        if (isHeadlessOwnerStillActive(context, creds)) {
          sendMessageOrTransfer(
            context,
            mapOf("type" to "ack", "clientId" to clientId, "ok" to false),
            durable = false
          )
          drainQueuedFastEndsForOwner(context, payloadOwner)
        }
      }
      return
    }
    val (fastingType, hours) = when (presetId) {
      "16-8" -> "16:8 Leangains" to 16.0
      "18-6" -> "18:6 Warrior" to 18.0
      "20-4" -> "20:4 Warrior" to 20.0
      "circumadian" -> "Circadian Rhythm" to 13.0
      "custom" -> "Custom Fast" to 12.0
      else -> presetId.ifBlank { "16:8 Leangains" } to 16.0
    }
    val (cStatus, cBody) = performHeadlessHttp(creds, "/api/fasting/current", "GET", null)
    if (cStatus == HEADLESS_HTTP_OWNER_RETIRED) return
    if (cStatus !in 200..299 || cBody == null) {
      if (rawJson != null) enqueueInboundJson(context, rawJson)
      return
    }
    val trimmed = cBody.trim()
    if (trimmed.isEmpty()) {
      if (rawJson != null) enqueueInboundJson(context, rawJson)
      return
    }
    val existingManualFast: JSONObject? = if (trimmed == "null") {
      null
    } else {
      try {
        val currentObj = JSONObject(trimmed)
        if (currentObj.optBoolean("is_auto_calculated", false)) null else currentObj
      } catch (_: Throwable) {
        if (rawJson != null) enqueueInboundJson(context, rawJson)
        return
      }
    }
    if (!isHeadlessOwnerStillActive(context, creds)) {
      return
    }
    val confirmedFastJson: JSONObject?
    if (existingManualFast == null) {
      val startMs = requestedStartedAt?.takeIf { it > 0L } ?: System.currentTimeMillis()
      val targetMs = startMs + (hours * 3_600_000.0).toLong()
      val body = JSONObject()
        .put("start_time", Instant.ofEpochMilli(startMs).toString())
        .put("target_end_time", Instant.ofEpochMilli(targetMs).toString())
        .put("fasting_type", fastingType)
      val (sStatus, sBody) = performHeadlessHttp(creds, "/api/fasting/start", "POST", body)
      if (sStatus == HEADLESS_HTTP_OWNER_RETIRED) return
      if (sStatus !in 200..299) {
        if (sStatus == 400 || sStatus == 422) {
          removeQueuedInboundEvent(context, clientId, type = "fastStart", ownerId = payloadOwner)
          if (isHeadlessOwnerStillActive(context, creds)) {
            recordFastStartClientSettled(context, payloadOwner, clientId, ok = false)
            sendMessageOrTransfer(context, mapOf("type" to "ack", "clientId" to clientId, "ok" to false), durable = false)
            drainQueuedFastEndsForOwner(context, payloadOwner)
          }
        } else if (rawJson != null) {
          enqueueInboundJson(context, rawJson)
        }
        return
      }
      confirmedFastJson = try {
        sBody?.trim()?.takeIf { it.isNotEmpty() && it != "null" }?.let { toWatchFastJson(JSONObject(it)) }
      } catch (_: Throwable) {
        null
      } ?: JSONObject()
        .put("startedAt", startMs)
        .put("targetEndAt", targetMs)
        .put("label", fastingType)
    } else {
      val parsedExisting = toWatchFastJson(existingManualFast)
      if (parsedExisting == null && !existingManualFast.optBoolean("is_eating_window", false)) {
        if (rawJson != null) enqueueInboundJson(context, rawJson)
        return
      }
      confirmedFastJson = parsedExisting
    }
    removeQueuedInboundEvent(context, clientId, type = "fastStart", ownerId = payloadOwner)
    if (!isHeadlessOwnerStillActive(context, creds)) return
    recordFastStartClientSettled(context, payloadOwner, clientId, ok = true)
    sendMessageOrTransfer(
      context,
      buildFastAckPayload(clientId = clientId, ok = true, fastKnown = true, fast = confirmedFastJson),
      durable = false
    )
    patchCachedContextAfterHeadlessWrite(
      context = context,
      expectedOwner = payloadOwner,
      expectedGeneration = creds.generation,
      clientId = clientId,
      updateFast = true,
      fastUpdate = confirmedFastJson
    )
    val startSyncEvent = mutableMapOf<String, Any?>("domain" to "fasting", "ownerId" to payloadOwner)
    if (clientId.isNotEmpty()) startSyncEvent["clientId"] = clientId
    activeModule?.emitEvent("onWatchServerSynced", startSyncEvent)
    drainQueuedFastEndsForOwner(context, payloadOwner)
  }

  internal suspend fun drainQueuedFastEndsForOwnerUnderMutex(context: Context, payloadOwner: String) {
    if (payloadOwner.isEmpty()) return
    val appCtx = context.applicationContext
    val fastMutex = fastOwnerMutex(payloadOwner)
    fastMutex.withLock {
      withContext(Dispatchers.IO) {
        drainQueuedFastEndsForOwner(appCtx, payloadOwner)
      }
    }
  }

  private suspend fun drainQueuedFastEndsForOwner(context: Context, payloadOwner: String) {
    val queuedEnds = peekQueuedFastEndsForOwnerIfNoQueuedStart(context, payloadOwner)
    for (endRaw in queuedEnds) {
      val map = try {
        jsonObjectToMap(JSONObject(endRaw))
      } catch (_: Throwable) {
        continue
      }
      val endClientId = map["clientId"] as? String ?: ""
      val endFastId = (map["fastId"] as? String)?.trim()?.takeIf { it.isNotEmpty() }
      val endRequestedStartedAt = asDouble(map["startedAt"])?.toLong()?.takeIf { it > 0L }
      val endRequestedEndedAt = asDouble(map["endedAt"])?.toLong()?.takeIf { it > 0L }
      performHeadlessFastEnd(
        context = context,
        clientId = endClientId,
        requestedFastId = endFastId,
        requestedStartedAt = endRequestedStartedAt,
        requestedEndedAt = endRequestedEndedAt,
        payloadOwner = payloadOwner,
        rawJson = endRaw
      )
    }
  }

  private suspend fun performHeadlessFastEnd(
    context: Context,
    clientId: String,
    requestedFastId: String?,
    requestedStartedAt: Long?,
    requestedEndedAt: Long?,
    payloadOwner: String,
    rawJson: String?
  ) {
    val creds = acquireHeadlessCredentials(context, payloadOwner)
    if (creds == null) {
      if (rawJson != null) enqueueInboundJson(context, rawJson)
      return
    }
    val settledOutcome = if (clientId.isNotEmpty()) {
      getSettledFastEndOutcome(context, payloadOwner, clientId)
    } else {
      null
    }
    if (settledOutcome != null) {
      val (freshKnown, freshFast) = fetchFreshFastState(creds)
      if (!freshKnown) {
        if (rawJson != null && isHeadlessOwnerStillActive(context, creds)) {
          enqueueInboundJson(context, rawJson)
        }
        return
      }
      removeQueuedInboundEvent(context, clientId, type = "fastEnd", ownerId = payloadOwner)
      if (isHeadlessOwnerStillActive(context, creds)) {
        sendMessageOrTransfer(
          context,
          buildFastAckPayload(
            clientId = clientId,
            ok = true,
            fastKnown = true,
            fast = freshFast
          ),
          durable = false
        )
      }
      return
    }
    if (hasQueuedFastStartForOwner(context, payloadOwner)) {
      if (rawJson != null) enqueueInboundJson(context, rawJson)
      return
    }
    val (cStatus, cBody) = performHeadlessHttp(creds, "/api/fasting/current", "GET", null)
    if (cStatus == HEADLESS_HTTP_OWNER_RETIRED) return
    if (cStatus !in 200..299 || cBody == null) {
      if (rawJson != null) enqueueInboundJson(context, rawJson)
      return
    }
    val trimmed = cBody.trim()
    if (trimmed.isEmpty()) {
      if (rawJson != null) enqueueInboundJson(context, rawJson)
      return
    }
    var settledFastJson: JSONObject? = null
    if (trimmed != "null") {
      try {
        val obj = JSONObject(trimmed)
        if (obj.optBoolean("is_auto_calculated", false)) {
          if (!obj.optBoolean("is_eating_window", false)) {
            val calculatedFast = toWatchFastJson(obj)
            if (calculatedFast == null) {
              if (rawJson != null) enqueueInboundJson(context, rawJson)
              return
            }
            settledFastJson = calculatedFast
          }
        } else {
          val id = if (obj.has("id") && !obj.isNull("id")) obj.optString("id", "").trim() else ""
          val startTime = if (obj.has("start_time") && !obj.isNull("start_time")) obj.optString("start_time", "").trim() else ""
          if (id.isEmpty() || startTime.isEmpty()) {
            if (rawJson != null) enqueueInboundJson(context, rawJson)
            return
          }
          val serverStartedAtMs = parseIsoMillis(startTime)
          if (requestedFastId.isNullOrEmpty() && requestedStartedAt == null) {
            removeQueuedInboundEvent(context, clientId, type = "fastEnd", ownerId = payloadOwner)
            if (isHeadlessOwnerStillActive(context, creds)) {
              sendMessageOrTransfer(
                context,
                mapOf("type" to "ack", "clientId" to clientId, "ok" to false),
                durable = false
              )
            }
            return
          }
          val staleReplay = if (!requestedFastId.isNullOrEmpty()) {
            id != requestedFastId
          } else {
            val expectedStartedAt = requestedStartedAt!!
            serverStartedAtMs == null ||
              kotlin.math.abs(serverStartedAtMs - expectedStartedAt) > 1_000L ||
              (requestedEndedAt != null && requestedEndedAt > 0L && serverStartedAtMs > requestedEndedAt)
          }
          if (staleReplay) {
            val activeWatchFast = toWatchFastJson(obj)
            if (activeWatchFast == null && !obj.optBoolean("is_eating_window", false)) {
              if (rawJson != null) enqueueInboundJson(context, rawJson)
              return
            }
            removeQueuedInboundEvent(context, clientId, type = "fastEnd", ownerId = payloadOwner)
            if (!isHeadlessOwnerStillActive(context, creds)) return
            recordFastEndClientSettled(context, payloadOwner, clientId, activeWatchFast)
            sendMessageOrTransfer(
              context,
              buildFastAckPayload(
                clientId = clientId,
                ok = true,
                fastKnown = true,
                fast = activeWatchFast
              ),
              durable = false
            )
            patchCachedContextAfterHeadlessWrite(
              context = context,
              expectedOwner = payloadOwner,
              expectedGeneration = creds.generation,
              clientId = clientId,
              updateFast = true,
              fastUpdate = activeWatchFast
            )
            activeModule?.emitEvent("onWatchServerSynced", mapOf("domain" to "fasting", "ownerId" to payloadOwner))
            return
          }
          if (!isHeadlessOwnerStillActive(context, creds)) {
            return
          }
          val rawEndMs = requestedEndedAt?.takeIf { it > 0L } ?: System.currentTimeMillis()
          val safeEndMs = if (serverStartedAtMs != null && rawEndMs < serverStartedAtMs) {
            serverStartedAtMs
          } else {
            rawEndMs
          }
          val body = JSONObject()
            .put("id", id)
            .put("start_time", startTime)
            .put("end_time", Instant.ofEpochMilli(safeEndMs).toString())
          val (eStatus, _) = performHeadlessHttp(creds, "/api/fasting/end", "POST", body)
          if (eStatus == HEADLESS_HTTP_OWNER_RETIRED) return
          if (eStatus !in 200..299) {
            if (eStatus == 400 || eStatus == 422) {
              removeQueuedInboundEvent(context, clientId, type = "fastEnd", ownerId = payloadOwner)
              if (isHeadlessOwnerStillActive(context, creds)) {
                sendMessageOrTransfer(context, mapOf("type" to "ack", "clientId" to clientId, "ok" to false), durable = false)
              }
            } else if (rawJson != null) {
              enqueueInboundJson(context, rawJson)
            }
            return
          }
        }
      } catch (_: Throwable) {
        if (rawJson != null) enqueueInboundJson(context, rawJson)
        return
      }
    }
    removeQueuedInboundEvent(context, clientId, type = "fastEnd", ownerId = payloadOwner)
    if (!isHeadlessOwnerStillActive(context, creds)) return
    recordFastEndClientSettled(context, payloadOwner, clientId, settledFastJson)
    sendMessageOrTransfer(
      context,
      buildFastAckPayload(clientId = clientId, ok = true, fastKnown = true, fast = settledFastJson),
      durable = false
    )
    patchCachedContextAfterHeadlessWrite(
      context = context,
      expectedOwner = payloadOwner,
      expectedGeneration = creds.generation,
      clientId = clientId,
      updateFast = true,
      fastUpdate = settledFastJson
    )
    activeModule?.emitEvent("onWatchServerSynced", mapOf("domain" to "fasting", "ownerId" to payloadOwner))
  }

  private fun sessionNeedsPresetTargets(sessionObj: JSONObject): Boolean {
    val exercises = sessionObj.optJSONArray("exercises") ?: return true
    if (exercises.length() == 0) return true
    var sawAnySet = false
    for (i in 0 until exercises.length()) {
      val ex = exercises.optJSONObject(i) ?: continue
      val sets = ex.optJSONArray("sets") ?: continue
      for (sIdx in 0 until sets.length()) {
        val s = sets.optJSONObject(sIdx) ?: continue
        sawAnySet = true
        val hasTarget =
          (s.has("reps") && !s.isNull("reps")) ||
            (s.has("weight") && !s.isNull("weight")) ||
            (s.has("duration") && !s.isNull("duration")) ||
            (s.has("distance") && !s.isNull("distance"))
        if (!hasTarget) return true
      }
    }
    return !sawAnySet
  }

  private suspend fun performHeadlessWorkoutStart(
    context: Context,
    presetIdStr: String,
    payloadOwner: String,
    rawJson: String?,
    preMintedSessionId: String? = null,
    accountGen: Long? = null
  ) {
    val cleanPreMintedId = preMintedSessionId?.trim()?.takeIf { it.isNotEmpty() }
    val presetId = presetIdStr.toIntOrNull()
    if (cleanPreMintedId == null && presetId == null) return

    val creds = acquireHeadlessCredentials(context, payloadOwner)
    if (creds == null) {
      if (rawJson != null) enqueueInboundJson(context, rawJson)
      return
    }

    var recoveredSessionObj: JSONObject? = null
    if (cleanPreMintedId != null) {
      val (existingStatus, existingBody) = performHeadlessHttp(
        creds,
        "/api/exercise-preset-entries/${Uri.encode(cleanPreMintedId)}",
        "GET",
        null
      )
      when {
        existingStatus in 200..299 && !existingBody.isNullOrBlank() -> {
          recoveredSessionObj = try {
            JSONObject(existingBody).takeIf { it.optString("id", "").isNotEmpty() }
          } catch (_: Throwable) {
            null
          }
          if (recoveredSessionObj == null) {
            if (rawJson != null) enqueueInboundJson(context, rawJson)
            return
          }
        }
        existingStatus == HEADLESS_HTTP_OWNER_RETIRED -> {
          return
        }
        existingStatus == 404 -> {
          // Session was not created yet; proceed to preset GET + POST below.
        }
        existingStatus in 400..499 && existingStatus != 408 && existingStatus != 429 -> {
          return
        }
        else -> {
          if (rawJson != null) enqueueInboundJson(context, rawJson)
          return
        }
      }
    }

    if (recoveredSessionObj == null && presetId == null) return

    val (pStatus, pBody) = if (presetId != null) {
      performHeadlessHttp(
        creds,
        "/api/workout-presets/$presetId",
        "GET",
        null
      )
    } else {
      404 to null
    }
    if (pStatus == HEADLESS_HTTP_OWNER_RETIRED) return
    if (recoveredSessionObj == null && (pStatus !in 200..299 || pBody.isNullOrBlank())) {
      if (pStatus !in 400..499 || pStatus == 408 || pStatus == 429) {
        if (rawJson != null) enqueueInboundJson(context, rawJson)
      }
      return
    }
    if (!isHeadlessOwnerStillActive(context, creds)) {
      return
    }
    fun enqueueWorkoutRecovery(sessionIdForRecovery: String?) {
      val cleanId = sessionIdForRecovery?.trim()?.takeIf { it.isNotEmpty() }
      if (cleanId != null) {
        val recoveryJson = try {
          (if (!rawJson.isNullOrEmpty()) JSONObject(rawJson) else JSONObject())
            .put("type", "workoutStartRequested")
            .put("presetId", presetIdStr)
            .put("serverId", payloadOwner)
            .put("sessionId", cleanId)
            .apply {
              if (accountGen != null && accountGen > 0L) {
                put("accountGen", accountGen)
              }
            }
            .toString()
        } catch (_: Throwable) {
          rawJson
        }
        if (recoveryJson != null) enqueueInboundJson(context, recoveryJson)
      } else if (rawJson != null) {
        enqueueInboundJson(context, rawJson)
      }
    }

    var recoverySessionId: String? = cleanPreMintedId
    try {
      val presetObj = if (pStatus in 200..299 && !pBody.isNullOrBlank()) {
        try {
          JSONObject(pBody)
        } catch (_: Throwable) {
          null
        }
      } else {
        null
      }
      if (recoveredSessionObj == null && presetObj == null) {
        enqueueWorkoutRecovery(recoverySessionId)
        return
      }
      if (
        recoveredSessionObj != null &&
        presetObj == null &&
        presetId != null &&
        sessionNeedsPresetTargets(recoveredSessionObj) &&
        (pStatus !in 400..499 || pStatus == 408 || pStatus == 429)
      ) {
        enqueueWorkoutRecovery(recoverySessionId)
        return
      }
      val presetName = presetObj?.optString("name", "")?.takeIf { it.isNotBlank() }
        ?: recoveredSessionObj?.optString("name", "")?.takeIf { it.isNotBlank() }
        ?: "Workout"
      val workoutFormat = recoveredSessionObj?.optString("workout_format", "")?.takeIf { it.isNotBlank() }
        ?: presetObj?.optString("workout_format", "")?.takeIf { it.isNotBlank() }
        ?: "standard"
      val timeCapSec = when {
        recoveredSessionObj != null && recoveredSessionObj.has("time_cap_seconds") && !recoveredSessionObj.isNull("time_cap_seconds") ->
          recoveredSessionObj.optInt("time_cap_seconds")
        presetObj != null && presetObj.has("time_cap_seconds") && !presetObj.isNull("time_cap_seconds") ->
          presetObj.optInt("time_cap_seconds")
        else -> null
      }
      val presetExArr = presetObj?.optJSONArray("exercises") ?: JSONArray()

      val reqExArr = JSONArray()
      val plannedTargetsByEx = mutableListOf<Map<Int, JSONObject>>()
      val plannedSetsByExOccurrence = HashMap<String, Map<Int, JSONObject>>()
      val presetExOccurrences = HashMap<String, Int>()
      val presetSupersetGroups = mutableListOf<Int?>()

      for (i in 0 until presetExArr.length()) {
        val pEx = presetExArr.optJSONObject(i) ?: continue
        val exId = pEx.optString("exercise_id", "").trim()
        if (exId.isEmpty()) continue
        val occ = presetExOccurrences.getOrDefault(exId, 0)
        presetExOccurrences[exId] = occ + 1
        val modality = pEx.optString("modality", "")
        val category = pEx.optString("category", "")
        val isCardio = modality == "duration_distance" || category.equals("Cardio", ignoreCase = true)

        val pSets = pEx.optJSONArray("sets") ?: JSONArray()
        val reqSets = JSONArray()
        val setsByNumber = LinkedHashMap<Int, JSONObject>()

        if (pSets.length() == 0) {
          val sObj = JSONObject().apply {
            put("set_number", 1)
            put("set_type", "normal")
            put("rest_time", if (isCardio) 0 else 90)
          }
          reqSets.put(sObj)
          setsByNumber[1] = JSONObject()
        } else {
          for (sIdx in 0 until pSets.length()) {
            val ps = pSets.optJSONObject(sIdx) ?: continue
            val setNum = if (ps.has("set_number") && !ps.isNull("set_number")) {
              ps.optInt("set_number").takeIf { it > 0 } ?: (sIdx + 1)
            } else {
              sIdx + 1
            }
            val restSec = if (isCardio) 0 else if (ps.has("rest_time") && !ps.isNull("rest_time")) ps.optInt("rest_time", 90) else 90
            val sObj = JSONObject().apply {
              put("set_number", setNum)
              put("set_type", ps.optString("set_type", "normal").ifBlank { "normal" })
              put("rest_time", restSec)
              if (ps.has("notes") && !ps.isNull("notes")) put("notes", ps.optString("notes"))
            }
            reqSets.put(sObj)
            setsByNumber[setNum] = ps
          }
        }
        plannedTargetsByEx.add(setsByNumber)
        plannedSetsByExOccurrence["$exId#$occ"] = setsByNumber
        val supersetGroup = if (pEx.has("superset_group") && !pEx.isNull("superset_group")) {
          pEx.optInt("superset_group")
        } else null
        presetSupersetGroups.add(supersetGroup)
        val reqEx = JSONObject().apply {
          put("exercise_id", exId)
          put("sort_order", i)
          put("duration_minutes", 0)
          if (supersetGroup != null) {
            put("superset_group", supersetGroup)
          }
          put("sets", reqSets)
        }
        reqExArr.put(reqEx)
      }

      val isRecovered = recoveredSessionObj != null
      val sessionObj: JSONObject = if (recoveredSessionObj != null) {
          recoveredSessionObj
        } else {
          if (reqExArr.length() == 0 || presetId == null) return
          val createSessionId = cleanPreMintedId ?: UUID.randomUUID().toString()
          val createReq = JSONObject().apply {
            put("id", createSessionId)
            put("name", presetName)
            put("entry_date", LocalDate.now().toString())
            put("source", "sparky")
            put("workout_preset_id", presetId)
            put("exercises", reqExArr)
          }

          val (cStatus, cBody) = performHeadlessHttp(
            creds,
            "/api/exercise-preset-entries/",
            "POST",
            createReq
          )
          if (cStatus == HEADLESS_HTTP_OWNER_RETIRED) return
          if (cStatus in 200..299) {
            recoverySessionId = createSessionId
            if (cBody.isNullOrBlank()) {
              enqueueWorkoutRecovery(recoverySessionId)
              return
            }
          } else {
            if (cStatus !in 400..499 || cStatus == 408 || cStatus == 429) {
              recoverySessionId = createSessionId
              enqueueWorkoutRecovery(recoverySessionId)
            }
            return
          }
          if (!isHeadlessOwnerStillActive(context, creds)) return
          JSONObject(cBody).also { created ->
            created.optString("id", "").trim().takeIf { it.isNotEmpty() }?.let {
              recoverySessionId = it
            }
          }
        }

        val sessionId = sessionObj.optString("id", "").trim().ifEmpty { recoverySessionId ?: "" }
        if (sessionId.isEmpty()) {
          enqueueWorkoutRecovery(recoverySessionId)
          return
        }
        recoverySessionId = sessionId
        val sessionExercises = sessionObj.optJSONArray("exercises") ?: JSONArray()

        data class HeadlessBuiltExercise(
          val supersetGroup: Int?,
          val watchSets: List<MutableMap<String, Any?>>,
          val exMap: MutableMap<String, Any?>
        )

        val builtExercises = mutableListOf<HeadlessBuiltExercise>()
        val sessionExOccurrences = HashMap<String, Int>()

        for (i in 0 until sessionExercises.length()) {
          val sEx = sessionExercises.optJSONObject(i) ?: continue
          val entryId = sEx.optString("id", "")
          val snap = sEx.optJSONObject("exercise_snapshot")
          val sExId = sEx.optString("exercise_id", "").trim().ifEmpty {
            snap?.optString("id", "")?.trim() ?: ""
          }
          val sOcc = if (sExId.isNotEmpty()) {
            val cur = sessionExOccurrences.getOrDefault(sExId, 0)
            sessionExOccurrences[sExId] = cur + 1
            cur
          } else {
            -1
          }
          val exName = snap?.optString("name")?.takeIf { it.isNotBlank() } ?: "Exercise"
          val modality = snap?.optString("modality") ?: ""
          val isBodyweight = modality == "bodyweight_reps"
          val isTimed = modality == "duration" || modality == "duration_distance" || modality == "weight_duration"
          val isCarry = modality == "weight_distance"
          val isWeightedTimed = modality == "weight_duration"
          val supersetGroup = if (sEx.has("superset_group") && !sEx.isNull("superset_group")) {
            sEx.optInt("superset_group")
          } else if (!isRecovered) {
            presetSupersetGroups.getOrNull(i)
          } else {
            null
          }

          val sSets = sEx.optJSONArray("sets") ?: JSONArray()
          val plannedSetsByNum: Map<Int, JSONObject> = if (sExId.isNotEmpty() && sOcc >= 0) {
            plannedSetsByExOccurrence["$sExId#$sOcc"] ?: emptyMap()
          } else if (!isRecovered) {
            plannedTargetsByEx.getOrNull(i) ?: emptyMap()
          } else {
            emptyMap()
          }
          val watchSets = mutableListOf<MutableMap<String, Any?>>()

          for (sIdx in 0 until sSets.length()) {
            val ss = sSets.optJSONObject(sIdx) ?: continue
            val setId = ss.opt("id")?.toString() ?: continue
            val setNum = if (ss.has("set_number") && !ss.isNull("set_number")) {
              ss.optInt("set_number").takeIf { it > 0 } ?: (sIdx + 1)
            } else {
              sIdx + 1
            }
            val planned = plannedSetsByNum[setNum]
            val targetReps = when {
              ss.has("reps") && !ss.isNull("reps") -> ss.optInt("reps")
              planned != null && planned.has("reps") && !planned.isNull("reps") -> planned.optInt("reps")
              else -> null
            }
            val targetWeightKg = when {
              ss.has("weight") && !ss.isNull("weight") -> ss.optDouble("weight")
              planned != null && planned.has("weight") && !planned.isNull("weight") -> planned.optDouble("weight")
              else -> null
            }
            val targetDurationSec = when {
              ss.has("duration") && !ss.isNull("duration") -> ss.optInt("duration")
              planned != null && planned.has("duration") && !planned.isNull("duration") -> planned.optInt("duration")
              else -> null
            }
            val targetDistanceKm = when {
              ss.has("distance") && !ss.isNull("distance") -> ss.optDouble("distance")
              planned != null && planned.has("distance") && !planned.isNull("distance") -> planned.optDouble("distance")
              else -> null
            }
            val restSeconds = if (ss.has("rest_time") && !ss.isNull("rest_time")) ss.optInt("rest_time", 0) else 0
            val setType = ss.optString("set_type", "normal")

            val setMap = mutableMapOf<String, Any?>(
              "setId" to setId,
              "targetReps" to targetReps,
              "targetWeightKg" to targetWeightKg,
              "targetDurationSec" to targetDurationSec,
              "targetDistanceKm" to targetDistanceKm,
              "restSeconds" to restSeconds,
              "restAfterSeconds" to restSeconds,
              "setType" to setType
            )
            if (isTimed) setMap["timed"] = true
            if (isCarry) setMap["carry"] = true
            if (isWeightedTimed) setMap["weighted"] = true
            watchSets.add(setMap)
          }

          val exMap = mutableMapOf<String, Any?>(
            "exerciseEntryId" to entryId,
            "name" to exName,
            "bodyweight" to isBodyweight,
            "sets" to watchSets
          )
          snap?.optJSONArray("equipment")?.optString(0)?.takeIf { it.isNotBlank() }?.let {
            exMap["equipment"] = it
          }
          snap?.optJSONArray("primary_muscles")?.optString(0)?.takeIf { it.isNotBlank() }?.let {
            exMap["muscle"] = it
          }
          val imageId = snap?.optString("id")?.takeIf { it.isNotBlank() }
          val imagesArr = snap?.optJSONArray("images")
          if (imageId != null && imagesArr != null && imagesArr.length() > 0) {
            exMap["imageKey"] = imageId
            exMap["imageCount"] = minOf(imagesArr.length(), 2)
          }
          builtExercises.add(HeadlessBuiltExercise(supersetGroup, watchSets, exMap))
        }
        if (builtExercises.isEmpty() || builtExercises.all { it.watchSets.isEmpty() }) {
          enqueueWorkoutRecovery(sessionId)
          return
        }

        // Mirror getSupersetRuns + buildStepsFromSession on the phone: identify
        // adjacent runs of 2+ exercises sharing a non-null superset_group, assign
        // 0-based supersetRun indices, interleave setOrder round-robin, and set
        // restSeconds to 0 inside a superset round (groupRest before each round).
        val setOrder = mutableListOf<String>()
        var nextSupersetRun = 0
        var idx = 0
        while (idx < builtExercises.size) {
          val current = builtExercises[idx]
          val group = current.supersetGroup
          if (group != null) {
            var end = idx + 1
            while (end < builtExercises.size && builtExercises[end].supersetGroup == group) {
              end += 1
            }
            if (end - idx >= 2) {
              val runIdx = nextSupersetRun++
              val members = builtExercises.subList(idx, end)
              for (member in members) {
                member.exMap["supersetRun"] = runIdx
              }
              val roundCount = members.maxOfOrNull { it.watchSets.size } ?: 0
              for (round in 0 until roundCount) {
                val groupRest = (members[0].watchSets.getOrNull(round)?.get("restAfterSeconds") as? Int) ?: 90
                var firstInRound = true
                for (member in members) {
                  val setMap = member.watchSets.getOrNull(round) ?: continue
                  val isDrop = (setMap["setType"] as? String).equals("drop", ignoreCase = true)
                  setMap["restSeconds"] = if (isDrop) 0 else if (firstInRound) groupRest else 0
                  firstInRound = false
                  setOrder.add(setMap["setId"] as String)
                }
              }
              idx = end
              continue
            }
          }
          for (setMap in current.watchSets) {
            val ownRest = (setMap["restAfterSeconds"] as? Int) ?: 0
            val isDrop = (setMap["setType"] as? String).equals("drop", ignoreCase = true)
            setMap["restSeconds"] = if (isDrop) 0 else ownRest
            setOrder.add(setMap["setId"] as String)
          }
          idx += 1
        }
        val watchExercises = builtExercises.map { it.exMap }

        val nowMs = System.currentTimeMillis()
        val nowIso = Instant.ofEpochMilli(nowMs).toString()
        val sessionStartedAt =
          sessionObj.optString("start_time", "").trim().takeIf { it.isNotEmpty() }
            ?: sessionObj.optString("created_at", "").trim().takeIf { it.isNotEmpty() }
            ?: nowIso
        val startPayload = mutableMapOf<String, Any?>(
          "type" to "workoutStart",
          "sessionId" to sessionId,
          "ownerId" to payloadOwner,
          "workoutName" to sessionObj.optString("name", presetName),
          "exercises" to watchExercises,
          "setOrder" to setOrder,
          "workoutFormat" to workoutFormat,
          "startedAt" to sessionStartedAt,
          "armedAt" to nowIso,
          "fromPreset" to true
        )
        if (accountGen != null && accountGen > 0L) {
          startPayload["accountGen"] = accountGen
        }
        if (timeCapSec != null) {
          startPayload["timeCapSeconds"] = timeCapSec
        }
        if (!isHeadlessOwnerStillActive(context, creds)) return
        val transferResult = sendMessageOrTransfer(context, startPayload, durable = true, slotKey = "latest")
        if (transferResult.durableQueued) {
          removeQueuedWorkoutRecovery(context, sessionId, payloadOwner)
        } else {
          enqueueWorkoutRecovery(sessionId)
        }
        if (!transferResult.liveSent && !transferResult.durableQueued) {
          return
        }
        lastWorkoutArmedAtMs.set(nowMs)
        launchWatchApp(context, "workout")
        activeModule?.emitEvent(
          "onWatchServerSynced",
          mapOf("domain" to "workout", "ownerId" to payloadOwner)
        )
    } catch (e: Throwable) {
      Log.w(TAG, "performHeadlessWorkoutStart failed: ${e.message}")
      enqueueWorkoutRecovery(recoverySessionId)
    }
  }

  private fun scheduleWaterTotalReconcile(
    context: Context,
    ownerId: String,
    expectedGeneration: Long,
    clientId: String,
    entryDate: String,
    deletedWaterEntryId: String? = null
  ) {
    val appCtx = context.applicationContext
    val waterMutex = waterOwnerMutex(ownerId)
    scope.launch {
      val backoffMs = longArrayOf(2_000L, 5_000L, 12_000L)
      for (waitMs in backoffMs) {
        delay(waitMs)
        val reconciled = waterMutex.withLock {
          withContext(Dispatchers.IO) {
            val creds = acquireHeadlessCredentials(appCtx, ownerId) ?: return@withContext true
            if (creds.generation != expectedGeneration) return@withContext true
            val seqBeforeRead = readCachedContextSeq(appCtx)
            val (totalStatus, totalBody) = performHeadlessHttp(
              creds,
              "/api/measurements/water-intake/${URLEncoder.encode(entryDate, "UTF-8")}",
              "GET",
              null
            )
            if (totalStatus == HEADLESS_HTTP_OWNER_RETIRED) return@withContext true
            val refreshedWaterMl = try {
              if (totalStatus in 200..299) {
                totalBody?.let { JSONObject(it).optDouble("water_ml") }?.takeIf { !it.isNaN() }
              } else null
            } catch (_: Throwable) {
              null
            }
            if (refreshedWaterMl == null) return@withContext false
            if (!isHeadlessOwnerStillActive(appCtx, creds)) return@withContext true
            val waterTotalApplied = patchCachedContextAfterHeadlessWrite(
              context = appCtx,
              expectedOwner = ownerId,
              expectedGeneration = creds.generation,
              clientId = clientId,
              entryDate = entryDate,
              newWaterConsumedMl = refreshedWaterMl,
              waterReadAfterSeq = seqBeforeRead,
              deletedWaterEntryId = deletedWaterEntryId
            )
            if (!waterTotalApplied) return@withContext false
            activeModule?.emitEvent(
              "onWatchServerSynced",
              mapOf("domain" to "water", "ownerId" to ownerId)
            )
            true
          }
        }
        if (reconciled) return@launch
      }
    }
  }

  private fun scheduleCheckInReconcile(
    context: Context,
    ownerId: String,
    expectedGeneration: Long,
    clientId: String,
    entryDate: String
  ) {
    val appCtx = context.applicationContext
    val checkInMutex = checkInOwnerMutex(ownerId)
    scope.launch {
      val backoffMs = longArrayOf(2_000L, 5_000L, 12_000L)
      for (waitMs in backoffMs) {
        delay(waitMs)
        val reconciled = checkInMutex.withLock {
          withContext(Dispatchers.IO) {
            val creds = acquireHeadlessCredentials(appCtx, ownerId) ?: return@withContext true
            if (creds.generation != expectedGeneration) return@withContext true
            val seqBeforeRead = readCachedContextSeq(appCtx)
            val encDate = URLEncoder.encode(entryDate, "UTF-8")
            val (status, body) = performHeadlessHttp(
              creds,
              "/api/measurements/check-in-measurements-range/$encDate/$encDate",
              "GET",
              null
            )
            if (status == HEADLESS_HTTP_OWNER_RETIRED) return@withContext true
            if (status !in 200..299 || body.isNullOrBlank()) return@withContext false
            val parsed = try {
              val arr = JSONArray(body)
              val obj = if (arr.length() > 0) arr.optJSONObject(0) else null
              if (obj == null) {
                null
              } else {
                val w = obj.optDouble("weight")
                if (w.isNaN() || w <= 0.0) {
                  null
                } else {
                  val bf = if (obj.has("body_fat_percentage") && !obj.isNull("body_fat_percentage")) {
                    obj.optDouble("body_fat_percentage").takeIf { !it.isNaN() && it > 0.0 }
                  } else null
                  w to bf
                }
              }
            } catch (_: Throwable) {
              null
            } ?: return@withContext false
            if (!isHeadlessOwnerStillActive(appCtx, creds)) return@withContext true
            val applied = patchCachedContextAfterHeadlessWrite(
              context = appCtx,
              expectedOwner = ownerId,
              expectedGeneration = creds.generation,
              clientId = clientId,
              entryDate = entryDate,
              hasCheckIn = true,
              checkInWeightKg = parsed.first,
              checkInBodyFat = parsed.second,
              checkInReadAfterSeq = seqBeforeRead
            )
            if (!applied) return@withContext false
            activeModule?.emitEvent(
              "onWatchServerSynced",
              mapOf("domain" to "checkIn", "ownerId" to ownerId, "entryDate" to entryDate)
            )
            true
          }
        }
        if (reconciled) return@launch
      }
    }
  }

  private fun isWaterIntakeTapExpired(payload: Map<String, Any?>, entryDate: String): Boolean {
    val expiresAtMs = asDouble(payload["expiresAtMs"])?.toLong()?.takeIf { it > 0L }
    if (expiresAtMs != null) {
      return System.currentTimeMillis() > expiresAtMs
    }
    if (entryDate.isBlank()) return false
    return try {
      LocalDate.parse(entryDate).isBefore(LocalDate.now().minusDays(1))
    } catch (_: Throwable) {
      false
    }
  }

  private fun activeOwnerId(context: Context): String {
    return getTelemetryOwner(context)
  }

  private fun buildSetCompletedEvent(
    payload: Map<String, Any?>,
    fallbackSessionId: String = ""
  ): MutableMap<String, Any?> {
    val sessionId = (payload["sessionId"] as? String)?.takeIf { it.isNotEmpty() } ?: fallbackSessionId
    val event = mutableMapOf<String, Any?>(
      "clientId" to (payload["clientId"] as? String ?: ""),
      "sessionId" to sessionId,
      "setId" to (payload["setId"] as? String ?: "")
    )
    asDouble(payload["weightKg"])?.let { event["weightKg"] = it }
    asDouble(payload["reps"])?.let { event["reps"] = it }
    asDouble(payload["rpe"])?.let { event["rpe"] = it }
    if (payload["rpeOnly"] == true) event["rpeOnly"] = true
    asInt(payload["duration"])?.let { event["duration"] = it }
    asDouble(payload["distanceKm"])?.let { event["distanceKm"] = it }
    (payload["completedAt"] as? String)?.let { event["completedAt"] = it }
    return event
  }

  private fun routePayload(context: Context, payload: Map<String, Any?>, rawJson: String? = null) {
    val mod = activeModule
    val jsForeground = mod != null && isAppInForeground.get()
    when (payload["type"] as? String) {
      "watchDirectSynced" -> {
        val domain = payload["domain"] as? String ?: ""
        val ownerId = payload["ownerId"] as? String ?: ""
        val entryDate = (payload["entryDate"] as? String)?.takeIf { it.isNotEmpty() }
        val clientId = (payload["clientId"] as? String)?.trim()?.takeIf { it.isNotEmpty() }
        val activeOwner = activeOwnerId(context)
        if (domain == "fasting" && ownerId.isNotEmpty() && ownerId == activeOwner && clientId != null) {
          val removedQueuedStart = removeQueuedInboundEvent(
            context,
            clientId,
            type = "fastStart",
            ownerId = ownerId
          )
          val clearedInFlightStart = clearInFlightForegroundFastStart(clientId, ownerId).isNotEmpty()
          if (removedQueuedStart || clearedInFlightStart) {
            val fastMutex = fastOwnerMutex(ownerId)
            scope.launch(start = CoroutineStart.UNDISPATCHED) {
              fastMutex.withLock {
                withContext(Dispatchers.IO) {
                  val creds = acquireHeadlessCredentials(context, ownerId)
                  if (creds != null && isHeadlessOwnerStillActive(context, creds)) {
                    recordFastStartClientSettled(context, ownerId, clientId, ok = true)
                    drainQueuedFastEndsForOwner(context, ownerId)
                  }
                }
              }
            }
          }
        }
        val event = mutableMapOf<String, Any?>("domain" to domain, "ownerId" to ownerId)
        if (entryDate != null) event["entryDate"] = entryDate
        if (clientId != null) event["clientId"] = clientId
        mod?.emitEvent("onWatchServerSynced", event)
      }
      "checkIn" -> {
        val payloadOwner = payload["ownerId"] as? String ?: ""
        val activeOwner = activeOwnerId(context)
        if (payloadOwner.isEmpty() || activeOwner.isEmpty() || payloadOwner != activeOwner) {
          if (rawJson != null) enqueueInboundJson(context, rawJson)
          return
        }
        val clientId = payload["clientId"] as? String ?: ""
        val entryDate = payload["entryDate"] as? String ?: ""
        val weightKg = asDouble(payload["weightKg"]) ?: 0.0
        val bodyFat = asDouble(payload["bodyFatPercentage"])
        if (jsForeground && mod != null) {
          val event = mutableMapOf<String, Any?>(
            "clientId" to clientId,
            "entryDate" to entryDate,
            "weightKg" to weightKg,
            "ownerId" to payloadOwner
          )
          bodyFat?.let { event["bodyFatPercentage"] = it }
          mod.emitEvent("onCheckIn", event)
        } else {
          val checkInMutex = checkInOwnerMutex(payloadOwner)
          scope.launch(start = CoroutineStart.UNDISPATCHED) {
            checkInMutex.withLock {
              withContext(Dispatchers.IO) {
                val creds = acquireHeadlessCredentials(context, payloadOwner)
                if (creds == null) {
                  if (rawJson != null) enqueueInboundJson(context, rawJson)
                  return@withContext
                }
                val seqBeforeWrite = readCachedContextSeq(context)
                val body = JSONObject().apply {
                  put("entry_date", entryDate)
                  put("weight", weightKg)
                  if (bodyFat != null) put("body_fat_percentage", bodyFat)
                }
                val (status, _) = performHeadlessHttp(creds, "/api/measurements/check-in", "POST", body)
                if (status == HEADLESS_HTTP_OWNER_RETIRED) return@withContext
                if (status in 200..299) {
                  removeQueuedInboundEvent(context, clientId, type = "checkIn", ownerId = payloadOwner)
                  if (!isHeadlessOwnerStillActive(context, creds)) return@withContext
                  sendMessageOrTransfer(context, mapOf("type" to "ack", "clientId" to clientId, "ok" to true), durable = false)
                  val checkInApplied = patchCachedContextAfterHeadlessWrite(
                    context = context,
                    expectedOwner = payloadOwner,
                    expectedGeneration = creds.generation,
                    clientId = clientId,
                    entryDate = entryDate,
                    hasCheckIn = true,
                    checkInWeightKg = weightKg,
                    checkInBodyFat = bodyFat,
                    checkInReadAfterSeq = seqBeforeWrite
                  )
                  if (!checkInApplied) {
                    scheduleCheckInReconcile(
                      context = context,
                      ownerId = payloadOwner,
                      expectedGeneration = creds.generation,
                      clientId = clientId,
                      entryDate = entryDate
                    )
                  }
                  activeModule?.emitEvent(
                    "onWatchServerSynced",
                    mapOf("domain" to "checkIn", "ownerId" to payloadOwner, "entryDate" to entryDate)
                  )
                } else if (status == 400 || status == 422) {
                  removeQueuedInboundEvent(context, clientId, type = "checkIn", ownerId = payloadOwner)
                  if (isHeadlessOwnerStillActive(context, creds)) {
                    sendMessageOrTransfer(context, mapOf("type" to "ack", "clientId" to clientId, "ok" to false), durable = false)
                  }
                } else if (rawJson != null) {
                  enqueueInboundJson(context, rawJson)
                }
              }
            }
          }
        }
      }
      "credentialsAck" -> {
        handleCredentialsAck(context, payload)
      }
      "requestContext" -> {
        val needsCredentials = payload["needsCredentials"] as? Boolean == true
        if (needsCredentials) {
          val appCtx = context.applicationContext
          synchronized(credentialsStateLock) {
            val wm = readRevocationWatermarksLocked(appCtx)
            val cur = readCredentialTransportSnapshotLocked(appCtx)
            val requiresMtls = isPhoneClientCertificateConfigured(appCtx)
            val curValid =
              !wm.hasUnfinished &&
                cur.ownerId.isNotEmpty() &&
                cur.baseUrl != null &&
                cur.headersObj != null &&
                cur.generation > 0L &&
                (wm.pending == 0L || cur.generation > wm.pending)
            if (curValid) {
              val curRev = resolveTransportRevisionLocked(appCtx, cur.generation, requiresMtls)
              appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putLong(PENDING_FORCED_CRED_REPUBLISH_GEN_KEY, cur.generation)
                .putLong(PENDING_FORCED_CRED_REPUBLISH_REV_KEY, curRev)
                .apply()
            }
          }
        }
        scope.launch {
          publishWatchCredentials(context, forcePublish = needsCredentials)
        }
        if (jsForeground && mod != null) {
          mod.emitEvent("onContextRequest", emptyMap<String, Any?>())
        } else {
          scope.launch {
            replayCachedContextIfAuthorized(context)
            replayCachedComplicationConfig(context)
          }
        }
      }
      "waterTapCancel" -> {
        val payloadOwner = payload["ownerId"] as? String ?: ""
        val activeOwner = activeOwnerId(context)
        if (payloadOwner.isEmpty() || activeOwner.isEmpty() || payloadOwner != activeOwner) {
          return
        }
        val clientId = (payload["clientId"] as? String)?.trim() ?: ""
        if (clientId.isEmpty()) return
        markWaterTapCancelled(context, payloadOwner, clientId)
        removeQueuedInboundEvent(context, clientId, type = "waterIntake", ownerId = payloadOwner)
        if (jsForeground && mod != null) {
          mod.emitEvent(
            "onWaterTapCancel",
            mapOf("clientId" to clientId, "ownerId" to payloadOwner)
          )
        }
        val waterMutex = waterOwnerMutex(payloadOwner)
        scope.launch(start = CoroutineStart.UNDISPATCHED) {
          waterMutex.withLock {
            withContext(Dispatchers.IO) {
              val committedEntryId = peekCreatedWaterEntryId(context, payloadOwner, clientId)
              if (committedEntryId == COMMITTED_WATER_TAP_NO_ROW_ID) {
                consumeCreatedWaterEntryId(context, payloadOwner, clientId)
                removeQueuedInboundEvent(context, clientId, type = "waterTapCancel", ownerId = payloadOwner)
                if (activeOwnerId(context) == payloadOwner) {
                  sendMessageOrTransfer(
                    context,
                    mapOf("type" to "ack", "clientId" to clientId, "ok" to false),
                    durable = false
                  )
                  activeModule?.emitEvent(
                    "onWatchServerSynced",
                    mapOf("domain" to "water", "ownerId" to payloadOwner, "entryDate" to LocalDate.now().toString())
                  )
                }
              } else if (committedEntryId != null) {
                val creds = acquireHeadlessCredentials(context, payloadOwner)
                if (creds == null) {
                  if (rawJson != null) enqueueInboundJson(context, rawJson)
                  return@withContext
                }
                val settled = executeCompensatingWaterDeleteHeadless(
                  context = context,
                  creds = creds,
                  payloadOwner = payloadOwner,
                  clientId = clientId,
                  entryId = committedEntryId
                )
                if (!settled && rawJson != null) {
                  enqueueInboundJson(context, rawJson)
                }
              } else {
                val uncertainEntryDate = peekUncertainWaterWriteDate(context, payloadOwner, clientId)
                if (uncertainEntryDate != null) {
                  val creds = acquireHeadlessCredentials(context, payloadOwner)
                  if (creds == null) {
                    if (rawJson != null) enqueueInboundJson(context, rawJson)
                    return@withContext
                  }
                  when (val lookup = findWaterLogEntryIdByClientIdWithStatus(creds, uncertainEntryDate, clientId)) {
                    is WaterLogLookupResult.Found -> {
                      val settled = executeCompensatingWaterDeleteHeadless(
                        context = context,
                        creds = creds,
                        payloadOwner = payloadOwner,
                        clientId = clientId,
                        entryId = lookup.entryId
                      )
                      if (settled) {
                        consumeUncertainWaterWrite(context, payloadOwner, clientId)
                      } else if (rawJson != null) {
                        enqueueInboundJson(context, rawJson)
                      }
                    }
                    WaterLogLookupResult.Absent -> {
                      consumeUncertainWaterWrite(context, payloadOwner, clientId)
                      removeQueuedInboundEvent(context, clientId, type = "waterTapCancel", ownerId = payloadOwner)
                      if (isHeadlessOwnerStillActive(context, creds)) {
                        sendMessageOrTransfer(
                          context,
                          mapOf("type" to "ack", "clientId" to clientId, "ok" to true),
                          durable = false
                        )
                      }
                    }
                    WaterLogLookupResult.TransientError -> {
                      if (rawJson != null) enqueueInboundJson(context, rawJson)
                    }
                  }
                } else {
                  removeQueuedInboundEvent(context, clientId, type = "waterTapCancel", ownerId = payloadOwner)
                  if (!(jsForeground && mod != null) && activeOwnerId(context) == payloadOwner) {
                    sendMessageOrTransfer(
                      context,
                      mapOf("type" to "ack", "clientId" to clientId, "ok" to true),
                      durable = false
                    )
                  }
                }
              }
            }
          }
        }
      }
      "waterIntake" -> {
        val payloadOwner = payload["ownerId"] as? String ?: ""
        val activeOwner = activeOwnerId(context)
        if (payloadOwner.isEmpty() || activeOwner.isEmpty() || payloadOwner != activeOwner) {
          if (rawJson != null) enqueueInboundJson(context, rawJson)
          return
        }
        val clientId = payload["clientId"] as? String ?: ""
        val entryDate = (payload["entryDate"] as? String)?.trim() ?: ""
        if (clientId.isNotEmpty() && isWaterTapCancelled(context, payloadOwner, clientId)) {
          removeQueuedInboundEvent(context, clientId, type = "waterIntake", ownerId = payloadOwner)
          scope.launch {
            sendMessageOrTransfer(
              context,
              mapOf("type" to "ack", "clientId" to clientId, "ok" to true),
              durable = false
            )
          }
          return
        }
        if (isWaterIntakeTapExpired(payload, entryDate)) {
          removeQueuedInboundEvent(context, clientId, type = "waterIntake", ownerId = payloadOwner)
          if (clientId.isNotEmpty()) {
            scope.launch {
              sendMessageOrTransfer(
                context,
                mapOf("type" to "ack", "clientId" to clientId, "ok" to false),
                durable = false
              )
            }
          }
          return
        }
        val containerId = asInt(payload["containerId"]) ?: 0
        if (jsForeground && mod != null) {
          mod.emitEvent(
            "onWaterIntake",
            mapOf(
              "clientId" to clientId,
              "entryDate" to entryDate,
              "containerId" to containerId,
              "ownerId" to payloadOwner
            )
          )
        } else {
          val waterMutex = waterOwnerMutex(payloadOwner)
          scope.launch(start = CoroutineStart.UNDISPATCHED) {
            waterMutex.withLock {
              withContext(Dispatchers.IO) {
                if (clientId.isNotEmpty() && isWaterTapCancelled(context, payloadOwner, clientId)) {
                  removeQueuedInboundEvent(context, clientId, type = "waterIntake", ownerId = payloadOwner)
                  if (activeOwnerId(context) == payloadOwner) {
                    sendMessageOrTransfer(
                      context,
                      mapOf("type" to "ack", "clientId" to clientId, "ok" to true),
                      durable = false
                    )
                  }
                  return@withContext
                }
                if (isWaterIntakeTapExpired(payload, entryDate)) {
                  removeQueuedInboundEvent(context, clientId, type = "waterIntake", ownerId = payloadOwner)
                  if (clientId.isNotEmpty() && activeOwnerId(context) == payloadOwner) {
                    sendMessageOrTransfer(
                      context,
                      mapOf("type" to "ack", "clientId" to clientId, "ok" to false),
                      durable = false
                    )
                  }
                  return@withContext
                }
                val creds = acquireHeadlessCredentials(context, payloadOwner)
                if (creds == null) {
                  if (rawJson != null) enqueueInboundJson(context, rawJson)
                  return@withContext
                }
                if (!isHeadlessOwnerStillActive(context, creds)) return@withContext
                if (clientId.isNotEmpty() && isWaterTapCancelled(context, payloadOwner, clientId)) {
                  removeQueuedInboundEvent(context, clientId, type = "waterIntake", ownerId = payloadOwner)
                  sendMessageOrTransfer(
                    context,
                    mapOf("type" to "ack", "clientId" to clientId, "ok" to true),
                    durable = false
                  )
                  return@withContext
                }
                val seqBeforeRead = readCachedContextSeq(context)
                val body = JSONObject().apply {
                  put("entry_date", entryDate)
                  put("change_drinks", 1)
                  put("container_id", containerId)
                  if (clientId.isNotEmpty()) put("client_id", clientId)
                }
                if (clientId.isNotEmpty() && entryDate.isNotBlank()) {
                  recordUncertainWaterWrite(context, payloadOwner, clientId, entryDate)
                }
                val (status, respText) = performHeadlessHttp(creds, "/api/measurements/water-intake", "POST", body)
                if (status == HEADLESS_HTTP_OWNER_RETIRED) return@withContext
                if (status in 200..299) {
                  consumeUncertainWaterWrite(context, payloadOwner, clientId)
                  removeQueuedInboundEvent(context, clientId, type = "waterIntake", ownerId = payloadOwner)
                  if (!isHeadlessOwnerStillActive(context, creds)) return@withContext
                  val createdEntryId = extractExplicitWaterEntryId(respText)
                    ?: findWaterLogEntryIdByClientId(creds, entryDate, clientId)
                  if (clientId.isNotEmpty()) {
                    recordCreatedWaterEntryId(
                      context,
                      payloadOwner,
                      clientId,
                      createdEntryId ?: COMMITTED_WATER_TAP_NO_ROW_ID
                    )
                  }
                  if (clientId.isNotEmpty() && isWaterTapCancelled(context, payloadOwner, clientId)) {
                    val toDelete = createdEntryId
                    if (toDelete != null) {
                      val settled = executeCompensatingWaterDeleteHeadless(
                        context = context,
                        creds = creds,
                        payloadOwner = payloadOwner,
                        clientId = clientId,
                        entryId = toDelete
                      )
                      if (!settled) {
                        val retryCancelJson = JSONObject()
                          .put("type", "waterTapCancel")
                          .put("clientId", clientId)
                          .put("ownerId", payloadOwner)
                          .toString()
                        enqueueInboundJson(context, retryCancelJson)
                      }
                    } else if (isHeadlessOwnerStillActive(context, creds)) {
                      consumeCreatedWaterEntryId(context, payloadOwner, clientId)
                      removeQueuedInboundEvent(context, clientId, type = "waterTapCancel", ownerId = payloadOwner)
                      sendMessageOrTransfer(
                        context,
                        mapOf("type" to "ack", "clientId" to clientId, "ok" to false),
                        durable = false
                      )
                      activeModule?.emitEvent(
                        "onWatchServerSynced",
                        mapOf("domain" to "water", "ownerId" to payloadOwner, "entryDate" to entryDate)
                      )
                    }
                    return@withContext
                  }
                  val newWaterMl = try {
                    respText?.let { JSONObject(it).optDouble("water_ml") }?.takeIf { !it.isNaN() }
                  } catch (_: Throwable) {
                    null
                  }
                  sendMessageOrTransfer(context, mapOf("type" to "ack", "clientId" to clientId, "ok" to true), durable = false)
                  val waterTotalApplied = patchCachedContextAfterHeadlessWrite(
                    context = context,
                    expectedOwner = payloadOwner,
                    expectedGeneration = creds.generation,
                    clientId = clientId,
                    entryDate = entryDate,
                    newWaterConsumedMl = newWaterMl,
                    waterReadAfterSeq = seqBeforeRead
                  )
                  if (newWaterMl == null || !waterTotalApplied) {
                    scheduleWaterTotalReconcile(
                      context = context,
                      ownerId = payloadOwner,
                      expectedGeneration = creds.generation,
                      clientId = clientId,
                      entryDate = entryDate,
                      deletedWaterEntryId = null
                    )
                  }
                  val waterSyncEvent = mutableMapOf<String, Any?>(
                    "domain" to "water",
                    "ownerId" to payloadOwner,
                    "entryDate" to entryDate
                  )
                  if (clientId.isNotEmpty()) waterSyncEvent["clientId"] = clientId
                  activeModule?.emitEvent("onWatchServerSynced", waterSyncEvent)
                } else if (status == 400 || status == 422) {
                  consumeUncertainWaterWrite(context, payloadOwner, clientId)
                  removeQueuedInboundEvent(context, clientId, type = "waterIntake", ownerId = payloadOwner)
                  if (isHeadlessOwnerStillActive(context, creds)) {
                    sendMessageOrTransfer(context, mapOf("type" to "ack", "clientId" to clientId, "ok" to false), durable = false)
                  }
                } else if (rawJson != null) {
                  enqueueInboundJson(context, rawJson)
                }
              }
            }
          }
        }
      }
      "waterDelete" -> {
        val payloadOwner = payload["ownerId"] as? String ?: ""
        val activeOwner = activeOwnerId(context)
        if (payloadOwner.isEmpty() || activeOwner.isEmpty() || payloadOwner != activeOwner) {
          if (rawJson != null) enqueueInboundJson(context, rawJson)
          return
        }
        val clientId = payload["clientId"] as? String ?: ""
        val entryId = payload["entryId"] as? String ?: ""
        if (jsForeground && mod != null) {
          mod.emitEvent(
            "onWaterDelete",
            mapOf(
              "clientId" to clientId,
              "entryId" to entryId,
              "ownerId" to payloadOwner
            )
          )
        } else {
          val waterMutex = waterOwnerMutex(payloadOwner)
          scope.launch(start = CoroutineStart.UNDISPATCHED) {
            waterMutex.withLock {
              withContext(Dispatchers.IO) {
                val creds = acquireHeadlessCredentials(context, payloadOwner)
                if (creds == null) {
                  if (rawJson != null) enqueueInboundJson(context, rawJson)
                  return@withContext
                }
                val (status, _) = performHeadlessHttp(
                  creds,
                  "/api/v2/measurements/water-intake/log/${Uri.encode(entryId)}",
                  "DELETE",
                  null
                )
                if (status == HEADLESS_HTTP_OWNER_RETIRED) return@withContext
                if (status in 200..299 || status == 404) {
                  removeQueuedInboundEvent(context, clientId, type = "waterDelete", ownerId = payloadOwner)
                  if (!isHeadlessOwnerStillActive(context, creds)) return@withContext
                  val today = LocalDate.now().toString()
                  val seqBeforeRead = readCachedContextSeq(context)
                  val (totalStatus, totalBody) = performHeadlessHttp(
                    creds,
                    "/api/measurements/water-intake/${URLEncoder.encode(today, "UTF-8")}",
                    "GET",
                    null
                  )
                  val newWaterMl = try {
                    if (totalStatus in 200..299) {
                      totalBody?.let { JSONObject(it).optDouble("water_ml") }?.takeIf { !it.isNaN() }
                    } else null
                  } catch (_: Throwable) {
                    null
                  }
                  if (!isHeadlessOwnerStillActive(context, creds)) return@withContext
                  sendMessageOrTransfer(context, mapOf("type" to "ack", "clientId" to clientId, "ok" to true), durable = false)
                  val waterTotalApplied = patchCachedContextAfterHeadlessWrite(
                    context = context,
                    expectedOwner = payloadOwner,
                    expectedGeneration = creds.generation,
                    clientId = clientId,
                    entryDate = today,
                    newWaterConsumedMl = newWaterMl,
                    waterReadAfterSeq = seqBeforeRead,
                    deletedWaterEntryId = entryId
                  )
                  if (newWaterMl == null || !waterTotalApplied) {
                    scheduleWaterTotalReconcile(
                      context = context,
                      ownerId = payloadOwner,
                      expectedGeneration = creds.generation,
                      clientId = clientId,
                      entryDate = today,
                      deletedWaterEntryId = entryId
                    )
                  }
                  val waterDeleteSyncEvent = mutableMapOf<String, Any?>(
                    "domain" to "water",
                    "ownerId" to payloadOwner
                  )
                  if (clientId.isNotEmpty()) waterDeleteSyncEvent["clientId"] = clientId
                  activeModule?.emitEvent("onWatchServerSynced", waterDeleteSyncEvent)
                } else if (status == 400 || status == 422) {
                  removeQueuedInboundEvent(context, clientId, type = "waterDelete", ownerId = payloadOwner)
                  if (isHeadlessOwnerStillActive(context, creds)) {
                    sendMessageOrTransfer(context, mapOf("type" to "ack", "clientId" to clientId, "ok" to false), durable = false)
                  }
                } else if (rawJson != null) {
                  enqueueInboundJson(context, rawJson)
                }
              }
            }
          }
        }
      }
      "medicationTaken" -> {
        val payloadOwner = payload["ownerId"] as? String ?: ""
        val activeOwner = activeOwnerId(context)
        if (payloadOwner.isEmpty() || activeOwner.isEmpty() || payloadOwner != activeOwner) {
          if (rawJson != null) enqueueInboundJson(context, rawJson)
          return
        }
        val clientId = payload["clientId"] as? String ?: ""
        val entryDate = payload["entryDate"] as? String ?: ""
        val medicationId = payload["medicationId"] as? String ?: ""
        val scheduleId = payload["scheduleId"] as? String ?: ""
        val taken = payload["taken"] as? Boolean ?: true
        val skipped = payload["skipped"] as? Boolean ?: false
        if (jsForeground && mod != null) {
          mod.emitEvent(
            "onMedicationTaken",
            mapOf(
              "clientId" to clientId,
              "entryDate" to entryDate,
              "medicationId" to medicationId,
              "scheduleId" to scheduleId,
              "taken" to taken,
              "skipped" to skipped,
              "ownerId" to payloadOwner
            )
          )
        } else {
          scope.launch(start = CoroutineStart.UNDISPATCHED) {
            performHeadlessMedicationTaken(
              context = context,
              clientId = clientId,
              entryDate = entryDate,
              medicationId = medicationId,
              scheduleId = scheduleId,
              taken = taken,
              skipped = skipped,
              payloadOwner = payloadOwner,
              rawJson = rawJson
            )
          }
        }
      }
      "setCompleted" -> {
        if (mod != null) {
          mod.emitEvent("onSetCompleted", buildSetCompletedEvent(payload))
        } else if (rawJson != null) {
          enqueueInboundJson(context, rawJson)
        }
      }
      "setUncompleted" -> {
        if (mod != null) {
          mod.emitEvent(
            "onSetUncompleted",
            mapOf(
              "clientId" to (payload["clientId"] as? String ?: ""),
              "sessionId" to (payload["sessionId"] as? String ?: ""),
              "setId" to (payload["setId"] as? String ?: "")
            )
          )
        } else if (rawJson != null) {
          enqueueInboundJson(context, rawJson)
        }
      }
      "restChanged" -> {
        val event = mutableMapOf<String, Any?>(
          "sessionId" to (payload["sessionId"] as? String ?: "")
        )
        asDouble(payload["previousEndsAt"])?.let { event["previousEndsAt"] = it }
        asDouble(payload["endsAt"])?.let { event["endsAt"] = it }
        mod?.emitEvent("onRestChanged", event)
      }
      "setTimerStarted" -> {
        val startedAt = asDouble(payload["startedAt"]) ?: return
        val event = mutableMapOf<String, Any?>(
          "sessionId" to (payload["sessionId"] as? String ?: ""),
          "setId" to (payload["setId"] as? String ?: ""),
          "startedAt" to startedAt
        )
        asDouble(payload["armedAt"])?.let { event["armedAt"] = it }
        mod?.emitEvent("onSetTimerStarted", event)
      }
      "setTimerStopped" -> {
        val seconds = asInt(payload["seconds"]) ?: return
        val startedAt = asDouble(payload["startedAt"]) ?: return
        mod?.emitEvent(
          "onSetTimerStopped",
          mapOf(
            "sessionId" to (payload["sessionId"] as? String ?: ""),
            "setId" to (payload["setId"] as? String ?: ""),
            "seconds" to seconds,
            "startedAt" to startedAt
          )
        )
      }
      "heartRateBatch" -> {
        val event = synchronized(credentialsStateLock) {
          synchronized(hrLock) {
            val built = buildHeartRateEvent(context, payload)
            rememberHeartRateBatch(context, built)
            built
          }
        }
        mod?.emitEvent("onHeartRateBatch", event)
      }
      "liveHeartRate" -> {
        val bpm = asDouble(payload["bpm"]) ?: return
        val at = asDouble(payload["at"]) ?: return
        mod?.emitEvent(
          "onLiveHeartRate",
          mapOf(
            "sessionId" to (payload["sessionId"] as? String ?: ""),
            "exerciseEntryId" to (payload["exerciseEntryId"] as? String ?: ""),
            "bpm" to bpm,
            "at" to at
          )
        )
      }
      "workoutStop" -> {
        if (mod != null) {
          val stopSessionId = payload["sessionId"] as? String ?: ""
          for (completion in asMapList(payload["completedSets"])) {
            val event = buildSetCompletedEvent(completion, fallbackSessionId = stopSessionId)
            val setId = event["setId"] as? String ?: ""
            val clientId = event["clientId"] as? String ?: ""
            if (setId.isNotEmpty() && clientId.isNotEmpty()) {
              event["replay"] = true
              mod.emitEvent("onSetCompleted", event)
            }
          }
          mod.emitEvent(
            "onWorkoutStop",
            mapOf("sessionId" to stopSessionId)
          )
        } else if (rawJson != null) {
          enqueueInboundJson(context, rawJson)
        }
      }
      "workoutDiscard" -> {
        val event = mutableMapOf<String, Any?>(
          "sessionId" to (payload["sessionId"] as? String ?: "")
        )
        asDouble(payload["armedAt"])?.let { event["armedAt"] = it }
        if (mod != null) {
          mod.emitEvent("onWorkoutDiscard", event)
        } else if (rawJson != null) {
          enqueueInboundJson(context, rawJson)
        }
      }
      "workoutStartRequested" -> {
        val presetId = payload["presetId"] as? String ?: ""
        val serverId = payload["serverId"] as? String ?: ""
        val preMintedSessionId = (payload["sessionId"] as? String)?.trim()?.takeIf { it.isNotEmpty() }
        val accountGen = asDouble(payload["accountGen"])?.toLong()?.takeIf { it > 0L }
        val activeOwner = activeOwnerId(context)
        if (serverId.isEmpty() || activeOwner.isEmpty() || serverId != activeOwner) {
          if (rawJson != null) enqueueInboundJson(context, rawJson)
          return
        }
        if (preMintedSessionId == null && jsForeground && mod != null) {
          mod.emitEvent(
            "onWorkoutStartRequested",
            mapOf(
              "presetId" to presetId,
              "serverId" to serverId
            )
          )
        } else {
          scope.launch {
            performHeadlessWorkoutStart(context, presetId, serverId, rawJson, preMintedSessionId, accountGen)
          }
        }
      }
      "workoutEffort" -> {
        val event = mapOf(
          "sessionId" to (payload["sessionId"] as? String ?: ""),
          "rating" to (asInt(payload["rating"]) ?: 0)
        )
        if (mod != null) {
          mod.emitEvent("onWorkoutEffort", event)
        } else if (rawJson != null) {
          enqueueInboundJson(context, rawJson)
        }
      }
      "runEffort" -> {
        val event = mapOf(
          "clientId" to (payload["clientId"] as? String ?: ""),
          "rating" to (asInt(payload["rating"]) ?: 0)
        )
        if (mod != null) {
          mod.emitEvent("onRunEffort", event)
        } else if (rawJson != null) {
          enqueueInboundJson(context, rawJson)
        }
      }
      "workoutEdit" -> {
        val event = mutableMapOf<String, Any?>(
          "sessionId" to (payload["sessionId"] as? String ?: ""),
          "clientId" to (payload["clientId"] as? String ?: ""),
          "action" to (payload["action"] as? String ?: "")
        )
        for (key in listOf("exerciseEntryId", "anchorEntryId", "setId", "exerciseId", "setType")) {
          (payload[key] as? String)?.let { event[key] = it }
        }
        for (key in listOf("weightKg", "reps", "distanceKm", "at", "armedAt")) {
          asDouble(payload[key])?.let { event[key] = it }
        }
        if (mod != null) {
          mod.emitEvent("onWorkoutEdit", event)
        } else if (rawJson != null) {
          enqueueInboundJson(context, rawJson)
        }
      }
      "presetUpdateAnswer" -> {
        if (mod != null) {
          mod.emitEvent(
            "onPresetUpdateAnswer",
            mapOf(
              "sessionId" to (payload["sessionId"] as? String ?: ""),
              "update" to (payload["update"] as? Boolean ?: false),
              "waiting" to (payload["waiting"] as? Boolean ?: false)
            )
          )
        } else if (rawJson != null) {
          enqueueInboundJson(context, rawJson)
        }
      }
      "recordingControl" -> {
        val event = mutableMapOf<String, Any?>(
          "sessionId" to (payload["sessionId"] as? String ?: ""),
          "action" to (payload["action"] as? String ?: "")
        )
        asDouble(payload["at"])?.let { event["at"] = it }
        mod?.emitEvent("onRecordingControl", event)
      }
      "recordingHeartRate" -> {
        mod?.emitEvent(
          "onRecordingHeartRate",
          mapOf(
            "sessionId" to (payload["sessionId"] as? String ?: ""),
            "clientId" to (payload["clientId"] as? String ?: ""),
            "samples" to asMapList(payload["samples"])
          )
        )
      }
      "fastStart" -> {
        val payloadOwner = payload["ownerId"] as? String ?: ""
        val activeOwner = activeOwnerId(context)
        if (payloadOwner.isEmpty() || activeOwner.isEmpty() || payloadOwner != activeOwner) {
          if (rawJson != null) enqueueInboundJson(context, rawJson)
          return
        }
        val presetId = payload["presetId"] as? String ?: ""
        val clientId = payload["clientId"] as? String ?: ""
        val requestedStartedAt = asDouble(payload["startedAt"])?.toLong()?.takeIf { it > 0L }
        if (jsForeground && mod != null) {
          registerInFlightForegroundFastStart(payloadOwner, clientId)
          val event = mutableMapOf<String, Any?>(
            "presetId" to presetId,
            "clientId" to clientId,
            "ownerId" to payloadOwner
          )
          if (requestedStartedAt != null) {
            event["startedAt"] = requestedStartedAt.toDouble()
          }
          try {
            mod.emitEvent("onFastStartRequested", event)
          } catch (e: Throwable) {
            clearInFlightForegroundFastStart(clientId, payloadOwner)
            throw e
          }
        } else {
          val fastMutex = fastOwnerMutex(payloadOwner)
          scope.launch(start = CoroutineStart.UNDISPATCHED) {
            fastMutex.withLock {
              withContext(Dispatchers.IO) {
                performHeadlessFastStart(context, clientId, presetId, requestedStartedAt, payloadOwner, rawJson)
              }
            }
          }
        }
      }
      "fastEnd" -> {
        val payloadOwner = payload["ownerId"] as? String ?: ""
        val activeOwner = activeOwnerId(context)
        if (payloadOwner.isEmpty() || activeOwner.isEmpty() || payloadOwner != activeOwner) {
          if (rawJson != null) enqueueInboundJson(context, rawJson)
          return
        }
        val clientId = payload["clientId"] as? String ?: ""
        val fastId = (payload["fastId"] as? String)?.trim()?.takeIf { it.isNotEmpty() }
        val requestedStartedAt = asDouble(payload["startedAt"])?.toLong()?.takeIf { it > 0L }
        val endedAt = asDouble(payload["endedAt"])?.toLong()?.takeIf { it > 0L }
        if (jsForeground && mod != null) {
          val event = mutableMapOf<String, Any?>(
            "clientId" to clientId,
            "ownerId" to payloadOwner
          )
          if (fastId != null) {
            event["fastId"] = fastId
          }
          if (requestedStartedAt != null) {
            event["startedAt"] = requestedStartedAt.toDouble()
          }
          if (endedAt != null) {
            event["endedAt"] = endedAt.toDouble()
          }
          mod.emitEvent("onFastEndRequested", event)
        } else {
          val fastMutex = fastOwnerMutex(payloadOwner)
          scope.launch(start = CoroutineStart.UNDISPATCHED) {
            fastMutex.withLock {
              withContext(Dispatchers.IO) {
                performHeadlessFastEnd(
                  context,
                  clientId,
                  fastId,
                  requestedStartedAt,
                  endedAt,
                  payloadOwner,
                  rawJson
                )
              }
            }
          }
        }
      }
      "runLive" -> {
        val event = mutableMapOf<String, Any?>(
          "runId" to (payload["runId"] as? String ?: ""),
          "kind" to (payload["kind"] as? String ?: ""),
          "place" to (payload["place"] as? String ?: ""),
          "status" to (payload["status"] as? String ?: ""),
          "autoPaused" to (payload["autoPaused"] as? Boolean ?: false),
          "elapsed" to (asDouble(payload["elapsed"]) ?: 0.0),
          "distanceMeters" to (asDouble(payload["distanceMeters"]) ?: 0.0),
          "energyKcal" to (asDouble(payload["energyKcal"]) ?: 0.0),
          "lapCount" to (asInt(payload["lapCount"]) ?: 0),
          "sentAt" to (asDouble(payload["sentAt"]) ?: 0.0)
        )
        asDouble(payload["heartRate"])?.let { event["heartRate"] = it }
        (payload["stepLabel"] as? String)?.let { event["stepLabel"] = it }
        asDouble(payload["stepRemaining"])?.let { event["stepRemaining"] = it }
        (payload["nextLabel"] as? String)?.let { event["nextLabel"] = it }
        (payload["requestId"] as? String)?.let { event["requestId"] = it }
        (payload["autoPause"] as? Boolean)?.let { event["autoPause"] = it }
        (payload["voiceCues"] as? Boolean)?.let { event["voiceCues"] = it }
        (payload["paceAlert"] as? Boolean)?.let { event["paceAlert"] = it }
        (payload["heartRateAlert"] as? Boolean)?.let { event["heartRateAlert"] = it }
        activeModule?.emitEvent("onRunLive", event)
      }
      "runCue" -> {
        activeModule?.emitEvent(
          "onRunCue",
          mapOf(
            "id" to (payload["id"] as? String ?: ""),
            "text" to (payload["text"] as? String ?: ""),
            "interrupt" to (payload["interrupt"] as? Boolean ?: false),
            "language" to (payload["language"] as? String ?: "")
          )
        )
      }
      "runFinished" -> {
        val event = normalizedRunEvent(context, payload)
        rememberFinishedRun(context, event)
        activeModule?.emitEvent("onRunFinished", event)
      }
      "mediaControl" -> {
        val action = payload["action"] as? String ?: return
        val steps = asInt(payload["steps"]) ?: 1
        PhoneMediaBridge.handleCommand(context, action, steps)
      }
      "mediaStateRequest" -> {
        val active = payload["active"] as? Boolean ?: true
        val epoch = asDouble(payload["epoch"])?.toLong()?.takeIf { it > 0L }
        val visitId = asDouble(payload["visitId"])?.toLong()?.takeIf { it > 0L }
        PhoneMediaBridge.setWatchObserving(context, active, epoch, visitId)
      }
    }
  }

  // ---- Heart-Rate Queue ----

  fun setTelemetryOwner(context: Context, ownerId: String) {
    val appCtx = context.applicationContext
    val shouldRevoke = synchronized(credentialsStateLock) {
      val previousOwner = appCtx
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .getString(TELEMETRY_OWNER_KEY, "") ?: ""
      val revoke = ownerId.isEmpty() || (previousOwner.isNotEmpty() && previousOwner != ownerId)
      if (revoke) {
        invalidateCredentialsStateLocked(appCtx, newOwnerId = ownerId)
        synchronized(inboundLock) {
          purgeInboundQueueLocked(appCtx, retainOwnerId = ownerId)
        }
      } else {
        synchronized(hrLock) {
          appCtx
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(TELEMETRY_OWNER_KEY, ownerId)
            .apply()
        }
      }
      revoke
    }
    if (shouldRevoke) {
      scope.launch(start = CoroutineStart.UNDISPATCHED) {
        syncCredentialsTransport(appCtx, forcePublish = false)
      }
    } else {
      scope.launch(start = CoroutineStart.UNDISPATCHED) {
        syncCredentialsTransport(appCtx, forcePublish = true)
      }
    }
  }

  internal fun getTelemetryOwner(context: Context): String {
    synchronized(credentialsStateLock) {
      return context.applicationContext
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .getString(TELEMETRY_OWNER_KEY, "") ?: ""
    }
  }

  private fun hrQueueDir(context: Context): File {
    val dir = File(context.applicationContext.filesDir, "WatchHeartRateQueue")
    if (!dir.exists()) dir.mkdirs()
    return dir
  }

  private fun prepareHrQueue(context: Context) {
    if (!hrQueueLoaded) {
      val dir = hrQueueDir(context)
      val known = hrQueue.map { it.fileName }.toSet()
      val files = dir.listFiles()?.filter { it.name.endsWith(".json") && !known.contains(it.name) } ?: emptyList()
      for (file in files.sortedBy { it.name }) {
        try {
          val text = file.readText(Charsets.UTF_8)
          val event = jsonObjectToMap(JSONObject(text))
          val ownerId = event["ownerId"] as? String ?: ""
          if (ownerId.isEmpty()) {
            file.delete()
            droppedHrBatches += 1
            continue
          }
          hrQueue.add(QueuedHrBatch(event = event, fileName = file.name, stored = true))
        } catch (_: Throwable) {
          file.delete()
          droppedHrBatches += 1
        }
      }
      hrQueue.sortBy { it.fileName }
      hrQueueLoaded = true
      trimHrQueue(context)
    }
    val dir = hrQueueDir(context)
    for (batch in hrQueue) {
      if (!batch.stored) {
        batch.stored = writeHrBatch(dir, batch)
      }
    }
  }

  private fun writeHrBatch(dir: File, batch: QueuedHrBatch): Boolean {
    return try {
      val json = mapToJsonObject(batch.event).toString()
      File(dir, batch.fileName).writeText(json, Charsets.UTF_8)
      true
    } catch (_: Throwable) {
      false
    }
  }

  private fun trimHrQueue(context: Context) {
    val dir = hrQueueDir(context)
    var dropped = 0
    while (hrQueue.size > HEART_RATE_QUEUE_LIMIT) {
      val oldest = hrQueue.removeAt(0)
      File(dir, oldest.fileName).delete()
      dropped += 1
    }
    if (dropped > 0) {
      droppedHrBatches += dropped
    }
  }

  private fun buildHeartRateEvent(context: Context, payload: Map<String, Any?>): Map<String, Any?> {
    val event = mutableMapOf<String, Any?>(
      "clientId" to (payload["clientId"] as? String ?: ""),
      "sessionId" to (payload["sessionId"] as? String ?: ""),
      "exerciseEntryId" to (payload["exerciseEntryId"] as? String ?: ""),
      "samples" to asMapList(payload["samples"])
    )
    asDouble(payload["activeEnergyKcal"])?.let { event["activeEnergyKcal"] = it }
    asDouble(payload["durationMinutes"])?.let { event["durationMinutes"] = it }
    val ownerId = getTelemetryOwner(context)
    if (ownerId.isNotEmpty()) {
      event["ownerId"] = ownerId
    }
    val clientId = event["clientId"] as? String ?: ""
    val queueId = event["queueId"] as? String ?: ""
    if (clientId.isEmpty() && queueId.isEmpty()) {
      event["queueId"] = UUID.randomUUID().toString()
    }
    return event
  }

  private fun rememberHeartRateBatch(context: Context, event: Map<String, Any?>) {
    prepareHrQueue(context)
    val clientId = event["clientId"] as? String ?: ""
    if (clientId.isNotEmpty() && hrQueue.any { (it.event["clientId"] as? String) == clientId }) {
      return
    }
    val ownerId = event["ownerId"] as? String ?: ""
    if (ownerId.isEmpty()) {
      droppedHrBatches += 1
      return
    }
    val encoded = mapToJsonObject(event).toString().toByteArray(Charsets.UTF_8)
    if (encoded.size > HEART_RATE_BATCH_BYTE_LIMIT) {
      droppedHrBatches += 1
      return
    }
    val fileName = "${System.currentTimeMillis()}-${UUID.randomUUID()}.json"
    val dir = hrQueueDir(context)
    val batch = QueuedHrBatch(event = event, fileName = fileName, stored = false)
    batch.stored = writeHrBatch(dir, batch)
    hrQueue.add(batch)
    trimHrQueue(context)
  }

  fun pendingHeartRateBatches(context: Context): List<Map<String, Any?>> {
    synchronized(hrLock) {
      prepareHrQueue(context)
      return hrQueue.map { it.event }
    }
  }

  fun ackHeartRateBatches(context: Context, clientIds: List<String>) {
    val ids = clientIds.toSet()
    synchronized(hrLock) {
      prepareHrQueue(context)
      val dir = hrQueueDir(context)
      hrQueue.removeAll { batch ->
        val cId = batch.event["clientId"] as? String ?: ""
        val qId = batch.event["queueId"] as? String ?: ""
        val matches = (cId.isNotEmpty() && ids.contains(cId)) || (qId.isNotEmpty() && ids.contains(qId))
        if (!matches) false else {
          val file = File(dir, batch.fileName)
          !file.exists() || file.delete()
        }
      }
    }
  }

  fun takeDroppedHeartRateBatchCount(): Int {
    synchronized(hrLock) {
      val count = droppedHrBatches
      droppedHrBatches = 0
      return count
    }
  }

  // ---- Run Queue ----

  private fun runQueueFile(context: Context): File {
    val dir = File(context.applicationContext.filesDir, "WatchRunQueue")
    if (!dir.exists()) dir.mkdirs()
    return File(dir, "pending.json")
  }

  private fun loadRunQueue(context: Context) {
    if (runQueueLoaded) return
    runQueueLoaded = true
    val file = runQueueFile(context)
    if (!file.exists()) return
    try {
      val arr = JSONArray(file.readText(Charsets.UTF_8))
      val known = runQueue.mapNotNull { it["clientId"] as? String }.toSet()
      for (i in 0 until arr.length()) {
        val obj = arr.optJSONObject(i) ?: continue
        val map = jsonObjectToMap(obj)
        val id = map["clientId"] as? String ?: ""
        if (id.isNotEmpty() && !known.contains(id)) {
          runQueue.add(map)
        }
      }
    } catch (_: Throwable) {}
  }

  private fun writeRunQueue(context: Context, rows: List<Map<String, Any?>> = runQueue): Boolean {
    return try {
      val arr = JSONArray()
      for (row in rows) {
        arr.put(mapToJsonObject(row))
      }
      runQueueFile(context).writeText(arr.toString(), Charsets.UTF_8)
      true
    } catch (_: Throwable) {
      false
    }
  }

  private fun normalizedRunEvent(
    context: Context,
    payload: Map<String, Any?>
  ): Map<String, Any?> {
    val ownerId = (payload["ownerId"] as? String)?.takeIf { it.isNotEmpty() }
      ?: getTelemetryOwner(context)
    val event = mutableMapOf<String, Any?>(
      "clientId" to (payload["clientId"] as? String ?: ""),
      "ownerId" to ownerId,
      "kind" to (payload["kind"] as? String ?: ""),
      "place" to (payload["place"] as? String ?: ""),
      "startedAt" to (asDouble(payload["startedAt"]) ?: 0.0),
      "endedAt" to (asDouble(payload["endedAt"]) ?: 0.0),
      "activeSeconds" to (asDouble(payload["activeSeconds"]) ?: 0.0),
      "distanceMeters" to (asDouble(payload["distanceMeters"]) ?: 0.0),
      "activeEnergyKcal" to (asDouble(payload["activeEnergyKcal"]) ?: 0.0),
      "route" to (payload["route"] as? List<*> ?: emptyList<Any>()),
      "heartRate" to (payload["heartRate"] as? List<*> ?: emptyList<Any>()),
      "laps" to asDoubleList(payload["laps"]),
      "lapDistances" to asDoubleList(payload["lapDistances"]),
      "distanceSeries" to (payload["distanceSeries"] as? List<*> ?: emptyList<Any>()),
      "planId" to (payload["planId"] as? String ?: ""),
      "programId" to (payload["programId"] as? String ?: ""),
      "programIndex" to (asInt(payload["programIndex"]) ?: -1),
      "planCompleted" to (payload["planCompleted"] as? Boolean ?: false)
    )
    asDouble(payload["distanceScale"])?.let { event["distanceScale"] = it }
    asDouble(payload["estimatedDistanceMeters"])?.let { event["estimatedDistanceMeters"] = it }
    asInt(payload["steps"])?.let { event["steps"] = it }
    return event
  }

  private fun rememberFinishedRun(context: Context, event: Map<String, Any?>) {
    val clientId = event["clientId"] as? String ?: ""
    if (clientId.isEmpty()) return
    synchronized(runLock) {
      loadRunQueue(context)
      if (runQueue.any { (it["clientId"] as? String) == clientId }) return
      runQueue.add(event)
      while (runQueue.size > RUN_QUEUE_LIMIT) {
        runQueue.removeAt(0)
      }
      writeRunQueue(context)
    }
  }

  fun pendingWatchRuns(context: Context): List<Map<String, Any?>> {
    val ownerId = getTelemetryOwner(context)
    if (ownerId.isEmpty()) return emptyList()
    synchronized(runLock) {
      loadRunQueue(context)
      return runQueue.filter { (it["ownerId"] as? String) == ownerId }
    }
  }

  fun ackWatchRuns(context: Context, clientIds: List<String>) {
    val ids = clientIds.toSet()
    val purgedOwners = ids
      .filter { it.startsWith("owner:") }
      .map { it.removePrefix("owner:") }
      .filter { it.isNotEmpty() }
      .toSet()
    synchronized(runLock) {
      loadRunQueue(context)
      val next = runQueue.filter { row ->
        val id = row["clientId"] as? String ?: return@filter true
        val ownerId = row["ownerId"] as? String ?: ""
        !ids.contains(id) && (ownerId.isEmpty() || !purgedOwners.contains(ownerId))
      }.toMutableList()
      if (writeRunQueue(context, next)) {
        runQueue.clear()
        runQueue.addAll(next)
      }
    }
  }

  // ---- Conversion Helpers ----

  fun withoutNulls(map: Map<String, Any?>): Map<String, Any?> {
    val out = mutableMapOf<String, Any?>()
    for ((k, v) in map) {
      val cleaned = cleanValue(v)
      if (cleaned != null) {
        out[k] = cleaned
      }
    }
    return out
  }

  private fun cleanValue(value: Any?): Any? {
    return when (value) {
      null, JSONObject.NULL -> null
      is Map<*, *> -> {
        val m = mutableMapOf<String, Any?>()
        for ((k, v) in value) {
          val key = k as? String ?: continue
          val c = cleanValue(v)
          if (c != null) m[key] = c
        }
        m
      }
      is Iterable<*> -> value.mapNotNull { cleanValue(it) }
      is Array<*> -> value.mapNotNull { cleanValue(it) }
      else -> value
    }
  }

  fun mapToJsonObject(map: Map<String, Any?>): JSONObject {
    val obj = JSONObject()
    for ((k, v) in map) {
      val converted = toJsonValue(v)
      if (converted != null) {
        obj.put(k, converted)
      }
    }
    return obj
  }

  private fun toJsonValue(value: Any?): Any? {
    return when (value) {
      null, JSONObject.NULL -> null
      is Map<*, *> -> {
        val sub = JSONObject()
        for ((k, v) in value) {
          val key = k as? String ?: continue
          val c = toJsonValue(v)
          if (c != null) sub.put(key, c)
        }
        sub
      }
      is Iterable<*> -> {
        val arr = JSONArray()
        for (item in value) {
          val c = toJsonValue(item)
          if (c != null) arr.put(c)
        }
        arr
      }
      is Array<*> -> {
        val arr = JSONArray()
        for (item in value) {
          val c = toJsonValue(item)
          if (c != null) arr.put(c)
        }
        arr
      }
      else -> value
    }
  }

  fun jsonObjectToMap(obj: JSONObject): Map<String, Any?> {
    val map = mutableMapOf<String, Any?>()
    val keys = obj.keys()
    while (keys.hasNext()) {
      val key = keys.next()
      val raw = obj.opt(key)
      if (raw != null && raw !== JSONObject.NULL) {
        map[key] = fromJsonValue(raw)
      }
    }
    return map
  }

  private fun fromJsonValue(raw: Any?): Any? {
    return when (raw) {
      null, JSONObject.NULL -> null
      is JSONObject -> jsonObjectToMap(raw)
      is JSONArray -> {
        val list = mutableListOf<Any?>()
        for (i in 0 until raw.length()) {
          val v = raw.opt(i)
          if (v != null && v !== JSONObject.NULL) {
            list.add(fromJsonValue(v))
          }
        }
        list
      }
      else -> raw
    }
  }

  private fun asDouble(value: Any?): Double? {
    return when (value) {
      is Double -> value
      is Number -> value.toDouble()
      is String -> value.toDoubleOrNull()
      else -> null
    }
  }

  private fun asInt(value: Any?): Int? {
    return when (value) {
      is Int -> value
      is Number -> value.toInt()
      is String -> value.toIntOrNull()
      else -> null
    }
  }

  private fun asMapList(value: Any?): List<Map<String, Any?>> {
    val list = value as? Iterable<*> ?: return emptyList()
    return list.mapNotNull { item ->
      @Suppress("UNCHECKED_CAST")
      item as? Map<String, Any?>
    }
  }

  private fun asDoubleList(value: Any?): List<Double> {
    val list = value as? Iterable<*> ?: return emptyList()
    return list.mapNotNull { asDouble(it) }
  }
}

class WatchConnectivityModule : Module() {
  private var messageListener: MessageClient.OnMessageReceivedListener? = null
  private var dataListener: DataClient.OnDataChangedListener? = null
  private var capabilityListener: CapabilityClient.OnCapabilityChangedListener? = null

  fun emitEvent(name: String, body: Map<String, Any?>) {
    try {
      sendEvent(name, body)
    } catch (_: Throwable) {}
  }

  override fun definition() = ModuleDefinition {
    Name("WatchConnectivity")

    Events(
      "onReachabilityChange",
      "onCheckIn",
      "onContextRequest",
      "onWaterIntake",
      "onWaterDelete",
      "onWaterTapCancel",
      "onMedicationTaken",
      "onSetCompleted",
      "onSetUncompleted",
      "onRestChanged",
      "onSetTimerStarted",
      "onSetTimerStopped",
      "onHeartRateBatch",
      "onLiveHeartRate",
      "onWorkoutEffort",
      "onWorkoutStop",
      "onWorkoutDiscard",
      "onWorkoutStartRequested",
      "onWorkoutEdit",
      "onPresetUpdateAnswer",
      "onRecordingControl",
      "onRecordingHeartRate",
      "onFastStartRequested",
      "onFastEndRequested",
      "onRunLive",
      "onRunCue",
      "onRunFinished",
      "onRunEffort",
      "onWatchServerSynced"
    )

    OnCreate {
      WatchConnectivityHub.activeModule = this@WatchConnectivityModule
      val ctx = appContext.reactContext ?: return@OnCreate
      WatchConnectivityHub.initialize(ctx)
      registerWearListeners(ctx)
      WatchConnectivityHub.flushQueuedInboundEvents(ctx)
    }

    OnDestroy {
      val ctx = appContext.reactContext
      if (ctx != null) {
        unregisterWearListeners(ctx)
      }
      if (WatchConnectivityHub.activeModule === this@WatchConnectivityModule) {
        WatchConnectivityHub.activeModule = null
      }
    }

    Function("isSupported") {
      val ctx = appContext.reactContext
      if (ctx != null && !WatchConnectivityHub.isSupportedFlag.get()) {
        WatchConnectivityHub.initialize(ctx)
      }
      WatchConnectivityHub.isSupportedFlag.get()
    }

    Function("isReachable") {
      val ctx = appContext.reactContext
      if (ctx != null) {
        WatchConnectivityHub.refreshNodes(ctx)
      }
      WatchConnectivityHub.isReachableFlag.get()
    }

    Function("isPaired") {
      val ctx = appContext.reactContext
      if (ctx != null) {
        WatchConnectivityHub.refreshNodes(ctx)
      }
      WatchConnectivityHub.isPairedFlag.get()
    }

    AsyncFunction("updateContext") { context: ReadableMap ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      val payload = context.toHashMap()
      val ingressSeq = WatchConnectivityHub.nextContextIngressSeq.incrementAndGet()
      WatchConnectivityHub.scope.launch {
        WatchConnectivityHub.putApplicationContext(ctx, payload, ingressSeq)
      }
    }

    AsyncFunction("sendComplicationConfig") { config: ReadableMap, promise: Promise ->
      val ctx = appContext.reactContext
      if (ctx == null) {
        promise.reject("E_NO_CONTEXT", "React context unavailable", null)
        return@AsyncFunction
      }
      val payload = config.toHashMap()
      WatchConnectivityHub.scope.launch {
        try {
          val ok = WatchConnectivityHub.sendComplicationConfig(ctx, payload)
          if (ok) {
            promise.resolve(null)
          } else {
            promise.reject(
              "E_SEND_COMPLICATION_CONFIG",
              "Failed to send complication configuration to Wear OS",
              null
            )
          }
        } catch (e: Throwable) {
          promise.reject(
            "E_SEND_COMPLICATION_CONFIG",
            e.message ?: "Failed to send complication configuration to Wear OS",
            e
          )
        }
      }
    }

    AsyncFunction("sendAck") { clientId: String, ok: Boolean ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      val ownersToDrain = WatchConnectivityHub.clearFastStartAndCollectDrainOwners(ctx, clientId, ok)
      WatchConnectivityHub.scope.launch {
        WatchConnectivityHub.sendMessageOrTransfer(
          ctx,
          mapOf("type" to "ack", "clientId" to clientId, "ok" to ok),
          durable = false
        )
        for (ownerId in ownersToDrain) {
          WatchConnectivityHub.drainQueuedFastEndsForOwnerUnderMutex(ctx, ownerId)
        }
      }
    }

    AsyncFunction("sendFastAck") { clientId: String, ok: Boolean, fastKnown: Boolean, fast: ReadableMap? ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      val ownersToDrain = WatchConnectivityHub.clearFastStartAndCollectDrainOwners(ctx, clientId, ok)
      val fastJson = fast?.toHashMap()?.let {
        WatchConnectivityHub.mapToJsonObject(WatchConnectivityHub.withoutNulls(it))
      }
      WatchConnectivityHub.scope.launch {
        WatchConnectivityHub.sendMessageOrTransfer(
          ctx,
          WatchConnectivityHub.buildFastAckPayload(
            clientId = clientId,
            ok = ok,
            fastKnown = fastKnown,
            fast = fastJson
          ),
          durable = false
        )
        for (ownerId in ownersToDrain) {
          WatchConnectivityHub.drainQueuedFastEndsForOwnerUnderMutex(ctx, ownerId)
        }
      }
    }

    AsyncFunction("startWorkout") { plan: ReadableMap ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      WatchConnectivityHub.lastWorkoutArmedAtMs.set(System.currentTimeMillis())
      val payload = plan.toHashMap().toMutableMap()
      payload["type"] = "workoutStart"
      val activeOwner = WatchConnectivityHub.getTelemetryOwner(ctx)
      if (activeOwner.isNotEmpty() && (payload["ownerId"] as? String).isNullOrEmpty()) {
        payload["ownerId"] = activeOwner
      }
      WatchConnectivityHub.scope.launch {
        WatchConnectivityHub.sendMessageOrTransfer(ctx, payload, durable = true, slotKey = "latest")
      }
      WatchConnectivityHub.launchWatchApp(ctx, "workout")
    }

    AsyncFunction("sendExerciseImage") { image: ReadableMap ->
      val ctx = appContext.reactContext
        ?: throw IllegalStateException("React context unavailable")
      if (!WatchConnectivityHub.isSupportedFlag.get()) {
        throw IllegalStateException("Wearable connectivity unsupported")
      }
      val map = image.toHashMap()
      val key = (map["key"] as? String)?.trim()
      val index = (map["index"] as? Number)?.toInt()
      val uriStr = map["uri"] as? String
      if (key.isNullOrEmpty() || key.length > 80 || index == null || index !in 0..1 || uriStr.isNullOrEmpty()) {
        throw IllegalArgumentException("Invalid exercise image payload")
      }
      val parsed = Uri.parse(uriStr)
      val filePath = if (parsed.scheme == "file") parsed.path else null
      if (filePath.isNullOrEmpty()) {
        throw IllegalArgumentException("Exercise image uri must be a file:// URL")
      }
      val file = File(filePath).canonicalFile
      val cacheRoot = ctx.cacheDir.canonicalFile.path
      val filesRoot = ctx.filesDir.canonicalFile.path
      val insideAppStorage = file.path.startsWith("$cacheRoot${File.separator}") ||
        file.path.startsWith("$filesRoot${File.separator}")
      if (!insideAppStorage || !file.isFile) {
        throw IllegalArgumentException("Exercise image file unreadable")
      }
      val bytes = file.readBytes()
      if (bytes.isEmpty() || bytes.size > 256 * 1024) {
        throw IllegalArgumentException("Exercise image size out of bounds")
      }
      WatchConnectivityHub.scope.launch {
        WatchConnectivityHub.sendExerciseImage(ctx, key, index, bytes)
      }
    }

    AsyncFunction("updateWorkoutPlan") { plan: ReadableMap ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      val payload = plan.toHashMap().toMutableMap()
      payload["type"] = "workoutPlanUpdate"
      WatchConnectivityHub.scope.launch {
        WatchConnectivityHub.sendMessageOrTransfer(ctx, payload, durable = true, slotKey = "latest")
      }
    }

    AsyncFunction("updateRecordingState") { state: ReadableMap, durable: Boolean ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      val payload = state.toHashMap().toMutableMap()
      payload["type"] = "recordingState"
      WatchConnectivityHub.scope.launch {
        WatchConnectivityHub.sendMessageOrTransfer(
          ctx,
          payload,
          durable = durable,
          slotKey = "latest"
        )
      }
      if (durable && payload["status"] as? String == "recording") {
        WatchConnectivityHub.launchWatchApp(ctx, "workout")
      }
    }

    AsyncFunction("startRun") { request: ReadableMap ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      val payload = request.toHashMap().toMutableMap()
      payload["type"] = "runStart"
      WatchConnectivityHub.scope.launch {
        WatchConnectivityHub.sendMessageOrTransfer(ctx, payload, durable = true, slotKey = "latest")
      }
      WatchConnectivityHub.launchWatchApp(ctx, "workout")
    }

    AsyncFunction("sendRunControl") { control: ReadableMap ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      val payload = control.toHashMap().toMutableMap()
      payload["type"] = "runControl"
      WatchConnectivityHub.scope.launch {
        WatchConnectivityHub.sendMessageOrTransfer(ctx, payload, durable = true, slotKey = "latest")
      }
    }

    AsyncFunction("sendRunCueAck") { id: String ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      WatchConnectivityHub.scope.launch {
        WatchConnectivityHub.sendMessageOrTransfer(
          ctx,
          mapOf("type" to "runCueAck", "id" to id),
          durable = false
        )
      }
    }

    AsyncFunction("stopWorkout") { sessionId: String, stoppedAt: String, discarded: Boolean? ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      val payload = mapOf(
        "type" to "workoutStop",
        "sessionId" to sessionId,
        "stoppedAt" to stoppedAt,
        "discarded" to (discarded ?: false)
      )
      WatchConnectivityHub.scope.launch {
        WatchConnectivityHub.sendMessageOrTransfer(ctx, payload, durable = true, slotKey = "latest")
      }
    }

    AsyncFunction("updateIntervalTiming") { timing: ReadableMap ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      val payload = timing.toHashMap().toMutableMap()
      payload["type"] = "intervalTiming"
      WatchConnectivityHub.scope.launch {
        WatchConnectivityHub.sendMessageOrTransfer(ctx, payload, durable = true, slotKey = "latest")
      }
    }

    AsyncFunction("updateSetTargets") { update: ReadableMap ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      val payload = update.toHashMap().toMutableMap()
      payload["type"] = "setTargets"
      WatchConnectivityHub.scope.launch {
        WatchConnectivityHub.sendMessageOrTransfer(ctx, payload, durable = true, slotKey = "latest")
      }
    }

    AsyncFunction("setTelemetryOwner") { ownerId: String ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      WatchConnectivityHub.setTelemetryOwner(ctx, ownerId)
    }

    AsyncFunction("setServerCredentials") { baseUrl: String, headers: ReadableMap, expectedOwnerId: String? ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      val cleanHeaders = headers.toHashMap().entries.mapNotNull { (k, v) ->
        val str = v?.toString()
        if (!str.isNullOrBlank()) k to str else null
      }.toMap()
      WatchConnectivityHub.setServerCredentials(ctx, baseUrl, cleanHeaders, expectedOwnerId)
    }

    AsyncFunction("clearServerCredentials") {
      val ctx = appContext.reactContext
      if (ctx != null) {
        WatchConnectivityHub.clearServerCredentials(ctx)
      }
    }

    AsyncFunction("pendingHeartRateBatches") {
      val ctx = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any?>>()
      WatchConnectivityHub.pendingHeartRateBatches(ctx)
    }

    AsyncFunction("ackHeartRateBatches") { clientIds: List<String> ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      WatchConnectivityHub.ackHeartRateBatches(ctx, clientIds)
    }

    AsyncFunction("pendingWatchRuns") {
      val ctx = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any?>>()
      WatchConnectivityHub.pendingWatchRuns(ctx)
    }

    AsyncFunction("ackWatchRuns") { clientIds: List<String> ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      WatchConnectivityHub.ackWatchRuns(ctx, clientIds)
    }

    AsyncFunction("takeDroppedHeartRateBatchCount") {
      WatchConnectivityHub.takeDroppedHeartRateBatchCount()
    }

    AsyncFunction("isMediaAccessEnabled") {
      val ctx = appContext.reactContext ?: return@AsyncFunction false
      PhoneMediaBridge.isMediaAccessEnabled(ctx)
    }

    AsyncFunction("openMediaAccessSettings") {
      val ctx = appContext.reactContext
      if (ctx != null) {
        PhoneMediaBridge.openMediaAccessSettings(ctx)
      }
    }
  }

  private fun registerWearListeners(context: Context) {
    if (!WatchConnectivityHub.isSupportedFlag.get()) return
    val appCtx = context.applicationContext
    try {
      val capListener = CapabilityClient.OnCapabilityChangedListener {
        WatchConnectivityHub.refreshNodes(appCtx)
      }
      capabilityListener = capListener
      Wearable.getCapabilityClient(appCtx).addListener(
        capListener,
        Uri.parse("wear://"),
        CapabilityClient.FILTER_PREFIX
      )
    } catch (_: Throwable) {}
  }

  private fun unregisterWearListeners(context: Context) {
    val appCtx = context.applicationContext
    try {
      messageListener?.let { Wearable.getMessageClient(appCtx).removeListener(it) }
      dataListener?.let { Wearable.getDataClient(appCtx).removeListener(it) }
      capabilityListener?.let { Wearable.getCapabilityClient(appCtx).removeListener(it) }
    } catch (_: Throwable) {}
    messageListener = null
    dataListener = null
    capabilityListener = null
  }
}
