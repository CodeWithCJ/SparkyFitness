import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import {
  roundCalories,
  roundDurationMinutes,
  roundToNearest10,
  roundBloodPressure,
  roundDistance,
  roundAllNumericUnits,
  collectMetricSection,
  buildHealthDiagnosticReport,
  shareHealthDiagnosticReport,
} from '../../src/services/healthDiagnosticService';
import { HEALTH_DIAGNOSTIC_REPORT_VERSION } from '../../src/types/healthDiagnosticReport';

// Mock react-native-health-connect readRecords (used by diagnosticReadRecords)
const mockReadRecords = jest.fn().mockResolvedValue({ records: [] });
jest.mock('react-native-health-connect', () => ({
  readRecords: (...args: unknown[]) => mockReadRecords(...args),
}));

// Mock diagnosticReportService helpers
jest.mock('../../src/services/diagnosticReportService', () => ({
  collectAppInfo: () => ({
    version: '1.0.0',
    buildNumber: '42',
    expoSdkVersion: '54.0.0',
    appVariant: 'development',
  }),
  collectDeviceInfo: () => ({
    platform: 'android',
    osVersion: '15',
    modelName: 'Pixel 8',
    manufacturer: 'Google',
  }),
}));

describe('healthDiagnosticService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadRecords.mockResolvedValue({ records: [] });
  });

  // ---- Rounding utilities ----
  describe('rounding utilities', () => {
    describe('roundCalories', () => {
      it('rounds to nearest 50', () => {
        expect(roundCalories(123)).toBe(100);
        expect(roundCalories(149)).toBe(150);
        expect(roundCalories(150)).toBe(150);
        expect(roundCalories(175)).toBe(200);
        expect(roundCalories(0)).toBe(0);
      });
    });

    describe('roundDurationMinutes', () => {
      it('rounds to nearest integer minute', () => {
        expect(roundDurationMinutes(3.2)).toBe(3);
        expect(roundDurationMinutes(7.8)).toBe(8);
        expect(roundDurationMinutes(0.4)).toBe(0);
        expect(roundDurationMinutes(45)).toBe(45);
      });
    });

    describe('roundToNearest10', () => {
      it('rounds to nearest 10', () => {
        expect(roundToNearest10(43.7)).toBe(40);
        expect(roundToNearest10(47)).toBe(50);
        expect(roundToNearest10(5)).toBe(10);
        expect(roundToNearest10(0)).toBe(0);
      });
    });

    describe('roundBloodPressure', () => {
      it('rounds to nearest 5', () => {
        expect(roundBloodPressure(122)).toBe(120);
        expect(roundBloodPressure(123)).toBe(125);
        expect(roundBloodPressure(118)).toBe(120);
        expect(roundBloodPressure(80)).toBe(80);
      });
    });

    describe('roundDistance', () => {
      it('rounds to nearest 100', () => {
        expect(roundDistance(1234)).toBe(1200);
        expect(roundDistance(1250)).toBe(1300);
        expect(roundDistance(50)).toBe(100);
        expect(roundDistance(0)).toBe(0);
      });
    });
  });

  // ---- roundAllNumericUnits ----
  describe('roundAllNumericUnits', () => {
    it('rounds all calorie unit aliases in energy object', () => {
      const energy = {
        inCalories: 347.5,
        inKilocalories: 0.3475,
        inJoules: 1454.12,
      };
      const rounded = roundAllNumericUnits(energy);
      expect(rounded.inCalories).toBe(350);
      expect(rounded.inKilocalories).toBe(0);
      expect(rounded.inJoules).toBe(1450);
    });

    it('rounds all distance unit aliases', () => {
      const distance = {
        inMeters: 1234,
        inKilometers: 1.234,
        inMiles: 0.766,
      };
      const rounded = roundAllNumericUnits(distance);
      expect(rounded.inMeters).toBe(1200);
      // Small fractional values round to 0 with nearest-100 — fine for privacy
      expect(rounded.inKilometers).toBe(0);
      expect(rounded.inMiles).toBe(0);
    });

    it('rounds blood pressure unit aliases', () => {
      const bp = { inMillimetersOfMercury: 122.5 };
      const rounded = roundAllNumericUnits(bp);
      expect(rounded.inMillimetersOfMercury).toBe(125);
    });

    it('preserves non-numeric fields', () => {
      const obj = { unit: 'kcal', inCalories: 347.5, label: 'energy' };
      const rounded = roundAllNumericUnits(obj);
      expect(rounded.unit).toBe('kcal');
      expect(rounded.label).toBe('energy');
    });

    it('handles nested objects recursively', () => {
      const obj = {
        energy: {
          inCalories: 347.5,
          inKilocalories: 0.3475,
        },
      };
      const rounded = roundAllNumericUnits(obj);
      const energy = rounded.energy as Record<string, unknown>;
      expect(energy.inCalories).toBe(350);
      expect(energy.inKilocalories).toBe(0);
    });

    it('applies parent rounder to unmatched child keys', () => {
      // "energy" parent matches calorie rounder → child "value" should use it
      const obj = {
        energy: { value: 347.5 },
      };
      const rounded = roundAllNumericUnits(obj);
      const energy = rounded.energy as Record<string, unknown>;
      expect(energy.value).toBe(350);
    });

    it('preserves null and undefined values', () => {
      const obj = { inCalories: null, inKilocalories: undefined, label: 'test' };
      const rounded = roundAllNumericUnits(obj as Record<string, unknown>);
      expect(rounded.inCalories).toBeNull();
      expect(rounded.inKilocalories).toBeUndefined();
    });
  });

  // ---- collectMetricSection ----
  describe('collectMetricSection', () => {
    const start = new Date('2026-03-23T10:00:00Z');
    const end = new Date('2026-03-23T14:00:00Z');

    it('returns rounded records when data exists', async () => {
      mockReadRecords.mockResolvedValueOnce({ records: [
        {
          startTime: '2026-03-23T11:00:00Z',
          endTime: '2026-03-23T11:30:00Z',
          energy: { inCalories: 347.5, inKilocalories: 0.3475 },
          metadata: { dataOrigin: 'com.garmin.android.apps.connectmobile' },
        },
      ] });

      const section = await collectMetricSection('ActiveCaloriesBurned', start, end);
      expect(section.metricType).toBe('ActiveCaloriesBurned');
      expect(section.recordCount).toBe(1);
      expect(section.error).toBeNull();
      expect(section.records[0].dataOrigin).toBe('com.garmin.android.apps.connectmobile');
      // Verify calorie values are rounded
      const energy = section.records[0].energy as Record<string, unknown>;
      expect(energy.inCalories).toBe(350);
    });

    it('returns empty section when no records exist', async () => {
      mockReadRecords.mockResolvedValueOnce({ records: [] });

      const section = await collectMetricSection('BloodPressure', start, end);
      expect(section.recordCount).toBe(0);
      expect(section.records).toEqual([]);
      expect(section.error).toBeNull();
    });

    it('captures error when readRecords throws (e.g., permission denied)', async () => {
      mockReadRecords.mockRejectedValueOnce(new Error('Permission denied for Vo2Max'));

      const section = await collectMetricSection('Vo2Max', start, end);
      expect(section.recordCount).toBe(0);
      expect(section.records).toEqual([]);
      expect(section.error).toBe('Permission denied for Vo2Max');
    });

    it('paginates through multiple pages and forwards pageToken', async () => {
      mockReadRecords
        .mockResolvedValueOnce({
          records: [{ startTime: '2026-03-23T11:00:00Z', endTime: '2026-03-23T11:30:00Z', energy: { inKilocalories: 100 }, metadata: {} }],
          pageToken: 'page2',
        })
        .mockResolvedValueOnce({
          records: [{ startTime: '2026-03-23T12:00:00Z', endTime: '2026-03-23T12:30:00Z', energy: { inKilocalories: 200 }, metadata: {} }],
          pageToken: undefined,
        });

      const section = await collectMetricSection('ActiveCaloriesBurned', start, end);
      expect(section.recordCount).toBe(2);
      expect(mockReadRecords).toHaveBeenCalledTimes(2);
      // Verify pageToken from first response is forwarded to second call
      expect(mockReadRecords.mock.calls[1][1]).toEqual(
        expect.objectContaining({ pageToken: 'page2' }),
      );
    });

    it('stops paginating after max pages to prevent infinite loops', async () => {
      mockReadRecords.mockImplementation(() =>
        Promise.resolve({ records: [{ metadata: {} }], pageToken: 'next' }),
      );

      const section = await collectMetricSection('ActiveCaloriesBurned', start, end);
      // DIAGNOSTIC_MAX_PAGES = 20
      expect(mockReadRecords).toHaveBeenCalledTimes(20);
      expect(section.recordCount).toBe(20);
    });

    it('calls readRecords with the metric type as recordType', async () => {
      await collectMetricSection('SleepSession', start, end);
      expect(mockReadRecords).toHaveBeenCalledWith(
        'SleepSession',
        expect.objectContaining({
          timeRangeFilter: expect.objectContaining({ operator: 'between' }),
        }),
      );
    });
  });

  // ---- Per-metric record rounders (via collectMetricSection) ----
  describe('exercise session rounding', () => {
    const start = new Date('2026-03-23T10:00:00Z');
    const end = new Date('2026-03-23T14:00:00Z');

    it('strips GPS route data and preserves point count', async () => {
      mockReadRecords.mockResolvedValueOnce({ records: [
        {
          startTime: '2026-03-23T11:00:00Z',
          endTime: '2026-03-23T11:45:00Z',
          exerciseType: 79,
          title: 'Morning Run',
          metadata: { id: 'abc-123', dataOrigin: 'com.garmin.android.apps.connectmobile' },
          energy: { inKilocalories: 347 },
          distance: { inMeters: 5234 },
          exerciseRoute: {
            route: [
              { latitude: 37.7749, longitude: -122.4194, altitude: 10.5 },
              { latitude: 37.7750, longitude: -122.4195, altitude: 11.0 },
              { latitude: 37.7751, longitude: -122.4196, altitude: 11.5 },
            ],
          },
        },
      ] });

      const section = await collectMetricSection('ExerciseSession', start, end);
      const record = section.records[0];

      // GPS data should be stripped
      const routeSummary = record.exerciseRoute as { pointCount: number };
      expect(routeSummary.pointCount).toBe(3);
      expect(JSON.stringify(record)).not.toContain('37.7749');
      expect(JSON.stringify(record)).not.toContain('-122.4194');
      expect(JSON.stringify(record)).not.toContain('latitude');
      expect(JSON.stringify(record)).not.toContain('longitude');
    });

    it('drops title and metadata.id for privacy', async () => {
      mockReadRecords.mockResolvedValueOnce({ records: [
        {
          startTime: '2026-03-23T11:00:00Z',
          endTime: '2026-03-23T11:45:00Z',
          exerciseType: 79,
          title: 'Morning Run with Bob',
          metadata: { id: 'abc-123', dataOrigin: 'com.garmin.android.apps.connectmobile' },
        },
      ] });

      const section = await collectMetricSection('ExerciseSession', start, end);
      const record = section.records[0];
      // Verbatim title and stable ID are stripped
      expect(record).not.toHaveProperty('title');
      expect(record).not.toHaveProperty('metadataId');
      expect(record.hasTitle).toBe(true);
      // But dataOrigin (package name) is preserved
      expect(record.dataOrigin).toBe('com.garmin.android.apps.connectmobile');
    });

    it('preserves metadata.dataOrigin as source identifier', async () => {
      mockReadRecords.mockResolvedValueOnce({ records: [
        {
          startTime: '2026-03-23T11:00:00Z',
          endTime: '2026-03-23T11:45:00Z',
          exerciseType: 79,
          metadata: { dataOrigin: 'com.samsung.health' },
        },
      ] });

      const section = await collectMetricSection('ExerciseSession', start, end);
      expect(section.records[0].dataOrigin).toBe('com.samsung.health');
    });

    it('handles exercise session with no optional fields', async () => {
      mockReadRecords.mockResolvedValueOnce({ records: [{
        startTime: '2026-03-23T11:00:00Z',
        endTime: '2026-03-23T11:30:00Z',
        exerciseType: 1,
        metadata: {},
      }] });

      const section = await collectMetricSection('ExerciseSession', start, end);
      expect(section.recordCount).toBe(1);
      expect(section.records[0].energy).toBeUndefined();
      expect(section.records[0].distance).toBeUndefined();
      expect(section.records[0].exerciseRoute).toBeUndefined();
      expect(section.records[0].hasTitle).toBe(false);
    });

    it('rounds duration, energy, and distance', async () => {
      mockReadRecords.mockResolvedValueOnce({ records: [
        {
          startTime: '2026-03-23T11:00:00Z',
          endTime: '2026-03-23T11:42:30Z', // 42.5 minutes
          exerciseType: 79,
          energy: { inKilocalories: 347 },
          distance: { inMeters: 5234 },
          metadata: {},
        },
      ] });

      const section = await collectMetricSection('ExerciseSession', start, end);
      const record = section.records[0];
      expect(record.durationMinutes).toBe(43); // 42.5 rounded to 43
      const energy = record.energy as Record<string, unknown>;
      expect(energy.inKilocalories).toBe(350);
      const distance = record.distance as Record<string, unknown>;
      expect(distance.inMeters).toBe(5200);
    });
  });

  describe('blood pressure rounding', () => {
    const start = new Date('2026-03-23T10:00:00Z');
    const end = new Date('2026-03-23T14:00:00Z');

    it('rounds systolic and diastolic to nearest 5', async () => {
      mockReadRecords.mockResolvedValueOnce({ records: [
        {
          systolic: { inMillimetersOfMercury: 122 },
          diastolic: { inMillimetersOfMercury: 78 },
          time: '2026-03-23T12:00:00Z',
          metadata: { dataOrigin: 'com.withings.wiscale' },
        },
      ] });

      const section = await collectMetricSection('BloodPressure', start, end);
      const record = section.records[0];
      const systolic = record.systolic as Record<string, unknown>;
      const diastolic = record.diastolic as Record<string, unknown>;
      expect(systolic.inMillimetersOfMercury).toBe(120);
      expect(diastolic.inMillimetersOfMercury).toBe(80);
      expect(record.dataOrigin).toBe('com.withings.wiscale');
    });
  });

  describe('VO2 Max rounding', () => {
    const start = new Date('2026-03-23T10:00:00Z');
    const end = new Date('2026-03-23T14:00:00Z');

    it('rounds vo2 values to nearest 10', async () => {
      mockReadRecords.mockResolvedValueOnce({ records: [
        {
          vo2MillilitersPerMinuteKilogram: 43.7,
          time: '2026-03-23T12:00:00Z',
          metadata: { dataOrigin: 'com.garmin.android.apps.connectmobile' },
        },
      ] });

      const section = await collectMetricSection('Vo2Max', start, end);
      const record = section.records[0];
      expect(record.vo2MillilitersPerMinuteKilogram).toBe(40);
      expect(record.dataOrigin).toBe('com.garmin.android.apps.connectmobile');
    });

    it('handles vo2Max field name variant', async () => {
      mockReadRecords.mockResolvedValueOnce({ records: [
        { vo2Max: 47.2, time: '2026-03-23T12:00:00Z', metadata: {} },
      ] });

      const section = await collectMetricSection('Vo2Max', start, end);
      expect(section.records[0].vo2Max).toBe(50);
    });
  });

  describe('sleep session rounding', () => {
    const start = new Date('2026-03-23T10:00:00Z');
    const end = new Date('2026-03-23T14:00:00Z');

    it('rounds duration and preserves stage structure', async () => {
      mockReadRecords.mockResolvedValueOnce({ records: [
        {
          startTime: '2026-03-22T23:00:00Z',
          endTime: '2026-03-23T06:30:00Z', // 7.5 hours = 450 min
          title: 'Sleep',
          stages: [
            { stage: 1, startTime: '2026-03-22T23:00:00Z', endTime: '2026-03-22T23:30:00Z', duration: 30 },
            { stage: 4, startTime: '2026-03-22T23:30:00Z', endTime: '2026-03-23T01:00:00Z', duration: 90 },
          ],
          metadata: { dataOrigin: 'com.samsung.health' },
        },
      ] });

      const section = await collectMetricSection('SleepSession', start, end);
      const record = section.records[0];
      expect(record.durationMinutes).toBe(450);
      // title is stripped for privacy, replaced with hasTitle boolean
      expect(record.hasTitle).toBe(true);
      expect(record).not.toHaveProperty('title');
      expect(record.dataOrigin).toBe('com.samsung.health');

      const stages = record.stages as Record<string, unknown>[];
      expect(stages).toHaveLength(2);
      expect(stages[0].stage).toBe(1);
      expect(stages[0].duration).toBe(30);
      expect(stages[1].stage).toBe(4);
      expect(stages[1].duration).toBe(90);
    });
  });

  // ---- buildHealthDiagnosticReport ----
  describe('buildHealthDiagnosticReport', () => {
    it('builds a report with correct metadata', async () => {
      const report = await buildHealthDiagnosticReport();

      expect(report.metadata.reportFormatVersion).toBe(HEALTH_DIAGNOSTIC_REPORT_VERSION);
      expect(report.metadata.platform).toBe('android');
      expect(report.metadata.lookbackHours).toBe(4);
      expect(report.metadata.note).toContain('rounded for privacy');
      expect(report.metadata.generatedAt).toBeTruthy();
    });

    it('includes all 6 metric sections', async () => {
      const report = await buildHealthDiagnosticReport();
      expect(report.metrics).toHaveLength(6);

      const types = report.metrics.map(m => m.metricType);
      expect(types).toContain('TotalCaloriesBurned');
      expect(types).toContain('ActiveCaloriesBurned');
      expect(types).toContain('ExerciseSession');
      expect(types).toContain('BloodPressure');
      expect(types).toContain('Vo2Max');
      expect(types).toContain('SleepSession');
    });

    it('includes app and device info', async () => {
      const report = await buildHealthDiagnosticReport();
      expect(report.app.version).toBe('1.0.0');
      expect(report.device.platform).toBe('android');
      expect(report.device.modelName).toBe('Pixel 8');
    });

    it('lookback window is approximately 4 hours', async () => {
      const report = await buildHealthDiagnosticReport();
      const start = new Date(report.metadata.lookbackStart).getTime();
      const end = new Date(report.metadata.lookbackEnd).getTime();
      const diffHours = (end - start) / (60 * 60 * 1000);
      expect(diffHours).toBeCloseTo(4, 0);
    });
  });

  // ---- shareHealthDiagnosticReport ----
  describe('shareHealthDiagnosticReport', () => {
    let mockFileInstance: { uri: string; create: jest.Mock; write: jest.Mock; delete: jest.Mock };

    beforeEach(() => {
      mockFileInstance = {
        uri: 'file:///mock-cache/mock-file.json',
        create: jest.fn(),
        write: jest.fn(),
        delete: jest.fn(),
      };
      (File as unknown as jest.Mock).mockImplementation(() => mockFileInstance);
    });

    it('creates file, writes report, and shares', async () => {
      await shareHealthDiagnosticReport();

      expect(mockFileInstance.create).toHaveBeenCalledTimes(1);
      expect(mockFileInstance.write).toHaveBeenCalledTimes(1);

      const writtenContent = mockFileInstance.write.mock.calls[0][0];
      const parsed = JSON.parse(writtenContent);
      expect(parsed.metadata.reportFormatVersion).toBe(HEALTH_DIAGNOSTIC_REPORT_VERSION);
      expect(parsed.metadata.platform).toBe('android');

      expect(Sharing.shareAsync).toHaveBeenCalledWith(
        mockFileInstance.uri,
        expect.objectContaining({ mimeType: 'application/json' }),
      );
    });

    it('includes android in the filename', async () => {
      await shareHealthDiagnosticReport();
      const [, fileName] = (File as unknown as jest.Mock).mock.calls[0];
      expect(fileName).toContain('health-diagnostic-android');
    });

    it('cleans up temp file after sharing', async () => {
      await shareHealthDiagnosticReport();
      expect(mockFileInstance.delete).toHaveBeenCalledTimes(1);
    });

    it('cleans up temp file on share failure', async () => {
      (Sharing.shareAsync as jest.Mock).mockRejectedValueOnce(new Error('Share failed'));
      await expect(shareHealthDiagnosticReport()).rejects.toThrow('Share failed');
      expect(mockFileInstance.delete).toHaveBeenCalledTimes(1);
    });

    it('handles user cancellation gracefully', async () => {
      (Sharing.shareAsync as jest.Mock).mockRejectedValueOnce(
        new Error('User did cancel sharing'),
      );
      await shareHealthDiagnosticReport();
      expect(mockFileInstance.delete).toHaveBeenCalledTimes(1);
    });

    it('writes valid JSON', async () => {
      await shareHealthDiagnosticReport();
      const writtenContent = mockFileInstance.write.mock.calls[0][0];
      expect(() => JSON.parse(writtenContent)).not.toThrow();
    });
  });
});
