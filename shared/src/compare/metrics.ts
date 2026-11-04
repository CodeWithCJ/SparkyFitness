// The metrics Compare can pair, and how each one is measured. Apps translate the keys.

export type CompareMetricKind = 'continuous' | 'ordinal' | 'binary';
/** A day without a record: `event` is 0 after the first record, `food` is missing when nothing was logged, `plain` is missing. */
export type CompareMissingRule = 'event' | 'food' | 'plain';
export type CompareWeeklyRule = 'sum' | 'mean' | 'daysYes' | null; // null = not offered in week mode

export interface CompareMetricDef {
  key: CompareMetricKey;
  group: 'feelings' | 'sleep' | 'meditation' | 'food' | 'training' | 'body';
  kind: CompareMetricKind;
  unit: string;
  missing: CompareMissingRule;
  weekly: CompareWeeklyRule;
  /** False when since mode cannot give an honest answer for the metric (it drifts too slowly). */
  since: boolean;
  /**
   * The value on a day is read over the 7 days ending on it (a trailing window), not from that
   * day alone, so a value above 0 does not mean the thing was done that day: a rolling habit has
   * no suggested start and no regularity in since mode.
   */
  rolling: boolean;
}

export const COMPARE_METRIC_KEYS = [
  'mood',
  'energy',
  'focus',
  'timeAsleep',
  'sleepScore',
  'overnightHrv',
  'restingHeartRate',
  'bedtime',
  'bedtimeConsistency',
  'meditationMinutes',
  'meditationSessions7d',
  'meditated',
  'calories',
  'protein',
  'carbs',
  'fat',
  'caffeine',
  'alcohol',
  'workoutMinutes',
  'cardioMinutes',
  'strengthVolume',
  'trainingLoad',
  'weightTrend',
  'steps',
] as const;

export type CompareMetricKey = (typeof COMPARE_METRIC_KEYS)[number];

type Rules = Partial<
  Pick<CompareMetricDef, 'kind' | 'missing' | 'weekly' | 'since' | 'rolling'>
>;

/** A continuous, plain, day-by-day metric averaged per week unless `rules` says otherwise. */
function metric(
  key: CompareMetricKey,
  group: CompareMetricDef['group'],
  unit: string,
  rules: Rules = {}
): CompareMetricDef {
  return {
    key,
    group,
    kind: 'continuous',
    unit,
    missing: 'plain',
    weekly: 'mean',
    since: true,
    rolling: false,
    ...rules,
  };
}

const ORDINAL: Rules = { kind: 'ordinal' };
const EVENT: Rules = { missing: 'event', weekly: 'sum' };
const FOOD: Rules = { missing: 'food' };

export const COMPARE_METRICS: Record<CompareMetricKey, CompareMetricDef> = {
  mood: metric('mood', 'feelings', '10-100'),
  energy: metric('energy', 'feelings', '1-5', ORDINAL),
  focus: metric('focus', 'feelings', '1-5', ORDINAL),
  timeAsleep: metric('timeAsleep', 'sleep', 'h'),
  sleepScore: metric('sleepScore', 'sleep', 'score'),
  overnightHrv: metric('overnightHrv', 'sleep', 'ms'),
  restingHeartRate: metric('restingHeartRate', 'sleep', 'bpm'),
  bedtime: metric('bedtime', 'sleep', 'min-after-18:00'),
  bedtimeConsistency: metric('bedtimeConsistency', 'sleep', 'min', {
    rolling: true,
  }),
  meditationMinutes: metric('meditationMinutes', 'meditation', 'min', EVENT),
  meditationSessions7d: metric(
    'meditationSessions7d',
    'meditation',
    'sessions',
    { missing: 'event', weekly: null, rolling: true }
  ),
  meditated: metric('meditated', 'meditation', 'yes/no', {
    kind: 'binary',
    missing: 'event',
    weekly: 'daysYes',
  }),
  calories: metric('calories', 'food', 'kcal', FOOD),
  protein: metric('protein', 'food', 'g', FOOD),
  carbs: metric('carbs', 'food', 'g', FOOD),
  fat: metric('fat', 'food', 'g', FOOD),
  caffeine: metric('caffeine', 'food', 'mg', FOOD),
  alcohol: metric('alcohol', 'food', 'g', FOOD),
  workoutMinutes: metric('workoutMinutes', 'training', 'min', EVENT),
  cardioMinutes: metric('cardioMinutes', 'training', 'min', EVENT),
  strengthVolume: metric('strengthVolume', 'training', 'kg', EVENT),
  trainingLoad: metric('trainingLoad', 'training', 'points', EVENT),
  weightTrend: metric('weightTrend', 'body', 'kg', { since: false }),
  steps: metric('steps', 'body', 'steps'),
};

/** Whether a metric can be asked in a mode: week needs a weekly form, since needs the `since` flag. */
export function offeredInMode(
  key: CompareMetricKey,
  mode: 'day' | 'week' | 'since'
): boolean {
  if (mode === 'week') return COMPARE_METRICS[key].weekly !== null;
  if (mode === 'since') return COMPARE_METRICS[key].since;
  return true;
}

/** Sleep metrics are dated by the day the person woke, so a sleep metric's day is the night before it. */
export function isSleepMetric(key: CompareMetricKey): boolean {
  return COMPARE_METRICS[key].group === 'sleep';
}

/** Mood is stored 10-100 and shown 1-10; every other metric shows as stored. */
export function compareDisplayValue(
  key: CompareMetricKey,
  value: number
): number {
  return key === 'mood' ? value / 10 : value;
}

/** Units whose values are counts or whole minutes, shown without decimals. */
const WHOLE_UNITS: ReadonlySet<string> = new Set([
  'steps',
  'kcal',
  'min',
  'sessions',
  'yes/no',
]);

/** Decimals a metric is shown with: counts and minutes whole, everything else one. */
export function compareDigits(key: CompareMetricKey): 0 | 1 {
  return key === 'bedtime' || WHOLE_UNITS.has(COMPARE_METRICS[key].unit)
    ? 0
    : 1;
}

/** Bedtime counts from 18:00, so 23:30 and 00:30 sit an hour apart. */
export const BEDTIME_ORIGIN_MINUTES = 18 * 60;
const MINUTES_PER_DAY = 24 * 60;

/** A bedtime value (minutes after 18:00) as a 24-hour "HH:MM" clock time. */
export function bedtimeClock(value: number): string {
  const minutes =
    (((BEDTIME_ORIGIN_MINUTES + Math.round(value)) % MINUTES_PER_DAY) +
      MINUTES_PER_DAY) %
    MINUTES_PER_DAY;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
