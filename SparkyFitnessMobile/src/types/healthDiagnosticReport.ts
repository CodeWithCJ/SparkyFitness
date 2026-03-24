import type { DiagnosticAppInfo, DiagnosticDeviceInfo } from './diagnosticReport';

export const HEALTH_DIAGNOSTIC_REPORT_VERSION = '1.0.0';

export const DIAGNOSTIC_METRIC_TYPES = [
  'TotalCaloriesBurned',
  'ActiveCaloriesBurned',
  'ExerciseSession',
  'BloodPressure',
  'Vo2Max',
  'SleepSession',
] as const;

export type DiagnosticMetricType = (typeof DIAGNOSTIC_METRIC_TYPES)[number];

/**
 * Intentionally untyped — the whole point is capturing arbitrary/unexpected
 * shapes from different wearables so developers can inspect them in bug reports.
 */
export type DiagnosticHealthRecord = Record<string, unknown>;

export interface DiagnosticMetricSection {
  metricType: DiagnosticMetricType;
  recordCount: number;
  records: DiagnosticHealthRecord[];
  /** Typically null — readHealthRecords() catches errors internally and returns [].
   *  Only populated if an unexpected error occurs outside the HC read path. */
  error: string | null;
}

export interface HealthDiagnosticReportMetadata {
  generatedAt: string;
  reportFormatVersion: string;
  platform: 'android';
  lookbackHours: number;
  lookbackStart: string;
  lookbackEnd: string;
  note: string;
}

export interface HealthDiagnosticReport {
  metadata: HealthDiagnosticReportMetadata;
  app: DiagnosticAppInfo;
  device: DiagnosticDeviceInfo;
  metrics: DiagnosticMetricSection[];
}
