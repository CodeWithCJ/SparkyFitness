package expo.modules.watchconnectivity.garmin

import com.garmin.monkeybrains.serialization.Serializer
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal

class GarminWireTest {
  @Test
  fun wholeDoublesFromJsBecomeIntegersAndLongs() {
    assertEquals(1600, GarminWire.toConnectIq(1600.0))
    assertEquals(-250, GarminWire.toConnectIq(-250.0))
    assertEquals(0, GarminWire.toConnectIq(-0.0))
    assertEquals(1_763_539_200_000L, GarminWire.toConnectIq(1_763_539_200_000.0))
    assertEquals(0.42, GarminWire.toConnectIq(0.42))
    assertEquals(1e19, GarminWire.toConnectIq(1e19))
  }

  @Test
  fun otherNumberTypesAreNormalised() {
    assertEquals(7, GarminWire.toConnectIq(7L))
    assertEquals(3_000_000_000L, GarminWire.toConnectIq(3_000_000_000L))
    assertEquals(5, GarminWire.toConnectIq(5.toByte()))
    assertEquals(72.3, GarminWire.toConnectIq(72.3f))
    assertEquals(12, GarminWire.toConnectIq(12f))
    assertEquals(1600, GarminWire.toConnectIq(BigDecimal("1600.0")))
    assertEquals(1.25, GarminWire.toConnectIq(BigDecimal("1.25")))
    assertEquals("x", GarminWire.toConnectIq('x'))
  }

  @Test
  fun nullsNonFiniteNumbersAndUnknownTypesAreLeftOut() {
    assertNull(GarminWire.toConnectIq(null))
    assertNull(GarminWire.toConnectIq(Double.NaN))
    assertNull(GarminWire.toConnectIq(Double.POSITIVE_INFINITY))
    assertNull(GarminWire.toConnectIq(Float.NaN))
    assertNull(GarminWire.toConnectIq(JSONObject.NULL))
    assertNull(GarminWire.toConnectIq(Any()))

    val raw = hashMapOf<Any?, Any?>(
      "keep" to "yes",
      "gone" to null,
      "nan" to Double.NaN,
      7 to "numeric key",
      "list" to listOf(1.0, null, "a", Double.NaN, Any())
    )
    val clean = GarminWire.toConnectIqMap(raw)
    assertEquals(setOf("keep", "list"), clean.keys)
    assertEquals(listOf(1, "a"), clean["list"])
  }

  @Test
  fun orgJsonValuesAreConverted() {
    val json = JSONObject(
      """{"a":1,"b":1.5,"c":"s","d":null,"e":[1,2.0,null,{"f":true}],"g":1763539200000}"""
    )
    val clean = GarminWire.toConnectIq(json) as Map<*, *>
    assertEquals(1, clean["a"])
    assertEquals(1.5, clean["b"])
    assertEquals("s", clean["c"])
    assertFalse(clean.containsKey("d"))
    assertEquals(listOf(1, 2, mapOf("f" to true)), clean["e"])
    assertEquals(1_763_539_200_000L, clean["g"])
  }

  @Test
  fun cleanedValuesAreAcceptedByTheSdkSerializer() {
    val raw = hashMapOf<String, Any?>(
      "type" to "snapshot",
      "v" to 1.0,
      "pushedAt" to 1_763_539_200_000.0,
      "owner" to null,
      "topics" to hashMapOf("goals" to hashMapOf("progress" to 0.5, "nutrients" to arrayListOf<Any?>()))
    )
    val clean = GarminWire.toConnectIqMap(raw)
    assertTrue(Serializer.serialize(clean).isNotEmpty())
  }

  @Test
  fun sizeEstimateMatchesTheSerializerWithoutSharedStringsOrFloats() {
    val message = linkedMapOf<String, Any>(
      "type" to "snapshot",
      "v" to 1,
      "pushedAt" to 1_763_539_200_000L,
      "ok" to true,
      // Far enough from any Float that the serializer keeps it a Double.
      "ratio" to 123456.789,
      "label" to "Protein · Éclair",
      "items" to arrayListOf<Any>(
        linkedMapOf<String, Any>("key" to "protein", "consumed" to 120),
        linkedMapOf<String, Any>("name" to "carbs", "goal" to 250)
      ),
      "empty" to arrayListOf<Any>(),
      "nested" to linkedMapOf<String, Any>()
    )
    assertEquals(Serializer.serialize(message).size, GarminWire.estimateSerializedBytes(message))
  }

  @Test
  fun sizeEstimateNeverUndercountsTheSerializer() {
    val nutrients = ArrayList<Any>()
    for (i in 0 until 12) {
      nutrients.add(
        linkedMapOf<String, Any>(
          "key" to "nutrient$i",
          "label" to "Nutrient $i",
          "unit" to "g",
          "consumed" to i * 10,
          "goal" to 100,
          "progress" to i / 12.0
        )
      )
    }
    val message = linkedMapOf<String, Any>(
      "type" to "snapshot",
      "v" to 1,
      "pushedAt" to 1_763_539_200_000L,
      "today" to "2026-11-19",
      "owner" to "server-1",
      "topics" to linkedMapOf<String, Any>(
        "goals" to linkedMapOf<String, Any>(
          "energyUnit" to "kcal",
          "day" to "2026-11-19",
          "consumed" to 1450,
          "burned" to 320,
          "remaining" to -70,
          "progress" to 0.95,
          "nutrients" to nutrients
        )
      )
    )
    val actual = Serializer.serialize(message).size
    val estimate = GarminWire.estimateSerializedBytes(message)
    assertTrue("estimate $estimate < actual $actual", estimate >= actual)
  }

  @Test
  fun jsDoublesAndStoredIntegersCleanTheSame() {
    // A message from JS and the same message read back from the cache must
    // reach the SDK identically, so a replay matches what JS sent.
    val fromJs = GarminWire.toConnectIqMap(hashMapOf("consumed" to 1450.0, "progress" to 0.5))
    val fromJson = GarminWire.toConnectIq(JSONObject("""{"progress":0.5,"consumed":1450}"""))
    assertEquals(fromJs, fromJson)
  }

  @Test
  fun toJsonRoundTrips() {
    val value = linkedMapOf<String, Any>(
      "a" to 1,
      "b" to 1_763_539_200_000L,
      "c" to 0.25,
      "d" to arrayListOf<Any>("x", linkedMapOf<String, Any>("e" to false))
    )
    val json = GarminWire.toJson(value) as JSONObject
    val back = GarminWire.toConnectIq(JSONObject(json.toString()))
    assertEquals(value, back)
    assertTrue((GarminWire.toJson(arrayListOf<Any>(1)) as JSONArray).length() == 1)
  }
}
