const { getClient, getSystemClient } = require('../db/poolManager');
const format = require('pg-format');
const { log } = require('../config/logging');
const exerciseRepository = require('./exercise');
const activityDetailsRepository = require('./activityDetailsRepository'); // New import

async function upsertExerciseEntryData(userId, createdByUserId, exerciseId, caloriesBurned, date) {
  log('info', "upsertExerciseEntryData received date parameter:", date);
  const client = await getClient(userId);
  let existingEntry = null;
  let exerciseName = 'Unknown Exercise'; // Default value

  try {
    // Fetch exercise name
    const exercise = await exerciseRepository.getExerciseById(exerciseId, userId);
    if (exercise) {
      exerciseName = exercise.name;
      log('info', `Fetched exercise name: ${exerciseName} for exerciseId: ${exerciseId}`);
    } else {
      log('warn', `Exercise with ID ${exerciseId} not found for user ${userId}. Using default name.`);
    }

    const result = await client.query(
      'SELECT id, calories_burned FROM exercise_entries WHERE user_id = $1 AND exercise_id = $2 AND entry_date = $3',
      [userId, exerciseId, date]
    );
    existingEntry = result.rows[0];
  } catch (error) {
    log('error', "Error checking for existing active calories exercise entry or fetching exercise name:", error);
    throw new Error(`Failed to check existing active calories exercise entry or fetch exercise name: ${error.message}`);
  } finally {
    client.release();
  }

  let result;
  if (existingEntry) {
    log('info', `Existing active calories entry found for ${date}, updating calories from ${existingEntry.calories_burned} to ${caloriesBurned}.`);
    const updateClient = await getClient(userId);
    try {
      const updateResult = await updateClient.query(
        'UPDATE exercise_entries SET calories_burned = $1, notes = $2, updated_by_user_id = $3, exercise_name = $4 WHERE id = $5 RETURNING *',
        [caloriesBurned, 'Active calories logged from Apple Health (updated).', createdByUserId, exerciseName, existingEntry.id]
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
        `INSERT INTO exercise_entries (user_id, exercise_id, entry_date, calories_burned, duration_minutes, notes, created_by_user_id, exercise_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [userId, exerciseId, date, caloriesBurned, 0, 'Active calories logged from Apple Health.', createdByUserId, exerciseName]
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

async function _updateExerciseEntryWithClient(client, id, userId, updateData, updatedByUserId, entrySource) {
  // Fetch existing entry to get current snapshot values if not provided in updateData
  const existingEntryResult = await client.query(
    `SELECT * FROM exercise_entries WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  if (existingEntryResult.rows.length === 0) {
    throw new Error('Exercise entry not found for update.');
  }
  const currentEntry = existingEntryResult.rows[0];

  // Merge updateData with currentEntry to ensure all fields are present for the update statement
  // Prioritize updateData, then currentEntry, then defaults
  const mergedData = {
    ...currentEntry, // Start with existing data
    ...updateData,    // Overlay with new data
    exercise_id: updateData.exercise_id || currentEntry.exercise_id,
    duration_minutes: typeof updateData.duration_minutes === 'number' ? updateData.duration_minutes : currentEntry.duration_minutes,
    calories_burned: updateData.calories_burned || currentEntry.calories_burned,
    entry_date: updateData.entry_date || currentEntry.entry_date,
    notes: updateData.notes || currentEntry.notes,
    workout_plan_assignment_id: updateData.workout_plan_assignment_id || currentEntry.workout_plan_assignment_id,
    image_url: updateData.image_url === null ? null : (updateData.image_url || currentEntry.image_url),
    distance: updateData.distance || currentEntry.distance,
    avg_heart_rate: updateData.avg_heart_rate || currentEntry.avg_heart_rate,
    // Snapshot fields - these should ideally come from the exercise itself if exercise_id is updated
    exercise_name: updateData.exercise_name || currentEntry.exercise_name,
    calories_per_hour: updateData.calories_per_hour || currentEntry.calories_per_hour,
    category: updateData.category || currentEntry.category,
    source: entrySource || currentEntry.source, // Use provided entrySource or existing
    source_id: updateData.source_id || currentEntry.source_id,
    force: updateData.force || currentEntry.force,
    level: updateData.level || currentEntry.level,
    mechanic: updateData.mechanic || currentEntry.mechanic,
    equipment: updateData.equipment || currentEntry.equipment,
    primary_muscles: updateData.primary_muscles || currentEntry.primary_muscles,
    secondary_muscles: updateData.secondary_muscles || currentEntry.secondary_muscles,
    instructions: updateData.instructions || currentEntry.instructions,
    images: updateData.images || currentEntry.images,
  };

  // If exercise_id is explicitly updated, re-fetch snapshot data from the exercise
  if (updateData.exercise_id && updateData.exercise_id !== currentEntry.exercise_id) {
    const exercise = await exerciseRepository.getExerciseById(updateData.exercise_id, userId);
    if (!exercise) {
      throw new Error("Exercise not found for snapshot update.");
    }
    mergedData.exercise_name = exercise.name;
    mergedData.calories_per_hour = exercise.calories_per_hour;
    mergedData.category = exercise.category;
    mergedData.source_id = exercise.source_id;
    mergedData.force = exercise.force;
    mergedData.level = exercise.level;
    mergedData.mechanic = exercise.mechanic;
    mergedData.equipment = exercise.equipment;
    mergedData.primary_muscles = exercise.primary_muscles;
    mergedData.secondary_muscles = exercise.secondary_muscles;
    mergedData.instructions = exercise.instructions;
    mergedData.images = exercise.images;
  }


  const result = await client.query(
    `UPDATE exercise_entries SET
      exercise_id = $1,
      duration_minutes = $2,
      calories_burned = $3,
      entry_date = $4,
      notes = $5,
      workout_plan_assignment_id = $6,
      image_url = $7,
      distance = $8,
      avg_heart_rate = $9,
      updated_by_user_id = $10,
      exercise_name = $11,
      calories_per_hour = $12,
      category = $13,
      source = $14,
      source_id = $15,
      force = $16,
      level = $17,
      mechanic = $18,
      equipment = $19,
      primary_muscles = $20,
      secondary_muscles = $21,
      instructions = $22,
      images = $23,
      updated_at = now()
    WHERE id = $24 AND user_id = $25
    RETURNING id`,
    [
      mergedData.exercise_id,
      mergedData.duration_minutes,
      mergedData.calories_burned,
      mergedData.entry_date,
      mergedData.notes,
      mergedData.workout_plan_assignment_id,
      mergedData.image_url,
      mergedData.distance,
      mergedData.avg_heart_rate,
      updatedByUserId,
      mergedData.exercise_name,
      mergedData.calories_per_hour,
      mergedData.category,
      mergedData.source,
      mergedData.source_id,
      mergedData.force,
      mergedData.level,
      mergedData.mechanic,
      mergedData.equipment ? JSON.stringify(mergedData.equipment) : null,
      mergedData.primary_muscles ? JSON.stringify(mergedData.primary_muscles) : null,
      mergedData.secondary_muscles ? JSON.stringify(mergedData.secondary_muscles) : null,
      mergedData.instructions ? JSON.stringify(mergedData.instructions) : null,
      mergedData.images ? JSON.stringify(mergedData.images) : null,
      id,
      userId,
    ]
  );

  // Handle sets update
  if (updateData.sets !== undefined) { // Only modify sets if they are explicitly provided
    await client.query('DELETE FROM exercise_entry_sets WHERE exercise_entry_id = $1', [id]);
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
  return getExerciseEntryById(id, userId); // Refetch to get full data
}

async function createExerciseEntry(userId, entryData, createdByUserId, entrySource = 'Manual') {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');

    // Check for existing entry
    const existingEntryResult = await client.query(
      'SELECT id FROM exercise_entries WHERE user_id = $1 AND exercise_id = $2 AND entry_date = $3 AND source = $4',
      [userId, entryData.exercise_id, entryData.entry_date, entrySource]
    );

    let newEntryId;
    if (existingEntryResult.rows.length > 0) {
      // Entry exists, update it
      const existingEntryId = existingEntryResult.rows[0].id;
      log('info', `Existing exercise entry found for user ${userId}, exercise ${entryData.exercise_id}, date ${entryData.entry_date}, source ${entrySource}. Updating entry ${existingEntryId}.`);
      const updatedEntry = await _updateExerciseEntryWithClient(client, existingEntryId, userId, entryData, createdByUserId, entrySource);
      newEntryId = updatedEntry.id;
    } else {
      // No existing entry, create a new one
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
           equipment, primary_muscles, secondary_muscles, instructions, images,
           distance, avg_heart_rate
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24) RETURNING id`,
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
          entrySource, // Use entrySource for the entry's source
          snapshot.source_id, // source_id still comes from the exercise definition
          snapshot.force,
          snapshot.level,
          snapshot.mechanic,
          snapshot.equipment,
          snapshot.primary_muscles,
          snapshot.secondary_muscles,
          snapshot.instructions,
          snapshot.images,
          entryData.distance || null,
          entryData.avg_heart_rate || null,
        ]
      );
      newEntryId = entryResult.rows[0].id;

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
    }

    await client.query('COMMIT');
    return getExerciseEntryById(newEntryId, userId); // Refetch to get full data
  } catch (error) {
    await client.query('ROLLBACK');
    log('error', `Error creating/updating exercise entry with snapshot:`, error);
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
               ) AS sets,
               ee.distance,
               ee.avg_heart_rate
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
        distance = COALESCE($8, distance),
        avg_heart_rate = COALESCE($9, avg_heart_rate),
        updated_at = now()
      WHERE id = $10 AND user_id = $11
      RETURNING id`,
      [
        updateData.exercise_id,
        updateData.duration_minutes || null,
        updateData.calories_burned,
        updateData.entry_date,
        updateData.notes,
        updateData.workout_plan_assignment_id || null,
        updateData.image_url || null,
        updateData.distance || null,
        updateData.avg_heart_rate || null,
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
  return getExerciseEntryById(id, userId); // Refetch to get full data
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
          ) AS sets,
          ee.distance,
          ee.avg_heart_rate
        FROM exercise_entries ee
        WHERE ee.user_id = $1 AND ee.entry_date = $2`,
      [userId, selectedDate]
    );

    const entriesWithDetails = await Promise.all(result.rows.map(async row => {
      const activityDetails = await activityDetailsRepository.getActivityDetailsByEntryId(userId, row.id);
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
        },
        activity_details: activityDetails,
      };
    }));

    log('debug', `getExerciseEntriesByDate: Returning entries with details for user ${userId} on ${selectedDate}:`, entriesWithDetails);
    return entriesWithDetails;
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
         ee.duration_minutes,
         ee.calories_burned,
         ee.notes,
         ee.image_url,
         ee.distance,
         ee.avg_heart_rate,
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
         ee.distance,
         ee.avg_heart_rate,
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

async function deleteExerciseEntriesByEntrySourceAndDate(userId, entryDate, entrySource) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `DELETE FROM exercise_entries
       WHERE user_id = $1
         AND entry_date = $2
         AND source = $3`,
      [userId, entryDate, entrySource]
    );
    log('info', `Deleted ${result.rowCount} exercise entries with source '${entrySource}' for user ${userId} on ${entryDate}.`);
    return result.rowCount;
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
  deleteExerciseEntriesByEntrySourceAndDate,
};