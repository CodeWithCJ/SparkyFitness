import { vi, beforeEach, describe, it, expect } from 'vitest';

// Andrew (apedley, PR #1990 review) asked for coverage over the HRV and
// respiration branches of processGarminHealthAndWellnessData: both metrics
// used to silently produce zero rows because the parser branches didn't
// match what SparkyFitnessGarmin/routes.py actually sends (a per-day object
// with an intraday reading array plus flat summary keys, not the
// `hrvSummary`/`respirationValuesArray`-only shapes the old code expected).

const upsertHealthMetricSamplesWithClient = vi
  .fn()
  .mockResolvedValue(undefined);
const getHealthMetricSampleRowForUpdateWithClient = vi
  .fn()
  .mockResolvedValue(null);
const bulkUpsertVitals = vi.fn().mockResolvedValue([]);
vi.mock('../models/genericHealthRepository.js', () => ({
  upsertHealthMetricSamplesWithClient: (...args: unknown[]) =>
    upsertHealthMetricSamplesWithClient(...args),
  getHealthMetricSampleRowForUpdateWithClient: (...args: unknown[]) =>
    getHealthMetricSampleRowForUpdateWithClient(...args),
  bulkUpsertVitals: (...args: unknown[]) => bulkUpsertVitals(...args),
}));

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn().mockResolvedValue({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  }),
}));

vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));

vi.mock('../models/moodRepository.js', () => ({
  default: { createOrUpdateMoodEntry: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('../models/sleepRepository.js', () => ({ default: {} }));
vi.mock('../models/food.js', () => ({ default: {} }));
vi.mock('../models/foodEntry.js', () => ({ default: {} }));
vi.mock('../models/mealType.js', () => ({ default: {} }));
vi.mock('../services/measurementService.js', () => ({
  default: {
    getOrCreateCustomCategory: vi.fn(),
    upsertCustomMeasurementEntry: vi.fn(),
  },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import { processGarminHealthAndWellnessData } from '../services/garmin/garminHealthProcessor.js';

interface StoredSample {
  t: string;
  ex?: string;
  sl?: string;
  [key: string]: unknown;
}

function samplesForMetric(metric: string): StoredSample[] {
  const call = upsertHealthMetricSamplesWithClient.mock.calls.find(
    (c) => (c[2] as { metric?: string })?.metric === metric
  );
  return (call?.[2] as { samples: StoredSample[] } | undefined)?.samples ?? [];
}

beforeEach(() => {
  upsertHealthMetricSamplesWithClient.mockClear();
  getHealthMetricSampleRowForUpdateWithClient.mockClear();
  bulkUpsertVitals.mockClear();
});

describe('processGarminHealthAndWellnessData - HRV', () => {
  it('writes both the per-reading series and the nightly summary from the real routes.py shape', async () => {
    await processGarminHealthAndWellnessData(
      'user-1',
      'user-1',
      {
        hrv: [
          {
            date: '2026-08-01',
            hrvValue: [
              { time: '2026-08-01T02:00:00Z', data: 45 },
              { time: '2026-08-01T04:00:00Z', data: 50 },
            ],
            last_night_avg: 47,
            weekly_avg: 48,
            status: 'balanced',
          },
        ],
      },
      '2026-08-01',
      '2026-08-01'
    );

    const samples = samplesForMetric('hrv');
    // 2 intraday readings + 1 nightly summary row.
    expect(samples).toHaveLength(3);
    expect(samples).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rmssd_ms: 45 }),
        expect.objectContaining({ rmssd_ms: 50 }),
        expect.objectContaining({
          rmssd_ms: 47,
          status: 'balanced',
        }),
      ])
    );
    // weekly_avg is a weekly RMSSD average, not SDNN — it must not be
    // smuggled into sdnn_ms.
    expect(samples.every((s) => s.sdnn_ms === undefined)).toBe(true);
  });

  it('still handles the legacy hrvSummary shape', async () => {
    await processGarminHealthAndWellnessData(
      'user-1',
      'user-1',
      {
        hrv: [
          {
            date: '2026-08-01',
            hrvSummary: { lastNightAvg: 40, weeklyAvg: 42, status: 'low' },
          },
        ],
      },
      '2026-08-01',
      '2026-08-01'
    );

    const samples = samplesForMetric('hrv');
    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({
      rmssd_ms: 40,
      status: 'low',
    });
    expect(samples[0].sdnn_ms).toBeUndefined();
  });

  it('still handles the legacy flat timestamp/rmssd shape', async () => {
    await processGarminHealthAndWellnessData(
      'user-1',
      'user-1',
      {
        hrv: [
          {
            date: '2026-08-01',
            timestamp: '2026-08-01T03:00:00Z',
            rmssd: 55,
            sdnn: 60,
          },
        ],
      },
      '2026-08-01',
      '2026-08-01'
    );

    const samples = samplesForMetric('hrv');
    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({ rmssd_ms: 55, sdnn_ms: 60 });
  });
});

describe('processGarminHealthAndWellnessData - respiration', () => {
  it('writes three distinct samples from the real routes.py daily-average shape', async () => {
    await processGarminHealthAndWellnessData(
      'user-1',
      'user-1',
      {
        respiration: [
          {
            date: '2026-08-01',
            sleep_respiration_avg: 14,
            awake_respiration_avg: 16,
            average_respiration_rate: 15,
          },
        ],
      },
      '2026-08-01',
      '2026-08-01'
    );

    const samples = samplesForMetric('respiration');
    expect(samples).toHaveLength(3);
    expect(samples).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ brpm: 14, context: 'sleep' }),
        expect.objectContaining({ brpm: 16, context: 'awake' }),
        expect.objectContaining({ brpm: 15, context: 'daily_average' }),
      ])
    );
  });

  it('writes no daily_average sample when the true daily average is missing', async () => {
    // routes.py sends average_respiration_rate: null when Garmin has no
    // avgRespiration — it must not be backfilled from the sleep value, which
    // would store the same reading twice under two contexts.
    await processGarminHealthAndWellnessData(
      'user-1',
      'user-1',
      {
        respiration: [
          {
            date: '2026-08-01',
            sleep_respiration_avg: 14,
            awake_respiration_avg: 16,
            average_respiration_rate: null,
          },
        ],
      },
      '2026-08-01',
      '2026-08-01'
    );

    const samples = samplesForMetric('respiration');
    expect(samples).toHaveLength(2);
    expect(samples.map((s) => s.context).sort()).toEqual(['awake', 'sleep']);
  });

  it('still handles the intraday respirationValuesArray shape', async () => {
    await processGarminHealthAndWellnessData(
      'user-1',
      'user-1',
      {
        respiration: [
          {
            date: '2026-08-01',
            respirationValuesArray: [
              [1785556800000, 15],
              [1785557100000, 16],
            ],
          },
        ],
      },
      '2026-08-01',
      '2026-08-01'
    );

    const samples = samplesForMetric('respiration');
    expect(samples).toHaveLength(2);
    expect(samples.map((s) => s.brpm).sort()).toEqual([15, 16]);
  });

  it('buckets a late-evening reading onto the user calendar day, not the UTC day', async () => {
    const { loadUserTimezone } = await import('../utils/timezoneLoader.js');
    (loadUserTimezone as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      'Pacific/Auckland' // UTC+12/+13 - a late UTC evening reading is already "tomorrow" locally
    );

    await processGarminHealthAndWellnessData(
      'user-1',
      'user-1',
      {
        respiration: [
          {
            // No `date` field: entry_date must fall back to
            // instantToDay(timestamp, userTz) below.
            respirationValuesArray: [['2026-08-01T23:30:00Z', 14]],
          },
        ],
      },
      '2026-08-01',
      '2026-08-02'
    );

    const call = upsertHealthMetricSamplesWithClient.mock.calls.find(
      (c) => (c[2] as { metric?: string })?.metric === 'respiration'
    );
    expect((call?.[2] as { entry_date: string }).entry_date).toBe('2026-08-02');
  });
});

