// English fallback descriptions for the CSV header-mapping dialog's fields,
// sourced from the field reference tables in docs/src/features/data-import.md.
// Each leads with the field's type (Date / Text / Number / Boolean / Timestamp)
// and its unit or accepted values where it has one, so the user knows what to
// put in the column. The dialog renders each through `t(entry.key, entry.fallback)`
// (the reportUtil.ts export-header pattern), so the locale file supplies the
// translation and the fallback is English. A field not in a map (e.g. a custom
// nutrient) shows no description, so the map also acts as the existence gate.
//
// Fields are shared by name where they mean the same thing (date, brand,
// nutrients, …). Where a name means different things per importer, the shared
// map carries the common default and an importer passes an override — the
// dialog takes an optional `fieldDescriptions` map that replaces the default
// (Health overrides `unit`, which there is a metric unit, not a food unit).
//
// Translation note: backtick-quoted tokens (e.g. `pull`, `true`, `beginner`)
// are machine-matched against canonical English values by the import parsers
// (case-insensitive), so keep them verbatim in translations — translating them
// would teach users to enter values that no longer match. Unquoted examples
// (category, meal_type, unit) are free-text and may be localized.

export interface CsvFieldDescription {
  /** i18n key; the locale file provides the translation. */
  key: string;
  /** English fallback shown when the key is untranslated. */
  fallback: string;
}

const sharedKey = (field: string): string =>
  `csvImport.fieldDescriptions.${field}`;

