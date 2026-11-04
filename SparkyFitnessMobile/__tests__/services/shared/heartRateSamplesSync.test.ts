import {
  PASSIVE_HEART_RATE_SOURCE,
  downsampleHeartRate,
  heartRateReadingsFromRecords,
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
    expect(out.map((r) => r.bpm)).toEqual([70, 74]);
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
  beforeEach(() => postHealthMetricSamples.mockClear());

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
    const readRaw = jest.fn().mockResolvedValue({
      records: [
        {
          startTime: '2026-10-25T08:00:00.000Z',
          samples: [{ beatsPerMinute: 66 }],
        },
      ],
    });
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
});
