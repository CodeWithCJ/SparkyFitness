import { invalidateFoodCache } from '../../hooks/invalidateFoodCache';
import { foodsQueryKey } from '../../hooks/queryKeys';
import { queryClient } from '../../hooks/queryClient';
import { createFoodEntry } from '../../services/api/foodEntriesApi';
import { ApiError } from '../../services/api/errors';
import { saveFood } from '../../services/api/foodsApi';
import {
  FOOD_CREATE,
  FOOD_CREATE_PAYLOAD_VERSION,
  type FoodCreatePayload,
} from '../foodCreateHandOver';
import { sendResultFromError } from '../syncEngine';
import type { OutboxHandler, OutboxRow, SendResult } from '../types';
import { registerOutboxHandler } from './registry';

async function sendCreate(row: OutboxRow): Promise<SendResult> {
  const payload = row.payload as FoodCreatePayload;
  try {
    // The food's key makes this safe to send again: a repeat of a request
    // that already created it is answered with that food.
    const food = await saveFood({
      ...payload.food,
      client_id: payload.foodClientId,
    });
    const variant = food.default_variant;
    if (!variant?.id) {
      return { outcome: 'failed', error: 'The server returned no serving.' };
    }
    // The entry's key is the row's own id, as for any queued entry.
    await createFoodEntry({
      ...payload.entry,
      food_id: food.id,
      variant_id: variant.id,
      unit: variant.serving_unit,
      client_id: row.entityId,
    });
    return { outcome: 'synced' };
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.statusCode === 400 || error.statusCode === 404)
    ) {
      return {
        outcome: 'failed',
        error: `${error.statusCode}: ${error.body ?? error.message}`,
      };
    }
    return sendResultFromError(error);
  }
}

const handler: OutboxHandler = {
  kind: FOOD_CREATE,
  payloadVersion: FOOD_CREATE_PAYLOAD_VERSION,
  upgrade: (payload) => payload,
  send: sendCreate,
  onSynced: (row) => {
    queryClient.invalidateQueries({ queryKey: [...foodsQueryKey] });
    if (row.entryDate) invalidateFoodCache(queryClient, row.entryDate);
  },
};

/** Makes queued new foods sendable. Called once at app start. */
export function registerFoodCreateHandlers(): void {
  registerOutboxHandler(handler);
}
