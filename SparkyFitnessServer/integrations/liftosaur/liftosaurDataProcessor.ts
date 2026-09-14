/**
 * Normalize parsed Liftosaur workout records into SparkyFitness exercise
 * entries, mirroring the Hevy ingest pipeline (integrations/hevy/hevyDataProcessor.ts):
 * one reusable workout preset per Liftosaur program, one preset entry (session)
 * per workout, one exercise entry per Liftosaur exercise, and a raw activity
 * detail stashed on each entry so nothing Liftosaur sent is lost.
 */
import exerciseEntryRepository from '../../models/exerciseEntry.js';
import exerciseRepository from '../../models/exercise.js';
import activityDetailsRepository from '../../models/activityDetailsRepository.js';
import workoutPresetRepository from '../../models/workoutPresetRepository.js';
import exercisePresetEntryRepository from '../../models/exercisePresetEntryRepository.js';
import { log } from '../../config/logging.js';
import { getClient } from '../../db/poolManager.js';
import type { PoolClient } from 'pg';
import { instantToDay, instantHourMinute } from '@workspace/shared';
import {
  LiftohistoryExercise,
  LiftohistorySet,
  LiftohistoryWorkout,
} from './liftosaurTypes.js';

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

const LIFTOSAUR_SOURCE = 'Liftosaur';

const LB_TO_KG = 0.45359237;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Process a list of parsed Liftosaur workouts into SparkyFitness entries atomically.
 */
async function processLiftosaurWorkouts(
  userId: string,
  createdByUserId: string,
  workouts: LiftohistoryWorkout[],
  timezone = 'UTC'
) {
  log(
    'info',
    `Processing ${workouts.length} Liftosaur workouts for user ${userId}...`
  );

  let client: PoolClient | null;
  try {
    client = await getClient(userId, createdByUserId);
  } catch {
    client = null;
  }
  const hasTx = client !== null && typeof client.query === 'function';

  try {
    if (hasTx && client !== null) {
      await client.query('BEGIN');
    }

    // Mirror the Garmin/Hevy re-sync model: clear any existing Liftosaur sessions
    // and exercise entries in the synced date range before rebuilding so re-syncs
    // are idempotent. Preset templates (workout_presets) are reused by name.
    if (workouts.length > 0) {
      const entryDates = workouts.map((w) =>
        instantToDay(new Date(w.date), timezone)
      );
      const startDate = entryDates.reduce((a, b) => (a < b ? a : b));
      const endDate = entryDates.reduce((a, b) => (a > b ? a : b));

      if (
        hasTx &&
        client !== null &&
        exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDateWithClient
      ) {
        await exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDateWithClient(
          client,
          userId,
          startDate,
          endDate,
          LIFTOSAUR_SOURCE
        );
      } else {
        await exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDate(
          userId,
          startDate,
          endDate,
          LIFTOSAUR_SOURCE
        );
      }

      if (
        hasTx &&
        client !== null &&
        exercisePresetEntryRepository.deleteExercisePresetEntriesByEntrySourceAndDateWithClient
      ) {
        await exercisePresetEntryRepository.deleteExercisePresetEntriesByEntrySourceAndDateWithClient(
          client,
          userId,
          startDate,
          endDate,
          LIFTOSAUR_SOURCE
        );
      } else {
        await exercisePresetEntryRepository.deleteExercisePresetEntriesByEntrySourceAndDate(
          userId,
          startDate,
          endDate,
          LIFTOSAUR_SOURCE
        );
      }
    }

    // Paginated fetches can overlap at page boundaries; process each workout id
    // exactly once so a second pass doesn't create an empty orphan session.
    const seenWorkoutIds = new Set<number>();
    for (const workout of workouts) {
      if (seenWorkoutIds.has(workout.id)) {
        log('debug', `Skipping duplicate Liftosaur workout ${workout.id}`);
        continue;
      }
      seenWorkoutIds.add(workout.id);
      await processSingleWorkout(
        userId,
        createdByUserId,
        workout,
        timezone,
        client
      );
    }

    if (hasTx && client !== null) {
      await client.query('COMMIT');
    }
  } catch (error) {
    if (hasTx && client !== null) {
      await client.query('ROLLBACK');
    }
    log(
      'error',
      `Failed to process Liftosaur workouts for user ${userId}: ${errorMessage(error)}`
    );
    throw error;
  } finally {
    if (client && typeof client.release === 'function') {
      client.release();
    }
  }
}

