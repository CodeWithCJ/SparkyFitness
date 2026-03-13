import { addLog } from '../LogService';
import {
  HCHeartRateRecord,
  HCStepsRecord,
  HCEnergyRecord,
  HeartRateAccumulator,
  SumAccumulator,
  AggregatedHealthRecord,
  type TransformedRecord,
} from '../../types/healthRecords';
import { toLocalDateString } from '../../utils/dateUtils';

// Re-export for backward compatibility
export { toLocalDateString };

export const aggregateHeartRateByDate = (records: HCHeartRateRecord[]): AggregatedHealthRecord[] => {
  if (!Array.isArray(records)) {
    addLog(`[HealthConnectService] aggregateHeartRateByDate received non-array records`, 'WARNING');
    return [];
  }

  const validRecords = records.filter(record =>
    record.startTime && record.samples && Array.isArray(record.samples)
  );

  if (validRecords.length === 0) {
    return [];
  }

  const aggregatedData = validRecords.reduce<HeartRateAccumulator>((acc, record) => {
    try {
      const date = toLocalDateString(record.startTime);
      const heartRate = record.samples.reduce((sum, sample) =>
        sum + (sample.beatsPerMinute || 0), 0) / record.samples.length;

      if (!acc[date]) {
        acc[date] = { total: 0, count: 0 };
      }
      acc[date].total += heartRate;
      acc[date].count++;
    } catch (error) {
      addLog(`[HealthConnectService] Error processing heart rate record: ${(error as Error).message}`, 'WARNING');
    }

    return acc;
  }, {});

  const result: AggregatedHealthRecord[] = Object.keys(aggregatedData).map(date => ({
    date,
    value: aggregatedData[date].count > 0 ? Math.round(aggregatedData[date].total / aggregatedData[date].count) : 0,
    type: 'heart_rate',
  }));

  return result;
};

export const aggregateStepsByDate = (records: HCStepsRecord[]): AggregatedHealthRecord[] => {
  if (!Array.isArray(records)) {
    addLog(`[HealthConnectService] aggregateStepsByDate received non-array records`, 'WARNING');
    return [];
  }

  const validRecords = records.filter(record =>
    record.startTime && typeof record.count === 'number'
  );

  if (validRecords.length === 0) {
    return [];
  }

  const aggregatedData = validRecords.reduce<SumAccumulator>((acc, record) => {
    try {
      // Use endTime for steps to avoid previous day assignment
      // If endTime doesn't exist, fall back to startTime
      const timeToUse = record.endTime || record.startTime;
      const date = toLocalDateString(timeToUse);
      const steps = record.count;

      if (!acc[date]) {
        acc[date] = 0;
      }
      acc[date] += steps;
    } catch (error) {
      addLog(`[HealthConnectService] Error processing step record: ${(error as Error).message}`, 'WARNING');
    }

    return acc;
  }, {});

  const result: AggregatedHealthRecord[] = Object.keys(aggregatedData).map(date => ({
    date,
    value: aggregatedData[date],
    type: 'step',
  }));

  return result;
};

