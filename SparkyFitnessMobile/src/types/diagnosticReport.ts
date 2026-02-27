import type { LogEntry, LogFilter, LogSummary } from '../services/LogService';
import type { UserPreferences } from './preferences';
import type { TimeRange } from '../services/storage';

export const REPORT_FORMAT_VERSION = '1.0.0';

export interface DiagnosticQueryState {
  queryKey: string;
  status: string;
  fetchStatus: string;
  isStale: boolean;
  errorMessage: string | null;
}

export interface DiagnosticHookData {
  isServerConnected: boolean;
  userPreferences: UserPreferences | null;
  queryStates: DiagnosticQueryState[];
}

export interface DiagnosticReportMetadata {
  generatedAt: string;
  reportFormatVersion: string;
}

export interface DiagnosticAppInfo {
  version: string | null;
  buildNumber: string | null;
  expoSdkVersion: string | null;
  appVariant: string | null;
}

export interface DiagnosticDeviceInfo {
  platform: string;
  osVersion: string | null;
  modelName: string | null;
  manufacturer: string | null;
}

export interface DiagnosticSyncStatus {
  lastSyncedTime: string | null;
  backgroundSyncEnabled: boolean;
  configuredTimeRange: TimeRange | null;
}

export interface DiagnosticLogInfo {
  currentFilter: LogFilter;
  todaySummary: LogSummary;
  recentLogs: LogEntry[];
}

export interface DiagnosticReport {
  metadata: DiagnosticReportMetadata;
  app: DiagnosticAppInfo;
  device: DiagnosticDeviceInfo;
  syncStatus: DiagnosticSyncStatus;
  theme: string | null;
  logs: DiagnosticLogInfo;
  enabledHealthMetrics: string[];
  serverConnected: boolean;
  userPreferences: Partial<UserPreferences> | null;
  queryStates: DiagnosticQueryState[];
}
