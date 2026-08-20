import {
  getSyncStartDate,
  readHealthRecords,
  getAggregatedStepsByDate,
  getAggregatedActiveCaloriesByDate,
  getAggregatedTotalCaloriesByDate,
  getAggregatedDistanceByDate,
  getAggregatedFloorsClimbedByDate,
  getAggregatedBasalEnergyByDate,
} from './healthConnectService';
import { HEALTH_METRICS } from '../HealthMetrics';
import { addLog } from './LogService';
import type { HealthDataDisplayState } from '../types/healthRecords';
import type { TimeRange } from './storage';
import i18n, { formatLocalizedNumber } from '../localization/i18n';

const t = (key: string, options: Record<string, unknown> = {}): string => {
  // i18n-audit-ignore-next-line dynamic-i18n-key -- wrapper accepts only the closed healthDataDisplay key map below
  const value = i18n.t(key, options);
  if (value !== key) return value;
  const templates: Record<string, string> = {
    'healthDataDisplay.distance': '{{value}} km', 'healthDataDisplay.kcal': '{{value}} kcal',
    'healthDataDisplay.bpm': '{{value}} bpm', 'healthDataDisplay.kg': '{{value}} kg',
    'healthDataDisplay.percent': '{{value}}%', 'healthDataDisplay.celsius': '{{value}}°C',
    'healthDataDisplay.mmHg': '{{systolic}}/{{diastolic}} mmHg', 'healthDataDisplay.liters': '{{value}} L',
    'healthDataDisplay.cm': '{{value}} cm', 'healthDataDisplay.mmolL': '{{value}} mmol/L',
    'healthDataDisplay.ms': '{{value}} ms', 'healthDataDisplay.vo2': '{{value}} ml/min/kg',
    'healthDataDisplay.minutes': '{{value}} min', 'healthDataDisplay.meters': '{{value}} m',
    'healthDataDisplay.watts': '{{value}} W', 'healthDataDisplay.metersPerSecond': '{{value}} m/s',
    'healthDataDisplay.breathsPerMinute': '{{value}}/min', 'healthDataDisplay.error': 'Error',
    'healthDataDisplay.sleepHours': '{{count}}h', 'healthDataDisplay.sleepMinutes': '{{count}}m',
    'healthDataDisplay.workouts': '{{count}} workouts', 'healthDataDisplay.records': '{{count}} records',
  };
  let result = templates[key] ?? key;
  for (const [name, replacement] of Object.entries(options)) result = result.replace(`{{${name}}}`, String(replacement));
  return result;
};
const number = (value: number, options?: Intl.NumberFormatOptions): string => formatLocalizedNumber(value, options);
const unit = (key: string, count: number, defaultValue: string, defaultValuePlural?: string): string => {
  const fallback = count === 1 || !defaultValuePlural ? defaultValue : defaultValuePlural;
  // i18n-audit-ignore-next-line dynamic-i18n-key -- key is restricted to the closed healthDataDisplay plural map
  const value = i18n.t(key, {
    count,
    defaultValue,
    ...(defaultValuePlural ? { defaultValue_one: defaultValue, defaultValue_other: defaultValuePlural } : {}),
  });

  // Keep a readable English result even when i18next is not initialized or a
  // plural resource is unavailable. The key set is closed at the call sites;
  // this guard prevents a raw key from reaching a health-data card.
  if (value === key || value === `${key}_one` || value === `${key}_other`) {
    return fallback.replace('{{count}}', String(count));
  }
  return value;
};

export const NO_DATA_DISPLAY = '__NO_DATA__';

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
    // Aggregated iOS HealthKit record: { date, value, type, record_timezone }
    if (typeof r.value === 'number') return r.value;
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

  return valid.length > 0 ? t('healthDataDisplay.percent', { defaultValue: "{{value}}%", value: number(valid[0].value!, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }) : NO_DATA_DISPLAY;
}

