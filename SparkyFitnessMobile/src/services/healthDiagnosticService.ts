import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { readRecords } from 'react-native-health-connect';

import { collectAppInfo, collectDeviceInfo } from './diagnosticReportService';
import {
  HEALTH_DIAGNOSTIC_REPORT_VERSION,
  DIAGNOSTIC_METRIC_TYPES,
} from '../types/healthDiagnosticReport';
import type {
  DiagnosticMetricType,
  DiagnosticHealthRecord,
  DiagnosticMetricSection,
  HealthDiagnosticReport,
} from '../types/healthDiagnosticReport';

const LOOKBACK_HOURS = 4;

const DIAGNOSTIC_PAGE_SIZE = 1000;
const DIAGNOSTIC_MAX_PAGES = 20;

/**
 * Read raw Health Connect records for the diagnostic report.
 * Unlike the sync pipeline's readHealthRecords() which catches errors and
 * returns [], this lets errors propagate so the report can distinguish
 * "no data" from "permission denied / read failed".
 * Paginates through all available records (HC defaults to ~1000 per page).
 */
export const diagnosticReadRecords = async (
  recordType: string,
  startDate: Date,
  endDate: Date,
): Promise<unknown[]> => {
  const allRecords: unknown[] = [];
  let pageToken: string | undefined;
  let page = 0;

  do {
    page++;
    const options: Record<string, unknown> = {
      timeRangeFilter: {
        operator: 'between',
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
      },
      pageSize: DIAGNOSTIC_PAGE_SIZE,
    };
    if (pageToken) {
      options.pageToken = pageToken;
    }

    const result = await readRecords(
      recordType as Parameters<typeof readRecords>[0],
      options as unknown as Parameters<typeof readRecords>[1],
    );

    const records = result.records || [];
    allRecords.push(...records);
    pageToken = result.pageToken;
  } while (pageToken && page < DIAGNOSTIC_MAX_PAGES);

  return allRecords;
};

// ---------------------------------------------------------------------------
// Rounding utilities — pure functions for privacy bucketing
// ---------------------------------------------------------------------------

/** Round calories to nearest 50 */
export const roundCalories = (value: number): number =>
  Math.round(value / 50) * 50;

/** Round duration in minutes to nearest 1 */
export const roundDurationMinutes = (minutes: number): number =>
  Math.round(minutes);

/** Round to nearest 10 (VO2 Max, heart rate) */
export const roundToNearest10 = (value: number): number =>
  Math.round(value / 10) * 10;

/** Round blood pressure to nearest 5 */
export const roundBloodPressure = (value: number): number =>
  Math.round(value / 5) * 5;

/** Round distance in meters to nearest 100 */
export const roundDistance = (value: number): number =>
  Math.round(value / 100) * 100;

// ---------------------------------------------------------------------------
// Deep numeric rounding — handles all unit aliases in nested objects
// ---------------------------------------------------------------------------

/** Rounding config keyed by substrings that appear in HC unit field names.
 *  Order matters — mercury must precede meter so "inMillimetersOfMercury" matches BP, not distance. */
const UNIT_FIELD_ROUNDERS: { pattern: RegExp; round: (v: number) => number }[] = [
  { pattern: /mercury/i, round: roundBloodPressure },
  { pattern: /calorie|joule|energy/i, round: roundCalories },
  { pattern: /meter|mile|kilometer|distance/i, round: roundDistance },
  { pattern: /pressure/i, round: roundBloodPressure },
];

const defaultRound = (v: number): number => Math.round(v);

/**
 * Recursively round all numeric values in an object that look like unit fields.
 * HC bridge serializes energy as { inCalories, inKilocalories, inJoules } etc.
 * This ensures no exact value leaks through an alternate unit alias.
 */
export const roundAllNumericUnits = (
  obj: Record<string, unknown>,
  parentRound?: (v: number) => number,
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'number') {
      const matched = UNIT_FIELD_ROUNDERS.find(r => r.pattern.test(key));
      const rounder = matched?.round ?? parentRound ?? defaultRound;
      result[key] = rounder(value);
    } else if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      // Determine parent rounder from the key name (e.g., "energy" → calorie rounder)
      const matched = UNIT_FIELD_ROUNDERS.find(r => r.pattern.test(key));
      result[key] = roundAllNumericUnits(
        value as Record<string, unknown>,
        matched?.round ?? parentRound,
      );
    } else {
      result[key] = value;
    }
  }
  return result;
};

