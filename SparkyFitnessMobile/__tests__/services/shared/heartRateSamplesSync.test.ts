import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ServerConfig } from '../../../src/services/storage';
import {
  PASSIVE_HEART_RATE_SOURCE,
  downsampleHeartRate,
  heartRateReadingsFromRecords,
  heartRateAccountId,
  heartRateSyncPlan,
  heartRateWindows,
  syncAllDayHeartRate,
  syncAllDayGlucose,
  glucoseReadingsFromRecords,
} from '../../../src/services/shared/heartRateSamplesSync';
import { createTelemetryRunContext } from '../../../src/services/shared/telemetryBudget';
import { ApiError } from '../../../src/services/api/errors';
import { addLog } from '../../../src/services/LogService';

jest.mock('../../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../../src/services/api/healthSamplesApi', () => ({
  postHealthMetricSamples: jest.fn().mockResolvedValue({}),
}));
const { postHealthMetricSamples } =
  require('../../../src/services/api/healthSamplesApi') as {
    postHealthMetricSamples: jest.Mock;
  };

const DAY_MS = 86_400_000;

jest.mock('../../../src/services/storage', () => ({
  ...jest.requireActual('../../../src/services/storage'),
  getActiveServerConfig: jest.fn(),
}));
const { getActiveServerConfig } = jest.requireMock(
  '../../../src/services/storage'
) as { getActiveServerConfig: jest.Mock };

const ACCOUNT: ServerConfig = {
  id: 'server-1',
  url: 'https://sparky.example',
  apiKey: '',
  authType: 'session',
  sessionToken: 'token-a',
};
/** Another person signed in on the same server config. */
const OTHER_ACCOUNT: ServerConfig = { ...ACCOUNT, sessionToken: 'token-b' };

describe('heartRateReadingsFromRecords', () => {
  it('reads one HealthKit reading per record at its start time', () => {
    const out = heartRateReadingsFromRecords([
      {
        startTime: '2026-11-03T10:00:30.000Z',
        samples: [{ beatsPerMinute: 72 }],
      },
    ]);
    expect(out).toEqual([{ t: '2026-11-03T10:00:30.000Z', bpm: 72 }]);
  });

  it('reads many Health Connect samples with their own times', () => {
    const out = heartRateReadingsFromRecords([
      {
        startTime: '2026-11-03T10:00:00.000Z',
        samples: [
          { time: '2026-11-03T10:00:10.000Z', beatsPerMinute: 70 },
          { time: '2026-11-03T10:00:20.000Z', beatsPerMinute: 74 },
        ],
      },
    ]);
    expect(out).toEqual([
      { t: '2026-11-03T10:00:10.000Z', bpm: 70 },
      { t: '2026-11-03T10:00:20.000Z', bpm: 74 },
    ]);
  });

  it('drops impossible rates and unreadable times', () => {
    expect(
      heartRateReadingsFromRecords([
        {
          startTime: '2026-11-03T10:00:00.000Z',
          samples: [{ beatsPerMinute: 5 }],
        },
        { startTime: 'nope', samples: [{ beatsPerMinute: 70 }] },
        { samples: [{ beatsPerMinute: 70 }] },
        {
          startTime: '2026-11-03T10:00:00.000Z',
          samples: [{ beatsPerMinute: 400 }],
        },
      ])
    ).toEqual([]);
  });
});

describe('downsampleHeartRate', () => {
  it('averages each minute and orders by time', () => {
    const out = downsampleHeartRate([
      { t: '2026-11-03T10:01:10.000Z', bpm: 90 },
      { t: '2026-11-03T10:00:10.000Z', bpm: 60 },
      { t: '2026-11-03T10:00:50.000Z', bpm: 70 },
    ]);
    expect(out).toEqual([
      { t: '2026-11-03T10:00:00.000Z', bpm: 65 },
      { t: '2026-11-03T10:01:00.000Z', bpm: 90 },
    ]);
  });

  it('stamps a partial first minute at the window start', () => {
    const out = downsampleHeartRate(
      [
        { t: '2026-11-03T10:00:40.000Z', bpm: 60 },
        { t: '2026-11-03T10:01:10.000Z', bpm: 90 },
      ],
      new Date('2026-11-03T10:00:30.500Z')
    );
    expect(out).toEqual([
      { t: '2026-11-03T10:00:30.500Z', bpm: 60 },
      { t: '2026-11-03T10:01:00.000Z', bpm: 90 },
    ]);
  });
});

