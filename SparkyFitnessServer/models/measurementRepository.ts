import { getClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'pg-f... Remove this comment to see the full error message
import format from 'pg-format';
import { CALORIE_CALCULATION_CONSTANTS } from '@workspace/shared';
// SECURITY: Whitelist allowed measurement columns to prevent SQL injection via dynamic keys
const ALLOWED_CHECK_IN_COLUMNS = [
  'weight',
  'neck',
  'waist',
  'hips',
  'steps',
  'height',
  'body_fat_percentage',
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
      // Sum all sources for the day
      query =
        'SELECT SUM(water_ml) as water_ml FROM water_intake WHERE user_id = $1 AND entry_date = $2';
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  categoryId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryHour: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryTimestamp: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  notes: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  frequency: any,
  source = 'manual'
) {
  const client = await getClient(actingUserId); // User-specific operation, using actingUserId for RLS context
  try {
    let query;
    let values;
    // Normalize entry_hour and entry_timestamp for 'Daily' frequency to prevent duplicates
    let normalizedEntryHour = entryHour;
    let normalizedEntryTimestamp = entryTimestamp;
    if (frequency === 'Daily') {
      normalizedEntryHour = 0; // Set hour to 0 for daily measurements
      // Normalize timestamp to the beginning of the day
      const dateObj = new Date(entryDate);
      dateObj.setUTCHours(0, 0, 0, 0);
      normalizedEntryTimestamp = dateObj.toISOString();
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
        notes,
        actingUserId,
        source,
      ];
    } else {
      // For 'Daily' and 'Hourly', check if an entry already exists for the given user, category, date, hour (if applicable) and source
      let existingEntryQuery = `
        SELECT id FROM custom_measurements
        WHERE user_id = $1 AND category_id = $2 AND entry_date = $3 AND source = $4
      `;
      const existingEntryValues = [userId, categoryId, entryDate, source];
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
          notes,
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
          notes,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  rows: Array<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    categoryId: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    entryDate: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    entryHour: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    entryTimestamp: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    notes: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    frequency: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    source?: any;
  }>
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
        const dateObj = new Date(row.entryDate);
        dateObj.setUTCHours(0, 0, 0, 0);
        normalizedEntryTimestamp = dateObj.toISOString();
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingByKey = new Map<string, any>();
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const match = existing.rows.find((dbRow: any) => {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writtenByInput: any[] = new Array(rows.length);
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
          updateIndexes.map((i) => existingByKey.get(keyByIndex[i]!).id),
          updateIndexes.map((i) => prepared[i].value),
          updateIndexes.map((i) => prepared[i].entryTimestamp),
          updateIndexes.map((i) => prepared[i].notes ?? null),
          updateIndexes.map((i) => prepared[i].source),
        ]
      );
      const updatedById = new Map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        updateResult.rows.map((row: any) => [row.id, row])
      );
      for (const index of updateIndexes) {
        writtenByInput[index] = updatedById.get(
          existingByKey.get(keyByIndex[index]!).id
        );
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
 * Compute step calories for a user on a given date.
 * Background steps = total check-in steps minus steps already logged in exercise sessions.
 * @param {string} userId
 * @param {string} date - YYYY-MM-DD
 * @param {Array} sessions - exercise sessions for the date (ExerciseSessionResponse[])
 * @returns {Promise<number>} step calories burned
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getStepCaloriesForDate(userId: any, date: any, sessions: any) {
  const client = await getClient(userId);
  try {
    const [checkInResult, weightResult, heightResult] = await Promise.all([
      client.query(
        'SELECT steps FROM check_in_measurements WHERE user_id = $1 AND entry_date = $2',
        [userId, date]
      ),
      client.query(
        `SELECT weight FROM check_in_measurements
         WHERE user_id = $1 AND weight IS NOT NULL
         ORDER BY entry_date DESC, updated_at DESC LIMIT 1`,
        [userId]
      ),
      client.query(
        `SELECT height FROM check_in_measurements
         WHERE user_id = $1 AND height IS NOT NULL
         ORDER BY entry_date DESC, updated_at DESC LIMIT 1`,
        [userId]
      ),
    ]);
    const totalSteps = parseInt(checkInResult.rows[0]?.steps ?? '0', 10) || 0;
    const weightKg =
      parseFloat(weightResult.rows[0]?.weight) ||
      CALORIE_CALCULATION_CONSTANTS.DEFAULT_WEIGHT_KG;
    const heightCm =
      parseFloat(heightResult.rows[0]?.height) ||
      CALORIE_CALCULATION_CONSTANTS.DEFAULT_HEIGHT_CM;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activitySteps = sessions.reduce((sum: any, s: any) => {
      if (s.type === 'preset') {
        return (
          sum +
          (s.exercises ?? []).reduce(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (eSum: any, e: any) =>
              eSum + (parseInt(String(e.steps ?? '0'), 10) || 0),
            0
          )
        );
      }
      return sum + (parseInt(String(s.steps ?? '0'), 10) || 0);
    }, 0);
    const backgroundSteps = Math.max(0, totalSteps - activitySteps);
    const strideLengthM =
      (heightCm * CALORIE_CALCULATION_CONSTANTS.STRIDE_LENGTH_MULTIPLIER) / 100;
    const distanceKm = (backgroundSteps * strideLengthM) / 1000;
    return Math.round(
      distanceKm *
        weightKg *
        CALORIE_CALCULATION_CONSTANTS.NET_CALORIES_PER_KG_PER_KM
    );
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

async function getWaterIntakeLogByDate(userId: string, date: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT id, user_id, entry_date, water_ml, container_id, container_name, source, created_at, logged_at
       FROM water_intake_entries
       WHERE user_id = $1 AND entry_date = $2
       ORDER BY logged_at DESC`,
      [userId, date]
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
      SELECT entry_date, SUM(water_ml) as total_ml
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
  getWaterIntakeByDate,
  getWaterIntakesByDates,
  getWaterIntakeEntryById,
  getWaterIntakeEntryOwnerId,
  updateWaterIntake,
  deleteWaterIntake,
  insertWaterIntakeLog,
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
};
