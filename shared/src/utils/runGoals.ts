import { classifyActivitySport } from './activitySport.ts';
import { weekStartOf } from './trainingConsistency.ts';
import { addDays, daysBetween } from './timezone.ts';
import type { RunGoalProgress } from '../schemas/api/RunGoals.api.zod.ts';

/** A logged exercise entry, as much of it as the weekly total needs. */
export interface RunGoalEntry {
  /** YYYY-MM-DD */
  day: string;
  exerciseName?: string | null;
  category?: string | null;
  notes?: string | null;
  /** Kilometres; null when the entry has no distance. */
  distanceKm?: number | null;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * Where the person stands against their running goals on `today`: the
 * kilometres run so far this week (running only — walks, rides and gym cardio
 * do not count, nor do entries with no distance), the share of the weekly
 * target, what each remaining day needs to reach it, and the days to the race.
 */
export function buildRunGoalProgress(
  entries: RunGoalEntry[],
  today: string,
  firstDayOfWeek: number,
  goals: { weeklyDistanceKm: number | null; raceDate: string | null }
): RunGoalProgress {
  const weekStart = weekStartOf(today, firstDayOfWeek);
  const weekEnd = addDays(weekStart, 6);
  let meters = 0;
  let runCount = 0;
  for (const entry of entries) {
    if (entry.day < weekStart || entry.day > today) continue;
    if (!entry.distanceKm || entry.distanceKm <= 0) continue;
    const { sport } = classifyActivitySport({
      exerciseName: entry.exerciseName,
      category: entry.category,
      notes: entry.notes,
    });
    if (sport !== 'running') continue;
    meters += entry.distanceKm * 1000;
    runCount += 1;
  }
  const weekDistanceKm = round1(meters / 1000);
  const daysLeft = daysBetween(today, weekEnd) + 1;
  const target = goals.weeklyDistanceKm;
  const remaining =
    target === null ? null : Math.max(0, target - meters / 1000);
  return {
    week_start: weekStart,
    week_end: weekEnd,
    week_distance_km: weekDistanceKm,
    run_count: runCount,
    weekly_percent:
      target === null ? null : Math.round((meters / 1000 / target) * 100),
    days_left_in_week: daysLeft,
    daily_needed_km:
      remaining === null || remaining === 0
        ? null
        : round1(remaining / daysLeft),
    race_days_left:
      goals.raceDate === null ? null : daysBetween(today, goals.raceDate),
  };
}
