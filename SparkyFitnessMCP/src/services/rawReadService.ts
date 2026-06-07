import { withClient } from "../db/context.js";
import { normalizePagination, buildPaginatedResult } from "../utils/pagination.js";
import type { PaginatedResult } from "../types.js";

type QueryValue = string | number | boolean | undefined | null;

type DateQuery = {
  date?: string;
  start_date?: string;
  end_date?: string;
};

type PaginationQuery = {
  limit?: number;
  offset?: number;
};

function dateRange(query: DateQuery): { startDate: string; endDate: string } {
  const today = new Date().toISOString().slice(0, 10);
  const date = query.date || undefined;
  const startDate = date || query.start_date || today;
  const endDate = date || query.end_date || startDate;
  return { startDate, endDate };
}


function optionalSearch(search?: string): { clause: string; params: QueryValue[] } {
  const trimmed = search?.trim();
  if (!trimmed) return { clause: "", params: [] };
  return {
    clause: "WHERE f.name ILIKE $1 OR COALESCE(f.brand, '') ILIKE $1",
    params: [`%${trimmed}%`],
  };
}

function optionalExerciseSearch(search?: string): { clause: string; params: QueryValue[] } {
  const trimmed = search?.trim();
  if (!trimmed) return { clause: "WHERE is_quick_exercise = FALSE", params: [] };
  return {
    clause: "WHERE is_quick_exercise = FALSE AND name ILIKE $1",
    params: [`%${trimmed}%`],
  };
}

export async function listFoods(
  userId: string,
  params: PaginationQuery & { search?: string } = {},
): Promise<PaginatedResult<Record<string, unknown>>> {
  const { limit, offset } = normalizePagination(params.limit, params.offset);
  const { clause, params: searchParams } = optionalSearch(params.search);

  return withClient(userId, async (client) => {
    const countResult = await client.query(
      `SELECT COUNT(*)::int AS count FROM foods f ${clause}`,
      searchParams,
    );

    const dataResult = await client.query(
      `SELECT f.id, f.name, f.brand, f.is_custom, f.shared_with_public, f.created_at, f.updated_at,
              COALESCE(
                json_agg(fv.* ORDER BY fv.is_default DESC, fv.created_at ASC)
                  FILTER (WHERE fv.id IS NOT NULL),
                '[]'::json
              ) AS variants
       FROM foods f
       LEFT JOIN food_variants fv ON fv.food_id = f.id
       ${clause}
       GROUP BY f.id
       ORDER BY LOWER(f.name) ASC
       LIMIT $${searchParams.length + 1} OFFSET $${searchParams.length + 2}`,
      [...searchParams, limit, offset],
    );

    return buildPaginatedResult(dataResult.rows, countResult.rows[0]?.count ?? 0, offset);
  });
}

export async function getFoodDetails(userId: string, foodId: string): Promise<Record<string, unknown>> {
  return withClient(userId, async (client) => {
    const result = await client.query(
      `SELECT f.*,
              COALESCE(
                json_agg(fv.* ORDER BY fv.is_default DESC, fv.created_at ASC)
                  FILTER (WHERE fv.id IS NOT NULL),
                '[]'::json
              ) AS variants
       FROM foods f
       LEFT JOIN food_variants fv ON fv.food_id = f.id
       WHERE f.id = $1
       GROUP BY f.id`,
      [foodId],
    );

    if (!result.rows[0]) {
      throw new Error(`Food not found: ${foodId}`);
    }

    return result.rows[0];
  });
}

export async function searchFoods(
  userId: string,
  params: PaginationQuery & { query: string },
): Promise<PaginatedResult<Record<string, unknown>>> {
  if (!params.query?.trim()) throw new Error("query is required");
  return listFoods(userId, { ...params, search: params.query });
}

