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
    // morning and afternoon readings alone.
    stored = [
      { t: at('08:00:00'), bpm: 60 },
      { t: at('09:00:30'), bpm: 200 },
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
});
