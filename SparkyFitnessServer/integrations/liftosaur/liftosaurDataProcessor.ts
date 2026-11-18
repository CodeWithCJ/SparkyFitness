/**
 * Liftosaur Data Processor.
 * Ingests parsed Liftohistory workouts into SparkyFitness exercise_entries,
 * exercise_preset_entries (workout sessions), workout_presets (reusable templates),
 * and activity_details rows. Follows the pattern established by the Garmin and
 * Hevy processors (services/garmin/garminActivityProcessor.ts,
 * integrations/hevy/hevyDataProcessor.ts).
 */
import type { PoolClient } from 'pg';
import exerciseEntryRepository from '../../models/exerciseEntry.js';
import exerciseRepository from '../../models/exercise.js';
import activityDetailsRepository from '../../models/activityDetailsRepository.js';
import workoutPresetRepository from '../../models/workoutPresetRepository.js';
import exercisePresetEntryRepository from '../../models/exercisePresetEntryRepository.js';
import { getClient } from '../../db/poolManager.js';
import { log } from '../../config/logging.js';
import { instantToDay, instantHourMinute } from '@workspace/shared';
import {
  LiftohistoryWorkout,
  LiftohistoryExercise,
  LiftohistorySet,
} from './liftosaurTypes.js';
import {
  hasNoMuscles,
  type LiftosaurMuscleLookup,
  type MuscleMapping,
} from './liftosaurMuscles.js';

const LB_TO_KG = 0.45359237;

export const LIFTOSAUR_SOURCE = 'Liftosaur';

