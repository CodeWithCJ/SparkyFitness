import { addLog } from '../LogService';

export const aggregateHeartRateByDate = (records) => {
  if (!Array.isArray(records)) {
    addLog(`[HealthConnectService] aggregateHeartRateByDate received non-array records: ${JSON.stringify(records)}`, 'warn', 'WARNING');
    console.warn('aggregateHeartRateByDate received non-array records:', records);
    return [];
  }

  const validRecords = records.filter(record =>
    record.startTime && record.samples && Array.isArray(record.samples)
  );

  if (validRecords.length === 0) {
    addLog(`[HealthConnectService] No valid heart rate records to aggregate`);
    return [];
  }

  addLog(`[HealthConnectService] Aggregating ${validRecords.length} heart rate records`);

  const aggregatedData = validRecords.reduce((acc, record) => {
    try {
      const date = record.startTime.split('T')[0];
      const heartRate = record.samples.reduce((sum, sample) =>
        sum + (sample.beatsPerMinute || 0), 0) / record.samples.length;

      if (!acc[date]) {
        acc[date] = { total: 0, count: 0 };
      }
      acc[date].total += heartRate;
      acc[date].count++;
    } catch (error) {
      addLog(`[HealthConnectService] Error processing heart rate record: ${error.message}`, 'warn', 'WARNING');
    }

    return acc;
  }, {});

  const result = Object.keys(aggregatedData).map(date => ({
    date,
    value: aggregatedData[date].count > 0 ? Math.round(aggregatedData[date].total / aggregatedData[date].count) : 0,
    type: 'heart_rate',
  }));

  addLog(`[HealthConnectService] Aggregated heart rate data into ${result.length} daily entries`);
  return result;
};

export const aggregateStepsByDate = (records) => {
  if (!Array.isArray(records)) {
    addLog(`[HealthConnectService] aggregateStepsByDate received non-array records: ${JSON.stringify(records)}`, 'warn', 'WARNING');
    console.warn('aggregateStepsByDate received non-array records:', records);
    return [];
  }

  const validRecords = records.filter(record =>
    record.startTime && typeof record.count === 'number'
  );

  if (validRecords.length === 0) {
    addLog(`[HealthConnectService] No valid step records to aggregate`);
    return [];
  }

  addLog(`[HealthConnectService] Aggregating ${validRecords.length} step records`);

  const aggregatedData = validRecords.reduce((acc, record) => {
    try {
      // Use endTime for steps to avoid previous day assignment
      // If endTime doesn't exist, fall back to startTime
      const timeToUse = record.endTime || record.startTime;
      const date = timeToUse.split('T')[0];
      const steps = record.count;

      if (!acc[date]) {
        acc[date] = 0;
      }
      acc[date] += steps;
    } catch (error) {
      addLog(`[HealthConnectService] Error processing step record: ${error.message}`, 'warn', 'WARNING');
    }

    return acc;
  }, {});

  const result = Object.keys(aggregatedData).map(date => ({
    date,
    value: aggregatedData[date],
    type: 'step',
  }));

  addLog(`[HealthConnectService] Aggregated step data into ${result.length} daily entries`);
  return result;
};

export const aggregateTotalCaloriesByDate = async (records) => {
  if (!Array.isArray(records)) {
    addLog(`[HealthConnectService] aggregateTotalCaloriesByDate received non-array records: ${JSON.stringify(records)}`, 'warn', 'WARNING');
    console.warn('aggregateTotalCaloriesByDate received non-array records:', records);
    return [];
  }

  const validRecords = records.filter(record =>
    record.startTime && record.energy && (typeof record.energy.inCalories === 'number' || typeof record.energy.inKilocalories === 'number')
  );

  if (validRecords.length === 0) {
    addLog(`[HealthConnectService] No valid total calories records to aggregate`);
    return [];
  }

  addLog(`[HealthConnectService] Aggregating ${validRecords.length} total calories records`);

  const aggregatedData = validRecords.reduce((acc, record) => {
    try {
      // Use endTime for total calories to avoid previous day assignment (consistent with Steps)
      // If endTime doesn't exist, fall back to startTime
      const timeToUse = record.endTime || record.startTime;
      const date = timeToUse.split('T')[0];

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
      addLog(`[HealthConnectService] Error processing total calories record: ${error.message}`, 'warn', 'WARNING');
    }

    return acc;
  }, {});

  const result = Object.keys(aggregatedData).map(date => ({
    date,
    value: aggregatedData[date],
    type: 'total_calories',
  }));

  addLog(`[HealthConnectService] Aggregated total calories data into ${result.length} daily entries`);
  return result;
};

export const aggregateActiveCaloriesByDate = (records) => {
  if (!Array.isArray(records)) {
    addLog(`[HealthConnectService] aggregateActiveCaloriesByDate received non-array records: ${JSON.stringify(records)}`, 'warn', 'WARNING');
    console.warn('aggregateActiveCaloriesByDate received non-array records:', records);
    return [];
  }

  const validRecords = records.filter(record =>
    record.startTime && record.energy && typeof record.energy.inCalories === 'number'
  );

  if (validRecords.length === 0) {
    addLog(`[HealthConnectService] No valid active calories records to aggregate`);
    return [];
  }

  addLog(`[HealthConnectService] Aggregating ${validRecords.length} active calories records`);

  const aggregatedData = validRecords.reduce((acc, record) => {
    try {
      const date = record.startTime.split('T')[0];

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
      addLog(`[HealthConnectService] Error processing active calories record: ${error.message}`, 'warn', 'WARNING');
    }

    return acc;
  }, {});

  const result = Object.keys(aggregatedData).map(date => ({
    date,
    value: aggregatedData[date],
    type: 'Active Calories',
  }));

  addLog(`[HealthConnectService] Aggregated active calories data into ${result.length} daily entries`);
  return result;
};
