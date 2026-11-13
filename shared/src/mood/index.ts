// Shared, app-wide mood model. Mood is stored in `mood_entries` as a numeric
// `mood_value` (0-100 intensity, kept for Garmin sync / analytics / chatbot) plus
// a multi-select `mood_tags` array. Custom moods live in `user_custom_moods`
// (mirrors user_custom_symptoms). Framework-free so server + web can share it.
import type { MoodEntries } from '../schemas/database/MoodEntries.zod.ts';

export interface MoodDef {
  name: string; // stable slug
  displayName: string;
  emoji: string;
  icon: string; // domain-icon id (reuses cycle mood icons where sensible)
  color: string; // token
  /** Upper bound (inclusive) of the 0-100 value band this tag represents, if any. */
  band?: number;
}

// The nine banded moods map 1:1 to the legacy 0-100 MoodMeter scale (used for
// backfill + deriving a tag from synced numeric moods). The remaining tags are
// descriptive-only (no value band) and are chosen alongside the rating.
export const BUILT_IN_MOODS: readonly MoodDef[] = [
  {
    name: 'sad',
    displayName: 'Sad',
    emoji: '😢',
    icon: 'mood-calm',
    color: 'sky',
    band: 15,
  },
  {
    name: 'angry',
    displayName: 'Angry',
    emoji: '😠',
    icon: 'mood-irritable',
    color: 'period',
    band: 25,
  },
  {
    name: 'worried',
    displayName: 'Worried',
    emoji: '😟',
    icon: 'mood-irritable',
    color: 'lavender',
    band: 35,
  },
  {
    name: 'neutral',
    displayName: 'Neutral',
    emoji: '😐',
    icon: 'mood-calm',
    color: 'neutral',
    band: 45,
  },
  {
    name: 'thoughtful',
    displayName: 'Thoughtful',
    emoji: '🤔',
    icon: 'mood-calm',
    color: 'sky',
    band: 55,
  },
  {
    name: 'calm',
    displayName: 'Calm',
    emoji: '🙂',
    icon: 'mood-calm',
    color: 'green',
    band: 65,
  },
  {
    name: 'confident',
    displayName: 'Confident',
    emoji: '😎',
    icon: 'mood-happy',
    color: 'amber',
    band: 75,
  },
  {
    name: 'happy',
    displayName: 'Happy',
    emoji: '😀',
    icon: 'mood-happy',
    color: 'amber',
    band: 85,
  },
  {
    name: 'excited',
    displayName: 'Excited',
    emoji: '😍',
    icon: 'mood-happy',
    color: 'amber',
    band: 100,
  },
  // Descriptive tags (no band) — chosen alongside the intensity rating.
  {
    name: 'energetic',
    displayName: 'Energetic',
    emoji: '⚡',
    icon: 'mood-happy',
    color: 'amber',
  },
  {
    name: 'sensitive',
    displayName: 'Sensitive',
    emoji: '🥺',
    icon: 'mood-calm',
    color: 'sky',
  },
  {
    name: 'tired',
    displayName: 'Tired',
    emoji: '😴',
    icon: 'mood-calm',
    color: 'sky',
  },
  {
    name: 'low',
    displayName: 'Low energy',
    emoji: '🔋',
    icon: 'mood-calm',
    color: 'sky',
  },
  {
    name: 'anxious',
    displayName: 'Anxious',
    emoji: '😰',
    icon: 'mood-irritable',
    color: 'lavender',
  },
  {
    name: 'irritable',
    displayName: 'Irritable',
    emoji: '😤',
    icon: 'mood-irritable',
    color: 'period',
  },
] as const;

export interface SharedUserCustomMood {
  id: string;
  user_id: string;
  name: string;
  display_name: string | null;
  icon: string | null;
  color: string | null;
}

export interface SharedMoodEntry {
  id?: string;
  user_id?: string;
  mood_value: number; // 0-100 intensity (kept for interop)
  mood_tags: string[];
  notes?: string | null;
  entry_date: string; // YYYY-MM-DD
}

/**
 * Maps a 0-100 mood value to a single banded tag. Used to backfill legacy
 * `mood_value` rows and to derive a tag from device-synced numeric moods.
 */
export function moodValueToTag(value: number): string {
  for (const m of BUILT_IN_MOODS) {
    if (m.band != null && value <= m.band) return m.name;
  }
  return 'excited';
}

/** `moodValueToTag` for a value that may be absent (a check-in with no mood). */
export function moodTagForValue(
  value: number | null | undefined
): string | null {
  return value == null ? null : moodValueToTag(value);
}

/**
 * Representative 0-100 value for a set of tags (first banded tag wins). Used only
 * when a client sends tags without an explicit rating; the UI normally sets both.
 */
export function representativeMoodValue(tags: string[], fallback = 50): number {
  for (const tag of tags) {
    const def = BUILT_IN_MOODS.find((m) => m.name === tag && m.band != null);
    if (def) {
      const idx = BUILT_IN_MOODS.filter((m) => m.band != null).findIndex(
        (m) => m.name === tag
      );
      // Band midpoint: halfway between the previous band and this one.
      const banded = BUILT_IN_MOODS.filter((m) => m.band != null);
      const prev = idx > 0 ? banded[idx - 1]!.band! : 0;
      return Math.round((prev + def.band!) / 2);
    }
  }
  return fallback;
}