export const CSV_FIELD_DESCRIPTIONS: Record<string, CsvFieldDescription> = {
  // Shared across importers
  date: {
    key: sharedKey('date'),
    fallback: 'Date (YYYY-MM-DD) — the day the entry was logged.',
  },
  source: {
    key: sharedKey('source'),
    fallback: 'Text — where the data came from.',
  },
  notes: { key: sharedKey('notes'), fallback: 'Text — free-form notes.' },

  // Food Diary
  meal_type: {
    key: sharedKey('meal_type'),
    fallback:
      'Text — one of your meal types (breakfast, lunch, dinner, snacks, …), case-insensitive.',
  },
  meal_name: {
    key: sharedKey('meal_name'),
    fallback:
      'Text — groups rows into a named meal (rows sharing date, meal type, and name become one meal).',
  },
  food_name: {
    key: sharedKey('food_name'),
    fallback: 'Text — the food to match against your library or create.',
  },
  brand: {
    key: sharedKey('brand'),
    fallback: 'Text — optional brand, used to improve matching.',
  },
  quantity: {
    key: sharedKey('quantity'),
    fallback: 'Number — amount per unit, e.g. 200.',
  },
  unit: {
    key: sharedKey('unit'),
    fallback:
      'Text — known unit (g, oz, ml, cup, serving, …); unmatched values are kept as-is.',
  },

  // Food library import
  name: {
    key: sharedKey('name'),
    fallback: 'Text — the name to match against your library or create.',
  },
  serving_size: {
    key: sharedKey('serving_size'),
    fallback:
      'Number — amount per serving; the divisor in the nutrition formula.',
  },
  serving_unit: {
    key: sharedKey('serving_unit'),
    fallback: 'Text — unit for serving_size (g, oz, cup, …).',
  },
  is_custom: {
    key: sharedKey('is_custom'),
    fallback:
      'Boolean — `true` marks the item custom (any other value is false).',
  },
  shared_with_public: {
    key: sharedKey('shared_with_public'),
    fallback:
      'Boolean — `true` shares the item with the public library (any other value is false).',
  },
  is_default: {
    key: sharedKey('is_default'),
    fallback:
      'Boolean — `true` makes this the default variant (any other value is false).',
  },

  // Exercise library import
  category: {
    key: sharedKey('category'),
    fallback: 'Text — exercise category (strength, cardio, …).',
  },
  calories_per_hour: {
    key: sharedKey('calories_per_hour'),
    fallback: 'Number — estimated calories burned per hour.',
  },
  description: {
    key: sharedKey('description'),
    fallback: 'Text — short description of the exercise.',
  },
  force: {
    key: sharedKey('force'),
    fallback: 'Text — `pull`, `push`, or `static` (case-insensitive).',
  },
  level: {
    key: sharedKey('level'),
    fallback:
      'Text — `beginner`, `intermediate`, or `expert` (case-insensitive).',
  },
  mechanic: {
    key: sharedKey('mechanic'),
    fallback: 'Text — `isolation` or `compound` (case-insensitive).',
  },
  equipment: {
    key: sharedKey('equipment'),
    fallback: 'Text — equipment used (comma-separated).',
  },
  primary_muscles: {
    key: sharedKey('primary_muscles'),
    fallback: 'Text — primary muscles (comma-separated).',
  },
  secondary_muscles: {
    key: sharedKey('secondary_muscles'),
    fallback: 'Text — secondary muscles (comma-separated).',
  },
  instructions: {
    key: sharedKey('instructions'),
    fallback: 'Text — how to perform the exercise.',
  },
  images: {
    key: sharedKey('images'),
    fallback: 'Text — image URLs (comma-separated).',
  },

  // Workout History (exercise entry history)
  entry_date: {
    key: sharedKey('entry_date'),
    fallback: 'Date (YYYY-MM-DD) — the day the workout was performed.',
  },
  exercise_name: {
    key: sharedKey('exercise_name'),
    fallback: 'Text — the exercise to match against your library or create.',
  },
  exercise_force: {
    key: sharedKey('exercise_force'),
    fallback: 'Text — `pull`, `push`, or `static` (case-insensitive).',
  },
  exercise_level: {
    key: sharedKey('exercise_level'),
    fallback:
      'Text — `beginner`, `intermediate`, or `expert` (case-insensitive).',
  },
  exercise_mechanic: {
    key: sharedKey('exercise_mechanic'),
    fallback: 'Text — `isolation` or `compound` (case-insensitive).',
  },

  // Check-in & Health — body measurements
  weight: {
    key: sharedKey('weight'),
    fallback: 'Number — body weight (in weight_unit).',
  },
  weight_unit: {
    key: sharedKey('weight_unit'),
    fallback: 'Text — unit for weight (kg or lb).',
  },
  body_fat: {
    key: sharedKey('body_fat'),
    fallback: 'Number — body-fat percentage (%)',
  },
  height: {
    key: sharedKey('height'),
    fallback: 'Number — height (in length_unit).',
  },
  neck: {
    key: sharedKey('neck'),
    fallback: 'Number — neck circumference (in length_unit).',
  },
  waist: {
    key: sharedKey('waist'),
    fallback: 'Number — waist circumference (in length_unit).',
  },
  hips: {
    key: sharedKey('hips'),
    fallback: 'Number — hip circumference (in length_unit).',
  },
  length_unit: {
    key: sharedKey('length_unit'),
    fallback: 'Text — unit for the length fields (cm, in, m).',
  },

  // Check-in & Health — sleep
  bedtime: {
    key: sharedKey('bedtime'),
    fallback: 'Timestamp (ISO) — bedtime.',
  },
  wake_time: {
    key: sharedKey('wake_time'),
    fallback: 'Timestamp (ISO) — wake time.',
  },
  duration_in_seconds: {
    key: sharedKey('duration_in_seconds'),
    fallback: 'Number — total sleep duration, in seconds.',
  },
  time_asleep_in_seconds: {
    key: sharedKey('time_asleep_in_seconds'),
    fallback: 'Number — time asleep, in seconds.',
  },
  deep_sleep_seconds: {
    key: sharedKey('deep_sleep_seconds'),
    fallback: 'Number — deep sleep, in seconds.',
  },
  light_sleep_seconds: {
    key: sharedKey('light_sleep_seconds'),
    fallback: 'Number — light sleep, in seconds.',
  },
  rem_sleep_seconds: {
    key: sharedKey('rem_sleep_seconds'),
    fallback: 'Number — REM sleep, in seconds.',
  },
  awake_sleep_seconds: {
    key: sharedKey('awake_sleep_seconds'),
    fallback: 'Number — awake, in seconds.',
  },
  sleep_score: {
    key: sharedKey('sleep_score'),
    fallback: 'Number — overall sleep score (0–100).',
  },
  stage_events: {
    key: sharedKey('stage_events'),
    fallback: 'Text (JSON array) — raw stage event sequence.',
  },

  // Check-in & Health — vitals / activity / hydration
  type: {
    key: sharedKey('type'),
    fallback: 'Text — which metric or vital (its name).',
  },
  value: { key: sharedKey('value'), fallback: 'Number — its value.' },

  // Check-in & Health — mood
  mood_value: {
    key: sharedKey('mood_value'),
    fallback: 'Number — mood score (10–100).',
  },
  mood_tags: {
    key: sharedKey('mood_tags'),
    fallback: 'Text — pipe-separated mood tags (e.g. grateful|energetic).',
  },

  // Standard nutrients (Food Diary, Food library import)
  calories: {
    key: sharedKey('calories'),
    fallback: 'Number — calories (kcal).',
  },
  protein: { key: sharedKey('protein'), fallback: 'Number — protein (g).' },
  carbs: { key: sharedKey('carbs'), fallback: 'Number — carbohydrates (g).' },
  fat: { key: sharedKey('fat'), fallback: 'Number — total fat (g).' },
  saturated_fat: {
    key: sharedKey('saturated_fat'),
    fallback: 'Number — saturated fat (g).',
  },
  polyunsaturated_fat: {
    key: sharedKey('polyunsaturated_fat'),
    fallback: 'Number — polyunsaturated fat (g).',
  },
  monounsaturated_fat: {
    key: sharedKey('monounsaturated_fat'),
    fallback: 'Number — monounsaturated fat (g).',
  },
  trans_fat: {
    key: sharedKey('trans_fat'),
    fallback: 'Number — trans fat (g).',
  },
  cholesterol: {
    key: sharedKey('cholesterol'),
    fallback: 'Number — cholesterol (mg).',
  },
  sodium: { key: sharedKey('sodium'), fallback: 'Number — sodium (mg).' },
  potassium: {
    key: sharedKey('potassium'),
    fallback: 'Number — potassium (mg).',
  },
  dietary_fiber: {
    key: sharedKey('dietary_fiber'),
    fallback: 'Number — dietary fiber (g).',
  },
  sugars: { key: sharedKey('sugars'), fallback: 'Number — sugars (g).' },
  vitamin_a: {
    key: sharedKey('vitamin_a'),
    fallback: 'Number — vitamin A (IU).',
  },
  vitamin_c: {
    key: sharedKey('vitamin_c'),
    fallback: 'Number — vitamin C (mg).',
  },
  calcium: { key: sharedKey('calcium'), fallback: 'Number — calcium (mg).' },
  iron: { key: sharedKey('iron'), fallback: 'Number — iron (mg).' },
};

// Health's `unit` means a metric unit (bpm, mmol/L, steps, kcal, km; ml/L/oz for
// hydration), validated and converted — not a food unit kept as-is. Spreading
// this over CSV_FIELD_DESCRIPTIONS lets the dialog render it correctly.
export const HEALTH_CSV_FIELD_DESCRIPTIONS: Record<
  string,
  CsvFieldDescription
> = {
  ...CSV_FIELD_DESCRIPTIONS,
  unit: {
    key: 'healthDataImport.fieldDescriptions.unit',
    fallback:
      'Text — unit for the value (e.g. ml, L, oz, bpm, mmol/L); converted where applicable.',
  },
};
