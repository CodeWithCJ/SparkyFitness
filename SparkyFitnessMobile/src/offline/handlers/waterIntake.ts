import { invalidateWaterIntakeQueries } from '../../hooks/invalidateWaterIntake';
import { queryClient } from '../../hooks/queryClient';
import {
  changeWaterIntake,
  deleteWaterIntakeLogEntry,
  logCustomWaterAmount,
} from '../../services/api/measurementsApi';
import { invalidateFoodCache } from '../../hooks/invalidateFoodCache';
import { ApiError } from '../../services/api/errors';
import { sendResultFromError } from '../syncEngine';
import type {
  OutboxHandler,
  OutboxRow,
  SendContext,
  SendResult,
} from '../types';
import {
  WATER_ADD,
  WATER_PAYLOAD_VERSION,
  WATER_ADD_CUSTOM,
  WATER_ADD_CUSTOM_PAYLOAD_VERSION,
  WATER_REMOVE,
  WATER_REMOVE_PAYLOAD_VERSION,
  type WaterAddPayload,
  type WaterAddCustomPayload,
  type WaterRemovePayload,
} from '../waterHandOver';
import { registerOutboxHandler } from './registry';

async function sendAdd(
  row: OutboxRow,
  context?: SendContext
): Promise<SendResult> {
  const { entryDate, containerId } = row.payload as WaterAddPayload;
  try {
    // The key is the press's own id; the server answers a repeat with the
    // current totals and logs nothing, so a retry is always safe.
    await changeWaterIntake({
      entryDate,
      changeDrinks: 1,
      containerId,
      clientId: row.entityId,
      serverConfig: context?.serverConfig,
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

async function sendAddCustom(
  row: OutboxRow,
  context?: SendContext
): Promise<SendResult> {
  const { entryDate, waterMl } = row.payload as WaterAddCustomPayload;
  try {
    await logCustomWaterAmount({
      entryDate,
      waterMl,
      clientId: row.entityId,
      serverConfig: context?.serverConfig,
    });
    return { outcome: 'synced' };
  } catch (error) {
    return sendResultFromError(error);
  }
}

const customAmountHandler: OutboxHandler = {
  kind: WATER_ADD_CUSTOM,
  payloadVersion: WATER_ADD_CUSTOM_PAYLOAD_VERSION,
  // Version 1 is the first shape; nothing older exists to convert.
  upgrade: (payload) => payload,
  send: sendAddCustom,
  onSynced: (row) => {
    if (row.entryDate) invalidateWaterIntakeQueries(queryClient, row.entryDate);
  },
};

async function sendRemove(
  row: OutboxRow,
  context?: SendContext
): Promise<SendResult> {
  const { logEntryId } = row.payload as WaterRemovePayload;
  try {
    await deleteWaterIntakeLogEntry(logEntryId, context?.serverConfig);
    return { outcome: 'synced' };
  } catch (error) {
    // Already gone is what was asked for.
    if (error instanceof ApiError && error.statusCode === 404) {
      return { outcome: 'synced' };
    }
    return sendResultFromError(error);
  }
}

const removeHandler: OutboxHandler = {
  kind: WATER_REMOVE,
  payloadVersion: WATER_REMOVE_PAYLOAD_VERSION,
  upgrade: (payload) => payload,
  send: sendRemove,
  onSynced: (row) => {
    if (!row.entryDate) return;
    invalidateWaterIntakeQueries(queryClient, row.entryDate);
    // A linked container's drink took its food entry with it.
    if ((row.payload as WaterRemovePayload).foodEntryId) {
      invalidateFoodCache(queryClient, row.entryDate);
    }
  },
};

/** Makes queued drinks sendable. Called once at app start. */
export function registerWaterIntakeHandlers(): void {
  registerOutboxHandler(handler);
  registerOutboxHandler(customAmountHandler);
  registerOutboxHandler(removeHandler);
}
