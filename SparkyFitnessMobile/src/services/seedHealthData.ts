import {
  insertRecords,
  requestPermission,
} from 'react-native-health-connect';
import { addLog } from './LogService';

// ============================================================================
// Types
// ============================================================================

interface SeedResult {
  success: boolean;
  recordsInserted: number;
  error?: string;
}

type IntervalValueType = 'count' | 'floors' | 'energy' | 'distance' | 'elevation' | 'volume';
type InstantValueType = 'mass' | 'length' | 'percentage' | 'temperature' | 'rate' | 'bloodGlucose' | 'power' | 'enum' | 'marker';

type IntervalSeedConfig = {
  recordType: string;
  seedType: 'interval';
  valueKey: string;
  valueType: IntervalValueType;
  range: [number, number];
  recordsPerDay?: number;
};

type InstantSeedConfig = {
  recordType: string;
  seedType: 'instant';
  valueKey: string | null;
  valueType: InstantValueType;
  unit?: string;
  range?: [number, number];
  enumValues?: number[];
};

type SamplesSeedConfig = {
  recordType: string;
  seedType: 'samples';
  sampleKey: string;
  unit?: string; // Only needed if valueIsObject is true
  range: [number, number];
  samplesPerRecord: number;
  valueIsObject?: boolean; // true for Speed/Power, false for cadence records
};

type CustomSeedConfig = {
  recordType: string;
  seedType: 'custom';
  seeder: (days: number) => Promise<number>;
};

type SeedConfig = IntervalSeedConfig | InstantSeedConfig | SamplesSeedConfig | CustomSeedConfig;

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

