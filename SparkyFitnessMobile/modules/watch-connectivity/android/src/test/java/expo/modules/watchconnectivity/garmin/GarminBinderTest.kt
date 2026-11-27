package expo.modules.watchconnectivity.garmin

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GarminBinderTest {
  private val version = 51_000L
  private val day = GARMIN_BINDER_RETRY_AFTER_REJECTION_MS

  private fun rejected(at: Long, gcVersion: Long = version) =
    GarminBinderRecord(GarminBinderOutcome.REJECTED, gcVersion, at)

  @Test
  fun deliveryWireStringsMatchTheJsContract() {
    assertEquals(listOf("binder", "broadcast", "simulator", "none"), GarminDelivery.values().map { it.wire })
  }

  @Test
  fun aFirstAttemptAndAConfirmedOneAreAlwaysTried() {
    assertTrue(GarminBinderPolicy.shouldAttempt(null, version, nowMillis = 0))
    val confirmed = GarminBinderRecord(GarminBinderOutcome.CONFIRMED, version, atMillis = 1_000)
    assertTrue(GarminBinderPolicy.shouldAttempt(confirmed, version, nowMillis = 1_001))
  }

  @Test
  fun aRejectionWaitsADayWithTheSameGarminConnect() {
    val record = rejected(at = 10_000)
    assertFalse(GarminBinderPolicy.shouldAttempt(record, version, nowMillis = 10_000))
    assertFalse(GarminBinderPolicy.shouldAttempt(record, version, nowMillis = 10_000 + day - 1))
    assertTrue(GarminBinderPolicy.shouldAttempt(record, version, nowMillis = 10_000 + day))
  }

  @Test
  fun anInconclusiveProbeIsTriedAgainAtTheNextStart() {
    val record = GarminBinderRecord(GarminBinderOutcome.UNCONFIRMED, version, atMillis = 10_000, timeouts = 1)
    assertTrue(GarminBinderPolicy.shouldAttempt(record, version, nowMillis = 10_001))
  }

  @Test
  fun timeoutsAfterAConfirmationAreInconclusiveUntilTheLimit() {
    var record: GarminBinderRecord = GarminBinderRecord(GarminBinderOutcome.CONFIRMED, version, atMillis = 1_000)
    for (expected in 1 until GARMIN_BINDER_TIMEOUTS_BEFORE_REJECTION) {
      record = GarminBinderPolicy.afterFailure(record, timedOut = true, garminConnectVersion = version, nowMillis = 2_000)
      assertEquals(GarminBinderRecord(GarminBinderOutcome.UNCONFIRMED, version, 2_000, expected), record)
    }
    record = GarminBinderPolicy.afterFailure(record, timedOut = true, garminConnectVersion = version, nowMillis = 3_000)
    assertEquals(rejected(at = 3_000), record)
  }

  @Test
  fun aTimeoutWithoutAnEarlierConfirmationIsARejection() {
    assertEquals(
      rejected(at = 2_000),
      GarminBinderPolicy.afterFailure(null, timedOut = true, garminConnectVersion = version, nowMillis = 2_000)
    )
    assertEquals(
      rejected(at = 2_000),
      GarminBinderPolicy.afterFailure(rejected(at = 5), timedOut = true, garminConnectVersion = version, nowMillis = 2_000)
    )
  }

  @Test
  fun aRegistrationThatThrewIsARejectionEvenAfterAConfirmation() {
    val confirmed = GarminBinderRecord(GarminBinderOutcome.CONFIRMED, version, atMillis = 1_000)
    assertEquals(
      rejected(at = 2_000),
      GarminBinderPolicy.afterFailure(confirmed, timedOut = false, garminConnectVersion = version, nowMillis = 2_000)
    )
  }

  @Test
  fun onlyARecordThatMayHoldARegistrationIsUnregisteredOnStop() {
    assertFalse(GarminBinderPolicy.mayHoldRegistration(null))
    assertFalse(GarminBinderPolicy.mayHoldRegistration(rejected(at = 5)))
    assertTrue(
      GarminBinderPolicy.mayHoldRegistration(GarminBinderRecord(GarminBinderOutcome.CONFIRMED, version, atMillis = 5))
    )
    assertTrue(
      GarminBinderPolicy.mayHoldRegistration(
        GarminBinderRecord(GarminBinderOutcome.UNCONFIRMED, version, atMillis = 5, timeouts = 2)
      )
    )
  }

  @Test
  fun anotherGarminConnectVersionIsTriedAtOnce() {
    assertTrue(GarminBinderPolicy.shouldAttempt(rejected(at = 10_000), version + 1, nowMillis = 10_001))
  }

  @Test
  fun aClockSetBackDoesNotBlockTheNextAttempt() {
    assertTrue(GarminBinderPolicy.shouldAttempt(rejected(at = 10_000), version, nowMillis = 9_999))
  }

  @Test
  fun aRecordRoundTrips() {
    val record = GarminBinderRecord(GarminBinderOutcome.CONFIRMED, version, 1_763_550_000_000)
    assertEquals(record, GarminBinderRecord.decode(record.encode()))
    assertEquals(rejected(at = 5), GarminBinderRecord.decode(rejected(at = 5).encode()))
    val unconfirmed = GarminBinderRecord(GarminBinderOutcome.UNCONFIRMED, version, 5, timeouts = 2)
    assertEquals("unconfirmed:51000:5:2", unconfirmed.encode())
    assertEquals(unconfirmed, GarminBinderRecord.decode(unconfirmed.encode()))
  }

  @Test
  fun anythingElseStoredReadsAsNoRecord() {
    assertNull(GarminBinderRecord.decode(null))
    assertNull(GarminBinderRecord.decode(""))
    assertNull(GarminBinderRecord.decode("confirmed:51000"))
    assertNull(GarminBinderRecord.decode("approved:51000:5"))
    assertNull(GarminBinderRecord.decode("rejected:x:5"))
    assertNull(GarminBinderRecord.decode("rejected:51000:5:extra"))
    assertNull(GarminBinderRecord.decode("confirmed:51000:5:1"))
    assertNull(GarminBinderRecord.decode("unconfirmed:51000:5"))
    assertNull(GarminBinderRecord.decode("unconfirmed:51000:5:0"))
    assertNull(GarminBinderRecord.decode("unconfirmed:51000:5:x"))
  }

  @Test
  fun onlyThisAppsIdIsAccepted() {
    assertTrue(isGarminAppId(GARMIN_APP_ID))
    assertTrue(isGarminAppId("E3C1758F-A6D7-4590-A5D4-7005E5806904"))
    assertFalse(isGarminAppId(null))
    assertFalse(isGarminAppId(""))
    assertFalse(isGarminAppId("a3c1758fa6d74590a5d47005e5806904"))
  }
}
