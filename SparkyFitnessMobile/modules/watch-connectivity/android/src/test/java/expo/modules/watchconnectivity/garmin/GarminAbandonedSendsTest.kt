package expo.modules.watchconnectivity.garmin

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GarminAbandonedSendsTest {
  private val watch = 101L
  private val otherWatch = 202L

  @Test
  fun aWatchIsHeldBackOnlyAfterASendToItWasGivenUp() {
    val sends = GarminAbandonedSends(graceMs = 30_000)
    assertFalse(sends.blocks(watch, now = 0))
    sends.abandon(watch, seq = 5, now = 1_000)
    assertTrue(sends.blocks(watch, now = 1_000))
    assertTrue(sends.blocks(watch, now = 30_999))
  }

  @Test
  fun otherWatchesKeepFlowing() {
    val sends = GarminAbandonedSends(graceMs = 30_000)
    sends.abandon(watch, seq = 5, now = 0)
    assertFalse(sends.blocks(otherWatch, now = 1))
  }

  @Test
  fun theGracePeriodFreesTheWatch() {
    val sends = GarminAbandonedSends(graceMs = 30_000)
    sends.abandon(watch, seq = 5, now = 1_000)
    assertFalse(sends.blocks(watch, now = 31_000))
    // Expired and dropped: the late status of that send is no longer awaited.
    assertFalse(sends.lateStatus(watch, seq = 5))
  }

  @Test
  fun theGivenUpSendsOwnStatusFreesTheWatchAndIsDiscarded() {
    val sends = GarminAbandonedSends(graceMs = 30_000)
    sends.abandon(watch, seq = 5, now = 0)
    assertTrue(sends.lateStatus(watch, seq = 5))
    assertFalse(sends.blocks(watch, now = 1))
    // Answered once only.
    assertFalse(sends.lateStatus(watch, seq = 5))
  }

  @Test
  fun aStatusForAnotherSendOrWatchDoesNotFreeIt() {
    val sends = GarminAbandonedSends(graceMs = 30_000)
    sends.abandon(watch, seq = 5, now = 0)
    assertFalse(sends.lateStatus(watch, seq = 4))
    assertFalse(sends.lateStatus(otherWatch, seq = 5))
    assertTrue(sends.blocks(watch, now = 1))
  }

  @Test
  fun aNewerAbandonOnTheSameWatchReplacesTheOlderOne() {
    val sends = GarminAbandonedSends(graceMs = 30_000)
    sends.abandon(watch, seq = 5, now = 0)
    sends.abandon(watch, seq = 9, now = 40_000)
    // The SDK only kept send 9's listener, so 5 can no longer answer.
    assertFalse(sends.lateStatus(watch, seq = 5))
    assertTrue(sends.blocks(watch, now = 69_999))
    assertTrue(sends.lateStatus(watch, seq = 9))
  }

  @Test
  fun clearFreesEveryWatch() {
    val sends = GarminAbandonedSends(graceMs = 30_000)
    sends.abandon(watch, seq = 5, now = 0)
    sends.abandon(otherWatch, seq = 6, now = 0)
    sends.clear()
    assertFalse(sends.blocks(watch, now = 1))
    assertFalse(sends.blocks(otherWatch, now = 1))
  }
}
