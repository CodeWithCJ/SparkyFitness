import type { SymptomEpisodeContext } from '../schemas/api/Symptoms.api.zod.ts';

/** The fields of an entry the report calculations read. */
export interface MetricsEntry {
  entry_date: string;
  logged_at: string;
  started_at: string | null;
  ended_at: string | null;
  source: string;
  triggers: string[];
  treatments: Array<{ kind: string }>;
}

export interface SymptomMetrics {
  /** Days with at least one logged entry (cycle-hub entries are not counted). */
  symptomDays: number;
  episodes: number;
  /** Days marked symptom-free that have no entry of their own. */
  symptomFreeDays: number;
  /** Mean length of the episodes that have ended, in minutes; null if none. */
  averageEpisodeMinutes: number | null;
  /** Days on which a medication was taken as a treatment. */
  acuteMedicationDays: number;
  triggerCounts: Array<{ label: string; count: number }>;
  /** Entries by hour of day, 0 to 23. */
  entriesByHour: number[];
}

const countedEntries = <T extends { source: string }>(entries: T[]): T[] =>
  entries.filter((e) => e.source !== 'cycle');

/**
 * Headline numbers for a set of entries. `hourOf` maps an instant to the user's
 * local hour, so the time-of-day chart follows their timezone.
 */
export function computeSymptomMetrics(
  entries: MetricsEntry[],
  symptomFreeDays: string[],
  hourOf: (iso: string) => number
): SymptomMetrics {
  const counted = countedEntries(entries);
  const entryDays = new Set(counted.map((e) => e.entry_date));

  const episodes = counted.filter((e) => e.started_at != null);
  const ended = episodes.filter((e) => e.ended_at != null);
  const durations = ended.map((e) =>
    Math.max(
      0,
      Math.round(
        (new Date(e.ended_at as string).getTime() -
          new Date(e.started_at as string).getTime()) /
          60000
      )
    )
  );

  const triggers = new Map<string, number>();
  for (const e of counted) {
    for (const label of new Set(e.triggers)) {
      triggers.set(label, (triggers.get(label) ?? 0) + 1);
    }
  }

  const entriesByHour = Array.from({ length: 24 }, () => 0);
  for (const e of counted) {
    const hour = hourOf(e.started_at ?? e.logged_at);
    if (hour >= 0 && hour < 24)
      entriesByHour[hour] = (entriesByHour[hour] ?? 0) + 1;
  }

  return {
    symptomDays: entryDays.size,
    episodes: episodes.length,
    symptomFreeDays: new Set(symptomFreeDays.filter((d) => !entryDays.has(d)))
      .size,
    averageEpisodeMinutes:
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null,
    acuteMedicationDays: new Set(
      counted
        .filter((e) => e.treatments.some((t) => t.kind === 'medication'))
        .map((e) => e.entry_date)
    ).size,
    triggerCounts: [...triggers.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    entriesByHour,
  };
}

/**
 * Taking an acute medication on this many days in a month is worth raising with
 * a doctor. It is a prompt, not a diagnosis, so the UI words it that way.
 */
export const ACUTE_MEDICATION_DAYS_CAUTION = 10;

/** Fewer episodes than this and a pattern is not worth reading into. */
export const MIN_EPISODES_FOR_PATTERNS = 7;

const SHORT_SLEEP_MINUTES = 6 * 60;
const LOW_WATER_ML = 1500;
const ALCOHOL =
  /wine|beer|lager|cider|vodka|whisk|\brum\b|\bgin\b|cocktail|liquor|alcohol/i;
const CAFFEINE =
  /coffee|espresso|latte|cappuccino|mocha|energy drink|\bcola\b/i;

export type FactorKey =
  | 'short_sleep'
  | 'low_water'
  | 'alcohol'
  | 'caffeine'
  | 'menstrual_phase'
  | `trigger:${string}`;

export interface FactorResult {
  key: FactorKey;
  /** Episodes where the factor was present. */
  count: number;
  /** Episodes there was any data to judge the factor by. */
  known: number;
}

/**
 * How often each factor was present before the given episodes: the triggers the
 * user picked, plus things read from the diary (a short night, little water,
 * alcohol or caffeine in the food names, the menstrual phase). This counts
 * episodes; it does not compare against days without one, so it describes what
 * happened and does not claim a cause.
 */
export function analyzeEpisodeFactors(
  episodes: Array<{ id: string; triggers: string[] }>,
  contexts: Record<string, SymptomEpisodeContext | undefined>
): FactorResult[] {
  const tally = new Map<FactorKey, { count: number; known: number }>();
  const bump = (key: FactorKey, known: boolean, present: boolean) => {
    const cur = tally.get(key) ?? { count: 0, known: 0 };
    if (known) cur.known += 1;
    if (present) cur.count += 1;
    tally.set(key, cur);
  };

  for (const episode of episodes) {
    for (const label of new Set(episode.triggers)) {
      bump(`trigger:${label}`, true, true);
    }
    const ctx = contexts[episode.id];
    if (!ctx) continue;

    if (ctx.sleep)
      bump('short_sleep', true, ctx.sleep.minutes < SHORT_SLEEP_MINUTES);
    const before = ctx.days.find((d) => d.label === 'day_before');
    if (before?.water_ml != null) {
      bump('low_water', true, before.water_ml < LOW_WATER_ML);
    }
    const foods = ctx.days.flatMap((d) => d.foods);
    if (ctx.days.some((d) => d.foods.length > 0)) {
      bump(
        'alcohol',
        true,
        foods.some((f) => ALCOHOL.test(f))
      );
      bump(
        'caffeine',
        true,
        foods.some((f) => CAFFEINE.test(f))
      );
    }
    if (ctx.cycle)
      bump('menstrual_phase', true, ctx.cycle.phase === 'menstrual');
  }

  return [...tally.entries()]
    .filter(([, v]) => v.count > 0)
    .map(([key, v]) => ({ key, count: v.count, known: v.known }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}
