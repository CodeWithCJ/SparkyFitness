import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import {
  distributeCountedCalories,
  isAppLoggedWorkoutSource,
  localDateTimeToUtc,
  matchCalorieLink,
  resolveLinkedCalories,
} from '@workspace/shared';
import type {
  CalorieLinkCandidate,
  SetCalorieLinkResponse,
  CalorieLinkResolution,
  CalorieLinkSuggestionsResponse,
  LinkWindow,
  SetCalorieLinkRequest,
} from '@workspace/shared';
import { getClient } from '../db/poolManager.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';

/**
 * Links a workout logged in SparkyFitness to the same session synced from a
 * watch or health platform, so its calories count once (#2353).
 *
 * Nothing is ever deleted or re-estimated: each side keeps `calories_burned`,
 * and the link only writes `calories_applied` (what the balance counts) plus a
 * shared `calorie_link_id`. Only synced entries with a `source_id` can be
 * linked: a provider sync updates those in place and keeps the link, while an
 * entry without one is deleted and recreated by the next sync.
 */

export class CalorieLinkError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'CalorieLinkError';
    this.status = status;
  }
}

interface LinkEntryRow {
  id: string;
  entry_date: string;
  entry_time: string | null;
  record_timezone: string | null;
  duration_minutes: number;
  elapsed_time_seconds: number | null;
  calories_burned: number;
  calorie_link_id: string | null;
  calorie_link_resolution: CalorieLinkResolution | null;
  source: string | null;
  exercise_name: string | null;
}

const ENTRY_COLUMNS = `
  id,
  to_char(entry_date, 'YYYY-MM-DD') AS entry_date,
  entry_time::text AS entry_time,
  record_timezone,
  duration_minutes::float8 AS duration_minutes,
  elapsed_time_seconds::float8 AS elapsed_time_seconds,
  calories_burned::float8 AS calories_burned,
  calorie_link_id,
  calorie_link_resolution,
  source,
  exercise_name`;

/** The anchor entry plus, for a strength session, the rest of its preset entry. */
async function loadWorkoutEntries(
  client: PoolClient,
  userId: string,
  entryId: string,
  lock: boolean
): Promise<LinkEntryRow[]> {
  const result = await client.query<LinkEntryRow>(
    `SELECT ${ENTRY_COLUMNS}
     FROM exercise_entries
     WHERE user_id = $2
       AND (id = $1
         OR (exercise_preset_entry_id IS NOT NULL
           AND exercise_preset_entry_id = (
             SELECT exercise_preset_entry_id FROM exercise_entries
             WHERE id = $1 AND user_id = $2)))
     ORDER BY sort_order ASC NULLS LAST, created_at ASC
     ${lock ? 'FOR UPDATE' : ''}`,
    [entryId, userId]
  );
  if (result.rows.length === 0) {
    throw new CalorieLinkError('Exercise entry not found.', 404);
  }
  if (result.rows.some((row) => !isAppLoggedWorkoutSource(row.source))) {
    throw new CalorieLinkError(
      'Only workouts logged in SparkyFitness can be linked.',
      400
    );
  }
  return result.rows;
}

function windowOf(
  row: Pick<
    LinkEntryRow,
    | 'entry_date'
    | 'entry_time'
    | 'record_timezone'
    | 'duration_minutes'
    | 'elapsed_time_seconds'
  >,
  fallbackTz: string,
  durationMinutes?: number
): LinkWindow | null {
  if (!row.entry_time) return null;
  const startMs = localDateTimeToUtc(
    `${row.entry_date}T${row.entry_time.slice(0, 5)}`,
    row.record_timezone || fallbackTz
  ).getTime();
  if (!Number.isFinite(startMs)) return null;
  const seconds =
    durationMinutes !== undefined
      ? durationMinutes * 60
      : (row.elapsed_time_seconds ?? row.duration_minutes * 60);
  return { startMs, endMs: startMs + Math.max(0, seconds) * 1000 };
}

