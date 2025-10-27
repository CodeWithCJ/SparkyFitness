const { getClient, getSystemClient } = require('../db/poolManager');
const { log } = require('../config/logging');

async function getExerciseById(id, userId) {
  const client = await getClient(userId);
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

async function getExerciseOwnerId(id, userId) {
  const client = await getClient(userId);
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
  const client = await getClient(userId);
  let exercise = null;
  try {
    const result = await client.query(
      'SELECT id FROM exercises WHERE name = $1',
      [exerciseName]
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
    const insertClient = await getClient(userId);
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

async function getExercisesWithPagination(targetUserId, searchTerm, categoryFilter, ownershipFilter, equipmentFilter, muscleGroupFilter, limit, offset) {
  const client = await getClient(targetUserId);
  try {
    let whereClauses = ['is_quick_exercise = FALSE'];
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

    // RLS will handle ownership filtering

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
  const client = await getClient(targetUserId);
  try {
    let whereClauses = ['is_quick_exercise = FALSE'];
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

    // RLS will handle ownership filtering

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
  const client = await getSystemClient();
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
  const client = await getSystemClient();
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
  const client = await getClient(userId);
  try {
    let whereClauses = ['is_quick_exercise = FALSE'];
    const queryParams = [];
    let paramIndex = 1;

    if (name) {
      whereClauses.push(`name ILIKE $${paramIndex}`);
      queryParams.push(`%${name}%`);
      paramIndex++;
    }


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
  const client = await getClient(exerciseData.user_id);
  try {
    log('debug', `[exerciseRepository] createExercise - incoming exerciseData: ${JSON.stringify(exerciseData)}`);
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
        exerciseData.calories_per_hour || 0, // Ensure calories_per_hour is a number, default to 0
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

async function updateExercise(id, userId, updateData) {
  const client = await getClient(userId);
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
        is_quick_exercise = COALESCE($15, is_quick_exercise),
        updated_at = now()
      WHERE id = $16
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
        typeof updateData.is_quick_exercise === 'boolean' ? updateData.is_quick_exercise : null,
        id,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function deleteExercise(id, userId) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'DELETE FROM exercises WHERE id = $1 RETURNING id',
      [id]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

async function getRecentExercises(userId, limit) {
  const client = await getClient(userId);
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
        AND e.is_quick_exercise = FALSE
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
  const client = await getClient(userId);
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
        AND e.is_quick_exercise = FALSE
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

async function getExerciseBySourceAndSourceId(source, sourceId) {
  const client = await getSystemClient();
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

async function getExerciseDeletionImpact(exerciseId, authenticatedUserId) {
  const client = await getClient(authenticatedUserId);
  const systemClient = await getSystemClient();
  try {
    const publicExerciseResult = await systemClient.query(
      "SELECT shared_with_public FROM exercises WHERE id = $1",
      [exerciseId]
    );
    const isPubliclyShared = publicExerciseResult.rows[0]?.shared_with_public || false;

    const exerciseOwnerResult = await systemClient.query(
      "SELECT user_id FROM exercises WHERE id = $1",
      [exerciseId]
    );
    const exerciseOwnerId = exerciseOwnerResult.rows[0]?.user_id;

    const currentUserReferencesQueries = [
      client.query("SELECT COUNT(*) FROM exercise_entries WHERE exercise_id = $1 AND user_id = $2", [exerciseId, authenticatedUserId]),
      client.query("SELECT COUNT(*) FROM workout_plan_template_assignments wpta JOIN workout_plan_templates wpt ON wpta.template_id = wpt.id WHERE wpta.exercise_id = $1 AND wpt.user_id = $2", [exerciseId, authenticatedUserId]),
      client.query("SELECT COUNT(*) FROM workout_preset_exercises wpe JOIN workout_presets wp ON wpe.workout_preset_id = wp.id WHERE wpe.exercise_id = $1 AND wp.user_id = $2", [exerciseId, authenticatedUserId]),
    ];
    const currentUserReferencesResults = await Promise.all(currentUserReferencesQueries);
    const currentUserExerciseEntriesCount = parseInt(currentUserReferencesResults[0].rows[0].count, 10);
    const currentUserWorkoutPlansCount = parseInt(currentUserReferencesResults[1].rows[0].count, 10);
    const currentUserWorkoutPresetsCount = parseInt(currentUserReferencesResults[2].rows[0].count, 10);

    const currentUserReferences =
      currentUserExerciseEntriesCount +
      currentUserWorkoutPlansCount +
      currentUserWorkoutPresetsCount;

    const otherUserReferencesQueries = [
      systemClient.query("SELECT COUNT(*) FROM exercise_entries WHERE exercise_id = $1 AND user_id != $2", [exerciseId, authenticatedUserId]),
      systemClient.query("SELECT COUNT(*) FROM workout_plan_template_assignments wpta JOIN workout_plan_templates wpt ON wpta.template_id = wpt.id WHERE wpta.exercise_id = $1 AND wpt.user_id != $2", [exerciseId, authenticatedUserId]),
      systemClient.query("SELECT COUNT(*) FROM workout_preset_exercises wpe JOIN workout_presets wp ON wpe.workout_preset_id = wp.id WHERE wpe.exercise_id = $1 AND wp.user_id != $2", [exerciseId, authenticatedUserId]),
    ];
    const otherUserReferencesResults = await Promise.all(otherUserReferencesQueries);
    const otherUserExerciseEntriesCount = parseInt(otherUserReferencesResults[0].rows[0].count, 10);
    const otherUserWorkoutPlansCount = parseInt(otherUserReferencesResults[1].rows[0].count, 10);
    const otherUserWorkoutPresetsCount = parseInt(otherUserReferencesResults[2].rows[0].count, 10);

    const otherUserReferences =
      otherUserExerciseEntriesCount +
      otherUserWorkoutPlansCount +
      otherUserWorkoutPresetsCount;

    let familySharedUsers = [];
    if (exerciseOwnerId === authenticatedUserId) {
      const familyAccessResult = await client.query(
        `SELECT fa.family_user_id
         FROM family_access fa
         WHERE fa.owner_user_id = $1
           AND fa.is_active = TRUE
           AND (fa.access_end_date IS NULL OR fa.access_end_date > NOW())
           AND (fa.access_permissions->>'diary')::boolean = TRUE`,
        [authenticatedUserId]
      );
      familySharedUsers = familyAccessResult.rows.map(row => row.family_user_id);
    }

    return {
      exerciseEntriesCount: currentUserExerciseEntriesCount + otherUserExerciseEntriesCount,
      workoutPlansCount: currentUserWorkoutPlansCount + otherUserWorkoutPlansCount,
      workoutPresetsCount: currentUserWorkoutPresetsCount + otherUserWorkoutPresetsCount,
      totalReferences: currentUserReferences + otherUserReferences,
      currentUserReferences: currentUserReferences,
      otherUserReferences: otherUserReferences,
      isPubliclyShared: isPubliclyShared,
      familySharedUsers: familySharedUsers,
    };
  } finally {
    client.release();
    systemClient.release();
  }
}

async function deleteExerciseAndDependencies(exerciseId, userId) {
  const client = await getClient(userId);
  try {
    await client.query("BEGIN");

    await client.query("DELETE FROM exercise_entries WHERE exercise_id = $1 AND user_id = $2", [exerciseId, userId]);
    log("info", `Deleted exercise entries for exercise ${exerciseId} by user ${userId}`);

    await client.query(`
      DELETE FROM workout_plan_template_assignments wpta
      USING workout_plan_templates wpt
      WHERE wpta.template_id = wpt.id
        AND wpta.exercise_id = $1
        AND wpt.user_id = $2
    `, [exerciseId, userId]);
log("info", `Deleted workout plan exercises for exercise ${exerciseId} in plans by user ${userId}`);

    await client.query(`
      DELETE FROM workout_preset_exercises wpe
      USING workout_presets wp
      WHERE wpe.workout_preset_id = wp.id
        AND wpe.exercise_id = $1
        AND wp.user_id = $2
    `, [exerciseId, userId]);
    log("info", `Deleted workout preset exercises for exercise ${exerciseId} in presets by user ${userId}`);

    const result = await client.query("DELETE FROM exercises WHERE id = $1 AND user_id = $2 RETURNING id", [exerciseId, userId]);
    log("info", `Deleted exercise ${exerciseId} by user ${userId}`);

    await client.query("COMMIT");
    return result.rowCount > 0;
  } catch (error) {
    await client.query("ROLLBACK");
    log("error", `Error deleting exercise and dependencies for exercise ${exerciseId} by user ${userId}:`, error);
    throw error;
  } finally {
    client.release();
  }
}

async function findExerciseByNameAndUserId(name, userId) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT id, source, source_id, name, force, level, mechanic, equipment,
              primary_muscles, secondary_muscles, instructions, category, images,
              calories_per_hour, description, user_id, is_custom, shared_with_public,
              created_at, updated_at
       FROM exercises WHERE name = $1 AND (user_id = $2 OR shared_with_public = TRUE)`,
      [name, userId]
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
module.exports = {
  getExerciseById,
  getExerciseOwnerId,
  getOrCreateActiveCaloriesExercise,
  getExercisesWithPagination,
  countExercises,
  getDistinctEquipment,
  getDistinctMuscleGroups,
  searchExercises,
  createExercise,
  updateExercise,
  deleteExercise,
  getRecentExercises,
  getTopExercises,
  getExerciseBySourceAndSourceId,
  getExerciseDeletionImpact,
  deleteExerciseAndDependencies,
  findExerciseByNameAndUserId,
};