describe('heartRateWindows', () => {
  it('splits into weeks, oldest first, covering the whole span', () => {
    const start = new Date('2026-10-01T00:00:00.000Z');
    const end = new Date(start.getTime() + 15 * DAY_MS);
    const w = heartRateWindows(start, end);
    expect(w).toHaveLength(3);
    expect(w[0].start).toEqual(start);
    expect(w[0].end).toEqual(w[1].start);
    expect(w[2].end).toEqual(end);
  });

  it('never reaches back more than 30 days, which Health Connect always shows', () => {
    const end = new Date('2026-11-04T00:00:00.000Z');
    const w = heartRateWindows(new Date('2025-01-01T00:00:00.000Z'), end);
    expect(w[0].start.getTime()).toBe(end.getTime() - 30 * DAY_MS);
  });
});

describe('syncAllDayHeartRate', () => {
  const telemetry = createTelemetryRunContext();
  beforeEach(async () => {
    postHealthMetricSamples.mockClear();
    getActiveServerConfig.mockReset();
    getActiveServerConfig.mockResolvedValue(ACCOUNT);
    await AsyncStorage.clear();
  });

  it('uploads a merge window per week under the passive source, skipping empty weeks', async () => {
    const start = new Date('2026-10-20T00:00:00.000Z');
    const end = new Date('2026-11-03T00:00:00.000Z');
    const readRaw = jest
      .fn()
      .mockResolvedValueOnce({
        records: [
          {
            startTime: '2026-10-21T08:00:00.000Z',
            samples: [{ beatsPerMinute: 66 }],
          },
        ],
      })
      .mockResolvedValueOnce({ records: [] });
    const result = await syncAllDayHeartRate(
      { readRaw },
      ACCOUNT,
      start,
      end,
      telemetry,
      '[T]'
    );
    expect(result).toEqual({ samplesUploaded: 1, error: undefined });
    expect(postHealthMetricSamples).toHaveBeenCalledTimes(1);
    const body = postHealthMetricSamples.mock.calls[0][0];
    expect(body.metric).toBe('heart_rate');
    expect(body.source).toBe(PASSIVE_HEART_RATE_SOURCE);
    expect(body.mode).toBe('merge');
    expect(body.window.start).toBe(start.toISOString());
    expect(body.samples).toEqual([{ t: '2026-10-21T08:00:00.000Z', bpm: 66 }]);
  });

  it('reports a failed upload and keeps going with the next week', async () => {
    postHealthMetricSamples.mockRejectedValueOnce(new Error('boom'));
    const record = (startTime: string) => ({
      records: [{ startTime, samples: [{ beatsPerMinute: 66 }] }],
    });
    const readRaw = jest
      .fn()
      .mockResolvedValueOnce(record('2026-10-25T08:00:00.000Z'))
      .mockResolvedValueOnce(record('2026-10-30T08:00:00.000Z'));
    const result = await syncAllDayHeartRate(
      { readRaw },
      ACCOUNT,
      new Date('2026-10-20T00:00:00.000Z'),
      new Date('2026-11-03T00:00:00.000Z'),
      telemetry,
      '[T]'
    );
    expect(result.error).toBe('boom');
    expect(result.samplesUploaded).toBe(1);
    expect(postHealthMetricSamples).toHaveBeenCalledTimes(2);
  });

  it('reports a failed read without uploading it', async () => {
    const readRaw = jest
      .fn()
      .mockResolvedValue({ records: [], error: 'locked' });
    const result = await syncAllDayHeartRate(
      { readRaw },
      ACCOUNT,
      new Date('2026-11-01T00:00:00.000Z'),
      new Date('2026-11-03T00:00:00.000Z'),
      telemetry,
      '[T]'
    );
    expect(result.error).toBe('locked');
    expect(postHealthMetricSamples).not.toHaveBeenCalled();
  });

  it('does not upload a window whose read failed part-way', async () => {
    const readRaw = jest.fn().mockResolvedValue({
      records: [
        {
          startTime: '2026-11-01T08:00:00.000Z',
          samples: [{ beatsPerMinute: 66 }],
        },
      ],
      error: 'page 2 failed',
    });
    const result = await syncAllDayHeartRate(
      { readRaw },
      ACCOUNT,
      new Date('2026-11-01T00:00:00.000Z'),
      new Date('2026-11-03T00:00:00.000Z'),
      telemetry,
      '[T]'
    );
    expect(result).toEqual({ samplesUploaded: 0, error: 'page 2 failed' });
    expect(postHealthMetricSamples).not.toHaveBeenCalled();
  });

  it('keeps only samples inside the window and never stamps before its start', async () => {
    const start = new Date('2026-11-01T00:00:30.000Z');
    const end = new Date('2026-11-03T00:00:00.000Z');
    const readRaw = jest.fn().mockResolvedValue({
      records: [
        {
          startTime: '2026-10-31T23:59:00.000Z',
          samples: [
            { time: '2026-10-31T23:59:50.000Z', beatsPerMinute: 50 },
            { time: '2026-11-01T00:00:40.000Z', beatsPerMinute: 60 },
            { time: '2026-11-03T00:00:10.000Z', beatsPerMinute: 99 },
          ],
        },
      ],
    });
    await syncAllDayHeartRate(
      { readRaw },
      ACCOUNT,
      start,
      end,
      telemetry,
      '[T]'
    );
    const body = postHealthMetricSamples.mock.calls[0][0];
    expect(body.samples).toEqual([{ t: start.toISOString(), bpm: 60 }]);
  });

  it('gives up on a read that never settles', async () => {
    const readRaw = jest.fn(() => new Promise<never>(() => {}));
    const result = await syncAllDayHeartRate(
      { readRaw },
      ACCOUNT,
      new Date('2026-11-01T00:00:00.000Z'),
      new Date('2026-11-03T00:00:00.000Z'),
      telemetry,
      '[T]',
      10
    );
    expect(result.error).toMatch(/timed out/i);
    expect(postHealthMetricSamples).not.toHaveBeenCalled();
  });

  it('starts the next run two days before where a full run ended', async () => {
    const readRaw = jest.fn().mockResolvedValue({ records: [] });
    const end = new Date('2026-11-03T12:00:00.000Z');
    await syncAllDayHeartRate(
      { readRaw },
      ACCOUNT,
      new Date(end.getTime() - 30 * DAY_MS),
      end,
      telemetry,
      '[T]'
    );
    expect(readRaw).toHaveBeenCalledTimes(5);

    readRaw.mockClear();
    const later = new Date(end.getTime() + DAY_MS);
    await syncAllDayHeartRate(
      { readRaw },
      ACCOUNT,
      new Date(later.getTime() - 30 * DAY_MS),
      later,
      telemetry,
      '[T]'
    );
    expect(readRaw).toHaveBeenCalledTimes(1);
    expect(readRaw.mock.calls[0][1]).toEqual(
      new Date(end.getTime() - 2 * DAY_MS)
    );
  });

  it('reads the older days when a short run is followed by a longer range', async () => {
    const readRaw = jest.fn().mockResolvedValue({ records: [] });
    const end = new Date('2026-11-03T12:00:00.000Z');
    await syncAllDayHeartRate(
      { readRaw },
      ACCOUNT,
      new Date('2026-11-03T00:00:00.000Z'),
      end,
      telemetry,
      '[T]'
    );
    readRaw.mockClear();
    const thirtyDaysBack = new Date(end.getTime() - 30 * DAY_MS);
    await syncAllDayHeartRate(
      { readRaw },
      ACCOUNT,
      thirtyDaysBack,
      end,
      telemetry,
      '[T]'
    );
    expect(readRaw.mock.calls[0][1]).toEqual(thirtyDaysBack);
  });

  it('gives up on an upload that never settles and keeps the full range for next time', async () => {
    postHealthMetricSamples.mockImplementationOnce(
      () => new Promise<never>(() => {})
    );
    const start = new Date('2026-11-01T00:00:00.000Z');
    const end = new Date('2026-11-03T00:00:00.000Z');
    const readRaw = jest.fn().mockResolvedValue({
      records: [
        {
          startTime: '2026-11-02T08:00:00.000Z',
          samples: [{ beatsPerMinute: 66 }],
        },
      ],
    });
    const result = await syncAllDayHeartRate(
      { readRaw },
      ACCOUNT,
      start,
      end,
      telemetry,
      '[T]',
      10
    );
    expect(result.error).toMatch(/upload timed out/i);
    // The stalled request is cancelled, not just abandoned.
    const signal = postHealthMetricSamples.mock.calls[0][1] as AbortSignal;
    expect(signal.aborted).toBe(true);
    readRaw.mockClear();
    await syncAllDayHeartRate(
      { readRaw },
      ACCOUNT,
      start,
      end,
      telemetry,
      '[T]'
    );
    expect(readRaw.mock.calls[0][1]).toEqual(start);
  });

  it("sends every upload with the run's own account, not whichever is active", async () => {
    const readRaw = jest.fn().mockResolvedValue({
      records: [
        {
          startTime: '2026-11-02T08:00:00.000Z',
          samples: [{ beatsPerMinute: 66 }],
        },
      ],
    });
    await syncAllDayHeartRate(
      { readRaw },
      ACCOUNT,
      new Date('2026-11-01T00:00:00.000Z'),
      new Date('2026-11-03T00:00:00.000Z'),
      telemetry,
      '[T]'
    );
    expect(postHealthMetricSamples.mock.calls[0][2]).toBe(ACCOUNT);
  });

  it('stops before uploading once another account is active, even on the same server', async () => {
    const record = (startTime: string) => ({
      records: [{ startTime, samples: [{ beatsPerMinute: 66 }] }],
    });
    const readRaw = jest.fn().mockImplementationOnce(async () => {
      // Someone else signs in on the same server while the week is read.
      getActiveServerConfig.mockResolvedValue(OTHER_ACCOUNT);
      return record('2026-10-22T08:00:00.000Z');
    });
    const start = new Date('2026-10-20T00:00:00.000Z');
    const end = new Date('2026-11-03T00:00:00.000Z');
    const result = await syncAllDayHeartRate(
      { readRaw },
      ACCOUNT,
      start,
      end,
      telemetry,
      '[T]'
    );
    expect(result.error).toMatch(/account changed/i);
    expect(readRaw).toHaveBeenCalledTimes(1);
    expect(postHealthMetricSamples).not.toHaveBeenCalled();
  });

  it('stops when no account is active or it cannot be read', async () => {
    getActiveServerConfig.mockRejectedValue(new Error('storage'));
    const readRaw = jest.fn().mockResolvedValue({ records: [] });
    const result = await syncAllDayHeartRate(
      { readRaw },
      ACCOUNT,
      new Date('2026-11-01T00:00:00.000Z'),
      new Date('2026-11-03T00:00:00.000Z'),
      telemetry,
      '[T]'
    );
    expect(result.error).toMatch(/account changed/i);
    expect(readRaw).not.toHaveBeenCalled();
  });

  it("never reads another account's coverage, with no cleanup step needed", async () => {
    const readRaw = jest.fn().mockResolvedValue({ records: [] });
    const end = new Date('2026-11-03T12:00:00.000Z');
    const start = new Date(end.getTime() - 14 * DAY_MS);
    await syncAllDayHeartRate(
      { readRaw },
      ACCOUNT,
      start,
      end,
      telemetry,
      '[T]'
    );

    // The next person on the same server config reads their whole range.
    getActiveServerConfig.mockResolvedValue(OTHER_ACCOUNT);
    readRaw.mockClear();
    await syncAllDayHeartRate(
      { readRaw },
      OTHER_ACCOUNT,
      start,
      end,
      telemetry,
      '[T]'
    );
    expect(readRaw.mock.calls[0][1]).toEqual(start);
  });

  it("keeps one coverage record per server config, dropping its earlier accounts'", async () => {
    const readRaw = jest.fn().mockResolvedValue({ records: [] });
    const end = new Date('2026-11-03T12:00:00.000Z');
    const start = new Date(end.getTime() - 14 * DAY_MS);
    await syncAllDayHeartRate(
      { readRaw },
      ACCOUNT,
      start,
      end,
      telemetry,
      '[T]'
    );
    getActiveServerConfig.mockResolvedValue(OTHER_ACCOUNT);
    await syncAllDayHeartRate(
      { readRaw },
      OTHER_ACCOUNT,
      start,
      end,
      telemetry,
      '[T]'
    );
    const keys = (await AsyncStorage.getAllKeys()).filter((k) =>
      k.includes('heartRateSamplesThrough')
    );
    expect(keys).toEqual([
      `@SparkyFitness/heartRateSamplesThrough:${heartRateAccountId(OTHER_ACCOUNT)}`,
    ]);
  });

  it('sends a week read without error but now empty as an empty merge, which clears it', async () => {
    const readRaw = jest.fn().mockResolvedValue({ records: [] });
    const start = new Date('2026-11-01T00:00:00.000Z');
    const end = new Date('2026-11-03T00:00:00.000Z');
    const result = await syncAllDayHeartRate(
      { readRaw },
      ACCOUNT,
      start,
      end,
      telemetry,
      '[T]',
      60_000,
      true
    );
    expect(result).toEqual({ samplesUploaded: 0, error: undefined });
    expect(postHealthMetricSamples).toHaveBeenCalledTimes(1);
    const body = postHealthMetricSamples.mock.calls[0][0];
    expect(body.mode).toBe('merge');
    expect(body.window).toEqual({
      start: start.toISOString(),
      end: end.toISOString(),
    });
    expect(body.samples).toEqual([]);
  });

  it('never clears a week whose read failed', async () => {
    const readRaw = jest
      .fn()
      .mockResolvedValue({ records: [], error: 'no permission' });
    await syncAllDayHeartRate(
      { readRaw },
      ACCOUNT,
      new Date('2026-11-01T00:00:00.000Z'),
      new Date('2026-11-03T00:00:00.000Z'),
      telemetry,
      '[T]',
      60_000,
      true
    );
    expect(postHealthMetricSamples).not.toHaveBeenCalled();
  });

  it('skips an empty week where a denied read looks empty (the iOS default)', async () => {
    const readRaw = jest.fn().mockResolvedValue({ records: [] });
    await syncAllDayHeartRate(
      { readRaw },
      ACCOUNT,
      new Date('2026-11-01T00:00:00.000Z'),
      new Date('2026-11-03T00:00:00.000Z'),
      telemetry,
      '[T]'
    );
    expect(postHealthMetricSamples).not.toHaveBeenCalled();
  });

  it('treats an older server refusing the clear as no failure, so coverage still moves on', async () => {
    postHealthMetricSamples.mockRejectedValueOnce(
      new ApiError('Server error: 400', 400, '{}')
    );
    const readRaw = jest.fn().mockResolvedValue({ records: [] });
    const end = new Date('2026-11-03T12:00:00.000Z');
    const start = new Date(end.getTime() - 2 * DAY_MS);
    const result = await syncAllDayHeartRate(
      { readRaw },
      ACCOUNT,
      start,
      end,
      telemetry,
      '[T]',
      60_000,
      true
    );
    expect(result.error).toBeUndefined();
    const stored = await AsyncStorage.getItem(
      `@SparkyFitness/heartRateSamplesThrough:${heartRateAccountId(ACCOUNT)}`
    );
    expect(stored).not.toBeNull();
  });

  it('logs only the status of a failed upload, never the response body', async () => {
    postHealthMetricSamples.mockRejectedValueOnce(
      new ApiError('Server error: 400 - {"t":"…","bpm":66}', 400, '{"bpm":66}')
    );
    const readRaw = jest.fn().mockResolvedValue({
      records: [
        {
          startTime: '2026-11-02T08:00:00.000Z',
          samples: [{ beatsPerMinute: 66 }],
        },
      ],
    });
    const result = await syncAllDayHeartRate(
      { readRaw },
      ACCOUNT,
      new Date('2026-11-01T00:00:00.000Z'),
      new Date('2026-11-03T00:00:00.000Z'),
      telemetry,
      '[T]'
    );
    expect(result.error).toBe('HTTP 400');
    const logged = (addLog as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(logged.some((m) => m.includes('bpm'))).toBe(false);
  });

  it('keeps reading the whole range while a run had an error', async () => {
    const end = new Date('2026-11-03T12:00:00.000Z');
    const start = new Date(end.getTime() - 14 * DAY_MS);
    const failing = jest
      .fn()
      .mockResolvedValue({ records: [], error: 'locked' });
    await syncAllDayHeartRate(
      { readRaw: failing },
      ACCOUNT,
      start,
      end,
      telemetry,
      '[T]'
    );

    const readRaw = jest.fn().mockResolvedValue({ records: [] });
    await syncAllDayHeartRate(
      { readRaw },
      ACCOUNT,
      start,
      end,
      telemetry,
      '[T]'
    );
    expect(readRaw.mock.calls[0][1]).toEqual(start);
  });
});

describe('heartRateSyncPlan', () => {
  const start = new Date('2026-10-05T00:00:00.000Z');
  const end = new Date('2026-11-01T00:00:00.000Z');
  const ms = (d: Date) => d.getTime();

  it('reads the whole range with no coverage or one that ends in the future', () => {
    for (const coverage of [null, { from: ms(start), through: ms(end) + 1 }]) {
      expect(heartRateSyncPlan(start, end, coverage)).toEqual({
        start,
        coverage: { from: ms(start), through: ms(end) },
      });
    }
  });

  it('reads the whole range when the coverage starts after it (a short run, then a longer range)', () => {
    const plan = heartRateSyncPlan(start, end, {
      from: ms(end) - DAY_MS,
      through: ms(end) - DAY_MS / 2,
    });
    expect(plan.start).toEqual(start);
    expect(plan.coverage).toEqual({ from: ms(start), through: ms(end) });
  });

  it('starts two days before covered data ends and keeps the old start', () => {
    const covered = { from: ms(start) - DAY_MS, through: ms(end) - DAY_MS };
    const plan = heartRateSyncPlan(start, end, covered);
    expect(plan.start).toEqual(new Date(ms(end) - 3 * DAY_MS));
    expect(plan.coverage).toEqual({ from: covered.from, through: ms(end) });
  });

  it('limits the range to 30 days before the end', () => {
    const plan = heartRateSyncPlan(
      new Date('2025-01-01T00:00:00.000Z'),
      end,
      null
    );
    expect(plan.start).toEqual(new Date(ms(end) - 30 * DAY_MS));
  });
});

describe('heartRateAccountId', () => {
  it('differs between people on one server and is stable for one', () => {
    expect(heartRateAccountId(ACCOUNT)).toBe(
      heartRateAccountId({ ...ACCOUNT })
    );
    expect(heartRateAccountId(ACCOUNT)).not.toBe(
      heartRateAccountId(OTHER_ACCOUNT)
    );
    expect(heartRateAccountId(ACCOUNT).startsWith('server-1:')).toBe(true);
    expect(heartRateAccountId(ACCOUNT)).not.toContain('token-a');
  });
});

describe('glucose readings', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    getActiveServerConfig.mockResolvedValue(ACCOUNT);
    postHealthMetricSamples.mockResolvedValue({});
  });

  it('does not clear existing glucose readings after an empty iOS read', async () => {
    const reader = { readRaw: jest.fn().mockResolvedValue({ records: [] }) };
    await syncAllDayGlucose(
      reader,
      ACCOUNT,
      new Date('2026-11-03T00:00:00Z'),
      new Date('2026-11-04T00:00:00Z'),
      createTelemetryRunContext(),
      '[test]'
    );
    expect(postHealthMetricSamples).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('retries older glucose history when access becomes available after empty reads', async () => {
    const stored = new Map<string, string>();
    const getItem = jest.mocked(AsyncStorage.getItem);
    const setItem = jest.mocked(AsyncStorage.setItem);
    const originalGet = getItem.getMockImplementation();
    const originalSet = setItem.getMockImplementation();
    getItem.mockImplementation(async (key) => stored.get(key) ?? null);
    setItem.mockImplementation(async (key, value) => {
      stored.set(key, value);
    });
    const start = new Date('2026-10-05T00:00:00Z');
    const end = new Date('2026-11-04T00:00:00Z');
    const historical = {
      time: '2026-10-15T10:00:00Z',
      level: { inMillimolesPerLiter: 5 },
    };
    const reader = { readRaw: jest.fn().mockResolvedValue({ records: [] }) };
    try {
      await syncAllDayGlucose(
        reader,
        ACCOUNT,
        start,
        end,
        createTelemetryRunContext(),
        '[test]'
      );
      reader.readRaw.mockClear();
      reader.readRaw.mockImplementation(
        async (_type: string, from: Date, through: Date) => ({
          records:
            Date.parse(historical.time) >= from.getTime() &&
            Date.parse(historical.time) <= through.getTime()
              ? [historical]
              : [],
        })
      );
      await syncAllDayGlucose(
        reader,
        ACCOUNT,
        start,
        end,
        createTelemetryRunContext(),
        '[test]'
      );
      expect(reader.readRaw.mock.calls[0]?.[1]).toEqual(start);
      expect(postHealthMetricSamples).toHaveBeenCalledWith(
        expect.objectContaining({
          metric: 'blood_glucose',
          samples: [{ t: '2026-10-15T10:00:00.000Z', mmol_l: 5 }],
        }),
        expect.anything(),
        ACCOUNT
      );
    } finally {
      if (originalGet) getItem.mockImplementation(originalGet);
      if (originalSet) setItem.mockImplementation(originalSet);
    }
  });

  it('never uploads a partially failed glucose read or advances its cursor', async () => {
    const reader = {
      readRaw: jest.fn().mockResolvedValue({
        records: [
          {
            time: '2026-11-03T10:00:00Z',
            level: { inMillimolesPerLiter: 5 },
          },
        ],
        error: 'read failed',
      }),
    };
    const result = await syncAllDayGlucose(
      reader,
      ACCOUNT,
      new Date('2026-11-03T00:00:00Z'),
      new Date('2026-11-04T00:00:00Z'),
      createTelemetryRunContext(),
      '[test]'
    );
    expect(result.error).toBe('read failed');
    expect(postHealthMetricSamples).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('converts mg/dL, retains timestamps and source, sorts, and drops malformed readings', () => {
    expect(
      glucoseReadingsFromRecords([
        { time: '2026-11-03T10:05:00Z', level: { inMillimolesPerLiter: 6 } },
        {
          time: '2026-11-03T10:00:00Z',
          level: { inMilligramsPerDeciliter: 90.09 },
          sourceBundleId: 'com.dexcom.example',
        },
        { time: 'bad', level: { inMillimolesPerLiter: 5 } },
        { time: '2026-11-03T10:00:00Z', level: { inMillimolesPerLiter: NaN } },
        null,
      ])
    ).toEqual([
      {
        t: '2026-11-03T10:00:00.000Z',
        mmol_l: 5,
        source_bundle_id: 'com.dexcom.example',
      },
      { t: '2026-11-03T10:05:00.000Z', mmol_l: 6 },
    ]);
  });

  it('uploads glucose without downsampling, with a separate cursor from heart rate', async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
    getActiveServerConfig.mockResolvedValue(ACCOUNT);
    postHealthMetricSamples.mockClear();
    const reader = {
      readRaw: jest.fn().mockResolvedValue({
        records: [
          { time: '2026-11-03T10:00:01Z', level: { inMillimolesPerLiter: 5 } },
          { time: '2026-11-03T10:00:02Z', level: { inMillimolesPerLiter: 6 } },
        ],
      }),
    };
    const result = await syncAllDayGlucose(
      reader,
      ACCOUNT,
      new Date('2026-11-03T00:00:00Z'),
      new Date('2026-11-04T00:00:00Z'),
      createTelemetryRunContext(),
      '[test]'
    );
    expect(result.samplesUploaded).toBe(2);
    expect(reader.readRaw.mock.calls[0]?.[0]).toBe('BloodGlucose');
    expect(postHealthMetricSamples).toHaveBeenCalledWith(
      expect.objectContaining({
        metric: 'blood_glucose',
        samples: [
          { t: '2026-11-03T10:00:01.000Z', mmol_l: 5 },
          { t: '2026-11-03T10:00:02.000Z', mmol_l: 6 },
        ],
      }),
      expect.anything(),
      ACCOUNT
    );
    expect(AsyncStorage.getItem).toHaveBeenCalledWith(
      expect.stringContaining('heartRateSamplesThrough:blood_glucose:')
    );
  });

  it('retains Health Connect glucose origin and mmol/L without a second conversion', () => {
    expect(
      glucoseReadingsFromRecords([
        {
          time: '2026-11-03T10:00:00Z',
          level: { inMillimolesPerLiter: 5.5 },
          metadata: { dataOrigin: 'com.dexcom.healthconnect' },
        },
      ])
    ).toEqual([
      {
        t: '2026-11-03T10:00:00.000Z',
        mmol_l: 5.5,
        source_bundle_id: 'com.dexcom.healthconnect',
      },
    ]);
  });
});
