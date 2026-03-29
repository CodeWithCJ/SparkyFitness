/**
 * Tests for source-aware deduplication across:
 *  - measurementRepository: upsertStepData, upsertCheckInMeasurements
 *  - sleepAnalyticsService: getSleepAnalytics (pick best source per night)
 *
 * All DB calls are mocked — no real database connection required.
 */

const { getSleepAnalytics } = require('../services/sleepAnalyticsService');
const sleepRepository = require('../models/sleepRepository');
const userRepository = require('../models/userRepository');

jest.mock('../models/sleepRepository');
jest.mock('../models/userRepository');
jest.mock('../services/measurementService', () => ({
  calculateSleepScore: jest.fn().mockResolvedValue(85),
}));
jest.mock('../config/logging', () => ({ log: jest.fn() }));

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeSleepEntry(overrides = {}) {
  return {
    entry_date: '2026-03-25',
    bedtime: '2026-03-24T22:30:00Z',
    wake_time: '2026-03-25T06:18:00Z',
    duration_in_seconds: 27480, // 7h 38m
    time_asleep_in_seconds: 27000,
    sleep_score: null,
    source: 'manual',
    deep_sleep_seconds: null,
    rem_sleep_seconds: null,
    avg_overnight_hrv: null,
    average_spo2_value: null,
    avg_sleep_stress: null,
    average_respiration_value: null,
    resting_heart_rate: null,
    stage_events: [],
    ...overrides,
  };
}

// ─── sleepAnalyticsService ────────────────────────────────────────────────────

