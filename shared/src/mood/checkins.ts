import type {
  MoodCheckinCreateBody,
  MoodCheckinUpdateBody,
} from '../schemas/api/Mood.api.zod.ts';
import {
  instantForDay,
  instantHourMinute,
  localDateTimeToUtc,
} from '../utils/timezone.ts';
import type { MoodRowLike } from './index.ts';

/** The slice of a stored check-in the composer helpers read. */
export interface MoodCheckinRow extends MoodRowLike {
  id: string;
  notes: string | null;
  mood_tags: string[] | null;
  entry_timestamp: string;
}

/** What the check-in composer holds. `time` is 'HH:mm' in the user's zone. */
export interface CheckinDraft {
  mood: number | null;
  energy: number | null;
  focus: number | null;
  notes: string;
  tags: string[];
  time: string;
}

const hasText = (value: string) => /\S/.test(value);

const cleanTags = (tags: string[]) => tags.filter(hasText);

const pad2 = (n: number) => String(n).padStart(2, '0');

/** An instant's wall-clock 'HH:mm' in `tz`; seconds are dropped. */
const localTime = (ts: Date | string, tz: string) => {
  const { hour, minute } = instantHourMinute(ts, tz);
  return `${pad2(hour)}:${pad2(minute)}`;
};

const instantOf = (day: string, time: string, tz: string) =>
  localDateTimeToUtc(`${day}T${time}`, tz).toISOString();

const sameTags = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false;
  const sortedB = [...b].sort();
  return [...a].sort().every((tag, i) => tag === sortedB[i]);
};

/**
 * Whether a draft is worth saving: a mood, energy, focus, a note with a
 * non-space character, or a tag with one. Mirrors the server's hasMoodContent.
 */
export function hasCheckinContent(d: Omit<CheckinDraft, 'time'>): boolean {
  return (
    d.mood !== null ||
    d.energy !== null ||
    d.focus !== null ||
    hasText(d.notes) ||
    d.tags.some(hasText)
  );
}

/**
 * The time a new check-in starts at: now when `day` is today in `tz`,
 * otherwise noon, which is where the server places a check-in sent without a
 * time (`instantForDay`).
 */
export function defaultCheckinTime(
  day: string,
  tz: string,
  now: Date = new Date()
): string {
  return localTime(instantForDay(day, tz, now), tz);
}

export function draftFromEntry(
  entry: MoodCheckinRow,
  tz: string
): CheckinDraft {
  return {
    mood: entry.mood_value,
    energy: entry.energy_value ?? null,
    focus: entry.focus_value ?? null,
    notes: entry.notes ?? '',
    tags: entry.mood_tags ?? [],
    time: localTime(entry.entry_timestamp, tz),
  };
}

/**
 * The POST body for a new check-in on `day`. Empty fields are left out, notes
 * are trimmed and blank tags dropped. The day is always sent with the instant,
 * so a late-evening check-in stays on the day it was logged for.
 */
export function buildCheckinCreateBody(
  d: CheckinDraft,
  day: string,
  tz: string
): MoodCheckinCreateBody {
  const notes = d.notes.trim();
  const tags = cleanTags(d.tags);
  return {
    ...(d.mood !== null && { mood_value: d.mood }),
    ...(d.energy !== null && { energy_value: d.energy }),
    ...(d.focus !== null && { focus_value: d.focus }),
    ...(notes && { notes }),
    ...(tags.length > 0 && { mood_tags: tags }),
    entry_date: day,
    entry_timestamp: instantOf(day, d.time, tz),
  };
}

/**
 * The PUT body for an edit: only what changed, with null for a cleared field.
 * The time is compared as the 'HH:mm' the editor shows, so an untouched time
 * never moves the check-in (its stored seconds included); only a changed time
 * sends a new instant, together with its day.
 */
export function buildCheckinUpdateBody(
  original: MoodCheckinRow,
  d: CheckinDraft,
  day: string,
  tz: string
): MoodCheckinUpdateBody {
  const body: MoodCheckinUpdateBody = {};
  if (d.mood !== original.mood_value) body.mood_value = d.mood;
  if (d.energy !== (original.energy_value ?? null))
    body.energy_value = d.energy;
  if (d.focus !== (original.focus_value ?? null)) body.focus_value = d.focus;

  const notes = d.notes.trim();
  if (notes !== (original.notes ?? '').trim()) body.notes = notes || null;

  const tags = cleanTags(d.tags);
  if (!sameTags(tags, cleanTags(original.mood_tags ?? []))) {
    body.mood_tags = tags.length > 0 ? tags : null;
  }

  if (d.time !== localTime(original.entry_timestamp, tz)) {
    body.entry_timestamp = instantOf(day, d.time, tz);
    body.entry_date = day;
  }
  return body;
}

/** Whether an edit changes anything the update would send. */
export function checkinEditChanged(
  original: MoodCheckinRow,
  d: CheckinDraft,
  day: string,
  tz: string
): boolean {
  const body = buildCheckinUpdateBody(original, d, day, tz);
  return Object.keys(body).length > 0;
}
