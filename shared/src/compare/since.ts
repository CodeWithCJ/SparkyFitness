// Since I started a habit, has an outcome changed? The outcome's days before the start against
// its days since, on its own scale: no own-normal adjustment, since a lasting change is the
// point. Pure and dependency-free.

import {
  addDays,
  compareDays,
  daysBetween,
  daysInRange,
} from '../utils/timezone.ts';
import { weekStartOf } from '../utils/trainingConsistency.ts';
import { valueAt, type DaySeries } from './analyze.ts';
import { COMPARE_METRICS, type CompareMetricKey } from './metrics.ts';
import {
  biasCorrectedEffectiveNForMean,
  isSignificant,
  mean,
  olsSlope,
  percentile,
  tCritical95,
  welch,
} from './stats.ts';

/** One side of the comparison. The summary fields are there only when the result is ok. */
export interface CompareSinceStretch {
  from: string;
  to: string;
  days: number; // calendar days from..to, inclusive
  valueDays: number; // days with an outcome value
  mean?: number;
  p10?: number; // the typical range is p10..p90
  p90?: number;
  shareAtOrAbove?: number; // of the days with a value, the share at or above the line
}

export interface CompareSinceResult {
  status: 'ok' | 'not_enough';
  /** Only when not_enough. `noStart`: none given and none suggested, so the person picks a date. */
  reason?: 'fewBefore' | 'fewSince' | 'noStart';
  start: string | null; // the start used; null only with noStart
  suggestedStart: string | null;
  before?: CompareSinceStretch; // absent only with noStart
  since?: CompareSinceStretch;
  line: number; // in the outcome's raw scale
  diff?: number; // since − before
  low?: number;
  high?: number;
  p?: number;
  changed?: boolean; // p < 0.05 and the 95% range leaves out 0
  regularity?: { weeksKept: number; weeks: number }; // event and yes/no habits only
  alreadyChanging?: boolean; // the before stretch's trend is significant and runs the same way as diff
}

// A habit counts as started at the first of 3 weeks in a row with at least 4 active days each;
// the same 4 days make a week kept since then.
const RUN_WEEKS = 3;
const ACTIVE_DAYS_PER_WEEK = 4;
const DAYS_PER_WEEK = 7;
// The since stretch is at most the most recent year; each stretch needs 4 weeks and 14 values.
export const SINCE_STRETCH_MAX_DAYS = 365;
export const SINCE_STRETCH_MIN_DAYS = 28;
export const SINCE_STRETCH_MIN_VALUES = 14;
/** The oldest a start may be, in days before today; a suggested start is never older. */
export const SINCE_START_MAX_DAYS_AGO = 730;
// The effective n counts carry-over up to two weeks back, as day mode does.
const MAX_LAG = 14;
const TYPICAL_LOW = 0.1;
const TYPICAL_HIGH = 0.9;
// The default line: a natural one where the scale has it, else the before stretch's 75th percentile.
const FIXED_LINES: Partial<Record<CompareMetricKey, number>> = {
  mood: 70,
  energy: 4,
  focus: 4,
};
const DEFAULT_LINE_PERCENTILE = 0.75;

/** A stretch with the outcome's values in it, in day order. */
interface Stretch {
  from: string;
  to: string;
  days: number;
  daysWithValue: string[];
  values: number[];
}

/**
 * When the habit started: the first active day (value > 0, or yes) of the first week of the
 * earliest run of 3 weeks in a row with at least 4 active days each, weeks starting on
 * `firstDayOfWeek`. Runs are looked for from the week holding `earliest` on. The earliest one is a
 * start only when the week before it was not kept (fewer than 4 active days, or no records at
 * all) and its first active day is not before `earliest`. Otherwise the habit began before
 * `earliest`, so there is no suggestion, and no later run stands in for its start.
 *
 * The caller passes the habit through yesterday: today is never data, and a part-logged today
 * must not complete a week. The habit must also reach back over the whole week before the week
 * holding `earliest` (13 days before `earliest` covers it), or a habit already kept there reads
 * as one with no records before the run. Null as well when there is no such run, or the metric
 * is not an event or yes/no one, or is a rolling one (see `hasActiveDays`).
 */
