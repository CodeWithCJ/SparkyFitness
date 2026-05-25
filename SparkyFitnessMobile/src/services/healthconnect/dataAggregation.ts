import { type TransformedRecord } from '../../types/healthRecords';
import { toLocalDateString } from '../../utils/dateUtils';

// Re-export for backward compatibility
export { toLocalDateString };

export const aggregateByDay = (
  records: TransformedRecord[],
  baseType: string,
  unit: string,
  strategy: 'min-max-avg' | 'sum' | 'last'
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
      ...(record_utc_offset_minutes != null ? { record_utc_offset_minutes } : {}),
    };

    if (strategy === 'min-max-avg') {
      let min = dayRecords[0].value;
      let max = dayRecords[0].value;
      let total = 0;
      for (const rec of dayRecords) {
        if (rec.value < min) min = rec.value;
        if (rec.value > max) max = rec.value;
        total += rec.value;
      }
      const avg = total / dayRecords.length;
      result.push(
        { value: parseFloat(min.toFixed(2)), type: `${baseType}_min`, date, unit, source: dayRecords[0].source, ...tz },
        { value: parseFloat(max.toFixed(2)), type: `${baseType}_max`, date, unit, source: dayRecords[0].source, ...tz },
        { value: parseFloat(avg.toFixed(2)), type: `${baseType}_avg`, date, unit, source: dayRecords[0].source, ...tz },
      );
    } else if (strategy === 'sum') {
      let total = 0;
      for (const rec of dayRecords) {
        total += rec.value;
      }
      result.push({ value: parseFloat(total.toFixed(2)), type: baseType, date, unit, source: dayRecords[0].source, ...tz });
    } else if (strategy === 'last') {
      // Take first record: source queries return newest-first ordering
      result.push({ value: dayRecords[0].value, type: baseType, date, unit, source: dayRecords[0].source, ...tz });
    }
  }

  return result;
};