// ---------------------------------------------------------------------------
// Per-metric record rounders
// ---------------------------------------------------------------------------

/**
 * Round a TotalCaloriesBurned or ActiveCaloriesBurned record.
 * HC shape: { startTime, endTime, energy: { inCalories?, inKilocalories? }, metadata: { dataOrigin? } }
 */
const roundCalorieRecord = (record: unknown): DiagnosticHealthRecord => {
  const rec = record as Record<string, unknown>;
  const metadata = rec.metadata as Record<string, unknown> | undefined;
  const energy = rec.energy as Record<string, unknown> | undefined;

  return {
    startTime: rec.startTime,
    endTime: rec.endTime,
    energy: energy ? roundAllNumericUnits(energy, roundCalories) : undefined,
    dataOrigin: metadata?.dataOrigin ?? undefined,
  };
};

/**
 * Round an ExerciseSession record.
 * HC shape: { startTime, endTime, exerciseType, title?, metadata: { id?, dataOrigin? }, exerciseRoute?, ... }
 */
const roundExerciseSessionRecord = (record: unknown): DiagnosticHealthRecord => {
  const rec = record as Record<string, unknown>;
  const metadata = rec.metadata as Record<string, unknown> | undefined;
  const energy = rec.energy as Record<string, unknown> | undefined;
  const distance = rec.distance as Record<string, unknown> | undefined;
  const exerciseRoute = rec.exerciseRoute as Record<string, unknown> | undefined;

  // Calculate duration in minutes from timestamps if available
  let durationMinutes: number | undefined;
  if (typeof rec.startTime === 'string' && typeof rec.endTime === 'string') {
    const start = new Date(rec.startTime).getTime();
    const end = new Date(rec.endTime).getTime();
    if (!isNaN(start) && !isNaN(end)) {
      durationMinutes = roundDurationMinutes((end - start) / 60000);
    }
  }

  // Strip GPS route data, preserve only point count
  let routeSummary: { pointCount: number } | undefined;
  if (exerciseRoute) {
    const route = exerciseRoute.route as unknown[] | undefined;
    routeSummary = { pointCount: Array.isArray(route) ? route.length : 0 };
  }

  return {
    startTime: rec.startTime,
    endTime: rec.endTime,
    exerciseType: rec.exerciseType,
    // title and metadata.id intentionally omitted — user-named workouts
    // and stable IDs would leak personal text or enable record correlation
    hasTitle: rec.title != null,
    durationMinutes,
    energy: energy ? roundAllNumericUnits(energy, roundCalories) : undefined,
    distance: distance ? roundAllNumericUnits(distance, roundDistance) : undefined,
    exerciseRoute: routeSummary,
    dataOrigin: metadata?.dataOrigin ?? undefined,
  };
};

/**
 * Round a BloodPressure record.
 * HC shape: { systolic: { inMillimetersOfMercury }, diastolic: { inMillimetersOfMercury }, time, metadata? }
 */
const roundBloodPressureRecord = (record: unknown): DiagnosticHealthRecord => {
  const rec = record as Record<string, unknown>;
  const metadata = rec.metadata as Record<string, unknown> | undefined;
  const systolic = rec.systolic as Record<string, unknown> | undefined;
  const diastolic = rec.diastolic as Record<string, unknown> | undefined;

  return {
    time: rec.time ?? rec.startTime,
    systolic: systolic ? roundAllNumericUnits(systolic, roundBloodPressure) : undefined,
    diastolic: diastolic ? roundAllNumericUnits(diastolic, roundBloodPressure) : undefined,
    dataOrigin: metadata?.dataOrigin ?? undefined,
  };
};

/**
 * Round a Vo2Max record.
 * HC shape: { vo2MillilitersPerMinuteKilogram, time, metadata? }
 */
const roundVo2MaxRecord = (record: unknown): DiagnosticHealthRecord => {
  const rec = record as Record<string, unknown>;
  const metadata = rec.metadata as Record<string, unknown> | undefined;

  return {
    time: rec.time ?? rec.startTime,
    vo2MillilitersPerMinuteKilogram:
      typeof rec.vo2MillilitersPerMinuteKilogram === 'number'
        ? roundToNearest10(rec.vo2MillilitersPerMinuteKilogram)
        : undefined,
    vo2Max:
      typeof rec.vo2Max === 'number' ? roundToNearest10(rec.vo2Max) : undefined,
    dataOrigin: metadata?.dataOrigin ?? undefined,
  };
};

