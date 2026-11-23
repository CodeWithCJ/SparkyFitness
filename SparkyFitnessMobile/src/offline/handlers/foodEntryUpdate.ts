import { invalidateFoodCache } from '../../hooks/invalidateFoodCache';
import { queryClient } from '../../hooks/queryClient';
import { updateFoodEntry } from '../../services/api/foodEntriesApi';
import { ApiError } from '../../services/api/errors';
import {
  FOOD_ENTRY_UPDATE,
  FOOD_ENTRY_UPDATE_PAYLOAD_VERSION,
  upgradeFoodEntryUpdate,
  type FoodEntryUpdatePayload,
} from '../foodEntryUpdateHandOver';
import { sendResultFromError } from '../syncEngine';
import type {
  OutboxHandler,
  OutboxRow,
  SendContext,
  SendResult,
} from '../types';
import { registerOutboxHandler } from './registry';

async function sendUpdate(
  row: OutboxRow,
  context?: SendContext
): Promise<SendResult> {
  const { patch } = row.payload as FoodEntryUpdatePayload;
  try {
    // Setting values twice leaves the same values, so a repeat is safe.
    await updateFoodEntry(row.entityId, patch, context?.serverConfig);
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
  upgrade: upgradeFoodEntryUpdate,
  send: sendUpdate,
  onSynced: (row) => {
    if (row.entryDate) invalidateFoodCache(queryClient, row.entryDate);
    // A move to another day changes that day too.
    const { display } = row.payload as FoodEntryUpdatePayload;
    if (display.entry_date && display.entry_date !== row.entryDate) {
      invalidateFoodCache(queryClient, display.entry_date);
    }
  },
};

/** Makes queued amount changes sendable. Called once at app start. */
export function registerFoodEntryUpdateHandlers(): void {
  registerOutboxHandler(handler);
}
