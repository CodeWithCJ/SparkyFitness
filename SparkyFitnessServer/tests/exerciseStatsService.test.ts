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
          },
          {
            period_start: new Date('2026-07-15'),
            distance_km: '21.1',
            duration_minutes: '105',
            calories_burned: '1400',
            workout_count: '2',
            avg_heart_rate: '154',
          },
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
      for (let i = 0; i < 7; i++) {
        if (i === 5) {
          mockClient.query.mockResolvedValueOnce({
            rows: [
              {
                id: 'hm-1',
                exercise_name: 'NYC Half Marathon',
                entry_date: new Date('2026-03-20'),
                duration_minutes: 100,
                distance: 21.1,
              },
            ],
          });
        } else {
          mockClient.query.mockResolvedValueOnce({ rows: [] });
        }
      }

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
