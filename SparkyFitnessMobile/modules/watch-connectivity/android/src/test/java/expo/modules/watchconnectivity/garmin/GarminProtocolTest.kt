package expo.modules.watchconnectivity.garmin

import com.garmin.android.connectiq.ConnectIQ
import com.garmin.monkeybrains.serialization.Serializer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GarminProtocolTest {
  private fun snapshotFromJs(nutrients: Int = 3): HashMap<String, Any?> {
    val list = ArrayList<Any?>()
    for (i in 0 until nutrients) {
      list.add(
        hashMapOf<String, Any?>(
          "key" to "n$i",
          "label" to "Nutrient $i",
          "unit" to "g",
          "consumed" to 10.0 * i,
          "progress" to 0.1 * i,
          "goal" to if (i == 0) null else 100.0
        )
      )
    }
    // As `ReadableMap.toHashMap` hands it over: every number a Double.
    return hashMapOf(
      "type" to "snapshot",
      "v" to 1.0,
      "pushedAt" to 1_763_539_200_000.0,
      "today" to "2026-11-19",
      "owner" to "server-1",
      "topics" to hashMapOf<String, Any?>(
        "goals" to hashMapOf<String, Any?>(
          "energyUnit" to "kcal",
          "day" to "2026-11-19",
          "consumed" to 1450.0,
          "progress" to 0.72,
          "nutrients" to list
        )
      )
    )
  }

  @Test
  fun wireStringsMatchTheJsContract() {
    assertEquals(
      listOf("sent", "notConnected", "tooLarge", "failed"),
      GarminSendResult.entries.map { it.wire }
    )
    assertEquals(
      listOf("connected", "requested", "ready"),
      GarminResyncReason.entries.map { it.wire }
    )
  }

  @Test
  fun sdkStatusesMapToSendResults() {
    assertEquals(GarminSendResult.SENT, GarminSendResult.fromStatus(ConnectIQ.IQMessageStatus.SUCCESS))
    // SDK 2.4.0 never sends this one; the mapping is kept for a later SDK.
    assertEquals(
      GarminSendResult.NOT_CONNECTED,
      GarminSendResult.fromStatus(ConnectIQ.IQMessageStatus.FAILURE_DEVICE_NOT_CONNECTED)
    )
    assertEquals(
      GarminSendResult.TOO_LARGE,
      GarminSendResult.fromStatus(ConnectIQ.IQMessageStatus.FAILURE_MESSAGE_TOO_LARGE)
    )
    val failed = listOf(
      ConnectIQ.IQMessageStatus.FAILURE_UNKNOWN,
      ConnectIQ.IQMessageStatus.FAILURE_INVALID_FORMAT,
      ConnectIQ.IQMessageStatus.FAILURE_UNSUPPORTED_TYPE,
      ConnectIQ.IQMessageStatus.FAILURE_DURING_TRANSFER,
      ConnectIQ.IQMessageStatus.FAILURE_INVALID_DEVICE,
      null
    )
    for (status in failed) assertEquals(GarminSendResult.FAILED, GarminSendResult.fromStatus(status))
  }

  @Test
  fun resyncGoesToJsWheneverItListens() {
    for (reason in GarminResyncReason.entries) {
      for (hasCache in listOf(true, false)) {
        assertEquals(
          GarminResyncAction.EMIT_TO_JS,
          GarminResyncPolicy.decide(jsListening = true, jsHasListened = true, reason = reason, hasCache = hasCache)
        )
      }
    }
  }

  @Test
  fun onceJsHasListenedTheCacheIsReplayedForEveryReasonWithoutAListener() {
    for (reason in GarminResyncReason.entries) {
      assertEquals(
        GarminResyncAction.REPLAY_CACHE,
        GarminResyncPolicy.decide(jsListening = false, jsHasListened = true, reason = reason, hasCache = true)
      )
    }
  }

  @Test
  fun withoutAListenerOrCacheOnlyARequestIsAnswered() {
    for (jsHasListened in listOf(true, false)) {
      assertEquals(
        GarminResyncAction.SEND_ACCOUNT_CLEARED,
        GarminResyncPolicy.decide(
          jsListening = false,
          jsHasListened = jsHasListened,
          reason = GarminResyncReason.REQUESTED,
          hasCache = false
        )
      )
      for (reason in listOf(GarminResyncReason.CONNECTED, GarminResyncReason.READY)) {
        assertEquals(
          GarminResyncAction.NOTHING,
          GarminResyncPolicy.decide(jsListening = false, jsHasListened = jsHasListened, reason = reason, hasCache = false)
        )
      }
    }
  }

  @Test
  fun beforeJsHasListenedOnlyAWatchThatAskedGetsTheCache() {
    assertEquals(
      GarminResyncAction.REPLAY_CACHE,
      GarminResyncPolicy.decide(
        jsListening = false,
        jsHasListened = false,
        reason = GarminResyncReason.REQUESTED,
        hasCache = true
      )
    )
    for (reason in listOf(GarminResyncReason.CONNECTED, GarminResyncReason.READY)) {
      assertEquals(
        GarminResyncAction.NOTHING,
        GarminResyncPolicy.decide(jsListening = false, jsHasListened = false, reason = reason, hasCache = true)
      )
    }
  }

  @Test
  fun appStateWireStringsMatchTheJsContract() {
    assertEquals(listOf("installed", "notInstalled", "unknown"), GarminAppState.entries.map { it.wire })
  }

  @Test
  fun appInfoCannotUninstallAWatchThatSentAMessageSinceItConnected() {
    for (reported in listOf(GarminAppState.NOT_INSTALLED, GarminAppState.UNKNOWN)) {
      assertEquals(
        GarminAppState.INSTALLED,
        GarminAppStatePolicy.afterAppInfo(GarminAppState.INSTALLED, reported, heardSinceConnect = true)
      )
    }
  }

  @Test
  fun appInfoDecidesForAWatchNotHeardFromSinceItConnected() {
    for (reported in GarminAppState.entries) {
      assertEquals(
        reported,
        GarminAppStatePolicy.afterAppInfo(GarminAppState.INSTALLED, reported, heardSinceConnect = false)
      )
    }
  }

  @Test
  fun appInfoCanStillConfirmAnInstallAfterOpenAppSaidOtherwise() {
    // Open app answered not installed after the watch's message; the
    // catalog's later answer is taken as is.
    assertEquals(
      GarminAppState.INSTALLED,
      GarminAppStatePolicy.afterAppInfo(GarminAppState.NOT_INSTALLED, GarminAppState.INSTALLED, heardSinceConnect = true)
    )
    assertEquals(
      GarminAppState.NOT_INSTALLED,
      GarminAppStatePolicy.afterAppInfo(GarminAppState.NOT_INSTALLED, GarminAppState.NOT_INSTALLED, heardSinceConnect = true)
    )
  }

  @Test
  fun aMessageFromJsKeepsItsKeysAndOnlyHasItsValuesCleaned() {
    val raw = snapshotFromJs()
    raw["note"] = null
    val outbound = GarminOutboundMessage.prepare(raw)
    // Nothing added or renamed; the null is left out because Connect IQ
    // never carries one.
    assertEquals(setOf("type", "v", "pushedAt", "today", "owner", "topics"), outbound.message.keys)
    assertEquals("snapshot", outbound.type)
    assertEquals(1, outbound.message["v"])
    assertEquals(1_763_539_200_000L, outbound.message["pushedAt"])
    val goals = (outbound.message["topics"] as Map<*, *>)["goals"] as Map<*, *>
    assertEquals(1450, goals["consumed"])
    val first = (goals["nutrients"] as List<*>)[0] as Map<*, *>
    assertFalse(first.containsKey("goal"))
    assertEquals(GarminWire.estimateSerializedBytes(outbound.message), outbound.estimatedBytes)
    assertTrue(outbound.estimatedBytes >= Serializer.serialize(outbound.message).size)
  }

  @Test
  fun messagesOverTheCapDoNotFit() {
    val small = GarminOutboundMessage.prepare(snapshotFromJs())
    assertTrue(small.fits())
    assertTrue(small.fits(small.estimatedBytes))
    assertFalse(small.fits(small.estimatedBytes - 1))

    val large = GarminOutboundMessage.prepare(snapshotFromJs(nutrients = 200))
    assertTrue(large.estimatedBytes > GARMIN_MESSAGE_BYTE_CAP)
    assertFalse(large.fits())
  }

  @Test
  fun theCachedCopyReadsBackAsTheSameMessage() {
    val outbound = GarminOutboundMessage.prepare(snapshotFromJs())
    val back = GarminOutboundMessage.fromJson(outbound.toJson())
    assertNotNull(back)
    assertEquals(outbound.message, back!!.message)
    assertEquals(outbound.estimatedBytes, back.estimatedBytes)
  }

  @Test
  fun aBrokenCachedCopyIsIgnored() {
    assertNull(GarminOutboundMessage.fromJson("not json"))
    assertNull(GarminOutboundMessage.fromJson("[1,2]"))
    assertNull(GarminOutboundMessage.fromJson(""))
  }

  @Test
  fun theAccountClearedMessageIsTypeAndVersionOnly() {
    val message = GarminOutboundMessage.accountCleared()
    assertEquals(mapOf("type" to "accountCleared", "v" to 1), message.message)
    assertTrue(message.fits())
  }

  @Test
  fun anAccountClearedFromJsGoesOutAsTheLinksOwn() {
    // JS sends it through sendGarminMessage on a resync while signed out;
    // `ReadableMap.toHashMap` hands `v` over as a Double.
    val fromJs = GarminOutboundMessage.prepare(hashMapOf<String, Any?>("type" to "accountCleared", "v" to 1.0))
    val own = GarminOutboundMessage.accountCleared()
    assertEquals(own.message, fromJs.message)
    assertEquals(own.estimatedBytes, fromJs.estimatedBytes)
    assertEquals(GARMIN_TYPE_ACCOUNT_CLEARED, fromJs.type)
  }

  @Test
  fun eachSendCarriesItsNumberAndOriginWithoutChangingTheMessage() {
    val message = GarminOutboundMessage.accountCleared()
    val origin = GarminSendSequence.newOrigin()
    val sent = message.sentAs(Long.MAX_VALUE, origin)
    assertEquals(
      mapOf("type" to "accountCleared", "v" to 1, "seq" to Long.MAX_VALUE, "origin" to origin),
      sent
    )
    assertEquals(mapOf("type" to "accountCleared", "v" to 1), message.message)
    // The room kept for them covers their real size.
    val bare = GarminWire.estimateSerializedBytes(message.message)
    val numbered = GarminWire.estimateSerializedBytes(sent)
    assertTrue(numbered - bare <= GARMIN_STAMP_BYTES)
    assertEquals(GARMIN_MESSAGE_BYTE_CAP - GARMIN_STAMP_BYTES, GARMIN_SEND_CAP_BYTES)
  }

  @Test
  fun eachInstallGetsItsOwnOrigin() {
    val a = GarminSendSequence.newOrigin()
    val b = GarminSendSequence.newOrigin()
    assertEquals(12, a.length)
    assertTrue(a != b)
  }

  @Test
  fun anOriginRestoredFromAnotherInstallIsNotKept() {
    assertTrue(GarminSendSequence.originIsCurrent("abc", 1_000L, 1_000L))
    // Android restored or copied the preferences: another install time.
    assertFalse(GarminSendSequence.originIsCurrent("abc", 1_000L, 2_000L))
    // Stored before the install time was (0 = none stored).
    assertFalse(GarminSendSequence.originIsCurrent("abc", 0L, 2_000L))
    // The install time cannot be read: keep it.
    assertTrue(GarminSendSequence.originIsCurrent("abc", 0L, null))
    assertFalse(GarminSendSequence.originIsCurrent("", 1_000L, 1_000L))
    assertFalse(GarminSendSequence.originIsCurrent(null, 1_000L, 1_000L))
  }

  @Test
  fun theSendNumberOnlyRises() {
    assertEquals(1_000L, GarminSendSequence.next(0L, 1_000L))
    // Several sends within one millisecond.
    assertEquals(1_001L, GarminSendSequence.next(1_000L, 1_000L))
    // The clock went back: the number still rises.
    assertEquals(5_001L, GarminSendSequence.next(5_000L, 1_000L))
    // A stored value lost: the clock keeps it ahead of the last one sent.
    assertEquals(9_000L, GarminSendSequence.next(0L, 9_000L))
  }

  @Test
  fun onlyRequestContextIsAcceptedFromTheWatch() {
    assertEquals(setOf("requestContext"), GARMIN_INBOUND_TYPES)
  }
}
