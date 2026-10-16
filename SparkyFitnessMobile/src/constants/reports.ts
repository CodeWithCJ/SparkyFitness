import type { SleepAnalyticsMetric } from '../utils/sleepAnalytics';
import { NUTRIENT_META } from './nutrients';

/**
 * The reports the Reports hub lists, in factory order. A saved order is
 * reconciled against this array (`resolveKeyOrder`), so a report added later
 * shows up, at the end, for users who already reordered theirs.
 */
export const REPORT_KEYS = [
  'nutrition',
  'hydration',
  'substances',
  'sleep',
  'measurements',
  'mood',
  'exercise',
] as const;

export type ReportKey = (typeof REPORT_KEYS)[number];

type Translator = (key: string, options: { defaultValue: string }) => string;

/**
 * A report's name as the hub and the customize screen list it. Resolvers
 * rather than key strings because the i18n audit needs the literal key at the
 * call site; a total record so a report added without a name is a compile error.
 */
export const REPORT_LABELS: Record<ReportKey, (t: Translator) => string> = {
  nutrition: (t) => t('reports.nutrition', { defaultValue: 'Nutrition' }),
  sleep: (t) =>
    t('reports.sleepAnalytics', { defaultValue: 'Sleep analytics' }),
  hydration: (t) => t('reports.hydration', { defaultValue: 'Hydration' }),
  substances: (t) =>
    t('reports.substances', { defaultValue: 'Caffeine and alcohol' }),
  measurements: (t) =>
    t('reports.measurements', { defaultValue: 'Measurements' }),
  mood: (t) => t('reports.mood', { defaultValue: 'Mood' }),
  exercise: (t) => t('reports.exercise', { defaultValue: 'Exercise' }),
};

/**
 * Every section a report can show, namespaced by report so one flat list in
 * the preferences store can hold the hidden ones for all of them. A report
 * renders a section unless its key is in `hiddenReportSections`.
 */
export const NUTRITION_SECTIONS = [
  'nutrition.overview',
  'nutrition.insights',
  'nutrition.chart',
  'nutrition.averages',
  'nutrition.macroSplit',
  'nutrition.goal',
  'nutrition.highlights',
  'nutrition.macroGoals',
  'nutrition.fats',
  'nutrition.micros',
  'nutrition.weekdays',
  'nutrition.consistency',
  'nutrition.otherNutrients',
  'nutrition.trends',
] as const;

export const HYDRATION_SECTIONS = [
  'hydration.overview',
  'hydration.insights',
  'hydration.chart',
  'hydration.goal',
  'hydration.highlights',
  'hydration.weekdays',
] as const;

export const SUBSTANCES_SECTIONS = [
  'substances.overview',
  'substances.insights',
  'substances.caffeineChart',
  'substances.caffeine',
  'substances.alcoholChart',
  'substances.alcohol',
  'substances.weekly',
] as const;

export const EXERCISE_SECTIONS = [
  'exercise.overview',
  'exercise.setsPerMuscle',
  'exercise.heatMap',
  'exercise.consistency',
  'exercise.load',
  'exercise.analysis',
] as const;

export const MEASUREMENTS_SECTIONS = [
  'measurements.overview',
  'measurements.insights',
  'measurements.weightChart',
  'measurements.weight',
  'measurements.bodyComposition',
  'measurements.tape',
  'measurements.stepsChart',
] as const;

export const SLEEP_SECTIONS = [
  'sleep.overview',
  'sleep.insights',
  'sleep.stages',
  'sleep.routine',
  'sleep.weekendVsWeekday',
  'sleep.nights',
  'sleep.averages',
] as const;

export const MOOD_SECTIONS = [
  'mood.overview',
  'mood.insights',
  'mood.chart',
  'mood.summary',
  'mood.highlights',
  'mood.byWeekday',
  'mood.topMoods',
] as const;

/** One chart per overnight reading on the sleep report; each can be hidden. */
export const sleepMetricSection = (metric: SleepAnalyticsMetric) =>
  `sleep.metric.${metric}` as const;

export type ReportSectionKey =
  | (typeof NUTRITION_SECTIONS)[number]
  | (typeof EXERCISE_SECTIONS)[number]
  | (typeof SUBSTANCES_SECTIONS)[number]
  | (typeof HYDRATION_SECTIONS)[number]
  | (typeof MEASUREMENTS_SECTIONS)[number]
  | (typeof SLEEP_SECTIONS)[number]
  | (typeof MOOD_SECTIONS)[number]
  | ReturnType<typeof sleepMetricSection>;

/** What a report opens on until the wearer picks, and what `reportDefaultRange` starts as. */
export const DEFAULT_REPORT_RANGE = '30d' as const;

/** Nutrients with a card of their own (or that the report already leads with), so the picker leaves them out. */
const PICKER_EXCLUDED_NUTRIENTS = new Set([
  'calories',
  'protein',
  'carbs',
  'fat',
  'glycemic_index',
]);

/** Every standard nutrient the "Your nutrients" card can show, in catalog order. */
export const REPORT_NUTRIENT_KEYS: string[] = Object.keys(NUTRIENT_META).filter(
  (key) => !PICKER_EXCLUDED_NUTRIENTS.has(key)
);

/** What "Your nutrients" lists until the user picks: the averages the report always had. */
export const DEFAULT_REPORT_NUTRIENTS = [
  'dietary_fiber',
  'sugars',
  'sodium',
  'water_ml',
  'caffeine_mg',
  'alcohol_g',
];

/** The fixed fat-breakdown and micronutrient cards. */
export const FAT_BREAKDOWN_NUTRIENTS = [
  'saturated_fat',
  'polyunsaturated_fat',
  'monounsaturated_fat',
  'trans_fat',
  'cholesterol',
];
export const MICRONUTRIENTS = [
  'potassium',
  'calcium',
  'iron',
  'vitamin_a',
  'vitamin_c',
];
