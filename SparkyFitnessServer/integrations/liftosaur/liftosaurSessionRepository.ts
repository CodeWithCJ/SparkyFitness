/**
 * Liftosaur workout sessions (exercise_preset_entries rows with source
 * 'Liftosaur'), kept across re-syncs by their Liftosaur record id in
 * `source_id`.
 *
 * Sessions must survive a re-sync, not be deleted and recreated:
 * exercise_entries.exercise_preset_entry_id cascades on delete, so dropping a
 * session would take its entries (and anything the user added to them) with
 * it, and the in-place entry update in _createExerciseEntryWithClient would
 * never get a chance to run. Follows the pattern of
 * integrations/hevy/hevyWorkoutRepository.ts.
 */
import type { PoolClient } from 'pg';
import { log } from '../../config/logging.js';

export const LIFTOSAUR_SESSION_SOURCE = 'Liftosaur';

export interface LiftosaurSessionInput {
  /** Liftosaur history record id. */
  source_id: string;
  workout_preset_id: number;
  name: string;
  description: string;
  entry_date: string;
  notes: string;
}

/**
 * Return the id of the session for this Liftosaur record, creating it when it
 * does not exist yet. An existing session only takes the provider-owned
 * fields (date and preset); its name, description and notes stay as they are,
 * so edits made in SparkyFitness survive.
 */
export async function upsertLiftosaurSessionWithClient(
  client: PoolClient,
  userId: string,
  actingUserId: string,
  session: LiftosaurSessionInput
): Promise<string> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM exercise_preset_entries
     WHERE user_id = $1 AND source = $2 AND source_id = $3
     ORDER BY created_at, id
     LIMIT 1 FOR UPDATE`,
    [userId, LIFTOSAUR_SESSION_SOURCE, session.source_id]
  );
  const existingId = existing.rows[0]?.id;
  if (existingId) {
    await client.query(
      `UPDATE exercise_preset_entries
       SET workout_preset_id = $3, entry_date = $4, updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [existingId, userId, session.workout_preset_id, session.entry_date]
    );
    return existingId;
  }

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO exercise_preset_entries
     (user_id, workout_preset_id, name, description, entry_date,
      created_by_user_id, notes, source, source_id, workout_format)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
             COALESCE((SELECT workout_format FROM workout_presets WHERE id = $2), 'standard'))
     RETURNING id`,
    [
      userId,
      session.workout_preset_id,
      session.name,
      session.description,
      session.entry_date,
      actingUserId,
      session.notes,
      LIFTOSAUR_SESSION_SOURCE,
      session.source_id,
    ]
  );
  return inserted.rows[0]!.id;
}

/**
 * Delete Liftosaur sessions in a day range that are not being re-sent: the
 * workout was deleted in Liftosaur, or the session predates source ids.
 * Run it after the entries that are not being re-sent have been deleted (that
 * path clears their calorie links), since removing a session cascades to its
 * remaining entries.
 */
export async function deleteLiftosaurSessionsNotInWithClient(
  client: PoolClient,
  userId: string,
  startDate: string,
  endDate: string,
  keepSourceIds: string[]
): Promise<number> {
  const result = await client.query(
    `DELETE FROM exercise_preset_entries
     WHERE user_id = $1
       AND source = $2
       AND entry_date BETWEEN $3 AND $4
       AND (source_id IS NULL OR NOT (source_id = ANY($5::text[])))`,
    [userId, LIFTOSAUR_SESSION_SOURCE, startDate, endDate, keepSourceIds]
  );
  const deleted = result.rowCount ?? 0;
  if (deleted > 0) {
    log(
      'info',
      `[liftosaurSessionRepository] Deleted ${deleted} Liftosaur sessions no longer in Liftosaur for user ${userId} from ${startDate} to ${endDate}.`
    );
  }
  return deleted;
}

/**
 * Move an entry that was updated in place under the session it was just
 * synced into. An entry can still hang under an older Liftosaur session
 * (one from before source ids, which the cleanup deletes); a session delete
 * cascades to its entries, so the entry has to be moved first.
 */
export async function moveEntryToSessionWithClient(
  client: PoolClient,
  userId: string,
  entryId: string,
  sessionId: string
): Promise<void> {
  await client.query(
    `UPDATE exercise_entries
     SET exercise_preset_entry_id = $3, updated_at = NOW()
     WHERE id = $1 AND user_id = $2
       AND exercise_preset_entry_id IS DISTINCT FROM $3`,
    [entryId, userId, sessionId]
  );
}

/** What a stored Liftosaur entry says about its duration. */
export interface StoredEntryDuration {
  duration_minutes: number;
  /** Fields the user edited, which a re-sync keeps (see utils/manualFields.ts). */
  manual_fields: string[];
}

/**
 * Stored duration and edited fields of the Liftosaur entries with these
 * source ids, keyed by source id, so a re-sync can keep the workout duration
 * on the entry that held it before.
 */
export async function getStoredEntryDurationsWithClient(
  client: PoolClient,
  userId: string,
  sourceIds: string[]
): Promise<Map<string, StoredEntryDuration>> {
  if (sourceIds.length === 0) return new Map();
  const result = await client.query<
    StoredEntryDuration & { source_id: string }
  >(
    `SELECT source_id,
            COALESCE(duration_minutes, 0)::float8 AS duration_minutes,
            COALESCE(manual_fields, '{}') AS manual_fields
     FROM exercise_entries
     WHERE user_id = $1 AND source = $2 AND source_id = ANY($3::text[])`,
    [userId, LIFTOSAUR_SESSION_SOURCE, sourceIds]
  );
  return new Map(
    result.rows.map((row) => [
      row.source_id,
      {
        duration_minutes: Number(row.duration_minutes) || 0,
        manual_fields: row.manual_fields ?? [],
      },
    ])
  );
}
