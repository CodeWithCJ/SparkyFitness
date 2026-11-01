package expo.modules.watchconnectivity

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import androidx.wear.remote.interactions.RemoteActivityHelper
import com.facebook.react.bridge.ReadableMap
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyStore
import java.time.Instant
import java.time.LocalDate
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
private const val CREDENTIALS_KEY_ALIAS = "sparky_watch_credentials_key"
private const val LAST_CONTEXT_JSON_KEY = "sparky.lastContextJson"
private const val HEART_RATE_QUEUE_LIMIT = 10_080
private const val HEART_RATE_BATCH_BYTE_LIMIT = 1_048_576
private const val RUN_QUEUE_LIMIT = 50
private const val INBOUND_QUEUE_LIMIT = 100

internal object WatchConnectivityHub {
  val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val remoteExecutor = Executors.newSingleThreadExecutor()

  val isSupportedFlag = AtomicBoolean(false)
  val isPairedFlag = AtomicBoolean(false)
  val isReachableFlag = AtomicBoolean(false)
  val lastWorkoutArmedAtMs = AtomicLong(0L)

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

  data class QueuedHrBatch(
    val event: Map<String, Any?>,
    val fileName: String,
    var stored: Boolean
  )

  fun initialize(context: Context) {
    val appCtx = context.applicationContext
    val gmsAvailable = try {
      GoogleApiAvailability.getInstance()
        .isGooglePlayServicesAvailable(appCtx) == ConnectionResult.SUCCESS
    } catch (_: Throwable) {
      false
    }
    isSupportedFlag.set(gmsAvailable)
    val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    if (prefs.getBoolean(PAIRED_CACHE_KEY, false)) {
      isPairedFlag.set(true)
    }
    if (!gmsAvailable) return

    refreshNodes(appCtx)
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

  fun setServerCredentials(context: Context, baseUrl: String, headers: Map<String, Any?>) {
    val appCtx = context.applicationContext
    if (baseUrl.isBlank() || headers.isEmpty()) {
      clearServerCredentials(appCtx)
      return
    }
    val headersObj = JSONObject()
    for ((k, v) in headers) {
      if (v is String) headersObj.put(k, v)
    }
    try {
      val encrypted = encryptHeaders(headersObj.toString())
      appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .remove(SERVER_HEADERS_KEY)
        .putString(SERVER_URL_KEY, baseUrl.trimEnd('/'))
        .putString(ENCRYPTED_HEADERS_KEY, encrypted)
        .apply()
    } catch (e: Throwable) {
      Log.w(TAG, "Failed to encrypt server credentials: ${e.message}")
      appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .remove(SERVER_URL_KEY)
        .remove(SERVER_HEADERS_KEY)
        .remove(ENCRYPTED_HEADERS_KEY)
        .apply()
    }
  }

  fun clearServerCredentials(context: Context) {
    val appCtx = context.applicationContext
    appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .remove(SERVER_URL_KEY)
      .remove(SERVER_HEADERS_KEY)
      .remove(ENCRYPTED_HEADERS_KEY)
      .remove(LAST_CONTEXT_JSON_KEY)
      .apply()
    synchronized(inboundLock) {
      inboundQueueFile(appCtx).delete()
    }
    try {
      KeyStore.getInstance("AndroidKeyStore").apply {
        load(null)
        if (containsAlias(CREDENTIALS_KEY_ALIAS)) deleteEntry(CREDENTIALS_KEY_ALIAS)
      }
    } catch (e: Throwable) {
      Log.w(TAG, "Failed to delete credentials key: ${e.message}")
    }
    scope.launch {
      try {
        val bytes = JSONObject().put("type", "accountCleared").toString().toByteArray(Charsets.UTF_8)
        sendLiveBytes(appCtx, "/sparky/message", bytes)
        Wearable.getDataClient(appCtx).deleteDataItems(
          Uri.parse("wear://*/sparky/context"),
          DataClient.FILTER_LITERAL
        ).await()
      } catch (_: Throwable) {}
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
      }
    }
  }

  suspend fun putApplicationContext(context: Context, payload: Map<String, Any?>) {
    val appCtx = context.applicationContext
    val cleaned = withoutNulls(payload).toMutableMap()
    cleaned["type"] = "context"
    val contextOwner = (cleaned["workoutServerId"] as? String)?.trim() ?: ""
    val json = mapToJsonObject(cleaned).toString()
    val editor = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
    if (contextOwner.isNotEmpty()) {
      editor.putString(LAST_CONTEXT_JSON_KEY, json)
    } else {
      editor.remove(LAST_CONTEXT_JSON_KEY)
    }
    editor.apply()
    publishRawContextJson(appCtx, json)
  }

