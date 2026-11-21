package expo.modules.watchconnectivity.garmin

import com.garmin.android.connectiq.ConnectIQ
import org.json.JSONObject

/** Version 1 of the phone <-> Connect IQ protocol (`agent-docs/garmin.md`). */
internal const val GARMIN_PROTOCOL_VERSION = 1

internal const val GARMIN_TYPE_ACCOUNT_CLEARED = "accountCleared"
internal const val GARMIN_TYPE_REQUEST_CONTEXT = "requestContext"

/**
 * The watch -> phone types the Garmin app sends; anything else is ignored.
 * The SDK's broadcast receiver is exported and does not check the sender, so
 * another app on the phone can forge a "watch" message: only these types reach
 * the shared router, never the Wear OS ones the Garmin app does not send. The
 * binder service only accepts calls signed by Garmin, but its messages pass the
 * same list, since the link can be in either mode. A new write type is added
 * here together with its watch side.
 */
internal val GARMIN_INBOUND_TYPES = setOf(GARMIN_TYPE_REQUEST_CONTEXT)

/**
 * SharedPreferences key of the latest full `snapshot` message JS handed over
 * (`setGarminSnapshotCache`), replayed while nothing in JS listens for
 * `onGarminResync`.
 */
internal const val GARMIN_SNAPSHOT_CACHE_KEY = "sparky.garmin.lastSnapshot"

/**
 * The app's install time (`PackageInfo.firstInstallTime`) when the cached
 * snapshot was written. Android's backup and device transfer copy the
 * preferences to a reinstall or a new phone, where no account is signed in
 * yet; a cache from another install is read as empty, so it is never
 * replayed to a watch there.
 */
internal const val GARMIN_SNAPSHOT_INSTALL_KEY = "sparky.garmin.lastSnapshotInstall"

/**
 * The cap on a message's ESTIMATED size ([GarminWire.estimateSerializedBytes]),
 * which errs high: it counts every repeated key string per nutrient row, while
 * the SDK's serializer stores each string once, so a Goals topic estimated at
 * 8 KB serialises to roughly 5 KB. That keeps a message well under the watch
 * app's 8 KB mailbox (Connect IQ SDK 2.2.0: "Limit the size of an app's
 * mailbox from a partner app to 8kb") with room for a small one beside it.
 * A Goals topic with every standard nutrient estimates about 3 KB.
 */
internal const val GARMIN_MESSAGE_BYTE_CAP = 8 * 1024

/**
 * Keys the link adds to every message as it hands it to the SDK: the send
 * number ([GarminSendSequence]) and the phone install that numbered it
 * ([GarminSendSequence.newOrigin]). The watch drops a message from the same
 * origin whose number is not above the last one it applied.
 */
internal const val GARMIN_KEY_SEQ = "seq"
internal const val GARMIN_KEY_ORIGIN = "origin"

/**
 * Room kept under [GARMIN_MESSAGE_BYTE_CAP] for those two keys and values,
 * since [GarminOutboundMessage.fits] is decided before they are added.
 */
internal const val GARMIN_STAMP_BYTES = 64

/** The estimated size a message may have before `seq` and `origin`. */
internal const val GARMIN_SEND_CAP_BYTES = GARMIN_MESSAGE_BYTE_CAP - GARMIN_STAMP_BYTES

/**
 * The `seq` each message carries: one more than the last, or the clock in ms
 * when that is higher. The link stores it (synchronously, best effort) before
 * the message goes out, so within one origin it only rises, across process
 * starts and whatever the clock does, unless that write failed and the clock
 * reads below that number at the next start. The watch can then drop a copy it gets again or
 * late (the watch may hand a message to both the open app and its background
 * service, or the open app's mailbox may hold what the service already
 * applied). Following the clock keeps the numbers readable as a time.
 */
internal object GarminSendSequence {
  fun next(last: Long, nowMillis: Long): Long = maxOf(last + 1, nowMillis)

  /**
   * A new install's origin: random. The link keeps it with the app's install
   * time and makes a new one when that differs, so a reinstall or another
   * phone (whose preferences Android may have restored from a backup or a
   * transfer) never shares a numbering with the one the watch knows; cleared
   * data loses it anyway.
   */
  fun newOrigin(): String = java.util.UUID.randomUUID().toString().replace("-", "").take(12)

  /** Whether an origin stored with [storedInstall] belongs to this install. */
  fun originIsCurrent(origin: String?, storedInstall: Long, currentInstall: Long?): Boolean =
    !origin.isNullOrEmpty() && (currentInstall == null || storedInstall == currentInstall)
}

/** How one `sendGarminMessage` ended; [wire] is the string JS receives. */
internal enum class GarminSendResult(val wire: String) {
  SENT("sent"),
  NOT_CONNECTED("notConnected"),

  /** Over the cap; JS splits the message by topic and sends the parts. */
  TOO_LARGE("tooLarge"),
  FAILED("failed");

  companion object {
    /**
     * The SDK's answer to a send. Its own "too large" maps to [TOO_LARGE] as
     * well: the estimate is an upper bound, so this should not happen, but if
     * it does JS splits the message instead of resending it whole forever.
     *
     * SDK 2.4.0 never reports FAILURE_DEVICE_NOT_CONNECTED: its receiver turns
     * every non-zero status into FAILURE_DURING_TRANSFER, so a watch that drops
     * mid-send comes back [FAILED]. [NOT_CONNECTED] comes from the link's own
     * checks instead (a job for a watch that is not connected, or one dropped
     * when its watch disconnects). The mapping stays for a later SDK that does
     * send it.
     */
    fun fromStatus(status: ConnectIQ.IQMessageStatus?): GarminSendResult = when (status) {
      ConnectIQ.IQMessageStatus.SUCCESS -> SENT
      ConnectIQ.IQMessageStatus.FAILURE_DEVICE_NOT_CONNECTED -> NOT_CONNECTED
      ConnectIQ.IQMessageStatus.FAILURE_MESSAGE_TOO_LARGE -> TOO_LARGE
      else -> FAILED
    }
  }
}

