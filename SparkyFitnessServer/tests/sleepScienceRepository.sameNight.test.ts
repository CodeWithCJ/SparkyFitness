import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getClient } from '../db/poolManager.js';
import { getSleepHistory } from '../models/sleepScienceRepository.js';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

function night(
  source: string,
  bedtime: string,
  wakeTime: string,
  stageTypes: string[] = []
) {
  return {
    date: '2026-10-24',
    entry_date: '2026-10-24',
    source,
    bedtime: new Date(bedtime),
    wake_time: new Date(wakeTime),
    duration_in_seconds:
      (new Date(wakeTime).getTime() - new Date(bedtime).getTime()) / 1000,
    stage_events: stageTypes.map((stage_type) => ({ stage_type })),
  };
}

describe('sleep history with the same night from two sources', () => {
  let rows: ReturnType<typeof night>[];
  const query = vi.fn(async (_sql: string) => ({ rows }));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getClient).mockResolvedValue({
      query,
      release: vi.fn(),
    } as unknown as Awaited<ReturnType<typeof getClient>>);
  });

  it('selects what the same-night rule reads', async () => {
    rows = [];
    await getSleepHistory('user-1', 30, 'UTC');
    const sql = query.mock.calls[0]?.[0] ?? '';
    for (const column of [
      'se.entry_date',
      'se.avg_overnight_hrv',
      'se.resting_heart_rate',
      'AS stage_events',
    ]) {
      expect(sql).toContain(column);
    }
  });

  it('returns the night once, from the more detailed record', async () => {
    rows = [
      night('Google Health', '2026-10-23T23:05:00Z', '2026-10-24T06:55:00Z'),
      night('Health Connect', '2026-10-23T23:00:00Z', '2026-10-24T07:00:00Z', [
        'light',
        'deep',
        'rem',
      ]),
    ];
    const history = await getSleepHistory('user-1', 30, 'UTC');
    expect(history.map((r: { source: string }) => r.source)).toEqual([
      'Health Connect',
    ]);
  });

  it('keeps nights of different days', async () => {
    rows = [
      night('Health Connect', '2026-10-23T23:00:00Z', '2026-10-24T07:00:00Z'),
      {
        ...night(
          'Health Connect',
          '2026-10-22T23:00:00Z',
          '2026-10-23T07:00:00Z'
        ),
        date: '2026-10-23',
        entry_date: '2026-10-23',
      },
    ];
    const history = await getSleepHistory('user-1', 30, 'UTC');
    expect(history).toHaveLength(2);
  });
});