function formatTemperature(records: unknown[]): string {
  const latestTemp = (records as { time?: string; startTime?: string; temperature?: { inCelsius: number } }[])
    .sort((a, b) => new Date(b.time || b.startTime || '').getTime() - new Date(a.time || a.startTime || '').getTime())[0];
  const value = latestTemp.temperature?.inCelsius;
  return value != null && Number.isFinite(value)
    ? t('healthDataDisplay.celsius', { defaultValue: "{{value}}°C", value: number(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })
    : NO_DATA_DISPLAY;
}

function formatMassInKg(records: unknown[]): string {
  const latestMass = (records as { startTime?: string; time?: string; mass?: { inKilograms: number } }[])
    .sort((a, b) => new Date(b.startTime || b.time || '').getTime() - new Date(a.startTime || a.time || '').getTime())[0];
  const value = latestMass.mass?.inKilograms;
  return value != null && Number.isFinite(value)
    ? t('healthDataDisplay.kg', { defaultValue: "{{value}} kg", value: number(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })
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
  Steps: makeAggregatedFormatter(getAggregatedStepsByDate, value => number(value)),
  ActiveCaloriesBurned: makeAggregatedFormatter(getAggregatedActiveCaloriesByDate, value => number(value)),
  TotalCaloriesBurned: makeAggregatedFormatter(getAggregatedTotalCaloriesByDate, value => number(value)),
  Distance: makeAggregatedFormatter(getAggregatedDistanceByDate, value => t('healthDataDisplay.distance', { defaultValue: "{{value}} km", value: number(value / 1000, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })),
  FloorsClimbed: makeAggregatedFormatter(getAggregatedFloorsClimbedByDate, value => number(Math.round(value))),
  BasalMetabolicRate: async (start, end) => {
    // iOS: use aggregated resting energy; Android: fall back to raw HC records
    const aggregated = await getAggregatedBasalEnergyByDate(start, end);
    if (aggregated.length > 0) {
      const avg = aggregated.reduce((sum: number, r) => sum + r.value, 0) / aggregated.length;
      return t('healthDataDisplay.kcal', { defaultValue: "{{value}} kcal", value: number(Math.round(avg)) });
    }
    const rawRecords = await readHealthRecords('BasalMetabolicRate', start, end) as unknown[];
    if (rawRecords.length === 0) return NO_DATA_DISPLAY;
    const dailyBMRs: Record<string, { sum: number; count: number }> = {};
    rawRecords.forEach((r) => {
      const date = getRecordDate(r);
      const value = extractBMRValue(r);
      if (date && value !== null && !isNaN(value)) {
        if (!dailyBMRs[date]) dailyBMRs[date] = { sum: 0, count: 0 };
        dailyBMRs[date].sum += value;
        dailyBMRs[date].count++;
      }
    });
    const dailyAvgs = Object.values(dailyBMRs).map(d => d.sum / d.count);
    if (dailyAvgs.length === 0) return NO_DATA_DISPLAY;
    const avg = dailyAvgs.reduce((sum, v) => sum + v, 0) / dailyAvgs.length;
    return t('healthDataDisplay.kcal', { defaultValue: "{{value}} kcal", value: number(Math.round(avg)) });
  },
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
    return avgHeartRate > 0 ? t('healthDataDisplay.bpm', { defaultValue: "{{value}} bpm", value: number(avgHeartRate) }) : NO_DATA_DISPLAY;
  },

  Weight: (records) => {
    const latestWeight = (records as { time: string; weight?: { inKilograms: number } }[])
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0];
    const weightValue = latestWeight.weight?.inKilograms;
    return weightValue != null && Number.isFinite(weightValue)
      ? t('healthDataDisplay.kg', { defaultValue: "{{value}} kg", value: number(weightValue, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })
      : NO_DATA_DISPLAY;
  },

  BodyFat: (records) => formatLatestPercentValue(records, extractBodyFatValue),

  BloodPressure: (records) => {
    const latestBP = (records as { time: string; systolic?: { inMillimetersOfMercury: number }; diastolic?: { inMillimetersOfMercury: number } }[])
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0];
    const systolic = latestBP.systolic?.inMillimetersOfMercury;
    const diastolic = latestBP.diastolic?.inMillimetersOfMercury;
    return (systolic && diastolic)
      ? t('healthDataDisplay.mmHg', { defaultValue: "{{systolic}}/{{diastolic}} mmHg", systolic: number(Math.round(systolic)), diastolic: number(Math.round(diastolic)) })
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
    return `${unit('healthDataDisplay.sleepHours', hours, '{{count}}h')} ${unit('healthDataDisplay.sleepMinutes', minutes, '{{count}}m')}`;
  },

  Hydration: (records) => {
    const totalHydration = (records as { volume?: { inLiters: number } }[]).reduce((sum, record) =>
      sum + (record.volume?.inLiters || 0), 0);
    return totalHydration === 0 ? NO_DATA_DISPLAY : t('healthDataDisplay.liters', { defaultValue: "{{value}} L", value: number(totalHydration, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
  },

  Height: (records) => {
    const latestHeight = (records as { time: string; height?: { inMeters: number } }[])
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0];
    const value = latestHeight.height?.inMeters;
    return value != null && Number.isFinite(value)
      ? t('healthDataDisplay.cm', { defaultValue: "{{value}} cm", value: number(value * 100, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })
      : NO_DATA_DISPLAY;
  },

  BasalBodyTemperature: formatTemperature,
  BodyTemperature: formatTemperature,

  BloodGlucose: (records) => {
    const latestGlucose = (records as { time: string; level?: { inMillimolesPerLiter?: number; inMilligramsPerDeciliter?: number }; bloodGlucose?: { inMillimolesPerLiter?: number; inMilligramsPerDeciliter?: number } }[])
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0];
    const glucoseValue = latestGlucose.level?.inMillimolesPerLiter
      ?? latestGlucose.bloodGlucose?.inMillimolesPerLiter
      ?? (latestGlucose.level?.inMilligramsPerDeciliter != null ? latestGlucose.level.inMilligramsPerDeciliter / 18.018 : null)
      ?? (latestGlucose.bloodGlucose?.inMilligramsPerDeciliter != null ? latestGlucose.bloodGlucose.inMilligramsPerDeciliter / 18.018 : null);
    return glucoseValue != null && Number.isFinite(glucoseValue)
      ? t('healthDataDisplay.mmolL', { defaultValue: "{{value}} mmol/L", value: number(glucoseValue, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })
      : NO_DATA_DISPLAY;
  },

  OxygenSaturation: (records) => formatLatestPercentValue(records, extractO2Value, v => v > 0 && v <= 100),
  BloodOxygenSaturation: (records) => formatLatestPercentValue(records, extractO2Value, v => v > 0 && v <= 100),

  RestingHeartRate: (records) => {
    const avgRestingHR = (records as { beatsPerMinute?: number }[]).reduce((sum, record) =>
      sum + (record.beatsPerMinute || 0), 0) / records.length;
    return avgRestingHR > 0 ? t('healthDataDisplay.bpm', { defaultValue: "{{value}} bpm", value: number(Math.round(avgRestingHR)) }) : NO_DATA_DISPLAY;
  },

  HeartRateVariabilitySDNN: (records) => {
    const latest = (records as { time?: string; value?: number }[])
      .filter(r => r.value != null && !isNaN(r.value))
      .sort((a, b) => new Date(b.time ?? 0).getTime() - new Date(a.time ?? 0).getTime())[0];
    const value = latest?.value;
    return value != null ? t('healthDataDisplay.ms', { defaultValue: "{{value}} ms", value: number(Math.round(value)) }) : NO_DATA_DISPLAY;
  },

  HeartRateVariabilityRmssd: (records) => {
    const latest = (records as { time?: string; heartRateVariabilityMillis?: number }[])
      .filter(r => r.heartRateVariabilityMillis != null && !isNaN(r.heartRateVariabilityMillis))
      .sort((a, b) => new Date(b.time ?? 0).getTime() - new Date(a.time ?? 0).getTime())[0];
    const value = latest?.heartRateVariabilityMillis;
    return value != null ? t('healthDataDisplay.ms', { defaultValue: "{{value}} ms", value: number(Math.round(value)) }) : NO_DATA_DISPLAY;
  },

  Vo2Max: (records) => {
    const valid = records
      .map(r => ({
        date: getRecordDate(r),
        value: extractVo2Value(r),
      }))
      .filter(r => r.date && r.value !== null && !isNaN(r.value!) && r.value! > 0 && r.value! < 100)
      .sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime());

    return valid.length > 0 ? t('healthDataDisplay.vo2', { defaultValue: "{{value}} ml/min/kg", value: number(valid[0].value!, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }) : NO_DATA_DISPLAY;
  },

  LeanBodyMass: formatMassInKg,
  BoneMass: formatMassInKg,

  WheelchairPushes: (records) => {
    const totalPushes = (records as { count?: number }[]).reduce((sum, record) => sum + (record.count || 0), 0);
    return totalPushes === 0 ? NO_DATA_DISPLAY : number(totalPushes);
  },

  ExerciseSession: (records) => {
    const totalExerciseMinutes = (records as { startTime: string; endTime: string }[]).reduce((sum, record) => {
      const duration = (new Date(record.endTime).getTime() - new Date(record.startTime).getTime()) / (1000 * 60);
      return sum + duration;
    }, 0);
    return totalExerciseMinutes === 0 ? NO_DATA_DISPLAY : unit('healthDataDisplay.minutes', Math.round(totalExerciseMinutes), '{{count}} min');
  },

  ElevationGained: (records) => {
    const totalElevation = (records as { elevation?: { inMeters: number } }[]).reduce((sum, record) =>
      sum + (record.elevation?.inMeters || 0), 0);
    return totalElevation === 0 ? NO_DATA_DISPLAY : t('healthDataDisplay.meters', { defaultValue: "{{value}} m", value: number(Math.round(totalElevation)) });
  },

  Power: (records) => {
    const avgPower = (records as { power?: { inWatts: number } }[]).reduce((sum, record) =>
      sum + (record.power?.inWatts || 0), 0) / records.length;
    return avgPower === 0 ? NO_DATA_DISPLAY : t('healthDataDisplay.watts', { defaultValue: "{{value}} W", value: number(Math.round(avgPower)) });
  },

  Speed: (records) => {
    const avgSpeed = (records as { speed?: { inMetersPerSecond: number } }[]).reduce((sum, record) =>
      sum + (record.speed?.inMetersPerSecond || 0), 0) / records.length;
    return avgSpeed === 0 ? NO_DATA_DISPLAY : t('healthDataDisplay.metersPerSecond', { defaultValue: "{{value}} m/s", value: number(avgSpeed, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
  },

  RespiratoryRate: (records) => {
    const avgRespRate = (records as { rate?: number }[]).reduce((sum, record) =>
      sum + (record.rate || 0), 0) / records.length;
    return avgRespRate === 0 ? NO_DATA_DISPLAY : t('healthDataDisplay.breathsPerMinute', { defaultValue: '{{value}}/min', value: number(Math.round(avgRespRate)) });
  },

  Nutrition: (records) => {
    const totalNutrition = (records as { energy?: { inCalories: number } }[]).reduce((sum, record) =>
      sum + (record.energy?.inCalories || 0), 0);
    return totalNutrition === 0 ? NO_DATA_DISPLAY : t('healthDataDisplay.kcal', { defaultValue: "{{value}} kcal", value: number(Math.round(totalNutrition / 1000)) });
  },

  Workout: (records) => unit('healthDataDisplay.workouts', records.length, '{{count}} workout', '{{count}} workouts'),
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
        : unit('healthDataDisplay.records', records.length, '{{count}} record', '{{count}} records');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`[healthDataDisplay] Error fetching ${metric.defaultLabel}: ${errorMessage}`, 'ERROR');
      result[metric.id] = i18n.t('healthDataDisplay.error', { defaultValue: 'Error' });
    }
  }

  return result;
}
