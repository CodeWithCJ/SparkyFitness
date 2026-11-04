import type { WatchComplicationConfigPayload } from '../../modules/watch-connectivity';

/**
 * Custom Apple Watch complications: the wearer defines any number of them on
 * the phone and picks which one a watch-face slot shows. A definition only says
 * *what* to show (a source, a format, a look); the numbers come from what the
 * watch already holds. Definitions are device-local (see `watchComplications`
 * in the app preferences) and travel to the watch as `complicationConfig`.
 *
 * Every string below except `name` is a wire value the watch widget switches
 * on (`targets/watch-widget/CustomComplication.swift`, and the metric keys in
 * `targets/watch/Infrastructure/CustomComplicationMetrics.swift`): rename one
 * here alone and the complication goes blank.
 */

/** The values the watch can show, by metric key. */
export const COMPLICATION_SOURCES = [
  'calories',
  'caloriesRemaining',
  'caloriesBurned',
  'protein',
  'carbs',
  'fat',
  'water',
  'steps',
  'fasting',
  'weight',
  'bodyFat',
] as const;

export type ComplicationSourceKey = (typeof COMPLICATION_SOURCES)[number];

/** A nutrient from the Goals list (`nutrient:<key>`), such as fibre or sodium. */
export const NUTRIENT_SOURCE_PREFIX = 'nutrient:';
export type ComplicationSource =
  ComplicationSourceKey | `${typeof NUTRIENT_SOURCE_PREFIX}${string}`;

/**
 * How the value is written. `value` is the amount, `percent` is the share of
 * its goal reached and `remaining` is what is left to reach the goal. The last
 * two need a goal; without one the watch falls back to `value`.
 */
export const COMPLICATION_FORMATS = ['value', 'percent', 'remaining'] as const;
export type ComplicationFormat = (typeof COMPLICATION_FORMATS)[number];

/** Colours, by what they stand for, so the watch uses its own palette. */
export const COMPLICATION_COLORS = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'water',
  'steps',
  'fasting',
  'weight',
  'neutral',
] as const;
export type ComplicationColor = (typeof COMPLICATION_COLORS)[number];

/** SF Symbols the watch can draw; a short fixed list keeps the picker readable. */
export const COMPLICATION_ICONS = [
  'flame.fill',
  'fish.fill',
  'leaf.fill',
  'drop.fill',
  'figure.walk',
  'timer',
  'scalemass.fill',
  'heart.fill',
  'bolt.fill',
  'fork.knife',
  'chart.bar.fill',
  'gauge.with.dots.needle.33percent',
] as const;
export type ComplicationIcon = (typeof COMPLICATION_ICONS)[number];

export interface WatchComplicationDefinition {
  id: string;
  /** The wearer's own name for it; shown in the watch face picker. */
  name: string;
  source: ComplicationSource;
  format: ComplicationFormat;
  /** Draw a gauge when the value has a goal. */
  gauge: boolean;
  color: ComplicationColor;
  icon: ComplicationIcon;
}

export const MAX_COMPLICATION_NAME_LENGTH = 24;

type Look = Pick<
  WatchComplicationDefinition,
  'format' | 'gauge' | 'color' | 'icon'
>;

const SOURCE_LOOKS: Record<ComplicationSourceKey, Look> = {
  calories: {
    format: 'percent',
    gauge: true,
    color: 'calories',
    icon: 'flame.fill',
  },
  caloriesRemaining: {
    format: 'value',
    gauge: false,
    color: 'calories',
    icon: 'flame.fill',
  },
  caloriesBurned: {
    format: 'value',
    gauge: false,
    color: 'calories',
    icon: 'bolt.fill',
  },
  protein: {
    format: 'percent',
    gauge: true,
    color: 'protein',
    icon: 'fish.fill',
  },
  carbs: { format: 'percent', gauge: true, color: 'carbs', icon: 'leaf.fill' },
  fat: { format: 'percent', gauge: true, color: 'fat', icon: 'drop.fill' },
  water: { format: 'percent', gauge: true, color: 'water', icon: 'drop.fill' },
  steps: {
    format: 'value',
    gauge: true,
    color: 'steps',
    icon: 'figure.walk',
  },
  fasting: { format: 'value', gauge: true, color: 'fasting', icon: 'timer' },
  weight: {
    format: 'value',
    gauge: false,
    color: 'weight',
    icon: 'scalemass.fill',
  },
  bodyFat: {
    format: 'value',
    gauge: false,
    color: 'weight',
    icon: 'scalemass.fill',
  },
};

const NUTRIENT_LOOK: Look = {
  format: 'percent',
  gauge: true,
  color: 'neutral',
  icon: 'fork.knife',
};

const SOURCE_KEYS: readonly string[] = COMPLICATION_SOURCES;

export function isComplicationSource(
  value: unknown
): value is ComplicationSource {
  if (typeof value !== 'string') return false;
  if (SOURCE_KEYS.includes(value)) return true;
  return (
    value.startsWith(NUTRIENT_SOURCE_PREFIX) &&
    value.length > NUTRIENT_SOURCE_PREFIX.length
  );
}

/** The look a new complication of this source starts with. */
export function defaultLookFor(source: ComplicationSource): Look {
  return SOURCE_LOOKS[source as ComplicationSourceKey] ?? { ...NUTRIENT_LOOK };
}

type Translator = (key: string, options: { defaultValue: string }) => string;

/**
 * Names for the starter set. Resolvers rather than key strings because the
 * i18n audit needs the literal key at the call site; a total record so a
 * source added without a name is a compile error.
 */
