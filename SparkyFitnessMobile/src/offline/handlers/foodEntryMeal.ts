import { invalidateFoodCache } from '../../hooks/invalidateFoodCache';
import { queryClient } from '../../hooks/queryClient';
import { createFoodEntryMeal } from '../../services/api/foodEntryMealsApi';
import { ApiError } from '../../services/api/errors';
import {
  FOOD_ENTRY_MEAL_CREATE,
  FOOD_ENTRY_MEAL_PAYLOAD_VERSION,
  type FoodEntryMealPayload,
} from '../foodEntryMealHandOver';
import { sendResultFromError } from '../syncEngine';
import type { OutboxHandler, OutboxRow, SendResult } from '../types';
import { registerOutboxHandler } from './registry';

async function sendCreate(row: OutboxRow): Promise<SendResult> {
  const payload = row.payload as FoodEntryMealPayload;
  try {
    // The key is the meal's own id; the server answers a repeat with the meal
    // it stored and logs nothing, so a retry is always safe.
    await createFoodEntryMeal({ ...payload, client_id: row.entityId });
    return { outcome: 'synced' };
  } catch (error) {
    // The meal or a food in it was deleted while the entry waited (404), or
    // the server refuses the request itself (400): retrying cannot help, so
    // it is kept for the person to see.
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
  kind: FOOD_ENTRY_MEAL_CREATE,
  payloadVersion: FOOD_ENTRY_MEAL_PAYLOAD_VERSION,
  // Version 1 is the first shape; nothing older exists to convert.
  upgrade: (payload) => payload,
  send: sendCreate,
  onSynced: (row) => {
    if (row.entryDate) invalidateFoodCache(queryClient, row.entryDate);
  },
};

/** Makes queued logged meals sendable. Called once at app start. */
export function registerFoodEntryMealHandlers(): void {
  registerOutboxHandler(handler);
}