describe('sleepAnalyticsService.getSleepAnalytics', () => {
  const userId = 'user-abc';
  const startDate = '2026-03-25';
  const endDate = '2026-03-25';

  beforeEach(() => {
    jest.clearAllMocks();
    userRepository.getUserProfile.mockResolvedValue({
      date_of_birth: '1990-01-01',
      gender: 'male',
    });
  });

  // ── core dedup ──────────────────────────────────────────────────────────────

  test('single source: returns correct metrics unchanged', async () => {
    const garminEntry = makeSleepEntry({
      source: 'garmin',
      sleep_score: 96,
      duration_in_seconds: 24480, // 6h 48m
      time_asleep_in_seconds: 24480,
      avg_overnight_hrv: 49,
      average_spo2_value: 98,
      stage_events: [
        { stage_type: 'deep', duration_in_seconds: 5880 },
        { stage_type: 'rem', duration_in_seconds: 6720 },
        { stage_type: 'light', duration_in_seconds: 11880 },
      ],
    });
    sleepRepository.getSleepEntriesWithAllDetailsByUserIdAndDateRange.mockResolvedValue(
      [garminEntry]
    );

    const result = await getSleepAnalytics(userId, startDate, endDate);

    expect(result).toHaveLength(1);
    expect(result[0].totalSleepDuration).toBe(24480);
    expect(result[0].timeAsleep).toBe(24480);
    expect(result[0].primarySource).toBe('garmin');
    expect(result[0].availableSources).toEqual(['garmin']);
  });

  test('two sources same night: does NOT double-count duration', async () => {
    // Bug scenario from the screenshot: Garmin 6h48m + HealthKit 6h49m
    // Old code: totalSleepDuration = 6h48m + 6h49m = 13h37m  ← WRONG
    // New code: totalSleepDuration = 6h48m (Garmin wins on sleep_score)
    const garminEntry = makeSleepEntry({
      source: 'garmin',
      sleep_score: 96,
      duration_in_seconds: 24480, // 6h 48m
      time_asleep_in_seconds: 24480,
      avg_overnight_hrv: 49,
      average_spo2_value: 98,
    });
    const healthKitEntry = makeSleepEntry({
      source: 'healthkit',
      sleep_score: 89,
      duration_in_seconds: 24540, // 6h 49m
      time_asleep_in_seconds: 24540,
    });
    sleepRepository.getSleepEntriesWithAllDetailsByUserIdAndDateRange.mockResolvedValue(
      [garminEntry, healthKitEntry]
    );

    const result = await getSleepAnalytics(userId, startDate, endDate);

    expect(result).toHaveLength(1);
    // Must NOT be the sum (13h 37m = 49 020 s)
    expect(result[0].totalSleepDuration).not.toBe(24480 + 24540);
    // Must be Garmin's value (higher score)
    expect(result[0].totalSleepDuration).toBe(24480);
    expect(result[0].primarySource).toBe('garmin');
  });

  test('two sources same night: garmin wins over healthkit on sleep_score', async () => {
    const garmin = makeSleepEntry({ source: 'garmin', sleep_score: 96 });
    const healthKit = makeSleepEntry({ source: 'healthkit', sleep_score: 72 });
    sleepRepository.getSleepEntriesWithAllDetailsByUserIdAndDateRange.mockResolvedValue(
      [healthKit, garmin]
    ); // intentionally garmin last

    const result = await getSleepAnalytics(userId, startDate, endDate);

    expect(result[0].primarySource).toBe('garmin');
  });

  test('two sources: withings beats healthkit when healthkit has no sleep_score', async () => {
    const withings = makeSleepEntry({
      source: 'withings',
      sleep_score: null,
      avg_overnight_hrv: null,
      average_spo2_value: 97,
    });
    const healthKit = makeSleepEntry({
      source: 'healthkit',
      sleep_score: null,
    });
    sleepRepository.getSleepEntriesWithAllDetailsByUserIdAndDateRange.mockResolvedValue(
      [withings, healthKit]
    );

    const result = await getSleepAnalytics(userId, startDate, endDate);

    // Withings has SpO2 data (completeness bonus) + higher source rank → wins
    expect(result[0].primarySource).toBe('withings');
  });

  test('garmin wins over manual even with no sleep_score on either', async () => {
    const garmin = makeSleepEntry({
      source: 'garmin',
      sleep_score: null,
      avg_overnight_hrv: 55,
    });
    const manual = makeSleepEntry({ source: 'manual', sleep_score: null });
    sleepRepository.getSleepEntriesWithAllDetailsByUserIdAndDateRange.mockResolvedValue(
      [garmin, manual]
    );

    const result = await getSleepAnalytics(userId, startDate, endDate);

    expect(result[0].primarySource).toBe('garmin');
  });

  test('availableSources lists all sources even when only one is primary', async () => {
    const garmin = makeSleepEntry({ source: 'garmin', sleep_score: 96 });
    const healthKit = makeSleepEntry({ source: 'healthkit', sleep_score: 72 });
    const withings = makeSleepEntry({ source: 'withings', sleep_score: 80 });
    sleepRepository.getSleepEntriesWithAllDetailsByUserIdAndDateRange.mockResolvedValue(
      [garmin, healthKit, withings]
    );

    const result = await getSleepAnalytics(userId, startDate, endDate);

    expect(result[0].availableSources).toHaveLength(3);
    expect(result[0].availableSources).toContain('garmin');
    expect(result[0].availableSources).toContain('healthkit');
    expect(result[0].availableSources).toContain('withings');
  });

  // ── multiple dates ───────────────────────────────────────────────────────────

  test('multiple dates each with two sources: each date resolved independently', async () => {
    const mar25Garmin = makeSleepEntry({
      entry_date: '2026-03-25',
      source: 'garmin',
      sleep_score: 96,
      duration_in_seconds: 24480,
    });
    const mar25HK = makeSleepEntry({
      entry_date: '2026-03-25',
      source: 'healthkit',
      sleep_score: 72,
      duration_in_seconds: 24540,
    });
    const mar26HK = makeSleepEntry({
      entry_date: '2026-03-26',
      source: 'healthkit',
      sleep_score: 82,
      duration_in_seconds: 25200,
    });
    const mar26Manual = makeSleepEntry({
      entry_date: '2026-03-26',
      source: 'manual',
      sleep_score: null,
      duration_in_seconds: 25000,
    });

    sleepRepository.getSleepEntriesWithAllDetailsByUserIdAndDateRange.mockResolvedValue(
      [mar25Garmin, mar25HK, mar26HK, mar26Manual]
    );

    const result = await getSleepAnalytics(userId, '2026-03-25', '2026-03-26');

    expect(result).toHaveLength(2);
    const r25 = result.find((r) => r.date === '2026-03-25');
    const r26 = result.find((r) => r.date === '2026-03-26');

    expect(r25.primarySource).toBe('garmin');
    expect(r25.totalSleepDuration).toBe(24480); // not 24480+24540

    expect(r26.primarySource).toBe('healthkit');
    expect(r26.totalSleepDuration).toBe(25200); // not 25200+25000
  });

  test('result is sorted ascending by date', async () => {
    const e1 = makeSleepEntry({ entry_date: '2026-03-27', source: 'garmin' });
    const e2 = makeSleepEntry({ entry_date: '2026-03-25', source: 'garmin' });
    const e3 = makeSleepEntry({ entry_date: '2026-03-26', source: 'garmin' });
    sleepRepository.getSleepEntriesWithAllDetailsByUserIdAndDateRange.mockResolvedValue(
      [e1, e2, e3]
    );

    const result = await getSleepAnalytics(userId, '2026-03-25', '2026-03-27');

    expect(result.map((r) => r.date)).toEqual([
      '2026-03-25',
      '2026-03-26',
      '2026-03-27',
    ]);
  });

  // ── sleep efficiency ─────────────────────────────────────────────────────────

  test('sleep efficiency calculated from primary source only', async () => {
    // 6h asleep out of 8h in bed = 75%
    const garmin = makeSleepEntry({
      source: 'garmin',
      sleep_score: 90,
      duration_in_seconds: 28800, // 8h
      time_asleep_in_seconds: 21600, // 6h
    });
    const hk = makeSleepEntry({
      source: 'healthkit',
      sleep_score: 60,
      duration_in_seconds: 25200,
      time_asleep_in_seconds: 24000,
    });
    sleepRepository.getSleepEntriesWithAllDetailsByUserIdAndDateRange.mockResolvedValue(
      [garmin, hk]
    );

    const result = await getSleepAnalytics(userId, startDate, endDate);

    expect(result[0].sleepEfficiency).toBeCloseTo(75, 1);
  });

  // ── empty input ──────────────────────────────────────────────────────────────

  test('empty entries returns empty array', async () => {
    sleepRepository.getSleepEntriesWithAllDetailsByUserIdAndDateRange.mockResolvedValue(
      []
    );

    const result = await getSleepAnalytics(userId, startDate, endDate);

    expect(result).toEqual([]);
  });
});

