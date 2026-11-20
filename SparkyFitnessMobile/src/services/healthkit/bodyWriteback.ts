import {
  saveQuantitySample,
  deleteObjects,
  queryQuantitySamples,
} from '@kingstinct/react-native-healthkit';
import { addLog } from '../LogService';
import { loadHealthPreference, saveHealthPreference } from './preferences';
import {
  BODY_WRITEBACK_METADATA_KEY,
  bodyRecordTime,
  bodyValueForDay,
  bodyWriteSignature,
  localDayBounds,
  matchesOtherAppValue,
  type BodyWritebackMetricId,
} from '../shared/bodyWriteback';
import type { CheckInMeasurementRange } from '../../types/measurements';
import { isOwnWrittenBodySample } from './dataTransformation';

// Body measurement write-back (#2465) to Apple Health: one quantity sample per
// metric per day at 12:00 local time, replaced when the day's value changes
// (delete the UUIDs saved last time, then save, as water does). Each sample
// carries BODY_WRITEBACK_METADATA_KEY so the read side skips it. Units: kg and
// cm as stored; body fat is a 0 to 1 fraction in HealthKit's '%' unit.

type HealthKitBodyMetricId = Extract<
  BodyWritebackMetricId,
  'weight' | 'bodyFat' | 'height' | 'waistCircumference'
>;

const IDENTIFIER = {
  weight: 'HKQuantityTypeIdentifierBodyMass',
  bodyFat: 'HKQuantityTypeIdentifierBodyFatPercentage',
  height: 'HKQuantityTypeIdentifierHeight',
  waistCircumference: 'HKQuantityTypeIdentifierWaistCircumference',
} as const;

type BodyIdentifier = (typeof IDENTIFIER)[HealthKitBodyMetricId];

/** Every sample type body write-back saves, for the write gate and removal. */
export const HEALTHKIT_BODY_IDENTIFIERS: BodyIdentifier[] =
  Object.values(IDENTIFIER);

export const isHealthKitBodyMetric = (
  id: string
): id is HealthKitBodyMetricId => id in IDENTIFIER;

export const bodyIdentifierFor = (
  metric: HealthKitBodyMetricId
): BodyIdentifier => IDENTIFIER[metric];

const PERCENT_PER_FRACTION = 100;

/**
 * The unit and quantity HealthKit is given for a day's value (kg, cm, percent).
 * The '%' unit is a fraction, so 25 % body fat is saved as 0.25.
 */
export const bodyQuantityFor = (
  metric: HealthKitBodyMetricId,
  value: number
): { unit: 'kg' | '%' | 'cm'; quantity: number } => {
  switch (metric) {
    case 'weight':
      return { unit: 'kg', quantity: value };
    case 'bodyFat':
      return { unit: '%', quantity: value / PERCENT_PER_FRACTION };
    case 'height':
    case 'waistCircumference':
      return { unit: 'cm', quantity: value };
  }
};

/** Values other apps saved on the day, in the units bodyValueForDay uses. */
const otherAppValues = async (
  metric: HealthKitBodyMetricId,
  date: string
): Promise<number[]> => {
  const { start, end } = localDayBounds(date);
  const { unit } = bodyQuantityFor(metric, 0);
  const samples = await queryQuantitySamples(IDENTIFIER[metric], {
    ascending: false,
    limit: 0,
    unit,
    filter: { date: { startDate: start, endDate: end } },
  });
  if (!Array.isArray(samples)) return [];
  return samples
    .filter((s) => !isOwnWrittenBodySample(s))
    .map((s) =>
      metric === 'bodyFat' ? s.quantity * PERCENT_PER_FRACTION : s.quantity
    );
};

const capitalized = (metric: string) =>
  metric.charAt(0).toUpperCase() + metric.slice(1);
const uuidsKey = (metric: HealthKitBodyMetricId, date: string) =>
  `writebackBody${capitalized(metric)}Uuids:${date}`;
const sigKey = (metric: HealthKitBodyMetricId, date: string) =>
  `writebackBody${capitalized(metric)}Sig:${date}`;

/**
 * Write one body metric for one day. Skips an unchanged day, waits for noon on
 * today, saves nothing when another app already has the same value (HealthKit
 * hides whether read access was given, so a denied read just finds nothing and
 * the value is saved), and deletes what it saved before when the value changed or
 * was cleared. A failed delete keeps those UUIDs and the old signature, so the
 * next run tries again rather than leaving a stray sample.
 */
export const writeBodyMetricForDate = async (
  metric: HealthKitBodyMetricId,
  date: string,
  row: CheckInMeasurementRange | undefined,
  version: number,
  now: Date = new Date()
): Promise<void> => {
  const label = `[Writeback] Body ${metric} ${date}`;
  const value = bodyValueForDay(metric, row);
  const time = value === null ? null : bodyRecordTime(date, now);
  if (value !== null && time === null) {
    addLog(`${label}: deferred until noon`, 'DEBUG');
    return;
  }

  const signature = bodyWriteSignature(value, time);
  if (
    signature === (await loadHealthPreference<string>(sigKey(metric, date)))
  ) {
    addLog(`${label}: unchanged — skipped`, 'DEBUG');
    return;
  }

  let save = value !== null && time !== null;
  if (save && value !== null) {
    try {
      if (
        matchesOtherAppValue(metric, value, await otherAppValues(metric, date))
      ) {
        addLog(`${label}: another app has the same value — skipped`, 'INFO');
        save = false;
      }
    } catch (error) {
      // Without the read the day is written, as without read access.
      addLog(
        `${label}: could not read other apps' values: ${error instanceof Error ? error.message : String(error)}`,
        'WARNING'
      );
    }
  }

  const previous =
    (await loadHealthPreference<string[]>(uuidsKey(metric, date))) ?? [];
  if (previous.length > 0) {
    try {
      await deleteObjects(IDENTIFIER[metric], { uuids: previous });
    } catch (error) {
      addLog(
        `${label}: failed to delete the previous sample: ${error instanceof Error ? error.message : String(error)}`,
        'WARNING'
      );
      return;
    }
  }

  const tracked: string[] = [];
  let saved = true;
  if (save && value !== null && time !== null) {
    const { unit, quantity } = bodyQuantityFor(metric, value);
    const result = await saveQuantitySample(
      IDENTIFIER[metric],
      unit,
      quantity,
      time,
      time,
      { [BODY_WRITEBACK_METADATA_KEY]: `${metric}-${date}-${version}` }
    );
    if (result?.uuid) tracked.push(result.uuid);
    else saved = false;
  }

  await saveHealthPreference(uuidsKey(metric, date), tracked);
  if (saved) await saveHealthPreference(sigKey(metric, date), signature);
  addLog(`${label}: wrote ${tracked.length} sample(s)`, 'INFO');
};
