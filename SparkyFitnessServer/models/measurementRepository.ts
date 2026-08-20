import { getClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'pg-f... Remove this comment to see the full error message
import format from 'pg-format';
import {
  resolveBackgroundStepCalories,
  isDayString,
  isValidTimeZone,
  todayInZone,
} from '@workspace/shared';

/**
 * Helper to derive a default UTC entry_timestamp ISO string when omitted or invalid.
 * Avoids timezone jump issues by leveraging isDayString and Date.UTC date construction.
 * Compares entryDate with todayInZone(userTimezone) to detect if logging for the user's current day.
 */
function defaultEntryTimestamp(
  entryTimestamp: string | null | undefined,
  entryDate: string | null | undefined,
  entryHour: number | null | undefined,
  userTimezone?: string | null
): string {
  if (entryTimestamp && entryTimestamp.trim() !== '') {
    return entryTimestamp;
  }
  if (entryDate && isDayString(entryDate)) {
    const parts = entryDate.split('-');
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);

    if (
      entryHour !== null &&
      entryHour !== undefined &&
      !isNaN(Number(entryHour))
    ) {
      return new Date(
        Date.UTC(year, month - 1, day, Number(entryHour), 0, 0, 0)
      ).toISOString();
    }

    const now = new Date();
    const tz =
      userTimezone && isValidTimeZone(userTimezone) ? userTimezone : 'UTC';
    const currentDayInZone = todayInZone(tz);
    if (entryDate === currentDayInZone) {
      return now.toISOString();
    }

    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0)).toISOString();
  }

  return new Date().toISOString();
}
// SECURITY: Whitelist allowed measurement columns to prevent SQL injection via dynamic keys
const ALLOWED_CHECK_IN_COLUMNS = [
  'weight',
  'neck',
  'waist',
  'hips',
  'steps',
  'height',
  'body_fat_percentage',
  'muscle_mass_kg',
  'bone_mass_kg',
  'body_water_percentage',
];
// Column types for the batch-UPDATE unnest casts in bulkUpsertCheckInMeasurements.
const CHECK_IN_COLUMN_TYPES: Record<string, string> = {
  weight: 'numeric',
  neck: 'numeric',
  waist: 'numeric',
  hips: 'numeric',
  steps: 'integer',
  height: 'numeric',
  body_fat_percentage: 'numeric',
  muscle_mass_kg: 'numeric',
  bone_mass_kg: 'numeric',
  body_water_percentage: 'numeric',
};
// Tolerance in milliliters for matching historical manual records with incoming sync data
const WATER_ADOPTION_TOLERANCE_ML = 5;

