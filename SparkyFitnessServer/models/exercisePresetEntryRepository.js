const { getClient } = require('../db/poolManager');
const { log } = require('../config/logging');

const PRESET_ENTRY_SELECT = `
  SELECT id, user_id, workout_preset_id, name, description, entry_date, created_at,
         updated_at, created_by_user_id, notes, source
  FROM exercise_preset_entries
`;

async function getExercisePresetEntryByIdWithClient(client, id, userId) {
  const result = await client.query(
    `${PRESET_ENTRY_SELECT}
     WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return result.rows[0] || null;
}

async function createExercisePresetEntryWithClient(
  client,
  userId,
  entryData,
  createdByUserId
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

async function createExercisePresetEntry(userId, entryData, createdByUserId) {
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
    log('error', `Error creating exercise preset entry:`, error);
    throw error;
  } finally {
    client.release();
  }
}

async function getExercisePresetEntryById(id, userId) {
  const client = await getClient(userId);
  try {
    return getExercisePresetEntryByIdWithClient(client, id, userId);
  } finally {
    client.release();
  }
}

async function getExercisePresetEntriesByDate(userId, entryDate) {
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
  client,
  id,
  userId,
  updateData
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

async function updateExercisePresetEntry(id, userId, updateData) {
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

async function deleteExercisePresetEntry(id, userId) {
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
  userId,
  startDate,
  endDate,
  entrySource
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
    const presetEntryIds = presetEntryIdsResult.rows.map((row) => row.id);

    if (presetEntryIds.length > 0) {
      // Delete associated activity details (if any, though currently full_activity_data is linked to exercise_entry)
      // This assumes exercise_entry_activity_details might eventually link to exercise_preset_entries directly.
      // For now, we'll just delete the preset entries.
      // If activity details are linked to preset entries, a similar deletion logic would be needed here.

      // Delete the exercise preset entries themselves
      const result = await client.query(
        `DELETE FROM exercise_preset_entries WHERE id = ANY($1::uuid[])`,
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
      `Error deleting exercise preset entries by source and date: ${error.message}`,
      { userId, startDate, endDate, entrySource, error }
    );
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createExercisePresetEntry,
  createExercisePresetEntryWithClient,
  getExercisePresetEntryById,
  getExercisePresetEntryByIdWithClient,
  getExercisePresetEntriesByDate,
  updateExercisePresetEntry,
  updateExercisePresetEntryWithClient,
  deleteExercisePresetEntry,
  deleteExercisePresetEntriesByEntrySourceAndDate, // New export
};
