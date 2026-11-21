import { invalidateFoodCache } from '../../hooks/invalidateFoodCache';
import { queryClient } from '../../hooks/queryClient';
import { deleteFoodEntry } from '../../services/api/foodEntriesApi';
import { ApiError } from '../../services/api/errors';
import {
  FOOD_ENTRY_DELETE,
  FOOD_ENTRY_DELETE_PAYLOAD_VERSION,
} from '../foodEntryDeleteHandOver';
import { sendResultFromError } from '../syncEngine';
import type { OutboxHandler, OutboxRow, SendResult } from '../types';
import { registerOutboxHandler } from './registry';

async function sendDelete(row: OutboxRow): Promise<SendResult> {
  try {
    await deleteFoodEntry(row.entityId);
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
  kind: FOOD_ENTRY_DELETE,
  payloadVersion: FOOD_ENTRY_DELETE_PAYLOAD_VERSION,
  // Version 1 is the first shape; nothing older exists to convert.
  upgrade: (payload) => payload,
  send: sendDelete,
  onSynced: (row) => {
    if (row.entryDate) invalidateFoodCache(queryClient, row.entryDate);
  },
};

/** Makes queued food entry removals sendable. Called once at app start. */
export function registerFoodEntryDeleteHandlers(): void {
  registerOutboxHandler(handler);
}
