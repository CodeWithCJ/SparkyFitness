import { getClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'pg-f... Remove this comment to see the full error message
import format from 'pg-format';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createWorkoutPreset(presetData: any) {
  const client = await getClient(presetData.user_id); // User-specific operation
  try {
    await client.query('BEGIN');
    const presetResult = await client.query(
      `INSERT INTO workout_presets (user_id, name, description, is_public)
       VALUES ($1, $2, $3, $4) RETURNING id, user_id, name, description, is_public`,
      [
        presetData.user_id,
        presetData.name,
        presetData.description,
        presetData.is_public,
      ]
    );
    const newPreset = { ...presetResult.rows[0], isNew: true };
    if (presetData.exercises && presetData.exercises.length > 0) {
      for (const exercise of presetData.exercises) {
        const exerciseResult = await client.query(
          `INSERT INTO workout_preset_exercises (workout_preset_id, exercise_id, image_url, sort_order, superset_group)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [
            newPreset.id,
            exercise.exercise_id,
            exercise.image_url,
            exercise.sort_order || 0,
            exercise.superset_group ?? null,
          ]
        );
        const newExerciseId = exerciseResult.rows[0].id;
        if (exercise.sets && exercise.sets.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const setsValues = exercise.sets.map((set: any) => [
            newExerciseId,
            set.set_number,
            set.set_type,
            set.reps,
            set.weight,
            set.duration,
            set.rest_time,
            set.notes,
          ]);
          const setsQuery = format(
            'INSERT INTO workout_preset_exercise_sets (workout_preset_exercise_id, set_number, set_type, reps, weight, duration, rest_time, notes) VALUES %L',
            setsValues
          );
          await client.query(setsQuery);
        }
      }
    }
    await client.query('COMMIT');
    // Refetch the created preset to get the full nested structure
    return getWorkoutPresetById(newPreset.id, presetData.user_id);
  } catch (error) {
    await client.query('ROLLBACK');
    log('error', 'Error creating workout preset:', error);
    throw error;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWorkoutPresetByName(userId: any, name: any) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT
        wp.id, wp.user_id, wp.name, wp.description, wp.is_public, wp.created_at, wp.updated_at,
        COALESCE(
          (SELECT json_agg(ex_data)
           FROM (
             SELECT
               wpe.id,
               wpe.exercise_id,
               wpe.image_url,
               wpe.sort_order,
               wpe.superset_group,
               e.name as exercise_name,
               e.category as category,
               COALESCE(
                 (SELECT json_agg(set_data ORDER BY set_data.set_number)
                  FROM (
                    SELECT
                      wpes.id, wpes.set_number, wpes.set_type, wpes.reps, wpes.weight, wpes.duration, wpes.rest_time, wpes.notes
                    FROM workout_preset_exercise_sets wpes
                    WHERE wpes.workout_preset_exercise_id = wpe.id
                  ) AS set_data
                 ), '[]'::json
               ) AS sets
             FROM workout_preset_exercises wpe
             JOIN exercises e ON wpe.exercise_id = e.id
             WHERE wpe.workout_preset_id = wp.id
             ORDER BY wpe.sort_order ASC, wpe.id ASC
           ) AS ex_data
          ), '[]'::json
        ) AS exercises
      FROM workout_presets wp
      WHERE wp.user_id = $1 AND wp.name ILIKE $2
      GROUP BY wp.id`,
      [userId, name]
    );
    return result.rows[0] ? { ...result.rows[0], isNew: false } : null; // Add isNew: false for existing presets
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWorkoutPresets(userId: any, page = 1, limit = 10) {
  const client = await getClient(userId); // User-specific operation
  try {
    const offset = (page - 1) * limit;
    // Ownership/sharing visibility is enforced by RLS (owner, public, or
    // family-shared via can_view_exercise_library). Do not re-filter here, or
    // family-shared presets get dropped before they reach the response.
    const totalResult = await client.query(
      'SELECT COUNT(*) FROM workout_presets'
    );
    const total = parseInt(totalResult.rows[0].count, 10);
    const result = await client.query(
      `SELECT
         wp.id, wp.user_id, wp.name, wp.description, wp.is_public, wp.created_at, wp.updated_at,
         COALESCE(
           (SELECT json_agg(ex_data)
            FROM (
              SELECT
                wpe.id,
                wpe.exercise_id,
                wpe.image_url,
                wpe.superset_group,
                e.name as exercise_name,
                e.category as category,
                COALESCE(
                  (SELECT json_agg(set_data ORDER BY set_data.set_number)
                   FROM (
                     SELECT
                       wpes.id, wpes.set_number, wpes.set_type, wpes.reps, wpes.weight, wpes.duration, wpes.rest_time, wpes.notes
                     FROM workout_preset_exercise_sets wpes
                     WHERE wpes.workout_preset_exercise_id = wpe.id
                   ) AS set_data
                  ), '[]'::json
                ) AS sets
              FROM workout_preset_exercises wpe
              JOIN exercises e ON wpe.exercise_id = e.id
              WHERE wpe.workout_preset_id = wp.id
              ORDER BY wpe.sort_order ASC, wpe.id ASC
            ) AS ex_data
           ), '[]'::json
         ) AS exercises
       FROM workout_presets wp
       GROUP BY wp.id
       ORDER BY wp.name ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return {
      presets: result.rows,
      total,
      page,
      limit,
    };
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWorkoutPresetById(presetId: any, userId: any) {
  const client = await getClient(userId); // User-specific operation (RLS will handle access)
  try {
    const result = await client.query(
      `SELECT
         wp.id, wp.user_id, wp.name, wp.description, wp.is_public, wp.created_at, wp.updated_at,
         COALESCE(
           (SELECT json_agg(ex_data)
            FROM (
              SELECT
                wpe.id,
                wpe.exercise_id,
                wpe.image_url,
                wpe.superset_group,
                e.name as exercise_name,
                e.category as category,
                COALESCE(
                  (SELECT json_agg(set_data ORDER BY set_data.set_number)
                   FROM (
                     SELECT
                       wpes.id, wpes.set_number, wpes.set_type, wpes.reps, wpes.weight, wpes.duration, wpes.rest_time, wpes.notes
                     FROM workout_preset_exercise_sets wpes
                     WHERE wpes.workout_preset_exercise_id = wpe.id
                   ) AS set_data
                  ), '[]'::json
                ) AS sets
              FROM workout_preset_exercises wpe
              JOIN exercises e ON wpe.exercise_id = e.id
              WHERE wpe.workout_preset_id = wp.id
              ORDER BY wpe.sort_order ASC, wpe.id ASC
            ) AS ex_data
           ), '[]'::json
         ) AS exercises
       FROM workout_presets wp
       WHERE wp.id = $1
       GROUP BY wp.id`,
      [presetId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function updateWorkoutPreset(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  presetId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateData: any
) {
  const client = await getClient(userId); // User-specific operation
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE workout_presets SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        is_public = COALESCE($3, is_public),
        updated_at = now()
       WHERE id = $4
       RETURNING id`,
      [updateData.name, updateData.description, updateData.is_public, presetId]
    );
    if (result.rows.length > 0 && updateData.exercises !== undefined) {
      // Delete old exercises and sets (cascade will handle sets)
      await client.query(
        'DELETE FROM workout_preset_exercises WHERE workout_preset_id = $1',
        [presetId]
      );
      // Insert new exercises and sets
      if (updateData.exercises.length > 0) {
        for (const exercise of updateData.exercises) {
          const exerciseResult = await client.query(
            `INSERT INTO workout_preset_exercises (workout_preset_id, exercise_id, image_url, sort_order, superset_group)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [
              presetId,
              exercise.exercise_id,
              exercise.image_url,
              exercise.sort_order || 0,
              exercise.superset_group ?? null,
            ]
          );
          const newExerciseId = exerciseResult.rows[0].id;
          if (exercise.sets && exercise.sets.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const setsValues = exercise.sets.map((set: any) => [
              newExerciseId,
              set.set_number,
              set.set_type,
              set.reps,
              set.weight,
              set.duration,
              set.rest_time,
              set.notes,
            ]);
            const setsQuery = format(
              'INSERT INTO workout_preset_exercise_sets (workout_preset_exercise_id, set_number, set_type, reps, weight, duration, rest_time, notes) VALUES %L',
              setsValues
            );
            await client.query(setsQuery);
          }
        }
      }
    }
    await client.query('COMMIT');
    // Refetch the updated preset to get the full nested structure
    return getWorkoutPresetById(presetId, userId);
  } catch (error) {
    await client.query('ROLLBACK');
    log('error', `Error updating workout preset ${presetId}:`, error);
    throw error;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteWorkoutPreset(presetId: any, userId: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'DELETE FROM workout_presets WHERE id = $1 RETURNING id',
      [presetId]
    );
    await client.query('COMMIT');
    return result.rowCount > 0;
  } catch (error) {
    await client.query('ROLLBACK');
    log('error', `Error deleting workout preset ${presetId}:`, error);
    throw error;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWorkoutPresetOwnerId(userId: any, presetId: any) {
  const client = await getClient(userId); // User-specific operation (RLS will handle access)
  try {
    const result = await client.query(
      'SELECT user_id FROM workout_presets WHERE id = $1',
      [presetId]
    );
    return result.rows[0] ? result.rows[0].user_id : null;
  } finally {
    client.release();
  }
}
async function addExerciseToWorkoutPreset(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workoutPresetId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exerciseId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  imageUrl: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sets: any,
  sortOrder = 0
) {
  const client = await getClient(userId); // User-specific operation
  try {
    await client.query('BEGIN');
    const existingExerciseResult = await client.query(
      `SELECT id
       FROM workout_preset_exercises
       WHERE workout_preset_id = $1 AND exercise_id = $2
       ORDER BY id ASC
       LIMIT 1`,
      [workoutPresetId, exerciseId]
    );

    let exercisePresetId;
    if (existingExerciseResult.rows.length > 0) {
      exercisePresetId = existingExerciseResult.rows[0].id;
      // Check if it already has sets
      const setsCountResult = await client.query(
        'SELECT COUNT(*) FROM workout_preset_exercise_sets WHERE workout_preset_exercise_id = $1',
        [exercisePresetId]
      );
      if (parseInt(setsCountResult.rows[0].count, 10) > 0) {
        await client.query('COMMIT');
        return exercisePresetId;
      }
      // If no sets, proceed to add them below
    } else {
      const exerciseResult = await client.query(
        `INSERT INTO workout_preset_exercises (workout_preset_id, exercise_id, image_url, sort_order)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [workoutPresetId, exerciseId, imageUrl, sortOrder]
      );
      exercisePresetId = exerciseResult.rows[0].id;
    }

    if (sets && sets.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const setsValues = sets.map((set: any) => [
        exercisePresetId,
        set.set_number,
        set.set_type,
        set.reps,
        set.weight,
        set.duration,
        set.rest_time,
        set.notes,
      ]);
      const setsQuery = format(
        'INSERT INTO workout_preset_exercise_sets (workout_preset_exercise_id, set_number, set_type, reps, weight, duration, rest_time, notes) VALUES %L',
        setsValues
      );
      await client.query(setsQuery);
    }
    await client.query('COMMIT');
    return exercisePresetId;
  } catch (error) {
    await client.query('ROLLBACK');
    log(
      'error',
      `Error adding exercise to workout preset ${workoutPresetId}:`,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}

async function searchWorkoutPresets(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  searchTerm: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  limit = null
) {
  const client = await getClient(userId); // User-specific operation
  try {
    let query = `
      SELECT
        wp.id, wp.user_id, wp.name, wp.description, wp.is_public,
        COALESCE(
          (SELECT json_agg(ex_data)
           FROM (
             SELECT
               wpe.id,
               wpe.exercise_id,
               wpe.image_url,
               wpe.superset_group,
               e.name as exercise_name,
               e.category as category,
               COALESCE(
                 (SELECT json_agg(set_data ORDER BY set_data.set_number)
                  FROM (
                    SELECT
                      wpes.id, wpes.set_number, wpes.set_type, wpes.reps, wpes.weight, wpes.duration, wpes.rest_time, wpes.notes
                    FROM workout_preset_exercise_sets wpes
                    WHERE wpes.workout_preset_exercise_id = wpe.id
                  ) AS set_data
                 ), '[]'::json
               ) AS sets
             FROM workout_preset_exercises wpe
             JOIN exercises e ON wpe.exercise_id = e.id
             WHERE wpe.workout_preset_id = wp.id
             ORDER BY wpe.sort_order ASC, wpe.id ASC
           ) AS ex_data
          ), '[]'::json
        ) AS exercises
      FROM workout_presets wp
      WHERE wp.name ILIKE $1
      GROUP BY wp.id
      ORDER BY wp.name ASC`;
    // Visibility (owner/public/family-shared) is enforced by RLS; $2 userId is
    // intentionally unused in the filter so shared presets are not dropped.
    const queryParams = [`%${searchTerm}%`];
    if (limit !== null) {
      query += ' LIMIT $2';
      queryParams.push(limit);
    }
    const result = await client.query(query, queryParams);
    return result.rows;
  } finally {
    client.release();
  }
}
export { createWorkoutPreset };
export { getWorkoutPresets };
export { getWorkoutPresetById };
export { updateWorkoutPreset };
export { deleteWorkoutPreset };
export { getWorkoutPresetOwnerId };
export { searchWorkoutPresets };
export { getWorkoutPresetByName };
export { addExerciseToWorkoutPreset };
export default {
  createWorkoutPreset,
  getWorkoutPresets,
  getWorkoutPresetById,
  updateWorkoutPreset,
  deleteWorkoutPreset,
  getWorkoutPresetOwnerId,
  searchWorkoutPresets,
  getWorkoutPresetByName,
  addExerciseToWorkoutPreset,
};
