import type { FoodEntry } from '../types/foodEntries';
import type { UpdateFoodEntryPayload } from '../services/api/foodEntriesApi';
import { addLog } from '../services/LogService';
import { getActiveServerConfigId } from '../services/storage';
import { normalizeDate } from '../utils/dateUtils';
import { newUuid } from '../utils/ids';
import { getOfflineDb } from './db';
import { notifyOutboxChanged } from './events';
import { FOOD_CREATE, type FoodCreatePayload } from './foodCreateHandOver';
import {
  FOOD_ENTRY_CREATE,
  type FoodEntryCreatePayload,
} from './foodEntryHandOver';
import {
  FOOD_ENTRY_MEAL_CREATE,
  type FoodEntryMealPayload,
} from './foodEntryMealHandOver';
import { enqueueOutbox, listUnconfirmedOutbox } from './outbox';
import { signedInUserId } from './syncEngine';

/** Changes to a food entry the server has, waiting to upload. */
export const FOOD_ENTRY_UPDATE = 'food_entry.update';

/** The payload shape of `food_entry.update`, as this build writes it. */
export const FOOD_ENTRY_UPDATE_PAYLOAD_VERSION = 2;

export interface FoodEntryUpdatePayload {
  /** The request, as the server's update takes it. */
  patch: UpdateFoodEntryPayload;
  /** The entry fields it changes, as the Diary shows them while it waits. */
  display: Partial<FoodEntry>;
}

/** Version 1 held only a new amount. */
export function upgradeFoodEntryUpdate(
  payload: unknown,
  fromVersion: number
): FoodEntryUpdatePayload {
  if (fromVersion < 2) {
    const { quantity } = payload as { quantity: number };
    return { patch: { quantity }, display: { quantity } };
  }
  return payload as FoodEntryUpdatePayload;
}

/** The request fields that are also fields of the entry as the Diary shows it. */
const DISPLAY_KEYS = [
  'quantity',
  'unit',
  'meal_type_id',
  'entry_date',
  'entry_time',
  'notes',
  'variant_id',
  'cooked_quantity',
  'food_name',
  'brand_name',
  'serving_size',
  'serving_unit',
  'calories',
  'protein',
  'carbs',
  'fat',
  'saturated_fat',
  'sodium',
  'dietary_fiber',
  'sugars',
  'trans_fat',
  'potassium',
  'calcium',
  'iron',
  'caffeine_mg',
  'water_ml',
  'alcohol_g',
  'cholesterol',
  'vitamin_a',
  'vitamin_c',
] as const;

/**
 * What a change reads like on the entry: the fields the request carries, and
 * `preview` for what the server works out from them (a new serving's
 * nutrition, the name of a new meal).
 */
export function displayFromPatch(
  patch: UpdateFoodEntryPayload,
  preview: Partial<FoodEntry> = {}
): Partial<FoodEntry> {
  const display: Record<string, unknown> = {};
  for (const key of DISPLAY_KEYS) {
    if (patch[key] !== undefined) display[key] = patch[key];
  }
  return { ...(display as Partial<FoodEntry>), ...preview };
}

/**
 * Queues changes to an entry the server has. Setting values is safe to send
 * again, so it is kept after any failure to reach the server, a timeout
 * included. Changing it again before it uploads folds into the same row (one
 * row per entry; the later value of a field wins). The row stays on the day
 * the entry was on, so a move to another day is hidden from the right one.
 * True once the row is written.
 */
export async function queueFoodEntryUpdate(
  entryId: string,
  entryDate: string,
  patch: UpdateFoodEntryPayload,
  display: Partial<FoodEntry>
): Promise<boolean> {
  try {
    const serverConfigId = await getActiveServerConfigId();
    if (!serverConfigId) return false;
    const db = await getOfflineDb();
    const userId = await signedInUserId(db, serverConfigId);
    const earlier = (await listUnconfirmedOutbox(db, serverConfigId)).find(
      (row) => row.kind === FOOD_ENTRY_UPDATE && row.entityId === entryId
    );
    const before = earlier?.payload as FoodEntryUpdatePayload | undefined;
    const payload: FoodEntryUpdatePayload = {
      patch: { ...before?.patch, ...patch },
      display: { ...before?.display, ...display },
    };
    await enqueueOutbox(db, {
      id: earlier?.id ?? newUuid(),
      serverConfigId,
      userId,
      kind: FOOD_ENTRY_UPDATE,
      entityId: entryId,
      entryDate: earlier?.entryDate ?? normalizeDate(entryDate),
      payload,
      payloadVersion: FOOD_ENTRY_UPDATE_PAYLOAD_VERSION,
    });
    notifyOutboxChanged();
    return true;
  } catch (error) {
    addLog(`[Offline] Could not queue the change: ${error}`, 'ERROR');
    return false;
  }
}

/**
 * What changing a waiting entry came to.
 * - `edited`: the entry that waits to upload now carries the new amount.
 * - `uploading`: it is being sent this moment, so it is left as it is.
 * - `gone`: nothing waits under that key any more (it uploaded meanwhile).
 */
export type EditWaitingResult = 'edited' | 'uploading' | 'gone';

/**
 * Changes the amount of an entry that is still waiting to upload by
 * rewriting the waiting request itself, so the server only ever sees the
 * final amount. A cooked weight no longer matches a changed amount, as on
 * the server, so it is dropped.
 */
export async function editWaitingEntryQuantity(
  entityId: string,
  quantity: number
): Promise<EditWaitingResult> {
  const serverConfigId = await getActiveServerConfigId();
  if (!serverConfigId) return 'gone';
  const db = await getOfflineDb();
  const row = (await listUnconfirmedOutbox(db, serverConfigId)).find(
    (item) =>
      item.entityId === entityId &&
      (item.kind === FOOD_ENTRY_CREATE ||
        item.kind === FOOD_CREATE ||
        item.kind === FOOD_ENTRY_MEAL_CREATE)
  );
  if (!row) return 'gone';
  if (row.status === 'sending') return 'uploading';

  let payload: unknown;
  if (row.kind === FOOD_ENTRY_CREATE) {
    payload = {
      ...(row.payload as FoodEntryCreatePayload),
      quantity,
      cooked_quantity: null,
    };
  } else if (row.kind === FOOD_CREATE) {
    const current = row.payload as FoodCreatePayload;
    payload = {
      ...current,
      entry: current.entry && {
        ...current.entry,
        quantity,
        cooked_quantity: null,
      },
    };
  } else {
    payload = {
      ...(row.payload as FoodEntryMealPayload),
      quantity,
    };
  }
  await enqueueOutbox(db, {
    id: row.id,
    serverConfigId,
    userId: row.userId,
    kind: row.kind,
    entityId: row.entityId,
    entryDate: row.entryDate,
    payload,
    payloadVersion: row.payloadVersion,
  });
  notifyOutboxChanged();
  return 'edited';
}
