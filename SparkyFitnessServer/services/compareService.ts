import compareRepository from '../models/compareRepository.js';
import reportRepository from '../models/reportRepository.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { loadFirstDayOfWeek } from '../utils/firstDayOfWeek.js';
import heartRateZoneService from './heartRateZoneService.js';
import {
  addDays,
  analyzeDays,
  BEDTIME_ORIGIN_MINUTES,
  analyzeSince,
  analyzeWeeks,
  CompareModeError,
  compareDays,
  computeDailyWeightTrend,
  daySides,
  daysInRange,
  FALLBACK_MAX_HR,
  percentMaxFloors,
  instantHourMinute,
  instantHourMinuteInZone,
  resolveRecordZone,
  sampleSd,
  sessionLoad,
  SINCE_START_MAX_DAYS_AGO,
  SINCE_STRETCH_MAX_DAYS,
  suggestedHabitStart,
  todayInZone,
  weekSides,
  weekStartOf,
  type CompareMetricKey,
  type CompareQuery,
  type CompareResponse,
  type CompareResult,
  type CompareSinceQuery,
  type CompareSinceResponse,
  type CompareSides,
  type CompareTiming,
  type DaySeries,
  type FoodVariantNutrientField,
} from '@workspace/shared';

// Compare: each metric's daily values from the user's own data, handed to the shared
// analysis. Owner-only (the route enforces it); every read goes through a user-scoped
// repository.

interface MetricContext {
  tz: string;
  /** Lower bpm of each heart rate zone, for weighting a session's load. */
  zoneFloors: readonly number[];
}

/** History before the start in day mode: 14 days for the own normal, 7 for a rolling metric, 1 for timing. */
const DAY_HISTORY_DAYS = 22;
/**
 * History before the first week in week mode: 6 weeks for the own normal, 1 for timing, and
 * 6 days so a rolling metric has a value on every day of the first of those weeks.
 */
const WEEK_HISTORY_DAYS = 49 + 6;
/** After the last week: B one week later, to the end of that week. */
const WEEK_AFTER_DAYS = 13;
/** Bedtime consistency and the session count look at the 7 days ending on the day. */
const ROLLING_DAYS = 7;
const MIN_CONSISTENCY_NIGHTS = 4;
/** Weigh-ins this long before the range, so the trend is interpolated and smoothed across its start. */
const WEIGHT_WARM_UP_DAYS = 30;
/** Since mode's window: back to the oldest start allowed, plus 6 days of lead-in for a rolling metric. */
const SINCE_WINDOW_DAYS = SINCE_START_MAX_DAYS_AGO + ROLLING_DAYS - 1;
/**
 * The habit reads two weeks past the oldest start allowed, so the whole week before that
 * start's week is there to show whether the habit was already kept at the limit.
 */
const SINCE_HABIT_DAYS = SINCE_START_MAX_DAYS_AGO + 14;
/** Before a start: a year of before stretch plus 6 days of lead-in for a rolling metric. */
const SINCE_BEFORE_DAYS = SINCE_STRETCH_MAX_DAYS + ROLLING_DAYS - 1;
const SECONDS_PER_HOUR = 3600;
const MINUTES_PER_DAY = 24 * 60;

type FoodMetric =
  'calories' | 'protein' | 'carbs' | 'fat' | 'caffeine' | 'alcohol';

const FOOD_COLUMNS = {
  calories: 'calories',
  protein: 'protein',
  carbs: 'carbs',
  fat: 'fat',
  caffeine: 'caffeine_mg',
  alcohol: 'alcohol_g',
} as const satisfies Record<FoodMetric, FoodVariantNutrientField>;

/** One day of reportRepository.getDailyNutritionTotalsRange; pg hands DATE back as its YYYY-MM-DD text. */
type NutritionTotalsRow = { entry_date: string } & Partial<
  Record<FoodVariantNutrientField, number | string | null>
>;

/**
 * Does A go with B? Loads both metrics over the range plus the history the analysis needs,
 * never counting today (or this week): steps, food and minutes all build up through the
 * day, so an unfinished one would read as a dip.
 */
