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
          case 'BloodAlcoholContent':
          case 'WalkingAsymmetryPercentage':
          case 'WalkingDoubleSupportPercentage':
            value = record.value !== undefined ? record.value * 100 : null; // HK returns decimal, convert to %
            recordDate = getDateString(record.startTime || record.time);
            break;
          case 'CervicalMucus':
          case 'MenstruationFlow':
          case 'OvulationTest':
          case 'IntermenstrualBleeding':
            addLog(`[HealthKitService] Qualitative record type '${recordType}' is not fully transformed. Passing raw value.`, 'warn', 'WARNING');
            value = record.value; // Pass raw value, might be string/enum
            recordDate = getDateString(record.startTime);
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
            value = record.value;
            recordDate = getDateString(record.startTime || record.time);
            break;
          case 'DietaryFatTotal':
          case 'DietaryProtein':
          case 'DietarySodium':
            value = record.value;
            recordDate = getDateString(record.startTime);
            break;
          case 'Workout':
          case 'ExerciseSession':
            if (record.startTime && record.endTime) {
              // HKWorkoutActivityType Mapping
              // Source: https://developer.apple.com/documentation/healthkit/hkworkoutactivitytype
              const ACTIVITY_MAP = {
                1: 'American Football', 2: 'Archery', 3: 'Australian Football', 4: 'Badminton',
                5: 'Baseball', 6: 'Basketball', 7: 'Bowling', 8: 'Boxing', 9: 'Climbing',
                10: 'Cricket', 11: 'Cross Training', 12: 'Curling', 13: 'Cycling (Indoor)',
                46: 'Cycling (Outdoor)', 13: 'Cycling', // Default cycling
                14: 'Dance', 16: 'Elliptical', 17: 'Equestrian Sports', 18: 'Fencing',
                19: 'Fishing', 20: 'Functional Strength Training', 21: 'Golf', 22: 'Gymnastics',
                23: 'Handball', 24: 'Hiking', 25: 'Hockey', 26: 'Hunting', 27: 'Lacrosse',
                28: 'Martial Arts', 29: 'Mind and Body', 30: 'Mixed Cardio', 31: 'Paddle Sports',
                32: 'Play', 33: 'Preparation and Recovery', 34: 'Racquetball', 35: 'Rowing',
                36: 'Rugby', 37: 'Running', 52: 'Running (Treadmill)', 38: 'Sailing',
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
              };

              const activityTypeName = ACTIVITY_MAP[record.activityType] || (record.activityType ? `Workout type ${record.activityType}` : 'Workout Session');

              // Handle duration which might be an object { unit: 's', quantity: 123 }
              let durationInSeconds = 0;
              if (record.duration && typeof record.duration === 'object' && record.duration.quantity !== undefined) {
                durationInSeconds = record.duration.quantity;
              } else if (typeof record.duration === 'number') {
                durationInSeconds = record.duration;
              }

              // Construct rich object for server
              transformedData.push({
                type: 'ExerciseSession', // Use ExerciseSession to match server/Android
                source: 'HealthKit',
                date: getDateString(record.startTime),
                entry_date: getDateString(record.startTime),
                timestamp: record.startTime,
                startTime: record.startTime,
                endTime: record.endTime,
                duration: durationInSeconds,
                activityType: activityTypeName,
                title: activityTypeName, // Use mapped name as title
                caloriesBurned: record.totalEnergyBurned || 0,
                distance: record.totalDistance || 0,
                notes: `Source: HealthKit`,
                raw_data: record
              });
              return; // Skip default push
            }
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
