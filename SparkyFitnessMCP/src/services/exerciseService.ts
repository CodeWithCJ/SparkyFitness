import { withClient } from "../db/context.js";
import { normalizePagination, buildPaginatedResult } from "../utils/pagination.js";
import type { Exercise, ExerciseEntry, ExerciseSet, WorkoutPreset, PaginatedResult } from "../types.js";

export async function searchExercises(
  userId: string,
  searchTerm: string,
  muscleGroup?: string,
  equipment?: string,
  limit?: number,
  offset?: number
): Promise<PaginatedResult<Exercise>> {
  const { limit: safeLimit, offset: safeOffset } = normalizePagination(limit, offset);

  return withClient(userId, async (client) => {
    const whereClauses = ["is_quick_exercise = FALSE", "name ILIKE $1"];
    const params: unknown[] = [`%${searchTerm}%`];
    let paramIdx = 2;

    if (muscleGroup) {
      whereClauses.push(`primary_muscles ILIKE $${paramIdx}`);
      params.push(`%${muscleGroup}%`);
      paramIdx++;
    }

    if (equipment) {
      whereClauses.push(`equipment ILIKE $${paramIdx}`);
      params.push(`%${equipment}%`);
      paramIdx++;
    }

    const whereSQL = whereClauses.join(" AND ");

    // Count
    const countResult = await client.query(
      `SELECT COUNT(*)::int AS count FROM exercises WHERE ${whereSQL}`,
      params
    );
    const totalCount = countResult.rows[0]?.count ?? 0;

    // Data
    const dataResult = await client.query(
      `SELECT id, name, category, primary_muscles, secondary_muscles, equipment, level, calories_per_hour, description, is_custom
       FROM exercises WHERE ${whereSQL}
       ORDER BY name ASC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, safeLimit, safeOffset]
    );

    const exercises: Exercise[] = dataResult.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      muscle_groups: safeParseJson(row.primary_muscles),
      equipment: safeParseJson(row.equipment),
      level: row.level,
      calories_per_hour: row.calories_per_hour,
      description: row.description,
      is_custom: row.is_custom,
    }));

    return buildPaginatedResult(exercises, totalCount, safeOffset);
  });
}

export async function createExercise(
  userId: string,
  name: string,
  category?: string,
  caloriesPerHour?: number,
  description?: string
): Promise<Exercise> {
  return withClient(userId, async (client) => {
    // Check if exercise already exists for this user
    const existing = await client.query(
      "SELECT id, name, category, calories_per_hour, description, is_custom FROM exercises WHERE name ILIKE $1 LIMIT 1",
      [name]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      return {
        id: row.id,
        name: row.name,
        category: row.category,
        calories_per_hour: row.calories_per_hour,
        description: row.description,
        is_custom: row.is_custom,
      };
    }

    const result = await client.query(
      `INSERT INTO exercises (user_id, name, category, calories_per_hour, description, is_custom, shared_with_public, source, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, TRUE, FALSE, 'manual', NOW(), NOW())
       RETURNING id, name, category, calories_per_hour, description, is_custom`,
      [userId, name, category || "custom", caloriesPerHour || 300, description || null]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      calories_per_hour: row.calories_per_hour,
      description: row.description,
      is_custom: row.is_custom,
    };
  });
}

export async function logExercise(
  userId: string,
  params: {
    exercise_id?: string;
    exercise_name?: string;
    entry_date: string;
    duration_minutes?: number;
    calories_burned?: number;
    notes?: string;
    sets?: ExerciseSet[];
  }
): Promise<ExerciseEntry> {
  return withClient(userId, async (client) => {
    let exerciseId = params.exercise_id;

    // If exercise_name provided, find or create the exercise
    if (!exerciseId && params.exercise_name) {
      // Try exact match first (case-insensitive)
      const exactMatch = await client.query(
        "SELECT id FROM exercises WHERE LOWER(name) = LOWER($1) LIMIT 1",
        [params.exercise_name]
      );

      if (exactMatch.rows.length > 0) {
        exerciseId = exactMatch.rows[0].id;
      } else {
        // Try fuzzy match
        const fuzzyMatch = await client.query(
          "SELECT id FROM exercises WHERE name ILIKE $1 LIMIT 1",
          [`%${params.exercise_name}%`]
        );

        if (fuzzyMatch.rows.length > 0) {
          exerciseId = fuzzyMatch.rows[0].id;
        } else {
        // Auto-create the exercise (matching local MCP pattern)
        const created = await client.query(
          `INSERT INTO exercises (user_id, name, category, calories_per_hour, is_custom, shared_with_public, source, created_at, updated_at)
           VALUES ($1, $2, 'custom', 300, TRUE, FALSE, 'manual', NOW(), NOW()) RETURNING id`,
          [userId, params.exercise_name]
        );
        exerciseId = created.rows[0].id;
        }
      }
    }

    // Fetch snapshot data for the exercise (name + category) to populate denormalized columns
    const exerciseInfo = await client.query(
      "SELECT name, category FROM exercises WHERE id = $1",
      [exerciseId]
    );
    const exerciseName = exerciseInfo.rows[0]?.name || params.exercise_name || "Unknown";
    const exerciseCategory = exerciseInfo.rows[0]?.category || "custom";

    // exercise_entries does NOT have a sets jsonb column.
    // Sets are stored in the exercise_entry_sets table.
    const result = await client.query(
      `INSERT INTO exercise_entries (user_id, exercise_id, entry_date, duration_minutes, calories_burned, notes, exercise_name, category, source, created_by_user_id, updated_by_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'manual', $1, $1, NOW(), NOW())
       RETURNING id, user_id, exercise_id, entry_date, duration_minutes, calories_burned, notes, created_at`,
      [userId, exerciseId, params.entry_date, params.duration_minutes || 0, params.calories_burned || 0, params.notes || null, exerciseName, exerciseCategory]
    );

    const row = result.rows[0];
    const entryId = row.id;

    // Insert sets into exercise_entry_sets table
    const sets: ExerciseSet[] = [];
    if (params.sets && params.sets.length > 0) {
      for (let i = 0; i < params.sets.length; i++) {
        const s = params.sets[i];
        await client.query(
          `INSERT INTO exercise_entry_sets (exercise_entry_id, set_number, set_type, reps, weight, duration, rest_time, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
          [entryId, i + 1, s.set_type || "Working Set", s.reps || null, s.weight || null, s.duration || null, s.rest_time || null]
        );
        sets.push(s);
      }
    }

    return {
      id: entryId,
      user_id: row.user_id,
      exercise_id: row.exercise_id,
      exercise_name: params.exercise_name || "",
      entry_date: row.entry_date,
      sets,
      duration_minutes: row.duration_minutes,
      calories_burned: row.calories_burned,
      notes: row.notes,
      created_at: row.created_at,
    };
  });
}

