import {
  insertRecords,
  deleteRecordsByUuids,
  readRecords,
  RecordingMethod,
  type HealthConnectRecord,
} from 'react-native-health-connect';
import { addLog } from '../LogService';
import { loadHealthPreference, saveHealthPreference } from './preferences';
import { isOwnWrittenBodyRecord } from './dataTransformation';
import {
  BODY_CLIENT_RECORD_PREFIX,
  bodyRecordTime,
  bodyValueForDay,
  bodyWriteSignature,
  localDayBounds,
  matchesOtherAppValue,
  type BodyWritebackMetricId,
} from '../shared/bodyWriteback';
import type { CheckInMeasurementRange } from '../../types/measurements';

// Body measurement write-back (#2465) to Health Connect: one instantaneous record
// per metric per day at 12:00 local time, replaced when the day's value changes
// (delete the ids written last time, insert a fresh id, as nutrition does).
// Units are the store's own: Mass in kilograms, Height in meters (Health Connect
// has no centimeters), BodyFat as a 0 to 100 percentage.

type HealthConnectBodyMetricId = Exclude<
  BodyWritebackMetricId,
  'waistCircumference'
>;

export type HealthConnectBodyRecordType =
  'Weight' | 'BodyFat' | 'Height' | 'BoneMass' | 'BodyWaterMass';

const RECORD_TYPE: Record<
  HealthConnectBodyMetricId,
  HealthConnectBodyRecordType
> = {
  weight: 'Weight',
  bodyFat: 'BodyFat',
  height: 'Height',
  boneMass: 'BoneMass',
  bodyWaterMass: 'BodyWaterMass',
};

/** Every record type body write-back writes, for removing them. */
export const HEALTH_CONNECT_BODY_RECORD_TYPES: HealthConnectBodyRecordType[] =
  Object.values(RECORD_TYPE);

export const isHealthConnectBodyMetric = (
  id: string
): id is HealthConnectBodyMetricId => id in RECORD_TYPE;

const CM_PER_M = 100;

/** Fresh per-run id (see writebackMappers for why ids are never reused). */
export const bodyClientRecordId = (
  metric: HealthConnectBodyMetricId,
  date: string,
  version: number
): string => `${BODY_CLIENT_RECORD_PREFIX}${metric}-${date}-${version}`;

/** One day's value as a Health Connect record, in the record's own units. */
export const bodyValueToRecord = (
  metric: HealthConnectBodyMetricId,
  date: string,
  value: number,
  time: Date,
  version: number
): HealthConnectRecord => {
  const base = {
    time: time.toISOString(),
    metadata: {
      clientRecordId: bodyClientRecordId(metric, date, version),
      clientRecordVersion: version,
      recordingMethod: RecordingMethod.RECORDING_METHOD_MANUAL_ENTRY,
    },
  };
  switch (metric) {
    case 'weight':
      return {
        ...base,
        recordType: 'Weight',
        weight: { value, unit: 'kilograms' },
      } as HealthConnectRecord;
    case 'bodyFat':
      return {
        ...base,
        recordType: 'BodyFat',
        percentage: value,
      } as HealthConnectRecord;
    case 'height':
      return {
        ...base,
        recordType: 'Height',
        height: { value: value / CM_PER_M, unit: 'meters' },
      } as HealthConnectRecord;
    case 'boneMass':
      return {
        ...base,
        recordType: 'BoneMass',
        mass: { value, unit: 'kilograms' },
      } as HealthConnectRecord;
    case 'bodyWaterMass':
      return {
        ...base,
        recordType: 'BodyWaterMass',
        mass: { value, unit: 'kilograms' },
      } as HealthConnectRecord;
  }
};

const nested = (rec: Record<string, unknown>, field: string, key: string) => {
  const inner = rec[field] as Record<string, unknown> | undefined;
  const value = inner?.[key];
  return typeof value === 'number' ? value : null;
};

/** A read record's value in the units bodyValueForDay uses (kg, cm, percent). */
export const bodyValueFromRecord = (
  metric: HealthConnectBodyMetricId,
  rec: Record<string, unknown>
): number | null => {
  switch (metric) {
    case 'weight':
      return nested(rec, 'weight', 'inKilograms');
    case 'bodyFat':
      return typeof rec.percentage === 'number'
        ? rec.percentage
        : nested(rec, 'percentage', 'inPercent');
    case 'height': {
      const meters = nested(rec, 'height', 'inMeters');
      return meters === null ? null : meters * CM_PER_M;
    }
    case 'boneMass':
    case 'bodyWaterMass':
      return nested(rec, 'mass', 'inKilograms');
  }
};

/** Values other apps recorded on the day, never this write-back's own. */
const otherAppValues = async (
  metric: HealthConnectBodyMetricId,
  date: string
): Promise<number[]> => {
  const { start, end } = localDayBounds(date);
  const values: number[] = [];
  let pageToken: string | undefined;
  do {
    const page = await readRecords(RECORD_TYPE[metric], {
      timeRangeFilter: {
        operator: 'between',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
      pageToken,
    });
    for (const rec of page.records as unknown as Record<string, unknown>[]) {
      if (isOwnWrittenBodyRecord(rec)) continue;
      const value = bodyValueFromRecord(metric, rec);
      if (value !== null) values.push(value);
    }
    pageToken = page.pageToken || undefined;
  } while (pageToken);
  return values;
};

const capitalized = (metric: string) =>
  metric.charAt(0).toUpperCase() + metric.slice(1);
const idsKey = (metric: HealthConnectBodyMetricId, date: string) =>
  `writebackBody${capitalized(metric)}Ids:${date}`;
const sigKey = (metric: HealthConnectBodyMetricId, date: string) =>
  `writebackBody${capitalized(metric)}Sig:${date}`;

/**
 * Write one body metric for one day. Skips an unchanged day, waits for noon on
 * today, writes nothing when another app already recorded the same value (only
 * checked with read access, `canReadOthers`), and removes what it wrote before
 * when the value changed or was cleared. Errors propagate so the caller can stop
 * on a quota error.
 */
export const writeBodyMetricForDate = async (
  metric: HealthConnectBodyMetricId,
  date: string,
  row: CheckInMeasurementRange | undefined,
  version: number,
  canReadOthers: boolean,
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

  const records: HealthConnectRecord[] = [];
  if (value !== null && time !== null) {
    const duplicate =
      canReadOthers &&
      matchesOtherAppValue(metric, value, await otherAppValues(metric, date));
    if (duplicate) {
      addLog(`${label}: another app has the same value — skipped`, 'INFO');
    } else {
      records.push(bodyValueToRecord(metric, date, value, time, version));
    }
  }

  const previous =
    (await loadHealthPreference<string[]>(idsKey(metric, date))) ?? [];
  if (previous.length > 0) {
    await deleteRecordsByUuids(RECORD_TYPE[metric], [], previous);
  }
  if (records.length > 0) {
    await insertRecords(records);
  }
  await saveHealthPreference(
    idsKey(metric, date),
    records
      .map((r) => r.metadata?.clientRecordId)
      .filter((id): id is string => id != null)
  );
  await saveHealthPreference(sigKey(metric, date), signature);
  addLog(`${label}: wrote ${records.length} record(s)`, 'INFO');
};
