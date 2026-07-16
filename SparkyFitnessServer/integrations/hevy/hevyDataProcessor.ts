import exerciseEntryRepository from '../../models/exerciseEntry.js';
import exerciseRepository from '../../models/exercise.js';
import measurementRepository from '../../models/measurementRepository.js';
import activityDetailsRepository from '../../models/activityDetailsRepository.js';
import workoutPresetRepository from '../../models/workoutPresetRepository.js';
import exercisePresetEntryRepository from '../../models/exercisePresetEntryRepository.js';
import { log } from '../../config/logging.js';
import {
  todayInZone,
  instantToDay,
  instantHourMinute,
} from '@workspace/shared';
/**
 * Process Hevy user info to sync measurements.
 * @param {string} userId - The Sparky Fitness user ID.
 * @param {string} createdByUserId - The user ID who triggered the sync.
 * @param {Object} data - The Hevy user info response.
 */
async function processHevyUserInfo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createdByUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
  timezone = 'UTC'
) {
  if (!data || !data.user) return;
  const { weight_kg, height_cm, updated_at } = data.user;
  const entryDate = updated_at
    ? updated_at.split('T')[0]
    : todayInZone(timezone);
  try {
    const measurements = {};
    // @ts-expect-error TS(2339): Property 'weight' does not exist on type '{}'.
    if (weight_kg) measurements.weight = weight_kg;
    // @ts-expect-error TS(2339): Property 'height' does not exist on type '{}'.
    if (height_cm) measurements.height = height_cm;
    if (Object.keys(measurements).length > 0) {
      await measurementRepository.upsertCheckInMeasurements(
        userId,
        createdByUserId,
        entryDate,
        measurements
      );
      log(
        'info',
        `Synced Hevy user measurements for user ${userId}: ${JSON.stringify(measurements)}`
      );
    }
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `Failed to sync Hevy user measurements for user ${userId}: ${error.message}`
    );
  }
}
/**
 * Process a list of workouts from Hevy.
 * @param {string} userId - The Sparky Fitness user ID.
 * @param {string} createdByUserId - The user ID who triggered the sync.
 * @param {Array} workouts - The list of Hevy workouts.
 */
async function processHevyWorkouts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createdByUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workouts: any,
  timezone = 'UTC'
) {
  log(
    'info',
    `Processing ${workouts.length} Hevy workouts for user ${userId}...`
  );
  // Mirror the Garmin re-sync model: before rebuilding, clear any existing Hevy
  // sessions and exercise entries in the synced date range. This keeps re-syncs
  // idempotent (workouts don't duplicate) at the cost of overwriting local edits
  // to Hevy-sourced entries. Preset templates (workout_presets) are intentionally
  // left intact and reused across occurrences.
  if (workouts.length > 0) {
    const entryDates: string[] = workouts.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (w: any) => instantToDay(new Date(w.start_time), timezone)
    );
    const startDate = entryDates.reduce((a, b) => (a < b ? a : b));
    const endDate = entryDates.reduce((a, b) => (a > b ? a : b));
    try {
      await exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDate(
        userId,
        startDate,
        endDate,
        'Hevy'
      );
      await exercisePresetEntryRepository.deleteExercisePresetEntriesByEntrySourceAndDate(
        userId,
        startDate,
        endDate,
        'Hevy'
      );
    } catch (error) {
      log(
        'error',
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        `Failed to clear existing Hevy data before re-sync for user ${userId}: ${error.message}`
      );
    }
  }
  // The raw bundle can hold the same workout under overlapping page keys
  // (e.g. `raw_workouts_page` and `raw_workouts_page_1`), and paginated API
  // fetches can overlap too. Process each workout id only once — otherwise a
  // second pass creates a duplicate preset-entry session whose exercises stay
  // deduped on the first one, leaving an empty orphan session.
  const seenWorkoutIds = new Set<string>();
  for (const workout of workouts) {
    if (workout.id) {
      if (seenWorkoutIds.has(workout.id)) {
        log('debug', `Skipping duplicate Hevy workout ${workout.id}`);
        continue;
      }
      seenWorkoutIds.add(workout.id);
    }
    try {
      await processSingleWorkout(userId, createdByUserId, workout, timezone);
    } catch (error) {
      log(
        'error',
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        `Failed to process Hevy workout ${workout.id}: ${error.message}`
      );
    }
  }
}
/**
 * Process a single workout from Hevy.
 * @param {string} userId - The Sparky Fitness user ID.
 * @param {string} createdByUserId - The user ID who triggered the sync.
 * @param {Object} workout - The Hevy workout object.
 */