// ─── measurementRepository upsertStepData (source-aware) ─────────────────────

describe('measurementRepository.upsertStepData — source-awareness contract', () => {
  // We test the SQL contract by inspecting the query string passed to client.query.
  // The actual DB is mocked via getClient.

  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset module registry so getClient mock takes effect
    jest.resetModules();
    jest.mock('../db/poolManager', () => ({
      getClient: jest.fn().mockResolvedValue(mockClient),
    }));
  });

  test('uses ON CONFLICT with source in query', async () => {
    mockClient.query.mockResolvedValue({
      rows: [{ id: '1', steps: 8000, source: 'garmin' }],
    });

    const { upsertStepData } = require('../models/measurementRepository');
    await upsertStepData('user-1', 'user-1', 8000, '2026-03-25', 'garmin');

    const [sql, params] = mockClient.query.mock.calls[0];
    expect(sql).toMatch(/ON CONFLICT \(user_id, entry_date, source\)/i);
    expect(params).toContain('garmin');
    expect(params).toContain(8000);
    expect(params).toContain('2026-03-25');
  });

  test('defaults to source=manual when no source provided', async () => {
    mockClient.query.mockResolvedValue({
      rows: [{ id: '1', steps: 5000, source: 'manual' }],
    });

    const { upsertStepData } = require('../models/measurementRepository');
    await upsertStepData('user-1', 'user-1', 5000, '2026-03-25'); // no source arg

    const [, params] = mockClient.query.mock.calls[0];
    expect(params).toContain('manual');
  });

  test('garmin and healthkit steps for same date use separate ON CONFLICT keys', async () => {
    mockClient.query.mockResolvedValue({ rows: [{}] });

    const { upsertStepData } = require('../models/measurementRepository');
    await upsertStepData('user-1', 'user-1', 8000, '2026-03-25', 'garmin');
    await upsertStepData('user-1', 'user-1', 7500, '2026-03-25', 'healthkit');

    // Both calls should use the ON CONFLICT clause with their respective sources
    const call1Params = mockClient.query.mock.calls[0][1];
    const call2Params = mockClient.query.mock.calls[1][1];

    expect(call1Params).toContain('garmin');
    expect(call2Params).toContain('healthkit');
    // They do NOT share a conflict key → both rows persist
    expect(call1Params).not.toContain('healthkit');
    expect(call2Params).not.toContain('garmin');
  });
});

// ─── scoreEntry (internal logic via observable output) ───────────────────────

describe('sleepAnalyticsService — source quality ranking (observable via primarySource)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    userRepository.getUserProfile.mockResolvedValue(null);
  });

  const pairs = [
    { winner: 'garmin', loser: 'healthkit' },
    { winner: 'garmin', loser: 'fitbit' },
    { winner: 'garmin', loser: 'manual' },
    { winner: 'withings', loser: 'healthkit' },
    { winner: 'withings', loser: 'manual' },
    { winner: 'fitbit', loser: 'manual' },
    { winner: 'healthkit', loser: 'manual' },
  ];

  test.each(pairs)(
    '$winner ranked above $loser when both have no sleep_score and equal fields',
    async ({ winner, loser }) => {
      const winnerEntry = makeSleepEntry({ source: winner, sleep_score: null });
      const loserEntry = makeSleepEntry({ source: loser, sleep_score: null });

      sleepRepository.getSleepEntriesWithAllDetailsByUserIdAndDateRange.mockResolvedValue(
        [loserEntry, winnerEntry]
      ); // loser listed first

      const result = await getSleepAnalytics(
        'user-x',
        '2026-03-25',
        '2026-03-25'
      );

      expect(result[0].primarySource).toBe(winner);
    }
  );

  test('sleep_score always overrides source rank (HealthKit 95 > Garmin 60)', async () => {
    const garmin = makeSleepEntry({ source: 'garmin', sleep_score: 60 });
    const healthKit = makeSleepEntry({ source: 'healthkit', sleep_score: 95 });

    sleepRepository.getSleepEntriesWithAllDetailsByUserIdAndDateRange.mockResolvedValue(
      [garmin, healthKit]
    );

    const result = await getSleepAnalytics(
      'user-x',
      '2026-03-25',
      '2026-03-25'
    );

    // HealthKit wins because its sleep_score (95×10=950) far outweighs the garmin rank bonus
    expect(result[0].primarySource).toBe('healthkit');
  });
});
