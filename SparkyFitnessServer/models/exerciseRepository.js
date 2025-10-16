const { getPool } = require('../db/poolManager');
const format = require('pg-format');
const { log } = require('../config/logging');
const workoutPresetRepository = require('./workoutPresetRepository');

async function getExerciseById(id) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `SELECT id, source, source_id, name, force, level, mechanic, equipment,
              primary_muscles, secondary_muscles, instructions, category, images,
              calories_per_hour, description, user_id, is_custom, shared_with_public,
              created_at, updated_at
       FROM exercises WHERE id = $1`,
      [id]
    );
    const exercise = result.rows[0];
    if (exercise && exercise.images) {
      try {
        exercise.images = JSON.parse(exercise.images);
      } catch (e) {
        log('error', `Error parsing images for exercise ${exercise.id}:`, e);
        exercise.images = []; // Default to empty array on parse error
      }
    }
    return exercise;
  } finally {
    client.release();
  }
}

async function getExerciseOwnerId(id) {
  const client = await getPool().connect();
  try {
    const exerciseResult = await client.query(
      'SELECT user_id FROM exercises WHERE id = $1',
      [id]
    );
    return exerciseResult.rows[0]?.user_id;
  } finally {
    client.release();
  }
}

async function getOrCreateActiveCaloriesExercise(userId, source = 'Health Data') {
  const exerciseName = "Active Calories";
  const client = await getPool().connect();
  let exercise = null;
  try {
    const result = await client.query(
      'SELECT id FROM exercises WHERE name = $1 AND user_id = $2',
      [exerciseName, userId]
    );
    exercise = result.rows[0];
  } catch (error) {
    log('error', "Error fetching active calories exercise:", error);
    throw new Error(`Failed to retrieve active calories exercise: ${error.message}`);
  } finally {
    client.release();
  }

  if (!exercise) {
    log('info', `Creating default exercise: ${exerciseName} for user ${userId}`);
    const insertClient = await getPool().connect();
    let newExercise = null;
    try {
      const result = await insertClient.query(
        `INSERT INTO exercises (user_id, name, category, calories_per_hour, description, is_custom, shared_with_public, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [userId, exerciseName, 'Cardio', 600, 'Automatically logged active calories from a health tracking shortcut.', true, false, source]
      );
      newExercise = result.rows[0];
    } catch (createError) {
      log('error', "Error creating active calories exercise:", createError);
      throw new Error(`Failed to create active calories exercise: ${createError.message}`);
    } finally {
      insertClient.release();
    }
    exercise = newExercise;
  }
  return exercise.id;
}

async function upsertExerciseEntryData(userId, exerciseId, caloriesBurned, date) {
  log('info', "upsertExerciseEntryData received date parameter:", date);
  const client = await getPool().connect();
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
    const updateClient = await getPool().connect();
    try {
      const updateResult = await updateClient.query(
        'UPDATE exercise_entries SET calories_burned = $1, notes = $2 WHERE id = $3 RETURNING *',
        [caloriesBurned, 'Active calories logged from Apple Health (updated).', existingEntry.id]
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
    const insertClient = await getPool().connect();
    try {
      const insertResult = await insertClient.query(
        `INSERT INTO exercise_entries (user_id, exercise_id, entry_date, calories_burned, duration_minutes, notes)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [userId, exerciseId, date, caloriesBurned, 0, 'Active calories logged from Apple Health.']
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

async function getExercisesWithPagination(targetUserId, searchTerm, categoryFilter, ownershipFilter, equipmentFilter, muscleGroupFilter, limit, offset) {
  const client = await getPool().connect();
  try {
    let whereClauses = ['1=1'];
    const queryParams = [];
    let paramIndex = 1;

    if (searchTerm) {
      whereClauses.push(`name ILIKE $${paramIndex}`);
      queryParams.push(`%${searchTerm}%`);
      paramIndex++;
    }

    if (categoryFilter && categoryFilter !== 'all') {
      whereClauses.push(`category = $${paramIndex}`);
      queryParams.push(categoryFilter);
      paramIndex++;
    }

    if (ownershipFilter === 'own') {
      whereClauses.push(`user_id = $${paramIndex}`);
      queryParams.push(targetUserId);
      paramIndex++;
    } else if (ownershipFilter === 'public') {
      whereClauses.push(`user_id IS NULL OR shared_with_public = TRUE`);
    } else if (ownershipFilter === 'family') {
      whereClauses.push(`user_id != $${paramIndex} AND is_custom = TRUE`);
      queryParams.push(targetUserId);
      paramIndex++;
    } else if (ownershipFilter === 'all') {
      whereClauses.push(`(user_id IS NULL OR user_id = $${paramIndex} OR shared_with_public = TRUE OR user_id IN (SELECT owner_user_id FROM family_access WHERE family_user_id = $${paramIndex} AND is_active = TRUE AND (access_end_date IS NULL OR access_end_date > NOW())))`);
      queryParams.push(targetUserId);
      paramIndex++;
    }

    if (equipmentFilter && equipmentFilter.length > 0) {
      whereClauses.push(`equipment::jsonb ?| ARRAY[${equipmentFilter.map((_, i) => `$${paramIndex + i}`).join(',')}]`);
      queryParams.push(...equipmentFilter);
      paramIndex += equipmentFilter.length;
    }

    if (muscleGroupFilter && muscleGroupFilter.length > 0) {
      whereClauses.push(`(primary_muscles::jsonb ?| ARRAY[${muscleGroupFilter.map((_, i) => `$${paramIndex + i}`).join(',')}] OR secondary_muscles::jsonb ?| ARRAY[${muscleGroupFilter.map((_, i) => `$${paramIndex + i}`).join(',')}])`);
      queryParams.push(...muscleGroupFilter);
      queryParams.push(...muscleGroupFilter); // Push twice for primary and secondary muscles
      paramIndex += (muscleGroupFilter.length * 2);
    }

    let query = `
      SELECT id, source, source_id, name, force, level, mechanic, equipment,
             primary_muscles, secondary_muscles, instructions, category, images,
             calories_per_hour, description, user_id, is_custom, shared_with_public,
             created_at, updated_at
      FROM exercises
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY name ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    queryParams.push(limit, offset);

    const result = await client.query(query, queryParams);
    return result.rows.map(row => {
      if (row.images) {
        try {
          row.images = JSON.parse(row.images);
        } catch (e) {
          log('error', `Error parsing images for exercise ${row.id}:`, e);
          row.images = [];
        }
      }
      return row;
    });
  } finally {
    client.release();
  }
}

async function countExercises(targetUserId, searchTerm, categoryFilter, ownershipFilter, equipmentFilter, muscleGroupFilter) {
  const client = await getPool().connect();
  try {
    let whereClauses = ['1=1'];
    const queryParams = [];
    let paramIndex = 1;

    if (searchTerm) {
      whereClauses.push(`name ILIKE $${paramIndex}`);
      queryParams.push(`%${searchTerm}%`);
      paramIndex++;
    }

    if (categoryFilter && categoryFilter !== 'all') {
      whereClauses.push(`category = $${paramIndex}`);
      queryParams.push(categoryFilter);
      paramIndex++;
    }

    if (ownershipFilter === 'own') {
      whereClauses.push(`user_id = $${paramIndex}`);
      queryParams.push(targetUserId);
      paramIndex++;
    } else if (ownershipFilter === 'public') {
      whereClauses.push(`user_id IS NULL OR shared_with_public = TRUE`);
    } else if (ownershipFilter === 'family') {
      whereClauses.push(`user_id != $${paramIndex} AND is_custom = TRUE`);
      queryParams.push(targetUserId);
      paramIndex++;
    } else if (ownershipFilter === 'all') {
      whereClauses.push(`(user_id IS NULL OR user_id = $${paramIndex} OR shared_with_public = TRUE OR user_id IN (SELECT owner_user_id FROM family_access WHERE family_user_id = $${paramIndex} AND is_active = TRUE AND (access_end_date IS NULL OR access_end_date > NOW())))`);
      queryParams.push(targetUserId);
      paramIndex++;
    }

    if (equipmentFilter && equipmentFilter.length > 0) {
      whereClauses.push(`equipment::jsonb ?| ARRAY[${equipmentFilter.map((_, i) => `$${paramIndex + i}`).join(',')}]`);
      queryParams.push(...equipmentFilter);
      paramIndex += equipmentFilter.length;
    }

    if (muscleGroupFilter && muscleGroupFilter.length > 0) {
      whereClauses.push(`(primary_muscles::jsonb ?| ARRAY[${muscleGroupFilter.map((_, i) => `$${paramIndex + i}`).join(',')}] OR secondary_muscles::jsonb ?| ARRAY[${muscleGroupFilter.map((_, i) => `$${paramIndex + i}`).join(',')}])`);
      queryParams.push(...muscleGroupFilter);
      queryParams.push(...muscleGroupFilter); // Push twice for primary and secondary muscles
      paramIndex += (muscleGroupFilter.length * 2);
    }

    const countQuery = `
      SELECT COUNT(*)
      FROM exercises
      WHERE ${whereClauses.join(' AND ')}
    `;
    const result = await client.query(countQuery, queryParams);
    return parseInt(result.rows[0].count, 10);
  } finally {
    client.release();
  }
}

async function getDistinctEquipment() {
  const client = await getPool().connect();
  try {
    const result = await client.query(`SELECT equipment FROM exercises WHERE equipment IS NOT NULL AND equipment <> '[]' AND equipment <> ''`);
    const equipmentSet = new Set();
    result.rows.forEach(row => {
      try {
        const equipmentList = JSON.parse(row.equipment);
        if (Array.isArray(equipmentList)) {
          equipmentList.forEach(item => equipmentSet.add(item));
        }
      } catch (e) {
        // Fallback for non-JSON string
        let equipment = row.equipment.replace(/[\[\]'"`]/g, ''); // Clean the string
        let equipmentList = equipment.split(',').map(item => item.trim()).filter(Boolean);
        equipmentList.forEach(item => equipmentSet.add(item));
      }
    });
    return Array.from(equipmentSet).sort();
  } catch (error) {
    log('error', 'Error fetching distinct equipment:', error);
    return [];
  } finally {
    client.release();
  }
}

