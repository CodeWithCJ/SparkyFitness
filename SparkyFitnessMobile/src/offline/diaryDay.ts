import type {
  CreatePresetSessionRequest,
  ExerciseSessionResponse,
  PresetSessionResponse,
} from '@workspace/shared';
import { apiFetch } from '../services/api/apiClient';
import type { FoodEntry } from '../types/foodEntries';
import { withoutDeleted } from './dailySummaryOverlay';
import { applyEntryChanges, readFoodEntryChanges } from './foodEntryChanges';
import { FOOD_ENTRY_MEAL_DELETE } from './foodEntryMealDeleteHandOver';
import { FOOD_ENTRY_DELETE } from './foodEntryDeleteHandOver';
import { previewFromQueuedRow } from './foodEntryPreview';
import { accountGeneration, savedCopyReadable } from './accountGeneration';
import { getActiveServerConfigId } from '../services/storage';
import { addDays, getTodayDate, normalizeDate } from '../utils/dateUtils';
import type { Exercise } from '../types/exercise';
import { buildLocalSession } from './buildLocalSession';
import { getCacheRow, putCacheRows } from './cacheStore';
import { CACHE_COLLECTIONS } from './collections';
import { getOfflineDb } from './db';
import { notifyDiaryDaySaved } from './events';
import { refreshLoggedMeals } from './loggedMeals';
import { isOwnedBy, listUnconfirmedOutbox } from './outbox';
import { signedInUserId } from './syncEngine';
import type { OfflineDb, OutboxRow } from './types';
import {
  WORKOUT_SESSION_CREATE,
  WORKOUT_SESSION_DELETE,
  WORKOUT_SESSION_UPDATE,
  type WorkoutSessionUpdatePayload,
} from './workoutHandOver';

/** A day's workouts as this phone knows them without the server. */
export interface OfflineDiaryDay {
  /** The day's workouts as last loaded from the server; null if never. */
  saved: ExerciseSessionResponse[] | null;
  /**
   * Workouts of that day still waiting to upload, as they will be once
   * uploaded. Shown in place of the saved copy of the same workout.
   */
  waiting: PresetSessionResponse[];
  /** Workouts of that day whose removal is waiting to upload: hidden. */
  deleted: string[];
  /** The day's food entries as last loaded from the server; null if never. */
  savedFood: FoodEntry[] | null;
  /** Food entries of that day still waiting to upload, as they will read. */
  waitingFood: FoodEntry[];
  /** Food entries the server has whose removal is waiting to upload: hidden. */
  deletedFood: string[];
  /** Entries the server has, changed on the phone, by entry id. */
  updatedFood: Record<string, Partial<FoodEntry>>;
  /** Logged meals the server has whose removal is waiting to upload: hidden. */
  deletedFoodMeals: string[];
}

/** Keeps the day's workouts from a diary load, for showing it offline. */
export async function saveDiaryDayWorkouts(
  date: string,
  sessions: ExerciseSessionResponse[],
  /** `accountGeneration()` when the request was made; a later one is dropped. */
  requestedUnder: number = accountGeneration()
): Promise<void> {
  try {
    const serverConfigId = await getActiveServerConfigId();
    if (!serverConfigId || accountGeneration() !== requestedUnder) return;
    await putCacheRows(
      await getOfflineDb(),
      serverConfigId,
      CACHE_COLLECTIONS.diaryDay,
      [{ key: date, payload: sessions }]
    );
    // The offline view keeps its last read in memory; without this it would
    // show the day as it was before this load (deleted workouts included).
    notifyDiaryDaySaved();
  } catch {
    // Only a convenience for offline viewing.
  }
}