function earliestWindow(
  rows: readonly LinkEntryRow[],
  fallbackTz: string
): LinkWindow | null {
  const timed = rows.filter((row) => row.entry_time);
  if (timed.length === 0) return null;
  const earliest = [...timed].sort((a, b) =>
    (a.entry_time ?? '').localeCompare(b.entry_time ?? '')
  )[0];
  if (!earliest) return null;
  const total = rows.reduce((sum, row) => sum + row.duration_minutes, 0);
  return windowOf(earliest, fallbackTz, total);
}

const MATCH_RANK = { sets_within: 0, overlap: 1 } as const;

async function getCalorieLinkSuggestions(
  userId: string,
  actingUserId: string,
  entryId: string
): Promise<CalorieLinkSuggestionsResponse> {
  const tz = await loadUserTimezone(userId);
  const client = await getClient(userId, actingUserId);
  try {
    const workout = await loadWorkoutEntries(client, userId, entryId, false);
    const first = workout[0]!;
    const workoutIds = workout.map((row) => row.id);
    const linkId = workout.find((row) => row.calorie_link_id)?.calorie_link_id;

    const setTimes = await client.query(
      `SELECT completed_at FROM exercise_entry_sets
       WHERE exercise_entry_id = ANY($1::uuid[]) AND completed_at IS NOT NULL`,
      [workoutIds]
    );
    const manual = {
      setTimesMs: (setTimes.rows as { completed_at: Date }[]).map((row) =>
        new Date(row.completed_at).getTime()
      ),
      window: earliestWindow(workout, tz),
    };

    const candidateRows = await client.query(
      `SELECT ${ENTRY_COLUMNS}
       FROM exercise_entries
       WHERE user_id = $1
         AND entry_date = $2::date
         AND source IS NOT NULL AND lower(source) NOT IN ('manual', 'sparky')
         AND source_id IS NOT NULL
         AND exercise_preset_entry_id IS NULL
         AND exercise_name IS DISTINCT FROM 'Active Calories'
         AND id <> ALL($3::uuid[])
         AND (calorie_link_id IS NULL OR calorie_link_id = $4::uuid)
       ORDER BY entry_time ASC NULLS LAST, created_at ASC`,
      [userId, first.entry_date, workoutIds, linkId ?? null]
    );

    const candidates: CalorieLinkCandidate[] = (
      candidateRows.rows as LinkEntryRow[]
    ).map((row) => ({
      id: row.id,
      name: row.exercise_name,
      source: row.source ?? '',
      start_time: row.entry_time ? row.entry_time.slice(0, 5) : null,
      duration_minutes: row.duration_minutes,
      calories_burned: row.calories_burned,
      match: matchCalorieLink(manual, windowOf(row, tz)),
    }));
    candidates.sort(
      (a, b) =>
        (a.match ? MATCH_RANK[a.match] : 2) -
        (b.match ? MATCH_RANK[b.match] : 2)
    );

    const linkedSynced = linkId
      ? (candidateRows.rows as LinkEntryRow[]).find(
          (row) => row.calorie_link_id === linkId
        )
      : undefined;
    return {
      manual_total_calories: workout.reduce(
        (sum, row) => sum + row.calories_burned,
        0
      ),
      link: linkId
        ? {
            resolution: workout.find((row) => row.calorie_link_id)!
              .calorie_link_resolution!,
            synced_entry_id: linkedSynced?.id ?? null,
          }
        : null,
      candidates,
    };
  } finally {
    client.release();
  }
}

async function clearLinkWithClient(
  client: PoolClient,
  userId: string,
  linkId: string
): Promise<void> {
  await client.query(
    `UPDATE exercise_entries
     SET calories_applied = NULL, calorie_link_id = NULL,
         calorie_link_resolution = NULL, updated_at = NOW()
     WHERE user_id = $1 AND calorie_link_id = $2::uuid`,
    [userId, linkId]
  );
}

