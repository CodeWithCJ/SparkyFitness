import { localDateToDay, addDays } from '@workspace/shared';

// CSV import of historical health data (body measurements, sleep, vitals, daily
// activity totals, hydration). Rows are parsed client-side and mapped into the
// flat HealthDataPayloadItem shape consumed by
// POST /api/measurements/import-health-data, which feeds the shared
// processHealthData pipeline (same one mobile sync uses).
//
// Column sets are deliberately limited to fields the target table actually
// stores, so we never ask the user for data we would silently discard:
//   - check_in_measurements (measurements) has no source/source_id/notes.
//   - sleep_entries has source only.
//   - custom_measurements (vitals/custom) has source + notes (no source_id).
//   - water_intake (hydration) has source only.
// source_id is not persisted anywhere in this import path, so it is omitted
// from every template.

export type ImportCategory =
  | 'measurements'
  | 'sleep'
  | 'vitals'
  | 'activity'
  | 'hydration'
  | 'mood';

export interface HealthImportTypeGuide {
  title: string;
  options: string[];
}

export interface HealthImportCategoryConfig {
  value: ImportCategory;
  label: string;
  description: string;
  // Exact CSV column order for the downloadable template and header validation.
  requiredHeaders: string[];
  // Columns rendered as constrained dropdowns in the editable table, keyed by
  // header -> allowed values. A cell whose value is not in this list is flagged
  // on import (see validators in utils/healthDataImport.ts).
  dropdownColumns?: Record<string, string[]>;
  // Sample rows used to build the downloadable template. Multiple rows show the
  // different unit choices available.
  sample: Record<string, string>[];
  // Optional copy-to-clipboard guides (accepted `type` values) shown in the UI.
  guides?: HealthImportTypeGuide[];
}

export const WEIGHT_UNITS = ['kg', 'lb'];
export const LENGTH_UNITS = ['cm', 'in', 'm'];
export const VOLUME_UNITS = ['ml', 'L', 'oz'];

const today = localDateToDay(new Date());
const yesterday = addDays(today, -1);

// Accepted `type` values for the tall templates. These mirror the type names
// processHealthData already understands (dedicated handlers) plus anything that
// falls through to custom_measurements.
export const VITALS_TYPES = [
  'heart_rate',
  'resting_heart_rate',
  'blood_pressure_systolic',
  'blood_pressure_diastolic',
  'oxygen_saturation',
  'blood_glucose',
  'body_temperature',
  'respiratory_rate',
  'vo2_max',
  'HRV',
  'lean_body_mass',
];

export const ACTIVITY_TYPES = [
  'steps',
  'active_calories',
  'total_calories',
  'distance',
  'floors_climbed',
];