export function suggestedHabitStart(
  habit: DaySeries,
  key: CompareMetricKey,
  firstDayOfWeek: number,
  earliest: string
): string | null {
  if (!hasActiveDays(key)) return null;
  // Weeks in order, each with its active day count and its first active day.
  const weeks = new Map<string, { active: number; first: string }>();
  for (const day of Object.keys(habit).sort(compareDays)) {
    if (!isActive(habit, day)) continue;
    const week = weekStartOf(day, firstDayOfWeek);
    const entry = weeks.get(week);
    if (entry) entry.active++;
    else weeks.set(week, { active: 1, first: day });
  }
  const kept = (week: string) =>
    (weeks.get(week)?.active ?? 0) >= ACTIVE_DAYS_PER_WEEK;
  const firstWeek = weekStartOf(earliest, firstDayOfWeek);
  for (const [week, { first }] of weeks) {
    if (compareDays(week, firstWeek) < 0) continue;
    const run = Array.from({ length: RUN_WEEKS }, (_, i) =>
      addDays(week, i * DAYS_PER_WEEK)
    );
    if (!run.every(kept)) continue;
    const startsHere =
      !kept(addDays(week, -DAYS_PER_WEEK)) && compareDays(first, earliest) >= 0;
    return startsHere ? first : null;
  }
  return null;
}

/**
 * The outcome since `start` (or the suggested start) against before it. Since runs from the
 * start to yesterday, at most the last 365 days; before is as many days immediately before the
 * start, or from the outcome's first value if that is later. Each needs 28 days and 14 values;
 * when both fall short the answer is `fewSince`, as the before stretch is only as long as the
 * since one. Welch's test gives each stretch its own effective n. Today is never data.
 *
 * The suggestion is held to the last 730 days (`SINCE_START_MAX_DAYS_AGO`), so the habit should
 * reach back two weeks further than that for `suggestedHabitStart` to see whether it was already
 * kept there.
 */
export function analyzeSince(input: {
  habit: { key: CompareMetricKey; values: DaySeries };
  outcome: { key: CompareMetricKey; values: DaySeries };
  start: string | null; // null → use the suggestion
  line: number | null; // null → default line
  today: string; // the since stretch ends the day before
  firstDayOfWeek: number;
}): CompareSinceResult {
  const habit = beforeDay(input.habit.values, input.today);
  const suggestedStart = suggestedHabitStart(
    habit,
    input.habit.key,
    input.firstDayOfWeek,
    addDays(input.today, -SINCE_START_MAX_DAYS_AGO)
  );
  const start = input.start ?? suggestedStart;
  if (start === null) {
    return {
      status: 'not_enough',
      reason: 'noStart',
      start: null,
      suggestedStart: null,
      line: input.line ?? defaultLine(input.outcome.key, [], []),
    };
  }

  const outcome = input.outcome.values;
  const yesterday = addDays(input.today, -1);
  const since = stretch(
    outcome,
    laterOf(start, addDays(yesterday, 1 - SINCE_STRETCH_MAX_DAYS)),
    yesterday
  );
  const earliest = addDays(start, -since.days);
  const first = firstDayWithValue(outcome);
  const before = stretch(
    outcome,
    first === undefined ? earliest : laterOf(earliest, first),
    addDays(start, -1)
  );
  const line =
    input.line ?? defaultLine(input.outcome.key, before.values, since.values);

  const reason = !isLongEnough(since)
    ? 'fewSince'
    : !isLongEnough(before)
      ? 'fewBefore'
      : null;
  if (reason !== null) {
    return {
      status: 'not_enough',
      reason,
      start,
      suggestedStart,
      before: counts(before),
      since: counts(since),
      line,
    };
  }

  const test = welch(
    since.values,
    before.values,
    biasCorrectedEffectiveNForMean(since.values, MAX_LAG),
    biasCorrectedEffectiveNForMean(before.values, MAX_LAG)
  );
  const result: CompareSinceResult = {
    status: 'ok',
    start,
    suggestedStart,
    before: summary(before, line),
    since: summary(since, line),
    line,
    diff: test.diff,
    low: test.low,
    high: test.high,
    p: test.p,
    changed: isSignificant(test),
    alreadyChanging: alreadyChanging(before, test.diff),
  };
  if (hasActiveDays(input.habit.key)) {
    result.regularity = regularity(habit, since, input.firstDayOfWeek);
  }
  return result;
}

/**
 * Only an event or yes/no habit has days it was done, so only it gets a suggested start and
 * regularity. A rolling one does not: its value on a day covers the 7 days ending there, so one
 * session a week reads as active every day.
 */
export function hasActiveDays(key: CompareMetricKey): boolean {
  const def = COMPARE_METRICS[key];
  return !def.rolling && (def.missing === 'event' || def.kind === 'binary');
}