export async function getDiaryRaw(userId: string, params: DateQuery = {}): Promise<Record<string, unknown>> {
  const { startDate, endDate } = dateRange(params);

  return withClient(userId, async (client) => {
    const foodEntries = await client.query(
      `SELECT fe.*, mt.name AS meal_type, f.name AS food_name_from_catalog, f.brand AS brand_from_catalog
       FROM food_entries fe
       LEFT JOIN meal_types mt ON mt.id = fe.meal_type_id
       LEFT JOIN foods f ON f.id = fe.food_id
       WHERE fe.entry_date BETWEEN $1 AND $2
       ORDER BY fe.entry_date ASC, fe.created_at ASC`,
      [startDate, endDate],
    );

    const mealEntries = await client.query(
      `SELECT fem.*, mt.name AS meal_type
       FROM food_entry_meals fem
       LEFT JOIN meal_types mt ON mt.id = fem.meal_type_id
       WHERE fem.entry_date BETWEEN $1 AND $2
       ORDER BY fem.entry_date ASC, fem.created_at ASC`,
      [startDate, endDate],
    ).catch(() => ({ rows: [] as Record<string, unknown>[] }));

    return {
      start_date: startDate,
      end_date: endDate,
      food_entries: foodEntries.rows,
      meal_entries: mealEntries.rows,
    };
  });
}

export async function getNutritionSummaryRaw(userId: string, params: DateQuery = {}): Promise<Record<string, unknown>> {
  const { startDate, endDate } = dateRange(params);

  return withClient(userId, async (client) => {
    const result = await client.query(
      `SELECT entry_date,
              SUM(COALESCE(calories, 0)) AS calories,
              SUM(COALESCE(protein, 0)) AS protein,
              SUM(COALESCE(carbs, 0)) AS carbs,
              SUM(COALESCE(fat, 0)) AS fat,
              SUM(COALESCE(dietary_fiber, 0)) AS fiber,
              SUM(COALESCE(sugars, 0)) AS sugars,
              SUM(COALESCE(sodium, 0)) AS sodium
       FROM food_entries
       WHERE entry_date BETWEEN $1 AND $2
       GROUP BY entry_date
       ORDER BY entry_date ASC`,
      [startDate, endDate],
    );

    return { start_date: startDate, end_date: endDate, rows: result.rows };
  });
}

export async function getDailyTotals(userId: string, params: DateQuery = {}): Promise<Record<string, unknown>> {
  const { startDate, endDate } = dateRange(params);

  return withClient(userId, async (client) => {
    const nutrition = await client.query(
      `SELECT entry_date,
              SUM(COALESCE(calories, 0)) AS calories,
              SUM(COALESCE(protein, 0)) AS protein,
              SUM(COALESCE(carbs, 0)) AS carbs,
              SUM(COALESCE(fat, 0)) AS fat,
              SUM(COALESCE(dietary_fiber, 0)) AS fiber
       FROM food_entries
       WHERE entry_date BETWEEN $1 AND $2
       GROUP BY entry_date
       ORDER BY entry_date ASC`,
      [startDate, endDate],
    );

    const exercise = await client.query(
      `SELECT entry_date,
              SUM(COALESCE(calories_burned, 0)) AS exercise_calories,
              SUM(COALESCE(duration_minutes, 0)) AS exercise_minutes,
              SUM(COALESCE(steps, 0)) AS steps
       FROM exercise_entries
       WHERE entry_date BETWEEN $1 AND $2
       GROUP BY entry_date
       ORDER BY entry_date ASC`,
      [startDate, endDate],
    ).catch(() => ({ rows: [] as Record<string, unknown>[] }));

    const water = await client.query(
      `SELECT entry_date, SUM(COALESCE(amount_ml, 0)) AS water_ml
       FROM water_entries
       WHERE entry_date BETWEEN $1 AND $2
       GROUP BY entry_date
       ORDER BY entry_date ASC`,
      [startDate, endDate],
    ).catch(() => ({ rows: [] as Record<string, unknown>[] }));

    return {
      start_date: startDate,
      end_date: endDate,
      nutrition: nutrition.rows,
      exercise: exercise.rows,
      water: water.rows,
    };
  });
}

