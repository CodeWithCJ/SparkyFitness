// Shared, app-wide mood model. Mood is stored in `mood_entries` as a numeric
// `mood_value` (0-100 intensity, kept for Garmin sync / analytics / chatbot) plus
// a multi-select `mood_tags` array. Custom moods live in `user_custom_moods`
// (mirrors user_custom_symptoms). Framework-free so server + web can share it.

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
    name: "sad",
    displayName: "Sad",
    emoji: "😢",
    icon: "mood-calm",
    color: "sky",
    band: 15,
  },
  {
    name: "angry",
    displayName: "Angry",
    emoji: "😠",
    icon: "mood-irritable",
    color: "period",
    band: 25,
  },
  {
    name: "worried",
    displayName: "Worried",
    emoji: "😟",
    icon: "mood-irritable",
    color: "lavender",
    band: 35,
  },
  {
    name: "neutral",
    displayName: "Neutral",
    emoji: "😐",
    icon: "mood-calm",
    color: "neutral",
    band: 45,
  },
  {
    name: "thoughtful",
    displayName: "Thoughtful",
    emoji: "🤔",
    icon: "mood-calm",
    color: "sky",
    band: 55,
  },
  {
    name: "calm",
    displayName: "Calm",
    emoji: "🙂",
    icon: "mood-calm",
    color: "green",
    band: 65,
  },
  {
    name: "confident",
    displayName: "Confident",
    emoji: "😎",
    icon: "mood-happy",
    color: "amber",
    band: 75,
  },
  {
    name: "happy",
    displayName: "Happy",
    emoji: "😀",
    icon: "mood-happy",
    color: "amber",
    band: 85,
  },
  {
    name: "excited",
    displayName: "Excited",
    emoji: "😍",
    icon: "mood-happy",
    color: "amber",
    band: 100,
  },
  // Descriptive tags (no band) — chosen alongside the intensity rating.
  {
    name: "energetic",
    displayName: "Energetic",
    emoji: "⚡",
    icon: "mood-happy",
    color: "amber",
  },
  {
    name: "sensitive",
    displayName: "Sensitive",
    emoji: "🥺",
    icon: "mood-calm",
    color: "sky",
  },
  {
    name: "tired",
    displayName: "Tired",
    emoji: "😴",
    icon: "mood-calm",
    color: "sky",
  },
  {
    name: "low",
    displayName: "Low energy",
    emoji: "🔋",
    icon: "mood-calm",
    color: "sky",
  },
  {
    name: "anxious",
    displayName: "Anxious",
    emoji: "😰",
    icon: "mood-irritable",
    color: "lavender",
  },
  {
    name: "irritable",
    displayName: "Irritable",
    emoji: "😤",
    icon: "mood-irritable",
    color: "period",
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
  return "excited";
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
        (m) => m.name === tag,
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
