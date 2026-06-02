import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getChronotype,
  getEnergyCurve,
} from '../services/sleepScienceService.js';
import sleepScienceRepository from '../models/sleepScienceRepository.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';

vi.mock('../models/sleepScienceRepository');
vi.mock('../utils/timezoneLoader', () => ({
  loadUserTimezone: vi.fn(),
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

// Regression test for issue #1410: sleep-start clock times were averaged with a
// plain linear median, so bedtimes that straddle midnight (23:57, 00:14, ...)
// produced a nonsense "Avg Sleep" near midday (the report showed 14:30) and a
// wrong melatonin window. They should be treated as points on a 24h circle.

type ChronotypeResult = {
  success: boolean;
  averageSleepTime: string | null;
  averageWakeTime: string;
  melatoninWindowStart: string | null;
  melatoninWindowEnd: string | null;
};

type EnergyCurveResult = {
  success: boolean;
  melatoninWindow: { start: number; end: number };
};

// entry_date is irrelevant to the chronotype maths (only the wall-clock hour is
// read from the timestamp), so building the instants in UTC is enough.
const toTs = (iso: string) => new Date(iso).getTime();

const buildHistory = (
  rows: { date: string; bedtime: string; wake: string }[]
) =>
  rows.map((r) => ({
    date: r.date,
    sleepStartTimestampGMT: toTs(r.bedtime),
    sleepEndTimestampGMT: toTs(r.wake),
  }));

// The exact data the reporter attached.
const MIDNIGHT_HISTORY = buildHistory([
  {
    date: '2026-06-01',
    bedtime: '2026-06-01T00:14:00Z',
    wake: '2026-06-01T06:31:00Z',
  },
  {
    date: '2026-05-31',
    bedtime: '2026-05-31T23:29:00Z',
    wake: '2026-06-01T06:40:00Z',
  },
  {
    date: '2026-05-30',
    bedtime: '2026-05-30T23:57:00Z',
    wake: '2026-05-31T07:39:00Z',
  },
  {
    date: '2026-05-29',
    bedtime: '2026-05-29T23:01:00Z',
    wake: '2026-05-30T09:32:00Z',
  },
  {
    date: '2026-05-28',
    bedtime: '2026-05-28T23:31:00Z',
    wake: '2026-05-29T06:32:00Z',
  },
  {
    date: '2026-05-27',
    bedtime: '2026-05-27T00:07:00Z',
    wake: '2026-05-27T07:35:00Z',
  },
  {
    date: '2026-05-26',
    bedtime: '2026-05-26T22:57:00Z',
    wake: '2026-05-26T07:41:00Z',
  },
  {
    date: '2026-05-25',
    bedtime: '2026-05-25T01:07:00Z',
    wake: '2026-05-25T05:24:00Z',
  },
  {
    date: '2026-05-24',
    bedtime: '2026-05-24T00:56:00Z',
    wake: '2026-05-24T08:06:00Z',
  },
  {
    date: '2026-05-23',
    bedtime: '2026-05-23T06:02:00Z',
    wake: '2026-05-23T07:45:00Z',
  },
]);

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
// Distance between two clock times in minutes, the short way round the circle.
const circularDistanceMinutes = (a: number, b: number) => {
  const d = Math.abs(a - b) % 1440;
  return Math.min(d, 1440 - d);
};

describe('sleep science chronotype with midnight-straddling bedtimes (issue #1410)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadUserTimezone).mockResolvedValue('UTC');
    vi.mocked(sleepScienceRepository.getSleepHistory).mockResolvedValue(
      MIDNIGHT_HISTORY
    );
  });

  it('averages sleep-start around midnight, not midday', async () => {
    const res = (await getChronotype('user-1')) as unknown as ChronotypeResult;

    expect(res.success).toBe(true);
    // The bug produced "14:30" here; the circular median sits near midnight.
    expect(res.averageSleepTime).not.toBe('14:30');
    expect(
      circularDistanceMinutes(toMinutes(res.averageSleepTime!), 0)
    ).toBeLessThanOrEqual(30);
  });

  it('derives the melatonin window from the corrected sleep time', async () => {
    const res = (await getChronotype('user-1')) as unknown as ChronotypeResult;

    // End of the window is the average sleep onset; start is two hours before.
    expect(res.melatoninWindowEnd).toBe(res.averageSleepTime);
    expect(
      circularDistanceMinutes(
        toMinutes(res.melatoninWindowStart!),
        toMinutes('22:00')
      )
    ).toBeLessThanOrEqual(30);
  });

  it('leaves the wake-time path (which never crossed midnight) in the morning', async () => {
    const res = (await getChronotype('user-1')) as unknown as ChronotypeResult;

    const wake = toMinutes(res.averageWakeTime);
    expect(wake).toBeGreaterThanOrEqual(toMinutes('05:00'));
    expect(wake).toBeLessThanOrEqual(toMinutes('10:00'));
  });

  it('energy curve melatonin window also wraps to midnight', async () => {
    const res = (await getEnergyCurve(
      'user-1'
    )) as unknown as EnergyCurveResult;

    expect(res.success).toBe(true);
    const end = ((res.melatoninWindow.end % 24) + 24) % 24;
    expect(Math.min(end, 24 - end)).toBeLessThan(0.5);
  });
});

describe('sleep science chronotype with ordinary bedtimes (no regression)', () => {
  const NORMAL_HISTORY = buildHistory([
    {
      date: '2026-05-29',
      bedtime: '2026-05-29T22:50:00Z',
      wake: '2026-05-30T06:55:00Z',
    },
    {
      date: '2026-05-28',
      bedtime: '2026-05-28T23:05:00Z',
      wake: '2026-05-29T07:05:00Z',
    },
    {
      date: '2026-05-27',
      bedtime: '2026-05-27T23:00:00Z',
      wake: '2026-05-28T07:00:00Z',
    },
    {
      date: '2026-05-26',
      bedtime: '2026-05-26T22:55:00Z',
      wake: '2026-05-27T06:50:00Z',
    },
    {
      date: '2026-05-25',
      bedtime: '2026-05-25T23:10:00Z',
      wake: '2026-05-26T07:10:00Z',
    },
    {
      date: '2026-05-24',
      bedtime: '2026-05-24T23:15:00Z',
      wake: '2026-05-25T07:15:00Z',
    },
    {
      date: '2026-05-23',
      bedtime: '2026-05-23T22:45:00Z',
      wake: '2026-05-24T06:45:00Z',
    },
  ]);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadUserTimezone).mockResolvedValue('UTC');
    vi.mocked(sleepScienceRepository.getSleepHistory).mockResolvedValue(
      NORMAL_HISTORY
    );
  });

  it('still reports the average around 23:00 for a steady sleeper', async () => {
    const res = (await getChronotype('user-2')) as unknown as ChronotypeResult;

    expect(res.success).toBe(true);
    expect(
      circularDistanceMinutes(
        toMinutes(res.averageSleepTime!),
        toMinutes('23:00')
      )
    ).toBeLessThanOrEqual(30);
  });
});