export async function getGoalsRaw(userId: string): Promise<Record<string, unknown>> {
  return withClient(userId, async (client) => {
    const existingTables = await client.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])`,
      [["goals", "user_goals", "nutrition_goals", "profiles", "user_profiles"]],
    );
    const tables = existingTables.rows.map((row: any) => row.table_name);
    const result: Record<string, unknown> = {};

    for (const table of tables) {
      const rows = await client.query(`SELECT * FROM ${table} LIMIT 20`).catch(() => ({ rows: [] }));
      result[table] = rows.rows;
    }

    return result;
  });
}

export async function getRecentEntries(userId: string, params: { limit?: number } = {}): Promise<Record<string, unknown>[]> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);

  return withClient(userId, async (client) => {
    const result = await client.query(
      `SELECT fe.*, mt.name AS meal_type, f.name AS food_name_from_catalog, f.brand AS brand_from_catalog
       FROM food_entries fe
       LEFT JOIN meal_types mt ON mt.id = fe.meal_type_id
       LEFT JOIN foods f ON f.id = fe.food_id
       ORDER BY fe.entry_date DESC, fe.created_at DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows;
  });
}

export async function getFoodUsage(
  userId: string,
  foodId: string,
  params: DateQuery & PaginationQuery = {},
): Promise<PaginatedResult<Record<string, unknown>>> {
  const { startDate, endDate } = dateRange(params);
  const { limit, offset } = normalizePagination(params.limit, params.offset);

  return withClient(userId, async (client) => {
    const countResult = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM food_entries
       WHERE food_id = $1 AND entry_date BETWEEN $2 AND $3`,
      [foodId, startDate, endDate],
    );

    const dataResult = await client.query(
      `SELECT fe.*, mt.name AS meal_type
       FROM food_entries fe
       LEFT JOIN meal_types mt ON mt.id = fe.meal_type_id
       WHERE fe.food_id = $1 AND fe.entry_date BETWEEN $2 AND $3
       ORDER BY fe.entry_date DESC, fe.created_at DESC
       LIMIT $4 OFFSET $5`,
      [foodId, startDate, endDate, limit, offset],
    );

    return buildPaginatedResult(dataResult.rows, countResult.rows[0]?.count ?? 0, offset);
  });
}

export async function listExercises(
  userId: string,
  params: PaginationQuery & { search?: string } = {},
): Promise<PaginatedResult<Record<string, unknown>>> {
  const { limit, offset } = normalizePagination(params.limit, params.offset);
  const { clause, params: searchParams } = optionalExerciseSearch(params.search);

  return withClient(userId, async (client) => {
    const countResult = await client.query(
      `SELECT COUNT(*)::int AS count FROM exercises ${clause}`,
      searchParams,
    );

    const dataResult = await client.query(
      `SELECT *
       FROM exercises
       ${clause}
       ORDER BY LOWER(name) ASC
       LIMIT $${searchParams.length + 1} OFFSET $${searchParams.length + 2}`,
      [...searchParams, limit, offset],
    );

    return buildPaginatedResult(dataResult.rows, countResult.rows[0]?.count ?? 0, offset);
  });
}

export async function getExerciseDetails(userId: string, exerciseId: string): Promise<Record<string, unknown>> {
  return withClient(userId, async (client) => {
    const exercise = await client.query("SELECT * FROM exercises WHERE id = $1", [exerciseId]);
    if (!exercise.rows[0]) throw new Error(`Exercise not found: ${exerciseId}`);

    const recentEntries = await client.query(
      `SELECT * FROM exercise_entries
       WHERE exercise_id = $1
       ORDER BY entry_date DESC, created_at DESC
       LIMIT 20`,
      [exerciseId],
    ).catch(() => ({ rows: [] as Record<string, unknown>[] }));

    return { ...exercise.rows[0], recent_entries: recentEntries.rows };
  });
}

export async function searchExercises(
  userId: string,
  params: PaginationQuery & { query: string; muscle_group?: string; equipment?: string },
): Promise<PaginatedResult<Record<string, unknown>>> {
  const { limit, offset } = normalizePagination(params.limit, params.offset);

  if (!params.query?.trim()) throw new Error("query is required");

  return withClient(userId, async (client) => {
    const where: string[] = ["is_quick_exercise = FALSE", "name ILIKE $1"];
    const queryParams: QueryValue[] = [`%${params.query.trim()}%`];
    let nextParam = 2;

    if (params.muscle_group?.trim()) {
      where.push(`primary_muscles ILIKE $${nextParam}`);
      queryParams.push(`%${params.muscle_group.trim()}%`);
      nextParam += 1;
    }

    if (params.equipment?.trim()) {
      where.push(`equipment ILIKE $${nextParam}`);
      queryParams.push(`%${params.equipment.trim()}%`);
      nextParam += 1;
    }

    const whereSql = where.join(" AND ");
    const countResult = await client.query(
      `SELECT COUNT(*)::int AS count FROM exercises WHERE ${whereSql}`,
      queryParams,
    );
    const dataResult = await client.query(
      `SELECT * FROM exercises
       WHERE ${whereSql}
       ORDER BY LOWER(name) ASC
       LIMIT $${nextParam} OFFSET $${nextParam + 1}`,
      [...queryParams, limit, offset],
    );

    return buildPaginatedResult(dataResult.rows, countResult.rows[0]?.count ?? 0, offset);
  });
}

export async function getExerciseDiaryRaw(userId: string, params: DateQuery = {}): Promise<Record<string, unknown>> {
  const { startDate, endDate } = dateRange(params);

  return withClient(userId, async (client) => {
    const entries = await client.query(
      `SELECT ee.*, e.name AS exercise_name_from_catalog, e.category AS exercise_category_from_catalog
       FROM exercise_entries ee
       LEFT JOIN exercises e ON e.id = ee.exercise_id
       WHERE ee.entry_date BETWEEN $1 AND $2
       ORDER BY ee.entry_date ASC, ee.created_at ASC`,
      [startDate, endDate],
    );

    const entryIds = entries.rows.map((row: any) => row.id);
    let sets: Record<string, unknown>[] = [];
    if (entryIds.length > 0) {
      const setsResult = await client.query(
        `SELECT * FROM exercise_entry_sets
         WHERE exercise_entry_id = ANY($1)
         ORDER BY exercise_entry_id, set_number ASC`,
        [entryIds],
      ).catch(() => ({ rows: [] as Record<string, unknown>[] }));
      sets = setsResult.rows;
    }

    return { start_date: startDate, end_date: endDate, entries: entries.rows, sets };
  });
}

export async function getDailyExerciseTotals(userId: string, params: DateQuery = {}): Promise<Record<string, unknown>> {
  const { startDate, endDate } = dateRange(params);

  return withClient(userId, async (client) => {
    const result = await client.query(
      `SELECT entry_date,
              COUNT(*)::int AS entry_count,
              SUM(COALESCE(duration_minutes, 0)) AS duration_minutes,
              SUM(COALESCE(calories_burned, 0)) AS calories_burned,
              SUM(COALESCE(distance, 0)) AS distance,
              SUM(COALESCE(steps, 0)) AS steps
       FROM exercise_entries
       WHERE entry_date BETWEEN $1 AND $2
       GROUP BY entry_date
       ORDER BY entry_date ASC`,
      [startDate, endDate],
    );

    return { start_date: startDate, end_date: endDate, rows: result.rows };
  });
}

export async function getRecentExerciseEntries(userId: string, params: { limit?: number } = {}): Promise<Record<string, unknown>[]> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);

  return withClient(userId, async (client) => {
    const result = await client.query(
      `SELECT ee.*, e.name AS exercise_name_from_catalog, e.category AS exercise_category_from_catalog
       FROM exercise_entries ee
       LEFT JOIN exercises e ON e.id = ee.exercise_id
       ORDER BY ee.entry_date DESC, ee.created_at DESC
       LIMIT $1`,
      [limit],
    );

    return result.rows;
  });
}

export async function getExerciseUsage(
  userId: string,
  exerciseId: string,
  params: DateQuery & PaginationQuery = {},
): Promise<PaginatedResult<Record<string, unknown>>> {
  const { startDate, endDate } = dateRange(params);
  const { limit, offset } = normalizePagination(params.limit, params.offset);

  return withClient(userId, async (client) => {
    const countResult = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM exercise_entries
       WHERE exercise_id = $1 AND entry_date BETWEEN $2 AND $3`,
      [exerciseId, startDate, endDate],
    );
    const dataResult = await client.query(
      `SELECT * FROM exercise_entries
       WHERE exercise_id = $1 AND entry_date BETWEEN $2 AND $3
       ORDER BY entry_date DESC, created_at DESC
       LIMIT $4 OFFSET $5`,
      [exerciseId, startDate, endDate, limit, offset],
    );

    return buildPaginatedResult(dataResult.rows, countResult.rows[0]?.count ?? 0, offset);
  });
}

