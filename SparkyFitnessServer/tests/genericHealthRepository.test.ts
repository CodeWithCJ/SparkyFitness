import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as genericHealthRepo from '../models/genericHealthRepository.js';
import * as workoutTelemetryRepo from '../models/workoutTelemetryRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
}));

describe('Generic Health & Workout Telemetry Repositories', () => {
  const mockQuery = vi.fn();
  const mockClient = { query: mockQuery, release: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    (getClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);
  });

  it('upsertHealthMetricSamples should query health_metric_samples', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'hms-1',
          user_id: 'user-1',
          metric: 'heart_rate',
          entry_date: '2026-07-29',
          source_provider: 'garmin',
          device_name: 'Forerunner 965',
          samples: [{ t: '2026-07-29T08:00:00.000Z', bpm: 72 }],
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });

    const result = await genericHealthRepo.upsertHealthMetricSamples(
      'user-1',
      'user-1',
      {
        user_id: 'user-1',
        metric: 'heart_rate',
        entry_date: '2026-07-29',
        source_provider: 'garmin',
        samples: [{ t: '2026-07-29T08:00:00.000Z', bpm: 72 }],
      }
    );

    expect(result.metric).toBe('heart_rate');
    expect(result.samples).toHaveLength(1);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('getHealthMetricSamples should query health_metric_samples by metric and date range', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'hms-1',
          user_id: 'user-1',
          metric: 'spo2',
          entry_date: '2026-07-29',
          source_provider: 'garmin',
          device_name: null,
          samples: [{ t: '2026-07-29T12:00:00.000Z', percentage: 97 }],
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });

    const results = await genericHealthRepo.getHealthMetricSamples(
      'user-1',
      'user-1',
      'spo2',
      '2026-07-29',
      '2026-07-29'
    );

    expect(results).toHaveLength(1);
    expect(results[0].metric).toBe('spo2');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE user_id = $1 AND metric = $2'),
      ['user-1', 'spo2', '2026-07-29', '2026-07-29']
    );
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

  it('bulkInsertExerciseEntryGpsPoints groups flat points into one row per workout', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'gps-1',
          user_id: 'user-1',
          exercise_entry_id: 'ex-1',
          entry_date: '2026-07-29',
          points: [
            { t: '2026-07-29T08:01:00.000Z', lat: 37.7749, lon: -122.4194 },
            { t: '2026-07-29T08:01:05.000Z', lat: 37.775, lon: -122.4195 },
          ],
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
        {
          user_id: 'user-1',
          exercise_entry_id: 'ex-1',
          entry_date: '2026-07-29',
          timestamp: new Date('2026-07-29T08:01:05Z'),
          latitude: 37.775,
          longitude: -122.4195,
        },
      ]
    );

    // One row (one query call) for both points -- they share an exercise_entry_id.
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0].points).toHaveLength(2);
    expect(results[0].points[0].lat).toBe(37.7749);
  });

  describe('merge-write concurrency primitives', () => {
    it('acquireHealthMetricSampleLockWithClient takes a transaction-scoped advisory lock keyed to the (user, metric, day, provider) tuple', async () => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };

      await genericHealthRepo.acquireHealthMetricSampleLockWithClient(
        client,
        'user-1',
        'heart_rate',
        '2026-07-29',
        'garmin'
      );

      expect(client.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        ['user-1:heart_rate:2026-07-29:garmin']
      );
    });

    it('the lock key is distinct per provider — two providers on the same day/metric must not block each other', async () => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };

      await genericHealthRepo.acquireHealthMetricSampleLockWithClient(
        client,
        'user-1',
        'heart_rate',
        '2026-07-29',
        'garmin'
      );
      await genericHealthRepo.acquireHealthMetricSampleLockWithClient(
        client,
        'user-1',
        'heart_rate',
        '2026-07-29',
        'HealthKit'
      );

      const keys = client.query.mock.calls.map((call) => call[1][0]);
      expect(new Set(keys).size).toBe(2);
    });

    it('getHealthMetricSampleRowForUpdateWithClient SELECTs FOR UPDATE scoped to the exact (user, metric, day, provider) row', async () => {
      const client = {
        query: vi.fn().mockResolvedValue({
          rows: [
            {
              id: 'hms-1',
              samples: [{ t: '2026-07-29T08:00:00.000Z', bpm: 72 }],
            },
          ],
        }),
      };

      const row =
        await genericHealthRepo.getHealthMetricSampleRowForUpdateWithClient(
          client,
          'user-1',
          'heart_rate',
          '2026-07-29',
          'HealthKit'
        );

      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE'),
        ['user-1', 'heart_rate', '2026-07-29', 'HealthKit']
      );
      expect(row?.id).toBe('hms-1');
    });

    it('getHealthMetricSampleRowForUpdateWithClient returns null rather than undefined when no row exists', async () => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };

      const row =
        await genericHealthRepo.getHealthMetricSampleRowForUpdateWithClient(
          client,
          'user-1',
          'heart_rate',
          '2026-07-29',
          'HealthKit'
        );

      expect(row).toBeNull();
    });
  });
});
