import { query } from "../../db.js";
import { MOCK_USER_ID } from "../../config.js";

/**
 * Exercise Library & Diary Database Logic
 */

export const searchExercises = async (args: any) => {
    const { searchTerm, muscleGroup, equipment } = args;
    let sql = `SELECT * FROM exercises WHERE (user_id = $1 OR shared_with_public = true)`;
    const params: any[] = [MOCK_USER_ID];

    if (searchTerm) {
        params.push(`%${searchTerm}%`);
        sql += ` AND name ILIKE $${params.length}`;
    }
    if (muscleGroup) {
        params.push(`%${muscleGroup}%`);
        sql += ` AND (primary_muscles ILIKE $${params.length} OR secondary_muscles ILIKE $${params.length})`;
    }
    if (equipment) {
        params.push(`%${equipment}%`);
        sql += ` AND equipment ILIKE $${params.length}`;
    }

    sql += " ORDER BY name ASC LIMIT 20";
    const res = await query(sql, params);
    return { content: [{ type: "text", text: JSON.stringify(res.rows, null, 2) }] };
};

export const createExercise = async (args: any) => {
    const { name, category, calories_per_hour, description, equipment, primary_muscles, secondary_muscles } = args;
    const res = await query(
        `INSERT INTO exercises (name, category, calories_per_hour, description, equipment, primary_muscles, secondary_muscles, user_id, is_custom, source, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, 'manual', now(), now()) RETURNING id`,
        [name, category || 'general', calories_per_hour || 300, description, equipment, primary_muscles, secondary_muscles, MOCK_USER_ID]
    );
    return { content: [{ type: "text", text: `✅ Created exercise "${name}" with ID ${res.rows[0].id}.` }] };
};

