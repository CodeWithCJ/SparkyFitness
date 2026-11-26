import { changeWaterIntake } from '../services/api/measurementsApi';
import { ApiError } from '../services/api/errors';
import type { WaterIntakeResponse } from '../types/measurements';
import { newUuid } from '../utils/ids';
import { accountGeneration } from './accountGeneration';
import { queueAfterConnectionFailure } from './queueAfterFailure';
import { queueWaterDrink, removeLatestDrinkOffline } from './waterHandOver';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What logging a drink came to: the server's answer, or a waiting upload. */
export type DrinkResult =
  | { queued: false; response: WaterIntakeResponse }
  | { queued: true; replayKey?: string };

/**
 * Logs one drink. It carries a replay key from the first request on, so a
 * request that reached the server but lost its answer cannot log twice when
 * it is sent again. When the server cannot be reached the drink is kept on
 * the phone and uploads later, never after a timeout (the server may have
 * seen that request, and a person is told it failed instead of risking a
 * second drink). Shared by every place on the phone that logs a drink.
 */
export async function logDrinkOrQueue(
  entryDate: string,
  containerId: number,
  /**
   * The replay key of a press that arrives more than once (the watch sends a
   * tap again until it is acknowledged): the same key is the same drink, on
   * the server and in the waiting queue. Without one a fresh key is made.
   */
  pressKey?: string
): Promise<DrinkResult> {
  const clientId =
    pressKey && UUID_PATTERN.test(pressKey) ? pressKey : newUuid();
  const startedUnder = accountGeneration();
  try {
    const response = await changeWaterIntake({
      entryDate,
      changeDrinks: 1,
      containerId,
      clientId,
    });
    return { queued: false, response };
  } catch (error) {
    const queued = await queueAfterConnectionFailure(
      error,
      () => queueWaterDrink(clientId, { entryDate, containerId }),
      startedUnder
    );
    if (queued) {
      return pressKey !== undefined
        ? { queued: true, replayKey: clientId }
        : { queued: true };
    }
    throw error;
  }
}

/** What taking a drink off came to. */
export type DrinkRemoval =
  | { kept: false; response: WaterIntakeResponse }
  /** Done on the phone: it uploads when the server can be reached. */
  | { kept: true; result: 'cancelled' | 'queued' | 'none' | 'busy' };

/**
 * Takes the latest drink of the day off. The request is not keyed (the server
 * removes the latest drink each time), so it only waits on the phone when it
 * certainly never arrived, never after a timeout; the phone then removes the
 * latest drink it knows of by its id, which is safe to send again.
 */
export async function removeDrinkOrQueue(
  entryDate: string,
  containerId: number
): Promise<DrinkRemoval> {
  const startedUnder = accountGeneration();
  try {
    const response = await changeWaterIntake({
      entryDate,
      changeDrinks: -1,
      containerId,
    });
    return { kept: false, response };
  } catch (error) {
    let result: 'cancelled' | 'queued' | 'none' | 'busy' = 'none';
    // Only a failure that says the request never arrived is replayed. A
    // server error, a gateway timeout or "too many requests" can come after
    // the server already took the drink off, and sending it again would take
    // a second one; "bad gateway" and "unavailable" say the server never got
    // it.
    if (
      error instanceof ApiError &&
      error.statusCode !== 502 &&
      error.statusCode !== 503
    ) {
      throw error;
    }
    const kept = await queueAfterConnectionFailure(
      error,
      async () => {
        result = await removeLatestDrinkOffline(entryDate);
        // Nothing was written when there was nothing to take off, the phone
        // could not store it, or the drink is mid-upload: not a kept change.
        return result !== 'none' && result !== 'busy';
      },
      startedUnder
    );
    if (kept) return { kept: true, result };
    throw error;
  }
}
