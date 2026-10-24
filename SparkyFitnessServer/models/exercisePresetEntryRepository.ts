import type { PoolClient } from 'pg';
import { getClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
import { clearCalorieLinksForPresetEntryWithClient } from '../services/exerciseCalorieLinkService.js';
const PRESET_ENTRY_SELECT = `
  SELECT id, user_id, workout_preset_id, name, description, entry_date, created_at,
         updated_at, created_by_user_id, notes, source, location
  FROM exercise_preset_entries
`;

async function getExercisePresetEntryByIdWithClient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  id: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any
) {
  const result = await client.query(
    `${PRESET_ENTRY_SELECT}
     WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return result.rows[0] || null;
}
async function createExercisePresetEntryWithClient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryData: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createdByUserId: any
) {
  const result = await client.query(
    // workout_format is snapshotted from the preset so later preset edits or
    // deletes don't reclassify this session's sets.
    `INSERT INTO exercise_preset_entries (user_id, workout_preset_id, name, description, entry_date, created_by_user_id, notes, source, location, workout_format)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
             COALESCE((SELECT wp.workout_format FROM workout_presets wp WHERE wp.id = $2), 'standard'))
     RETURNING id`,
    [
      userId,
      entryData.workout_preset_id ?? null,
      entryData.name,
      entryData.description ?? null,
      entryData.entry_date,
      createdByUserId,
      entryData.notes ?? null,
      entryData.source ?? 'manual',
      entryData.location ?? null,
    ]
  );
  return getExercisePresetEntryByIdWithClient(
    client,
    result.rows[0].id,
    userId
  );
}

async function createExercisePresetEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryData: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createdByUserId: any
) {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    const entry = await createExercisePresetEntryWithClient(
      client,
      userId,
      entryData,
      createdByUserId
    );
    await client.query('COMMIT');
    return entry;
  } catch (error) {
    await client.query('ROLLBACK');
    log('error', 'Error creating exercise preset entry:', error);
    throw error;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getExercisePresetEntryById(id: any, userId: any) {
  const client = await getClient(userId);
  try {
    return getExercisePresetEntryByIdWithClient(client, id, userId);
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getExercisePresetEntriesByDate(userId: any, entryDate: any) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `${PRESET_ENTRY_SELECT}
       WHERE user_id = $1 AND entry_date = $2
       ORDER BY created_at ASC`,
      [userId, entryDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}
async function updateExercisePresetEntryWithClient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  id: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateData: any
) {
  const existingEntry = await getExercisePresetEntryByIdWithClient(
    client,
    id,
    userId
  );
  if (!existingEntry) {
    return null;
  }
  const mergedEntry = {
    workout_preset_id:
      updateData.workout_preset_id !== undefined
        ? updateData.workout_preset_id
        : existingEntry.workout_preset_id,
    name: updateData.name !== undefined ? updateData.name : existingEntry.name,
    description:
      updateData.description !== undefined
        ? updateData.description
        : existingEntry.description,
    entry_date:
      updateData.entry_date !== undefined
        ? updateData.entry_date
        : existingEntry.entry_date,
    notes:
      updateData.notes !== undefined ? updateData.notes : existingEntry.notes,
    location:
      updateData.location !== undefined
        ? updateData.location
        : existingEntry.location,
    source:
      updateData.source !== undefined
        ? updateData.source
        : existingEntry.source,
  };
  const result = await client.query(
    `UPDATE exercise_preset_entries SET
       workout_preset_id = $1,
       name = $2,
       description = $3,
       entry_date = $4,
       notes = $5,
       source = $6,
       location = $7,
       workout_format = CASE
         WHEN workout_preset_id IS DISTINCT FROM $1
           THEN COALESCE((SELECT wp.workout_format FROM workout_presets wp WHERE wp.id = $1), 'standard')
         ELSE workout_format
       END,
       updated_at = now()
     WHERE id = $8 AND user_id = $9
     RETURNING id`,
    [
      mergedEntry.workout_preset_id,
      mergedEntry.name,
      mergedEntry.description,
      mergedEntry.entry_date,
      mergedEntry.notes,
      mergedEntry.source,
      mergedEntry.location,
      id,
      userId,
    ]
  );
  if (result.rowCount === 0) {
    return null;
  }
  return getExercisePresetEntryByIdWithClient(client, id, userId);
}

async function updateExercisePresetEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  id: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateData: any
) {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    const updatedEntry = await updateExercisePresetEntryWithClient(
      client,
      id,
      userId,
      updateData
    );
    await client.query('COMMIT');
    return updatedEntry;
  } catch (error) {
    await client.query('ROLLBACK');
    log('error', `Error updating exercise preset entry ${id}:`, error);
    throw error;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteExercisePresetEntry(id: any, userId: any) {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    // Lock the session before its exercises. A reorder locks this row first;
    // clearing linked calories first would let that reorder hold the exercise
    // rows and commit ahead of the delete.
    const locked = await client.query(
      'SELECT id FROM exercise_preset_entries WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [id, userId]
    );
    if (!locked.rowCount) {
      await client.query('ROLLBACK');
      return false;
    }
    await clearCalorieLinksForPresetEntryWithClient(client, userId, id);
    const result = await client.query(
      'DELETE FROM exercise_preset_entries WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    await client.query('COMMIT');
    return result.rowCount > 0;
  } catch (error) {
    await client.query('ROLLBACK');
    log('error', `Error deleting exercise preset entry ${id}:`, error);
    throw error;
  } finally {
    client.release();
  }
}
async function deleteExercisePresetEntriesByEntrySourceAndDateWithClient(
  client: PoolClient,
  userId: string,
  startDate: string,
  endDate: string,
  entrySource: string
) {
  // Get IDs of exercise preset entries to be deleted
  const presetEntryIdsResult = await client.query(
    `SELECT id FROM exercise_preset_entries
     WHERE user_id = $1
       AND entry_date BETWEEN $2 AND $3
       AND source = $4`,
    [userId, startDate, endDate, entrySource]
  );
  const presetEntryIds = presetEntryIdsResult.rows.map(
    (row: { id: string }) => row.id
  );
  if (presetEntryIds.length > 0) {
    // Delete associated activity details (if any, though currently full_activity_data is linked to exercise_entry)
    // This assumes exercise_entry_activity_details might eventually link to exercise_preset_entries directly.
    // For now, we'll just delete the preset entries.
    // If activity details are linked to preset entries, a similar deletion logic would be needed here.
    // Delete the exercise preset entries themselves
    const result = await client.query(
      'DELETE FROM exercise_preset_entries WHERE id = ANY($1::uuid[])',
      [presetEntryIds]
    );
    log(
      'info',
      `[exercisePresetEntryRepository] Deleted ${result.rowCount} exercise preset entries with source '${entrySource}' for user ${userId} from ${startDate} to ${endDate}.`
    );
    return result.rowCount;
  }
  log(
    'info',
    `[exercisePresetEntryRepository] No exercise preset entries with source '${entrySource}' found for user ${userId} from ${startDate} to ${endDate}.`
  );
  return 0;
}

async function deleteExercisePresetEntriesByEntrySourceAndDate(
  userId: string,
  startDate: string,
  endDate: string,
  entrySource: string
) {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    const deletedCount =
      await deleteExercisePresetEntriesByEntrySourceAndDateWithClient(
        client,
        userId,
        startDate,
        endDate,
        entrySource
      );
    await client.query('COMMIT');
    return deletedCount;
  } catch (error) {
    await client.query('ROLLBACK');
    log(
      'error',
      `Error deleting exercise preset entries by source and date: ${error instanceof Error ? error.message : String(error)}`,
      { userId, startDate, endDate, entrySource, error }
    );
    throw error;
  } finally {
    client.release();
  }
}
/** The user's own distinct workout locations, most recently used first. */
async function getDistinctLocations(userId: string): Promise<string[]> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT location
       FROM exercise_preset_entries
       WHERE user_id = $1 AND location IS NOT NULL AND TRIM(location) != ''
       GROUP BY location
       ORDER BY MAX(entry_date) DESC, MAX(created_at) DESC
       LIMIT 5`,
      [userId]
    );
    return result.rows.map((row: { location: string }) => row.location);
  } finally {
    client.release();
  }
}

export { createExercisePresetEntry };
export { createExercisePresetEntryWithClient };
export { getExercisePresetEntryById };
export { getExercisePresetEntryByIdWithClient };
export { getExercisePresetEntriesByDate };
export { updateExercisePresetEntry };
export { updateExercisePresetEntryWithClient };
export { deleteExercisePresetEntry };
export { deleteExercisePresetEntriesByEntrySourceAndDate };
export { deleteExercisePresetEntriesByEntrySourceAndDateWithClient };
export { getDistinctLocations };
export default {
  createExercisePresetEntry,
  createExercisePresetEntryWithClient,
  getExercisePresetEntryById,
  getExercisePresetEntryByIdWithClient,
  getExercisePresetEntriesByDate,
  updateExercisePresetEntry,
  updateExercisePresetEntryWithClient,
  deleteExercisePresetEntry,
  deleteExercisePresetEntriesByEntrySourceAndDate,
  deleteExercisePresetEntriesByEntrySourceAndDateWithClient,
  getDistinctLocations,
};
