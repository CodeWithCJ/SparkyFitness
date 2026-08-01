import { describe, it, expect, vi, beforeEach } from 'vitest';
import exerciseStatsService from '../services/exerciseStatsService.js';
import * as poolManager from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
}));

describe('exerciseStatsService', () => {
  const mockClient = {
    query: vi.fn(),
    release: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (poolManager.getClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockClient
    );
  });

  describe('getExerciseStatsSummary', () => {
    it('should aggregate totals and interval breakdown points correctly', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            total_distance_km: '42.2',
            total_duration_minutes: '210',
            total_calories_burned: '2800',
            workout_count: '4',
            avg_heart_rate: '152',
          },
        ],
      });

      mockClient.query.mockResolvedValueOnce({
        rows: [{ total_volume: '5000', total_reps: '150' }],
      });

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            period_start: new Date('2026-07-01'),
            distance_km: '21.1',
            duration_minutes: '105',
            calories_burned: '1400',
            workout_count: '2',
            avg_heart_rate: '150',
            elevation_gain_meters: '320.5',
          },
          {
            period_start: new Date('2026-07-15'),
            distance_km: '21.1',
            duration_minutes: '105',
            calories_burned: '1400',
            workout_count: '2',
            avg_heart_rate: '154',
            elevation_gain_meters: '0',
          },
        ],
      });

      // Per-bucket lifted volume (only the first bucket has strength work).
      mockClient.query.mockResolvedValueOnce({
        rows: [
          { period_start: new Date('2026-07-01'), total_volume: '3200.5' },
        ],
      });

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            total_distance_km: '30.0',
            total_duration_minutes: '180',
            total_calories_burned: '2000',
            workout_count: '3',
          },
        ],
      });

      // Recorded time-in-zone; zone 5 has no rows.
      mockClient.query.mockResolvedValueOnce({
        rows: [
          { zone_index: '1', seconds: '2224' },
          { zone_index: '2', seconds: '6259' },
          { zone_index: '3', seconds: '3103' },
          { zone_index: '4', seconds: '458' },
        ],
      });

      const res = await exerciseStatsService.getExerciseStatsSummary(
        'user-123',
        {
          interval: 'month',
          startDate: '2026-07-01',
          endDate: '2026-07-31',
          unitSystem: 'metric',
        }
      );

      expect(res.totals.totalDistanceMeters).toBe(42200);
      expect(res.totals.totalDistanceFormatted).toBe(42.2);
      expect(res.totals.totalDurationMinutes).toBe(210);
      expect(res.totals.workoutCount).toBe(4);
      expect(res.totals.avgHeartRate).toBe(152);
      expect(res.totals.totalLiftedVolumeKg).toBe(5000);
      expect(res.intervalsBreakdown.length).toBe(2);

      // Per-bucket elevation and lifted volume come from the database rather
      // than the hardcoded zeros these fields used to return.
      expect(res.intervalsBreakdown[0].totalElevationGainMeters).toBe(321);
      expect(res.intervalsBreakdown[0].totalLiftedVolumeKg).toBe(3200.5);
      expect(res.intervalsBreakdown[1].totalElevationGainMeters).toBe(0);
      expect(res.intervalsBreakdown[1].totalLiftedVolumeKg).toBe(0);

      // Real recorded time-in-zone. A zone with no rows stays 0 instead of
      // falling back to an estimate derived from the average heart rate.
      expect(res.heartRateZoneDistribution).toEqual({
        zone1RecoverySeconds: 2224,
        zone2EnduranceSeconds: 6259,
        zone3AerobicSeconds: 3103,
        zone4ThresholdSeconds: 458,
        zone5AnaerobicSeconds: 0,
      });

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('reports all zones as zero when no time-in-zone was recorded', async () => {
      const emptyTotals = {
        total_distance_km: '0',
        total_duration_minutes: '0',
        total_calories_burned: '0',
        workout_count: '0',
        avg_heart_rate: null,
      };
      mockClient.query
        .mockResolvedValueOnce({ rows: [emptyTotals] })
        .mockResolvedValueOnce({
          rows: [{ total_volume: '0', total_reps: '0' }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [emptyTotals] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await exerciseStatsService.getExerciseStatsSummary(
        'user-123',
        {
          interval: 'month',
          startDate: '2026-07-01',
          endDate: '2026-07-31',
          unitSystem: 'metric',
        }
      );

      expect(res.heartRateZoneDistribution).toEqual({
        zone1RecoverySeconds: 0,
        zone2EnduranceSeconds: 0,
        zone3AerobicSeconds: 0,
        zone4ThresholdSeconds: 0,
        zone5AnaerobicSeconds: 0,
      });
    });

    it('should release the client and propagate the error when the query fails', async () => {
      const dbError = new Error('DB connection lost');
      mockClient.query.mockRejectedValueOnce(dbError);

      await expect(
        exerciseStatsService.getExerciseStatsSummary('user-123', {
          interval: 'month',
          startDate: '2026-07-01',
          endDate: '2026-07-31',
          unitSystem: 'metric',
        })
      ).rejects.toThrow('DB connection lost');

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('queryExerciseActivities', () => {
    it('should query activities filtered by distance standard preset', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ count: '1' }],
      });

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'entry-1',
            user_id: 'user-123',
            exercise_name: 'Boston Half Marathon',
            category: 'running',
            entry_date: new Date('2026-06-15'),
            entry_time: '08:00',
            duration_minutes: 105,
            distance: 21.1,
            avg_heart_rate: 158,
            calories_burned: 1450,
            source: 'garmin',
            notes: 'Paced 5:00 /km smoothly',
          },
        ],
      });

      const res = await exerciseStatsService.queryExerciseActivities(
        'user-123',
        {
          distanceStandard: 'half_marathon',
          page: 1,
          pageSize: 10,
          sortBy: 'entry_date',
          sortOrder: 'desc',
          unitSystem: 'metric',
        }
      );

      expect(res.totalCount).toBe(1);
      expect(res.items.length).toBe(1);
      expect(res.items[0].exerciseName).toBe('Boston Half Marathon');
      expect(res.items[0].distanceFormatted).toBe(21.1);
      expect(res.items[0].formattedPace).toBe('4:59 /km');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('getPersonalRecordMatrix', () => {
    it('should calculate cardio distance PRs and strength 1RMs', async () => {
      // One LATERAL query now returns a row per matching standard, keyed by
      // std_key, instead of seven sequential per-standard queries.
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            std_key: 'half_marathon',
            id: 'hm-1',
            exercise_name: 'NYC Half Marathon',
            entry_date: new Date('2026-03-20'),
            duration_minutes: 100,
            distance: 21.1,
          },
        ],
      });

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            exercise_name: 'Bench Press',
            estimated_one_rm: 120.5,
            max_weight: 100,
            max_reps: 6,
            last_date: new Date('2026-07-20'),
          },
        ],
      });

      const res =
        await exerciseStatsService.getPersonalRecordMatrix('user-123');

      expect(res.cardioPRs.length).toBe(1);
      expect(res.cardioPRs[0].distanceStandard).toBe('half_marathon');
      expect(res.cardioPRs[0].formattedTime).toBe('1:40:00');
      expect(res.strength1RMs.length).toBe(1);
      expect(res.strength1RMs[0].exerciseName).toBe('Bench Press');
      expect(res.strength1RMs[0].estimatedOneRMKg).toBe(120.5);
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('getMatchedCourses', () => {
    it('should group repeated activities into matched courses', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            course_key: 'central park loop',
            exercise_name: 'Central Park Loop',
            category: 'running',
            activity_count: '4',
            avg_distance_km: 10.0,
            min_duration: 45,
          },
        ],
      });

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'act-1',
            exercise_name: 'Central Park Loop',
            entry_date: new Date('2026-07-24'),
            duration_minutes: 45,
            distance: 10.0,
            avg_heart_rate: 155,
          },
        ],
      });

      const res = await exerciseStatsService.getMatchedCourses('user-123');

      expect(res.courses.length).toBe(1);
      expect(res.courses[0].courseName).toBe('Central Park Loop');
      expect(res.courses[0].activityCount).toBe(4);
      expect(res.courses[0].recentActivities.length).toBe(1);
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
