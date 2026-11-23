import { invalidateFoodCache } from '../../hooks/invalidateFoodCache';
import { queryClient } from '../../hooks/queryClient';
import { createFoodEntry } from '../../services/api/foodEntriesApi';
import { ApiError } from '../../services/api/errors';
import {
  FOOD_ENTRY_CREATE,
  FOOD_ENTRY_PAYLOAD_VERSION,
  type FoodEntryCreatePayload,
} from '../foodEntryHandOver';
import { sendResultFromError } from '../syncEngine';
import type {
  OutboxHandler,
  OutboxRow,
  SendContext,
  SendResult,
} from '../types';
import { registerOutboxHandler } from './registry';

async function sendCreate(
  row: OutboxRow,
  context?: SendContext
): Promise<SendResult> {
  const payload = row.payload as FoodEntryCreatePayload;
  try {
    // The key is the entry's own id; the server answers a repeat with the
    // entry it stored and logs nothing, so a retry is always safe.
    await createFoodEntry(
      { ...payload, client_id: row.entityId },
      context?.serverConfig
    );
    return { outcome: 'synced' };
  } catch (error) {
    // The food or serving was deleted while the entry waited (404), or the
    // server refuses the request itself (400): retrying cannot help, so it
    // is kept for the person to see.
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
  kind: FOOD_ENTRY_CREATE,
  payloadVersion: FOOD_ENTRY_PAYLOAD_VERSION,
  // Version 1 is the first shape; nothing older exists to convert.
  upgrade: (payload) => payload,
  send: sendCreate,
  onSynced: (row) => {
    if (row.entryDate) invalidateFoodCache(queryClient, row.entryDate);
  },
};

/** Makes queued food entries sendable. Called once at app start. */
export function registerFoodEntryHandlers(): void {
  registerOutboxHandler(handler);
}
