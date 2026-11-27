package com.sparkyapps.sparkyfitness.wear

import android.content.Context
import android.net.Uri
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.SparkyApps.SparkyFitnessMobile.R
import kotlin.math.roundToInt
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import org.json.JSONArray
import org.json.JSONObject
import java.math.BigDecimal
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.net.ssl.HttpsURLConnection

data class WearServerCredentials(
  val ownerId: String,
  val baseUrl: String,
  val headers: Map<String, String>,
  val writeId: Long = 0L
)

/**
 * Stores the paired phone's active server URL and auth/proxy headers encrypted
 * with a non-exportable Android Keystore AES-GCM key. Wiped immediately on
 * sign-out or server switch.
 */
object WearServerCredentialsStore {
  private const val PREFS_NAME = "sparky_wear_credentials"
  private const val KEY_ENCRYPTED_BLOB = "encrypted_credentials_v1"
  private const val KEY_OWNER_ID = "credentials_owner_id"
  private const val KEY_LAST_GENERATION = "last_credentials_generation"
  private const val KEY_REVOKED_GENERATION = "revoked_credentials_generation"
  private const val KEY_WRITE_ID = "credentials_write_id"
  private const val KEY_LAST_APPLIED_FINGERPRINT = "last_credentials_fingerprint"
  private const val KEY_LAST_TRANSPORT_REVISION = "last_credentials_transport_revision"
  private const val KEY_MTLS_DISABLED = "mtls_disabled"
  private const val KEY_ALIAS = "sparky_wear_server_credentials_key"
  private const val ANDROID_KEYSTORE = "AndroidKeyStore"
  private const val TRANSFORMATION = "AES/GCM/NoPadding"
  private val lock = Any()
  @Volatile private var inMemoryRevokedGeneration: Long = 0L
  @Volatile private var pendingUnpersistedRevokedGeneration: Long = 0L
  @Volatile private var pendingUnpersistedMtlsGeneration: Long = 0L
  @Volatile private var pendingUnpersistedMtlsTransportRevision: Long = 0L
  @Volatile private var inMemoryClearedWriteId: Long = 0L
  @Volatile private var highestAttemptedWriteId: Long = 0L
  private val failedUncommittedWriteIds = mutableSetOf<Long>()

  internal data class CredentialStoreRecord(
    val ownerId: String?,
    val encryptedBlob: String?,
    val fingerprint: String?,
    val lastGeneration: Long,
    val writeId: Long,
    val lastTransportRevision: Long = 0L,
    val mtlsDisabled: Boolean = false
  )

  data class RevocationResult(
    val accepted: Boolean,
    val persisted: Boolean,
    val targetWriteId: Long = 0L,
    val revokedGeneration: Long = 0L
  )

  internal fun shouldDisableCredentialsForAccountClear(
    expectedWriteId: Long?,
    currentWriteId: Long
  ): Boolean = expectedWriteId == null || currentWriteId == expectedWriteId

  internal fun resolveCredentialStateAfterCommit(
    previousCommitted: CredentialStoreRecord,
    candidate: CredentialStoreRecord,
    commitSucceeded: Boolean
  ): Pair<CredentialStoreRecord, Boolean> =
    if (commitSucceeded) {
      candidate to true
    } else {
      previousCommitted to false
    }

  internal fun isDirectRequestAdmitted(
    isAccountActive: Boolean,
    isSessionCurrent: Boolean
  ): Boolean = isAccountActive && isSessionCurrent

  internal fun isPersistedContextRevoked(
    revokedGen: Long,
    restoredContextGen: Long
  ): Boolean = revokedGen > 0L && restoredContextGen <= revokedGen

  internal fun resolvePendingUnpersistedRevokedGeneration(
    currentPending: Long,
    attemptedRevokedGen: Long,
    commitSucceeded: Boolean
  ): Long = when {
    commitSucceeded -> if (attemptedRevokedGen >= currentPending) 0L else currentPending
    attemptedRevokedGen > 0L -> maxOf(currentPending, attemptedRevokedGen)
    else -> currentPending
  }

  internal fun resolveMtlsNoticeSaveResult(persisted: Boolean): SaveResult =
    if (persisted) SaveResult.Rejected else SaveResult.PersistFailed

  internal fun resolvePendingUnpersistedMtlsBarrier(
    currentPendingGen: Long,
    currentPendingRev: Long,
    attemptedGen: Long,
    attemptedRev: Long,
    commitSucceeded: Boolean
  ): Pair<Long, Long> {
    val isAttemptAtLeastPending = attemptedGen > currentPendingGen ||
      (attemptedGen == currentPendingGen && attemptedRev >= currentPendingRev)
    return if (commitSucceeded) {
      if (isAttemptAtLeastPending) 0L to 0L else currentPendingGen to currentPendingRev
    } else if (attemptedGen > 0L || attemptedRev > 0L) {
      if (isAttemptAtLeastPending) attemptedGen to attemptedRev else currentPendingGen to currentPendingRev
    } else {
      currentPendingGen to currentPendingRev
    }
  }

  internal fun effectiveMtlsWatermarkForNonMtlsSave(
    persistedGen: Long,
    persistedTransportRev: Long,
    pendingMtlsGen: Long,
    pendingMtlsRev: Long
  ): Pair<Long, Long> = when {
    pendingMtlsGen > persistedGen -> pendingMtlsGen to pendingMtlsRev
    pendingMtlsGen == persistedGen && pendingMtlsRev > persistedTransportRev -> persistedGen to pendingMtlsRev
    else -> persistedGen to persistedTransportRev
  }

  internal fun isBlockedByPendingMtlsBarrier(
    savedGen: Long,
    savedTransportRev: Long,
    pendingMtlsGen: Long,
    pendingMtlsRev: Long
  ): Boolean {
    if (pendingMtlsGen <= 0L && pendingMtlsRev <= 0L) return false
    return savedGen < pendingMtlsGen || (savedGen == pendingMtlsGen && savedTransportRev <= pendingMtlsRev)
  }

  internal fun effectiveRevokedGeneration(
    persistedRevokedGen: Long,
    inMemoryMinRevokedGen: Long
  ): Long = maxOf(persistedRevokedGen, inMemoryMinRevokedGen)

  internal fun isCredentialSessionDisabledInMemory(
    writeId: Long,
    lastSavedGen: Long,
    minClearedWriteId: Long,
    minRevokedGen: Long
  ): Boolean =
    (minClearedWriteId > 0L && writeId <= minClearedWriteId) ||
      (minRevokedGen > 0L && lastSavedGen <= minRevokedGen)

  private fun commitWithRetry(commitBlock: () -> Boolean): Boolean =
    commitBlock() || commitBlock()

  sealed interface SaveResult {
    data object Rejected : SaveResult
    data object Duplicate : SaveResult
    data object PersistFailed : SaveResult
    data class Saved(val ownerId: String, val generation: Long, val writeId: Long) : SaveResult
  }

  internal fun resolveDuplicateCredentialSaveOutcome(
    incomingGen: Long,
    lastSavedGen: Long,
    incomingTransportRev: Long,
    lastTransportRev: Long,
    persistRevision: (nextGen: Long, nextTransportRev: Long) -> Boolean
  ): SaveResult {
    val nextGen = maxOf(lastSavedGen, incomingGen)
    val nextTransportRev = if (incomingGen > lastSavedGen) {
      incomingTransportRev
    } else {
      maxOf(lastTransportRev, incomingTransportRev)
    }
    if (nextGen == lastSavedGen && nextTransportRev == lastTransportRev) {
      return SaveResult.Duplicate
    }
    return if (persistRevision(nextGen, nextTransportRev)) {
      SaveResult.Duplicate
    } else {
      SaveResult.PersistFailed
    }
  }

  internal fun shouldAcceptGeneration(incomingGeneration: Long, watermark: Long): Boolean =
    if (watermark > 0L) incomingGeneration >= watermark else true

  internal fun shouldAcceptCredentialSave(
    incomingGeneration: Long,
    lastSavedGen: Long,
    revokedGen: Long,
    hasActiveBlob: Boolean,
    incomingTransportRev: Long = 0L,
    lastTransportRev: Long = 0L,
    isMtlsNotice: Boolean = false,
    mtlsDisabled: Boolean = true
  ): Boolean {
    if (revokedGen > 0L && incomingGeneration <= revokedGen) return false
    val barrier = maxOf(lastSavedGen, revokedGen)
    if (barrier <= 0L) {
      if (incomingGeneration < 0L) return false
      if (lastTransportRev > 0L && incomingTransportRev < lastTransportRev) return false
      return true
    }
    if (incomingGeneration > barrier) {
      return true
    }
    if (incomingGeneration < lastSavedGen) {
      return false
    }
    if (hasActiveBlob) {
      if (lastTransportRev > 0L && incomingTransportRev < lastTransportRev) {
        return false
      }
      if (isMtlsNotice && lastTransportRev > 0L && incomingTransportRev <= lastTransportRev) {
        return false
      }
      return true
    }
    if (!isMtlsNotice && !mtlsDisabled) {
      return lastTransportRev == 0L || incomingTransportRev >= lastTransportRev
    }
    return incomingTransportRev > lastTransportRev
  }

  internal fun shouldAcceptRevocation(
    generation: Long?,
    lastSavedGen: Long,
    revokedGen: Long,
    hasActiveBlob: Boolean,
    activeContextGeneration: Long = 0L,
    expectedWriteId: Long? = null,
    currentWriteId: Long = 0L,
    mtlsDisabled: Boolean = false
  ): Boolean {
    if (expectedWriteId != null && currentWriteId != expectedWriteId) {
      return false
    }
    if (generation != null && generation > 0L) {
      val hasActiveTransport = hasActiveBlob || (mtlsDisabled && lastSavedGen > 0L)
      val effectiveActiveGen = maxOf(if (hasActiveTransport) lastSavedGen else 0L, activeContextGeneration)
      if (effectiveActiveGen > generation) return false
      if (!hasActiveTransport && activeContextGeneration <= 0L && revokedGen >= generation) return false
    }
    return true
  }

  internal fun shouldAcceptContextPayload(
    hasContextGeneration: Boolean,
    incomingContextGen: Long,
    currentAcceptedContextGen: Long,
    lastSavedCredGen: Long,
    revokedCredGen: Long,
    hasActiveCredBlob: Boolean,
    requireStrictlyNewerContextGen: Boolean = false,
    incomingContextSeq: Long = 0L,
    currentAcceptedContextSeq: Long = 0L
  ): Boolean {
    val revocationBarrier = revokedCredGen
    if (hasContextGeneration && incomingContextGen > 0L) {
      val passesAccepted = if (requireStrictlyNewerContextGen) {
        incomingContextGen > currentAcceptedContextGen
      } else {
        incomingContextGen >= currentAcceptedContextGen
      }
      if (!(incomingContextGen > revocationBarrier && passesAccepted)) {
        return false
      }
      if (
        incomingContextGen == currentAcceptedContextGen &&
        currentAcceptedContextSeq > 0L &&
        incomingContextSeq <= currentAcceptedContextSeq
      ) {
        return false
      }
      return true
    }
    return revocationBarrier == 0L && currentAcceptedContextGen == 0L && lastSavedCredGen == 0L
  }

  fun shouldAcceptRemoteContext(
    context: Context,
    hasContextGeneration: Boolean,
    incomingContextGen: Long,
    currentAcceptedContextGen: Long,
    requireStrictlyNewerContextGen: Boolean = false,
    incomingContextSeq: Long = 0L,
    currentAcceptedContextSeq: Long = 0L
  ): Boolean = synchronized(lock) {
    val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val lastSaved = prefs.getLong(KEY_LAST_GENERATION, 0L)
    val revoked = effectiveRevokedGeneration(prefs.getLong(KEY_REVOKED_GENERATION, 0L), inMemoryRevokedGeneration)
    val hasBlob = !prefs.getString(KEY_ENCRYPTED_BLOB, null).isNullOrEmpty()
    shouldAcceptContextPayload(
      hasContextGeneration = hasContextGeneration,
      incomingContextGen = incomingContextGen,
      currentAcceptedContextGen = currentAcceptedContextGen,
      lastSavedCredGen = lastSaved,
      revokedCredGen = revoked,
      hasActiveCredBlob = hasBlob,
      requireStrictlyNewerContextGen = requireStrictlyNewerContextGen,
      incomingContextSeq = incomingContextSeq,
      currentAcceptedContextSeq = currentAcceptedContextSeq
    )
  }

  internal fun computeFingerprint(
    generation: Long,
    ownerId: String,
    baseUrl: String,
    headers: Map<String, String>
  ): String {
    val sortedHeaders = headers.entries.sortedBy { it.key }.joinToString("\n") { "${it.key}=${it.value}" }
    val raw = "$generation|$ownerId|$baseUrl|$sortedHeaders"
    val digest = MessageDigest.getInstance("SHA-256").digest(raw.toByteArray(StandardCharsets.UTF_8))
    return digest.joinToString("") { "%02x".format(it) }
  }

  private fun secretKey(): SecretKey {
    val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
    (ks.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
    val spec = KeyGenParameterSpec.Builder(
      KEY_ALIAS,
      KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
    )
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setKeySize(256)
      .build()
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE).run {
      init(spec)
      generateKey()
    }
  }

  private fun deleteKeyStoreAliasQuietly() {
    try {
      KeyStore.getInstance(ANDROID_KEYSTORE).apply {
        load(null)
        if (containsAlias(KEY_ALIAS)) {
          deleteEntry(KEY_ALIAS)
        }
      }
    } catch (_: Throwable) {}
  }

  fun storedOwnerId(context: Context): String? = synchronized(lock) {
    context.applicationContext
      .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .getString(KEY_OWNER_ID, null)
      ?.takeIf { it.isNotEmpty() }
  }

  fun lastGeneration(context: Context): Long = synchronized(lock) {
    context.applicationContext
      .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .getLong(KEY_LAST_GENERATION, 0L)
  }

  fun currentWriteId(context: Context): Long = synchronized(lock) {
    val writeId = context.applicationContext
      .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .getLong(KEY_WRITE_ID, 0L)
    if (writeId in failedUncommittedWriteIds) 0L else writeId
  }

  private fun captureCredentialRecord(prefs: android.content.SharedPreferences): CredentialStoreRecord =
    CredentialStoreRecord(
      ownerId = prefs.getString(KEY_OWNER_ID, null),
      encryptedBlob = prefs.getString(KEY_ENCRYPTED_BLOB, null),
      fingerprint = prefs.getString(KEY_LAST_APPLIED_FINGERPRINT, null),
      lastGeneration = prefs.getLong(KEY_LAST_GENERATION, 0L),
      writeId = prefs.getLong(KEY_WRITE_ID, 0L),
      lastTransportRevision = prefs.getLong(KEY_LAST_TRANSPORT_REVISION, 0L),
      mtlsDisabled = prefs.getBoolean(KEY_MTLS_DISABLED, false)
    )

  private fun restoreCredentialRecord(
    prefs: android.content.SharedPreferences,
    record: CredentialStoreRecord
  ) {
    val ed = prefs.edit()
    if (record.ownerId != null) ed.putString(KEY_OWNER_ID, record.ownerId) else ed.remove(KEY_OWNER_ID)
    if (record.encryptedBlob != null) ed.putString(KEY_ENCRYPTED_BLOB, record.encryptedBlob) else ed.remove(KEY_ENCRYPTED_BLOB)
    if (record.fingerprint != null) ed.putString(KEY_LAST_APPLIED_FINGERPRINT, record.fingerprint) else ed.remove(KEY_LAST_APPLIED_FINGERPRINT)
    if (record.lastGeneration > 0L) ed.putLong(KEY_LAST_GENERATION, record.lastGeneration) else ed.remove(KEY_LAST_GENERATION)
    if (record.writeId > 0L) ed.putLong(KEY_WRITE_ID, record.writeId) else ed.remove(KEY_WRITE_ID)
    if (record.lastTransportRevision > 0L) ed.putLong(KEY_LAST_TRANSPORT_REVISION, record.lastTransportRevision) else ed.remove(KEY_LAST_TRANSPORT_REVISION)
    if (record.mtlsDisabled) ed.putBoolean(KEY_MTLS_DISABLED, true) else ed.remove(KEY_MTLS_DISABLED)
    ed.apply()
  }

  fun revocationBarrierGeneration(context: Context): Long = synchronized(lock) {
    val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    effectiveRevokedGeneration(prefs.getLong(KEY_REVOKED_GENERATION, 0L), inMemoryRevokedGeneration)
  }

  fun hasPendingRevocationBarrier(context: Context): Boolean = synchronized(lock) {
    pendingUnpersistedRevokedGeneration > 0L
  }

  /**
   * Immediately blocks direct HTTP in memory before an asynchronous IO disk clear runs,
   * returning the writeId of the credentials active at the time of clearing.
   */
  fun disableCurrentCredentialsInMemory(context: Context): Long =
    disableCredentialsInMemoryIfWriteIdMatches(context, expectedWriteId = null) ?: 0L

  /**
   * Blocks direct HTTP in memory only when [expectedWriteId] is null or matches the
   * currently committed credential writeId, returning the matched writeId (or null when
   * a newer credential write has superseded it so newer credentials stay untouched).
   */
  fun disableCredentialsInMemoryIfWriteIdMatches(
    context: Context,
    expectedWriteId: Long? = null
  ): Long? = synchronized(lock) {
    val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val storedWriteId = prefs.getLong(KEY_WRITE_ID, 0L)
    val currentWriteId = if (storedWriteId in failedUncommittedWriteIds) 0L else storedWriteId
    if (!shouldDisableCredentialsForAccountClear(expectedWriteId, currentWriteId)) {
      return null
    }
    val lastSaved = prefs.getLong(KEY_LAST_GENERATION, 0L)
    if (storedWriteId > 0L) {
      inMemoryClearedWriteId = maxOf(inMemoryClearedWriteId, storedWriteId)
    }
    if (lastSaved > 0L) {
      inMemoryRevokedGeneration = maxOf(inMemoryRevokedGeneration, lastSaved)
    }
    currentWriteId
  }

