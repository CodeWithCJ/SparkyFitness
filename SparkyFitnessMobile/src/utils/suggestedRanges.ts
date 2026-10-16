import {
  HEART_RATE_BAND_HIGHEST_BPM,
  addDays,
  HEART_RATE_BAND_LOWEST_BPM,
  PACE_BAND_FASTEST_SECONDS_PER_KM,
  PACE_BAND_SLOWEST_SECONDS_PER_KM,
  classifyActivitySport,
  racePaceZones,
  type ExerciseActivityQueryItem,
  type HeartRateBand,
  type PaceBand,
  type PaceReferenceRace,
  type StepEffort,
} from '@workspace/shared';
import type { RecordingActivity } from './gpsRecording';

/**
 * Ranges worth suggesting for a plan's fast and easy stretches and its
 * warm-up and cool-down. They are starting points, never applied without a
 * tap, and say where they came from.
 */

/** Ranges for a plan's fast stretches, its easy ones, and its warm-up and cool-down. */
export interface SuggestedPair<T> {
  work: T;
  easy: T;
  warm: T;
}

/**
 * Heart-rate fractions of the maximum: warm-up and cool-down are an easy
 * zone 1, easy is a conversational zone 2, fast is a hard tempo effort.
 */
const WARM_HEART_RATE_FRACTION = [0.5, 0.65] as const;
const EASY_HEART_RATE_FRACTION = [0.6, 0.72] as const;
const WORK_HEART_RATE_FRACTION = [0.82, 0.92] as const;

/** Heart rate rounded to the 5 bpm the steppers move by. */
const roundToFive = (value: number): number => Math.round(value / 5) * 5;

const clampBpm = (value: number): number =>
  Math.min(
    HEART_RATE_BAND_HIGHEST_BPM,
    Math.max(HEART_RATE_BAND_LOWEST_BPM, value)
  );

/**
 * Maximum heart rate from age, by the Tanaka formula (208 - 0.7 x age), which
 * holds up better than 220 - age at both ends. Null for an age that cannot be
 * right. It is a population estimate: a measured maximum is better.
 */
export function estimateMaxHeartRate(age: number): number | null {
  if (!Number.isFinite(age) || age < 10 || age > 100) return null;
  return Math.round(208 - 0.7 * age);
}

/** The warm-up, easy and fast heart-rate ranges for someone with `maxHeartRate`. */
export function suggestedHeartRateRanges(
  maxHeartRate: number
): SuggestedPair<HeartRateBand> {
  const band = ([low, high]: readonly [number, number]): HeartRateBand => ({
    minBpm: clampBpm(roundToFive(maxHeartRate * low)),
    maxBpm: clampBpm(roundToFive(maxHeartRate * high)),
  });
  return {
    warm: band(WARM_HEART_RATE_FRACTION),
    easy: band(EASY_HEART_RATE_FRACTION),
    work: band(WORK_HEART_RATE_FRACTION),
  };
}

/** How many of the latest outdoor sessions to judge a typical pace by. */
const REFERENCE_SESSIONS = 8;
/** Sessions older than this say little about today's fitness. */
const REFERENCE_WINDOW_DAYS = 60;
/** Shorter outings are warm-ups or errands, not a pace to compare with. */
const MIN_REFERENCE_METERS = 1000;
/** At least this many sessions before a pace is suggested at all. */
const MIN_REFERENCE_SESSIONS = 2;

export interface ReferencePace {
  /** Distance-weighted average pace of the sessions used. */
  secondsPerKm: number;
  sessions: number;
}

const sportMatches = (
  item: ExerciseActivityQueryItem,
  activity: RecordingActivity
): boolean => {
  const { sport } = classifyActivitySport({
    exerciseName: item.exerciseName,
    category: item.category,
    notes: item.notes,
  });
  if (activity === 'run') return sport === 'running';
  if (activity === 'walk') return sport === 'walking' || sport === 'hiking';
  return false;
};

/**
 * The person's typical pace for `activity`: the distance-weighted average of
 * their latest outdoor sessions in the last 60 days, from the same list the
 * Exercise Statistics cardio view reads. Null with fewer than two such
 * sessions, because one run says nothing about a range.
 */