export async function getCompare(
  userId: string,
  query: CompareQuery
): Promise<CompareResponse> {
  const tz = await loadUserTimezone(userId);
  const today = todayInZone(tz);
  const firstDayOfWeek =
    query.mode === 'week' ? await loadFirstDayOfWeek(userId) : 0;
  const { from, to, through } = fetchRange(query, today, firstDayOfWeek);
  const ctx: MetricContext = {
    tz,
    zoneFloors:
      query.a === 'trainingLoad' || query.b === 'trainingLoad'
        ? (await heartRateZoneService.resolveZonesForUser(userId)).floors
        : percentMaxFloors(FALLBACK_MAX_HR),
  };
  const [aValues, bValues] = await Promise.all([
    loadMetricDays(userId, query.a, from, to, ctx),
    loadMetricDays(userId, query.b, from, to, ctx),
  ]);

  const metrics = {
    a: { key: query.a, values: aValues },
    b: { key: query.b, values: bValues },
    start: query.start,
    end: query.end,
  };
  let sides: CompareSides;
  let result: CompareResult;
  if (query.mode === 'week') {
    const input = { ...metrics, firstDayOfWeek };
    sides = weekSides(input);
    result = analyzeWeeks({ ...input, timing: weekTiming(query.timing) });
  } else {
    sides = daySides(metrics);
    result = analyzeDays({ ...metrics, timing: dayTiming(query.timing) });
  }

  // Raw values on the analysed days (or weeks); the deviations exactly as they were paired.
  const first = sides.keys[0] ?? query.start;
  const last = sides.keys[sides.keys.length - 1] ?? query.end;
  return {
    a: { key: query.a, values: between(sides.a.raw, first, last) },
    b: { key: query.b, values: between(sides.b.raw, first, last) },
    deviations: { a: sides.a.values, b: sides.b.values },
    through,
    result,
  };
}

/**
 * How has B been since A started? The habit loads over the last two years and two weeks, the
 * outcome over the last two years or far enough back to cover the year before the start;
 * neither counts today.
 */
export async function getCompareSince(
  userId: string,
  query: CompareSinceQuery
): Promise<CompareSinceResponse> {
  const tz = await loadUserTimezone(userId);
  const today = todayInZone(tz);
  const yesterday = addDays(today, -1);
  const oldest = addDays(today, -SINCE_START_MAX_DAYS_AGO);
  const { habitStart } = query;
  if (habitStart !== undefined) {
    if (compareDays(habitStart, today) >= 0) {
      throw new CompareModeError('habitStart must be before today');
    }
    if (compareDays(habitStart, oldest) < 0) {
      throw new CompareModeError(
        `habitStart can be at most ${SINCE_START_MAX_DAYS_AGO} days ago`
      );
    }
  }
  const firstDayOfWeek = await loadFirstDayOfWeek(userId);
  const ctx: MetricContext = {
    tz,
    zoneFloors:
      query.a === 'trainingLoad' || query.b === 'trainingLoad'
        ? (await heartRateZoneService.resolveZonesForUser(userId)).floors
        : percentMaxFloors(FALLBACK_MAX_HR),
  };
  const windowFrom = addDays(today, -SINCE_WINDOW_DAYS);
  const outcomeFrom = (start: string | null) =>
    start === null
      ? windowFrom
      : earliest(windowFrom, addDays(start, -SINCE_BEFORE_DAYS));
  // The suggestion is held to `oldest` by the shared analysis, which reads the weeks before it.
  const loadHabit = () =>
    loadMetricDays(
      userId,
      query.a,
      addDays(today, -SINCE_HABIT_DAYS),
      yesterday,
      ctx
    );

  let habit: DaySeries;
  let outcome: DaySeries;
  if (habitStart !== undefined) {
    [habit, outcome] = await Promise.all([
      loadHabit(),
      loadMetricDays(userId, query.b, outcomeFrom(habitStart), yesterday, ctx),
    ]);
  } else {
    // The suggested start sizes the outcome window, so the habit comes first.
    habit = await loadHabit();
    outcome = await loadMetricDays(
      userId,
      query.b,
      outcomeFrom(suggestedHabitStart(habit, query.a, firstDayOfWeek, oldest)),
      yesterday,
      ctx
    );
  }

  const result = analyzeSince({
    habit: { key: query.a, values: habit },
    outcome: { key: query.b, values: outcome },
    start: habitStart ?? null,
    line: query.line ?? null,
    today,
    firstDayOfWeek,
  });

  // Only the stretches that were compared; a stretch without days has no meaningful `from`.
  const { before, since } = result;
  if (!since) {
    return {
      mode: 'since',
      habit: { key: query.a, values: {} },
      outcome: { key: query.b, values: {} },
      result,
    };
  }
  const first = before && before.days > 0 ? before.from : since.from;
  return {
    mode: 'since',
    habit: { key: query.a, values: between(habit, first, since.to) },
    outcome: { key: query.b, values: between(outcome, first, since.to) },
    result,
  };
}

