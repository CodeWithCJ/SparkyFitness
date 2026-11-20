import type { CheckInMeasurementRange } from '../../types/measurements';

// Body measurement write-back (#2465): the daily check-in's body values, written
// to Health Connect (Android) and Apple Health (iOS). Pure rules shared by both
// platform writers (healthconnect/bodyWriteback.ts, healthkit/bodyWriteback.ts):
// which check-in field each metric reads, the time the record carries, and when
// another app's record already holds the same value.
//
// The check-in row stores one value per field per day with no time and no source,
// so a value imported from another app cannot be told apart from one typed in.
// Each metric is a separate opt-in switch, and a day is skipped when another app
// already has a record with the same value on it.

export type BodyWritebackMetricId =
  | 'weight'
  | 'bodyFat'
  | 'height'
  | 'waistCircumference'
  | 'boneMass'
  | 'bodyWaterMass';

/**
 * Start of every Health Connect clientRecordId body write-back writes. The read
 * side skips these by id rather than by this app's package, because the dev seed
 * tool also writes body records from this app and those must still be imported.
 */
export const BODY_CLIENT_RECORD_PREFIX = 'sparky-body-';

/** Metadata key on every Apple Health sample body write-back saves (same reason). */
export const BODY_WRITEBACK_METADATA_KEY = 'SparkyBodyWriteback';

const positive = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const percent = (value: unknown): number | null => {
  const n = positive(value);
  return n !== null && n <= 100 ? n : null;
};

/**
 * The day's value for a metric, in the unit the check-in stores it in (kg, cm,
 * percent), except body water: Health Connect only has it as a mass, so it is
 * the stored percentage of that day's weight, and null without a weight. Null
 * when the day has no usable value.
 */
export const bodyValueForDay = (
  metric: BodyWritebackMetricId,
  row: Partial<CheckInMeasurementRange> | undefined
): number | null => {
  if (!row) return null;
  switch (metric) {
    case 'weight':
      return positive(row.weight);
    case 'bodyFat':
      return percent(row.body_fat_percentage);
    case 'height':
      return positive(row.height);
    case 'waistCircumference':
      return positive(row.waist);
    case 'boneMass':
      return positive(row.bone_mass_kg);
    case 'bodyWaterMass': {
      const pct = percent(row.body_water_percentage);
      const weight = positive(row.weight);
      return pct !== null && weight !== null ? (pct / 100) * weight : null;
    }
  }
};

/**
 * 12:00 local time on the day, which is when the record is written: the check-in
 * keeps no time. Null while that is still in the future, so today's value waits
 * for the first sync after noon (the rule water from food already follows).
 */
export const bodyRecordTime = (
  date: string,
  now: Date = new Date()
): Date | null => {
  const [y, m, d] = date.split('-').map(Number);
  const noon = new Date(y, m - 1, d, 12, 0, 0, 0);
  return noon.getTime() < now.getTime() ? noon : null;
};

// How close another app's value must be to count as the same reading, in the
// units of bodyValueForDay. About half the step each value is usually shown in,
// so rounding on either side still matches.
const SAME_VALUE_TOLERANCE: Record<BodyWritebackMetricId, number> = {
  weight: 0.05,
  bodyFat: 0.1,
  height: 0.5,
  waistCircumference: 0.5,
  boneMass: 0.05,
  bodyWaterMass: 0.1,
};

/** True when one of another app's values on the day matches ours. */
export const matchesOtherAppValue = (
  metric: BodyWritebackMetricId,
  value: number,
  others: readonly number[]
): boolean =>
  others.some(
    (other) =>
      Number.isFinite(other) &&
      Math.abs(other - value) <= SAME_VALUE_TOLERANCE[metric] + 1e-9
  );

/** Local-day bounds of a YYYY-MM-DD day, for reading other apps' records. */
export const localDayBounds = (date: string): { start: Date; end: Date } => {
  const [y, m, d] = date.split('-').map(Number);
  return {
    start: new Date(y, m - 1, d, 0, 0, 0, 0),
    end: new Date(y, m - 1, d, 23, 59, 59, 999),
  };
};

/** Content signature of one day's write, so an unchanged day is skipped. */
export const bodyWriteSignature = (value: number | null, time: Date | null) =>
  value === null || time === null
    ? 'none'
    : `${value.toFixed(4)}@${time.getTime()}`;

/** Check-in rows from the range endpoint, by day. */
export const checkInRowsByDate = (
  rows: readonly CheckInMeasurementRange[] | null | undefined
): Map<string, CheckInMeasurementRange> => {
  const byDate = new Map<string, CheckInMeasurementRange>();
  for (const row of rows ?? []) {
    const day = String(row.entry_date).slice(0, 10);
    if (!byDate.has(day)) byDate.set(day, row);
  }
  return byDate;
};

/**
 * Of these per-day tracking keys, the ones whose stored id or UUID list still
 * names records. Removal uses it for body types it could not delete (their write
 * permission was taken away): only a type that has records the app wrote needs
 * its lists kept and the removal reported as incomplete; one that was never
 * turned on has none and is a successful no-op. A key that cannot be read is
 * kept, since what it names is unknown; a value that was read but is not a list
 * names nothing that could be deleted.
 */
export const keysNamingTrackedRecords = async (
  keys: readonly string[],
  readValue: (key: string) => Promise<string | null>
): Promise<string[]> => {
  const named: string[] = [];
  for (const key of keys) {
    let raw: string | null;
    try {
      raw = await readValue(key);
    } catch {
      named.push(key);
      continue;
    }
    try {
      const stored = JSON.parse(raw ?? '[]');
      if (Array.isArray(stored) && stored.length > 0) named.push(key);
    } catch {
      // Unreadable content names nothing we can delete.
    }
  }
  return named;
};
