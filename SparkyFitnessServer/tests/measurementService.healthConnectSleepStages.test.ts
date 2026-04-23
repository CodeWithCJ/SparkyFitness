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
describe('processHealthData Health Connect sleep stages', () => {
  const userId = 'user-hc-sleep';
  const actingUserId = 'user-hc-sleep';
  type StageEvent = {
    stage_type: string;
    start_time: string;
    end_time: string;
    duration_in_seconds: number;
  };
  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    loadUserTimezone.mockResolvedValue('UTC');
    userRepository.getUserProfile = vi.fn().mockResolvedValue(null);
    sleepRepository.deleteSleepEntriesByEntrySourceAndDate = vi
      .fn()
      .mockResolvedValue(undefined);
    sleepRepository.upsertSleepEntry = vi
      .fn()
      .mockResolvedValue({ id: 'sleep-entry-1' });
    // Mock returns the exact stage objects we were asked to upsert, so the recompute
    // step in processSleepEntry sees a consistent merged set.
    const upsertedStages: StageEvent[] = [];
    sleepRepository.mergeSleepStageEvents = vi
      .fn()
      .mockImplementation(
        async (
          _uid: string,
          _eid: string,
          stages: StageEvent[],
          _aid: string
        ) => {
          upsertedStages.length = 0;
          for (const stage of stages) {
            upsertedStages.push(stage);
          }
          return stages.map((stage, index) => ({
            id: `sleep-stage-${index + 1}`,
            ...stage,
          }));
        }
      );
    sleepRepository.upsertSleepStageEvent = vi
      .fn()
      .mockResolvedValue(undefined);
    sleepRepository.getSleepStageEventsByEntryId = vi
      .fn()
      .mockImplementation(async () => upsertedStages);
    sleepRepository.updateSleepEntryAggregates = vi
      .fn()
      .mockImplementation(
        async (
          _uid: string,
          _eid: string,
          _aid: string,
          agg: Record<string, unknown>
        ) => ({
          id: 'sleep-entry-1',
          ...agg,
        })
      );
    exerciseEntryDb.deleteExerciseEntriesByEntrySourceAndDate = vi
      .fn()
      .mockResolvedValue(undefined);
  });
  it('sanitizes staged Health Connect sleep events and merges (no pre-cleanup delete)', async () => {
    const healthData = [
      {
        type: 'SleepSession',
        source: 'Health Connect',
        timestamp: '2024-01-15T22:00:00Z',
        bedtime: '2024-01-15T22:00:00Z',
        wake_time: '2024-01-16T06:00:00Z',
        duration_in_seconds: 28800,
        time_asleep_in_seconds: 1,
        sleep_score: 0,
        deep_sleep_seconds: 3600,
        light_sleep_seconds: 22500,
        rem_sleep_seconds: 1800,
        awake_sleep_seconds: 900,
        record_utc_offset_minutes: -300,
        stage_events: [
          {
            stage_type: 'light',
            start_time: '2024-01-15T22:00:00Z',
            end_time: '2024-01-15T22:30:00Z',
            duration_in_seconds: 1800,
          },
          {
            stage_type: 'deep',
            start_time: '2024-01-15T22:30:00Z',
            end_time: '2024-01-15T23:30:00Z',
            duration_in_seconds: 3600,
          },
          {
            stage_type: 'unsupported',
            start_time: '2024-01-15T23:30:00Z',
            end_time: '2024-01-16T00:00:00Z',
            duration_in_seconds: 1800,
          },
          {
            stage_type: 'rem',
            start_time: '2024-01-15T23:30:00Z',
            end_time: '2024-01-16T00:00:00Z',
            duration_in_seconds: 1800,
          },
          {
            stage_type: 'awake',
            start_time: '2024-01-16T00:00:00Z',
            end_time: '2024-01-16T00:15:00Z',
            duration_in_seconds: 900,
          },
          {
            stage_type: 'light',
            start_time: '2024-01-16T00:15:00Z',
            end_time: '2024-01-16T06:00:00Z',
            duration_in_seconds: 20700,
          },
          {
            stage_type: 'light',
            start_time: 'invalid',
            end_time: '2024-01-16T06:30:00Z',
            duration_in_seconds: 1800,
          },
        ],
      },
    ];
    await measurementService.processHealthData(
      healthData,
      userId,
      actingUserId
    );
    // Regression guard: sleep is no longer pre-deleted on sync ingest (issue #1180).
    expect(
      sleepRepository.deleteSleepEntriesByEntrySourceAndDate
    ).not.toHaveBeenCalled();
    // Sleep-only payload should not trigger exercise pre-cleanup — that wipes
    // unrelated data. Exercise cleanup only fires when ExerciseSession/Workout
    // entries are present.
    expect(
      exerciseEntryDb.deleteExerciseEntriesByEntrySourceAndDate
    ).not.toHaveBeenCalled();
    expect(sleepRepository.upsertSleepEntry).toHaveBeenCalledWith(
      userId,
      actingUserId,
      expect.objectContaining({
        entry_date: '2024-01-16',
        source: 'Health Connect',
        time_asleep_in_seconds: 27900,
        deep_sleep_seconds: 3600,
        light_sleep_seconds: 22500,
        rem_sleep_seconds: 1800,
        awake_sleep_seconds: 900,
      })
    );
    expect(
      // @ts-expect-error TS(2339): Property 'mock' does not exist on type '(userId: a... Remove this comment to see the full error message
      sleepRepository.mergeSleepStageEvents.mock.calls[0][2]
    ).toEqual([
      {
        stage_type: 'light',
        start_time: '2024-01-15T22:00:00.000Z',
        end_time: '2024-01-15T22:30:00.000Z',
        duration_in_seconds: 1800,
      },
      {
        stage_type: 'deep',
        start_time: '2024-01-15T22:30:00.000Z',
        end_time: '2024-01-15T23:30:00.000Z',
        duration_in_seconds: 3600,
      },
      {
        stage_type: 'rem',
        start_time: '2024-01-15T23:30:00.000Z',
        end_time: '2024-01-16T00:00:00.000Z',
        duration_in_seconds: 1800,
      },
      {
        stage_type: 'awake',
        start_time: '2024-01-16T00:00:00.000Z',
        end_time: '2024-01-16T00:15:00.000Z',
        duration_in_seconds: 900,
      },
      {
        stage_type: 'light',
        start_time: '2024-01-16T00:15:00.000Z',
        end_time: '2024-01-16T06:00:00.000Z',
        duration_in_seconds: 20700,
      },
    ]);
    expect(sleepRepository.mergeSleepStageEvents).toHaveBeenCalledWith(
      userId,
      'sleep-entry-1',
      expect.any(Array),
      actingUserId
    );
    // Aggregates were recomputed from merged stages and persisted via the new helper.
    expect(sleepRepository.updateSleepEntryAggregates).toHaveBeenCalledTimes(1);
    const aggCall = (
      sleepRepository.updateSleepEntryAggregates as unknown as {
        mock: { calls: unknown[][] };
      }
    ).mock.calls[0];
    expect(aggCall[0]).toBe(userId);
    expect(aggCall[1]).toBe('sleep-entry-1');
    expect(aggCall[2]).toBe(actingUserId);
    expect(aggCall[3]).toMatchObject({
      duration_in_seconds: 28800,
      time_asleep_in_seconds: 27900,
      deep_sleep_seconds: 3600,
      light_sleep_seconds: 22500,
      rem_sleep_seconds: 1800,
      awake_sleep_seconds: 900,
    });
  });
  it('accepts the legacy HealthConnect source spelling for staged sleep payloads', async () => {
    const healthData = [
      {
        type: 'SleepSession',
        source: 'HealthConnect',
        timestamp: '2024-01-15T22:00:00Z',
        bedtime: '2024-01-15T22:00:00Z',
        wake_time: '2024-01-16T00:00:00Z',
        duration_in_seconds: 7200,
        time_asleep_in_seconds: 0,
        deep_sleep_seconds: 3600,
        light_sleep_seconds: 0,
        rem_sleep_seconds: 0,
        awake_sleep_seconds: 0,
        stage_events: [
          {
            stage_type: 'deep',
            start_time: '2024-01-15T22:00:00Z',
            end_time: '2024-01-15T23:00:00Z',
            duration_in_seconds: 3600,
          },
          {
            stage_type: 'nope',
            start_time: '2024-01-15T23:00:00Z',
            end_time: '2024-01-16T00:00:00Z',
            duration_in_seconds: 3600,
          },
        ],
      },
    ];
    await measurementService.processHealthData(
      healthData,
      userId,
      actingUserId
    );
    expect(sleepRepository.upsertSleepEntry).toHaveBeenCalledWith(
      userId,
      actingUserId,
      expect.objectContaining({
        source: 'HealthConnect',
        time_asleep_in_seconds: 3600,
      })
    );
    expect(sleepRepository.mergeSleepStageEvents).toHaveBeenCalledTimes(1);
    expect(
      // @ts-expect-error TS(2339): Property 'mock' does not exist on type '(userId: a... Remove this comment to see the full error message
      sleepRepository.mergeSleepStageEvents.mock.calls[0][2][0]
    ).toEqual({
      stage_type: 'deep',
      start_time: '2024-01-15T22:00:00.000Z',
      end_time: '2024-01-15T23:00:00.000Z',
      duration_in_seconds: 3600,
    });
  });
});