const getSafeHour = (date: Date, preferredHour: number): number => {
  if (isToday(date)) {
    return 0;
  }
  return preferredHour;
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

/**
 * Distributes a total into `count` random chunks where each chunk
 * is at least ~10% of the even share to avoid zero/tiny entries.
 */
const splitIntoChunks = (total: number, count: number): number[] => {
  const minShare = Math.floor(total / count * 0.1);
  const remaining = total - minShare * count;

  // Generate random weights and normalize them to distribute the remainder
  const weights = Array.from({ length: count }, () => Math.random());
  const weightSum = weights.reduce((sum, w) => sum + w, 0);

  const chunks = weights.map((w) =>
    Math.floor(minShare + (w / weightSum) * remaining)
  );

  // Assign any rounding remainder to the last chunk
  const distributed = chunks.reduce((sum, c) => sum + c, 0);
  chunks[chunks.length - 1] += total - distributed;

  return chunks;
};

// ============================================================================
// Value Builders
// ============================================================================

const INTERVAL_VALUE_BUILDERS: Record<IntervalValueType, (v: number) => unknown> = {
  count: (v) => v,
  floors: (v) => v,
  energy: (v) => ({ value: v, unit: 'kilocalories' }),
  distance: (v) => ({ value: v, unit: 'meters' }),
  elevation: (v) => ({ value: v, unit: 'meters' }),
  volume: (v) => ({ value: v, unit: 'milliliters' }),
};

const INSTANT_VALUE_BUILDERS: Record<InstantValueType, (v: number, config: InstantSeedConfig) => unknown> = {
  mass: (v, c) => ({ value: v, unit: c.unit || 'kilograms' }),
  length: (v, c) => ({ value: v, unit: c.unit || 'meters' }),
  percentage: (v) => v, // Raw number for percentage fields
  temperature: (v) => ({ value: v, unit: 'celsius' }),
  rate: (v) => v,
  bloodGlucose: (v) => ({ value: v, unit: 'millimolesPerLiter' }),
  power: (v) => ({ value: v, unit: 'kilocaloriesPerDay' }),
  enum: (_v, c) => c.enumValues?.[randomInt(0, (c.enumValues?.length ?? 1) - 1)] ?? 1,
  marker: () => undefined,
};

// ============================================================================
// Record Builders
// ============================================================================

const buildIntervalRecord = (config: IntervalSeedConfig, startTime: Date, endTime: Date) => {
  const value = randomInt(config.range[0], config.range[1]);
  const builder = INTERVAL_VALUE_BUILDERS[config.valueType];

  return {
    recordType: config.recordType,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    [config.valueKey]: builder(value),
  };
};

const buildInstantRecord = (config: InstantSeedConfig, time: Date) => {
  const record: Record<string, unknown> = {
    recordType: config.recordType,
    time: time.toISOString(),
  };

  if (config.valueType === 'marker' || config.valueKey === null) {
    return record;
  }

  const value = config.range ? randomFloat(config.range[0], config.range[1]) : 0;
  const builder = INSTANT_VALUE_BUILDERS[config.valueType];
  record[config.valueKey] = builder(value, config);

  return record;
};

// ============================================================================
// Generic Seeders
// ============================================================================

const buildMultiRecordDay = (
  config: IntervalSeedConfig,
  date: Date,
  numRecords: number
): ReturnType<typeof buildIntervalRecord>[] => {
  const dailyTotal = randomInt(config.range[0], config.range[1]);
  const chunks = splitIntoChunks(dailyTotal, numRecords);

  const today = isToday(date);
  const dayStartHour = today ? 0 : 6;
  const dayEndHour = today ? 0 : 22;
  const totalHours = today ? 1 : dayEndHour - dayStartHour;
  const windowMinutes = Math.floor((totalHours * 60) / numRecords);

  const builder = INTERVAL_VALUE_BUILDERS[config.valueType];

  return chunks.map((chunkValue, i) => {
    const windowStartMinutes = dayStartHour * 60 + i * windowMinutes;
    const offsetMinutes = today ? i * 10 : randomInt(0, Math.max(0, windowMinutes - 20));

    const startTime = new Date(date);
    startTime.setHours(0, 0, 0, 0);
    startTime.setMinutes(windowStartMinutes + offsetMinutes);

    const endTime = new Date(startTime);
    const maxDuration = Math.max(5, Math.min(15, windowMinutes - offsetMinutes));
    endTime.setMinutes(endTime.getMinutes() + randomInt(5, maxDuration));

    return {
      recordType: config.recordType,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      [config.valueKey]: builder(chunkValue),
    };
  });
};

const seedIntervalRecords = async (
  config: IntervalSeedConfig,
  days: number
): Promise<number> => {
  const dates = getPastDates(days);
  const records = dates.flatMap((date) => {
    if (!config.recordsPerDay) {
      const startHour = getSafeHour(date, 8);
      const startTime = new Date(date);
      startTime.setHours(startHour, 0, 0, 0);
      const endTime = new Date(date);
      endTime.setHours(startHour, 30, 0, 0);

      return [buildIntervalRecord(config, startTime, endTime)];
    }

    const numRecords = isToday(date)
      ? Math.ceil(config.recordsPerDay / 3)
      : config.recordsPerDay;

    return buildMultiRecordDay(config, date, numRecords);
  });

  await insertRecords(records as Parameters<typeof insertRecords>[0]);
  return records.length;
};

const seedInstantRecords = async (
  config: InstantSeedConfig,
  days: number
): Promise<number> => {
  const dates = getPastDates(days);
  const records = dates.map((date) => {
    const hour = getSafeHour(date, 7);
    const time = new Date(date);
    time.setHours(hour, 15, 0, 0);

    return buildInstantRecord(config, time);
  });

  await insertRecords(records as unknown as Parameters<typeof insertRecords>[0]);
  return records.length;
};

const seedSamplesRecords = async (
  config: SamplesSeedConfig,
  days: number
): Promise<number> => {
  const dates = getPastDates(days);
  const records = dates.map((date) => {
    const startHour = getSafeHour(date, 8);
    const startTime = new Date(date);
    startTime.setHours(startHour, 0, 0, 0);
    const endTime = new Date(date);
    endTime.setHours(startHour, 30, 0, 0);

    const samples = [];
    const intervalMs = (endTime.getTime() - startTime.getTime()) / config.samplesPerRecord;
    for (let i = 0; i < config.samplesPerRecord; i++) {
      const sampleTime = new Date(startTime.getTime() + intervalMs * i);
      const rawValue = randomFloat(config.range[0], config.range[1]);
      samples.push({
        time: sampleTime.toISOString(),
        [config.sampleKey]: config.valueIsObject
          ? { value: rawValue, unit: config.unit }
          : rawValue,
      });
    }

    return {
      recordType: config.recordType,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      samples,
    };
  });

  await insertRecords(records as Parameters<typeof insertRecords>[0]);
  return records.length;
};

// ============================================================================
// Custom Seeders (complex record structures)
// ============================================================================

const EXERCISE_TYPES = [
  { type: 56, name: 'Running', durationMin: 20, durationMax: 60 },
  { type: 79, name: 'Walking', durationMin: 15, durationMax: 45 },
  { type: 8, name: 'Biking', durationMin: 20, durationMax: 60 },
  { type: 70, name: 'Strength Training', durationMin: 30, durationMax: 60 },
  { type: 83, name: 'Yoga', durationMin: 20, durationMax: 45 },
  { type: 36, name: 'HIIT', durationMin: 15, durationMax: 30 },
  { type: 74, name: 'Swimming', durationMin: 20, durationMax: 45 },
  { type: 37, name: 'Hiking', durationMin: 30, durationMax: 120 },
];

const seedHeartRate = async (days: number): Promise<number> => {
  const dates = getPastDates(days);
  let totalRecords = 0;

  for (const date of dates) {
    const baseHour = getSafeHour(date, 8);
    const startTime = new Date(date);
    startTime.setHours(baseHour, 0, 0, 0);
    const endTime = new Date(date);
    endTime.setHours(baseHour, 30, 0, 0);

    const samples = [];
    for (let i = 0; i < 3; i++) {
      const sampleTime = new Date(date);
      sampleTime.setHours(baseHour, 5 + i * 8, 0, 0);
      samples.push({
        time: sampleTime.toISOString(),
        beatsPerMinute: randomInt(60, 100),
      });
    }

    const record = {
      recordType: 'HeartRate' as const,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      samples,
    };

    await insertRecords([record]);
    totalRecords++;
  }

  return totalRecords;
};

const seedWeight = async (days: number): Promise<number> => {
  const dates = getPastDates(days);
  const baseWeight = randomInt(60, 90);

  const records = dates.map((date, index) => {
    const hour = getSafeHour(date, 7);
    const time = new Date(date);
    time.setHours(hour, 15, 0, 0);

    const weightVariation = (Math.random() - 0.5) * 0.5;
    const trendAdjustment = index * 0.02;

    return {
      recordType: 'Weight' as const,
      time: time.toISOString(),
      weight: {
        value: baseWeight + weightVariation - trendAdjustment,
        unit: 'kilograms' as const,
      },
    };
  });

  await insertRecords(records);
  return records.length;
};

const seedBloodPressure = async (days: number): Promise<number> => {
  const dates = getPastDates(days);
  const records = [];

  for (const date of dates) {
    const hour = getSafeHour(date, 7);
    const morningTime = new Date(date);
    morningTime.setHours(hour, randomInt(0, 20), 0, 0);
    records.push({
      recordType: 'BloodPressure' as const,
      time: morningTime.toISOString(),
      systolic: {
        value: randomInt(110, 130),
        unit: 'millimetersOfMercury' as const,
      },
      diastolic: {
        value: randomInt(70, 85),
        unit: 'millimetersOfMercury' as const,
      },
      bodyPosition: 2,
      measurementLocation: 3,
    });

    if (!isToday(date) && Math.random() > 0.5) {
      const eveningTime = new Date(date);
      eveningTime.setHours(20, randomInt(0, 30), 0, 0);
      records.push({
        recordType: 'BloodPressure' as const,
        time: eveningTime.toISOString(),
        systolic: {
          value: randomInt(115, 135),
          unit: 'millimetersOfMercury' as const,
        },
        diastolic: {
          value: randomInt(72, 88),
          unit: 'millimetersOfMercury' as const,
        },
        bodyPosition: 2,
        measurementLocation: 3,
      });
    }
  }

  await insertRecords(records);
  return records.length;
};

const seedHydration = async (days: number): Promise<number> => {
  const dates = getPastDates(days);
  const records = [];

  for (const date of dates) {
    const baseHour = getSafeHour(date, 7);
    const entriesPerDay = isToday(date) ? 2 : randomInt(4, 8);

    for (let i = 0; i < entriesPerDay; i++) {
      const hour = isToday(date)
        ? baseHour
        : 7 + Math.floor((i / entriesPerDay) * 14);
      const startTime = new Date(date);
      startTime.setHours(hour, isToday(date) ? i * 10 : randomInt(0, 59), 0, 0);
      const endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + 5);

      records.push({
        recordType: 'Hydration' as const,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        volume: {
          value: randomInt(200, 500),
          unit: 'milliliters' as const,
        },
      });
    }
  }

  await insertRecords(records);
  return records.length;
};

