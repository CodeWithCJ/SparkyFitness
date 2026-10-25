// Detects the same workout imported twice from Health Connect (#2839).
//
// Two apps (a watch app and Google's own tracking, say) can each write the same
// walk to Health Connect as separate records. The phone sends both, tagged with
// the same source, so the only thing telling them apart is their source_id and
// both become exercise entries: the day's duration, distance, steps and
// calories double.
//
// The two copies need not agree on the activity: a watch may call a session
// "Running" while the phone calls it "Walking". On-foot activities therefore
// count as one kind (see activityGroup); anything else must match by name.
//
// This module only decides; it has no database access. The handler gathers the
// candidates, asks classifyIncomingWorkout, and acts on the answer.

/** Overlap and similarity limits for "probably the same workout". */
export const WORKOUT_DEDUPE_THRESHOLDS = {
  /** Shared time as a share of the LONGER of the two workouts. */
  minOverlapRatio: 0.8,
  /**
   * Largest relative difference (of the larger value) for a measure to count
   * as agreeing: duration, distance, steps, heart rate (avg and max).
   */
  maxRelativeDiff: 0.15,
  /** How many of those measures must agree, among the ones both copies have. */
  minAgreeingSignals: 2,
};

/**
 * Activities that are all "moving on foot": two apps often label the same
 * session differently (Walking vs Running, Hike vs Walk). Word stems, matched
 * as substrings of the lowercased label, like workoutActivityMapping.
 */
const ON_FOOT_ACTIVITY_STEMS = ['walk', 'run', 'jog', 'hik', 'trek'];

/** Opt-in: SPARKY_FITNESS_HEALTH_WORKOUT_DEDUPE=true turns the check on. */
export function isWorkoutDedupeEnabled(): boolean {
  return process.env.SPARKY_FITNESS_HEALTH_WORKOUT_DEDUPE === 'true';
}

export interface WorkoutSummary {
  /** Exercise entry id; absent for the incoming record. */
  id?: string;
  source: string;
  sourceId: string | null;
  activity: string;
  /** Start instant in epoch milliseconds; null when the record has no start time. */
  startMs: number | null;
  durationMinutes: number;
  distanceKm: number | null;
  steps: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  /** How much detail the record carries (see completenessScore). */
  completeness: number;
  /**
   * Entered by the person (manual source, a preset or a workout plan). Such an
   * entry is never skipped in favour of, replaced by, or merged into a sync.
   */
  isManual: boolean;
}

export type DuplicateSignal = 'duration' | 'distance' | 'steps' | 'heart rate';

export interface DuplicateMetrics {
  overlapRatio: number;
  durationDiff: number | null;
  distanceDiff: number | null;
  stepsDiff: number | null;
  /** The larger of the avg and max heart-rate differences. */
  heartRateDiff: number | null;
  /** The measures within maxRelativeDiff. */
  agreeing: DuplicateSignal[];
}

export type IncomingWorkoutDecision =
  /** No probable duplicate: import as usual. */
  | { kind: 'none' }
  /** The incoming source_id already has its own entry: a normal re-sync update. */
  | { kind: 'resync'; existing: WorkoutSummary }
  /** Overlaps a manual entry: import anyway, but say so in the log. */
  | {
      kind: 'manual-overlap';
      existing: WorkoutSummary;
      metrics: DuplicateMetrics;
    }
  /** A synced entry already holds this workout and is at least as complete. */
  | {
      kind: 'keep-existing';
      existing: WorkoutSummary;
      metrics: DuplicateMetrics;
    }
  /** The incoming record is more complete than the synced entry holding this workout. */
  | {
      kind: 'replace-existing';
      existing: WorkoutSummary;
      metrics: DuplicateMetrics;
    };

/** Fields that make one copy of a workout more useful than another. */
export interface CompletenessFields {
  avg_heart_rate?: unknown;
  max_heart_rate?: unknown;
  elevation_gain_meters?: unknown;
  moving_time_seconds?: unknown;
  distance?: unknown;
  steps?: unknown;
  calories_burned?: unknown;
  hasGps?: boolean;
  hasHrSamples?: boolean;
}

const isPositive = (value: unknown) => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
};

/** One point per field present; heart rate and a route count most. */
export function completenessScore(fields: CompletenessFields): number {
  let score = 0;
  if (isPositive(fields.avg_heart_rate)) score += 2;
  if (isPositive(fields.max_heart_rate)) score += 1;
  if (fields.hasGps) score += 2;
  if (fields.hasHrSamples) score += 1;
  if (isPositive(fields.elevation_gain_meters)) score += 1;
  if (isPositive(fields.moving_time_seconds)) score += 1;
  if (isPositive(fields.distance)) score += 1;
  if (isPositive(fields.steps)) score += 1;
  if (isPositive(fields.calories_burned)) score += 1;
  return score;
}

/** Shared time divided by the longer duration (0 when either has no start time). */
export function overlapRatio(a: WorkoutSummary, b: WorkoutSummary): number {
  if (a.startMs === null || b.startMs === null) return 0;
  const aEnd = a.startMs + a.durationMinutes * 60_000;
  const bEnd = b.startMs + b.durationMinutes * 60_000;
  const shared = Math.min(aEnd, bEnd) - Math.max(a.startMs, b.startMs);
  const longer = Math.max(a.durationMinutes, b.durationMinutes) * 60_000;
  if (shared <= 0 || longer <= 0) return 0;
  return shared / longer;
}

