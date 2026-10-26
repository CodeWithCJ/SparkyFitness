import { addDays, daysBetween } from './timezone.ts';
import { FALLBACK_MAX_HR as DEFAULT_MAX_HEART_RATE } from './heartRateZones.ts';

/** One logged run, as far as the estimates are concerned. */
export interface RunForEstimate {
  /** The person's local day, YYYY-MM-DD. */
  day: string;
  distanceKm: number;
  durationMinutes: number;
  avgHeartRate: number | null;
  /** Total climb; null when not measured. */
  elevationGainMeters: number | null;
}

/** Runs older than this are left out of the VO2 max estimate. */
export const VO2_WINDOW_DAYS = 42;
/** Fewest qualifying runs before a VO2 max estimate is given. */
export const VO2_MIN_RUNS = 2;
/** Days of runs the power figures cover. */
export const POWER_WINDOW_DAYS = 28;
/** Used when the person's resting heart rate is not known. */
export const DEFAULT_RESTING_HEART_RATE = 60;

const MIN_RUN_MINUTES = 15;
const MAX_RUN_MINUTES = 240;
/** Slower or faster than this is not a run (walk or a bad distance). */
const MIN_RUN_SPEED_KMH = 6;
const MAX_RUN_SPEED_KMH = 25;
/** Share of heart-rate reserve the estimate trusts: an easy jog or a sprint says little. */
const MIN_RESERVE_SHARE = 0.55;
const MAX_RESERVE_SHARE = 0.92;
const MIN_VO2_MAX = 20;
const MAX_VO2_MAX = 85;
/** Mechanical cost of running on the flat, joules per kg per metre. */
const FLAT_COST_J_PER_KG_M = 1.04;
const GRAVITY = 9.81;
/** Bounds on a believable average running power per kg of body weight. */
const MIN_WATTS_PER_KG = 1.5;
const MAX_WATTS_PER_KG = 9;

const round1 = (n: number) => Math.round(n * 10) / 10;

function speedMetersPerSecond(run: RunForEstimate): number | null {
  if (!(run.distanceKm > 0) || !(run.durationMinutes > 0)) return null;
  return (run.distanceKm * 1000) / (run.durationMinutes * 60);
}

function isUsableRun(run: RunForEstimate): boolean {
  const speed = speedMetersPerSecond(run);
  if (speed === null) return false;
  const kmh = speed * 3.6;
  return (
    run.durationMinutes >= MIN_RUN_MINUTES &&
    run.durationMinutes <= MAX_RUN_MINUTES &&
    kmh >= MIN_RUN_SPEED_KMH &&
    kmh <= MAX_RUN_SPEED_KMH
  );
}

/** Average grade (rise over run) of a run, 0 without a measured climb. */
function averageGrade(run: RunForEstimate): number {
  if (!run.elevationGainMeters || run.elevationGainMeters <= 0) return 0;
  return Math.min(0.15, run.elevationGainMeters / (run.distanceKm * 1000));
}

/**
 * VO2 max (ml/kg/min) implied by one run: the oxygen cost of running at the
 * average speed (ACSM running equation, with the average grade) divided by the
 * share of heart-rate reserve used, which tracks the share of VO2 reserve. Null
 * for a run that is too short, too slow or fast, has no heart rate, or sat too
 * near rest or maximum for the heart rate to say much.
 */
export function vo2MaxFromRun(
  run: RunForEstimate,
  restingHeartRate: number = DEFAULT_RESTING_HEART_RATE,
  maxHeartRate: number = DEFAULT_MAX_HEART_RATE
): number | null {
  if (!isUsableRun(run)) return null;
  const bpm = run.avgHeartRate;
  if (bpm == null || !Number.isFinite(bpm) || bpm <= 0) return null;
  const reserve = maxHeartRate - restingHeartRate;
  if (!(reserve > 20)) return null;
  const share = (bpm - restingHeartRate) / reserve;
  if (share < MIN_RESERVE_SHARE || share > MAX_RESERVE_SHARE) return null;

  const metersPerMinute = (speedMetersPerSecond(run) ?? 0) * 60;
  const cost =
    0.2 * metersPerMinute + 0.9 * metersPerMinute * averageGrade(run) + 3.5;
  const vo2Max = (cost - 3.5) / share + 3.5;
  if (vo2Max < MIN_VO2_MAX || vo2Max > MAX_VO2_MAX) return null;
  return vo2Max;
}

