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
import { instantToDay, instantHourMinute } from '@workspace/shared';
import {
  LiftohistoryWorkout,
  LiftohistoryExercise,
  LiftohistorySet,
} from './liftosaurTypes.js';
import {
  deleteLiftosaurSessionsNotInWithClient,
  moveEntryToSessionWithClient,
  upsertLiftosaurSessionWithClient,
} from './liftosaurSessionRepository.js';

const LB_TO_KG = 0.45359237;

export const LIFTOSAUR_SOURCE = 'Liftosaur';

/** Minimal shapes for the repository rows we consume by id. */
interface ExerciseRow {
  id: string;
}
interface WorkoutPresetRow {
  id: number;
}
interface ExerciseEntryRow {
  id: string;
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
  cleanup?: LiftosaurCleanupRange | null
) {
  log(
    'info',
    `Processing ${workouts.length} Liftosaur workouts for user ${userId}...`
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
        kept,
        client,
        timezone
      );
    }

    // Re-sent workouts are updated in place above, keyed by source id
    // (session: the Liftosaur record id; entry: `<record id>_<exercise
    // name>_<occurrence>`), so entry ids and anything the user added in SparkyFitness
    // (notes, effort, calorie links, edited fields) survive a re-sync. Then
    // every Liftosaur row in the synced day range that this sync did not
    // write is deleted: workouts deleted in Liftosaur, rows from before
    // source ids were stable, and rows the import now skips. Entries go
    // first, because that path clears their calorie links and a session
    // delete cascades to the entries still under it.
    const range =
      cleanup === undefined ? fetchedDayRange(workouts, timezone) : cleanup;
    if (range) {
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

  // Find or create the reusable workout preset (the Liftosaur program name, or
  // a generic name for ad-hoc sessions) so the diary shows the whole workout as
  // a single grouped session instead of loose exercises.
  // Library rows (exercises above, presets here) are written on their own
  // connection, outside the diary transaction, the same way
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

  for (
    let exerciseIndex = 0;
    exerciseIndex < workout.exercises.length;
    exerciseIndex++
  ) {
    const liftosaurExercise = workout.exercises[exerciseIndex]!;

    // 1. Resolve exercise in SparkyFitness library: try exact name match
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
      // An error, not a skip: keep the existing entry for the next sync.
      kept.entries.add(entrySourceId(workout, exerciseIndex));
      continue;
    }

    // 2. Merge completed/warmup/target sets into the flat set list SparkyFitness
    //    stores. Liftosaur logs both what was done (completed) and what the
    //    program prescribed (target); completed values win for reps/weight/RPE,
    //    and target rest timers become per-set durations.
    const mergedSets = mergeSets(liftosaurExercise);

    // Stable per-exercise identity so re-syncs update in place instead of
    // duplicating (see entrySourceId).
    const sourceId = entrySourceId(workout, exerciseIndex);

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
