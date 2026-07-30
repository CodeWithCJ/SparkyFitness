import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as genericHealthRepo from '../models/genericHealthRepository.js';
import * as workoutTelemetryRepo from '../models/workoutTelemetryRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
}));

describe('Generic Health & Workout Telemetry Repositories', () => {
  const mockQuery = vi.fn();
  const mockClient = { query: mockQuery };

  beforeEach(() => {
    vi.clearAllMocks();
    (getClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);
  });

  it('bulkUpsertHeartRate should query heart_rate_entries', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'hr-1',
          user_id: 'user-1',
          entry_date: '2026-07-29',
          timestamp: new Date('2026-07-29T08:00:00Z'),
          heart_rate_bpm: 72,
          context: 'resting',
          source_provider: 'garmin',
          device_name: 'Forerunner 965',
          external_id: null,
          created_at: new Date(),
        },
      ],
    });

    const results = await genericHealthRepo.bulkUpsertHeartRate(
      'user-1',
      'user-1',
      [
        {
          user_id: 'user-1',
          entry_date: '2026-07-29',
          timestamp: new Date('2026-07-29T08:00:00Z'),
          heart_rate_bpm: 72,
          context: 'resting',
          source_provider: 'garmin',
        },
      ]
    );

    expect(results).toHaveLength(1);
    expect(results[0].heart_rate_bpm).toBe(72);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('upsertDailyHealthMetrics should query daily_health_metrics', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'daily-1',
          user_id: 'user-1',
          entry_date: '2026-07-29',
          source_provider: 'garmin',
          total_steps: 10500,
          body_battery_highest: 95,
        },
      ],
    });

    const result = await genericHealthRepo.upsertDailyHealthMetrics(
      'user-1',
      'user-1',
      {
        user_id: 'user-1',
        entry_date: '2026-07-29',
        source_provider: 'garmin',
        total_steps: 10500,
        body_battery_highest: 95,
      }
    );

    expect(result.total_steps).toBe(10500);
    expect(result.body_battery_highest).toBe(95);
  });

  it('bulkInsertExerciseEntryLaps should query exercise_entry_laps', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'lap-1',
          user_id: 'user-1',
          exercise_entry_id: 'ex-1',
          entry_date: '2026-07-29',
          lap_index: 1,
          start_time: new Date('2026-07-29T08:00:00Z'),
          end_time: new Date('2026-07-29T08:05:00Z'),
          duration_seconds: 300,
        },
      ],
    });

    const results = await workoutTelemetryRepo.bulkInsertExerciseEntryLaps(
      'user-1',
      'user-1',
      [
        {
          user_id: 'user-1',
          exercise_entry_id: 'ex-1',
          entry_date: '2026-07-29',
          lap_index: 1,
          start_time: new Date('2026-07-29T08:00:00Z'),
          end_time: new Date('2026-07-29T08:05:00Z'),
          duration_seconds: 300,
        },
      ]
    );

    expect(results).toHaveLength(1);
    expect(results[0].lap_index).toBe(1);
  });

  it('bulkInsertExerciseEntryGpsPoints should query exercise_entry_gps_points', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'gps-1',
          user_id: 'user-1',
          exercise_entry_id: 'ex-1',
          entry_date: '2026-07-29',
          timestamp: new Date('2026-07-29T08:01:00Z'),
          latitude: 37.7749,
          longitude: -122.4194,
        },
      ],
    });

    const results = await workoutTelemetryRepo.bulkInsertExerciseEntryGpsPoints(
      'user-1',
      'user-1',
      [
        {
          user_id: 'user-1',
          exercise_entry_id: 'ex-1',
          entry_date: '2026-07-29',
          timestamp: new Date('2026-07-29T08:01:00Z'),
          latitude: 37.7749,
          longitude: -122.4194,
        },
      ]
    );

    expect(results).toHaveLength(1);
    expect(results[0].latitude).toBe(37.7749);
  });
});
