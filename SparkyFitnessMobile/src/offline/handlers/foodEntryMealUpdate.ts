import { invalidateFoodCache } from '../../hooks/invalidateFoodCache';
import { queryClient } from '../../hooks/queryClient';
import { invalidateMealUsageCaches } from '../../hooks/useMeals';
import { updateFoodEntryMeal } from '../../services/api/foodEntryMealsApi';
import { ApiError } from '../../services/api/errors';
import {
  FOOD_ENTRY_MEAL_UPDATE,
  FOOD_ENTRY_MEAL_UPDATE_PAYLOAD_VERSION,
  type FoodEntryMealUpdatePayload,
} from '../foodEntryMealUpdateHandOver';
import { sendResultFromError } from '../syncEngine';
import type { OutboxHandler, OutboxRow, SendResult } from '../types';
import { registerOutboxHandler } from './registry';

async function sendUpdate(row: OutboxRow): Promise<SendResult> {
  const { patch } = row.payload as FoodEntryMealUpdatePayload;
  try {
    // The request holds the whole meal, so sending it twice leaves the same
    // meal.
    await updateFoodEntryMeal(row.entityId, patch);
    return { outcome: 'synced' };
  } catch (error) {
    if (error instanceof ApiError) {
      // The meal was deleted meanwhile: nothing is left to change.
      if (error.statusCode === 404) return { outcome: 'synced' };
      if (error.statusCode === 400 || error.statusCode === 403) {
        return {
          outcome: 'failed',
          error: `${error.statusCode}: ${error.body ?? error.message}`,
        };
      }
    }
    return sendResultFromError(error);
  }
}

const handler: OutboxHandler = {
  kind: FOOD_ENTRY_MEAL_UPDATE,
  payloadVersion: FOOD_ENTRY_MEAL_UPDATE_PAYLOAD_VERSION,
  upgrade: (payload) => payload,
  send: sendUpdate,
  onSynced: (row) => {
    if (row.entryDate) invalidateFoodCache(queryClient, row.entryDate);
    const { patch } = row.payload as FoodEntryMealUpdatePayload;
    if (patch.entry_date && patch.entry_date !== row.entryDate) {
      invalidateFoodCache(queryClient, patch.entry_date);
    }
    invalidateMealUsageCaches(queryClient);
  },
};

/** Makes queued logged-meal changes sendable. Called once at app start. */
export function registerFoodEntryMealUpdateHandlers(): void {
  registerOutboxHandler(handler);
}