  private suspend fun publishRawContextJson(appCtx: Context, json: String) {
    val bytes = json.toByteArray(Charsets.UTF_8)
    try {
      val req = PutDataMapRequest.create("/sparky/context").apply {
        dataMap.putString("json", json)
        dataMap.putLong("pushedAt", System.currentTimeMillis())
      }.asPutDataRequest().setUrgent()
      Wearable.getDataClient(appCtx).putDataItem(req).await()
    } catch (e: Throwable) {
      Log.w(TAG, "putApplicationContext DataClient failed: ${e.message}")
    }

    sendLiveBytes(appCtx, "/sparky/context", bytes)
  }

  suspend fun sendMessageOrTransfer(
    context: Context,
    payload: Map<String, Any?>,
    durable: Boolean,
    slotKey: String? = null
  ) {
    val appCtx = context.applicationContext
    val cleaned = withoutNulls(payload)
    val type = cleaned["type"] as? String ?: "message"
    val json = mapToJsonObject(cleaned).toString()
    val bytes = json.toByteArray(Charsets.UTF_8)

    sendLiveBytes(appCtx, "/sparky/message", bytes)

    if (durable) {
      val key = slotKey ?: (cleaned["sessionId"] as? String) ?: UUID.randomUUID().toString()
      val path = "/sparky/transfer/phone/$type/$key"
      try {
        val req = PutDataMapRequest.create(path).apply {
          dataMap.putString("json", json)
          dataMap.putLong("sentAt", System.currentTimeMillis())
        }.asPutDataRequest().setUrgent()
        Wearable.getDataClient(appCtx).putDataItem(req).await()
      } catch (e: Throwable) {
        Log.w(TAG, "durable transfer ($path) failed: ${e.message}")
      }
    }
  }

