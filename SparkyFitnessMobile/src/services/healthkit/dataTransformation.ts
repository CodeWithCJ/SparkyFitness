import { addLog } from '../LogService';
import {
  MetricConfig,
  TransformOutput,
  TransformedRecord,
  TransformedExerciseSession,
  AggregatedSleepSession,
} from '../../types/healthRecords';
import { SleepStageEvent } from '../../types/mobileHealthData';

// HKWorkoutActivityType Mapping
// Source: https://developer.apple.com/documentation/healthkit/hkworkoutactivitytype
const ACTIVITY_MAP: Record<number, string> = {
  1: 'American Football', 2: 'Archery', 3: 'Australian Football', 4: 'Badminton',
  5: 'Baseball', 6: 'Basketball', 7: 'Bowling', 8: 'Boxing', 9: 'Climbing',
  10: 'Cricket', 11: 'Cross Training', 12: 'Curling', 13: 'Cycling',
  14: 'Dance', 16: 'Elliptical', 17: 'Equestrian Sports', 18: 'Fencing',
  19: 'Fishing', 20: 'Functional Strength Training', 21: 'Golf', 22: 'Gymnastics',
  23: 'Handball', 24: 'Hiking', 25: 'Hockey', 26: 'Hunting', 27: 'Lacrosse',
  28: 'Martial Arts', 29: 'Mind and Body', 30: 'Mixed Cardio', 31: 'Paddle Sports',
  32: 'Play', 33: 'Preparation and Recovery', 34: 'Racquetball', 35: 'Rowing',
  36: 'Rugby', 37: 'Running', 38: 'Sailing',
  39: 'Skating Sports', 40: 'Snow Sports', 41: 'Soccer', 42: 'Softball',
  43: 'Squash', 44: 'Stair Climbing', 45: 'Surfing Sports', 46: 'Swimming',
  47: 'Table Tennis', 48: 'Tennis', 49: 'Track and Field', 50: 'Traditional Strength Training',
  51: 'Volleyball', 52: 'Walking', 53: 'Water Fitness', 54: 'Water Polo',
  55: 'Water Sports', 56: 'Wrestling', 57: 'Yoga', 58: 'Barre', 59: 'Core Training',
  60: 'Cross Country Skiing', 61: 'Downhill Skiing', 62: 'Flexibility',
  63: 'High Intensity Interval Training', 64: 'Jump Rope', 65: 'Kickboxing',
  66: 'Pilates', 67: 'Snowboarding', 68: 'Stairs', 69: 'Step Training',
  70: 'Wheelchair Walk Pace', 71: 'Wheelchair Run Pace', 72: 'Tai Chi',
  73: 'Mixed Metabolic Cardio Training', 74: 'Hand Cycling'
} as const;

