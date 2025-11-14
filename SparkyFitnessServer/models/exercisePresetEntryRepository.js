const { getClient } = require('../db/poolManager');
const { log } = require('../config/logging');
const format = require('pg-format');

async function createExercisePresetEntry(userId, entryData, createdByUserId) {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO exercise_preset_entries (user_id, workout_preset_id, name, description, entry_date, created_by_user_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [userId, entryData.workout_preset_id, entryData.name, entryData.description, entryData.entry_date, createdByUserId, entryData.notes]
    );
    const newEntryId = result.rows[0].id;

    await client.query('COMMIT');
    return getExercisePresetEntryById(newEntryId, userId);
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
    const result = await client.query(
      `SELECT id, user_id, workout_preset_id, name, description, entry_date, created_at, updated_at, created_by_user_id, notes
       FROM exercise_preset_entries
       WHERE id = $1`,
      [id]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getExercisePresetEntriesByDate(userId, entryDate) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT id, user_id, workout_preset_id, name, description, entry_date, created_at, updated_at, created_by_user_id, notes
       FROM exercise_preset_entries
       WHERE user_id = $1 AND entry_date = $2
       ORDER BY created_at ASC`,
      [userId, entryDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function updateExercisePresetEntry(id, userId, updateData) {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE exercise_preset_entries SET
         workout_preset_id = COALESCE($1, workout_preset_id),
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         entry_date = COALESCE($4, entry_date),
         notes = COALESCE($5, notes),
         updated_at = now()
       WHERE id = $6 AND user_id = $7
       RETURNING id`,
      [updateData.workout_preset_id, updateData.name, updateData.description, updateData.entry_date, updateData.notes, id, userId]
    );

    await client.query('COMMIT');
    return getExercisePresetEntryById(id, userId);
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

module.exports = {
  createExercisePresetEntry,
  getExercisePresetEntryById,
  getExercisePresetEntriesByDate,
  updateExercisePresetEntry,
  deleteExercisePresetEntry,
};