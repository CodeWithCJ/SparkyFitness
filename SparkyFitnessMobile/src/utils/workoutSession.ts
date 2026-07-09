import type {
  ExerciseEntrySetRequest,
  ExerciseEntrySetResponse,
  ExerciseSessionResponse,
  ExerciseSnapshotResponse,
  PresetSessionExerciseRequest,
  PresetSessionResponse,
} from '@workspace/shared';
import type { IconName } from '../components/Icon';
// Type-only, so the store's runtime import of this module stays acyclic.
import type { CompletedSetMap, PrSetMap } from '../stores/activeWorkoutStore';
import type { WorkoutDraftExercise } from '../types/drafts';
import type { Exercise } from '../types/exercise';
import type { WorkoutPreset, WorkoutPresetExercise } from '../types/workoutPresets';
import type { WorkoutPresetExercisePayload } from '../services/api/workoutPresetsApi';
import { weightToKg, weightFromKg, distanceFromKm } from './unitConversions';
import { parseDecimalInput } from './numericInput';
import { DEFAULT_REST_SEC } from './workoutSupersets';

// The superset/reorder algebra lives in its own module; re-exported here so
// the many existing import sites keep working.
export * from './workoutSupersets';

export const CATEGORY_ICON_MAP: Record<string, IconName> = {
  Strength: 'exercise-weights',
  Cardio: 'exercise-running',
  Running: 'exercise-running',
  Cycling: 'exercise-cycling',
  Swimming: 'exercise-swimming',
  Walking: 'exercise-walking',
  Hiking: 'exercise-hiking',
  Yoga: 'exercise-yoga',
  Pilates: 'exercise-pilates',
  Dance: 'exercise-dance',
  Boxing: 'exercise-boxing',
  Rowing: 'exercise-rowing',
  Tennis: 'exercise-tennis',
  Basketball: 'exercise-basketball',
  Soccer: 'exercise-soccer',
  Elliptical: 'exercise-elliptical',
  'Stair Stepper': 'exercise-stair',
};

// Keyword matching for exercise names that don't exactly match CATEGORY_ICON_MAP keys
// (e.g. HealthKit's "Traditional Strength Training", "Stair Climbing")
const NAME_KEYWORDS: [string, IconName][] = [
  ['cycling', 'exercise-cycling'],
  ['biking', 'exercise-cycling'],
  ['swim', 'exercise-swimming'],
  ['walk', 'exercise-walking'],
  ['hik', 'exercise-hiking'],
  ['yoga', 'exercise-yoga'],
  ['pilates', 'exercise-pilates'],
  ['danc', 'exercise-dance'],
  ['box', 'exercise-boxing'],
  ['row', 'exercise-rowing'],
  ['tennis', 'exercise-tennis'],
  ['basketball', 'exercise-basketball'],
  ['soccer', 'exercise-soccer'],
  ['elliptical', 'exercise-elliptical'],
  ['stair', 'exercise-stair'],
  ['strength', 'exercise-weights'],
  ['weight', 'exercise-weights'],
  ['run', 'exercise-running'],
];

export function getWorkoutIcon(session: ExerciseSessionResponse): IconName {
  if (session.type === 'preset') return 'exercise-weights';

  const name = session.name ?? session.exercise_snapshot?.name ?? '';
  const category = session.exercise_snapshot?.category;

  // Exact name match (handles synced workouts where name is the activity type)
  if (name in CATEGORY_ICON_MAP) return CATEGORY_ICON_MAP[name];

  // Category match (for manually created exercises with proper categories)
  if (category && category !== 'Cardio' && category in CATEGORY_ICON_MAP) {
    return CATEGORY_ICON_MAP[category];
  }

  // Keyword match on name (e.g. "Traditional Strength Training" → strength → weights icon)
  const nameLower = name.toLowerCase();
  for (const [keyword, icon] of NAME_KEYWORDS) {
    if (nameLower.includes(keyword)) return icon;
  }

  // Generic Cardio category fallback
  if (category && category in CATEGORY_ICON_MAP) {
    return CATEGORY_ICON_MAP[category];
  }

  return 'exercise-default';
}

