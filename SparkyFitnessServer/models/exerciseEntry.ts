const { getClient } = require('../db/poolManager');
const format = require('pg-format');
import { log } from '../config/logging';
const exerciseRepository = require('./exercise');
const activityDetailsRepository = require('./activityDetailsRepository');

export interface ExerciseEntrySet {
  id?: string;
  set_number: number;
  set_type: string;
  reps?: number;
  weight?: number;
  duration?: number;
  rest_time?: number;
  notes?: string;
  rpe?: number;
}

export interface ExerciseEntry {
  id?: string;
  user_id: string;
  exercise_id: string;
  duration_minutes: number;
  calories_burned: number;
  entry_date: string | Date;
  notes?: string;
  workout_plan_assignment_id?: string | null;
  image_url?: string | null;
  distance?: number | null;
  avg_heart_rate?: number | null;
  exercise_name?: string;
  calories_per_hour?: number;
  category?: string;
  source?: string;
  source_id?: string;
  force?: string;
  level?: string;
  mechanic?: string;
  equipment?: any;
  primary_muscles?: any;
  secondary_muscles?: any;
  instructions?: any;
  images?: any;
  sort_order?: number;
  steps?: number | null;
  exercise_preset_entry_id?: string | null;
  created_at?: Date;
  updated_at?: Date;
  sets?: ExerciseEntrySet[];
  activity_details?: any[];
}

export async function upsertExerciseEntryData(
  userId: string,
  createdByUserId: string,
  exerciseId: string,
  caloriesBurned: number,
  date: string | Date
): Promise<any> {
  log('info', 'upsertExerciseEntryData received date parameter:', date);
  const client = await getClient(userId);
  let existingEntry: any = null;
  let exerciseName = 'Unknown Exercise';

  try {
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
  } catch (error: any) {
    log('error', 'Error checking for existing active calories exercise entry or fetching exercise name:', error);
    throw new Error(`Failed to check existing active calories exercise entry or fetch exercise name: ${error.message}`);
  } finally {
    client.release();
  }

  let finalResult: any;
  if (existingEntry) {
    log('info', `Existing active calories entry found for ${date}, updating calories from ${existingEntry.calories_burned} to ${caloriesBurned}.`);
    const updateClient = await getClient(userId);
    try {
      const updateResult = await updateClient.query(
        'UPDATE exercise_entries SET calories_burned = $1, notes = $2, updated_by_user_id = $3, exercise_name = $4 WHERE id = $5 RETURNING *',
        [
          caloriesBurned,
          'Active calories logged from Apple Health (updated).',
          createdByUserId,
          exerciseName,
          existingEntry.id,
        ]
      );
      finalResult = updateResult.rows[0];
    } catch (error: any) {
      log('error', 'Error updating active calories exercise entry:', error);
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
        [
          userId,
          exerciseId,
          date,
          caloriesBurned,
          0,
          'Active calories logged from Apple Health.',
          createdByUserId,
          exerciseName,
        ]
      );
      finalResult = insertResult.rows[0];
    } catch (error: any) {
      log('error', 'Error inserting active calories exercise entry:', error);
      throw new Error(`Failed to insert active calories exercise entry: ${error.message}`);
    } finally {
      insertClient.release();
    }
  }
  return finalResult;
}

