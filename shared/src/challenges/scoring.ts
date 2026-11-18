/**
 * Challenge scoring: pure functions, no I/O. The server feeds in one member's
 * own workouts and steps (read through that member's RLS context) and stores
 * what comes out; web and mobile use the same rules object to explain points.
 *
 * Fairness rules carried by the default (All-Rounder) points builder:
 * - Effort by heart rate: minutes in the member's own zones 1-2 pay 1 point,
 *   zones 3-5 pay 2. An average heart rate is used only when a workout has no
 *   zone breakdown, and a workout with no heart rate at all pays 0.75.
 * - Lifting earns at least 1.5 a minute, because rest between sets pulls the
 *   average heart rate down.
 * - Each day's first 60 minutes count in full, the next 30 at half, the rest
 *   nothing; minutes are counted best-paying first, zone by zone, so one
 *   workout and the same minutes split over two workouts score the same.
 * - Only the best 5 days of each Monday-to-Sunday week count.
 * - Steps: 1 point per 1,000, at most 10 a day.
 * - PRs (heaviest lift, longest or fastest effort against the member's own
 *   last 90 days): +15 each, at most 2 a day.
 * - Streak: +5 a day from the third active day in a row.
 * - Beat your own 28-day average: +10.
 * - A self-adjusting weekly goal: up to +50, pro rata.
 * - The same workout synced from two sources counts once.
 */
import { addDays, daysInRange } from '../utils/timezone.ts';
import {
  classifyActivitySport,
  toPrSportGroup,
  type ActivitySport,
  type PrSportGroup,
} from '../utils/activitySport.ts';
import {
  isLiveWorkoutSource,
  isUserOriginatedSource,
  normalizeSource,
} from '../constants/exercise.ts';
import { resolveExerciseCalories } from '../utils/calorieCalculations.ts';
import {
  calorieLinkFixedSide,
  isCalorieLinkWorkoutSource,
  type CalorieLinkResolution,
} from '../utils/exerciseCalorieLink.ts';
import { heartRateZoneFor } from '../utils/heartRateZones.ts';
import { weekStartOf } from '../utils/trainingConsistency.ts';
import { isoWeekday, type ChallengeWindow } from './periods.ts';
import {
  DEFAULT_CHALLENGE_GOAL_TYPE,
  type ChallengeGoalType,
  type ChallengePointsRules,
  type ChallengePrType,
  type ChallengeRules,
} from './rules.ts';

/** One workout of one member, as the scorer needs it. */
export interface ChallengeEntry {
  id: string;
  /** The member's own calendar day (exercise_entries.entry_date). */
  date: string;
  /** Local start time, HH:MM, when known. */
  time?: string | null;
  /**
   * Minutes. On a copy the manual-minute cap shortened, distance, calories and
   * elevation are cut by the same fraction, so pace stays the measured pace.
   */
  durationMin: number;
  avgHr?: number | null;
  /** Seconds in heart-rate zones 1 to 5, when the workout has a zone breakdown. */
  zoneSeconds?: readonly number[] | null;
  name?: string | null;
  category?: string | null;
  /** Where the entry came from, as stored ('Manual', 'garmin', ...); see isManualEntry. */
  source?: string | null;
  distanceM?: number | null;
  /**
   * The logged distance, set only on a copy the manual-minute cap cut, so
   * the pace PR's minimum length sees the whole distance (the cut leaves the
   * pace as it was).
   */
  measuredDistanceM?: number | null;
  /** Best estimated one-rep max of the entry's sets, in kg. */
  bestE1rm?: number | null;
  /** Identifies "the same lift" across days (the exercise id, else the name). */
  exerciseKey?: string | null;
  /** What the Diary counts for it: the member's override when set, else its own figure. */
  activeCalories?: number | null;
  /**
   * Set only when the member overrode the calories the Diary counts
   * (`calories_applied`): the workout's own figure, which a challenge that
   * caps or ignores manual entries scores instead (see challengeTypedCalories).
   */
  caloriesEstimate?: number | null;
  elevationM?: number | null;
  /** Shared by the two sides of a Diary calorie link (`calorie_link_id`). */
  calorieLinkId?: string | null;
  /** How that link was resolved (`calorie_link_resolution`); see calorieLinkSideCounts. */
  calorieLinkResolution?: CalorieLinkResolution | null;
  /** On the copy that was kept: the ids of the copies merged into it, comma-separated. */
  mergedFrom?: string;
  /**
   * Under a manual cap, on a measured copy with no start time: the typed-in
   * copies with one that merged into it. A time window counts the first of
   * them inside it instead, capped, so a typed time never moves a measured
   * workout into it.
   */
  typedTimedCopies?: ChallengeEntry[];
}

/** The member's own heart-rate zones (resolved with resolveHeartRateZones). */
export interface ChallengeMemberZones {
  maxHr: number;
  /** Lower bound in bpm of zones 1 to 5. */
  floors: readonly number[];
}

export interface ChallengeMemberData {
  entries: readonly ChallengeEntry[];
  /** Steps per day (the highest any source recorded). */
  steps: Readonly<Record<string, number>>;
  /**
   * The daily "Active Calories" rows a device syncs, kept apart from the
   * workouts because each already includes theirs.
   */
  dailyCalories?: readonly ChallengeEntry[];
  zones: ChallengeMemberZones;
}

export type ChallengeEntryClass = 'strength' | PrSportGroup;

const LIFT_RE =
  /\b(strength|weights?|weight ?lifting|lift(ing)?|bench|squat|deadlift|press|curl|pull-?ups?|chin-?ups?|dips?|lunges?|kettlebell|dumbbell|barbell|resistance|hypertrophy|push|pull|legs? day|upper|lower body|full body)\b/i;
/**
 * A lifting row by its name: "row" with a lifting word ("Barbell Row", "Bent
 * Over Row", "Seated Cable Row"). A bare "Row" or "Indoor Row" is rowing.
 */
const LIFT_ROW_RE =
  /\b(barbell|dumbbell|db|cable|bent[- ]?over|seated|t-?bar|pendlay|upright|inverted|single[- ]arm|one[- ]arm|kettlebell|landmine|renegade|chest[- ]supported|machine|meadows|kroc|yates)\b.*\brows?\b/i;
const LIFT_CATEGORY_RE = /strength|powerlifting|weightlifting|strongman/i;
const CARDIO_CATEGORY_RE = /cardio/i;

const round1 = (n: number): number => Math.round(n * 10) / 10;
const roundTo = (n: number, step: number): number =>
  Math.round(n / step) * step;