async function getDistinctMuscleGroups() {
  const client = await getPool().connect();
  try {
    const result = await client.query(`SELECT primary_muscles, secondary_muscles FROM exercises WHERE (primary_muscles IS NOT NULL AND primary_muscles <> '[]' AND primary_muscles <> '') OR (secondary_muscles IS NOT NULL AND secondary_muscles <> '[]' AND secondary_muscles <> '')`);
    const muscleGroupSet = new Set();

    result.rows.forEach(row => {
      ['primary_muscles', 'secondary_muscles'].forEach(field => {
        if (row[field]) {
          try {
            const muscleList = JSON.parse(row[field]);
            if (Array.isArray(muscleList)) {
              muscleList.forEach(item => muscleGroupSet.add(item));
            }
          } catch (e) {
            // Fallback for non-JSON string
            let muscles = row[field].replace(/[\[\]'"`]/g, ''); // Clean the string
            let muscleList = muscles.split(',').map(item => item.trim()).filter(Boolean);
            muscleList.forEach(item => muscleGroupSet.add(item));
          }
        }
      });
    });
    return Array.from(muscleGroupSet).sort();
  } catch (error) {
    log('error', 'Error fetching distinct muscle groups:', error);
    return [];
  } finally {
    client.release();
  }
}

async function searchExercises(name, userId, equipmentFilter, muscleGroupFilter) {
  const client = await getPool().connect();
  try {
    let whereClauses = ['1=1'];
    const queryParams = [];
    let paramIndex = 1;

    if (name) {
      whereClauses.push(`name ILIKE $${paramIndex}`);
      queryParams.push(`%${name}%`);
      paramIndex++;
    }

    whereClauses.push(`(is_custom = false OR user_id = $${paramIndex} OR source IS NOT NULL)`);
    queryParams.push(userId);
    paramIndex++;

    if (equipmentFilter && equipmentFilter.length > 0) {
      whereClauses.push(`equipment::jsonb ?| ARRAY[${equipmentFilter.map((_, i) => `$${paramIndex + i}`).join(',')}]`);
      queryParams.push(...equipmentFilter);
      paramIndex += equipmentFilter.length;
    }

    if (muscleGroupFilter && muscleGroupFilter.length > 0) {
      const primaryMusclesPlaceholders = muscleGroupFilter.map((_, i) => `$${paramIndex + i}`).join(',');
      const secondaryMusclesPlaceholders = muscleGroupFilter.map((_, i) => `$${paramIndex + muscleGroupFilter.length + i}`).join(',');
      whereClauses.push(`(primary_muscles::jsonb ?| ARRAY[${primaryMusclesPlaceholders}] OR secondary_muscles::jsonb ?| ARRAY[${secondaryMusclesPlaceholders}])`);
      queryParams.push(...muscleGroupFilter);
      queryParams.push(...muscleGroupFilter); // Push twice for primary and secondary muscles
      paramIndex += (muscleGroupFilter.length * 2);
    }

    const finalQuery = `
      SELECT id, source, source_id, name, force, level, mechanic, equipment,
              primary_muscles, secondary_muscles, instructions, category, images,
              calories_per_hour, description, user_id, is_custom, shared_with_public
       FROM exercises
       WHERE ${whereClauses.join(' AND ')} LIMIT 50`; // Added a limit to prevent too many results
    const result = await client.query(finalQuery, queryParams);
    return result.rows.map(row => {
      // Helper function to safely parse JSONB fields into arrays
      const parseJsonbField = (field) => {
        if (row[field]) {
          try {
            const parsed = JSON.parse(row[field]);
            return Array.isArray(parsed) ? parsed : [parsed]; // Ensure it's an array
          } catch (e) {
            log('error', `Error parsing ${field} for exercise ${row.id}:`, e);
            return [];
          }
        }
        return [];
      };

      row.equipment = parseJsonbField('equipment');
      row.primary_muscles = parseJsonbField('primary_muscles');
      row.secondary_muscles = parseJsonbField('secondary_muscles');
      row.instructions = parseJsonbField('instructions');
      row.images = parseJsonbField('images');
      
      return row;
    });
  } finally {
    client.release();
  }
}

async function createExercise(exerciseData) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `INSERT INTO exercises (
        source, source_id, name, force, level, mechanic, equipment,
        primary_muscles, secondary_muscles, instructions, category, images,
        calories_per_hour, description, is_custom, user_id, shared_with_public,
        created_at, updated_at
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, now(), now())
       RETURNING *`,
      [
        exerciseData.source,
        exerciseData.source_id,
        exerciseData.name,
        exerciseData.force,
        exerciseData.level,
        exerciseData.mechanic,
        exerciseData.equipment ? JSON.stringify(exerciseData.equipment) : null,
        exerciseData.primary_muscles ? JSON.stringify(exerciseData.primary_muscles) : null,
        exerciseData.secondary_muscles ? JSON.stringify(exerciseData.secondary_muscles) : null,
        exerciseData.instructions ? JSON.stringify(exerciseData.instructions) : null,
        exerciseData.category,
        exerciseData.images ? JSON.stringify(exerciseData.images) : null,
        exerciseData.calories_per_hour,
        exerciseData.description,
        exerciseData.is_custom,
        exerciseData.user_id,
        exerciseData.shared_with_public,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function createExerciseEntry(userId, entryData) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    const entryResult = await client.query(
      `INSERT INTO exercise_entries (user_id, exercise_id, duration_minutes, calories_burned, entry_date, notes, workout_plan_assignment_id, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        userId,
        entryData.exercise_id,
        typeof entryData.duration_minutes === 'number' ? entryData.duration_minutes : 0,
        entryData.calories_burned,
        entryData.entry_date,
        entryData.notes,
        entryData.workout_plan_assignment_id || null,
        entryData.image_url || null,
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
    return getExerciseEntryById(newEntryId); // Refetch to get full data
  } catch (error) {
    await client.query('ROLLBACK');
    log('error', `Error creating exercise entry:`, error);
    throw error;
  } finally {
    client.release();
  }
}

async function getExerciseEntryById(id) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `SELECT ee.*, e.name as exercise_name,
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
       JOIN exercises e ON ee.exercise_id = e.id
       WHERE ee.id = $1`,
      [id]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getExerciseEntryOwnerId(id) {
  const client = await getPool().connect();
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
  const client = await getPool().connect();
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
  const client = await getPool().connect();
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

async function updateExercise(id, userId, updateData) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `UPDATE exercises SET
        name = COALESCE($1, name),
        category = COALESCE($2, category),
        calories_per_hour = COALESCE($3, calories_per_hour),
        description = COALESCE($4, description),
        is_custom = COALESCE($5, is_custom),
        shared_with_public = COALESCE($6, shared_with_public),
        force = COALESCE($7, force),
        level = COALESCE($8, level),
        mechanic = COALESCE($9, mechanic),
        equipment = COALESCE($10, equipment),
        primary_muscles = COALESCE($11, primary_muscles),
        secondary_muscles = COALESCE($12, secondary_muscles),
        instructions = COALESCE($13, instructions),
        images = COALESCE($14, images),
        updated_at = now()
      WHERE id = $15 AND user_id = $16
      RETURNING *`,
      [
        updateData.name,
        updateData.category,
        updateData.calories_per_hour,
        updateData.description,
        updateData.is_custom,
        updateData.shared_with_public,
        updateData.force,
        updateData.level,
        updateData.mechanic,
        updateData.equipment ? JSON.stringify(updateData.equipment) : null,
        updateData.primary_muscles ? JSON.stringify(updateData.primary_muscles) : null,
        updateData.secondary_muscles ? JSON.stringify(updateData.secondary_muscles) : null,
        updateData.instructions ? JSON.stringify(updateData.instructions) : null,
        updateData.images ? JSON.stringify(updateData.images) : null,
        id,
        userId
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function deleteExercise(id, userId) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      'DELETE FROM exercises WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

async function getExerciseEntriesByDate(userId, selectedDate) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `SELECT
         ee.id, ee.exercise_id, ee.duration_minutes, ee.calories_burned, ee.entry_date, ee.notes,
         ee.workout_plan_assignment_id, ee.image_url, e.name AS exercise_name, e.category AS exercise_category,
         e.calories_per_hour AS exercise_calories_per_hour, e.user_id AS exercise_user_id, e.source AS exercise_source,
         e.source_id AS exercise_source_id, e.force AS exercise_force, e.level AS exercise_level,
         e.mechanic AS exercise_mechanic, e.equipment AS exercise_equipment, e.primary_muscles AS exercise_primary_muscles,
         e.secondary_muscles AS exercise_secondary_muscles, e.instructions AS exercise_instructions, e.images AS exercise_images,
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
       JOIN exercises e ON ee.exercise_id = e.id
       WHERE ee.user_id = $1 AND ee.entry_date = $2`,
      [userId, selectedDate]
    );

    return result.rows.map(row => {
      const {
        exercise_name, exercise_category, exercise_calories_per_hour, exercise_user_id,
        exercise_source, exercise_source_id, exercise_force, exercise_level, exercise_mechanic,
        exercise_equipment, exercise_primary_muscles, exercise_secondary_muscles,
        exercise_instructions, exercise_images, ...entryData
      } = row;

      return {
        ...entryData,
        exercises: {
          name: exercise_name,
          category: exercise_category,
          calories_per_hour: exercise_calories_per_hour,
          user_id: exercise_user_id,
          source: exercise_source,
          source_id: exercise_source_id,
          force: exercise_force,
          level: exercise_level,
          mechanic: exercise_mechanic,
          equipment: exercise_equipment,
          primary_muscles: exercise_primary_muscles,
          secondary_muscles: exercise_secondary_muscles,
          instructions: exercise_instructions,
          images: exercise_images,
        }
      };
    });
  } finally {
    client.release();
  }
}

async function getRecentExercises(userId, limit) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `SELECT
        e.id, e.source, e.source_id, e.name, e.force, e.level, e.mechanic, e.equipment,
        e.primary_muscles, e.secondary_muscles, e.instructions, e.category, e.images,
        e.calories_per_hour, e.description, e.user_id, e.is_custom, e.shared_with_public,
        e.created_at, e.updated_at
      FROM exercise_entries ee
      JOIN exercises e ON ee.exercise_id = e.id
      WHERE ee.user_id = $1
      GROUP BY e.id, e.source, e.source_id, e.name, e.force, e.level, e.mechanic, e.equipment,
               e.primary_muscles, e.secondary_muscles, e.instructions, e.category, e.images,
               e.calories_per_hour, e.description, e.user_id, e.is_custom, e.shared_with_public,
               e.created_at, e.updated_at
      ORDER BY MAX(ee.entry_date) DESC, MAX(ee.created_at) DESC
      LIMIT $2`,
      [userId, limit]
    );
    return result.rows.map(row => {
      // Helper function to safely parse JSONB fields into arrays
      const parseJsonbField = (field) => {
        if (row[field]) {
          try {
            const parsed = JSON.parse(row[field]);
            return Array.isArray(parsed) ? parsed : [parsed]; // Ensure it's an array
          } catch (e) {
            log('error', `Error parsing ${field} for exercise ${row.id}:`, e);
            return [];
          }
        }
        return [];
      };

      row.equipment = parseJsonbField('equipment');
      row.primary_muscles = parseJsonbField('primary_muscles');
      row.secondary_muscles = parseJsonbField('secondary_muscles');
      row.instructions = parseJsonbField('instructions');
      row.images = parseJsonbField('images');
      
      return row;
    });
  } finally {
    client.release();
  }
}

async function getTopExercises(userId, limit) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `SELECT
        e.id, e.source, e.source_id, e.name, e.force, e.level, e.mechanic, e.equipment,
        e.primary_muscles, e.secondary_muscles, e.instructions, e.category, e.images,
        e.calories_per_hour, e.description, e.user_id, e.is_custom, e.shared_with_public,
        e.created_at, e.updated_at,
        COUNT(ee.exercise_id) AS usage_count
      FROM exercise_entries ee
      JOIN exercises e ON ee.exercise_id = e.id
      WHERE ee.user_id = $1
      GROUP BY e.id, e.source, e.source_id, e.name, e.force, e.level, e.mechanic, e.equipment,
               e.primary_muscles, e.secondary_muscles, e.instructions, e.category, e.images,
               e.calories_per_hour, e.description, e.user_id, e.is_custom, e.shared_with_public,
               e.created_at, e.updated_at
      ORDER BY usage_count DESC
      LIMIT $2`,
      [userId, limit]
    );
    return result.rows.map(row => {
      // Helper function to safely parse JSONB fields into arrays
      const parseJsonbField = (field) => {
        if (row[field]) {
          try {
            const parsed = JSON.parse(row[field]);
            return Array.isArray(parsed) ? parsed : [parsed]; // Ensure it's an array
          } catch (e) {
            log('error', `Error parsing ${field} for exercise ${row.id}:`, e);
            return [];
          }
        }
        return [];
      };

      row.equipment = parseJsonbField('equipment');
      row.primary_muscles = parseJsonbField('primary_muscles');
      row.secondary_muscles = parseJsonbField('secondary_muscles');
      row.instructions = parseJsonbField('instructions');
      row.images = parseJsonbField('images');
      
      return row;
    });
  } finally {
    client.release();
  }
}
async function getExerciseProgressData(userId, exerciseId, startDate, endDate) {
  const client = await getPool().connect();
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
  const client = await getPool().connect();
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
  getExerciseById,
  getExerciseOwnerId,
  getOrCreateActiveCaloriesExercise,
  upsertExerciseEntryData,
  getExercisesWithPagination,
  countExercises,
  getDistinctEquipment,
  getDistinctMuscleGroups,
  searchExercises,
  createExercise,
  createExerciseEntry,
  getExerciseEntryById,
  getExerciseEntryOwnerId,
  updateExerciseEntry,
  deleteExerciseEntry,
  updateExercise,
  deleteExercise,
  getExerciseEntriesByDate,
  getExerciseDeletionImpact,
  getRecentExercises,
  getTopExercises,
  getExerciseBySourceAndSourceId,
  getExerciseProgressData,
  getExerciseHistory,
  getExerciseBySourceAndSourceId, // Export the new function
  getExerciseDeletionImpact,
  createExerciseEntriesFromTemplate,
  deleteExerciseEntriesByTemplateId,
};

async function createExerciseEntriesFromTemplate(templateId, userId, currentClientDate = null) {
  log('info', `createExerciseEntriesFromTemplate called for templateId: ${templateId}, userId: ${userId}`);
  const client = await getPool().connect();
  try {
    // Fetch the workout plan template with its assignments
    const templateResult = await client.query(
      `SELECT
          wpt.id,
          wpt.user_id,
          wpt.plan_name,
          wpt.description,
          wpt.start_date,
          wpt.end_date,
          wpt.is_active,
          COALESCE(
              (
                  SELECT json_agg(
                      json_build_object(
                          'id', wpta.id,
                          'day_of_week', wpta.day_of_week,
                          'workout_preset_id', wpta.workout_preset_id,
                          'exercise_id', wpta.exercise_id
                      )
                  )
                  FROM workout_plan_template_assignments wpta
                  WHERE wpta.template_id = wpt.id
              ),
              '[]'::json
          ) as assignments
       FROM workout_plan_templates wpt
       WHERE wpt.id = $1 AND wpt.user_id = $2`,
      [templateId, userId]
    );

    const template = templateResult.rows[0];
    log('info', `createExerciseEntriesFromTemplate - Fetched template:`, template);

    if (!template || !template.assignments || template.assignments.length === 0) {
      log('info', `No assignments found for workout plan template ${templateId} or template not found.`);
      return;
    }

    const entriesToInsert = [];
    
    // Use the provided client date to ensure timezone consistency
    const clientDate = currentClientDate ? new Date(currentClientDate) : new Date();
    clientDate.setHours(0, 0, 0, 0); // Normalize to the beginning of the day in the client's timezone

    const startDate = new Date(template.start_date);
    const clientTimezoneOffset = currentClientDate ? new Date(currentClientDate).getTimezoneOffset() : new Date().getTimezoneOffset();
    const serverTimezoneOffset = startDate.getTimezoneOffset();
    const timezoneDifference = (clientTimezoneOffset - serverTimezoneOffset) * 60 * 1000;
    
    startDate.setTime(startDate.getTime() + timezoneDifference);
    // If end_date is not provided, default to one year from start_date
    const endDate = template.end_date ? new Date(template.end_date) : new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate());

    log('info', `createExerciseEntriesFromTemplate - Plan start_date: ${startDate.toISOString().split('T')[0]}, end_date: ${endDate.toISOString().split('T')[0]}`);

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const currentDayOfWeek = d.getDay(); // 0 for Sunday, 1 for Monday, ..., 6 for Saturday
      const entryDate = d.toISOString().split('T')[0];

      for (const assignment of template.assignments) {
        if (assignment.day_of_week === currentDayOfWeek) {
          const processExercise = async (exerciseId, sets, notes) => {
            const exerciseDetails = await getExerciseById(exerciseId);
            const durationMinutes = sets?.reduce((acc, set) => acc + (set.duration || 0), 0) || 30;
            const caloriesPerHour = exerciseDetails.calories_per_hour || 0;
            const caloriesBurned = (caloriesPerHour / 60) * durationMinutes;

            log('info', `createExerciseEntriesFromTemplate - Assignment day_of_week (${assignment.day_of_week}) matches currentDayOfWeek (${currentDayOfWeek}) for date ${entryDate}. Adding to entriesToInsert.`);
            const entryResult = await client.query(
              `INSERT INTO exercise_entries (user_id, exercise_id, entry_date, notes, workout_plan_assignment_id, duration_minutes, calories_burned)
               VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
              [userId, exerciseId, entryDate, notes, assignment.id, durationMinutes, caloriesBurned]
            );
            const newEntryId = entryResult.rows[0].id;

            if (sets && sets.length > 0) {
              const setsValues = sets.map(set => [
                newEntryId, set.set_number, set.set_type, set.reps, set.weight, set.duration, set.rest_time, set.notes
              ]);
              const setsQuery = format(
                `INSERT INTO exercise_entry_sets (exercise_entry_id, set_number, set_type, reps, weight, duration, rest_time, notes) VALUES %L`,
                setsValues
              );
              await client.query(setsQuery);
            }
          };

          if (assignment.exercise_id) {
            const setsResult = await client.query('SELECT * FROM workout_plan_assignment_sets WHERE assignment_id = $1', [assignment.id]);
            const sets = setsResult.rows;
            await processExercise(assignment.exercise_id, sets, null);
          } else if (assignment.workout_preset_id) {
            log('info', `createExerciseEntriesFromTemplate - Found workout_preset_id ${assignment.workout_preset_id} for date ${entryDate}.`);
            const preset = await workoutPresetRepository.getWorkoutPresetById(assignment.workout_preset_id);
            if (preset && preset.exercises) {
              for (const exercise of preset.exercises) {
                log('info', `Adding exercise ${exercise.exercise_id} from preset ${preset.id} to entriesToInsert.`);
                await processExercise(exercise.exercise_id, exercise.sets, exercise.notes);
              }
            }
          }
        }
      }
      log('info', `Finished processing assignments for date ${entryDate}.`);
    }
    // The logic has been moved inside the loop to handle sets for each entry individually.
    // The entriesToInsert array is no longer needed.
  } catch (error) {
    log('error', `Error creating exercise entries from template ${templateId} for user ${userId}: ${error.message}`, error);
    throw error;
  } finally {
    client.release();
  }
}

