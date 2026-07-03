import { withClient } from "../db/context.js";

export async function listHabits(userId: string): Promise<Record<string, unknown>[]> {
  return withClient(userId, async (client) => {
    const result = await client.query(
      `SELECT id, name, display_name, measurement_type, frequency, data_type
       FROM custom_categories
       WHERE user_id = $1 AND data_type = 'boolean'
       ORDER BY name ASC`,
      [userId]
    );
    return result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      display_name: row.display_name,
      measurement_type: row.measurement_type,
      frequency: row.frequency,
      data_type: row.data_type,
    }));
  });
}

export async function logHabit(
  userId: string,
  params: { habit_id: string; entry_date: string; completed: boolean }
): Promise<void> {
  return withClient(userId, async (client) => {
    // Check if entry exists first to avoid ON CONFLICT errors if the unique constraint is missing
    const existing = await client.query(
      `SELECT id FROM custom_measurements WHERE user_id = $1 AND category_id = $2 AND entry_date = $3 LIMIT 1`,
      [userId, params.habit_id, params.entry_date]
    );

    if (existing.rows.length > 0) {
      await client.query(
        `UPDATE custom_measurements SET value = $1, updated_at = NOW() WHERE id = $2`,
        [params.completed ? "true" : "false", existing.rows[0].id]
      );
    } else {
      await client.query(
        `INSERT INTO custom_measurements (user_id, category_id, value, entry_date, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [userId, params.habit_id, params.completed ? "true" : "false", params.entry_date]
      );
    }
  });
}

export async function getHabitHistory(
  userId: string,
  params: { habit_id: string; start_date?: string; end_date?: string }
): Promise<Record<string, unknown>[]> {
  return withClient(userId, async (client) => {
    let query = `
      SELECT id, value, entry_date, created_at
      FROM custom_measurements
      WHERE user_id = $1 AND category_id = $2
    `;
    const queryParams: unknown[] = [userId, params.habit_id];
    let paramIdx = 3;

    if (params.start_date) {
      query += ` AND entry_date >= $${paramIdx}`;
      queryParams.push(params.start_date);
      paramIdx++;
    }
    if (params.end_date) {
      query += ` AND entry_date <= $${paramIdx}`;
      queryParams.push(params.end_date);
      paramIdx++;
    }

    query += ` ORDER BY entry_date ASC`;

    const result = await client.query(query, queryParams);
    return result.rows.map((row: any) => ({
      id: row.id,
      completed: row.value === "true",
      entry_date: row.entry_date,
      created_at: row.created_at,
    }));
  });
}