export function referencePace(
  sessions: readonly ExerciseActivityQueryItem[],
  activity: RecordingActivity,
  today: string
): ReferencePace | null {
  const earliest = addDays(today, -REFERENCE_WINDOW_DAYS);
  const used = sessions
    .filter(
      (item) =>
        item.hasGpsTrack &&
        item.entryDate >= earliest &&
        (item.distanceMeters ?? 0) >= MIN_REFERENCE_METERS &&
        (item.avgPaceSecondsPerKm ?? 0) > 0 &&
        sportMatches(item, activity)
    )
    .sort((a, b) => (a.entryDate < b.entryDate ? 1 : -1))
    .slice(0, REFERENCE_SESSIONS);
  if (used.length < MIN_REFERENCE_SESSIONS) return null;
  let meters = 0;
  let seconds = 0;
  for (const item of used) {
    const distance = item.distanceMeters ?? 0;
    meters += distance;
    seconds += (distance / 1000) * (item.avgPaceSecondsPerKm ?? 0);
  }
  return { secondsPerKm: seconds / (meters / 1000), sessions: used.length };
}

/**
 * Multiples of the typical pace. A typical pace is an average over easy and
 * hard days, so fast stretches sit under it and easy ones over it; a walk's
 * range is tighter because brisk and easy walking are closer together. A
 * warm-up or cool-down can be a jog or a walk, so its slow edge is far out:
 * it only asks for nothing quicker than an easy effort.
 */
const PACE_FACTORS: Record<
  'run' | 'walk',
  SuggestedPair<readonly [fast: number, slow: number]>
> = {
  run: { work: [0.84, 0.94], easy: [1.05, 1.22], warm: [1.1, 2.4] },
  walk: { work: [0.9, 0.98], easy: [1.02, 1.15], warm: [1.0, 1.6] },
};

/** Seconds per km rounded to the 5 s the pace steppers move by. */
const roundPace = (seconds: number): number =>
  Math.min(
    PACE_BAND_SLOWEST_SECONDS_PER_KM,
    Math.max(PACE_BAND_FASTEST_SECONDS_PER_KM, Math.round(seconds / 5) * 5)
  );

/**
 * A warm-up and cool-down range built from an easy range, for a runner whose
 * zones are known: nothing quicker than the easy range's fast edge, and the
 * slow edge pushed out so a walking warm-up does not alert.
 */
export function warmPaceFromEasy(easy: PaceBand): PaceBand {
  return {
    minSecondsPerKm: roundPace(easy.minSecondsPerKm),
    maxSecondsPerKm: roundPace(easy.maxSecondsPerKm * 2),
  };
}

/** What a recent race gives: fast and easy ranges, and one for each effort a plan can ask for. */
export interface RacePaceRanges {
  pair: SuggestedPair<PaceBand>;
  /** Ranges for each effort a plan can ask for. Hill repeats get none: pace means nothing uphill. */
  byEffort: Partial<Record<Exclude<StepEffort, 'hill'>, PaceBand>>;
}

/**
 * Pace ranges from a recent race result, for a run: the plan's fast stretches
 * get the interval range (about 5K pace) and its easy ones the easy range, and
 * tempo, marathon-pace and stride efforts get their own. Null for a walk or
 * ride, or a result that cannot be right.
 */
export function suggestedPaceRangesFromRace(
  race: PaceReferenceRace,
  activity: RecordingActivity
): RacePaceRanges | null {
  if (activity !== 'run') return null;
  const zones = racePaceZones(race);
  if (!zones?.interval || !zones.easy) return null;
  const byEffort: RacePaceRanges['byEffort'] = { easy: zones.easy };
  if (zones.tempo) byEffort.tempo = zones.tempo;
  if (zones.marathon) byEffort.marathon = zones.marathon;
  if (zones.stride) byEffort.stride = zones.stride;
  return {
    pair: {
      work: zones.interval,
      easy: zones.easy,
      warm: warmPaceFromEasy(zones.easy),
    },
    byEffort,
  };
}

/** The fast, easy and warm-up pace ranges around a typical pace; null for a ride. */
export function suggestedPaceRanges(
  reference: ReferencePace,
  activity: RecordingActivity
): SuggestedPair<PaceBand> | null {
  if (activity === 'ride') return null;
  const factors = PACE_FACTORS[activity];
  const band = ([fast, slow]: readonly [number, number]): PaceBand => ({
    minSecondsPerKm: roundPace(reference.secondsPerKm * fast),
    maxSecondsPerKm: roundPace(reference.secondsPerKm * slow),
  });
  return {
    work: band(factors.work),
    easy: band(factors.easy),
    warm: band(factors.warm),
  };
}