export async function listExerciseDiary(userId: string, entryDate: string): Promise<ExerciseEntry[]> {
  return withClient(userId, async (client) => {
    const result = await client.query(
      `SELECT ee.id, ee.user_id, ee.exercise_id, e.name AS exercise_name, ee.entry_date,
              ee.duration_minutes, ee.calories_burned, ee.notes, ee.created_at
       FROM exercise_entries ee
       JOIN exercises e ON ee.exercise_id = e.id
       WHERE ee.entry_date = $1
       ORDER BY ee.created_at ASC`,
      [entryDate]
    );

    // Fetch sets for each entry from exercise_entry_sets
    const entries: ExerciseEntry[] = [];
    for (const row of result.rows) {
      const setsResult = await client.query(
        `SELECT set_number, set_type, reps, weight, duration, rest_time
         FROM exercise_entry_sets
         WHERE exercise_entry_id = $1
         ORDER BY set_number ASC`,
        [row.id]
      );

      const sets: ExerciseSet[] = setsResult.rows.map((s: any) => ({
        set_type: s.set_type || "Working Set",
        reps: s.reps,
        weight: s.weight ? Number(s.weight) : undefined,
        duration: s.duration,
        rest_time: s.rest_time,
      }));

      entries.push({
        id: row.id,
        user_id: row.user_id,
        exercise_id: row.exercise_id,
        exercise_name: row.exercise_name,
        entry_date: row.entry_date,
        sets,
        duration_minutes: row.duration_minutes,
        calories_burned: row.calories_burned,
        notes: row.notes,
        created_at: row.created_at,
      });
    }

    return entries;
  });
}

export async function getWorkoutPresets(userId: string): Promise<WorkoutPreset[]> {
  return withClient(userId, async (client) => {
    // workout_presets table exists with id (integer), user_id, name, description
    // Exercises are in workout_preset_exercises (workout_preset_id, exercise_id)
    // Sets are in workout_preset_exercise_sets (workout_preset_exercise_id, ...)
    try {
      const presetsResult = await client.query(
        `SELECT id, user_id, name, description
         FROM workout_presets
         ORDER BY name ASC`
      );

      const presets: WorkoutPreset[] = [];
      for (const preset of presetsResult.rows) {
        // Get exercises for this preset
        const exercisesResult = await client.query(
          `SELECT wpe.id AS wpe_id, wpe.exercise_id, e.name AS exercise_name
           FROM workout_preset_exercises wpe
           JOIN exercises e ON e.id = wpe.exercise_id
           WHERE wpe.workout_preset_id = $1
           ORDER BY wpe.sort_order ASC`,
          [preset.id]
        );

        const exercises: WorkoutPreset["exercises"] = [];
        for (const ex of exercisesResult.rows) {
          // Get sets for this preset exercise
          const setsResult = await client.query(
            `SELECT set_number, set_type, reps, weight, duration, rest_time
             FROM workout_preset_exercise_sets
             WHERE workout_preset_exercise_id = $1
             ORDER BY set_number ASC`,
            [ex.wpe_id]
          );

          const sets: ExerciseSet[] = setsResult.rows.map((s: any) => ({
            set_type: s.set_type || "Working Set",
            reps: s.reps,
            weight: s.weight ? Number(s.weight) : undefined,
            duration: s.duration,
            rest_time: s.rest_time,
          }));

          exercises.push({
            exercise_id: ex.exercise_id,
            exercise_name: ex.exercise_name,
            sets,
          });
        }

        presets.push({
          id: String(preset.id),
          user_id: preset.user_id,
          name: preset.name,
          exercises,
        });
      }

      return presets;
    } catch (error: any) {
      // If the table doesn't exist or query fails, return empty array gracefully
      if (error?.code === "42P01") {
        // undefined_table
        return [];
      }
      throw error;
    }
  });
}

