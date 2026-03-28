/**
 * Tests for per-record timezone resolution in health data processing.
 *
 * Covers the resolveHealthEntryDate() helper and its integration into
 * processHealthData() — verifying the fallback chain:
 *   1. record_timezone (IANA)
 *   2. record_utc_offset_minutes (fixed offset)
 *   3. account timezone (fallback)
 *
 * Run with: pnpm exec jest tests/measurementService.timezone.test.js
 */
const measurementService = require('../services/measurementService');
const measurementRepository = require('../models/measurementRepository');
const preferenceRepository = require('../models/preferenceRepository');

jest.mock('../models/measurementRepository');
jest.mock('../models/preferenceRepository');
jest.mock('../models/userRepository');
jest.mock('../models/exerciseRepository');
jest.mock('../models/exerciseEntry');
jest.mock('../models/sleepRepository');
jest.mock('../models/waterContainerRepository');
jest.mock('../models/activityDetailsRepository');
jest.mock('../config/logging', () => ({
  log: jest.fn(),
}));

// ---------------------------------------------------------------------------
// resolveHealthEntryDate — unit tests
// ---------------------------------------------------------------------------
describe('resolveHealthEntryDate', () => {
  const { resolveHealthEntryDate } = measurementService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses record_timezone over fallback account timezone', () => {
    // 2024-06-14 23:30 UTC → June 15 in Tokyo (UTC+9), June 14 in UTC
    const entry = {
      type: 'heart_rate',
      value: 72,
      timestamp: '2024-06-14T23:30:00Z',
      record_timezone: 'Asia/Tokyo',
    };
    const result = resolveHealthEntryDate(entry, 'UTC');
    expect(result.parsedDate).toBe('2024-06-15');
  });

  it('uses record_utc_offset_minutes over fallback account timezone', () => {
    // 2024-06-14 23:30 UTC with +540 min offset → June 15
    const entry = {
      type: 'heart_rate',
      value: 72,
      timestamp: '2024-06-14T23:30:00Z',
      record_utc_offset_minutes: 540,
    };
    const result = resolveHealthEntryDate(entry, 'UTC');
    expect(result.parsedDate).toBe('2024-06-15');
  });

  it('prefers record_timezone over record_utc_offset_minutes', () => {
    // Both present — IANA zone should win
    const entry = {
      type: 'heart_rate',
      value: 72,
      timestamp: '2024-06-14T23:30:00Z',
      record_timezone: 'Asia/Tokyo', // +9 → June 15
      record_utc_offset_minutes: -300, // -5 → June 14
    };
    const result = resolveHealthEntryDate(entry, 'UTC');
    expect(result.parsedDate).toBe('2024-06-15');
  });

  it('falls back to account timezone when no record metadata', () => {
    // 2024-06-15 00:30 UTC → June 14 in LA (UTC-7)
    const entry = {
      type: 'heart_rate',
      value: 72,
      timestamp: '2024-06-15T00:30:00Z',
    };
    const result = resolveHealthEntryDate(entry, 'America/Los_Angeles');
    expect(result.parsedDate).toBe('2024-06-14');
  });

  it('logs DEBUG when falling back to account timezone', () => {
    const log = require('../config/logging').log;
    const entry = {
      type: 'heart_rate',
      value: 72,
      timestamp: '2024-06-15T00:30:00Z',
    };
    resolveHealthEntryDate(entry, 'America/Los_Angeles');
    expect(log).toHaveBeenCalledWith(
      'DEBUG',
      expect.stringContaining('falling back to account timezone')
    );
  });

  it('ignores invalid record_timezone and falls back', () => {
    const entry = {
      type: 'heart_rate',
      value: 72,
      timestamp: '2024-06-15T00:30:00Z',
      record_timezone: 'Fake/Zone',
    };
    const result = resolveHealthEntryDate(entry, 'UTC');
    expect(result.parsedDate).toBe('2024-06-15');
  });

  it('returns null for unparseable dates', () => {
    const entry = {
      type: 'heart_rate',
      value: 72,
      date: 'not-a-date',
    };
    expect(resolveHealthEntryDate(entry, 'UTC')).toBeNull();
  });

  // -- Sleep: basis = wake_time / end --

  it('uses wake_time as basis instant for SleepSession', () => {
    // Sleep that starts June 14 and ends June 15.
    // wake_time is 2024-06-15 06:00 UTC. With UTC+9 that's June 15 15:00 local → June 15.
    // If it used start/timestamp instead (June 14 22:00 UTC), UTC+9 → June 15 07:00 → also June 15 in this case.
    // Use a case where wake_time date differs from timestamp date:
    // bedtime: June 14 14:00 UTC, wake: June 15 00:30 UTC
    // With UTC-5: bedtime=June 14 09:00, wake=June 14 19:30 → June 14
    // With UTC+0: wake=June 15 00:30 → June 15
    const entry = {
      type: 'SleepSession',
      timestamp: '2024-06-14T14:00:00Z',
      wake_time: '2024-06-15T00:30:00Z',
      record_timezone: 'UTC',
    };
    const result = resolveHealthEntryDate(entry, 'America/New_York');
    // wake_time in UTC → June 15
    expect(result.parsedDate).toBe('2024-06-15');
  });

  it('falls back to date/entry_date for SleepSession without wake_time', () => {
    const entry = {
      type: 'SleepSession',
      date: '2024-06-15',
      timestamp: '2024-06-14T22:00:00Z',
      record_timezone: 'UTC',
    };
    const result = resolveHealthEntryDate(entry, 'UTC');
    // date field '2024-06-15' → parsed as UTC midnight → June 15
    expect(result.parsedDate).toBe('2024-06-15');
  });

  // -- Exercise: basis = start/timestamp --

  it('uses timestamp as basis for ExerciseSession', () => {
    const entry = {
      type: 'ExerciseSession',
      timestamp: '2024-06-14T23:30:00Z',
      record_timezone: 'Asia/Tokyo',
    };
    const result = resolveHealthEntryDate(entry, 'UTC');
    // 23:30 UTC in Tokyo (+9) → June 15 08:30 → June 15
    expect(result.parsedDate).toBe('2024-06-15');
  });

  it('uses date as basis for Workout when no timestamp', () => {
    const entry = {
      type: 'Workout',
      date: '2024-06-15',
      record_timezone: 'UTC',
    };
    const result = resolveHealthEntryDate(entry, 'UTC');
    expect(result.parsedDate).toBe('2024-06-15');
  });

  it('prefers timestamp over pre-bucketed date for ExerciseSession', () => {
    // User works out at 2024-06-14 23:00 UTC in Tokyo (UTC+9).
    // Local time: June 15 08:00 JST → correct entry_date is June 15.
    // But mobile pre-bucketed date using device timezone after travel to NYC:
    // toLocalDateString('2024-06-14T23:00:00Z') in UTC-4 → June 14 (WRONG).
    // The server must use timestamp + record_timezone, NOT the pre-bucketed date.
    const entry = {
      type: 'ExerciseSession',
      date: '2024-06-14', // pre-bucketed on device (WRONG for Tokyo)
      entry_date: '2024-06-14', // also pre-bucketed (WRONG)
      timestamp: '2024-06-14T23:00:00Z',
      record_timezone: 'Asia/Tokyo',
    };
    const result = resolveHealthEntryDate(entry, 'America/New_York');
    // timestamp in Tokyo → June 15 08:00 → June 15
    expect(result.parsedDate).toBe('2024-06-15');
  });

  it('prefers timestamp over pre-bucketed date for Workout', () => {
    const entry = {
      type: 'Workout',
      date: '2024-06-14',
      entry_date: '2024-06-14',
      timestamp: '2024-06-14T23:00:00Z',
      record_utc_offset_minutes: 540, // UTC+9
    };
    const result = resolveHealthEntryDate(entry, 'UTC');
    expect(result.parsedDate).toBe('2024-06-15');
  });

  // -- entryHour --

  it('derives entryHour from timestamp using record_timezone', () => {
    // 15:45 UTC in Tokyo (+9) → 00:45
    const entry = {
      type: 'heart_rate',
      value: 72,
      timestamp: '2024-06-15T15:45:00Z',
      record_timezone: 'Asia/Tokyo',
    };
    const result = resolveHealthEntryDate(entry, 'UTC');
    expect(result.entryHour).toBe(0);
  });

  it('derives entryHour from timestamp using record_utc_offset_minutes', () => {
    // 15:45 UTC with -4h → 11:45 → hour 11
    const entry = {
      type: 'heart_rate',
      value: 72,
      timestamp: '2024-06-15T15:45:00Z',
      record_utc_offset_minutes: -240,
    };
    const result = resolveHealthEntryDate(entry, 'UTC');
    expect(result.entryHour).toBe(11);
  });

  it('defaults entryHour to 0 when no timestamp field', () => {
    const entry = {
      type: 'heart_rate',
      value: 72,
      date: '2024-06-15',
      record_timezone: 'Asia/Tokyo',
    };
    const result = resolveHealthEntryDate(entry, 'UTC');
    expect(result.entryHour).toBe(0);
  });

  // -- Travel scenarios --

  it('workout recorded in UTC+9, synced from UTC-5: lands on original local day', () => {
    // User works out at 2024-06-14 23:00 UTC while in Tokyo (UTC+9).
    // Local time: June 15 08:00 JST → entry_date should be June 15.
    // Later the user flies to NYC (UTC-4) and syncs.
    // Without record timezone, the server would use UTC-4: June 14 19:00 → June 14 (WRONG).
    // With record_utc_offset_minutes: 540, server uses +9 → June 15 (CORRECT).
    const entry = {
      type: 'ExerciseSession',
      timestamp: '2024-06-14T23:00:00Z',
      record_utc_offset_minutes: 540, // UTC+9 from Health Connect
    };
    const result = resolveHealthEntryDate(entry, 'America/New_York');
    expect(result.parsedDate).toBe('2024-06-15');
  });

  // -- Date-only bypass (client-aggregated daily records) --

  it('preserves date-only aggregate with negative-offset timezone metadata', () => {
    // Client aggregated steps into 2024-01-15 using America/New_York.
    // Without the bypass, parsing '2024-01-15' as UTC midnight then applying
    // America/New_York (UTC-5) would shift to 2024-01-14 — wrong.
    const entry = {
      type: 'step',
      value: 5000,
      date: '2024-01-15',
      record_timezone: 'America/New_York',
    };
    const result = resolveHealthEntryDate(entry, 'UTC');
    expect(result.parsedDate).toBe('2024-01-15');
  });

  it('preserves date-only aggregate with offset metadata', () => {
    const entry = {
      type: 'Active Calories',
      value: 300,
      date: '2024-01-15',
      record_utc_offset_minutes: -300,
    };
    const result = resolveHealthEntryDate(entry, 'UTC');
    expect(result.parsedDate).toBe('2024-01-15');
  });

  it('still applies timezone when entry has both date and timestamp', () => {
    // When a timestamp is present, timezone conversion should apply even if
    // the date field is a YYYY-MM-DD string.
    const entry = {
      type: 'ExerciseSession',
      date: '2024-06-14',
      timestamp: '2024-06-14T23:00:00Z',
      record_timezone: 'Asia/Tokyo',
    };
    const result = resolveHealthEntryDate(entry, 'UTC');
    // timestamp 23:00 UTC in Tokyo (+9) → June 15 08:00 → June 15
    expect(result.parsedDate).toBe('2024-06-15');
  });

  it('sleep ending in one timezone, synced from another: lands on original wake day', () => {
    // User sleeps in London (UTC+1 BST). Goes to bed June 14 23:00 BST (22:00 UTC).
    // Wakes up June 15 07:00 BST (06:00 UTC).
    // Flies to LA (UTC-7) and syncs.
    // Without record timezone: 06:00 UTC in LA = June 14 23:00 → June 14 (WRONG).
    // With record_timezone 'Europe/London': 06:00 UTC = June 15 07:00 BST → June 15 (CORRECT).
    const entry = {
      type: 'SleepSession',
      timestamp: '2024-06-14T22:00:00Z',
      wake_time: '2024-06-15T06:00:00Z',
      record_timezone: 'Europe/London',
    };
    const result = resolveHealthEntryDate(entry, 'America/Los_Angeles');
    expect(result.parsedDate).toBe('2024-06-15');
  });
});

