import { invalidateFoodCache } from '../../hooks/invalidateFoodCache';
import { queryClient } from '../../hooks/queryClient';
import { updateFoodEntry } from '../../services/api/foodEntriesApi';
import { ApiError } from '../../services/api/errors';
import {
  FOOD_ENTRY_UPDATE,
  FOOD_ENTRY_UPDATE_PAYLOAD_VERSION,
  type FoodEntryUpdatePayload,
} from '../foodEntryUpdateHandOver';
import { sendResultFromError } from '../syncEngine';
import type { OutboxHandler, OutboxRow, SendResult } from '../types';
import { registerOutboxHandler } from './registry';

async function sendUpdate(row: OutboxRow): Promise<SendResult> {
  const { quantity } = row.payload as FoodEntryUpdatePayload;
  try {
    // Setting an amount twice leaves the same amount, so a repeat is safe.
    await updateFoodEntry(row.entityId, { quantity });
    return { outcome: 'synced' };
  } catch (error) {
    if (error instanceof ApiError) {
      // The entry was deleted meanwhile: nothing is left to change.
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
  kind: FOOD_ENTRY_UPDATE,
  payloadVersion: FOOD_ENTRY_UPDATE_PAYLOAD_VERSION,
  upgrade: (payload) => payload,
  send: sendUpdate,
  onSynced: (row) => {
    if (row.entryDate) invalidateFoodCache(queryClient, row.entryDate);
  },
};

/** Makes queued amount changes sendable. Called once at app start. */
export function registerFoodEntryUpdateHandlers(): void {
  registerOutboxHandler(handler);
}
