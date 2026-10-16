import { addDays, daysBetween } from "./timezone.ts";

/** One finished cardio session, as far as load is concerned. */
export interface LoadSession {
  /** The person's local day, YYYY-MM-DD. */
  day: string;
  durationMinutes: number;
  avgHeartRate: number | null;
}

/** Used when the person's age is not known. */
export const DEFAULT_MAX_HEART_RATE = 190;
/** Sessions longer than this are treated as this long (a forgotten stop). */
const MAX_SESSION_MINUTES = 600;
/** Load points per minute for a session with no heart rate. */
const UNKNOWN_HEART_RATE_WEIGHT = 2;
/** Days of history before the ratio means anything. */
export const MIN_HISTORY_DAYS = 21;
export const LOAD_WEEKS = 4;

export type LoadStatus =
  | "noData"
  | "learning"
  | "low"
  | "steady"
  | "high"
  | "spike";

export type RecoveryHint = "ready" | "ok" | "takeRest";

/** 220 - age, kept to a believable range; the default without an age. */
export function estimateMaxHeartRate(age: number | null | undefined): number {
  if (age == null || !Number.isFinite(age) || age < 10 || age > 100) {
    return DEFAULT_MAX_HEART_RATE;
  }
  return Math.min(210, Math.max(150, 220 - Math.round(age)));
}

/**
 * Load points for one session: minutes weighted by how hard the heart worked
 * (1 under 60% of the maximum, up to 5 above 90%, the Edwards zone method). A
 * session without a heart rate counts as moderate, so a run from a phone with
 * no watch still counts.
 */
export function sessionLoad(
  session: Pick<LoadSession, "durationMinutes" | "avgHeartRate">,
  maxHeartRate: number,
): number {
  const minutes = Math.min(
    MAX_SESSION_MINUTES,
    Math.max(0, session.durationMinutes),
  );
  const bpm = session.avgHeartRate;
  if (bpm == null || !Number.isFinite(bpm) || bpm <= 0) {
    return minutes * UNKNOWN_HEART_RATE_WEIGHT;
  }
  const share = bpm / maxHeartRate;
  const weight =
    share < 0.6 ? 1 : share < 0.7 ? 2 : share < 0.8 ? 3 : share < 0.9 ? 4 : 5;
  return minutes * weight;
}

export interface TrainingLoad {
  /** Load of each of the last four 7-day windows, oldest first; the last ends today. */
  weeks: { start: string; load: number }[];
  /** The last seven days. */
  acute: number;
  /** The average week over the last four. */
  chronic: number;
  /** acute / chronic; null while either is missing. */
  ratio: number | null;
  status: LoadStatus;
  /** Whole days since the last session; null with none in the window. */
  restDays: number | null;
  recovery: RecoveryHint;
}

/**
 * Acute (7 days) against chronic (4-week average) load, the usual guide to
 * ramping up too fast: a ratio of 0.8 to 1.3 is steady, above 1.5 is a spike
 * where injury risk climbs. Pure; `today` and the days are local YYYY-MM-DD.
 */
export function computeTrainingLoad(
  sessions: readonly LoadSession[],
  today: string,
  maxHeartRate: number = DEFAULT_MAX_HEART_RATE,
): TrainingLoad {
  const windowDays = LOAD_WEEKS * 7;
  const oldest = addDays(today, -(windowDays - 1));
  const weeks = Array.from({ length: LOAD_WEEKS }, (_, i) => ({
    start: addDays(today, -(7 * (LOAD_WEEKS - i) - 1)),
    load: 0,
  }));
  let earliest: string | null = null;
  let latest: string | null = null;
  for (const session of sessions) {
    if (session.day < oldest || session.day > today) continue;
    const slot = Math.floor(daysBetween(oldest, session.day) / 7);
    const week = weeks[slot];
    if (!week) continue;
    week.load += sessionLoad(session, maxHeartRate);
    if (earliest === null || session.day < earliest) earliest = session.day;
    if (latest === null || session.day > latest) latest = session.day;
  }
  for (const week of weeks) week.load = Math.round(week.load);

  const acute = weeks[LOAD_WEEKS - 1]?.load ?? 0;
  const chronic = weeks.reduce((sum, w) => sum + w.load, 0) / LOAD_WEEKS;
  const ratio = chronic > 0 ? acute / chronic : null;
  const restDays = latest === null ? null : daysBetween(latest, today);

  let status: LoadStatus;
  if (earliest === null) status = "noData";
  else if (daysBetween(earliest, today) < MIN_HISTORY_DAYS) status = "learning";
  else if (ratio === null || ratio < 0.8) status = "low";
  else if (ratio <= 1.3) status = "steady";
  else if (ratio <= 1.5) status = "high";
  else status = "spike";

  const recovery: RecoveryHint =
    (status === "high" || status === "spike") && (restDays ?? 9) <= 1
      ? "takeRest"
      : status === "low" && (restDays ?? 0) >= 2
        ? "ready"
        : "ok";

  return {
    weeks,
    acute,
    chronic: Math.round(chronic),
    ratio: ratio === null ? null : Math.round(ratio * 100) / 100,
    status,
    restDays,
    recovery,
  };
}
