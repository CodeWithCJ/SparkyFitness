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
            total_elevation_gain_meters: '320.5',
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
      // Summed from the database, not hardcoded to 0 — otherwise the summary
      // card contradicts the elevation shown in the interval breakdown below.
      expect(res.totals.totalElevationGainMeters).toBe(321);
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

    it('filters the strength (lifted volume) totals by category, not just the cardio totals', async () => {
      // strengthSql previously had no category clause, so
      // totalLiftedVolumeKg/totalReps summed every category regardless of the
      // `category` filter passed in.
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            total_distance_km: '0',
            total_duration_minutes: '60',
            total_calories_burned: '200',
            workout_count: '1',
            avg_heart_rate: null,
            total_elevation_gain_meters: '0',
          },
        ],
      });
      mockClient.query.mockResolvedValueOnce({
        rows: [{ total_volume: '1000', total_reps: '50' }],
      });
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            total_distance_km: '0',
            total_duration_minutes: '0',
            total_calories_burned: '0',
            workout_count: '0',
          },
        ],
      });
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await exerciseStatsService.getExerciseStatsSummary('user-123', {
        interval: 'month',
        startDate: '2026-07-01',
        endDate: '2026-07-31',
        unitSystem: 'metric',
        category: 'strength',
      });

      const strengthCall = mockClient.query.mock.calls[1];
      expect(strengthCall[0]).toMatch(/LOWER\(e\.category\) = LOWER\(\$4\)/);
      expect(strengthCall[1]).toEqual([
        'user-123',
        '2026-07-01',
        '2026-07-31',
        'strength',
      ]);
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
      expect(res.cardioPRs[0].sportGroup).toBe('run');
      expect(res.cardioPRs[0].id).toBe('pr-run-half_marathon');
      expect(res.strength1RMs.length).toBe(1);
      expect(res.strength1RMs[0].exerciseName).toBe('Bench Press');
      expect(res.strength1RMs[0].estimatedOneRMKg).toBe(120.5);
      expect(mockClient.release).toHaveBeenCalled();
    });

    // Regression for #2137: the PR query has no sport filter, so a walk or a
    // bike ride could take a band that belongs to runs. Rows arrive ordered by
    // pace, so the polluting activity is deliberately listed first.
    it('does not let a walk take the 1 km record from a run', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            std_key: '1k',
            id: 'run-1',
            exercise_name: 'Morning Run',
            category: 'cardio',
            notes: 'Garmin Activity: Morning Run (running)',
            entry_date: new Date('2026-08-05'),
            duration_minutes: 4.5,
            distance: 1.0,
            provider_name: 'garmin',
            detail_data: { activityType: { typeKey: 'running' } },
            exercise_source_id: null,
          },
          {
            std_key: '1k',
            id: 'walk-1',
            exercise_name: 'Antwerp Walking',
            category: 'cardio',
            notes: 'Garmin Activity: Antwerp Walking (walking)',
            entry_date: new Date('2026-08-16'),
            duration_minutes: 13.13,
            distance: 1.0,
            provider_name: 'garmin',
            detail_data: { activityType: { typeKey: 'walking' } },
            exercise_source_id: null,
          },
        ],
      });
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const res =
        await exerciseStatsService.getPersonalRecordMatrix('user-123');

      const runPr = res.cardioPRs.find(
        (pr) => pr.sportGroup === 'run' && pr.distanceStandard === '1k'
      );
      const walkPr = res.cardioPRs.find(
        (pr) => pr.sportGroup === 'walk' && pr.distanceStandard === '1k'
      );
      expect(runPr?.activityName).toBe('Morning Run');
      expect(runPr?.sport).toBe('running');
      expect(runPr?.sportConfidence).toBe('declared');
      expect(walkPr?.activityName).toBe('Antwerp Walking');
      // The walk keeps its own record instead of overwriting the run's.
      expect(runPr?.bestTimeSeconds).not.toBe(walkPr?.bestTimeSeconds);
    });

    it('does not let a bike ride take the 5 km record from a run', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            std_key: '5k',
            id: 'ride-1',
            exercise_name: 'Cycling',
            category: 'Cardio',
            notes: 'Source: HealthKit, Activity Type: Cycling',
            entry_date: new Date('2026-07-09'),
            duration_minutes: 16.33, // 3:16 /km — bike pace
            distance: 5.0,
            provider_name: 'HealthKit',
            detail_data: JSON.stringify({ activityType: 'Cycling' }),
            exercise_source_id: null,
          },
          {
            std_key: '5k',
            id: 'run-5k',
            exercise_name: 'Parkrun',
            category: 'cardio',
            notes: 'Garmin Activity: Parkrun (running)',
            entry_date: new Date('2026-07-12'),
            duration_minutes: 27.5,
            distance: 5.0,
            provider_name: 'garmin',
            detail_data: { activityType: { typeKey: 'running' } },
            exercise_source_id: null,
          },
        ],
      });
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const res =
        await exerciseStatsService.getPersonalRecordMatrix('user-123');

      const runPr = res.cardioPRs.find(
        (pr) => pr.sportGroup === 'run' && pr.distanceStandard === '5k'
      );
      expect(runPr?.activityName).toBe('Parkrun');
      expect(
        res.cardioPRs.find((pr) => pr.sportGroup === 'ride')?.activityName
      ).toBe('Cycling');
    });

    // The reporter's proof that the old behaviour was wrong: a 1 km best can
    // never be slower than a 1 mile best within one sport.
    it('keeps run records monotonic across distances', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            std_key: '1k',
            id: 'walk-1k',
            exercise_name: 'Antwerp Walking',
            category: 'cardio',
            notes: 'Garmin Activity: Antwerp Walking (walking)',
            entry_date: new Date('2026-08-16'),
            duration_minutes: 13.13,
            distance: 1.0,
            provider_name: 'garmin',
            detail_data: { activityType: { typeKey: 'walking' } },
            exercise_source_id: null,
          },
          {
            std_key: '1k',
            id: 'run-1k',
            exercise_name: 'Morning Run',
            category: 'cardio',
            notes: null,
            entry_date: new Date('2026-08-05'),
            duration_minutes: 5.0,
            distance: 1.0,
            provider_name: 'garmin',
            detail_data: { activityType: { typeKey: 'running' } },
            exercise_source_id: null,
          },
          {
            std_key: '1mi',
            id: 'run-1mi',
            exercise_name: 'Running',
            category: 'cardio',
            notes: null,
            entry_date: new Date('2026-08-05'),
            duration_minutes: 11.5,
            distance: 1.61,
            provider_name: 'garmin',
            detail_data: { activityType: { typeKey: 'running' } },
            exercise_source_id: null,
          },
        ],
      });
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const res =
        await exerciseStatsService.getPersonalRecordMatrix('user-123');

      const oneK = res.cardioPRs.find(
        (pr) => pr.sportGroup === 'run' && pr.distanceStandard === '1k'
      );
      const oneMile = res.cardioPRs.find(
        (pr) => pr.sportGroup === 'run' && pr.distanceStandard === '1mi'
      );
      expect(oneK).toBeDefined();
      expect(oneMile).toBeDefined();
      expect(oneK!.bestTimeSeconds).toBeLessThan(oneMile!.bestTimeSeconds);
    });

    // The PR query's ORDER BY lives inside a LATERAL; the outer query has none,
    // so Postgres may hand back rows in any order. Selection must not care.
    it('picks the fastest entry in a band regardless of row order', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            std_key: '5k',
            id: 'slow-run',
            exercise_name: 'Slow Run',
            category: 'cardio',
            notes: null,
            entry_date: new Date('2026-07-01'),
            duration_minutes: 40,
            distance: 5.0,
            provider_name: 'garmin',
            detail_data: { activityType: { typeKey: 'running' } },
            exercise_source_id: null,
          },
          {
            std_key: '5k',
            id: 'fast-run',
            exercise_name: 'Fast Run',
            category: 'cardio',
            notes: null,
            entry_date: new Date('2026-07-15'),
            duration_minutes: 22,
            distance: 5.0,
            provider_name: 'garmin',
            detail_data: { activityType: { typeKey: 'running' } },
            exercise_source_id: null,
          },
        ],
      });
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const res =
        await exerciseStatsService.getPersonalRecordMatrix('user-123');

      const runPr = res.cardioPRs.find(
        (pr) => pr.sportGroup === 'run' && pr.distanceStandard === '5k'
      );
      expect(runPr?.activityName).toBe('Fast Run');
      expect(runPr?.bestTimeSeconds).toBe(22 * 60);
    });

    it('labels the no-banded-records fallback with the entry sport', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'walk-long',
            exercise_name: 'Antwerp Walking',
            category: 'cardio',
            notes: 'Garmin Activity: Antwerp Walking (walking)',
            entry_date: new Date('2026-08-16'),
            duration_minutes: 40,
            distance: 3.2,
            provider_name: 'garmin',
            detail_data: { activityType: { typeKey: 'walking' } },
            exercise_source_id: null,
          },
        ],
      });
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const res =
        await exerciseStatsService.getPersonalRecordMatrix('user-123');

      expect(res.cardioPRs.length).toBe(1);
      expect(res.cardioPRs[0].id).toBe('pr-walk-longest');
      expect(res.cardioPRs[0].sport).toBe('walking');
      expect(res.cardioPRs[0].activityName).toBe('Antwerp Walking');
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
      expect(res.courses[0].sport).toBe('running');
      expect(res.courses[0].recentActivities.length).toBe(1);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('no longer labels every course as running', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            course_key: 'antwerp walking',
            exercise_name: 'Antwerp Walking',
            category: null,
            activity_count: '3',
            avg_distance_km: 1.0,
            min_duration: 13,
          },
        ],
      });
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const res = await exerciseStatsService.getMatchedCourses('user-123');

      expect(res.courses[0].sport).toBe('walking');
    });
  });
});