/** Keeps the day's food entries from a diary load, for showing it offline. */
export async function saveDiaryDayFood(
  date: string,
  entries: FoodEntry[],
  /** `accountGeneration()` when the request was made; a later one is dropped. */
  requestedUnder: number = accountGeneration()
): Promise<void> {
  try {
    const serverConfigId = await getActiveServerConfigId();
    if (!serverConfigId || accountGeneration() !== requestedUnder) return;
    await putCacheRows(
      await getOfflineDb(),
      serverConfigId,
      CACHE_COLLECTIONS.diaryFoodDay,
      [{ key: date, payload: entries }]
    );
    notifyDiaryDaySaved();
  } catch {
    // Only a convenience for offline viewing.
  }
}

/**
 * Saves the food entries of the last week with one request, so the Diary can
 * show them with no connection whether or not each day was opened while
 * online. Days older than the week are removed.
 */
export async function refreshRecentFoodDays(
  db: OfflineDb,
  serverConfigId: string,
  today: string = getTodayDate(),
  startedUnder: number = accountGeneration()
): Promise<void> {
  const first = addDays(today, -(DIARY_DAYS_KEPT - 1));
  const entries = await apiFetch<FoodEntry[]>({
    endpoint: `/api/food-entries/range/${encodeURIComponent(first)}/${encodeURIComponent(today)}`,
    serviceName: 'Offline pack',
    operation: "fetch the week's food entries",
  });
  if (accountGeneration() !== startedUnder) return;
  const byDay = new Map<string, FoodEntry[]>();
  for (let back = 0; back < DIARY_DAYS_KEPT; back += 1) {
    byDay.set(addDays(today, -back), []);
  }
  for (const entry of Array.isArray(entries) ? entries : []) {
    // The server sends the calendar day; it may carry a time part.
    const day = normalizeDate(entry.entry_date);
    byDay.get(day)?.push(entry);
  }
  await putCacheRows(
    db,
    serverConfigId,
    CACHE_COLLECTIONS.diaryFoodDay,
    [...byDay].map(([key, payload]) => ({ key, payload }))
  );
  await db.run(
    `DELETE FROM cache WHERE server_config_id = ? AND collection = ? AND key < ?`,
    [serverConfigId, CACHE_COLLECTIONS.diaryFoodDay, first]
  );
  notifyDiaryDaySaved();
  // The logged meals of those days, with their components, to edit offline.
  await refreshLoggedMeals(
    db,
    serverConfigId,
    Array.isArray(entries) ? entries : [],
    startedUnder
  );
}

/** How many days back (today included) the phone keeps workouts for. */
export const DIARY_DAYS_KEPT = 7;

/**
 * Saves the workouts of the last week so the Diary can show them with no
 * connection, whether or not each day was opened while online. The server
 * has no range route for workouts, so each day is one small request. Days
 * older than the week are removed. A day that cannot be loaded keeps the
 * copy it had; the next refresh tries again.
 */
export async function refreshRecentDiaryDays(
  db: OfflineDb,
  serverConfigId: string,
  today: string = getTodayDate(),
  startedUnder: number = accountGeneration()
): Promise<void> {
  for (let back = 0; back < DIARY_DAYS_KEPT; back += 1) {
    if (accountGeneration() !== startedUnder) return;
    const day = addDays(today, -back);
    const sessions = await apiFetch<ExerciseSessionResponse[]>({
      endpoint: `/api/v2/exercise-entries/by-date?selectedDate=${encodeURIComponent(day)}`,
      serviceName: 'Offline pack',
      operation: "fetch the day's workouts",
    });
    if (accountGeneration() !== startedUnder) return;
    await putCacheRows(db, serverConfigId, CACHE_COLLECTIONS.diaryDay, [
      { key: day, payload: Array.isArray(sessions) ? sessions : [] },
    ]);
  }
  if (accountGeneration() !== startedUnder) return;
  await db.run(
    `DELETE FROM cache WHERE server_config_id = ? AND collection = ? AND key < ?`,
    [
      serverConfigId,
      CACHE_COLLECTIONS.diaryDay,
      addDays(today, -(DIARY_DAYS_KEPT - 1)),
    ]
  );
  notifyDiaryDaySaved();
}

