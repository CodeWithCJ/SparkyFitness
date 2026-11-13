import { getClient } from '../db/poolManager.js';

const MOOD_ENTRY_COLUMNS =
  'id, user_id, mood_value, energy_value, focus_value, mood_tags, notes, entry_date, entry_timestamp, source, created_at, updated_at';

/**
 * One mood value per day, shared by every aggregate (charts, coach, cycle
 * correlations): the average of the day's non-null manual `mood_value`s, else
 * the derived value, Garmin before import. AVG ignores NULLs, so check-ins
 * without a mood drop out rather than counting as 0. Use it with
 * GROUP BY entry_date and HAVING ... IS NOT NULL. Rounded to an integer so
 * the pg driver returns a number, not a numeric string.
 */
export const DAILY_MOOD_VALUE_SQL =
  "ROUND(COALESCE(AVG(mood_value) FILTER (WHERE source = 'manual'), MAX(mood_value) FILTER (WHERE source = 'garmin'), MAX(mood_value) FILTER (WHERE source = 'import')))::int";

export type MoodSource = 'manual' | 'garmin' | 'import';

export interface MoodEntryRow {
  id: string;
  user_id: string;
  mood_value: number | null;
  energy_value: number | null;
  focus_value: number | null;
  mood_tags: string[];
  notes: string | null;
  entry_date: string;
  entry_timestamp: Date;
  source: MoodSource;
  created_at: Date;
  updated_at: Date;
}

/** A row the legacy rule returns: always carries a mood. */
export type LegacyMoodEntryRow = MoodEntryRow & { mood_value: number };

export interface MoodRatingsInput {
  energyValue?: number | null;
  focusValue?: number | null;
}

export interface MoodCheckinInput {
  moodValue?: number | null;
  notes?: string | null;
  moodTags?: string[] | null;
  energyValue?: number | null;
  focusValue?: number | null;
  entryDate: string;
  entryTimestamp?: string | Date;
}

// Absent keeps the stored value; an explicit null clears it. entryTimestamp is
// NOT NULL in the table, so it cannot be cleared.
export interface MoodEntryPatch {
  moodValue?: number | null;
  notes?: string | null;
  moodTags?: string[] | null;
  energyValue?: number | null;
  focusValue?: number | null;
  entryTimestamp?: string | Date;
  // Moving a check-in to another time moves its day too; never null.
  entryDate?: string;
}

// Mirrors the mood_entries_has_content CHECK constraint: whitespace-only notes
// and blank tags are not content.
export function hasMoodContent(
  input: Pick<
    MoodCheckinInput,
    'moodValue' | 'notes' | 'moodTags' | 'energyValue' | 'focusValue'
  >
): boolean {
  return (
    (input.moodValue ?? null) !== null ||
    (input.energyValue ?? null) !== null ||
    (input.focusValue ?? null) !== null ||
    /\S/.test(input.notes ?? '') ||
    (input.moodTags ?? []).some((tag) => /\S/.test(tag))
  );
}

// A rating is "provided" when the key is present, even if null (null clears it).
function ratingParams(ratings: MoodRatingsInput) {
  return {
    energy: ratings.energyValue ?? null,
    energyProvided: ratings.energyValue !== undefined,
    focus: ratings.focusValue ?? null,
    focusProvided: ratings.focusValue !== undefined,
  };
}