export const HEALTH_IMPORT_CATEGORIES: HealthImportCategoryConfig[] = [
  {
    value: 'measurements',
    label: 'Body Measurements',
    description:
      'Weight, body fat, height, and body circumference. One row per day. ' +
      'Stored without a source label, so re-importing a date overwrites it.',
    requiredHeaders: [
      'date',
      'weight',
      'weight_unit',
      'body_fat',
      'height',
      'neck',
      'waist',
      'hips',
      'length_unit',
    ],
    dropdownColumns: {
      weight_unit: WEIGHT_UNITS,
      length_unit: LENGTH_UNITS,
    },
    sample: [
      {
        date: today,
        weight: '73.5',
        weight_unit: 'kg',
        body_fat: '18.2',
        height: '178',
        neck: '38',
        waist: '82',
        hips: '95',
        length_unit: 'cm',
      },
      {
        date: yesterday,
        weight: '162',
        weight_unit: 'lb',
        body_fat: '18.4',
        height: '70',
        neck: '15',
        waist: '32',
        hips: '37',
        length_unit: 'in',
      },
    ],
  },
  {
    value: 'sleep',
    label: 'Sleep',
    description:
      'One sleep session per row. Provide bedtime/wake_time as ISO timestamps. ' +
      'The deep/light/rem/awake columns are aggregate seconds per stage. For a ' +
      'full stage timeline, optionally put a JSON array in stage_events.',
    requiredHeaders: [
      'date',
      'bedtime',
      'wake_time',
      'duration_in_seconds',
      'time_asleep_in_seconds',
      'deep_sleep_seconds',
      'light_sleep_seconds',
      'rem_sleep_seconds',
      'awake_sleep_seconds',
      'sleep_score',
      'stage_events',
      'source',
    ],
    sample: [
      {
        date: today,
        bedtime: `${today}T23:15:00`,
        wake_time: `${today}T07:00:00`,
        duration_in_seconds: '27900',
        time_asleep_in_seconds: '25200',
        deep_sleep_seconds: '5400',
        light_sleep_seconds: '14400',
        rem_sleep_seconds: '5400',
        awake_sleep_seconds: '2700',
        sleep_score: '82',
        stage_events: '',
        source: 'CSV_Import',
      },
    ],
    guides: [
      {
        title:
          'Optional stage_events JSON (leave blank for durations-only). Stage types: deep, light, rem, awake',
        options: [
          '[{"stage_type":"deep","start_time":"2026-01-02T23:20:00Z","end_time":"2026-01-02T23:50:00Z"}]',
        ],
      },
    ],
  },
  {
    value: 'vitals',
    label: 'Vitals & Custom',
    description:
      'One reading per row. `type` accepts a vital name OR any custom category ' +
      'name — unknown types create/reuse a custom measurement category by name.',
    requiredHeaders: ['date', 'type', 'value', 'unit', 'source', 'notes'],
    sample: [
      {
        date: today,
        type: 'resting_heart_rate',
        value: '54',
        unit: 'bpm',
        source: 'CSV_Import',
        notes: '',
      },
      {
        date: today,
        type: 'blood_glucose',
        value: '5.4',
        unit: 'mmol/L',
        source: 'CSV_Import',
        notes: 'Fasting',
      },
      {
        date: today,
        type: 'My Custom Metric',
        value: '12',
        unit: 'units',
        source: 'CSV_Import',
        notes: 'Auto-creates a custom category',
      },
    ],
    guides: [
      {
        title: 'Accepted vital types (or use any custom category name)',
        options: VITALS_TYPES,
      },
    ],
  },
  {
    value: 'activity',
    label: 'Daily Activity',
    description:
      'Daily totals such as steps, distance, and calories burned. Note: steps ' +
      'and active_calories ignore notes; distance is stored as a custom measurement.',
    requiredHeaders: ['date', 'type', 'value', 'unit', 'source'],
    sample: [
      {
        date: today,
        type: 'steps',
        value: '9450',
        unit: 'steps',
        source: 'CSV_Import',
      },
      {
        date: today,
        type: 'active_calories',
        value: '540',
        unit: 'kcal',
        source: 'CSV_Import',
      },
      {
        date: today,
        type: 'distance',
        value: '5.2',
        unit: 'km',
        source: 'CSV_Import',
      },
    ],
    guides: [
      {
        title: 'Accepted activity types',
        options: ACTIVITY_TYPES,
      },
    ],
  },
  {
    value: 'hydration',
    label: 'Hydration',
    description: 'Daily water intake. Values are converted to millilitres.',
    requiredHeaders: ['date', 'value', 'unit', 'source'],
    dropdownColumns: {
      unit: VOLUME_UNITS,
    },
    sample: [
      {
        date: today,
        value: '2.5',
        unit: 'L',
        source: 'CSV_Import',
      },
      {
        date: yesterday,
        value: '2100',
        unit: 'ml',
        source: 'CSV_Import',
      },
    ],
  },
  {
    value: 'mood',
    label: 'Mood',
    description:
      'One mood entry per day (re-importing a date overwrites it). ' +
      'mood_value is 10-100: 10 Tired, 20 Sad, 30 Angry, 40 Worried, 50 Neutral, ' +
      '60 Thoughtful, 70 Calm, 80 Confident, 90 Excited, 100 Happy. ' +
      'mood_tags is optional, pipe-separated (e.g. grateful|energetic).',
    requiredHeaders: ['date', 'mood_value', 'mood_tags', 'notes'],
    sample: [
      {
        date: today,
        mood_value: '80',
        mood_tags: 'grateful|energetic',
        notes: '',
      },
      {
        date: yesterday,
        mood_value: '40',
        mood_tags: '',
        notes: 'Rough day at work',
      },
    ],
  },
];

export const getCategoryConfig = (
  category: ImportCategory
): HealthImportCategoryConfig =>
  HEALTH_IMPORT_CATEGORIES.find((c) => c.value === category) ??
  HEALTH_IMPORT_CATEGORIES[0]!;
