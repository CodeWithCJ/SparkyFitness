import { vi, beforeEach, describe, it, expect } from 'vitest';

// Andrew (apedley, PR #1990 review) asked for coverage over the HRV and
// respiration branches of processGarminHealthAndWellnessData: both metrics
// used to silently produce zero rows because the parser branches didn't
// match what SparkyFitnessGarmin/routes.py actually sends (a per-day object
// with an intraday reading array plus flat summary keys, not the
// `hrvSummary`/`respirationValuesArray`-only shapes the old code expected).

const upsertHealthMetricSamples = vi.fn().mockResolvedValue(undefined);
vi.mock('../models/genericHealthRepository.js', () => ({
  upsertHealthMetricSamples: (...args: unknown[]) =>
    upsertHealthMetricSamples(...args),
  bulkUpsertVitals: vi.fn().mockResolvedValue([]),
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
  const call = upsertHealthMetricSamples.mock.calls.find(
    (c) => (c[2] as { metric?: string })?.metric === metric
  );
  return (call?.[2] as { samples: StoredSample[] } | undefined)?.samples ?? [];
}

beforeEach(() => {
  upsertHealthMetricSamples.mockClear();
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
          sdnn_ms: 48,
          status: 'balanced',
        }),
      ])
    );
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
      sdnn_ms: 42,
      status: 'low',
    });
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

    const call = upsertHealthMetricSamples.mock.calls.find(
      (c) => (c[2] as { metric?: string })?.metric === 'respiration'
    );
    expect((call?.[2] as { entry_date: string }).entry_date).toBe('2026-08-02');
  });
});