/**
 * One metric's value per day in from..to; a day without one is absent. Event metrics are 0
 * on days without a record from the first record ever; food metrics are missing on days
 * with nothing logged; everything else is missing when not recorded.
 */
export async function loadMetricDays(
  userId: string,
  key: CompareMetricKey,
  from: string,
  to: string,
  ctx: MetricContext
): Promise<DaySeries> {
  if (compareDays(from, to) > 0) return {};
  return between(await loadSeries(userId, key, from, to, ctx), from, to);
}

async function loadSeries(
  userId: string,
  key: CompareMetricKey,
  from: string,
  to: string,
  ctx: MetricContext
): Promise<DaySeries> {
  switch (key) {
    case 'mood':
    case 'energy':
    case 'focus': {
      // Manual check-ins only, unlike the Mood report: Garmin's derived mood is inverted
      // stress, which Garmin computes from HRV, so it would manufacture links with sleep.
      const rows = await compareRepository.getManualMoodDays(userId, from, to);
      return seriesOf(rows, (row) => row[key]);
    }
    case 'timeAsleep': {
      const rows = await compareRepository.getMainSleepDays(userId, from, to);
      return seriesOf(rows, (row) =>
        row.timeAsleepSeconds === null
          ? null
          : row.timeAsleepSeconds / SECONDS_PER_HOUR
      );
    }
    case 'sleepScore':
    case 'overnightHrv':
    case 'restingHeartRate': {
      const rows = await compareRepository.getMainSleepDays(userId, from, to);
      return seriesOf(rows, (row) => row[key]);
    }
    case 'bedtime':
      return loadBedtimes(userId, from, to, ctx.tz);
    case 'bedtimeConsistency':
      return bedtimeConsistency(
        await loadBedtimes(userId, from, to, ctx.tz),
        from,
        to
      );
    case 'meditationMinutes':
    case 'meditated':
    case 'meditationSessions7d':
      return loadMeditation(userId, key, from, to);
    case 'calories':
    case 'protein':
    case 'carbs':
    case 'fat':
    case 'caffeine':
    case 'alcohol':
      return loadFood(userId, key, from, to);
    case 'workoutMinutes':
    case 'trainingLoad': {
      const [sessions, firstDay] = await Promise.all([
        reportRepository.getTrainingLoadSessions(userId, from, to),
        compareRepository.getExerciseFirstDay(userId),
      ]);
      const perDay: DaySeries = {};
      for (const session of sessions) {
        const value =
          key === 'trainingLoad'
            ? sessionLoad(session, ctx.zoneFloors)
            : session.durationMinutes;
        perDay[session.day] = (perDay[session.day] ?? 0) + value;
      }
      return withEventZeros(perDay, firstDay, from, to);
    }
    case 'cardioMinutes': {
      const [rows, firstDay] = await Promise.all([
        compareRepository.getCardioMinuteDays(userId, from, to),
        compareRepository.getExerciseFirstDay(userId),
      ]);
      return withEventZeros(
        seriesOf(rows, (row) => row.minutes),
        firstDay,
        from,
        to
      );
    }
    case 'strengthVolume': {
      const [rows, firstDay] = await Promise.all([
        compareRepository.getStrengthVolumeDays(userId, from, to),
        compareRepository.getExerciseFirstDay(userId),
      ]);
      return withEventZeros(
        seriesOf(rows, (row) => row.volumeKg),
        firstDay,
        from,
        to
      );
    }
    case 'weightTrend':
      return loadWeightTrend(userId, from, to);
    case 'steps': {
      const rows = await compareRepository.getCheckInDays(userId, from, to);
      return seriesOf(rows, (row) => row.steps);
    }
    default: {
      const unhandled: never = key;
      throw new RangeError(`unknown compare metric ${String(unhandled)}`);
    }
  }
}