const num = (v: number | null | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

/** The shared sport classification of a workout, from its name and category. */
export function challengeEntrySport(e: ChallengeEntry): ActivitySport {
  return classifyActivitySport({ exerciseName: e.name, category: e.category })
    .sport;
}

/**
 * What the entry's category says: true for lifting (Strength), false for not
 * lifting (Cardio), null when it says neither and the name has to decide.
 */
export function challengeCategoryLifting(
  category: string | null | undefined
): boolean | null {
  if (!category) return null;
  if (LIFT_CATEGORY_RE.test(category)) return true;
  if (CARDIO_CATEGORY_RE.test(category)) return false;
  return null;
}

/** 'run' | 'ride' | 'walk' | 'swim' for a cardio workout, else null. A Strength entry never is one. */
export function challengeActivityKind(e: ChallengeEntry): PrSportGroup | null {
  if (challengeCategoryLifting(e.category) === true) return null;
  const group = toPrSportGroup(challengeEntrySport(e));
  return group === 'other' ? null : group;
}

/**
 * Importers that file every workout they create under Cardio, whatever the
 * sport, so their Cardio says nothing (entry sources, normalised).
 */
const CARDIO_BY_DEFAULT_SOURCES: ReadonlySet<string> = new Set([
  'oura',
  'polar',
  'withings',
]);

/**
 * A lifting workout. The category decides first: Strength is lifting, Cardio
 * is not, whatever the name says, with one exception: Oura, Polar and
 * Withings file every workout they create under Cardio, so from them a
 * Cardio entry the shared classifier calls a strength sport ("Strength
 * Training") is lifting unless its name says cardio. Only when the category
 * says neither do the name, the shared sport and weighted sets decide; a run,
 * ride, walk or swim never is.
 */
export function isStrengthEntry(e: ChallengeEntry): boolean {
  const byCategory = challengeCategoryLifting(e.category);
  if (byCategory === true) return true;
  if (byCategory === false)
    return (
      CARDIO_BY_DEFAULT_SOURCES.has(normalizeSource(e.source) ?? '') &&
      challengeEntrySport(e) === 'strength' &&
      !CARDIO_CATEGORY_RE.test(e.name ?? '')
    );
  if (LIFT_ROW_RE.test(e.name ?? '')) return true;
  if (challengeActivityKind(e)) return false;
  if (challengeEntrySport(e) === 'strength') return true;
  if (num(e.bestE1rm) > 0) return true;
  return LIFT_RE.test(`${e.name ?? ''} ${e.category ?? ''}`);
}

/**
 * The sport a challenge's sport filter sees: 'strength' for a lifting
 * workout (so "Barbell Row" is not rowing), else the shared sport, with a
 * Cardio entry that is not lifting never taken for strength.
 */
export function challengeFilterSport(e: ChallengeEntry): ActivitySport {
  if (isStrengthEntry(e)) return 'strength';
  const sport = challengeEntrySport(e);
  return sport === 'strength' ? 'other' : sport;
}

export function challengeEntryClass(e: ChallengeEntry): ChallengeEntryClass {
  return isStrengthEntry(e)
    ? 'strength'
    : (challengeActivityKind(e) ?? 'other');
}

const hasHr = (e: ChallengeEntry): boolean =>
  num(e.avgHr) > 0 || (e.zoneSeconds ?? []).some((s) => s > 0);

/**
 * Logged by hand, decided by the source alone: no source, or one a member
 * makes in the app (the diary form's 'Manual', a logged preset, a plan
 * workout), in any casing. A heart rate typed into the diary form does not
 * make it measured. A live workout ('sparky') is timed by the app, so it is
 * not one.
 */
export function isManualEntry(e: ChallengeEntry): boolean {
  return (
    !normalizeSource(e.source) ||
    (isUserOriginatedSource(e.source) && !isLiveWorkoutSource(e.source))
  );
}

export type ChallengeRateBasis = 'zones' | 'average_hr' | 'no_hr';

/** Minutes of one workout paid at one rate (one zone, below zone 1, or a flat rate). */
export interface ChallengeRateBucket {
  minutes: number;
  perMin: number;
}

export interface ChallengeEntryRate {
  minutes: number;
  /** The workout's average rate over all its minutes. */
  perMin: number;
  /** Its minutes by rate; the daily tiers are applied to these, best-paying first. */
  buckets: ChallengeRateBucket[];
  basis: ChallengeRateBasis;
  /** The zone of the average heart rate (0 below zone 1); null when not used. */
  zone: number | null;
  strength: boolean;
  /** True when the lifting floor raised the rate. */
  strengthFloored: boolean;
  points: number;
}

/** Points rate of one workout, before the daily minute tiers. */
export function challengeEntryRate(
  e: ChallengeEntry,
  zones: ChallengeMemberZones,
  rules: ChallengePointsRules
): ChallengeEntryRate {
  let minutes = Math.max(0, num(e.durationMin));
  const zoneMinutes = (e.zoneSeconds ?? []).map(
    (s) => Math.max(0, num(s)) / 60
  );
  const covered = zoneMinutes.reduce((s, m) => s + m, 0);
  let perMin: number;
  let basis: ChallengeRateBasis;
  let zone: number | null = null;
  let buckets: ChallengeRateBucket[];
  if (covered > 0) {
    // Time the breakdown does not cover is treated as below zone 1.
    minutes = Math.max(minutes, covered);
    buckets = zoneMinutes.map((m, i) => ({
      minutes: m,
      perMin: rules.zoneRates[i] ?? 0,
    }));
    buckets.push({ minutes: minutes - covered, perMin: rules.belowZoneRate });
    buckets = buckets.filter((b) => b.minutes > 0);
    const paid = buckets.reduce((s, b) => s + b.minutes * b.perMin, 0);
    perMin = paid / minutes;
    basis = 'zones';
  } else if (num(e.avgHr) > 0) {
    zone = heartRateZoneFor(num(e.avgHr), zones.floors);
    perMin = zone > 0 ? (rules.zoneRates[zone - 1] ?? 0) : rules.belowZoneRate;
    basis = 'average_hr';
    buckets = [{ minutes, perMin }];
  } else {
    perMin = rules.noHrRate;
    basis = 'no_hr';
    buckets = [{ minutes, perMin }];
  }
  const strength = isStrengthEntry(e);
  let strengthFloored = false;
  const floor = rules.strengthFloor;
  if (strength && floor !== null && buckets.some((b) => b.perMin < floor)) {
    // Every lifting minute earns at least the floor, bucket by bucket, so a
    // workout split in two scores the same as one.
    buckets = buckets.map((b) => ({
      minutes: b.minutes,
      perMin: Math.max(b.perMin, floor),
    }));
    perMin =
      minutes > 0
        ? buckets.reduce((s, b) => s + b.minutes * b.perMin, 0) / minutes
        : floor;
    strengthFloored = true;
  }
  return {
    minutes,
    perMin,
    buckets,
    basis,
    zone,
    strength,
    strengthFloored,
    points: minutes * perMin,
  };
}

export function challengeStepPoints(
  steps: number | null | undefined,
  rules: ChallengePointsRules
): number {
  if (!rules.steps) return 0;
  const s = Math.max(0, num(steps));
  return Math.min(
    rules.steps.dailyCap,
    Math.floor(s / rules.steps.stepsPerPoint)
  );
}

export interface ChallengeEntryEffort extends ChallengeEntryRate {
  id: string;
  rawPoints: number;
  fullMinutes: number;
  halfMinutes: number;
  unpaidMinutes: number;
}

export interface ChallengeDayEffort {
  effort: number;
  rawEffort: number;
  minutes: number;
  unpaidMinutes: number;
  detail: ChallengeEntryEffort[];
  active: boolean;
}

/**
 * Effort for one day. Minutes are counted best-paying first: the first
 * `full` minutes in full, the next `half` at `halfRate`, the rest at zero.
 * The order is by each workout's rate buckets (zone by zone), not by its
 * average rate, so splitting a workout in two never changes the day's points.
 */
export function challengeDayEffort(
  dayEntries: readonly ChallengeEntry[] | undefined,
  zones: ChallengeMemberZones,
  rules: ChallengePointsRules
): ChallengeDayEffort {
  const list: ChallengeEntryEffort[] = (dayEntries ?? []).map((e) => {
    const rate = challengeEntryRate(e, zones, rules);
    return {
      id: e.id,
      ...rate,
      rawPoints: rate.points,
      fullMinutes: rate.minutes,
      halfMinutes: 0,
      unpaidMinutes: 0,
    };
  });
  const tiers = rules.minuteTiers;
  const fullEnd = tiers ? tiers.full : Infinity;
  const halfEnd = tiers ? tiers.full + tiers.half : Infinity;
  const halfRate = tiers ? tiers.halfRate : 1;
  for (const p of list) {
    p.points = 0;
    p.fullMinutes = 0;
  }
  const order = list
    .flatMap((p) => p.buckets.map((b) => ({ p, b })))
    .sort((x, y) => y.b.perMin - x.b.perMin);
  let used = 0;
  let effort = 0;
  for (const { p, b } of order) {
    const full = Math.min(b.minutes, Math.max(0, fullEnd - used));
    const half = Math.min(b.minutes - full, Math.max(0, halfEnd - used - full));
    const points = b.perMin * (full + halfRate * half);
    p.points += points;
    p.fullMinutes += full;
    p.halfMinutes += half;
    p.unpaidMinutes += b.minutes - full - half;
    used += b.minutes;
    effort += points;
  }
  const raw = list.reduce((s, p) => s + p.rawPoints, 0);
  return {
    effort,
    rawEffort: raw,
    minutes: used,
    unpaidMinutes: tiers ? Math.max(0, used - halfEnd) : 0,
    detail: list,
    active: list.length > 0,
  };
}

/** Minutes per km. A capped copy keeps the measured pace (both were cut alike). */
export const challengePace = (e: ChallengeEntry): number | null =>
  num(e.distanceM) > 0 && num(e.durationMin) > 0
    ? num(e.durationMin) / (num(e.distanceM) / 1000)
    : null;
const paceOf = challengePace;
/**
 * The distance as logged, for the pace PR's minimum length: a capped copy
 * still covered all of it at the same pace. Distance PRs use the capped
 * distance, so the cap holds there.
 */
const loggedDistance = (e: ChallengeEntry): number =>
  num(e.measuredDistanceM ?? e.distanceM);
const liftKey = (e: ChallengeEntry): string =>
  e.exerciseKey
    ? `k:${e.exerciseKey}`
    : `n:${String(e.name ?? '')
        .trim()
        .toLowerCase()}`;

export interface ChallengePr {
  entryId: string;
  type: ChallengePrType;
  /** run | ride | walk | swim for distance and pace PRs. */
  kind: PrSportGroup | null;
  /** kg for a lift, metres for distance, minutes per km for pace. */
  value: number;
  previous: number;
}

function groupByDate(
  entries: readonly ChallengeEntry[]
): Map<string, ChallengeEntry[]> {
  const byDate = new Map<string, ChallengeEntry[]>();
  for (const e of entries) {
    if (!e?.date) continue;
    const list = byDate.get(e.date);
    if (list) list.push(e);
    else byDate.set(e.date, [e]);
  }
  return byDate;
}

/**
 * Personal records set by the workouts of `day`, each against the same
 * member's workouts in the `lookbackDays` before that day.
 */
export function challengePrsForDay(
  day: string,
  byDate: ReadonlyMap<string, readonly ChallengeEntry[]>,
  rules: ChallengePointsRules
): ChallengePr[] {
  const pr = rules.pr;
  if (!pr) return [];
  const today = byDate.get(day) ?? [];
  if (!today.length) return [];
  const earlier: ChallengeEntry[] = [];
  for (let i = 1; i <= pr.lookbackDays; i++) {
    for (const e of byDate.get(addDays(day, -i)) ?? []) earlier.push(e);
  }
  const wants = new Set(pr.types);
  const prs: ChallengePr[] = [];
  for (const e of today) {
    const e1 = num(e.bestE1rm);
    if (wants.has('lift') && e1 > 0) {
      const key = liftKey(e);
      const prev = earlier.filter(
        (x) => num(x.bestE1rm) > 0 && liftKey(x) === key
      );
      const best = Math.max(0, ...prev.map((x) => num(x.bestE1rm)));
      if (prev.length >= pr.minEarlier && e1 > best) {
        prs.push({
          entryId: e.id,
          type: 'lift',
          kind: null,
          value: round1(e1),
          previous: round1(best),
        });
      }
    }
    const kind = challengeActivityKind(e);
    if (!kind || !(num(e.distanceM) > 0)) continue;
    const prev = earlier.filter(
      (x) => challengeActivityKind(x) === kind && num(x.distanceM) > 0
    );
    if (wants.has('distance')) {
      const far = Math.max(0, ...prev.map((x) => num(x.distanceM)));
      if (prev.length >= pr.minEarlier && num(e.distanceM) > far) {
        prs.push({
          entryId: e.id,
          type: 'distance',
          kind,
          value: num(e.distanceM),
          previous: far,
        });
      }
    }
    const pace = paceOf(e);
    if (wants.has('pace') && pace && loggedDistance(e) >= pr.minPaceMeters) {
      const prevP = prev.filter(
        (x) => loggedDistance(x) >= pr.minPaceMeters && paceOf(x)
      );
      const fast = Math.min(...prevP.map((x) => paceOf(x) as number));
      if (prevP.length >= pr.minEarlier && pace < fast) {
        prs.push({
          entryId: e.id,
          type: 'pace',
          kind,
          value: round1(pace),
          previous: round1(fast),
        });
      }
    }
  }
  return prs;
}

/** Two copies of one workout start this close together, when both start times are known. */
export const CHALLENGE_DUPLICATE_START_MINUTES = 15;

const minuteOfDay = (time: string | null | undefined): number | null => {
  const m = /^(\d{2}):(\d{2})/.exec(time ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * One workout synced from two places (say the phone's health store with a
 * start time and the watch with heart rate) shows up twice. Pairs on the same
 * day, from different sources, of the same class (lifting, run, ride, swim,
 * walk, other), within 2 minutes or 10% of each other's length and, when both
 * start times are known, starting within 15 minutes of each other are merged:
 * the copy with heart rate is kept and fills in a missing time, distance or
 * lift from the other. Two workouts from the same source are never merged.
 * With `capManual` (manual entries are capped), a typed-in copy fills
 * nothing into a measured one, which the cap does not reach: no amount the
 * cap would cut (distance, calories, elevation), no lift, and no start time,
 * which decides a time window (see `typedTimedCopies`).
 */
export function mergeChallengeDuplicates(
  entries: readonly ChallengeEntry[],
  { capManual = false }: { capManual?: boolean } = {}
): ChallengeEntry[] {
  const list = entries.filter(Boolean);
  const drop = new Set<string>();
  const out = new Map<string, ChallengeEntry>();
  // Sources compared in one form ('Manual' and ' manual ' are one source)
  const differentSource = (a: ChallengeEntry, b: ChallengeEntry): boolean => {
    const sa = normalizeSource(a.source);
    const sb = normalizeSource(b.source);
    return sa && sb ? sa !== sb : hasHr(a) !== hasHr(b);
  };
  /** The length gap when `a` and `b` are copies of one workout, else null. */
  const duplicateGap = (
    a: ChallengeEntry,
    b: ChallengeEntry
  ): number | null => {
    if (
      !differentSource(a, b) ||
      challengeEntryClass(a) !== challengeEntryClass(b)
    )
      return null;
    const da = num(a.durationMin);
    const db = num(b.durationMin);
    const gap = Math.abs(da - db);
    if (gap > Math.max(2, 0.1 * Math.max(da, db))) return null;
    const ta = minuteOfDay(a.time);
    const tb = minuteOfDay(b.time);
    if (
      ta !== null &&
      tb !== null &&
      Math.abs(ta - tb) > CHALLENGE_DUPLICATE_START_MINUTES
    )
      return null;
    return gap;
  };
  for (const day of groupByDate(list).values()) {
    const pairs: { a: ChallengeEntry; b: ChallengeEntry; gap: number }[] = [];
    for (let i = 0; i < day.length; i++) {
      for (let j = i + 1; j < day.length; j++) {
        const gap = duplicateGap(day[i]!, day[j]!);
        if (gap !== null) pairs.push({ a: day[i]!, b: day[j]!, gap });
      }
    }
    pairs.sort((x, y) => x.gap - y.gap);
    // Closest pairs first, each copy joins one workout group in which every
    // copy matches every other (so never two from one source): three sources
    // of one run become one workout, two runs from one watch stay two.
    const groupOf = new Map<string, ChallengeEntry[]>();
    for (const e of day) groupOf.set(e.id, [e]);
    for (const { a, b } of pairs) {
      const ga = groupOf.get(a.id)!;
      const gb = groupOf.get(b.id)!;
      if (ga === gb) continue;
      // Every copy must match every other, so copies never chain through
      // a middle one into a group whose ends are two workouts.
      if (!ga.every((x) => gb.every((y) => duplicateGap(x, y) !== null)))
        continue;
      ga.push(...gb);
      for (const y of gb) groupOf.set(y.id, ga);
    }
    for (const group of new Set(groupOf.values())) {
      if (group.length < 2) continue;
      // A measured copy is kept over a typed-in one (so the manual cap never
      // cuts a synced workout), then the one with heart rate, then the
      // longest; the others fill in what it lacks. Its calories win unless
      // they are 0: a pair the Diary counts once, by a calorie link or an
      // override setting one side to 0, counts the other side's figure here.
      const [keep, ...others] = [...group].sort(
        (x, y) =>
          Number(isManualEntry(x)) - Number(isManualEntry(y)) ||
          Number(hasHr(y)) - Number(hasHr(x)) ||
          num(y.durationMin) - num(x.durationMin)
      );
      const merged: ChallengeEntry = {
        ...keep!,
        mergedFrom: others.map((o) => o.id).join(','),
      };
      const keepMeasured = capManual && !isManualEntry(keep!);
      for (const other of others) {
        if (keepMeasured && isManualEntry(other)) {
          if (other.time)
            merged.typedTimedCopies = [
              ...(merged.typedTimedCopies ?? []),
              other,
            ];
          drop.add(other.id);
          continue;
        }
        if (!merged.time && other.time) merged.time = other.time;
        if (!(num(merged.bestE1rm) > 0) && num(other.bestE1rm) > 0)
          merged.bestE1rm = other.bestE1rm;
        if (!(num(merged.distanceM) > 0) && num(other.distanceM) > 0)
          merged.distanceM = other.distanceM;
        if (!(num(merged.activeCalories) > 0) && num(other.activeCalories) > 0)
          merged.activeCalories = other.activeCalories;
        if (!(num(merged.elevationM) > 0) && num(other.elevationM) > 0)
          merged.elevationM = other.elevationM;
        drop.add(other.id);
      }
      if (merged.time) delete merged.typedTimedCopies;
      out.set(keep!.id, merged);
    }
  }
  return list.filter((e) => !drop.has(e.id)).map((e) => out.get(e.id) ?? e);
}

/**
 * Whether this side of a Diary calorie link is the one the link counts, read
 * from how the link was resolved (calorieLinkFixedSide, the Diary's own
 * mapping), never from a 0: a custom figure of 0 sets both sides to 0.
 * `higher` and `lower` leave the side they keep at its own estimate (no
 * `calories_applied`) and set the other to 0. A link stored without a
 * resolution falls back to the side that is not 0.
 */
function calorieLinkSideCounts(e: ChallengeEntry): boolean {
  const resolution = e.calorieLinkResolution;
  if (!resolution) return num(e.activeCalories) !== 0;
  const fixed = calorieLinkFixedSide(resolution);
  if (fixed)
    return isCalorieLinkWorkoutSource(e.source) === (fixed === 'manual');
  // `higher` and `lower` type no figure: the kept side is its own estimate
  return e.caloriesEstimate === undefined || num(e.activeCalories) !== 0;
}

/**
 * Calories as the challenge's manual-entry rule allows. An override of a
 * workout's calories is typed in by the member, so where manual entries are
 * capped or ignored it is treated like one: a measured workout scores its own
 * figure, up or down, and a typed-in entry keeps the override, since it is
 * capped or dropped as a whole anyway. Where manual entries count in full, the
 * override counts, as in the Diary.
 *
 * A calorie link writes the override on both sides, one of them 0. A link of
 * a measured workout with a typed-in one counts the measured side's own
 * figure and nothing for the typed-in side, so the pair counts once, merged
 * or not. A link of two measured entries counts the side its resolution
 * picks (calorieLinkSideCounts) at that side's own figure, not an average or
 * custom one, a custom 0 included. A link of two typed-in entries keeps
 * their figures. Pass every entry, the ignored ones too, so both sides are
 * seen.
 */
export function challengeTypedCalories(
  entries: readonly ChallengeEntry[],
  rules: ChallengeRules
): ChallengeEntry[] {
  if (rules.activities.manualEntries === 'count') return [...entries];
  const sides = new Map<string, { typed: boolean; measured: boolean }>();
  for (const e of entries) {
    if (!e.calorieLinkId) continue;
    const side = sides.get(e.calorieLinkId) ?? {
      typed: false,
      measured: false,
    };
    if (isManualEntry(e)) side.typed = true;
    else side.measured = true;
    sides.set(e.calorieLinkId, side);
  }
  return entries.map((e) => {
    const own =
      e.caloriesEstimate !== undefined ? e.caloriesEstimate : e.activeCalories;
    if (e.calorieLinkId) {
      const side = sides.get(e.calorieLinkId)!;
      // Two typed-in entries are capped or dropped as entered
      if (!side.measured) return e;
      // Two measured entries: the link picks the side that counts, but a
      // figure typed into it (average, custom) does not
      if (!side.typed)
        return { ...e, activeCalories: calorieLinkSideCounts(e) ? own : 0 };
      return { ...e, activeCalories: isManualEntry(e) ? 0 : own };
    }
    return e.caloriesEstimate !== undefined && !isManualEntry(e)
      ? { ...e, activeCalories: own }
      : e;
  });
}

function inTimeWindow(
  time: string | null | undefined,
  window: { start: string; end: string }
): boolean {
  if (!time) return false;
  const t = time.slice(0, 5);
  return window.start < window.end
    ? t >= window.start && t < window.end
    : t >= window.start || t < window.end; // a window across midnight
}

/**
 * The workouts that count under the challenge's activity rules: duplicates
 * merged, sports and short workouts filtered, the time window applied, and
 * manual entries ignored or capped per day.
 */
export function challengeCountedEntries(
  entries: readonly ChallengeEntry[],
  rules: ChallengeRules
): ChallengeEntry[] {
  const a = rules.activities;
  // Ignored manual entries go before duplicates are merged, so a timed copy
  // of the same workout is kept rather than merged into a dropped one.
  // Calories are settled first, so a merge keeps and fills in the figures
  // that count.
  const typed = challengeTypedCalories(entries, rules);
  const eligible =
    a.manualEntries === 'ignore'
      ? typed.filter((e) => !isManualEntry(e))
      : typed;
  let list = a.mergeDuplicates
    ? mergeChallengeDuplicates(eligible, {
        capManual: a.manualEntries === 'cap',
      }).map((e) => {
        const typed = e.typedTimedCopies;
        if (!typed) return e;
        // In a time window, only a typed-in copy's time places the workout,
        // so the first such copy inside it counts, capped as entered
        const window = rules.timeWindow;
        if (window)
          return typed.find((c) => inTimeWindow(c.time, window)) ?? typed[0]!;
        const { typedTimedCopies: _typed, ...measured } = e;
        return measured;
      })
    : [...eligible];
  list = list.filter((e) => {
    const effective = challengeFilterSport(e);
    if (a.includeSports && !a.includeSports.includes(effective)) return false;
    if (a.excludeSports.includes(effective)) return false;
    if (num(e.durationMin) < a.minMinutes) return false;
    if (rules.timeWindow && !inTimeWindow(e.time, rules.timeWindow))
      return false;
    return !(a.manualEntries === 'ignore' && isManualEntry(e));
  });
  if (a.manualEntries !== 'cap') return list;
  const usedByDay = new Map<string, number>();
  const capped: ChallengeEntry[] = [];
  for (const e of [...list].sort(
    (x, y) => x.date.localeCompare(y.date) || x.id.localeCompare(y.id)
  )) {
    if (!isManualEntry(e)) {
      capped.push(e);
      continue;
    }
    const used = usedByDay.get(e.date) ?? 0;
    const left = Math.max(0, a.manualMinutesCap - used);
    const full = num(e.durationMin);
    const minutes = Math.min(full, left);
    usedByDay.set(e.date, used + minutes);
    if (minutes <= 0) continue;
    if (minutes >= full) {
      capped.push(e);
      continue;
    }
    // Distance, calories, elevation and zone time are cut by the same
    // fraction as the minutes, so a typed-in 100 km counts no more than its
    // capped minutes.
    const share = minutes / full;
    const cut = (v: number | null | undefined) =>
      typeof v === 'number' && Number.isFinite(v) ? v * share : v;
    capped.push({
      ...e,
      durationMin: minutes,
      distanceM: cut(e.distanceM),
      measuredDistanceM: e.distanceM,
      activeCalories: cut(e.activeCalories),
      elevationM: cut(e.elevationM),
      // Zone time too, or the rate and zone minutes would count the full workout
      zoneSeconds: e.zoneSeconds?.map((z) => cut(z) ?? 0) ?? e.zoneSeconds,
    });
  }
  return capped;
}

export interface ChallengeDayScore {
  date: string;
  /** False on a weekday the challenge does not count. */
  eligible: boolean;
  /** Set by challengePeriodTotal: false when the best-days rule dropped the day. */
  counted: boolean;
  /** The day's value in the metric's unit, after the daily cap. */
  total: number;
  rawTotal: number;
  effort: number;
  rawEffort: number;
  /** Workout minutes of the day (counted workouts only). */
  minutes: number;
  unpaidMinutes: number;
  steps: number;
  stepPoints: number;
  streakDays: number;
  streakBonus: number;
  average: number;
  averageActiveDays: number;
  beatAverageBonus: number;
  prs: ChallengePr[];
  prBonus: number;
  workouts: number;
  /** Per-workout breakdown, for the points metric. */
  entries: Array<{
    id: string;
    perMin: number;
    basis: ChallengeRateBasis;
    zone: number | null;
    strength: boolean;
    strengthFloored: boolean;
    points: number;
    rawPoints: number;
    fullMinutes: number;
    halfMinutes: number;
    unpaidMinutes: number;
  }>;
}

/**
 * The daily "Active Calories" totals an active-calories challenge scores
 * against, by day (two devices' rows add up, as in the Diary). A whole-day
 * total can't be split by sport, length or hour, so there are none when the
 * rules leave some workouts out; a typed-in one counts only when manual
 * entries count in full, and a Diary override of a synced one likewise
 * (challengeTypedCalories).
 */
export function challengeDailyCalories(
  rows: readonly ChallengeEntry[] | undefined,
  rules: ChallengeRules
): Map<string, number> {
  const byDay = new Map<string, number>();
  const a = rules.activities;
  if (
    rules.metric !== 'active_calories' ||
    a.includeSports ||
    a.excludeSports.length > 0 ||
    a.minMinutes > 0 ||
    rules.timeWindow
  )
    return byDay;
  for (const e of challengeTypedCalories(rows ?? [], rules)) {
    if (a.manualEntries !== 'count' && isManualEntry(e)) continue;
    const kcal = num(e.activeCalories);
    if (kcal > 0) byDay.set(e.date, (byDay.get(e.date) ?? 0) + kcal);
  }
  return byDay;
}

function metricValue(
  rules: ChallengeRules,
  day: string,
  entries: readonly ChallengeEntry[],
  data: ChallengeMemberData
): number {
  switch (rules.metric) {
    case 'steps':
      return Math.max(0, num(data.steps[day]));
    case 'active_minutes':
      return entries.reduce((s, e) => s + Math.max(0, num(e.durationMin)), 0);
    case 'hr_zone_minutes':
      return entries.reduce((s, e) => {
        const z = e.zoneSeconds ?? [];
        let secs = 0;
        for (let i = rules.zoneMinutesFromZone - 1; i < z.length; i++)
          secs += Math.max(0, num(z[i]));
        // The average heart rate stands in only when there is no breakdown.
        const hasBreakdown = z.some((x) => num(x) > 0);
        if (
          !hasBreakdown &&
          num(e.avgHr) > 0 &&
          heartRateZoneFor(num(e.avgHr), data.zones.floors) >=
            rules.zoneMinutesFromZone
        ) {
          return s + Math.max(0, num(e.durationMin));
        }
        return s + secs / 60;
      }, 0);
    case 'distance':
      return entries.reduce((s, e) => s + Math.max(0, num(e.distanceM)), 0);
    case 'workout_days':
      return entries.length > 0 ? 1 : 0;
    case 'active_calories': {
      const workouts = entries.reduce(
        (s, e) => s + Math.max(0, num(e.activeCalories)),
        0
      );
      // The daily total already holds the workouts the device recorded, so
      // the day scores like the Diary: the larger of it and the workouts.
      const daily = challengeDailyCalories(data.dailyCalories, rules);
      return resolveExerciseCalories(workouts, daily.get(day) ?? 0, 0).calories;
    }
    case 'elevation':
      return entries.reduce((s, e) => s + Math.max(0, num(e.elevationM)), 0);
    default:
      return 0;
  }
}

const isActive = (
  byDate: ReadonlyMap<string, readonly ChallengeEntry[]>,
  d: string
): boolean => (byDate.get(d)?.length ?? 0) > 0;

/**
 * Scores one member for each day from `from` to `to` (inclusive). Workouts
 * before `from` are used for streaks, the own average and PRs, so pass at
 * least the PR lookback of earlier history for exact results.
 */
export function scoreChallengeDays(
  data: ChallengeMemberData,
  from: string,
  to: string,
  rules: ChallengeRules
): ChallengeDayScore[] {
  const counted = challengeCountedEntries(data.entries, rules);
  const byDate = groupByDate(counted);
  // The points builder applies only to the points metric; others ignore it.
  const pts = rules.metric === 'points' ? rules.points : null;
  const effortCache = new Map<string, ChallengeDayEffort>();
  const effortOf = (d: string): ChallengeDayEffort => {
    let ef = effortCache.get(d);
    if (!ef) {
      ef = pts
        ? challengeDayEffort(byDate.get(d), data.zones, pts)
        : {
            effort: 0,
            rawEffort: 0,
            minutes: 0,
            unpaidMinutes: 0,
            detail: [],
            active: isActive(byDate, d),
          };
      effortCache.set(d, ef);
    }
    return ef;
  };

  const days: ChallengeDayScore[] = [];
  for (const day of daysInRange(from, to)) {
    const dayEntries = byDate.get(day) ?? [];
    const eligible = rules.days.includes(isoWeekday(day));
    const ef = effortOf(day);
    const steps = Math.max(0, num(data.steps[day]));
    let streak = 0;
    let streakBonus = 0;
    let average = 0;
    let activeDays = 0;
    let beatAverageBonus = 0;
    let prs: ChallengePr[] = [];
    let prBonus = 0;
    let stepPts = 0;
    let rawTotal: number;
    if (pts) {
      if (ef.active) {
        for (let d = day; isActive(byDate, d); d = addDays(d, -1)) streak += 1;
      }
      streakBonus =
        pts.streak && streak >= pts.streak.fromDay ? pts.streak.bonus : 0;
      if (pts.beatAverage) {
        let sum = 0;
        for (let i = 1; i <= pts.beatAverage.lookbackDays; i++) {
          const prev = effortOf(addDays(day, -i));
          sum += prev.effort;
          if (prev.active) activeDays += 1;
        }
        average = sum / pts.beatAverage.lookbackDays;
        const eligibleForBonus = activeDays >= pts.beatAverage.minActiveDays;
        beatAverageBonus =
          eligibleForBonus && ef.effort > 0 && ef.effort > average
            ? pts.beatAverage.bonus
            : 0;
      }
      prs = challengePrsForDay(day, byDate, pts);
      prBonus = pts.pr
        ? Math.min(prs.length, pts.pr.dailyMax) * pts.pr.bonus
        : 0;
      stepPts = challengeStepPoints(steps, pts);
      rawTotal = ef.effort + stepPts + streakBonus + beatAverageBonus + prBonus;
    } else {
      rawTotal = metricValue(rules, day, dayEntries, data);
    }
    if (!eligible) rawTotal = 0;
    if (rules.dailyCap !== null) rawTotal = Math.min(rawTotal, rules.dailyCap);
    days.push({
      date: day,
      eligible,
      counted: eligible,
      total: round1(rawTotal),
      rawTotal,
      effort: round1(ef.effort),
      rawEffort: round1(ef.rawEffort),
      minutes: round1(
        dayEntries.reduce((s, e) => s + Math.max(0, num(e.durationMin)), 0)
      ),
      unpaidMinutes: round1(ef.unpaidMinutes),
      steps,
      stepPoints: stepPts,
      streakDays: streak,
      streakBonus,
      average: round1(average),
      averageActiveDays: activeDays,
      beatAverageBonus,
      prs,
      prBonus,
      workouts: dayEntries.length,
      entries: ef.detail.map((x) => ({
        id: x.id,
        perMin: x.perMin,
        basis: x.basis,
        zone: x.zone,
        strength: x.strength,
        strengthFloored: x.strengthFloored,
        points: round1(x.points),
        rawPoints: round1(x.rawPoints),
        fullMinutes: round1(x.fullMinutes),
        halfMinutes: round1(x.halfMinutes),
        unpaidMinutes: round1(x.unpaidMinutes),
      })),
    });
  }
  return days;
}

interface GoalSpec {
  metric: 'minutes' | 'strength_minutes' | 'distance_km' | 'active_days';
  floor: number;
  ceil: number;
  step: number;
}

/** The weekly measure of each goal type, kept within a floor and a ceiling. */
export const CHALLENGE_GOALS: Readonly<Record<ChallengeGoalType, GoalSpec>> = {
  lose_weight: { metric: 'minutes', floor: 120, ceil: 420, step: 5 },
  build_muscle: { metric: 'strength_minutes', floor: 90, ceil: 360, step: 5 },
  endurance: { metric: 'distance_km', floor: 8, ceil: 60, step: 0.5 },
  stay_active: { metric: 'active_days', floor: 3, ceil: 6, step: 1 },
};

export function challengeGoalType(goal: unknown): ChallengeGoalType {
  return typeof goal === 'string' &&
    Object.prototype.hasOwnProperty.call(CHALLENGE_GOALS, goal)
    ? (goal as ChallengeGoalType)
    : DEFAULT_CHALLENGE_GOAL_TYPE;
}

/** A goal's measure over workouts dated [from, to]. */
export function challengeGoalMeasure(
  metric: GoalSpec['metric'],
  entries: readonly ChallengeEntry[],
  from: string,
  to: string
): number {
  const inRange = entries.filter((e) => e && e.date >= from && e.date <= to);
  if (metric === 'active_days') return new Set(inRange.map((e) => e.date)).size;
  if (metric === 'distance_km')
    return inRange.reduce(
      (s, e) => s + Math.max(0, num(e.distanceM)) / 1000,
      0
    );
  if (metric === 'strength_minutes')
    return inRange
      .filter(isStrengthEntry)
      .reduce((s, e) => s + num(e.durationMin), 0);
  return inRange.reduce((s, e) => s + num(e.durationMin), 0);
}

export interface ChallengeWeekGoal {
  weekStart: string;
  goal: ChallengeGoalType;
  baseline: number;
  target: number;
  done: number;
  pct: number;
  bonus: number;
  rawBonus: number;
}

/**
 * The part of a week a period holds: its first and last day, and the
 * weekdays the challenge counts. A week cut by the period's start or end
 * (a challenge starting on a Thursday, a month ending on a Wednesday) is
 * paid on that part, with the target cut to its share of counted days.
 */
export interface ChallengeWeekPart extends ChallengeWindow {
  days: readonly number[];
}

/**
 * The member's goal for the week starting `monday`: the target comes from
 * their own previous weeks (average x stretch, within the goal's floor and
 * ceiling), progress counts up to `upTo`, and the bonus is pro rata. With
 * `part`, only the days of the week inside the period count, and the target
 * is cut to their share of the week's counted days.
 */
export function challengeWeekGoal(
  entries: readonly ChallengeEntry[],
  goal: unknown,
  monday: string,
  upTo: string,
  rules: ChallengePointsRules,
  part?: ChallengeWeekPart
): ChallengeWeekGoal | null {
  if (!rules.goal) return null;
  const key = challengeGoalType(goal);
  const g = CHALLENGE_GOALS[key];
  let sum = 0;
  for (let w = 1; w <= rules.goal.lookbackWeeks; w++) {
    const s = addDays(monday, -7 * w);
    sum += challengeGoalMeasure(g.metric, entries, s, addDays(s, 6));
  }
  const baseline = sum / rules.goal.lookbackWeeks;
  const stretch = 1 + rules.goal.stretchPct / 100;
  const weekTarget = Math.min(
    g.ceil,
    Math.max(g.floor, roundTo(baseline * stretch, g.step))
  );
  const sunday = addDays(monday, 6);
  const from = part && part.start > monday ? part.start : monday;
  const end = part && part.end < sunday ? part.end : sunday;
  let share = 1;
  if (part && (from > monday || end < sunday)) {
    const counted = (a: string, b: string) =>
      daysInRange(a, b).filter((d) => part.days.includes(isoWeekday(d))).length;
    const all = counted(monday, sunday);
    share = all > 0 ? counted(from, end) / all : 0;
  }
  const target = round1(weekTarget * share);
  const last = upTo < end ? upTo : end;
  const done =
    last < from ? 0 : challengeGoalMeasure(g.metric, entries, from, last);
  const frac = target > 0 ? Math.min(1, done / target) : 0;
  // A part of a week pays its share of the bonus too, so a month's slices
  // add up to what its days are worth, never a full bonus for one day.
  const rawBonus = rules.goal.maxBonus * share * frac;
  return {
    weekStart: monday,
    goal: key,
    baseline: round1(baseline),
    target: round1(target),
    done: round1(done),
    pct: Math.round(frac * 100),
    bonus: round1(rawBonus),
    rawBonus,
  };
}

export interface ChallengePeriodTotal {
  total: number;
  rawTotal: number;
  minutes: number;
  effort: number;
  stepPoints: number;
  bonus: number;
  prBonus: number;
  goalBonus: number;
  droppedPoints: number;
  workouts: number;
  /** For hit_goal per day: eligible days so far and days that reached the target. */
  daysEligible: number;
  daysHit: number;
  /** The first day the running total reached the target (race and hit_goal). */
  reachedOn: string | null;
}

/**
 * A week's goal bonus as it stood on `asOf` (the bonus is pro rata, so it
 * grows through the week). Without `weekStart` and `asOf` it is simply added
 * to the total and counts toward a finish only on the last day.
 */
export interface ChallengeGoalBonusInput {
  rawBonus: number;
  weekStart?: string;
  asOf?: string;
}

/** The goal bonus earned by the end of `day` (undated bonuses only when `final`). */
function goalBonusBy(
  goals: readonly (ChallengeGoalBonusInput | null)[],
  day: string | null,
  final: boolean
): number {
  const latest = new Map<string, ChallengeGoalBonusInput>();
  let undated = 0;
  for (const g of goals) {
    if (!g) continue;
    if (!g.weekStart || !g.asOf) {
      if (final) undated += g.rawBonus;
      continue;
    }
    if (day !== null && g.asOf > day) continue;
    const prev = latest.get(g.weekStart);
    if (!prev || prev.asOf! < g.asOf) latest.set(g.weekStart, g);
  }
  let sum = undated;
  for (const g of latest.values()) sum += g.rawBonus;
  return sum;
}

/**
 * Adds a member's days up to a period total. In each Monday-to-Sunday week only
 * the best `bestDaysPerWeek` day totals count (sets day.counted). Goal bonuses
 * are added on top. The finish day (`reachedOn`) is the first day whose own
 * running total reached the target, with the best-days rule applied to the
 * days up to it and the goal bonus earned by then, so a better day later in
 * the week never moves an earlier finish.
 */
export function challengePeriodTotal(
  days: ChallengeDayScore[],
  rules: ChallengeRules,
  upTo?: string,
  goals: readonly (ChallengeGoalBonusInput | null)[] = []
): ChallengePeriodTotal {
  const inRange = days.filter((d) => !upTo || d.date <= upTo);
  for (const d of days) d.counted = false;
  const groups = new Map<string, ChallengeDayScore[]>();
  for (const d of inRange) {
    if (!d.eligible) continue;
    const k = weekStartOf(d.date, 1);
    const list = groups.get(k);
    if (list) list.push(d);
    else groups.set(k, [d]);
  }
  const best = rules.bestDaysPerWeek ?? 7;
  for (const list of groups.values()) {
    [...list]
      .sort((a, b) => b.rawTotal - a.rawTotal || a.date.localeCompare(b.date))
      .slice(0, best)
      .forEach((d) => {
        d.counted = true;
      });
  }
  let total = 0;
  let dropped = 0;
  let minutes = 0;
  let effort = 0;
  let stepPts = 0;
  let bonus = 0;
  let prBonus = 0;
  let workouts = 0;
  let daysEligible = 0;
  let daysHit = 0;
  const chronological = [...inRange].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  for (const d of chronological) {
    minutes += d.minutes;
    workouts += d.workouts;
    if (d.eligible) {
      daysEligible += 1;
      if (rules.target !== null && d.rawTotal >= rules.target) daysHit += 1;
    }
    if (!d.counted) {
      dropped += d.rawTotal;
      continue;
    }
    total += d.rawTotal;
    effort += d.effort;
    stepPts += d.stepPoints;
    bonus += d.streakBonus + d.beatAverageBonus + d.prBonus;
    prBonus += d.prBonus;
  }
  // Only goal progress up to `upTo`, like the days
  const goalBonus = goalBonusBy(goals, upTo ?? null, true);
  total += goalBonus;
  let reachedOn: string | null = null;
  if (rules.target !== null && total >= rules.target) {
    const target = rules.target;
    const dates = [...new Set(chronological.map((d) => d.date))];
    for (const day of dates) {
      // The total as it stood at the end of `day`
      const weeks = new Map<string, number[]>();
      for (const d of chronological) {
        if (d.date > day) break;
        if (!d.eligible) continue;
        const k = weekStartOf(d.date, 1);
        const list = weeks.get(k);
        if (list) list.push(d.rawTotal);
        else weeks.set(k, [d.rawTotal]);
      }
      let sum = goalBonusBy(goals, day, day === dates[dates.length - 1]);
      for (const list of weeks.values())
        sum += list
          .sort((a, b) => b - a)
          .slice(0, best)
          .reduce((x, y) => x + y, 0);
      if (sum >= target) {
        reachedOn = day;
        break;
      }
    }
  }
  return {
    total: round1(total),
    rawTotal: total,
    minutes: round1(minutes),
    effort: round1(effort),
    stepPoints: stepPts,
    bonus: round1(bonus),
    prBonus,
    goalBonus: round1(goalBonus),
    droppedPoints: round1(dropped),
    workouts,
    daysEligible,
    daysHit,
    reachedOn,
  };
}

export interface ChallengeStandingInput {
  userId: string;
  name: string;
  total: number;
  minutes: number;
  reachedOn?: string | null;
  daysEligible?: number;
  daysHit?: number;
  goalBonus?: number;
}

export interface ChallengeStandingRow extends ChallengeStandingInput {
  rank: number;
  winner: boolean;
}

export interface ChallengeStandings {
  rows: ChallengeStandingRow[];
  /** Group goal: everyone's total together, and whether it reached the target. */
  groupTotal: number;
  groupReached: boolean;
}

/**
 * Ranks members: total, then workout minutes, then name; ties share a rank.
 * A race ranks finishers first by the day they finished, and finishers of the
 * same day share the rank (so a later workout cannot change who won). Winners
 * follow the format: the top rank, everyone who finished first, everyone who
 * hit the goal, or everyone once the group reached its target.
 */
export function rankChallengeStandings(
  input: readonly ChallengeStandingInput[],
  rules: Pick<ChallengeRules, 'format' | 'target' | 'targetPer'>
): ChallengeStandings {
  const race = rules.format === 'race';
  const finished = (r: ChallengeStandingInput): string =>
    race && r.reachedOn ? r.reachedOn : '9999-12-31';
  const sorted = [...input].sort(
    (a, b) =>
      finished(a).localeCompare(finished(b)) ||
      b.total - a.total ||
      b.minutes - a.minutes ||
      a.name.localeCompare(b.name)
  );
  const rows: ChallengeStandingRow[] = [];
  let prev: ChallengeStandingRow | null = null;
  sorted.forEach((r, i) => {
    const same =
      prev !== null &&
      finished(prev) === finished(r) &&
      ((race && !!r.reachedOn) ||
        (prev.total === r.total && prev.minutes === r.minutes));
    const row: ChallengeStandingRow = {
      ...r,
      rank: same && prev ? prev.rank : i + 1,
      winner: false,
    };
    rows.push(row);
    prev = row;
  });
  const groupTotal = round1(input.reduce((s, r) => s + r.total, 0));
  const target = rules.target;
  const groupReached =
    rules.format === 'group_goal' && target !== null && groupTotal >= target;
  for (const row of rows) {
    switch (rules.format) {
      case 'race':
        row.winner = row.rank === 1 && !!row.reachedOn;
        break;
      case 'hit_goal':
        row.winner =
          target !== null &&
          (rules.targetPer === 'day'
            ? (row.daysEligible ?? 0) > 0 && row.daysHit === row.daysEligible
            : row.total >= target);
        break;
      case 'group_goal':
        row.winner = groupReached;
        break;
      default:
        row.winner = row.rank === 1 && row.total > 0;
    }
  }
  return { rows, groupTotal, groupReached };
}
