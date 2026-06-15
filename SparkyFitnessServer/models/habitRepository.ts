import { getClient } from '../db/poolManager.js';

// Habits are custom_categories rows with data_type = 'boolean'; completions
// are custom_measurements rows with value 'true'/'false'. Used by the chatbot
// habit tools (ai/tools/habitTools.ts).

async function listHabits(userId: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT id, name, display_name, measurement_type, frequency, data_type
       FROM custom_categories
       WHERE user_id = $1 AND data_type = 'boolean'
       ORDER BY name ASC`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function upsertHabitLog(
  userId: string,
  habitId: string,
  entryDate: string,
  value: string
) {
  const client = await getClient(userId);
  try {
    // Check if an entry exists first to avoid ON CONFLICT errors if the
    // unique constraint is missing
    const existing = await client.query(
      'SELECT id FROM custom_measurements WHERE user_id = $1 AND category_id = $2 AND entry_date = $3 LIMIT 1',
      [userId, habitId, entryDate]
    );

    if (existing.rows.length > 0) {
      await client.query(
        'UPDATE custom_measurements SET value = $1, updated_at = NOW() WHERE id = $2',
        [value, existing.rows[0].id]
      );
    } else {
      await client.query(
        `INSERT INTO custom_measurements (user_id, category_id, value, entry_date, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [userId, habitId, value, entryDate]
      );
    }
  } finally {
    client.release();
  }
}

async function getHabitHistory(
  userId: string,
  habitId: string,
  startDate?: string,
  endDate?: string
) {
  const client = await getClient(userId);
  try {
    let query = `
      SELECT id, value, entry_date, created_at
      FROM custom_measurements
      WHERE user_id = $1 AND category_id = $2
    `;
    const queryParams: unknown[] = [userId, habitId];
    let paramIdx = 3;

    if (startDate) {
      query += ` AND entry_date >= $${paramIdx}`;
      queryParams.push(startDate);
      paramIdx++;
    }
    if (endDate) {
      query += ` AND entry_date <= $${paramIdx}`;
      queryParams.push(endDate);
      paramIdx++;
    }

    query += ' ORDER BY entry_date ASC';

    const result = await client.query(query, queryParams);
    return result.rows;
  } finally {
    client.release();
  }
}

export { listHabits, upsertHabitLog, getHabitHistory };
export default { listHabits, upsertHabitLog, getHabitHistory };