export const aggregateTotalCaloriesByDate = (records: HCEnergyRecord[]): AggregatedHealthRecord[] => {
  if (!Array.isArray(records)) {
    addLog(`[HealthConnectService] aggregateTotalCaloriesByDate received non-array records`, 'WARNING');
    return [];
  }

  const validRecords = records.filter(record =>
    record.startTime && record.energy && (typeof record.energy.inCalories === 'number' || typeof record.energy.inKilocalories === 'number')
  );

  if (validRecords.length === 0) {
    return [];
  }

  const aggregatedData = validRecords.reduce<SumAccumulator>((acc, record) => {
    try {
      // Use endTime for total calories to avoid previous day assignment (consistent with Steps)
      // If endTime doesn't exist, fall back to startTime
      const timeToUse = record.endTime || record.startTime;
      const date = toLocalDateString(timeToUse);

      let valInKcal = 0;

      if (record.energy.inKilocalories !== undefined) {
        valInKcal = record.energy.inKilocalories;
      } else if (record.energy.inCalories !== undefined) {
        const rawVal = record.energy.inCalories;
        // Heuristic: if value > 10,000, it's likely raw calories.
        // 10,000 kcal is an insane amount for one record/day usually.
        // If it's raw calories, divide by 1000.
        if (rawVal > 10000) {
          valInKcal = rawVal / 1000;
        } else {
          valInKcal = rawVal;
        }
      }

      if (!acc[date]) {
        acc[date] = 0;
      }
      acc[date] += valInKcal;
    } catch (error) {
      addLog(`[HealthConnectService] Error processing total calories record: ${(error as Error).message}`, 'WARNING');
    }

    return acc;
  }, {});

  const result: AggregatedHealthRecord[] = Object.keys(aggregatedData).map(date => ({
    date,
    value: aggregatedData[date],
    type: 'total_calories',
  }));

  return result;
};

export const aggregateActiveCaloriesByDate = (records: HCEnergyRecord[]): AggregatedHealthRecord[] => {
  if (!Array.isArray(records)) {
    addLog(`[HealthConnectService] aggregateActiveCaloriesByDate received non-array records`, 'WARNING');
    return [];
  }

  const validRecords = records.filter(record =>
    record.startTime && record.energy &&
    (typeof record.energy.inCalories === 'number' || typeof record.energy.inKilocalories === 'number')
  );

  if (validRecords.length === 0) {
    return [];
  }

  const aggregatedData = validRecords.reduce<SumAccumulator>((acc, record) => {
    try {
      const date = toLocalDateString(record.startTime);

      // Health Connect can return values in 'calories' (large number) or 'kilocalories' (small number).
      // We need to normalize to kilocalories.
      // 1. Try to get explicit kilocalories if available
      // 2. Fall back to calories, but check magnitude

      let valInKcal = 0;

      if (record.energy && record.energy.inKilocalories !== undefined) {
        valInKcal = record.energy.inKilocalories;
      } else if (record.energy && record.energy.inCalories !== undefined) {
        const rawVal = record.energy.inCalories;
        // Heuristic: if value > 10,000, it's likely raw calories (unless they ran an ultramarathon).
        // 10,000 kcal is an insane amount for one record/day usually.
        // If it's raw calories, divide by 1000.
        if (rawVal > 10000) {
          valInKcal = rawVal / 1000;
        } else {
          valInKcal = rawVal;
        }
      }

      if (!acc[date]) {
        acc[date] = 0;
      }
      acc[date] += valInKcal;
    } catch (error) {
      addLog(`[HealthConnectService] Error processing active calories record: ${(error as Error).message}`, 'WARNING');
    }

    return acc;
  }, {});

  const result: AggregatedHealthRecord[] = Object.keys(aggregatedData).map(date => ({
    date,
    value: aggregatedData[date],
    type: 'Active Calories',
  }));

  return result;
};

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
        { value: parseFloat(min.toFixed(2)), type: `${baseType}_min`, date, unit, source: dayRecords[0].source },
        { value: parseFloat(max.toFixed(2)), type: `${baseType}_max`, date, unit, source: dayRecords[0].source },
        { value: parseFloat(avg.toFixed(2)), type: `${baseType}_avg`, date, unit, source: dayRecords[0].source },
      );
    } else if (strategy === 'sum') {
      let total = 0;
      for (const rec of dayRecords) {
        total += rec.value;
      }
      result.push({ value: parseFloat(total.toFixed(2)), type: baseType, date, unit, source: dayRecords[0].source });
    } else if (strategy === 'last') {
      // Take first record: source queries return newest-first ordering
      result.push({ value: dayRecords[0].value, type: baseType, date, unit, source: dayRecords[0].source });
    }
  }

  return result;
};