// ---------------------------------------------------------------------------
// processHealthData — integration tests for timezone resolution
// ---------------------------------------------------------------------------
describe('processHealthData timezone resolution', () => {
  const userId = 'user-tz';
  const actingUserId = 'user-tz';

  function setAccountTimezone(tz) {
    preferenceRepository.getUserPreferences.mockResolvedValue({ timezone: tz });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    // Default account timezone: UTC
    setAccountTimezone('UTC');
    measurementRepository.getCustomCategories = jest.fn().mockResolvedValue([]);
    measurementRepository.createCustomCategory = jest
      .fn()
      .mockResolvedValue({ id: 'cat-new' });
    measurementRepository.upsertCustomMeasurement = jest
      .fn()
      .mockResolvedValue({ id: 'entry-1' });
  });

  it('record_timezone overrides account timezone for parsedDate', async () => {
    // Account timezone is UTC. Record says Asia/Tokyo.
    // 2024-06-14 23:30 UTC → June 14 in UTC, June 15 in Tokyo.
    const healthData = [
      {
        type: 'heart_rate',
        value: 72,
        timestamp: '2024-06-14T23:30:00Z',
        source: 'HealthConnect',
        record_timezone: 'Asia/Tokyo',
      },
    ];

    await measurementService.processHealthData(
      healthData,
      userId,
      actingUserId
    );

    expect(measurementRepository.upsertCustomMeasurement).toHaveBeenCalledWith(
      userId,
      actingUserId,
      'cat-new',
      72,
      '2024-06-15', // Tokyo date, not UTC
      expect.any(Number),
      '2024-06-14T23:30:00.000Z',
      undefined,
      'Daily',
      'HealthConnect'
    );
  });

  it('record_utc_offset_minutes overrides account timezone for parsedDate', async () => {
    const healthData = [
      {
        type: 'heart_rate',
        value: 72,
        timestamp: '2024-06-14T23:30:00Z',
        source: 'HealthConnect',
        record_utc_offset_minutes: 540, // +9h
      },
    ];

    await measurementService.processHealthData(
      healthData,
      userId,
      actingUserId
    );

    expect(measurementRepository.upsertCustomMeasurement).toHaveBeenCalledWith(
      userId,
      actingUserId,
      'cat-new',
      72,
      '2024-06-15', // +9h date
      expect.any(Number),
      '2024-06-14T23:30:00.000Z',
      undefined,
      'Daily',
      'HealthConnect'
    );
  });

  it('falls back to account timezone when no record metadata', async () => {
    // Account is America/Los_Angeles (UTC-7 in summer).
    setAccountTimezone('America/Los_Angeles');
    // 2024-06-15 00:30 UTC → June 14 in LA.
    const healthData = [
      {
        type: 'heart_rate',
        value: 72,
        timestamp: '2024-06-15T00:30:00Z',
        source: 'HealthConnect',
      },
    ];

    await measurementService.processHealthData(
      healthData,
      userId,
      actingUserId
    );

    expect(measurementRepository.upsertCustomMeasurement).toHaveBeenCalledWith(
      userId,
      actingUserId,
      'cat-new',
      72,
      '2024-06-14', // LA date
      expect.any(Number),
      '2024-06-15T00:30:00.000Z',
      undefined,
      'Daily',
      'HealthConnect'
    );
  });

  it('logs timezone fallback by type', async () => {
    const log = require('../config/logging').log;
    const healthData = [
      {
        type: 'heart_rate',
        value: 72,
        timestamp: '2024-06-14T23:30:00Z',
        source: 'HealthConnect',
        record_timezone: 'Asia/Tokyo',
      },
      {
        type: 'heart_rate',
        value: 65,
        timestamp: '2024-06-14T22:00:00Z',
        source: 'HealthConnect',
        // no timezone metadata — will fall back
      },
    ];

    await measurementService.processHealthData(
      healthData,
      userId,
      actingUserId
    );

    // Fallback log includes the type that fell back
    expect(log).toHaveBeenCalledWith(
      'INFO',
      expect.stringContaining('heart_rate=1')
    );
    // Metadata log includes the type that had metadata
    expect(log).toHaveBeenCalledWith(
      'DEBUG',
      expect.stringContaining('heart_rate=1')
    );
  });
});
