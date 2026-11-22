import type { FoodEntry } from '../types/foodEntries';
import type { UpdateFoodEntryPayload } from '../services/api/foodEntriesApi';
import { addLog } from '../services/LogService';
import { getActiveServerConfigId } from '../services/storage';
import { normalizeDate } from '../utils/dateUtils';
import { newUuid } from '../utils/ids';
import { getCacheRow } from './cacheStore';
import { CACHE_COLLECTIONS } from './collections';
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
import {
  deleteUnconfirmedRow,
  enqueueOutbox,
  rewriteUnconfirmedPayload,
  isOwnedBy,
  listUnconfirmedOutbox,
} from './outbox';
import { signedInUserId } from './syncEngine';
import type { OfflineDb } from './types';

/** Changes to a food entry the server has, waiting to upload. */
export const FOOD_ENTRY_UPDATE = 'food_entry.update';

/** The payload shape of `food_entry.update`, as this build writes it. */
export const FOOD_ENTRY_UPDATE_PAYLOAD_VERSION = 2;

export interface FoodEntryUpdatePayload {
  /** The request, as the server's update takes it. */
  patch: UpdateFoodEntryPayload;
  /** The entry fields it changes, as the Diary shows them while it waits. */
  display: Partial<FoodEntry>;
  /**
   * The entry as it was on the day it was moved from, kept with a move so the
   * day it moves to can show it even after the first day is refreshed.
   */
  original?: FoodEntry;
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

/** The entry as the phone last saw it on a day, or null when it is not kept. */
async function savedEntryOnDay(
  db: OfflineDb,
  serverConfigId: string,
  day: string,
  entryId: string
): Promise<FoodEntry | null> {
  const row = await getCacheRow(
    db,
    serverConfigId,
    CACHE_COLLECTIONS.diaryFoodDay,
    day
  );
  const entries = (row?.payload as FoodEntry[] | undefined) ?? [];
  return entries.find((entry) => entry.id === entryId) ?? null;
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
    // Whose it is must be known: a row nobody owns would be shown to, and
    // uploaded under, whichever account signs in next.
    if (userId == null) return false;
    const earlier = (await listUnconfirmedOutbox(db, serverConfigId)).find(
      (row) =>
        row.kind === FOOD_ENTRY_UPDATE &&
        row.entityId === entryId &&
        isOwnedBy(row, userId)
    );
    const before = earlier?.payload as FoodEntryUpdatePayload | undefined;
    const payload: FoodEntryUpdatePayload = {
      patch: { ...before?.patch, ...patch },
      display: { ...before?.display, ...display },
    };
    // An entry moved to another day is shown there from this copy of it, so
    // it stays visible after the day it came from is replaced by a refresh.
    const movedTo = payload.display.entry_date
      ? normalizeDate(payload.display.entry_date)
      : null;
    const from = earlier?.entryDate ?? normalizeDate(entryDate);
    if (movedTo && movedTo !== from) {
      const original =
        before?.original ??
        (await savedEntryOnDay(db, serverConfigId, from, entryId));
      if (original) payload.original = original;
    }
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
 * After a change was saved straight to the server: takes the fields it set out
 * of any change still waiting on the phone for the same entry, so the older
 * value never replays over the newer one. A waiting change left with nothing
 * to send is removed. A change being sent this moment is left alone.
 */
export async function dropSupersededUpdate(
  entryId: string,
  saved: UpdateFoodEntryPayload,
  /**
   * When the save request was sent. A change queued after that (by another
   * screen whose request failed while this one was in flight) is newer than
   * the save and is left alone.
   */
  requestStartedAt: number
): Promise<void> {
  const serverConfigId = await getActiveServerConfigId();
  if (!serverConfigId) return;
  const db = await getOfflineDb();
  const userId = await signedInUserId(db, serverConfigId);
  const waiting = (await listUnconfirmedOutbox(db, serverConfigId)).find(
    (row) =>
      row.kind === FOOD_ENTRY_UPDATE &&
      row.entityId === entryId &&
      row.status !== 'sending' &&
      isOwnedBy(row, userId)
  );
  if (!waiting || waiting.updatedAt >= requestStartedAt) return;
  const before = waiting.payload as FoodEntryUpdatePayload;
  const setNow = new Set(
    Object.keys(saved).filter(
      (key) => saved[key as keyof UpdateFoodEntryPayload] !== undefined
    )
  );
  const patch = Object.fromEntries(
    Object.entries(before.patch).filter(([key]) => !setNow.has(key))
  ) as UpdateFoodEntryPayload;
  if (Object.keys(patch).length === Object.keys(before.patch).length) return;
  if (Object.keys(patch).length === 0) {
    // Only this update goes; a delete or anything else waiting for the entry
    // stays.
    await deleteUnconfirmedRow(db, waiting.id, undefined, waiting.updatedAt);
  } else {
    // What the entry reads like while it waits drops what was just saved.
    const display = Object.fromEntries(
      Object.entries(before.display).filter(([key]) => !setNow.has(key))
    ) as Partial<FoodEntry>;
    // Only if the row is still the one that was read, and without touching its
    // timestamp: an edit queued in between is kept as it is, and the fields
    // that remain keep the time they were queued.
    await rewriteUnconfirmedPayload(db, waiting.id, waiting.updatedAt, {
      patch,
      display,
      ...(before.original ? { original: before.original } : {}),
    });
  }
  notifyOutboxChanged();
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
  // A create whose upload was already tried may be on the server (the answer
  // can be lost), and a replay of the same key returns the stored entry
  // without applying a changed body: the new amount would be reported saved
  // and never stored. It is refused until the upload has finished.
  if (row.attempts > 0) return 'uploading';

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
