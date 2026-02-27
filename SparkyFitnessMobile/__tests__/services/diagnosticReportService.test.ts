import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import {
  collectAppInfo,
  collectDeviceInfo,
  collectSyncStatus,
  collectLogInfo,
  collectEnabledHealthMetrics,
  collectTheme,
  buildDiagnosticReport,
  shareDiagnosticReport,
  sanitizeLogEntry,
  sanitizeQueryKey,
  pickSafePreferences,
} from '../../src/services/diagnosticReportService';
import { REPORT_FORMAT_VERSION } from '../../src/types/diagnosticReport';
import type { DiagnosticHookData } from '../../src/types/diagnosticReport';
import type { LogEntry } from '../../src/services/LogService';
import type { UserPreferences } from '../../src/types/preferences';

// Mock the service dependencies
jest.mock('../../src/services/LogService', () => ({
  getLogs: jest.fn().mockResolvedValue([]),
  getLogSummary: jest.fn().mockResolvedValue({
    DEBUG: 0, INFO: 5, SUCCESS: 2, WARNING: 1, ERROR: 0,
  }),
  getLogFilter: jest.fn().mockResolvedValue('no_debug'),
}));

jest.mock('../../src/services/storage', () => ({
  loadLastSyncedTime: jest.fn().mockResolvedValue('2026-02-27T10:00:00.000Z'),
  loadBackgroundSyncEnabled: jest.fn().mockResolvedValue(true),
  loadTimeRange: jest.fn().mockResolvedValue('7d'),
}));

const mockLoadHealthPreference = jest.fn().mockResolvedValue(false);
jest.mock('../../src/services/healthConnectService', () => ({
  loadHealthPreference: (...args: unknown[]) => mockLoadHealthPreference(...args),
}));

const { getLogs, getLogSummary, getLogFilter } = jest.requireMock('../../src/services/LogService');
const { loadLastSyncedTime, loadBackgroundSyncEnabled, loadTimeRange } = jest.requireMock('../../src/services/storage');

const makeHookData = (overrides?: Partial<DiagnosticHookData>): DiagnosticHookData => ({
  isServerConnected: true,
  userPreferences: {
    default_weight_unit: 'kg',
    energy_unit: 'kcal',
    bmr_algorithm: 'mifflin_st_jeor',
  },
  queryStates: [
    {
      queryKey: '["dailySummary","2026-02-27"]',
      status: 'success',
      fetchStatus: 'idle',
      isStale: false,
      errorMessage: null,
    },
  ],
  ...overrides,
});

