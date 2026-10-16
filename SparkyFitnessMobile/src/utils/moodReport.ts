import { moodByName, moodValueToTag } from '@workspace/shared';
import { average } from './mathUtils';
import { addDays, weekdayOfDay } from './dateUtils';
import type { MoodEntry } from '../types/mood';

export type MoodDayPoint = {
  day: string;
  /** Mean 0-100 mood for the day; 0 when nothing was logged. */
  value: number;
  entries: number;
};

export type MoodTagCount = { tag: string; count: number };

export interface MoodReport {
  days: MoodDayPoint[];
  loggedDays: number;
  averageValue: number | null;
  topTags: MoodTagCount[];
  /** The days with the highest and lowest daily mood; null when fewer than two days logged. */
  best: MoodDayPoint | null;
  lowest: MoodDayPoint | null;
  /** Mean daily mood per weekday (0 = Sunday), only weekdays that have data. */
  weekdayAverages: { weekday: number; value: number }[];
}

/** The emoji and display name a 0-100 mood value stands for, per the shared band model. */
export const moodForValue = (
  value: number
): { emoji: string; name: string } | null => {
  const def = moodByName(moodValueToTag(value));
  return def ? { emoji: def.emoji, name: def.displayName } : null;
};

/** Built-in moods show as "emoji name"; a user's own mood tag stays literal. */
export const moodTagLabel = (tag: string): string => {
  const def = moodByName(tag);
  return def ? `${def.emoji} ${def.displayName}` : tag;
};

/**
 * One point per day in the window, so a quiet day reads as a gap rather than being
 * skipped, plus the headline average and the most-chosen mood tags.
 */
export function buildMoodReport(
  entries: MoodEntry[],
  startDate: string,
  days: number,
  topTagLimit = 5
): MoodReport {
  const byDay = new Map<string, MoodEntry[]>();
  for (const entry of entries) {
    const list = byDay.get(entry.entry_date);
    if (list) list.push(entry);
    else byDay.set(entry.entry_date, [entry]);
  }

  const points: MoodDayPoint[] = [];
  const dailyAverages: number[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(startDate, i);
    const dayEntries = byDay.get(day) ?? [];
    const mean = average(dayEntries.map((entry) => entry.mood_value));
    if (mean !== null) dailyAverages.push(mean);
    points.push({ day, value: mean ?? 0, entries: dayEntries.length });
  }

  const tagCounts = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of entry.mood_tags ?? []) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const topTags = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, topTagLimit);

  const logged = points.filter((point) => point.entries > 0);
  const ranked = [...logged].sort((a, b) => a.value - b.value);
  const byWeekday = new Map<number, number[]>();
  for (const point of logged) {
    const weekday = weekdayOfDay(point.day);
    const list = byWeekday.get(weekday) ?? [];
    list.push(point.value);
    byWeekday.set(weekday, list);
  }
  const weekdayAverages = [...byWeekday.entries()]
    .map(([weekday, values]) => ({ weekday, value: average(values) ?? 0 }))
    .sort((a, b) => a.weekday - b.weekday);

  return {
    best: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    lowest: ranked.length > 1 ? ranked[0] : null,
    weekdayAverages,
    days: points,
    loggedDays: dailyAverages.length,
    averageValue: average(dailyAverages),
    topTags,
  };
}
