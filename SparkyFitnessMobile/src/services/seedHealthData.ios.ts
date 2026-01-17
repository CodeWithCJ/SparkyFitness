import {
  saveQuantitySample,
  saveCategorySample,
  saveWorkoutSample,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';
import { addLog } from './LogService';

// ============================================================================
// Types
// ============================================================================

interface SeedResult {
  success: boolean;
  recordsInserted: number;
  error?: string;
}

interface QuantitySeedConfig {
  identifier: string;
  unit: string;
  range: [number, number];
  samplesPerDay?: number;
}

// Sleep analysis values from HKCategoryValueSleepAnalysis
// Defined locally to avoid issues with enum being undefined when library is mocked in tests
const SleepAnalysisValue = {
  inBed: 0,
  asleepUnspecified: 1,
  awake: 2,
  asleepCore: 3,  // Light sleep
  asleepDeep: 4,
  asleepREM: 5,
} as const;

// Workout activity types from HKWorkoutActivityType
// Defined locally to avoid issues with enum being undefined when library is mocked in tests
const WorkoutType = {
  running: 37,
  walking: 52,
  cycling: 13,
  traditionalStrengthTraining: 50,
  yoga: 57,
  highIntensityIntervalTraining: 63,
  swimming: 46,
  hiking: 24,
} as const;

// ============================================================================
// Utility Functions
// ============================================================================

const randomInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const randomFloat = (min: number, max: number): number =>
  Math.random() * (max - min) + min;

const isToday = (date: Date): boolean => {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
};

const getPastDates = (days: number): Date[] => {
  const dates: Date[] = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    date.setHours(12, 0, 0, 0);
    dates.push(date);
  }
  return dates;
};

// ============================================================================
// Permissions
// ============================================================================

const WRITE_PERMISSIONS = [
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierBasalEnergyBurned',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierHeight',
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKWorkoutTypeIdentifier',
] as const;

const requestWritePermissions = async (): Promise<boolean> => {
  try {
    const granted = await requestAuthorization({
      toShare: WRITE_PERMISSIONS as unknown as Parameters<typeof requestAuthorization>[0]['toShare'],
      toRead: [],
    });
    if (!granted) {
      addLog(`[SeedHealthData] Write permissions were denied by user`, 'warn', 'WARNING');
      return false;
    }
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[SeedHealthData] Failed to request write permissions: ${message}`, 'error', 'ERROR');
    return false;
  }
};

// ============================================================================
// Quantity Sample Seeders
// ============================================================================

const QUANTITY_CONFIGS: QuantitySeedConfig[] = [
  // Steps: 5000-12000 per day
  { identifier: 'HKQuantityTypeIdentifierStepCount', unit: 'count', range: [5000, 12000] },
  // Active Calories: 200-600 kcal per day
  { identifier: 'HKQuantityTypeIdentifierActiveEnergyBurned', unit: 'kcal', range: [200, 600] },
  // Basal Calories: 1400-1800 kcal per day
  { identifier: 'HKQuantityTypeIdentifierBasalEnergyBurned', unit: 'kcal', range: [1400, 1800] },
  // Distance: 3000-8000 meters per day
  { identifier: 'HKQuantityTypeIdentifierDistanceWalkingRunning', unit: 'm', range: [3000, 8000] },
];

const seedQuantitySamples = async (
  config: QuantitySeedConfig,
  dates: Date[]
): Promise<number> => {
  let count = 0;

  for (const date of dates) {
    try {
      const startTime = new Date(date);
      startTime.setHours(8, 0, 0, 0);
      const endTime = new Date(date);
      endTime.setHours(20, 0, 0, 0);

      // For today, don't set future end times
      if (isToday(date)) {
        const now = new Date();
        if (endTime > now) {
          endTime.setTime(now.getTime() - 60000);
        }
        if (startTime > now) {
          continue;
        }
      }

      const value = randomInt(config.range[0], config.range[1]);

      const success = await saveQuantitySample(
        config.identifier as Parameters<typeof saveQuantitySample>[0],
        config.unit,
        value,
        startTime,
        endTime,
        {}
      );

      if (success) {
        count++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[SeedHealthData] Failed to seed ${config.identifier}: ${message}`, 'warn', 'WARNING');
    }
  }

  return count;
};

