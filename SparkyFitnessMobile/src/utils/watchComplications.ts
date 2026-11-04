import type { WatchComplicationConfigPayload } from '../../modules/watch-connectivity';
import { getNutrientLabel } from '../constants/nutrients';

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
  'sleepDuration',
  'sleepScore',
  'deepSleep',
  'remSleep',
  'lightSleep',
  'timeInBed',
  'restingHeartRate',
  'hrv',
  'spo2',
  'exerciseMinutes',
  'exerciseCalories',
  'workouts',
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
  'sleep',
  'heart',
  'exercise',
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
  'bed.double.fill',
  'moon.zzz.fill',
  'waveform.path.ecg',
  'lungs.fill',
  'dumbbell.fill',
] as const;
export type ComplicationIcon = (typeof COMPLICATION_ICONS)[number];

/** One value a complication shows: what, how it is written, and its look. */
export interface ComplicationItem {
  source: ComplicationSource;
  format: ComplicationFormat;
  color: ComplicationColor;
  icon: ComplicationIcon;
}

/** A complication shows its own value plus at most two more. */
export const MAX_COMPLICATION_ITEMS = 3;

export interface WatchComplicationDefinition {
  id: string;
  /** The wearer's own name for it; shown in the watch face picker. */
  name: string;
  source: ComplicationSource;
  format: ComplicationFormat;
  /**
   * Draw a gauge when the value has progress. Only for a complication with one
   * value: with more, each value that has progress gets its own ring or bar.
   */
  gauge: boolean;
  color: ComplicationColor;
  icon: ComplicationIcon;
  /**
   * The second and third values, shown together with the first (rings in the
   * circular size, rows in the rectangular one). Optional because a list saved
   * before this existed has none, and an older watch build ignores it.
   */
  extras?: ComplicationItem[];
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
  sleepDuration: {
    format: 'value',
    gauge: false,
    color: 'sleep',
    icon: 'bed.double.fill',
  },
  sleepScore: {
    format: 'percent',
    gauge: true,
    color: 'sleep',
    icon: 'moon.zzz.fill',
  },
  deepSleep: {
    format: 'value',
    gauge: false,
    color: 'sleep',
    icon: 'moon.zzz.fill',
  },
  remSleep: {
    format: 'value',
    gauge: false,
    color: 'sleep',
    icon: 'moon.zzz.fill',
  },
  lightSleep: {
    format: 'value',
    gauge: false,
    color: 'sleep',
    icon: 'moon.zzz.fill',
  },
  timeInBed: {
    format: 'value',
    gauge: false,
    color: 'sleep',
    icon: 'bed.double.fill',
  },
  restingHeartRate: {
    format: 'value',
    gauge: false,
    color: 'heart',
    icon: 'heart.fill',
  },
  hrv: {
    format: 'value',
    gauge: false,
    color: 'heart',
    icon: 'waveform.path.ecg',
  },
  spo2: {
    format: 'value',
    gauge: false,
    color: 'heart',
    icon: 'lungs.fill',
  },
  exerciseMinutes: {
    format: 'percent',
    gauge: true,
    color: 'exercise',
    icon: 'dumbbell.fill',
  },
  exerciseCalories: {
    format: 'percent',
    gauge: true,
    color: 'exercise',
    icon: 'bolt.fill',
  },
  workouts: {
    format: 'value',
    gauge: false,
    color: 'exercise',
    icon: 'dumbbell.fill',
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

type Translator = (
  key: string,
  options: { defaultValue: string; [option: string]: unknown }
) => string;

/**
 * Names for the starter set. Resolvers rather than key strings because the
 * i18n audit needs the literal key at the call site; a total record so a
 * source added without a name is a compile error.
 */
export const COMPLICATION_SOURCE_LABELS: Record<
  ComplicationSourceKey,
  (t: Translator) => string
> = {
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
  sleepDuration: (t) =>
    t('watchSettings.complications.sources.sleepDuration', {
      defaultValue: 'Sleep time',
    }),
  sleepScore: (t) =>
    t('watchSettings.complications.sources.sleepScore', {
      defaultValue: 'Sleep score',
    }),
  deepSleep: (t) =>
    t('watchSettings.complications.sources.deepSleep', {
      defaultValue: 'Deep sleep',
    }),
  remSleep: (t) =>
    t('watchSettings.complications.sources.remSleep', {
      defaultValue: 'REM sleep',
    }),
  lightSleep: (t) =>
    t('watchSettings.complications.sources.lightSleep', {
      defaultValue: 'Light sleep',
    }),
  timeInBed: (t) =>
    t('watchSettings.complications.sources.timeInBed', {
      defaultValue: 'Time in bed',
    }),
  restingHeartRate: (t) =>
    t('watchSettings.complications.sources.restingHeartRate', {
      defaultValue: 'Resting heart rate',
    }),
  hrv: (t) =>
    t('watchSettings.complications.sources.hrv', {
      defaultValue: 'Overnight HRV',
    }),
  spo2: (t) =>
    t('watchSettings.complications.sources.spo2', {
      defaultValue: 'Blood oxygen',
    }),
  exerciseMinutes: (t) =>
    t('watchSettings.complications.sources.exerciseMinutes', {
      defaultValue: 'Exercise minutes',
    }),
  exerciseCalories: (t) =>
    t('watchSettings.complications.sources.exerciseCalories', {
      defaultValue: 'Exercise calories',
    }),
  workouts: (t) =>
    t('watchSettings.complications.sources.workouts', {
      defaultValue: 'Workouts today',
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
  'sleepScore',
];

/**
 * The complications offered before the wearer has made any. The id is the
 * source, so it is the same on every launch and the watch's picker keeps
 * pointing at the same entry.
 */
export function starterComplications(
  t: Translator
): WatchComplicationDefinition[] {
  const single = (
    source: ComplicationSourceKey
  ): WatchComplicationDefinition => ({
    id: `starter-${source}`,
    name: COMPLICATION_SOURCE_LABELS[source](t),
    source,
    ...SOURCE_LOOKS[source],
  });
  // The one starter with several values: the three macros as rings, like the
  // Daily Energy complication. It sits after Fat.
  const macros: WatchComplicationDefinition = {
    id: 'starter-macros',
    name: t('watchComplications.starters.macros', { defaultValue: 'Macros' }),
    source: 'protein',
    ...SOURCE_LOOKS.protein,
    extras: [
      { source: 'carbs', format: 'percent', color: 'carbs', icon: 'leaf.fill' },
      { source: 'fat', format: 'percent', color: 'fat', icon: 'drop.fill' },
    ],
  };
  return STARTER_SOURCES.flatMap((source) =>
    source === 'fat' ? [single(source), macros] : [single(source)]
  );
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

function normalizeItem(input: unknown): ComplicationItem | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  if (!isComplicationSource(raw.source)) return null;
  const look = defaultLookFor(raw.source);
  return {
    source: raw.source,
    format: oneOf(COMPLICATION_FORMATS, raw.format, look.format),
    color: oneOf(COMPLICATION_COLORS, raw.color, look.color),
    icon: oneOf(COMPLICATION_ICONS, raw.icon, look.icon),
  };
}

/** The extra values, at most two, with no source repeated or matching the first. */
function normalizeExtras(
  input: unknown,
  primary: ComplicationSource
): ComplicationItem[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>([primary]);
  const extras: ComplicationItem[] = [];
  for (const entry of input) {
    const item = normalizeItem(entry);
    if (!item || seen.has(item.source)) continue;
    seen.add(item.source);
    extras.push(item);
    if (extras.length >= MAX_COMPLICATION_ITEMS - 1) break;
  }
  return extras;
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
  const extras = normalizeExtras(raw.extras, raw.source);
  return {
    id,
    name,
    source: raw.source,
    format: oneOf(COMPLICATION_FORMATS, raw.format, look.format),
    gauge: typeof raw.gauge === 'boolean' ? raw.gauge : look.gauge,
    color: oneOf(COMPLICATION_COLORS, raw.color, look.color),
    icon: oneOf(COMPLICATION_ICONS, raw.icon, look.icon),
    ...(extras.length > 0 ? { extras } : {}),
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
        ({ name, source, format, gauge, color, icon, extras }) => ({
          name,
          source,
          format,
          gauge,
          color,
          icon,
          ...(extras && extras.length > 0 ? { extras } : {}),
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
  revision: number = Date.now(),
  reload = false
): WatchComplicationConfigPayload {
  return {
    revision,
    // Only on a manual reload: the watch then refreshes its picker and faces
    // even when nothing in the list changed.
    ...(reload ? { reload: true } : {}),
    definitions: list.map((d) => ({
      id: d.id,
      name: d.name,
      source: d.source,
      format: d.format,
      gauge: d.gauge,
      color: d.color,
      icon: d.icon,
      extras: (d.extras ?? []).map((e) => ({
        source: e.source,
        format: e.format,
        color: e.color,
        icon: e.icon,
      })),
    })),
  };
}

/** The nutrient behind a `nutrient:<key>` source, or null for a fixed source. */
export function nutrientKeyOf(source: ComplicationSource): string | null {
  return source.startsWith(NUTRIENT_SOURCE_PREFIX)
    ? source.slice(NUTRIENT_SOURCE_PREFIX.length)
    : null;
}

/** Sources with no 0...1 progress, so no gauge, ring or percent. */
const NO_PROGRESS_SOURCES = [
  'caloriesRemaining',
  'caloriesBurned',
  'weight',
  'bodyFat',
  'sleepDuration',
  'deepSleep',
  'remSleep',
  'lightSleep',
  'timeInBed',
  'restingHeartRate',
  'hrv',
  'spo2',
  'workouts',
] as const;

/**
 * Sources with no goal to count down to, so no "left". The sleep score has
 * progress (out of 100) but no goal.
 */
const NO_GOAL_SOURCES = [...NO_PROGRESS_SOURCES, 'sleepScore'] as const;

/**
 * Whether the number has progress behind it: a gauge or ring can be drawn and it
 * can be written as a percent. The watch does the same.
 */
export function sourceHasProgress(source: ComplicationSource): boolean {
  return !(NO_PROGRESS_SOURCES as readonly string[]).includes(source);
}

/**
 * Whether the number has a goal, so "left" (what remains to reach it) means
 * something. A source without one can still show its value, or its percent when
 * it has progress.
 */
export function sourceHasGoal(source: ComplicationSource): boolean {
  return !(NO_GOAL_SOURCES as readonly string[]).includes(source);
}

/** The formats a source can be written in. */
export function allowedFormats(
  source: ComplicationSource
): ComplicationFormat[] {
  return COMPLICATION_FORMATS.filter(
    (format) =>
      format === 'value' ||
      (format === 'percent' && sourceHasProgress(source)) ||
      (format === 'remaining' && sourceHasGoal(source))
  );
}

/** Every value a definition shows, the first one first. */
export function itemsOf(
  definition: Pick<
    WatchComplicationDefinition,
    'source' | 'format' | 'color' | 'icon' | 'extras'
  >
): ComplicationItem[] {
  return [
    {
      source: definition.source,
      format: definition.format,
      color: definition.color,
      icon: definition.icon,
    },
    ...(definition.extras ?? []),
  ];
}

/**
 * The watch's own colours, as the phone draws them in the editor. Mirrors
 * `ComplicationPalette` and the system colours in
 * `targets/watch-widget/CustomComplication.swift`: change one, change both.
 */
export const COMPLICATION_COLOR_HEX: Record<ComplicationColor, string> = {
  calories: '#8992DC',
  protein: '#DBB06F',
  carbs: '#97C692',
  fat: '#8AC2DA',
  water: '#64D2FF',
  steps: '#66D4CF',
  fasting: '#FF9F0A',
  weight: '#6AC4DC',
  sleep: '#7D7AFF',
  heart: '#FF6482',
  exercise: '#30D158',
  neutral: '#FFFFFF',
};

export const COMPLICATION_FORMAT_LABELS: Record<
  ComplicationFormat,
  (t: Translator) => string
> = {
  value: (t) =>
    t('watchComplications.formats.value', { defaultValue: 'Value' }),
  percent: (t) =>
    t('watchComplications.formats.percent', { defaultValue: 'Percent' }),
  remaining: (t) =>
    t('watchComplications.formats.remaining', { defaultValue: 'Left' }),
};

export const COMPLICATION_COLOR_LABELS: Record<
  ComplicationColor,
  (t: Translator) => string
> = {
  calories: (t) =>
    t('watchComplications.colors.calories', { defaultValue: 'Violet' }),
  protein: (t) =>
    t('watchComplications.colors.protein', { defaultValue: 'Gold' }),
  carbs: (t) => t('watchComplications.colors.carbs', { defaultValue: 'Green' }),
  fat: (t) => t('watchComplications.colors.fat', { defaultValue: 'Sky blue' }),
  water: (t) => t('watchComplications.colors.water', { defaultValue: 'Cyan' }),
  steps: (t) => t('watchComplications.colors.steps', { defaultValue: 'Mint' }),
  fasting: (t) =>
    t('watchComplications.colors.fasting', { defaultValue: 'Orange' }),
  weight: (t) =>
    t('watchComplications.colors.weight', { defaultValue: 'Teal' }),
  sleep: (t) =>
    t('watchComplications.colors.sleep', { defaultValue: 'Indigo' }),
  heart: (t) => t('watchComplications.colors.heart', { defaultValue: 'Pink' }),
  exercise: (t) =>
    t('watchComplications.colors.exercise', { defaultValue: 'Bright green' }),
  neutral: (t) =>
    t('watchComplications.colors.neutral', { defaultValue: 'White' }),
};

export const COMPLICATION_ICON_LABELS: Record<
  ComplicationIcon,
  (t: Translator) => string
> = {
  'flame.fill': (t) =>
    t('watchComplications.icons.flame', { defaultValue: 'Flame' }),
  'fish.fill': (t) =>
    t('watchComplications.icons.fish', { defaultValue: 'Fish' }),
  'leaf.fill': (t) =>
    t('watchComplications.icons.leaf', { defaultValue: 'Leaf' }),
  'drop.fill': (t) =>
    t('watchComplications.icons.drop', { defaultValue: 'Drop' }),
  'figure.walk': (t) =>
    t('watchComplications.icons.walk', { defaultValue: 'Walking' }),
  timer: (t) => t('watchComplications.icons.timer', { defaultValue: 'Timer' }),
  'scalemass.fill': (t) =>
    t('watchComplications.icons.scale', { defaultValue: 'Scale' }),
  'heart.fill': (t) =>
    t('watchComplications.icons.heart', { defaultValue: 'Heart' }),
  'bolt.fill': (t) =>
    t('watchComplications.icons.bolt', { defaultValue: 'Bolt' }),
  'fork.knife': (t) =>
    t('watchComplications.icons.fork', { defaultValue: 'Fork and knife' }),
  'chart.bar.fill': (t) =>
    t('watchComplications.icons.chart', { defaultValue: 'Bar chart' }),
  'gauge.with.dots.needle.33percent': (t) =>
    t('watchComplications.icons.gauge', { defaultValue: 'Gauge' }),
  'bed.double.fill': (t) =>
    t('watchComplications.icons.bed', { defaultValue: 'Bed' }),
  'moon.zzz.fill': (t) =>
    t('watchComplications.icons.moon', { defaultValue: 'Moon' }),
  'waveform.path.ecg': (t) =>
    t('watchComplications.icons.heartbeat', { defaultValue: 'Heartbeat' }),
  'lungs.fill': (t) =>
    t('watchComplications.icons.lungs', { defaultValue: 'Lungs' }),
  'dumbbell.fill': (t) =>
    t('watchComplications.icons.dumbbell', { defaultValue: 'Dumbbell' }),
};

/** Insert at the end, or replace the entry with the same id. */
export function upsertComplication(
  list: readonly WatchComplicationDefinition[],
  definition: WatchComplicationDefinition
): WatchComplicationDefinition[] {
  return list.some((d) => d.id === definition.id)
    ? list.map((d) => (d.id === definition.id ? definition : d))
    : [...list, definition];
}

export function removeComplication(
  list: readonly WatchComplicationDefinition[],
  id: string
): WatchComplicationDefinition[] {
  return list.filter((d) => d.id !== id);
}

/** Moves one entry up (-1) or down (1); the list is unchanged at either end. */
export function moveComplication(
  list: readonly WatchComplicationDefinition[],
  id: string,
  direction: -1 | 1
): WatchComplicationDefinition[] {
  const from = list.findIndex((d) => d.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** How full the sample gauge is in the editor's preview. */
export const PREVIEW_PROGRESS = 0.65;

interface PreviewSample {
  value: string;
  /** What is left to the goal. */
  left: string;
  /** The goal, when there is one. */
  goal?: string;
  unit?: string;
  /** How full its gauge is, when that is not the usual sample figure. */
  progress?: number;
}

// A made-up day for the preview.
const PREVIEW_SAMPLES: Record<ComplicationSourceKey, PreviewSample> = {
  calories: { value: '1,240', left: '660', goal: '1,900', unit: 'kcal' },
  caloriesRemaining: { value: '660', left: '660', unit: 'kcal' },
  caloriesBurned: { value: '420', left: '420', unit: 'kcal' },
  protein: { value: '98', left: '52', goal: '150', unit: 'g' },
  carbs: { value: '140', left: '75', goal: '215', unit: 'g' },
  fat: { value: '45', left: '24', goal: '69', unit: 'g' },
  water: { value: '1,300', left: '700', goal: '2,000', unit: 'ml' },
  steps: { value: '6,500', left: '3,500', goal: '10,000', unit: 'steps' },
  fasting: { value: '10:30', left: '5:30', goal: '16:00' },
  weight: { value: '72.5', left: '72.5', unit: 'kg' },
  bodyFat: { value: '18.5', left: '18.5', unit: '%' },
  sleepDuration: { value: '7:42', left: '7:42' },
  sleepScore: { value: '82', left: '18', progress: 0.82 },
  deepSleep: { value: '1:30', left: '1:30' },
  remSleep: { value: '1:45', left: '1:45' },
  lightSleep: { value: '4:20', left: '4:20' },
  timeInBed: { value: '8:05', left: '8:05' },
  restingHeartRate: { value: '58', left: '58', unit: 'bpm' },
  hrv: { value: '45', left: '45', unit: 'ms' },
  spo2: { value: '97', left: '97', unit: '%' },
  exerciseMinutes: { value: '20', left: '10', goal: '30', unit: 'min' },
  exerciseCalories: { value: '320', left: '180', goal: '500', unit: 'kcal' },
  workouts: { value: '1', left: '1' },
};

const PREVIEW_NUTRIENT: PreviewSample = { value: '12', left: '6', goal: '18' };

const withUnit = (amount: string, unit?: string) =>
  unit ? `${amount} ${unit}` : amount;

/**
 * What one value would show on a sample day, so the editor can preview a change
 * without any real data. Follows the watch (`display` in
 * `CustomComplication.swift`): percent needs progress and "left" needs a goal,
 * else the value is shown, and a gauge needs progress too. `detail` is the line
 * under the text in the rectangular size.
 */
export function complicationPreview(
  definition: Pick<WatchComplicationDefinition, 'source' | 'format' | 'gauge'>,
  t: Translator
): { text: string; detail: string | null; progress: number | null } {
  const sample =
    PREVIEW_SAMPLES[definition.source as ComplicationSourceKey] ??
    PREVIEW_NUTRIENT;
  const hasProgress = sourceHasProgress(definition.source);
  const hasGoal = sourceHasGoal(definition.source);
  const fill = sample.progress ?? PREVIEW_PROGRESS;
  const progress = hasProgress && definition.gauge ? fill : null;

  if (hasProgress && definition.format === 'percent') {
    return {
      text: `${Math.round(fill * 100)}%`,
      detail: withUnit(sample.value, sample.unit),
      progress,
    };
  }
  if (hasGoal && definition.format === 'remaining') {
    return {
      text: sample.left,
      detail: sample.unit
        ? t('watchComplications.preview.leftUnit', {
            defaultValue: '{{unit}} left',
            unit: sample.unit,
          })
        : t('watchComplications.preview.left', { defaultValue: 'left' }),
      progress,
    };
  }
  return {
    text: sample.value,
    detail:
      hasGoal && sample.goal
        ? t('watchComplications.preview.ofGoal', {
            defaultValue: 'of {{goal}}',
            goal: withUnit(sample.goal, sample.unit),
          })
        : (sample.unit ?? null),
    progress,
  };
}

export interface ComplicationItemPreview {
  source: ComplicationSource;
  color: ComplicationColor;
  icon: ComplicationIcon;
  text: string;
  detail: string | null;
  progress: number | null;
}

/**
 * The preview of every value a definition shows. With one value its gauge
 * switch decides whether it draws one; with several, each value that has
 * progress gets a ring or a bar, as on the watch.
 */
export function complicationItemPreviews(
  definition: Pick<
    WatchComplicationDefinition,
    'source' | 'format' | 'gauge' | 'color' | 'icon' | 'extras'
  >,
  t: Translator
): ComplicationItemPreview[] {
  const items = itemsOf(definition);
  const several = items.length > 1;
  return items.map((item) => ({
    source: item.source,
    color: item.color,
    icon: item.icon,
    ...complicationPreview(
      {
        source: item.source,
        format: item.format,
        gauge: several || definition.gauge,
      },
      t
    ),
  }));
}

/** A source's name: a fixed source's own, or the nutrient's. */
export function complicationSourceLabel(
  source: ComplicationSource,
  t: Translator
): string {
  const nutrient = nutrientKeyOf(source);
  if (nutrient) return getNutrientLabel(t, nutrient);
  return COMPLICATION_SOURCE_LABELS[source as ComplicationSourceKey](t);
}
