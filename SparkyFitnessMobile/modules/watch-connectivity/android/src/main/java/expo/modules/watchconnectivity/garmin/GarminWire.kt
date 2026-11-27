package expo.modules.watchconnectivity.garmin

import org.json.JSONArray
import org.json.JSONObject
import java.math.BigDecimal
import java.math.BigInteger

/**
 * Value rules for the Connect IQ mailbox, kept free of Android and SDK types so
 * they run in plain JVM tests.
 *
 * The SDK's serializer only knows Integer, Long, Float, Double, String,
 * Boolean, List and Map, and throws on anything else (including null), so every
 * value is cleaned here before it reaches `ConnectIQ.sendMessage`.
 */
internal object GarminWire {
  /**
   * Upper bound of the serializer's framing: a magic number and a length for
   * the string block and again for the data block.
   */
  private const val HEADER_BYTES = 16

  /**
   * Turns a value from JS (`ReadableMap.toHashMap`, where every number is a
   * Double), org.json or the SDK itself into one the serializer accepts.
   * Nulls, NaN, infinities and unknown types come back as null and are left
   * out of their container, so an absent key always means none. A whole number
   * becomes an Integer, or a Long when it does not fit, so the watch gets a
   * Number rather than a Float for counts, kcal and timestamps.
   */
  fun toConnectIq(value: Any?): Any? {
    return when (value) {
      null -> null
      JSONObject.NULL -> null
      is String -> value
      is Boolean -> value
      is Char -> value.toString()
      is Int -> value
      is Short -> value.toInt()
      is Byte -> value.toInt()
      is Long -> narrowLong(value)
      is BigInteger -> if (value.bitLength() < 64) narrowLong(value.toLong()) else finiteNumber(value.toDouble())
      // Float.toString is the shortest text that round-trips, so 72.3f stays
      // 72.3 instead of picking up float noise as a Double.
      is Float -> if (value.isFinite()) finiteNumber(value.toString().toDouble()) else null
      is BigDecimal -> finiteNumber(value.toDouble())
      is Number -> finiteNumber(value.toDouble())
      is JSONObject -> {
        val out = LinkedHashMap<String, Any>()
        val keys = value.keys()
        while (keys.hasNext()) {
          val key = keys.next()
          toConnectIq(value.opt(key))?.let { out[key] = it }
        }
        out
      }
      is JSONArray -> {
        val out = ArrayList<Any>(value.length())
        for (i in 0 until value.length()) {
          toConnectIq(value.opt(i))?.let { out.add(it) }
        }
        out
      }
      is Map<*, *> -> toConnectIqMap(value)
      is Iterable<*> -> value.mapNotNullTo(ArrayList()) { toConnectIq(it) }
      is Array<*> -> value.mapNotNullTo(ArrayList()) { toConnectIq(it) }
      else -> null
    }
  }

  /** [toConnectIq] for a dictionary; entries with a key that is not a String are dropped. */
  fun toConnectIqMap(map: Map<*, *>): LinkedHashMap<String, Any> {
    val out = LinkedHashMap<String, Any>()
    for ((k, v) in map) {
      val key = k as? String ?: continue
      toConnectIq(v)?.let { out[key] = it }
    }
    return out
  }

  private fun narrowLong(value: Long): Any {
    return if (value in Int.MIN_VALUE..Int.MAX_VALUE) value.toInt() else value
  }

  private fun finiteNumber(value: Double): Any? {
    if (!value.isFinite()) return null
    // Long.MAX_VALUE.toDouble() is 2^63, one past the last Long, hence `<`.
    if (value % 1.0 == 0.0 && value >= Long.MIN_VALUE.toDouble() && value < Long.MAX_VALUE.toDouble()) {
      return narrowLong(value.toLong())
    }
    return value
  }

  /**
   * An upper bound of what `Serializer.serialize` produces for [message]
   * (already cleaned by [toConnectIq]). It assumes every string is stored
   * separately and every Double stays a Double, where the real serializer
   * shares repeated strings and shrinks some Doubles to Floats.
   */
  fun estimateSerializedBytes(message: Any): Int = HEADER_BYTES + estimateValueBytes(message)

  /** The bytes [value] adds to a message's data and string blocks, without the header. */
  private fun estimateValueBytes(value: Any?): Int {
    return when (value) {
      // A type byte and an offset in the data block, plus a length, the UTF-8
      // bytes and a terminating zero in the string block.
      is String -> 5 + 2 + value.toByteArray(Charsets.UTF_8).size + 1
      is Boolean -> 2
      is Int -> 5
      is Float -> 5
      is Long -> 9
      is Double -> 9
      is Map<*, *> -> 5 + value.entries.sumOf { estimateValueBytes(it.key) + estimateValueBytes(it.value) }
      is Iterable<*> -> 5 + value.sumOf { estimateValueBytes(it) }
      null -> 1
      // Anything else was rejected by toConnectIq; count it as the widest scalar.
      else -> 9
    }
  }

  /** A cleaned value as org.json, for keeping the snapshot message in SharedPreferences. */
  fun toJson(value: Any): Any {
    return when (value) {
      is Map<*, *> -> {
        val obj = JSONObject()
        for ((k, v) in value) {
          if (k is String && v != null) obj.put(k, toJson(v))
        }
        obj
      }
      is Iterable<*> -> {
        val arr = JSONArray()
        for (item in value) {
          if (item != null) arr.put(toJson(item))
        }
        arr
      }
      else -> value
    }
  }
}
