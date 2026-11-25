/**
 * Liftosaur Data Processor.
 * Ingests parsed Liftohistory workouts into SparkyFitness exercise_entries,
 * exercise_preset_entries (workout sessions), workout_presets (reusable templates),
 * and activity_details rows. Follows the pattern established by the Garmin and
 * Hevy processors (services/garmin/garminActivityProcessor.ts,
 * integrations/hevy/hevyDataProcessor.ts).
 */
import type { PoolClient } from 'pg';
import exerciseEntryRepository, {
  acquireExerciseEntrySyncLockWithClient,
} from '../../models/exerciseEntry.js';
import exerciseRepository from '../../models/exercise.js';
import activityDetailsRepository from '../../models/activityDetailsRepository.js';
import workoutPresetRepository from '../../models/workoutPresetRepository.js';
import { getClient } from '../../db/poolManager.js';
import { log } from '../../config/logging.js';
import {
  instantToDay,
  instantHourMinute,
  isBodyweightModality,
  isExerciseModality,
} from '@workspace/shared';
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
import {
  deleteLiftosaurSessionsNotInWithClient,
  getStoredEntryDurationsWithClient,
  moveEntryToSessionWithClient,
  upsertLiftosaurSessionWithClient,
  type StoredEntryDuration,
} from './liftosaurSessionRepository.js';
import { emptyMuscleColumnSql } from '../../utils/muscleColumnSql.js';
import {
  normalizeToStringArray,
  parseJsonArrayField,
} from '../../utils/exerciseJsonFields.js';

const LB_TO_KG = 0.45359237;

export const LIFTOSAUR_SOURCE = 'Liftosaur';

/** Minimal shapes for the repository rows we consume by id. */
interface ExerciseRow {
  id: string;
  user_id?: string | null;
  source?: string | null;
  modality?: string | null;
  primary_muscles?: unknown;
  secondary_muscles?: unknown;
}

/** The modality a Liftosaur exercise gets when it has assisted sets. */
const ASSISTED_MODALITY = 'bodyweight_reps';

function isBodyweightExercise(exercise: ExerciseRow): boolean {
  return (
    isExerciseModality(exercise.modality) &&
    isBodyweightModality(exercise.modality)
  );
}

/**
 * Whether a performed set of this exercise has a negative weight. Liftosaur
 * logs an assisted set (an assisted pull-up, say) that way, and only a
 * bodyweight exercise can store one.
 */
function hasAssistedSet(exercise: LiftohistoryExercise): boolean {
  return mergeSets(exercise).sets.some(
    (set) => set.weightKg !== null && set.weightKg < 0
  );
}
interface WorkoutPresetRow {
  id: number;
}
interface ExerciseEntryRow {
  id: string;
}

function toMuscleArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return normalizeToStringArray(value);
  }
  if (typeof value === 'string') {
    return normalizeToStringArray(parseJsonArrayField(value));
  }
  return [];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** First and last day (user timezone) of the fetched workouts, if any. */
function fetchedDayRange(
  workouts: LiftohistoryWorkout[],
  timezone: string
): LiftosaurCleanupRange | null {
  if (workouts.length === 0) return null;
  const days = workouts.map((w) => instantToDay(new Date(w.date), timezone));
  return {
    startDate: days.reduce((a, b) => (a < b ? a : b)),
    endDate: days.reduce((a, b) => (a > b ? a : b)),
  };
}

/**
 * Source ids of the Liftosaur rows this sync keeps: the sessions and entries
 * it wrote, plus entries it could not write because of an error (so a
 * transient failure never deletes an existing entry). A deliberate skip adds
 * nothing, so its old row is cleaned up.
 */
interface KeptSourceIds {
  sessions: Set<string>;
  entries: Set<string>;
}

/**
 * Source id of the entry for one exercise of a Liftosaur workout:
 * `<record id>_<exercise name>_<occurrence>`, where the occurrence counts
 * earlier lines of the same exercise in that workout. Keyed by name rather
 * than position, so reordering or removing exercises in Liftosaur never moves
 * an entry (and the edits saved on it) to a different exercise. Only two
 * blocks of the same exercise can trade places, which keeps edits on the
 * same exercise. A renamed exercise counts as a new one.
 */
