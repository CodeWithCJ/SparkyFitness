import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getClient } from '../db/poolManager.js';
import {
  upsertSamplesByDay,
  type FlatHealthSample,
} from '../services/healthMetricSampleWriter.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
}));

const DAY = '2026-08-04';

/** `time` is HH:MM:SS on the fixed test day. */
const at = (time: string): string => `${DAY}T${time}.000Z`;

interface StoredSample {
  t: string;
  bpm: number;
  ex?: string;
}

const incoming = (time: string, bpm: number): FlatHealthSample => ({
  entry_date: DAY,
  timestamp: new Date(at(time)),
  bpm,
});

describe('upsertSamplesByDay', () => {
  const mockQuery = vi.fn();
  const mockClient = { query: mockQuery, release: vi.fn() };

  /** What the mocked `SELECT ... FOR UPDATE` reports as already stored. */
  let stored: StoredSample[] | null;

  beforeEach(() => {
    vi.clearAllMocks();
    stored = null;
    (getClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FOR UPDATE')) {
        return Promise.resolve({
          rows: stored
            ? [
                {
                  id: 'hms-1',
                  user_id: 'user-1',
                  metric: 'heart_rate',
                  entry_date: DAY,
                  source_provider: 'HealthKit',
                  device_name: 'Watch',
                  samples: stored,
                },
              ]
            : [],
        });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  const wasReadForUpdate = (): boolean =>
    mockQuery.mock.calls.some((call) => String(call[0]).includes('FOR UPDATE'));

  /** The `samples` array as it was handed to the upsert statement. */
  function writtenSamples(): StoredSample[] {
    const upsert = mockQuery.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO health_metric_samples')
    );
    if (!upsert) throw new Error('no upsert was issued');
    return JSON.parse(String(upsert[1][5])) as StoredSample[];
  }

  it('keeps stored samples outside the window and replaces those inside it', async () => {
    // One row holds the whole day, so a 60-second workout write must leave the
    // morning and afternoon readings alone. The window is inclusive at both
    // ends: the stored samples sitting exactly on startMs and endMs must be
    // replaced, not kept.
    stored = [
      { t: at('08:00:00'), bpm: 60 },
      { t: at('09:00:00'), bpm: 200 },
      { t: at('09:00:30'), bpm: 200 },
      { t: at('09:01:00'), bpm: 200 },
      { t: at('12:00:00'), bpm: 70 },
    ];

    const written = await upsertSamplesByDay(
      'user-1',
      'user-1',
      'heart_rate',
      'HealthKit',
      [incoming('09:00:00', 105), incoming('09:01:00', 130)],
      {
        mode: 'merge',
        window: {
          startMs: Date.parse(at('09:00:00')),
          endMs: Date.parse(at('09:01:00')),
        },
      }
    );

    expect(written).toBe(1);
    expect(writtenSamples()).toEqual([
      { t: at('08:00:00'), bpm: 60 },
      { t: at('09:00:00'), bpm: 105 },
      { t: at('09:01:00'), bpm: 130 },
      { t: at('12:00:00'), bpm: 70 },
    ]);
  });

  it("keeps another entry's samples that sit inside the window", async () => {
    stored = [
      { t: at('08:00:00'), bpm: 60 },
      { t: at('09:00:30'), bpm: 180, ex: 'other-entry' },
      { t: at('09:00:30'), bpm: 140, ex: 'this-entry' },
      { t: at('12:00:00'), bpm: 70 },
    ];

    await upsertSamplesByDay(
      'user-1',
      'user-1',
      'heart_rate',
      'SparkyFitness Watch',
      [
        {
          entry_date: DAY,
          timestamp: new Date(at('09:00:00')),
          ex: 'this-entry',
          bpm: 105,
        },
      ],
      {
        mode: 'merge',
        window: {
          startMs: Date.parse(at('09:00:00')),
          endMs: Date.parse(at('09:01:00')),
        },
        ex: 'this-entry',
      }
    );

    expect(writtenSamples()).toEqual([
      { t: at('08:00:00'), bpm: 60 },
      { t: at('09:00:00'), bpm: 105, ex: 'this-entry' },
      { t: at('09:00:30'), bpm: 180, ex: 'other-entry' },
      { t: at('12:00:00'), bpm: 70 },
    ]);
  });

  it('is purely additive when merging without a window', async () => {
    stored = [{ t: at('08:00:00'), bpm: 60 }];

    await upsertSamplesByDay(
      'user-1',
      'user-1',
      'heart_rate',
      'HealthKit',
      [incoming('09:00:00', 105)],
      { mode: 'merge' }
    );

    expect(writtenSamples()).toEqual([
      { t: at('08:00:00'), bpm: 60 },
      { t: at('09:00:00'), bpm: 105 },
    ]);
  });

  it('overwrites the whole day in replace mode', async () => {
    stored = [{ t: at('08:00:00'), bpm: 60 }];

    await upsertSamplesByDay('user-1', 'user-1', 'heart_rate', 'garmin', [
      incoming('09:00:00', 105),
    ]);

    expect(wasReadForUpdate()).toBe(false);
    expect(writtenSamples()).toEqual([{ t: at('09:00:00'), bpm: 105 }]);
  });

  it('acquires multi-day merge locks in chronological order regardless of input order', async () => {
    // A multi-day workout (or a batch straddling midnight) can hand
    // upsertSamplesByDay its later day's samples before its earlier day's.
    // Two concurrent merges covering the same days in opposite orders would
    // deadlock if each acquired its locks in encounter order — Postgres
    // aborts one transaction outright since there is no retry here — so the
    // lock order must be independent of input order.
    const day1 = '2026-08-03';
    const day2 = '2026-08-04';
    const laterDayFirst: FlatHealthSample[] = [
      {
        entry_date: day2,
        timestamp: new Date(`${day2}T09:00:00.000Z`),
        bpm: 100,
      },
      {
        entry_date: day1,
        timestamp: new Date(`${day1}T09:00:00.000Z`),
        bpm: 90,
      },
    ];

    await upsertSamplesByDay(
      'user-1',
      'user-1',
      'heart_rate',
      'HealthKit',
      laterDayFirst,
      { mode: 'merge' }
    );

    const lockCalls = mockQuery.mock.calls.filter((call) =>
      String(call[0]).includes('pg_advisory_xact_lock')
    );
    const lockedDays = lockCalls.map((call) => {
      const key = String((call[1] as unknown[])[0]);
      return key.split(':')[2]; // `${userId}:${metric}:${entry_date}:${sourceProvider}`
    });
    expect(lockedDays).toEqual([day1, day2]);
  });

  describe('listed days without incoming samples', () => {
    const day1 = '2026-08-03';
    const day2 = '2026-08-04';
    /** Rows the mocked `SELECT ... FOR UPDATE` reports, by entry_date. */
    let storedByDay: Record<string, StoredSample[]>;

    beforeEach(() => {
      storedByDay = {};
      mockQuery.mockImplementation((sql: string, params?: unknown[]) => {
        if (sql.includes('FOR UPDATE')) {
          const day = String(params?.[2]);
          const samples = storedByDay[day];
          return Promise.resolve({
            rows: samples
              ? [
                  {
                    id: `hms-${day}`,
                    user_id: 'user-1',
                    metric: 'heart_rate',
                    entry_date: day,
                    source_provider: 'xiaomi',
                    device_name: null,
                    samples,
                  },
                ]
              : [],
          });
        }
        return Promise.resolve({ rows: [] });
      });
    });

    /** entry_date -> samples of every upsert that was issued. */
    function writtenByDay(): Record<string, StoredSample[]> {
      const out: Record<string, StoredSample[]> = {};
      for (const call of mockQuery.mock.calls) {
        if (!String(call[0]).includes('INSERT INTO health_metric_samples')) {
          continue;
        }
        const params = call[1] as unknown[];
        out[String(params[2])] = JSON.parse(
          String(params[5])
        ) as StoredSample[];
      }
      return out;
    }

    const window = {
      startMs: Date.parse(`${day1}T00:00:00.000Z`),
      endMs: Date.parse(`${day2}T23:59:59.000Z`),
    };

    it('clears the window on a listed day the resend no longer covers', async () => {
      // A first write stored readings on both days; the resend of the same
      // window only carries day 1, so day 2's old readings must go too.
      storedByDay[day1] = [{ t: `${day1}T09:00:00.000Z`, bpm: 60 }];
      storedByDay[day2] = [{ t: `${day2}T09:00:00.000Z`, bpm: 61 }];

      const written = await upsertSamplesByDay(
        'user-1',
        'user-1',
        'heart_rate',
        'xiaomi',
        [
          {
            entry_date: day1,
            timestamp: new Date(`${day1}T10:00:00.000Z`),
            bpm: 70,
          },
        ],
        { mode: 'merge', window, days: [day1, day2] }
      );

      expect(written).toBe(2);
      expect(writtenByDay()).toEqual({
        [day1]: [{ t: `${day1}T10:00:00.000Z`, bpm: 70 }],
        [day2]: [],
      });
    });

    it('does not create a row for a listed day with nothing stored', async () => {
      const written = await upsertSamplesByDay(
        'user-1',
        'user-1',
        'heart_rate',
        'xiaomi',
        [
          {
            entry_date: day1,
            timestamp: new Date(`${day1}T10:00:00.000Z`),
            bpm: 70,
          },
        ],
        { mode: 'merge', window, days: [day1, day2] }
      );

      expect(written).toBe(1);
      expect(Object.keys(writtenByDay())).toEqual([day1]);
    });

    it('ignores listed days in replace mode', async () => {
      storedByDay[day2] = [{ t: `${day2}T09:00:00.000Z`, bpm: 61 }];

      await upsertSamplesByDay(
        'user-1',
        'user-1',
        'heart_rate',
        'garmin',
        [
          {
            entry_date: day1,
            timestamp: new Date(`${day1}T10:00:00.000Z`),
            bpm: 70,
          },
        ],
        { mode: 'replace', days: [day1, day2] }
      );

      expect(Object.keys(writtenByDay())).toEqual([day1]);
    });
  });
});