  private suspend fun sendLiveBytes(context: Context, path: String, bytes: ByteArray) {
    try {
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
      for (node in nodes) {
        try {
          msgClient.sendMessage(node.id, path, bytes).await()
        } catch (e: Throwable) {
          Log.w(TAG, "sendMessage to ${node.id} failed: ${e.message}")
        }
      }
    } catch (e: Throwable) {
      Log.w(TAG, "sendLiveBytes failed: ${e.message}")
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
      arr.put(rawJson)
      val trimmed = JSONArray()
      val start = (arr.length() - INBOUND_QUEUE_LIMIT).coerceAtLeast(0)
      for (i in start until arr.length()) {
        trimmed.put(arr.getString(i))
      }
      try {
        file.writeText(trimmed.toString(), Charsets.UTF_8)
      } catch (_: Throwable) {}
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

  private fun performHeadlessHttp(
    context: Context,
    endpoint: String,
    method: String,
    bodyJson: JSONObject?
  ): Pair<Int, String?> {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val baseUrl = prefs.getString(SERVER_URL_KEY, null)?.takeIf { it.isNotEmpty() } ?: return -1 to null
    val headersRaw = prefs.getString(ENCRYPTED_HEADERS_KEY, null)?.let { blob ->
      try {
        decryptHeaders(blob)
      } catch (e: Throwable) {
        Log.w(TAG, "Failed to decrypt server credentials: ${e.message}")
        null
      }
    }
    val conn = (URL("$baseUrl$endpoint").openConnection() as HttpURLConnection).apply {
      requestMethod = method
      connectTimeout = 10_000
      readTimeout = 10_000
      if (headersRaw != null) {
        try {
          val hObj = JSONObject(headersRaw)
          val keys = hObj.keys()
          while (keys.hasNext()) {
            val k = keys.next()
            setRequestProperty(k, hObj.optString(k))
          }
        } catch (_: Throwable) {}
      }
      if (bodyJson != null) {
        doOutput = true
        setRequestProperty("Content-Type", "application/json")
      }
    }
    return try {
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
      conn.disconnect()
    }
  }

  private suspend fun patchCachedContextAfterHeadlessWrite(
    context: Context,
    clientId: String,
    newWaterConsumedMl: Double? = null
  ) {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val raw = prefs.getString(LAST_CONTEXT_JSON_KEY, null) ?: return
    try {
      val obj = JSONObject(raw)
      obj.put("pushedAt", System.currentTimeMillis())
      if (newWaterConsumedMl != null) {
        obj.put("waterConsumedMl", newWaterConsumedMl)
      }
      if (clientId.isNotEmpty()) {
        val acked = obj.optJSONArray("ackedClientIds") ?: JSONArray()
        acked.put(clientId)
        obj.put("ackedClientIds", acked)
      }
      val updated = obj.toString()
      prefs.edit().putString(LAST_CONTEXT_JSON_KEY, updated).apply()
      publishRawContextJson(context, updated)
    } catch (_: Throwable) {}
  }

  private suspend fun performHeadlessWorkoutStart(
    context: Context,
    presetIdStr: String,
    rawJson: String?
  ) {
    val presetId = presetIdStr.toIntOrNull() ?: return
    val (pStatus, pBody) = performHeadlessHttp(
      context,
      "/api/workout-presets/$presetId",
      "GET",
      null
    )
    if (pStatus !in 200..299 || pBody.isNullOrBlank()) {
      if (rawJson != null) enqueueInboundJson(context, rawJson)
      return
    }
    try {
      val presetObj = JSONObject(pBody)
      val presetName = presetObj.optString("name", "Workout")
      val workoutFormat = presetObj.optString("workout_format", "standard").ifBlank { "standard" }
      val timeCapSec = if (presetObj.has("time_cap_seconds") && !presetObj.isNull("time_cap_seconds")) {
        presetObj.optInt("time_cap_seconds")
      } else null
      val presetExArr = presetObj.optJSONArray("exercises") ?: JSONArray()
      if (presetExArr.length() == 0) return

      val reqExArr = JSONArray()
      val plannedTargetsByEx = mutableListOf<List<JSONObject>>()

      for (i in 0 until presetExArr.length()) {
        val pEx = presetExArr.optJSONObject(i) ?: continue
        val exId = pEx.optString("exercise_id", "")
        if (exId.isEmpty()) continue
        val modality = pEx.optString("modality", "")
        val category = pEx.optString("category", "")
        val isCardio = modality == "duration_distance" || category.equals("Cardio", ignoreCase = true)

        val pSets = pEx.optJSONArray("sets") ?: JSONArray()
        val reqSets = JSONArray()
        val plannedList = mutableListOf<JSONObject>()

        if (pSets.length() == 0) {
          val sObj = JSONObject().apply {
            put("set_number", 1)
            put("set_type", "normal")
            put("rest_time", if (isCardio) 0 else 90)
          }
          reqSets.put(sObj)
          plannedList.add(JSONObject())
        } else {
          for (sIdx in 0 until pSets.length()) {
            val ps = pSets.optJSONObject(sIdx) ?: continue
            val restSec = if (isCardio) 0 else if (ps.has("rest_time") && !ps.isNull("rest_time")) ps.optInt("rest_time", 90) else 90
            val sObj = JSONObject().apply {
              put("set_number", sIdx + 1)
              put("set_type", ps.optString("set_type", "normal").ifBlank { "normal" })
              put("rest_time", restSec)
              if (ps.has("notes") && !ps.isNull("notes")) put("notes", ps.optString("notes"))
            }
            reqSets.put(sObj)
            plannedList.add(ps)
          }
        }
        plannedTargetsByEx.add(plannedList)
        val reqEx = JSONObject().apply {
          put("exercise_id", exId)
          put("sort_order", i)
          put("duration_minutes", 0)
          if (pEx.has("superset_group") && !pEx.isNull("superset_group")) {
            put("superset_group", pEx.opt("superset_group"))
          }
          put("sets", reqSets)
        }
        reqExArr.put(reqEx)
      }

      val createReq = JSONObject().apply {
        put("name", presetName)
        put("entry_date", LocalDate.now().toString())
        put("source", "sparky")
        put("workout_preset_id", presetId)
        put("exercises", reqExArr)
      }

      val (cStatus, cBody) = performHeadlessHttp(
        context,
        "/api/exercise-preset-entries/",
        "POST",
        createReq
      )
      if (cStatus !in 200..299 || cBody.isNullOrBlank()) {
        if (rawJson != null) enqueueInboundJson(context, rawJson)
        return
      }

      val sessionObj = JSONObject(cBody)
      val sessionId = sessionObj.optString("id", "")
      if (sessionId.isEmpty()) return
      val sessionExercises = sessionObj.optJSONArray("exercises") ?: JSONArray()

      val watchExercises = mutableListOf<Map<String, Any?>>()
      val setOrder = mutableListOf<String>()

      for (i in 0 until sessionExercises.length()) {
        val sEx = sessionExercises.optJSONObject(i) ?: continue
        val entryId = sEx.optString("id", "")
        val snap = sEx.optJSONObject("exercise_snapshot")
        val exName = snap?.optString("name")?.takeIf { it.isNotBlank() } ?: "Exercise"
        val modality = snap?.optString("modality") ?: ""
        val isBodyweight = modality == "bodyweight_reps"
        val isTimed = modality == "duration" || modality == "duration_distance" || modality == "weight_duration"
        val isCarry = modality == "weight_distance"
        val isWeightedTimed = modality == "weight_duration"

        val sSets = sEx.optJSONArray("sets") ?: JSONArray()
        val plannedSets = plannedTargetsByEx.getOrNull(i) ?: emptyList()
        val watchSets = mutableListOf<Map<String, Any?>>()

        for (sIdx in 0 until sSets.length()) {
          val ss = sSets.optJSONObject(sIdx) ?: continue
          val setId = ss.opt("id")?.toString() ?: continue
          setOrder.add(setId)
          val planned = plannedSets.getOrNull(sIdx)
          val targetReps = if (planned != null && planned.has("reps") && !planned.isNull("reps")) planned.optInt("reps") else null
          val targetWeightKg = if (planned != null && planned.has("weight") && !planned.isNull("weight")) planned.optDouble("weight") else null
          val targetDurationSec = if (planned != null && planned.has("duration") && !planned.isNull("duration")) planned.optInt("duration") else null
          val targetDistanceKm = if (planned != null && planned.has("distance") && !planned.isNull("distance")) planned.optDouble("distance") else null
          val restSeconds = if (ss.has("rest_time") && !ss.isNull("rest_time")) ss.optInt("rest_time", 0) else 0
          val setType = ss.optString("set_type", "normal")

          val setMap = mutableMapOf<String, Any?>(
            "setId" to setId,
            "targetReps" to targetReps,
            "targetWeightKg" to targetWeightKg,
            "targetDurationSec" to targetDurationSec,
            "targetDistanceKm" to targetDistanceKm,
            "restSeconds" to restSeconds,
            "setType" to setType
          )
          if (isTimed) setMap["timed"] = true
          if (isCarry) setMap["carry"] = true
          if (isWeightedTimed) setMap["weighted"] = true
          watchSets.add(setMap)
        }

        watchExercises.add(
          mapOf(
            "exerciseEntryId" to entryId,
            "name" to exName,
            "bodyweight" to isBodyweight,
            "sets" to watchSets
          )
        )
      }

      val nowMs = System.currentTimeMillis()
      val nowIso = Instant.ofEpochMilli(nowMs).toString()
      val startPayload = mutableMapOf<String, Any?>(
        "type" to "workoutStart",
        "sessionId" to sessionId,
        "workoutName" to sessionObj.optString("name", presetName),
        "exercises" to watchExercises,
        "setOrder" to setOrder,
        "workoutFormat" to workoutFormat,
        "startedAt" to nowIso,
        "armedAt" to nowIso,
        "fromPreset" to true
      )
      if (timeCapSec != null) {
        startPayload["timeCapSeconds"] = timeCapSec
      }
      lastWorkoutArmedAtMs.set(nowMs)
      sendMessageOrTransfer(context, startPayload, durable = true, slotKey = "latest")
      launchWatchApp(context, "workout")
    } catch (e: Throwable) {
      Log.w(TAG, "performHeadlessWorkoutStart failed: ${e.message}")
      if (rawJson != null) enqueueInboundJson(context, rawJson)
    }
  }

  private fun activeOwnerId(context: Context): String {
    return getTelemetryOwner(context)
  }

  private fun routePayload(context: Context, payload: Map<String, Any?>, rawJson: String? = null) {
    val mod = activeModule
    when (payload["type"] as? String) {
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
        if (mod != null) {
          val event = mutableMapOf<String, Any?>(
            "clientId" to clientId,
            "entryDate" to entryDate,
            "weightKg" to weightKg,
            "ownerId" to payloadOwner
          )
          bodyFat?.let { event["bodyFatPercentage"] = it }
          mod.emitEvent("onCheckIn", event)
        } else {
          scope.launch {
            val body = JSONObject().apply {
              put("entry_date", entryDate)
              put("weight", weightKg)
              if (bodyFat != null) put("body_fat_percentage", bodyFat)
            }
            val (status, _) = performHeadlessHttp(context, "/api/measurements/check-in", "POST", body)
            if (status in 200..299) {
              sendMessageOrTransfer(context, mapOf("type" to "ack", "clientId" to clientId, "ok" to true), durable = false)
              patchCachedContextAfterHeadlessWrite(context, clientId)
            } else if (rawJson != null) {
              enqueueInboundJson(context, rawJson)
            }
          }
        }
      }
      "requestContext" -> {
        if (mod != null) {
          mod.emitEvent("onContextRequest", emptyMap<String, Any?>())
        } else {
          val cached = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(LAST_CONTEXT_JSON_KEY, null)
          if (cached != null) {
            scope.launch { publishRawContextJson(context, cached) }
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
        val entryDate = payload["entryDate"] as? String ?: ""
        val containerId = asInt(payload["containerId"]) ?: 0
        if (mod != null) {
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
          scope.launch {
            val body = JSONObject().apply {
              put("entry_date", entryDate)
              put("change_drinks", 1)
              put("container_id", containerId)
            }
            val (status, respText) = performHeadlessHttp(context, "/api/measurements/water-intake", "POST", body)
            if (status in 200..299) {
              val newWaterMl = try {
                respText?.let { JSONObject(it).optDouble("water_ml") }?.takeIf { !it.isNaN() }
              } catch (_: Throwable) {
                null
              }
              sendMessageOrTransfer(context, mapOf("type" to "ack", "clientId" to clientId, "ok" to true), durable = false)
              patchCachedContextAfterHeadlessWrite(context, clientId, newWaterConsumedMl = newWaterMl)
            } else if (rawJson != null) {
              enqueueInboundJson(context, rawJson)
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
        if (mod != null) {
          mod.emitEvent(
            "onWaterDelete",
            mapOf(
              "clientId" to clientId,
              "entryId" to entryId,
              "ownerId" to payloadOwner
            )
          )
        } else {
          scope.launch {
            val (status, _) = performHeadlessHttp(
              context,
              "/api/v2/measurements/water-intake/log/${Uri.encode(entryId)}",
              "DELETE",
              null
            )
            if (status in 200..299) {
              sendMessageOrTransfer(context, mapOf("type" to "ack", "clientId" to clientId, "ok" to true), durable = false)
              patchCachedContextAfterHeadlessWrite(context, clientId)
            } else if (rawJson != null) {
              enqueueInboundJson(context, rawJson)
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
        if (mod != null) {
          mod.emitEvent(
            "onMedicationTaken",
            mapOf(
              "clientId" to (payload["clientId"] as? String ?: ""),
              "entryDate" to (payload["entryDate"] as? String ?: ""),
              "medicationId" to (payload["medicationId"] as? String ?: ""),
              "scheduleId" to (payload["scheduleId"] as? String ?: ""),
              "taken" to (payload["taken"] as? Boolean ?: true),
              "skipped" to (payload["skipped"] as? Boolean ?: false),
              "ownerId" to payloadOwner
            )
          )
        } else if (rawJson != null) {
          enqueueInboundJson(context, rawJson)
        }
      }
      "setCompleted" -> {
        val event = mutableMapOf<String, Any?>(
          "clientId" to (payload["clientId"] as? String ?: ""),
          "sessionId" to (payload["sessionId"] as? String ?: ""),
          "setId" to (payload["setId"] as? String ?: "")
        )
        asDouble(payload["weightKg"])?.let { event["weightKg"] = it }
        asDouble(payload["reps"])?.let { event["reps"] = it }
        asDouble(payload["rpe"])?.let { event["rpe"] = it }
        asInt(payload["duration"])?.let { event["duration"] = it }
        asDouble(payload["distanceKm"])?.let { event["distanceKm"] = it }
        (payload["completedAt"] as? String)?.let { event["completedAt"] = it }
        if (mod != null) {
          mod.emitEvent("onSetCompleted", event)
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
        val event = synchronized(hrLock) {
          val built = buildHeartRateEvent(context, payload)
          rememberHeartRateBatch(context, built)
          built
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
          mod.emitEvent(
            "onWorkoutStop",
            mapOf("sessionId" to (payload["sessionId"] as? String ?: ""))
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
        val activeOwner = activeOwnerId(context)
        if (serverId.isEmpty() || activeOwner.isEmpty() || serverId != activeOwner) {
          if (rawJson != null) enqueueInboundJson(context, rawJson)
          return
        }
        if (mod != null) {
          mod.emitEvent(
            "onWorkoutStartRequested",
            mapOf(
              "presetId" to presetId,
              "serverId" to serverId
            )
          )
        } else {
          scope.launch {
            performHeadlessWorkoutStart(context, presetId, rawJson)
          }
        }
      }
      "workoutEdit" -> {
        val event = mutableMapOf<String, Any?>(
          "sessionId" to (payload["sessionId"] as? String ?: ""),
          "clientId" to (payload["clientId"] as? String ?: ""),
          "action" to (payload["action"] as? String ?: "")
        )
        for (key in listOf("exerciseEntryId", "setId", "exerciseId", "setType")) {
          (payload[key] as? String)?.let { event[key] = it }
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
              "update" to (payload["update"] as? Boolean ?: false)
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
        if (mod != null) {
          mod.emitEvent(
            "onFastStartRequested",
            mapOf(
              "presetId" to (payload["presetId"] as? String ?: ""),
              "clientId" to (payload["clientId"] as? String ?: ""),
              "ownerId" to payloadOwner
            )
          )
        } else if (rawJson != null) {
          enqueueInboundJson(context, rawJson)
        }
      }
      "fastEnd" -> {
        val payloadOwner = payload["ownerId"] as? String ?: ""
        val activeOwner = activeOwnerId(context)
        if (payloadOwner.isEmpty() || activeOwner.isEmpty() || payloadOwner != activeOwner) {
          if (rawJson != null) enqueueInboundJson(context, rawJson)
          return
        }
        if (mod != null) {
          mod.emitEvent(
            "onFastEndRequested",
            mapOf(
              "clientId" to (payload["clientId"] as? String ?: ""),
              "ownerId" to payloadOwner
            )
          )
        } else if (rawJson != null) {
          enqueueInboundJson(context, rawJson)
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
    }
  }

  // ---- Heart-Rate Queue ----

  fun setTelemetryOwner(context: Context, ownerId: String) {
    val appCtx = context.applicationContext
    val previousOwner = getTelemetryOwner(appCtx)
    synchronized(hrLock) {
      appCtx
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putString(TELEMETRY_OWNER_KEY, ownerId)
        .apply()
    }
    if (ownerId.isEmpty() || (previousOwner.isNotEmpty() && previousOwner != ownerId)) {
      clearServerCredentials(appCtx)
    }
  }

  private fun getTelemetryOwner(context: Context): String {
    return context.applicationContext
      .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .getString(TELEMETRY_OWNER_KEY, "") ?: ""
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
      "onMedicationTaken",
      "onSetCompleted",
      "onSetUncompleted",
      "onRestChanged",
      "onSetTimerStarted",
      "onSetTimerStopped",
      "onHeartRateBatch",
      "onLiveHeartRate",
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
      "onRunFinished"
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
      WatchConnectivityHub.scope.launch {
        WatchConnectivityHub.putApplicationContext(ctx, payload)
      }
    }

    AsyncFunction("sendAck") { clientId: String, ok: Boolean ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      WatchConnectivityHub.scope.launch {
        WatchConnectivityHub.sendMessageOrTransfer(
          ctx,
          mapOf("type" to "ack", "clientId" to clientId, "ok" to ok),
          durable = false
        )
      }
    }

    AsyncFunction("startWorkout") { plan: ReadableMap ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      WatchConnectivityHub.lastWorkoutArmedAtMs.set(System.currentTimeMillis())
      val payload = plan.toHashMap().toMutableMap()
      payload["type"] = "workoutStart"
      WatchConnectivityHub.scope.launch {
        WatchConnectivityHub.sendMessageOrTransfer(ctx, payload, durable = true, slotKey = "latest")
      }
      WatchConnectivityHub.launchWatchApp(ctx, "workout")
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

    AsyncFunction("setServerCredentials") { baseUrl: String, headers: ReadableMap ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      val cleanHeaders = headers.toHashMap().entries.mapNotNull { (k, v) ->
        val str = v?.toString()
        if (!str.isNullOrBlank()) k to str else null
      }.toMap()
      WatchConnectivityHub.setServerCredentials(ctx, baseUrl, cleanHeaders)
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
