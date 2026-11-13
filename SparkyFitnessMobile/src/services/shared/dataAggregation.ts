import { type TransformedRecord } from '../../types/healthRecords';

const TIME_AVG_BUCKET_MS = 5 * 60 * 1000;

/**
 * Mean of 5-minute bucket means. Heart rate arrives about once per second during
 * a workout and about once per minute otherwise, so a plain mean over all samples
 * is dominated by workout minutes. Each covered 5-minute stretch counts once here,
 * empty stretches are skipped. Returns null if any record lacks a parseable
 * timestamp, so the caller can fall back to the plain mean.
 */
const timeWeightedAverage = (records: TransformedRecord[]): number | null => {
  const buckets = new Map<number, { sum: number; count: number }>();
  for (const rec of records) {
    const ms = rec.timestamp != null ? Date.parse(rec.timestamp) : NaN;
    if (Number.isNaN(ms)) return null;
    const key = Math.floor(ms / TIME_AVG_BUCKET_MS);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.sum += rec.value;
      bucket.count += 1;
    } else {
      buckets.set(key, { sum: rec.value, count: 1 });
    }
  }
  let total = 0;
  for (const { sum, count } of buckets.values()) {
    total += sum / count;
  }
  return total / buckets.size;
};

/**
 * Groups transformed records by their local-day date string and reduces each day
 * with the metric's aggregation strategy. Platform-neutral: both the HealthKit and
 * Health Connect pipelines produce TransformedRecord inputs and expect this exact
 * output contract (min-max-avg emits exactly 3 records per day).
 * min-max-time-avg emits the same 3 records, with the average weighted by time
 * (see timeWeightedAverage) when every record of the day carries a timestamp.
 */
export const aggregateByDay = (
  records: TransformedRecord[],
  baseType: string,
  unit: string,
  strategy: 'min-max-avg' | 'min-max-time-avg' | 'sum' | 'last'
): TransformedRecord[] => {
  if (records.length === 0) return [];

  const groups = new Map<string, TransformedRecord[]>();
  for (const record of records) {
    const existing = groups.get(record.date);
    if (existing) {
      existing.push(record);
    } else {
      groups.set(record.date, [record]);
    }
  }

  const result: TransformedRecord[] = [];

  for (const [date, dayRecords] of groups) {
    // Propagate timezone metadata from the first record of the day group
    const { record_timezone, record_utc_offset_minutes } = dayRecords[0];
    const tz = {
      ...(record_timezone != null ? { record_timezone } : {}),
      ...(record_utc_offset_minutes != null
        ? { record_utc_offset_minutes }
        : {}),
    };

    if (strategy === 'min-max-avg' || strategy === 'min-max-time-avg') {
      let min = dayRecords[0].value;
      let max = dayRecords[0].value;
      let total = 0;
      for (const rec of dayRecords) {
        if (rec.value < min) min = rec.value;
        if (rec.value > max) max = rec.value;
        total += rec.value;
      }
      const avg =
        (strategy === 'min-max-time-avg'
          ? timeWeightedAverage(dayRecords)
          : null) ?? total / dayRecords.length;
      result.push(
        {
          value: parseFloat(min.toFixed(2)),
          type: `${baseType}_min`,
          date,
          unit,
          source: dayRecords[0].source,
          ...tz,
        },
        {
          value: parseFloat(max.toFixed(2)),
          type: `${baseType}_max`,
          date,
          unit,
          source: dayRecords[0].source,
          ...tz,
        },
        {
          value: parseFloat(avg.toFixed(2)),
          type: `${baseType}_avg`,
          date,
          unit,
          source: dayRecords[0].source,
          ...tz,
        }
      );
    } else if (strategy === 'sum') {
      let total = 0;
      for (const rec of dayRecords) {
        total += rec.value;
      }
      result.push({
        value: parseFloat(total.toFixed(2)),
        type: baseType,
        date,
        unit,
        source: dayRecords[0].source,
        ...tz,
      });
    } else if (strategy === 'last') {
      // HealthKit-only strategy today; HK reads return newest-first so [0] is most
      // recent. No HC metric uses 'last' — if added, note HC reads default ascending.
      result.push({
        value: dayRecords[0].value,
        type: baseType,
        date,
        unit,
        source: dayRecords[0].source,
        ...tz,
      });
    }
  }

  return result;
};