export function moodByName(name: string): MoodDef | null {
  return BUILT_IN_MOODS.find((m) => m.name === name) ?? null;
}

/** The range `mood_entries.mood_value` carries, and what clients may store. */
export const MOOD_VALUE_MIN = 10;
export const MOOD_VALUE_MAX = 100;

/**
 * A client-supplied mood value as the column can hold it, or null when it is
 * not a number at all.
 *
 * Bringing it into range rather than rejecting it is deliberate: the column is
 * `integer NOT NULL` on a 10-100 scale, but the value arrives from whichever
 * build of a client happens to be running, and a stale one that sends a 9
 * should still be able to save its day. Clamping keeps it in the band it meant
 * — a 9 was Sad and 10 is Sad — where a rejection would just lose the entry.
 */
export function clampStoredMoodValue(value: unknown): number | null {
  // Deliberately not a bare `Number(value)`: that reads null, '', false and []
  // as 0, which would clamp each of them to a real mood the caller never sent.
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(numeric)) return null;
  return Math.min(
    MOOD_VALUE_MAX,
    Math.max(MOOD_VALUE_MIN, Math.round(numeric))
  );
}

/** The gap between two neighbouring faces' values on the mood pickers. */
export const MOOD_FACE_STEP = 10;

/**
 * The value a picker writes for one of the nine banded faces: Sad 10, Angry 20,
 * up to Excited 90. It is the band midpoint snapped onto the face grid, since
 * the two end midpoints (8 and 93) sit off it. Every picker writes these, so a
 * day averaged over check-ins from web and mobile lands in the same band. A tag
 * with no band gives 50, like `representativeMoodValue`.
 */
export function moodFaceValue(name: string): number {
  const midpoint = representativeMoodValue([name]);
  return (
    MOOD_VALUE_MIN +
    Math.round((midpoint - MOOD_VALUE_MIN) / MOOD_FACE_STEP) * MOOD_FACE_STEP
  );
}

/**
 * The 1-10 score a conversation talks in ("I'm an 8 today"), as a stored mood
 * value. The chatbot asks for that scale because it reads naturally out loud,
 * but `mood_value` is a 10-100 field, and an 8 stored verbatim lands in the
 * `sad` band along with every other score the chat can produce.
 */
export function chatScoreToMoodValue(score: number): number {
  const clamped = Math.min(10, Math.max(1, Math.round(score)));
  return clamped * 10;
}

/** A stored mood value as the 1-10 score the chatbot speaks in. */
export function moodValueToChatScore(value: number): number {
  return Math.min(10, Math.max(1, Math.round(value / 10)));
}

/** Where a mood row came from, as the `mood_entries` schema defines it. */
export type MoodRowSource = MoodEntries['source'];

/** The slice of a mood row the per-day helpers read. */
export interface MoodRowLike {
  entry_date: string; // YYYY-MM-DD
  mood_value: number | null;
  energy_value?: number | null;
  focus_value?: number | null;
  source: MoodRowSource;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function nonNull(values: (number | null | undefined)[]): number[] {
  return values.filter((v): v is number => v != null);
}

/**
 * A day's manual check-ins in one line: mood is the rounded mean, energy and
 * focus the mean to one decimal, each over the rows that have a value.
 * Derived (garmin/import) rows are not check-ins and are ignored.
 */
export function summarizeCheckins(rows: MoodRowLike[]): {
  mood: number | null;
  energy: number | null;
  focus: number | null;
  count: number;
} {
  const manual = rows.filter((r) => r.source === 'manual');
  const oneDecimal = (v: number | null) =>
    v == null ? null : Math.round(v * 10) / 10;
  const mood = mean(nonNull(manual.map((r) => r.mood_value)));
  return {
    mood: mood == null ? null : Math.round(mood),
    energy: oneDecimal(mean(nonNull(manual.map((r) => r.energy_value)))),
    focus: oneDecimal(mean(nonNull(manual.map((r) => r.focus_value)))),
    count: manual.length,
  };
}

function max(values: number[]): number | null {
  return values.length === 0 ? null : Math.max(...values);
}

/**
 * One mood per day for charting: the rounded mean of the day's manual moods,
 * else the highest garmin mood, else the highest import mood. Days with no mood
 * are omitted; ascending by date. Mirrors the server's DAILY_MOOD_VALUE_SQL,
 * which takes AVG over manual rows and MAX(...) FILTER over garmin and import.
 */
export function dailyMoodSeries(
  rows: MoodRowLike[]
): { date: string; mood_value: number }[] {
  const bySource = new Map<string, Record<MoodRowSource, number[]>>();
  for (const r of rows) {
    if (r.mood_value == null) continue;
    let day = bySource.get(r.entry_date);
    if (!day) {
      day = { manual: [], garmin: [], import: [] };
      bySource.set(r.entry_date, day);
    }
    day[r.source].push(r.mood_value);
  }
  const series: { date: string; mood_value: number }[] = [];
  for (const [date, day] of bySource) {
    const value = mean(day.manual) ?? max(day.garmin) ?? max(day.import);
    if (value != null) series.push({ date, mood_value: Math.round(value) });
  }
  return series.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  );
}