/** Why a watch needs the latest snapshot in full (`onGarminResync`). */
internal enum class GarminResyncReason(val wire: String) {
  /** The watch was away and is back; what it holds is unknown. */
  CONNECTED("connected"),

  /** The watch app started and sent `requestContext`. */
  REQUESTED("requested"),

  /** Garmin Connect's service came (back) up with the watch connected. */
  READY("ready")
}

internal enum class GarminResyncAction {
  /** JS decides what the watch gets: emit `onGarminResync`. */
  EMIT_TO_JS,

  /** Nothing in JS listens: send the cached snapshot message as is. */
  REPLAY_CACHE,

  /**
   * Nothing in JS listens and nothing is cached, which means no account: a
   * watch still showing the previous account's figures is emptied instead.
   */
  SEND_ACCOUNT_CLEARED,
  NOTHING
}

internal object GarminResyncPolicy {
  /**
   * [jsListening] is whether JS has an `onGarminResync` listener right now,
   * not whether the runtime is up. JS listens whenever the Garmin feature is
   * on, server reachable or not, and then decides every answer, `accountCleared`
   * for a signed-out phone included. An event emitted with no listener is
   * lost, so with none (the feature off, or no JS runtime at all) the link
   * answers itself, as below.
   *
   * [jsHasListened] is whether JS has listened at all since the process
   * started. Until then only a watch that asked is answered: the link starts
   * at every process start with the link turned on, background starts
   * included (a widget, an alarm, a job), and replaying the snapshot to every
   * connected watch on each of those would wake them for nothing. A watch
   * that needs data asks (`requestContext`), and JS sends in full to a watch
   * it has no record of once it runs.
   */
  fun decide(
    jsListening: Boolean,
    jsHasListened: Boolean,
    reason: GarminResyncReason,
    hasCache: Boolean
  ): GarminResyncAction = when {
    jsListening -> GarminResyncAction.EMIT_TO_JS
    !jsHasListened && reason != GarminResyncReason.REQUESTED -> GarminResyncAction.NOTHING
    hasCache -> GarminResyncAction.REPLAY_CACHE
    // A watch that only reconnected keeps what it shows; one that asked gets
    // an answer, as before the split.
    reason == GarminResyncReason.REQUESTED -> GarminResyncAction.SEND_ACCOUNT_CLEARED
    else -> GarminResyncAction.NOTHING
  }
}

/** Whether the SparkyFitness app is on a watch, as shown in Settings; [wire] is the string JS receives. */
internal enum class GarminAppState(val wire: String) {
  INSTALLED("installed"),
  NOT_INSTALLED("notInstalled"),
  UNKNOWN("unknown")
}

internal object GarminAppStatePolicy {
  /**
   * What a `getApplicationInfo` answer makes of a watch's app state. A watch
   * that sent a message since it last connected has the app, whatever Garmin
   * Connect's catalog says: the answer arrives after the message when the
   * message's own reconnect asked for it, and whether the catalog knows a
   * sideloaded app is unconfirmed. Only a disconnect clears that fact.
   */
  fun afterAppInfo(current: GarminAppState, reported: GarminAppState, heardSinceConnect: Boolean): GarminAppState =
    if (heardSinceConnect && current == GarminAppState.INSTALLED) current else reported
}

/**
 * A message as JS (or the link) built it: values cleaned by [GarminWire], keys
 * exactly as given (JS builds `type` and `v`), and its estimated serialised
 * size worked out once (off the main thread for JS's messages; the link's
 * small `accountCleared` on it). It goes to
 * `ConnectIQ.sendMessage` with `seq` and `origin` added ([sentAs]), which the
 * size check leaves room for ([GARMIN_SEND_CAP_BYTES]).
 */
internal class GarminOutboundMessage private constructor(
  val message: LinkedHashMap<String, Any>,
  val estimatedBytes: Int
) {
  val type: String? get() = message["type"] as? String

  fun fits(capBytes: Int = GARMIN_SEND_CAP_BYTES): Boolean = estimatedBytes <= capBytes

  /** The message as handed to the SDK, with its send number and origin. */
  fun sentAs(seq: Long, origin: String): Map<String, Any> =
    LinkedHashMap(message).apply {
      put(GARMIN_KEY_SEQ, seq)
      put(GARMIN_KEY_ORIGIN, origin)
    }

  /** The cleaned message as JSON, for the SharedPreferences cache. */
  fun toJson(): String = GarminWire.toJson(message).toString()

  companion object {
    fun prepare(raw: Map<*, *>): GarminOutboundMessage {
      val clean = GarminWire.toConnectIqMap(raw)
      return GarminOutboundMessage(clean, GarminWire.estimateSerializedBytes(clean))
    }

    /** Reads a cached copy back; null when it is not a JSON object. */
    fun fromJson(json: String): GarminOutboundMessage? {
      return try {
        val parsed = GarminWire.toConnectIq(JSONObject(json)) as? Map<*, *> ?: return null
        prepare(parsed)
      } catch (_: Exception) {
        null
      }
    }

    /** The `accountCleared` the link sends on its own. */
    fun accountCleared(): GarminOutboundMessage =
      prepare(linkedMapOf("type" to GARMIN_TYPE_ACCOUNT_CLEARED, "v" to GARMIN_PROTOCOL_VERSION))
  }
}