describe('processGarminHealthAndWellnessData - blood pressure', () => {
  interface VitalsRow {
    timestamp: Date;
    systolic_mmhg: number | null;
    diastolic_mmhg: number | null;
  }
  const storedVitals = (): VitalsRow[] =>
    (bulkUpsertVitals.mock.calls[0]?.[2] as VitalsRow[]) ?? [];

  it('pins a naive measurementTimestampGMT string to UTC', async () => {
    // Garmin sends GMT wall-clock strings with no zone marker; a bare
    // `new Date(...)` would resolve this against the server's own zone.
    // (On a UTC host both parses agree, so this only bites on TZ-set hosts —
    // same caveat as the lap-boundary tests sharing toUtcInstant.)
    await processGarminHealthAndWellnessData(
      'user-1',
      'user-1',
      {
        blood_pressure: [
          {
            date: '2026-08-01',
            value: '120/80, 62 bpm',
            timestamp: '2026-08-01 14:30:00.0',
          },
        ],
      },
      '2026-08-01',
      '2026-08-01'
    );

    const rows = storedVitals();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ systolic_mmhg: 120, diastolic_mmhg: 80 });
    expect(rows[0].timestamp.toISOString()).toBe('2026-08-01T14:30:00.000Z');
  });

  it('keeps same-day readings distinct and falls back to noon without a timestamp', async () => {
    await processGarminHealthAndWellnessData(
      'user-1',
      'user-1',
      {
        blood_pressure: [
          {
            date: '2026-08-01',
            value: '120/80',
            timestamp: '2026-08-01 08:05:00.0',
          },
          {
            date: '2026-08-01',
            value: '135/88',
            timestamp: '2026-08-01 20:40:00.0',
          },
          { date: '2026-08-02', value: '118/79' },
        ],
      },
      '2026-08-01',
      '2026-08-02'
    );

    const instants = storedVitals().map((r) => r.timestamp.toISOString());
    expect(instants).toHaveLength(3);
    expect(new Set(instants).size).toBe(3);
    expect(instants).toContain('2026-08-02T12:00:00.000Z');
  });
});
