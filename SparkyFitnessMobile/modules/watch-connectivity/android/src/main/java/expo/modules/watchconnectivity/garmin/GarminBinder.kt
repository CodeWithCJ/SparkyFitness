package expo.modules.watchconnectivity.garmin

/**
 * How Garmin Connect hands this app the watch's messages and the SDK's
 * answers; [wire] is the `delivery` string of the status JS receives.
 *
 * - [BINDER]: Garmin Connect binds the SDK's `IQGarminBindingService` (it
 *   checks that the caller is signed by Garmin) and can start this app's
 *   process to deliver. Needs Garmin's approval (`registerAppToUseBinderService`).
 * - [BROADCAST]: Garmin Connect sends broadcasts to a receiver the SDK
 *   registers at runtime, exported and without a sender check; only a running
 *   process receives them.
 * - [NONE]: the link is not ready.
 */
internal enum class GarminDelivery(val wire: String) {
  BINDER("binder"),
  BROADCAST("broadcast"),
  /** Talking to the Connect IQ simulator over ADB (development only). */
  SIMULATOR("simulator"),
  NONE("none")
}

/** What the last attempt at binder delivery showed. */
internal enum class GarminBinderOutcome(val wire: String) {
  /** Something arrived through the binder service: Garmin Connect delivers there. */
  CONFIRMED("confirmed"),

  /**
   * A probe after a confirmation ran out with nothing through the binder. A
   * slow answer (the watch syncing an activity, or briefly out of range) says
   * nothing about approval, so the registration is kept and the next start
   * of the link tries again (not the same start, unless something arrives
   * through the binder meanwhile, which confirms it again), until
   * [GARMIN_BINDER_TIMEOUTS_BEFORE_REJECTION] such probes in a row.
   */
  UNCONFIRMED("unconfirmed"),

  /** Registering threw, or nothing arrived through the binder before the probe ran out. */
  REJECTED("rejected");

  companion object {
    fun fromWire(wire: String): GarminBinderOutcome? = values().firstOrNull { it.wire == wire }
  }
}

/**
 * The stored result of the last binder attempt, with the Garmin Connect
 * version it was made against and when (wall clock, so it survives reboots).
 * [timeouts] counts the probes in a row that ran out after a confirmation;
 * only an [GarminBinderOutcome.UNCONFIRMED] record has any.
 */
internal data class GarminBinderRecord(
  val outcome: GarminBinderOutcome,
  val garminConnectVersion: Long,
  val atMillis: Long,
  val timeouts: Int = 0
) {
  fun encode(): String {
    val base = "${outcome.wire}:$garminConnectVersion:$atMillis"
    return if (outcome == GarminBinderOutcome.UNCONFIRMED) "$base:$timeouts" else base
  }

  companion object {
    /** Null for nothing stored or anything that is not a record, so a bad value only means "try again". */
    fun decode(raw: String?): GarminBinderRecord? {
      val parts = raw?.split(':') ?: return null
      val outcome = parts.firstOrNull()?.let { GarminBinderOutcome.fromWire(it) } ?: return null
      val unconfirmed = outcome == GarminBinderOutcome.UNCONFIRMED
      if (parts.size != if (unconfirmed) 4 else 3) return null
      val version = parts[1].toLongOrNull() ?: return null
      val at = parts[2].toLongOrNull() ?: return null
      val timeouts = if (unconfirmed) parts[3].toIntOrNull()?.takeIf { it > 0 } ?: return null else 0
      return GarminBinderRecord(outcome, version, at, timeouts)
    }
  }
}

/**
 * After a failed attempt the link waits this long before trying binder
 * delivery again with the same Garmin Connect version. An attempt Garmin
 * Connect ignores costs a few seconds without messages (the probe), so it is
 * not repeated on every start, but approval can arrive on Garmin's side
 * without any update on the phone.
 */
internal const val GARMIN_BINDER_RETRY_AFTER_REJECTION_MS = 24 * 60 * 60_000L

/**
 * Probes in a row that may run out after a confirmation before the link takes
 * it for a withdrawn approval and stores a rejection.
 */
internal const val GARMIN_BINDER_TIMEOUTS_BEFORE_REJECTION = 3

internal object GarminBinderPolicy {
  /**
   * Whether the link tries binder delivery now. Always after a confirmation
   * (Garmin Connect may have lost the registration, and the probe notices a
   * withdrawn approval) or an inconclusive probe after one; after a rejection
   * only once Garmin Connect changed version or a day passed. A clock set back
   * counts as passed.
   */
  fun shouldAttempt(record: GarminBinderRecord?, garminConnectVersion: Long, nowMillis: Long): Boolean = when {
    record == null -> true
    record.outcome != GarminBinderOutcome.REJECTED -> true
    record.garminConnectVersion != garminConnectVersion -> true
    nowMillis < record.atMillis -> true
    else -> nowMillis - record.atMillis >= GARMIN_BINDER_RETRY_AFTER_REJECTION_MS
  }

  /**
   * What a failed attempt stores, given the [previous] record. A probe that
   * only ran out ([timedOut]) after a confirmation is inconclusive
   * ([GarminBinderOutcome.UNCONFIRMED], tried again at the next start) until
   * [GARMIN_BINDER_TIMEOUTS_BEFORE_REJECTION] in a row; anything else is a
   * rejection, with its day of waiting.
   */
  fun afterFailure(
    previous: GarminBinderRecord?,
    timedOut: Boolean,
    garminConnectVersion: Long,
    nowMillis: Long
  ): GarminBinderRecord {
    val earlierTimeouts = when (previous?.outcome) {
      GarminBinderOutcome.CONFIRMED -> 0
      GarminBinderOutcome.UNCONFIRMED -> previous.timeouts
      else -> null
    }
    val timeouts = if (timedOut && earlierTimeouts != null) earlierTimeouts + 1 else null
    return if (timeouts != null && timeouts < GARMIN_BINDER_TIMEOUTS_BEFORE_REJECTION) {
      GarminBinderRecord(GarminBinderOutcome.UNCONFIRMED, garminConnectVersion, nowMillis, timeouts)
    } else {
      GarminBinderRecord(GarminBinderOutcome.REJECTED, garminConnectVersion, nowMillis)
    }
  }

  /**
   * Whether Garmin Connect may still hold a binder registration from an
   * earlier attempt, so turning the link off unregisters it first: after a
   * confirmation, or after an inconclusive probe, which keeps it on purpose.
   * A rejection already sent the unregister (a one-way call, so not proof
   * that Garmin Connect dropped it, but a binder delivery then turns the
   * record back to confirmed).
   */
  fun mayHoldRegistration(record: GarminBinderRecord?): Boolean =
    record != null && record.outcome != GarminBinderOutcome.REJECTED
}

/**
 * Whether [applicationId] is this app's Connect IQ id. Through the binder
 * service the SDK hands its one app listener whatever app id Garmin Connect
 * names, unchecked, so the link compares it itself; dashes and case are
 * ignored in case Garmin Connect formats the UUID.
 */
internal fun isGarminAppId(applicationId: String?): Boolean =
  applicationId != null && applicationId.replace("-", "").lowercase() == GARMIN_APP_ID
