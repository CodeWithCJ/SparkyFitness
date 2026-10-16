import type { SleepEntry } from '../types/sleep';
import { addDays, weekdayOfDay } from './dateUtils';
import { average } from './mathUtils';
import { selectMainSleep } from './sleepSessions';

export const SLEEP_ANALYTICS_METRICS = [
  'duration',
  'sleepScore',
  'hrv',
  'restingHeartRate',
  'spo2',
  'respiration',
  'stress',
  'bodyBattery',
] as const;

export type SleepAnalyticsMetric = (typeof SLEEP_ANALYTICS_METRICS)[number];

export type SleepAnalyticsPoint = { day: string; value: number };

export interface SleepStageAverages {
  deepSeconds: number | null;
  lightSeconds: number | null;
  remSeconds: number | null;
  awakeSeconds: number | null;
}

/** Hours a night needs to count as a full one in the "nights of 7h+" figure. */
export const FULL_NIGHT_HOURS = 7;

export interface SleepNightExtreme {
  day: string;
  hours: number;
}

export interface SleepAnalytics {
  /** One point per day; `value` is 0 for a night without that reading. */
  series: Record<SleepAnalyticsMetric, SleepAnalyticsPoint[]>;
  /** Mean over nights that reported the metric; null when none did. */
  averages: Record<SleepAnalyticsMetric, number | null>;
  stages: SleepStageAverages;
  nightsWithData: number;
  /** Mean time asleep as a share of time in bed, 0-100; null when no night reported both. */
  efficiencyPct: number | null;
  /** Mean clock times in the device's zone, as minutes since midnight. */
  averageBedtimeMinutes: number | null;
  averageWakeMinutes: number | null;
  /** Standard deviation of bedtime in minutes; null with fewer than 3 nights. */
  bedtimeVariabilityMinutes: number | null;
  /** Standard deviation of wake time in minutes; null with fewer than 3 nights. */
  wakeVariabilityMinutes: number | null;
  /** Each stage's share of the average night (deep + light + REM + awake), 0-100. */
  stagePct: {
    deep: number | null;
    light: number | null;
    rem: number | null;
    awake: number | null;
  };
  /** Nights that reported a time asleep, and how many reached `FULL_NIGHT_HOURS`. */
  nightsWithDuration: number;
  fullNights: number;
  longestNight: SleepNightExtreme | null;
  shortestNight: SleepNightExtreme | null;
  /** Mean hours asleep on weekday vs weekend nights (by the day the night ends on). */
  weekdayHours: number | null;
  weekendHours: number | null;
  /** Mean bedtime on weekday vs weekend nights, minutes since midnight. */
  weekdayBedtimeMinutes: number | null;
  weekendBedtimeMinutes: number | null;
}

/** Bedtimes are measured from this hour so 23:30 and 00:30 average to midnight, not noon. */
const BEDTIME_ORIGIN_HOUR = 18;

const clockMinutes = (iso: string): number | null => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.getHours() * 60 + date.getMinutes();
};

const readMetric = (
  entry: SleepEntry,
  metric: SleepAnalyticsMetric
): number | null | undefined => {
  switch (metric) {
    case 'duration':
      return entry.time_asleep_in_seconds == null
        ? null
        : entry.time_asleep_in_seconds / 3600;
    case 'sleepScore':
      return entry.sleep_score;
    case 'hrv':
      return entry.avg_overnight_hrv;
    case 'restingHeartRate':
      return entry.resting_heart_rate;
    case 'spo2':
      return entry.average_spo2_value;
    case 'respiration':
      return entry.average_respiration_value;
    case 'stress':
      return entry.avg_sleep_stress;
    case 'bodyBattery':
      return entry.body_battery_change;
  }
};

const positive = (value: number | null | undefined): number | null =>
  value != null && Number.isFinite(value) ? value : null;

/**
 * Per-night analytics over a window, taking each day's main sleep (the same rule the Diary
 * and the Health Trends sleep chart use) so a nap never overwrites the night.
 */