/**
 * Process a single parsed Liftosaur workout.
 */
async function processSingleWorkout(
  userId: string,
  createdByUserId: string,
  workout: LiftohistoryWorkout,
  timezone = 'UTC',
  client?: any
) {
  const startTime = new Date(workout.date);
  const entryDate = instantToDay(startTime, timezone);
  const { hour, minute } = instantHourMinute(startTime, timezone);
  const entryTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  const workoutTitle =
    workout.programName ?? workout.dayName ?? 'Adhoc Workout';
  log(
    'debug',
    `Processing Liftosaur workout: ${workoutTitle} (${workout.date})`
  );

  // Find or create the reusable workout preset (the Liftosaur program name, or
  // a generic name for ad-hoc sessions) so the diary shows the whole workout as
  // a single grouped session instead of loose exercises.
  let workoutPreset: WorkoutPresetRow | null =
    await workoutPresetRepository.getWorkoutPresetByName(userId, workoutTitle);
  if (!workoutPreset) {
    workoutPreset = await workoutPresetRepository.createWorkoutPreset({
      user_id: userId,
      name: workoutTitle,
      description: `Workout session from Liftosaur: ${workoutTitle}`,
      is_public: false,
    });
  }
  if (!workoutPreset) {
    throw new Error(
      `Failed to find or create workout preset for "${workoutTitle}"`
    );
  }

  const presetPayload = {
    user_id: userId,
    workout_preset_id: workoutPreset.id,
    name: workoutTitle,
    description: `Logged session of ${workoutTitle}`,
    entry_date: entryDate,
    created_by_user_id: createdByUserId,
    notes: `Liftosaur Workout Session: ${workoutTitle}`,
    source: LIFTOSAUR_SOURCE,
  };

  const presetEntry: PresetEntryRow =
    client && exercisePresetEntryRepository.createExercisePresetEntryWithClient
      ? await exercisePresetEntryRepository.createExercisePresetEntryWithClient(
          client,
          userId,
          presetPayload,
          createdByUserId
        )
      : await exercisePresetEntryRepository.createExercisePresetEntry(
          userId,
          presetPayload,
          createdByUserId
        );

  const workoutDurationMinutes = workout.durationSeconds
    ? Math.round(workout.durationSeconds / 60)
    : 0;

  for (
    let exerciseIndex = 0;
    exerciseIndex < workout.exercises.length;
    exerciseIndex++
  ) {
    const liftosaurExercise = workout.exercises[exerciseIndex]!;
    // 1. Find or create the SparkyFitness exercise. Liftosaur serializes full
    //    names with an equipment suffix ("Squat, Barbell"); try the exact name
    //    first, then the bare name ("Squat"), then create a custom exercise
    //    that preserves the full Liftosaur name.
    let exercise: ExerciseRow | null =
      await exerciseRepository.findExerciseByNameAndUserId(
        liftosaurExercise.name,
        userId
      );
    if (!exercise) {
      const bareName = liftosaurExercise.name.split(',')[0]!.trim();
      if (bareName && bareName !== liftosaurExercise.name) {
        exercise = await exerciseRepository.findExerciseByNameAndUserId(
          bareName,
          userId
        );
      }
    }
    if (!exercise) {
      exercise = await exerciseRepository.createExercise({
        user_id: userId,
        name: liftosaurExercise.name,
        source: LIFTOSAUR_SOURCE,
        is_custom: true,
        shared_with_public: false,
      });
    }
    if (!exercise) {
      log(
        'error',
        `Failed to find or create Liftosaur exercise "${liftosaurExercise.name}"`
      );
      continue;
    }

    // 2. Merge completed/warmup/target sets into the flat set list SparkyFitness
    //    stores. Liftosaur logs both what was done (completed) and what the
    //    program prescribed (target); completed values win for reps/weight/RPE,
    //    and target rest timers become per-set durations.
    const mergedSets = mergeSets(liftosaurExercise);

    // Stable per-exercise identity so re-syncs update in place instead of
    // duplicating. Liftosaur record ids are unique and exercise index is unique
    // within a record.
    const sourceId = `${workout.id}_${exerciseIndex}`;

    const durationMinutes =
      mergedSets.timerSeconds > 0
        ? Math.round(mergedSets.timerSeconds / 60)
        : exerciseIndex === 0
          ? workoutDurationMinutes
          : 0;

    // 3. Prepare entry data
    const entryData = {
      exercise_id: exercise.id,
      entry_date: entryDate,
      entry_time: entryTime,
      duration_minutes: durationMinutes,
      calories_burned: 0, // the liftohistory format carries no per-exercise calories
      distance: null,
      superset_group: null, // supersets are not part of the serialized format
      source_id: sourceId,
      exercise_preset_entry_id: presetEntry.id,
      notes:
        liftosaurExercise.notes ??
        workout.notes ??
        `Synced from Liftosaur: ${workoutTitle}`,
      entry_source: LIFTOSAUR_SOURCE,
      sort_order: exerciseIndex,
      sets: mergedSets.sets.map((set) => ({
        set_number: set.set_number,
        set_type: set.set_type,
        weight: set.weightKg,
        reps: set.reps,
        duration: set.durationSeconds,
        rpe: set.rpe,
        notes: set.notes,
      })),
    };

    // 4. Create the exercise entry, linked to the session (preset entry) so it
    //    groups under the workout instead of standing alone.
    let entry: ExerciseEntryRow | null;
    if (client && exerciseEntryRepository._createExerciseEntryWithClient) {
      const created =
        await exerciseEntryRepository._createExerciseEntryWithClient(
          client,
          userId,
          entryData,
          createdByUserId,
          LIFTOSAUR_SOURCE,
          presetEntry.id
        );
      entry = created?.entry ?? created ?? null;
    } else {
      entry = await exerciseEntryRepository.createExerciseEntry(
        userId,
        entryData,
        createdByUserId,
        LIFTOSAUR_SOURCE,
        presetEntry.id
      );
    }

    // 5. Populate the reusable preset template with this exercise. Reuses the
    //    existing exercise row when present and skips if it already has sets,
    //    so repeat occurrences of the same routine don't duplicate template
    //    rows.
    try {
      await workoutPresetRepository.addExerciseToWorkoutPreset(
        userId,
        workoutPreset.id,
        exercise.id,
        null,
        entryData.sets,
        exerciseIndex
      );
    } catch (error) {
      log(
        'error',
        `Failed to add Liftosaur exercise to workout preset ${workoutPreset.id}: ${errorMessage(error)}`
      );
    }

    // 6. Stash the raw serialized record and parsed exercise as an activity
    //    detail (like Garmin/Hevy) so the original Liftosaur data stays
    //    visible/editable in the Advanced section of the entry.
    if (entry?.id) {
      try {
        const detailPayload = {
          exercise_entry_id: entry.id,
          provider_name: LIFTOSAUR_SOURCE,
          detail_type: 'full_activity_data',
          detail_data: {
            workout: {
              id: workout.id,
              rawDate: workout.rawDate,
              date: workout.date,
              programName: workout.programName,
              dayName: workout.dayName,
              week: workout.week,
              dayInWeek: workout.dayInWeek,
              day: workout.day,
              durationSeconds: workout.durationSeconds,
              notes: workout.notes,
            },
            exercise: liftosaurExercise,
          },
          created_by_user_id: createdByUserId,
          updated_by_user_id: createdByUserId,
        };
        if (
          client &&
          activityDetailsRepository._createActivityDetailWithClient
        ) {
          await activityDetailsRepository._createActivityDetailWithClient(
            client,
            detailPayload
          );
        } else {
          await activityDetailsRepository.createActivityDetail(
            userId,
            detailPayload
          );
        }
      } catch (error) {
        log(
          'error',
          `Failed to store Liftosaur activity detail for entry ${entry.id}: ${errorMessage(error)}`
        );
      }
    }
  }
}