export const transformHealthRecords = (records: unknown[], metricConfig: MetricConfig): TransformOutput[] => {
  if (!Array.isArray(records) || records.length === 0) return [];

  const transformedData: TransformOutput[] = [];
  const { recordType, unit, type } = metricConfig;

  const getDateString = (date: unknown): string | null => {
    if (!date) return null;
    try {
      return new Date(date as string | number | Date).toISOString().split('T')[0];
    } catch (e) {
      addLog(`[HealthKitService] Could not convert date: ${date}`, 'warn', 'WARNING');
      return null;
    }
  };

  records.forEach((record: unknown) => {
    try {
      const rec = record as Record<string, unknown>;
      let value: number | null = null;
      let recordDate: string | null = null;
      let outputType = type;

      // Handle aggregated records first
      if (rec.date && rec.value !== undefined) {
        value = rec.value as number;
        recordDate = rec.date as string;
        outputType = (rec.type as string) || outputType;
      }
      // Handle non-aggregated (raw) records
      else {
        switch (recordType) {
          case 'Weight': {
            const weight = rec.weight as Record<string, number> | undefined;
            value = weight?.inKilograms ?? null;
            recordDate = getDateString(rec.time);
            break;
          }
          case 'BloodPressure': {
            if (rec.time) {
              const date = getDateString(rec.time);
              const systolic = rec.systolic as Record<string, number> | undefined;
              const diastolic = rec.diastolic as Record<string, number> | undefined;
              if (systolic?.inMillimetersOfMercury && date) {
                transformedData.push({
                  value: parseFloat(systolic.inMillimetersOfMercury.toFixed(2)),
                  unit,
                  date,
                  type: `${type}_systolic`,
                });
              }
              if (diastolic?.inMillimetersOfMercury && date) {
                transformedData.push({
                  value: parseFloat(diastolic.inMillimetersOfMercury.toFixed(2)),
                  unit,
                  date,
                  type: `${type}_diastolic`,
                });
              }
            }
            return; // Skip main push
          }
          case 'SleepSession': {
            const sleepRec = rec as unknown as AggregatedSleepSession;
            transformedData.push({
              type: 'SleepSession',
              source: sleepRec.source || 'HealthKit',
              timestamp: sleepRec.timestamp,
              entry_date: sleepRec.entry_date,
              bedtime: sleepRec.bedtime,
              wake_time: sleepRec.wake_time,
              duration_in_seconds: sleepRec.duration_in_seconds,
              time_asleep_in_seconds: sleepRec.time_asleep_in_seconds,
              deep_sleep_seconds: sleepRec.deep_sleep_seconds,
              light_sleep_seconds: sleepRec.light_sleep_seconds,
              rem_sleep_seconds: sleepRec.rem_sleep_seconds,
              awake_sleep_seconds: sleepRec.awake_sleep_seconds,
              stage_events: sleepRec.stage_events,
            });
            return; // Skip main push for SleepSession as it's already fully formed
          }
          case 'BodyFat':
          case 'OxygenSaturation': {
            const percentage = rec.percentage as Record<string, number> | undefined;
            value = percentage?.inPercent ?? null;
            recordDate = getDateString(rec.time);
            break;
          }
          case 'BodyTemperature': {
            const temperature = rec.temperature as Record<string, number> | undefined;
            value = temperature?.inCelsius ?? null;
            recordDate = getDateString(rec.time);
            break;
          }
          case 'BloodGlucose': {
            const level = rec.level as Record<string, number> | undefined;
            value = level?.inMillimolesPerLiter ?? null;
            recordDate = getDateString(rec.time);
            break;
          }
          case 'Height': {
            const height = rec.height as Record<string, number> | undefined;
            value = height?.inMeters ?? null;
            recordDate = getDateString(rec.time);
            break;
          }
          case 'Vo2Max':
            value = rec.vo2Max as number ?? null;
            recordDate = getDateString(rec.time);
            break;
          case 'RestingHeartRate':
            value = rec.beatsPerMinute as number ?? null;
            recordDate = getDateString(rec.time);
            break;
          case 'RespiratoryRate':
            value = rec.rate as number ?? null;
            recordDate = getDateString(rec.time);
            break;
          case 'Distance': {
            const distance = rec.distance as Record<string, number> | undefined;
            value = distance?.inMeters ?? null;
            recordDate = getDateString(rec.startTime);
            break;
          }
          case 'FloorsClimbed':
            value = rec.floors as number ?? null;
            recordDate = getDateString(rec.startTime);
            break;
          case 'Hydration': {
            const volume = rec.volume as Record<string, number> | undefined;
            value = volume?.inLiters ?? null;
            recordDate = getDateString(rec.startTime);
            break;
          }
          case 'LeanBodyMass': {
            const mass = rec.mass as Record<string, number> | undefined;
            value = mass?.inKilograms ?? null;
            recordDate = getDateString(rec.time);
            break;
          }
          case 'BloodAlcoholContent':
          case 'WalkingAsymmetryPercentage':
          case 'WalkingDoubleSupportPercentage':
            value = rec.value !== undefined ? (rec.value as number) * 100 : null; // HK returns decimal, convert to %
            recordDate = getDateString(rec.startTime || rec.time);
            break;
          case 'CervicalMucus':
          case 'MenstruationFlow':
          case 'OvulationTest':
          case 'IntermenstrualBleeding':
            addLog(`[HealthKitService] Qualitative record type '${recordType}' is not fully transformed. Passing raw value.`, 'warn', 'WARNING');
            value = rec.value as number; // Pass raw value, might be string/enum
            recordDate = getDateString(rec.startTime);
            break;
          case 'StepsCadence':
          case 'WalkingSpeed':
          case 'WalkingStepLength':
          case 'RunningGroundContactTime':
          case 'RunningStrideLength':
          case 'RunningPower':
          case 'RunningVerticalOscillation':
          case 'RunningSpeed':
          case 'CyclingSpeed':
          case 'CyclingPower':
          case 'CyclingCadence':
          case 'CyclingFunctionalThresholdPower':
          case 'EnvironmentalAudioExposure':
          case 'HeadphoneAudioExposure':
          case 'AppleMoveTime':
          case 'AppleExerciseTime':
          case 'AppleStandTime':
            value = rec.value as number ?? null;
            recordDate = getDateString(rec.startTime || rec.time);
            break;
          case 'DietaryFatTotal':
          case 'DietaryProtein':
          case 'DietarySodium':
            value = rec.value as number ?? null;
            recordDate = getDateString(rec.startTime);
            break;
          case 'Workout':
          case 'ExerciseSession': {
            if (rec.startTime && rec.endTime) {
              const activityType = rec.activityType as number | undefined;
              const activityTypeName = activityType ? (ACTIVITY_MAP[activityType] || `Workout type ${activityType}`) : 'Workout Session';

              // Handle duration which might be an object { unit: 's', quantity: 123 }
              let durationInSeconds = 0;
              const duration = rec.duration as { unit?: string; quantity?: number } | number | undefined;
              if (duration && typeof duration === 'object' && duration.quantity !== undefined) {
                durationInSeconds = duration.quantity;
              } else if (typeof duration === 'number') {
                durationInSeconds = duration;
              }

              // Construct rich object for server
              const exerciseSession: TransformedExerciseSession = {
                type: 'ExerciseSession', // Use ExerciseSession to match server/Android
                source: 'HealthKit',
                date: getDateString(rec.startTime) || '',
                entry_date: getDateString(rec.startTime) || '',
                timestamp: rec.startTime as string,
                startTime: rec.startTime as string,
                endTime: rec.endTime as string,
                duration: durationInSeconds,
                activityType: activityTypeName,
                title: activityTypeName, // Use mapped name as title
                caloriesBurned: rec.totalEnergyBurned as number || 0,
                distance: rec.totalDistance as number || 0,
                notes: `Source: HealthKit`,
                raw_data: record
              };
              transformedData.push(exerciseSession);
              return; // Skip default push
            }
            break;
          }
          default:
            // For simple value records from aggregation
            if (rec.value !== undefined && rec.date) {
              value = rec.value as number;
              recordDate = rec.date as string;
              outputType = (rec.type as string) || outputType;
            }
            break;
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
      addLog(`[HealthKitService] Error transforming record: ${(error as Error).message}`, 'warn', 'WARNING');
    }
  });

  addLog(`[HealthKitService] Successfully transformed ${transformedData.length} records for ${recordType}`);
  return transformedData;
};