async function upsertStepData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  date: any
) {
  const client = await getClient(actingUserId); // User-specific operation, using actingUserId for RLS context
  try {
    const existingRecord = await client.query(
      'SELECT * FROM check_in_measurements WHERE user_id = $1 AND entry_date = $2',
      [userId, date]
    );
    let result;
    if (existingRecord.rows.length > 0) {
      // Max-wins per day: an automated sync (device or provider) reports a
      // day's running step total, and reads can arrive out of order (a partial
      // early-day read, late-propagating records, cross-source dedup). GREATEST
      // keeps the largest total seen so a smaller/partial read never clobbers a
      // complete day. Manual user edits go through upsertCheckInMeasurements,
      // which overwrites, so a deliberate correction is still possible.
      const updateResult = await client.query(
        'UPDATE check_in_measurements SET steps = GREATEST($1::integer, steps), updated_at = now(), updated_by_user_id = $2 WHERE entry_date = $3 AND user_id = $4 RETURNING *',
        [value, actingUserId, date, userId]
      );
      result = updateResult.rows[0];
    } else {
      const insertResult = await client.query(
        'INSERT INTO check_in_measurements (user_id, entry_date, steps, created_by_user_id, updated_by_user_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $4, now(), now()) RETURNING *',
        [userId, date, value, actingUserId]
      );
      result = insertResult.rows[0];
    }
    return result;
  } finally {
    client.release();
  }
}
async function upsertWaterData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  waterMl: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  date: any,
  source = 'manual'
) {
  const client = await getClient(actingUserId);
  try {
    // 1. SMART ADOPTION: If this is a sync (non-manual), check for a matching 'manual' record to "adopt"
    // This handles historical sync data that was moved to 'manual' during migration.
    if (source !== 'manual') {
      const existingSourceRecord = await client.query(
        'SELECT id FROM water_intake WHERE user_id = $1 AND entry_date = $2 AND source = $3',
        [userId, date, source]
      );
      if (existingSourceRecord.rows.length === 0) {
        // SMART ADOPTION: Look for a manual record within a tolerance (handles rounding differences)
        const matchingManualRecord = await client.query(
          `SELECT id, water_ml FROM water_intake 
           WHERE user_id = $1 AND entry_date = $2 AND source = 'manual' 
           AND water_ml BETWEEN $3::numeric - $4::numeric AND $3::numeric + $4::numeric
           LIMIT 1`,
          [userId, date, waterMl, WATER_ADOPTION_TOLERANCE_ML]
        );
        if (matchingManualRecord.rows.length > 0) {
          log(
            'info',
            `Adopting manual water record ${matchingManualRecord.rows[0].id} for source '${source}'. (Existing: ${matchingManualRecord.rows[0].water_ml}ml, Sync: ${waterMl}ml)`
          );
          const convertResult = await client.query(
            `UPDATE water_intake SET 
              source = $1, 
              water_ml = $2, -- Update to the sync provider's precise value
              updated_at = now(), 
              updated_by_user_id = $3 
            WHERE id = $4 
            RETURNING *`,
            [source, waterMl, actingUserId, matchingManualRecord.rows[0].id]
          );
          return convertResult.rows[0];
        }
      }
    }
    // 2. Standard atomic upsert by source
    const query = `
      INSERT INTO water_intake (user_id, entry_date, water_ml, source, created_by_user_id, updated_by_user_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $5, now(), now())
      ON CONFLICT (user_id, entry_date, source)
      DO UPDATE SET 
        water_ml = $3,
        updated_at = now(),
        updated_by_user_id = $5
      RETURNING *`;
    const values = [userId, date, waterMl, source, actingUserId];
    const result = await client.query(query, values);
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function incrementWaterData(
  userId: string,
  actingUserId: string,
  waterMl: number,
  date: string,
  source = 'manual'
) {
  const client = await getClient(actingUserId);
  try {
    const query = `
      INSERT INTO water_intake (user_id, entry_date, water_ml, source, created_by_user_id, updated_by_user_id, created_at, updated_at)
      VALUES ($1, $2, GREATEST(0::numeric, $3::numeric), $4, $5, $5, now(), now())
      ON CONFLICT (user_id, entry_date, source)
      DO UPDATE SET
        water_ml = GREATEST(0::numeric, water_intake.water_ml + $3::numeric),
        updated_at = now(),
        updated_by_user_id = $5
      RETURNING *`;
    const values = [userId, date, waterMl, source, actingUserId];
    const result = await client.query(query, values);
    return result.rows[0];
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWaterIntakeByDate(userId: any, date: any, source = null) {
  const client = await getClient(userId);
  try {
    let query;
    let values;
    if (source) {
      query =
        'SELECT * FROM water_intake WHERE user_id = $1 AND entry_date = $2 AND source = $3';
      values = [userId, date, source];
    } else {
      // Sum all sources for the day. `manual_ml` is broken out separately
      // because only manually logged water can be decremented from the diary
      // "-" control (synced provider rows are owned by their provider), so the
      // UI needs the manual subtotal to know whether that control does anything.
      query = `SELECT COALESCE(SUM(water_ml), 0) as water_ml,
                      COALESCE(SUM(water_ml) FILTER (WHERE source = 'manual'), 0) as manual_ml
               FROM water_intake WHERE user_id = $1 AND entry_date = $2`;
      values = [userId, date];
    }
    const result = await client.query(query, values);
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getWaterIntakesByDates(userId: string, dates: string[]) {
  const client = await getClient(userId);
  try {
    const query =
      'SELECT entry_date, SUM(water_ml) as water_ml FROM water_intake WHERE user_id = $1 AND entry_date = ANY($2::date[]) GROUP BY entry_date';
    const values = [userId, dates];
    const result = await client.query(query, values);
    return result.rows;
  } finally {
    client.release();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWaterIntakeEntryById(id: any, userId: any) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'SELECT * FROM water_intake WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWaterIntakeEntryOwnerId(id: any, userId: any) {
  const client = await getClient(userId);
  try {
    const entryResult = await client.query(
      'SELECT user_id FROM water_intake WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return entryResult.rows[0]?.user_id;
  } finally {
    client.release();
  }
}

async function updateWaterIntake(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  id: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateData: any
) {
  const client = await getClient(actingUserId);
  try {
    const result = await client.query(
      `UPDATE water_intake SET
        water_ml = COALESCE($1, water_ml),
        entry_date = COALESCE($2, entry_date),
        source = COALESCE($3, source),
        updated_at = now(),
        updated_by_user_id = $4
      WHERE id = $5 AND user_id = $6
      RETURNING *`,
      [
        updateData.water_ml,
        updateData.entry_date,
        updateData.source,
        actingUserId,
        id,
        userId,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteWaterIntake(id: any, userId: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'DELETE FROM water_intake WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}
async function upsertCheckInMeasurements(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  measurements: any
) {
  console.log('Incoming measurements:', measurements);
  const client = await getClient(actingUserId); // User-specific operation, using actingUserId for RLS context
  try {
    let query;
    let values;
    // Filter out 'id' from measurements to prevent it from being upserted into numeric columns
    const filteredMeasurements = { ...measurements };
    delete filteredMeasurements.id;
    // SECURITY: Whitelist allowed measurement columns to prevent SQL injection via dynamic keys
    const measurementKeys = Object.keys(filteredMeasurements).filter((key) => {
      if (!ALLOWED_CHECK_IN_COLUMNS.includes(key)) {
        console.warn(
          `Attempted to upsert unauthorized measurement key: ${key}`
        );
        return false;
      }
      return true;
    });
    if (measurementKeys.length === 0) {
      // If no measurements are provided, and no existing record, there's nothing to do.
      // If there's an existing record, we don't update it if no new measurements are provided.
      return null; // Return null if no measurements to update/insert
    }
    const existingRecord = await client.query(
      'SELECT * FROM check_in_measurements WHERE user_id = $1 AND entry_date = $2',
      [userId, entryDate]
    );
    if (existingRecord.rows.length > 0) {
      const id = existingRecord.rows[0].id;
      const fields = measurementKeys
        .map((key, index) => `${key} = $${index + 1}`)
        .join(', ');
      // Add updated_by_user_id to update query
      query = `UPDATE check_in_measurements SET ${fields}, updated_at = now(), updated_by_user_id = $${measurementKeys.length + 1} WHERE id = $${measurementKeys.length + 2} RETURNING *`;
      values = [
        ...measurementKeys.map((key) => filteredMeasurements[key]),
        actingUserId,
        id,
      ];
    } else {
      // Add updated_by_user_id to insert query
      const cols = [
        'user_id',
        'entry_date',
        ...measurementKeys,
        'created_by_user_id',
        'updated_by_user_id',
        'created_at',
        'updated_at',
      ];
      const placeholders = cols.map((_, index) => `$${index + 1}`).join(', ');
      values = [
        userId,
        entryDate,
        ...measurementKeys.map((key) => filteredMeasurements[key]),
        actingUserId,
        actingUserId,
        new Date().toISOString(),
        new Date().toISOString(),
      ];
      query = `INSERT INTO check_in_measurements (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    }
    const result = await client.query(query, values);
    return result.rows[0];
  } finally {
    client.release();
  }
}
/**
 * Batch counterpart of upsertCheckInMeasurements/upsertStepData for health-data
 * ingestion: one client + one transaction for the whole batch instead of one
 * client per record. Same-date measurement objects are merged with
 * later-entry-wins-per-column semantics, matching the net effect of today's
 * sequential per-record upserts. Identity handling mirrors the per-record
 * functions: getClient(actingUserId) for RLS context, rows target userId, and
 * actingUserId stamps the audit columns.
 *
 * Returns the written DB row for each input entry (same-date entries share
 * their merged row; entries with no allowed columns get null, matching
 * upsertCheckInMeasurements).
 */
async function bulkUpsertCheckInMeasurements(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entries: Array<{ entryDate: string; measurements: any }>
) {
  if (!entries || entries.length === 0) {
    return [];
  }
  const client = await getClient(actingUserId); // User-specific operation, using actingUserId for RLS context
  try {
    await client.query('BEGIN');
    // Merge measurements per date (later record wins per column), whitelisting
    // columns exactly as upsertCheckInMeasurements does.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mergedByDate = new Map<string, Record<string, any>>();
    for (const { entryDate, measurements } of entries) {
      const filteredMeasurements = { ...measurements };
      delete filteredMeasurements.id;
      const merged = mergedByDate.get(entryDate) ?? {};
      for (const key of Object.keys(filteredMeasurements)) {
        if (!ALLOWED_CHECK_IN_COLUMNS.includes(key)) {
          console.warn(
            `Attempted to upsert unauthorized measurement key: ${key}`
          );
          continue;
        }
        merged[key] = filteredMeasurements[key];
      }
      mergedByDate.set(entryDate, merged);
    }
    const writableDates = [...mergedByDate.keys()].filter(
      (date) => Object.keys(mergedByDate.get(date)!).length > 0
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writtenByDate = new Map<string, any>();
    if (writableDates.length > 0) {
      const existing = await client.query(
        'SELECT * FROM check_in_measurements WHERE user_id = $1 AND entry_date = ANY($2::date[])',
        [userId, writableDates]
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingByDate = new Map<string, any>(
        // entry_date comes back as a YYYY-MM-DD string (poolManager DATE parser)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        existing.rows.map((row: any) => [String(row.entry_date), row])
      );
      const updateDates = writableDates.filter((date) =>
        existingByDate.has(date)
      );
      const insertDates = writableDates.filter(
        (date) => !existingByDate.has(date)
      );
      if (updateDates.length > 0) {
        // Batch UPDATE via unnest: only columns present in the batch are
        // touched; COALESCE keeps a row's other columns intact (measurement
        // values are validated numbers, never null, so COALESCE is exact).
        // steps is the exception — it is max-wins per day so a smaller/partial
        // sync read can't clobber a complete day's total (see upsertStepData).
        // GREATEST ignores a null u.steps (date not carrying steps this batch),
        // leaving cm.steps intact, exactly as COALESCE would.
        const updateColumns = [
          ...new Set(
            updateDates.flatMap((date) => Object.keys(mergedByDate.get(date)!))
          ),
        ];
        const setClauses = updateColumns
          .map((column) =>
            column === 'steps'
              ? 'steps = GREATEST(u.steps, cm.steps)'
              : `${column} = COALESCE(u.${column}, cm.${column})`
          )
          .join(', ');
        const unnestParams = updateColumns
          .map(
            (column, index) =>
              `$${index + 3}::${CHECK_IN_COLUMN_TYPES[column]}[]`
          )
          .join(', ');
        const updateResult = await client.query(
          `UPDATE check_in_measurements cm
           SET ${setClauses}, updated_at = now(), updated_by_user_id = $1
           FROM unnest($2::uuid[], ${unnestParams}) AS u(id, ${updateColumns.join(', ')})
           WHERE cm.id = u.id
           RETURNING cm.*`,
          [
            actingUserId,
            updateDates.map((date) => existingByDate.get(date).id),
            ...updateColumns.map((column) =>
              updateDates.map((date) => mergedByDate.get(date)![column] ?? null)
            ),
          ]
        );
        for (const row of updateResult.rows) {
          writtenByDate.set(String(row.entry_date), row);
        }
      }
      if (insertDates.length > 0) {
        const insertColumns = [
          ...new Set(
            insertDates.flatMap((date) => Object.keys(mergedByDate.get(date)!))
          ),
        ];
        const nowIso = new Date().toISOString();
        const insertRows = insertDates.map((date) => [
          userId,
          date,
          ...insertColumns.map(
            (column) => mergedByDate.get(date)![column] ?? null
          ),
          actingUserId,
          actingUserId,
          nowIso,
          nowIso,
        ]);
        const insertResult = await client.query(
          format(
            `INSERT INTO check_in_measurements (user_id, entry_date, ${insertColumns.join(', ')}, created_by_user_id, updated_by_user_id, created_at, updated_at)
             VALUES %L RETURNING *`,
            insertRows
          )
        );
        for (const row of insertResult.rows) {
          writtenByDate.set(String(row.entry_date), row);
        }
      }
    }
    await client.query('COMMIT');
    return entries.map(({ entryDate }) => writtenByDate.get(entryDate) ?? null);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getCheckInMeasurementsByDate(userId: any, date: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'SELECT * FROM check_in_measurements WHERE user_id = $1 AND entry_date = $2',
      [userId, date]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getLatestCheckInMeasurementsOnOrBeforeDate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  date: any
) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `WITH latest_entry AS (
         SELECT id, entry_date, created_at, updated_at, created_by_user_id, updated_by_user_id
         FROM check_in_measurements
         WHERE user_id = $1 AND entry_date <= $2
         ORDER BY entry_date DESC
         LIMIT 1
       )
       SELECT
         le.id,
         $1 as user_id,
         le.entry_date,
         (SELECT weight FROM check_in_measurements WHERE user_id = $1 AND entry_date <= $2 AND weight IS NOT NULL AND weight > 0 ORDER BY entry_date DESC LIMIT 1) as weight,
         (SELECT neck FROM check_in_measurements WHERE user_id = $1 AND entry_date <= $2 AND neck IS NOT NULL AND neck > 0 ORDER BY entry_date DESC LIMIT 1) as neck,
         (SELECT waist FROM check_in_measurements WHERE user_id = $1 AND entry_date <= $2 AND waist IS NOT NULL AND waist > 0 ORDER BY entry_date DESC LIMIT 1) as waist,
         (SELECT hips FROM check_in_measurements WHERE user_id = $1 AND entry_date <= $2 AND hips IS NOT NULL AND hips > 0 ORDER BY entry_date DESC LIMIT 1) as hips,
         (SELECT steps FROM check_in_measurements WHERE user_id = $1 AND entry_date = $2 AND steps IS NOT NULL LIMIT 1) as steps,
         (SELECT height FROM check_in_measurements WHERE user_id = $1 AND entry_date <= $2 AND height IS NOT NULL AND height > 0 ORDER BY entry_date DESC LIMIT 1) as height,
         (SELECT body_fat_percentage FROM check_in_measurements WHERE user_id = $1 AND entry_date <= $2 AND body_fat_percentage IS NOT NULL AND body_fat_percentage > 0 ORDER BY entry_date DESC LIMIT 1) as body_fat_percentage,
         (SELECT muscle_mass_kg FROM check_in_measurements WHERE user_id = $1 AND entry_date <= $2 AND muscle_mass_kg IS NOT NULL AND muscle_mass_kg > 0 ORDER BY entry_date DESC LIMIT 1) as muscle_mass_kg,
         (SELECT bone_mass_kg FROM check_in_measurements WHERE user_id = $1 AND entry_date <= $2 AND bone_mass_kg IS NOT NULL AND bone_mass_kg > 0 ORDER BY entry_date DESC LIMIT 1) as bone_mass_kg,
         (SELECT body_water_percentage FROM check_in_measurements WHERE user_id = $1 AND entry_date <= $2 AND body_water_percentage IS NOT NULL AND body_water_percentage > 0 ORDER BY entry_date DESC LIMIT 1) as body_water_percentage,
         le.created_at,
         le.updated_at,
         le.created_by_user_id,
         le.updated_by_user_id
       FROM (SELECT 1) AS dummy
       LEFT JOIN latest_entry le ON TRUE`,
      [userId, date]
    );
    const row = result.rows[0];
    if (!row || row.id === null) {
      return null;
    }
    return row;
  } finally {
    client.release();
  }
}

/**
 * Returns the synced external BMR / resting-energy value (kcal) stored as a custom
 * measurement for the exact given day, or null if none exists for that day.
 *
 * Mobile syncs this under the custom category named 'basal_metabolic_rate'
 * (see measurementService.processHealthData default branch + getOrCreateCustomCategory).
 * Lookup is EXACT-date (not <= date) so "no value for that day" correctly falls back to
 * the formula BMR upstream. A single date can hold multiple rows across sources (unique
 * key is user+category+date+source), so we apply a deterministic "latest write wins" rule.
 */
async function getExternalBmrForDate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  date: any
): Promise<number | null> {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT cm.value
       FROM custom_measurements cm
       JOIN custom_categories cc ON cm.category_id = cc.id
       WHERE cm.user_id = $1
         AND cc.name = 'basal_metabolic_rate'
         AND cm.entry_date = $2
       ORDER BY cm.updated_at DESC, cm.entry_timestamp DESC
       LIMIT 1`,
      [userId, date]
    );
    if (result.rows.length === 0) {
      return null;
    }
    const value = parseFloat(result.rows[0].value);
    return Number.isFinite(value) ? value : null;
  } finally {
    client.release();
  }
}
async function updateCheckInMeasurements(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateData: any
) {
  log(
    'info',
    `[measurementRepository] updateCheckInMeasurements called with: userId=${userId}, actingUserId=${actingUserId}, entryDate=${entryDate}, updateData=`,
    updateData
  );
  const client = await getClient(actingUserId); // User-specific operation, using actingUserId for RLS context
  try {
    const fieldsToUpdate = Object.keys(updateData)
      .filter((key) => ALLOWED_CHECK_IN_COLUMNS.includes(key))
      .map((key, index) => `${key} = $${index + 1}`);
    if (fieldsToUpdate.length === 0) {
      log(
        'warn',
        `[measurementRepository] No valid fields to update for check-in measurement userId: ${userId}, entryDate: ${entryDate}`
      );
      return null;
    }
    // Correctly construct the values array: first the values for the SET clause, then actingUserId (for audit), then userId, then entryDate
    const updateValues = Object.keys(updateData)
      .filter((key) => ALLOWED_CHECK_IN_COLUMNS.includes(key))
      .map((key) => updateData[key]);
    const values = [...updateValues, actingUserId, userId, entryDate];
    // Add updated_by_user_id to update query
    const query = `
      UPDATE check_in_measurements
      SET ${fieldsToUpdate.join(', ')}, updated_at = now(), updated_by_user_id = $${fieldsToUpdate.length + 1}
      WHERE user_id = $${fieldsToUpdate.length + 2} AND entry_date = $${fieldsToUpdate.length + 3}
      RETURNING *`;
    log('debug', `[measurementRepository] Executing query: ${query}`);
    log(
      'debug',
      `[measurementRepository] Query values: ${JSON.stringify(values)}`
    );
    const result = await client.query(query, values);
    if (result.rows[0]) {
      log(
        'info',
        `[measurementRepository] Successfully updated check-in measurement for userId: ${userId}, entryDate: ${entryDate}`
      );
    } else {
      log(
        'warn',
        `[measurementRepository] No rows updated for check-in measurement userId: ${userId}, entryDate: ${entryDate}`
      );
    }
    return result.rows[0];
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteCheckInMeasurements(id: any, userId: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'DELETE FROM check_in_measurements WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getCustomCategories(userId: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'SELECT id, name, display_name, frequency, measurement_type, data_type FROM custom_categories WHERE user_id = $1',
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createCustomCategory(categoryData: any) {
  const client = await getClient(categoryData.created_by_user_id); // User-specific operation, using created_by_user_id for RLS context
  try {
    const result = await client.query(
      `INSERT INTO custom_categories (user_id, name, display_name, frequency, measurement_type, data_type, created_by_user_id, updated_by_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7, now(), now()) RETURNING id`,
      [
        categoryData.user_id,
        categoryData.name,
        categoryData.display_name,
        categoryData.frequency,
        categoryData.measurement_type,
        categoryData.data_type,
        categoryData.created_by_user_id,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function updateCustomCategory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  id: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateData: any
) {
  const client = await getClient(actingUserId); // User-specific operation, using actingUserId for RLS context
  try {
    const result = await client.query(
      `UPDATE custom_categories SET
        name = COALESCE($1, name),
        display_name = COALESCE($2, display_name),
        frequency = COALESCE($3, frequency),
        measurement_type = COALESCE($4, measurement_type),
        data_type = COALESCE($5, data_type),
        updated_at = now(),
        updated_by_user_id = $6
      WHERE id = $7 AND user_id = $8
      RETURNING *`,
      [
        updateData.name,
        updateData.display_name,
        updateData.frequency,
        updateData.measurement_type,
        updateData.data_type,
        actingUserId,
        id,
        userId,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteCustomCategory(id: any, userId: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'DELETE FROM custom_categories WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getCustomCategoryOwnerId(id: any, userId: any) {
  const client = await getClient(userId); // User-specific operation (RLS will handle access)
  try {
    const result = await client.query(
      'SELECT user_id FROM custom_categories WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rows[0]?.user_id;
  } finally {
    client.release();
  }
}

async function getCustomMeasurementEntries(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  limit: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  orderBy: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filterObj: any
) {
  // Renamed filter to filterObj
  const client = await getClient(userId); // User-specific operation
  try {
    let query = `
      SELECT cm.*, cm.entry_date::TEXT,
             json_build_object(
               'name', cc.name,
               'display_name', cc.display_name,
               'measurement_type', cc.measurement_type,
               'frequency', cc.frequency,
               'data_type', cc.data_type
             ) AS custom_categories
      FROM custom_measurements cm
      JOIN custom_categories cc ON cm.category_id = cc.id
      WHERE cm.user_id = $1 AND cm.value IS NOT NULL
    `;
    const queryParams = [userId];
    let paramIndex = 2;
    // RLS will handle filtering by user_id, but we keep it here for explicit filtering
    // in case RLS is disabled or for clarity.
    if (filterObj) {
      if (filterObj.category_id) {
        query += ` AND cm.category_id = $${paramIndex}`;
        queryParams.push(filterObj.category_id);
        paramIndex++;
      }
      // Existing filter logic for 'value.gt.X' - needs to be adapted for filterObj
      // For now, assuming the old filter string format might still be present,
      // but primarily handling category_id.
      if (typeof filterObj.filter === 'string') {
        const filterParts = filterObj.filter.split('.');
        if (
          filterParts.length === 3 &&
          filterParts[0] === 'value' &&
          filterParts[1] === 'gt'
        ) {
          query += ` AND cm.value > $${paramIndex}`;
          queryParams.push(parseFloat(filterParts[2]));
          paramIndex++;
        }
      }
    }
    if (orderBy) {
      const [field, order] = orderBy.split('.');
      const allowedFields = ['entry_timestamp', 'value'];
      const allowedOrders = ['asc', 'desc'];
      if (allowedFields.includes(field) && allowedOrders.includes(order)) {
        query += ` ORDER BY cm.${field} ${order.toUpperCase()}`;
      }
    } else {
      query += ' ORDER BY cm.entry_timestamp DESC';
    }
    if (limit) {
      query += ` LIMIT $${paramIndex}`;
      queryParams.push(parseInt(limit, 10));
      paramIndex++;
    }
    const result = await client.query(query, queryParams);
    return result.rows;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getCustomMeasurementEntriesByDate(userId: any, date: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT cm.*,
             json_build_object(
               'name', cc.name,
               'display_name', cc.display_name,
               'measurement_type', cc.measurement_type,
               'frequency', cc.frequency,
               'data_type', cc.data_type
             ) AS custom_categories
       FROM custom_measurements cm
       JOIN custom_categories cc ON cm.category_id = cc.id
       WHERE cm.user_id = $1 AND cm.entry_date = $2
       ORDER BY cm.entry_timestamp DESC`,
      [userId, date]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function getCheckInMeasurementsByDateRange(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any
) {
  log(
    'debug',
    `[measurementRepository] getCheckInMeasurementsByDateRange called for userId: ${userId}, startDate: ${startDate}, endDate: ${endDate}`
  );
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'SELECT *, entry_date::TEXT, updated_at FROM check_in_measurements WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3 ORDER BY check_in_measurements.entry_date DESC, updated_at DESC',
      [userId, startDate, endDate]
    );
    log(
      'debug',
      `[measurementRepository] getCheckInMeasurementsByDateRange returning ${result.rows.length} row(s)`
    );
    return result.rows;
  } finally {
    client.release();
  }
}
async function getCustomMeasurementsByDateRange(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  categoryId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any,
  source = null
) {
  const client = await getClient(userId); // User-specific operation
  try {
    let query =
      'SELECT category_id, entry_date AS date, entry_hour AS hour, value, entry_timestamp AS timestamp FROM custom_measurements WHERE user_id = $1 AND category_id = $2 AND entry_date BETWEEN $3 AND $4';
    const queryParams = [userId, categoryId, startDate, endDate];
    if (source) {
      query += ' AND source = $5';
      queryParams.push(source);
    }
    query +=
      ' ORDER BY custom_measurements.entry_date, custom_measurements.entry_timestamp';
    const result = await client.query(query, queryParams);
    return result.rows;
  } finally {
    client.release();
  }
}
async function upsertCustomMeasurement(
  userId: string,
  actingUserId: string,
  categoryId: string,
  value: string | number | boolean,
  entryDate: string,
  entryHour?: number | null,
  entryTimestamp?: string | null,
  notes?: string | null,
  frequency?: string | null,
  source = 'manual',
  userTimezone?: string | null
) {
  const client = await getClient(actingUserId); // User-specific operation, using actingUserId for RLS context
  try {
    let query;
    let values;
    // Normalize entry_hour and entry_timestamp for 'Daily' frequency to prevent duplicates
    let normalizedEntryHour = entryHour ?? null;
    let normalizedEntryTimestamp = entryTimestamp ?? null;
    if (frequency === 'Daily') {
      normalizedEntryHour = 0; // Set hour to 0 for daily measurements
      // Normalize timestamp to the beginning of the day
      if (entryDate && isDayString(entryDate)) {
        const parts = entryDate.split('-');
        normalizedEntryTimestamp = new Date(
          Date.UTC(
            Number(parts[0]),
            Number(parts[1]) - 1,
            Number(parts[2]),
            0,
            0,
            0,
            0
          )
        ).toISOString();
      } else {
        const dateObj = new Date(entryDate);
        dateObj.setUTCHours(0, 0, 0, 0);
        normalizedEntryTimestamp = dateObj.toISOString();
      }
    } else {
      normalizedEntryTimestamp = defaultEntryTimestamp(
        normalizedEntryTimestamp,
        entryDate,
        normalizedEntryHour,
        userTimezone
      );
    }
    // For 'Unlimited' and 'All' frequencies, always insert a new entry.
    // For 'Daily' and 'Hourly', check for existing entries to update.
    if (frequency === 'Unlimited' || frequency === 'All') {
      // Add updated_by_user_id and created_by_user_id to insert query
      query = `
        INSERT INTO custom_measurements (user_id, category_id, value, entry_date, entry_hour, entry_timestamp, notes, created_by_user_id, updated_by_user_id, created_at, updated_at, source)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, now(), now(), $9)
        RETURNING *
      `;
      values = [
        userId,
        categoryId,
        value,
        entryDate,
        normalizedEntryHour,
        normalizedEntryTimestamp,
        notes ?? null,
        actingUserId,
        source,
      ];
    } else {
      // For 'Daily' and 'Hourly', check if an entry already exists for the given user, category, date, hour (if applicable) and source
      let existingEntryQuery = `
        SELECT id FROM custom_measurements
        WHERE user_id = $1 AND category_id = $2 AND entry_date = $3 AND source = $4
      `;
      const existingEntryValues: unknown[] = [
        userId,
        categoryId,
        entryDate,
        source,
      ];
      if (frequency === 'Hourly' && normalizedEntryHour !== null) {
        existingEntryQuery += ` AND entry_hour = $${existingEntryValues.length + 1}`;
        existingEntryValues.push(normalizedEntryHour);
      } else if (frequency === 'Daily') {
        // For daily, we only care about the date and source, so entry_hour should not be part of the WHERE clause
        // and we should ensure we're only looking for entries without an hour or with hour 0
        existingEntryQuery += ' AND (entry_hour IS NULL OR entry_hour = 0)';
      }
      const existingEntry = await client.query(
        existingEntryQuery,
        existingEntryValues
      );
      if (existingEntry.rows.length > 0) {
        // Update existing entry with updated_by_user_id
        const id = existingEntry.rows[0].id;
        query = `
          UPDATE custom_measurements
          SET value = $1, entry_timestamp = $2, notes = $3, updated_by_user_id = $4, updated_at = now(), source = $5
          WHERE id = $6
          RETURNING *
        `;
        values = [
          value,
          normalizedEntryTimestamp,
          notes ?? null,
          actingUserId,
          source,
          id,
        ];
      } else {
        // Insert new entry with created_by_user_id and updated_by_user_id
        query = `
          INSERT INTO custom_measurements (user_id, category_id, value, entry_date, entry_hour, entry_timestamp, notes, created_by_user_id, updated_by_user_id, created_at, updated_at, source)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, now(), now(), $9)
          RETURNING *
        `;
        values = [
          userId,
          categoryId,
          value,
          entryDate,
          normalizedEntryHour,
          normalizedEntryTimestamp,
          notes ?? null,
          actingUserId,
          source,
        ];
      }
    }
    const result = await client.query(query, values);
    return result.rows[0];
  } finally {
    client.release();
  }
}

export interface BulkCustomMeasurementInputRow {
  categoryId: string;
  value: string | number | boolean;
  entryDate: string;
  entryHour?: number | null;
  entryTimestamp?: string | null;
  notes?: string | null;
  frequency: string;
  source?: string | null;
  userTimezone?: string | null;
}

/**
 * Batch counterpart of upsertCustomMeasurement for health-data ingestion: one
 * client + one transaction for the whole batch instead of one client per
 * record. Rows are normalized exactly like the per-record upsert, deduped by
 * the same existence keys it checks (last row in payload order wins, matching
 * the sequential net effect); 'Unlimited'/'All' frequencies always insert.
 * Identity handling mirrors upsertCustomMeasurement: getClient(actingUserId)
 * for RLS context, rows target userId, and actingUserId stamps the audit
 * columns on both INSERT and UPDATE.
 *
 * Returns the written DB row for each input row (deduped rows share their
 * winner's row).
 */
async function bulkUpsertCustomMeasurements(
  userId: string,
  actingUserId: string,
  rows: BulkCustomMeasurementInputRow[],
  userTimezone?: string | null
) {
  if (!rows || rows.length === 0) {
    return [];
  }
  const client = await getClient(actingUserId); // User-specific operation, using actingUserId for RLS context
  try {
    await client.query('BEGIN');
    // Normalize entry_hour and entry_timestamp for 'Daily' frequency to
    // prevent duplicates (identical to upsertCustomMeasurement).
    const prepared = rows.map((row) => {
      let normalizedEntryHour = row.entryHour;
      let normalizedEntryTimestamp = row.entryTimestamp;
      if (row.frequency === 'Daily') {
        normalizedEntryHour = 0; // Set hour to 0 for daily measurements
        // Normalize timestamp to the beginning of the day
        if (row.entryDate && isDayString(row.entryDate)) {
          const parts = row.entryDate.split('-');
          normalizedEntryTimestamp = new Date(
            Date.UTC(
              Number(parts[0]),
              Number(parts[1]) - 1,
              Number(parts[2]),
              0,
              0,
              0,
              0
            )
          ).toISOString();
        } else {
          const dateObj = new Date(row.entryDate);
          dateObj.setUTCHours(0, 0, 0, 0);
          normalizedEntryTimestamp = dateObj.toISOString();
        }
      } else {
        normalizedEntryTimestamp = defaultEntryTimestamp(
          normalizedEntryTimestamp,
          row.entryDate,
          normalizedEntryHour,
          row.userTimezone ?? userTimezone
        );
      }
      return {
        ...row,
        source: row.source === undefined ? 'manual' : row.source,
        entryHour: normalizedEntryHour,
        entryTimestamp: normalizedEntryTimestamp,
      };
    });
    // Existence keys mirror the per-record SELECT: 'Hourly' keys on
    // (category, date, source, hour); 'Daily' on (category, date, source)
    // with hour NULL-or-0; other non-Unlimited frequencies on
    // (category, date, source) with no hour predicate. Frequency comes from
    // the category, so rows sharing a category share a key class.
    const alwaysInsertIndexes: number[] = [];
    const keyByIndex: (string | null)[] = new Array(rows.length).fill(null);
    const winnerByKey = new Map<string, number>();
    for (let i = 0; i < prepared.length; i++) {
      const row = prepared[i];
      if (row.frequency === 'Unlimited' || row.frequency === 'All') {
        alwaysInsertIndexes.push(i);
        continue;
      }
      const keyClass =
        row.frequency === 'Hourly' && row.entryHour !== null
          ? `hourly:${row.entryHour}`
          : row.frequency === 'Daily'
            ? 'daily'
            : 'other';
      const key = `${keyClass}|${row.categoryId}|${row.entryDate}|${row.source}`;
      keyByIndex[i] = key;
      winnerByKey.set(key, i); // last row in payload order wins
    }
    const keyedWinnerIndexes = [...winnerByKey.values()];
    // One superset SELECT for all keyed rows, then exact per-key matching in
    // JS (mirrors the per-record existence SELECT semantics).
    const existingByKey = new Map<string, Record<string, unknown>>();
    if (keyedWinnerIndexes.length > 0) {
      const categoryIds = [
        ...new Set(keyedWinnerIndexes.map((i) => prepared[i].categoryId)),
      ];
      const dates = [
        ...new Set(keyedWinnerIndexes.map((i) => prepared[i].entryDate)),
      ];
      const sources = [
        ...new Set(keyedWinnerIndexes.map((i) => prepared[i].source)),
      ];
      const existing = await client.query(
        `SELECT id, category_id, entry_date, source, entry_hour FROM custom_measurements
         WHERE user_id = $1 AND category_id = ANY($2) AND entry_date = ANY($3::date[]) AND source = ANY($4)`,
        [userId, categoryIds, dates, sources]
      );
      for (const index of keyedWinnerIndexes) {
        const row = prepared[index];
        const match = existing.rows.find((dbRow: Record<string, unknown>) => {
          if (dbRow.category_id !== row.categoryId) return false;
          // entry_date comes back as a YYYY-MM-DD string (poolManager DATE parser)
          if (String(dbRow.entry_date) !== String(row.entryDate)) return false;
          if (dbRow.source !== row.source) return false;
          if (row.frequency === 'Hourly' && row.entryHour !== null) {
            return dbRow.entry_hour === row.entryHour;
          }
          if (row.frequency === 'Daily') {
            return dbRow.entry_hour === null || dbRow.entry_hour === 0;
          }
          return true;
        });
        if (match) {
          existingByKey.set(keyByIndex[index]!, match);
        }
      }
    }
    const writtenByInput: Record<string, unknown>[] = new Array(rows.length);
    const updateIndexes = keyedWinnerIndexes.filter((i) =>
      existingByKey.has(keyByIndex[i]!)
    );
    if (updateIndexes.length > 0) {
      const updateResult = await client.query(
        `UPDATE custom_measurements cm
         SET value = u.value, entry_timestamp = u.entry_timestamp, notes = u.notes, updated_by_user_id = $1, updated_at = now(), source = u.source
         FROM unnest($2::uuid[], $3::text[], $4::timestamptz[], $5::text[], $6::text[]) AS u(id, value, entry_timestamp, notes, source)
         WHERE cm.id = u.id
         RETURNING cm.*`,
        [
          actingUserId,
          updateIndexes.map((i) => existingByKey.get(keyByIndex[i]!)!.id),
          updateIndexes.map((i) => prepared[i].value),
          updateIndexes.map((i) => prepared[i].entryTimestamp),
          updateIndexes.map((i) => prepared[i].notes ?? null),
          updateIndexes.map((i) => prepared[i].source),
        ]
      );
      const updatedById = new Map<string, Record<string, unknown>>(
        updateResult.rows.map((row: Record<string, unknown>) => [
          row.id as string,
          row,
        ])
      );
      for (const index of updateIndexes) {
        const existingRow = existingByKey.get(keyByIndex[index]!);
        if (existingRow && existingRow.id) {
          const updatedRow = updatedById.get(String(existingRow.id));
          if (updatedRow) {
            writtenByInput[index] = updatedRow;
          }
        }
      }
    }
    const insertIndexes = [
      ...alwaysInsertIndexes,
      ...keyedWinnerIndexes.filter((i) => !existingByKey.has(keyByIndex[i]!)),
    ].sort((a, b) => a - b);
    if (insertIndexes.length > 0) {
      const nowIso = new Date().toISOString();
      const insertRows = insertIndexes.map((index) => {
        const row = prepared[index];
        return [
          userId,
          row.categoryId,
          row.value,
          row.entryDate,
          row.entryHour ?? null,
          row.entryTimestamp,
          row.notes ?? null,
          actingUserId,
          actingUserId,
          nowIso,
          nowIso,
          row.source,
        ];
      });
      const insertResult = await client.query(
        format(
          `INSERT INTO custom_measurements (user_id, category_id, value, entry_date, entry_hour, entry_timestamp, notes, created_by_user_id, updated_by_user_id, created_at, updated_at, source)
           VALUES %L RETURNING *`,
          insertRows
        )
      );
      // INSERT ... RETURNING preserves VALUES order, so align by position.
      for (let k = 0; k < insertIndexes.length; k++) {
        writtenByInput[insertIndexes[k]] = insertResult.rows[k];
      }
    }
    // Deduped-away rows share their winner's written row.
    for (let i = 0; i < rows.length; i++) {
      if (writtenByInput[i] === undefined && keyByIndex[i] !== null) {
        writtenByInput[i] = writtenByInput[winnerByKey.get(keyByIndex[i]!)!];
      }
    }
    await client.query('COMMIT');
    return writtenByInput;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteCustomMeasurement(id: any, userId: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'DELETE FROM custom_measurements WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}
/**
 * Weight and height for step-calorie estimation.
 *
 * Deliberately whole-table latest rather than latest-on-or-before the target day. The
 * Diary has always read it this way, and the acceptance criterion for #2094 is that
 * Reports agrees with the Diary -- date-scoping it here would make the two disagree again
 * for every day after a weight change. Note that BMR in the same balance *does* use
 * on-or-before, so the two are inconsistent with each other. Tracked separately; do not
 * "fix" one without the other.
 */
async function getLatestWeightHeight(
  userId: string
): Promise<{ weightKg: number | null; heightCm: number | null }> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT
         (SELECT weight FROM check_in_measurements
           WHERE user_id = $1 AND weight IS NOT NULL AND weight > 0
           ORDER BY entry_date DESC, updated_at DESC LIMIT 1) AS weight,
         (SELECT height FROM check_in_measurements
           WHERE user_id = $1 AND height IS NOT NULL AND height > 0
           ORDER BY entry_date DESC, updated_at DESC LIMIT 1) AS height`,
      [userId]
    );
    const weight = parseFloat(result.rows[0]?.weight);
    const height = parseFloat(result.rows[0]?.height);
    return {
      // `> 0`, not just finite: a stored 0 would otherwise survive the `??` fallbacks
      // downstream and zero out the day's step calories. The per-date Diary lookup
      // filters the same way, and the two must agree.
      weightKg: Number.isFinite(weight) && weight > 0 ? weight : null,
      heightCm: Number.isFinite(height) && height > 0 ? height : null,
    };
  } finally {
    client.release();
  }
}

/**
 * Compute step calories for a user on a given date.
 *
 * Background steps = total check-in steps minus the steps a logged workout already
 * accounted for. `activitySteps` is passed in rather than re-derived from the session
 * tree because the caller has already walked it to split active/logged calories; walking
 * it twice is two implementations of one rule.
 */
async function getStepCaloriesForDate(
  userId: string,
  date: string,
  activitySteps: number
): Promise<number> {
  const [{ weightKg, heightCm }, totalSteps] = await Promise.all([
    getLatestWeightHeight(userId),
    getCheckInStepsForDate(userId, date),
  ]);

  return resolveBackgroundStepCalories({
    totalSteps,
    activitySteps,
    weightKg,
    heightCm,
  });
}

/** The day's total step count as recorded on the check-in row, or 0. */
async function getCheckInStepsForDate(
  userId: string,
  date: string
): Promise<number> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'SELECT steps FROM check_in_measurements WHERE user_id = $1 AND entry_date = $2',
      [userId, date]
    );
    return parseInt(result.rows[0]?.steps ?? '0', 10) || 0;
  } finally {
    client.release();
  }
}

/**
 * Synced resting/BMR values keyed by date, for a whole range.
 *
 * The per-date sibling `getExternalBmrForDate` issues one query per day; the ranged
 * report path would turn that into one query per day in the window.
 */
async function getExternalBmrByDateRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<Map<string, number>> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT DISTINCT ON (cm.entry_date)
              TO_CHAR(cm.entry_date, 'YYYY-MM-DD') AS entry_date, cm.value
       FROM custom_measurements cm
       JOIN custom_categories cc ON cm.category_id = cc.id
       WHERE cm.user_id = $1
         AND cc.name = 'basal_metabolic_rate'
         AND cm.entry_date BETWEEN $2 AND $3
       ORDER BY cm.entry_date, cm.updated_at DESC, cm.entry_timestamp DESC`,
      [userId, startDate, endDate]
    );
    const byDate = new Map<string, number>();
    for (const row of result.rows) {
      const value = parseFloat(row.value);
      if (Number.isFinite(value)) byDate.set(row.entry_date, value);
    }
    return byDate;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getLatestMeasurement(userId: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT 
         (SELECT id FROM check_in_measurements WHERE user_id = $1 ORDER BY entry_date DESC LIMIT 1) as id,
         $1 as user_id,
         (SELECT entry_date FROM check_in_measurements WHERE user_id = $1 ORDER BY entry_date DESC LIMIT 1) as entry_date,
         (SELECT weight FROM check_in_measurements WHERE user_id = $1 AND weight IS NOT NULL ORDER BY entry_date DESC LIMIT 1) as weight,
         (SELECT neck FROM check_in_measurements WHERE user_id = $1 AND neck IS NOT NULL ORDER BY entry_date DESC LIMIT 1) as neck,
         (SELECT waist FROM check_in_measurements WHERE user_id = $1 AND waist IS NOT NULL ORDER BY entry_date DESC LIMIT 1) as waist,
         (SELECT hips FROM check_in_measurements WHERE user_id = $1 AND hips IS NOT NULL ORDER BY entry_date DESC LIMIT 1) as hips,
         (SELECT steps FROM check_in_measurements WHERE user_id = $1 AND steps IS NOT NULL ORDER BY entry_date DESC LIMIT 1) as steps,
         (SELECT height FROM check_in_measurements WHERE user_id = $1 AND height IS NOT NULL ORDER BY entry_date DESC LIMIT 1) as height,
         (SELECT body_fat_percentage FROM check_in_measurements WHERE user_id = $1 AND body_fat_percentage IS NOT NULL ORDER BY entry_date DESC LIMIT 1) as body_fat_percentage,
         (SELECT created_at FROM check_in_measurements WHERE user_id = $1 ORDER BY entry_date DESC LIMIT 1) as created_at,
         (SELECT updated_at FROM check_in_measurements WHERE user_id = $1 ORDER BY entry_date DESC LIMIT 1) as updated_at`,
      [userId]
    );
    const row = result.rows[0];
    if (row && row.id === null) {
      return null;
    }
    return row;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getCustomMeasurementOwnerId(id: any, userId: any) {
  const client = await getClient(userId); // User-specific operation (RLS will handle access)
  try {
    const result = await client.query(
      'SELECT user_id FROM custom_measurements WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rows[0]?.user_id;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMostRecentMeasurement(userId: any, measurementType: any) {
  // SECURITY: Whitelist allowed measurement columns to prevent SQL injection via dynamic column names
  if (!ALLOWED_CHECK_IN_COLUMNS.includes(measurementType)) {
    throw new Error(`Invalid measurement type requested: ${measurementType}`);
  }
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT ${measurementType} FROM check_in_measurements
       WHERE user_id = $1 AND ${measurementType} IS NOT NULL
       ORDER BY entry_date DESC, updated_at DESC
       LIMIT 1`,
      [userId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
export { upsertStepData };
export { upsertWaterData };
export { incrementWaterData };
export { getWaterIntakesByDates };
export { getWaterIntakeEntryById };
export { getWaterIntakeEntryOwnerId };
export { updateWaterIntake };
export { deleteWaterIntake };
export { upsertCheckInMeasurements };
export { getCheckInMeasurementsByDate };
export { updateCheckInMeasurements };
export { deleteCheckInMeasurements };
export { getCustomCategories };
export { createCustomCategory };
export { updateCustomCategory };
export { deleteCustomCategory };
export { getCustomMeasurementEntries };
export { getCustomMeasurementEntriesByDate };
export { getCheckInMeasurementsByDateRange };
export { getCustomMeasurementsByDateRange };
export { getCustomCategoryOwnerId };
export { upsertCustomMeasurement };
export { deleteCustomMeasurement };
export { getCustomMeasurementOwnerId };
export { getLatestMeasurement };
export { getLatestCheckInMeasurementsOnOrBeforeDate };
export { getExternalBmrForDate };
export { getMostRecentMeasurement };
export { getStepCaloriesForDate };
export { getLatestWeightHeight };
export { getExternalBmrByDateRange };

// ── Water Intake Entries (granular drink-by-drink tracking) ──────────────

async function insertWaterIntakeLog(
  userId: string,
  actingUserId: string,
  entryDate: string,
  waterMl: number,
  containerId: number | null,
  containerName: string | null,
  source = 'manual',
  loggedAt: string | null = null
) {
  const client = await getClient(actingUserId);
  try {
    const result = await client.query(
      `INSERT INTO water_intake_entries
        (user_id, entry_date, water_ml, container_id, container_name, source, created_at, created_by_user_id, logged_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, COALESCE($8, NOW()))
       RETURNING *`,
      [
        userId,
        entryDate,
        waterMl,
        containerId,
        containerName,
        source,
        actingUserId,
        loggedAt,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Idempotently upserts synced hydration samples by (user_id, source, source_id)
 * instead of deleting-and-replacing a date window. Mobile hydration reads are
 * incremental (a rolling overlap cursor, not a full-day resend), so deleting
 * everything in a calendar-day window and reinserting only what's in the
 * current batch would silently drop earlier same-day entries that aren't in
 * this batch. Per-record upsert makes re-syncing the same record idempotent
 * without ever deleting entries this batch didn't see.
 *
 * Samples without a sourceId can't join that per-record key, and their
 * producers (older mobile apps sending one day-aggregate per day, CSV health
 * imports) re-send the same rows on every sync or re-import. For non-manual
 * sources those samples use replace-per-day semantics instead: each
 * (entry_date, source) receiving unkeyed samples in this batch has ALL its
 * previous rows deleted first — keyed ones included, because an unkeyed
 * day-aggregate is that client's full-day truth for the source, and keyed
 * rows left beside it would double the total with no way to ever adopt the
 * aggregate row (its records already exist keyed). A later per-record sync
 * adopts the aggregate row back into keyed form, so mixed old/new clients
 * self-heal in both directions. Manual unkeyed samples stay additive —
 * wiping the user's tapped-in drink log because a CSV import omitted a
 * source column would destroy real data.
 */
async function upsertWaterIntakeSamples(
  userId: string,
  actingUserId: string,
  samples: Array<{
    entryDate: string;
    waterMl: number;
    containerId?: number | null;
    containerName: string;
    source: string;
    sourceId?: string | null;
    loggedAt?: string | null;
  }>
) {
  const client = await getClient(actingUserId);
  try {
    await client.query('BEGIN');

    const writtenRows: Array<Record<string, unknown>> = [];
    const affectedDatesBySource = new Map<string, Set<string>>();

    // Replace-per-day pre-pass for unkeyed non-manual samples (see doc comment):
    // clear each affected (entry_date, source) once, before any of this batch's
    // inserts, so multiple unkeyed samples for the same day in one batch all
    // survive.
    const unkeyedDatesBySource = new Map<string, Set<string>>();
    for (const sample of samples) {
      if (!sample.sourceId && sample.source !== 'manual') {
        const dates =
          unkeyedDatesBySource.get(sample.source) || new Set<string>();
        dates.add(sample.entryDate);
        unkeyedDatesBySource.set(sample.source, dates);
      }
    }
    for (const [source, dates] of unkeyedDatesBySource) {
      for (const dateStr of dates) {
        await client.query(
          `DELETE FROM water_intake_entries
           WHERE user_id = $1 AND entry_date = $2 AND source = $3`,
          [userId, dateStr, source]
        );
      }
    }

    for (const sample of samples) {
      const dates =
        affectedDatesBySource.get(sample.source) || new Set<string>();
      dates.add(sample.entryDate);
      affectedDatesBySource.set(sample.source, dates);

      let res;
      if (sample.sourceId) {
        // Adopt a pre-existing unkeyed row for this exact (user, source, date)
        // if one exists — e.g. a legacy row from before source_id existed
        // (single-total-per-day rows backfilled from the water_intake
        // aggregate). Without this, the first keyed re-sync of that day would
        // insert a second row alongside the legacy one and double the total,
        // since ON CONFLICT can't match a row that has no source_id to
        // conflict against. Expected to be at most one such row per
        // (user, entry_date, source), but that isn't schema-enforced, so the
        // update is bounded to a single row via the ctid subquery — if more
        // than one exists, only one gets adopted instead of stamping the
        // same source_id onto multiple rows (which would trip the partial
        // unique index on (user_id, source, source_id) and fail the batch).
        // The NOT EXISTS guard skips adoption entirely when this source_id is
        // already keyed: a re-sync of a known record must land on the
        // ON CONFLICT update below, not stamp its id onto a second leftover
        // unkeyed row (same unique-index trip, and it would keep failing on
        // every subsequent sync).
        const adopted = await client.query(
          `UPDATE water_intake_entries
           SET source_id = $1,
               water_ml = $2,
               container_id = $3,
               container_name = $4,
               logged_at = COALESCE($5, logged_at)
           WHERE ctid = (
             SELECT ctid FROM water_intake_entries
             WHERE user_id = $6 AND source = $7 AND entry_date = $8 AND source_id IS NULL
             LIMIT 1
           )
           AND NOT EXISTS (
             SELECT 1 FROM water_intake_entries
             WHERE user_id = $6 AND source = $7 AND source_id = $1
           )
           RETURNING *`,
          [
            sample.sourceId,
            sample.waterMl,
            sample.containerId || null,
            sample.containerName,
            sample.loggedAt || null,
            userId,
            sample.source,
            sample.entryDate,
          ]
        );
        if (adopted.rows.length > 0) {
          res = adopted;
        } else {
          res = await client.query(
            `INSERT INTO water_intake_entries
              (user_id, entry_date, water_ml, container_id, container_name, source, source_id, created_at, created_by_user_id, logged_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, COALESCE($9, NOW()))
             ON CONFLICT (user_id, source, source_id) WHERE source IS NOT NULL AND source_id IS NOT NULL
             DO UPDATE SET
               entry_date = EXCLUDED.entry_date,
               water_ml = EXCLUDED.water_ml,
               container_id = EXCLUDED.container_id,
               container_name = EXCLUDED.container_name,
               logged_at = COALESCE($9, water_intake_entries.logged_at)
             RETURNING *`,
            [
              userId,
              sample.entryDate,
              sample.waterMl,
              sample.containerId || null,
              sample.containerName,
              sample.source,
              sample.sourceId,
              actingUserId,
              sample.loggedAt || null,
            ]
          );
        }
      } else {
        log(
          'warn',
          sample.source === 'manual'
            ? `[upsertWaterIntakeSamples] Sample without sourceId for source '${sample.source}'; inserting additively (not deduped).`
            : `[upsertWaterIntakeSamples] Sample without sourceId for source '${sample.source}'; using replace-per-day semantics for ${sample.entryDate}.`
        );
        res = await client.query(
          `INSERT INTO water_intake_entries
            (user_id, entry_date, water_ml, container_id, container_name, source, created_at, created_by_user_id, logged_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, COALESCE($8, NOW()))
           RETURNING *`,
          [
            userId,
            sample.entryDate,
            sample.waterMl,
            sample.containerId || null,
            sample.containerName,
            sample.source,
            actingUserId,
            sample.loggedAt || null,
          ]
        );
      }
      writtenRows.push(res.rows[0]);
    }

    // Recalculate and update daily totals in water_intake for every
    // (source, date) combination touched by this batch's samples.
    for (const [source, dates] of affectedDatesBySource) {
      for (const dateStr of dates) {
        const sumRes = await client.query(
          `SELECT COALESCE(SUM(water_ml), 0) as total_ml
           FROM water_intake_entries
           WHERE user_id = $1 AND entry_date = $2 AND source = $3`,
          [userId, dateStr, source]
        );
        const totalMl = Number(sumRes.rows[0]?.total_ml || 0);

        await client.query(
          `INSERT INTO water_intake (user_id, entry_date, water_ml, source, created_by_user_id, updated_by_user_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $5, NOW(), NOW())
           ON CONFLICT (user_id, entry_date, source)
           DO UPDATE SET water_ml = $3, updated_at = NOW(), updated_by_user_id = $5`,
          [userId, dateStr, totalMl, source, actingUserId]
        );
      }
    }

    await client.query('COMMIT');
    return writtenRows;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getWaterIntakeLogsByDates(userId: string, dates: string[]) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT id, user_id, entry_date, water_ml, container_id, container_name, source, created_at, logged_at
       FROM water_intake_entries
       WHERE user_id = $1 AND entry_date = ANY($2::date[])
       ORDER BY entry_date, logged_at ASC`,
      [userId, dates]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function getWaterIntakeLogByDate(
  userId: string,
  date: string,
  source?: string | null
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      source
        ? `SELECT id, user_id, entry_date, water_ml, container_id, container_name, source, created_at, logged_at
           FROM water_intake_entries
           WHERE user_id = $1 AND entry_date = $2 AND source = $3
           ORDER BY logged_at DESC`
        : `SELECT id, user_id, entry_date, water_ml, container_id, container_name, source, created_at, logged_at
           FROM water_intake_entries
           WHERE user_id = $1 AND entry_date = $2
           ORDER BY logged_at DESC`,
      source ? [userId, date, source] : [userId, date]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function deleteWaterIntakeLog(id: string, userId: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'DELETE FROM water_intake_entries WHERE id = $1 AND user_id = $2 RETURNING id, water_ml, entry_date, source',
      [id, userId]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

async function getWaterIntakeLogEntryOwnerId(id: string, userId: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'SELECT user_id FROM water_intake_entries WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rows[0]?.user_id as string | undefined;
  } finally {
    client.release();
  }
}

async function updateWaterIntakeLogTime(
  id: string,
  userId: string,
  loggedAt: string
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'UPDATE water_intake_entries SET logged_at = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [loggedAt, id, userId]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

// Per-day water totals over an optional date range (both bounds optional;
// no bounds returns the full history). Used by the chatbot get_water_history
// action.
async function getWaterTotalsByDateRange(
  userId: string,
  startDate?: string,
  endDate?: string
) {
  const client = await getClient(userId);
  try {
    let query = `
      SELECT TO_CHAR(entry_date, 'YYYY-MM-DD') as entry_date, SUM(water_ml) as total_ml
      FROM water_intake_entries
      WHERE user_id = $1
    `;
    const queryParams: unknown[] = [userId];
    let paramIdx = 2;

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

    query += ' GROUP BY entry_date ORDER BY entry_date ASC';

    const result = await client.query(query, queryParams);
    return result.rows;
  } finally {
    client.release();
  }
}

export default {
  upsertStepData,
  upsertWaterData,
  incrementWaterData,
  getWaterIntakeByDate,
  getWaterIntakesByDates,
  getWaterIntakeEntryById,
  getWaterIntakeEntryOwnerId,
  updateWaterIntake,
  deleteWaterIntake,
  insertWaterIntakeLog,
  upsertWaterIntakeSamples,
  getWaterIntakeLogByDate,
  getWaterIntakeLogsByDates,
  deleteWaterIntakeLog,
  getWaterIntakeLogEntryOwnerId,
  updateWaterIntakeLogTime,
  getWaterTotalsByDateRange,
  upsertCheckInMeasurements,
  bulkUpsertCheckInMeasurements,
  getCheckInMeasurementsByDate,
  updateCheckInMeasurements,
  deleteCheckInMeasurements,
  getCustomCategories,
  createCustomCategory,
  updateCustomCategory,
  deleteCustomCategory,
  getCustomMeasurementEntries,
  getCustomMeasurementEntriesByDate,
  getCheckInMeasurementsByDateRange,
  getCustomMeasurementsByDateRange,
  getCustomCategoryOwnerId,
  upsertCustomMeasurement,
  bulkUpsertCustomMeasurements,
  deleteCustomMeasurement,
  getCustomMeasurementOwnerId,
  getLatestMeasurement,
  getLatestCheckInMeasurementsOnOrBeforeDate,
  getExternalBmrForDate,
  getMostRecentMeasurement,
  getStepCaloriesForDate,
  getLatestWeightHeight,
  getExternalBmrByDateRange,
};
