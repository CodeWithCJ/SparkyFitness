import {
  getSyncStartDate,
  readHealthRecords,
  getAggregatedStepsByDate,
  getAggregatedActiveCaloriesByDate,
  getAggregatedTotalCaloriesByDate,
  getAggregatedDistanceByDate,
  getAggregatedFloorsClimbedByDate,
} from './healthConnectService';
import { HEALTH_METRICS } from '../HealthMetrics';
import { addLog } from './LogService';
import type { HealthDataDisplayState } from '../types/healthRecords';
import type { TimeRange } from './storage';

export const NO_DATA_DISPLAY = 'No data';

// --- Shared helpers for extracting values from polymorphic health records ---

function getRecordDate(record: unknown): string | null {
  const r = record as Record<string, unknown>;
  return (r.time || r.startTime || r.timestamp || r.date) as string | null;
}

function extractBodyFatValue(record: unknown): number | null {
  const r = record as Record<string, unknown>;
  const percentage = r.percentage as Record<string, unknown> | number | undefined;
  const bodyFatPercentage = r.bodyFatPercentage as Record<string, unknown> | undefined;

  if (typeof percentage === 'object' && percentage !== null && 'inPercent' in percentage) {
    return percentage.inPercent as number;
  }
  if (typeof bodyFatPercentage === 'object' && bodyFatPercentage !== null && 'inPercent' in bodyFatPercentage) {
    return bodyFatPercentage.inPercent as number;
  }
  if (typeof percentage === 'object' && percentage !== null && 'value' in percentage) {
    return percentage.value as number;
  }
  if (typeof percentage === 'number') {
    return percentage;
  }
  if (typeof r.value === 'number') {
    return r.value;
  }
  if (typeof r.bodyFat === 'number') {
    return r.bodyFat;
  }
  return null;
}

function extractO2Value(record: unknown): number | null {
  const r = record as Record<string, unknown>;
  const percentage = r.percentage as Record<string, unknown> | number | undefined;

  if (typeof percentage === 'object' && percentage !== null && 'inPercent' in percentage) {
    return percentage.inPercent as number;
  }
  if (typeof percentage === 'number') {
    return percentage;
  }
  if (typeof r.value === 'number') {
    return r.value;
  }
  if (typeof r.oxygenSaturation === 'number') {
    return r.oxygenSaturation;
  }
  if (typeof r.spo2 === 'number') {
    return r.spo2;
  }
  return null;
}

function extractVo2Value(record: unknown): number | null {
  const r = record as Record<string, unknown>;
  if (typeof r.vo2Max === 'number') return r.vo2Max;
  if (typeof r.vo2 === 'number') return r.vo2;
  if (typeof r.value === 'number') return r.value;
  if (typeof r.vo2MillilitersPerMinuteKilogram === 'number') return r.vo2MillilitersPerMinuteKilogram;
  return null;
}

function extractBMRValue(record: unknown): number | null {
  const r = record as Record<string, unknown>;
  const basalMetabolicRate = r.basalMetabolicRate as Record<string, unknown> | number | undefined;

  if (basalMetabolicRate !== undefined) {
    if (typeof basalMetabolicRate === 'number') {
      return basalMetabolicRate;
    } else if (typeof basalMetabolicRate === 'object' && basalMetabolicRate !== null) {
      if ('inKilocaloriesPerDay' in basalMetabolicRate) return basalMetabolicRate.inKilocaloriesPerDay as number;
      if ('inCalories' in basalMetabolicRate) return basalMetabolicRate.inCalories as number;
      if ('inKilocalories' in basalMetabolicRate) return basalMetabolicRate.inKilocalories as number;
      if ('value' in basalMetabolicRate) return basalMetabolicRate.value as number;
    }
  } else {
    const energy = r.energy as Record<string, unknown> | undefined;
    if (energy && 'inCalories' in energy) return energy.inCalories as number;
  }
  return null;
}

// --- Shared raw record formatters for record types that share logic ---

