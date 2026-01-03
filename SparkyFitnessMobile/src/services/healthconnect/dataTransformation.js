import { addLog } from '../LogService';

export const transformHealthRecords = (records, metricConfig) => {
  if (!Array.isArray(records)) {
    addLog(`[HealthConnectService] transformHealthRecords received non-array records for ${metricConfig.recordType}: ${JSON.stringify(records)}`, 'warn', 'WARNING');
    console.warn(`transformHealthRecords received non-array records for ${metricConfig.recordType}:`, records);
    return [];
  }

  if (records.length === 0) {
    addLog(`[HealthConnectService] No records to transform for ${metricConfig.recordType}`);
    return [];
  }

  const transformedData = [];
  const { recordType, unit, type } = metricConfig;

  addLog(`[HealthConnectService] Transforming ${records.length} ${recordType} records`);

  records.forEach((record, index) => {
    try {
      let value = null;
      let recordDate = null;
      let outputType = type; // Default to metricConfig type, but can be overridden

      if (['Steps', 'HeartRate', 'ActiveCaloriesBurned', 'TotalCaloriesBurned'].includes(recordType)) {
        if (record.value !== undefined && record.date) {
          value = record.value;
          recordDate = record.date;
          // Preserve the type from aggregated records (e.g., 'Active Calories' or 'total_calories')
          if (record.type) {
            outputType = record.type;
          }
        }
      } else {
        switch (recordType) {
          case 'Weight':
            if (record.time && record.weight?.inKilograms) {
              value = record.weight.inKilograms;
              recordDate = record.time.split('T')[0];
            }
            break;


          case 'ActiveCaloriesBurned':
            // Check if this is an aggregated record or raw record
            if (record.value !== undefined && record.date && record.type === 'Active Calories') {
              // Already aggregated from aggregateActiveCaloriesByDate
              value = record.value;
              recordDate = record.date;
              if (index === 0) {
                addLog(`[Transform] ActiveCalories (aggregated): ${value} kcal on ${recordDate}`, 'debug');
              }
            } else if (record.startTime && record.energy?.inCalories != null) {
              // Raw record - shouldn't happen if aggregation is working, but handle it
              value = record.energy.inCalories;
              recordDate = record.startTime.split('T')[0];
              if (index === 0) {
                addLog(`[Transform] ActiveCalories (raw): ${value} kcal on ${recordDate}`, 'debug');
              }
            } else if (record.energy?.inKilocalories != null) {
              value = record.energy.inKilocalories;
              const dateField = record.startTime || record.time || record.date;
              recordDate = dateField ? dateField.split('T')[0] : null;
              if (index === 0 && recordDate) {
                addLog(`[Transform] ActiveCalories (alt format): ${value} kcal on ${recordDate}`, 'debug');
              }
            }

            if (value == null || isNaN(value) || !recordDate) {
              if (index === 0) {
                addLog(`[Transform] ActiveCalories FAILED: value=${value}, date=${recordDate}`, 'warn', 'WARNING');
              }
            }
            break;

          case 'TotalCaloriesBurned':
            if (record.value !== undefined && record.date && (record.type === 'Active Calories' || record.type === 'total_calories')) {
              // Already aggregated and converted to kcal
              value = record.value;
              recordDate = record.date;
              outputType = record.type; // Preserve the original type from aggregated data
              if (index === 0) {
                addLog(`[Transform] TotalCalories (aggregated as ${record.type}): ${value} kcal on ${recordDate}`, 'debug');
              }
            } else if (record.startTime && record.energy?.inCalories != null) {
              // Raw record - convert from calories to kilocalories
              value = record.energy.inCalories / 1000;
              recordDate = record.startTime.split('T')[0];
              if (index === 0) {
                addLog(`[Transform] TotalCalories (raw): ${value} kcal on ${recordDate}`, 'debug');
              }
            } else if (record.energy?.inKilocalories != null) {
              // Already in kilocalories
              value = record.energy.inKilocalories;
              const dateField = record.startTime || record.time || record.date;
              recordDate = dateField ? dateField.split('T')[0] : null;
              if (index === 0 && recordDate) {
                addLog(`[Transform] TotalCalories (already in kcal): ${value} kcal on ${recordDate}`, 'debug');
              }
            }

            if (value == null || isNaN(value) || !recordDate) {
              if (index === 0) {
                addLog(`[Transform] TotalCalories FAILED: value=${value}, date=${recordDate}`, 'warn', 'WARNING');
              }
            }
            break;

          case 'BloodPressure':
            if (record.time) {
              const date = record.time.split('T')[0];
              if (record.systolic?.inMillimetersOfMercury) {
                transformedData.push({
                  value: parseFloat(record.systolic.inMillimetersOfMercury.toFixed(2)),
                  unit: unit,
                  date: date,
                  type: `${type}_systolic`,
                });
              }
              if (record.diastolic?.inMillimetersOfMercury) {
                transformedData.push({
                  value: parseFloat(record.diastolic.inMillimetersOfMercury.toFixed(2)),
                  unit: unit,
                  date: date,
                  type: `${type}_diastolic`,
                });
              }
            }
            return;

          case 'Nutrition':
            if (record.startTime && record.energy?.inCalories) {
              value = record.energy.inCalories / 1000;
              recordDate = record.startTime.split('T')[0];
            }
            break;

          case 'SleepSession':
            if (record.startTime && record.endTime) {
              const start = new Date(record.startTime).getTime();
              const end = new Date(record.endTime).getTime();
              if (!isNaN(start) && !isNaN(end)) {
                // Calculate duration in seconds
                const durationInSeconds = (end - start) / 1000;
                recordDate = record.startTime.split('T')[0];

                // Push a rich object directly, bypassing the simple value/unit structure
                // The server's processHealthData handles this specific structure for SleepSession
                transformedData.push({
                  type: 'SleepSession',
                  source: 'Health Connect',
                  date: recordDate, // Used for date fallback
                  timestamp: record.startTime,
                  entry_date: recordDate,
                  bedtime: record.startTime,
                  wake_time: record.endTime,
                  duration_in_seconds: durationInSeconds,
                  time_asleep_in_seconds: durationInSeconds, // Default to total duration if no stages available
                  stage_events: [], // Android Health Connect might need separate query for stages, sending empty for now (server will default to 'light')
                  sleep_score: 0,
                  deep_sleep_seconds: 0,
                  light_sleep_seconds: durationInSeconds, // Default to total
                  rem_sleep_seconds: 0,
                  awake_sleep_seconds: 0
                });
                return; // Return early as we manually pushed to transformedData
              }
            }
            break;

          case 'BasalBodyTemperature':
            if (record.time && record.temperature?.inCelsius) {
              value = record.temperature.inCelsius;
              recordDate = record.time.split('T')[0];
            }
            break;

          case 'BasalMetabolicRate':
            if (index === 0) {
              console.log('[Transform BMR] Sample record:', JSON.stringify(record));
              addLog(`[Transform] BMR sample keys: ${Object.keys(record).join(', ')}`, 'debug');
            }

            let bmrValue = null;

            // THE FIX: Check for inKilocaloriesPerDay first
            if (record.basalMetabolicRate?.inKilocaloriesPerDay != null) {
              bmrValue = record.basalMetabolicRate.inKilocaloriesPerDay;
            } else if (record.basalMetabolicRate?.inCalories != null) {
              bmrValue = record.basalMetabolicRate.inCalories;
            } else if (record.basalMetabolicRate?.inKilocalories != null) {
              bmrValue = record.basalMetabolicRate.inKilocalories;
            } else if (typeof record.basalMetabolicRate === 'number') {
              bmrValue = record.basalMetabolicRate;
            } else if (record.bmr != null && typeof record.bmr === 'number') {
              bmrValue = record.bmr;
            } else if (record.value != null && typeof record.value === 'number') {
              bmrValue = record.value;
            }

            const bmrDate = record.time || record.startTime || record.timestamp || record.date;
            let bmrDateStr = null;

            if (bmrDate) {
              try {
                bmrDateStr = typeof bmrDate === 'string' ? bmrDate.split('T')[0] : bmrDate;
              } catch (e) {
                addLog(`[Transform] Error parsing BMR date: ${e.message}`, 'warn', 'WARNING');
              }
            }

            const isValidBMR = bmrValue != null && !isNaN(bmrValue) && bmrValue > 0 && bmrValue < 10000;
            const isValidBMRDate = bmrDateStr != null && bmrDateStr.length > 0;

            if (isValidBMR && isValidBMRDate) {
              value = bmrValue;
              recordDate = bmrDateStr;
              if (index === 0) {
                addLog(`[Transform] BMR SUCCESS: ${value} kcal on ${recordDate}`, 'info', 'SUCCESS');
              }
            } else {
              if (index === 0) {
                const issues = [];
                if (!isValidBMR) issues.push(`invalid value (${bmrValue})`);
                if (!isValidBMRDate) issues.push(`invalid date (${bmrDateStr})`);
                addLog(`[Transform] BMR FAILED: ${issues.join(', ')}`, 'warn', 'WARNING');
              }
            }
            break;

          case 'BloodGlucose':
            if (index === 0) {
              console.log('[Transform BloodGlucose] Sample record:', JSON.stringify(record));
              addLog(`[Transform] BloodGlucose sample keys: ${Object.keys(record).join(', ')}`, 'debug');
            }

            let glucoseValue = null;

            // Try multiple field access patterns
            if (record.level?.inMillimolesPerLiter != null) {
              glucoseValue = record.level.inMillimolesPerLiter;
            } else if (record.bloodGlucose?.inMillimolesPerLiter != null) {
              glucoseValue = record.bloodGlucose.inMillimolesPerLiter;
            } else if (record.level?.inMilligramsPerDeciliter != null) {
              // Convert mg/dL to mmol/L (divide by 18.018)
              glucoseValue = record.level.inMilligramsPerDeciliter / 18.018;
            } else if (record.bloodGlucose?.inMilligramsPerDeciliter != null) {
              glucoseValue = record.bloodGlucose.inMilligramsPerDeciliter / 18.018;
            } else if (typeof record.level === 'number') {
              glucoseValue = record.level;
            } else if (typeof record.value === 'number') {
              glucoseValue = record.value;
            }

            const glucoseDate = record.time || record.startTime || record.timestamp || record.date;
            let glucoseDateStr = null;

            if (glucoseDate) {
              try {
                glucoseDateStr = typeof glucoseDate === 'string' ? glucoseDate.split('T')[0] : glucoseDate;
              } catch (e) {
                addLog(`[Transform] Error parsing BloodGlucose date: ${e.message}`, 'warn', 'WARNING');
              }
            }

            const isValidGlucose = glucoseValue != null && !isNaN(glucoseValue) && glucoseValue > 0;
            const isValidGlucoseDate = glucoseDateStr != null && glucoseDateStr.length > 0;

            if (isValidGlucose && isValidGlucoseDate) {
              value = glucoseValue;
              recordDate = glucoseDateStr;
              if (index === 0) {
                addLog(`[Transform] BloodGlucose SUCCESS: ${value} mmol/L on ${recordDate}`, 'info', 'SUCCESS');
              }
            } else {
              if (index === 0) {
                const issues = [];
                if (!isValidGlucose) issues.push(`invalid value (${glucoseValue})`);
                if (!isValidGlucoseDate) issues.push(`invalid date (${glucoseDateStr})`);
                addLog(`[Transform] BloodGlucose FAILED: ${issues.join(', ')}`, 'warn', 'WARNING');
              }
            }
            break;

          // Add this to healthConnectService.js in the transformHealthRecords function
          // Replace the existing 'BodyFat' case with this debug version:

          case 'BodyFat':
            // Log what we're working with
            if (index === 0) {
              console.log('[Transform BodyFat] Sample record:', JSON.stringify(record));
              addLog(`[Transform] BodyFat sample keys: ${Object.keys(record).join(', ')}`, 'debug');
            }

            // Extract value using multiple strategies
            let bodyFatValue = null;

            // Strategy 1: Check percentage.inPercent (most common)
            if (record.percentage?.inPercent != null) {
              bodyFatValue = record.percentage.inPercent;
            }
            // Strategy 2: Check direct percentage as number
            else if (typeof record.percentage === 'number') {
              bodyFatValue = record.percentage;
            }
            // Strategy 3: Check value field
            else if (record.value != null && typeof record.value === 'number') {
              bodyFatValue = record.value;
            }
            // Strategy 4: Check bodyFat field
            else if (record.bodyFat != null && typeof record.bodyFat === 'number') {
              bodyFatValue = record.bodyFat;
            }
            // Strategy 5: Check bodyFatPercentage
            else if (record.bodyFatPercentage?.inPercent != null) {
              bodyFatValue = record.bodyFatPercentage.inPercent;
            }

            // Extract date using multiple strategies
            let bodyFatDate = null;
            const dateSource = record.time || record.startTime || record.timestamp || record.date;

            if (dateSource) {
              try {
                bodyFatDate = typeof dateSource === 'string' ? dateSource.split('T')[0] : dateSource;
              } catch (e) {
                addLog(`[Transform] Error parsing BodyFat date: ${e.message}`, 'warn', 'WARNING');
              }
            }

            // Final validation and assignment
            const isValidValue = bodyFatValue != null && !isNaN(bodyFatValue) && bodyFatValue >= 0 && bodyFatValue <= 100;
            const isValidDate = bodyFatDate != null && bodyFatDate.length > 0;

            if (isValidValue && isValidDate) {
              value = bodyFatValue;
              recordDate = bodyFatDate;
              if (index === 0) {
                addLog(`[Transform] BodyFat SUCCESS: ${value}% on ${recordDate}`, 'info', 'SUCCESS');
              }
            } else {
              if (index === 0) {
                const issues = [];
                if (!isValidValue) {
                  issues.push(`invalid value (${bodyFatValue})`);
                }
                if (!isValidDate) {
                  issues.push(`invalid date (${bodyFatDate})`);
                }
                addLog(`[Transform] BodyFat FAILED: ${issues.join(', ')}`, 'warn', 'WARNING');
              }
            }
            break;

          case 'BodyTemperature':
            if (record.time && record.temperature?.inCelsius) {
              value = record.temperature.inCelsius;
              recordDate = record.time.split('T')[0];
            }
            break;

          case 'BoneMass':
            if (record.mass?.inKilograms) {
              value = record.mass.inKilograms;
              recordDate = (record.time || record.startTime)?.split('T')[0];
            }
            break;

          case 'Distance':
            if (record.startTime && record.distance?.inMeters) {
              value = record.distance.inMeters;
              recordDate = record.startTime.split('T')[0];
            }
            break;

          case 'ElevationGained':
            if (record.startTime && record.elevation?.inMeters) {
              value = record.elevation.inMeters;
              recordDate = record.startTime.split('T')[0];
            }
            break;

          case 'ExerciseSession':
            if (record.startTime && record.endTime) {
              const start = new Date(record.startTime).getTime();
              const end = new Date(record.endTime).getTime();
              if (!isNaN(start) && !isNaN(end)) {
                // Exercise Type Mapping (Common Android Health Connect IDs)
                const EXERCISE_MAP = {
                  1: 'Biking', 2: 'Biking (Stationary)', 8: 'Running', 56: 'Running (Treadmill)',
                  79: 'Walking', 37: 'Hiking', 72: 'Swimming (Pool)', 71: 'Swimming (Open Water)',
                  84: 'Strength Training', 85: 'Weightlifting', 31: 'High Intensity Interval Training',
                  80: 'Walking (Fitness)', 87: 'Yoga', 55: 'Rowing Machine', 27: 'Elliptical',
                  69: 'Stair Climbing', 23: 'Dancing'
                };

                const durationInSeconds = (end - start) / 1000;
                recordDate = record.startTime.split('T')[0];
                const activityTypeName = EXERCISE_MAP[record.exerciseType] || (record.exerciseType ? `Exercise Type ${record.exerciseType}` : 'Exercise Session');
                const title = record.title || activityTypeName;

                transformedData.push({
                  type: 'ExerciseSession',
                  source: 'Health Connect',
                  date: recordDate,
                  entry_date: recordDate,
                  timestamp: record.startTime,
                  startTime: record.startTime,
                  endTime: record.endTime,
                  duration: durationInSeconds,
                  activityType: activityTypeName,
                  title: title,
                  notes: record.notes,
                  raw_data: record
                });
                return;
              }
            }
            break;

          case 'FloorsClimbed':
            if (record.startTime && typeof record.floors === 'number') {
              value = record.floors;
              recordDate = record.startTime.split('T')[0];
            }
            break;

          case 'Height':
            if (record.time && record.height?.inMeters) {
              value = record.height.inMeters;
              recordDate = record.time.split('T')[0];
            }
            break;

          case 'Hydration':
            if (record.startTime && record.volume?.inLiters) {
              value = record.volume.inLiters;
              recordDate = record.startTime.split('T')[0];
            }
            break;

          case 'LeanBodyMass':
            if (record.mass?.inKilograms) {
              value = record.mass.inKilograms;
              recordDate = (record.time || record.startTime)?.split('T')[0];
            }
            break;

          case 'OxygenSaturation':
            if (index === 0) {
              console.log('[Transform O2Sat] Sample record:', JSON.stringify(record));
              addLog(`[Transform] O2Sat sample keys: ${Object.keys(record).join(', ')}`, 'debug');
            }

            let o2Value = null;

            if (record.percentage?.inPercent != null) {
              o2Value = record.percentage.inPercent;
            } else if (typeof record.percentage === 'number') {
              o2Value = record.percentage;
            } else if (record.value != null && typeof record.value === 'number') {
              o2Value = record.value;
            } else if (record.oxygenSaturation != null && typeof record.oxygenSaturation === 'number') {
              o2Value = record.oxygenSaturation;
            } else if (record.spo2 != null && typeof record.spo2 === 'number') {
              o2Value = record.spo2;
            }

            const o2Date = record.time || record.startTime || record.timestamp || record.date;
            let o2DateStr = null;

            if (o2Date) {
              try {
                o2DateStr = typeof o2Date === 'string' ? o2Date.split('T')[0] : o2Date;
              } catch (e) {
                addLog(`[Transform] Error parsing OxygenSaturation date: ${e.message}`, 'warn', 'WARNING');
              }
            }

            const isValidO2 = o2Value != null && !isNaN(o2Value) && o2Value > 0 && o2Value <= 100;
            const isValidO2Date = o2DateStr != null && o2DateStr.length > 0;

            if (isValidO2 && isValidO2Date) {
              value = o2Value;
              recordDate = o2DateStr;
              if (index === 0) {
                addLog(`[Transform] OxygenSaturation SUCCESS: ${value}% on ${recordDate}`, 'info', 'SUCCESS');
              }
            } else {
              if (index === 0) {
                const issues = [];
                if (!isValidO2) issues.push(`invalid value (${o2Value})`);
                if (!isValidO2Date) issues.push(`invalid date (${o2DateStr})`);
                addLog(`[Transform] OxygenSaturation FAILED: ${issues.join(', ')}`, 'warn', 'WARNING');
              }
            }
            break;

          case 'Power':
            if (record.startTime && record.power?.inWatts) {
              value = record.power.inWatts;
              recordDate = record.startTime.split('T')[0];
            }
            break;

          case 'RespiratoryRate':
            if (record.rate) {
              value = record.rate;
              recordDate = (record.time || record.startTime)?.split('T')[0];
            }
            break;

          case 'RestingHeartRate':
            if (record.time && typeof record.beatsPerMinute === 'number') {
              value = record.beatsPerMinute;
              recordDate = record.time.split('T')[0];
            }
            break;

          case 'Speed':
            if (record.startTime && record.speed?.inMetersPerSecond) {
              value = record.speed.inMetersPerSecond;
              recordDate = record.startTime.split('T')[0];
            }
            break;

          case 'Vo2Max':
            if (index === 0) {
              console.log('[Transform Vo2Max] Sample record:', JSON.stringify(record));
              addLog(`[Transform] Vo2Max sample keys: ${Object.keys(record).join(', ')}`, 'debug');
            }

            let vo2Value = null;

            if (record.vo2Max != null && typeof record.vo2Max === 'number') {
              vo2Value = record.vo2Max;
            } else if (record.vo2 != null && typeof record.vo2 === 'number') {
              vo2Value = record.vo2;
            } else if (record.value != null && typeof record.value === 'number') {
              vo2Value = record.value;
            } else if (record.vo2MaxMillilitersPerMinuteKilogram != null) {
              vo2Value = record.vo2MaxMillilitersPerMinuteKilogram;
            }

            const vo2Date = record.time || record.startTime || record.timestamp || record.date;
            let vo2DateStr = null;

            if (vo2Date) {
              try {
                vo2DateStr = typeof vo2Date === 'string' ? vo2Date.split('T')[0] : vo2Date;
              } catch (e) {
                addLog(`[Transform] Error parsing Vo2Max date: ${e.message}`, 'warn', 'WARNING');
              }
            }

            const isValidVo2 = vo2Value != null && !isNaN(vo2Value) && vo2Value > 0 && vo2Value < 100;
            const isValidVo2Date = vo2DateStr != null && vo2DateStr.length > 0;

            if (isValidVo2 && isValidVo2Date) {
              value = vo2Value;
              recordDate = vo2DateStr;
              if (index === 0) {
                addLog(`[Transform] Vo2Max SUCCESS: ${value} ml/min/kg on ${recordDate}`, 'info', 'SUCCESS');
              }
            } else {
              if (index === 0) {
                const issues = [];
                if (!isValidVo2) issues.push(`invalid value (${vo2Value})`);
                if (!isValidVo2Date) issues.push(`invalid date (${vo2DateStr})`);
                addLog(`[Transform] Vo2Max FAILED: ${issues.join(', ')}`, 'warn', 'WARNING');
              }
            }
            break;

          case 'WheelchairPushes':
            if (record.startTime && typeof record.count === 'number') {
              value = record.count;
              recordDate = record.startTime.split('T')[0];
            }
            break;

          case 'CervicalMucus':
          case 'MenstruationFlow':
          case 'OvulationTest':
          case 'SexualActivity':
            addLog(`[HealthConnectService] Skipping qualitative ${recordType} record`);
            return;
          case 'CyclingPedalingCadence':
            if (record.startTime && record.samples) {
              record.samples.forEach(sample => {
                transformedData.push({
                  value: sample.revolutionsPerMinute,
                  type: outputType,
                  date: record.startTime.split('T')[0],
                  unit: unit,
                });
              });
            }
            return;
          case 'ExerciseRoute':
            if (record.route) {
              value = record.route;
              recordDate = record.startTime.split('T')[0];
            }
            break;
          case 'IntermenstrualBleeding':
            if (record.time) {
              value = 1;
              recordDate = record.time.split('T')[0];
            }
            break;
          case 'MenstruationPeriod':
            if (record.startTime && record.endTime) {
              const start = new Date(record.startTime);
              const end = new Date(record.endTime);
              for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
                transformedData.push({
                  value: 1,
                  type: outputType,
                  date: new Date(d).toISOString().split('T')[0],
                  unit: unit,
                });
              }
            }
            return;
          case 'StepsCadence':
            if (record.startTime && record.samples) {
              record.samples.forEach(sample => {
                transformedData.push({
                  value: sample.rate,
                  type: outputType,
                  date: record.startTime.split('T')[0],
                  unit: unit,
                });
              });
            }
            return;
          case 'HeartRateVariabilityRmssd':
            if (record.time && record.heartRateVariabilityMillis) {
              value = record.heartRateVariabilityMillis;
              recordDate = record.time.split('T')[0];
            }
            break;
          case 'BloodAlcoholContent':
            if (record.time && record.percentage) {
              value = record.percentage.inPercent;
              recordDate = record.time.split('T')[0];
            }
            break;
          case 'BloodOxygenSaturation':
            if (record.time && record.percentage) {
              value = record.percentage.inPercent;
              recordDate = record.time.split('T')[0];
            }
            break;
          default:
            addLog(`[HealthConnectService] Unhandled record type in transformation: ${recordType}`, 'warn', 'WARNING');
            return;
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
      addLog(`[HealthConnectService] Error transforming ${recordType} record at index ${index}: ${error.message}`, 'warn', 'WARNING');
    }
  });

  addLog(`[HealthConnectService] Successfully transformed ${transformedData.length} ${recordType} records`);
  return transformedData;
};
