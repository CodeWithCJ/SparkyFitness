import { getClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';

async function createOrUpdateMoodEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  moodValue: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  notes: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryDate: any,
  moodTags: string[] | null = null
) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `INSERT INTO mood_entries (user_id, mood_value, mood_tags, notes, entry_date)
       VALUES ($1, $2, COALESCE($3::text[], '{}'), $4, $5)
       ON CONFLICT (user_id, entry_date) DO UPDATE
       SET mood_value = EXCLUDED.mood_value,
           mood_tags = COALESCE($3::text[], mood_entries.mood_tags),
           notes = EXCLUDED.notes,
           updated_at = NOW()
       RETURNING id, user_id, mood_value, mood_tags, notes, entry_date, created_at, updated_at`,
      [userId, moodValue, moodTags, notes, entryDate]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getMoodEntriesByUserId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any
) {
  const client = await getClient(userId); // User-specific operation
  try {
    // Log the parameters received by getMoodEntriesByUserId
    console.log('moodRepository: getMoodEntriesByUserId - Parameters:', {
      userId,
      startDate,
      endDate,
    });
    const result = await client.query(
      `SELECT id, user_id, mood_value, mood_tags, notes, entry_date, created_at, updated_at
       FROM mood_entries
       WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3
       ORDER BY entry_date DESC, created_at DESC`,
      [userId, startDate, endDate]
    );
    // Log the result.rows obtained from the SQL query
    console.log(
      'moodRepository: getMoodEntriesByUserId - Query Result Rows:',
      result.rows
    );
    return result.rows;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMoodEntryById(moodEntryId: any, userId: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT id, user_id, mood_value, mood_tags, notes, entry_date, created_at, updated_at
       FROM mood_entries
       WHERE id = $1 AND user_id = $2`,
      [moodEntryId, userId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function updateMoodEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  moodEntryId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  moodValue: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  notes: any,
  moodTags: string[] | null = null
) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `UPDATE mood_entries
       SET mood_value = COALESCE($3, mood_value),
           notes = COALESCE($4, notes),
           mood_tags = COALESCE($5::text[], mood_tags),
           updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id, user_id, mood_value, mood_tags, notes, entry_date, created_at, updated_at`,
      [moodEntryId, userId, moodValue, notes, moodTags]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteMoodEntry(moodEntryId: any, userId: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'DELETE FROM mood_entries WHERE id = $1 AND user_id = $2 RETURNING id',
      [moodEntryId, userId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMoodEntryByDate(userId: any, entryDate: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    log('debug', `Fetching mood entry for user ${userId} on date ${entryDate}`);
    const result = await client.query(
      `SELECT id, user_id, mood_value, mood_tags, notes, entry_date, created_at, updated_at
       FROM mood_entries
       WHERE user_id = $1 AND entry_date = $2`,
      [userId, entryDate]
    );
    if (result.rows[0]) {
      log('debug', 'Found mood entry:', result.rows[0]);
    } else {
      log(
        'debug',
        `No mood entry found for user ${userId} on date ${entryDate}`
      );
    }
    log('debug', 'Returning from getMoodEntryByDate:', result.rows[0]);
    return result.rows[0];
  } catch (error) {
    log(
      'error',
      `Error fetching mood entry for user ${userId} on date ${entryDate}:`,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}
// --- Custom moods (user-defined mood tags; mirrors user_custom_symptoms) -----

const CUSTOM_MOOD_COLS = 'id, user_id, name, display_name, icon, color';

async function listCustomMoods(userId: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ${CUSTOM_MOOD_COLS} FROM user_custom_moods
       WHERE user_id = $1 ORDER BY name ASC`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function createCustomMood(
  userId: string,
  data: {
    name: string;
    display_name?: string | null;
    icon?: string | null;
    color?: string | null;
  }
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `INSERT INTO user_custom_moods (user_id, name, display_name, icon, color)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, name) DO UPDATE
       SET display_name = EXCLUDED.display_name,
           icon = EXCLUDED.icon,
           color = EXCLUDED.color,
           updated_at = NOW()
       RETURNING ${CUSTOM_MOOD_COLS}`,
      [
        userId,
        data.name.toLowerCase().trim(),
        data.display_name ?? null,
        data.icon ?? null,
        data.color ?? null,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function deleteCustomMood(
  userId: string,
  id: string,
  deleteAllHistory = false
): Promise<boolean> {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    const found = await client.query(
      'SELECT name FROM user_custom_moods WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (found.rowCount === 0) {
      await client.query('ROLLBACK');
      return false;
    }
    // Optionally strip this mood tag from all past mood_entries.
    if (deleteAllHistory) {
      await client.query(
        `UPDATE mood_entries
         SET mood_tags = array_remove(mood_tags, $2), updated_at = NOW()
         WHERE user_id = $1 AND $2 = ANY(mood_tags)`,
        [userId, found.rows[0].name]
      );
    }
    await client.query(
      'DELETE FROM user_custom_moods WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// --- Mood display preferences (show/hide config for the picker) --------------

async function getMoodDisplayPreferences(userId: string, platform = 'web') {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT hidden_moods FROM user_mood_display_preferences
       WHERE user_id = $1 AND platform = $2`,
      [userId, platform]
    );
    return { hidden_moods: result.rows[0]?.hidden_moods ?? [] };
  } finally {
    client.release();
  }
}

async function upsertMoodDisplayPreferences(
  userId: string,
  hiddenMoods: string[],
  platform = 'web'
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `INSERT INTO user_mood_display_preferences (user_id, platform, hidden_moods)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, platform) DO UPDATE
       SET hidden_moods = EXCLUDED.hidden_moods, updated_at = NOW()
       RETURNING hidden_moods`,
      [userId, platform, hiddenMoods]
    );
    return { hidden_moods: result.rows[0]?.hidden_moods ?? [] };
  } finally {
    client.release();
  }
}

export { createOrUpdateMoodEntry };
export { getMoodEntriesByUserId };
export { getMoodEntryById };
export { updateMoodEntry };
export { deleteMoodEntry };
export { getMoodEntryByDate };
export { listCustomMoods, createCustomMood, deleteCustomMood };
export { getMoodDisplayPreferences, upsertMoodDisplayPreferences };
export default {
  createOrUpdateMoodEntry,
  getMoodEntriesByUserId,
  getMoodEntryById,
  updateMoodEntry,
  deleteMoodEntry,
  getMoodEntryByDate,
  listCustomMoods,
  createCustomMood,
  deleteCustomMood,
  getMoodDisplayPreferences,
  upsertMoodDisplayPreferences,
};