/**
 * Average mechanical power (watts) of one run: the flat cost of moving the
 * body's mass plus the work of lifting it up the measured climb. A model from
 * pace, weight and climb, not a power meter, so it will not follow wind, surface
 * or form. Null for a run that is not usable or has no body weight.
 */
export function runningPowerWatts(
  run: RunForEstimate,
  bodyWeightKg: number
): number | null {
  if (!isUsableRun(run) || !(bodyWeightKg > 0)) return null;
  const speed = speedMetersPerSecond(run) ?? 0;
  const climbJoules =
    bodyWeightKg * GRAVITY * Math.max(0, run.elevationGainMeters ?? 0);
  const watts =
    bodyWeightKg * FLAT_COST_J_PER_KG_M * speed +
    climbJoules / (run.durationMinutes * 60);
  const perKg = watts / bodyWeightKg;
  if (perKg < MIN_WATTS_PER_KG || perKg > MAX_WATTS_PER_KG) return null;
  return watts;
}

/** The VO2 max one day's runs imply. */
export interface RunVo2Max {
  day: string;
  value: number;
}

export interface Vo2MaxEstimate {
  /** ml/kg/min, one decimal. */
  value: number;
  /** Runs it is based on. */
  runs: number;
  /** First and last day of those runs. */
  from: string;
  to: string;
  /** What each run day implies (median if several), oldest first, for a trend. */
  series?: RunVo2Max[];
}

export interface RunPower {
  day: string;
  watts: number;
}

export interface RunningPower {
  /** Average of the runs' average power, whole watts. */
  averageWatts: number;
  /** Watts per kg of body weight, one decimal. */
  wattsPerKg: number;
  runs: RunPower[];
}

export interface RunningEstimates {
  /** Null until enough heart-rate runs are logged. */
  vo2Max: Vo2MaxEstimate | null;
  /** Null without a body weight or a usable run. */
  power: RunningPower | null;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * VO2 max and running power from recent runs. VO2 max is the median over the
 * last six weeks, so one hot or hilly day does not swing it; power covers the
 * last four. Both are estimates, to be labelled as such. Pure; `today` and the
 * days are local YYYY-MM-DD.
 */
export function computeRunningEstimates(
  runs: readonly RunForEstimate[],
  today: string,
  options: {
    restingHeartRate?: number | null;
    maxHeartRate?: number | null;
    bodyWeightKg?: number | null;
  } = {}
): RunningEstimates {
  const resting = options.restingHeartRate ?? DEFAULT_RESTING_HEART_RATE;
  const max = options.maxHeartRate ?? DEFAULT_MAX_HEART_RATE;

  const vo2Start = addDays(today, -(VO2_WINDOW_DAYS - 1));
  const vo2Runs = runs
    .filter((run) => run.day >= vo2Start && run.day <= today)
    .flatMap((run) => {
      const value = vo2MaxFromRun(run, resting, max);
      return value === null ? [] : [{ day: run.day, value }];
    });
  let vo2Max: Vo2MaxEstimate | null = null;
  if (vo2Runs.length >= VO2_MIN_RUNS) {
    const days = vo2Runs.map((run) => run.day).sort();
    vo2Max = {
      value: round1(median(vo2Runs.map((run) => run.value))),
      runs: vo2Runs.length,
      from: days[0] ?? vo2Start,
      to: days[days.length - 1] ?? today,
      series: [...new Set(days)].map((day) => ({
        day,
        value: round1(
          median(
            vo2Runs.filter((run) => run.day === day).map((run) => run.value)
          )
        ),
      })),
    };
  }

  let power: RunningPower | null = null;
  const weight = options.bodyWeightKg;
  if (weight && weight > 0) {
    const powerStart = addDays(today, -(POWER_WINDOW_DAYS - 1));
    const powers = runs
      .filter((run) => run.day >= powerStart && run.day <= today)
      .flatMap((run) => {
        const watts = runningPowerWatts(run, weight);
        return watts === null ? [] : [{ day: run.day, watts }];
      })
      .sort((a, b) => daysBetween(b.day, a.day));
    if (powers.length > 0) {
      const average =
        powers.reduce((sum, run) => sum + run.watts, 0) / powers.length;
      power = {
        averageWatts: Math.round(average),
        wattsPerKg: round1(average / weight),
        runs: powers.map((run) => ({
          day: run.day,
          watts: Math.round(run.watts),
        })),
      };
    }
  }
  return { vo2Max, power };
}