describe('diagnosticReportService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---- collectAppInfo ----
  describe('collectAppInfo', () => {
    it('returns app version and build info', () => {
      const info = collectAppInfo();
      expect(info.version).toBe('1.0.0');
      expect(info).toHaveProperty('buildNumber');
      expect(info).toHaveProperty('expoSdkVersion');
      expect(info).toHaveProperty('appVariant');
    });
  });

  // ---- collectDeviceInfo ----
  describe('collectDeviceInfo', () => {
    it('returns device platform and model info', () => {
      const info = collectDeviceInfo();
      expect(info.platform).toBe('ios');
      expect(info.modelName).toBe('iPhone 15 Pro');
      expect(info.manufacturer).toBe('Apple');
      expect(info.osVersion).toBe('18.3');
    });

    it('does not include device name', () => {
      const info = collectDeviceInfo();
      expect(JSON.stringify(info)).not.toContain('deviceName');
    });
  });

  // ---- collectSyncStatus ----
  describe('collectSyncStatus', () => {
    it('returns sync status from storage', async () => {
      const status = await collectSyncStatus();
      expect(status.lastSyncedTime).toBe('2026-02-27T10:00:00.000Z');
      expect(status.backgroundSyncEnabled).toBe(true);
      expect(status.configuredTimeRange).toBe('7d');
    });

    it('handles null values gracefully', async () => {
      loadLastSyncedTime.mockResolvedValueOnce(null);
      loadTimeRange.mockResolvedValueOnce(null);
      const status = await collectSyncStatus();
      expect(status.lastSyncedTime).toBeNull();
      expect(status.configuredTimeRange).toBeNull();
    });
  });

  // ---- collectLogInfo ----
  describe('collectLogInfo', () => {
    it('returns log info with sanitized entries', async () => {
      getLogs.mockResolvedValueOnce([
        {
          timestamp: '2026-02-27T10:00:00.000Z',
          message: 'Synced data to https://myserver.com/api',
          status: 'SUCCESS',
          details: ['Bearer abc123token'],
        },
      ]);

      const logInfo = await collectLogInfo();
      expect(logInfo.currentFilter).toBe('no_debug');
      expect(logInfo.todaySummary).toEqual({
        DEBUG: 0, INFO: 5, SUCCESS: 2, WARNING: 1, ERROR: 0,
      });
      expect(logInfo.recentLogs).toHaveLength(1);
      expect(logInfo.recentLogs[0].message).not.toContain('https://myserver.com');
      expect(logInfo.recentLogs[0].details[0]).not.toContain('Bearer');
    });

    it('requests all logs with filter "all"', async () => {
      getLogs.mockResolvedValueOnce([]);
      await collectLogInfo();
      expect(getLogs).toHaveBeenCalledWith(0, 1000, 'all');
    });
  });

  // ---- collectEnabledHealthMetrics ----
  describe('collectEnabledHealthMetrics', () => {
    it('returns only enabled metric IDs', async () => {
      mockLoadHealthPreference.mockImplementation(async (key: string) => {
        return key === 'syncStepsEnabled' || key === 'syncHeartRateEnabled';
      });

      const metrics = await collectEnabledHealthMetrics();
      expect(metrics).toContain('steps');
      expect(metrics).toContain('heartRate');
      expect(metrics).not.toContain('weight');
    });

    it('returns empty array when no metrics enabled', async () => {
      mockLoadHealthPreference.mockResolvedValue(false);
      const metrics = await collectEnabledHealthMetrics();
      expect(metrics).toEqual([]);
    });

    it('does not include health data values', async () => {
      mockLoadHealthPreference.mockResolvedValue(true);
      const metrics = await collectEnabledHealthMetrics();
      // Should only be string IDs, not numeric health values
      for (const m of metrics) {
        expect(typeof m).toBe('string');
        expect(m).not.toMatch(/^\d+$/);
      }
    });
  });

  // ---- collectTheme ----
  describe('collectTheme', () => {
    it('returns null when no theme is stored', async () => {
      const theme = await collectTheme();
      expect(theme).toBeNull();
    });

    it('returns stored theme', async () => {
      await AsyncStorage.setItem('@HealthConnect:appTheme', 'Dark');
      const theme = await collectTheme();
      expect(theme).toBe('Dark');
    });
  });

  // ---- sanitizeLogEntry ----
  describe('sanitizeLogEntry', () => {
    const makeEntry = (message: string, details: string[] = []): LogEntry => ({
      timestamp: '2026-02-27T10:00:00.000Z',
      message,
      status: 'INFO',
      details,
    });

    it('redacts HTTP URLs', () => {
      const entry = makeEntry('Failed to connect to http://192.168.1.100:3000/api');
      const sanitized = sanitizeLogEntry(entry);
      expect(sanitized.message).not.toContain('192.168.1.100');
      expect(sanitized.message).toContain('[REDACTED_URL]');
    });

    it('redacts HTTPS URLs', () => {
      const entry = makeEntry('Synced to https://myserver.example.com/health-data');
      const sanitized = sanitizeLogEntry(entry);
      expect(sanitized.message).not.toContain('myserver.example.com');
      expect(sanitized.message).toContain('[REDACTED_URL]');
    });

    it('redacts Bearer tokens', () => {
      const entry = makeEntry('Request with Bearer sk-abc123def456');
      const sanitized = sanitizeLogEntry(entry);
      expect(sanitized.message).not.toContain('sk-abc123def456');
      expect(sanitized.message).toContain('[REDACTED_TOKEN]');
    });

    it('redacts API key patterns', () => {
      const entry = makeEntry('Using api_key=my-secret-key-12345');
      const sanitized = sanitizeLogEntry(entry);
      expect(sanitized.message).not.toContain('my-secret-key-12345');
      expect(sanitized.message).toContain('[REDACTED_API_KEY]');
    });

    it('redacts api-key pattern with hyphen', () => {
      const entry = makeEntry('Header: api-key: secretvalue123');
      const sanitized = sanitizeLogEntry(entry);
      expect(sanitized.message).not.toContain('secretvalue123');
    });

    it('sanitizes details array too', () => {
      const entry = makeEntry('Some log', [
        'Connected to https://server.com',
        'Bearer token123 used',
      ]);
      const sanitized = sanitizeLogEntry(entry);
      expect(sanitized.details[0]).not.toContain('server.com');
      expect(sanitized.details[1]).not.toContain('token123');
    });

    it('preserves non-sensitive content', () => {
      const entry = makeEntry('Synced 42 records successfully');
      const sanitized = sanitizeLogEntry(entry);
      expect(sanitized.message).toBe('Synced 42 records successfully');
      expect(sanitized.timestamp).toBe(entry.timestamp);
      expect(sanitized.status).toBe(entry.status);
    });

    it('handles realistic healthDataApi log message', () => {
      const entry = makeEntry(
        'POST https://my-server.com/health-data failed: 401 Unauthorized'
      );
      const sanitized = sanitizeLogEntry(entry);
      expect(sanitized.message).not.toContain('my-server.com');
      expect(sanitized.message).toContain('[REDACTED_URL]');
      expect(sanitized.message).toContain('failed: 401 Unauthorized');
    });

    it('handles realistic apiClient log with token', () => {
      const entry = makeEntry('Request failed', [
        'URL: https://api.example.com/api/goals',
        'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.xyz',
      ]);
      const sanitized = sanitizeLogEntry(entry);
      expect(sanitized.details[0]).not.toContain('api.example.com');
      expect(sanitized.details[1]).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    });
  });

  // ---- sanitizeQueryKey ----
  describe('sanitizeQueryKey', () => {
    it('redacts foodSearch search terms', () => {
      const key = ['foodSearch', 'chicken breast'] as const;
      const sanitized = sanitizeQueryKey(key);
      expect(sanitized).toEqual(['foodSearch', '[REDACTED]']);
    });

    it('redacts mealSearch search terms', () => {
      const key = ['mealSearch', 'my secret meal'] as const;
      const sanitized = sanitizeQueryKey(key);
      expect(sanitized).toEqual(['mealSearch', '[REDACTED]']);
    });

    it('redacts externalFoodSearch search terms and provider ID', () => {
      const key = ['externalFoodSearch', 'fatsecret', 'pizza', 'provider-123'] as const;
      const sanitized = sanitizeQueryKey(key);
      expect(sanitized).toEqual(['externalFoodSearch', '[REDACTED]', '[REDACTED]', '[REDACTED]']);
    });

    it('preserves non-search query keys unchanged', () => {
      const key = ['dailySummary', '2026-02-27'] as const;
      expect(sanitizeQueryKey(key)).toEqual(['dailySummary', '2026-02-27']);
    });

    it('preserves single-element query keys', () => {
      const key = ['serverConnection'] as const;
      expect(sanitizeQueryKey(key)).toEqual(['serverConnection']);
    });

    it('preserves preferences query key', () => {
      const key = ['userPreferences'] as const;
      expect(sanitizeQueryKey(key)).toEqual(['userPreferences']);
    });
  });

  // ---- pickSafePreferences ----
  describe('pickSafePreferences', () => {
    it('picks known safe fields', () => {
      const prefs: UserPreferences = {
        default_weight_unit: 'kg',
        energy_unit: 'kcal',
        bmr_algorithm: 'mifflin_st_jeor',
        date_format: 'YYYY-MM-DD',
      };
      const safe = pickSafePreferences(prefs);
      expect(safe.default_weight_unit).toBe('kg');
      expect(safe.energy_unit).toBe('kcal');
      expect(safe.bmr_algorithm).toBe('mifflin_st_jeor');
      expect(safe.date_format).toBe('YYYY-MM-DD');
    });

    it('strips unknown extra fields', () => {
      const prefs = {
        default_weight_unit: 'kg',
        email: 'user@example.com',
        name: 'John Doe',
        serverUrl: 'https://secret.server.com',
      } as unknown as UserPreferences;
      const safe = pickSafePreferences(prefs);
      const safeJson = JSON.stringify(safe);
      expect(safeJson).not.toContain('user@example.com');
      expect(safeJson).not.toContain('John Doe');
      expect(safeJson).not.toContain('secret.server.com');
      expect(safe.default_weight_unit).toBe('kg');
    });

    it('handles empty preferences', () => {
      const safe = pickSafePreferences({});
      expect(Object.keys(safe)).toHaveLength(0);
    });
  });

  // ---- buildDiagnosticReport ----
  describe('buildDiagnosticReport', () => {
    it('builds a complete report', async () => {
      getLogs.mockResolvedValueOnce([]);
      const report = await buildDiagnosticReport(makeHookData());

      expect(report.metadata.reportFormatVersion).toBe(REPORT_FORMAT_VERSION);
      expect(report.metadata.generatedAt).toBeTruthy();
      expect(report.app).toBeDefined();
      expect(report.device).toBeDefined();
      expect(report.syncStatus).toBeDefined();
      expect(report.logs).toBeDefined();
      expect(report.enabledHealthMetrics).toEqual(expect.any(Array));
      expect(report.serverConnected).toBe(true);
      expect(report.queryStates).toHaveLength(1);
    });

    it('handles null userPreferences', async () => {
      getLogs.mockResolvedValueOnce([]);
      const report = await buildDiagnosticReport(makeHookData({ userPreferences: null }));
      expect(report.userPreferences).toBeNull();
    });

    it('filters preferences through pickSafePreferences', async () => {
      getLogs.mockResolvedValueOnce([]);
      const hookData = makeHookData({
        userPreferences: {
          default_weight_unit: 'lbs',
          // @ts-expect-error - simulating unknown server field
          secret_field: 'should-be-stripped',
        },
      });
      const report = await buildDiagnosticReport(hookData);
      expect(report.userPreferences?.default_weight_unit).toBe('lbs');
      expect(JSON.stringify(report.userPreferences)).not.toContain('should-be-stripped');
    });

    it('does not contain server URLs', async () => {
      getLogs.mockResolvedValueOnce([
        {
          timestamp: '2026-02-27T10:00:00.000Z',
          message: 'Connecting to https://secret.server.com/api',
          status: 'INFO',
          details: [],
        },
      ]);
      const report = await buildDiagnosticReport(makeHookData());
      const reportJson = JSON.stringify(report);
      expect(reportJson).not.toContain('secret.server.com');
    });

    it('does not contain API keys or tokens', async () => {
      getLogs.mockResolvedValueOnce([
        {
          timestamp: '2026-02-27T10:00:00.000Z',
          message: 'Auth with Bearer my-secret-token-xyz',
          status: 'INFO',
          details: ['api_key=supersecret123'],
        },
      ]);
      const report = await buildDiagnosticReport(makeHookData());
      const reportJson = JSON.stringify(report);
      expect(reportJson).not.toContain('my-secret-token-xyz');
      expect(reportJson).not.toContain('supersecret123');
    });
  });

  // ---- shareDiagnosticReport ----
  describe('shareDiagnosticReport', () => {
    let mockFileInstance: { uri: string; create: jest.Mock; write: jest.Mock; delete: jest.Mock };

    beforeEach(() => {
      getLogs.mockResolvedValue([]);
      // Capture the mock instance created by each shareDiagnosticReport call
      mockFileInstance = {
        uri: 'file:///mock-cache/mock-file.json',
        create: jest.fn(),
        write: jest.fn(),
        delete: jest.fn(),
      };
      (File as unknown as jest.Mock).mockImplementation(() => mockFileInstance);
    });

    it('creates file, writes report, and calls share', async () => {
      await shareDiagnosticReport(makeHookData());

      expect(mockFileInstance.create).toHaveBeenCalledTimes(1);
      expect(mockFileInstance.write).toHaveBeenCalledTimes(1);

      const writtenContent = mockFileInstance.write.mock.calls[0][0];
      const parsed = JSON.parse(writtenContent);
      expect(parsed.metadata.reportFormatVersion).toBe(REPORT_FORMAT_VERSION);

      expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
      expect(Sharing.shareAsync).toHaveBeenCalledWith(
        mockFileInstance.uri,
        expect.objectContaining({ mimeType: 'application/json' }),
      );
    });

    it('cleans up temp file after sharing', async () => {
      await shareDiagnosticReport(makeHookData());
      expect(mockFileInstance.delete).toHaveBeenCalledTimes(1);
    });

    it('cleans up temp file on share failure', async () => {
      (Sharing.shareAsync as jest.Mock).mockRejectedValueOnce(new Error('Share failed'));

      await expect(shareDiagnosticReport(makeHookData())).rejects.toThrow('Share failed');
      expect(mockFileInstance.delete).toHaveBeenCalledTimes(1);
    });

    it('handles user cancellation gracefully', async () => {
      (Sharing.shareAsync as jest.Mock).mockRejectedValueOnce(
        new Error('User did cancel sharing')
      );

      // Should not throw
      await shareDiagnosticReport(makeHookData());
      expect(mockFileInstance.delete).toHaveBeenCalledTimes(1);
    });

    it('writes valid JSON', async () => {
      await shareDiagnosticReport(makeHookData());
      const writtenContent = mockFileInstance.write.mock.calls[0][0];
      expect(() => JSON.parse(writtenContent)).not.toThrow();
    });
  });
});