const seedExerciseSessions = async (days: number): Promise<number> => {
  const dates = getPastDates(days);
  let totalRecords = 0;

  for (const date of dates) {
    const sessionsToday = isToday(date) ? 1 : randomInt(1, 2);

    for (let i = 0; i < sessionsToday; i++) {
      const exercise = EXERCISE_TYPES[randomInt(0, EXERCISE_TYPES.length - 1)];
      const durationMinutes = isToday(date)
        ? Math.min(20, exercise.durationMin)
        : randomInt(exercise.durationMin, exercise.durationMax);

      const startHour = isToday(date)
        ? 0
        : i === 0
          ? randomInt(6, 9)
          : randomInt(17, 19);
      const startTime = new Date(date);
      startTime.setHours(startHour, isToday(date) ? 1 : randomInt(0, 30), 0, 0);

      const endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + durationMinutes);

      const record = {
        recordType: 'ExerciseSession' as const,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        exerciseType: exercise.type,
        title: exercise.name,
      };

      await insertRecords([record]);
      totalRecords++;
    }
  }

  return totalRecords;
};

const SLEEP_STAGES = [
  { stage: 1, name: 'AWAKE' },
  { stage: 2, name: 'SLEEPING' },
  { stage: 3, name: 'OUT_OF_BED' },
  { stage: 4, name: 'LIGHT' },
  { stage: 5, name: 'DEEP' },
  { stage: 6, name: 'REM' },
];