/** Always inserts a new manual check-in. */
async function createCheckin(
  userId: string,
  input: MoodCheckinInput
): Promise<MoodEntryRow> {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `INSERT INTO mood_entries
         (user_id, mood_value, mood_tags, notes, entry_date, energy_value, focus_value, entry_timestamp, source)
       VALUES ($1, $2, COALESCE($3::text[], '{}'), $4, $5, $6::smallint, $7::smallint, COALESCE($8::timestamptz, now()), 'manual')
       RETURNING ${MOOD_ENTRY_COLUMNS}`,
      [
        userId,
        input.moodValue ?? null,
        input.moodTags ?? null,
        input.notes ?? null,
        input.entryDate,
        input.energyValue ?? null,
        input.focusValue ?? null,
        input.entryTimestamp ?? null,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

/** One derived mood per (user, day, source); a re-sync updates it in place. */
async function upsertDerivedMood(
  userId: string,
  source: Exclude<MoodSource, 'manual'>,
  input: MoodCheckinInput & { moodValue: number }
): Promise<MoodEntryRow> {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `INSERT INTO mood_entries
         (user_id, mood_value, mood_tags, notes, entry_date, entry_timestamp, source)
       VALUES ($1, $2, COALESCE($3::text[], '{}'), $4, $5, COALESCE($6::timestamptz, now()), $7)
       ON CONFLICT (user_id, entry_date, source) WHERE source <> 'manual' DO UPDATE
       SET mood_value = EXCLUDED.mood_value,
           mood_tags = EXCLUDED.mood_tags,
           notes = EXCLUDED.notes,
           entry_timestamp = EXCLUDED.entry_timestamp,
           updated_at = NOW()
       RETURNING ${MOOD_ENTRY_COLUMNS}`,
      [
        userId,
        input.moodValue,
        input.moodTags ?? null,
        input.notes ?? null,
        input.entryDate,
        input.entryTimestamp ?? null,
        source,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * The legacy (one-per-day) row: the newest manual row with a mood, else the
 * day's derived row, Garmin before import (as in DAILY_MOOD_VALUE_SQL).
 */
async function getLegacyMoodEntryForDate(
  userId: string,
  entryDate: string
): Promise<LegacyMoodEntryRow | undefined> {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT ${MOOD_ENTRY_COLUMNS}
       FROM mood_entries
       WHERE user_id = $1 AND entry_date = $2 AND mood_value IS NOT NULL
       ORDER BY (source = 'manual') DESC, (source = 'garmin') DESC, entry_timestamp DESC, created_at DESC
       LIMIT 1`,
      [userId, entryDate]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

/** One legacy row per day (same rule as getLegacyMoodEntryForDate), newest day first. */
async function getLegacyMoodEntriesInRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<LegacyMoodEntryRow[]> {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT DISTINCT ON (entry_date) ${MOOD_ENTRY_COLUMNS}
       FROM mood_entries
       WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3 AND mood_value IS NOT NULL
       ORDER BY entry_date DESC, (source = 'manual') DESC, (source = 'garmin') DESC, entry_timestamp DESC, created_at DESC`,
      [userId, startDate, endDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Legacy save: update the day's latest manual row that has a mood, else insert
 * a manual row. Never touches derived rows. Ratings keep (absent) or clear (null).
 */
async function upsertLegacyMoodEntry(
  userId: string,
  input: MoodCheckinInput & { moodValue: number }
): Promise<LegacyMoodEntryRow> {
  const client = await getClient(userId); // User-specific operation
  try {
    const existing = await client.query(
      `SELECT id FROM mood_entries
       WHERE user_id = $1 AND entry_date = $2 AND source = 'manual' AND mood_value IS NOT NULL
       ORDER BY entry_timestamp DESC, created_at DESC
       LIMIT 1`,
      [userId, input.entryDate]
    );
    const r = ratingParams(input);
    if (existing.rows[0]) {
      const result = await client.query(
        `UPDATE mood_entries
         SET mood_value = $3,
             mood_tags = COALESCE($4::text[], mood_tags),
             notes = COALESCE($5, notes),
             energy_value = CASE WHEN $7 THEN $6::smallint ELSE energy_value END,
             focus_value = CASE WHEN $9 THEN $8::smallint ELSE focus_value END,
             updated_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING ${MOOD_ENTRY_COLUMNS}`,
        [
          existing.rows[0].id,
          userId,
          input.moodValue,
          input.moodTags ?? null,
          input.notes ?? null,
          r.energy,
          r.energyProvided,
          r.focus,
          r.focusProvided,
        ]
      );
      return result.rows[0];
    }
    const result = await client.query(
      `INSERT INTO mood_entries
         (user_id, mood_value, mood_tags, notes, entry_date, energy_value, focus_value, entry_timestamp, source)
       VALUES ($1, $2, COALESCE($3::text[], '{}'), $4, $5, $6::smallint, $7::smallint, COALESCE($8::timestamptz, now()), 'manual')
       RETURNING ${MOOD_ENTRY_COLUMNS}`,
      [
        userId,
        input.moodValue,
        input.moodTags ?? null,
        input.notes ?? null,
        input.entryDate,
        r.energy,
        r.focus,
        input.entryTimestamp ?? null,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

/** The day's manual check-ins in time order. */
async function getCheckinsForDate(
  userId: string,
  entryDate: string
): Promise<MoodEntryRow[]> {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT ${MOOD_ENTRY_COLUMNS}
       FROM mood_entries
       WHERE user_id = $1 AND entry_date = $2 AND source = 'manual'
       ORDER BY entry_timestamp ASC, created_at ASC`,
      [userId, entryDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

/** Whether the user already has a manual check-in stamped at this instant. */
async function hasManualCheckinAt(
  userId: string,
  entryTimestamp: string | Date
): Promise<boolean> {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT 1 FROM mood_entries
       WHERE user_id = $1 AND source = 'manual' AND entry_timestamp = $2::timestamptz
       LIMIT 1`,
      [userId, entryTimestamp]
    );
    return result.rows.length > 0;
  } finally {
    client.release();
  }
}

async function getMoodEntriesByUserId(
  userId: string,
  startDate: string,
  endDate: string
): Promise<MoodEntryRow[]> {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT ${MOOD_ENTRY_COLUMNS}
       FROM mood_entries
       WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3
       ORDER BY entry_date DESC, entry_timestamp DESC, created_at DESC`,
      [userId, startDate, endDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function getMoodEntryById(
  moodEntryId: string,
  userId: string
): Promise<MoodEntryRow | undefined> {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT ${MOOD_ENTRY_COLUMNS}
       FROM mood_entries
       WHERE id = $1 AND user_id = $2`,
      [moodEntryId, userId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Patches one check-in. Per field, absent keeps the stored value and null
 * clears it. A patch that empties the row raises the has_content CHECK
 * (23514); callers map that to a 400.
 */
async function updateMoodEntryFields(
  moodEntryId: string,
  userId: string,
  patch: MoodEntryPatch
): Promise<MoodEntryRow | undefined> {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `UPDATE mood_entries
       SET mood_value = CASE WHEN $3 THEN $4::integer ELSE mood_value END,
           notes = CASE WHEN $5 THEN $6::text ELSE notes END,
           mood_tags = CASE WHEN $7 THEN COALESCE($8::text[], '{}') ELSE mood_tags END,
           energy_value = CASE WHEN $9 THEN $10::smallint ELSE energy_value END,
           focus_value = CASE WHEN $11 THEN $12::smallint ELSE focus_value END,
           entry_timestamp = CASE WHEN $13 THEN $14::timestamptz ELSE entry_timestamp END,
           entry_date = CASE WHEN $15 THEN $16::date ELSE entry_date END,
           updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING ${MOOD_ENTRY_COLUMNS}`,
      [
        moodEntryId,
        userId,
        patch.moodValue !== undefined,
        patch.moodValue ?? null,
        patch.notes !== undefined,
        patch.notes ?? null,
        patch.moodTags !== undefined,
        patch.moodTags ?? null,
        patch.energyValue !== undefined,
        patch.energyValue ?? null,
        patch.focusValue !== undefined,
        patch.focusValue ?? null,
        patch.entryTimestamp !== undefined,
        patch.entryTimestamp ?? null,
        patch.entryDate !== undefined,
        patch.entryDate ?? null,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function deleteMoodEntry(moodEntryId: string, userId: string) {
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

export {
  createCheckin,
  hasManualCheckinAt,
  upsertDerivedMood,
  getLegacyMoodEntryForDate,
  getLegacyMoodEntriesInRange,
  upsertLegacyMoodEntry,
  getCheckinsForDate,
  updateMoodEntryFields,
  getMoodEntriesByUserId,
  getMoodEntryById,
  deleteMoodEntry,
  listCustomMoods,
  createCustomMood,
  deleteCustomMood,
  getMoodDisplayPreferences,
  upsertMoodDisplayPreferences,
};
export default {
  createCheckin,
  hasManualCheckinAt,
  upsertDerivedMood,
  getLegacyMoodEntryForDate,
  getLegacyMoodEntriesInRange,
  upsertLegacyMoodEntry,
  getCheckinsForDate,
  updateMoodEntryFields,
  getMoodEntriesByUserId,
  getMoodEntryById,
  deleteMoodEntry,
  listCustomMoods,
  createCustomMood,
  deleteCustomMood,
  getMoodDisplayPreferences,
  upsertMoodDisplayPreferences,
};
