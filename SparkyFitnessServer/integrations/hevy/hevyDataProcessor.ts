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

/** A single set within a Hevy exercise. */
interface HevySet {
  index: number;
  type: string;
  weight_kg: number | null;
  reps: number | null;
  distance_meters: number | null;
  duration_seconds: number | null;
  rpe: number | null;
  custom_metric?: number | null;
}

/** One exercise within a Hevy workout. */
interface HevyExercise {
  index: number;
  title: string;
  notes?: string | null;
  exercise_template_id?: string | null;
  superset_id?: string | number | null;
  sets?: HevySet[] | null;
}

/** A logged Hevy workout (one session). */
interface HevyWorkout {
  id: string;
  title: string;
  routine_id?: string | null;
  description?: string | null;
  start_time: string;
  end_time: string;
  updated_at?: string | null;
  created_at?: string | null;
  exercises?: HevyExercise[] | null;
}

/** The Hevy user-info payload we read body metrics from. */
interface HevyUserInfoResponse {
  user?: {
    weight_kg?: number | null;
    height_cm?: number | null;
    updated_at?: string | null;
  } | null;
}

/** Minimal shapes for the repository rows we consume by id. */
interface ExerciseRow {
  id: string;
}
interface WorkoutPresetRow {
  id: number;
}
interface PresetEntryRow {
  id: string;
}
interface ExerciseEntryRow {
  id: string;
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
    ? updated_at.split('T')[0]
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
    const entryDates = workouts.map((w) =>
      instantToDay(new Date(w.start_time), timezone)
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
        `Failed to clear existing Hevy data before re-sync for user ${userId}: ${errorMessage(error)}`
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
        `Failed to process Hevy workout ${workout.id}: ${errorMessage(error)}`
      );
    }
  }
}

/**
 * Process a single workout from Hevy.
 */
async function processSingleWorkout(
  userId: string,
  createdByUserId: string,
  workout: HevyWorkout,
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
  let workoutPreset: WorkoutPresetRow | null =
    await workoutPresetRepository.getWorkoutPresetByName(userId, workout.title);
  if (!workoutPreset) {
    workoutPreset = await workoutPresetRepository.createWorkoutPreset({
      user_id: userId,
      name: workout.title,
      description:
        workout.description || `Workout session from Hevy: ${workout.title}`,
      is_public: false,
    });
  }
  if (!workoutPreset) {
    throw new Error(
      `Failed to find or create workout preset for "${workout.title}"`
    );
  }
  const presetEntry: PresetEntryRow =
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

  // Hevy identifies supersets by an opaque id; the DB stores superset_group as a
  // per-workout integer. Assign each distinct Hevy superset id a stable number
  // within this workout so grouped exercises share a value.
  const supersetGroupByHevyId = new Map<string, number>();
  const exercises = workout.exercises ?? [];
  for (
    let exerciseIndex = 0;
    exerciseIndex < exercises.length;
    exerciseIndex++
  ) {
    const hevyExercise = exercises[exerciseIndex]!;
    // 1. Find or create exercise template
    let exercise: ExerciseRow | null =
      await exerciseRepository.findExerciseByNameAndUserId(
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
        // @ts-expect-error TS(2554): repository accepts createdByUserId at runtime
        createdByUserId
      );
    }
    if (!exercise) {
      log(
        'error',
        `Failed to find or create Hevy exercise "${hevyExercise.title}"`
      );
      continue;
    }
    const sets = hevyExercise.sets ?? [];
    // Hevy has no per-exercise duration; it only reports whole-workout
    // start/end. When an exercise's sets carry real per-set durations (timed
    // exercises), use their sum. Otherwise attribute the whole-workout
    // duration to the first exercise only (and 0 to the rest) so daily
    // exercise-minute totals aren't multiplied by the number of exercises.
    const setDurationSeconds = sets.reduce(
      (sum, set) => sum + (set.duration_seconds || 0),
      0
    );
    const durationMinutes =
      setDurationSeconds > 0
        ? Math.round(setDurationSeconds / 60)
        : exerciseIndex === 0
          ? workoutDurationMinutes
          : 0;
    // Sum any per-set distances (meters) Hevy reports; null when none.
    const distanceMeters = sets.reduce(
      (sum, set) => sum + (set.distance_meters || 0),
      0
    );
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
      superset_group: supersetGroup,
      source_id: sourceId,
      exercise_preset_entry_id: presetEntry.id,
      notes:
        hevyExercise.notes ||
        workout.description ||
        `Synced from Hevy: ${workout.title}`,
      entry_source: 'Hevy',
      sort_order: hevyExercise.index,
      sets: sets.map((set) => ({
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
    const entry: ExerciseEntryRow | null =
      await exerciseEntryRepository.createExerciseEntry(
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
        `Failed to add Hevy exercise to workout preset ${workoutPreset.id}: ${errorMessage(error)}`
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
          `Failed to store Hevy activity detail for entry ${entry.id}: ${errorMessage(error)}`
        );
      }
    }
  }
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