const seedSleepSession = async (days: number): Promise<number> => {
  const dates = getPastDates(days);
  let totalRecords = 0;

  for (const date of dates) {
    if (isToday(date)) continue;

    const bedtimeHour = randomInt(21, 23);
    const sleepDurationHours = randomFloat(6, 9);

    const startTime = new Date(date);
    startTime.setDate(startTime.getDate() - 1);
    startTime.setHours(bedtimeHour, randomInt(0, 59), 0, 0);

    const endTime = new Date(startTime);
    endTime.setHours(endTime.getHours() + Math.floor(sleepDurationHours));
    endTime.setMinutes(endTime.getMinutes() + Math.floor((sleepDurationHours % 1) * 60));

    const stages = [];
    let currentTime = new Date(startTime);
    const totalMinutes = (endTime.getTime() - startTime.getTime()) / 60000;
    let remainingMinutes = totalMinutes;

    while (remainingMinutes > 0) {
      const stageDuration = Math.min(randomInt(30, 90), remainingMinutes);
      const stageEndTime = new Date(currentTime);
      stageEndTime.setMinutes(stageEndTime.getMinutes() + stageDuration);

      const stageType = SLEEP_STAGES[randomInt(3, 5)];
      stages.push({
        startTime: currentTime.toISOString(),
        endTime: stageEndTime.toISOString(),
        stage: stageType.stage,
      });

      currentTime = stageEndTime;
      remainingMinutes -= stageDuration;
    }

    const record = {
      recordType: 'SleepSession' as const,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      stages,
    };

    await insertRecords([record]);
    totalRecords++;
  }

  return totalRecords;
};

