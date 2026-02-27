import { Platform } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getLogs, getLogSummary, getLogFilter } from './LogService';
import type { LogEntry } from './LogService';
import { loadLastSyncedTime, loadBackgroundSyncEnabled, loadTimeRange } from './storage';
import { loadHealthPreference } from './healthConnectService';
import { HEALTH_METRICS } from '../HealthMetrics';
import type { UserPreferences } from '../types/preferences';
import type {
  DiagnosticAppInfo,
  DiagnosticDeviceInfo,
  DiagnosticSyncStatus,
  DiagnosticLogInfo,
  DiagnosticReport,
  DiagnosticHookData,
} from '../types/diagnosticReport';
import { REPORT_FORMAT_VERSION } from '../types/diagnosticReport';

/**
 * Redacts sensitive data from a string: URLs, Bearer tokens, and API key patterns.
 */
const sanitizeString = (value: string): string => {
  return value
    .replace(/https?:\/\/[^\s"',)}\]]+/gi, '[REDACTED_URL]')
    .replace(/Bearer\s+[^\s"',)}\]]+/gi, '[REDACTED_TOKEN]')
    .replace(/api[_-]?key[=:]\s*[^\s"',)}\]]+/gi, '[REDACTED_API_KEY]');
};

/** Query key prefixes whose trailing arguments contain user search text. */
const SEARCH_QUERY_KEY_PREFIXES = ['foodSearch', 'mealSearch', 'externalFoodSearch'];

/**
 * Redacts user search terms from query key arrays.
 * Keeps the key prefix(es) for diagnostic value but replaces trailing search arguments.
 */
export const sanitizeQueryKey = (queryKey: readonly unknown[]): readonly unknown[] => {
  if (queryKey.length < 2) return queryKey;
  const prefix = queryKey[0];
  if (typeof prefix === 'string' && SEARCH_QUERY_KEY_PREFIXES.includes(prefix)) {
    return [prefix, ...queryKey.slice(1).map(() => '[REDACTED]')];
  }
  return queryKey;
};

/**
 * Sanitizes a log entry by redacting URLs, tokens, and API keys from message and details.
 */
export const sanitizeLogEntry = (entry: LogEntry): LogEntry => ({
  timestamp: entry.timestamp,
  message: sanitizeString(entry.message),
  status: entry.status,
  details: entry.details.map(sanitizeString),
});

/**
 * Picks only known safe fields from UserPreferences (units + algorithm selections).
 * Defense against the server adding PII fields in the future.
 */
export const pickSafePreferences = (prefs: UserPreferences): Partial<UserPreferences> => {
  const safeKeys: (keyof UserPreferences)[] = [
    'bmr_algorithm',
    'body_fat_algorithm',
    'fat_breakdown_algorithm',
    'mineral_calculation_algorithm',
    'vitamin_calculation_algorithm',
    'sugar_calculation_algorithm',
    'default_weight_unit',
    'default_distance_unit',
    'default_measurement_unit',
    'date_format',
    'energy_unit',
    'water_display_unit',
    'include_bmr_in_net_calories',
    'calorie_goal_adjustment_mode',
  ];

  const safe: Partial<UserPreferences> = {};
  for (const key of safeKeys) {
    if (key in prefs) {
      (safe as Record<string, unknown>)[key] = prefs[key];
    }
  }
  return safe;
};

export const collectAppInfo = (): DiagnosticAppInfo => ({
  version: Application.nativeApplicationVersion ?? null,
  buildNumber: Application.nativeBuildVersion ?? null,
  expoSdkVersion: Constants.expoConfig?.sdkVersion ?? null,
  appVariant: Constants.expoConfig?.extra?.APP_VARIANT ?? null,
});

export const collectDeviceInfo = (): DiagnosticDeviceInfo => ({
  platform: Platform.OS,
  osVersion: Device.osVersion ?? null,
  modelName: Device.modelName ?? null,
  manufacturer: Device.manufacturer ?? null,
});

export const collectSyncStatus = async (): Promise<DiagnosticSyncStatus> => {
  const [lastSyncedTime, backgroundSyncEnabled, configuredTimeRange] = await Promise.all([
    loadLastSyncedTime(),
    loadBackgroundSyncEnabled(),
    loadTimeRange(),
  ]);
  return { lastSyncedTime, backgroundSyncEnabled, configuredTimeRange };
};

export const collectLogInfo = async (): Promise<DiagnosticLogInfo> => {
  const [currentFilter, todaySummary, recentLogs] = await Promise.all([
    getLogFilter(),
    getLogSummary(),
    getLogs(0, 1000, 'all'),
  ]);
  return {
    currentFilter,
    todaySummary,
    recentLogs: recentLogs.map(sanitizeLogEntry),
  };
};

export const collectEnabledHealthMetrics = async (): Promise<string[]> => {
  const enabled: string[] = [];
  for (const metric of HEALTH_METRICS) {
    const isEnabled = await loadHealthPreference<boolean>(metric.preferenceKey);
    if (isEnabled === true) {
      enabled.push(metric.id);
    }
  }
  return enabled;
};

export const collectTheme = async (): Promise<string | null> => {
  const theme = await AsyncStorage.getItem('@HealthConnect:appTheme');
  return theme;
};

export const buildDiagnosticReport = async (
  hookData: DiagnosticHookData
): Promise<DiagnosticReport> => {
  const [syncStatus, logInfo, enabledHealthMetrics, theme] = await Promise.all([
    collectSyncStatus(),
    collectLogInfo(),
    collectEnabledHealthMetrics(),
    collectTheme(),
  ]);

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      reportFormatVersion: REPORT_FORMAT_VERSION,
    },
    app: collectAppInfo(),
    device: collectDeviceInfo(),
    syncStatus,
    theme,
    logs: logInfo,
    enabledHealthMetrics,
    serverConnected: hookData.isServerConnected,
    userPreferences: hookData.userPreferences
      ? pickSafePreferences(hookData.userPreferences)
      : null,
    queryStates: hookData.queryStates,
  };
};

export const shareDiagnosticReport = async (
  hookData: DiagnosticHookData
): Promise<void> => {
  const report = await buildDiagnosticReport(hookData);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `sparky-diagnostic-${timestamp}.json`;
  const file = new File(Paths.cache, fileName);

  try {
    file.create();
    file.write(JSON.stringify(report, null, 2));
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
    });
  } catch (error: unknown) {
    // Silently handle user cancellation (iOS returns ERR_SHARING_CANCELLED)
    if (
      error instanceof Error &&
      error.message?.includes('cancel')
    ) {
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
