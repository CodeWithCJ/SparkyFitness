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

// Distribute a total into count random-ish parts, each at least ~10% of the average
const splitIntoChunks = (total: number, count: number): number[] => {
  if (count <= 1) return [total];

  const minPerChunk = Math.max(1, Math.floor(total / count * 0.1));
  const chunks: number[] = [];
  let remaining = total;

  for (let i = 0; i < count - 1; i++) {
    const avgRemaining = remaining / (count - i);
    const lower = Math.max(minPerChunk, avgRemaining * 0.5);
    const upper = avgRemaining * 1.5;
    const chunk = Math.min(Math.floor(randomFloat(lower, upper)), remaining - minPerChunk * (count - i - 1));
    chunks.push(Math.max(minPerChunk, chunk));
    remaining -= chunks[i];
  }

  chunks.push(Math.max(minPerChunk, remaining));
  return chunks;
};

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
      addLog(`[SeedHealthData] Write permissions were denied by user`, 'WARNING');
      return false;
    }
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[SeedHealthData] Failed to request write permissions: ${message}`, 'ERROR');
    return false;
  }
};

// ============================================================================
// Quantity Sample Seeders
// ============================================================================

const QUANTITY_CONFIGS: QuantitySeedConfig[] = [
  // Steps: 5000-12000 per day
  { identifier: 'HKQuantityTypeIdentifierStepCount', unit: 'count', range: [5000, 12000], samplesPerDay: 8 },
  // Active Calories: 200-600 kcal per day
  { identifier: 'HKQuantityTypeIdentifierActiveEnergyBurned', unit: 'kcal', range: [200, 600], samplesPerDay: 6 },
  // Basal Calories: 1400-1800 kcal per day
  { identifier: 'HKQuantityTypeIdentifierBasalEnergyBurned', unit: 'kcal', range: [1400, 1800], samplesPerDay: 4 },
  // Distance: 3000-8000 meters per day
  { identifier: 'HKQuantityTypeIdentifierDistanceWalkingRunning', unit: 'm', range: [3000, 8000], samplesPerDay: 6 },
];

const seedQuantitySamples = async (
  config: QuantitySeedConfig,
  dates: Date[]
): Promise<number> => {
  let count = 0;
  const numSamples = config.samplesPerDay ?? 1;

  for (const date of dates) {
    try {
      if (numSamples <= 1) {
        // Single record per day (original behavior)
        const startTime = new Date(date);
        const endTime = new Date(date);

        if (isToday(date)) {
          const now = new Date();
          startTime.setHours(0, 0, 0, 0);
          endTime.setTime(now.getTime() - 60000);

          if (endTime <= startTime) {
            continue;
          }
        } else {
          startTime.setHours(8, 0, 0, 0);
          endTime.setHours(20, 0, 0, 0);
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
      } else {
        // Multiple records per day to mimic real HealthKit data
        const dailyTotal = randomInt(config.range[0], config.range[1]);
        const todayDate = isToday(date);
        const samplesForDay = todayDate ? Math.ceil(numSamples / 3) : numSamples;
        const chunks = splitIntoChunks(dailyTotal, samplesForDay);

        // Define the active window for the day
        let windowStartHour: number;
        let windowEndHour: number;

        if (todayDate) {
          const now = new Date();
          windowStartHour = 6;
          // End window at current hour (or at least 7 AM to allow some room)
          windowEndHour = Math.max(windowStartHour + 1, now.getHours());

          // Skip if it's too early in the day
          if (now.getHours() < windowStartHour) {
            continue;
          }
        } else {
          windowStartHour = 6;
          windowEndHour = 22;
        }

        const totalWindowMinutes = (windowEndHour - windowStartHour) * 60;
        const slotMinutes = Math.floor(totalWindowMinutes / samplesForDay);

        for (let i = 0; i < samplesForDay; i++) {
          try {
            const slotStartMinutes = windowStartHour * 60 + i * slotMinutes;
            // Offset within the slot, leaving room for duration
            const maxOffset = Math.max(0, slotMinutes - 45);
            const offsetMinutes = randomInt(0, maxOffset);
            const durationMinutes = randomInt(15, 45);

            const startTime = new Date(date);
            startTime.setHours(0, 0, 0, 0);
            startTime.setMinutes(slotStartMinutes + offsetMinutes);

            const endTime = new Date(startTime);
            endTime.setMinutes(endTime.getMinutes() + durationMinutes);

            // Clamp end time to not exceed the slot boundary
            const slotEnd = new Date(date);
            slotEnd.setHours(0, 0, 0, 0);
            slotEnd.setMinutes(slotStartMinutes + slotMinutes);
            if (endTime > slotEnd) {
              endTime.setTime(slotEnd.getTime());
            }

            // For today, ensure we don't write samples in the future
            if (todayDate) {
              const now = new Date();
              if (startTime >= now || endTime >= now) {
                continue;
              }
            }

            const success = await saveQuantitySample(
              config.identifier as Parameters<typeof saveQuantitySample>[0],
              config.unit,
              chunks[i],
              startTime,
              endTime,
              {}
            );

            if (success) {
              count++;
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            addLog(`[SeedHealthData] Failed to seed ${config.identifier}: ${message}`, 'WARNING');
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[SeedHealthData] Failed to seed ${config.identifier}: ${message}`, 'WARNING');
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
    // For today, filter to hours that have already passed
    const allHours = [6, 8, 14, 20];
    const currentHour = new Date().getHours();
    const sampleHours = isToday(date)
      ? allHours.filter(h => h < currentHour)
      : allHours.slice(1); // Skip 6 AM for past days

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
        addLog(`[SeedHealthData] Failed to seed heart rate: ${message}`, 'WARNING');
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

      if (isToday(date)) {
        // For today, use 1 minute ago to ensure sample is in the past
        const now = new Date();
        sampleTime.setTime(now.getTime() - 60000);
      } else {
        sampleTime.setHours(7, 15, 0, 0);
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
      addLog(`[SeedHealthData] Failed to seed weight: ${message}`, 'WARNING');
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
    addLog(`[SeedHealthData] Failed to seed height: ${message}`, 'WARNING');
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
      addLog(`[SeedHealthData] Failed to seed sleep: ${message}`, 'WARNING');
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
      const now = new Date();

      let startTime: Date;
      let endTime: Date;
      let durationMinutes: number;

      if (isToday(date)) {
        // For today, place workout ending 2 minutes ago
        durationMinutes = Math.min(20, workout.durationMin);
        endTime = new Date(now.getTime() - 120000); // 2 minutes ago
        startTime = new Date(endTime.getTime() - durationMinutes * 60000);

        // Skip if we don't have enough time since midnight
        const midnight = new Date(date);
        midnight.setHours(0, 0, 0, 0);
        if (startTime < midnight) {
          continue;
        }
      } else {
        durationMinutes = randomInt(workout.durationMin, workout.durationMax);
        const startHour = randomInt(6, 18);
        startTime = new Date(date);
        startTime.setHours(startHour, randomInt(0, 30), 0, 0);
        endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + durationMinutes);
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
      addLog(`[SeedHealthData] Failed to seed workout: ${message}`, 'WARNING');
    }
  }

  return count;
};