export function buildSleepAnalytics(
  entries: SleepEntry[],
  startDate: string,
  days: number
): SleepAnalytics {
  const byDay = new Map<string, SleepEntry[]>();
  for (const entry of entries) {
    const list = byDay.get(entry.entry_date);
    if (list) list.push(entry);
    else byDay.set(entry.entry_date, [entry]);
  }

  const series = Object.fromEntries(
    SLEEP_ANALYTICS_METRICS.map((metric) => [
      metric,
      [] as SleepAnalyticsPoint[],
    ])
  ) as Record<SleepAnalyticsMetric, SleepAnalyticsPoint[]>;
  const reported = Object.fromEntries(
    SLEEP_ANALYTICS_METRICS.map((metric) => [metric, [] as number[]])
  ) as Record<SleepAnalyticsMetric, number[]>;
  const deep: number[] = [];
  const light: number[] = [];
  const rem: number[] = [];
  const awake: number[] = [];
  const efficiencies: number[] = [];
  const bedtimes: number[] = [];
  const wakes: number[] = [];
  const nightHours: SleepNightExtreme[] = [];
  const weekdayHours: number[] = [];
  const weekendHours: number[] = [];
  const weekdayBedtimes: number[] = [];
  const weekendBedtimes: number[] = [];
  let nightsWithData = 0;

  for (let i = 0; i < days; i++) {
    const day = addDays(startDate, i);
    const night = selectMainSleep(byDay.get(day) ?? []);
    if (night) nightsWithData += 1;

    for (const metric of SLEEP_ANALYTICS_METRICS) {
      const value = night ? positive(readMetric(night, metric)) : null;
      if (value !== null) reported[metric].push(value);
      series[metric].push({ day, value: value ?? 0 });
    }

    if (night) {
      if (
        night.time_asleep_in_seconds != null &&
        night.duration_in_seconds > 0
      ) {
        efficiencies.push(
          (night.time_asleep_in_seconds / night.duration_in_seconds) * 100
        );
      }
      const bed = clockMinutes(night.bedtime);
      const wake = clockMinutes(night.wake_time);
      const weekday = weekdayOfDay(day);
      const isWeekend = weekday === 0 || weekday === 6;
      const asleepHours = positive(readMetric(night, 'duration'));
      if (asleepHours !== null) {
        nightHours.push({ day, hours: asleepHours });
        (isWeekend ? weekendHours : weekdayHours).push(asleepHours);
      }
      if (bed !== null) {
        const shifted = (bed - BEDTIME_ORIGIN_HOUR * 60 + 1440) % 1440;
        bedtimes.push(shifted);
        (isWeekend ? weekendBedtimes : weekdayBedtimes).push(shifted);
      }
      if (wake !== null) wakes.push(wake);
      const pairs: [number | null, number[]][] = [
        [night.deep_sleep_seconds, deep],
        [night.light_sleep_seconds, light],
        [night.rem_sleep_seconds, rem],
        [night.awake_sleep_seconds, awake],
      ];
      for (const [seconds, bucket] of pairs) {
        if (seconds != null) bucket.push(seconds);
      }
    }
  }

  const averages = Object.fromEntries(
    SLEEP_ANALYTICS_METRICS.map((metric) => [metric, average(reported[metric])])
  ) as Record<SleepAnalyticsMetric, number | null>;

  const stages = {
    deepSeconds: average(deep),
    lightSeconds: average(light),
    remSeconds: average(rem),
    awakeSeconds: average(awake),
  };
  const stageTotal =
    (stages.deepSeconds ?? 0) +
    (stages.lightSeconds ?? 0) +
    (stages.remSeconds ?? 0) +
    (stages.awakeSeconds ?? 0);
  const share = (seconds: number | null) =>
    seconds === null || stageTotal <= 0 ? null : (seconds / stageTotal) * 100;
  const byHours = [...nightHours].sort((a, b) => a.hours - b.hours);
  const shiftBedtime = (value: number[]) =>
    mean(value, (m) => (m + BEDTIME_ORIGIN_HOUR * 60) % 1440);

  return {
    series,
    averages,
    stages,
    stagePct: {
      deep: share(stages.deepSeconds),
      light: share(stages.lightSeconds),
      rem: share(stages.remSeconds),
      awake: share(stages.awakeSeconds),
    },
    nightsWithDuration: nightHours.length,
    fullNights: nightHours.filter((n) => n.hours >= FULL_NIGHT_HOURS).length,
    longestNight: byHours[byHours.length - 1] ?? null,
    shortestNight: byHours.length > 1 ? byHours[0] : null,
    weekdayHours: average(weekdayHours),
    weekendHours: average(weekendHours),
    weekdayBedtimeMinutes: shiftBedtime(weekdayBedtimes),
    weekendBedtimeMinutes: shiftBedtime(weekendBedtimes),
    wakeVariabilityMinutes: standardDeviation(wakes),
    nightsWithData,
    efficiencyPct: average(efficiencies),
    averageBedtimeMinutes: mean(
      bedtimes,
      (m) => (m + BEDTIME_ORIGIN_HOUR * 60) % 1440
    ),
    averageWakeMinutes: average(wakes),
    bedtimeVariabilityMinutes: standardDeviation(bedtimes),
  };
}

const mean = (
  values: number[],
  map: (value: number) => number
): number | null => {
  const value = average(values);
  return value === null ? null : map(value);
};

const standardDeviation = (values: number[]): number | null => {
  if (values.length < 3) return null;
  const m = average(values) ?? 0;
  return Math.sqrt(average(values.map((v) => (v - m) ** 2)) ?? 0);
};
