import exerciseRepository from '../../models/exercise.js';
import type { PoolClient } from 'pg';
import measurementRepository from '../../models/measurementRepository.js';
import workoutPresetRepository from '../../models/workoutPresetRepository.js';
import hevyExerciseRepository from './hevyExerciseRepository.js';
import {
  syncHevyWorkout,
  type HevyWorkoutImport,
  type HevyWorkoutEntry,
} from './hevyWorkoutRepository.js';
import type {
  HevyWorkout,
  HevyUserInfoResponse,
  HevyExerciseTemplate,
} from './hevyTypes.js';
export type { HevyWorkout } from './hevyTypes.js';
import { log } from '../../config/logging.js';
import { describeError } from '../../utils/errors.js';
import {
  todayInZone,
  instantToDay,
  instantHourMinute,
  normalizeMuscleList,
} from '@workspace/shared';

/** Minimal shapes for the repository rows we consume by id. */
interface ExerciseRow {
  id: string;
  user_id?: string | null;
  source?: string | null;
  source_id?: string | null;
}
interface WorkoutPresetRow {
  id: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Process Hevy user info to sync measurements.
 */
async function processHevyUserInfo(
  userId: string,
  createdByUserId: string,
  data: HevyUserInfoResponse | null | undefined,
  timezone = 'UTC'
) {
  if (!data || !data.user) return;
  const { weight_kg, height_cm, updated_at } = data.user;
  const entryDate = updated_at
    ? instantToDay(new Date(updated_at), timezone)
    : todayInZone(timezone);
  try {
    const measurements: { weight?: number; height?: number } = {};
    if (weight_kg) measurements.weight = weight_kg;
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
      `Failed to sync Hevy user measurements for user ${userId}: ${errorMessage(error)}`
    );
  }
}

/**
 * Process a list of workouts from Hevy.
 */
async function processHevyWorkouts(
  userId: string,
  createdByUserId: string,
  workouts: HevyWorkout[],
  timezone = 'UTC',
  templates: readonly HevyExerciseTemplate[] = []
) {
  log(
    'info',
    `Processing ${workouts.length} Hevy workouts for user ${userId}...`
  );
  // The raw bundle can hold the same workout under overlapping page keys
  // (e.g. `raw_workouts_page` and `raw_workouts_page_1`), and paginated API
  // fetches can overlap too. Process each workout id only once — otherwise a
  // second pass creates a duplicate preset-entry session whose exercises stay
  // deduped on the first one, leaving an empty orphan session.
  const seenWorkoutIds = new Set<string>();
  const templatesById = new Map(
    templates.map((template) => [template.id, template])
  );
  let failures = 0;
  for (const workout of workouts) {
    if (workout.id) {
      if (seenWorkoutIds.has(workout.id)) {
        log('debug', `Skipping duplicate Hevy workout ${workout.id}`);
        continue;
      }
      seenWorkoutIds.add(workout.id);
    }
    try {
      await syncHevyWorkout(userId, createdByUserId, workout.id, (client) =>
        prepareSingleWorkout(userId, client, workout, timezone, templatesById)
      );
    } catch (error) {
      failures++;
      log(
        'error',
        `Failed to process Hevy workout ${workout.id}: ${errorMessage(error)}`
      );
    }
  }
  if (failures > 0) {
    throw new Error(`Failed to import ${failures} Hevy workout(s).`);
  }
}

/**
 * Prepare a complete workout before its diary rows are changed.
 */