function isActive(habit: DaySeries, day: string): boolean {
  return (valueAt(habit, day) ?? 0) > 0;
}

/** The days from..to (none when to is earlier) with the outcome's values on them. */
function stretch(outcome: DaySeries, from: string, to: string): Stretch {
  const daysWithValue: string[] = [];
  const values: number[] = [];
  for (const day of daysInRange(from, to)) {
    const value = valueAt(outcome, day);
    if (value === undefined) continue;
    daysWithValue.push(day);
    values.push(value);
  }
  return {
    from,
    to,
    days: Math.max(0, daysBetween(from, to) + 1),
    daysWithValue,
    values,
  };
}

function isLongEnough(s: Stretch): boolean {
  return (
    s.days >= SINCE_STRETCH_MIN_DAYS &&
    s.values.length >= SINCE_STRETCH_MIN_VALUES
  );
}

function counts(s: Stretch): CompareSinceStretch {
  return { from: s.from, to: s.to, days: s.days, valueDays: s.values.length };
}

/** The counts plus the mean, the typical range and the share at or above the line. */
function summary(s: Stretch, line: number): CompareSinceStretch {
  return {
    ...counts(s),
    mean: mean(s.values),
    p10: percentile(s.values, TYPICAL_LOW) ?? undefined,
    p90: percentile(s.values, TYPICAL_HIGH) ?? undefined,
    shareAtOrAbove: s.values.filter((v) => v >= line).length / s.values.length,
  };
}

/** The fixed line where there is one; else the before stretch's 75th percentile, the since stretch's when before has no values, else 0. */
function defaultLine(
  key: CompareMetricKey,
  before: readonly number[],
  since: readonly number[]
): number {
  return (
    FIXED_LINES[key] ??
    percentile(before, DEFAULT_LINE_PERCENTILE) ??
    percentile(since, DEFAULT_LINE_PERCENTILE) ??
    0
  );
}

/**
 * Whether the outcome was already moving the same way before the start: the OLS slope of the
 * before stretch's values on their day index, with its SE scaled by √(n / effective n of the
 * residuals) so carried-over days do not look like new ones, and a 95% range that leaves out 0
 * on the same side as diff.
 */
function alreadyChanging(before: Stretch, diff: number): boolean {
  const xs = before.daysWithValue.map((day) => daysBetween(before.from, day));
  const fit = olsSlope(xs, before.values);
  if (fit === null) return false;
  const intercept = mean(before.values) - fit.slope * mean(xs);
  const residuals = before.values.map(
    (y, i) => y - intercept - fit.slope * (xs[i] ?? 0)
  );
  const nEff = biasCorrectedEffectiveNForMean(residuals, MAX_LAG);
  const margin =
    tCritical95(Math.max(1, nEff - 2)) * fit.se * Math.sqrt(fit.n / nEff);
  const leavesOutZero = fit.slope - margin > 0 || fit.slope + margin < 0;
  return leavesOutZero && Math.sign(fit.slope) === Math.sign(diff);
}

/** The weeks wholly inside the since stretch, and how many had at least 4 active days. */
function regularity(
  habit: DaySeries,
  since: Stretch,
  firstDayOfWeek: number
): { weeksKept: number; weeks: number } {
  let week = weekStartOf(since.from, firstDayOfWeek);
  if (compareDays(week, since.from) < 0) week = addDays(week, DAYS_PER_WEEK);
  let weeks = 0;
  let weeksKept = 0;
  while (compareDays(addDays(week, DAYS_PER_WEEK - 1), since.to) <= 0) {
    const days = daysInRange(week, addDays(week, DAYS_PER_WEEK - 1));
    const active = days.filter((day) => isActive(habit, day)).length;
    weeks++;
    if (active >= ACTIVE_DAYS_PER_WEEK) weeksKept++;
    week = addDays(week, DAYS_PER_WEEK);
  }
  return { weeksKept, weeks };
}

/** The series without `day` and anything after it. */
function beforeDay(series: DaySeries, day: string): DaySeries {
  const out: DaySeries = {};
  for (const [key, value] of Object.entries(series)) {
    if (compareDays(key, day) < 0) out[key] = value;
  }
  return out;
}

function firstDayWithValue(series: DaySeries): string | undefined {
  let first: string | undefined;
  for (const day of Object.keys(series)) {
    if (valueAt(series, day) === undefined) continue;
    if (first === undefined || compareDays(day, first) < 0) first = day;
  }
  return first;
}

function laterOf(a: string, b: string): string {
  return compareDays(a, b) >= 0 ? a : b;
}