// ============================================================================
// Main Seed Function
// ============================================================================

/**
 * Seeds a sparse set of step records across the past year for testing
 * long-range sync. Places 2-3 records in the 3-6 month range and
 * 2-3 records in the 6-12 month range.
 */
export const seedHistoricalSteps = async (): Promise<SeedResult> => {
  addLog('[SeedHealthData] Starting to seed historical step data (past year)...', 'INFO');

  try {
    const permissionsGranted = await requestWritePermissions();
    if (!permissionsGranted) {
      return {
        success: false,
        recordsInserted: 0,
        error: 'Write permissions not granted. Please grant permissions in Health app settings.',
      };
    }

    const now = new Date();
    let totalRecords = 0;

    // Pick random dates in each range
    const pickRandomDates = (minDaysAgo: number, maxDaysAgo: number, count: number): Date[] => {
      const dates: Date[] = [];
      for (let i = 0; i < count; i++) {
        const daysAgo = randomInt(minDaysAgo, maxDaysAgo);
        const date = new Date(now);
        date.setDate(date.getDate() - daysAgo);
        date.setHours(12, 0, 0, 0);
        dates.push(date);
      }
      return dates;
    };

    const stepsConfig: QuantitySeedConfig = {
      identifier: 'HKQuantityTypeIdentifierStepCount',
      unit: 'count',
      range: [5000, 12000],
      samplesPerDay: 8,
    };

    // 2-3 records between 3-6 months ago (~90-180 days)
    const midRangeDates = pickRandomDates(90, 180, randomInt(2, 3));
    const midCount = await seedQuantitySamples(stepsConfig, midRangeDates);
    totalRecords += midCount;
    addLog(`[SeedHistoricalSteps] Seeded ${midCount} step records in 3-6 month range`, 'SUCCESS');

    // 2-3 records between 6-12 months ago (~180-365 days)
    const farRangeDates = pickRandomDates(180, 365, randomInt(2, 3));
    const farCount = await seedQuantitySamples(stepsConfig, farRangeDates);
    totalRecords += farCount;
    addLog(`[SeedHistoricalSteps] Seeded ${farCount} step records in 6-12 month range`, 'SUCCESS');

    addLog(`[SeedHistoricalSteps] Done — ${totalRecords} total step records seeded`, 'SUCCESS');

    return { success: true, recordsInserted: totalRecords };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[SeedHistoricalSteps] Error: ${message}`, 'ERROR');
    return { success: false, recordsInserted: 0, error: message };
  }
};

export const seedHealthData = async (days: number = 7): Promise<SeedResult> => {
  addLog(`[SeedHealthData] Starting to seed ${days} days of health data for iOS...`, 'INFO');

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
        addLog(`[SeedHealthData] Seeded ${config.identifier.split('Identifier')[1]}: ${count} records`, 'SUCCESS');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addLog(`[SeedHealthData] Failed to seed ${config.identifier}: ${message}`, 'WARNING');
      }
    }

    // Seed heart rate
    try {
      const count = await seedHeartRate(dates);
      totalRecords += count;
      results.push({ type: 'HeartRate', count });
      addLog(`[SeedHealthData] Seeded HeartRate: ${count} records`, 'SUCCESS');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[SeedHealthData] Failed to seed HeartRate: ${message}`, 'WARNING');
    }

    // Seed weight
    try {
      const count = await seedWeight(dates);
      totalRecords += count;
      results.push({ type: 'Weight', count });
      addLog(`[SeedHealthData] Seeded Weight: ${count} records`, 'SUCCESS');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[SeedHealthData] Failed to seed Weight: ${message}`, 'WARNING');
    }

    // Seed height (single record)
    try {
      const count = await seedHeight();
      totalRecords += count;
      results.push({ type: 'Height', count });
      addLog(`[SeedHealthData] Seeded Height: ${count} records`, 'SUCCESS');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[SeedHealthData] Failed to seed Height: ${message}`, 'WARNING');
    }

    // Seed sleep
    try {
      const count = await seedSleep(dates);
      totalRecords += count;
      results.push({ type: 'Sleep', count });
      addLog(`[SeedHealthData] Seeded Sleep: ${count} records`, 'SUCCESS');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[SeedHealthData] Failed to seed Sleep: ${message}`, 'WARNING');
    }

    // Seed workouts
    try {
      const count = await seedWorkouts(dates);
      totalRecords += count;
      results.push({ type: 'Workout', count });
      addLog(`[SeedHealthData] Seeded Workout: ${count} records`, 'SUCCESS');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[SeedHealthData] Failed to seed Workout: ${message}`, 'WARNING');
    }

    const successTypes = results.filter(r => r.count > 0).length;
    const totalTypes = results.length;

    addLog(`[SeedHealthData] Successfully seeded ${totalRecords} records (${successTypes}/${totalTypes} types)`, 'SUCCESS');

    return {
      success: true,
      recordsInserted: totalRecords,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[SeedHealthData] Error seeding health data: ${message}`, 'ERROR');
    return {
      success: false,
      recordsInserted: 0,
      error: message,
    };
  }
};