/**
 * Round a SleepSession record.
 * HC shape: { startTime, endTime, title?, stages?: [...], metadata? }
 */
const roundSleepSessionRecord = (record: unknown): DiagnosticHealthRecord => {
  const rec = record as Record<string, unknown>;
  const metadata = rec.metadata as Record<string, unknown> | undefined;
  const stages = rec.stages as Record<string, unknown>[] | undefined;

  let durationMinutes: number | undefined;
  if (typeof rec.startTime === 'string' && typeof rec.endTime === 'string') {
    const start = new Date(rec.startTime).getTime();
    const end = new Date(rec.endTime).getTime();
    if (!isNaN(start) && !isNaN(end)) {
      durationMinutes = roundDurationMinutes((end - start) / 60000);
    }
  }

  // Preserve stage structure with rounded durations
  let roundedStages: Record<string, unknown>[] | undefined;
  if (Array.isArray(stages)) {
    roundedStages = stages.map(stage => {
      const s = stage as Record<string, unknown>;
      const result: Record<string, unknown> = {
        stage: s.stage ?? s.type ?? s.value,
        startTime: s.startTime,
        endTime: s.endTime,
      };
      if (typeof s.duration === 'number') {
        result.duration = roundDurationMinutes(s.duration);
      }
      return result;
    });
  }

  return {
    startTime: rec.startTime,
    endTime: rec.endTime,
    // title intentionally omitted — may contain personal text
    hasTitle: rec.title != null,
    durationMinutes,
    stages: roundedStages,
    dataOrigin: metadata?.dataOrigin ?? undefined,
  };
};

/** Map of metric type to its record rounder */
const METRIC_ROUNDERS: Record<
  DiagnosticMetricType,
  (record: unknown) => DiagnosticHealthRecord
> = {
  TotalCaloriesBurned: roundCalorieRecord,
  ActiveCaloriesBurned: roundCalorieRecord,
  ExerciseSession: roundExerciseSessionRecord,
  BloodPressure: roundBloodPressureRecord,
  Vo2Max: roundVo2MaxRecord,
  SleepSession: roundSleepSessionRecord,
};

// ---------------------------------------------------------------------------
// Collection and report building
// ---------------------------------------------------------------------------

export const collectMetricSection = async (
  metricType: DiagnosticMetricType,
  startDate: Date,
  endDate: Date,
): Promise<DiagnosticMetricSection> => {
  try {
    const rawRecords = await diagnosticReadRecords(metricType, startDate, endDate);
    const rounder = METRIC_ROUNDERS[metricType];
    const roundedRecords = rawRecords.map(rounder);

    return {
      metricType,
      recordCount: roundedRecords.length,
      records: roundedRecords,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      metricType,
      recordCount: 0,
      records: [],
      error: message,
    };
  }
};

export const buildHealthDiagnosticReport =
  async (): Promise<HealthDiagnosticReport> => {
    const endDate = new Date();
    const startDate = new Date(
      endDate.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000,
    );

    const metricSections = await Promise.all(
      DIAGNOSTIC_METRIC_TYPES.map(metricType =>
        collectMetricSection(metricType, startDate, endDate),
      ),
    );

    return {
      metadata: {
        generatedAt: endDate.toISOString(),
        reportFormatVersion: HEALTH_DIAGNOSTIC_REPORT_VERSION,
        platform: 'android',
        lookbackHours: LOOKBACK_HOURS,
        lookbackStart: startDate.toISOString(),
        lookbackEnd: endDate.toISOString(),
        note: `Health data from the last ${LOOKBACK_HOURS} hours. All values are rounded for privacy.`,
      },
      app: collectAppInfo(),
      device: collectDeviceInfo(),
      metrics: metricSections,
    };
  };

export const shareHealthDiagnosticReport = async (): Promise<void> => {
  const report = await buildHealthDiagnosticReport();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `sparky-health-diagnostic-android-${timestamp}.json`;
  const file = new File(Paths.cache, fileName);

  try {
    file.create();
    file.write(JSON.stringify(report, null, 2));
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message?.includes('cancel')) {
      return;
    }
    throw error;
  } finally {
    try {
      file.delete();
    } catch {
      // Cleanup is best-effort
    }
  }
};