function entrySourceId(
  workout: LiftohistoryWorkout,
  exerciseIndex: number
): string {
  const name = workout.exercises[exerciseIndex]!.name;
  const occurrence = workout.exercises
    .slice(0, exerciseIndex)
    .filter((exercise) => exercise.name === name).length;
  return `${workout.id}_${name}_${occurrence}`;
}

/** Calendar days (user timezone) whose Liftosaur rows a sync reconciles. */
export interface LiftosaurCleanupRange {
  startDate: string;
  endDate: string;
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
    ...new Set(
      workouts.flatMap((w) =>
        w.exercises
          .filter((e) => mergeSets(e).sets.length > 0)
          .map((e) => e.name)
      )
    ),
  ];

  const assisted = new Set(
    workouts.flatMap((w) =>
      w.exercises.filter((e) => hasAssistedSet(e)).map((e) => e.name)
    )
  );

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
    // An alias resolved earlier in this sync ("Squat" before
    // "Squat, Barbell") is reused, as the bare-name lookup would have found
    // it had the rows been created one workout at a time.
    const bareName = name.split(',')[0]!.trim();
    let exercise =
      found.get(name) ??
      (bareName !== name ? (library.get(bareName) ?? null) : null);
    if (exercise) {
      if (mapping) await fillMissingMuscles(userId, exercise, mapping);
      await backfillLiftosaurDiaryMuscles(userId, exercise);
      if (assisted.has(name)) await useAssistedModality(userId, exercise);
    } else {
      exercise = await exerciseRepository.createExercise({
        user_id: userId,
        name,
        source: LIFTOSAUR_SOURCE,
        is_custom: true,
        shared_with_public: false,
        ...(assisted.has(name) ? { modality: ASSISTED_MODALITY } : {}),
        ...(mapping
          ? {
              primary_muscles: mapping.primary,
              secondary_muscles: mapping.secondary,
            }
          : {}),
      });
      if (exercise && mapping) {
        await backfillLiftosaurDiaryMuscles(userId, exercise);
      }
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
 * Switch an exercise the Liftosaur import created to bodyweight once it has
 * assisted sets, so their negative weight can be stored. Only rows the import
 * made and that still have the import's default modality (weight_reps) are
 * changed: a modality the user picked, and exercises from the user's own or
 * the public library, are left alone (processSingleWorkout drops the negative
 * weight on those instead). Library writes run outside the diary transaction,
 * so a failure is logged and the import goes on.
 */
async function useAssistedModality(
  userId: string,
  exercise: ExerciseRow
): Promise<void> {
  if (exercise.user_id !== userId) return;
  if (exercise.source !== LIFTOSAUR_SOURCE) return;
  if (exercise.modality !== 'weight_reps') return;
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `UPDATE exercises
       SET modality = $1, updated_at = now()
       WHERE id = $2 AND user_id = $3 AND source = $4
         AND modality = 'weight_reps'`,
      [ASSISTED_MODALITY, exercise.id, userId, LIFTOSAUR_SOURCE]
    );
    if ((result.rowCount ?? 0) > 0) exercise.modality = ASSISTED_MODALITY;
  } catch (error) {
    log(
      'warn',
      `Skipping the bodyweight switch for Liftosaur exercise ${exercise.id}: ${errorMessage(error)}`
    );
  } finally {
    client.release();
  }
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
    // The write re-checks emptiness itself (see fillEmptyMuscles), so a
    // stale snapshot or a second alias of the same row cannot overwrite
    // muscles, and saved secondary muscles are kept.
    const filled = await exerciseRepository.fillEmptyMuscles(
      userId,
      exercise.id,
      muscles.primary,
      muscles.secondary
    );
    if (filled) {
      exercise.primary_muscles = filled.primary_muscles;
      exercise.secondary_muscles = filled.secondary_muscles;
    }
  } catch (error) {
    log(
      'warn',
      `Skipping Liftosaur muscle backfill for exercise ${exercise.id}: ${errorMessage(error)}`
    );
  }
}