  /**
   * Clears direct watch HTTP credentials when the phone configures mTLS without
   * advancing [KEY_REVOKED_GENERATION], so phone-relayed `/sparky/context` updates
   * for the active account continue to be accepted.
   */
  fun disableDirectHttpForClientCertificate(
    context: Context,
    generation: Long? = null,
    transportRevision: Long? = null,
    expectedWriteId: Long? = null
  ): Boolean = synchronized(lock) {
    val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val storedWriteId = prefs.getLong(KEY_WRITE_ID, 0L)
    val currentWriteId = if (storedWriteId in failedUncommittedWriteIds) 0L else storedWriteId
    if (!shouldDisableCredentialsForAccountClear(expectedWriteId, currentWriteId)) {
      return false
    }
    if (storedWriteId > 0L) {
      inMemoryClearedWriteId = maxOf(inMemoryClearedWriteId, storedWriteId)
    }
    val lastSaved = prefs.getLong(KEY_LAST_GENERATION, 0L)
    val prevMtlsDisabled = prefs.getBoolean(KEY_MTLS_DISABLED, false)
    val incomingGen = generation ?: 0L
    val nextLast = maxOf(lastSaved, incomingGen)
    val lastTransportRev = prefs.getLong(KEY_LAST_TRANSPORT_REVISION, 0L)
    val incomingTransportRev = transportRevision ?: 0L
    val nextTransportRev = if (incomingGen > lastSaved) {
      incomingTransportRev
    } else {
      maxOf(lastTransportRev, incomingTransportRev)
    }
    deleteKeyStoreAliasQuietly()
    val committed = commitWithRetry {
      prefs.edit()
        .remove(KEY_ENCRYPTED_BLOB)
        .remove(KEY_OWNER_ID)
        .remove(KEY_LAST_APPLIED_FINGERPRINT)
        .putLong(KEY_LAST_GENERATION, nextLast)
        .putLong(KEY_LAST_TRANSPORT_REVISION, nextTransportRev)
        .putBoolean(KEY_MTLS_DISABLED, true)
        .commit()
    }
    val (nextPendingGen, nextPendingRev) = resolvePendingUnpersistedMtlsBarrier(
      currentPendingGen = pendingUnpersistedMtlsGeneration,
      currentPendingRev = pendingUnpersistedMtlsTransportRevision,
      attemptedGen = nextLast,
      attemptedRev = nextTransportRev,
      commitSucceeded = committed
    )
    pendingUnpersistedMtlsGeneration = nextPendingGen
    pendingUnpersistedMtlsTransportRevision = nextPendingRev
    if (!committed) {
      // Restore persisted watermark keys in SharedPreferences memory so a retry of the same
      // mTLS notice is accepted and re-attempts durable disk commit.
      prefs.edit()
        .putLong(KEY_LAST_GENERATION, lastSaved)
        .putLong(KEY_LAST_TRANSPORT_REVISION, lastTransportRev)
        .apply {
          if (prevMtlsDisabled) putBoolean(KEY_MTLS_DISABLED, true) else remove(KEY_MTLS_DISABLED)
        }
        .commit()
    }
    committed
  }

  internal fun shouldDeduplicateCredentialSave(
    hasBlob: Boolean,
    prevOwner: String?,
    ownerId: String,
    prevFingerprint: String?,
    fingerprint: String,
    currentRecordReadable: Boolean,
    isCurrentWriteCommitted: Boolean = true
  ): Boolean =
    hasBlob && prevOwner == ownerId && prevFingerprint == fingerprint && currentRecordReadable && isCurrentWriteCommitted

  fun saveWithWatermark(
    context: Context,
    json: JSONObject,
    activeOwnerId: String? = null
  ): SaveResult = synchronized(lock) {
    val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val lastSavedGen = prefs.getLong(KEY_LAST_GENERATION, 0L)
    val lastTransportRev = prefs.getLong(KEY_LAST_TRANSPORT_REVISION, 0L)
    val revokedGen = effectiveRevokedGeneration(prefs.getLong(KEY_REVOKED_GENERATION, 0L), inMemoryRevokedGeneration)
    val hasBlob = !prefs.getString(KEY_ENCRYPTED_BLOB, null).isNullOrEmpty()
    val incomingGen = json.optLong("generation", 0L)
    val incomingTransportRev = json.optLong("transportRevision", 0L)
    val isMtlsNotice = json.optBoolean("requiresClientCertificate", false)
    val (effectiveLastGen, effectiveLastTransportRev) = if (isMtlsNotice) {
      lastSavedGen to lastTransportRev
    } else {
      effectiveMtlsWatermarkForNonMtlsSave(
        persistedGen = lastSavedGen,
        persistedTransportRev = lastTransportRev,
        pendingMtlsGen = pendingUnpersistedMtlsGeneration,
        pendingMtlsRev = pendingUnpersistedMtlsTransportRevision
      )
    }
    val effectiveHasBlob = if (!isMtlsNotice && (effectiveLastGen > lastSavedGen || effectiveLastTransportRev > lastTransportRev)) {
      false
    } else {
      hasBlob
    }
    val mtlsDisabled = prefs.getBoolean(KEY_MTLS_DISABLED, false) || pendingUnpersistedMtlsGeneration > 0L
    if (
      !shouldAcceptCredentialSave(
        incomingGeneration = incomingGen,
        lastSavedGen = effectiveLastGen,
        revokedGen = revokedGen,
        hasActiveBlob = effectiveHasBlob,
        incomingTransportRev = incomingTransportRev,
        lastTransportRev = effectiveLastTransportRev,
        isMtlsNotice = isMtlsNotice,
        mtlsDisabled = mtlsDisabled
      )
    ) {
      return SaveResult.Rejected
    }
    if (isMtlsNotice) {
      val persisted = disableDirectHttpForClientCertificate(
        context = context,
        generation = incomingGen.takeIf { it > 0L },
        transportRevision = incomingTransportRev.takeIf { it > 0L }
      )
      return resolveMtlsNoticeSaveResult(persisted)
    }

    val ownerId = json.optString("ownerId", "").trim()
    val baseUrl = json.optString("baseUrl", "").trim().trimEnd('/')
    val headersObj = json.optJSONObject("headers")
    if (ownerId.isEmpty() || baseUrl.isEmpty() || headersObj == null || headersObj.length() == 0) {
      tryClearForRevocation(context, generation = incomingGen.takeIf { it > 0L })
      return SaveResult.Rejected
    }
    if (!activeOwnerId.isNullOrEmpty() && activeOwnerId != ownerId) {
      return SaveResult.Rejected
    }

    val cleanHeaders = JSONObject()
    val headerMap = mutableMapOf<String, String>()
    val keys = headersObj.keys()
    while (keys.hasNext()) {
      val k = keys.next()
      val v = headersObj.optString(k, "").trim()
      if (k.isNotBlank() && v.isNotEmpty()) {
        cleanHeaders.put(k, v)
        headerMap[k] = v
      }
    }
    if (headerMap.isEmpty()) {
      tryClearForRevocation(context, generation = incomingGen.takeIf { it > 0L })
      return SaveResult.Rejected
    }

    val prevRecord = captureCredentialRecord(prefs)
    val fingerprint = computeFingerprint(incomingGen, ownerId, baseUrl, headerMap)
    val prevFingerprint = prevRecord.fingerprint
    val prevOwner = prevRecord.ownerId
    val matchesStoredMeta = hasBlob && prevOwner == ownerId && prevFingerprint == fingerprint
    val currentWriteCommitted = prevRecord.writeId !in failedUncommittedWriteIds
    val currentRecordReadable = matchesStoredMeta && currentWriteCommitted && load(context, ownerId) != null
    if (
      shouldDeduplicateCredentialSave(
        hasBlob = hasBlob,
        prevOwner = prevOwner,
        ownerId = ownerId,
        prevFingerprint = prevFingerprint,
        fingerprint = fingerprint,
        currentRecordReadable = currentRecordReadable,
        isCurrentWriteCommitted = currentWriteCommitted
      )
    ) {
      return resolveDuplicateCredentialSaveOutcome(
        incomingGen = incomingGen,
        lastSavedGen = lastSavedGen,
        incomingTransportRev = incomingTransportRev,
        lastTransportRev = lastTransportRev
      ) { nextGen, nextTransportRev ->
        val committed = commitWithRetry {
          prefs.edit()
            .putLong(KEY_LAST_GENERATION, nextGen)
            .putLong(KEY_LAST_TRANSPORT_REVISION, nextTransportRev)
            .commit()
        }
        if (!committed) {
          prefs.edit()
            .putLong(KEY_LAST_GENERATION, lastSavedGen)
            .putLong(KEY_LAST_TRANSPORT_REVISION, lastTransportRev)
            .commit()
        }
        committed
      }
    }
    if (matchesStoredMeta && !currentRecordReadable) {
      deleteKeyStoreAliasQuietly()
    }

    val record = JSONObject()
      .put("ownerId", ownerId)
      .put("baseUrl", baseUrl)
      .put("headers", cleanHeaders)
    return try {
      val cipher = Cipher.getInstance(TRANSFORMATION)
      cipher.init(Cipher.ENCRYPT_MODE, secretKey())
      val ct = cipher.doFinal(record.toString().toByteArray(StandardCharsets.UTF_8))
      val packed = Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" +
        Base64.encodeToString(ct, Base64.NO_WRAP)
      val nextLastSaved = maxOf(lastSavedGen, incomingGen)
      val nextTransportRev = if (incomingGen > lastSavedGen) {
        incomingTransportRev
      } else {
        maxOf(lastTransportRev, incomingTransportRev)
      }
      val nextWriteId = maxOf(prevRecord.writeId, inMemoryClearedWriteId, highestAttemptedWriteId) + 1L
      highestAttemptedWriteId = nextWriteId
      val candidateRecord = CredentialStoreRecord(
        ownerId = ownerId,
        encryptedBlob = packed,
        fingerprint = fingerprint,
        lastGeneration = nextLastSaved,
        writeId = nextWriteId,
        lastTransportRevision = nextTransportRev,
        mtlsDisabled = false
      )
      val saved = commitWithRetry {
        prefs.edit()
          .putString(KEY_OWNER_ID, ownerId)
          .putString(KEY_ENCRYPTED_BLOB, packed)
          .putString(KEY_LAST_APPLIED_FINGERPRINT, fingerprint)
          .putLong(KEY_LAST_GENERATION, nextLastSaved)
          .putLong(KEY_LAST_TRANSPORT_REVISION, nextTransportRev)
          .putLong(KEY_WRITE_ID, nextWriteId)
          .putBoolean(KEY_MTLS_DISABLED, false)
          .commit()
      }
      val (effectiveRecord, committed) = resolveCredentialStateAfterCommit(
        previousCommitted = prevRecord,
        candidate = candidateRecord,
        commitSucceeded = saved
      )
      if (committed) {
        failedUncommittedWriteIds.clear()
        val (clearedMtlsGen, clearedMtlsRev) = resolvePendingUnpersistedMtlsBarrier(
          currentPendingGen = pendingUnpersistedMtlsGeneration,
          currentPendingRev = pendingUnpersistedMtlsTransportRevision,
          attemptedGen = nextLastSaved,
          attemptedRev = nextTransportRev,
          commitSucceeded = true
        )
        pendingUnpersistedMtlsGeneration = clearedMtlsGen
        pendingUnpersistedMtlsTransportRevision = clearedMtlsRev
        SaveResult.Saved(ownerId = ownerId, generation = nextLastSaved, writeId = nextWriteId)
      } else {
        failedUncommittedWriteIds.add(nextWriteId)
        restoreCredentialRecord(prefs, effectiveRecord)
        SaveResult.Rejected
      }
    } catch (_: Throwable) {
      SaveResult.Rejected
    }
  }

  fun saveFromPayload(context: Context, json: JSONObject): Boolean =
    saveWithWatermark(context, json).let { it is SaveResult.Saved || it is SaveResult.Duplicate }

  fun load(context: Context, expectedOwnerId: String?): WearServerCredentials? = synchronized(lock) {
    val requiredOwner = expectedOwnerId?.trim()?.takeIf { it.isNotEmpty() } ?: return null
    val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val writeId = prefs.getLong(KEY_WRITE_ID, 0L)
    val lastSavedGen = prefs.getLong(KEY_LAST_GENERATION, 0L)
    val lastTransportRev = prefs.getLong(KEY_LAST_TRANSPORT_REVISION, 0L)
    if (
      writeId in failedUncommittedWriteIds ||
      isBlockedByPendingMtlsBarrier(
        savedGen = lastSavedGen,
        savedTransportRev = lastTransportRev,
        pendingMtlsGen = pendingUnpersistedMtlsGeneration,
        pendingMtlsRev = pendingUnpersistedMtlsTransportRevision
      ) ||
      isCredentialSessionDisabledInMemory(
        writeId = writeId,
        lastSavedGen = lastSavedGen,
        minClearedWriteId = inMemoryClearedWriteId,
        minRevokedGen = inMemoryRevokedGeneration
      )
    ) {
      return null
    }
    val storedOwner = prefs.getString(KEY_OWNER_ID, null)?.takeIf { it.isNotEmpty() } ?: return null
    if (storedOwner != requiredOwner) return null
    val packed = prefs.getString(KEY_ENCRYPTED_BLOB, null) ?: return null
    return try {
      val parts = packed.split(":", limit = 2)
      if (parts.size != 2) return null
      val iv = Base64.decode(parts[0], Base64.NO_WRAP)
      val ct = Base64.decode(parts[1], Base64.NO_WRAP)
      val cipher = Cipher.getInstance(TRANSFORMATION)
      cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, iv))
      val plain = String(cipher.doFinal(ct), StandardCharsets.UTF_8)
      val obj = JSONObject(plain)
      val ownerId = obj.optString("ownerId", "").trim()
      val baseUrl = obj.optString("baseUrl", "").trim().trimEnd('/')
      val hObj = obj.optJSONObject("headers") ?: return null
      if (ownerId.isEmpty() || baseUrl.isEmpty() || ownerId != requiredOwner) return null
      val headers = mutableMapOf<String, String>()
      val keys = hObj.keys()
      while (keys.hasNext()) {
        val k = keys.next()
        val v = hObj.optString(k, "")
        if (k.isNotBlank() && v.isNotEmpty()) {
          headers[k] = v
        }
      }
      if (headers.isEmpty()) null else WearServerCredentials(ownerId, baseUrl, headers, writeId)
    } catch (_: Throwable) {
      null
    }
  }

  private fun isSessionCurrentLocked(
    context: Context,
    ownerId: String,
    expectedWriteId: Long
  ): Boolean {
    val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val writeId = prefs.getLong(KEY_WRITE_ID, 0L)
    val lastSavedGen = prefs.getLong(KEY_LAST_GENERATION, 0L)
    return writeId !in failedUncommittedWriteIds &&
      !isCredentialSessionDisabledInMemory(
        writeId = writeId,
        lastSavedGen = lastSavedGen,
        minClearedWriteId = inMemoryClearedWriteId,
        minRevokedGen = inMemoryRevokedGeneration
      ) &&
      prefs.getString(KEY_OWNER_ID, null) == ownerId &&
      writeId == expectedWriteId &&
      !prefs.getString(KEY_ENCRYPTED_BLOB, null).isNullOrEmpty()
  }

  fun isSessionCurrent(context: Context, creds: WearServerCredentials): Boolean = synchronized(lock) {
    isSessionCurrentLocked(context, creds.ownerId, creds.writeId)
  }

  fun isWriteIdCurrent(context: Context, ownerId: String, writeId: Long): Boolean = synchronized(lock) {
    isSessionCurrentLocked(context, ownerId, writeId)
  }

  fun admitDirectRequest(
    context: Context,
    creds: WearServerCredentials,
    isAccountActive: () -> Boolean
  ): Boolean = synchronized(lock) {
    isDirectRequestAdmitted(
      isAccountActive = isAccountActive(),
      isSessionCurrent = isSessionCurrentLocked(context, creds.ownerId, creds.writeId)
    )
  }

  fun tryClearForRevocation(
    context: Context,
    generation: Long? = null,
    activeContextGeneration: Long = 0L,
    expectedWriteId: Long? = null
  ): RevocationResult = synchronized(lock) {
    val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val lastSaved = prefs.getLong(KEY_LAST_GENERATION, 0L)
    val effectiveLastSaved = maxOf(lastSaved, pendingUnpersistedMtlsGeneration)
    val revoked = effectiveRevokedGeneration(prefs.getLong(KEY_REVOKED_GENERATION, 0L), inMemoryRevokedGeneration)
    val hasBlob = !prefs.getString(KEY_ENCRYPTED_BLOB, null).isNullOrEmpty()
    val mtlsDisabled = prefs.getBoolean(KEY_MTLS_DISABLED, false) || pendingUnpersistedMtlsGeneration > 0L
    val storedWriteId = prefs.getLong(KEY_WRITE_ID, 0L)
    val currentWriteId = if (storedWriteId in failedUncommittedWriteIds) 0L else storedWriteId
    if (
      !shouldAcceptRevocation(
        generation = generation,
        lastSavedGen = effectiveLastSaved,
        revokedGen = revoked,
        hasActiveBlob = hasBlob,
        activeContextGeneration = activeContextGeneration,
        expectedWriteId = expectedWriteId,
        currentWriteId = currentWriteId,
        mtlsDisabled = mtlsDisabled
      )
    ) {
      return RevocationResult(
        accepted = false,
        persisted = false,
        targetWriteId = currentWriteId,
        revokedGeneration = revoked
      )
    }
    val nextRevoked = maxOf(revoked, lastSaved, generation ?: 0L, activeContextGeneration)
    inMemoryRevokedGeneration = maxOf(inMemoryRevokedGeneration, nextRevoked)
    if (storedWriteId > 0L) {
      inMemoryClearedWriteId = maxOf(inMemoryClearedWriteId, storedWriteId)
    }
    deleteKeyStoreAliasQuietly()
    val persisted = commitWithRetry {
      prefs.edit()
        .remove(KEY_ENCRYPTED_BLOB)
        .remove(KEY_OWNER_ID)
        .remove(KEY_LAST_APPLIED_FINGERPRINT)
        .remove(KEY_MTLS_DISABLED)
        .putLong(KEY_REVOKED_GENERATION, nextRevoked)
        .commit()
    }
    pendingUnpersistedRevokedGeneration = resolvePendingUnpersistedRevokedGeneration(
      currentPending = pendingUnpersistedRevokedGeneration,
      attemptedRevokedGen = nextRevoked,
      commitSucceeded = persisted
    )
    RevocationResult(
      accepted = true,
      persisted = persisted,
      targetWriteId = currentWriteId,
      revokedGeneration = nextRevoked
    )
  }

  fun persistPendingRevocationBarrier(
    context: Context,
    minRevokedGeneration: Long,
    expectedWriteId: Long? = null
  ): Boolean = synchronized(lock) {
    val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val storedWriteId = prefs.getLong(KEY_WRITE_ID, 0L)
    val currentWriteId = if (storedWriteId in failedUncommittedWriteIds) 0L else storedWriteId
    val nextRevoked = maxOf(
      prefs.getLong(KEY_REVOKED_GENERATION, 0L),
      inMemoryRevokedGeneration,
      pendingUnpersistedRevokedGeneration,
      minRevokedGeneration
    )
    val ed = prefs.edit().putLong(KEY_REVOKED_GENERATION, nextRevoked)
    if (shouldDisableCredentialsForAccountClear(expectedWriteId, currentWriteId)) {
      ed.remove(KEY_ENCRYPTED_BLOB)
        .remove(KEY_OWNER_ID)
        .remove(KEY_LAST_APPLIED_FINGERPRINT)
    }
    val persisted = commitWithRetry { ed.commit() }
    pendingUnpersistedRevokedGeneration = resolvePendingUnpersistedRevokedGeneration(
      currentPending = pendingUnpersistedRevokedGeneration,
      attemptedRevokedGen = nextRevoked,
      commitSucceeded = persisted
    )
    persisted
  }

  fun clearIfWriteIdMatches(context: Context, expectedWriteId: Long): Boolean = synchronized(lock) {
    val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    if (prefs.getLong(KEY_WRITE_ID, 0L) != expectedWriteId) return false
    val lastSaved = prefs.getLong(KEY_LAST_GENERATION, 0L)
    val revoked = effectiveRevokedGeneration(prefs.getLong(KEY_REVOKED_GENERATION, 0L), inMemoryRevokedGeneration)
    val nextRevoked = maxOf(revoked, lastSaved)
    inMemoryRevokedGeneration = maxOf(inMemoryRevokedGeneration, nextRevoked)
    if (expectedWriteId > 0L) {
      inMemoryClearedWriteId = maxOf(inMemoryClearedWriteId, expectedWriteId)
    }
    deleteKeyStoreAliasQuietly()
    val persisted = commitWithRetry {
      prefs.edit()
        .remove(KEY_ENCRYPTED_BLOB)
        .remove(KEY_OWNER_ID)
        .remove(KEY_LAST_APPLIED_FINGERPRINT)
        .remove(KEY_MTLS_DISABLED)
        .putLong(KEY_REVOKED_GENERATION, nextRevoked)
        .commit()
    }
    pendingUnpersistedRevokedGeneration = resolvePendingUnpersistedRevokedGeneration(
      currentPending = pendingUnpersistedRevokedGeneration,
      attemptedRevokedGen = nextRevoked,
      commitSucceeded = persisted
    )
    persisted
  }

  fun clear(context: Context, generation: Long? = null): Boolean = synchronized(lock) {
    val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val lastSaved = prefs.getLong(KEY_LAST_GENERATION, 0L)
    val revoked = effectiveRevokedGeneration(prefs.getLong(KEY_REVOKED_GENERATION, 0L), inMemoryRevokedGeneration)
    val nextRevoked = maxOf(revoked, lastSaved, generation ?: 0L)
    val currentWriteId = prefs.getLong(KEY_WRITE_ID, 0L)
    inMemoryRevokedGeneration = maxOf(inMemoryRevokedGeneration, nextRevoked)
    if (currentWriteId > 0L) {
      inMemoryClearedWriteId = maxOf(inMemoryClearedWriteId, currentWriteId)
    }
    deleteKeyStoreAliasQuietly()
    val persisted = commitWithRetry {
      prefs.edit()
        .remove(KEY_ENCRYPTED_BLOB)
        .remove(KEY_OWNER_ID)
        .remove(KEY_LAST_APPLIED_FINGERPRINT)
        .remove(KEY_MTLS_DISABLED)
        .putLong(KEY_REVOKED_GENERATION, nextRevoked)
        .commit()
    }
    pendingUnpersistedRevokedGeneration = resolvePendingUnpersistedRevokedGeneration(
      currentPending = pendingUnpersistedRevokedGeneration,
      attemptedRevokedGen = nextRevoked,
      commitSucceeded = persisted
    )
    persisted
  }
}

