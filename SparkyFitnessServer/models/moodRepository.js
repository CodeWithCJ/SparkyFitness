const { getClient } = require('../db/poolManager');

async function createOrUpdateMoodEntry(userId, moodValue, notes, entryDate) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `INSERT INTO mood_entries (user_id, mood_value, notes, entry_date)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, entry_date) DO UPDATE
       SET mood_value = EXCLUDED.mood_value,
           notes = EXCLUDED.notes,
           updated_at = NOW()
       RETURNING id, user_id, mood_value, notes, entry_date, created_at, updated_at`,
       [userId, moodValue, notes, entryDate]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getMoodEntriesByUserId(userId, startDate, endDate) {
  const client = await getClient(userId); // User-specific operation
  try {
    // Log the parameters received by getMoodEntriesByUserId
    console.log('moodRepository: getMoodEntriesByUserId - Parameters:', { userId, startDate, endDate });
    const result = await client.query(
      `SELECT id, user_id, mood_value, notes, entry_date, created_at, updated_at
       FROM mood_entries
       WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3
       ORDER BY entry_date DESC, created_at DESC`,
      [userId, startDate, endDate]
    );
    // Log the result.rows obtained from the SQL query
    console.log('moodRepository: getMoodEntriesByUserId - Query Result Rows:', result.rows);
    return result.rows;
  } finally {
    client.release();
  }
}

async function getMoodEntryById(moodEntryId, userId) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT id, user_id, mood_value, notes, entry_date, created_at, updated_at
       FROM mood_entries
       WHERE id = $1 AND user_id = $2`,
      [moodEntryId, userId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function updateMoodEntry(moodEntryId, userId, moodValue, notes) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `UPDATE mood_entries
       SET mood_value = COALESCE($3, mood_value),
           notes = COALESCE($4, notes),
           updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id, user_id, mood_value, notes, entry_date, created_at, updated_at`,
      [moodEntryId, userId, moodValue, notes]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function deleteMoodEntry(moodEntryId, userId) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `DELETE FROM mood_entries WHERE id = $1 AND user_id = $2 RETURNING id`,
      [moodEntryId, userId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

const { log } = require('../config/logging');

async function getMoodEntryByDate(userId, entryDate) {
  const client = await getClient(userId); // User-specific operation
  try {
    log('debug', `Fetching mood entry for user ${userId} on date ${entryDate}`);
    const result = await client.query(
      `SELECT id, user_id, mood_value, notes, entry_date, created_at, updated_at
       FROM mood_entries
       WHERE user_id = $1 AND entry_date = $2`,
       [userId, entryDate]
    );
    if (result.rows[0]) {
      log('debug', `Found mood entry:`, result.rows[0]);
    } else {
      log('debug', `No mood entry found for user ${userId} on date ${entryDate}`);
    }
    log('debug', `Returning from getMoodEntryByDate:`, result.rows[0]);
    return result.rows[0];
  } catch (error) {
    log('error', `Error fetching mood entry for user ${userId} on date ${entryDate}:`, error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createOrUpdateMoodEntry,
  getMoodEntriesByUserId,
  getMoodEntryById,
  updateMoodEntry,
  deleteMoodEntry,
  getMoodEntryByDate,
};