const seedNutrition = async (days: number): Promise<number> => {
  const dates = getPastDates(days);
  const records = [];

  for (const date of dates) {
    const mealsPerDay = isToday(date) ? 1 : randomInt(2, 4);
    const mealHours = [8, 12, 15, 19];

    for (let i = 0; i < mealsPerDay; i++) {
      const hour = isToday(date) ? getSafeHour(date, 8) : mealHours[i];
      const startTime = new Date(date);
      startTime.setHours(hour, randomInt(0, 30), 0, 0);
      const endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + randomInt(15, 45));

      records.push({
        recordType: 'Nutrition' as const,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        mealType: randomInt(1, 4), // 1=breakfast, 2=lunch, 3=dinner, 4=snack
        energy: { value: randomInt(300, 800), unit: 'kilocalories' as const },
        protein: { value: randomInt(10, 40), unit: 'grams' as const },
        totalFat: { value: randomInt(5, 30), unit: 'grams' as const },
        totalCarbohydrate: { value: randomInt(20, 80), unit: 'grams' as const },
        dietaryFiber: { value: randomInt(2, 15), unit: 'grams' as const },
        sugar: { value: randomInt(5, 30), unit: 'grams' as const },
        sodium: { value: randomInt(200, 1000), unit: 'milligrams' as const },
      });
    }
  }

  await insertRecords(records);
  return records.length;
};

// ============================================================================
// Seed Configuration
// ============================================================================

