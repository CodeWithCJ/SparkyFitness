import { vi, beforeEach, describe, it, expect } from 'vitest';

// The real sample writer and its validation run here; only the database is
// replaced by an in-memory copy of the one row per (user, metric, day,
// provider), so what ends up stored can be checked, not just what is passed in.
const store = vi.hoisted(
  () => new Map<string, { samples: Array<Record<string, unknown>> }>()
);
const rowKey = (u: string, m: string, d: string, p: string) =>
  `${u}|${m}|${d}|${p}`;

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(async () => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  })),
}));
vi.mock('../models/genericHealthRepository.js', () => ({
  upsertDailyHealthMetrics: vi.fn().mockResolvedValue({}),
  acquireHealthMetricSampleLockWithClient: vi.fn().mockResolvedValue(undefined),
  getHealthMetricSampleRowForUpdateWithClient: vi.fn(
    async (
      _client: unknown,
      userId: string,
      metric: string,
      day: string,
      provider: string
    ) => store.get(rowKey(userId, metric, day, provider)) ?? null
  ),
  upsertHealthMetricSamplesWithClient: vi.fn(
    async (
      _client: unknown,
      userId: string,
      row: {
        metric: string;
        entry_date: string;
        source_provider: string;
        samples: Array<Record<string, unknown>>;
      }
    ) => {
      store.set(
        rowKey(userId, row.metric, row.entry_date, row.source_provider),
        row
      );
      return row;
    }
  ),
}));
vi.mock('../models/exerciseEntry.js', () => ({ default: {} }));
vi.mock('../models/exercise.js', () => ({ default: {} }));
vi.mock('../models/sleepRepository.js', () => ({ default: {} }));
vi.mock('../services/measurementService.js', () => ({
  default: { processHealthData: vi.fn().mockResolvedValue({}) },
}));
vi.mock('../integrations/zeppbridge/zeppBridgeWorkoutDetail.js', () => ({
  needsWorkoutDetail: vi.fn().mockResolvedValue(false),
  applySummaryLaps: vi.fn().mockResolvedValue(false),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import { processZeppBridgeRecords } from '../integrations/zeppbridge/zeppBridgeDataProcessor.js';
import {
  addRecords,
  emptyRecordSet,
} from '../integrations/zeppbridge/zeppBridgeTypes.js';

const UID = 'user-1';
const TZ = 'America/New_York';
// 12:00 on 2 Nov in New York is 17:00 UTC.
const DAY = '2026-11-02';

function run(...records: unknown[]) {
  const set = emptyRecordSet();
  addRecords(set, records);
  return processZeppBridgeRecords(UID, UID, set, TZ);
}

const daily = {
  record_type: 'daily_metric',
  date: DAY,
  metric: 'hrv_rmssd',
  value: 48,
};
const reading = (iso: string, value: number) => ({
  record_type: 'metric_sample',
  metric: 'hrv_rmssd',
  timestamp: iso,
  value,
});

/** The stored HRV samples of the day, as [instant, rmssd_ms] in time order. */
function stored(): Array<[string, number]> {
  const row = store.get(rowKey(UID, 'hrv', DAY, 'zeppbridge'));
  return (row?.samples ?? []).map((s) => [String(s.t), s.rmssd_ms as number]);
}

describe('ZeppBridge samples as stored by the real writer', () => {
  beforeEach(() => {
    store.clear();
  });

  it('keeps every reading, even one on the whole minute of noon, when a later span writes the daily value', async () => {
    await run(
      reading('2026-11-02T16:00:00+00:00', 51),
      reading('2026-11-02T17:00:00+00:00', 52),
      reading('2026-11-02T18:00:00+00:00', 53)
    );
    await run(daily);

    expect(stored()).toEqual([
      ['2026-11-02T16:00:00.000Z', 51],
      ['2026-11-02T17:00:00.000Z', 52],
      // Half a second after noon: never the same instant as a reading.
      ['2026-11-02T17:00:00.500Z', 48],
      ['2026-11-02T18:00:00.000Z', 53],
    ]);
  });

  it('lets later readings that cover the noon anchor take the place of the daily value', async () => {
    await run(daily);
    expect(stored()).toEqual([['2026-11-02T17:00:00.500Z', 48]]);

    await run(
      reading('2026-11-02T16:00:00+00:00', 51),
      reading('2026-11-02T18:00:00+00:00', 53)
    );
    expect(stored()).toEqual([
      ['2026-11-02T16:00:00.000Z', 51],
      ['2026-11-02T18:00:00.000Z', 53],
    ]);
  });

  it('keeps the daily value when the readings of a later span lie outside it', async () => {
    await run(daily);
    await run(reading('2026-11-02T20:00:00+00:00', 53));
    expect(stored()).toEqual([
      ['2026-11-02T17:00:00.500Z', 48],
      ['2026-11-02T20:00:00.000Z', 53],
    ]);
  });

  it('writes only the readings when the same call carries both forms', async () => {
    await run(
      daily,
      reading('2026-11-02T16:00:00+00:00', 51),
      reading('2026-11-02T18:00:00+00:00', 53)
    );
    expect(stored()).toEqual([
      ['2026-11-02T16:00:00.000Z', 51],
      ['2026-11-02T18:00:00.000Z', 53],
    ]);
  });

  it('keeps the readings an adjacent span stored for the same day', async () => {
    await run(reading('2026-11-02T16:00:00+00:00', 51));
    await run(reading('2026-11-02T18:00:00+00:00', 53));
    expect(stored()).toEqual([
      ['2026-11-02T16:00:00.000Z', 51],
      ['2026-11-02T18:00:00.000Z', 53],
    ]);
  });

  it('replaces a reading of its own window when it is sent again, so a re-sync does not duplicate', async () => {
    await run(reading('2026-11-02T16:00:00+00:00', 51));
    await run(reading('2026-11-02T16:00:00+00:00', 55));
    expect(stored()).toEqual([['2026-11-02T16:00:00.000Z', 55]]);
  });
});
