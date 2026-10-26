import { addDays, daysBetween } from './timezone.ts';
import { FALLBACK_MAX_HR, percentMaxFloors } from './heartRateZones.ts';
import {
  MIN_HISTORY_DAYS,
  sessionLoad,
  type LoadSession,
} from './trainingLoad.ts';

/** Time constants (days) of the usual fitness and fatigue curves. */
export const FITNESS_TIME_CONSTANT = 42;
export const FATIGUE_TIME_CONSTANT = 7;
/** Days of history the curve is built from. */
export const CURVE_DAYS = 90;
/**
 * Extra days accumulated before the curve starts (2 x the fitness constant), so
 * an established trainer does not begin the window at zero fitness.
 */
export const WARMUP_DAYS = 2 * FITNESS_TIME_CONSTANT;

export interface FitnessFatiguePoint {
  /** The person's local day, YYYY-MM-DD. */
  day: string;
  /** Load points logged that day. */
  load: number;
  /** Long-term average of load (42-day), what training has built up. */
  fitness: number;
  /** Short-term average of load (7-day), what is still tiring. */
  fatigue: number;
  /** fitness - fatigue: above 0 is fresh, below 0 is tired. */
  form: number;
}

export type FormStatus = 'noData' | 'learning' | 'fresh' | 'neutral' | 'tired';

export interface FitnessFatigue {
  /** Oldest first; the last point is today. Empty with no sessions. */
  points: FitnessFatiguePoint[];
  today: FitnessFatiguePoint | null;
  status: FormStatus;
}

/**
 * Form relative to fitness, so the same gap reads the same for a beginner and a
 * high-volume runner. Above +5% of fitness is fresh, below -10% is tired.
 */
const FRESH_SHARE = 0.05;
const TIRED_SHARE = -0.1;

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Exponentially weighted fitness (42-day) and fatigue (7-day) from daily load,
 * the same model behind most fitness / fatigue / form charts. Pure; `today` and
 * the days are local YYYY-MM-DD. `zoneFloors` are the person's resolved heart
 * rate zone floors, the same ones the training load uses. The curve is built
 * over `days + WARMUP_DAYS` and only the last `days` points are returned. Days
 * with no session count as zero load.
 */
export function computeFitnessFatigue(
  sessions: readonly LoadSession[],
  today: string,
  zoneFloors: readonly number[] = percentMaxFloors(FALLBACK_MAX_HR),
  days: number = CURVE_DAYS
): FitnessFatigue {
  const total = days + WARMUP_DAYS;
  const first = addDays(today, -(total - 1));
  const daily = new Array<number>(total).fill(0);
  let earliest: string | null = null;
  for (const session of sessions) {
    if (session.day < first || session.day > today) continue;
    const index = daysBetween(first, session.day);
    daily[index] = (daily[index] ?? 0) + sessionLoad(session, zoneFloors);
    if (earliest === null || session.day < earliest) earliest = session.day;
  }
  if (earliest === null) return { points: [], today: null, status: 'noData' };

  const fitnessDecay = Math.exp(-1 / FITNESS_TIME_CONSTANT);
  const fatigueDecay = Math.exp(-1 / FATIGUE_TIME_CONSTANT);
  let fitness = 0;
  let fatigue = 0;
  const all: FitnessFatiguePoint[] = daily.map((load, i) => {
    fitness = fitness * fitnessDecay + load * (1 - fitnessDecay);
    fatigue = fatigue * fatigueDecay + load * (1 - fatigueDecay);
    return {
      day: addDays(first, i),
      load: Math.round(load),
      fitness: round1(fitness),
      fatigue: round1(fatigue),
      form: round1(fitness - fatigue),
    };
  });

  const points = all.slice(-days);
  const last = points[points.length - 1] ?? null;
  let status: FormStatus = 'neutral';
  if (daysBetween(earliest, today) < MIN_HISTORY_DAYS) status = 'learning';
  else if (last && last.fitness > 0) {
    const share = last.form / last.fitness;
    if (share > FRESH_SHARE) status = 'fresh';
    else if (share < TIRED_SHARE) status = 'tired';
  }
  return { points, today: last, status };
}