interface NormalizedSet {
  set_number: number;
  set_type: string;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  rpe: number | null;
  notes: string | null;
}

interface NormalizedSets {
  sets: NormalizedSet[];
  timerSeconds: number;
}

/**
 * Merge a Liftosaur exercise's warmup + completed + target sets into the flat
 * SparkyFitness set list. Warmups stay warm-ups; every other set is a working
 * set (labels like "drop"/"failure" map to SparkyFitness's richer set types).
 * The merged reps/weight/RPE prefer what was completed, with the target's rest
 * timer attached when present.
 */
function mergeSets(exercise: LiftohistoryExercise): NormalizedSets {
  const completed = expandSets(exercise.completedSets);
  const warmup = expandSets(exercise.warmupSets);
  const target = expandSets(exercise.targetSets);

  const sets: NormalizedSet[] = [];
  let setNumber = 1;
  let timerSeconds = 0;

  for (const set of warmup) {
    sets.push(toNormalizedSet(set, setNumber, 'Warm-up'));
    setNumber += 1;
  }

  const mergedCount = Math.max(completed.length, target.length);
  for (let i = 0; i < mergedCount; i += 1) {
    const done = completed[i];
    const planned = target[i];
    const base = done ?? planned;
    if (!base) continue;
    const setType = mapSetType(base.label ?? planned?.label, false);
    const normalized = toNormalizedSet(base, setNumber, setType);
    // Rest timers only exist on target sets.
    const timer = planned?.timerSeconds;
    if (timer && timer > 0) {
      normalized.durationSeconds = timer;
      timerSeconds += timer;
    }
    sets.push(normalized);
    setNumber += 1;
  }

  return { sets, timerSeconds };
}