function formatLatestPercentValue(
  records: unknown[],
  extractor: (record: unknown) => number | null,
  filter?: (value: number) => boolean,
): string {
  const valid = records
    .map(r => ({
      date: getRecordDate(r),
      value: extractor(r),
    }))
    .filter(r => r.date && r.value !== null && !isNaN(r.value!) && (filter ? filter(r.value!) : true))
    .sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime());

  return valid.length > 0 ? `${valid[0].value!.toFixed(1)}%` : NO_DATA_DISPLAY;
}

function formatTemperature(records: unknown[]): string {
  const latestTemp = (records as { time?: string; startTime?: string; temperature?: { inCelsius: number } }[])
    .sort((a, b) => new Date(b.time || b.startTime || '').getTime() - new Date(a.time || a.startTime || '').getTime())[0];
  return latestTemp.temperature?.inCelsius
    ? `${latestTemp.temperature.inCelsius.toFixed(1)}°C`
    : NO_DATA_DISPLAY;
}

function formatMassInKg(records: unknown[]): string {
  const latestMass = (records as { startTime?: string; time?: string; mass?: { inKilograms: number } }[])
    .sort((a, b) => new Date(b.startTime || b.time || '').getTime() - new Date(a.startTime || a.time || '').getTime())[0];
  return latestMass.mass?.inKilograms
    ? `${latestMass.mass.inKilograms.toFixed(1)} kg`
    : NO_DATA_DISPLAY;
}

// --- Aggregated formatters: fetch their own data and return a formatted string ---

function makeAggregatedFormatter(
  fetchFn: (start: Date, end: Date) => Promise<{ value: number }[]>,
  format: (total: number) => string,
): (start: Date, end: Date) => Promise<string> {
  return async (start, end) => {
    const records = await fetchFn(start, end);
    const total = records.reduce((sum, r) => sum + r.value, 0);
    return format(total);
  };
}

const AGGREGATED_FORMATTERS: Record<string, (start: Date, end: Date) => Promise<string>> = {
  Steps: makeAggregatedFormatter(getAggregatedStepsByDate, t => t.toLocaleString()),
  ActiveCaloriesBurned: makeAggregatedFormatter(getAggregatedActiveCaloriesByDate, t => t.toLocaleString()),
  TotalCaloriesBurned: makeAggregatedFormatter(getAggregatedTotalCaloriesByDate, t => t.toLocaleString()),
  Distance: makeAggregatedFormatter(getAggregatedDistanceByDate, t => `${(t / 1000).toFixed(2)} km`),
  FloorsClimbed: makeAggregatedFormatter(getAggregatedFloorsClimbedByDate, t => Math.round(t).toLocaleString()),
};

// --- Raw record formatters: receive already-fetched records, return a formatted string ---