/** Bedtime as minutes after 18:00 on the clock where it was recorded: the record's zone or offset, else the profile zone. */
async function loadBedtimes(
  userId: string,
  from: string,
  to: string,
  tz: string
): Promise<DaySeries> {
  const rows = await compareRepository.getMainSleepDays(userId, from, to);
  return seriesOf(rows, (row) => {
    if (row.bedtime === null) return null;
    const zone = resolveRecordZone(
      row.recordTimezone,
      row.recordUtcOffsetMinutes
    );
    const { hour, minute } = zone
      ? instantHourMinuteInZone(row.bedtime, zone)
      : instantHourMinute(row.bedtime, tz);
    return (
      (hour * 60 + minute - BEDTIME_ORIGIN_MINUTES + MINUTES_PER_DAY) %
      MINUTES_PER_DAY
    );
  });
}

/** The spread (sample SD) of bedtime over the 7 nights ending on each day, from 4 of them; only where all 7 were loaded. */
function bedtimeConsistency(
  bedtimes: DaySeries,
  from: string,
  to: string
): DaySeries {
  const out: DaySeries = {};
  for (const day of daysInRange(addDays(from, ROLLING_DAYS - 1), to)) {
    const nights = daysInRange(addDays(day, -(ROLLING_DAYS - 1)), day)
      .map((night) => bedtimes[night])
      .filter((value) => value !== undefined);
    if (nights.length < MIN_CONSISTENCY_NIGHTS) continue;
    const spread = sampleSd(nights);
    if (spread !== null) out[day] = spread;
  }
  return out;
}

async function loadMeditation(
  userId: string,
  key: 'meditationMinutes' | 'meditated' | 'meditationSessions7d',
  from: string,
  to: string
): Promise<DaySeries> {
  const [rows, firstDay] = await Promise.all([
    compareRepository.getMeditationDays(userId, from, to),
    compareRepository.getMeditationFirstDay(userId),
  ]);
  if (key === 'meditationSessions7d') {
    const sessions = withEventZeros(
      seriesOf(rows, (row) => row.sessions),
      firstDay,
      from,
      to
    );
    return trailingSessions(sessions, firstDay, from, to);
  }
  const minutes = withEventZeros(
    seriesOf(rows, (row) => row.minutes),
    firstDay,
    from,
    to
  );
  if (key === 'meditationMinutes') return minutes;
  const meditated: DaySeries = {};
  for (const [day, value] of Object.entries(minutes)) {
    meditated[day] = value > 0 ? 1 : 0;
  }
  return meditated;
}

/**
 * Sessions in the 7 days ending on each day. Days before the first session ever had none;
 * a window reaching back to a day that was not loaded is unknown, so that day is absent.
 */
function trailingSessions(
  sessions: DaySeries,
  firstDay: string | null,
  from: string,
  to: string
): DaySeries {
  const out: DaySeries = {};
  if (firstDay === null) return out;
  for (const day of daysInRange(latest(firstDay, from), to)) {
    const window = daysInRange(
      latest(firstDay, addDays(day, -(ROLLING_DAYS - 1))),
      day
    );
    if (window.some((d) => sessions[d] === undefined)) continue;
    out[day] = window.reduce((total, d) => total + sessions[d], 0);
  }
  return out;
}

/**
 * A day with food logged has its totals, supplements included, and a nutrient it lacks is 0
 * there. A day without food is missing, even with supplements: a vitamin-only day would read
 * as a near-zero intake and track logging habits, not eating.
 */
