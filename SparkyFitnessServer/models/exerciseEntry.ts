import { compareByEntryTime, earliestEntryTime } from '@workspace/shared';
import { getClient } from '../db/poolManager.js';
import type { PoolClient } from 'pg';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'pg-f... Remove this comment to see the full error message
import format from 'pg-format';
import { log } from '../config/logging.js';
import exerciseRepository from './exercise.js';
import activityDetailsRepository from './activityDetailsRepository.js';
async function upsertExerciseEntryData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createdByUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exerciseId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  caloriesBurned: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  date: any,
  source = 'Health Data'
) {
  log('info', 'upsertExerciseEntryData received date parameter:', date);
  // Fall back to 'Health Data' for falsy sources (e.g. an explicit null bypasses the default param).
  // The raw value goes into the source column; clients map it to a display name.
  // HealthKit is shown to users as "Apple Health" in notes; other sources display as-is.
  const sourceValue = source || 'Health Data';
  const sourceLabel =
    sourceValue === 'HealthKit' ? 'Apple Health' : sourceValue;
  const client = await getClient(userId);
  let existingEntry;
  let exerciseName = 'Unknown Exercise'; // Default value
  try {
    // Fetch exercise name
    const exercise = await exerciseRepository.getExerciseById(
      exerciseId,
      userId
    );
    if (exercise) {
      exerciseName = exercise.name;
      log(
        'info',
        `Fetched exercise name: ${exerciseName} for exerciseId: ${exerciseId}`
      );
    } else {
      log(
        'warn',
        `Exercise with ID ${exerciseId} not found for user ${userId}. Using default name.`
      );
    }
    const result = await client.query(
      'SELECT id, calories_burned FROM exercise_entries WHERE user_id = $1 AND exercise_id = $2 AND entry_date = $3',
      [userId, exerciseId, date]
    );
    existingEntry = result.rows[0];
  } catch (error) {
    log(
      'error',
      'Error checking for existing active calories exercise entry or fetching exercise name:',
      error
    );
    throw new Error(
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `Failed to check existing active calories exercise entry or fetch exercise name: ${error.message}`,
      { cause: error }
    );
  } finally {
    client.release();
  }
  let result;
  if (existingEntry) {
    log(
      'info',
      `Existing active calories entry found for ${date}, updating calories from ${existingEntry.calories_burned} to ${caloriesBurned}.`
    );
    const updateClient = await getClient(userId);
    try {
      const updateResult = await updateClient.query(
        'UPDATE exercise_entries SET calories_burned = $1, notes = $2, updated_by_user_id = $3, exercise_name = $4, source = $5, updated_at = now() WHERE id = $6 RETURNING *',
        [
          caloriesBurned,
          `Active calories logged from ${sourceLabel} (updated).`,
          createdByUserId,
          exerciseName,
          sourceValue,
          existingEntry.id,
        ]
      );
      result = updateResult.rows[0];
    } catch (error) {
      log('error', 'Error updating active calories exercise entry:', error);
      throw new Error(
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        `Failed to update active calories exercise entry: ${error.message}`,
        { cause: error }
      );
    } finally {
      updateClient.release();
    }
  } else {
    log(
      'info',
      `No existing active calories entry found for ${date}, inserting new entry.`
    );
    const insertClient = await getClient(userId);
    try {
      const insertResult = await insertClient.query(
        `INSERT INTO exercise_entries (user_id, exercise_id, entry_date, calories_burned, duration_minutes, notes, created_by_user_id, exercise_name, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [
          userId,
          exerciseId,
          date,
          caloriesBurned,
          0,
          `Active calories logged from ${sourceLabel}.`,
          createdByUserId,
          exerciseName,
          sourceValue,
        ]
      );
      result = insertResult.rows[0];
    } catch (error) {
      log('error', 'Error inserting active calories exercise entry:', error);
      throw new Error(
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        `Failed to insert active calories exercise entry: ${error.message}`,
        { cause: error }
      );
    } finally {
      insertClient.release();
    }
  }
  return result;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function _getExerciseEntryByIdWithClient(client: any, id: any) {
  const result = await client.query(
    `SELECT ee.*,
             COALESCE(
               (SELECT json_agg(set_data ORDER BY set_data.set_number)
                FROM (
                  SELECT ees.id, ees.set_number, ees.set_type, ees.reps, ees.weight, ees.duration, ees.rest_time, ees.notes, ees.rpe, to_char(ees.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS completed_at, ees.is_pr, ees.distance
                  FROM exercise_entry_sets ees
                  WHERE ees.exercise_entry_id = ee.id
                ) AS set_data
               ), '[]'::json
             ) AS sets,
             ee.distance,
             ee.avg_heart_rate
      FROM exercise_entries ee
      WHERE ee.id = $1`,
    [id]
  );
  const exerciseEntry = result.rows[0];
  if (exerciseEntry && exerciseEntry.equipment) {
    try {
      exerciseEntry.equipment = JSON.parse(exerciseEntry.equipment);
    } catch (e) {
      log(
        'error',
        `Error parsing equipment for exercise entry ${exerciseEntry.id}:`,
        e
      );
      exerciseEntry.equipment = [];
    }
  }
  if (exerciseEntry && exerciseEntry.primary_muscles) {
    try {
      exerciseEntry.primary_muscles = JSON.parse(exerciseEntry.primary_muscles);
    } catch (e) {
      log(
        'error',
        `Error parsing primary_muscles for exercise entry ${exerciseEntry.id}:`,
        e
      );
      exerciseEntry.primary_muscles = [];
    }
  }
  if (exerciseEntry && exerciseEntry.secondary_muscles) {
    try {
      exerciseEntry.secondary_muscles = JSON.parse(
        exerciseEntry.secondary_muscles
      );
    } catch (e) {
      log(
        'error',
        `Error parsing secondary_muscles for exercise entry ${exerciseEntry.id}:`,
        e
      );
      exerciseEntry.secondary_muscles = [];
    }
  }
  if (exerciseEntry && exerciseEntry.instructions) {
    try {
      exerciseEntry.instructions = JSON.parse(exerciseEntry.instructions);
    } catch (e) {
      log(
        'error',
        `Error parsing instructions for exercise entry ${exerciseEntry.id}:`,
        e
      );
      exerciseEntry.instructions = [];
    }
  }
  if (exerciseEntry && exerciseEntry.images) {
    try {
      exerciseEntry.images = JSON.parse(exerciseEntry.images);
    } catch (e) {
      log(
        'error',
        `Error parsing images for exercise entry ${exerciseEntry.id}:`,
        e
      );
      exerciseEntry.images = [];
    }
  }
  return exerciseEntry;
}
// Snapshot list columns (equipment/muscles/instructions/images) are TEXT
// holding JSON. Merged values may be raw text read straight from the row
// (`SELECT *`) or arrays from the client/exercise refetch — only encode what
// isn't already encoded. Stringifying the raw text again would add an
// escaping layer on every save, doubling the stored value each time.
function toJsonColumnText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

// Workout telemetry columns added by 20260730000000_create_generic_health_and_workout_tables.sql
// and 20260731000000_complete_workout_telemetry.sql. Every provider sync path (currently Garmin)
// populates a subset of these keys on entryData/mergedData by name; keeping the INSERT/UPDATE
// column list driven off this single array is what stops a future addition from being silently
// dropped the way the original 26 columns were.
export const EXERCISE_ENTRY_TELEMETRY_COLUMNS = [
  'max_heart_rate',
  'heart_rate_recovery_1min',
  'avg_respiration_brpm',
  'max_respiration_brpm',
  'avg_speed_mps',
  'max_speed_mps',
  'avg_cadence',
  'max_cadence',
  'avg_power_watts',
  'max_power_watts',
  'normalized_power_watts',
  'tss_score',
  'intensity_factor',
  'ground_contact_time_ms',
  'vertical_oscillation_mm',
  'stride_length_cm',
  'avg_temperature_celsius',
  'max_temperature_celsius',
  'elevation_gain_meters',
  'elevation_loss_meters',
  'floors_climbed',
  'stroke_count',
  'training_load',
  'aerobic_training_effect',
  'anaerobic_training_effect',
  'vo2_max_estimate',
  'moving_time_seconds',
  'elapsed_time_seconds',
  'work_time_seconds',
  'resting_calories',
  'active_calories',
  'avg_moving_speed_mps',
  'min_elevation_meters',
  'max_elevation_meters',
  'weather_temp_celsius',
  'weather_condition',
  'weather_wind_speed_mps',
  'weather_humidity_percentage',
  'gear_name',
  'gear_external_id',
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function telemetryValuesFrom(source: any): unknown[] {
  return EXERCISE_ENTRY_TELEMETRY_COLUMNS.map((column) => {
    const value = source?.[column];
    return value === undefined ? null : value;
  });
}

/**
 * Targeted update of ONLY the telemetry columns on an existing exercise_entries row —
 * unlike updateExerciseEntry (a separate, older function that unconditionally nulls
 * every non-telemetry column it isn't given), this touches nothing else. Used by the
 * workout-telemetry backfill script to re-derive telemetry from the stored raw JSON
 * backup without disturbing the rest of the row.
 */
/** Column names this module is allowed to write via the telemetry-only update. */
type TelemetryColumn = (typeof EXERCISE_ENTRY_TELEMETRY_COLUMNS)[number];

/** Partial telemetry payload: any subset of the telemetry columns. */
export type TelemetryFields = Partial<Record<TelemetryColumn, unknown>>;

/** Minimal pg client surface needed to run a parameterised statement. */
export interface TelemetryUpdateClient {
  query: (text: string, values?: unknown[]) => Promise<unknown>;
}

async function _updateExerciseEntryTelemetryOnlyWithClient(
  client: TelemetryUpdateClient,
  id: string,
  userId: string,
  telemetryFields: TelemetryFields
) {
  // Only the columns actually supplied are written. Previously every telemetry
  // column was included, with absent ones coerced to null, so a partial payload
  // (a provider that reports power but not running dynamics, say) wiped the
  // columns it had nothing to say about.
  const columns = EXERCISE_ENTRY_TELEMETRY_COLUMNS.filter(
    (column) => telemetryFields?.[column] !== undefined
  );
  if (columns.length === 0) return;

  const setClause = columns
    .map((column, index) => `${column} = $${index + 1}`)
    .join(', ');
  await client.query(
    `UPDATE exercise_entries SET ${setClause}, updated_at = now()
     WHERE id = $${columns.length + 1} AND user_id = $${columns.length + 2}`,
    [...columns.map((column) => telemetryFields[column]), id, userId]
  );
}

async function updateExerciseEntryTelemetryOnly(
  id: string,
  userId: string,
  telemetryFields: TelemetryFields
) {
  const client = await getClient(userId);
  try {
    await _updateExerciseEntryTelemetryOnlyWithClient(
      client,
      id,
      userId,
      telemetryFields
    );
  } finally {
    client.release();
  }
}

async function _updateExerciseEntryWithClient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  id: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateData: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updatedByUserId: any,
  entrySource: string | undefined,
  // A caller that can recover from a vanished row (the sync path, which just
  // inserts a replacement) passes returnNullIfMissing and gets null instead of
  // an exception. Callers acting on a user-chosen entry leave it unset, because
  // for them a missing row really is an error.
  options: { returnNullIfMissing?: boolean } = {}
) {
  // Fetch existing entry to get current snapshot values if not provided in updateData
  const existingEntryResult = await client.query(
    'SELECT * FROM exercise_entries WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  if (existingEntryResult.rows.length === 0) {
    if (options.returnNullIfMissing) {
      return null;
    }
    throw new Error('Exercise entry not found for update.');
  }
  const currentEntry = existingEntryResult.rows[0];
  // Merge updateData with currentEntry to ensure all fields are present for the update statement
  // Prioritize updateData, then currentEntry, then defaults
  const mergedData = {
    ...currentEntry, // Start with existing data
    ...updateData, // Overlay with new data
    exercise_id:
      updateData.exercise_id !== undefined
        ? updateData.exercise_id
        : currentEntry.exercise_id,
    duration_minutes:
      updateData.duration_minutes !== undefined
        ? updateData.duration_minutes
        : currentEntry.duration_minutes,
    calories_burned:
      updateData.calories_burned !== undefined
        ? updateData.calories_burned
        : currentEntry.calories_burned,
    entry_date:
      updateData.entry_date !== undefined
        ? updateData.entry_date
        : currentEntry.entry_date,
    entry_time:
      updateData.entry_time !== undefined
        ? updateData.entry_time
        : currentEntry.entry_time,
    notes:
      updateData.notes !== undefined ? updateData.notes : currentEntry.notes,
    workout_plan_assignment_id:
      updateData.workout_plan_assignment_id !== undefined
        ? updateData.workout_plan_assignment_id
        : currentEntry.workout_plan_assignment_id,
    image_url:
      updateData.image_url === null
        ? null
        : updateData.image_url !== undefined
          ? updateData.image_url
          : currentEntry.image_url,
    distance:
      updateData.distance !== undefined
        ? updateData.distance
        : currentEntry.distance,
    avg_heart_rate:
      updateData.avg_heart_rate !== undefined
        ? updateData.avg_heart_rate
        : currentEntry.avg_heart_rate,
    sort_order:
      updateData.sort_order !== undefined
        ? updateData.sort_order
        : currentEntry.sort_order,
    superset_group:
      updateData.superset_group !== undefined
        ? updateData.superset_group
        : currentEntry.superset_group,
    // Snapshot fields - these should ideally come from the exercise itself if exercise_id is updated
    exercise_name: updateData.exercise_name || currentEntry.exercise_name,
    calories_per_hour:
      updateData.calories_per_hour || currentEntry.calories_per_hour,
    category: updateData.category || currentEntry.category,
    modality: updateData.modality || currentEntry.modality,
    source: entrySource || currentEntry.source, // Use provided entrySource or existing
    source_id: updateData.source_id || currentEntry.source_id,
    force: updateData.force || currentEntry.force,
    level: updateData.level || currentEntry.level,
    mechanic: updateData.mechanic || currentEntry.mechanic,
    equipment: updateData.equipment || currentEntry.equipment,
    primary_muscles: updateData.primary_muscles || currentEntry.primary_muscles,
    secondary_muscles:
      updateData.secondary_muscles || currentEntry.secondary_muscles,
    instructions: updateData.instructions || currentEntry.instructions,
    images: updateData.images || currentEntry.images,
    water_estimated:
      updateData.water_estimated !== undefined
        ? updateData.water_estimated
        : currentEntry.water_estimated,
  };
  // If exercise_id is explicitly updated, re-fetch snapshot data from the exercise
  if (
    updateData.exercise_id &&
    updateData.exercise_id !== currentEntry.exercise_id
  ) {
    const exercise = await exerciseRepository.getExerciseById(
      updateData.exercise_id,
      userId
    );
    if (!exercise) {
      throw new Error('Exercise not found for snapshot update.');
    }
    mergedData.exercise_name = exercise.name;
    mergedData.calories_per_hour = exercise.calories_per_hour;
    mergedData.category = exercise.category;
    mergedData.modality = exercise.modality;
    mergedData.source_id = exercise.source_id;
    mergedData.force = exercise.force;
    mergedData.level = exercise.level;
    mergedData.mechanic = exercise.mechanic;
    mergedData.equipment = exercise.equipment;
    mergedData.primary_muscles = exercise.primary_muscles;
    mergedData.secondary_muscles = exercise.secondary_muscles;
    mergedData.instructions = exercise.instructions;
    mergedData.images = exercise.images;
  }
  // Telemetry columns: prefer an explicitly-provided updateData value, otherwise keep
  // whatever is already on the row. Using a raw object spread for these would let an
  // `undefined` key present in updateData (e.g. a metric Garmin didn't compute for this
  // activity type) silently blank out a previously-synced value.
  for (const column of EXERCISE_ENTRY_TELEMETRY_COLUMNS) {
    mergedData[column] =
      updateData[column] !== undefined
        ? updateData[column]
        : currentEntry[column];
  }
  const telemetryParams = telemetryValuesFrom(mergedData);
  const telemetrySetClause = EXERCISE_ENTRY_TELEMETRY_COLUMNS.map(
    (column, index) => `${column} = $${32 + index}`
  ).join(',\n      ');
  const updateResult = await client.query(
    `UPDATE exercise_entries SET
      exercise_id = $1,
      duration_minutes = $2,
      calories_burned = $3,
      entry_date = $4,
      notes = $5,
      workout_plan_assignment_id = $6,
      image_url = $7,
      distance = $8,
      avg_heart_rate = $9,
      updated_by_user_id = $10,
      exercise_name = $11,
      calories_per_hour = $12,
      category = $13,
      source = $14,
      source_id = $15,
      force = $16,
      level = $17,
      mechanic = $18,
      equipment = $19,
      primary_muscles = $20,
      secondary_muscles = $21,
      instructions = $22,
      images = $23,
      sort_order = $24,
      steps = $25,
      water_estimated = $26,
      superset_group = $27,
      entry_time = $30,
      modality = $31,
      ${telemetrySetClause},
      updated_at = now()
    WHERE id = $28 AND user_id = $29
    RETURNING id`,
    [
      mergedData.exercise_id,
      mergedData.duration_minutes,
      mergedData.calories_burned,
      mergedData.entry_date,
      mergedData.notes,
      mergedData.workout_plan_assignment_id,
      mergedData.image_url,
      mergedData.distance,
      mergedData.avg_heart_rate,
      updatedByUserId,
      mergedData.exercise_name,
      mergedData.calories_per_hour,
      mergedData.category,
      mergedData.source,
      mergedData.source_id,
      mergedData.force,
      mergedData.level,
      mergedData.mechanic,
      toJsonColumnText(mergedData.equipment),
      toJsonColumnText(mergedData.primary_muscles),
      toJsonColumnText(mergedData.secondary_muscles),
      toJsonColumnText(mergedData.instructions),
      toJsonColumnText(mergedData.images),
      mergedData.sort_order || 0,
      mergedData.steps || null,
      mergedData.water_estimated || null,
      mergedData.superset_group ?? null,
      id,
      userId,
      mergedData.entry_time ?? null,
      mergedData.modality ?? null,
      ...telemetryParams,
    ]
  );
  // The row can be deleted by a competing writer between the existence check
  // above and this UPDATE: a successful UPDATE would hold a row lock until
  // commit, so the only interleaving that reaches here with no row is one where
  // the delete committed first. Left unchecked the UPDATE affects zero rows
  // without erroring, and the child writes below then run against an id that no
  // longer exists. Because the sets and activity-detail RLS policies resolve
  // their parent through an EXISTS subquery, that surfaces as a row-level
  // security violation rather than the foreign-key error it really is.
  if (updateResult.rowCount === 0) {
    if (options.returnNullIfMissing) {
      return null;
    }
    throw new Error('Exercise entry not found for update.');
  }
  // Handle sets update
  if (updateData.sets !== undefined) {
    // Only modify sets if they are explicitly provided
    await client.query(
      'DELETE FROM exercise_entry_sets WHERE exercise_entry_id = $1',
      [id]
    );
    if (Array.isArray(updateData.sets) && updateData.sets.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const setsValues = updateData.sets.map((set: any) => [
        id,
        set.set_number,
        set.set_type,
        set.reps,
        set.weight,
        set.duration,
        set.rest_time,
        set.notes,
        set.rpe,
        set.completed_at ?? null,
        set.is_pr ?? false,
        set.distance ?? null,
      ]);
      const setsQuery = format(
        'INSERT INTO exercise_entry_sets (exercise_entry_id, set_number, set_type, reps, weight, duration, rest_time, notes, rpe, completed_at, is_pr, distance) VALUES %L',
        setsValues
      );
      await client.query(setsQuery);
    }
  }
  return _getExerciseEntryByIdWithClient(client, id);
}
// _updateExerciseEntryWithClient hands back the whole entry row, but the create
// path below only needs the identity of the row it touched: the full entry is
// re-read through _getExerciseEntryByIdWithClient before being returned.
interface MatchedExerciseEntry {
  id: string;
}

/**
 * Serializes destructive range deletes and deduplicating writes for one
 * user's provider source until the surrounding transaction ends.
 */
async function acquireExerciseEntrySyncLockWithClient(
  client: PoolClient,
  userId: string,
  entrySource: string
): Promise<void> {
  const key = `exercise-entry-sync:${userId}:${entrySource}`;
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
}

async function _createExerciseEntryWithClient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryData: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createdByUserId: any,
  entrySource = 'Manual',
  exercisePresetEntryId: string | null = null,
  options: { skipDuplicateCheck?: boolean } = {}
) {
  try {
    // Check for existing entry
    // treat entries without a preset ID as unique if their exercise_id, entry_date, and source match.
    // For entries within a preset, we always allow duplicates (no uniqueness check).
    // Callers that must always insert (e.g. the chatbot, where logging the
    // same exercise twice in a day means two workouts) pass skipDuplicateCheck.
    const syncDuplicateCheck = entryData.source_id ? true : false;
    if (syncDuplicateCheck) {
      await acquireExerciseEntrySyncLockWithClient(client, userId, entrySource);
    }
    const skipManualDuplicateCheck = [
      'HealthKit',
      'Health Connect',
      'Fitbit',
      'Strava',
    ].includes(entrySource);
    // Both deduplication lookups live behind one function so that the update
    // path can re-run exactly the lookup that produced its match. Returns the
    // id of the matched entry, or null when this is a genuinely new one.
    const findExistingEntryId = async (): Promise<string | null> => {
      let existingEntryResult;
      // 1. Attempt precise sync deduplication via source_id if available
      if (syncDuplicateCheck) {
        existingEntryResult = await client.query(
          'SELECT id FROM exercise_entries WHERE user_id = $1 AND source = $2 AND source_id = $3',
          [userId, entrySource, entryData.source_id]
        );
      }
      // 2. If no source_id match and NOT a sync source, fall back to "Manual" deduplication (name/date).
      // Skip this fallback when source_id was provided: a source_id miss means it's a genuinely new
      // activity (different activityId), so we must INSERT rather than match on exercise_id + date.
      if (
        !existingEntryResult?.rows?.length &&
        !exercisePresetEntryId &&
        !skipManualDuplicateCheck &&
        !syncDuplicateCheck &&
        !options.skipDuplicateCheck
      ) {
        if (entryData.workout_plan_assignment_id) {
          // If it's linked to a workout plan assignment, it's unique by that assignment ID and date.
          existingEntryResult = await client.query(
            'SELECT id FROM exercise_entries WHERE user_id = $1 AND workout_plan_assignment_id = $2 AND entry_date = $3',
            [userId, entryData.workout_plan_assignment_id, entryData.entry_date]
          );
        } else {
          // For manual entries (no assignment), keep traditional uniqueness check by exercise_id and date.
          // We explicitly ensure workout_plan_assignment_id is NULL to avoid matching template-generated entries.
          existingEntryResult = await client.query(
            'SELECT id FROM exercise_entries WHERE user_id = $1 AND exercise_id = $2 AND entry_date = $3 AND source = $4 AND exercise_preset_entry_id IS NULL AND workout_plan_assignment_id IS NULL',
            [userId, entryData.exercise_id, entryData.entry_date, entrySource]
          );
        }
      }
      return existingEntryResult?.rows?.[0]?.id ?? null;
    };
    let newEntryId: string;
    let operation: 'created' | 'updated';
    // The matched row can be gone by the time we update it. A provider sync
    // range-deletes by source and day span before re-inserting, so an
    // overlapping sync of the same source is enough. For delete-then-insert
    // ingest a vanished parent means "insert", not "fail", so fall through to
    // the create path below rather than writing children against a dead id.
    let updatedEntry: MatchedExerciseEntry | null = null;
    const existingEntryId = await findExistingEntryId();
    if (existingEntryId) {
      log(
        'info',
        `Existing exercise entry found for user ${userId}, exercise ${entryData.exercise_id}, date ${entryData.entry_date}, source ${entrySource}. Updating entry ${existingEntryId}.`
      );
      updatedEntry = await _updateExerciseEntryWithClient(
        client,
        existingEntryId,
        userId,
        entryData,
        createdByUserId,
        entrySource,
        { returnNullIfMissing: true }
      );
      if (!updatedEntry) {
        // The writer that deleted the row is a delete-then-insert sync, so it
        // may already have committed its own replacement for the same natural
        // key. exercise_entries has no unique constraint to catch a duplicate,
        // so inserting blindly here would store the workout twice. Re-run the
        // same lookup and update that row instead. Once only: a sync that keeps
        // racing falls through to the insert rather than spinning, which leaves
        // a much smaller window than the one this closes.
        const replacementEntryId = await findExistingEntryId();
        log(
          'warn',
          `Exercise entry ${existingEntryId} was deleted by a concurrent writer before it could be updated (user ${userId}, source ${entrySource}, date ${entryData.entry_date}). ${
            replacementEntryId
              ? `Updating the replacement entry ${replacementEntryId} that writer left behind.`
              : 'Inserting a replacement.'
          }`
        );
        if (replacementEntryId) {
          updatedEntry = await _updateExerciseEntryWithClient(
            client,
            replacementEntryId,
            userId,
            entryData,
            createdByUserId,
            entrySource,
            { returnNullIfMissing: true }
          );
        }
      }
    }
    if (updatedEntry) {
      newEntryId = updatedEntry.id;
      operation = 'updated';
    } else {
      // No existing entry, create a new one
      // 1. Fetch the exercise details to create the snapshot
      const exerciseSnapshotQuery = await client.query(
        `SELECT name, calories_per_hour, category, source, source_id, force, level, mechanic, equipment, primary_muscles, secondary_muscles, instructions, images, modality
         FROM exercises WHERE id = $1`,
        [entryData.exercise_id]
      );
      if (exerciseSnapshotQuery.rows.length === 0) {
        throw new Error('Exercise not found for snapshotting.');
      }
      const snapshot = exerciseSnapshotQuery.rows[0];
      // 2. Insert the exercise entry with the snapshot data. A client-provided
      // entry id (a new app adds an exercise mid-workout with its own uuid via
      // create-in-reconcile) is inserted explicitly so the entry keeps its
      // identity across saves; otherwise the column defaults to
      // gen_random_uuid(). The id is appended last to keep the base column
      // list unchanged.
      const entryValues = [
        userId,
        entryData.exercise_id,
        entryData.duration_minutes || 0, // Ensure duration_minutes is not null
        entryData.calories_burned || 0,
        entryData.entry_date,
        entryData.notes,
        entryData.workout_plan_assignment_id || null,
        entryData.image_url || null,
        createdByUserId,
        entryData.exercise_name || snapshot.name, // exercise_name
        snapshot.calories_per_hour,
        snapshot.category,
        entrySource,
        entryData.source_id || snapshot.source_id, // Use entryData.source_id if available (instance ID), fallback to snapshot (def ID)
        snapshot.force,
        snapshot.level,
        snapshot.mechanic,
        snapshot.equipment,
        snapshot.primary_muscles,
        snapshot.secondary_muscles,
        snapshot.instructions,
        snapshot.images,
        entryData.distance ?? null, // Ensure distance is not undefined
        entryData.avg_heart_rate || null, // Ensure avg_heart_rate is not undefined
        exercisePresetEntryId, // New parameter
        entryData.sort_order || 0,
        entryData.steps || null,
        entryData.water_estimated || null,
        entryData.superset_group ?? null,
        entryData.entry_time ?? null,
        snapshot.modality,
        ...telemetryValuesFrom(entryData),
      ];
      const hasClientId = entryData.id !== undefined && entryData.id !== null;
      const idColumn = hasClientId ? ', id' : '';
      if (hasClientId) entryValues.push(entryData.id);
      const baseColumns =
        'user_id, exercise_id, duration_minutes, calories_burned, entry_date, notes, ' +
        'workout_plan_assignment_id, image_url, created_by_user_id, ' +
        'exercise_name, calories_per_hour, category, source, source_id, force, level, mechanic, ' +
        'equipment, primary_muscles, secondary_muscles, instructions, images, ' +
        'distance, avg_heart_rate, exercise_preset_entry_id, sort_order, steps, water_estimated, ' +
        'superset_group, entry_time, modality';
      const allColumns = `${baseColumns}, ${EXERCISE_ENTRY_TELEMETRY_COLUMNS.join(', ')}${idColumn}`;
      const placeholders = entryValues
        .map((_, index) => `$${index + 1}`)
        .join(', ');
      const entryResult = await client.query(
        `INSERT INTO exercise_entries (${allColumns})
         VALUES (${placeholders}) RETURNING id`,
        entryValues
      );
      newEntryId = entryResult.rows[0].id;
      if (entryData.sets && entryData.sets.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const setsValues = entryData.sets.map((set: any) => [
          newEntryId,
          set.set_number,
          set.set_type,
          set.reps,
          set.weight,
          set.duration,
          set.rest_time,
          set.notes,
          set.rpe,
          set.completed_at ?? null,
          set.is_pr ?? false,
          set.distance ?? null,
        ]);
        const setsQuery = format(
          'INSERT INTO exercise_entry_sets (exercise_entry_id, set_number, set_type, reps, weight, duration, rest_time, notes, rpe, completed_at, is_pr, distance) VALUES %L',
          setsValues
        );
        await client.query(setsQuery);
      }
      operation = 'created';
    }
    const entry = await _getExerciseEntryByIdWithClient(client, newEntryId);
    return { entry, operation };
  } catch (error) {
    log(
      'error',
      'Error creating/updating exercise entry with snapshot:',
      error
    );
    throw error;
  }
}
// The raw provider dump that belongs with the entry being written. A caller
// that has one passes it here instead of storing it afterwards, so the pair is
// written in a single transaction: exercise_entry_activity_details resolves its
// parent through an EXISTS subquery in its RLS policy, so an insert against a
// parent that is committed but has since been deleted fails as a row-level
// security violation and the detail is silently lost.
interface ExerciseEntryActivityDetail {
  provider_name: string;
  detail_type: string;
  // Either the object itself or its JSON text; the repository normalises both.
  detail_data: unknown;
  created_by_user_id: string;
  updated_by_user_id: string;
}
async function createExerciseEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryData: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createdByUserId: any,
  entrySource = 'Manual',
  exercisePresetEntryId: string | null = null,
  options: {
    skipDuplicateCheck?: boolean;
    activityDetail?: ExerciseEntryActivityDetail | null;
  } = {}
) {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    const { entry, operation } = await _createExerciseEntryWithClient(
      client,
      userId,
      entryData,
      createdByUserId,
      entrySource,
      exercisePresetEntryId,
      options
    );
    if (options.activityDetail) {
      if (operation === 'updated') {
        await activityDetailsRepository._deleteActivityDetailsByEntryIdAndProviderWithClient(
          client,
          userId,
          entry.id,
          options.activityDetail.provider_name,
          options.activityDetail.detail_type
        );
      }
      await activityDetailsRepository._createActivityDetailWithClient(client, {
        ...options.activityDetail,
        exercise_entry_id: entry.id,
      });
    }
    await client.query('COMMIT');
    return entry;
  } catch (error) {
    await client.query('ROLLBACK');
    log(
      'error',
      'Error creating/updating exercise entry with snapshot:',
      error
    );
    throw error;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getExerciseEntryById(id: any, userId: any) {
  const client = await getClient(userId);
  try {
    return _getExerciseEntryByIdWithClient(client, id);
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getExerciseEntryOwnerId(id: any, userId: any) {
  const client = await getClient(userId);
  try {
    const entryResult = await client.query(
      'SELECT user_id FROM exercise_entries WHERE id = $1',
      [id]
    );
    return entryResult.rows[0]?.user_id;
  } finally {
    client.release();
  }
}

async function updateExerciseEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  id: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateData: any
) {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    // Pass the caller's source through as-is (possibly undefined). Defaulting
    // to 'manual' here reassigned every provider-synced entry to 'manual' on
    // any diary edit, which silently broke "delete my <provider> data" for that
    // row. _updateExerciseEntryWithClient already falls back to the entry's
    // existing source when this is absent.
    const updatedEntry = await _updateExerciseEntryWithClient(
      client,
      id,
      userId,
      updateData,
      actingUserId,
      updateData.source
    );
    await client.query('COMMIT');
    return updatedEntry;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
async function updateExerciseEntriesDateByPresetEntryIdWithClient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  presetEntryId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updatedByUserId: any
) {
  await client.query(
    `UPDATE exercise_entries
     SET entry_date = $1,
         updated_by_user_id = $2,
         updated_at = now()
     WHERE user_id = $3 AND exercise_preset_entry_id = $4`,
    [entryDate, updatedByUserId, userId, presetEntryId]
  );
}
/**
 * The single non-null workout plan assignment id shared by the child
 * exercise_entries of a grouped session, or null when the session is not
 * linked to a workout plan. Throws if the children carry more than one
 * distinct non-null assignment id.
 */
async function getWorkoutPlanAssignmentIdByPresetEntryIdWithClient(
  client: PoolClient,
  userId: string,
  presetEntryId: string
): Promise<number | null> {
  interface AssignmentRow {
    workout_plan_assignment_id: number;
  }
  const result = await client.query<AssignmentRow>(
    `SELECT DISTINCT workout_plan_assignment_id
       FROM exercise_entries
      WHERE user_id = $1
        AND exercise_preset_entry_id = $2
        AND workout_plan_assignment_id IS NOT NULL`,
    [userId, presetEntryId]
  );

  if (result.rows.length > 1) {
    throw new Error(
      'Grouped workout contains multiple workout plan assignment ids.'
    );
  }

  return result.rows[0]?.workout_plan_assignment_id ?? null;
}
async function deleteExerciseEntriesByPresetEntryIdWithClient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  presetEntryId: any
) {
  await client.query(
    `DELETE FROM exercise_entries
     WHERE user_id = $1 AND exercise_preset_entry_id = $2`,
    [userId, presetEntryId]
  );
}
async function _deleteExerciseEntryWithClient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  id: any
) {
  const result = await client.query(
    'DELETE FROM exercise_entries WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, userId]
  );
  return result.rowCount > 0;
}

// Reconcile exercise_entry_sets rows against an incoming payload,
// preserving existing set IDs so clients can key UI state off them.
// Callers must guarantee that exerciseEntryId belongs to the current RLS user.
async function _reconcileExerciseEntrySetsWithClient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exerciseEntryId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sets: any
) {
  const incoming = Array.isArray(sets) ? sets : [];

  const existingResult = await client.query(
    'SELECT id FROM exercise_entry_sets WHERE exercise_entry_id = $1',
    [exerciseEntryId]
  );
  const existingIds = new Set(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    existingResult.rows.map((row: any) => row.id)
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inserts: any[] = [];
  const referencedIds = new Set();

  for (const set of incoming) {
    if (set.id !== undefined && set.id !== null) {
      const numericId =
        typeof set.id === 'number' ? set.id : Number.parseInt(set.id, 10);
      if (!Number.isFinite(numericId) || !existingIds.has(numericId)) {
        log(
          'warn',
          `Rejected set reconcile: set id ${set.id} not found on exercise entry ${exerciseEntryId}`
        );
        const error = new Error('Set does not belong to this exercise entry.');
        // @ts-expect-error TS(2339): Property 'status' does not exist on type 'Error'.
        error.status = 400;
        throw error;
      }
      referencedIds.add(numericId);
      updates.push({ ...set, id: numericId });
    } else {
      inserts.push(set);
    }
  }

  const idsToDelete = [...existingIds].filter((id) => !referencedIds.has(id));

  if (idsToDelete.length > 0) {
    await client.query(
      'DELETE FROM exercise_entry_sets WHERE id = ANY($1::int[]) AND exercise_entry_id = $2',
      [idsToDelete, exerciseEntryId]
    );
  }

  for (const set of updates) {
    await client.query(
      `UPDATE exercise_entry_sets
       SET set_number = $1,
           set_type = $2,
           reps = $3,
           weight = $4,
           duration = $5,
           rest_time = $6,
           notes = $7,
           rpe = $8,
           completed_at = $9,
           is_pr = $10,
           distance = $11
       WHERE id = $12 AND exercise_entry_id = $13`,
      [
        set.set_number,
        set.set_type ?? null,
        set.reps ?? null,
        set.weight ?? null,
        set.duration ?? null,
        set.rest_time ?? null,
        set.notes ?? null,
        set.rpe ?? null,
        set.completed_at ?? null,
        set.is_pr ?? false,
        set.distance ?? null,
        set.id,
        exerciseEntryId,
      ]
    );
  }

  if (inserts.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const setsValues = inserts.map((set: any) => [
      exerciseEntryId,
      set.set_number,
      set.set_type ?? null,
      set.reps ?? null,
      set.weight ?? null,
      set.duration ?? null,
      set.rest_time ?? null,
      set.notes ?? null,
      set.rpe ?? null,
      set.completed_at ?? null,
      set.is_pr ?? false,
      set.distance ?? null,
    ]);
    const setsQuery = format(
      'INSERT INTO exercise_entry_sets (exercise_entry_id, set_number, set_type, reps, weight, duration, rest_time, notes, rpe, completed_at, is_pr, distance) VALUES %L',
      setsValues
    );
    await client.query(setsQuery);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteExerciseEntry(id: any, userId: any) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'DELETE FROM exercise_entries WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getExerciseEntriesByDate(userId: any, selectedDate: any) {
  const client = await getClient(userId);
  try {
    // 1. Fetch all exercise preset entries for the given date and user
    const presetEntriesResult = await client.query(
      `SELECT id, workout_preset_id, name, description, notes, created_at, source
       FROM exercise_preset_entries
       WHERE user_id = $1 AND entry_date = $2
       ORDER BY created_at ASC`,
      [userId, selectedDate]
    );
    const presetEntries = presetEntriesResult.rows;
    // 2. Fetch all individual exercise entries for the given date and user
    const individualEntriesResult = await client.query(
      `SELECT
         ee.*,
         COALESCE(
           (SELECT json_agg(set_data ORDER BY set_data.set_number)
            FROM (
              SELECT ees.id, ees.set_number, ees.set_type, ees.reps, ees.weight, ees.duration, ees.rest_time, ees.notes, ees.rpe, to_char(ees.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS completed_at, ees.is_pr, ees.distance
              FROM exercise_entry_sets ees
              WHERE ees.exercise_entry_id = ee.id
            ) AS set_data
           ), '[]'::json
          ) AS sets,
          ee.distance,
          ee.avg_heart_rate
        FROM exercise_entries ee
        WHERE ee.user_id = $1 AND ee.entry_date = $2
        ORDER BY ee.sort_order ASC, ee.created_at ASC`,
      [userId, selectedDate]
    );
    const allExerciseEntries = individualEntriesResult.rows;
    // Map to store grouped exercises
    const groupedEntries = new Map();
    // Initialize grouped entries with preset entries
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    presetEntries.forEach((preset: any) => {
      groupedEntries.set(preset.id, {
        type: 'preset',
        id: preset.id,
        workout_preset_id: preset.workout_preset_id,
        name: preset.name,
        description: preset.description,
        notes: preset.notes,
        created_at: preset.created_at,
        source: preset.source,
        exercises: [], // This will hold the individual exercise entries
        total_duration_minutes: 0, // Initialize total duration for the preset
      });
    });
    // Batched lookup of activity details for every entry/preset on this day in one
    // query, instead of one query per entry. Raw provider sync dumps (Garmin's
    // full_activity_data/full_workout_data) come back with detail_data stripped —
    // the diary only needs to know a raw dump exists (to offer it as an on-demand
    // reference), not ship it inline; calculations must use the relational columns.
    const {
      byEntryId: activityDetailsByEntryId,
      byPresetEntryId: activityDetailsByPresetId,
    } =
      await activityDetailsRepository.getActivityDetailsSummaryForEntriesAndPresets(
        userId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        allExerciseEntries.map((row: any) => row.id),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        presetEntries.map((preset: any) => preset.id)
      );

    // Process individual exercise entries
    const entriesWithDetails =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      allExerciseEntries.map((row: any) => {
        const activityDetails = activityDetailsByEntryId.get(row.id) || [];

        const {
          exercise_name,
          category,
          modality,
          calories_per_hour,
          source,
          source_id,
          force,
          level,
          mechanic,
          equipment,
          primary_muscles,
          secondary_muscles,
          instructions,
          images,
          ...entryData
        } = row;

        return {
          ...entryData,
          image_url: row.image_url,
          name: exercise_name,
          exercise_snapshot: {
            // Renamed from 'exercises' to 'exercise_snapshot' to avoid confusion with the grouping
            id: entryData.exercise_id, // Add the exercise_id here
            name: exercise_name,
            category: category,
            modality: modality,
            calories_per_hour: calories_per_hour,
            source: source,
            source_id: source_id,
            force: force,
            level: level,
            mechanic: mechanic,
            equipment: equipment,
            primary_muscles: primary_muscles,
            secondary_muscles: secondary_muscles,
            instructions: instructions,
            images: images,
          },
          activity_details: activityDetails,
        };
      });
    // Group exercises under their respective preset entries or as individual entries
    const finalEntriesMap = new Map(); // Use a Map to ensure unique top-level entries
    // Process individual exercise entries first, associating them with presets
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    entriesWithDetails.forEach((entry: any) => {
      if (
        entry.exercise_preset_entry_id &&
        groupedEntries.has(entry.exercise_preset_entry_id)
      ) {
        const preset = groupedEntries.get(entry.exercise_preset_entry_id);
        preset.exercises.push(entry);
        preset.exercises.sort(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (a: any, b: any) =>
            compareByEntryTime(a.entry_time, b.entry_time) ||
            (a.sort_order || 0) - (b.sort_order || 0) ||
            // @ts-expect-error TS(2362): The left-hand side of an arithmetic operation must... Remove this comment to see the full error message
            new Date(a.created_at) - new Date(b.created_at)
        ); // Ensure sub-exercises are sorted
        preset.total_duration_minutes += entry.duration_minutes || 0; // Sum duration for the preset
      } else {
        // Add individual exercises that are not part of any preset
        finalEntriesMap.set(entry.id, {
          type: 'individual',
          ...entry,
        });
      }
    });
    // Now add the preset entries (which now contain their associated exercises) to the final list
    for (const preset of groupedEntries.values()) {
      preset.activity_details = activityDetailsByPresetId.get(preset.id) || [];
      finalEntriesMap.set(preset.id, preset); // Add preset to map, overwriting if already present (shouldn't happen for presets)
    }
    const finalEntries = Array.from(finalEntriesMap.values()); // Convert map values to an array

    const getEntryTime = (entry: any) => {
      if (entry.type === 'individual') {
        return entry.entry_time || null;
      }
      if (entry.type === 'preset') {
        return earliestEntryTime(entry.exercises || []);
      }
      return null;
    };

    // Entries with a time sort chronologically first; the rest keep the old
    // sort_order + created_at ordering
    finalEntries.sort(
      (a, b) =>
        compareByEntryTime(getEntryTime(a), getEntryTime(b)) ||
        (a.sort_order || 0) - (b.sort_order || 0) ||
        // @ts-expect-error TS(2362): Date arithmetic
        new Date(a.created_at) - new Date(b.created_at)
    );
    log(
      'debug',
      `getExerciseEntriesByDate: Returning grouped entries for user ${userId} on ${selectedDate}:`,
      finalEntries
    );
    return finalEntries;
  } finally {
    client.release();
  }
}

/**
 * Progress rows for the reports dashboard. `has_telemetry` is derived rather
 * than selecting the ~40 telemetry columns, because the only question the
 * dashboard asks is whether an entry has anything chartable. The EXISTS clauses
 * are load-bearing: a provider-synced workout can carry all of its telemetry as
 * GPS/lap rows while every summary column on the entry itself stays null.
 */
async function getExerciseProgressData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exerciseId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT
         ee.id AS exercise_entry_id,
         ee.entry_date,
         ee.duration_minutes,
         ee.calories_burned,
         ee.notes,
         ee.image_url,
         ee.distance,
         ee.avg_heart_rate,
         ee.source AS provider_name,
         ee.exercise_preset_entry_id,
         epe.name AS exercise_preset_entry_name,
         e.category,
         (
           ee.avg_heart_rate IS NOT NULL
           OR ee.max_heart_rate IS NOT NULL
           OR ee.avg_speed_mps IS NOT NULL
           OR ee.avg_power_watts IS NOT NULL
           OR ee.elevation_gain_meters IS NOT NULL
           OR EXISTS (
             SELECT 1 FROM exercise_entry_gps_points eegp
              WHERE eegp.exercise_entry_id = ee.id
           )
           OR EXISTS (
             SELECT 1 FROM exercise_entry_laps eel
              WHERE eel.exercise_entry_id = ee.id
           )
         ) AS has_telemetry,
         COALESCE(
           (SELECT json_agg(set_data ORDER BY set_data.set_number)
            FROM (
              SELECT ees.id, ees.set_number, ees.set_type, ees.reps, ees.weight, ees.duration, ees.rest_time, ees.notes, ees.rpe, to_char(ees.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS completed_at, ees.is_pr, ees.distance
              FROM exercise_entry_sets ees
              WHERE ees.exercise_entry_id = ee.id
            ) AS set_data
           ), '[]'::json
         ) AS sets
       FROM exercise_entries ee
       LEFT JOIN exercise_preset_entries epe ON epe.id = ee.exercise_preset_entry_id
       LEFT JOIN exercises e ON e.id = ee.exercise_id
       WHERE ee.user_id = $1
         AND ee.exercise_id = $2
         AND ee.entry_date BETWEEN $3 AND $4
       ORDER BY ee.entry_date ASC`,
      [userId, exerciseId, startDate, endDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getExerciseHistory(userId: any, exerciseId: any, limit = 5) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT
         ee.entry_date,
         ee.duration_minutes,
         ee.calories_burned,
         ee.notes,
         ee.image_url,
         ee.distance,
         ee.avg_heart_rate,
         COALESCE(
           (SELECT json_agg(set_data ORDER BY set_data.set_number)
            FROM (
              SELECT ees.id, ees.set_number, ees.set_type, ees.reps, ees.weight, ees.duration, ees.rest_time, ees.notes, ees.rpe, to_char(ees.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS completed_at, ees.is_pr, ees.distance
              FROM exercise_entry_sets ees
              WHERE ees.exercise_entry_id = ee.id
            ) AS set_data
           ), '[]'::json
         ) AS sets
       FROM exercise_entries ee
       WHERE ee.user_id = $1
         AND ee.exercise_id = $2
       ORDER BY ee.entry_date DESC, ee.created_at DESC
       LIMIT $3`,
      [userId, exerciseId, limit]
    );
    return result.rows;
  } finally {
    client.release();
  }
}
async function getBestSetForExercise(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exerciseId: any,
  excludePresetEntryId: string | null = null
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ee.entry_date::TEXT AS entry_date, ees.weight, ees.reps, ees.set_number
         FROM exercise_entries ee
         JOIN exercise_entry_sets ees ON ees.exercise_entry_id = ee.id
        WHERE ee.user_id = $1
          AND ee.exercise_id = $2
          AND ees.weight IS NOT NULL
          AND (ees.set_type IS NULL OR regexp_replace(LOWER(ees.set_type), '[^a-z0-9]', '', 'g') NOT LIKE 'warmup%')
          AND ($3::uuid IS NULL OR ee.exercise_preset_entry_id IS DISTINCT FROM $3)
        ORDER BY ees.weight DESC,
                 ees.reps DESC NULLS LAST,
                 ee.entry_date DESC,
                 ee.created_at DESC,
                 ees.set_number DESC,
                 ees.id DESC
        LIMIT 1`,
      [userId, exerciseId, excludePresetEntryId]
    );
    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
}
async function getLastSetForExercise(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exerciseId: any,
  excludePresetEntryId: string | null = null
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ee.entry_date::TEXT AS entry_date, ees.weight, ees.reps, ees.set_number
         FROM exercise_entries ee
         JOIN exercise_entry_sets ees ON ees.exercise_entry_id = ee.id
        WHERE ee.user_id = $1
          AND ee.exercise_id = $2
          AND (ees.weight IS NOT NULL OR ees.reps IS NOT NULL)
          AND ($3::uuid IS NULL OR ee.exercise_preset_entry_id IS DISTINCT FROM $3)
        ORDER BY ee.entry_date DESC,
                 ee.created_at DESC,
                 ees.set_number DESC,
                 ees.id DESC
        LIMIT 1`,
      [userId, exerciseId, excludePresetEntryId]
    );
    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
}
export interface RecentSessionRow {
  entry_date: string;
  sets:
    | {
        id: string;
        set_number: number;
        set_type: string | null;
        weight: number | null;
        reps: number | null;
        duration: number | null;
        distance: number | null;
      }[]
    | null;
}
async function getRecentSessionsForExercise(
  userId: string,
  exerciseId: string,
  excludePresetEntryId: string | null = null,
  limit = 3,
  presetId: number | null = null
): Promise<RecentSessionRow[]> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT
         ee.entry_date::TEXT AS entry_date,
         (SELECT json_agg(set_data ORDER BY set_data.set_number, set_data.id)
            FROM (
              SELECT ees.id, ees.set_number, ees.set_type, ees.weight, ees.reps, ees.duration, ees.distance
                FROM exercise_entry_sets ees
               WHERE ees.exercise_entry_id = ee.id
                 AND (ees.weight IS NOT NULL OR ees.reps IS NOT NULL OR ees.duration IS NOT NULL OR ees.distance IS NOT NULL)
            ) AS set_data
         ) AS sets
       FROM exercise_entries ee
       WHERE ee.user_id = $1
         AND ee.exercise_id = $2
         AND ($3::uuid IS NULL OR ee.exercise_preset_entry_id IS DISTINCT FROM $3)
         AND (
           $5::integer IS NULL
           OR EXISTS (
             SELECT 1 FROM exercise_preset_entries epe
              WHERE epe.id = ee.exercise_preset_entry_id
                AND epe.workout_preset_id = $5
           )
         )
         AND EXISTS (
           SELECT 1 FROM exercise_entry_sets ees
            WHERE ees.exercise_entry_id = ee.id
              AND (ees.weight IS NOT NULL OR ees.reps IS NOT NULL OR ees.duration IS NOT NULL OR ees.distance IS NOT NULL)
         )
       ORDER BY ee.entry_date DESC, ee.created_at DESC, ee.id DESC
       LIMIT $4`,
      [userId, exerciseId, excludePresetEntryId, limit, presetId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}
async function deleteExerciseEntriesByEntrySourceAndDateWithClient(
  client: PoolClient,
  userId: string,
  startDate: string,
  endDate: string,
  entrySource: string,
  excludedExerciseName?: string
) {
  await acquireExerciseEntrySyncLockWithClient(client, userId, entrySource);
  // Get IDs of exercise entries to be deleted
  const entryIdsResult = await client.query(
    `SELECT id FROM exercise_entries
     WHERE user_id = $1
       AND entry_date BETWEEN $2 AND $3
       AND source = $4
       AND (
         $5::text IS NULL
         OR NOT EXISTS (
           SELECT 1
           FROM exercises e
           WHERE e.id = exercise_entries.exercise_id
             AND e.name = $5
         )
       )`,
    [userId, startDate, endDate, entrySource, excludedExerciseName ?? null]
  );
  const entryIds = entryIdsResult.rows.map((row: { id: string }) => row.id);
  if (entryIds.length > 0) {
    // Delete associated activity details
    await client.query(
      'DELETE FROM exercise_entry_activity_details WHERE exercise_entry_id = ANY($1::uuid[])',
      [entryIds]
    );
    log(
      'info',
      `[exerciseEntry] Deleted activity details for ${entryIds.length} exercise entries.`
    );
    // Delete associated sets
    await client.query(
      'DELETE FROM exercise_entry_sets WHERE exercise_entry_id = ANY($1::uuid[])',
      [entryIds]
    );
    log(
      'info',
      `[exerciseEntry] Deleted sets for ${entryIds.length} exercise entries.`
    );
    // Delete the exercise entries themselves
    const result = await client.query(
      'DELETE FROM exercise_entries WHERE id = ANY($1::uuid[])',
      [entryIds]
    );
    log(
      'info',
      `[exerciseEntry] Deleted ${result.rowCount} exercise entries with source '${entrySource}' for user ${userId} from ${startDate} to ${endDate}.`
    );
    return result.rowCount;
  }
  log(
    'info',
    `[exerciseEntry] No exercise entries with source '${entrySource}' found for user ${userId} from ${startDate} to ${endDate}.`
  );
  return 0;
}

async function deleteExerciseEntriesByEntrySourceAndDate(
  userId: string,
  startDate: string,
  endDate: string,
  entrySource: string,
  excludedExerciseName?: string
) {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    const deletedCount =
      await deleteExerciseEntriesByEntrySourceAndDateWithClient(
        client,
        userId,
        startDate,
        endDate,
        entrySource,
        excludedExerciseName
      );
    await client.query('COMMIT');
    return deletedCount;
  } catch (error) {
    await client.query('ROLLBACK');
    log(
      'error',
      `Error deleting exercise entries by source and date: ${error instanceof Error ? error.message : String(error)}`,
      { userId, startDate, endDate, entrySource, error }
    );
    throw error;
  } finally {
    client.release();
  }
}
// Per-day exercise totals over a date range. Backs the chatbot
// sparky_get_daily_exercise_totals tool.
async function getDailyExerciseTotalsRange(
  userId: string,
  startDate: string,
  endDate: string
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT entry_date,
              COUNT(*)::int AS entry_count,
              SUM(COALESCE(duration_minutes, 0)) AS duration_minutes,
              SUM(COALESCE(calories_burned, 0)) AS calories_burned,
              SUM(COALESCE(distance, 0)) AS distance,
              SUM(COALESCE(steps, 0)) AS steps
       FROM exercise_entries
       WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3
       GROUP BY entry_date
       ORDER BY entry_date ASC`,
      [userId, startDate, endDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

export interface DailyExerciseCalorieSplit {
  entry_date: string;
  active_calories: number;
  other_calories: number;
  activity_steps: number;
}

/**
 * Per-day active / logged / step splits for a whole range, in one query.
 *
 * This is the ranged equivalent of walking `getExerciseEntriesByDateV2`'s session tree
 * through `extractExerciseStats`. The tree exists for the Diary's UI; the calorie balance
 * only ever reduces it to these three sums, and both individual entries and preset
 * children live in this one table, so a GROUP BY reproduces it exactly.
 *
 * Two predicates carry the whole correctness of #2094:
 *
 *  - `IS DISTINCT FROM`, never `<>`. `exercise_name` is nullable, and `<>` yields NULL for
 *    a null-named row, so its calories would land in neither bucket and silently vanish --
 *    the same class of undercount this fix exists to remove.
 *  - `exercise_preset_entry_id IS NULL` on the active bucket, because `extractExerciseStats`
 *    folds every preset child into the logged arm regardless of its name. Without it, an
 *    "Active Calories" row inside a preset would be classified one way by the Diary and
 *    another way here.
 *
 * Deliberately not `getDailyExerciseTotalsRange`: that cannot separate the device summary
 * row from logged workouts, which is precisely the discrimination this needs.
 */
async function getDailyExerciseCalorieSplitRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<DailyExerciseCalorieSplit[]> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT TO_CHAR(entry_date, 'YYYY-MM-DD') AS entry_date,
              COALESCE(SUM(calories_burned) FILTER (
                WHERE exercise_name = 'Active Calories'
                  AND exercise_preset_entry_id IS NULL), 0)::float8 AS active_calories,
              COALESCE(SUM(calories_burned) FILTER (
                WHERE exercise_name IS DISTINCT FROM 'Active Calories'
                   OR exercise_preset_entry_id IS NOT NULL), 0)::float8 AS other_calories,
              COALESCE(SUM(steps), 0)::int AS activity_steps
       FROM exercise_entries
       WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3
       GROUP BY entry_date
       ORDER BY entry_date ASC`,
      [userId, startDate, endDate]
    );
    return result.rows as DailyExerciseCalorieSplit[];
  } finally {
    client.release();
  }
}

// Entry-level diary rows for a date range, plus all their sets, with catalog
// name/category. Backs the chatbot sparky_get_exercise_diary tool.
async function getExerciseDiaryRange(
  userId: string,
  startDate: string,
  endDate: string
) {
  const client = await getClient(userId);
  try {
    const entriesResult = await client.query(
      `SELECT ee.*, e.name AS exercise_name_from_catalog, e.category AS exercise_category_from_catalog
       FROM exercise_entries ee
       LEFT JOIN exercises e ON e.id = ee.exercise_id
       WHERE ee.user_id = $1 AND ee.entry_date BETWEEN $2 AND $3
       ORDER BY ee.entry_date ASC, ee.created_at ASC`,
      [userId, startDate, endDate]
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entryIds = entriesResult.rows.map((row: any) => row.id);
    let sets: Record<string, unknown>[] = [];
    if (entryIds.length > 0) {
      const setsResult = await client.query(
        `SELECT * FROM exercise_entry_sets
         WHERE exercise_entry_id = ANY($1)
         ORDER BY exercise_entry_id, set_number ASC`,
        [entryIds]
      );
      sets = setsResult.rows;
    }
    return { entries: entriesResult.rows, sets };
  } finally {
    client.release();
  }
}

// Most recent exercise entries with catalog name/category. Backs the chatbot
// sparky_get_recent_exercise_entries tool.
async function getRecentExerciseEntries(userId: string, limit: number) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ee.*, e.name AS exercise_name_from_catalog, e.category AS exercise_category_from_catalog
       FROM exercise_entries ee
       LEFT JOIN exercises e ON e.id = ee.exercise_id
       WHERE ee.user_id = $1
       ORDER BY ee.entry_date DESC, ee.created_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

// Paged entries for one exercise in a date range, plus the total count.
// Backs the chatbot sparky_get_exercise_usage tool.
async function getExerciseUsage(
  userId: string,
  exerciseId: string,
  startDate: string,
  endDate: string,
  limit: number,
  offset: number
) {
  const client = await getClient(userId);
  try {
    const countResult = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM exercise_entries
       WHERE user_id = $1 AND exercise_id = $2 AND entry_date BETWEEN $3 AND $4`,
      [userId, exerciseId, startDate, endDate]
    );
    const dataResult = await client.query(
      `SELECT * FROM exercise_entries
       WHERE user_id = $1 AND exercise_id = $2 AND entry_date BETWEEN $3 AND $4
       ORDER BY entry_date DESC, created_at DESC
       LIMIT $5 OFFSET $6`,
      [userId, exerciseId, startDate, endDate, limit, offset]
    );
    return {
      rows: dataResult.rows,
      totalCount: countResult.rows[0]?.count ?? 0,
    };
  } finally {
    client.release();
  }
}

async function getWaterEstimatedSumForDate(
  userId: string,
  date: string
): Promise<number> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'SELECT COALESCE(SUM(water_estimated), 0) as total FROM exercise_entries WHERE user_id = $1 AND entry_date = $2 AND water_estimated IS NOT NULL',
      [userId, date]
    );
    return parseInt(result.rows[0].total, 10);
  } finally {
    client.release();
  }
}

async function getWaterEstimatedSumForDateRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<Record<string, number>> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT TO_CHAR(entry_date, 'YYYY-MM-DD') as date, COALESCE(SUM(water_estimated), 0) as total
       FROM exercise_entries
       WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3 AND water_estimated IS NOT NULL
       GROUP BY entry_date`,
      [userId, startDate, endDate]
    );
    const map: Record<string, number> = {};
    for (const row of result.rows) {
      map[row.date] = parseInt(row.total, 10);
    }
    return map;
  } finally {
    client.release();
  }
}

export { upsertExerciseEntryData };
export { _createExerciseEntryWithClient };
export { createExerciseEntry };
export { getExerciseEntryById };
export { getExerciseEntryOwnerId };
export { updateExerciseEntry };
export { updateExerciseEntryTelemetryOnly };
export { _updateExerciseEntryTelemetryOnlyWithClient };
export { updateExerciseEntriesDateByPresetEntryIdWithClient };
export { getWorkoutPlanAssignmentIdByPresetEntryIdWithClient };
export { deleteExerciseEntriesByPresetEntryIdWithClient };
export { deleteExerciseEntry };
export { getExerciseEntriesByDate };
export { getExerciseProgressData };
export { getExerciseHistory };
export { getBestSetForExercise };
export { getLastSetForExercise };
export { getRecentSessionsForExercise };
export { deleteExerciseEntriesByEntrySourceAndDate };
export { deleteExerciseEntriesByEntrySourceAndDateWithClient };
export { getDailyExerciseTotalsRange };
export { getDailyExerciseCalorieSplitRange };
export { getExerciseDiaryRange };
export { getRecentExerciseEntries };
export { getExerciseUsage };
export { getWaterEstimatedSumForDate };
export { getWaterEstimatedSumForDateRange };
export default {
  getDailyExerciseCalorieSplitRange,
  upsertExerciseEntryData,
  _createExerciseEntryWithClient,
  _updateExerciseEntryWithClient,
  _deleteExerciseEntryWithClient,
  _reconcileExerciseEntrySetsWithClient,
  createExerciseEntry,
  getExerciseEntryById,
  getExerciseEntryOwnerId,
  updateExerciseEntry,
  updateExerciseEntryTelemetryOnly,
  _updateExerciseEntryTelemetryOnlyWithClient,
  updateExerciseEntriesDateByPresetEntryIdWithClient,
  getWorkoutPlanAssignmentIdByPresetEntryIdWithClient,
  deleteExerciseEntriesByPresetEntryIdWithClient,
  deleteExerciseEntry,
  getExerciseEntriesByDate,
  getExerciseProgressData,
  getExerciseHistory,
  getBestSetForExercise,
  getLastSetForExercise,
  getRecentSessionsForExercise,
  deleteExerciseEntriesByEntrySourceAndDate,
  deleteExerciseEntriesByEntrySourceAndDateWithClient,
  getDailyExerciseTotalsRange,
  getExerciseDiaryRange,
  getRecentExerciseEntries,
  getExerciseUsage,
  getWaterEstimatedSumForDate,
  getWaterEstimatedSumForDateRange,
};