const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  healthkit: 'Apple Health',
  'health connect': 'Health Connect',
  garmin: 'Garmin',
  strava: 'Strava',
  fitbit: 'Fitbit',
  withings: 'Withings',
};

export function getSourceLabel(source: string | null): { label: string; isSparky: boolean } {
  const s = source?.toLowerCase() ?? null;
  if (s == null || s === 'manual' || s === 'sparky' || s === 'workout plan') {
    return { label: 'Sparky', isSparky: true };
  }
  return { label: SOURCE_DISPLAY_NAMES[s] ?? source!, isSparky: false };
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

export function getFirstImage(session: ExerciseSessionResponse): string | null {
  if (session.type === 'individual') {
    return session.exercise_snapshot?.images?.[0] ?? null;
  }
  for (const exercise of session.exercises) {
    const img = exercise.exercise_snapshot?.images?.[0];
    if (img) return img;
  }
  return null;
}

export function getSessionCalories(session: ExerciseSessionResponse): number {
  if (session.type === 'preset') {
    return session.exercises.reduce((sum, e) => sum + e.calories_burned, 0);
  }
  return session.calories_burned || 0;
}

// --- Exercise stats (single-pass over sessions array) ---

export interface ExerciseStats {
  caloriesBurned: number;
  activeCalories: number;
  otherExerciseCalories: number;
  durationMinutes: number;
}

export function calculateExerciseStats(sessions: ExerciseSessionResponse[]): ExerciseStats {
  let caloriesBurned = 0;
  let activeCalories = 0;
  let otherExerciseCalories = 0;
  let durationMinutes = 0;

  for (const session of sessions) {
    const sessionCals = getSessionCalories(session);
    caloriesBurned += sessionCals;

    if (session.type === 'preset') {
      otherExerciseCalories += sessionCals;
      durationMinutes += session.total_duration_minutes;
    } else {
      const isActiveCals = session.exercise_snapshot?.name === 'Active Calories';
      if (isActiveCals) {
        activeCalories += session.calories_burned || 0;
      } else {
        otherExerciseCalories += sessionCals;
        durationMinutes += session.duration_minutes ?? 0;
      }
    }
  }

  return { caloriesBurned, activeCalories, otherExerciseCalories, durationMinutes };
}

/** Total calories across all sessions. */
export const calculateCaloriesBurned = (sessions: ExerciseSessionResponse[]): number =>
  calculateExerciseStats(sessions).caloriesBurned;

/** Calories from "Active Calories" individual entries only (e.g. watch/fitness tracker). */
export const calculateActiveCalories = (sessions: ExerciseSessionResponse[]): number =>
  calculateExerciseStats(sessions).activeCalories;

/** Calories from all sessions except "Active Calories" entries. */
export const calculateOtherExerciseCalories = (sessions: ExerciseSessionResponse[]): number =>
  calculateExerciseStats(sessions).otherExerciseCalories;

/** Total duration in minutes, excluding "Active Calories" entries. */
export const calculateExerciseDuration = (sessions: ExerciseSessionResponse[]): number =>
  calculateExerciseStats(sessions).durationMinutes;

export function getWorkoutSummary(session: ExerciseSessionResponse): {
  name: string;
  duration: number;
  calories: number;
} {
  if (session.type === 'preset') {
    return {
      name: session.name,
      duration: session.total_duration_minutes,
      calories: getSessionCalories(session),
    };
  }
  return {
    name: session.name ?? session.exercise_snapshot?.name ?? 'Unknown exercise',
    duration: session.duration_minutes,
    calories: session.calories_burned,
  };
}

export function buildSessionSubtitle(
  session: ExerciseSessionResponse,
  duration: number,
  calories: number,
  weightUnit: 'kg' | 'lbs' = 'kg',
  distanceUnit: 'km' | 'miles' = 'km',
): string {
  if (session.type === 'preset') {
    const exerciseCount = session.exercises.length;
    const totalSets = session.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
    const totalVolumeKg = session.exercises.reduce(
      (sum, ex) => ex.sets.reduce((s, set) => s + (set.weight ?? 0) * (set.reps ?? 0), sum),
      0,
    );

    const parts: string[] = [];
    parts.push(`${exerciseCount} exercise${exerciseCount !== 1 ? 's' : ''}`);
    if (totalSets > 0) parts.push(`${totalSets} sets`);
    if (totalVolumeKg > 0) {
      const vol = Math.round(weightFromKg(totalVolumeKg, weightUnit));
      parts.push(`${vol.toLocaleString()} ${weightUnit}`);
    }
    return parts.join(' \u00b7 ');
  }

  // Individual with sets: show sets info + duration/calories
  if (session.sets.length > 0) {
    const totalSets = session.sets.length;
    const totalVolumeKg = session.sets.reduce(
      (sum, set) => sum + (set.weight ?? 0) * (set.reps ?? 0), 0,
    );
    const parts: string[] = [];
    parts.push(`${totalSets} set${totalSets !== 1 ? 's' : ''}`);
    if (totalVolumeKg > 0) {
      const vol = Math.round(weightFromKg(totalVolumeKg, weightUnit));
      parts.push(`${vol.toLocaleString()} ${weightUnit}`);
    }
    if (duration > 0) parts.push(formatDuration(duration));
    if (calories > 0) parts.push(`${Math.round(calories)} Cal`);
    return parts.join(' \u00b7 ');
  }

  // Individual activity: duration, distance, calories
  const parts: string[] = [];
  if (duration > 0) parts.push(formatDuration(duration));
  if (session.distance != null && session.distance > 0) {
    const dist = distanceFromKm(session.distance, distanceUnit);
    const label = distanceUnit === 'miles' ? 'mi' : 'km';
    parts.push(`${dist.toFixed(1)} ${label}`);
  }
  if (calories > 0) parts.push(`${Math.round(calories)} Cal`);
  return parts.join(' \u00b7 ');
}

export function buildExercisesPayload(
  exercises: WorkoutDraftExercise[],
  weightUnit: 'kg' | 'lbs',
) {
  // Server enforces "all or none" for exercise IDs on preset-session update
  // (exerciseService.js ~L1713). If any exercise is new, we strip IDs from all
  // exercises AND all sets so the server takes its delete-and-recreate path.
  // Set IDs within an exercise, by contrast, reconcile correctly with mixed
  // IDs — update for present IDs, insert for absent, delete for omitted.
  const allExercisesHaveServerId =
    exercises.length > 0 && exercises.every(e => e.serverId !== undefined);

  return exercises.map((exercise, index) => ({
    ...(allExercisesHaveServerId && exercise.serverId !== undefined
      ? { id: exercise.serverId }
      : {}),
    exercise_id: exercise.exerciseId,
    sort_order: index,
    duration_minutes: 0,
    // The form has no superset UI; round-trip the value opaquely so manual
    // edits don't flatten grouping (the server nulls omitted fields).
    superset_group: exercise.supersetGroup ?? null,
    sets: exercise.sets.map((set, setIndex) => {
      const weight = parseDecimalInput(set.weight);
      const reps = parseInt(set.reps, 10);
      // The server set UPDATE writes all nine columns with `set.x ?? null`,
      // so fields the form has no UI for must still be round-tripped
      // explicitly — omitting them silently wipes the stored values.
      return {
        ...(allExercisesHaveServerId && set.serverId !== undefined
          ? { id: set.serverId }
          : {}),
        set_number: setIndex + 1,
        set_type: set.setType ?? null,
        weight: isNaN(weight) ? null : weightToKg(weight, weightUnit),
        reps: isNaN(reps) ? null : reps,
        duration: set.duration ?? null,
        ...(set.restTime != null ? { rest_time: set.restTime } : {}),
        notes: set.notes ?? null,
        rpe: set.rpe ?? null,
        completed_at: set.completedAt ?? null,
        is_pr: set.isPr ?? false,
      };
    }),
  }));
}

// --- Set metrics (active-workout log column + volume summaries) ---

/** Epley estimated one-rep max. Returns 0 when weight or reps are missing/zero. */
export function epley1RmKg(weightKg: number | null, reps: number | null): number {
  if (weightKg == null || reps == null || weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/** Estimated weight liftable for `targetReps`, derived from the Epley 1RM. */
export function estimateRepMaxKg(
  weightKg: number | null,
  reps: number | null,
  targetReps: number,
): number {
  const oneRm = epley1RmKg(weightKg, reps);
  if (oneRm === 0 || targetReps <= 0) return 0;
  return oneRm / (1 + targetReps / 30);
}

export function setVolumeKg(set: Pick<ExerciseEntrySetResponse, 'weight' | 'reps'>): number {
  return (set.weight ?? 0) * (set.reps ?? 0);
}

/** Total working volume for an exercise entry. Warmup sets are excluded. */
export function getExerciseVolumeKg(exercise: { sets: WorkoutCardSet[] }): number {
  return exercise.sets.reduce(
    (total, set) => (set.set_type === 'warmup' ? total : total + setVolumeKg(set)),
    0,
  );
}

// --- Card-stack input shapes ---
//
// The active-workout card and set row accept these narrow structural
// interfaces so one card stack serves live sessions (`ExerciseEntryResponse`
// satisfies them as-is), form drafts, and preset templates. Do NOT fabricate
// `ExerciseEntryResponse` objects with synthetic ids for the form surfaces —
// map through the adapters below instead.

export interface WorkoutCardSet {
  /** Server set id (number) or `WorkoutDraftSet.clientId` (string). */
  id: string | number;
  set_number: number;
  set_type?: string | null;
  /** ALWAYS kg — display conversion happens in the row. */
  weight: number | null;
  reps: number | null;
  rpe?: number | null;
  rest_time?: number | null;
  duration?: number | null;
  /** Raw draft strings backing the edit-mode controlled inputs (draft mapper only). */
  editWeightText?: string;
  editRepsText?: string;
}

export interface WorkoutCardExercise {
  /** Entry id or `WorkoutDraftExercise.clientId`. */
  id: string;
  exercise_id: string;
  superset_group?: number | null;
  exercise_snapshot: {
    name?: string | null;
    category?: string | null;
    images?: string[] | null;
  } | null;
  sets: WorkoutCardSet[];
}

/**
 * Adapt a form-draft exercise for the card stack. Weight parsing matches
 * `buildExercisesPayload` exactly (parseDecimalInput → weightToKg, NaN → null)
 * so what the card displays is what a save would persist.
 */
export function draftExerciseToCardExercise(
  exercise: WorkoutDraftExercise,
  weightUnit: 'kg' | 'lbs',
): WorkoutCardExercise {
  return {
    id: exercise.clientId,
    exercise_id: exercise.exerciseId,
    superset_group: exercise.supersetGroup ?? null,
    exercise_snapshot: exercise.snapshot ?? {
      name: exercise.exerciseName,
      category: exercise.exerciseCategory,
      images: exercise.images,
    },
    sets: exercise.sets.map((set, index) => {
      const weight = parseDecimalInput(set.weight);
      const reps = parseInt(set.reps, 10);
      return {
        id: set.clientId,
        set_number: index + 1,
        set_type: set.setType ?? null,
        weight: isNaN(weight) ? null : weightToKg(weight, weightUnit),
        reps: isNaN(reps) ? null : reps,
        rpe: set.rpe ?? null,
        rest_time: set.restTime ?? null,
        duration: set.duration ?? null,
        editWeightText: set.weight,
        editRepsText: set.reps,
      };
    }),
  };
}

/** Adapt a saved preset exercise for the card stack (weights already kg). */
export function presetExerciseToCardExercise(
  exercise: WorkoutPresetExercise,
): WorkoutCardExercise {
  return {
    id: String(exercise.id),
    exercise_id: exercise.exercise_id,
    superset_group: exercise.superset_group ?? null,
    exercise_snapshot: {
      name: exercise.exercise_name,
      category: exercise.category ?? null,
      images: exercise.image_url ? [exercise.image_url] : [],
    },
    sets: exercise.sets.map((set, index) => ({
      id: set.id,
      set_number: index + 1,
      set_type: set.set_type ?? null,
      weight: set.weight ?? null,
      reps: set.reps ?? null,
      rpe: null,
      rest_time: set.rest_time ?? null,
      duration: set.duration ?? null,
    })),
  };
}

export function formatVolume(volumeKg: number, weightUnit: string): string {
  const value = weightFromKg(volumeKg, weightUnit as 'kg' | 'lbs');
  return `${Math.round(value).toLocaleString()} ${weightUnit}`;
}

export type RpeTone = 'easy' | 'moderate' | 'hard' | 'max';

/** Effort bucket for tinting a logged RPE value. */
export function getRpeTone(rpe: number): RpeTone {
  if (rpe <= 7) return 'easy';
  if (rpe < 9) return 'moderate';
  if (rpe < 10) return 'hard';
  return 'max';
}

export const TEMP_EXERCISE_ENTRY_ID_PREFIX = 'temp-';

/** Client-added exercise entries carry `temp-` string ids until saved. */
export function isTempExerciseEntryId(id: string): boolean {
  return id.startsWith(TEMP_EXERCISE_ENTRY_ID_PREFIX);
}

/** Client-added sets carry negative placeholder ids until the server assigns real ones. */
export function isTempSetId(id: number): boolean {
  return id < 0;
}

/**
 * Build the `exercises` payload for a preset-session PUT from a live session
 * snapshot (the active-workout autosave path). Session values are already
 * metric (kg), so unlike the draft builder there is no unit conversion or
 * string parsing.
 *
 * Every set column is emitted explicitly — the server set UPDATE writes all
 * nine columns with `set.x ?? null`, so an omitted field silently wipes it.
 * Exercise-level `notes` behaves the same way.
 *
 * `completed_at` comes from `completedSetIds` (the store's completion map,
 * the local source of truth during a live workout), not from the session's
 * set objects — an unmapped set deliberately sends `null` so unchecking a
 * set propagates as a clear. `is_pr` is derived the same way from
 * `prSetIds` — a missing key sends `false`, so unchecking a PR set clears it.
 *
 * Ids follow the server's "all or none" rule for exercises: if any exercise
 * is client-added (temp id), every exercise AND set id is stripped so the
 * server takes its delete-and-recreate path. Otherwise exercise ids are kept
 * and only real (non-negative) set ids are sent — temp ids must never reach
 * the server, where an unknown id is a 400.
 *
 * `startedAtMs` (the store's `startedAt`) turns on duration stamping: when a
 * set has been completed after it, each exercise's `duration_minutes` becomes
 * its share of the wall-clock span from workout start to the LAST completed
 * set, split proportionally by completed-set count. The server derives
 * calories from duration, so this is also what makes live workouts earn
 * calories. Anchoring on the last completion (not "now") keeps a
 * flushed-hours-later abandoned session from claiming hours of exercise.
 * Without `startedAtMs`, or before anything is completed, existing durations
 * round-trip unchanged.
 */
export function buildSessionExercisesPayload(
  session: PresetSessionResponse,
  completedSetIds: CompletedSetMap,
  prSetIds: PrSetMap,
  startedAtMs?: number | null,
): PresetSessionExerciseRequest[] {
  const allExercisesHaveServerId =
    session.exercises.length > 0 &&
    session.exercises.every((e) => !isTempExerciseEntryId(e.id));

  const durationByEntryId = buildSessionDurationMinutes(session, completedSetIds, startedAtMs);

  return session.exercises.map((exercise, index) => ({
    ...(allExercisesHaveServerId ? { id: exercise.id } : {}),
    exercise_id: exercise.exercise_id,
    sort_order: index,
    duration_minutes:
      durationByEntryId?.get(exercise.id) ?? exercise.duration_minutes ?? 0,
    notes: exercise.notes ?? null,
    // `?? null` also normalizes `undefined` from sessions persisted before
    // the superset upgrade.
    superset_group: exercise.superset_group ?? null,
    sets: exercise.sets.map((set, setIndex) => {
      const completedMs = completedSetIds[String(set.id)];
      return {
        ...(allExercisesHaveServerId && !isTempSetId(set.id) ? { id: set.id } : {}),
        set_number: setIndex + 1,
        set_type: set.set_type ?? null,
        reps: set.reps ?? null,
        weight: set.weight ?? null,
        duration: set.duration ?? null,
        rest_time: set.rest_time ?? null,
        notes: set.notes ?? null,
        rpe: set.rpe ?? null,
        completed_at: completedMs != null ? new Date(completedMs).toISOString() : null,
        is_pr: prSetIds[String(set.id)] === true,
      };
    }),
  }));
}

/**
 * Wall-clock live-workout durations: the span from `startedAtMs` to the last
 * completed set, split across exercises proportionally by completed-set count
 * (an exercise with nothing completed gets 0). Returns null — "leave existing
 * durations alone" — when `startedAtMs` is absent or nothing has been
 * completed after it (e.g. a resumed session whose seeded completions predate
 * this start).
 */
export function buildSessionDurationMinutes(
  session: PresetSessionResponse,
  completedSetIds: CompletedSetMap,
  startedAtMs?: number | null,
): Map<string, number> | null {
  if (startedAtMs == null) return null;

  let lastCompletedMs = 0;
  let totalCompleted = 0;
  const completedCountByEntryId = new Map<string, number>();
  for (const exercise of session.exercises) {
    let count = 0;
    for (const s of exercise.sets) {
      const ms = completedSetIds[String(s.id)];
      if (ms == null) continue;
      count++;
      totalCompleted++;
      if (ms > lastCompletedMs) lastCompletedMs = ms;
    }
    completedCountByEntryId.set(exercise.id, count);
  }
  if (totalCompleted === 0 || lastCompletedMs <= startedAtMs) return null;

  const totalMinutes = (lastCompletedMs - startedAtMs) / 60_000;
  const byEntryId = new Map<string, number>();
  for (const exercise of session.exercises) {
    const count = completedCountByEntryId.get(exercise.id) ?? 0;
    const share = (totalMinutes * count) / totalCompleted;
    byEntryId.set(exercise.id, Math.round(share * 10) / 10);
  }
  return byEntryId;
}

/** Set types offered by the long-press set-type pickers. */
export const SET_TYPE_OPTIONS = ['warmup', 'normal', 'drop', 'failure'] as const;

// --- Personal record (PR) detection ---
//
// A PR is a working set that beats the historical best for its exercise —
// heavier weight, or more reps at the same top weight. Warmups never count.
// Detection is pure so it can run in the store (both the screen and the HUD
// complete-set paths) and be exhaustively tested.

/**
 * True when `set_type` names a warmup, matching the server's SQL filter:
 * lowercase, strip every non-alphanumeric, prefix-match `warmup`. Catches the
 * repo's many variants — `warmup`, `Warm-up`, `Warmup`, `Warm up`,
 * `Warm-up Set`. NULL/undefined counts as a working set.
 */
export function isWarmupSetType(setType: string | null | undefined): boolean {
  if (setType == null) return false;
  return setType.toLowerCase().replace(/[^a-z0-9]/g, '').startsWith('warmup');
}

/** A single historical best used as the PR baseline (all weights kg). */
export interface PrBaselineEntry {
  weight: number | null;
  reps: number | null;
}

/**
 * Compare two weighted sets by (weight at hundredths precision, then reps).
 * Returns > 0 when `a` is the better record, < 0 when `b` is, 0 when tied.
 *
 * Hundredths, not epsilon: the DB stores `numeric(10,2)`, so a sub-cent
 * difference round-trips to equality — and rounding also kills the float dust
 * from lb→kg conversion. Null reps count as 0. Both weights must be non-null.
 */
export function compareSetRecords(
  a: { weight: number; reps: number | null },
  b: { weight: number; reps: number | null },
): number {
  const wa = Math.round(a.weight * 100);
  const wb = Math.round(b.weight * 100);
  if (wa !== wb) return wa - wb;
  return (a.reps ?? 0) - (b.reps ?? 0);
}

/**
 * Decide whether completing `candidateSetId` is a PR.
 *
 * Never a PR when: the set is a warmup, its weight is null, the exercise's
 * baseline was never captured (key absent), or the baseline is `null`
 * (first-ever exercise — nothing to beat). The effective best is the better
 * of the captured baseline and every already-completed non-warmup weighted
 * set for the same exercise this session (excluding the candidate), ordered by
 * `compareSetRecords`. A PR is a strictly heavier set, or an equal-weight set
 * with strictly more reps.
 */
export function isPrSet(
  session: PresetSessionResponse,
  candidateSetId: string,
  completedSetIds: CompletedSetMap,
  prBaseline: Record<string, PrBaselineEntry | null>,
): boolean {
  let candidate: ExerciseEntrySetResponse | undefined;
  let exerciseId: string | undefined;
  for (const exercise of session.exercises) {
    const found = exercise.sets.find((s) => String(s.id) === candidateSetId);
    if (found) {
      candidate = found;
      exerciseId = exercise.exercise_id;
      break;
    }
  }
  if (!candidate || exerciseId == null) return false;
  if (candidate.weight == null) return false;
  if (isWarmupSetType(candidate.set_type)) return false;

  // Baseline key absent = never captured; null = captured with no history.
  if (!(exerciseId in prBaseline)) return false;
  const baseline = prBaseline[exerciseId];
  if (baseline == null) return false;

  // Start the running best from the baseline, then fold in every already-
  // completed session set for the same exercise (the candidate excluded).
  let best: { weight: number; reps: number | null } | null =
    baseline.weight != null ? { weight: baseline.weight, reps: baseline.reps } : null;

  for (const exercise of session.exercises) {
    if (exercise.exercise_id !== exerciseId) continue;
    for (const s of exercise.sets) {
      if (String(s.id) === candidateSetId) continue;
      if (s.weight == null) continue;
      if (isWarmupSetType(s.set_type)) continue;
      if (completedSetIds[String(s.id)] == null) continue;
      const contender = { weight: s.weight, reps: s.reps };
      if (best == null || compareSetRecords(contender, best) > 0) best = contender;
    }
  }

  // Baseline had no weight and no completed session set to beat — with history
  // present but no comparable record, stay conservative and award nothing.
  if (best == null) return false;

  return compareSetRecords({ weight: candidate.weight, reps: candidate.reps }, best) > 0;
}

/**
 * Seed the PR-stamp map from server-persisted `is_pr` flags, mirroring
 * `seedCompletionFromSession`. Used when resuming a workout so previously
 * earned PRs stay stamped across a cold start.
 */
export function seedPrFromSession(session: PresetSessionResponse): PrSetMap {
  const seeded: PrSetMap = {};
  for (const exercise of session.exercises) {
    for (const s of exercise.sets) {
      if (s.is_pr) seeded[String(s.id)] = true;
    }
  }
  return seeded;
}

// --- Live-start payload builders ---


/**
 * Request-shaped sibling of activeWorkoutStore's `makeDefaultSet` (which
 * builds the response shape with a placeholder id) — keep the two in sync.
 */
function makeDefaultStartSet(setNumber: number): ExerciseEntrySetRequest {
  return {
    set_number: setNumber,
    set_type: 'normal',
    reps: null,
    weight: null,
    duration: null,
    rest_time: DEFAULT_REST_SEC,
    notes: null,
    rpe: null,
    completed_at: null,
  };
}

/**
 * Build the `exercises` payload for creating a live session straight from a
 * saved workout preset. Preset values are already metric (kg) — no unit
 * conversion. Every set column is emitted explicitly (the server set write
 * uses `set.x ?? null`; see buildSessionExercisesPayload).
 *
 * A preset exercise with zero sets gets one default set: the server accepts
 * zero-set exercises, but the live workout treats a zero-step session as
 * already finished. A preset with zero exercises returns [] — callers must
 * block before creating (the create schema requires at least one exercise).
 */
export function buildPresetStartExercisesPayload(
  preset: WorkoutPreset,
): PresetSessionExerciseRequest[] {
  return preset.exercises.map((exercise, index) => ({
    exercise_id: exercise.exercise_id,
    sort_order: index,
    duration_minutes: 0,
    notes: null,
    // Live sessions started from a preset inherit its superset grouping.
    superset_group: exercise.superset_group ?? null,
    sets:
      exercise.sets.length === 0
        ? [makeDefaultStartSet(1)]
        : exercise.sets.map((set, setIndex) => ({
            set_number: setIndex + 1,
            set_type: set.set_type ?? 'normal',
            reps: set.reps ?? null,
            weight: set.weight ?? null,
            duration: set.duration ?? null,
            rest_time: set.rest_time ?? null,
            notes: set.notes ?? null,
            rpe: null,
            completed_at: null,
          })),
  }));
}

/**
 * Build a full `Exercise` from a session's `exercise_snapshot` so a workout
 * card can open the library Exercise Detail screen. The snapshot carries the
 * same fields the catalog does (muscles, equipment, instructions, etc.);
 * missing ones fall back to empty so the detail screen still renders cleanly.
 */
export function exerciseFromSnapshot(
  snapshot: ExerciseSnapshotResponse | null,
  exerciseId: string,
): Exercise {
  return {
    id: snapshot?.id ?? exerciseId,
    name: snapshot?.name ?? 'Exercise',
    category: snapshot?.category ?? null,
    equipment: snapshot?.equipment ?? [],
    primary_muscles: snapshot?.primary_muscles ?? [],
    secondary_muscles: snapshot?.secondary_muscles ?? [],
    calories_per_hour: snapshot?.calories_per_hour ?? 0,
    source: snapshot?.source ?? '',
    images: snapshot?.images ?? [],
    tags: snapshot?.tags ?? [],
    force: snapshot?.force ?? null,
    level: snapshot?.level ?? null,
    mechanic: snapshot?.mechanic ?? null,
    instructions: snapshot?.instructions ?? undefined,
    description: snapshot?.description ?? undefined,
    userId: snapshot?.user_id ?? null,
    isCustom: snapshot?.is_custom ?? undefined,
  };
}

/**
 * Build a full `Exercise` from the sparse fields a card, draft, or preset row
 * carries (id, name, category, images). The remaining catalog fields are left
 * empty; the Exercise Detail screen hydrates them by id. Used wherever no full
 * `exercise_snapshot` is available.
 */
export function makeSparseExercise(params: {
  id: string;
  name?: string | null;
  category?: string | null;
  images?: string[] | null;
}): Exercise {
  return {
    id: params.id,
    name: params.name ?? 'Exercise',
    category: params.category ?? null,
    equipment: [],
    primary_muscles: [],
    secondary_muscles: [],
    calories_per_hour: 0,
    source: '',
    images: params.images ?? [],
    tags: [],
    force: null,
    level: null,
    mechanic: null,
    instructions: undefined,
    description: undefined,
    userId: null,
    isCustom: undefined,
  };
}

/**
 * Build an `Exercise` from a form-draft exercise so its card can open the
 * library Exercise Detail. Drafts that originated from an existing session
 * carry the full snapshot; freshly-added ones only know name/category/images,
 * so the detail screen hydrates the rest by id.
 */
export function exerciseFromDraft(exercise: WorkoutDraftExercise): Exercise {
  if (exercise.snapshot) {
    return exerciseFromSnapshot(exercise.snapshot, exercise.exerciseId);
  }
  return makeSparseExercise({
    id: exercise.exerciseId,
    name: exercise.exerciseName,
    category: exercise.exerciseCategory,
    images: exercise.images,
  });
}

/** Single-exercise payload for an empty live start (first-exercise-first flow). */
export function buildSingleExerciseStartPayload(
  exercise: Pick<Exercise, 'id'>,
): PresetSessionExerciseRequest[] {
  return [
    {
      exercise_id: exercise.id,
      sort_order: 0,
      duration_minutes: 0,
      notes: null,
      sets: [makeDefaultStartSet(1)],
    },
  ];
}

export function buildPresetExercisesPayload(
  exercises: WorkoutDraftExercise[],
  weightUnit: 'kg' | 'lbs',
): WorkoutPresetExercisePayload[] {
  // Preset exercises with zero sets are valid on the server and render as
  // "No sets" in the detail view. Do NOT filter them out — saving an unrelated
  // edit would silently delete the user's zero-set rows from the preset.
  return exercises.map((exercise, index) => ({
    exercise_id: exercise.exerciseId,
    image_url: exercise.images[0] ?? null,
    sort_order: index,
    superset_group: exercise.supersetGroup ?? null,
    sets: exercise.sets.map((set, setIndex) => {
      const weight = parseDecimalInput(set.weight);
      const reps = parseInt(set.reps, 10);
      return {
        set_number: setIndex + 1,
        set_type: set.setType ?? 'normal',
        reps: isNaN(reps) ? null : reps,
        weight: isNaN(weight) ? null : weightToKg(weight, weightUnit),
        duration: set.duration ?? null,
        rest_time: set.restTime ?? null,
        notes: set.notes ?? null,
      };
    }),
  }));
}
