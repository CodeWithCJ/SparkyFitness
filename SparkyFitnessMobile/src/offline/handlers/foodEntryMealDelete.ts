import { invalidateFoodCache } from '../../hooks/invalidateFoodCache';
import { queryClient } from '../../hooks/queryClient';
import { invalidateMealUsageCaches } from '../../hooks/useMeals';
import { deleteFoodEntryMeal } from '../../services/api/foodEntryMealsApi';
import { ApiError } from '../../services/api/errors';
import {
  FOOD_ENTRY_MEAL_DELETE,
  FOOD_ENTRY_MEAL_DELETE_PAYLOAD_VERSION,
} from '../foodEntryMealDeleteHandOver';
import { sendResultFromError } from '../syncEngine';
import type { OutboxHandler, OutboxRow, SendResult } from '../types';
import { registerOutboxHandler } from './registry';

async function sendDelete(row: OutboxRow): Promise<SendResult> {
  try {
    await deleteFoodEntryMeal(row.entityId);
    return { outcome: 'synced' };
  } catch (error) {
    // Already gone is what was asked for.
    if (error instanceof ApiError && error.statusCode === 404) {
      return { outcome: 'synced' };
    }
    return sendResultFromError(error);
  }
}

const handler: OutboxHandler = {
  kind: FOOD_ENTRY_MEAL_DELETE,
  payloadVersion: FOOD_ENTRY_MEAL_DELETE_PAYLOAD_VERSION,
  upgrade: (payload) => payload,
  send: sendDelete,
  onSynced: (row) => {
    if (row.entryDate) invalidateFoodCache(queryClient, row.entryDate);
    invalidateMealUsageCaches(queryClient);
  },
};

/** Makes queued logged-meal removals sendable. Called once at app start. */
export function registerFoodEntryMealDeleteHandlers(): void {
  registerOutboxHandler(handler);
}