/** Minimal shapes for the repository rows we consume by id. */
interface ExerciseRow {
  id: string;
  user_id?: string | null;
  primary_muscles?: unknown;
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
 * Looks up muscles for exercise names (in production, Liftosaur's
 * program-stats endpoint via liftosaurMuscles.resolveLiftosaurMuscles).
 */
export type LiftosaurMuscleResolver = (
  names: string[]
) => Promise<LiftosaurMuscleLookup>;

/** Library exercise for a Liftosaur name: exact name, then the bare name. */
async function findLibraryExercise(
  userId: string,
  name: string
): Promise<ExerciseRow | null> {
  const exact: ExerciseRow | null =
    await exerciseRepository.findExerciseByNameAndUserId(name, userId);
  if (exact) return exact;
  const bareName = name.split(',')[0]!.trim();
  if (!bareName || bareName === name) return null;
  return (
    (await exerciseRepository.findExerciseByNameAndUserId(bareName, userId)) ??
    null
  );
}

function needsMuscles(userId: string, exercise: ExerciseRow | null): boolean {
  return (
    !exercise ||
    (exercise.user_id === userId && hasNoMuscles(exercise.primary_muscles))
  );
}

/**
 * Resolve every distinct Liftosaur exercise name in the batch to a library
 * exercise once, creating missing ones, before the diary transaction starts.
 *
 * Diary entries snapshot the exercise's muscles when they are created, so
 * muscles have to be on the library row first. Only exercises that are new or
 * that the user owns with empty muscles are sent to the resolver, so after the
 * first full sync a routine sync normally makes no muscle request at all, and
 * one that failed is retried on the next sync. Library rows are written on
 * their own connections, as before (see processSingleWorkout).
 */
async function resolveLibraryExercises(
  userId: string,
  workouts: LiftohistoryWorkout[],
  resolveMuscles?: LiftosaurMuscleResolver
): Promise<Map<string, ExerciseRow>> {
  const names = [
    ...new Set(workouts.flatMap((w) => w.exercises.map((e) => e.name))),
  ];

  const found = new Map<string, ExerciseRow | null>();
  for (const name of names) {
    found.set(name, await findLibraryExercise(userId, name));
  }

  let muscles: LiftosaurMuscleLookup = new Map();
  const wanted = names.filter((name) => needsMuscles(userId, found.get(name)!));
  if (resolveMuscles && wanted.length > 0) {
    try {
      muscles = await resolveMuscles(wanted);
    } catch (error) {
      log(
        'warn',
        `Skipping Liftosaur muscle lookup for user ${userId}: ${errorMessage(error)}`
      );
    }
  }

  const library = new Map<string, ExerciseRow>();
  for (const name of names) {
    const mapping = muscles.get(name);
    let exercise = found.get(name) ?? null;
    if (exercise) {
      if (mapping) await fillMissingMuscles(userId, exercise, mapping);
    } else {
      exercise = await exerciseRepository.createExercise({
        user_id: userId,
        name,
        source: LIFTOSAUR_SOURCE,
        is_custom: true,
        shared_with_public: false,
        ...(mapping
          ? {
              primary_muscles: mapping.primary,
              secondary_muscles: mapping.secondary,
            }
          : {}),
      });
    }
    if (exercise) {
      library.set(name, exercise);
    } else {
      log('error', `Failed to find or create Liftosaur exercise "${name}"`);
    }
  }
  return library;
}

/**
 * Backfill muscles on an existing exercise the user owns when it has none
 * (e.g. Liftosaur exercises created before the muscle mapping existed), so
 * the muscle-group reports pick up its sets. Never overwrites muscles that are
 * already set, and never touches public/shared library rows. Library writes
 * run outside the diary transaction (see processSingleWorkout), so a failure
 * here is logged and the workout still imports.
 */
async function fillMissingMuscles(
  userId: string,
  exercise: ExerciseRow,
  muscles: MuscleMapping
): Promise<void> {
  if (exercise.user_id !== userId) return;
  if (muscles.primary.length === 0) return;
  if (!hasNoMuscles(exercise.primary_muscles)) return;
  try {
    await exerciseRepository.updateExercise(exercise.id, userId, {
      primary_muscles: muscles.primary,
      secondary_muscles: muscles.secondary,
    });
  } catch (error) {
    log(
      'warn',
      `Skipping Liftosaur muscle backfill for exercise ${exercise.id}: ${errorMessage(error)}`
    );
  }
}

/**
 * Process a list of parsed Liftosaur workouts into SparkyFitness entries atomically.
 */
async function processLiftosaurWorkouts(
  userId: string,
  createdByUserId: string,
  workouts: LiftohistoryWorkout[],
  timezone = 'UTC',
  resolveMuscles?: LiftosaurMuscleResolver
) {
  log(
    'info',
    `Processing ${workouts.length} Liftosaur workouts for user ${userId}...`
  );

  const library = await resolveLibraryExercises(
    userId,
    workouts,
    resolveMuscles
  );

  const client = await getClient(userId, createdByUserId);
  try {
    await client.query('BEGIN');

    // Mirror the Garmin/Hevy re-sync model: clear any existing Liftosaur sessions
    // and exercise entries in the synced date range before rebuilding so re-syncs
    // are idempotent. Preset templates (workout_presets) are reused by name.
    if (workouts.length > 0) {
      const entryDates = workouts.map((w) =>
        instantToDay(new Date(w.date), timezone)
      );
      const startDate = entryDates.reduce((a, b) => (a < b ? a : b));
      const endDate = entryDates.reduce((a, b) => (a > b ? a : b));

      await exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDateWithClient(
        client,
        userId,
        startDate,
        endDate,
        LIFTOSAUR_SOURCE
      );

      await exercisePresetEntryRepository.deleteExercisePresetEntriesByEntrySourceAndDateWithClient(
        client,
        userId,
        startDate,
        endDate,
        LIFTOSAUR_SOURCE
      );
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
        library,
        client,
        timezone
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    log(
      'error',
      `Failed to process Liftosaur workouts for user ${userId}: ${errorMessage(error)}`
    );
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Process a single parsed Liftosaur workout within the active transaction.
 */
async function processSingleWorkout(
  userId: string,
  createdByUserId: string,
  workout: LiftohistoryWorkout,
  library: Map<string, ExerciseRow>,
  client: PoolClient,
  timezone = 'UTC'
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
  // Library rows (exercises in resolveLibraryExercises, presets here) are
  // written on their own connection, outside the diary transaction, the same way
  // services/garmin/garminActivityProcessor.ts does it: they are get-or-create
  // lookups whose survival after a rollback is harmless, and keeping them out
  // means a failure here cannot abort the transaction that owns the entries.
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
    await exercisePresetEntryRepository.createExercisePresetEntryWithClient(
      client,
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

    // 1. The library exercise was resolved (and created, with its muscles)
    //    up front by resolveLibraryExercises.
    const exercise = library.get(liftosaurExercise.name);
    if (!exercise) continue;

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
      notes: liftosaurExercise.notes || null,
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
    const created =
      await exerciseEntryRepository._createExerciseEntryWithClient(
        client,
        userId,
        entryData,
        createdByUserId,
        LIFTOSAUR_SOURCE,
        presetEntry.id
      );
    const entry: ExerciseEntryRow | null = created.entry ?? null;

    // 5. Populate the reusable preset template with this exercise. Reuses the
    //    existing exercise row when present and skips if it already has sets,
    //    so repeat occurrences of the same routine don't duplicate template
    //    rows. Template rows are library data, so this runs outside the
    //    transaction and a failure here only costs the template, not the
    //    imported workout.
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
    //    visible/editable in the Advanced section of the entry. This writes on
    //    the transaction client and is deliberately not caught: a failed
    //    statement aborts the surrounding transaction, so swallowing it here
    //    would only surface later as a failed COMMIT with a misleading error.
    if (entry?.id) {
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
      await activityDetailsRepository._createActivityDetailWithClient(
        client,
        detailPayload
      );
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

/**
 * Merge Liftosaur's split set categories into a single set sequence.
 *
 * Precedence:
 * 1. Working sets come from completedSets (expanded by `count`).
 * 2. Warmup sets come from warmupSets (marked 'Warm-up').
 * 3. Target sets supply rest timers (`timerSeconds`) and fallback targets
 *    when completed sets are missing (e.g. an unfinished session).
 */
function mergeSets(exercise: LiftohistoryExercise): {
  sets: NormalizedSet[];
  timerSeconds: number;
} {
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
