import { withClient } from "../db/context.js";
import { todayInZone } from "@workspace/shared";
import { getPreferences } from "./profileService.js";
import { convertWeight, convertMeasurement } from "../utils/unitConversion.js";

/**
 * Gets today's date in YYYY-MM-DD format (UTC for consistency).
 */
function getTodayDate(): string {
  return todayInZone("UTC");
}

export async function logBiometrics(
  userId: string,
  params: {
    entry_date: string;
    weight?: number;
    weight_unit?: string;
    steps?: number;
    height?: number;
    height_unit?: string;
    neck?: number;
    waist?: number;
    hips?: number;
    measurements_unit?: string;
    body_fat_percentage?: number;
  }
): Promise<Record<string, unknown>> {
  const prefs = await getPreferences(userId);
  const defaultWeightUnit = (prefs.default_weight_unit as string) || "kg";
  const defaultMeasurementUnit = (prefs.default_measurement_unit as string) || "cm";

  // Convert to standard units (kg, cm) for storage
  const weight = params.weight != null 
    ? convertWeight(params.weight, params.weight_unit || defaultWeightUnit, "kg")
    : null;
  
  const height = params.height != null
    ? convertMeasurement(params.height, params.height_unit || defaultMeasurementUnit, "cm")
    : null;

  const mUnit = params.measurements_unit || defaultMeasurementUnit;
  const neck = params.neck != null ? convertMeasurement(params.neck, mUnit, "cm") : null;
  const waist = params.waist != null ? convertMeasurement(params.waist, mUnit, "cm") : null;
  const hips = params.hips != null ? convertMeasurement(params.hips, mUnit, "cm") : null;

  return withClient(userId, async (client) => {
    const result = await client.query(
      `INSERT INTO check_in_measurements (user_id, entry_date, weight, height, body_fat_percentage, neck, waist, hips, steps, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       ON CONFLICT (user_id, entry_date) DO UPDATE SET
         weight = COALESCE(EXCLUDED.weight, check_in_measurements.weight),
         height = COALESCE(EXCLUDED.height, check_in_measurements.height),
         body_fat_percentage = COALESCE(EXCLUDED.body_fat_percentage, check_in_measurements.body_fat_percentage),
         neck = COALESCE(EXCLUDED.neck, check_in_measurements.neck),
         waist = COALESCE(EXCLUDED.waist, check_in_measurements.waist),
         hips = COALESCE(EXCLUDED.hips, check_in_measurements.hips),
         steps = COALESCE(EXCLUDED.steps, check_in_measurements.steps),
         updated_at = NOW()
       RETURNING id, user_id, entry_date, weight, height, body_fat_percentage, neck, waist, hips, steps`,
      [
        userId,
        params.entry_date,
        weight,
        height,
        params.body_fat_percentage ?? null,
        neck,
        waist,
        hips,
        params.steps ?? null,
      ]
    );

    return result.rows[0];
  });
}


export async function logCustomMetric(
  userId: string,
  params: {
    category_name: string;
    value: string | number;
    unit?: string;
    notes?: string;
    entry_date: string;
  }
): Promise<Record<string, unknown>> {
  return withClient(userId, async (client) => {
    // Find category by name — actual table is custom_categories with measurement_type column
    const catResult = await client.query(
      "SELECT id, measurement_type FROM custom_categories WHERE LOWER(name) = LOWER($1) AND user_id = $2 LIMIT 1",
      [params.category_name, userId]
    );

    if (catResult.rows.length === 0) {
      throw new Error(`Category "${params.category_name}" not found. Create it first using the create_category action.`);
    }

    const category = catResult.rows[0];

    // Insert into custom_measurements (no unit column — measurement_type is on the category)
    const result = await client.query(
      `INSERT INTO custom_measurements (user_id, category_id, value, notes, entry_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id, user_id, category_id, value, notes, entry_date`,
      [userId, category.id, String(params.value), params.notes || null, params.entry_date]
    );

    return { ...result.rows[0], category_name: params.category_name, measurement_type: category.measurement_type };
  });
}

export async function listCategories(userId: string): Promise<Record<string, unknown>[]> {
  return withClient(userId, async (client) => {
    // Actual table is custom_categories with measurement_type (not unit)
    const result = await client.query(
      `SELECT id, name, measurement_type, created_at
       FROM custom_categories
       WHERE user_id = $1
       ORDER BY name ASC`,
      [userId]
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      category_name: row.name,
      measurement_type: row.measurement_type,
      created_at: row.created_at,
    }));
  });
}

