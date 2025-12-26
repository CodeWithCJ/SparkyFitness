import { addLog } from '../LogService';

export const transformHealthRecords = (records, metricConfig) => {
  if (!Array.isArray(records) || records.length === 0) return [];

  const transformedData = [];
  const { recordType, unit, type } = metricConfig;

  const getDateString = (date) => {
    if (!date) return null;
    try {
      return new Date(date).toISOString().split('T')[0];
    } catch (e) {
      addLog(`[HealthKitService] Could not convert date: ${date}`, 'warn', 'WARNING');
      return null;
    }
  };

  records.forEach((record) => {
    try {
      let value = null;
      let recordDate = null;
      let outputType = type;

      // Handle aggregated records first
      if (record.date && record.value !== undefined) {
        value = record.value;
        recordDate = record.date;
        outputType = record.type || outputType;
      }
      // Handle non-aggregated (raw) records
      else {
        switch (recordType) {
          case 'Weight':
            value = record.weight?.inKilograms;
            recordDate = getDateString(record.time);
            break;
          case 'BloodPressure':
            if (record.time) {
              const date = getDateString(record.time);
              if (record.systolic?.inMillimetersOfMercury) transformedData.push({ value: parseFloat(record.systolic.inMillimetersOfMercury.toFixed(2)), unit, date, type: `${type}_systolic` });
              if (record.diastolic?.inMillimetersOfMercury) transformedData.push({ value: parseFloat(record.diastolic.inMillimetersOfMercury.toFixed(2)), unit, date, type: `${type}_diastolic` });
            }
            return; // Skip main push
          case 'SleepSession':
            transformedData.push({
              type: 'SleepSession',
              source: record.source,
              timestamp: record.timestamp,
              entry_date: record.entry_date,
              bedtime: record.bedtime,
              wake_time: record.wake_time,
              duration_in_seconds: record.duration_in_seconds,
              time_asleep_in_seconds: record.time_asleep_in_seconds,
              deep_sleep_seconds: record.deep_sleep_seconds,
              light_sleep_seconds: record.light_sleep_seconds,
              rem_sleep_seconds: record.rem_sleep_seconds,
              awake_sleep_seconds: record.awake_sleep_seconds,
              stage_events: record.stage_events,
            });
            return; // Skip main push for SleepSession as it's already fully formed
          case 'BodyFat':
          case 'OxygenSaturation':
            value = record.percentage?.inPercent;
            recordDate = getDateString(record.time);
            break;
          case 'BodyTemperature':
            value = record.temperature?.inCelsius;
            recordDate = getDateString(record.time);
            break;
          case 'BloodGlucose':
            value = record.level?.inMillimolesPerLiter;
            recordDate = getDateString(record.time);
            break;
          case 'Height':
            value = record.height?.inMeters;
            recordDate = getDateString(record.time);
            break;
          case 'Vo2Max':
            value = record.vo2Max;
            recordDate = getDateString(record.time);
            break;
          case 'RestingHeartRate':
            value = record.beatsPerMinute;
            recordDate = getDateString(record.time);
            break;
          case 'RespiratoryRate':
            value = record.rate;
            recordDate = getDateString(record.time);
            break;
          case 'Distance':
            value = record.distance?.inMeters;
            recordDate = getDateString(record.startTime);
            break;
          case 'FloorsClimbed':
            value = record.floors;
            recordDate = getDateString(record.startTime);
            break;
          case 'Hydration':
            value = record.volume?.inLiters;
            recordDate = getDateString(record.startTime);
            break;
          case 'LeanBodyMass':
            value = record.mass?.inKilograms;
            recordDate = getDateString(record.time);
            break;
          default:
            // For simple value records from aggregation
            if (record.value !== undefined && record.date) {
              value = record.value;
              recordDate = record.date;
              outputType = record.type || outputType;
            }
            break;
        }
      }

      if (value !== null && value !== undefined && !isNaN(value) && recordDate) {
        transformedData.push({
          value: parseFloat(value.toFixed(2)),
          type: outputType,
          date: recordDate,
          unit: unit,
        });
      }
    } catch (error) {
      addLog(`[HealthKitService] Error transforming record: ${error.message}`, 'warn', 'WARNING');
    }
  });

  addLog(`[HealthKitService] Successfully transformed ${transformedData.length} records for ${recordType}`);
  return transformedData;
};