/** |a - b| relative to the larger value; null when either is missing or zero. */
export function relativeDiff(
  a: number | null,
  b: number | null
): number | null {
  if (!isPositive(a) || !isPositive(b)) return null;
  return (
    Math.abs((a as number) - (b as number)) / Math.max(a as number, b as number)
  );
}

/** 'on-foot' for walking, running, hiking and the like; otherwise the label itself. */
export function activityGroup(activity: string): string {
  const label = activity.trim().toLowerCase();
  return ON_FOOT_ACTIVITY_STEMS.some((stem) => label.includes(stem))
    ? 'on-foot'
    : label;
}

/** Avg heart rate difference, or the max one when larger; null without avg on both. */
function heartRateDiff(a: WorkoutSummary, b: WorkoutSummary): number | null {
  const avg = relativeDiff(a.avgHeartRate, b.avgHeartRate);
  if (avg === null) return null;
  const max = relativeDiff(a.maxHeartRate, b.maxHeartRate);
  return max === null ? avg : Math.max(avg, max);
}

/** Metrics for a pair that qualifies as a probable duplicate, or null when it does not. */
export function compareWorkouts(
  incoming: WorkoutSummary,
  existing: WorkoutSummary
): DuplicateMetrics | null {
  const limits = WORKOUT_DEDUPE_THRESHOLDS;
  if (activityGroup(incoming.activity) !== activityGroup(existing.activity)) {
    return null;
  }
  const overlap = overlapRatio(incoming, existing);
  if (overlap < limits.minOverlapRatio) return null;
  // A measure only counts when both copies have it: one app may not record
  // steps or heart rate at all, which says nothing about whether it is the
  // same walk. The two apps also estimate distance differently, so no single
  // measure can veto the match; enough of the others have to agree.
  const diffs: [DuplicateSignal, number | null][] = [
    [
      'duration',
      relativeDiff(incoming.durationMinutes, existing.durationMinutes),
    ],
    ['distance', relativeDiff(incoming.distanceKm, existing.distanceKm)],
    ['steps', relativeDiff(incoming.steps, existing.steps)],
    ['heart rate', heartRateDiff(incoming, existing)],
  ];
  const agreeing = diffs
    .filter(([, diff]) => diff !== null && diff <= limits.maxRelativeDiff)
    .map(([signal]) => signal);
  if (agreeing.length < limits.minAgreeingSignals) return null;
  const [durationDiff, distanceDiff, stepsDiff, hrDiff] = diffs.map(
    ([, diff]) => diff
  );
  return {
    overlapRatio: overlap,
    durationDiff,
    distanceDiff,
    stepsDiff,
    heartRateDiff: hrDiff,
    agreeing,
  };
}

/**
 * Decides what to do with an incoming synced workout, given the entries
 * already stored around its day (any source, manual included).
 */
export function classifyIncomingWorkout(
  incoming: WorkoutSummary,
  existing: WorkoutSummary[]
): IncomingWorkoutDecision {
  if (!incoming.sourceId || incoming.startMs === null) return { kind: 'none' };

  const sameRecord = existing.find(
    (e) => e.source === incoming.source && e.sourceId === incoming.sourceId
  );
  if (sameRecord) return { kind: 'resync', existing: sameRecord };

  let best: { existing: WorkoutSummary; metrics: DuplicateMetrics } | null =
    null;
  for (const candidate of existing) {
    const metrics = compareWorkouts(incoming, candidate);
    if (!metrics) continue;
    if (!best || metrics.overlapRatio > best.metrics.overlapRatio) {
      best = { existing: candidate, metrics };
    }
  }
  if (!best) return { kind: 'none' };
  if (best.existing.isManual) return { kind: 'manual-overlap', ...best };
  // A synced entry without a source_id cannot be recorded as merged, and a tie
  // keeps what is already stored, so the result does not depend on order.
  if (
    best.existing.sourceId &&
    incoming.completeness > best.existing.completeness
  ) {
    return { kind: 'replace-existing', ...best };
  }
  return { kind: 'keep-existing', ...best };
}

const pct = (value: number | null) =>
  value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;

/** One log line describing why a pair was judged the same workout. */
export function describeMatch(
  incoming: WorkoutSummary,
  existing: WorkoutSummary,
  metrics: DuplicateMetrics
): string {
  return (
    `'${incoming.activity}' ${incoming.source}/${incoming.sourceId} vs '${existing.activity}' entry ${existing.id} ` +
    `(${existing.source}/${existing.sourceId ?? 'no source_id'}): overlap ${pct(metrics.overlapRatio)}, ` +
    `duration diff ${pct(metrics.durationDiff)}, distance diff ${pct(metrics.distanceDiff)}, ` +
    `steps diff ${pct(metrics.stepsDiff)}, heart rate diff ${pct(metrics.heartRateDiff)}, ` +
    `agreeing: ${metrics.agreeing.join(', ')}, completeness ${incoming.completeness} vs ${existing.completeness}`
  );
}
