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
 * the shared router, never the Wear OS ones the Garmin app does not send. A new
 * write type is added here together with its watch side.
 */
internal val GARMIN_INBOUND_TYPES = setOf(GARMIN_TYPE_REQUEST_CONTEXT)

/**
 * SharedPreferences key of the latest full `snapshot` message JS handed over
 * (`setGarminSnapshotCache`), replayed while nothing in JS listens for
 * `onGarminResync`.
 */
internal const val GARMIN_SNAPSHOT_CACHE_KEY = "sparky.garmin.lastSnapshot"

/**
 * Half of the 16 KB mailbox limit: the watch parses each message into memory,
 * and the Goals topic is a few hundred bytes.
 */
internal const val GARMIN_MESSAGE_BYTE_CAP = 8 * 1024

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
   * lost, so a runtime without one (the feature off, or no JS runtime at all)
   * gets the cached copy like a stopped one.
   */
  fun decide(jsListening: Boolean, reason: GarminResyncReason, hasCache: Boolean): GarminResyncAction = when {
    jsListening -> GarminResyncAction.EMIT_TO_JS
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
 * A message as it goes to `ConnectIQ.sendMessage`: values cleaned by
 * [GarminWire], keys exactly as given (JS builds `type` and `v`), and its
 * estimated serialised size worked out once, off the main thread.
 */
internal class GarminOutboundMessage private constructor(
  val message: LinkedHashMap<String, Any>,
  val estimatedBytes: Int
) {
  val type: String? get() = message["type"] as? String

  fun fits(capBytes: Int = GARMIN_MESSAGE_BYTE_CAP): Boolean = estimatedBytes <= capBytes

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

    /** A message the link sends on its own (`accountCleared`). */
    fun control(type: String): GarminOutboundMessage =
      prepare(linkedMapOf("type" to type, "v" to GARMIN_PROTOCOL_VERSION))
  }
}
