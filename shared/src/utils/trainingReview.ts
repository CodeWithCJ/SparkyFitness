import { normalizeMuscleList } from '../constants/exerciseTaxonomy.ts';
import { addDays } from './timezone.ts';
import { isWarmupSetType } from './dropSetCalculator.ts';
import { epleyOneRepMaxKg } from './exerciseLoad.ts';
import { ADAPTIVE_HIGH_RPE, ADAPTIVE_LOW_RIR } from './adaptiveCoaching.ts';
import {
  primaryMusclesOf,
  type MuscleEntry,
} from './exerciseMuscleAggregates.ts';

/**
 * Deterministic reading of recent strength training: how often, which lifts
 * have stopped moving, how hard the sets were and which muscles got work.
 * Pure, so the AI assistant, the MCP tools and any future screen report the
 * same numbers. The AI only interprets them; it never computes them.
 */

export interface ReviewSet {
  set_type?: string | null;
  reps?: number | null;
  weight?: number | null;
  duration?: number | null;
  rpe?: number | null;
  rir?: number | null;
}

export interface ReviewEntry extends Omit<
  MuscleEntry,
  'exercise_name' | 'sets'
> {
  entry_date?: string;
  exercise_id?: string | null;
  exercise_name?: string | null;
  exercise_modality?: string | null;
  sets?: ReviewSet[] | null;
}

export interface ExerciseStall {
  exerciseId: string;
  exerciseName: string;
  /** Logged sessions of this exercise that have a usable loaded set. */
  sessions: number;
  /** Consecutive most-recent sessions that did not beat the best before them. */
  stalledSessions: number;
  bestEstimatedOneRepMaxKg: number;
  lastEstimatedOneRepMaxKg: number;
  lastDate: string;
}

export interface TrainingReview {
  window: { from: string; to: string; days: number };
  sessions: number;
  sessionsPerWeek: number;
  /** False below three sessions: one session is not a trend. */
  enoughData: boolean;
  stalls: ExerciseStall[];
  effort: {
    sampledSets: number;
    averageRpe: number | null;
    averageRir: number | null;
    /** Lifts whose working sets averaged RPE 9.5+ or RIR 0.5 or less. */
    nearFailure: string[];
  };
  /** Working sets per canonical muscle inside the window. */
  muscleSets: Record<string, number>;
  /** Muscles trained earlier in the lookback but not at all in the window. */
  untrainedMuscles: string[];
}

/** A session must beat the best before it by this much to count as progress. */
export const STALL_IMPROVEMENT_RATIO = 1.01;
/** Consecutive non-improving sessions before a lift is reported as stalled. */
export const STALL_MIN_SESSIONS = 2;
/** Estimated 1RM from very high reps is unreliable, so those sets are ignored. */
const MAX_REPS_FOR_ESTIMATE = 12;
/** Fewer sessions than this is not a trend. */
export const TRAINING_REVIEW_MIN_SESSIONS = 3;

const NEAR_FAILURE_MIN_SETS = 3;
const CARDIO_MODALITY = 'duration_distance';
/** Synced calorie summaries are logged as entries but are not workouts. */
const NOT_A_WORKOUT = 'Active Calories';

function dayOf(entry: ReviewEntry): string | null {
  const raw = entry.entry_date;
  return raw ? raw.slice(0, 10) : null;
}

function isStrengthEntry(entry: ReviewEntry): boolean {
  return (
    entry.exercise_modality !== CARDIO_MODALITY &&
    entry.exercise_name !== NOT_A_WORKOUT
  );
}

function workingSets(entry: ReviewEntry): ReviewSet[] {
  return (entry.sets ?? []).filter(
    (set) =>
      !isWarmupSetType(set.set_type) &&
      ((Number(set.reps) || 0) > 0 || (Number(set.duration) || 0) > 0)
  );
}

