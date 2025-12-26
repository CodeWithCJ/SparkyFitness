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
            const start = new Date(record.startTime).getTime();
            const end = new Date(record.endTime).getTime();
            if (!isNaN(start) && !isNaN(end)) {
              value = (end - start) / (1000 * 60); // in minutes
              recordDate = getDateString(record.startTime);
            }
            break;
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