sealed interface DirectWriteOutcome {
  data class Applied(
    val syncedDomain: String,
    val entryDate: String? = null,
    val waterMl: Double? = null,
    val waterLog: List<WaterLogEntry>? = null,
    val confirmedWaterTapId: String? = null,
    val logConfirmedWaterTapId: String? = null,
    val createdWaterEntryId: String? = null,
    val deletedWaterEntryId: String? = null,
    val weightKg: Double? = null,
    val bodyFatPercentage: Double? = null,
    val medicationDoseId: String? = null,
    val medicationStatus: MedicationDoseStatus? = null,
    val fast: WatchFast? = null,
    val fastUpdated: Boolean = false,
    val fastStartOutcome: String? = null
  ) : DirectWriteOutcome

  data class Rejected(val statusCode: Int) : DirectWriteOutcome
  data object FallbackToPhone : DirectWriteOutcome
}

sealed interface PresetWorkoutDirectResult {
  data class Started(val plan: ActiveWorkoutPlan) : PresetWorkoutDirectResult
  data object FailedBeforeCreate : PresetWorkoutDirectResult
  data class UnconfirmedCreate(val sessionId: String) : PresetWorkoutDirectResult
}

data class DirectLiveSnapshot(
  val ownerId: String,
  val day: String,
  val waterConsumedMl: Double? = null,
  val waterLog: List<WaterLogEntry>? = null,
  val waterContainers: List<WaterContainer>? = null,
  val waterGoalMl: Double? = null,
  val waterFromFoodMl: Double? = null,
  val nutrition: NutritionSnapshot? = null,
  val exerciseSummary: ExerciseSummarySnapshot? = null,
  val steps: StepsSnapshot? = null,
  val stepGoal: Int? = null,
  val medications: MedicationSnapshot? = null,
  val medicationStatusesByDoseId: Map<String, MedicationDoseStatus>? = null,
  val history: List<HistoryPoint>? = null,
  val bodyFatHistory: List<HistoryPoint>? = null,
  val todayWeightKg: Double? = null,
  val todayBodyFatPercentage: Double? = null,
  val lastWeightKg: Double? = null,
  val lastBodyFatPercentage: Double? = null,
  val lastBodyFatDate: String? = null,
  val lastEntryDate: String? = null,
  val fast: WatchFast? = null,
  val fastKnown: Boolean = false,
  val credentialWriteId: Long = 0L
)

/**
 * Direct Wear OS → SparkyFitness HTTP client.
 *
 * Uses Wear OS's transparent network layer (Wi-Fi, LTE, or Bluetooth network
 * proxy through the phone's OS stack) so watch actions complete in <300 ms
 * even when the phone's React Native process is frozen by OEM battery savers
 * or the phone is left behind. Any network/TLS/auth-proxy failure returns
 * [DirectWriteOutcome.FallbackToPhone] so callers seamlessly fall back to the
 * phone bridge without losing or reverting optimistic watch state.
 */
object WearDirectApiClient {
  private const val CONNECT_TIMEOUT_MS = 8_000
  private const val READ_TIMEOUT_MS = 10_000

  internal sealed interface MedicationWriteDecision {
    data object None : MedicationWriteDecision
    data class Delete(val entryId: String) : MedicationWriteDecision
    data class Update(val entryId: String, val status: String) : MedicationWriteDecision
    data class Create(val status: String) : MedicationWriteDecision
  }

  private data class HttpResult(
    val status: Int,
    val body: String?
  ) {
    val isSuccess: Boolean get() = status in 200..299
    val isValidationFailure: Boolean get() = status == 400 || status == 422
  }

  private fun request(
    creds: WearServerCredentials,
    method: String,
    endpoint: String,
    bodyJson: JSONObject? = null
  ): HttpResult {
    val conn = try {
      (URL("${creds.baseUrl}$endpoint").openConnection() as HttpURLConnection)
    } catch (_: Throwable) {
      return HttpResult(-1, null)
    }
    return try {
      (conn as? HttpsURLConnection)?.sslSocketFactory = HttpsURLConnection.getDefaultSSLSocketFactory()
      conn.requestMethod = method
      conn.connectTimeout = CONNECT_TIMEOUT_MS
      conn.readTimeout = READ_TIMEOUT_MS
      // Never forward Authorization or proxy headers across a 3xx redirect.
      conn.instanceFollowRedirects = false
      for ((k, v) in creds.headers) {
        conn.setRequestProperty(k, v)
      }
      if (bodyJson != null) {
        conn.doOutput = true
        conn.setRequestProperty("Content-Type", "application/json")
        conn.outputStream.use { os ->
          os.write(bodyJson.toString().toByteArray(StandardCharsets.UTF_8))
        }
      }
      val status = conn.responseCode
      val text = try {
        val stream = if (status in 200..299) conn.inputStream else conn.errorStream
        stream?.bufferedReader(StandardCharsets.UTF_8)?.use { it.readText() }
      } catch (_: Throwable) {
        null
      }
      HttpResult(status, text)
    } catch (_: Throwable) {
      HttpResult(-1, null)
    } finally {
      conn.disconnect()
    }
  }

  private fun urlEncode(value: String): String =
    URLEncoder.encode(value, "UTF-8")

  internal fun findMatchingMedicationEntry(
    entries: JSONArray,
    medicationId: String,
    scheduleId: String,
    allowLegacyUnscheduledFallback: Boolean = true
  ): JSONObject? {
    val asNeeded = scheduleId.isEmpty()
    var exactMatch: JSONObject? = null
    var legacyFallback: JSONObject? = null
    for (i in 0 until entries.length()) {
      val row = entries.optJSONObject(i) ?: continue
      if (asNeeded) {
        if (
          row.optStringOrNull("medication_id") == medicationId &&
          row.optStringOrNull("status") == "prn_taken"
        ) {
          exactMatch = row
          break
        }
      } else {
        val rowSchedId = row.optStringOrNull("schedule_id")?.takeIf { it.isNotEmpty() }
        if (rowSchedId == scheduleId) {
          exactMatch = row
          break
        }
        if (
          allowLegacyUnscheduledFallback &&
          legacyFallback == null &&
          row.optStringOrNull("medication_id") == medicationId &&
          rowSchedId == null &&
          row.optStringOrNull("status") != "prn_taken"
        ) {
          legacyFallback = row
        }
      }
    }
    return exactMatch ?: legacyFallback
  }

  internal fun countDueScheduledDosesForMedication(
    medicationsBody: String?,
    medicationId: String,
    entryDate: String,
    timeZone: TimeZone = TimeZone.getDefault()
  ): Int? = dueScheduledDoseIdsForMedication(medicationsBody, medicationId, entryDate, timeZone)?.size

  internal fun dueScheduledDoseIdsForMedication(
    medicationsBody: String?,
    medicationId: String,
    entryDate: String,
    timeZone: TimeZone = TimeZone.getDefault()
  ): Set<String>? {
    val raw = medicationsBody?.trim() ?: return null
    if (raw.isEmpty() || medicationId.isBlank() || entryDate.isBlank()) return null
    return try {
      val arr = JSONArray(raw)
      val dueIds = LinkedHashSet<String>()
      var foundMed = false
      for (i in 0 until arr.length()) {
        val med = arr.optJSONObject(i) ?: continue
        if (med.optStringOrNull("id") != medicationId) continue
        foundMed = true
        if (med.optBooleanOrNull("is_active") == false) return emptySet()
        val schedulesArr = med.optJSONArray("schedules") ?: return emptySet()
        for (sIdx in 0 until schedulesArr.length()) {
          val sched = schedulesArr.optJSONObject(sIdx) ?: continue
          val schedType = sched.optStringOrNull("schedule_type_id")?.trim().orEmpty()
          if (schedType == "prn") continue
          val schedId = sched.optStringOrNull("id")?.takeIf { it.isNotBlank() } ?: continue
          if (isMedicationScheduleDueOnDate(sched, entryDate, timeZone)) {
            dueIds.add(schedId)
          }
        }
        break
      }
      if (foundMed) dueIds else null
    } catch (_: Throwable) {
      null
    }
  }

  internal enum class LegacyMedicationLookupResolution {
    ALLOW_LEGACY,
    DISALLOW_LEGACY,
    FALLBACK_TO_PHONE
  }

  internal fun resolveLegacyMedicationFallback(
    medsGetSucceeded: Boolean,
    medicationsBody: String?,
    medicationId: String,
    scheduleId: String,
    entryDate: String,
    timeZone: TimeZone = TimeZone.getDefault()
  ): LegacyMedicationLookupResolution {
    if (scheduleId.isBlank()) return LegacyMedicationLookupResolution.ALLOW_LEGACY
    if (!medsGetSucceeded) return LegacyMedicationLookupResolution.FALLBACK_TO_PHONE
    val dueIds = dueScheduledDoseIdsForMedication(medicationsBody, medicationId, entryDate, timeZone)
      ?: return LegacyMedicationLookupResolution.FALLBACK_TO_PHONE
    return if (dueIds.size == 1 && dueIds.contains(scheduleId)) {
      LegacyMedicationLookupResolution.ALLOW_LEGACY
    } else {
      LegacyMedicationLookupResolution.DISALLOW_LEGACY
    }
  }

  internal fun canUseLegacyMedicationFallbackForSchedule(
    medicationsBody: String?,
    medicationId: String,
    scheduleId: String,
    entryDate: String,
    timeZone: TimeZone = TimeZone.getDefault()
  ): Boolean = resolveLegacyMedicationFallback(
    medsGetSucceeded = true,
    medicationsBody = medicationsBody,
    medicationId = medicationId,
    scheduleId = scheduleId,
    entryDate = entryDate,
    timeZone = timeZone
  ) == LegacyMedicationLookupResolution.ALLOW_LEGACY

  private val DAY_REGEX = Regex("^(\\d{4})-(\\d{2})-(\\d{2})$")
  private val SAKAMOTO_T = intArrayOf(0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4)
  private val SUPPLEMENT_UNIT_SENTINELS = setOf("dose", "serving", "servings")

  private fun parseDayParts(day: String?): Triple<Int, Int, Int>? {
    val trimmed = day?.trim()?.take(10) ?: return null
    val m = DAY_REGEX.matchEntire(trimmed) ?: return null
    val year = m.groupValues[1].toIntOrNull() ?: return null
    val month = m.groupValues[2].toIntOrNull() ?: return null
    val dayOfMonth = m.groupValues[3].toIntOrNull() ?: return null
    if (month !in 1..12 || dayOfMonth !in 1..31) return null
    return Triple(year, month, dayOfMonth)
  }

  private fun normalizeDayString(raw: String?): String? {
    val trimmed = raw?.trim() ?: return null
    if (trimmed.length < 10) return null
    val prefix = trimmed.substring(0, 10)
    return if (DAY_REGEX.matches(prefix)) prefix else null
  }

  internal fun medicationDayOfWeek(day: String): Int? {
    val (rawYear, month, dayOfMonth) = parseDayParts(day) ?: return null
    var y = rawYear
    if (month < 3) y -= 1
    return ((y + y / 4 - y / 100 + y / 400 + SAKAMOTO_T[month - 1] + dayOfMonth) % 7 + 7) % 7
  }

  private fun utcDaysBetween(fromDay: String, toDay: String): Int? {
    val (y1, m1, d1) = parseDayParts(fromDay) ?: return null
    val (y2, m2, d2) = parseDayParts(toDay) ?: return null
    val utc = TimeZone.getTimeZone("UTC")
    val c1 = Calendar.getInstance(utc).apply {
      clear()
      set(y1, m1 - 1, d1, 0, 0, 0)
    }
    val c2 = Calendar.getInstance(utc).apply {
      clear()
      set(y2, m2 - 1, d2, 0, 0, 0)
    }
    return Math.round((c2.timeInMillis - c1.timeInMillis) / 86_400_000.0).toInt()
  }

  private fun daysInCalendarMonth(year: Int, month: Int): Int {
    val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply {
      clear()
      set(year, month - 1, 1, 0, 0, 0)
    }
    return cal.getActualMaximum(Calendar.DAY_OF_MONTH)
  }

  private fun formatCompactDecimal(value: Double, locale: Locale = Locale.getDefault()): String {
    if (!value.isFinite()) return "0"
    val fmt = java.text.NumberFormat.getNumberInstance(locale).apply {
      isGroupingUsed = false
      minimumFractionDigits = 0
      maximumFractionDigits = 4
    }
    val normalized = BigDecimal.valueOf(value).stripTrailingZeros().toDouble()
    return fmt.format(if (normalized == 0.0) 0.0 else normalized)
  }