async function exercisesFor(
  db: OfflineDb,
  serverConfigId: string,
  ids: readonly (string | null)[]
): Promise<Map<string, Exercise>> {
  const byId = new Map<string, Exercise>();
  for (const id of ids) {
    if (id == null || byId.has(id)) continue;
    const row = await getCacheRow(
      db,
      serverConfigId,
      CACHE_COLLECTIONS.exercise,
      id
    );
    if (row) byId.set(id, row.payload as Exercise);
  }
  return byId;
}

async function sessionFromRow(
  db: OfflineDb,
  serverConfigId: string,
  row: OutboxRow,
  saved: readonly ExerciseSessionResponse[]
): Promise<PresetSessionResponse | null> {
  if (row.kind === WORKOUT_SESSION_CREATE) {
    const payload = row.payload as CreatePresetSessionRequest;
    const exercises = payload.exercises ?? [];
    return buildLocalSession({
      id: payload.id ?? row.entityId,
      name: payload.name ?? '',
      entryDate: payload.entry_date,
      workoutPresetId: payload.workout_preset_id ?? null,
      workoutPlanAssignmentId:
        payload.workoutPlanAssignmentId != null
          ? Number(payload.workoutPlanAssignmentId)
          : null,
      finishedAt: payload.finished_at ?? null,
      exercises,
      exercisesById: await exercisesFor(
        db,
        serverConfigId,
        exercises.map((exercise) => exercise.exercise_id)
      ),
    });
  }
  if (row.kind === WORKOUT_SESSION_UPDATE) {
    const { body } = row.payload as WorkoutSessionUpdatePayload;
    const previous = saved.find(
      (session): session is PresetSessionResponse =>
        session.type === 'preset' && session.id === row.entityId
    );
    // An edit of only the name, date or notes carries no exercises: the
    // workout keeps the ones it has.
    if (body.exercises === undefined && previous) {
      return {
        ...previous,
        name: body.name ?? previous.name,
        notes: body.notes !== undefined ? body.notes : previous.notes,
        entry_date: row.entryDate ?? previous.entry_date,
        finished_at:
          body.finished_at !== undefined
            ? body.finished_at
            : previous.finished_at,
      };
    }
    const exercises = body.exercises ?? [];
    const rebuilt = buildLocalSession({
      id: row.entityId,
      name: body.name ?? previous?.name ?? '',
      entryDate: row.entryDate ?? previous?.entry_date ?? '',
      workoutPresetId: previous?.workout_preset_id ?? null,
      workoutPlanAssignmentId: null,
      finishedAt:
        body.finished_at !== undefined
          ? body.finished_at
          : (previous?.finished_at ?? null),
      exercises,
      exercisesById: await exercisesFor(
        db,
        serverConfigId,
        exercises.map((exercise) => exercise.exercise_id)
      ),
    });
    return rebuilt ?? previous ?? null;
  }
  return null;
}

/**
 * The day's workouts from what this phone holds: the copy saved when the
 * diary last loaded, with every workout still waiting to upload put in as
 * it will be. Workouts queued under another account are left out.
 */