/**
 * Backfill muscles on existing Liftosaur diary entries that currently have
 * empty muscle snapshots (e.g. entries imported before muscle mapping existed
 * or during a previous lookup failure), so reports pick up their sets without
 * overwriting populated snapshots or manual edits.
 */
async function backfillLiftosaurDiaryMuscles(
  userId: string,
  exercise: ExerciseRow
): Promise<void> {
  const primary = toMuscleArray(exercise.primary_muscles);
  if (primary.length === 0) return;
  const secondary = toMuscleArray(exercise.secondary_muscles);
  const client = await getClient(userId);
  try {
    await client.query(
      `UPDATE exercise_entries SET
         primary_muscles = $1,
         secondary_muscles = CASE WHEN ${emptyMuscleColumnSql('secondary_muscles')}
           THEN $2 ELSE secondary_muscles END,
         updated_at = NOW()
       WHERE user_id = $3
         AND exercise_id = $4
         AND source = $5
         AND ${emptyMuscleColumnSql('primary_muscles')}`,
      [
        JSON.stringify(primary),
        JSON.stringify(secondary),
        userId,
        exercise.id,
        LIFTOSAUR_SOURCE,
      ]
    );
  } catch (error) {
    log(
      'warn',
      `Skipping Liftosaur diary muscle backfill for exercise ${exercise.id}: ${errorMessage(error)}`
    );
  } finally {
    client.release();
  }
}

/**
 * Process a list of parsed Liftosaur workouts into SparkyFitness entries atomically.
 *
 * @param cleanup Which Liftosaur rows that are no longer sent get deleted:
 *   a day range, every such row on those days (even when no workouts were
 *   fetched); left out, the days between the first and last fetched
 *   workout; null, none (the fetch may be incomplete, so a missing workout
 *   proves nothing).
 */
