/**
 * Oral care (#1862): brushing, flossing and the rest.
 *
 * One real brushing can arrive twice: a smart toothbrush writes it to Apple
 * Health and syncs in, and the person also tapped "brushed" or ran the timer.
 * As with sleep (`keepMostDetailedSleepEntries`), both rows are kept and the
 * pair is counted once when read: the synced brush counts, because its
 * duration is measured, and the Sparky-logged one is marked covered.
 */
import { addDays, compareDays } from './timezone.ts';
import type { OralCareHistoryDay } from '../schemas/api/OralCare.api.zod.ts';

export const ORAL_CARE_TYPES = [
  'brushing',
  'flossing',
  'mouthwash',
  'tongue_cleaning',
  'other',
] as const;
export type OralCareTypeId = (typeof ORAL_CARE_TYPES)[number];

/** Sessions logged in Sparky itself; anything else came from a health store. */
export const ORAL_CARE_SPARKY_PROVIDERS = ['manual', 'timer'] as const;

/** A Sparky-logged brush this close to a synced brush is the same brushing. */
export const ORAL_CARE_SAME_BRUSH_WINDOW_MS = 10 * 60 * 1000;

export const ORAL_CARE_DEFAULT_SETTINGS = {
  daily_target: 2,
  target_seconds: 120,
} as const;

export interface OralCareSessionLike {
  id: string;
  care_type: string;
  provider: string;
  start_time: string | null;
  end_time: string | null;
  duration_seconds: number | null;
}

export function isSparkyOralCareProvider(provider: string): boolean {
  return (ORAL_CARE_SPARKY_PROVIDERS as readonly string[]).includes(provider);
}

function sessionWindow(
  session: OralCareSessionLike
): { start: number; end: number } | null {
  if (!session.start_time) return null;
  const start = Date.parse(session.start_time);
  if (!Number.isFinite(start)) return null;
  let end = session.end_time ? Date.parse(session.end_time) : Number.NaN;
  if (!Number.isFinite(end)) {
    end = start + Math.max(0, session.duration_seconds ?? 0) * 1000;
  }
  return { start, end: Math.max(start, end) };
}

/** Milliseconds between two windows; 0 when they overlap. */
function gapBetween(
  a: { start: number; end: number },
  b: { start: number; end: number }
): number {
  if (a.end < b.start) return b.start - a.end;
  if (b.end < a.start) return a.start - b.end;
  return 0;
}

/**
 * Ids of Sparky-logged brushing sessions that a synced brushing session
 * already records. Each synced brush covers at most one Sparky-logged brush
 * (the nearest), so two separate taps next to one synced brush still count
 * one of them. Synced brushes never cover each other.
 */
export function oralCareSessionsCoveredBySync(
  sessions: readonly OralCareSessionLike[]
): Set<string> {
  const covered = new Set<string>();
  const brushing = sessions.filter((s) => s.care_type === 'brushing');
  const synced = brushing
    .filter((s) => !isSparkyOralCareProvider(s.provider))
    .map((s) => ({ session: s, window: sessionWindow(s) }))
    .filter(
      (
        s
      ): s is {
        session: OralCareSessionLike;
        window: { start: number; end: number };
      } => s.window !== null
    )
    .sort((a, b) => a.window.start - b.window.start);
  const sparky = brushing
    .filter((s) => isSparkyOralCareProvider(s.provider))
    .map((s) => ({ session: s, window: sessionWindow(s) }));

  for (const sync of synced) {
    let best: { id: string; gap: number } | null = null;
    for (const candidate of sparky) {
      if (!candidate.window || covered.has(candidate.session.id)) continue;
      const gap = gapBetween(sync.window, candidate.window);
      if (gap > ORAL_CARE_SAME_BRUSH_WINDOW_MS) continue;
      if (!best || gap < best.gap) best = { id: candidate.session.id, gap };
    }
    if (best) covered.add(best.id);
  }
  return covered;
}

export interface OralCareDayTotals {
  brushing_count: number;
  brushing_seconds: number;
  brushes_at_target: number;
  goal_met: boolean;
  counts_by_type: Record<OralCareTypeId, number>;
}

/** One day's counted totals; covered Sparky-logged brushes are left out. */
export function summarizeOralCareDay(
  sessions: readonly OralCareSessionLike[],
  settings: { daily_target: number; target_seconds: number }
): OralCareDayTotals {
  const covered = oralCareSessionsCoveredBySync(sessions);
  const counts_by_type: Record<OralCareTypeId, number> = {
    brushing: 0,
    flossing: 0,
    mouthwash: 0,
    tongue_cleaning: 0,
    other: 0,
  };
  let brushing_seconds = 0;
  let brushes_at_target = 0;
  for (const session of sessions) {
    if (covered.has(session.id)) continue;
    const type = (ORAL_CARE_TYPES as readonly string[]).includes(
      session.care_type
    )
      ? (session.care_type as OralCareTypeId)
      : 'other';
    counts_by_type[type] += 1;
    if (type === 'brushing') {
      const seconds = session.duration_seconds ?? 0;
      brushing_seconds += seconds;
      if (seconds >= settings.target_seconds) brushes_at_target += 1;
    }
  }
  const brushing_count = counts_by_type.brushing;
  return {
    brushing_count,
    brushing_seconds,
    brushes_at_target,
    goal_met: brushing_count >= settings.daily_target,
    counts_by_type,
  };
}

/**
 * Days in a row the brushing goal was met, ending today. As with medication
 * adherence, today does not break the streak while it is still open: when
 * today's goal is not met yet, counting starts from yesterday.
 * `brushingByDay` maps a day (YYYY-MM-DD) to its counted brushes.
 */
export function computeOralCareStreak(
  brushingByDay: ReadonlyMap<string, number>,
  dailyTarget: number,
  today: string
): { current: number; best: number } {
  const met = (day: string) => (brushingByDay.get(day) ?? 0) >= dailyTarget;

  let current = 0;
  let day = met(today) ? today : addDays(today, -1);
  while (met(day)) {
    current += 1;
    day = addDays(day, -1);
  }

  const days = [...brushingByDay.keys()]
    .filter((d) => compareDays(d, today) <= 0)
    .sort(compareDays);
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const d of days) {
    if (!met(d)) {
      run = 0;
      previous = d;
      continue;
    }
    run =
      previous !== null && addDays(previous, 1) === d && run > 0 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = d;
  }
  return { current, best: Math.max(best, current) };
}

/** Summary numbers for a range of history days; the averages are over every day of the range. */
export function summarizeOralCareRange(days: readonly OralCareHistoryDay[]) {
  const goalDays = days.filter((d) => d.goal_met).length;
  const brushes = days.reduce((sum, d) => sum + d.brushing_count, 0);
  const seconds = days.reduce((sum, d) => sum + d.brushing_seconds, 0);
  const other = days.reduce((sum, d) => sum + d.other_count, 0);
  return {
    totalDays: days.length,
    goalDays,
    goalPercent: days.length ? Math.round((goalDays / days.length) * 100) : 0,
    brushesPerDay: days.length ? brushes / days.length : 0,
    minutesPerDay: days.length ? seconds / 60 / days.length : 0,
    other,
  };
}

/** Which quarter of the mouth the timer is on (0 to 3), or 4 once past the target. */
export function brushingQuadrant(
  elapsedSeconds: number,
  targetSeconds: number
): number {
  if (targetSeconds <= 0 || elapsedSeconds >= targetSeconds) return 4;
  return Math.min(3, Math.floor((elapsedSeconds / targetSeconds) * 4));
}
