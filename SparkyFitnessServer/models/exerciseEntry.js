const { getClient, getSystemClient } = require('../db/poolManager');
const format = require('pg-format');
const { log } = require('../config/logging');
const exerciseRepository = require('./exercise');

async function upsertExerciseEntryData(userId, createdByUserId, exerciseId, caloriesBurned, date) {
  log('info', "upsertExerciseEntryData received date parameter:", date);
  const client = await getClient(userId);
  let existingEntry = null;
  try {
    const result = await client.query(
      'SELECT id, calories_burned FROM exercise_entries WHERE user_id = $1 AND exercise_id = $2 AND entry_date = $3',
      [userId, exerciseId, date]
    );
    existingEntry = result.rows[0];
  } catch (error) {
    log('error', "Error checking for existing active calories exercise entry:", error);
    throw new Error(`Failed to check existing active calories exercise entry: ${error.message}`);
  } finally {
    client.release();
  }

  let result;
  if (existingEntry) {
    log('info', `Existing active calories entry found for ${date}, updating calories from ${existingEntry.calories_burned} to ${caloriesBurned}.`);
    const updateClient = await getClient(userId);
    try {
      const updateResult = await updateClient.query(
        'UPDATE exercise_entries SET calories_burned = $1, notes = $2, updated_by_user_id = $3 WHERE id = $4 RETURNING *',
        [caloriesBurned, 'Active calories logged from Apple Health (updated).', createdByUserId, existingEntry.id]
      );
      result = updateResult.rows[0];
    } catch (error) {
      log('error', "Error updating active calories exercise entry:", error);
      throw new Error(`Failed to update active calories exercise entry: ${error.message}`);
    } finally {
      updateClient.release();
    }
  } else {
    log('info', `No existing active calories entry found for ${date}, inserting new entry.`);
    const insertClient = await getClient(userId);
    try {
      const insertResult = await insertClient.query(
        `INSERT INTO exercise_entries (user_id, exercise_id, entry_date, calories_burned, duration_minutes, notes, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [userId, exerciseId, date, caloriesBurned, 0, 'Active calories logged from Apple Health.', createdByUserId]
      );
      result = insertResult.rows[0];
    } catch (error) {
      log('error', "Error inserting active calories exercise entry:", error);
      throw new Error(`Failed to insert active calories exercise entry: ${error.message}`);
    } finally {
      insertClient.release();
    }
  }
  return result;
}

async function createExerciseEntry(userId, entryData, createdByUserId) {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');

    // 1. Fetch the exercise details to create the snapshot
    const exerciseSnapshotQuery = await client.query(
      `SELECT name, calories_per_hour, category, source, source_id, force, level, mechanic, equipment, primary_muscles, secondary_muscles, instructions, images
       FROM exercises WHERE id = $1`,
      [entryData.exercise_id]
    );

    if (exerciseSnapshotQuery.rows.length === 0) {
      throw new Error("Exercise not found for snapshotting.");
    }
    const snapshot = exerciseSnapshotQuery.rows[0];

    // 2. Insert the exercise entry with the snapshot data
    const entryResult = await client.query(
      `INSERT INTO exercise_entries (
         user_id, exercise_id, duration_minutes, calories_burned, entry_date, notes,
         workout_plan_assignment_id, image_url, created_by_user_id,
         exercise_name, calories_per_hour, category, source, source_id, force, level, mechanic,
         equipment, primary_muscles, secondary_muscles, instructions, images
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22) RETURNING id`,
      [
        userId,
        entryData.exercise_id,
        typeof entryData.duration_minutes === 'number' ? entryData.duration_minutes : 0,
        entryData.calories_burned,
        entryData.entry_date,
        entryData.notes,
        entryData.workout_plan_assignment_id || null,
        entryData.image_url || null,
        createdByUserId,
        snapshot.name, // exercise_name
        snapshot.calories_per_hour,
        snapshot.category,
        snapshot.source,
        snapshot.source_id,
        snapshot.force,
        snapshot.level,
        snapshot.mechanic,
        snapshot.equipment,
        snapshot.primary_muscles,
        snapshot.secondary_muscles,
        snapshot.instructions,
        snapshot.images,
      ]
    );
    const newEntryId = entryResult.rows[0].id;

    if (entryData.sets && entryData.sets.length > 0) {
      const setsValues = entryData.sets.map(set => [
        newEntryId, set.set_number, set.set_type, set.reps, set.weight, set.duration, set.rest_time, set.notes
      ]);
      const setsQuery = format(
        `INSERT INTO exercise_entry_sets (exercise_entry_id, set_number, set_type, reps, weight, duration, rest_time, notes) VALUES %L`,
        setsValues
      );
      await client.query(setsQuery);
    }

    await client.query('COMMIT');
    return getExerciseEntryById(newEntryId, userId); // Refetch to get full data
  } catch (error) {
    await client.query('ROLLBACK');
    log('error', `Error creating exercise entry with snapshot:`, error);
    throw error;
  } finally {
    client.release();
  }
}

async function getExerciseEntryById(id, userId) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ee.*,
               COALESCE(
                 (SELECT json_agg(set_data ORDER BY set_data.set_number)
                  FROM (
                    SELECT ees.id, ees.set_number, ees.set_type, ees.reps, ees.weight, ees.duration, ees.rest_time, ees.notes
                    FROM exercise_entry_sets ees
                    WHERE ees.exercise_entry_id = ee.id
                  ) AS set_data
                 ), '[]'::json
               ) AS sets
        FROM exercise_entries ee
        WHERE ee.id = $1`,
      [id]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getExerciseEntryOwnerId(id, userId) {
  const client = await getClient(userId);
  try {
    const entryResult = await client.query(
      'SELECT user_id FROM exercise_entries WHERE id = $1',
      [id]
    );
    return entryResult.rows[0]?.user_id;
  } finally {
    client.release();
  }
}

async function updateExerciseEntry(id, userId, updateData) {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE exercise_entries SET
        exercise_id = COALESCE($1, exercise_id),
        duration_minutes = COALESCE($2, duration_minutes),
        calories_burned = COALESCE($3, calories_burned),
        entry_date = COALESCE($4, entry_date),
        notes = COALESCE($5, notes),
        workout_plan_assignment_id = COALESCE($6, workout_plan_assignment_id),
        image_url = $7,
        updated_at = now()
      WHERE id = $8 AND user_id = $9
      RETURNING id`,
      [
        updateData.exercise_id,
        updateData.duration_minutes || null,
        updateData.calories_burned,
        updateData.entry_date,
        updateData.notes,
        updateData.workout_plan_assignment_id || null,
        updateData.image_url || null,
        id,
        userId,
      ]
    );

    // Only modify sets if they are explicitly provided in the update
    if (updateData.sets !== undefined) {
      // Delete old sets for the entry
      await client.query('DELETE FROM exercise_entry_sets WHERE exercise_entry_id = $1', [id]);

      // Insert new sets if provided and not empty
      if (Array.isArray(updateData.sets) && updateData.sets.length > 0) {
        const setsValues = updateData.sets.map(set => [
          id, set.set_number, set.set_type, set.reps, set.weight, set.duration, set.rest_time, set.notes
        ]);
        const setsQuery = format(
          `INSERT INTO exercise_entry_sets (exercise_entry_id, set_number, set_type, reps, weight, duration, rest_time, notes) VALUES %L`,
          setsValues
        );
        await client.query(setsQuery);
      }
    }

    await client.query('COMMIT');
    return getExerciseEntryById(id); // Refetch to get full data
  } finally {
    client.release();
  }
}

async function deleteExerciseEntry(id, userId) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'DELETE FROM exercise_entries WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

async function getExerciseEntriesByDate(userId, selectedDate) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT
         ee.*,
         COALESCE(
           (SELECT json_agg(set_data ORDER BY set_data.set_number)
            FROM (
              SELECT ees.id, ees.set_number, ees.set_type, ees.reps, ees.weight, ees.duration, ees.rest_time, ees.notes
              FROM exercise_entry_sets ees
              WHERE ees.exercise_entry_id = ee.id
            ) AS set_data
           ), '[]'::json
         ) AS sets
       FROM exercise_entries ee
       WHERE ee.user_id = $1 AND ee.entry_date = $2`,
      [userId, selectedDate]
    );

    return result.rows.map(row => {
      const {
        exercise_name, category, calories_per_hour, source, source_id, force, level, mechanic,
        equipment, primary_muscles, secondary_muscles, instructions, images, ...entryData
      } = row;

      return {
        ...entryData,
        exercises: {
          name: exercise_name,
          category: category,
          calories_per_hour: calories_per_hour,
          source: source,
          source_id: source_id,
          force: force,
          level: level,
          mechanic: mechanic,
          equipment: equipment,
          primary_muscles: primary_muscles,
          secondary_muscles: secondary_muscles,
          instructions: instructions,
          images: images,
        }
      };
    });
  } finally {
    client.release();
  }
}

async function getExerciseProgressData(userId, exerciseId, startDate, endDate) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT
         ee.entry_date,
         ee.calories_burned,
         ee.duration_minutes,
         COALESCE(
           (SELECT json_agg(set_data ORDER BY set_data.set_number)
            FROM (
              SELECT ees.id, ees.set_number, ees.set_type, ees.reps, ees.weight, ees.duration, ees.rest_time, ees.notes
              FROM exercise_entry_sets ees
              WHERE ees.exercise_entry_id = ee.id
            ) AS set_data
           ), '[]'::json
         ) AS sets
       FROM exercise_entries ee
       WHERE ee.user_id = $1
         AND ee.exercise_id = $2
         AND ee.entry_date BETWEEN $3 AND $4
       ORDER BY ee.entry_date ASC`,
      [userId, exerciseId, startDate, endDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}
 
async function getExerciseHistory(userId, exerciseId, limit = 5) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT
         ee.entry_date,
         ee.duration_minutes,
         ee.calories_burned,
         ee.notes,
         ee.image_url,
         COALESCE(
           (SELECT json_agg(set_data ORDER BY set_data.set_number)
            FROM (
              SELECT ees.id, ees.set_number, ees.set_type, ees.reps, ees.weight, ees.duration, ees.rest_time, ees.notes
              FROM exercise_entry_sets ees
              WHERE ees.exercise_entry_id = ee.id
            ) AS set_data
           ), '[]'::json
         ) AS sets
       FROM exercise_entries ee
       WHERE ee.user_id = $1
         AND ee.exercise_id = $2
       ORDER BY ee.entry_date DESC, ee.created_at DESC
       LIMIT $3`,
      [userId, exerciseId, limit]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

module.exports = {
  upsertExerciseEntryData,
  createExerciseEntry,
  getExerciseEntryById,
  getExerciseEntryOwnerId,
  updateExerciseEntry,
  deleteExerciseEntry,
  getExerciseEntriesByDate,
  getExerciseProgressData,
  getExerciseHistory,
};