interface LinkedCalorieRow {
  id: string;
  source: string | null;
  calories_burned: number;
  calories_applied: number | null;
  calorie_link_resolution: CalorieLinkResolution | null;
}

async function lockKeys(
  client: PoolClient,
  keys: readonly string[]
): Promise<void> {
  for (const key of keys) {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
  }
}

/** The session row, before any of its exercises. Matches the grouped-edit order. */
async function lockPresetRows(
  client: PoolClient,
  userId: string,
  entryIds: readonly string[]
): Promise<void> {
  if (entryIds.length === 0) return;
  const presets = await client.query<{ id: string }>(
    `SELECT DISTINCT exercise_preset_entry_id AS id
     FROM exercise_entries
     WHERE user_id = $1
       AND id = ANY($2::uuid[])
       AND exercise_preset_entry_id IS NOT NULL
     ORDER BY 1`,
    [userId, entryIds]
  );
  for (const row of presets.rows) {
    await client.query(
      'SELECT id FROM exercise_preset_entries WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [row.id, userId]
    );
  }
}

/**
 * The anchor entries, every exercise in their session, and every row that
 * already shares their calorie link. Caller holds the session row and the
 * per-user allocation lock, so this set cannot change underneath the write.
 */
async function allocateEntryIds(
  client: PoolClient,
  userId: string,
  entryIds: readonly string[]
): Promise<string[]> {
  const found = await client.query<{ id: string }>(
    `SELECT id FROM exercise_entries
     WHERE user_id = $1
       AND (
         id = ANY($2::uuid[])
         OR (
           exercise_preset_entry_id IS NOT NULL
           AND exercise_preset_entry_id IN (
             SELECT exercise_preset_entry_id FROM exercise_entries
             WHERE user_id = $1 AND id = ANY($2::uuid[])
               AND exercise_preset_entry_id IS NOT NULL
           )
         )
         OR (
           calorie_link_id IS NOT NULL
           AND calorie_link_id IN (
             SELECT calorie_link_id FROM exercise_entries
             WHERE user_id = $1 AND id = ANY($2::uuid[])
               AND calorie_link_id IS NOT NULL
           )
         )
       )`,
    [userId, entryIds]
  );
  return [...new Set([...entryIds, ...found.rows.map((row) => row.id)])].sort();
}

/**
 * Serialize a link change with every other one for this user, then hold the
 * entries it will rewrite and the link they belong to. Order is the session
 * row, the per-user allocation lock, entry keys sorted, then link keys
 * smallest-first. Link ids are re-read after every wait so a relink cannot
 * be applied without the new lock. Callers must already be in a transaction.
 */
export async function lockCalorieLinkParticipantsWithClient(
  client: PoolClient,
  userId: string,
  entryIds: readonly string[]
): Promise<void> {
  const requested = [...new Set(entryIds)].filter((id) => Boolean(id));
  await lockPresetRows(client, userId, requested);
  await lockKeys(client, [`calorie-alloc:${userId}`]);
  const ids = await allocateEntryIds(client, userId, requested);
  await lockKeys(
    client,
    ids.map((id) => `exercise-entry:${id}`)
  );
  const held = new Set<string>();
  for (;;) {
    const peek = await client.query<{ calorie_link_id: string | null }>(
      `SELECT calorie_link_id FROM exercise_entries
       WHERE user_id = $1 AND id = ANY($2::uuid[])`,
      [userId, ids]
    );
    const pending = [
      ...new Set(
        peek.rows
          .map((row) => row.calorie_link_id)
          .filter((id): id is string => Boolean(id))
      ),
    ]
      .filter((id) => !held.has(id))
      .sort();
    const next = pending[0];
    if (!next) return;
    await lockKeys(client, [`calorie-link:${next}`]);
    held.add(next);
  }
}

/**
 * After an ordinary edit changes an estimate, rewrite `calories_applied` on
 * both sides from the stored resolution. The link stays authoritative: a
 * calories_applied sent with the edit is not kept.
 */