/** Expand `count`-grouped sets into one entry per actual set. */
function expandSets(groups: LiftohistorySet[]): LiftohistorySet[] {
  const expanded: LiftohistorySet[] = [];
  for (const group of groups) {
    for (let i = 0; i < group.count; i += 1) {
      expanded.push({ ...group, count: 1 });
    }
  }
  return expanded;
}

function toNormalizedSet(
  set: LiftohistorySet,
  setNumber: number,
  setType: string
): NormalizedSet {
  // Completed reps win over target reps; unilateral sets report the right-side
  // reps here (the full left/right detail is preserved in the activity detail).
  const reps = set.reps || null;
  const weightKg = toWeightKg(set.weightValue, set.weightUnit);
  const notes = set.label ? `Label: ${set.label}` : null;
  return {
    set_number: setNumber,
    set_type: setType,
    weightKg,
    reps,
    durationSeconds: null,
    rpe: set.rpe ?? null,
    notes,
  };
}

function toWeightKg(
  value: number | undefined,
  unit: LiftohistorySet['weightUnit']
): number | null {
  if (value === undefined || !unit) return null;
  const kg = unit === 'lb' ? value * LB_TO_KG : value;
  return Math.round(kg * 100) / 100;
}

/**
 * Map Liftosaur set labels to SparkyFitness set types (mirrors the Hevy set
 * type mapping). Free-text labels like "Top set" stay working sets.
 */
function mapSetType(label: string | undefined, isWarmup: boolean): string {
  if (isWarmup) return 'Warm-up';
  if (label && /drop/i.test(label)) return 'Drop Set';
  if (label && /fail(ure)?/i.test(label)) return 'To Failure';
  return 'Working Set';
}

export { processLiftosaurWorkouts };
export default {
  processLiftosaurWorkouts,
};
