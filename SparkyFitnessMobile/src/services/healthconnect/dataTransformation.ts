import { addLog } from '../LogService';
import {
  MetricConfig,
  TransformOutput,
  TransformedRecord,
  TransformedExerciseSession,
  AggregatedSleepSession,
} from '../../types/healthRecords';

// Exercise Type Mapping (Common Android Health Connect IDs)
const EXERCISE_MAP: Record<number, string> = {
  1: 'Biking', 2: 'Biking (Stationary)', 8: 'Running', 56: 'Running (Treadmill)',
  79: 'Walking', 37: 'Hiking', 72: 'Swimming (Pool)', 71: 'Swimming (Open Water)',
  84: 'Strength Training', 85: 'Weightlifting', 31: 'High Intensity Interval Training',
  80: 'Walking (Fitness)', 87: 'Yoga', 55: 'Rowing Machine', 27: 'Elliptical',
  69: 'Stair Climbing', 23: 'Dancing'
} as const;

export const transformHealthRecords = (records: unknown[], metricConfig: MetricConfig): TransformOutput[] => {
  if (!Array.isArray(records)) {
    addLog(`[HealthConnectService] transformHealthRecords received non-array records for ${metricConfig.recordType}: ${JSON.stringify(records)}`, 'warn', 'WARNING');
    console.warn(`transformHealthRecords received non-array records for ${metricConfig.recordType}:`, records);
    return [];
  }

  if (records.length === 0) {
    addLog(`[HealthConnectService] No records to transform for ${metricConfig.recordType}`);
    return [];
  }

  const transformedData: TransformOutput[] = [];
  const { recordType, unit, type } = metricConfig;

  addLog(`[HealthConnectService] Transforming ${records.length} ${recordType} records`);

  records.forEach((record: unknown, index: number) => {
    try {
      const rec = record as Record<string, unknown>;
      let value: number | null = null;
      let recordDate: string | null = null;
      let outputType = type; // Default to metricConfig type, but can be overridden

      if (['Steps', 'HeartRate', 'ActiveCaloriesBurned', 'TotalCaloriesBurned'].includes(recordType)) {
        if (rec.value !== undefined && rec.date) {
          value = rec.value as number;
          recordDate = rec.date as string;
          // Preserve the type from aggregated records (e.g., 'Active Calories' or 'total_calories')
          if (rec.type) {
            outputType = rec.type as string;
          }
        }
      } else {
        switch (recordType) {
          case 'Weight': {
            const weight = rec.weight as Record<string, number> | undefined;
            if (rec.time && weight?.inKilograms) {
              value = weight.inKilograms;
              recordDate = (rec.time as string).split('T')[0];
            }
            break;
          }

          case 'ActiveCaloriesBurned': {
            // Check if this is an aggregated record or raw record
            if (rec.value !== undefined && rec.date && rec.type === 'Active Calories') {
              // Already aggregated from aggregateActiveCaloriesByDate
              value = rec.value as number;
              recordDate = rec.date as string;
              if (index === 0) {
                addLog(`[Transform] ActiveCalories (aggregated): ${value} kcal on ${recordDate}`, 'debug');
              }
            } else {
              const energy = rec.energy as Record<string, number> | undefined;
              if (rec.startTime && energy?.inCalories != null) {
                // Raw record - shouldn't happen if aggregation is working, but handle it
                value = energy.inCalories;
                recordDate = (rec.startTime as string).split('T')[0];
                if (index === 0) {
                  addLog(`[Transform] ActiveCalories (raw): ${value} kcal on ${recordDate}`, 'debug');
                }
              } else if (energy?.inKilocalories != null) {
                value = energy.inKilocalories;
                const dateField = (rec.startTime || rec.time || rec.date) as string | undefined;
                recordDate = dateField ? dateField.split('T')[0] : null;
                if (index === 0 && recordDate) {
                  addLog(`[Transform] ActiveCalories (alt format): ${value} kcal on ${recordDate}`, 'debug');
                }
              }
            }

            if (value == null || isNaN(value) || !recordDate) {
              if (index === 0) {
                addLog(`[Transform] ActiveCalories FAILED: value=${value}, date=${recordDate}`, 'warn', 'WARNING');
              }
            }
            break;
          }

          case 'TotalCaloriesBurned': {
            if (rec.value !== undefined && rec.date && (rec.type === 'Active Calories' || rec.type === 'total_calories')) {
              // Already aggregated and converted to kcal
              value = rec.value as number;
              recordDate = rec.date as string;
              outputType = rec.type as string; // Preserve the original type from aggregated data
              if (index === 0) {
                addLog(`[Transform] TotalCalories (aggregated as ${rec.type}): ${value} kcal on ${recordDate}`, 'debug');
              }
            } else {
              const energy = rec.energy as Record<string, number> | undefined;
              if (rec.startTime && energy?.inCalories != null) {
                // Raw record - convert from calories to kilocalories
                value = energy.inCalories / 1000;
                recordDate = (rec.startTime as string).split('T')[0];
                if (index === 0) {
                  addLog(`[Transform] TotalCalories (raw): ${value} kcal on ${recordDate}`, 'debug');
                }
              } else if (energy?.inKilocalories != null) {
                // Already in kilocalories
                value = energy.inKilocalories;
                const dateField = (rec.startTime || rec.time || rec.date) as string | undefined;
                recordDate = dateField ? dateField.split('T')[0] : null;
                if (index === 0 && recordDate) {
                  addLog(`[Transform] TotalCalories (already in kcal): ${value} kcal on ${recordDate}`, 'debug');
                }
              }
            }

            if (value == null || isNaN(value) || !recordDate) {
              if (index === 0) {
                addLog(`[Transform] TotalCalories FAILED: value=${value}, date=${recordDate}`, 'warn', 'WARNING');
              }
            }
            break;
          }

          case 'BloodPressure': {
            if (rec.time) {
              const date = (rec.time as string).split('T')[0];
              const systolic = rec.systolic as Record<string, number> | undefined;
              const diastolic = rec.diastolic as Record<string, number> | undefined;
              if (systolic?.inMillimetersOfMercury) {
                transformedData.push({
                  value: parseFloat(systolic.inMillimetersOfMercury.toFixed(2)),
                  unit: unit,
                  date: date,
                  type: `${type}_systolic`,
                });
              }
              if (diastolic?.inMillimetersOfMercury) {
                transformedData.push({
                  value: parseFloat(diastolic.inMillimetersOfMercury.toFixed(2)),
                  unit: unit,
                  date: date,
                  type: `${type}_diastolic`,
                });
              }
            }
            return;
          }

          case 'Nutrition': {
            const energy = rec.energy as Record<string, number> | undefined;
            if (rec.startTime && energy?.inCalories) {
              value = energy.inCalories / 1000;
              recordDate = (rec.startTime as string).split('T')[0];
            }
            break;
          }

          case 'SleepSession': {
            if (rec.startTime && rec.endTime) {
              const start = new Date(rec.startTime as string).getTime();
              const end = new Date(rec.endTime as string).getTime();
              if (!isNaN(start) && !isNaN(end)) {
                // Calculate duration in seconds
                const durationInSeconds = (end - start) / 1000;
                recordDate = (rec.startTime as string).split('T')[0];

                // Push a rich object directly, bypassing the simple value/unit structure
                // The server's processHealthData handles this specific structure for SleepSession
                const sleepSession: AggregatedSleepSession = {
                  type: 'SleepSession',
                  source: 'Health Connect',
                  timestamp: rec.startTime as string,
                  entry_date: recordDate,
                  bedtime: rec.startTime as string,
                  wake_time: rec.endTime as string,
                  duration_in_seconds: durationInSeconds,
                  time_asleep_in_seconds: durationInSeconds, // Default to total duration if no stages available
                  stage_events: [], // Android Health Connect might need separate query for stages, sending empty for now (server will default to 'light')
                  sleep_score: 0,
                  deep_sleep_seconds: 0,
                  light_sleep_seconds: durationInSeconds, // Default to total
                  rem_sleep_seconds: 0,
                  awake_sleep_seconds: 0
                };
                transformedData.push(sleepSession);
                return; // Return early as we manually pushed to transformedData
              }
            }
            break;
          }

          case 'BasalBodyTemperature': {
            const temperature = rec.temperature as Record<string, number> | undefined;
            if (rec.time && temperature?.inCelsius) {
              value = temperature.inCelsius;
              recordDate = (rec.time as string).split('T')[0];
            }
            break;
          }

          case 'BasalMetabolicRate': {
            if (index === 0) {
              console.log('[Transform BMR] Sample record:', JSON.stringify(record));
              addLog(`[Transform] BMR sample keys: ${Object.keys(rec).join(', ')}`, 'debug');
            }

            let bmrValue: number | null = null;
            const bmr = rec.basalMetabolicRate as Record<string, number> | number | undefined;

            // THE FIX: Check for inKilocaloriesPerDay first
            if (typeof bmr === 'object' && bmr?.inKilocaloriesPerDay != null) {
              bmrValue = bmr.inKilocaloriesPerDay;
            } else if (typeof bmr === 'object' && bmr?.inCalories != null) {
              bmrValue = bmr.inCalories;
            } else if (typeof bmr === 'object' && bmr?.inKilocalories != null) {
              bmrValue = bmr.inKilocalories;
            } else if (typeof bmr === 'number') {
              bmrValue = bmr;
            } else if (rec.bmr != null && typeof rec.bmr === 'number') {
              bmrValue = rec.bmr as number;
            } else if (rec.value != null && typeof rec.value === 'number') {
              bmrValue = rec.value as number;
            }

            const bmrDate = (rec.time || rec.startTime || rec.timestamp || rec.date) as string | undefined;
            let bmrDateStr: string | null = null;

            if (bmrDate) {
              try {
                bmrDateStr = typeof bmrDate === 'string' ? bmrDate.split('T')[0] : null;
              } catch (e) {
                addLog(`[Transform] Error parsing BMR date: ${(e as Error).message}`, 'warn', 'WARNING');
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
                const issues: string[] = [];
                if (!isValidBMR) issues.push(`invalid value (${bmrValue})`);
                if (!isValidBMRDate) issues.push(`invalid date (${bmrDateStr})`);
                addLog(`[Transform] BMR FAILED: ${issues.join(', ')}`, 'warn', 'WARNING');
              }
            }
            break;
          }

          case 'BloodGlucose': {
            if (index === 0) {
              console.log('[Transform BloodGlucose] Sample record:', JSON.stringify(record));
              addLog(`[Transform] BloodGlucose sample keys: ${Object.keys(rec).join(', ')}`, 'debug');
            }

            let glucoseValue: number | null = null;
            const level = rec.level as Record<string, number> | number | undefined;
            const bloodGlucose = rec.bloodGlucose as Record<string, number> | undefined;

            // Try multiple field access patterns
            if (typeof level === 'object' && level?.inMillimolesPerLiter != null) {
              glucoseValue = level.inMillimolesPerLiter;
            } else if (bloodGlucose?.inMillimolesPerLiter != null) {
              glucoseValue = bloodGlucose.inMillimolesPerLiter;
            } else if (typeof level === 'object' && level?.inMilligramsPerDeciliter != null) {
              // Convert mg/dL to mmol/L (divide by 18.018)
              glucoseValue = level.inMilligramsPerDeciliter / 18.018;
            } else if (bloodGlucose?.inMilligramsPerDeciliter != null) {
              glucoseValue = bloodGlucose.inMilligramsPerDeciliter / 18.018;
            } else if (typeof level === 'number') {
              glucoseValue = level;
            } else if (typeof rec.value === 'number') {
              glucoseValue = rec.value as number;
            }

            const glucoseDate = (rec.time || rec.startTime || rec.timestamp || rec.date) as string | undefined;
            let glucoseDateStr: string | null = null;

            if (glucoseDate) {
              try {
                glucoseDateStr = typeof glucoseDate === 'string' ? glucoseDate.split('T')[0] : null;
              } catch (e) {
                addLog(`[Transform] Error parsing BloodGlucose date: ${(e as Error).message}`, 'warn', 'WARNING');
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
                const issues: string[] = [];
                if (!isValidGlucose) issues.push(`invalid value (${glucoseValue})`);
                if (!isValidGlucoseDate) issues.push(`invalid date (${glucoseDateStr})`);
                addLog(`[Transform] BloodGlucose FAILED: ${issues.join(', ')}`, 'warn', 'WARNING');
              }
            }
            break;
          }

          case 'BodyFat': {
            // Log what we're working with
            if (index === 0) {
              console.log('[Transform BodyFat] Sample record:', JSON.stringify(record));
              addLog(`[Transform] BodyFat sample keys: ${Object.keys(rec).join(', ')}`, 'debug');
            }

            // Extract value using multiple strategies
            let bodyFatValue: number | null = null;
            const percentage = rec.percentage as Record<string, number> | number | undefined;
            const bodyFatPercentage = rec.bodyFatPercentage as Record<string, number> | undefined;

            // Strategy 1: Check percentage.inPercent (most common)
            if (typeof percentage === 'object' && percentage?.inPercent != null) {
              bodyFatValue = percentage.inPercent;
            }
            // Strategy 2: Check direct percentage as number
            else if (typeof percentage === 'number') {
              bodyFatValue = percentage;
            }
            // Strategy 3: Check value field
            else if (rec.value != null && typeof rec.value === 'number') {
              bodyFatValue = rec.value as number;
            }
            // Strategy 4: Check bodyFat field
            else if (rec.bodyFat != null && typeof rec.bodyFat === 'number') {
              bodyFatValue = rec.bodyFat as number;
            }
            // Strategy 5: Check bodyFatPercentage
            else if (bodyFatPercentage?.inPercent != null) {
              bodyFatValue = bodyFatPercentage.inPercent;
            }

            // Extract date using multiple strategies
            let bodyFatDate: string | null = null;
            const dateSource = (rec.time || rec.startTime || rec.timestamp || rec.date) as string | undefined;

            if (dateSource) {
              try {
                bodyFatDate = typeof dateSource === 'string' ? dateSource.split('T')[0] : null;
              } catch (e) {
                addLog(`[Transform] Error parsing BodyFat date: ${(e as Error).message}`, 'warn', 'WARNING');
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
                const issues: string[] = [];
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
          }

          case 'BodyTemperature': {
            const temperature = rec.temperature as Record<string, number> | undefined;
            if (rec.time && temperature?.inCelsius) {
              value = temperature.inCelsius;
              recordDate = (rec.time as string).split('T')[0];
            }
            break;
          }

          case 'BoneMass': {
            const mass = rec.mass as Record<string, number> | undefined;
            if (mass?.inKilograms) {
              value = mass.inKilograms;
              const dateField = (rec.time || rec.startTime) as string | undefined;
              recordDate = dateField?.split('T')[0] ?? null;
            }
            break;
          }

          case 'Distance': {
            const distance = rec.distance as Record<string, number> | undefined;
            if (rec.startTime && distance?.inMeters) {
              value = distance.inMeters;
              recordDate = (rec.startTime as string).split('T')[0];
            }
            break;
          }

          case 'ElevationGained': {
            const elevation = rec.elevation as Record<string, number> | undefined;
            if (rec.startTime && elevation?.inMeters) {
              value = elevation.inMeters;
              recordDate = (rec.startTime as string).split('T')[0];
            }
            break;
          }

          case 'ExerciseSession': {
            if (rec.startTime && rec.endTime) {
              const start = new Date(rec.startTime as string).getTime();
              const end = new Date(rec.endTime as string).getTime();
              if (!isNaN(start) && !isNaN(end)) {
                const durationInSeconds = (end - start) / 1000;
                recordDate = (rec.startTime as string).split('T')[0];
                const exerciseType = rec.exerciseType as number | undefined;
                const activityTypeName = exerciseType ? (EXERCISE_MAP[exerciseType] || `Exercise Type ${exerciseType}`) : 'Exercise Session';
                const title = (rec.title as string) || activityTypeName;

                const exerciseSession: TransformedExerciseSession = {
                  type: 'ExerciseSession',
                  source: 'Health Connect',
                  date: recordDate,
                  entry_date: recordDate,
                  timestamp: rec.startTime as string,
                  startTime: rec.startTime as string,
                  endTime: rec.endTime as string,
                  duration: durationInSeconds,
                  activityType: activityTypeName,
                  title: title,
                  notes: rec.notes as string | undefined,
                  raw_data: record
                };
                transformedData.push(exerciseSession);
                return;
              }
            }
            break;
          }

          case 'FloorsClimbed':
            if (rec.startTime && typeof rec.floors === 'number') {
              value = rec.floors as number;
              recordDate = (rec.startTime as string).split('T')[0];
            }
            break;

          case 'Height': {
            const height = rec.height as Record<string, number> | undefined;
            if (rec.time && height?.inMeters) {
              value = height.inMeters;
              recordDate = (rec.time as string).split('T')[0];
            }
            break;
          }

          case 'Hydration': {
            const volume = rec.volume as Record<string, number> | undefined;
            if (rec.startTime && volume?.inLiters) {
              value = volume.inLiters;
              recordDate = (rec.startTime as string).split('T')[0];
            }
            break;
          }

          case 'LeanBodyMass': {
            const mass = rec.mass as Record<string, number> | undefined;
            if (mass?.inKilograms) {
              value = mass.inKilograms;
              const dateField = (rec.time || rec.startTime) as string | undefined;
              recordDate = dateField?.split('T')[0] ?? null;
            }
            break;
          }

          case 'OxygenSaturation': {
            if (index === 0) {
              console.log('[Transform O2Sat] Sample record:', JSON.stringify(record));
              addLog(`[Transform] O2Sat sample keys: ${Object.keys(rec).join(', ')}`, 'debug');
            }

            let o2Value: number | null = null;
            const percentage = rec.percentage as Record<string, number> | number | undefined;

            if (typeof percentage === 'object' && percentage?.inPercent != null) {
              o2Value = percentage.inPercent;
            } else if (typeof percentage === 'number') {
              o2Value = percentage;
            } else if (rec.value != null && typeof rec.value === 'number') {
              o2Value = rec.value as number;
            } else if (rec.oxygenSaturation != null && typeof rec.oxygenSaturation === 'number') {
              o2Value = rec.oxygenSaturation as number;
            } else if (rec.spo2 != null && typeof rec.spo2 === 'number') {
              o2Value = rec.spo2 as number;
            }

            const o2Date = (rec.time || rec.startTime || rec.timestamp || rec.date) as string | undefined;
            let o2DateStr: string | null = null;

            if (o2Date) {
              try {
                o2DateStr = typeof o2Date === 'string' ? o2Date.split('T')[0] : null;
              } catch (e) {
                addLog(`[Transform] Error parsing OxygenSaturation date: ${(e as Error).message}`, 'warn', 'WARNING');
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
                const issues: string[] = [];
                if (!isValidO2) issues.push(`invalid value (${o2Value})`);
                if (!isValidO2Date) issues.push(`invalid date (${o2DateStr})`);
                addLog(`[Transform] OxygenSaturation FAILED: ${issues.join(', ')}`, 'warn', 'WARNING');
              }
            }
            break;
          }

          case 'Power': {
            const power = rec.power as Record<string, number> | undefined;
            if (rec.startTime && power?.inWatts) {
              value = power.inWatts;
              recordDate = (rec.startTime as string).split('T')[0];
            }
            break;
          }

          case 'RespiratoryRate':
            if (rec.rate) {
              value = rec.rate as number;
              const dateField = (rec.time || rec.startTime) as string | undefined;
              recordDate = dateField?.split('T')[0] ?? null;
            }
            break;

          case 'RestingHeartRate':
            if (rec.time && typeof rec.beatsPerMinute === 'number') {
              value = rec.beatsPerMinute as number;
              recordDate = (rec.time as string).split('T')[0];
            }
            break;

          case 'Speed': {
            const speed = rec.speed as Record<string, number> | undefined;
            if (rec.startTime && speed?.inMetersPerSecond) {
              value = speed.inMetersPerSecond;
              recordDate = (rec.startTime as string).split('T')[0];
            }
            break;
          }

          case 'Vo2Max': {
            if (index === 0) {
              console.log('[Transform Vo2Max] Sample record:', JSON.stringify(record));
              addLog(`[Transform] Vo2Max sample keys: ${Object.keys(rec).join(', ')}`, 'debug');
            }

            let vo2Value: number | null = null;

            if (rec.vo2Max != null && typeof rec.vo2Max === 'number') {
              vo2Value = rec.vo2Max as number;
            } else if (rec.vo2 != null && typeof rec.vo2 === 'number') {
              vo2Value = rec.vo2 as number;
            } else if (rec.value != null && typeof rec.value === 'number') {
              vo2Value = rec.value as number;
            } else if (rec.vo2MaxMillilitersPerMinuteKilogram != null) {
              vo2Value = rec.vo2MaxMillilitersPerMinuteKilogram as number;
            }

            const vo2Date = (rec.time || rec.startTime || rec.timestamp || rec.date) as string | undefined;
            let vo2DateStr: string | null = null;

            if (vo2Date) {
              try {
                vo2DateStr = typeof vo2Date === 'string' ? vo2Date.split('T')[0] : null;
              } catch (e) {
                addLog(`[Transform] Error parsing Vo2Max date: ${(e as Error).message}`, 'warn', 'WARNING');
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
                const issues: string[] = [];
                if (!isValidVo2) issues.push(`invalid value (${vo2Value})`);
                if (!isValidVo2Date) issues.push(`invalid date (${vo2DateStr})`);
                addLog(`[Transform] Vo2Max FAILED: ${issues.join(', ')}`, 'warn', 'WARNING');
              }
            }
            break;
          }

          case 'WheelchairPushes':
            if (rec.startTime && typeof rec.count === 'number') {
              value = rec.count as number;
              recordDate = (rec.startTime as string).split('T')[0];
            }
            break;

          case 'CervicalMucus':
          case 'MenstruationFlow':
          case 'OvulationTest':
          case 'SexualActivity':
            addLog(`[HealthConnectService] Skipping qualitative ${recordType} record`);
            return;

          case 'CyclingPedalingCadence': {
            const samples = rec.samples as Array<{ revolutionsPerMinute: number }> | undefined;
            if (rec.startTime && samples) {
              samples.forEach(sample => {
                transformedData.push({
                  value: sample.revolutionsPerMinute,
                  type: outputType,
                  date: (rec.startTime as string).split('T')[0],
                  unit: unit,
                });
              });
            }
            return;
          }

          case 'ExerciseRoute': {
            if (rec.route) {
              // Note: route is likely a complex object, storing as-is may not work with TransformedRecord
              // This case seems incomplete in the original - keeping behavior
              addLog(`[HealthConnectService] ExerciseRoute transformation not fully implemented`);
            }
            break;
          }

          case 'IntermenstrualBleeding':
            if (rec.time) {
              value = 1;
              recordDate = (rec.time as string).split('T')[0];
            }
            break;

          case 'MenstruationPeriod':
            if (rec.startTime && rec.endTime) {
              const start = new Date(rec.startTime as string);
              const end = new Date(rec.endTime as string);
              for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                transformedData.push({
                  value: 1,
                  type: outputType,
                  date: new Date(d).toISOString().split('T')[0],
                  unit: unit,
                });
              }
            }
            return;

          case 'StepsCadence': {
            const samples = rec.samples as Array<{ rate: number }> | undefined;
            if (rec.startTime && samples) {
              samples.forEach(sample => {
                transformedData.push({
                  value: sample.rate,
                  type: outputType,
                  date: (rec.startTime as string).split('T')[0],
                  unit: unit,
                });
              });
            }
            return;
          }

          case 'BloodAlcoholContent': {
            const percentage = rec.percentage as Record<string, number> | undefined;
            if (rec.time && percentage) {
              value = percentage.inPercent;
              recordDate = (rec.time as string).split('T')[0];
            }
            break;
          }

          case 'BloodOxygenSaturation': {
            const percentage = rec.percentage as Record<string, number> | undefined;
            if (rec.time && percentage) {
              value = percentage.inPercent;
              recordDate = (rec.time as string).split('T')[0];
            }
            break;
          }

          default:
            addLog(`[HealthConnectService] Unhandled record type in transformation: ${recordType}`, 'warn', 'WARNING');
            return;
        }
      }

      if (value !== null && value !== undefined && !isNaN(value) && recordDate) {
        const transformedRecord: TransformedRecord = {
          value: parseFloat(value.toFixed(2)),
          type: outputType,
          date: recordDate,
          unit: unit,
        };
        transformedData.push(transformedRecord);
      }
    } catch (error) {
      addLog(`[HealthConnectService] Error transforming ${recordType} record at index ${index}: ${(error as Error).message}`, 'warn', 'WARNING');
    }
  });

  addLog(`[HealthConnectService] Successfully transformed ${transformedData.length} ${recordType} records`);
  return transformedData;
};