export async function reapplyCalorieLinkWithClient(
  client: PoolClient,
  userId: string,
  linkId: string
): Promise<void> {
  const result = await client.query<LinkedCalorieRow>(
    `SELECT id,
            source,
            calories_burned::float8 AS calories_burned,
            calories_applied::float8 AS calories_applied,
            calorie_link_resolution
     FROM exercise_entries
     WHERE user_id = $1 AND calorie_link_id = $2::uuid
     ORDER BY sort_order ASC NULLS LAST, created_at ASC
     FOR UPDATE`,
    [userId, linkId]
  );
  const rows = result.rows;
  const resolution = rows.find(
    (row) => row.calorie_link_resolution
  )?.calorie_link_resolution;
  if (!resolution) return;
  const manual = rows.filter((row) => isAppLoggedWorkoutSource(row.source));
  const synced = rows.filter((row) => !isAppLoggedWorkoutSource(row.source));
  if (manual.length === 0 || synced.length === 0) return;

  const estimates = manual.map((row) => Number(row.calories_burned) || 0);
  const resolved = resolveLinkedCalories({
    manualTotal: estimates.reduce((sum, value) => sum + value, 0),
    syncedTotal: synced.reduce(
      (sum, row) => sum + (Number(row.calories_burned) || 0),
      0
    ),
    resolution,
    customCalories: manual.reduce(
      (sum, row) => sum + (Number(row.calories_applied) || 0),
      0
    ),
  });
  const applied =
    resolved.manualCounted === null
      ? manual.map(() => null)
      : distributeCountedCalories(estimates, resolved.manualCounted);

  for (const [index, row] of manual.entries()) {
    await client.query(
      `UPDATE exercise_entries
       SET calories_applied = $3, updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [row.id, userId, applied[index] ?? null]
    );
  }
  for (const row of synced) {
    await client.query(
      `UPDATE exercise_entries
       SET calories_applied = $3, updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [row.id, userId, resolved.syncedCounted]
    );
  }
}

/**
 * Drop a link before one of its entries is deleted, so the survivor counts its
 * own estimate again. A no-op when the entry is not linked.
 */
export async function clearCalorieLinkOfEntryWithClient(
  client: PoolClient,
  userId: string,
  entryId: string
): Promise<void> {
  await client.query(
    `UPDATE exercise_entries
     SET calories_applied = NULL, calorie_link_id = NULL,
         calorie_link_resolution = NULL, updated_at = NOW()
     WHERE user_id = $1
       AND calorie_link_id = (
         SELECT calorie_link_id
         FROM exercise_entries
         WHERE id = $2 AND user_id = $1
       )
       AND calorie_link_id IS NOT NULL`,
    [userId, entryId]
  );
}

/** Same cleanup for every entry a bulk delete is about to remove. */
export async function clearCalorieLinksOfEntriesWithClient(
  client: PoolClient,
  userId: string,
  entryIds: readonly string[]
): Promise<void> {
  if (entryIds.length === 0) return;
  await client.query(
    `UPDATE exercise_entries
     SET calories_applied = NULL, calorie_link_id = NULL,
         calorie_link_resolution = NULL, updated_at = NOW()
     WHERE user_id = $1
       AND calorie_link_id IN (
         SELECT calorie_link_id FROM exercise_entries
         WHERE user_id = $1
           AND id = ANY($2::uuid[])
           AND calorie_link_id IS NOT NULL
       )`,
    [userId, entryIds]
  );
}

/**
 * Same cleanup for a whole logged session, whose child rows are removed by
 * cascade when the preset entry goes. Runs before that delete.
 */
