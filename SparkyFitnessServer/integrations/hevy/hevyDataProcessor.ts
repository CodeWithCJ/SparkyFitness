import exerciseEntryRepository from '../../models/exerciseEntry.js';
import exerciseRepository from '../../models/exercise.js';
import measurementRepository from '../../models/measurementRepository.js';
import { log } from '../../config/logging.js';
import { todayInZone, instantToDay } from '@workspace/shared';
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
  for (const workout of workouts) {
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
  // @ts-expect-error TS(2362): The left-hand side of an arithmetic operation must... Remove this comment to see the full error message
  const durationMinutes = Math.round((endTime - startTime) / (1000 * 60));
  log(
    'debug',
    `Processing Hevy workout: ${workout.title} (${startTime.toISOString()})`
  );
  for (const hevyExercise of workout.exercises) {
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
    // 2. Prepare entry data
    const entryData = {
      exercise_id: exercise.id,
      entry_date: instantToDay(startTime, timezone),
      duration_minutes: durationMinutes, // Note: Hevy provides total workout duration, not per-exercise
      calories_burned: 0, // Hevy typically doesn't provide per-exercise calories
      notes:
        hevyExercise.notes ||
        workout.description ||
        `Synced from Hevy: ${workout.title}`,
      entry_source: 'Hevy',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sets: hevyExercise.sets.map((set: any) => ({
        set_number: set.index + 1,
        set_type: mapSetType(set.type),
        weight: set.weight_kg,
        reps: set.reps,
        duration: set.duration_seconds ? set.duration_seconds / 60 : null,
        rpe: set.rpe,
      })),
    };
    // 3. Create/update exercise entry using repository
    // This handles snapshotting and duplicates
    await exerciseEntryRepository.createExerciseEntry(
      userId,
      entryData,
      createdByUserId,
      'Hevy'
    );
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
