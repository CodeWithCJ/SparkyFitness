/**
 * Synchronous duplicate-press guard for save actions.
 *
 * `disabled`/`busy` props are React state derived from a mutation's isPending,
 * and state does not commit until the next render — so when the JS thread has
 * been blocked and several queued taps are delivered back to back, every one of
 * them runs against the stale props and fires the save again. That is how one
 * Save press became half a dozen identical food entries (#2191).
 *
 * Deliberately time-based rather than a latch released on `busy`: not every
 * save reports a pending state (some handlers are local and synchronous), and a
 * latch waiting on a `busy` that never arrives would leave the button dead.
 */

/**
 * Presses closer together than this are treated as one. Comfortably longer
 * than the gap between taps replayed from a blocked JS thread, comfortably
 * shorter than a deliberate second save.
 */
export const DUPLICATE_PRESS_WINDOW_MS = 700;

/**
 * Builds a guard shared by every save surface a screen exposes.
 *
 * Keyed so one guard can cover several actions (the header hook registers one
 * handler per action id) while keeping their windows independent. Callers that
 * guard a single button can pass a constant key.
 *
 * Returns true when the press should run, false when it is a duplicate.
 */
export const createDuplicatePressGuard = (
  windowMs: number = DUPLICATE_PRESS_WINDOW_MS,
): ((key: string) => boolean) => {
  const lastPressAt = new Map<string, number>();
  return (key: string): boolean => {
    const now = Date.now();
    const previous = lastPressAt.get(key);
    // `now < previous` means the wall clock moved backwards (an NTP correction,
    // or the user changing the device time). Without the lower bound the
    // negative elapsed time reads as "too soon" and the button stays dead until
    // wall time catches up — potentially hours.
    if (previous !== undefined && now >= previous && now - previous < windowMs) {
      return false;
    }
    lastPressAt.set(key, now);
    return true;
  };
};