function musclesOf(entry: ReviewEntry): string[] {
  return primaryMusclesOf({
    exercises: entry.exercises,
    exercise_primary_muscles: entry.exercise_primary_muscles,
  });
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Best estimated 1RM among an entry's loaded working sets, 0 when none. */
function bestEstimatedOneRepMax(entry: ReviewEntry): number {
  let best = 0;
  for (const set of workingSets(entry)) {
    const reps = Number(set.reps) || 0;
    if (reps <= 0 || reps > MAX_REPS_FOR_ESTIMATE) continue;
    best = Math.max(best, epleyOneRepMaxKg(set.weight, reps));
  }
  return best;
}

/**
 * How many of an exercise's most recent sessions failed to beat the best
 * session before them. `oneRepMaxes` is oldest first, one value per session.
 * A lift needs three sessions before it can be called stalled.
 */
export function countStalledSessions(oneRepMaxes: readonly number[]): number {
  if (oneRepMaxes.length < TRAINING_REVIEW_MIN_SESSIONS) return 0;
  let stalled = 0;
  for (let i = oneRepMaxes.length - 1; i >= 1; i -= 1) {
    const priorBest = Math.max(...oneRepMaxes.slice(0, i));
    if (oneRepMaxes[i]! < priorBest * STALL_IMPROVEMENT_RATIO) stalled += 1;
    else break;
  }
  return stalled;
}

/**
 * `entries` should cover the window plus earlier history (stalls and the
 * "untrained" check look back further than the window itself).
 */
export function buildTrainingReview(
  entries: readonly ReviewEntry[],
  today: string,
  windowDays: number = 28
): TrainingReview {
  const from = addDays(today, -(windowDays - 1));
  const strength = entries.filter(isStrengthEntry);
  const inWindow = strength.filter((entry) => {
    const day = dayOf(entry);
    return day !== null && day >= from && day <= today;
  });

  const sessionDays = new Set<string>();
  for (const entry of inWindow) {
    if (workingSets(entry).length > 0) sessionDays.add(dayOf(entry)!);
  }

  // Stalls: per exercise, oldest first, one best estimate per day.
  const byExercise = new Map<
    string,
    { name: string; days: Map<string, number> }
  >();
  for (const entry of strength) {
    const day = dayOf(entry);
    if (!day || day > today) continue;
    if (entry.exercise_modality === 'bodyweight_reps') continue;
    const estimate = bestEstimatedOneRepMax(entry);
    if (estimate <= 0) continue;
    const key = entry.exercise_id ?? entry.exercise_name ?? '';
    if (!key) continue;
    const bucket = byExercise.get(key) ?? {
      name: entry.exercise_name ?? key,
      days: new Map<string, number>(),
    };
    bucket.days.set(day, Math.max(bucket.days.get(day) ?? 0, estimate));
    byExercise.set(key, bucket);
  }
  const stalls: ExerciseStall[] = [];
  for (const [exerciseId, { name, days }] of byExercise) {
    const ordered = [...days.entries()].sort(([a], [b]) => a.localeCompare(b));
    const values = ordered.map(([, value]) => value);
    const stalledSessions = countStalledSessions(values);
    if (stalledSessions < STALL_MIN_SESSIONS) continue;
    stalls.push({
      exerciseId,
      exerciseName: name,
      sessions: values.length,
      stalledSessions,
      bestEstimatedOneRepMaxKg: round1(Math.max(...values)),
      lastEstimatedOneRepMaxKg: round1(values[values.length - 1]!),
      lastDate: ordered[ordered.length - 1]![0],
    });
  }
  stalls.sort((a, b) => b.stalledSessions - a.stalledSessions);

  // Effort: only sets that recorded RPE or RIR count.
  let rpeSum = 0;
  let rpeCount = 0;
  let rirSum = 0;
  let rirCount = 0;
  const nearFailure: string[] = [];
  const perExercise = new Map<
    string,
    { name: string; rpe: number[]; rir: number[] }
  >();
  for (const entry of inWindow) {
    const key = entry.exercise_id ?? entry.exercise_name ?? '';
    for (const set of workingSets(entry)) {
      const rpe = set.rpe == null ? null : Number(set.rpe);
      const rir = set.rir == null ? null : Number(set.rir);
      if (rpe !== null && Number.isFinite(rpe)) {
        rpeSum += rpe;
        rpeCount += 1;
      }
      if (rir !== null && Number.isFinite(rir)) {
        rirSum += rir;
        rirCount += 1;
      }
      if (!key) continue;
      const bucket = perExercise.get(key) ?? {
        name: entry.exercise_name ?? key,
        rpe: [],
        rir: [],
      };
      if (rpe !== null && Number.isFinite(rpe)) bucket.rpe.push(rpe);
      if (rir !== null && Number.isFinite(rir)) bucket.rir.push(rir);
      perExercise.set(key, bucket);
    }
  }
  const average = (values: number[]): number =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  for (const { name, rpe, rir } of perExercise.values()) {
    const hardRpe =
      rpe.length >= NEAR_FAILURE_MIN_SETS && average(rpe) >= ADAPTIVE_HIGH_RPE;
    const hardRir =
      rir.length >= NEAR_FAILURE_MIN_SETS && average(rir) <= ADAPTIVE_LOW_RIR;
    if ((hardRpe || hardRir) && !nearFailure.includes(name)) {
      nearFailure.push(name);
    }
  }

  // Coverage by canonical muscle.
  const muscleSets: Record<string, number> = {};
  for (const entry of inWindow) {
    const count = workingSets(entry).length;
    if (count === 0) continue;
    for (const muscle of normalizeMuscleList(musclesOf(entry))) {
      muscleSets[muscle] = (muscleSets[muscle] ?? 0) + count;
    }
  }
  const earlierMuscles = new Set<string>();
  for (const entry of strength) {
    const day = dayOf(entry);
    if (!day || day >= from || workingSets(entry).length === 0) continue;
    for (const muscle of normalizeMuscleList(musclesOf(entry))) {
      earlierMuscles.add(muscle);
    }
  }
  const untrainedMuscles = [...earlierMuscles]
    .filter((muscle) => !(muscle in muscleSets))
    .sort();

  return {
    window: { from, to: today, days: windowDays },
    sessions: sessionDays.size,
    sessionsPerWeek: round1(sessionDays.size / (windowDays / 7)),
    enoughData: sessionDays.size >= TRAINING_REVIEW_MIN_SESSIONS,
    stalls,
    effort: {
      sampledSets: Math.max(rpeCount, rirCount),
      averageRpe: rpeCount > 0 ? round1(rpeSum / rpeCount) : null,
      averageRir: rirCount > 0 ? round1(rirSum / rirCount) : null,
      nearFailure,
    },
    muscleSets,
    untrainedMuscles,
  };
}