// ============================================================================
// Heart Rate Seeder (multiple samples per day)
// ============================================================================

const seedHeartRate = async (dates: Date[]): Promise<number> => {
  let count = 0;

  for (const date of dates) {
    // 3 heart rate samples per day: morning, afternoon, evening
    const sampleHours = isToday(date) ? [8] : [8, 14, 20];

    for (const hour of sampleHours) {
      try {
        const sampleTime = new Date(date);
        sampleTime.setHours(hour, randomInt(0, 30), 0, 0);

        // For today, skip future samples
        if (isToday(date) && sampleTime > new Date()) {
          continue;
        }

        const endTime = new Date(sampleTime);
        endTime.setMinutes(endTime.getMinutes() + 1);

        const bpm = randomInt(60, 100);

        const success = await saveQuantitySample(
          'HKQuantityTypeIdentifierHeartRate',
          'count/min',
          bpm,
          sampleTime,
          endTime,
          {}
        );

        if (success) {
          count++;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addLog(`[SeedHealthData] Failed to seed heart rate: ${message}`, 'warn', 'WARNING');
      }
    }
  }

  return count;
};

// ============================================================================
// Weight Seeder (trending weight)
// ============================================================================

const seedWeight = async (dates: Date[]): Promise<number> => {
  let count = 0;
  const baseWeight = randomFloat(65, 85); // kg

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    try {
      const sampleTime = new Date(date);
      sampleTime.setHours(7, 15, 0, 0);

      // For today, skip if time hasn't passed yet
      if (isToday(date) && sampleTime > new Date()) {
        continue;
      }

      const endTime = new Date(sampleTime);
      endTime.setMinutes(endTime.getMinutes() + 1);

      // Add slight variation and downward trend
      const weightVariation = (Math.random() - 0.5) * 0.5;
      const trendAdjustment = i * 0.02;
      const weight = baseWeight + weightVariation - trendAdjustment;

      const success = await saveQuantitySample(
        'HKQuantityTypeIdentifierBodyMass',
        'kg',
        weight,
        sampleTime,
        endTime,
        {}
      );

      if (success) {
        count++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[SeedHealthData] Failed to seed weight: ${message}`, 'warn', 'WARNING');
    }
  }

  return count;
};

// ============================================================================
// Height Seeder (single static value)
// ============================================================================

const seedHeight = async (): Promise<number> => {
  try {
    const sampleTime = new Date();
    sampleTime.setDate(sampleTime.getDate() - 1);
    sampleTime.setHours(10, 0, 0, 0);

    const endTime = new Date(sampleTime);
    endTime.setMinutes(endTime.getMinutes() + 1);

    const height = randomFloat(1.65, 1.85); // meters

    const success = await saveQuantitySample(
      'HKQuantityTypeIdentifierHeight',
      'm',
      height,
      sampleTime,
      endTime,
      {}
    );

    return success ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[SeedHealthData] Failed to seed height: ${message}`, 'warn', 'WARNING');
    return 0;
  }
};

// ============================================================================
// Sleep Seeder
// ============================================================================

const SLEEP_STAGE_SEQUENCE = [
  SleepAnalysisValue.asleepCore,    // Light sleep
  SleepAnalysisValue.asleepDeep,    // Deep sleep
  SleepAnalysisValue.asleepREM,     // REM
  SleepAnalysisValue.asleepCore,    // Light sleep
  SleepAnalysisValue.awake,         // Brief wake
  SleepAnalysisValue.asleepCore,    // Light sleep
  SleepAnalysisValue.asleepDeep,    // Deep sleep
  SleepAnalysisValue.asleepREM,     // REM
];

const seedSleep = async (dates: Date[]): Promise<number> => {
  let count = 0;

  for (const date of dates) {
    // Skip today (sleep data is typically for the previous night)
    if (isToday(date)) continue;

    try {
      // Sleep starts the night before
      const bedtimeHour = randomInt(21, 23);
      const sleepDurationHours = randomFloat(6, 8);

      const sleepStart = new Date(date);
      sleepStart.setDate(sleepStart.getDate() - 1);
      sleepStart.setHours(bedtimeHour, randomInt(0, 59), 0, 0);

      const sleepEnd = new Date(sleepStart);
      sleepEnd.setHours(sleepEnd.getHours() + Math.floor(sleepDurationHours));
      sleepEnd.setMinutes(sleepEnd.getMinutes() + Math.floor((sleepDurationHours % 1) * 60));

      // Create sleep stages
      const totalMinutes = (sleepEnd.getTime() - sleepStart.getTime()) / 60000;
      const stageCount = SLEEP_STAGE_SEQUENCE.length;
      const avgStageDuration = totalMinutes / stageCount;

      let currentTime = new Date(sleepStart);

      for (let i = 0; i < stageCount; i++) {
        const stageDuration = avgStageDuration + randomInt(-15, 15);
        const stageEnd = new Date(currentTime);
        stageEnd.setMinutes(stageEnd.getMinutes() + Math.max(10, stageDuration));

        // Don't exceed total sleep duration
        if (stageEnd > sleepEnd) {
          stageEnd.setTime(sleepEnd.getTime());
        }

        const stageValue = SLEEP_STAGE_SEQUENCE[i];

        try {
          const success = await saveCategorySample(
            'HKCategoryTypeIdentifierSleepAnalysis',
            stageValue,
            currentTime,
            stageEnd,
            {}
          );

          if (success) {
            count++;
          }
        } catch {
          // Continue with other stages even if one fails
        }

        currentTime = stageEnd;
        if (currentTime >= sleepEnd) break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[SeedHealthData] Failed to seed sleep: ${message}`, 'warn', 'WARNING');
    }
  }

  return count;
};

// ============================================================================
// Workout Seeder
// ============================================================================

const WORKOUT_TYPES = [
  { type: WorkoutType.running, name: 'Running', durationMin: 20, durationMax: 60 },
  { type: WorkoutType.walking, name: 'Walking', durationMin: 15, durationMax: 45 },
  { type: WorkoutType.cycling, name: 'Cycling', durationMin: 20, durationMax: 60 },
  { type: WorkoutType.traditionalStrengthTraining, name: 'Strength Training', durationMin: 30, durationMax: 60 },
  { type: WorkoutType.yoga, name: 'Yoga', durationMin: 20, durationMax: 45 },
  { type: WorkoutType.highIntensityIntervalTraining, name: 'HIIT', durationMin: 15, durationMax: 30 },
  { type: WorkoutType.swimming, name: 'Swimming', durationMin: 20, durationMax: 45 },
  { type: WorkoutType.hiking, name: 'Hiking', durationMin: 30, durationMax: 120 },
];

const seedWorkouts = async (dates: Date[]): Promise<number> => {
  let count = 0;

  for (const date of dates) {
    // 50% chance of a workout on any given day, except today (always one)
    if (!isToday(date) && Math.random() > 0.5) continue;

    try {
      const workout = WORKOUT_TYPES[randomInt(0, WORKOUT_TYPES.length - 1)];
      const durationMinutes = isToday(date)
        ? Math.min(20, workout.durationMin)
        : randomInt(workout.durationMin, workout.durationMax);

      const startHour = isToday(date) ? 7 : randomInt(6, 18);
      const startTime = new Date(date);
      startTime.setHours(startHour, randomInt(0, 30), 0, 0);

      // For today, skip if the start time is in the future
      if (isToday(date) && startTime > new Date()) {
        continue;
      }

      const endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + durationMinutes);

      // For today, don't let end time be in the future
      if (isToday(date)) {
        const now = new Date();
        if (endTime > now) {
          endTime.setTime(now.getTime() - 60000);
        }
      }

      // Estimated calories based on workout type and duration
      const caloriesPerMinute = workout.type === WorkoutType.highIntensityIntervalTraining ? 12 :
        workout.type === WorkoutType.running ? 10 :
        workout.type === WorkoutType.cycling ? 8 :
        workout.type === WorkoutType.swimming ? 9 :
        6;
      const totalCalories = durationMinutes * caloriesPerMinute;

      // Estimated distance for applicable workouts (in meters)
      let totalDistance: number | undefined;
      const distanceWorkoutTypes = [WorkoutType.running, WorkoutType.walking, WorkoutType.cycling, WorkoutType.hiking] as number[];
      if (distanceWorkoutTypes.includes(workout.type)) {
        const speedMperMin = workout.type === WorkoutType.running ? 150 :
          workout.type === WorkoutType.cycling ? 300 :
          workout.type === WorkoutType.hiking ? 80 :
          90; // walking
        totalDistance = durationMinutes * speedMperMin;
      }

      await saveWorkoutSample(
        workout.type,
        [], // quantities (empty array for basic workout)
        startTime,
        endTime,
        {
          energyBurned: totalCalories,
          ...(totalDistance !== undefined && { distance: totalDistance }),
        },
        {}
      );

      count++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[SeedHealthData] Failed to seed workout: ${message}`, 'warn', 'WARNING');
    }
  }

  return count;
};

// ============================================================================
// Main Seed Function
// ============================================================================

export const seedHealthData = async (days: number = 7): Promise<SeedResult> => {
  addLog(`[SeedHealthData] Starting to seed ${days} days of health data for iOS...`, 'info', 'INFO');

  try {
    const permissionsGranted = await requestWritePermissions();
    if (!permissionsGranted) {
      return {
        success: false,
        recordsInserted: 0,
        error: 'Write permissions not granted. Please grant permissions in Health app settings.',
      };
    }

    const dates = getPastDates(days);
    let totalRecords = 0;
    const results: { type: string; count: number }[] = [];

    // Seed quantity samples
    for (const config of QUANTITY_CONFIGS) {
      try {
        const count = await seedQuantitySamples(config, dates);
        totalRecords += count;
        results.push({ type: config.identifier.split('Identifier')[1], count });
        addLog(`[SeedHealthData] Seeded ${config.identifier.split('Identifier')[1]}: ${count} records`, 'info', 'SUCCESS');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addLog(`[SeedHealthData] Failed to seed ${config.identifier}: ${message}`, 'warn', 'WARNING');
      }
    }

    // Seed heart rate
    try {
      const count = await seedHeartRate(dates);
      totalRecords += count;
      results.push({ type: 'HeartRate', count });
      addLog(`[SeedHealthData] Seeded HeartRate: ${count} records`, 'info', 'SUCCESS');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[SeedHealthData] Failed to seed HeartRate: ${message}`, 'warn', 'WARNING');
    }

    // Seed weight
    try {
      const count = await seedWeight(dates);
      totalRecords += count;
      results.push({ type: 'Weight', count });
      addLog(`[SeedHealthData] Seeded Weight: ${count} records`, 'info', 'SUCCESS');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[SeedHealthData] Failed to seed Weight: ${message}`, 'warn', 'WARNING');
    }

    // Seed height (single record)
    try {
      const count = await seedHeight();
      totalRecords += count;
      results.push({ type: 'Height', count });
      addLog(`[SeedHealthData] Seeded Height: ${count} records`, 'info', 'SUCCESS');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[SeedHealthData] Failed to seed Height: ${message}`, 'warn', 'WARNING');
    }

    // Seed sleep
    try {
      const count = await seedSleep(dates);
      totalRecords += count;
      results.push({ type: 'Sleep', count });
      addLog(`[SeedHealthData] Seeded Sleep: ${count} records`, 'info', 'SUCCESS');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[SeedHealthData] Failed to seed Sleep: ${message}`, 'warn', 'WARNING');
    }

    // Seed workouts
    try {
      const count = await seedWorkouts(dates);
      totalRecords += count;
      results.push({ type: 'Workout', count });
      addLog(`[SeedHealthData] Seeded Workout: ${count} records`, 'info', 'SUCCESS');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[SeedHealthData] Failed to seed Workout: ${message}`, 'warn', 'WARNING');
    }

    const successTypes = results.filter(r => r.count > 0).length;
    const totalTypes = results.length;

    addLog(`[SeedHealthData] Successfully seeded ${totalRecords} records (${successTypes}/${totalTypes} types)`, 'info', 'SUCCESS');

    return {
      success: true,
      recordsInserted: totalRecords,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[SeedHealthData] Error seeding health data: ${message}`, 'error', 'ERROR');
    return {
      success: false,
      recordsInserted: 0,
      error: message,
    };
  }
};