export async function clearCalorieLinksForPresetEntryWithClient(
  client: PoolClient,
  userId: string,
  presetEntryId: string
): Promise<void> {
  await client.query(
    `UPDATE exercise_entries
     SET calories_applied = NULL, calorie_link_id = NULL,
         calorie_link_resolution = NULL, updated_at = NOW()
     WHERE user_id = $1
       AND calorie_link_id IN (
         SELECT calorie_link_id FROM exercise_entries
         WHERE user_id = $1
           AND exercise_preset_entry_id = $2
           AND calorie_link_id IS NOT NULL
       )`,
    [userId, presetEntryId]
  );
}

async function setCalorieLink(
  userId: string,
  actingUserId: string,
  entryId: string,
  body: SetCalorieLinkRequest
): Promise<SetCalorieLinkResponse> {
  const client = await getClient(userId, actingUserId);
  try {
    await client.query('BEGIN');
    await lockCalorieLinkParticipantsWithClient(client, userId, [
      entryId,
      body.synced_entry_id,
    ]);
    const workout = await loadWorkoutEntries(client, userId, entryId, true);
    const existingLinkId = workout.find(
      (row) => row.calorie_link_id
    )?.calorie_link_id;

    const syncedResult = await client.query(
      `SELECT ${ENTRY_COLUMNS}, source_id
       FROM exercise_entries
       WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [body.synced_entry_id, userId]
    );
    const synced = (
      syncedResult.rows as (LinkEntryRow & { source_id: string | null })[]
    )[0];
    if (!synced) {
      throw new CalorieLinkError('Synced workout not found.', 404);
    }
    if (
      isAppLoggedWorkoutSource(synced.source) ||
      !synced.source ||
      !synced.source_id ||
      workout.some((row) => row.id === synced.id)
    ) {
      throw new CalorieLinkError(
        'That entry is not a synced workout that can be linked.',
        400
      );
    }
    if (synced.calorie_link_id && synced.calorie_link_id !== existingLinkId) {
      throw new CalorieLinkError(
        'That synced workout is already linked to another workout.',
        409
      );
    }

    if (existingLinkId)
      await clearLinkWithClient(client, userId, existingLinkId);

    const estimates = workout.map((row) => row.calories_burned);
    const resolved = resolveLinkedCalories({
      manualTotal: estimates.reduce((sum, value) => sum + value, 0),
      syncedTotal: synced.calories_burned,
      resolution: body.resolution,
      customCalories: body.custom_calories,
    });
    const applied =
      resolved.manualCounted === null
        ? workout.map(() => null)
        : distributeCountedCalories(estimates, resolved.manualCounted);

    const linkId = randomUUID();
    for (const [index, row] of workout.entries()) {
      await client.query(
        `UPDATE exercise_entries
         SET calories_applied = $3, calorie_link_id = $4::uuid,
             calorie_link_resolution = $5, updated_at = NOW()
         WHERE id = $1 AND user_id = $2`,
        [row.id, userId, applied[index], linkId, body.resolution]
      );
    }
    await client.query(
      `UPDATE exercise_entries
       SET calories_applied = $3, calorie_link_id = $4::uuid,
           calorie_link_resolution = $5, updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [synced.id, userId, resolved.syncedCounted, linkId, body.resolution]
    );
    await client.query('COMMIT');
    return {
      applied: workout.map((row, index) => ({
        entry_id: row.id,
        calories_applied: applied[index] ?? null,
      })),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function clearCalorieLink(
  userId: string,
  actingUserId: string,
  entryId: string
): Promise<void> {
  const client = await getClient(userId, actingUserId);
  try {
    await client.query('BEGIN');
    await lockCalorieLinkParticipantsWithClient(client, userId, [entryId]);
    const workout = await loadWorkoutEntries(client, userId, entryId, true);
    const linkId = workout.find((row) => row.calorie_link_id)?.calorie_link_id;
    if (!linkId) {
      throw new CalorieLinkError('This workout is not linked.', 404);
    }
    await clearLinkWithClient(client, userId, linkId);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export { getCalorieLinkSuggestions, setCalorieLink, clearCalorieLink };
export default { getCalorieLinkSuggestions, setCalorieLink, clearCalorieLink };
