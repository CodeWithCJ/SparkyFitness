import { getClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
const PRESET_ENTRY_SELECT = `
  SELECT id, user_id, workout_preset_id, name, description, entry_date, created_at,
         updated_at, created_by_user_id, notes, source
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
    `INSERT INTO exercise_preset_entries (user_id, workout_preset_id, name, description, entry_date, created_by_user_id, notes, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      userId,
      entryData.workout_preset_id ?? null,
      entryData.name,
      entryData.description ?? null,
      entryData.entry_date,
      createdByUserId,
      entryData.notes ?? null,
      entryData.source ?? 'manual',
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
       updated_at = now()
     WHERE id = $7 AND user_id = $8
     RETURNING id`,
    [
      mergedEntry.workout_preset_id,
      mergedEntry.name,
      mergedEntry.description,
      mergedEntry.entry_date,
      mergedEntry.notes,
      mergedEntry.source,
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
async function deleteExercisePresetEntriesByEntrySourceAndDate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entrySource: any
) {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    // Get IDs of exercise preset entries to be deleted
    const presetEntryIdsResult = await client.query(
      `SELECT id FROM exercise_preset_entries
       WHERE user_id = $1
         AND entry_date BETWEEN $2 AND $3
         AND source = $4`,
      [userId, startDate, endDate, entrySource]
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const presetEntryIds = presetEntryIdsResult.rows.map((row: any) => row.id);
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
      await client.query('COMMIT');
      return result.rowCount;
    } else {
      log(
        'info',
        `[exercisePresetEntryRepository] No exercise preset entries with source '${entrySource}' found for user ${userId} from ${startDate} to ${endDate}.`
      );
      await client.query('COMMIT');
      return 0;
    }
  } catch (error) {
    await client.query('ROLLBACK');
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `Error deleting exercise preset entries by source and date: ${error.message}`,
      { userId, startDate, endDate, entrySource, error }
    );
    throw error;
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
};