  private fun joinDoseAmountUnit(
    amount: Double,
    unit: String?,
    isSupplement: Boolean,
    locale: Locale = Locale.getDefault(),
    formatSupplementServings: ((pluralQuantity: Int, formattedAmount: String) -> String)? = null
  ): String {
    val numText = formatCompactDecimal(amount, locale)
    if (isSupplement) {
      val useGenericServings = unit.isNullOrEmpty() || unit.lowercase(Locale.US) in SUPPLEMENT_UNIT_SENTINELS
      if (useGenericServings) {
        val pluralQty = if (amount == 1.0) 1 else 2
        if (formatSupplementServings != null) {
          return formatSupplementServings(pluralQty, numText)
        }
        val fallbackUnit = if (pluralQty == 1) "serving" else "servings"
        return "$numText $fallbackUnit"
      }
      return "$numText $unit"
    }
    return if (!unit.isNullOrEmpty()) "$numText $unit" else numText
  }

  internal fun formatMedicationDose(
    medObj: JSONObject,
    schedObj: JSONObject? = null,
    locale: Locale = Locale.getDefault(),
    formatSupplementServings: ((pluralQuantity: Int, formattedAmount: String) -> String)? = null
  ): String {
    val isSupplement = medObj.optBooleanOrNull("is_supplement") ?: false
    val doseUnit = medObj.optStringOrNull("dose_unit")
    val schedDose = schedObj?.optDoubleOrNull("dose_amount")
    if (schedDose != null) {
      return joinDoseAmountUnit(schedDose, doseUnit, isSupplement, locale, formatSupplementServings)
    }
    val medDose = medObj.optDoubleOrNull("dose_amount")
    if (medDose != null) {
      return joinDoseAmountUnit(medDose, doseUnit, isSupplement, locale, formatSupplementServings)
    }
    val strengthVal = medObj.optDoubleOrNull("strength_value")
    if (strengthVal != null) {
      val strengthUnit = medObj.optStringOrNull("strength_unit")
      return joinDoseAmountUnit(strengthVal, strengthUnit, isSupplement = false, locale = locale)
    }
    return ""
  }