const SEED_CONFIGS: SeedConfig[] = [
  // Interval records
  { recordType: 'Steps', seedType: 'interval', valueKey: 'count', valueType: 'count', range: [5000, 15000], recordsPerDay: 8 },
  { recordType: 'Distance', seedType: 'interval', valueKey: 'distance', valueType: 'distance', range: [3000, 12000], recordsPerDay: 6 },
  { recordType: 'FloorsClimbed', seedType: 'interval', valueKey: 'floors', valueType: 'floors', range: [5, 25], recordsPerDay: 4 },
  { recordType: 'WheelchairPushes', seedType: 'interval', valueKey: 'count', valueType: 'count', range: [100, 500] },
  { recordType: 'ElevationGained', seedType: 'interval', valueKey: 'elevation', valueType: 'elevation', range: [20, 150] },
  { recordType: 'ActiveCaloriesBurned', seedType: 'interval', valueKey: 'energy', valueType: 'energy', range: [200, 800], recordsPerDay: 6 },
  { recordType: 'TotalCaloriesBurned', seedType: 'interval', valueKey: 'energy', valueType: 'energy', range: [1800, 3000], recordsPerDay: 6 },

  // Samples-based records
  { recordType: 'Speed', seedType: 'samples', sampleKey: 'speed', unit: 'metersPerSecond', range: [1, 5], samplesPerRecord: 5, valueIsObject: true },
  { recordType: 'Power', seedType: 'samples', sampleKey: 'power', unit: 'watts', range: [50, 300], samplesPerRecord: 5, valueIsObject: true },
  // StepsCadence omitted - Health Connect returns cryptic "count" error when writing
  { recordType: 'CyclingPedalingCadence', seedType: 'samples', sampleKey: 'revolutionsPerMinute', range: [60, 100], samplesPerRecord: 5 },

  // Instant records
  { recordType: 'Height', seedType: 'instant', valueKey: 'height', valueType: 'length', unit: 'meters', range: [1.5, 1.9] },
  { recordType: 'BodyFat', seedType: 'instant', valueKey: 'percentage', valueType: 'percentage', range: [15, 30] },
  { recordType: 'LeanBodyMass', seedType: 'instant', valueKey: 'mass', valueType: 'mass', unit: 'kilograms', range: [45, 70] },
  { recordType: 'BoneMass', seedType: 'instant', valueKey: 'mass', valueType: 'mass', unit: 'kilograms', range: [2, 4] },
  { recordType: 'BodyTemperature', seedType: 'instant', valueKey: 'temperature', valueType: 'temperature', range: [36.1, 37.2] },
  { recordType: 'BasalBodyTemperature', seedType: 'instant', valueKey: 'temperature', valueType: 'temperature', range: [36.0, 36.8] },
  { recordType: 'RestingHeartRate', seedType: 'instant', valueKey: 'beatsPerMinute', valueType: 'rate', range: [55, 75] },
  { recordType: 'RespiratoryRate', seedType: 'instant', valueKey: 'rate', valueType: 'rate', range: [12, 20] },
  { recordType: 'OxygenSaturation', seedType: 'instant', valueKey: 'percentage', valueType: 'percentage', range: [95, 100] },
  { recordType: 'BloodGlucose', seedType: 'instant', valueKey: 'level', valueType: 'bloodGlucose', range: [4, 10] }, // mmol/L (normal range)
  { recordType: 'BasalMetabolicRate', seedType: 'instant', valueKey: 'basalMetabolicRate', valueType: 'power', range: [1400, 2000] },
  { recordType: 'Vo2Max', seedType: 'instant', valueKey: 'vo2MillilitersPerMinuteKilogram', valueType: 'rate', range: [30, 50] },
  { recordType: 'CervicalMucus', seedType: 'instant', valueKey: 'appearance', valueType: 'enum', enumValues: [1, 2, 3, 4, 5] },
  { recordType: 'OvulationTest', seedType: 'instant', valueKey: 'result', valueType: 'enum', enumValues: [1, 2, 3] },
  { recordType: 'IntermenstrualBleeding', seedType: 'instant', valueKey: null, valueType: 'marker' },

  // Custom seeders
  { recordType: 'HeartRate', seedType: 'custom', seeder: seedHeartRate },
  { recordType: 'BloodPressure', seedType: 'custom', seeder: seedBloodPressure },
  { recordType: 'ExerciseSession', seedType: 'custom', seeder: seedExerciseSessions },
  { recordType: 'Weight', seedType: 'custom', seeder: seedWeight },
  { recordType: 'Hydration', seedType: 'custom', seeder: seedHydration },
  { recordType: 'SleepSession', seedType: 'custom', seeder: seedSleepSession },
  { recordType: 'Nutrition', seedType: 'custom', seeder: seedNutrition },
];

// ============================================================================
// Permissions
// ============================================================================

const getWritePermissions = () => {
  return SEED_CONFIGS.map(config => ({
    accessType: 'write' as const,
    recordType: config.recordType,
  }));
};

