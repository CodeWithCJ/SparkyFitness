package expo.modules.watchconnectivity.garmin

/**
 * How long a watch waits after a send to it was given up before it gets the
 * next one, if the SDK's late answer to the given-up send does not come first.
 */
internal const val GARMIN_ABANDONED_SEND_GRACE_MS = 30_000L

/**
 * Watches whose last send was answered without the SDK's status: it timed out,
 * or it was dropped because the watch disconnected or the service went away.
 *
 * The Connect IQ SDK keeps one send listener per watch and app, replaces it on
 * every `sendMessage`, and its status carries no message id. A late status for
 * the given-up message would therefore be credited to the next message sent to
 * that watch, and that message's own status ignored, so JS could record topics
 * the watch never got. While a watch is listed here nothing more is sent to
 * it: the late status still reaches the given-up send's own callback, which
 * [lateStatus] recognises and throws away. Once that happens, or the grace
 * period passes, the watch is free again. Only a status later than both can
 * still be misread, which needs Garmin Connect to sit on a send for a minute.
 *
 * Plain JVM code, no Android types, so the rules run in unit tests; times are
 * whatever monotonic clock the caller uses.
 */
internal class GarminAbandonedSends(private val graceMs: Long = GARMIN_ABANDONED_SEND_GRACE_MS) {
  private class Abandoned(val seq: Long, val until: Long)

  private val byDevice = HashMap<Long, Abandoned>()

  /**
   * Send [seq] to [deviceId] was handed to the SDK and then answered without
   * its status. A newer abandon on the same watch replaces the older one: the
   * SDK only kept the newer send's listener.
   */
  fun abandon(deviceId: Long, seq: Long, now: Long) {
    byDevice[deviceId] = Abandoned(seq, now + graceMs)
  }

  /**
   * The SDK answered send [seq] to [deviceId] after it was no longer in
   * flight. True when it is that watch's given-up send, which frees the watch.
   */
  fun lateStatus(deviceId: Long, seq: Long): Boolean {
    val abandoned = byDevice[deviceId] ?: return false
    if (abandoned.seq != seq) return false
    byDevice.remove(deviceId)
    return true
  }

  /** Whether a send to [deviceId] must wait at [now]; an expired entry is dropped. */
  fun blocks(deviceId: Long, now: Long): Boolean {
    val abandoned = byDevice[deviceId] ?: return false
    if (now < abandoned.until) return true
    byDevice.remove(deviceId)
    return false
  }

  fun clear() {
    byDevice.clear()
  }
}