export async function _getExerciseEntryByIdWithClient(client: any, id: string): Promise<any> {
  const result = await client.query(
    `SELECT ee.*,
             COALESCE(
               (SELECT json_agg(set_data ORDER BY set_data.set_number)
                FROM (
                  SELECT ees.id, ees.set_number, ees.set_type, ees.reps, ees.weight, ees.duration, ees.rest_time, ees.notes, ees.rpe
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

  const exerciseEntry = result.rows[0];
  if (exerciseEntry) {
    ['equipment', 'primary_muscles', 'secondary_muscles', 'instructions', 'images'].forEach(field => {
      if (exerciseEntry[field] && typeof exerciseEntry[field] === 'string') {
        try {
          exerciseEntry[field] = JSON.parse(exerciseEntry[field]);
        } catch (e) {
          log('error', `Error parsing ${field} for exercise entry ${exerciseEntry.id}:`, e);
          exerciseEntry[field] = [];
        }
      }
    });
  }

  return exerciseEntry;
}

export async function _updateExerciseEntryWithClient(
  client: any,
  id: string,
  userId: string,
  updateData: any,
  updatedByUserId: string,
  entrySource?: string
): Promise<any> {
  const existingEntryResult = await client.query(
    'SELECT * FROM exercise_entries WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  if (existingEntryResult.rows.length === 0) {
    throw new Error('Exercise entry not found for update.');
  }
  const currentEntry = existingEntryResult.rows[0];

  const mergedData = {
    ...currentEntry,
    ...updateData,
    exercise_id: updateData.exercise_id !== undefined ? updateData.exercise_id : currentEntry.exercise_id,
    duration_minutes: updateData.duration_minutes !== undefined ? updateData.duration_minutes : currentEntry.duration_minutes,
    calories_burned: updateData.calories_burned !== undefined ? updateData.calories_burned : currentEntry.calories_burned,
    entry_date: updateData.entry_date !== undefined ? updateData.entry_date : currentEntry.entry_date,
    notes: updateData.notes !== undefined ? updateData.notes : currentEntry.notes,
    workout_plan_assignment_id: updateData.workout_plan_assignment_id !== undefined ? updateData.workout_plan_assignment_id : currentEntry.workout_plan_assignment_id,
    image_url: updateData.image_url === null ? null : updateData.image_url !== undefined ? updateData.image_url : currentEntry.image_url,
    distance: updateData.distance !== undefined ? updateData.distance : currentEntry.distance,
    avg_heart_rate: updateData.avg_heart_rate !== undefined ? updateData.avg_heart_rate : currentEntry.avg_heart_rate,
    sort_order: updateData.sort_order !== undefined ? updateData.sort_order : currentEntry.sort_order,
    exercise_name: updateData.exercise_name || currentEntry.exercise_name,
    calories_per_hour: updateData.calories_per_hour || currentEntry.calories_per_hour,
    category: updateData.category || currentEntry.category,
    source: entrySource || currentEntry.source,
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

  if (updateData.exercise_id && updateData.exercise_id !== currentEntry.exercise_id) {
    const exercise = await exerciseRepository.getExerciseById(updateData.exercise_id, userId);
    if (!exercise) throw new Error('Exercise not found for snapshot update.');
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

  await client.query(
    `UPDATE exercise_entries SET
      exercise_id = $1, duration_minutes = $2, calories_burned = $3, entry_date = $4, notes = $5,
      workout_plan_assignment_id = $6, image_url = $7, distance = $8, avg_heart_rate = $9,
      updated_by_user_id = $10, exercise_name = $11, calories_per_hour = $12, category = $13,
      source = $14, source_id = $15, force = $16, level = $17, mechanic = $18, equipment = $19,
      primary_muscles = $20, secondary_muscles = $21, instructions = $22, images = $23,
      sort_order = $24, steps = $25, updated_at = now()
    WHERE id = $26 AND user_id = $27`,
    [
      mergedData.exercise_id, mergedData.duration_minutes, mergedData.calories_burned, mergedData.entry_date, mergedData.notes,
      mergedData.workout_plan_assignment_id, mergedData.image_url, mergedData.distance, mergedData.avg_heart_rate,
      updatedByUserId, mergedData.exercise_name, mergedData.calories_per_hour, mergedData.category,
      mergedData.source, mergedData.source_id, mergedData.force, mergedData.level, mergedData.mechanic,
      mergedData.equipment ? JSON.stringify(mergedData.equipment) : null,
      mergedData.primary_muscles ? JSON.stringify(mergedData.primary_muscles) : null,
      mergedData.secondary_muscles ? JSON.stringify(mergedData.secondary_muscles) : null,
      mergedData.instructions ? JSON.stringify(mergedData.instructions) : null,
      mergedData.images ? JSON.stringify(mergedData.images) : null,
      mergedData.sort_order || 0, mergedData.steps || null, id, userId,
    ]
  );

  if (updateData.sets !== undefined) {
    await client.query('DELETE FROM exercise_entry_sets WHERE exercise_entry_id = $1', [id]);
    if (Array.isArray(updateData.sets) && updateData.sets.length > 0) {
      const setsValues = updateData.sets.map((set: any) => [
        id, set.set_number, set.set_type, set.reps, set.weight, set.duration, set.rest_time, set.notes, set.rpe,
      ]);
      const setsQuery = format(
        'INSERT INTO exercise_entry_sets (exercise_entry_id, set_number, set_type, reps, weight, duration, rest_time, notes, rpe) VALUES %L',
        setsValues
      );
      await client.query(setsQuery);
    }
  }
  return _getExerciseEntryByIdWithClient(client, id);
}

export async function _createExerciseEntryWithClient(
  client: any,
  userId: string,
  entryData: any,
  createdByUserId: string,
  entrySource: string = 'Manual',
  exercisePresetEntryId: string | null = null
): Promise<any> {
  try {
    const syncDuplicateCheck = !!entryData.source_id;
    const syncSources = ['HealthKit', 'Health Connect', 'Fitbit', 'Strava', 'garmin', 'Withings', 'Apple Health'];
    const isSyncSource = syncSources.includes(entrySource);

    let existingEntryResult: any;

    if (syncDuplicateCheck) {
      existingEntryResult = await client.query(
        'SELECT id FROM exercise_entries WHERE user_id = $1 AND source = $2 AND source_id = $3',
        [userId, entrySource, entryData.source_id]
      );
    }

    // Cross-source deduplication for sync sources:
    // If no exact source/source_id match, look for an entry from ANY source on the same date/duration
    if (!existingEntryResult?.rows?.length && isSyncSource && entryData.duration_minutes) {
      existingEntryResult = await client.query(
        'SELECT id FROM exercise_entries WHERE user_id = $1 AND exercise_id = $2 AND entry_date = $3 AND ABS(duration_minutes - $4) < 1.0',
        [userId, entryData.exercise_id, entryData.entry_date, entryData.duration_minutes]
      );
    }

    // Standard duplicate check for manual entries
    if (!existingEntryResult?.rows?.length && !exercisePresetEntryId && !isSyncSource && !syncDuplicateCheck) {
      if (entryData.workout_plan_assignment_id) {
        existingEntryResult = await client.query(
          'SELECT id FROM exercise_entries WHERE user_id = $1 AND workout_plan_assignment_id = $2 AND entry_date = $3',
          [userId, entryData.workout_plan_assignment_id, entryData.entry_date]
        );
      } else {
        existingEntryResult = await client.query(
          'SELECT id FROM exercise_entries WHERE user_id = $1 AND exercise_id = $2 AND entry_date = $3 AND source = $4 AND exercise_preset_entry_id IS NULL AND workout_plan_assignment_id IS NULL',
          [userId, entryData.exercise_id, entryData.entry_date, entrySource]
        );
      }
    }

    let resultId: string;
    if (existingEntryResult && existingEntryResult.rows.length > 0) {
      const existingEntryId = existingEntryResult.rows[0].id;
      log('info', `Existing exercise entry found for user ${userId}. Updating entry ${existingEntryId}.`);
      const updatedEntry = await _updateExerciseEntryWithClient(client, existingEntryId, userId, entryData, createdByUserId, entrySource);
      resultId = updatedEntry.id;
    } else {
      const exerciseSnapshotQuery = await client.query(
        `SELECT name, calories_per_hour, category, source, source_id, force, level, mechanic, equipment, primary_muscles, secondary_muscles, instructions, images
         FROM exercises WHERE id = $1`,
        [entryData.exercise_id]
      );
      if (exerciseSnapshotQuery.rows.length === 0) throw new Error('Exercise not found for snapshotting.');
      const snapshot = exerciseSnapshotQuery.rows[0];

      const entryResult = await client.query(
        `INSERT INTO exercise_entries (
           user_id, exercise_id, duration_minutes, calories_burned, entry_date, notes,
           workout_plan_assignment_id, image_url, created_by_user_id,
           exercise_name, calories_per_hour, category, source, source_id, force, level, mechanic,
           equipment, primary_muscles, secondary_muscles, instructions, images,
           distance, avg_heart_rate, exercise_preset_entry_id, sort_order, steps
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27) RETURNING id`,
        [
          userId, entryData.exercise_id, entryData.duration_minutes || 0, entryData.calories_burned || 0, entryData.entry_date, entryData.notes,
          entryData.workout_plan_assignment_id || null, entryData.image_url || null, createdByUserId,
          entryData.exercise_name || snapshot.name, snapshot.calories_per_hour, snapshot.category,
          entrySource, entryData.source_id || snapshot.source_id, snapshot.force, snapshot.level, snapshot.mechanic,
          snapshot.equipment, snapshot.primary_muscles, snapshot.secondary_muscles, snapshot.instructions, snapshot.images,
          entryData.distance || null, entryData.avg_heart_rate || null, exercisePresetEntryId, entryData.sort_order || 0, entryData.steps || null,
        ]
      );
      resultId = entryResult.rows[0].id;

      if (entryData.sets && entryData.sets.length > 0) {
        const setsValues = entryData.sets.map((set: any) => [
          resultId, set.set_number, set.set_type, set.reps, set.weight, set.duration, set.rest_time, set.notes, set.rpe,
        ]);
        const setsQuery = format('INSERT INTO exercise_entry_sets (exercise_entry_id, set_number, set_type, reps, weight, duration, rest_time, notes, rpe) VALUES %L', setsValues);
        await client.query(setsQuery);
      }
    }
    return _getExerciseEntryByIdWithClient(client, resultId);
  } catch (error) {
    log('error', 'Error creating/updating exercise entry with snapshot:', error);
    throw error;
  }
}

export async function createExerciseEntry(
  userId: string,
  entryData: any,
  createdByUserId: string,
  entrySource: string = 'Manual',
  exercisePresetEntryId: string | null = null
): Promise<any> {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    const entry = await _createExerciseEntryWithClient(client, userId, entryData, createdByUserId, entrySource, exercisePresetEntryId);
    await client.query('COMMIT');
    return entry;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getExerciseEntryById(id: string, userId: string): Promise<any> {
  const client = await getClient(userId);
  try {
    return _getExerciseEntryByIdWithClient(client, id);
  } finally {
    client.release();
  }
}

export async function getExerciseEntryOwnerId(id: string, userId: string): Promise<string | undefined> {
  const client = await getClient(userId);
  try {
    const entryResult = await client.query('SELECT user_id FROM exercise_entries WHERE id = $1', [id]);
    return entryResult.rows[0]?.user_id;
  } finally {
    client.release();
  }
}

export async function updateExerciseEntry(id: string, userId: string, actingUserId: string, updateData: any): Promise<any> {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE exercise_entries SET
        exercise_id = COALESCE($1, exercise_id), duration_minutes = COALESCE($2, duration_minutes),
        calories_burned = COALESCE($3, calories_burned), entry_date = COALESCE($4, entry_date),
        notes = COALESCE($5, notes), workout_plan_assignment_id = COALESCE($6, workout_plan_assignment_id),
        image_url = $7, distance = COALESCE($8, distance), avg_heart_rate = COALESCE($9, avg_heart_rate),
        sort_order = COALESCE($10, sort_order), exercise_name = COALESCE($11, exercise_name),
        updated_by_user_id = $12, updated_at = now()
      WHERE id = $13 AND user_id = $14`,
      [
        updateData.exercise_id, updateData.duration_minutes || null, updateData.calories_burned, updateData.entry_date, updateData.notes,
        updateData.workout_plan_assignment_id || null, updateData.image_url || null, updateData.distance || null,
        updateData.avg_heart_rate || null, updateData.sort_order !== undefined ? updateData.sort_order : null,
        updateData.exercise_name || null, actingUserId, id, userId,
      ]
    );

    if (updateData.sets !== undefined) {
      await client.query('DELETE FROM exercise_entry_sets WHERE exercise_entry_id = $1', [id]);
      if (Array.isArray(updateData.sets) && updateData.sets.length > 0) {
        const setsValues = updateData.sets.map((set: any) => [
          id, set.set_number, set.set_type, set.reps, set.weight, set.duration, set.rest_time, set.notes, set.rpe,
        ]);
        const setsQuery = format('INSERT INTO exercise_entry_sets (exercise_entry_id, set_number, set_type, reps, weight, duration, rest_time, notes, rpe) VALUES %L', setsValues);
        await client.query(setsQuery);
      }
    }
    await client.query('COMMIT');
    return getExerciseEntryById(id, userId);
  } finally {
    client.release();
  }
}