const RAW_FORMATTERS: Record<string, (records: unknown[]) => string> = {
  HeartRate: (records) => {
    const bpmValues = (records as { samples?: { beatsPerMinute: number }[] }[])
      .flatMap(r => r.samples ?? [])
      .map(s => s.beatsPerMinute)
      .filter((v): v is number => v != null && !isNaN(v));
    const avgHeartRate = bpmValues.length > 0
      ? Math.round(bpmValues.reduce((sum, v) => sum + v, 0) / bpmValues.length)
      : 0;
    return avgHeartRate > 0 ? `${avgHeartRate} bpm` : NO_DATA_DISPLAY;
  },

  Weight: (records) => {
    const latestWeight = (records as { time: string; weight?: { inKilograms: number } }[])
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0];
    return latestWeight.weight?.inKilograms
      ? `${latestWeight.weight.inKilograms.toFixed(1)} kg`
      : NO_DATA_DISPLAY;
  },

  BodyFat: (records) => formatLatestPercentValue(records, extractBodyFatValue),

  BloodPressure: (records) => {
    const latestBP = (records as { time: string; systolic?: { inMillimetersOfMercury: number }; diastolic?: { inMillimetersOfMercury: number } }[])
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0];
    const systolic = latestBP.systolic?.inMillimetersOfMercury;
    const diastolic = latestBP.diastolic?.inMillimetersOfMercury;
    return (systolic && diastolic)
      ? `${Math.round(systolic)}/${Math.round(diastolic)} mmHg`
      : NO_DATA_DISPLAY;
  },

  SleepSession: (records) => {
    const totalSleepMinutes = (records as { startTime: string; endTime: string }[]).reduce((sum, record) => {
      const duration = (new Date(record.endTime).getTime() - new Date(record.startTime).getTime()) / (1000 * 60);
      return sum + duration;
    }, 0);
    if (totalSleepMinutes === 0) return NO_DATA_DISPLAY;
    const hours = Math.floor(totalSleepMinutes / 60);
    const minutes = Math.round(totalSleepMinutes % 60);
    return `${hours}h ${minutes}m`;
  },

  Hydration: (records) => {
    const totalHydration = (records as { volume?: { inLiters: number } }[]).reduce((sum, record) =>
      sum + (record.volume?.inLiters || 0), 0);
    return totalHydration === 0 ? NO_DATA_DISPLAY : `${totalHydration.toFixed(2)} L`;
  },

  Height: (records) => {
    const latestHeight = (records as { time: string; height?: { inMeters: number } }[])
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0];
    return latestHeight.height?.inMeters
      ? `${(latestHeight.height.inMeters * 100).toFixed(1)} cm`
      : NO_DATA_DISPLAY;
  },

  BasalBodyTemperature: formatTemperature,
  BodyTemperature: formatTemperature,

  BloodGlucose: (records) => {
    const latestGlucose = (records as { time: string; level?: { inMillimolesPerLiter?: number; inMilligramsPerDeciliter?: number }; bloodGlucose?: { inMillimolesPerLiter?: number; inMilligramsPerDeciliter?: number } }[])
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0];
    const glucoseValue = latestGlucose.level?.inMillimolesPerLiter
      || latestGlucose.bloodGlucose?.inMillimolesPerLiter
      || (latestGlucose.level?.inMilligramsPerDeciliter ? latestGlucose.level.inMilligramsPerDeciliter / 18.018 : null)
      || (latestGlucose.bloodGlucose?.inMilligramsPerDeciliter ? latestGlucose.bloodGlucose.inMilligramsPerDeciliter / 18.018 : null);
    return glucoseValue
      ? `${glucoseValue.toFixed(1)} mmol/L`
      : NO_DATA_DISPLAY;
  },

  OxygenSaturation: (records) => formatLatestPercentValue(records, extractO2Value, v => v > 0 && v <= 100),
  BloodOxygenSaturation: (records) => formatLatestPercentValue(records, extractO2Value, v => v > 0 && v <= 100),

  RestingHeartRate: (records) => {
    const avgRestingHR = (records as { beatsPerMinute?: number }[]).reduce((sum, record) =>
      sum + (record.beatsPerMinute || 0), 0) / records.length;
    return avgRestingHR > 0 ? `${Math.round(avgRestingHR)} bpm` : NO_DATA_DISPLAY;
  },

  Vo2Max: (records) => {
    const valid = records
      .map(r => ({
        date: getRecordDate(r),
        value: extractVo2Value(r),
      }))
      .filter(r => r.date && r.value !== null && !isNaN(r.value!) && r.value! > 0 && r.value! < 100)
      .sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime());

    return valid.length > 0 ? `${valid[0].value!.toFixed(1)} ml/min/kg` : NO_DATA_DISPLAY;
  },

  LeanBodyMass: formatMassInKg,
  BoneMass: formatMassInKg,

  BasalMetabolicRate: (records) => {
    const dailyBMRs: Record<string, { sum: number; count: number }> = {};
    records.forEach((r) => {
      const date = getRecordDate(r);
      const value = extractBMRValue(r);
      if (date && value !== null && !isNaN(value)) {
        if (!dailyBMRs[date]) {
          dailyBMRs[date] = { sum: 0, count: 0 };
        }
        dailyBMRs[date].sum += value;
        dailyBMRs[date].count++;
      }
    });

    const aggregatedBMR = Object.values(dailyBMRs).map(day => day.sum / day.count);
    const totalAggregatedBMR = aggregatedBMR.reduce((sum, val) => sum + val, 0);

    if (aggregatedBMR.length > 0) {
      const avgBMR = totalAggregatedBMR / aggregatedBMR.length;
      return `${Math.round(avgBMR)} kcal`;
    }
    return NO_DATA_DISPLAY;
  },

  WheelchairPushes: (records) => {
    const totalPushes = (records as { count?: number }[]).reduce((sum, record) => sum + (record.count || 0), 0);
    return totalPushes === 0 ? NO_DATA_DISPLAY : totalPushes.toLocaleString();
  },

  ExerciseSession: (records) => {
    const totalExerciseMinutes = (records as { startTime: string; endTime: string }[]).reduce((sum, record) => {
      const duration = (new Date(record.endTime).getTime() - new Date(record.startTime).getTime()) / (1000 * 60);
      return sum + duration;
    }, 0);
    return totalExerciseMinutes === 0 ? NO_DATA_DISPLAY : `${Math.round(totalExerciseMinutes)} min`;
  },

  ElevationGained: (records) => {
    const totalElevation = (records as { elevation?: { inMeters: number } }[]).reduce((sum, record) =>
      sum + (record.elevation?.inMeters || 0), 0);
    return totalElevation === 0 ? NO_DATA_DISPLAY : `${Math.round(totalElevation)} m`;
  },

  Power: (records) => {
    const avgPower = (records as { power?: { inWatts: number } }[]).reduce((sum, record) =>
      sum + (record.power?.inWatts || 0), 0) / records.length;
    return avgPower === 0 ? NO_DATA_DISPLAY : `${Math.round(avgPower)} W`;
  },

  Speed: (records) => {
    const avgSpeed = (records as { speed?: { inMetersPerSecond: number } }[]).reduce((sum, record) =>
      sum + (record.speed?.inMetersPerSecond || 0), 0) / records.length;
    return avgSpeed === 0 ? NO_DATA_DISPLAY : `${avgSpeed.toFixed(2)} m/s`;
  },

  RespiratoryRate: (records) => {
    const avgRespRate = (records as { rate?: number }[]).reduce((sum, record) =>
      sum + (record.rate || 0), 0) / records.length;
    return avgRespRate === 0 ? NO_DATA_DISPLAY : `${Math.round(avgRespRate)} br/min`;
  },

  Nutrition: (records) => {
    const totalNutrition = (records as { energy?: { inCalories: number } }[]).reduce((sum, record) =>
      sum + (record.energy?.inCalories || 0), 0);
    return totalNutrition === 0 ? NO_DATA_DISPLAY : `${Math.round(totalNutrition / 1000)} kcal`;
  },

  Workout: (records) => `${records.length} workouts`,
};