async function prepareSingleWorkout(
  userId: string,
  client: PoolClient,
  workout: HevyWorkout,
  timezone = 'UTC',
  templatesById: ReadonlyMap<string, HevyExerciseTemplate> = new Map()
): Promise<HevyWorkoutImport> {
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
  // name. Session persistence uses the workout's provider ID, independently
  // of the title, so renamed routines do not recreate logged workouts.
  let workoutPreset: WorkoutPresetRow | null =
    await workoutPresetRepository.getWorkoutPresetByName(
      userId,
      workout.title,
      client
    );
  if (!workoutPreset) {
    workoutPreset = await workoutPresetRepository.createWorkoutPreset(
      {
        user_id: userId,
        name: workout.title,
        description:
          workout.description || `Workout session from Hevy: ${workout.title}`,
        is_public: false,
      },
      client
    );
  }
  if (!workoutPreset) {
    throw new Error(
      `Failed to find or create workout preset for "${workout.title}"`
    );
  }
  const session = {
    source_id: workout.id,
    workout_preset_id: workoutPreset.id,
    name: workout.title,
    description: workout.description || `Logged session of ${workout.title}`,
    entry_date: entryDate,
    notes: `Hevy Workout Session: ${workout.title}`,
  };
  const entries: HevyWorkoutEntry[] = [];

  // Hevy identifies supersets by an opaque id; the DB stores superset_group as a
  // per-workout integer. Assign each distinct Hevy superset id a stable number
  // within this workout so grouped exercises share a value.
  const supersetGroupByHevyId = new Map<string, number>();
  const exerciseOccurrences = new Map<string, number>();
  const exercises = workout.exercises ?? [];
  let untimedDurationAllocated = false;
  for (
    let exerciseIndex = 0;
    exerciseIndex < exercises.length;
    exerciseIndex++
  ) {
    const hevyExercise = exercises[exerciseIndex]!;
    const templateId = hevyExercise.exercise_template_id;
    const template = templateId ? templatesById.get(templateId) : undefined;
    const primaryMuscles = normalizeMuscleList([
      template?.primary_muscle_group?.replaceAll('_', ' '),
    ]);
    const secondaryMuscles = normalizeMuscleList(
      template?.secondary_muscle_groups?.map((muscle) =>
        muscle.replaceAll('_', ' ')
      )
    ).filter((muscle) => !primaryMuscles.includes(muscle));
    // 1. Find or create exercise template
    let exercise: ExerciseRow | null = templateId
      ? await hevyExerciseRepository.findByTemplateId(
          userId,
          templateId,
          client
        )
      : null;
    if (!exercise) {
      // Filter legacy records in the query itself: an unrelated public row
      // returned first by a general name search must not hide the owned row.
      exercise = await hevyExerciseRepository.findLegacyByName(
        userId,
        hevyExercise.title,
        client
      );
    }
    if (!exercise) {
      exercise = await hevyExerciseRepository.findOwnedByName(
        userId,
        hevyExercise.title,
        !templateId,
        client
      );
    }
    if (exercise?.source === 'Hevy' && templateId && template) {
      try {
        await hevyExerciseRepository.fillMissingMuscles(
          userId,
          exercise.id,
          templateId,
          primaryMuscles,
          secondaryMuscles,
          client
        );
      } catch (error) {
        log(
          'warn',
          `Skipping optional Hevy muscle update for exercise ${exercise.id}: ${describeError(error)}`
        );
      }
    }
    if (!exercise) {
      exercise = await exerciseRepository.createExercise(
        {
          user_id: userId,
          name: hevyExercise.title,
          source: 'Hevy',
          source_id: templateId,
          primary_muscles: primaryMuscles,
          secondary_muscles: secondaryMuscles,
          is_custom: true,
          shared_with_public: false,
        },
        client
      );
    }
    if (!exercise) {
      throw new Error(
        `Failed to find or create Hevy exercise "${hevyExercise.title}"`
      );
    }
    const sets = hevyExercise.sets ?? [];
    // Hevy has no per-exercise duration; it only reports whole-workout
    // start/end. When an exercise's sets carry real per-set durations (timed
    // exercises), use their sum. Otherwise attribute the whole-workout
    // duration to the first untimed exercise only (and 0 to the rest) so daily
    // exercise-minute totals aren't multiplied by the number of exercises.
    const setDurationSeconds = sets.reduce(
      (sum, set) => sum + (set.duration_seconds || 0),
      0
    );
    const durationMinutes =
      setDurationSeconds > 0
        ? Math.round(setDurationSeconds / 60)
        : !untimedDurationAllocated
          ? workoutDurationMinutes
          : 0;
    if (setDurationSeconds <= 0) untimedDurationAllocated = true;
    // Sum any per-set distances Hevy reports. The Hevy API reports metres
    // (`distance_meters`) regardless of the user's display units, while
    // exercise_entries.distance is kilometres like every other integration
    // writes it, so this must be converted rather than stored raw.
    const distanceMeters = sets.reduce(
      (sum, set) => sum + (set.distance_meters || 0),
      0
    );
    const distanceKm =
      distanceMeters > 0
        ? parseFloat((distanceMeters / 1000).toFixed(3))
        : null;
    // Map the Hevy superset id to a numeric per-workout group.
    let supersetGroup: number | null = null;
    if (
      hevyExercise.superset_id !== null &&
      hevyExercise.superset_id !== undefined
    ) {
      const key = String(hevyExercise.superset_id);
      if (!supersetGroupByHevyId.has(key)) {
        supersetGroupByHevyId.set(key, supersetGroupByHevyId.size + 1);
      }
      supersetGroup = supersetGroupByHevyId.get(key)!;
    }
    // Provider indexes are ordering, not identity. Reordering must not move
    // saved corrections onto a different exercise.
    const identity = templateId || exercise.id;
    const occurrence = exerciseOccurrences.get(identity) ?? 0;
    exerciseOccurrences.set(identity, occurrence + 1);
    const sourceId = `${workout.id}_exercise:${encodeURIComponent(identity)}:${occurrence}`;
    // 2. Prepare entry data
    const entryData = {
      exercise_id: exercise.id,
      entry_date: entryDate,
      entry_time: entryTime,
      record_timezone: timezone,
      duration_minutes: durationMinutes,
      distance: distanceKm,
      superset_group: supersetGroup,
      source_id: sourceId,
      notes:
        hevyExercise.notes ||
        workout.description ||
        `Synced from Hevy: ${workout.title}`,
      sort_order: hevyExercise.index,
      sets: sets.map((set) => ({
        set_number: set.index + 1,
        set_type: mapSetType(set.type),
        weight: set.weight_kg,
        reps: set.reps,
        duration: set.duration_seconds
          ? Math.round(set.duration_seconds)
          : null,
        rpe: set.rpe,
      })),
    };
    entries.push({
      data: entryData,
      detail: {
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
    });
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
        hevyExercise.index,
        'rep_goal',
        null,
        'weight',
        5,
        null,
        client
      );
    } catch (error) {
      log(
        'error',
        `Failed to add Hevy exercise to workout preset ${workoutPreset.id}: ${errorMessage(error)}`
      );
    }
  }
  return { session, entries };
}

/**
 * Map Hevy set types to Sparky Fitness set types.
 */
function mapSetType(hevyType: string): string {
  const mapping: Record<string, string> = {
    normal: 'Working Set',
    warmup: 'Warm-up',
    dropset: 'Drop Set',
    failure: 'To Failure',
  };
  return mapping[hevyType] || 'Working Set';
}
export { processHevyUserInfo };
export { processHevyWorkouts };
export default {
  processHevyUserInfo,
  processHevyWorkouts,
};