async function deleteExerciseEntriesByTemplateId(templateId, userId) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `DELETE FROM exercise_entries
       WHERE user_id = $1
         AND entry_date >= CURRENT_DATE::date -- Only delete entries for today or future dates
         AND workout_plan_assignment_id IN (
             SELECT id FROM workout_plan_template_assignments
             WHERE template_id = $2
         ) RETURNING id`,
      [userId, templateId]
    );
    log('info', `Deleted ${result.rowCount} exercise entries associated with workout plan template ${templateId} for user ${userId}.`);
    return result.rowCount;
  } catch (error) {
    log('error', `Error deleting exercise entries for template ${templateId} for user ${userId}: ${error.message}`, error);
    throw error;
  } finally {
    client.release();
  }
}

async function getExerciseBySourceAndSourceId(source, sourceId) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `SELECT id, source, source_id, name, force, level, mechanic, equipment,
              primary_muscles, secondary_muscles, instructions, category, images,
              calories_per_hour, description, user_id, is_custom, shared_with_public,
              created_at, updated_at
       FROM exercises WHERE source = $1 AND source_id = $2`,
      [source, sourceId]
    );
    const exercise = result.rows[0];
    if (exercise && exercise.images) {
      try {
        exercise.images = JSON.parse(exercise.images);
      } catch (e) {
        log('error', `Error parsing images for exercise ${exercise.id}:`, e);
        exercise.images = []; // Default to empty array on parse error
      }
    }
    return exercise;
  } finally {
    client.release();
  }
}

async function getExerciseDeletionImpact(exerciseId) {
    const client = await getPool().connect();
    try {
        const result = await client.query(
            'SELECT COUNT(*) FROM exercise_entries WHERE exercise_id = $1',
            [exerciseId]
        );
        return {
            exerciseEntriesCount: parseInt(result.rows[0].count, 10),
        };
    } finally {
        client.release();
    }
}