async function loadFood(
  userId: string,
  key: FoodMetric,
  from: string,
  to: string
): Promise<DaySeries> {
  const [rows, foodDays]: [NutritionTotalsRow[], string[]] = await Promise.all([
    reportRepository.getDailyNutritionTotalsRange(userId, from, to),
    compareRepository.getFoodLoggedDays(userId, from, to),
  ]);
  const logged = new Set(foodDays);
  const column = FOOD_COLUMNS[key];
  const out: DaySeries = {};
  for (const row of rows) {
    if (!logged.has(row.entry_date)) continue;
    const value = Number(row[column] ?? 0);
    out[row.entry_date] = Number.isFinite(value) ? value : 0;
  }
  return out;
}

/** The smoothed trend from weigh-ins, warmed up before the range; no value past the last weigh-in. */
async function loadWeightTrend(
  userId: string,
  from: string,
  to: string
): Promise<DaySeries> {
  const rows = await compareRepository.getCheckInDays(
    userId,
    addDays(from, -WEIGHT_WARM_UP_DAYS),
    to
  );
  const samples = rows.flatMap((row) =>
    row.weight === null ? [] : [{ date: row.day, weight: row.weight }]
  );
  const out: DaySeries = {};
  for (const point of computeDailyWeightTrend(samples)) {
    out[point.date] = point.trend;
  }
  return out;
}

/** Event metrics: 0 on each day from the first record ever (or from) through to without one. */
function withEventZeros(
  perDay: DaySeries,
  firstDay: string | null,
  from: string,
  to: string
): DaySeries {
  const out: DaySeries = { ...perDay };
  if (firstDay === null) return out;
  for (const day of daysInRange(latest(firstDay, from), to)) out[day] ??= 0;
  return out;
}

function seriesOf<Row extends { day: string }>(
  rows: readonly Row[],
  valueOf: (row: Row) => number | null
): DaySeries {
  const out: DaySeries = {};
  for (const row of rows) {
    const value = valueOf(row);
    if (value !== null && Number.isFinite(value)) out[row.day] = value;
  }
  return out;
}

/** The series' days from first to last, in day order. */
function between(series: DaySeries, first: string, last: string): DaySeries {
  const out: DaySeries = {};
  for (const day of Object.keys(series).sort()) {
    if (compareDays(day, first) >= 0 && compareDays(day, last) <= 0) {
      out[day] = series[day];
    }
  }
  return out;
}

function latest(a: string, b: string): string {
  return compareDays(a, b) >= 0 ? a : b;
}

function earliest(a: string, b: string): string {
  return compareDays(a, b) <= 0 ? a : b;
}

/**
 * The days to load: the range with the history the analysis needs, ending before today (day
 * mode) or this week (week mode). `through` is the last day the answer includes: that last
 * finished day, or the query's end (the end of the last week asked for, in week mode) if
 * earlier.
 */
function fetchRange(
  query: CompareQuery,
  today: string,
  firstDayOfWeek: number
): { from: string; to: string; through: string } {
  if (query.mode === 'week') {
    const lastFinished = addDays(weekStartOf(today, firstDayOfWeek), -1);
    return {
      from: addDays(
        weekStartOf(query.start, firstDayOfWeek),
        -WEEK_HISTORY_DAYS
      ),
      to: earliest(
        addDays(weekStartOf(query.end, firstDayOfWeek), WEEK_AFTER_DAYS),
        lastFinished
      ),
      through: earliest(
        addDays(weekStartOf(query.end, firstDayOfWeek), 6),
        lastFinished
      ),
    };
  }
  const lastFinished = addDays(today, -1);
  return {
    from: addDays(query.start, -DAY_HISTORY_DAYS),
    to: earliest(addDays(query.end, 1), lastFinished),
    through: earliest(query.end, lastFinished),
  };
}

function dayTiming(timing: number): CompareTiming {
  if (timing === -1 || timing === 0 || timing === 1) return timing;
  throw new RangeError(`timing must be -1, 0 or 1, not ${timing}`);
}

function weekTiming(timing: number): 0 | 1 {
  if (timing === 0 || timing === 1) return timing;
  throw new RangeError(`week mode supports timing 0 or 1 only, not ${timing}`);
}

export default { getCompare, getCompareSince, loadMetricDays };
