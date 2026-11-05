import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PASSIVE_HEART_RATE_SOURCE,
  downsampleHeartRate,
  heartRateReadingsFromRecords,
  heartRateSyncStart,
  heartRateWindows,
  syncAllDayHeartRate,
} from '../../../src/services/shared/heartRateSamplesSync';
import { createTelemetryRunContext } from '../../../src/services/shared/telemetryBudget';

jest.mock('../../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../../src/services/api/healthSamplesApi', () => ({
  postHealthMetricSamples: jest.fn().mockResolvedValue({}),
}));
const { postHealthMetricSamples } =
  require('../../../src/services/api/healthSamplesApi') as {
    postHealthMetricSamples: jest.Mock;
  };

const DAY_MS = 86_400_000;

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

  it('never reaches back more than 31 days', () => {
    const end = new Date('2026-11-04T00:00:00.000Z');
    const w = heartRateWindows(new Date('2025-01-01T00:00:00.000Z'), end);
    expect(w[0].start.getTime()).toBe(end.getTime() - 31 * DAY_MS);
  });
});

describe('syncAllDayHeartRate', () => {
  const telemetry = createTelemetryRunContext();
  beforeEach(async () => {
    postHealthMetricSamples.mockClear();
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
    await syncAllDayHeartRate({ readRaw }, start, end, telemetry, '[T]');
    const body = postHealthMetricSamples.mock.calls[0][0];
    expect(body.samples).toEqual([{ t: start.toISOString(), bpm: 60 }]);
  });

  it('gives up on a read that never settles', async () => {
    const readRaw = jest.fn(() => new Promise<never>(() => {}));
    const result = await syncAllDayHeartRate(
      { readRaw },
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

  it('keeps reading the whole range while a run had an error', async () => {
    const end = new Date('2026-11-03T12:00:00.000Z');
    const start = new Date(end.getTime() - 14 * DAY_MS);
    const failing = jest
      .fn()
      .mockResolvedValue({ records: [], error: 'locked' });
    await syncAllDayHeartRate(
      { readRaw: failing },
      start,
      end,
      telemetry,
      '[T]'
    );

    const readRaw = jest.fn().mockResolvedValue({ records: [] });
    await syncAllDayHeartRate({ readRaw }, start, end, telemetry, '[T]');
    expect(readRaw.mock.calls[0][1]).toEqual(start);
  });
});

describe('heartRateSyncStart', () => {
  const start = new Date('2026-10-01T00:00:00.000Z');
  const end = new Date('2026-11-01T00:00:00.000Z');

  it('uses the range start with no cursor or a cursor in the future', () => {
    expect(heartRateSyncStart(start, end, null)).toEqual(start);
    expect(heartRateSyncStart(start, end, end.getTime() + 1)).toEqual(start);
  });

  it('never starts before the range start', () => {
    expect(heartRateSyncStart(start, end, start.getTime())).toEqual(start);
  });
});