export async function readOfflineDiaryDay(
  date: string
): Promise<OfflineDiaryDay> {
  // Waits for an account change in progress. If its clean-up failed, nothing
  // is read: the saved day, the saved identity and so the queued workouts
  // that would be matched to it may all belong to the previous account.
  const nothing: OfflineDiaryDay = {
    saved: null,
    waiting: [],
    deleted: [],
    savedFood: null,
    waitingFood: [],
    deletedFood: [],
    updatedFood: {},
    deletedFoodMeals: [],
  };
  if (!(await savedCopyReadable())) return nothing;
  const serverConfigId = await getActiveServerConfigId();
  if (!serverConfigId) return nothing;
  const db = await getOfflineDb();
  const savedRow = await getCacheRow(
    db,
    serverConfigId,
    CACHE_COLLECTIONS.diaryDay,
    date
  );
  const saved = savedRow
    ? (savedRow.payload as ExerciseSessionResponse[])
    : null;
  const userId = await signedInUserId(db, serverConfigId);
  const mine = (await listUnconfirmedOutbox(db, serverConfigId)).filter((row) =>
    isOwnedBy(row, userId)
  );
  const rows = mine.filter((row) => row.entryDate === date);
  // One entry per workout, the way it will be once everything queued is
  // uploaded: a later row for the same workout (an update after the create,
  // when a waiting workout was resumed and finished again) replaces the
  // earlier one, and builds on it for what the update does not carry.
  const byId = new Map<string, PresetSessionResponse>();
  for (const row of rows) {
    const session = await sessionFromRow(db, serverConfigId, row, [
      ...(saved ?? []),
      ...byId.values(),
    ]);
    if (session) byId.set(session.id, session);
  }
  const deleted = rows
    .filter((row) => row.kind === WORKOUT_SESSION_DELETE)
    .map((row) => row.entityId);
  const savedFoodRow = await getCacheRow(
    db,
    serverConfigId,
    CACHE_COLLECTIONS.diaryFoodDay,
    date
  );
  const waitingFood: FoodEntry[] = [];
  for (const row of rows) {
    try {
      const preview = await previewFromQueuedRow(db, serverConfigId, row);
      if (preview) waitingFood.push(preview);
    } catch {
      // One entry that cannot be previewed never hides the rest of the day.
    }
  }
  const deletedFood = rows
    .filter((row) => row.kind === FOOD_ENTRY_DELETE)
    .map((row) => row.entityId);
  // Changes to entries the server has: in place, moved off this day, or
  // moved onto it from another one.
  const deletedMeals = rows
    .filter((row) => row.kind === FOOD_ENTRY_MEAL_DELETE)
    .map((row) => row.entityId);
  const changes = await readFoodEntryChanges(
    db,
    serverConfigId,
    date,
    mine,
    deletedFood,
    deletedMeals
  );
  return {
    saved,
    waiting: [...byId.values()],
    deleted,
    savedFood: savedFoodRow ? (savedFoodRow.payload as FoodEntry[]) : null,
    waitingFood: [...waitingFood, ...changes.movedIn],
    deletedFood: [...deletedFood, ...changes.movedOut],
    deletedFoodMeals: [...deletedMeals, ...changes.replacedMeals],
    updatedFood: changes.inPlace,
  };
}

/**
 * One list for the diary: the waiting copy of a workout replaces its saved
 * or server copy, and workouts that exist only on this phone are added.
 */
export function mergeWaitingWorkouts(
  sessions: readonly ExerciseSessionResponse[],
  waiting: readonly PresetSessionResponse[],
  deleted: readonly string[] = []
): ExerciseSessionResponse[] {
  if (deleted.length > 0) {
    const gone = new Set(deleted);
    sessions = sessions.filter((session) => !gone.has(session.id));
  }
  const waitingById = new Map(waiting.map((session) => [session.id, session]));
  const merged = sessions.map(
    (session) => waitingById.get(session.id) ?? session
  );
  const present = new Set(sessions.map((session) => session.id));
  for (const session of waiting) {
    if (!present.has(session.id)) merged.push(session);
  }
  return merged;
}

/**
 * One list of food entries for the offline Diary: what the server last had
 * for the day, then the entries still waiting to upload.
 */
export function mergeWaitingFood(
  saved: readonly FoodEntry[],
  waiting: readonly FoodEntry[],
  deleted: readonly string[] = [],
  updated: Readonly<Record<string, Partial<FoodEntry>>> = {},
  deletedMeals: readonly string[] = []
): FoodEntry[] {
  // The waiting copy of an entry wins over the same id already in the saved
  // list (a copy of the day cached after the upload, or a moved entry the
  // destination day already holds), so nothing shows twice.
  const waitingIds = new Set(waiting.map((entry) => entry.id));
  return [
    ...applyEntryChanges(
      withoutDeleted(saved, deleted, deletedMeals),
      updated
    ).filter((entry) => !waitingIds.has(entry.id)),
    ...waiting,
  ];
}