/**
 * Fetches health data from the device for all metrics and formats display values.
 * Returns a map of metric ID to formatted string (e.g., "5,432" for steps, "72 bpm" for heart rate).
 */
export async function fetchHealthDisplayData(
  timeRange: TimeRange
): Promise<HealthDataDisplayState> {
  const endDate = new Date();
  const startDate = getSyncStartDate(timeRange);
  const result: HealthDataDisplayState = {};

  for (const metric of HEALTH_METRICS) {
    try {
      const aggregatedFormatter = AGGREGATED_FORMATTERS[metric.recordType];
      if (aggregatedFormatter) {
        result[metric.id] = await aggregatedFormatter(startDate, endDate);
        continue;
      }

      const records = await readHealthRecords(metric.recordType, startDate, endDate) as unknown[];
      if (records.length === 0) {
        result[metric.id] = NO_DATA_DISPLAY;
        continue;
      }

      const rawFormatter = RAW_FORMATTERS[metric.recordType];
      result[metric.id] = rawFormatter
        ? rawFormatter(records)
        : `${records.length} record${records.length !== 1 ? 's' : ''}`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`[healthDataDisplay] Error fetching ${metric.label}: ${errorMessage}`, 'ERROR');
      result[metric.id] = 'Error';
    }
  }

  return result;
}
