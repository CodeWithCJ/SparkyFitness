import { addDays } from './timezone.ts';

/**
 * Deterministic reading of recent running: how often and how far, whether
 * weekly distance is climbing too fast, and whether pace is changing. Pure,
 * like `buildTrainingReview`, so the AI assistant only interprets the numbers.
 * Training load (acute against chronic) comes from `computeTrainingLoad`.
 */

export interface RunSession {
  /** The person's local day, YYYY-MM-DD. */
  day: string;
  distanceKm: number;
  durationMinutes: number;
}

export interface RunWeek {
  /**
   * First day of this block. Blocks are 7 days and the last ends today; the
   * oldest starts at the window start, so it can be longer than 7 days.
   */
  start: string;
  km: number;
  runs: number;
}

export interface RunDistanceJump {
  weekStart: string;
  fromKm: number;
  toKm: number;
  increasePercent: number;
}

export interface RunReview {
  window: { from: string; to: string; days: number };
  runs: number;
  runsPerWeek: number;
  /** False below three runs: two runs are not a trend. */
  enoughData: boolean;
  totalKm: number;
  longestRunKm: number;
  /** Weekly blocks, oldest first. */
  weeks: RunWeek[];
  /** Weeks whose distance rose more than 10% on the week before. */
  jumps: RunDistanceJump[];
  /** Seconds per km over the window; null with no run of 1 km or more. */
  paceSecPerKm: number | null;
  /** Seconds per km over the window before; null when there is none. */
  previousPaceSecPerKm: number | null;
  /** Negative is faster. Null unless both periods have a pace. */
  paceChangePercent: number | null;
  lastRunDay: string | null;
}

/** The usual guide: add no more than about 10% distance a week. */
export const RUN_WEEKLY_JUMP_PERCENT = 10;
export const RUN_REVIEW_MIN_RUNS = 3;
/** Shorter runs make a noisy pace. */
const MIN_PACE_KM = 1;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function paceOf(sessions: readonly RunSession[]): number | null {
  let km = 0;
  let minutes = 0;
  for (const run of sessions) {
    if (run.distanceKm < MIN_PACE_KM || run.durationMinutes <= 0) continue;
    km += run.distanceKm;
    minutes += run.durationMinutes;
  }
  return km > 0 ? Math.round((minutes * 60) / km) : null;
}

export function buildRunReview(
  sessions: readonly RunSession[],
  today: string,
  windowDays: number = 28
): RunReview {
  const from = addDays(today, -(windowDays - 1));
  const previousFrom = addDays(from, -windowDays);
  const valid = sessions.filter(
    (run) => run.distanceKm > 0 && run.day <= today
  );
  const inWindow = valid.filter((run) => run.day >= from);
  const previous = valid.filter(
    (run) => run.day >= previousFrom && run.day < from
  );

  const weekCount = Math.max(1, Math.floor(windowDays / 7));
  const weeks: RunWeek[] = Array.from({ length: weekCount }, (_, i) => ({
    // The oldest block starts at the window start so a window that is not a
    // multiple of 7 days leaves no run outside every block.
    start: i === 0 ? from : addDays(today, -(7 * (weekCount - i) - 1)),
    km: 0,
    runs: 0,
  }));
  for (const run of inWindow) {
    const week = [...weeks].reverse().find((w) => run.day >= w.start);
    if (!week) continue;
    week.km += run.distanceKm;
    week.runs += 1;
  }
  for (const week of weeks) week.km = round1(week.km);

  const jumps: RunDistanceJump[] = [];
  for (let i = 1; i < weeks.length; i += 1) {
    const before = weeks[i - 1]!;
    const week = weeks[i]!;
    if (before.km <= 0) continue;
    // A longer oldest block has an inflated total; it is not a week to compare.
    if (addDays(before.start, 7) !== week.start) continue;
    const increase = ((week.km - before.km) / before.km) * 100;
    if (increase > RUN_WEEKLY_JUMP_PERCENT) {
      jumps.push({
        weekStart: week.start,
        fromKm: before.km,
        toKm: week.km,
        increasePercent: Math.round(increase),
      });
    }
  }

  const paceSecPerKm = paceOf(inWindow);
  const previousPaceSecPerKm = paceOf(previous);
  const paceChangePercent =
    paceSecPerKm !== null && previousPaceSecPerKm !== null
      ? round1(
          ((paceSecPerKm - previousPaceSecPerKm) / previousPaceSecPerKm) * 100
        )
      : null;

  const lastRunDay = inWindow.reduce<string | null>(
    (latest, run) => (latest === null || run.day > latest ? run.day : latest),
    null
  );

  return {
    window: { from, to: today, days: windowDays },
    runs: inWindow.length,
    runsPerWeek: round1(inWindow.length / (windowDays / 7)),
    enoughData: inWindow.length >= RUN_REVIEW_MIN_RUNS,
    totalKm: round1(inWindow.reduce((sum, run) => sum + run.distanceKm, 0)),
    longestRunKm: round1(
      inWindow.reduce((max, run) => Math.max(max, run.distanceKm), 0)
    ),
    weeks,
    jumps,
    paceSecPerKm,
    previousPaceSecPerKm,
    paceChangePercent,
    lastRunDay,
  };
}