export const logExercise = async (args: any) => {
    console.log("[Exercise] Action: log_exercise", args);
    const { exercise_id, exercise_name, duration_minutes, calories_burned, entry_date, notes, sets } = args;
    let targetExerciseId = exercise_id;

    // 1. Try to find the exercise if ID not provided
    if (!targetExerciseId && exercise_name) {
        console.log(`[Exercise] Searching for: ${exercise_name}`);
        // First try exact match
        const exactMatch = await query("SELECT id FROM exercises WHERE LOWER(name) = LOWER($1) LIMIT 1", [exercise_name]);
        if (exactMatch.rows.length > 0) {
            targetExerciseId = exactMatch.rows[0].id;
        } else {
            // Try fuzzy match
            const fuzzyMatch = await query("SELECT id FROM exercises WHERE name ILIKE $1 LIMIT 1", [`%${exercise_name}%`]);
            targetExerciseId = fuzzyMatch.rows[0]?.id;
        }
    }

    // 2. If still not found, CREATE it automatically
    if (!targetExerciseId && exercise_name) {
        console.log(`[Exercise] Exercise not found. Creating new custom exercise: ${exercise_name}`);
        const createRes = await query(
            `INSERT INTO exercises (name, category, calories_per_hour, user_id, is_custom, source, created_at, updated_at) 
             VALUES ($1, 'custom', 300, $2, true, 'manual', now(), now()) RETURNING id`,
            [exercise_name, MOCK_USER_ID]
        );
        targetExerciseId = createRes.rows[0].id;
    }

    if (!targetExerciseId) {
        console.error(`[Exercise] Error: No exercise name or ID provided.`);
        return { content: [{ type: "text", text: `Error: Please provide an exercise name.` }], isError: true };
    }

    const date = entry_date || new Date().toISOString().split('T')[0];
    
    console.log(`[Exercise] Logging to DB. ID: ${targetExerciseId}, Date: ${date}`);
    // 3. Insert the main entry
    const entryRes = await query(
        `INSERT INTO exercise_entries (user_id, exercise_id, duration_minutes, calories_burned, entry_date, notes, created_at, updated_at, created_by_user_id, updated_by_user_id) 
         VALUES ($1, $2, $3, $4, $5, $6, now(), now(), $1, $1) RETURNING id`,
        [MOCK_USER_ID, targetExerciseId, duration_minutes || 0, calories_burned || 0, date, notes]
    );
    const newEntryId = entryRes.rows[0].id;

    // 4. Insert sets
    if (sets && Array.isArray(sets)) {
        console.log(`[Exercise] Inserting ${sets.length} sets...`);
        for (let i = 0; i < sets.length; i++) {
            const s = sets[i];
            await query(
                `INSERT INTO exercise_entry_sets (exercise_entry_id, set_number, set_type, reps, weight, duration, rest_time, created_at, updated_at) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
                [newEntryId, i + 1, s.set_type || 'Working Set', s.reps || 0, s.weight || 0, s.duration || 0, s.rest_time || 0]
            );
        }
    }

    return { content: [{ type: "text", text: `✅ Logged ${exercise_name || 'exercise'} for ${date}. (Entry ID: ${newEntryId})` }] };
};

export const listExerciseDiary = async (args: any) => {
    const { entry_date } = args;
    const date = entry_date || new Date().toISOString().split('T')[0];

    const entriesRes = await query(
        `SELECT ee.*, e.name as exercise_name 
         FROM exercise_entries ee 
         JOIN exercises e ON ee.exercise_id = e.id 
         WHERE ee.user_id = $1 AND ee.entry_date = $2`,
        [MOCK_USER_ID, date]
    );

    const results = [];
    for (const entry of entriesRes.rows) {
        const setsRes = await query("SELECT * FROM exercise_entry_sets WHERE exercise_entry_id = $1 ORDER BY set_number", [entry.id]);
        results.push({
            ...entry,
            sets: setsRes.rows
        });
    }

    return { content: [{ type: "text", text: `Exercise Diary for ${date}:
` + JSON.stringify(results, null, 2) }] };
};

export const getWorkoutPresets = async () => {
    const res = await query(
        "SELECT * FROM workout_presets WHERE user_id = $1 OR is_public = true ORDER BY name ASC",
        [MOCK_USER_ID]
    );
    return { content: [{ type: "text", text: JSON.stringify(res.rows, null, 2) }] };
};

export const logWorkoutPreset = async (args: any) => {
    const { preset_id, preset_name, entry_date } = args;
    const date = entry_date || new Date().toISOString().split('T')[0];

    let preset;
    if (preset_id) {
        const res = await query("SELECT * FROM workout_presets WHERE id = $1", [preset_id]);
        preset = res.rows[0];
    } else {
        const res = await query("SELECT * FROM workout_presets WHERE name ILIKE $1 AND (user_id = $2 OR is_public = true) LIMIT 1", [preset_name, MOCK_USER_ID]);
        preset = res.rows[0];
    }

    if (!preset) return { content: [{ type: "text", text: "Workout preset not found." }], isError: true };

    const exercisesRes = await query(
        `SELECT wpe.*, e.name as exercise_name, e.calories_per_hour 
         FROM workout_preset_exercises wpe 
         JOIN exercises e ON wpe.exercise_id = e.id 
         WHERE wpe.workout_preset_id = $1 ORDER BY wpe.sort_order`,
        [preset.id]
    );

    const logged = [];
    for (const ex of exercisesRes.rows) {
        // Fetch template sets for this exercise in the preset
        const templateSets = await query("SELECT * FROM workout_preset_exercise_sets WHERE workout_preset_exercise_id = $1 ORDER BY set_number", [ex.id]);
        
        // Log the main entry
        const entryRes = await query(
            `INSERT INTO exercise_entries (user_id, exercise_id, entry_date, created_at, updated_at, duration_minutes, calories_burned, created_by_user_id, updated_by_user_id) 
             VALUES ($1, $2, $3, now(), now(), 0, 0, $1, $1) RETURNING id`,
            [MOCK_USER_ID, ex.exercise_id, date]
        );
        const newEntryId = entryRes.rows[0].id;

        // Clone sets
        for (const s of templateSets.rows) {
            await query(
                `INSERT INTO exercise_entry_sets (exercise_entry_id, set_number, set_type, reps, weight, duration, rest_time, created_at, updated_at) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
                [newEntryId, s.set_number, s.set_type, s.reps, s.weight, s.duration, s.rest_time]
            );
        }
        logged.push(ex.exercise_name);
    }

    return { content: [{ type: "text", text: `✅ Logged routine "${preset.name}" (${logged.length} exercises) for ${date}.` }] };
};