export async function updateExerciseEntriesDateByPresetEntryIdWithClient(client: any, userId: string, presetEntryId: string, entryDate: string | Date, updatedByUserId: string): Promise<void> {
  await client.query(
    `UPDATE exercise_entries SET entry_date = $1, updated_by_user_id = $2, updated_at = now() WHERE user_id = $3 AND exercise_preset_entry_id = $4`,
    [entryDate, updatedByUserId, userId, presetEntryId]
  );
}

export async function deleteExerciseEntriesByPresetEntryIdWithClient(client: any, userId: string, presetEntryId: string): Promise<void> {
  await client.query(`DELETE FROM exercise_entries WHERE user_id = $1 AND exercise_preset_entry_id = $2`, [userId, presetEntryId]);
}

export async function deleteExerciseEntry(id: string, userId: string): Promise<boolean> {
  const client = await getClient(userId);
  try {
    const result = await client.query('DELETE FROM exercise_entries WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

export async function getExerciseEntriesByDate(userId: string, selectedDate: string | Date): Promise<any[]> {
  const client = await getClient(userId);
  try {
    const presetEntriesResult = await client.query(
      `SELECT id, workout_preset_id, name, description, notes, created_at, source FROM exercise_preset_entries WHERE user_id = $1 AND entry_date = $2 ORDER BY created_at ASC`,
      [userId, selectedDate]
    );
    const presetEntries = presetEntriesResult.rows;

    const individualEntriesResult = await client.query(
      `SELECT ee.*,
         COALESCE((SELECT json_agg(set_data ORDER BY set_data.set_number) FROM (SELECT ees.id, ees.set_number, ees.set_type, ees.reps, ees.weight, ees.duration, ees.rest_time, ees.notes, ees.rpe FROM exercise_entry_sets ees WHERE ees.exercise_entry_id = ee.id) AS set_data), '[]'::json) AS sets,
         ee.distance, ee.avg_heart_rate,
         (SELECT json_agg(ead) FROM exercise_entry_activity_details ead WHERE ead.exercise_entry_id = ee.id) AS activity_details
       FROM exercise_entries ee WHERE ee.user_id = $1 AND ee.entry_date = $2 ORDER BY ee.sort_order ASC, ee.created_at ASC`,
      [userId, selectedDate]
    );
    const allExerciseEntries = individualEntriesResult.rows;

    const groupedEntries = new Map();
    presetEntries.forEach((preset: any) => {
      groupedEntries.set(preset.id, { type: 'preset', ...preset, exercises: [], total_duration_minutes: 0 });
    });

    const entriesWithDetails = await Promise.all(allExerciseEntries.map(async (row: any) => {
      const activityDetails = await activityDetailsRepository.getActivityDetailsByEntryOrPresetId(userId, row.id, null);
      const { exercise_name, category, calories_per_hour, source, source_id, force, level, mechanic, equipment, primary_muscles, secondary_muscles, instructions, images, ...entryData } = row;
      return {
        ...entryData, name: exercise_name,
        exercise_snapshot: { id: entryData.exercise_id, name: exercise_name, category, calories_per_hour, source, source_id, force, level, mechanic, equipment, primary_muscles, secondary_muscles, instructions, images },
        activity_details: activityDetails
      };
    }));

    const finalEntriesMap = new Map();
    entriesWithDetails.forEach((entry: any) => {
      if (entry.exercise_preset_entry_id && groupedEntries.has(entry.exercise_preset_entry_id)) {
        const preset = groupedEntries.get(entry.exercise_preset_entry_id);
        preset.exercises.push(entry);
        preset.total_duration_minutes += entry.duration_minutes || 0;
      } else {
        finalEntriesMap.set(entry.id, { type: 'individual', ...entry });
      }
    });

    for (const preset of groupedEntries.values()) {
      preset.activity_details = await activityDetailsRepository.getActivityDetailsByEntryOrPresetId(userId, null, preset.id);
      finalEntriesMap.set(preset.id, preset);
    }

    const finalEntries = Array.from(finalEntriesMap.values());
    finalEntries.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return finalEntries;
  } finally {
    client.release();
  }
}

export async function getExerciseProgressData(userId: string, exerciseId: string, startDate: string | Date, endDate: string | Date): Promise<any[]> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ee.id AS exercise_entry_id, ee.entry_date, ee.duration_minutes, ee.calories_burned, ee.notes, ee.image_url, ee.distance, ee.avg_heart_rate, ee.source AS provider_name,
         COALESCE((SELECT json_agg(set_data ORDER BY set_data.set_number) FROM (SELECT ees.id, ees.set_number, ees.set_type, ees.reps, ees.weight, ees.duration, ees.rest_time, ees.notes, ees.rpe FROM exercise_entry_sets ees WHERE ees.exercise_entry_id = ee.id) AS set_data), '[]'::json) AS sets
       FROM exercise_entries ee WHERE ee.user_id = $1 AND ee.exercise_id = $2 AND ee.entry_date BETWEEN $3 AND $4 ORDER BY ee.entry_date ASC`,
      [userId, exerciseId, startDate, endDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

export async function getExerciseHistory(userId: string, exerciseId: string, limit: number = 5): Promise<any[]> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ee.entry_date, ee.duration_minutes, ee.calories_burned, ee.notes, ee.image_url, ee.distance, ee.avg_heart_rate,
         COALESCE((SELECT json_agg(set_data ORDER BY set_data.set_number) FROM (SELECT ees.id, ees.set_number, ees.set_type, ees.reps, ees.weight, ees.duration, ees.rest_time, ees.notes, ees.rpe FROM exercise_entry_sets ees WHERE ees.exercise_entry_id = ee.id) AS set_data), '[]'::json) AS sets
       FROM exercise_entries ee WHERE ee.user_id = $1 AND ee.exercise_id = $2 ORDER BY ee.entry_date DESC, ee.created_at DESC LIMIT $3`,
      [userId, exerciseId, limit]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

export async function deleteExerciseEntriesByEntrySourceAndDate(userId: string, startDate: string | Date, endDate: string | Date, entrySource: string): Promise<number> {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    const entryIdsResult = await client.query(`SELECT id FROM exercise_entries WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3 AND source = $4`, [userId, startDate, endDate, entrySource]);
    const entryIds = entryIdsResult.rows.map((row: any) => row.id);
    if (entryIds.length > 0) {
      await client.query('DELETE FROM exercise_entry_activity_details WHERE exercise_entry_id = ANY($1::uuid[])', [entryIds]);
      await client.query('DELETE FROM exercise_entry_sets WHERE exercise_entry_id = ANY($1::uuid[])', [entryIds]);
      const result = await client.query('DELETE FROM exercise_entries WHERE id = ANY($1::uuid[])', [entryIds]);
      await client.query('COMMIT');
      return result.rowCount;
    }
    await client.query('COMMIT');
    return 0;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getExerciseEntriesByDateRange(userId: string, startDate: string | Date, endDate: string | Date): Promise<any[]> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ee.*,
         COALESCE((SELECT json_agg(set_data ORDER BY set_data.set_number) FROM (SELECT ees.id, ees.set_number, ees.set_type, ees.reps, ees.weight, ees.duration, ees.rest_time, ees.notes, ees.rpe FROM exercise_entry_sets ees WHERE ees.exercise_entry_id = ee.id) AS set_data), '[]'::json) AS sets,
         ee.distance, ee.avg_heart_rate
       FROM exercise_entries ee WHERE ee.user_id = $1 AND ee.entry_date BETWEEN $2 AND $3 ORDER BY ee.entry_date DESC, ee.sort_order ASC, ee.created_at DESC`,
      [userId, startDate, endDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}