async function processLiftosaurWorkouts(
  userId: string,
  createdByUserId: string,
  workouts: LiftohistoryWorkout[],
  timezone = 'UTC',
  cleanup?: LiftosaurCleanupRange | null,
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
    // Hold the Liftosaur sync lock for the whole import, as the Hevy import
    // does, so session upserts are serialized even when this sync deletes
    // nothing (the cleanup and entry writes below take the same lock).
    await acquireExerciseEntrySyncLockWithClient(
      client,
      userId,
      LIFTOSAUR_SOURCE
    );

    // Paginated fetches can overlap at page boundaries; process each workout id
    // exactly once so a second pass doesn't create an empty orphan session.
    const seenWorkoutIds = new Set<number>();
    const kept: KeptSourceIds = { sessions: new Set(), entries: new Set() };
    let workoutsFailed = 0;
    for (const workout of workouts) {
      if (seenWorkoutIds.has(workout.id)) {
        log('debug', `Skipping duplicate Liftosaur workout ${workout.id}`);
        continue;
      }
      seenWorkoutIds.add(workout.id);
      // Each workout gets its own savepoint, so one that cannot be saved is
      // skipped instead of rolling back every other workout of the sync.
      await client.query('SAVEPOINT liftosaur_workout');
      try {
        await processSingleWorkout(
          userId,
          createdByUserId,
          workout,
          library,
          kept,
          client,
          timezone
        );
        await client.query('RELEASE SAVEPOINT liftosaur_workout');
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT liftosaur_workout');
        workoutsFailed += 1;
        log(
          'error',
          `Skipping Liftosaur workout ${workout.id} for user ${userId}: ${errorMessage(error)}`
        );
      }
    }

    // Re-sent workouts are updated in place above, keyed by source id
    // (session: the Liftosaur record id; entry: `<record id>_<exercise
    // name>_<occurrence>`), so entry ids and anything the user added in SparkyFitness
    // (notes, effort, calorie links, edited fields) survive a re-sync. Then
    // every Liftosaur row in the synced day range that this sync did not
    // write is deleted: workouts deleted in Liftosaur, rows from before
    // source ids were stable, and rows the import now skips. Entries go
    // first, because that path clears their calorie links and a session
    // delete cascades to the entries still under it. A workout that failed
    // to save may have rows stored under ids this sync cannot know (an
    // exercise renamed or removed in Liftosaur since, or ids from before they
    // were stable), so after a failure nothing is deleted, as when a record
    // does not parse.
    const range =
      cleanup === undefined ? fetchedDayRange(workouts, timezone) : cleanup;
    if (range && workoutsFailed === 0) {
      const { startDate, endDate } = range;

      await exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDateWithClient(
        client,
        userId,
        startDate,
        endDate,
        LIFTOSAUR_SOURCE,
        undefined,
        [...kept.entries]
      );

      await deleteLiftosaurSessionsNotInWithClient(
        client,
        userId,
        startDate,
        endDate,
        [...kept.sessions]
      );
    }

    await client.query('COMMIT');
    return { workoutsFailed };
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
  kept: KeptSourceIds,
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

  // A workout in which nothing was performed (only planned sets) gets no
  // session at all, rather than an empty one.
  if (!workout.exercises.some((ex) => mergeSets(ex).sets.length > 0)) {
    log(
      'debug',
      `Skipping Liftosaur workout ${workout.id} with no performed sets`
    );
    return;
  }

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

  const presetEntryId = await upsertLiftosaurSessionWithClient(
    client,
    userId,
    createdByUserId,
    {
      source_id: String(workout.id),
      workout_preset_id: workoutPreset.id,
      name: workoutTitle,
      description: `Logged session of ${workoutTitle}`,
      entry_date: entryDate,
      notes: `Liftosaur Workout Session: ${workoutTitle}`,
    }
  );
  kept.sessions.add(String(workout.id));

  const workoutDurationMinutes = workout.durationSeconds
    ? Math.round(workout.durationSeconds / 60)
    : 0;
  // Liftosaur only records the whole workout's duration. It goes to one
  // entry of the session and the rest get 0, so daily exercise minutes match
  // the workout without multiplying it. That entry is the one that held it
  // before when the workout was synced already (see chooseDurationOwner),
  // else the first exercise with performed sets.
  const importedSourceIds = workout.exercises.flatMap((exercise, index) =>
    mergeSets(exercise).sets.length > 0 ? [entrySourceId(workout, index)] : []
  );
  const durationOwner = chooseDurationOwner(
    importedSourceIds,
    await getStoredEntryDurationsWithClient(client, userId, importedSourceIds)
  );

  for (
    let exerciseIndex = 0;
    exerciseIndex < workout.exercises.length;
    exerciseIndex++
  ) {
    const liftosaurExercise = workout.exercises[exerciseIndex]!;

    // Merge completed/warmup/target sets into the flat set list SparkyFitness
    // stores (see mergeSets). An exercise with no performed sets is skipped
    // before anything is looked up or created for it.
    const mergedSets = mergeSets(liftosaurExercise);
    if (mergedSets.sets.length === 0) {
      log(
        'debug',
        `Skipping Liftosaur exercise "${liftosaurExercise.name}" with no performed sets`
      );
      continue;
    }

    // 1. The library exercise was resolved (and created, with its muscles)
    //    up front by resolveLibraryExercises.
    const exercise = library.get(liftosaurExercise.name);
    if (!exercise) {
      // An error, not a skip: keep the existing entry for the next sync.
      kept.entries.add(entrySourceId(workout, exerciseIndex));
      continue;
    }

    // Stable per-exercise identity so re-syncs update in place instead of
    // duplicating (see entrySourceId).
    const sourceId = entrySourceId(workout, exerciseIndex);

    const durationMinutes =
      sourceId === durationOwner ? workoutDurationMinutes : 0;

    // Assisted sets keep their negative weight on a bodyweight exercise. The
    // modality also goes to an entry updated in place, whose copy of it is
    // otherwise kept from when it was first imported. On any other exercise
    // (one the import may not switch, see useAssistedModality) the set is
    // kept without its weight, since that modality cannot store it.
    const bodyweight = isBodyweightExercise(exercise);
    const assisted = mergedSets.sets.some(
      (set) => set.weightKg !== null && set.weightKg < 0
    );
    if (assisted && !bodyweight) {
      log(
        'warn',
        `Liftosaur exercise "${liftosaurExercise.name}" has assisted sets but exercise ${exercise.id} is not a bodyweight exercise; importing those sets without their weight.`
      );
    }

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
      ...(assisted && bodyweight ? { modality: exercise.modality } : {}),
      sets: mergedSets.sets.map((set) => ({
        set_number: set.set_number,
        set_type: set.set_type,
        weight:
          set.weightKg !== null && set.weightKg < 0 && !bodyweight
            ? null
            : set.weightKg,
        reps: set.reps,
        duration: set.durationSeconds,
        rest_time: set.restSeconds,
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
        presetEntryId
      );
    const entry: ExerciseEntryRow | null = created.entry ?? null;
    kept.entries.add(sourceId);
    // The in-place update keeps the entry's parent. If that is an older
    // session the cleanup below deletes, the cascade would take this kept
    // entry with it, so move the entry under this sync's session first.
    if (entry?.id && created.operation === 'updated') {
      await moveEntryToSessionWithClient(
        client,
        userId,
        entry.id,
        presetEntryId
      );
    }

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
      // A re-synced entry is updated in place; replace its raw detail rather
      // than adding another copy on every sync.
      if (created.operation === 'updated') {
        await activityDetailsRepository._deleteActivityDetailsByEntryIdAndProviderWithClient(
          client,
          userId,
          entry.id,
          LIFTOSAUR_SOURCE,
          'full_activity_data'
        );
      }
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
  /** The program's rest timer for this set (target sets only). */
  restSeconds: number | null;
  rpe: number | null;
  notes: string | null;
}

/**
 * Merge Liftosaur's split set categories into a single set sequence.
 *
 * Precedence:
 * 1. Working sets come from completedSets (expanded by `count`).
 * 2. Warmup sets come from warmupSets (marked 'Warm-up').
 * 3. Target sets (the program's plan) only supply rest timers (stored as
 *    the set's rest time, never its duration) and labels for the completed
 *    set at the same position. A planned set with no completed counterpart
 *    was skipped and is never imported.
 */
function mergeSets(exercise: LiftohistoryExercise): {
  sets: NormalizedSet[];
} {
  const completed = expandSets(exercise.completedSets);
  const warmup = expandSets(exercise.warmupSets);
  const target = expandSets(exercise.targetSets);

  const sets: NormalizedSet[] = [];
  let setNumber = 1;

  for (const set of warmup) {
    sets.push(toNormalizedSet(set, setNumber, 'Warm-up'));
    setNumber += 1;
  }

  for (let i = 0; i < completed.length; i += 1) {
    const done = completed[i]!;
    const planned = target[i];
    const setType = mapSetType(done.label ?? planned?.label, false);
    const normalized = toNormalizedSet(done, setNumber, setType);
    // Rest timers only exist on target sets.
    const timer = planned?.timerSeconds;
    if (timer && timer > 0) {
      normalized.restSeconds = timer;
    }
    sets.push(normalized);
    setNumber += 1;
  }

  return { sets };
}

/**
 * Which entry of a workout gets the whole workout duration (the others get
 * 0), given the source ids of the exercises that are imported, in workout
 * order, and what is already stored for them. Mirrors the Hevy import
 * (hevyWorkoutRepository.ts) so a reorder in Liftosaur never moves the
 * duration onto a second entry while a hand-edited one keeps its value:
 *   1. an entry whose duration the user edited and that is above 0;
 *   2. else the entry that already holds a duration (it got it last time);
 *   3. else an entry whose duration the user edited (even to 0);
 *   4. else the first imported exercise.
 * Edited durations stay protected by the in-place update either way, so the
 * workout is counted once.
 */
export function chooseDurationOwner(
  sourceIds: string[],
  stored: Map<string, StoredEntryDuration>
): string | null {
  const edited = (id: string) =>
    stored.get(id)?.manual_fields.includes('duration_minutes') ?? false;
  const minutes = (id: string) => stored.get(id)?.duration_minutes ?? 0;
  return (
    sourceIds.find((id) => edited(id) && minutes(id) > 0) ??
    sourceIds.find((id) => minutes(id) > 0) ??
    sourceIds.find((id) => edited(id)) ??
    sourceIds[0] ??
    null
  );
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
    restSeconds: null,
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
