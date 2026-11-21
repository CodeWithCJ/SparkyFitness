import { changeWaterIntake } from '../services/api/measurementsApi';
import type { WaterIntakeResponse } from '../types/measurements';
import { newUuid } from '../utils/ids';
import { queueAfterConnectionFailure } from './queueAfterFailure';
import { queueWaterDrink, removeLatestDrinkOffline } from './waterHandOver';

/** What logging a drink came to: the server's answer, or a waiting upload. */
export type DrinkResult =
  { queued: false; response: WaterIntakeResponse } | { queued: true };

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
  containerId: number
): Promise<DrinkResult> {
  const clientId = newUuid();
  try {
    const response = await changeWaterIntake({
      entryDate,
      changeDrinks: 1,
      containerId,
      clientId,
    });
    return { queued: false, response };
  } catch (error) {
    const queued = await queueAfterConnectionFailure(error, () =>
      queueWaterDrink(clientId, { entryDate, containerId })
    );
    if (queued) return { queued: true };
    throw error;
  }
}

/** What taking a drink off came to. */
export type DrinkRemoval =
  | { kept: false; response: WaterIntakeResponse }
  /** Done on the phone: it uploads when the server can be reached. */
  | { kept: true; result: 'cancelled' | 'queued' | 'none' };

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
  try {
    const response = await changeWaterIntake({
      entryDate,
      changeDrinks: -1,
      containerId,
    });
    return { kept: false, response };
  } catch (error) {
    let result: 'cancelled' | 'queued' | 'none' = 'none';
    const kept = await queueAfterConnectionFailure(error, async () => {
      result = await removeLatestDrinkOffline(entryDate);
      return true;
    });
    if (kept) return { kept: true, result };
    throw error;
  }
}