export async function logWorkoutPreset(
  userId: string,
  params: { preset_id?: string; preset_name?: string; entry_date: string }
): Promise<ExerciseEntry[]> {
  return withClient(userId, async (client) => {
    // Find the preset
    let preset: any;
    if (params.preset_id) {
      const result = await client.query("SELECT id, name FROM workout_presets WHERE id = $1", [params.preset_id]);
      preset = result.rows[0];
    } else if (params.preset_name) {
      const result = await client.query("SELECT id, name FROM workout_presets WHERE name ILIKE $1 LIMIT 1", [params.preset_name]);
      preset = result.rows[0];
    }

    if (!preset) {
      throw new Error("Workout preset not found");
    }

    // Get exercises for this preset
    const exercisesResult = await client.query(
      `SELECT wpe.id AS wpe_id, wpe.exercise_id, e.name AS exercise_name
       FROM workout_preset_exercises wpe
       JOIN exercises e ON e.id = wpe.exercise_id
       WHERE wpe.workout_preset_id = $1
       ORDER BY wpe.sort_order ASC`,
      [preset.id]
    );

    // Log each exercise in the preset
    await client.query("BEGIN");
    const entries: ExerciseEntry[] = [];

    try {
      for (const ex of exercisesResult.rows) {
        // Get sets for this preset exercise
        const setsResult = await client.query(
          `SELECT set_number, set_type, reps, weight, duration, rest_time
           FROM workout_preset_exercise_sets
           WHERE workout_preset_exercise_id = $1
           ORDER BY set_number ASC`,
          [ex.wpe_id]
        );

        // Fetch snapshot data for the exercise
        const exInfo = await client.query(
          "SELECT name, category FROM exercises WHERE id = $1",
          [ex.exercise_id]
        );
        const exName = exInfo.rows[0]?.name || ex.exercise_name || "Unknown";
        const exCategory = exInfo.rows[0]?.category || "custom";

        // Insert exercise entry with snapshot columns
        const entryResult = await client.query(
          `INSERT INTO exercise_entries (user_id, exercise_id, entry_date, duration_minutes, calories_burned, exercise_name, category, source, exercise_preset_entry_id, created_at, updated_at)
           VALUES ($1, $2, $3, 0, 0, $4, $5, 'manual', NULL, NOW(), NOW())
           RETURNING id, user_id, exercise_id, entry_date, created_at`,
          [userId, ex.exercise_id, params.entry_date, exName, exCategory]
        );

        const entryRow = entryResult.rows[0];

        // Insert sets into exercise_entry_sets
        const sets: ExerciseSet[] = [];
        for (const s of setsResult.rows) {
          await client.query(
            `INSERT INTO exercise_entry_sets (exercise_entry_id, set_number, set_type, reps, weight, duration, rest_time, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
            [entryRow.id, s.set_number, s.set_type || "Working Set", s.reps, s.weight, s.duration, s.rest_time]
          );
          sets.push({
            set_type: s.set_type || "Working Set",
            reps: s.reps,
            weight: s.weight ? Number(s.weight) : undefined,
            duration: s.duration,
            rest_time: s.rest_time,
          });
        }

        entries.push({
          id: entryRow.id,
          user_id: entryRow.user_id,
          exercise_id: entryRow.exercise_id,
          exercise_name: ex.exercise_name,
          entry_date: entryRow.entry_date,
          sets,
          created_at: entryRow.created_at,
        });
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    return entries;
  });
}

export async function deleteExerciseEntry(userId: string, entryId: string): Promise<boolean> {
  return withClient(userId, async (client) => {
    // exercise_entry_sets should cascade delete, but delete explicitly to be safe
    await client.query("DELETE FROM exercise_entry_sets WHERE exercise_entry_id = $1", [entryId]);
    const result = await client.query(
      "DELETE FROM exercise_entries WHERE id = $1 RETURNING id",
      [entryId]
    );
    return (result.rowCount ?? 0) > 0;
  });
}

// Helper to safely parse text fields that may contain JSON arrays or comma-separated values
function safeParseJson(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    // Try JSON parse first
    try { return JSON.parse(value); } catch { /* not JSON */ }
    // Try comma-separated
    if (value.includes(",")) {
      return value.split(",").map((s) => s.trim()).filter(Boolean);
    }
    return value ? [value] : [];
  }
  return [];
}