const requestWritePermissions = async (): Promise<boolean> => {
  try {
    const permissionsToRequest = getWritePermissions();
    const permissions = await requestPermission(
      permissionsToRequest as unknown as Parameters<typeof requestPermission>[0]
    );

    const granted = permissionsToRequest.filter((requested) =>
      permissions.some(
        (p) => p.recordType === requested.recordType && p.accessType === 'write'
      )
    );

    const denied = permissionsToRequest.filter((requested) =>
      !permissions.some(
        (p) => p.recordType === requested.recordType && p.accessType === 'write'
      )
    );

    if (denied.length > 0) {
      const deniedTypes = denied.map((p) => p.recordType).join(', ');
      addLog(`[SeedHealthData] Some write permissions not returned: ${deniedTypes}. Will attempt to seed anyway.`, 'WARNING');
    }

    addLog(`[SeedHealthData] ${granted.length}/${permissionsToRequest.length} write permissions confirmed`, 'INFO');

    // Return true if at least some permissions were granted.
    // Individual record insertions will fail gracefully if a specific permission is missing.
    return granted.length > 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[SeedHealthData] Failed to request write permissions: ${message}`, 'ERROR');
    return false;
  }
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
    // Request only Steps write permission
    try {
      await requestPermission([
        { accessType: 'write' as const, recordType: 'Steps' },
      ] as unknown as Parameters<typeof requestPermission>[0]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[SeedHistoricalSteps] Failed to request write permissions: ${message}`, 'ERROR');
      return { success: false, recordsInserted: 0, error: 'Write permissions not granted.' };
    }

    const now = new Date();
    let totalRecords = 0;

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

    const stepsConfig: IntervalSeedConfig = {
      recordType: 'Steps',
      seedType: 'interval',
      valueKey: 'count',
      valueType: 'count',
      range: [5000, 15000],
      recordsPerDay: 8,
    };

    // 2-3 records between 3-6 months ago (~90-180 days)
    const midRangeDays = pickRandomDates(90, 180, randomInt(2, 3));
    for (const date of midRangeDays) {
      const records = buildMultiRecordDay(stepsConfig, date, stepsConfig.recordsPerDay!);
      await insertRecords(records as Parameters<typeof insertRecords>[0]);
      totalRecords += records.length;
    }
    addLog(`[SeedHistoricalSteps] Seeded step records for ${midRangeDays.length} days in 3-6 month range`, 'SUCCESS');

    // 2-3 records between 6-12 months ago (~180-365 days)
    const farRangeDays = pickRandomDates(180, 365, randomInt(2, 3));
    for (const date of farRangeDays) {
      const records = buildMultiRecordDay(stepsConfig, date, stepsConfig.recordsPerDay!);
      await insertRecords(records as Parameters<typeof insertRecords>[0]);
      totalRecords += records.length;
    }
    addLog(`[SeedHistoricalSteps] Seeded step records for ${farRangeDays.length} days in 6-12 month range`, 'SUCCESS');

    addLog(`[SeedHistoricalSteps] Done — ${totalRecords} total step records seeded`, 'SUCCESS');

    return { success: true, recordsInserted: totalRecords };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[SeedHistoricalSteps] Error: ${message}`, 'ERROR');
    return { success: false, recordsInserted: 0, error: message };
  }
};

export const seedHealthData = async (days: number = 7): Promise<SeedResult> => {
  addLog(`[SeedHealthData] Starting to seed ${days} days of health data...`, 'INFO');

  try {
    const permissionsGranted = await requestWritePermissions();
    if (!permissionsGranted) {
      return {
        success: false,
        recordsInserted: 0,
        error: 'Write permissions not granted. Please grant permissions in Health Connect settings.',
      };
    }

    let totalRecords = 0;

    for (const config of SEED_CONFIGS) {
      try {
        let count: number;

        switch (config.seedType) {
          case 'custom':
            count = await config.seeder(days);
            break;
          case 'interval':
            count = await seedIntervalRecords(config, days);
            break;
          case 'instant':
            count = await seedInstantRecords(config, days);
            break;
          case 'samples':
            count = await seedSamplesRecords(config, days);
            break;
        }

        totalRecords += count;
        addLog(`[SeedHealthData] Seeded ${config.recordType}`, 'SUCCESS');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addLog(`[SeedHealthData] Failed to seed ${config.recordType}: ${message}`, 'WARNING');
      }
    }

    addLog(`[SeedHealthData] Successfully seeded ${totalRecords} records`, 'SUCCESS');

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