const SOURCE_NAMES: Record<ComplicationSourceKey, (t: Translator) => string> = {
  calories: (t) =>
    t('watchSettings.complications.sources.calories', {
      defaultValue: 'Calories',
    }),
  caloriesRemaining: (t) =>
    t('watchSettings.complications.sources.caloriesRemaining', {
      defaultValue: 'Calories left',
    }),
  caloriesBurned: (t) =>
    t('watchSettings.complications.sources.caloriesBurned', {
      defaultValue: 'Calories burned',
    }),
  protein: (t) =>
    t('watchSettings.complications.sources.protein', {
      defaultValue: 'Protein',
    }),
  carbs: (t) =>
    t('watchSettings.complications.sources.carbs', { defaultValue: 'Carbs' }),
  fat: (t) =>
    t('watchSettings.complications.sources.fat', { defaultValue: 'Fat' }),
  water: (t) =>
    t('watchSettings.complications.sources.water', { defaultValue: 'Water' }),
  steps: (t) =>
    t('watchSettings.complications.sources.steps', { defaultValue: 'Steps' }),
  fasting: (t) =>
    t('watchSettings.complications.sources.fasting', {
      defaultValue: 'Fasting',
    }),
  weight: (t) =>
    t('watchSettings.complications.sources.weight', {
      defaultValue: 'Weight',
    }),
  bodyFat: (t) =>
    t('watchSettings.complications.sources.bodyFat', {
      defaultValue: 'Body fat',
    }),
};

/** The sources a wearer who never customised anything is offered. */
const STARTER_SOURCES: readonly ComplicationSourceKey[] = [
  'calories',
  'caloriesRemaining',
  'protein',
  'carbs',
  'fat',
  'water',
  'steps',
  'fasting',
  'weight',
];

/**
 * The complications offered before the wearer has made any. The id is the
 * source, so it is the same on every launch and the watch's picker keeps
 * pointing at the same entry.
 */
export function starterComplications(
  t: Translator
): WatchComplicationDefinition[] {
  return STARTER_SOURCES.map((source) => ({
    id: `starter-${source}`,
    name: SOURCE_NAMES[source](t),
    source,
    ...SOURCE_LOOKS[source],
  }));
}

/** What the watch is sent: the wearer's own list, or the starter set until there is one. */
export function resolveComplications(
  stored: WatchComplicationDefinition[] | null,
  t: Translator
): WatchComplicationDefinition[] {
  return stored ?? starterComplications(t);
}

function oneOf<T extends string>(
  list: readonly T[],
  value: unknown,
  fallback: T
): T {
  return typeof value === 'string' &&
    (list as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * A definition from untrusted input (an import file, an older saved list).
 * Null when it cannot stand: no usable source or no name. Anything else that is
 * missing or unknown falls back to that source's own look.
 */
export function normalizeComplication(
  input: unknown,
  id: string
): WatchComplicationDefinition | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  if (!isComplicationSource(raw.source)) return null;
  const name =
    typeof raw.name === 'string'
      ? raw.name.trim().slice(0, MAX_COMPLICATION_NAME_LENGTH)
      : '';
  if (!name) return null;
  const look = defaultLookFor(raw.source);
  return {
    id,
    name,
    source: raw.source,
    format: oneOf(COMPLICATION_FORMATS, raw.format, look.format),
    gauge: typeof raw.gauge === 'boolean' ? raw.gauge : look.gauge,
    color: oneOf(COMPLICATION_COLORS, raw.color, look.color),
    icon: oneOf(COMPLICATION_ICONS, raw.icon, look.icon),
  };
}

const EXPORT_TYPE = 'sparkyfitness.watch-complications';
const EXPORT_VERSION = 1;

/** The list as a file the wearer can keep or share. Ids stay out of it. */
export function exportComplications(
  list: readonly WatchComplicationDefinition[]
): string {
  return JSON.stringify(
    {
      type: EXPORT_TYPE,
      version: EXPORT_VERSION,
      complications: list.map(
        ({ name, source, format, gauge, color, icon }) => ({
          name,
          source,
          format,
          gauge,
          color,
          icon,
        })
      ),
    },
    null,
    2
  );
}

export interface ComplicationImportResult {
  complications: WatchComplicationDefinition[];
  /** Entries that could not be used (no source or name). */
  skipped: number;
}

/**
 * Reads an exported file. Null when the text is not one of ours, so the screen
 * can say so instead of replacing the list with nothing. `makeId` mints a new
 * id for each entry, so an import never collides with what is already there.
 */
export function parseComplicationsImport(
  text: string,
  makeId: () => string
): ComplicationImportResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const file = parsed as Record<string, unknown>;
  if (file.type !== EXPORT_TYPE || !Array.isArray(file.complications)) {
    return null;
  }
  const complications: WatchComplicationDefinition[] = [];
  let skipped = 0;
  for (const entry of file.complications) {
    const definition = normalizeComplication(entry, makeId());
    if (definition) complications.push(definition);
    else skipped += 1;
  }
  return { complications, skipped };
}

/**
 * The `complicationConfig` message. `revision` (epoch ms) lets the watch keep
 * the newest list when queued copies arrive out of order.
 */
export function buildComplicationConfig(
  list: readonly WatchComplicationDefinition[],
  revision: number = Date.now()
): WatchComplicationConfigPayload {
  return {
    revision,
    definitions: list.map((d) => ({
      id: d.id,
      name: d.name,
      source: d.source,
      format: d.format,
      gauge: d.gauge,
      color: d.color,
      icon: d.icon,
    })),
  };
}