export async function getExerciseProgressRaw(
  userId: string,
  params: DateQuery & PaginationQuery & { exercise_id?: string; exercise_name?: string } = {},
): Promise<PaginatedResult<Record<string, unknown>>> {
  const { startDate, endDate } = dateRange(params);
  const { limit, offset } = normalizePagination(params.limit, params.offset);

  return withClient(userId, async (client) => {
    let exerciseId = params.exercise_id;
    if (!exerciseId && params.exercise_name?.trim()) {
      const exercise = await client.query(
        "SELECT id FROM exercises WHERE LOWER(name) = LOWER($1) OR name ILIKE $2 ORDER BY LOWER(name) ASC LIMIT 1",
        [params.exercise_name.trim(), `%${params.exercise_name.trim()}%`],
      );
      exerciseId = exercise.rows[0]?.id;
    }

    if (!exerciseId) {
      throw new Error("exercise_id or exercise_name is required");
    }

    const countResult = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM exercise_entries
       WHERE exercise_id = $1 AND entry_date BETWEEN $2 AND $3`,
      [exerciseId, startDate, endDate],
    );

    const entries = await client.query(
      `SELECT ee.*, e.name AS exercise_name_from_catalog
       FROM exercise_entries ee
       LEFT JOIN exercises e ON e.id = ee.exercise_id
       WHERE ee.exercise_id = $1 AND ee.entry_date BETWEEN $2 AND $3
       ORDER BY ee.entry_date ASC, ee.created_at ASC
       LIMIT $4 OFFSET $5`,
      [exerciseId, startDate, endDate, limit, offset],
    );

    const entryIds = entries.rows.map((row: any) => row.id);
    let sets: Record<string, unknown>[] = [];
    if (entryIds.length > 0) {
      const setsResult = await client.query(
        `SELECT * FROM exercise_entry_sets
         WHERE exercise_entry_id = ANY($1)
         ORDER BY exercise_entry_id, set_number ASC`,
        [entryIds],
      ).catch(() => ({ rows: [] as Record<string, unknown>[] }));
      sets = setsResult.rows;
    }

    return buildPaginatedResult(
      entries.rows.map((row: Record<string, unknown>) => ({ ...row, sets: sets.filter((s) => s.exercise_entry_id === row.id) })),
      countResult.rows[0]?.count ?? 0,
      offset,
    );
  });
}

export default {
  listFoods,
  getFoodDetails,
  searchFoods,
  getDiaryRaw,
  getNutritionSummaryRaw,
  getDailyTotals,
  getGoalsRaw,
  getRecentEntries,
  getFoodUsage,
  listExercises,
  getExerciseDetails,
  searchExercises,
  getExerciseDiaryRaw,
  getDailyExerciseTotals,
  getRecentExerciseEntries,
  getExerciseUsage,
  getExerciseProgressRaw,
};