export async function createCategory(
  userId: string,
  params: { category_name: string; unit?: string; data_type?: "numeric" | "boolean" }
): Promise<Record<string, unknown>> {
  return withClient(userId, async (client) => {
    // Actual table is custom_categories with name (not category_name), measurement_type, frequency, and data_type columns
    const result = await client.query(
      `INSERT INTO custom_categories (user_id, name, measurement_type, data_type, frequency, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'Daily', NOW(), NOW())
       RETURNING id, name, measurement_type, data_type, created_at`,
      [userId, params.category_name, params.unit || "unit", params.data_type || "numeric"]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      category_name: row.name,
      measurement_type: row.measurement_type,
      data_type: row.data_type,
      created_at: row.created_at,
    };
  });
}

export async function logMood(
  userId: string,
  params: { mood_value: number; notes?: string; entry_date: string }
): Promise<Record<string, unknown>> {
  return withClient(userId, async (client) => {
    const result = await client.query(
      `INSERT INTO mood_entries (user_id, mood_value, notes, entry_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (user_id, entry_date) DO UPDATE SET
         mood_value = EXCLUDED.mood_value,
         notes = EXCLUDED.notes,
         updated_at = NOW()
       RETURNING id, user_id, mood_value, notes, entry_date`,
      [userId, params.mood_value, params.notes || null, params.entry_date]
    );

    return result.rows[0];
  });
}

export async function logFasting(
  userId: string,
  params: {
    start_time: string;
    end_time?: string;
    fasting_status?: string;
    fasting_type?: string;
  }
): Promise<Record<string, unknown>> {
  return withClient(userId, async (client) => {
    // Actual table is fasting_logs with status column (not fasting_status)
    const result = await client.query(
      `INSERT INTO fasting_logs (user_id, start_time, end_time, status, fasting_type, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id, user_id, start_time, end_time, status, fasting_type`,
      [
        userId,
        params.start_time,
        params.end_time || null,
        params.fasting_status || "ACTIVE",
        params.fasting_type || null,
      ]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      user_id: row.user_id,
      start_time: row.start_time,
      end_time: row.end_time,
      fasting_status: row.status,
      fasting_type: row.fasting_type,
    };
  });
}

export async function logSleep(
  userId: string,
  params: {
    entry_date: string;
    duration_seconds?: number;
    sleep_score?: number;
    bedtime?: string;
    wake_time?: string;
    source?: string;
  }
): Promise<Record<string, unknown>> {
  return withClient(userId, async (client) => {
    let bedtime = params.bedtime;
    let wakeTime = params.wake_time;
    const duration = params.duration_seconds ?? 28800; // Default 8h

    if (!bedtime && !wakeTime) {
      // Default: wake time is 7 AM on entry_date, bedtime is 8h before
      const wake = new Date(`${params.entry_date}T07:00:00Z`);
      const bed = new Date(wake.getTime() - duration * 1000);
      wakeTime = wake.toISOString();
      bedtime = bed.toISOString();
    } else if (!bedtime && wakeTime) {
      const wake = new Date(wakeTime);
      const bed = new Date(wake.getTime() - duration * 1000);
      bedtime = bed.toISOString();
    } else if (bedtime && !wakeTime) {
      const bed = new Date(bedtime);
      const wake = new Date(bed.getTime() + duration * 1000);
      wakeTime = wake.toISOString();
    }

    // sleep_entries uses bedtime/wake_time as timestamptz and duration_in_seconds
    const result = await client.query(
      `INSERT INTO sleep_entries (user_id, entry_date, duration_in_seconds, sleep_score, bedtime, wake_time, source, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING id, user_id, entry_date, duration_in_seconds, sleep_score, bedtime, wake_time, source`,
      [
        userId,
        params.entry_date,
        duration,
        params.sleep_score ?? null,
        bedtime,
        wakeTime,
        params.source || "manual",
      ]
    );


    const row = result.rows[0];
    return {
      id: row.id,
      user_id: row.user_id,
      entry_date: row.entry_date,
      duration_seconds: row.duration_in_seconds,
      sleep_score: row.sleep_score,
      bedtime: row.bedtime ? new Date(row.bedtime).toISOString() : null,
      wake_time: row.wake_time ? new Date(row.wake_time).toISOString() : null,
      source: row.source,
    };
  });
}

