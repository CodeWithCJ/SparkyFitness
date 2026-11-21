import { invalidateWaterIntakeQueries } from '../../hooks/invalidateWaterIntake';
import { queryClient } from '../../hooks/queryClient';
import { changeWaterIntake } from '../../services/api/measurementsApi';
import { ApiError } from '../../services/api/errors';
import { sendResultFromError } from '../syncEngine';
import type { OutboxHandler, OutboxRow, SendResult } from '../types';
import {
  WATER_ADD,
  WATER_PAYLOAD_VERSION,
  type WaterAddPayload,
} from '../waterHandOver';
import { registerOutboxHandler } from './registry';

async function sendAdd(row: OutboxRow): Promise<SendResult> {
  const { entryDate, containerId } = row.payload as WaterAddPayload;
  try {
    // The key is the press's own id; the server answers a repeat with the
    // current totals and logs nothing, so a retry is always safe.
    await changeWaterIntake({
      entryDate,
      changeDrinks: 1,
      containerId,
      clientId: row.entityId,
    });
    return { outcome: 'synced' };
  } catch (error) {
    // The container was deleted while the drink waited. The server logs the
    // default amount for an unknown id, so this is not reached today, but a
    // refusal of the request itself is kept for the person, not retried.
    if (error instanceof ApiError && error.statusCode === 400) {
      return {
        outcome: 'failed',
        error: `${error.statusCode}: ${error.body ?? error.message}`,
      };
    }
    return sendResultFromError(error);
  }
}

const handler: OutboxHandler = {
  kind: WATER_ADD,
  payloadVersion: WATER_PAYLOAD_VERSION,
  // Version 1 is the first shape; nothing older exists to convert.
  upgrade: (payload) => payload,
  send: sendAdd,
  onSynced: (row) => {
    if (row.entryDate) invalidateWaterIntakeQueries(queryClient, row.entryDate);
  },
};

/** Makes queued drinks sendable. Called once at app start. */
export function registerWaterIntakeHandlers(): void {
  registerOutboxHandler(handler);
}
