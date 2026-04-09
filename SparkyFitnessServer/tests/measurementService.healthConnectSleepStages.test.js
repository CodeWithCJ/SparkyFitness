import measurementService from '../services/measurementService.js';
import sleepRepository from '../models/sleepRepository.js';
import userRepository from '../models/userRepository.js';
import exerciseEntryDb from '../models/exerciseEntry.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
jest.mock('../models/measurementRepository');
jest.mock('../models/userRepository');
jest.mock('../models/exerciseRepository');
jest.mock('../models/exerciseEntry');
jest.mock('../models/sleepRepository');
jest.mock('../models/waterContainerRepository');
jest.mock('../models/activityDetailsRepository');
jest.mock('../utils/timezoneLoader', () => ({
  loadUserTimezone: jest.fn(),
}));
jest.mock('../config/logging', () => ({
  log: jest.fn(),
}));
describe('processHealthData Health Connect sleep stages', () => {
  const userId = 'user-hc-sleep';
  const actingUserId = 'user-hc-sleep';
  beforeEach(() => {
    jest.clearAllMocks();
    loadUserTimezone.mockResolvedValue('UTC');
    userRepository.getUserProfile = jest.fn().mockResolvedValue(null);
    sleepRepository.deleteSleepEntriesByEntrySourceAndDate = jest
      .fn()
      .mockResolvedValue(undefined);
    sleepRepository.upsertSleepEntry = jest
      .fn()
      .mockResolvedValue({ id: 'sleep-entry-1' });
    sleepRepository.upsertSleepStageEvent = jest
      .fn()
      .mockResolvedValue({ id: 'sleep-stage-1' });
    exerciseEntryDb.deleteExerciseEntriesByEntrySourceAndDate = jest
      .fn()
      .mockResolvedValue(undefined);
  });
  it('sanitizes staged Health Connect sleep events before generic sleep processing', async () => {
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
    expect(
      sleepRepository.deleteSleepEntriesByEntrySourceAndDate
    ).toHaveBeenCalledWith(
      userId,
      'Health Connect',
      '2024-01-16',
      '2024-01-16'
    );
    expect(
      exerciseEntryDb.deleteExerciseEntriesByEntrySourceAndDate
    ).toHaveBeenCalledWith(
      userId,
      '2024-01-16',
      '2024-01-16',
      'Health Connect'
    );
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
      sleepRepository.upsertSleepStageEvent.mock.calls.map((call) => call[2])
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
    expect(sleepRepository.upsertSleepStageEvent).toHaveBeenCalledTimes(1);
    expect(sleepRepository.upsertSleepStageEvent.mock.calls[0][2]).toEqual({
      stage_type: 'deep',
      start_time: '2024-01-15T22:00:00.000Z',
      end_time: '2024-01-15T23:00:00.000Z',
      duration_in_seconds: 3600,
    });
  });
});