export async function listCheckinDiary(
  userId: string,
  entryDate?: string
): Promise<Record<string, unknown>> {
  const date = entryDate || getTodayDate();

  return withClient(userId, async (client) => {
    // Biometrics
    const biometricsResult = await client.query(
      `SELECT id, entry_date, weight, height, body_fat_percentage, neck, waist, hips, steps
       FROM check_in_measurements
       WHERE entry_date = $1
       LIMIT 1`,
      [date]
    );

    // Mood entries
    const moodResult = await client.query(
      `SELECT id, mood_value, notes, entry_date
       FROM mood_entries
       WHERE entry_date = $1
       ORDER BY created_at ASC`,
      [date]
    );

    // Sleep entries — uses bedtime/wake_time (timestamptz) and duration_in_seconds
    const sleepResult = await client.query(
      `SELECT id, entry_date, duration_in_seconds, sleep_score, bedtime, wake_time, source
       FROM sleep_entries
       WHERE entry_date = $1
       ORDER BY created_at ASC`,
      [date]
    );

    // Fasting entries — actual table is fasting_logs with status column
    const fastingResult = await client.query(
      `SELECT id, start_time, end_time, status, fasting_type
       FROM fasting_logs
       WHERE start_time::date <= $1::date
         AND (end_time IS NULL OR end_time::date >= $1::date)
       ORDER BY start_time ASC`,
      [date]
    );

    // Custom metric entries — actual tables are custom_measurements + custom_categories
    const customResult = await client.query(
      `SELECT cm.id, cc.name AS category_name, cm.value, cc.measurement_type, cm.notes, cm.entry_date
       FROM custom_measurements cm
       JOIN custom_categories cc ON cm.category_id = cc.id
       WHERE cm.entry_date = $1
       ORDER BY cc.name ASC, cm.created_at ASC`,
      [date]
    );

    const prefs = await getPreferences(userId);
    const wUnit = (prefs.default_weight_unit as string) || "kg";
    const mUnit = (prefs.default_measurement_unit as string) || "cm";

    let biometrics = biometricsResult.rows[0] || null;
    if (biometrics) {
      biometrics = {
        ...biometrics,
        weight: biometrics.weight != null ? convertWeight(Number(biometrics.weight), "kg", wUnit) : null,
        height: biometrics.height != null ? convertMeasurement(Number(biometrics.height), "cm", mUnit) : null,
        neck: biometrics.neck != null ? convertMeasurement(Number(biometrics.neck), "cm", mUnit) : null,
        waist: biometrics.waist != null ? convertMeasurement(Number(biometrics.waist), "cm", mUnit) : null,
        hips: biometrics.hips != null ? convertMeasurement(Number(biometrics.hips), "cm", mUnit) : null,
        weight_unit: wUnit,
        measurement_unit: mUnit,
      };
    }

    return {
      date,
      biometrics,
      mood_entries: moodResult.rows,
      sleep_entries: sleepResult.rows.map((row: any) => ({
        ...row,
        duration_seconds: row.duration_in_seconds,
        bedtime: row.bedtime ? new Date(row.bedtime).toISOString() : null,
        wake_time: row.wake_time ? new Date(row.wake_time).toISOString() : null,
      })),
      fasting_entries: fastingResult.rows.map((row: any) => ({
        id: row.id,
        start_time: row.start_time,
        end_time: row.end_time,
        fasting_status: row.status,
        fasting_type: row.fasting_type,
      })),
      custom_metrics: customResult.rows.map((row: any) => ({
        id: row.id,
        category_name: row.category_name,
        value: row.value,
        measurement_type: row.measurement_type,
        notes: row.notes,
        entry_date: row.entry_date,
      })),
    };
  });
}

export async function getFastingStatus(userId: string): Promise<Record<string, unknown> | null> {
  return withClient(userId, async (client) => {
    const result = await client.query(
      `SELECT id, user_id, start_time, end_time, status, fasting_type, created_at
       FROM fasting_logs
       WHERE user_id = $1 AND status = 'ACTIVE'
       ORDER BY start_time DESC
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      user_id: row.user_id,
      start_time: row.start_time,
      end_time: row.end_time,
      fasting_status: row.status,
      fasting_type: row.fasting_type,
      created_at: row.created_at,
    };
  });
}

export async function getBiometricsHistory(
  userId: string,
  params: { start_date?: string; end_date?: string }
): Promise<Record<string, unknown>[]> {
  const prefs = await getPreferences(userId);
  const wUnit = (prefs.default_weight_unit as string) || "kg";
  const mUnit = (prefs.default_measurement_unit as string) || "cm";

  return withClient(userId, async (client) => {
    let query = `
      SELECT entry_date, weight, height, body_fat_percentage, neck, waist, hips, steps
      FROM check_in_measurements
      WHERE user_id = $1
    `;
    const queryParams: any[] = [userId];
    let paramIdx = 2;

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
      ...row,
      entry_date: new Date(row.entry_date).toISOString().split("T")[0],
      weight: row.weight != null ? convertWeight(Number(row.weight), "kg", wUnit) : null,
      height: row.height != null ? convertMeasurement(Number(row.height), "cm", mUnit) : null,
      neck: row.neck != null ? convertMeasurement(Number(row.neck), "cm", mUnit) : null,
      waist: row.waist != null ? convertMeasurement(Number(row.waist), "cm", mUnit) : null,
      hips: row.hips != null ? convertMeasurement(Number(row.hips), "cm", mUnit) : null,
      weight_unit: wUnit,
      measurement_unit: mUnit,
    }));
  });
}