async function processSingleWorkout(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createdByUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workout: any,
  timezone = 'UTC'
) {
  const startTime = new Date(workout.start_time);
  const endTime = new Date(workout.end_time);
  const workoutDurationMinutes = Math.round(
    (endTime.getTime() - startTime.getTime()) / (1000 * 60)
  );
  // Wall-clock start time of the workout, in the user's timezone, as an
  // 'HH:MM' string for the exercise_entries.entry_time (TIME) column.
  const { hour, minute } = instantHourMinute(startTime, timezone);
  const entryTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const entryDate = instantToDay(startTime, timezone);
  log(
    'debug',
    `Processing Hevy workout: ${workout.title} (${startTime.toISOString()})`
  );
  // Find or create the reusable workout preset (the Hevy routine), matched by
  // name to mirror Garmin. Then create one preset entry — the logged session —
  // that every exercise in this workout attaches to, so the diary shows the
  // whole workout as a single "Vid plan A" group instead of loose exercises.
  let workoutPreset = await workoutPresetRepository.getWorkoutPresetByName(
    userId,
    workout.title
  );
  if (!workoutPreset) {
    workoutPreset = await workoutPresetRepository.createWorkoutPreset({
      user_id: userId,
      name: workout.title,
      description:
        workout.description || `Workout session from Hevy: ${workout.title}`,
      is_public: false,
    });
  }
  const presetEntry =
    await exercisePresetEntryRepository.createExercisePresetEntry(
      userId,
      {
        user_id: userId,
        workout_preset_id: workoutPreset.id,
        name: workout.title,
        description:
          workout.description || `Logged session of ${workout.title}`,
        entry_date: entryDate,
        created_by_user_id: createdByUserId,
        notes: `Hevy Workout Session: ${workout.title}`,
        source: 'Hevy',
      },
      createdByUserId
    );
  for (
    let exerciseIndex = 0;
    exerciseIndex < workout.exercises.length;
    exerciseIndex++
  ) {
    const hevyExercise = workout.exercises[exerciseIndex];
    // 1. Find or create exercise template
    let exercise = await exerciseRepository.findExerciseByNameAndUserId(
      hevyExercise.title,
      userId
    );
    if (!exercise) {
      exercise = await exerciseRepository.createExercise(
        {
          user_id: userId,
          name: hevyExercise.title,
          source: 'Hevy',
          is_custom: true,
          shared_with_public: false,
        },
        // @ts-expect-error TS(2554): Expected 1 arguments, but got 2.
        createdByUserId
      );
    }
    // Hevy has no per-exercise duration; it only reports whole-workout
    // start/end. When an exercise's sets carry real per-set durations (timed
    // exercises), use their sum. Otherwise attribute the whole-workout
    // duration to the first exercise only (and 0 to the rest) so daily
    // exercise-minute totals aren't multiplied by the number of exercises.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const setDurationSeconds = hevyExercise.sets.reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sum: number, set: any) => sum + (set.duration_seconds || 0),
      0
    );
    const durationMinutes =
      setDurationSeconds > 0
        ? Math.round(setDurationSeconds / 60)
        : exerciseIndex === 0
          ? workoutDurationMinutes
          : 0;
    // Sum any per-set distances (meters) Hevy reports; null when none.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const distanceMeters = hevyExercise.sets.reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sum: number, set: any) => sum + (set.distance_meters || 0),
      0
    );
    // Stable per-exercise identity so re-syncs update in place instead of
    // duplicating. Hevy workout ids are unique; exercise index is unique
    // within a workout.
    const sourceId = `${workout.id}_${hevyExercise.index}`;
    // 2. Prepare entry data
    const entryData = {
      exercise_id: exercise.id,
      entry_date: entryDate,
      entry_time: entryTime,
      duration_minutes: durationMinutes,
      calories_burned: 0, // Hevy typically doesn't provide per-exercise calories
      distance: distanceMeters > 0 ? distanceMeters : null,
      superset_group: hevyExercise.superset_id ?? null,
      source_id: sourceId,
      exercise_preset_entry_id: presetEntry.id,
      notes:
        hevyExercise.notes ||
        workout.description ||
        `Synced from Hevy: ${workout.title}`,
      entry_source: 'Hevy',
      sort_order: hevyExercise.index,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sets: hevyExercise.sets.map((set: any) => ({
        set_number: set.index + 1,
        set_type: mapSetType(set.type),
        weight: set.weight_kg,
        reps: set.reps,
        duration: set.duration_seconds
          ? Math.round(set.duration_seconds / 60)
          : null,
        rpe: set.rpe,
      })),
    };
    // 3. Create the exercise entry, linked to the session (preset entry) via
    // the 5th argument so it groups under the workout instead of standing alone.
    const entry = await exerciseEntryRepository.createExerciseEntry(
      userId,
      entryData,
      createdByUserId,
      'Hevy',
      presetEntry.id
    );
    // 4. Populate the reusable preset template with this exercise. Reuses the
    // existing exercise row when present and skips if it already has sets, so
    // repeat occurrences of the same routine don't duplicate template rows.
    try {
      await workoutPresetRepository.addExerciseToWorkoutPreset(
        userId,
        workoutPreset.id,
        exercise.id,
        null,
        entryData.sets,
        hevyExercise.index
      );
    } catch (error) {
      log(
        'error',
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        `Failed to add Hevy exercise to workout preset ${workoutPreset.id}: ${error.message}`
      );
    }
    // 5. Stash the full raw Hevy payload as an activity detail (like Garmin),
    // so nothing Hevy sends is lost and it stays visible/editable in the
    // Advanced section of the exercise entry. The bulk cleanup above already
    // removed any prior details (ON DELETE CASCADE from the entry), so this is
    // a fresh insert.
    if (entry?.id) {
      try {
        await activityDetailsRepository.createActivityDetail(userId, {
          exercise_entry_id: entry.id,
          provider_name: 'Hevy',
          detail_type: 'full_activity_data',
          detail_data: {
            workout: {
              id: workout.id,
              title: workout.title,
              description: workout.description,
              routine_id: workout.routine_id,
              start_time: workout.start_time,
              end_time: workout.end_time,
            },
            exercise: hevyExercise,
          },
          created_by_user_id: createdByUserId,
          updated_by_user_id: createdByUserId,
        });
      } catch (error) {
        log(
          'error',
          // @ts-expect-error TS(2571): Object is of type 'unknown'.
          `Failed to store Hevy activity detail for entry ${entry.id}: ${error.message}`
        );
      }
    }
  }
}
/**
 * Map Hevy set types to Sparky Fitness set types.
 * @param {string} hevyType - Hevy set type (normal, warm_up, drop_set, failure).
 * @returns {string} - Sparky Fitness set type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSetType(hevyType: any) {
  const mapping = {
    normal: 'Working Set',
    warm_up: 'Warm-up',
    drop_set: 'Drop Set',
    failure: 'To Failure',
  };
  // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  return mapping[hevyType] || 'Working Set';
}
export { processHevyUserInfo };
export { processHevyWorkouts };
export default {
  processHevyUserInfo,
  processHevyWorkouts,
};
