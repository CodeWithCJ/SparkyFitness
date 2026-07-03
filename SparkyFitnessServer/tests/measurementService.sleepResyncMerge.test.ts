import { beforeEach, describe, expect, it, vi } from 'vitest';
import measurementService from '../services/measurementService.js';
import sleepRepository from '../models/sleepRepository.js';
import userRepository from '../models/userRepository.js';
import exerciseEntryDb from '../models/exerciseEntry.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
vi.mock('../models/measurementRepository');
vi.mock('../models/userRepository');
vi.mock('../models/exerciseRepository');
vi.mock('../models/exerciseEntry');
vi.mock('../models/sleepRepository');
vi.mock('../models/waterContainerRepository');
vi.mock('../models/activityDetailsRepository');
vi.mock('../utils/timezoneLoader', () => ({
  loadUserTimezone: vi.fn(),
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

// Regression test for issue #1180: a second HealthKit/Health Connect sync covering
// only part of the same night must NOT wipe the previously-stored full-night data.
// This test simulates two sequential processHealthData calls and asserts:
//   1. deleteSleepEntriesByEntrySourceAndDate is NEVER called for sleep.
//   2. Stages from both syncs accumulate in the merged set (union, not replace).
//   3. After the second sync, the recomputed aggregates reflect the union:
//      bedtime preserved (full-night start), wake_time covers full range,
//      per-stage seconds = sum across both syncs.
describe('processHealthData sleep re-sync merge (issue #1180)', () => {
  const userId = 'user-resync';
  const actingUserId = 'user-resync';

  // Stable storage simulating sleep_entry_stages with the new (entry_id, start_time, end_time)
  // unique key. Stages keyed by start_time alone is sufficient here since the test data has
  // distinct starts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let storedStages: any[];

  beforeEach(() => {
    vi.clearAllMocks();
    storedStages = [];
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    loadUserTimezone.mockResolvedValue('UTC');
    userRepository.getUserProfile = vi.fn().mockResolvedValue(null);
    sleepRepository.deleteSleepEntriesByEntrySourceAndDate = vi
      .fn()
      .mockResolvedValue(undefined);
    sleepRepository.upsertSleepEntry = vi
      .fn()
      .mockResolvedValue({ id: 'entry-night-1' });
    sleepRepository.mergeSleepStageEvents = vi
      .fn()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation(async (_uid: any, _eid: any, stages: any[]) => {
        const normalizedStages = stages.map((stage) => {
          const start_time = new Date(stage.start_time).toISOString();
          const end_time = stage.end_time
            ? new Date(stage.end_time).toISOString()
            : new Date(
                new Date(stage.start_time).getTime() +
                  (Math.round(Number(stage.duration_in_seconds)) || 0) * 1000
              ).toISOString();
          return {
            ...stage,
            start_time,
            end_time,
            duration_in_seconds:
              Math.round(Number(stage.duration_in_seconds)) || 0,
          };
        });
        const ws = Math.min(
          ...normalizedStages.map((stage) =>
            new Date(stage.start_time).getTime()
          )
        );
        const we = Math.max(
          ...normalizedStages.map((stage) => new Date(stage.end_time).getTime())
        );
        const keptKeys = new Set(
          normalizedStages.map(
            (stage) => `${stage.start_time}|${stage.end_time}`
          )
        );
        storedStages = storedStages.filter((stored) => {
          const ss = new Date(stored.start_time).getTime();
          const se = new Date(stored.end_time).getTime();
          const fullyContained = ss >= ws && se <= we;
          const isKept = keptKeys.has(
            `${new Date(stored.start_time).toISOString()}|${new Date(stored.end_time).toISOString()}`
          );
          return !fullyContained || isKept;
        });
        for (const stage of normalizedStages) {
          const idx = storedStages.findIndex(
            (stored) =>
              new Date(stored.start_time).toISOString() === stage.start_time &&
              new Date(stored.end_time).toISOString() === stage.end_time
          );
          if (idx >= 0) {
            storedStages[idx] = { ...storedStages[idx], ...stage };
          } else {
            storedStages.push({ ...stage });
          }
        }
        return normalizedStages.map((stage, index) => ({
          id: `stage-${index + 1}`,
          ...stage,
        }));
      });
    sleepRepository.upsertSleepStageEvent = vi
      .fn()
      .mockResolvedValue(undefined);
    sleepRepository.getSleepStageEventsByEntryId = vi
      .fn()
      .mockImplementation(async () =>
        [...storedStages].sort((a, b) =>
          a.start_time.localeCompare(b.start_time)
        )
      );
    sleepRepository.updateSleepEntryAggregates = vi.fn().mockResolvedValue({});
    exerciseEntryDb.deleteExerciseEntriesByEntrySourceAndDate = vi
      .fn()
      .mockResolvedValue(undefined);
  });

  it('preserves the full-night data when a second sync covers only post-midnight stages', async () => {
    const fullNightSync = [
      {
        type: 'SleepSession',
        source: 'Health Connect',
        timestamp: '2024-01-15T22:00:00Z',
        bedtime: '2024-01-15T22:00:00Z',
        wake_time: '2024-01-16T06:00:00Z',
        duration_in_seconds: 28800,
        stage_events: [
          {
            stage_type: 'light',
            start_time: '2024-01-15T22:00:00Z',
            end_time: '2024-01-15T23:30:00Z',
            duration_in_seconds: 5400,
          },
          {
            stage_type: 'deep',
            start_time: '2024-01-15T23:30:00Z',
            end_time: '2024-01-16T01:00:00Z',
            duration_in_seconds: 5400,
          },
          {
            stage_type: 'rem',
            start_time: '2024-01-16T01:00:00Z',
            end_time: '2024-01-16T02:00:00Z',
            duration_in_seconds: 3600,
          },
          {
            stage_type: 'light',
            start_time: '2024-01-16T02:00:00Z',
            end_time: '2024-01-16T06:00:00Z',
            duration_in_seconds: 14400,
          },
        ],
      },
    ];
    await measurementService.processHealthData(
      fullNightSync,
      userId,
      actingUserId
    );

    // Second sync simulates a 24h-rolling window that excludes the early-night stages:
    // includes only post-midnight, AND HealthKit re-classified one segment from light → deep.
    const partialResync = [
      {
        type: 'SleepSession',
        source: 'Health Connect',
        timestamp: '2024-01-16T00:30:00Z',
        bedtime: '2024-01-16T00:30:00Z',
        wake_time: '2024-01-16T06:00:00Z',
        duration_in_seconds: 19800,
        stage_events: [
          // Re-classified: same exact (start_time, end_time) as the original "deep"
          // but the segment from 02:00–06:00 stays "light".
          {
            stage_type: 'rem',
            start_time: '2024-01-16T01:00:00Z',
            end_time: '2024-01-16T02:00:00Z',
            duration_in_seconds: 3600,
          },
          {
            stage_type: 'light',
            start_time: '2024-01-16T02:00:00Z',
            end_time: '2024-01-16T06:00:00Z',
            duration_in_seconds: 14400,
          },
        ],
      },
    ];
    await measurementService.processHealthData(
      partialResync,
      userId,
      actingUserId
    );

    // 1. Sleep was never pre-deleted across either sync.
    expect(
      sleepRepository.deleteSleepEntriesByEntrySourceAndDate
    ).not.toHaveBeenCalled();

    // 2. The merged stage set contains the union: pre-midnight stages from sync 1
    // plus all post-midnight stages. Re-classifications updated in place (no dup row).
    expect(storedStages).toHaveLength(4);
    const startsInOrder = [...storedStages]
      .map((s) => s.start_time)
      .sort((a, b) => a.localeCompare(b));
    expect(startsInOrder).toEqual([
      '2024-01-15T22:00:00.000Z',
      '2024-01-15T23:30:00.000Z',
      '2024-01-16T01:00:00.000Z',
      '2024-01-16T02:00:00.000Z',
    ]);

    // 3. Aggregates after the second sync reflect the full-night union, not the partial payload.
    const aggCalls = (
      sleepRepository.updateSleepEntryAggregates as unknown as {
        mock: { calls: unknown[][] };
      }
    ).mock.calls;
    expect(aggCalls).toHaveLength(2);
    const lastAggregates = aggCalls[1][3] as {
      bedtime: Date;
      wake_time: Date;
      duration_in_seconds: number;
      time_asleep_in_seconds: number;
      deep_sleep_seconds: number;
      light_sleep_seconds: number;
      rem_sleep_seconds: number;
      awake_sleep_seconds: number;
    };
    // bedtime preserved at the original full-night start (22:00), NOT truncated to 00:30.
    expect(lastAggregates.bedtime.toISOString()).toBe(
      '2024-01-15T22:00:00.000Z'
    );
    expect(lastAggregates.wake_time.toISOString()).toBe(
      '2024-01-16T06:00:00.000Z'
    );
    expect(lastAggregates.duration_in_seconds).toBe(8 * 3600);
    expect(lastAggregates.time_asleep_in_seconds).toBe(8 * 3600);
    // Per-type sums: light = 5400 (22:00–23:30) + 14400 (02:00–06:00) = 19800
    expect(lastAggregates.light_sleep_seconds).toBe(19800);
    // deep = 5400 (23:30–01:00, never re-classified because not in the second sync's window)
    expect(lastAggregates.deep_sleep_seconds).toBe(5400);
    // rem = 3600 (01:00–02:00, originally rem; second sync re-asserted it as rem — no change)
    expect(lastAggregates.rem_sleep_seconds).toBe(3600);
    expect(lastAggregates.awake_sleep_seconds).toBe(0);
  });

  it('updates a re-classified stage in place when natural key matches', async () => {
    // First sync stores the segment as 'light'.
    await measurementService.processHealthData(
      [
        {
          type: 'SleepSession',
          source: 'Health Connect',
          timestamp: '2024-02-01T22:00:00Z',
          bedtime: '2024-02-01T22:00:00Z',
          wake_time: '2024-02-01T23:00:00Z',
          duration_in_seconds: 3600,
          stage_events: [
            {
              stage_type: 'light',
              start_time: '2024-02-01T22:00:00Z',
              end_time: '2024-02-01T23:00:00Z',
              duration_in_seconds: 3600,
            },
          ],
        },
      ],
      userId,
      actingUserId
    );

    // Second sync: same natural key, re-classified to 'deep'.
    await measurementService.processHealthData(
      [
        {
          type: 'SleepSession',
          source: 'Health Connect',
          timestamp: '2024-02-01T22:00:00Z',
          bedtime: '2024-02-01T22:00:00Z',
          wake_time: '2024-02-01T23:00:00Z',
          duration_in_seconds: 3600,
          stage_events: [
            {
              stage_type: 'deep',
              start_time: '2024-02-01T22:00:00Z',
              end_time: '2024-02-01T23:00:00Z',
              duration_in_seconds: 3600,
            },
          ],
        },
      ],
      userId,
      actingUserId
    );

    // No duplicate row — stage updated in place.
    expect(storedStages).toHaveLength(1);
    expect(storedStages[0].stage_type).toBe('deep');
  });

  it('drops superseded rows when a re-sync refines stage boundaries', async () => {
    // Sync 1: one coarse light segment for the whole hour.
    await measurementService.processHealthData(
      [
        {
          type: 'SleepSession',
          source: 'Health Connect',
          timestamp: '2024-03-01T22:00:00Z',
          bedtime: '2024-03-01T22:00:00Z',
          wake_time: '2024-03-01T23:00:00Z',
          duration_in_seconds: 3600,
          stage_events: [
            {
              stage_type: 'light',
              start_time: '2024-03-01T22:00:00Z',
              end_time: '2024-03-01T23:00:00Z',
              duration_in_seconds: 3600,
            },
          ],
        },
      ],
      userId,
      actingUserId
    );
    expect(storedStages).toHaveLength(1);

    // Sync 2: source refined the same hour into two shorter segments. The original
    // 22:00–23:00 row must be dropped (overlaps the new payload's window AND is not
    // an exact match of either incoming segment) so aggregates don't double-count.
    await measurementService.processHealthData(
      [
        {
          type: 'SleepSession',
          source: 'Health Connect',
          timestamp: '2024-03-01T22:00:00Z',
          bedtime: '2024-03-01T22:00:00Z',
          wake_time: '2024-03-01T23:00:00Z',
          duration_in_seconds: 3600,
          stage_events: [
            {
              stage_type: 'light',
              start_time: '2024-03-01T22:00:00Z',
              end_time: '2024-03-01T22:30:00Z',
              duration_in_seconds: 1800,
            },
            {
              stage_type: 'deep',
              start_time: '2024-03-01T22:30:00Z',
              end_time: '2024-03-01T23:00:00Z',
              duration_in_seconds: 1800,
            },
          ],
        },
      ],
      userId,
      actingUserId
    );

    // Only the two refined rows survive (the original coarse row was superseded).
    expect(storedStages).toHaveLength(2);
    const aggCalls = (
      sleepRepository.updateSleepEntryAggregates as unknown as {
        mock: { calls: unknown[][] };
      }
    ).mock.calls;
    const lastAggregates = aggCalls[aggCalls.length - 1][3] as {
      duration_in_seconds: number;
      time_asleep_in_seconds: number;
      light_sleep_seconds: number;
      deep_sleep_seconds: number;
    };
    expect(lastAggregates.duration_in_seconds).toBe(3600);
    expect(lastAggregates.time_asleep_in_seconds).toBe(3600);
    // Without overlap-delete this would inflate to 5400 (3600 + 1800).
    expect(lastAggregates.light_sleep_seconds).toBe(1800);
    expect(lastAggregates.deep_sleep_seconds).toBe(1800);
  });

  it('preserves a stored stage that straddles the payload window boundary', async () => {
    // Sync 1: a coarse stage spans local midnight (23:30 → 01:30).
    await measurementService.processHealthData(
      [
        {
          type: 'SleepSession',
          source: 'Health Connect',
          timestamp: '2024-04-01T23:30:00Z',
          bedtime: '2024-04-01T23:30:00Z',
          wake_time: '2024-04-02T01:30:00Z',
          duration_in_seconds: 7200,
          stage_events: [
            {
              stage_type: 'light',
              start_time: '2024-04-01T23:30:00Z',
              end_time: '2024-04-02T01:30:00Z',
              duration_in_seconds: 7200,
            },
          ],
        },
      ],
      userId,
      actingUserId
    );
    expect(storedStages).toHaveLength(1);

    // Sync 2: payload window starts at 01:00 (after the stored stage's start). The
    // stored 23:30–01:30 row straddles the boundary — the 23:30–01:00 portion is
    // outside this resync's scope and must NOT be wiped.
    await measurementService.processHealthData(
      [
        {
          type: 'SleepSession',
          source: 'Health Connect',
          timestamp: '2024-04-02T01:00:00Z',
          bedtime: '2024-04-02T01:00:00Z',
          wake_time: '2024-04-02T02:00:00Z',
          duration_in_seconds: 3600,
          stage_events: [
            {
              stage_type: 'deep',
              start_time: '2024-04-02T01:30:00Z',
              end_time: '2024-04-02T02:00:00Z',
              duration_in_seconds: 1800,
            },
          ],
        },
      ],
      userId,
      actingUserId
    );

    // Straddling row preserved + new row added.
    expect(storedStages).toHaveLength(2);
    const starts = storedStages
      .map((s) => new Date(s.start_time).toISOString())
      .sort();
    expect(starts).toEqual([
      '2024-04-01T23:30:00.000Z',
      '2024-04-02T01:30:00.000Z',
    ]);
  });

  it('preserves existing detailed stages when a later retry has no stage_events', async () => {
    await measurementService.processHealthData(
      [
        {
          type: 'SleepSession',
          source: 'Health Connect',
          timestamp: '2024-05-01T22:00:00Z',
          bedtime: '2024-05-01T22:00:00Z',
          wake_time: '2024-05-01T23:00:00Z',
          duration_in_seconds: 3600,
          stage_events: [
            {
              stage_type: 'light',
              start_time: '2024-05-01T22:00:00Z',
              end_time: '2024-05-01T22:30:00Z',
              duration_in_seconds: 1800,
            },
            {
              stage_type: 'deep',
              start_time: '2024-05-01T22:30:00Z',
              end_time: '2024-05-01T23:00:00Z',
              duration_in_seconds: 1800,
            },
          ],
        },
      ],
      userId,
      actingUserId
    );

    await measurementService.processHealthData(
      [
        {
          type: 'SleepSession',
          source: 'Health Connect',
          timestamp: '2024-05-01T22:00:00Z',
          bedtime: '2024-05-01T22:00:00Z',
          wake_time: '2024-05-01T23:00:00Z',
          duration_in_seconds: 3600,
          time_asleep_in_seconds: 3600,
        },
      ],
      userId,
      actingUserId
    );

    expect(storedStages).toHaveLength(2);
    expect(sleepRepository.mergeSleepStageEvents).toHaveBeenCalledTimes(1);
    const aggCalls = (
      sleepRepository.updateSleepEntryAggregates as unknown as {
        mock: { calls: unknown[][] };
      }
    ).mock.calls;
    const lastAggregates = aggCalls[aggCalls.length - 1][3] as {
      duration_in_seconds: number;
      time_asleep_in_seconds: number;
      light_sleep_seconds: number;
      deep_sleep_seconds: number;
    };
    expect(lastAggregates.duration_in_seconds).toBe(3600);
    expect(lastAggregates.time_asleep_in_seconds).toBe(3600);
    expect(lastAggregates.light_sleep_seconds).toBe(1800);
    expect(lastAggregates.deep_sleep_seconds).toBe(1800);
  });
});
