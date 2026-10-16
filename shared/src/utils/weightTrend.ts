import { addDays, compareDays, daysBetween } from "./timezone.ts";

// Smoothed weight trend: logged weights are linearly interpolated onto every
// calendar day, then averaged over a trailing 7-day window. This is the same
// smoothing the server's adaptive TDEE uses, so the trend line a user sees
// matches the trend the calorie target is built from.

const TREND_WINDOW_DAYS = 7;
/** Trend days used to fit the current rate of change. */
const RATE_WINDOW_DAYS = 14;
/** Minimum span and weigh-ins before a rate or forecast is trusted. */
const MIN_FORECAST_SPAN_DAYS = 14;
const MIN_FORECAST_WEIGH_INS = 4;
/** Forecasts further out than this are noise, not a plan. */
const MAX_FORECAST_DAYS = 730;

export interface WeightSample {
  /** YYYY-MM-DD calendar day. */
  date: string;
  /** Any consistent unit; outputs stay in the same unit. */
  weight: number;
}

export interface WeightTrendPoint extends WeightSample {
  /** Smoothed weight on this day, same unit as the input. */
  trend: number;
}

export interface WeightTrendSummary {
  /** Latest smoothed weight. */
  currentTrend: number;
  /** Change per week over the last two weeks of trend; null if too little data. */
  weeklyRate: number | null;
}

export interface GoalForecast {
  /** Projected YYYY-MM-DD the trend reaches the target, if it stays on course. */
  date: string;
  daysRemaining: number;
}

/**
 * Smoothed trend for each logged day. Duplicate days keep the last entry and
 * non-finite or non-positive weights are ignored. Output is sorted by date.
 */
export function computeWeightTrend(
  samples: readonly WeightSample[],
): WeightTrendPoint[] {
  const byDay = new Map<string, number>();
  for (const s of samples) {
    if (Number.isFinite(s.weight) && s.weight > 0) byDay.set(s.date, s.weight);
  }
  const logged = [...byDay.entries()]
    .map(([date, weight]) => ({ date, weight }))
    .sort((a, b) => compareDays(a.date, b.date));
  if (logged.length === 0) return [];

  const first = logged[0]!.date;
  const span = daysBetween(first, logged[logged.length - 1]!.date);

  // Interpolate onto each day between the first and last weigh-in.
  const daily: number[] = new Array<number>(span + 1);
  for (let i = 0; i < logged.length; i++) {
    const cur = logged[i]!;
    const curIdx = daysBetween(first, cur.date);
    daily[curIdx] = cur.weight;
    const next = logged[i + 1];
    if (!next) continue;
    const gap = daysBetween(cur.date, next.date);
    for (let d = 1; d < gap; d++) {
      daily[curIdx + d] = cur.weight + ((next.weight - cur.weight) * d) / gap;
    }
  }

  const trendByIdx = daily.map((_, i) => {
    const from = Math.max(0, i - TREND_WINDOW_DAYS + 1);
    let sum = 0;
    for (let j = from; j <= i; j++) sum += daily[j]!;
    return sum / (i - from + 1);
  });

  return logged.map((s) => ({
    ...s,
    trend: trendByIdx[daysBetween(first, s.date)]!,
  }));
}

/** Current trend value and per-week rate of change from a computed trend. */
export function summarizeWeightTrend(
  points: readonly WeightTrendPoint[],
): WeightTrendSummary | null {
  const last = points[points.length - 1];
  if (!last) return null;
  return { currentTrend: last.trend, weeklyRate: weeklyRateOf(points) };
}

function weeklyRateOf(points: readonly WeightTrendPoint[]): number | null {
  const last = points[points.length - 1];
  if (!last) return null;
  const cutoff = addDays(last.date, -RATE_WINDOW_DAYS);
  const window = points.filter((p) => compareDays(p.date, cutoff) >= 0);
  if (window.length < MIN_FORECAST_WEIGH_INS) return null;
  const firstDay = window[0]!.date;
  if (daysBetween(firstDay, last.date) < MIN_FORECAST_SPAN_DAYS - 1)
    return null;

  // Least-squares slope of trend against day offset.
  const xs = window.map((p) => daysBetween(firstDay, p.date));
  const n = window.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = window.reduce((a, p) => a + p.trend, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - meanX) * (window[i]!.trend - meanY);
    den += (xs[i]! - meanX) ** 2;
  }
  if (den === 0) return null;
  return (num / den) * 7;
}

/** Why a goal forecast is, or is not, available. */
export type GoalForecastStatus =
  | "insufficient-data"
  | "no-goal"
  | "steady"
  | "toward-goal"
  | "away-from-goal"
  | "too-far";

export interface GoalForecastAssessment {
  status: GoalForecastStatus;
  /** Only when `status` is `toward-goal`. */
  forecast: GoalForecast | null;
}

/** A weekly change under this share of the trend weight reads as holding steady. */
const FLAT_RATE_FRACTION_PER_WEEK = 0.0005;

/**
 * Where the trend stands against `target`: heading there (with the projected
 * date), holding steady, moving away, too far out to call, or not enough data.
 * Callers that only want the date use `forecastGoalDate`.
 */
export function assessGoalForecast(
  points: readonly WeightTrendPoint[],
  target: number | null | undefined,
): GoalForecastAssessment {
  const last = points[points.length - 1];
  const rate = weeklyRateOf(points);
  if (!last || rate === null) {
    return { status: "insufficient-data", forecast: null };
  }
  if (target == null || !Number.isFinite(target) || target <= 0) {
    return { status: "no-goal", forecast: null };
  }
  if (Math.abs(rate) < last.trend * FLAT_RATE_FRACTION_PER_WEEK) {
    return { status: "steady", forecast: null };
  }

  const remaining = target - last.trend;
  // Already at the target: nothing left to project.
  if (remaining === 0) return { status: "steady", forecast: null };
  if (Math.sign(remaining) !== Math.sign(rate)) {
    return { status: "away-from-goal", forecast: null };
  }

  const daysRemaining = Math.ceil((remaining / rate) * 7);
  if (daysRemaining <= 0) return { status: "steady", forecast: null };
  if (daysRemaining > MAX_FORECAST_DAYS) {
    return { status: "too-far", forecast: null };
  }
  return {
    status: "toward-goal",
    forecast: { date: addDays(last.date, daysRemaining), daysRemaining },
  };
}

/**
 * Projects when the trend reaches `target` at the current rate. Returns null
 * when there is too little data, the trend is flat or moving away from the
 * target, the target is already reached, or the date is over two years out.
 */
export function forecastGoalDate(
  points: readonly WeightTrendPoint[],
  target: number | null | undefined,
): GoalForecast | null {
  return assessGoalForecast(points, target).forecast;
}