  internal fun formatMedicationTimeOfDay(
    timeOfDay: String?,
    timeFormat: String? = null,
    locale: Locale = Locale.getDefault()
  ): String {
    val raw = timeOfDay?.trim().orEmpty()
    if (raw.isEmpty()) return ""
    val parts = raw.split(":")
    val hour = parts.getOrNull(0)?.toIntOrNull()
    val minute = parts.getOrNull(1)?.toIntOrNull()
    if (hour == null || minute == null || hour !in 0..23 || minute !in 0..59) {
      return raw
    }
    val normalized = timeFormat?.trim().orEmpty()
    if (normalized == "HH:mm") {
      return String.format(Locale.US, "%02d:%02d", hour, minute)
    }
    val cal = Calendar.getInstance().apply {
      set(2000, Calendar.JANUARY, 1, hour, minute, 0)
      set(Calendar.MILLISECOND, 0)
    }
    return when {
      normalized.equals("h:mm a", ignoreCase = true) -> {
        val pattern = try {
          android.text.format.DateFormat.getBestDateTimePattern(locale, "hm")
            ?.takeIf { it.isNotBlank() }
        } catch (_: Throwable) {
          null
        } ?: "h:mm a"
        SimpleDateFormat(pattern, locale).format(cal.time)
      }
      else -> java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT, locale).format(cal.time)
    }
  }

  internal fun isMedicationScheduleDueOnDate(
    schedObj: JSONObject,
    dateString: String,
    timeZone: TimeZone = TimeZone.getDefault()
  ): Boolean {
    if (schedObj.optBooleanOrNull("active") == false) return false
    val type = schedObj.optStringOrNull("schedule_type_id")?.trim().orEmpty()
    if (type == "prn" || type.isEmpty()) return false

    val startDate = normalizeDayString(schedObj.optStringOrNull("start_date"))
    val endDate = normalizeDayString(schedObj.optStringOrNull("end_date"))
    if (startDate == null) {
      val createdMs = ContextPayloadMapper.parseIsoMs(schedObj.optStringOrNull("created_at"))
      if (createdMs != null) {
        val fmt = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { this.timeZone = timeZone }
        val fallbackStart = fmt.format(Date(createdMs))
        if (dateString < fallbackStart) return false
      }
    }
    if (startDate != null && dateString < startDate) return false
    if (endDate != null && dateString > endDate) return false

    return when (type) {
      "daily", "taper" -> true
      "weekly", "specific_days" -> {
        val daysArr = schedObj.optJSONArray("days_of_week") ?: return false
        if (daysArr.length() == 0) return false
        val dow = medicationDayOfWeek(dateString) ?: return false
        var matched = false
        for (i in 0 until daysArr.length()) {
          if (!daysArr.isNull(i) && daysArr.optInt(i, -1) == dow) {
            matched = true
            break
          }
        }
        matched
      }
      "every_n_days" -> {
        val intervalDays = schedObj.optIntOrNull("interval_days") ?: return false
        if (intervalDays <= 0) return false
        val anchor = startDate ?: "2020-01-01"
        val diff = utcDaysBetween(anchor, dateString) ?: return false
        diff >= 0 && diff % intervalDays == 0
      }
      "monthly" -> {
        val targetDom = schedObj.optIntOrNull("day_of_month") ?: return false
        if (targetDom <= 0) return false
        val (year, month, day) = parseDayParts(dateString) ?: return false
        if (day == targetDom) return true
        if (targetDom > day) {
          val lastDay = daysInCalendarMonth(year, month)
          return day == lastDay && targetDom >= lastDay
        }
        false
      }
      "cyclic" -> {
        val onDays = schedObj.optIntOrNull("cycle_on_days") ?: return false
        if (onDays <= 0) return false
        val offDays = (schedObj.optIntOrNull("cycle_off_days") ?: 0).coerceAtLeast(0)
        val cyclePeriod = onDays + offDays
        val anchor = startDate ?: "2020-01-01"
        val diff = utcDaysBetween(anchor, dateString) ?: return false
        diff >= 0 && (diff % cyclePeriod) < onDays
      }
      else -> false
    }
  }

  /**
   * Projects active server medications and today's logged entries into a [MedicationSnapshot]
   * matching `medicationsForWatch` in `SparkyFitnessMobile/src/utils/watchMedications.ts`.
   */
  internal fun buildMedicationsSnapshotFromServerJson(
    medicationsBody: String?,
    entriesBody: String?,
    today: String,
    timeFormat: String? = null,
    timeZone: TimeZone = TimeZone.getDefault(),
    locale: Locale = Locale.getDefault(),
    context: Context? = null,
    formatSupplementServings: ((pluralQuantity: Int, formattedAmount: String) -> String)? = null
  ): MedicationSnapshot? {
    val resolvedServingsFormatter: ((Int, String) -> String)? = formatSupplementServings ?: context?.let { appCtx ->
      { qty, formatted ->
        appCtx.resources.getQuantityString(R.plurals.medication_supplement_servings, qty, formatted)
      }
    }
    val medsTrimmed = medicationsBody?.trim() ?: return null
    val entriesTrimmed = entriesBody?.trim() ?: return null
    if (medsTrimmed.isEmpty() || entriesTrimmed.isEmpty()) return null
    return try {
      val medsArr = JSONArray(medsTrimmed)
      val entriesArr = JSONArray(entriesTrimmed)
      data class ScheduledSlot(
        val timeSortKey: String?,
        val dose: MedicationDose
      )
      val scheduledSlots = mutableListOf<ScheduledSlot>()
      val asNeededDoses = mutableListOf<MedicationDose>()

      for (i in 0 until medsArr.length()) {
        val med = medsArr.optJSONObject(i) ?: continue
        if (med.optBooleanOrNull("is_active") == false) continue
        val medId = med.optStringOrNull("id")?.takeIf { it.isNotBlank() } ?: continue
        val medName = med.optStringOrNull("name")?.takeIf { it.isNotBlank() } ?: continue
        val schedulesArr = med.optJSONArray("schedules")
        val scheduleCount = schedulesArr?.length() ?: 0
        var hasPrnSchedule = false
        val dueSchedulesForMed = mutableListOf<Pair<String, JSONObject>>()
        for (sIdx in 0 until scheduleCount) {
          val sched = schedulesArr?.optJSONObject(sIdx) ?: continue
          val schedType = sched.optStringOrNull("schedule_type_id")?.trim().orEmpty()
          if (schedType == "prn") {
            hasPrnSchedule = true
            continue
          }
          val schedId = sched.optStringOrNull("id")?.takeIf { it.isNotBlank() } ?: continue
          if (!isMedicationScheduleDueOnDate(sched, today, timeZone)) continue
          dueSchedulesForMed.add(schedId to sched)
        }
        val allowLegacyForMed = dueSchedulesForMed.size == 1
        for ((schedId, sched) in dueSchedulesForMed) {
          val rawTime = sched.optStringOrNull("time_of_day")?.takeIf { it.isNotBlank() }
          val matched = findMatchingMedicationEntry(
            entries = entriesArr,
            medicationId = medId,
            scheduleId = schedId,
            allowLegacyUnscheduledFallback = allowLegacyForMed
          )
          val status = when (matched?.optStringOrNull("status")) {
            "taken", "prn_taken" -> MedicationDoseStatus.TAKEN
            "skipped" -> MedicationDoseStatus.SKIPPED
            else -> MedicationDoseStatus.PENDING
          }
          scheduledSlots.add(
            ScheduledSlot(
              timeSortKey = rawTime,
              dose = MedicationDose(
                id = "$medId:$schedId",
                medicationId = medId,
                scheduleId = schedId,
                name = medName,
                detail = formatMedicationDose(med, sched, locale, resolvedServingsFormatter),
                time = if (rawTime != null) formatMedicationTimeOfDay(rawTime, timeFormat, locale) else "",
                status = status
              )
            )
          )
        }
        if (scheduleCount == 0 || hasPrnSchedule) {
          val matchedPrn = findMatchingMedicationEntry(entriesArr, medId, "")
          val status = when (matchedPrn?.optStringOrNull("status")) {
            "taken", "prn_taken" -> MedicationDoseStatus.TAKEN
            "skipped" -> MedicationDoseStatus.SKIPPED
            else -> MedicationDoseStatus.PENDING
          }
          asNeededDoses.add(
            MedicationDose(
              id = "$medId:",
              medicationId = medId,
              scheduleId = "",
              name = medName,
              detail = formatMedicationDose(med, null, locale, resolvedServingsFormatter),
              time = "",
              status = status
            )
          )
        }
      }

      val sortedScheduled = scheduledSlots.sortedWith { a, b ->
        val at = a.timeSortKey
        val bt = b.timeSortKey
        when {
          at == null && bt == null -> 0
          at == null -> 1
          bt == null -> -1
          else -> at.compareTo(bt)
        }
      }.map { it.dose }

      MedicationSnapshot(day = today, doses = sortedScheduled + asNeededDoses)
    } catch (_: Throwable) {
      null
    }
  }

  internal fun shouldRunFollowUpDirectRead(
    isAccountActive: Boolean,
    isSessionCurrent: Boolean
  ): Boolean = WearServerCredentialsStore.isDirectRequestAdmitted(isAccountActive, isSessionCurrent)

  internal fun shouldExecuteLiveRefreshChild(
    isAccountActive: Boolean,
    isSessionCurrent: Boolean
  ): Boolean = WearServerCredentialsStore.isDirectRequestAdmitted(isAccountActive, isSessionCurrent)

  internal fun resolveMedicationStatusesFromEntries(
    doses: List<MedicationDose>,
    entriesArr: JSONArray
  ): Map<String, MedicationDoseStatus> {
    val scheduledCountsByMed = doses
      .filter { it.scheduleId.isNotEmpty() }
      .groupingBy { it.medicationId }
      .eachCount()
    val map = mutableMapOf<String, MedicationDoseStatus>()
    for (dose in doses) {
      val allowLegacy = dose.scheduleId.isEmpty() || (scheduledCountsByMed[dose.medicationId] ?: 0) == 1
      val matched = findMatchingMedicationEntry(
        entries = entriesArr,
        medicationId = dose.medicationId,
        scheduleId = dose.scheduleId,
        allowLegacyUnscheduledFallback = allowLegacy
      )
      map[dose.id] = when (matched?.optStringOrNull("status")) {
        "taken", "prn_taken" -> MedicationDoseStatus.TAKEN
        "skipped" -> MedicationDoseStatus.SKIPPED
        else -> MedicationDoseStatus.PENDING
      }
    }
    return map
  }

  /**
   * Mirrors `watchMedicationWrite` in `SparkyFitnessMobile/src/utils/watchMedications.ts`.
   */
  internal fun decideMedicationWrite(
    medicationId: String,
    scheduleId: String,
    taken: Boolean,
    skipped: Boolean,
    entries: JSONArray,
    allowLegacyUnscheduledFallback: Boolean = true
  ): MedicationWriteDecision {
    val asNeeded = scheduleId.isEmpty()
    val existing = findMatchingMedicationEntry(
      entries = entries,
      medicationId = medicationId,
      scheduleId = scheduleId,
      allowLegacyUnscheduledFallback = allowLegacyUnscheduledFallback
    )
    val existingId = existing?.optStringOrNull("id")?.takeIf { it.isNotEmpty() }
    val existingStatus = existing?.optStringOrNull("status") ?: ""
    val isCurrentlyTaken = existingStatus == "taken" || existingStatus == "prn_taken"
    val isCurrentlySkipped = existingStatus == "skipped"
    val wantSkip = skipped && !asNeeded

    if (!wantSkip && !taken) {
      return if (existingId != null && (isCurrentlyTaken || isCurrentlySkipped)) {
        MedicationWriteDecision.Delete(existingId)
      } else {
        MedicationWriteDecision.None
      }
    }
    val targetStatus = if (wantSkip) "skipped" else "taken"
    if (if (wantSkip) isCurrentlySkipped else isCurrentlyTaken) {
      return MedicationWriteDecision.None
    }
    if (existingId != null) {
      return MedicationWriteDecision.Update(existingId, targetStatus)
    }
    return MedicationWriteDecision.Create(if (asNeeded) "prn_taken" else targetStatus)
  }

  internal fun fastingPresetSpec(presetId: String): Pair<String, Double>? = when (presetId) {
    "16-8" -> "16:8 Leangains" to 16.0
    "18-6" -> "18:6 Warrior" to 18.0
    "20-4" -> "20:4 Warrior" to 20.0
    "circumadian" -> "Circadian Rhythm" to 13.0
    "custom" -> "Custom Fast" to 12.0
    else -> null
  }

  private val UUID_REGEX = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

  internal fun isValidUuid(value: String): Boolean = UUID_REGEX.matches(value.trim())

  internal fun isTerminalFastObject(obj: JSONObject): Boolean {
    val status = obj.optStringOrNull("status") ?: ""
    if (
      status.equals("COMPLETED", ignoreCase = true) ||
      status.equals("CANCELLED", ignoreCase = true)
    ) {
      return true
    }
    if (status.equals("ACTIVE", ignoreCase = true)) {
      return false
    }
    return obj.optStringOrNull("end_time") != null
  }

  internal fun isCompletedFastJson(raw: String?): Boolean {
    if (raw.isNullOrBlank()) return false
    return try {
      isTerminalFastObject(JSONObject(raw.trim()))
    } catch (_: Throwable) {
      false
    }
  }

  internal fun parseFastJson(raw: String?): Pair<WatchFast?, Boolean> {
    if (raw == null) return null to false
    val trimmed = raw.trim()
    if (trimmed == "null") return null to true
    return try {
      val obj = JSONObject(trimmed)
      if (obj.optBoolean("is_eating_window", false)) {
        return null to true
      }
      if (isTerminalFastObject(obj)) {
        return null to true
      }
      val startMs = ContextPayloadMapper.parseIsoMs(obj.optStringOrNull("start_time"))
        ?: return null to false
      val targetMs = ContextPayloadMapper.parseIsoMs(obj.optStringOrNull("target_end_time"))
      val label = obj.optStringOrNull("fasting_type")?.takeIf { it.isNotBlank() }
      val id = if (obj.optBoolean("is_auto_calculated", false)) {
        null
      } else {
        obj.optStringOrNull("id")?.takeIf { it.isNotBlank() }
      }
      WatchFast(startedAtMs = startMs, targetEndAtMs = targetMs, label = label, id = id) to true
    } catch (_: Throwable) {
      null to false
    }
  }

  internal fun formatWaterLogTimestamp(
    loggedMs: Long,
    timeFormat: String? = null,
    locale: Locale = Locale.getDefault()
  ): String {
    if (loggedMs <= 0L) return ""
    val normalized = timeFormat?.trim().orEmpty()
    val date = Date(loggedMs)
    return when {
      normalized == "HH:mm" -> SimpleDateFormat("HH:mm", locale).format(date)
      normalized.equals("h:mm a", ignoreCase = true) -> {
        val pattern = try {
          android.text.format.DateFormat.getBestDateTimePattern(locale, "hm")
            ?.takeIf { it.isNotBlank() }
        } catch (_: Throwable) {
          null
        } ?: "h:mm a"
        SimpleDateFormat(pattern, locale).format(date)
      }
      else -> java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT, locale).format(date)
    }
  }

  internal fun parseWaterLogJson(
    raw: String?,
    timeFormat: String? = null,
    locale: Locale = Locale.getDefault()
  ): List<WaterLogEntry>? {
    if (raw.isNullOrBlank()) return null
    return try {
      val arr = JSONArray(raw)
      val entries = mutableListOf<Pair<Long, WaterLogEntry>>()
      for (i in 0 until arr.length()) {
        val row = arr.optJSONObject(i) ?: continue
        if (row.optStringOrNull("source") != "manual") continue
        val containerName = row.optStringOrNull("container_name")?.takeIf { it.isNotBlank() } ?: continue
        val id = row.opt("id")?.toString()?.takeIf { it.isNotBlank() } ?: continue
        val volumeMl = row.optDoubleOrNull("water_ml") ?: 0.0
        val loggedMs = ContextPayloadMapper.parseIsoMs(row.optStringOrNull("logged_at"))
          ?: ContextPayloadMapper.parseIsoMs(row.optStringOrNull("created_at"))
          ?: 0L
        val timeLabel = formatWaterLogTimestamp(loggedMs, timeFormat, locale)
        entries.add(
          loggedMs to WaterLogEntry(
            id = id,
            name = containerName,
            volumeMl = volumeMl,
            time = timeLabel,
            loggedAtMs = loggedMs.takeIf { it > 0L }
          )
        )
      }
      entries.sortedByDescending { it.first }.map { it.second }
    } catch (_: Throwable) {
      null
    }
  }

  /**
   * Mirrors `foodVolumeToMl` in `shared/src/utils/servingSizeConversions.ts`.
   * Note that `'oz'` is a weight unit (`28.3495 g`) in food serving units and
   * intentionally returns `null`; fluid ounces use `'fl oz'`, `'floz'`, or `'fl_oz'`.
   */
  internal fun foodVolumeToMl(value: Double, unit: String): Double? {
    val factor = when (unit.lowercase(Locale.US).trim()) {
      "ml" -> 1.0
      "l", "liter", "liters" -> 1000.0
      "cup", "cups" -> 236.588
      "tbsp" -> 14.7868
      "tsp" -> 4.92892
      "fl oz", "floz", "fl_oz" -> 29.5735
      else -> return null
    }
    return value * factor
  }

  /**
   * Mirrors `watchContainerServingVolumeMl` in `SparkyFitnessMobile/src/utils/watchWater.ts`
   * and `getServingVolume` in `SparkyFitnessMobile/src/utils/unitConversions.ts`.
   * Server `volume` is already stored in millilitres regardless of `unit`.
   */
  internal fun containerServingVolumeMl(row: JSONObject): Double {
    val linkedFoodId = row.optStringOrNull("linked_food_id")?.takeIf { it.isNotBlank() }
    val volume = row.optDoubleOrNull("volume") ?: 0.0
    val rawServings = row.optDoubleOrNull("servings_per_container")
    if (linkedFoodId == null) {
      val divisor = if (rawServings != null && rawServings != 0.0) rawServings else 1.0
      return volume / divisor
    }

    val servings = maxOf(1.0, if (rawServings != null && rawServings != 0.0) rawServings else 1.0)
    val amountPerDrink = volume / servings
    val hydrationFactor = row.optDoubleOrNull("hydration_factor") ?: 1.0

    if (volume > 0.0) {
      return amountPerDrink * hydrationFactor
    }

    val linkedQuantity = row.optDoubleOrNull("linked_quantity")?.takeIf { it > 0.0 } ?: 1.0
    val foodExplicitWater = row.optDoubleOrNull("linked_variant_water_ml")
    if (foodExplicitWater != null && foodExplicitWater > 0.0) {
      val servingSize = row.optDoubleOrNull("linked_variant_serving_size") ?: 0.0
      val consumedWater = if (servingSize > 0.0) {
        (foodExplicitWater * linkedQuantity) / servingSize
      } else {
        foodExplicitWater
      }
      return consumedWater * hydrationFactor
    }

    val servingUnit = row.optStringOrNull("linked_variant_serving_unit") ?: ""
    val volFallback = foodVolumeToMl(linkedQuantity, servingUnit)
    if (volFallback != null && volFallback.isFinite()) {
      return volFallback * hydrationFactor
    }

    return amountPerDrink * hydrationFactor
  }

  /**
   * Mirrors `watchContainerDisplayUnit` in `SparkyFitnessMobile/src/utils/watchWater.ts`.
   */
  internal fun containerDisplayUnit(row: JSONObject, waterDisplayUnit: String?): String {
    val linkedFoodId = row.optStringOrNull("linked_food_id")?.takeIf { it.isNotBlank() }
    val volume = row.optDoubleOrNull("volume") ?: 0.0
    val rowUnit = row.optStringOrNull("unit")?.trim()?.takeIf { it.isNotEmpty() }
    val prefUnit = waterDisplayUnit?.trim()?.takeIf { it.isNotEmpty() }
    return if (linkedFoodId == null || volume > 0.0) {
      rowUnit ?: prefUnit ?: "ml"
    } else {
      prefUnit ?: rowUnit ?: "ml"
    }
  }

  internal fun parseWaterContainersJson(
    raw: String?,
    globalDisplayUnit: String?
  ): List<WaterContainer>? {
    if (raw.isNullOrBlank()) return null
    return try {
      val arr = JSONArray(raw)
      val out = mutableListOf<WaterContainer>()
      for (i in 0 until arr.length()) {
        val row = arr.optJSONObject(i) ?: continue
        val id = row.optIntOrNull("id") ?: continue
        val name = row.optStringOrNull("name")?.takeIf { it.isNotBlank() } ?: continue
        val rawServingMl = containerServingVolumeMl(row)
        val servingMl = if (rawServingMl.isFinite()) maxOf(0.0, rawServingMl) else 0.0
        val displayUnit = containerDisplayUnit(row, globalDisplayUnit)
        out.add(
          WaterContainer(
            id = id,
            name = name,
            servingVolumeMl = servingMl,
            unit = displayUnit,
            isPrimary = row.optBooleanOrNull("is_primary") ?: false,
            isQuickAdd = row.optBooleanOrNull("is_quick_add") ?: false
          )
        )
      }
      out
    } catch (_: Throwable) {
      null
    }
  }

  data class ParsedHistoryMetrics(
    val history: List<HistoryPoint>,
    val bodyFatHistory: List<HistoryPoint> = emptyList(),
    val todayWeightKg: Double?,
    val todayBodyFatPercentage: Double?,
    val lastWeightKg: Double?,
    val lastBodyFatPercentage: Double?,
    val lastBodyFatDate: String? = null,
    val lastEntryDate: String?,
    val todaySteps: Int? = null
  )

  internal fun parseHistoryRangeJson(
    raw: String?,
    today: String,
    days: Int = 14
  ): ParsedHistoryMetrics? {
    if (raw.isNullOrBlank()) return null
    return try {
      val arr = JSONArray(raw)
      data class DayVals(val weight: Double?, val bodyFat: Double?, val steps: Int?)
      val byDay = LinkedHashMap<String, DayVals>()
      for (i in 0 until arr.length()) {
        val row = arr.optJSONObject(i) ?: continue
        val entryDate = row.optStringOrNull("entry_date")?.takeIf { it.isNotBlank() } ?: continue
        if (byDay.containsKey(entryDate)) continue
        val w = row.optDoubleOrNull("weight")?.takeIf { it > 0.0 }
        val bf = row.optDoubleOrNull("body_fat_percentage")?.takeIf { it > 0.0 }
        val steps = row.optIntOrNull("steps")?.takeIf { it >= 0 }
        byDay[entryDate] = DayVals(w, bf, steps)
      }
      val fmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
      val baseDate = fmt.parse(today) ?: return null
      val history = mutableListOf<HistoryPoint>()
      val bodyFatHistory = mutableListOf<HistoryPoint>()
      var latestPriorBf: Double? = null
      var latestPriorBfDate: String? = null
      for (offset in -(days - 1)..0) {
        val cal = Calendar.getInstance().apply {
          time = baseDate
          add(Calendar.DAY_OF_YEAR, offset)
        }
        val dayStr = fmt.format(cal.time)
        val row = byDay[dayStr]
        if (dayStr != today && row?.bodyFat != null) {
          latestPriorBf = row.bodyFat
          latestPriorBfDate = dayStr
        }
        if (row?.weight != null) {
          history.add(
            HistoryPoint(
              day = dayStr,
              weightKg = row.weight,
              bodyFatPercentage = row.bodyFat
            )
          )
        }
        if (row?.bodyFat != null) {
          bodyFatHistory.add(
            HistoryPoint(
              day = dayStr,
              weightKg = row.weight ?: 0.0,
              bodyFatPercentage = row.bodyFat
            )
          )
        }
      }
      val todayRow = byDay[today]
      val lastWithWeight = history.lastOrNull { it.day != today } ?: history.lastOrNull()
      val (lastBf, lastBfDate) = when {
        latestPriorBf != null && latestPriorBfDate != null -> latestPriorBf to latestPriorBfDate
        todayRow?.bodyFat != null -> todayRow.bodyFat to today
        else -> null to null
      }
      ParsedHistoryMetrics(
        history = history,
        bodyFatHistory = bodyFatHistory,
        todayWeightKg = todayRow?.weight,
        todayBodyFatPercentage = todayRow?.bodyFat,
        lastWeightKg = lastWithWeight?.weightKg,
        lastBodyFatPercentage = lastBf,
        lastBodyFatDate = lastBfDate,
        lastEntryDate = lastWithWeight?.day,
        todaySteps = todayRow?.steps
      )
    } catch (_: Throwable) {
      null
    }
  }

  internal data class ParsedDailySummary(
    val nutrition: NutritionSnapshot,
    val waterGoalMl: Double?,
    val waterFromFoodMl: Double?,
    val exerciseSummary: ExerciseSummarySnapshot,
    val stepGoal: Int?
  )

  internal fun parseDailySummaryJson(
    raw: String?,
    today: String,
    existingNutrition: NutritionSnapshot? = null,
    includeFoodWater: Boolean = false
  ): ParsedDailySummary? {
    if (raw.isNullOrBlank()) return null
    return try {
      val obj = JSONObject(raw)
      val goals = obj.optJSONObject("goals")
      val adjusted = obj.optJSONObject("adjustedGoals")
      val calorieBalance = obj.optJSONObject("calorieBalance")
      val foodEntries = obj.optJSONArray("foodEntries")
      val supplementTotals = obj.optJSONObject("supplementTotals")
      val exerciseSessions = obj.optJSONArray("exerciseSessions")
      val waterBreakdown = obj.optJSONObject("waterIntakeBreakdown")

      fun sumFoodField(field: String): Double {
        if (foodEntries == null) return 0.0
        var total = 0.0
        for (i in 0 until foodEntries.length()) {
          val entry = foodEntries.optJSONObject(i) ?: continue
          val servingSize = entry.optDoubleOrNull("serving_size") ?: 0.0
          if (servingSize == 0.0) continue
          val quantity = entry.optDoubleOrNull("quantity") ?: 0.0
          val value = entry.optDoubleOrNull(field) ?: continue
          total += (value * quantity) / servingSize
        }
        return total
      }

      val customTotals = LinkedHashMap<String, Double>()
      if (foodEntries != null) {
        for (i in 0 until foodEntries.length()) {
          val entry = foodEntries.optJSONObject(i) ?: continue
          val servingSize = entry.optDoubleOrNull("serving_size") ?: 0.0
          if (servingSize == 0.0) continue
          val quantity = entry.optDoubleOrNull("quantity") ?: 0.0
          val customObj = entry.optJSONObject("custom_nutrients") ?: continue
          val keys = customObj.keys()
          while (keys.hasNext()) {
            val name = keys.next()
            val value = customObj.optDoubleOrNull(name) ?: continue
            customTotals[name] = (customTotals[name] ?: 0.0) + (value * quantity) / servingSize
          }
        }
      }
      val suppCustom = supplementTotals?.optJSONObject("custom_nutrients")
      if (suppCustom != null) {
        val keys = suppCustom.keys()
        while (keys.hasNext()) {
          val name = keys.next()
          val value = suppCustom.optDoubleOrNull(name) ?: continue
          customTotals[name] = (customTotals[name] ?: 0.0) + value
        }
      }

      val customGoals = LinkedHashMap<String, Double>()
      val goalsCustom = goals?.optJSONObject("custom_nutrients")
      if (goalsCustom != null) {
        val keys = goalsCustom.keys()
        while (keys.hasNext()) {
          val name = keys.next()
          val value = goalsCustom.optDoubleOrNull(name) ?: continue
          customGoals[name] = value
        }
      }

      val exerciseItems = mutableListOf<ExerciseSessionItem>()
      var totalExMinutes = 0
      var totalExCalories = 0
      if (exerciseSessions != null) {
        for (i in 0 until exerciseSessions.length()) {
          val s = exerciseSessions.optJSONObject(i) ?: continue
          val isPreset = s.optStringOrNull("type") == "preset"
          val mins: Int
          val cals: Int
          val name: String
          if (isPreset) {
            mins = (s.optDoubleOrNull("total_duration_minutes")
              ?: s.optDoubleOrNull("duration_minutes")
              ?: 0.0).roundToInt().coerceAtLeast(0)
            val childArr = s.optJSONArray("exercises")
            var childCals = 0.0
            if (childArr != null) {
              for (j in 0 until childArr.length()) {
                val child = childArr.optJSONObject(j) ?: continue
                if (child.optBooleanOrNull("calories_counted") == false) continue
                childCals += child.optDoubleOrNull("calories_burned") ?: 0.0
              }
            }
            cals = if (childArr != null) {
              childCals.roundToInt().coerceAtLeast(0)
            } else {
              (s.optDoubleOrNull("calories_burned") ?: 0.0).roundToInt().coerceAtLeast(0)
            }
            name = s.optStringOrNull("name")?.takeIf { it.isNotBlank() }
              ?: s.optStringOrNull("workout_name")?.takeIf { it.isNotBlank() }
              ?: s.optStringOrNull("exercise_name")?.takeIf { it.isNotBlank() }
              ?: "Workout"
          } else {
            mins = (s.optDoubleOrNull("duration_minutes") ?: 0.0).roundToInt().coerceAtLeast(0)
            cals = (s.optDoubleOrNull("calories_burned") ?: 0.0).roundToInt().coerceAtLeast(0)
            name = s.optStringOrNull("exercise_name")?.takeIf { it.isNotBlank() }
              ?: s.optStringOrNull("workout_name")?.takeIf { it.isNotBlank() }
              ?: s.optStringOrNull("name")?.takeIf { it.isNotBlank() }
              ?: "Workout"
          }
          totalExMinutes += mins
          totalExCalories += cals
          exerciseItems.add(ExerciseSessionItem(name = name, durationMinutes = mins, calories = cals))
        }
      }

      val calorieGoal = adjusted?.optDoubleOrNull("calories")
        ?: goals?.optDoubleOrNull("calories")
        ?: calorieBalance?.optDoubleOrNull("goal")
        ?: 0.0
      val caloriesConsumed = calorieBalance?.optDoubleOrNull("eaten")
        ?: (sumFoodField("calories") + (supplementTotals?.optDoubleOrNull("calories") ?: 0.0))
      val caloriesBurned = calorieBalance?.optDoubleOrNull("burned")
        ?: totalExCalories.toDouble()
      val caloriesRemaining = calorieBalance?.optDoubleOrNull("remaining")
        ?: (calorieGoal - caloriesConsumed)
      val totalBudget = caloriesConsumed + caloriesRemaining
      val calorieProgress = if (totalBudget > 0.0) {
        (caloriesConsumed / totalBudget).coerceIn(0.0, 1.0)
      } else {
        (calorieBalance?.optDoubleOrNull("progress")?.div(100.0) ?: 0.0).coerceIn(0.0, 1.0)
      }

      fun buildMacro(key: String): MacroGoal {
        val consumed = sumFoodField(key) + (supplementTotals?.optDoubleOrNull(key) ?: 0.0)
        val goal = adjusted?.optDoubleOrNull(key) ?: goals?.optDoubleOrNull(key) ?: 0.0
        val progress = if (goal > 0.0) (consumed / goal).coerceIn(0.0, 1.0) else 0.0
        return MacroGoal(consumed = consumed, goal = goal, progress = progress)
      }

      val protein = buildMacro("protein")
      val carbs = buildMacro("carbs")
      val fat = buildMacro("fat")

      val rows = existingNutrition?.rows?.takeIf { it.isNotEmpty() }?.map { prevRow ->
        val key = prevRow.key
        val (consumed, goal) = when (key) {
          "protein" -> protein.consumed to protein.goal.takeIf { it > 0.0 }
          "carbs" -> carbs.consumed to carbs.goal.takeIf { it > 0.0 }
          "fat" -> fat.consumed to fat.goal.takeIf { it > 0.0 }
          "fiber", "dietary_fiber" -> {
            val c = sumFoodField("dietary_fiber") + (supplementTotals?.optDoubleOrNull("dietary_fiber") ?: 0.0)
            val g = goals?.optDoubleOrNull("dietary_fiber")?.takeIf { it > 0.0 }
            c to g
          }
          else -> {
            if (customGoals.containsKey(key) || customTotals.containsKey(key)) {
              (customTotals[key] ?: 0.0) to customGoals[key]?.takeIf { it > 0.0 }
            } else {
              val c = sumFoodField(key) + (supplementTotals?.optDoubleOrNull(key) ?: 0.0)
              val g = (adjusted?.optDoubleOrNull(key) ?: goals?.optDoubleOrNull(key))?.takeIf { it > 0.0 }
              c to g
            }
          }
        }
        val progress = if (goal != null && goal > 0.0) (consumed / goal).coerceIn(0.0, 1.0) else 0.0
        prevRow.copy(
          consumed = consumed,
          goal = goal,
          progress = progress
        )
      }

      val nutrition = NutritionSnapshot(
        day = today,
        caloriesConsumed = caloriesConsumed,
        caloriesBurned = caloriesBurned,
        caloriesRemaining = caloriesRemaining,
        calorieProgress = calorieProgress,
        carbs = carbs,
        fat = fat,
        protein = protein,
        rows = rows
      )
      val waterGoalMl = (adjusted?.optDoubleOrNull("water_goal_ml") ?: goals?.optDoubleOrNull("water_goal_ml"))
        ?.takeIf { it > 0.0 }
      val waterFromFoodMl = if (includeFoodWater) {
        waterBreakdown?.optDoubleOrNull("food_ml")?.takeIf { it > 0.0 }
      } else {
        null
      }
      val exerciseSummary = ExerciseSummarySnapshot(
        day = today,
        minutes = totalExMinutes,
        minutesGoal = goals?.optIntOrNull("target_exercise_duration_minutes") ?: 0,
        calories = totalExCalories,
        caloriesGoal = goals?.optIntOrNull("target_exercise_calories_burned") ?: 0,
        sessionCount = exerciseItems.size,
        sessions = exerciseItems
      )
      val stepGoal = goals?.optIntOrNull("target_steps")?.takeIf { it > 0 }
      ParsedDailySummary(
        nutrition = nutrition,
        waterGoalMl = waterGoalMl,
        waterFromFoodMl = waterFromFoodMl,
        exerciseSummary = exerciseSummary,
        stepGoal = stepGoal
      )
    } catch (_: Throwable) {
      null
    }
  }

  internal fun resolveWaterIntakeConfirmation(
    clientId: String,
    waterMl: Double?,
    waterLog: List<WaterLogEntry>?
  ): Pair<String?, String?> {
    if (clientId.isEmpty()) return null to null
    return when {
      waterMl != null -> clientId to null
      waterLog != null -> null to clientId
      else -> null to null
    }
  }

  internal fun resolveCreatedWaterEntryId(
    postResponseBody: String?,
    clientId: String? = null,
    postWaterLogRaw: String? = null
  ): String? {
    if (!postResponseBody.isNullOrBlank()) {
      try {
        val obj = JSONObject(postResponseBody)
        val nestedEntry = obj.optJSONObject("entry")
        val explicitId = obj.optStringOrNull("log_entry_id")?.takeIf { it.isNotBlank() }
          ?: obj.optStringOrNull("water_intake_entry_id")?.takeIf { it.isNotBlank() }
          ?: obj.optStringOrNull("entry_id")?.takeIf { it.isNotBlank() }
          ?: nestedEntry?.opt("id")?.takeIf { it != JSONObject.NULL }?.toString()?.trim()?.takeIf { it.isNotBlank() }
        if (explicitId != null) return explicitId
      } catch (_: Throwable) {}
    }
    val cleanClientId = clientId?.trim().orEmpty()
    if (cleanClientId.isNotEmpty() && !postWaterLogRaw.isNullOrBlank()) {
      try {
        val arr = JSONArray(postWaterLogRaw)
        for (i in 0 until arr.length()) {
          val row = arr.optJSONObject(i) ?: continue
          val rowClientId = row.optStringOrNull("client_id")?.trim()
            ?: row.optStringOrNull("clientId")?.trim()
          if (rowClientId == cleanClientId) {
            val rowId = row.opt("id")?.takeIf { it != JSONObject.NULL }?.toString()?.trim()?.takeIf { it.isNotBlank() }
            if (rowId != null) return rowId
          }
        }
      } catch (_: Throwable) {}
    }
    return null
  }

  fun executeOutbound(
    context: Context,
    payload: JSONObject,
    timeFormat: String? = null,
    isAccountActive: () -> Boolean = { true }
  ): DirectWriteOutcome {
    val type = payload.optString("type", "")
    val ownerId = payload.optString("ownerId", "").takeIf { it.isNotEmpty() }
    val creds = WearServerCredentialsStore.load(context, expectedOwnerId = ownerId)
      ?: return DirectWriteOutcome.FallbackToPhone
    if (!WearServerCredentialsStore.admitDirectRequest(context, creds, isAccountActive)) {
      return DirectWriteOutcome.FallbackToPhone
    }

    return when (type) {
      "medicationTaken" -> executeMedicationTaken(context, creds, payload, isAccountActive)
      "waterIntake" -> executeWaterIntake(context, creds, payload, timeFormat, isAccountActive)
      "waterDelete" -> executeWaterDelete(context, creds, payload, timeFormat, isAccountActive)
      "checkIn" -> executeCheckIn(context, creds, payload, isAccountActive)
      "fastStart" -> executeFastStart(context, creds, payload, isAccountActive)
      "fastEnd" -> executeFastEnd(context, creds, payload, isAccountActive)
      else -> DirectWriteOutcome.FallbackToPhone
    }
  }

  private fun executeMedicationTaken(
    context: Context,
    creds: WearServerCredentials,
    payload: JSONObject,
    isAccountActive: () -> Boolean
  ): DirectWriteOutcome {
    val entryDate = payload.optString("entryDate", "")
    val medicationId = payload.optString("medicationId", "")
    val scheduleId = payload.optString("scheduleId", "")
    val taken = payload.optBoolean("taken", true)
    val skipped = payload.optBoolean("skipped", false)
    if (entryDate.isBlank() || medicationId.isBlank()) {
      return DirectWriteOutcome.FallbackToPhone
    }

    val listPath =
      "/api/v2/medications/entries?fromDate=${urlEncode(entryDate)}&toDate=${urlEncode(entryDate)}&medicationId=${urlEncode(medicationId)}"
    val listRes = request(creds, "GET", listPath)
    if (!listRes.isSuccess || listRes.body.isNullOrBlank()) {
      return if (listRes.isValidationFailure) {
        DirectWriteOutcome.Rejected(listRes.status)
      } else {
        DirectWriteOutcome.FallbackToPhone
      }
    }
    val existingEntries = try {
      JSONArray(listRes.body)
    } catch (_: Throwable) {
      return DirectWriteOutcome.FallbackToPhone
    }

    val allowLegacy = if (scheduleId.isEmpty()) {
      true
    } else {
      val exactExists = findMatchingMedicationEntry(
        entries = existingEntries,
        medicationId = medicationId,
        scheduleId = scheduleId,
        allowLegacyUnscheduledFallback = false
      ) != null
      val legacyExists = !exactExists && findMatchingMedicationEntry(
        entries = existingEntries,
        medicationId = medicationId,
        scheduleId = scheduleId,
        allowLegacyUnscheduledFallback = true
      ) != null
      if (!legacyExists) {
        false
      } else {
        if (!WearServerCredentialsStore.admitDirectRequest(context, creds, isAccountActive)) {
          return DirectWriteOutcome.FallbackToPhone
        }
        val medsRes = request(creds, "GET", "/api/v2/medications?activeOnly=true")
        when (
          resolveLegacyMedicationFallback(
            medsGetSucceeded = medsRes.isSuccess,
            medicationsBody = medsRes.body,
            medicationId = medicationId,
            scheduleId = scheduleId,
            entryDate = entryDate
          )
        ) {
          LegacyMedicationLookupResolution.ALLOW_LEGACY -> true
          LegacyMedicationLookupResolution.DISALLOW_LEGACY -> false
          LegacyMedicationLookupResolution.FALLBACK_TO_PHONE -> return DirectWriteOutcome.FallbackToPhone
        }
      }
    }

    val decision = decideMedicationWrite(
      medicationId = medicationId,
      scheduleId = scheduleId,
      taken = taken,
      skipped = skipped,
      entries = existingEntries,
      allowLegacyUnscheduledFallback = allowLegacy
    )
    if (
      decision !is MedicationWriteDecision.None &&
      !WearServerCredentialsStore.admitDirectRequest(context, creds, isAccountActive)
    ) {
      return DirectWriteOutcome.FallbackToPhone
    }
    val nowIso = ContextPayloadMapper.formatIso(System.currentTimeMillis())
    val writeRes = when (decision) {
      MedicationWriteDecision.None -> HttpResult(200, "{}")
      is MedicationWriteDecision.Delete ->
        request(creds, "DELETE", "/api/v2/medications/entries/${Uri.encode(decision.entryId)}")
      is MedicationWriteDecision.Update -> {
        val body = JSONObject().apply {
          if (scheduleId.isNotEmpty()) put("schedule_id", scheduleId)
          put("status", decision.status)
          if (decision.status != "skipped") put("taken_at", nowIso)
        }
        request(creds, "PUT", "/api/v2/medications/entries/${Uri.encode(decision.entryId)}", body)
      }
      is MedicationWriteDecision.Create -> {
        val body = JSONObject().apply {
          put("medication_id", medicationId)
          if (scheduleId.isNotEmpty()) put("schedule_id", scheduleId)
          put("status", decision.status)
          put("entry_date", entryDate)
          if (decision.status != "skipped") put("taken_at", nowIso)
        }
        request(creds, "POST", "/api/v2/medications/entries", body)
      }
    }
    val okOrAlreadyDeleted =
      writeRes.isSuccess || (decision is MedicationWriteDecision.Delete && writeRes.status == 404)
    if (!okOrAlreadyDeleted) {
      return if (writeRes.isValidationFailure) {
        DirectWriteOutcome.Rejected(writeRes.status)
      } else {
        DirectWriteOutcome.FallbackToPhone
      }
    }

    val doseId = "$medicationId:$scheduleId"
    val nextStatus = when {
      skipped && scheduleId.isNotEmpty() -> MedicationDoseStatus.SKIPPED
      taken -> MedicationDoseStatus.TAKEN
      else -> MedicationDoseStatus.PENDING
    }
    return DirectWriteOutcome.Applied(
      syncedDomain = "medications",
      entryDate = entryDate,
      medicationDoseId = doseId,
      medicationStatus = nextStatus
    )
  }

  internal fun isWaterIntakeDateExpired(entryDate: String, today: String): Boolean =
    entryDate.isNotBlank() && today.isNotBlank() && entryDate != today

  private fun executeWaterIntake(
    context: Context,
    creds: WearServerCredentials,
    payload: JSONObject,
    timeFormat: String? = null,
    isAccountActive: () -> Boolean
  ): DirectWriteOutcome {
    val clientId = payload.optString("clientId", "")
    val entryDate = payload.optString("entryDate", "")
    val containerId = payload.optInt("containerId", 0)
    if (entryDate.isBlank() || containerId <= 0) return DirectWriteOutcome.FallbackToPhone
    if (isWaterIntakeDateExpired(entryDate, CheckInDate.today())) {
      return DirectWriteOutcome.Rejected(400)
    }
    if (!WearServerCredentialsStore.admitDirectRequest(context, creds, isAccountActive)) {
      return DirectWriteOutcome.FallbackToPhone
    }

    val body = JSONObject().apply {
      put("entry_date", entryDate)
      put("change_drinks", 1)
      put("container_id", containerId)
      if (clientId.isNotEmpty()) put("client_id", clientId)
    }
    val res = request(creds, "POST", "/api/measurements/water-intake", body)
    if (!res.isSuccess) {
      return if (res.isValidationFailure) {
        DirectWriteOutcome.Rejected(res.status)
      } else {
        DirectWriteOutcome.FallbackToPhone
      }
    }
    var waterMl = try {
      res.body?.let { JSONObject(it).optDoubleOrNull("water_ml") }
    } catch (_: Throwable) {
      null
    }
    if (waterMl == null && WearServerCredentialsStore.admitDirectRequest(context, creds, isAccountActive)) {
      val totalRes = request(creds, "GET", "/api/measurements/water-intake/${urlEncode(entryDate)}")
      if (totalRes.isSuccess) {
        waterMl = try {
          totalRes.body?.let { JSONObject(it).optDoubleOrNull("water_ml") }
        } catch (_: Throwable) {
          null
        }
      }
    }
    val logRaw = if (WearServerCredentialsStore.admitDirectRequest(context, creds, isAccountActive)) {
      val logRes = request(creds, "GET", "/api/v2/measurements/water-intake/${urlEncode(entryDate)}/log")
      if (logRes.isSuccess) logRes.body else null
    } else {
      null
    }
    val waterLog = if (logRaw != null) parseWaterLogJson(logRaw, timeFormat) else null
    val createdEntryId = resolveCreatedWaterEntryId(res.body, clientId, logRaw)
    val (confirmedTapId, logConfirmedTapId) = resolveWaterIntakeConfirmation(clientId, waterMl, waterLog)
    return DirectWriteOutcome.Applied(
      syncedDomain = "water",
      entryDate = entryDate,
      waterMl = waterMl,
      waterLog = waterLog,
      confirmedWaterTapId = confirmedTapId,
      logConfirmedWaterTapId = logConfirmedTapId,
      createdWaterEntryId = createdEntryId
    )
  }

  private fun executeWaterDelete(
    context: Context,
    creds: WearServerCredentials,
    payload: JSONObject,
    timeFormat: String? = null,
    isAccountActive: () -> Boolean
  ): DirectWriteOutcome {
    val entryId = payload.optString("entryId", "")
    if (entryId.isBlank()) return DirectWriteOutcome.FallbackToPhone
    if (!WearServerCredentialsStore.admitDirectRequest(context, creds, isAccountActive)) {
      return DirectWriteOutcome.FallbackToPhone
    }
    val res = request(
      creds,
      "DELETE",
      "/api/v2/measurements/water-intake/log/${Uri.encode(entryId)}"
    )
    if (!res.isSuccess && res.status != 404) {
      return if (res.isValidationFailure) {
        DirectWriteOutcome.Rejected(res.status)
      } else {
        DirectWriteOutcome.FallbackToPhone
      }
    }
    val today = CheckInDate.today()
    val waterMl = if (WearServerCredentialsStore.admitDirectRequest(context, creds, isAccountActive)) {
      val totalRes = request(creds, "GET", "/api/measurements/water-intake/${urlEncode(today)}")
      try {
        if (totalRes.isSuccess) totalRes.body?.let { JSONObject(it).optDoubleOrNull("water_ml") } else null
      } catch (_: Throwable) {
        null
      }
    } else {
      null
    }
    val waterLog = if (WearServerCredentialsStore.admitDirectRequest(context, creds, isAccountActive)) {
      val logRes = request(creds, "GET", "/api/v2/measurements/water-intake/${urlEncode(today)}/log")
      if (logRes.isSuccess) parseWaterLogJson(logRes.body, timeFormat) else null
    } else {
      null
    }
    return DirectWriteOutcome.Applied(
      syncedDomain = "water",
      entryDate = today,
      waterMl = waterMl,
      waterLog = waterLog,
      deletedWaterEntryId = entryId
    )
  }

  private fun executeCheckIn(
    context: Context,
    creds: WearServerCredentials,
    payload: JSONObject,
    isAccountActive: () -> Boolean
  ): DirectWriteOutcome {
    val entryDate = payload.optString("entryDate", "")
    val weightKg = payload.optDoubleOrNull("weightKg") ?: return DirectWriteOutcome.FallbackToPhone
    val bodyFat = payload.optDoubleOrNull("bodyFatPercentage")
    if (entryDate.isBlank() || weightKg <= 0.0) return DirectWriteOutcome.FallbackToPhone
    if (!WearServerCredentialsStore.admitDirectRequest(context, creds, isAccountActive)) {
      return DirectWriteOutcome.FallbackToPhone
    }

    val body = JSONObject().apply {
      put("entry_date", entryDate)
      put("weight", weightKg)
      if (bodyFat != null) put("body_fat_percentage", bodyFat)
    }
    val res = request(creds, "POST", "/api/measurements/check-in", body)
    return when {
      res.isSuccess -> DirectWriteOutcome.Applied(
        syncedDomain = "checkIn",
        entryDate = entryDate,
        weightKg = weightKg,
        bodyFatPercentage = bodyFat
      )
      res.isValidationFailure -> DirectWriteOutcome.Rejected(res.status)
      else -> DirectWriteOutcome.FallbackToPhone
    }
  }

  internal fun buildFastStartRequestBody(
    startMs: Long,
    targetMs: Long,
    fastingType: String,
    clientId: String
  ): JSONObject = JSONObject()
    .put("start_time", ContextPayloadMapper.formatIso(startMs))
    .put("target_end_time", ContextPayloadMapper.formatIso(targetMs))
    .put("fasting_type", fastingType)
    .apply {
      val cleanId = clientId.trim()
      if (isValidUuid(cleanId)) {
        put("client_id", cleanId)
      }
    }

  internal fun isMatchingFastJsonForStart(
    fastObj: JSONObject,
    clientId: String,
    requestedStartedAtMs: Long?
  ): Boolean {
    val cleanClientId = clientId.trim()
    if (fastObj.has("client_id")) {
      val rowClientId = if (!fastObj.isNull("client_id")) {
        fastObj.optString("client_id", "").trim()
      } else {
        ""
      }
      if (cleanClientId.isNotEmpty() && isValidUuid(cleanClientId)) {
        return rowClientId.isNotEmpty() && rowClientId.equals(cleanClientId, ignoreCase = true)
      }
      if (rowClientId.isNotEmpty()) {
        return cleanClientId.isNotEmpty() && rowClientId.equals(cleanClientId, ignoreCase = true)
      }
    }
    if (requestedStartedAtMs == null || requestedStartedAtMs <= 0L) return false
    val startTime = fastObj.optStringOrNull("start_time") ?: return false
    val serverStartMs = ContextPayloadMapper.parseIsoMs(startTime) ?: return false
    return kotlin.math.abs(serverStartMs - requestedStartedAtMs) <= 1_000L
  }

  internal fun resolveFastStartOutcome(
    startResBody: String?,
    clientId: String = "",
    requestedStartedAtMs: Long? = null,
    fetchLatestCurrent: () -> String?
  ): DirectWriteOutcome {
    val isTerminalReplay = isCompletedFastJson(startResBody)
    if (!isTerminalReplay) {
      val (fast, known) = parseFastJson(startResBody)
      if (known && fast != null) {
        return DirectWriteOutcome.Applied(
          syncedDomain = "fasting",
          fast = fast,
          fastUpdated = true,
          fastStartOutcome = "confirmed"
        )
      }
    }
    val latestBody = fetchLatestCurrent()
    if (!latestBody.isNullOrBlank()) {
      val (latestFast, known) = parseFastJson(latestBody)
      if (known) {
        val latestOutcome = when {
          isTerminalReplay || latestFast == null -> "terminal"
          else -> {
            val latestObj = try {
              JSONObject(latestBody.trim())
            } catch (_: Throwable) {
              null
            }
            if (latestObj != null && isMatchingFastJsonForStart(latestObj, clientId, requestedStartedAtMs)) {
              "confirmed"
            } else {
              "superseded"
            }
          }
        }
        return DirectWriteOutcome.Applied(
          syncedDomain = "fasting",
          fast = latestFast,
          fastUpdated = true,
          fastStartOutcome = latestOutcome
        )
      }
    }
    return DirectWriteOutcome.FallbackToPhone
  }

  internal fun executeFastStart(
    context: Context,
    creds: WearServerCredentials,
    payload: JSONObject,
    isAccountActive: () -> Boolean
  ): DirectWriteOutcome {
    val presetId = payload.optString("presetId", "").trim()
    val (fastingType, hours) = fastingPresetSpec(presetId)
      ?: return DirectWriteOutcome.Rejected(400)
    val clientId = payload.optString("clientId", "").trim()
    val requestedStartMs = payload.optLong("startedAt", 0L).takeIf { it > 0L }
    val curRes = request(creds, "GET", "/api/fasting/current")
    if (!curRes.isSuccess) return DirectWriteOutcome.FallbackToPhone
    val curBody = curRes.body ?: return DirectWriteOutcome.FallbackToPhone
    val curTrimmed = curBody.trim()
    if (curTrimmed.isEmpty()) return DirectWriteOutcome.FallbackToPhone
    val manualCurrentObj: JSONObject? = if (curTrimmed == "null") {
      null
    } else {
      try {
        val curObj = JSONObject(curTrimmed)
        if (curObj.optBoolean("is_auto_calculated", false)) null else curObj
      } catch (_: Throwable) {
        return DirectWriteOutcome.FallbackToPhone
      }
    }
    if (manualCurrentObj == null) {
      if (!WearServerCredentialsStore.admitDirectRequest(context, creds, isAccountActive)) {
        return DirectWriteOutcome.FallbackToPhone
      }
      val startMs = requestedStartMs ?: System.currentTimeMillis()
      val targetMs = startMs + (hours * 3_600_000.0).toLong()
      val body = buildFastStartRequestBody(startMs, targetMs, fastingType, clientId)
      val startRes = request(creds, "POST", "/api/fasting/start", body)
      if (!startRes.isSuccess) {
        return if (startRes.isValidationFailure) {
          DirectWriteOutcome.Rejected(startRes.status)
        } else {
          DirectWriteOutcome.FallbackToPhone
        }
      }
      return resolveFastStartOutcome(
        startResBody = startRes.body,
        clientId = clientId,
        requestedStartedAtMs = startMs
      ) {
        if (WearServerCredentialsStore.admitDirectRequest(context, creds, isAccountActive)) {
          request(creds, "GET", "/api/fasting/current").takeIf { it.isSuccess }?.body
        } else {
          null
        }
      }
    }
    val (existingFast, existingKnown) = parseFastJson(curBody)
    if (!existingKnown) return DirectWriteOutcome.FallbackToPhone
    val existingOutcome = if (
      existingFast != null &&
      isMatchingFastJsonForStart(manualCurrentObj, clientId, requestedStartMs)
    ) {
      "confirmed"
    } else {
      "superseded"
    }
    return DirectWriteOutcome.Applied(
      syncedDomain = "fasting",
      fast = existingFast,
      fastUpdated = true,
      fastStartOutcome = existingOutcome
    )
  }

  internal fun shouldSkipReplayFastEnd(
    expectedFastId: String?,
    expectedStartedAtMs: Long = 0L,
    endedAtMs: Long = 0L,
    serverFastId: String?,
    serverStartedAtMs: Long?
  ): Boolean {
    val cleanExpectedId = expectedFastId?.trim().orEmpty()
    if (cleanExpectedId.isNotEmpty()) {
      return serverFastId != cleanExpectedId
    }
    if (expectedStartedAtMs <= 0L || serverStartedAtMs == null) {
      return true
    }
    if (endedAtMs > 0L && serverStartedAtMs > endedAtMs) {
      return true
    }
    return kotlin.math.abs(serverStartedAtMs - expectedStartedAtMs) > 1_000L
  }

  internal fun resolveClampedFastEndMs(rawEndMs: Long, serverStartMs: Long?): Long =
    if (serverStartMs != null && rawEndMs < serverStartMs) serverStartMs else rawEndMs

  internal fun resolveFastEndNonManualOutcome(curBody: String): DirectWriteOutcome {
    val trimmed = curBody.trim()
    if (trimmed.isEmpty()) return DirectWriteOutcome.FallbackToPhone
    if (trimmed == "null") {
      return DirectWriteOutcome.Applied(syncedDomain = "fasting", fast = null, fastUpdated = true)
    }
    val (parsedFast, fastKnown) = parseFastJson(trimmed)
    if (!fastKnown) {
      return DirectWriteOutcome.FallbackToPhone
    }
    return DirectWriteOutcome.Applied(
      syncedDomain = "fasting",
      fast = parsedFast,
      fastUpdated = true
    )
  }

  private fun executeFastEnd(
    context: Context,
    creds: WearServerCredentials,
    payload: JSONObject,
    isAccountActive: () -> Boolean
  ): DirectWriteOutcome {
    val expectedFastId = payload.optStringOrNull("fastId")?.trim()
    val expectedStartedAtMs = payload.optDoubleOrNull("startedAt")?.toLong() ?: payload.optLong("startedAt", 0L)
    val endedAtMs = payload.optDoubleOrNull("endedAt")?.toLong() ?: payload.optLong("endedAt", 0L)
    val curRes = request(creds, "GET", "/api/fasting/current")
    if (!curRes.isSuccess) return DirectWriteOutcome.FallbackToPhone
    val curBody = curRes.body ?: return DirectWriteOutcome.FallbackToPhone
    val curTrimmed = curBody.trim()
    if (curTrimmed.isEmpty()) return DirectWriteOutcome.FallbackToPhone
    if (curTrimmed == "null") {
      return resolveFastEndNonManualOutcome(curBody)
    }
    val curObj = try {
      JSONObject(curTrimmed)
    } catch (_: Throwable) {
      return DirectWriteOutcome.FallbackToPhone
    }
    if (curObj.optBoolean("is_auto_calculated", false)) {
      return resolveFastEndNonManualOutcome(curBody)
    }
    val id = curObj.optStringOrNull("id")?.takeIf { it.isNotEmpty() }
      ?: return DirectWriteOutcome.FallbackToPhone
    val startTime = curObj.optStringOrNull("start_time")?.takeIf { it.isNotEmpty() }
      ?: return DirectWriteOutcome.FallbackToPhone
    val serverStartMs = ContextPayloadMapper.parseIsoMs(startTime)
    if (
      shouldSkipReplayFastEnd(
        expectedFastId = expectedFastId,
        expectedStartedAtMs = expectedStartedAtMs,
        endedAtMs = endedAtMs,
        serverFastId = id,
        serverStartedAtMs = serverStartMs
      )
    ) {
      val (existingFast, _) = parseFastJson(curBody)
      return DirectWriteOutcome.Applied(
        syncedDomain = "fasting",
        fast = existingFast,
        fastUpdated = true
      )
    }
    if (!WearServerCredentialsStore.admitDirectRequest(context, creds, isAccountActive)) {
      return DirectWriteOutcome.FallbackToPhone
    }
    val rawEndMs = if (endedAtMs > 0L) endedAtMs else System.currentTimeMillis()
    val endInstantMs = resolveClampedFastEndMs(rawEndMs, serverStartMs)
    val body = JSONObject()
      .put("id", id)
      .put("start_time", startTime)
      .put("end_time", ContextPayloadMapper.formatIso(endInstantMs))
    val endRes = request(creds, "POST", "/api/fasting/end", body)
    if (!endRes.isSuccess) {
      return if (endRes.isValidationFailure) {
        DirectWriteOutcome.Rejected(endRes.status)
      } else {
        DirectWriteOutcome.FallbackToPhone
      }
    }
    return DirectWriteOutcome.Applied(
      syncedDomain = "fasting",
      fast = null,
      fastUpdated = true
    )
  }

  internal fun buildWorkoutPlanFromSessionAndOptionalPreset(
    sessionBody: String,
    presetBody: String?,
    fallbackSessionId: String,
    defaultWorkoutName: String = "Workout",
    defaultExerciseName: String = "Exercise"
  ): ActiveWorkoutPlan? {
    return try {
      val sessionObj = JSONObject(sessionBody)
      val presetObj = if (!presetBody.isNullOrBlank()) {
        try {
          JSONObject(presetBody)
        } catch (_: Throwable) {
          null
        }
      } else {
        null
      }
      val presetName = presetObj?.optStringOrNull("name")?.takeIf { it.isNotBlank() } ?: defaultWorkoutName
      val workoutFormat = sessionObj.optStringOrNull("workout_format")?.takeIf { it.isNotBlank() }
        ?: presetObj?.optStringOrNull("workout_format")?.takeIf { it.isNotBlank() }
        ?: "standard"
      val timeCapSec = sessionObj.optIntOrNull("time_cap_seconds")
        ?: presetObj?.optIntOrNull("time_cap_seconds")
      val plannedSetsByExOccurrence = HashMap<Pair<String, Int>, Map<Int, JSONObject>>()
      if (presetObj != null) {
        val presetExArr = presetObj.optJSONArray("exercises") ?: JSONArray()
        val presetExCounts = HashMap<String, Int>()
        for (i in 0 until presetExArr.length()) {
          val pEx = presetExArr.optJSONObject(i) ?: continue
          val pSnap = pEx.optJSONObject("exercise_snapshot")
          val pExId = (
            pEx.optStringOrNull("exercise_id")?.takeIf { it.isNotBlank() }
              ?: pSnap?.optStringOrNull("id")?.takeIf { it.isNotBlank() }
            )?.trim().orEmpty()
          if (pExId.isEmpty()) continue
          val occ = presetExCounts.getOrDefault(pExId, 0)
          presetExCounts[pExId] = occ + 1
          val pSets = pEx.optJSONArray("sets") ?: JSONArray()
          val setsByNumber = HashMap<Int, JSONObject>()
          for (sIdx in 0 until pSets.length()) {
            val ps = pSets.optJSONObject(sIdx) ?: continue
            val setNum = ps.optIntOrNull("set_number") ?: (sIdx + 1)
            if (!setsByNumber.containsKey(setNum)) {
              setsByNumber[setNum] = ps
            }
          }
          plannedSetsByExOccurrence[pExId to occ] = setsByNumber
        }
      }

      val sessionId = sessionObj.optString("id", "").ifEmpty { fallbackSessionId }
      val sessionExercises = sessionObj.optJSONArray("exercises") ?: JSONArray()

      data class BuiltExercise(
        val supersetGroup: Int?,
        val setsJson: List<JSONObject>,
        val exJson: JSONObject
      )
      val built = mutableListOf<BuiltExercise>()
      val sessionExCounts = HashMap<String, Int>()

      for (i in 0 until sessionExercises.length()) {
        val sEx = sessionExercises.optJSONObject(i) ?: continue
        val entryId = sEx.optString("id", "")
        val snap = sEx.optJSONObject("exercise_snapshot")
        val exName = snap?.optString("name")?.takeIf { it.isNotBlank() }
          ?: sEx.optStringOrNull("exercise_name")?.takeIf { it.isNotBlank() }
          ?: defaultExerciseName
        val modality = snap?.optString("modality") ?: ""
        val isBodyweight = modality == "bodyweight_reps"
        val isTimed = modality == "duration" || modality == "duration_distance" || modality == "weight_duration"
        val isCarry = modality == "weight_distance"
        val isWeightedTimed = modality == "weight_duration"
        val supersetGroup = sEx.optIntOrNull("superset_group")

        val sExId = (
          sEx.optStringOrNull("exercise_id")?.takeIf { it.isNotBlank() }
            ?: snap?.optStringOrNull("id")?.takeIf { it.isNotBlank() }
          )?.trim()
        val plannedSetsByNumber = if (!sExId.isNullOrEmpty()) {
          val occ = sessionExCounts.getOrDefault(sExId, 0)
          sessionExCounts[sExId] = occ + 1
          plannedSetsByExOccurrence[sExId to occ].orEmpty()
        } else {
          emptyMap()
        }

        val sSets = sEx.optJSONArray("sets") ?: JSONArray()
        val watchSets = mutableListOf<JSONObject>()

        for (sIdx in 0 until sSets.length()) {
          val ss = sSets.optJSONObject(sIdx) ?: continue
          val setId = ss.opt("id")?.takeIf { it != JSONObject.NULL }?.toString()?.takeIf { it.isNotBlank() }
            ?: continue
          val setNum = ss.optIntOrNull("set_number") ?: (sIdx + 1)
          val planned = plannedSetsByNumber[setNum]
          val restSeconds = ss.optIntOrNull("rest_time") ?: planned?.optIntOrNull("rest_time") ?: 0
          val setObj = JSONObject().apply {
            put("setId", setId)
            (ss.optDoubleOrNull("reps") ?: planned?.optDoubleOrNull("reps"))?.let { put("targetReps", it) }
            (ss.optDoubleOrNull("weight") ?: planned?.optDoubleOrNull("weight"))?.let { put("targetWeightKg", it) }
            (ss.optIntOrNull("duration") ?: planned?.optIntOrNull("duration"))?.let { put("targetDurationSec", it) }
            (ss.optDoubleOrNull("distance") ?: planned?.optDoubleOrNull("distance"))?.let { put("targetDistanceKm", it) }
            put("restSeconds", restSeconds)
            put("restAfterSeconds", restSeconds)
            put("setType", ss.optStringOrNull("set_type")?.takeIf { it.isNotBlank() } ?: planned?.optStringOrNull("set_type")?.takeIf { it.isNotBlank() } ?: "normal")
            if (isTimed) put("timed", true)
            if (isCarry) put("carry", true)
            if (isWeightedTimed) put("weighted", true)
          }
          watchSets.add(setObj)
        }
        if (watchSets.isEmpty()) continue

        val exObj = JSONObject().apply {
          put("exerciseEntryId", entryId)
          put("name", exName)
          put("bodyweight", isBodyweight)
          snap?.optJSONArray("equipment")?.optString(0)?.takeIf { it.isNotBlank() }?.let {
            put("equipment", it)
          }
          snap?.optJSONArray("primary_muscles")?.optString(0)?.takeIf { it.isNotBlank() }?.let {
            put("muscle", it)
          }
        }
        built.add(BuiltExercise(supersetGroup, watchSets, exObj))
      }

      val setOrder = JSONArray()
      var nextSupersetRun = 0
      var idx = 0
      while (idx < built.size) {
        val current = built[idx]
        val group = current.supersetGroup
        if (group != null) {
          var end = idx + 1
          while (end < built.size && built[end].supersetGroup == group) end += 1
          if (end - idx >= 2) {
            val runIdx = nextSupersetRun++
            val members = built.subList(idx, end)
            for (m in members) m.exJson.put("supersetRun", runIdx)
            val roundCount = members.maxOfOrNull { it.setsJson.size } ?: 0
            for (round in 0 until roundCount) {
              val groupRest = members[0].setsJson.getOrNull(round)?.optInt("restAfterSeconds", 90) ?: 90
              var firstInRound = true
              for (m in members) {
                val sObj = m.setsJson.getOrNull(round) ?: continue
                val isDrop = sObj.optString("setType").equals("drop", ignoreCase = true)
                sObj.put("restSeconds", if (isDrop) 0 else if (firstInRound) groupRest else 0)
                firstInRound = false
                setOrder.put(sObj.optString("setId"))
              }
            }
            idx = end
            continue
          }
        }
        for (sObj in current.setsJson) {
          val ownRest = sObj.optInt("restAfterSeconds", 0)
          val isDrop = sObj.optString("setType").equals("drop", ignoreCase = true)
          sObj.put("restSeconds", if (isDrop) 0 else ownRest)
          setOrder.put(sObj.optString("setId"))
        }
        idx += 1
      }

      if (built.isEmpty() || setOrder.length() == 0) return null

      val exercisesArr = JSONArray()
      for (b in built) {
        b.exJson.put("sets", JSONArray(b.setsJson))
        exercisesArr.put(b.exJson)
      }
      val nowIso = ContextPayloadMapper.formatIso(System.currentTimeMillis())
      val workoutName = sessionObj.optStringOrNull("name")?.takeIf { it.isNotBlank() } ?: presetName
      val planJson = JSONObject().apply {
        put("type", "workoutStart")
        put("sessionId", sessionId)
        put("workoutName", workoutName)
        put("exercises", exercisesArr)
        put("setOrder", setOrder)
        put("workoutFormat", workoutFormat)
        put("startedAt", nowIso)
        put("armedAt", nowIso)
        put("fromPreset", true)
        if (timeCapSec != null) put("timeCapSeconds", timeCapSec)
      }
      ContextPayloadMapper.parseWorkoutPlan(planJson, allowEmpty = false)
    } catch (_: Throwable) {
      null
    }
  }

  internal fun resolvePresetSetNumber(ps: JSONObject, index: Int): Int =
    ps.optIntOrNull("set_number")?.takeIf { it > 0 } ?: (index + 1)

  internal fun sessionNeedsPresetTargets(sessionBody: String): Boolean {
    return try {
      val sessionObj = JSONObject(sessionBody)
      val exercises = sessionObj.optJSONArray("exercises") ?: return true
      if (exercises.length() == 0) return true
      var sawAnySet = false
      for (i in 0 until exercises.length()) {
        val ex = exercises.optJSONObject(i) ?: continue
        val sets = ex.optJSONArray("sets") ?: continue
        for (sIdx in 0 until sets.length()) {
          val s = sets.optJSONObject(sIdx) ?: continue
          sawAnySet = true
          val hasTarget = s.optDoubleOrNull("reps") != null ||
            s.optDoubleOrNull("weight") != null ||
            s.optIntOrNull("duration") != null ||
            s.optDoubleOrNull("distance") != null
          if (!hasTarget) return true
        }
      }
      !sawAnySet
    } catch (_: Throwable) {
      true
    }
  }

  internal fun planHasAllSetTargets(
    plan: ActiveWorkoutPlan,
    sessionObj: JSONObject? = null,
    presetObj: JSONObject? = null
  ): Boolean {
    if (plan.exercises.isEmpty()) return false
    if (sessionObj == null || presetObj == null) {
      var sawSet = false
      for (ex in plan.exercises) {
        for (set in ex.sets) {
          sawSet = true
          val hasTarget = set.targetReps != null ||
            set.targetWeightKg != null ||
            set.targetDurationSec != null ||
            set.targetDistanceKm != null
          if (!hasTarget) return false
        }
      }
      return sawSet
    }
    val plannedSetsByExOccurrence = HashMap<Pair<String, Int>, Map<Int, JSONObject>>()
    val presetExArr = presetObj.optJSONArray("exercises") ?: JSONArray()
    val presetExCounts = HashMap<String, Int>()
    for (i in 0 until presetExArr.length()) {
      val pEx = presetExArr.optJSONObject(i) ?: continue
      val pSnap = pEx.optJSONObject("exercise_snapshot")
      val pExId = (
        pEx.optStringOrNull("exercise_id")?.takeIf { it.isNotBlank() }
          ?: pSnap?.optStringOrNull("id")?.takeIf { it.isNotBlank() }
        )?.trim().orEmpty()
      if (pExId.isEmpty()) continue
      val occ = presetExCounts.getOrDefault(pExId, 0)
      presetExCounts[pExId] = occ + 1
      val pSets = pEx.optJSONArray("sets") ?: JSONArray()
      val setsByNumber = HashMap<Int, JSONObject>()
      for (sIdx in 0 until pSets.length()) {
        val ps = pSets.optJSONObject(sIdx) ?: continue
        val setNum = ps.optIntOrNull("set_number") ?: (sIdx + 1)
        if (!setsByNumber.containsKey(setNum)) {
          setsByNumber[setNum] = ps
        }
      }
      plannedSetsByExOccurrence[pExId to occ] = setsByNumber
    }
    val sessionExercises = sessionObj.optJSONArray("exercises") ?: return false
    val sessionExCounts = HashMap<String, Int>()
    var sawSet = false
    var planExIdx = 0
    for (i in 0 until sessionExercises.length()) {
      val sEx = sessionExercises.optJSONObject(i) ?: continue
      val snap = sEx.optJSONObject("exercise_snapshot")
      val sExId = (
        sEx.optStringOrNull("exercise_id")?.takeIf { it.isNotBlank() }
          ?: snap?.optStringOrNull("id")?.takeIf { it.isNotBlank() }
        )?.trim().orEmpty()
      val plannedSets = if (sExId.isNotEmpty()) {
        val occ = sessionExCounts.getOrDefault(sExId, 0)
        sessionExCounts[sExId] = occ + 1
        plannedSetsByExOccurrence[sExId to occ].orEmpty()
      } else {
        emptyMap()
      }
      val sSets = sEx.optJSONArray("sets") ?: JSONArray()
      val validSets = mutableListOf<Int>()
      for (sIdx in 0 until sSets.length()) {
        val ss = sSets.optJSONObject(sIdx) ?: continue
        val setId = ss.opt("id")?.takeIf { it != JSONObject.NULL }?.toString()?.takeIf { it.isNotBlank() }
          ?: continue
        if (setId.isNotEmpty()) {
          validSets.add(ss.optIntOrNull("set_number") ?: (sIdx + 1))
        }
      }
      if (validSets.isEmpty()) continue
      val planEx = plan.exercises.getOrNull(planExIdx++) ?: return false
      var planSetIdx = 0
      for (setNum in validSets) {
        val planSet = planEx.sets.getOrNull(planSetIdx++) ?: return false
        sawSet = true
        val ps = plannedSets[setNum]
        val presetDefinesTarget = ps != null && (
          ps.optDoubleOrNull("reps") != null ||
            ps.optDoubleOrNull("weight") != null ||
            ps.optIntOrNull("duration") != null ||
            ps.optDoubleOrNull("distance") != null
          )
        if (!presetDefinesTarget) continue
        val hasTarget = planSet.targetReps != null ||
          planSet.targetWeightKg != null ||
          planSet.targetDurationSec != null ||
          planSet.targetDistanceKm != null
        if (!hasTarget) return false
      }
    }
    return sawSet
  }

  internal fun resolveRecoveredPresetWorkoutResult(
    sessionBody: String,
    presetBody: String?,
    sessionId: String,
    defaultWorkoutName: String = "Workout",
    defaultExerciseName: String = "Exercise"
  ): PresetWorkoutDirectResult {
    val needsPresetTargets = sessionNeedsPresetTargets(sessionBody)
    var presetParsed: JSONObject? = null
    if (needsPresetTargets) {
      if (presetBody.isNullOrBlank()) {
        return PresetWorkoutDirectResult.UnconfirmedCreate(sessionId)
      }
      presetParsed = runCatching { JSONObject(presetBody) }.getOrNull()
        ?: return PresetWorkoutDirectResult.UnconfirmedCreate(sessionId)
      if ((presetParsed.optJSONArray("exercises")?.length() ?: 0) == 0) {
        return PresetWorkoutDirectResult.UnconfirmedCreate(sessionId)
      }
    }
    val recoveredPlan = buildWorkoutPlanFromSessionAndOptionalPreset(
      sessionBody = sessionBody,
      presetBody = presetBody,
      fallbackSessionId = sessionId,
      defaultWorkoutName = defaultWorkoutName,
      defaultExerciseName = defaultExerciseName
    ) ?: return PresetWorkoutDirectResult.UnconfirmedCreate(sessionId)
    val sessionParsed = runCatching { JSONObject(sessionBody) }.getOrNull()
    if (needsPresetTargets && !planHasAllSetTargets(recoveredPlan, sessionParsed, presetParsed)) {
      return PresetWorkoutDirectResult.UnconfirmedCreate(sessionId)
    }
    return PresetWorkoutDirectResult.Started(recoveredPlan)
  }

  /**
   * Starts a saved preset workout directly on the SparkyFitness server so the
   * watch can launch strength workouts without waiting on the phone process.
   */
  fun startPresetWorkoutDirect(
    context: Context,
    ownerId: String?,
    presetIdStr: String,
    preMintedSessionId: String? = null,
    isAccountActive: () -> Boolean = { true }
  ): PresetWorkoutDirectResult {
    val creds = WearServerCredentialsStore.load(context, expectedOwnerId = ownerId)
      ?: return PresetWorkoutDirectResult.FailedBeforeCreate
    if (!WearServerCredentialsStore.admitDirectRequest(context, creds, isAccountActive)) {
      return PresetWorkoutDirectResult.FailedBeforeCreate
    }
    val defaultWorkoutName = context.getString(R.string.workout_new_fallback_title)
    val defaultExerciseName = context.getString(R.string.workout_default_exercise_name)
    val cleanPreMintedId = preMintedSessionId?.trim()?.takeIf { it.isNotEmpty() }
    val presetId = presetIdStr.toIntOrNull()

    if (cleanPreMintedId != null) {
      val existingRes = request(creds, "GET", "/api/exercise-preset-entries/${Uri.encode(cleanPreMintedId)}")
      when {
        existingRes.isSuccess && !existingRes.body.isNullOrBlank() -> {
          val optionalPresetBody = if (
            presetId != null &&
            WearServerCredentialsStore.admitDirectRequest(context, creds, isAccountActive)
          ) {
            request(creds, "GET", "/api/workout-presets/$presetId").takeIf { it.isSuccess }?.body
          } else {
            null
          }
          return resolveRecoveredPresetWorkoutResult(
            sessionBody = existingRes.body,
            presetBody = optionalPresetBody,
            sessionId = cleanPreMintedId,
            defaultWorkoutName = defaultWorkoutName,
            defaultExerciseName = defaultExerciseName
          )
        }
        existingRes.status == 404 -> {
          // Session was not yet created on the server; proceed to preset GET + POST create.
        }
        else -> {
          return PresetWorkoutDirectResult.UnconfirmedCreate(cleanPreMintedId)
        }
      }
    }

    if (presetId == null) return PresetWorkoutDirectResult.FailedBeforeCreate
    if (!WearServerCredentialsStore.admitDirectRequest(context, creds, isAccountActive)) {
      return PresetWorkoutDirectResult.FailedBeforeCreate
    }
    val pRes = request(creds, "GET", "/api/workout-presets/$presetId")
    if (!pRes.isSuccess || pRes.body.isNullOrBlank()) {
      return PresetWorkoutDirectResult.FailedBeforeCreate
    }
    val requestedSessionId = cleanPreMintedId ?: UUID.randomUUID().toString()
    val createReq: JSONObject = try {
      val presetObj = JSONObject(pRes.body)
      val presetName = presetObj.optStringOrNull("name")?.takeIf { it.isNotBlank() } ?: defaultWorkoutName
      val presetExArr = presetObj.optJSONArray("exercises") ?: JSONArray()
      if (presetExArr.length() == 0) return PresetWorkoutDirectResult.FailedBeforeCreate

      val reqExArr = JSONArray()
      for (i in 0 until presetExArr.length()) {
        val pEx = presetExArr.optJSONObject(i) ?: continue
        val exId = pEx.optString("exercise_id", "")
        if (exId.isEmpty()) continue
        val modality = pEx.optString("modality", "")
        val category = pEx.optString("category", "")
        val isCardio = modality == "duration_distance" || category.equals("Cardio", ignoreCase = true)

        val pSets = pEx.optJSONArray("sets") ?: JSONArray()
        val reqSets = JSONArray()
        if (pSets.length() == 0) {
          reqSets.put(
            JSONObject()
              .put("set_number", 1)
              .put("set_type", "normal")
              .put("rest_time", if (isCardio) 0 else 90)
          )
        } else {
          for (sIdx in 0 until pSets.length()) {
            val ps = pSets.optJSONObject(sIdx) ?: continue
            val restSec = if (isCardio) 0 else (ps.optIntOrNull("rest_time") ?: 90)
            val setNum = resolvePresetSetNumber(ps, sIdx)
            reqSets.put(
              JSONObject().apply {
                put("set_number", setNum)
                put("set_type", ps.optString("set_type", "normal").ifBlank { "normal" })
                put("rest_time", restSec)
                ps.optStringOrNull("notes")?.let { put("notes", it) }
              }
            )
          }
        }
        val supersetGroup = pEx.optIntOrNull("superset_group")
        reqExArr.put(
          JSONObject().apply {
            put("exercise_id", exId)
            put("sort_order", i)
            put("duration_minutes", 0)
            if (supersetGroup != null) put("superset_group", supersetGroup)
            put("sets", reqSets)
          }
        )
      }
      if (reqExArr.length() == 0) return PresetWorkoutDirectResult.FailedBeforeCreate

      JSONObject()
        .put("id", requestedSessionId)
        .put("name", presetName)
        .put("entry_date", CheckInDate.today())
        .put("source", "sparky")
        .put("workout_preset_id", presetId)
        .put("exercises", reqExArr)
    } catch (_: Throwable) {
      return PresetWorkoutDirectResult.FailedBeforeCreate
    }

    if (!WearServerCredentialsStore.admitDirectRequest(context, creds, isAccountActive)) {
      return PresetWorkoutDirectResult.FailedBeforeCreate
    }
    val cRes = request(creds, "POST", "/api/exercise-preset-entries/", createReq)
    if (cRes.status in 400..499) {
      return PresetWorkoutDirectResult.FailedBeforeCreate
    }
    if (!cRes.isSuccess || cRes.body.isNullOrBlank()) {
      return PresetWorkoutDirectResult.UnconfirmedCreate(requestedSessionId)
    }

    val parsedPlan = buildWorkoutPlanFromSessionAndOptionalPreset(
      sessionBody = cRes.body,
      presetBody = pRes.body,
      fallbackSessionId = requestedSessionId,
      defaultWorkoutName = defaultWorkoutName,
      defaultExerciseName = defaultExerciseName
    )
    return if (parsedPlan != null) {
      PresetWorkoutDirectResult.Started(parsedPlan)
    } else {
      PresetWorkoutDirectResult.UnconfirmedCreate(requestedSessionId)
    }
  }

  /**
   * Refreshes live day state directly from the SparkyFitness server in parallel
   * so opening the watch app or tapping a Tile reflects server truth even when
   * the phone app is asleep or unreachable.
   */
  suspend fun fetchLiveRefresh(
    context: Context,
    ownerId: String?,
    today: String,
    waterDisplayUnit: String?,
    existingMedications: MedicationSnapshot?,
    includeMedications: Boolean = true,
    timeFormat: String? = null,
    existingNutrition: NutritionSnapshot? = null,
    existingWater: WaterSnapshot? = null,
    isAccountActive: () -> Boolean = { true }
  ): DirectLiveSnapshot? = coroutineScope {
    val creds = WearServerCredentialsStore.load(context, expectedOwnerId = ownerId)
      ?: return@coroutineScope null
    if (!WearServerCredentialsStore.admitDirectRequest(context, creds, isAccountActive)) {
      return@coroutineScope null
    }

    val fmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    val startDate = try {
      val base = fmt.parse(today)
      if (base != null) {
        val cal = Calendar.getInstance().apply {
          time = base
          add(Calendar.DAY_OF_YEAR, -13)
        }
        fmt.format(cal.time)
      } else today
    } catch (_: Throwable) {
      today
    }

    fun admittedGet(endpoint: String): HttpResult =
      if (WearServerCredentialsStore.admitDirectRequest(context, creds, isAccountActive)) {
        request(creds, "GET", endpoint)
      } else {
        HttpResult(-1, null)
      }

    val waterTotalDef = async {
      admittedGet("/api/measurements/water-intake/${urlEncode(today)}")
    }
    val waterLogDef = async {
      admittedGet("/api/v2/measurements/water-intake/${urlEncode(today)}/log")
    }
    val containersDef = async {
      admittedGet("/api/water-containers")
    }
    val medsListDef = if (includeMedications) {
      async {
        admittedGet("/api/v2/medications?activeOnly=true")
      }
    } else null
    val medEntriesDef = if (includeMedications) {
      async {
        admittedGet("/api/v2/medications/entries?fromDate=${urlEncode(today)}&toDate=${urlEncode(today)}")
      }
    } else null
    val historyDef = async {
      admittedGet("/api/measurements/check-in-measurements-range/${urlEncode(startDate)}/${urlEncode(today)}")
    }
    val fastDef = async {
      admittedGet("/api/fasting/current")
    }
    val dailySummaryDef = async {
      admittedGet("/api/daily-summary?date=${urlEncode(today)}")
    }

    val waterTotalRes = waterTotalDef.await()
    val waterLogRes = waterLogDef.await()
    val containersRes = containersDef.await()
    val medsListRes = medsListDef?.await()
    val medEntriesRes = medEntriesDef?.await()
    val historyRes = historyDef.await()
    val fastRes = fastDef.await()
    val dailySummaryRes = dailySummaryDef.await()

    val fullMedications = if (
      includeMedications &&
      medsListRes?.isSuccess == true &&
      medEntriesRes?.isSuccess == true
    ) {
      buildMedicationsSnapshotFromServerJson(
        medicationsBody = medsListRes.body,
        entriesBody = medEntriesRes.body,
        today = today,
        timeFormat = timeFormat,
        context = context
      )
    } else null

    val medRawBody = medEntriesRes?.body?.trim()
    val medStatuses = if (
      includeMedications &&
      fullMedications == null &&
      medEntriesRes?.isSuccess == true &&
      !medRawBody.isNullOrEmpty() &&
      existingMedications != null &&
      existingMedications.day == today
    ) {
      try {
        resolveMedicationStatusesFromEntries(existingMedications.doses, JSONArray(medRawBody))
      } catch (_: Throwable) {
        null
      }
    } else null

    val anySucceeded = waterTotalRes.isSuccess ||
      waterLogRes.isSuccess ||
      containersRes.isSuccess ||
      fullMedications != null ||
      medStatuses != null ||
      historyRes.isSuccess ||
      fastRes.isSuccess ||
      dailySummaryRes.isSuccess
    if (!anySucceeded) return@coroutineScope null

    val waterMl = if (waterTotalRes.isSuccess) {
      try {
        waterTotalRes.body?.let { JSONObject(it).optDoubleOrNull("water_ml") }
      } catch (_: Throwable) {
        null
      }
    } else null

    val waterLog = if (waterLogRes.isSuccess) parseWaterLogJson(waterLogRes.body, timeFormat) else null
    val containers = if (containersRes.isSuccess) {
      parseWaterContainersJson(containersRes.body, waterDisplayUnit)
    } else null

    val parsedHistory = if (historyRes.isSuccess) {
      parseHistoryRangeJson(historyRes.body, today)
    } else null

    val (fast, fastKnown) = if (fastRes.isSuccess) {
      parseFastJson(fastRes.body)
    } else (null to false)

    val parsedSummary = if (dailySummaryRes.isSuccess) {
      parseDailySummaryJson(
        raw = dailySummaryRes.body,
        today = today,
        existingNutrition = existingNutrition,
        includeFoodWater = existingWater?.fromFoodMl != null
      )
    } else null

    DirectLiveSnapshot(
      ownerId = creds.ownerId,
      day = today,
      waterConsumedMl = waterMl,
      waterLog = waterLog,
      waterContainers = containers,
      waterGoalMl = parsedSummary?.waterGoalMl,
      waterFromFoodMl = parsedSummary?.waterFromFoodMl,
      nutrition = parsedSummary?.nutrition,
      exerciseSummary = parsedSummary?.exerciseSummary,
      steps = parsedHistory?.todaySteps?.let { StepsSnapshot(day = today, count = it) },
      stepGoal = parsedSummary?.stepGoal,
      medications = fullMedications,
      medicationStatusesByDoseId = medStatuses,
      history = parsedHistory?.history,
      bodyFatHistory = parsedHistory?.bodyFatHistory,
      todayWeightKg = parsedHistory?.todayWeightKg,
      todayBodyFatPercentage = parsedHistory?.todayBodyFatPercentage,
      lastWeightKg = parsedHistory?.lastWeightKg,
      lastBodyFatPercentage = parsedHistory?.lastBodyFatPercentage,
      lastBodyFatDate = parsedHistory?.lastBodyFatDate,
      lastEntryDate = parsedHistory?.lastEntryDate,
      fast = fast,
      fastKnown = fastKnown,
      credentialWriteId = creds.writeId
    )
  }
}
