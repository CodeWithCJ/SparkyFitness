import { addLog } from '../LogService';

export const aggregateStepsByDate = (records) => {
  if (!Array.isArray(records)) return [];
  const aggregatedData = records.reduce((acc, record) => {
    try {
      const date = new Date(record.endTime || record.startTime).toISOString().split('T')[0];
      if (!acc[date]) acc[date] = 0;
      acc[date] += record.value;
    } catch (e) { addLog(`[HealthKitService] Error processing step record: ${e.message}`, 'warn', 'WARNING'); }
    return acc;
  }, {});

  const result = Object.keys(aggregatedData).map(date => ({ date, value: aggregatedData[date], type: 'step' }));
  addLog(`[HealthKitService] Aggregated step data into ${result.length} daily entries`);
  return result;
};

export const aggregateHeartRateByDate = (records) => {
  if (!Array.isArray(records)) return [];
  const aggregatedData = records.reduce((acc, record) => {
    try {
      const date = new Date(record.startTime).toISOString().split('T')[0];
      const heartRate = record.samples[0].beatsPerMinute;
      if (!acc[date]) acc[date] = { total: 0, count: 0 };
      acc[date].total += heartRate;
      acc[date].count++;
    } catch (e) { addLog(`[HealthKitService] Error processing heart rate record: ${e.message}`, 'warn', 'WARNING'); }
    return acc;
  }, {});

  const result = Object.keys(aggregatedData).map(date => ({ date, value: Math.round(aggregatedData[date].total / aggregatedData[date].count), type: 'heart_rate' }));
  addLog(`[HealthKitService] Aggregated heart rate data into ${result.length} daily entries`);
  return result;
};

const aggregateCaloriesByDate = (records, type) => {
  if (!Array.isArray(records)) return [];
  const aggregatedData = records.reduce((acc, record) => {
    try {
      const timeToUse = record.startTime || record.endTime;
      if (timeToUse && record.energy?.inCalories) {
        const date = new Date(timeToUse).toISOString().split('T')[0];
        if (!acc[date]) acc[date] = 0;
        acc[date] += record.energy.inCalories;
      }
    } catch (e) { addLog(`[HealthKitService] Error processing ${type} record: ${e.message}`, 'warn', 'WARNING'); }
    return acc;
  }, {});

  const result = Object.keys(aggregatedData).map(date => ({ date, value: aggregatedData[date], type }));
  addLog(`[HealthKitService] Aggregated ${type} data into ${result.length} daily entries`);
  return result;
};

export const aggregateActiveCaloriesByDate = (records) => {
  return aggregateCaloriesByDate(records, 'Active Calories');
};

export const aggregateTotalCaloriesByDate = (records) => {
  // This now correctly aggregates BasalEnergyBurned records
  return aggregateCaloriesByDate(records, 'total_calories');
};
