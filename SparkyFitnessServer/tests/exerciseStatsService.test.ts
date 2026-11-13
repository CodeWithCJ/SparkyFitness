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

    it('carries floors climbed and elevation gain for a stair workout', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ count: '1' }] });
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'entry-stairs',
            user_id: 'user-123',
            exercise_name: 'Stair Climbing',
            category: 'cardio',
            entry_date: new Date('2026-10-08'),
            entry_time: '06:49',
            duration_minutes: 16.93,
            distance: null,
            avg_heart_rate: 157,
            calories_burned: 219,
            floors_climbed: '56',
            elevation_gain_meters: '181.9056',
            avg_cadence: '168.4',
            stride_length_cm: '104.26',
            source: 'HealthKit',
            notes: null,
          },
        ],
      });

      const res = await exerciseStatsService.queryExerciseActivities(
        'user-123',
        {
          page: 1,
          pageSize: 10,
          sortBy: 'entry_date',
          sortOrder: 'desc',
          unitSystem: 'metric',
        }
      );

      expect(res.items[0].floorsClimbed).toBe(56);
      expect(res.items[0].elevationGainMeters).toBe(181.9);
      expect(res.items[0].avgCadence).toBe(168);
      expect(res.items[0].strideLengthCm).toBe(104.3);
      const sql = String(mockClient.query.mock.calls[1]?.[0]);
      expect(sql).toContain('floors_climbed');
      expect(sql).toContain('elevation_gain_meters');
      expect(sql).toContain('avg_cadence');
    });

    it('leaves floors and elevation null when the source never measured them', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ count: '1' }] });
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'entry-walk',
            user_id: 'user-123',
            exercise_name: 'Walking',
            category: 'cardio',
            entry_date: new Date('2026-10-08'),
            entry_time: '07:00',
            duration_minutes: 30,
            distance: 2.5,
            avg_heart_rate: null,
            calories_burned: 120,
            // A zero or empty column is "not measured", never "0 floors".
            floors_climbed: 0,
            elevation_gain_meters: null,
            source: 'manual',
            notes: null,
          },
        ],
      });

      const res = await exerciseStatsService.queryExerciseActivities(
        'user-123',
        {
          page: 1,
          pageSize: 10,
          sortBy: 'entry_date',
          sortOrder: 'desc',
          unitSystem: 'metric',
        }
      );

      expect(res.items[0].floorsClimbed).toBeNull();
      expect(res.items[0].elevationGainMeters).toBeNull();
      expect(res.items[0].avgCadence).toBeNull();
      expect(res.items[0].strideLengthCm).toBeNull();
    });

    it('carries the weather at the start, keeping a 0 °C reading', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ count: '2' }] });
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'entry-cold',
            user_id: 'user-123',
            exercise_name: 'Running',
            entry_date: new Date('2026-10-08'),
            duration_minutes: 30,
            distance: 5,
            calories_burned: 300,
            weather_temp_celsius: '9.44',
            weather_condition: 'Light rain',
            source: 'manual',
          },
          {
            id: 'entry-freezing',
            user_id: 'user-123',
            exercise_name: 'Running',
            entry_date: new Date('2026-10-09'),
            duration_minutes: 30,
            distance: 5,
            calories_burned: 300,
            weather_temp_celsius: '0.0',
            weather_condition: null,
            source: 'manual',
          },
        ],
      });

      const res = await exerciseStatsService.queryExerciseActivities(
        'user-123',
        {
          page: 1,
          pageSize: 10,
          sortBy: 'entry_date',
          sortOrder: 'desc',
          unitSystem: 'metric',
        }
      );

      expect(res.items[0].weatherTempCelsius).toBe(9.4);
      expect(res.items[0].weatherCondition).toBe('Light rain');
      expect(res.items[1].weatherTempCelsius).toBe(0);
      expect(res.items[1].weatherCondition).toBeNull();
      expect(String(mockClient.query.mock.calls[1]?.[0])).toContain(
        'weather_temp_celsius'
      );
    });

    it('does not treat a crunch or a strength session as cardio', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await exerciseStatsService.queryExerciseActivities('user-123', {
        page: 1,
        pageSize: 10,
        sortBy: 'entry_date',
        sortOrder: 'desc',
        unitSystem: 'metric',
      });

      const sql = String(mockClient.query.mock.calls[0]?.[0]);
      expect(sql).toContain(
        "NOT IN ('weight_reps', 'weight_duration', 'weight_distance')"
      );
      expect(sql).toContain('\\m(strength|crunch');
      expect(sql).not.toContain('(run|walk|cycle');
      expect(sql).toContain('OR COALESCE(distance, 0) > 0');
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
      // 21.1 km in 100 min, scaled to the exact 21.0975 km standard.
      expect(res.cardioPRs[0].formattedTime).toBe('1:39:59');
      expect(res.cardioPRs[0].timeBasis).toBe('activity_pace');
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

    it('leaves sports without a distance standard out of the distance bands', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            std_key: 'marathon',
            id: 'ski-1',
            exercise_name: 'Downhill Skiing',
            category: 'cardio',
            notes: null,
            entry_date: new Date('2026-02-23'),
            duration_minutes: 122.2,
            distance: 42.2,
            provider_name: null,
            detail_data: null,
            exercise_source_id: null,
          },
        ],
      });
      // No band qualifies, so the best-effort fallback runs before strength.
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const res =
        await exerciseStatsService.getPersonalRecordMatrix('user-123');

      expect(
        res.cardioPRs.filter(
          (pr) => pr.sportGroup === 'other' && pr.distanceStandard !== 'custom'
        )
      ).toEqual([]);
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

    // The reported bug: bestTimeSeconds was the whole activity's duration, so a
    // 5.8 km run was a slow "5K" and a 4.0 km run a too-fast one.
    it('does not count an untracked activity outside its distance as that standard', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'long-run',
            exercise_name: 'Long Run',
            category: 'cardio',
            notes: null,
            entry_date: new Date('2026-07-01'),
            duration_minutes: 34,
            distance: 5.8,
            provider_name: 'garmin',
            detail_data: { activityType: { typeKey: 'running' } },
            exercise_source_id: null,
          },
          {
            id: 'short-run',
            exercise_name: 'Short Run',
            category: 'cardio',
            notes: null,
            entry_date: new Date('2026-07-02'),
            duration_minutes: 20,
            distance: 4.0,
            provider_name: 'garmin',
            detail_data: { activityType: { typeKey: 'running' } },
            exercise_source_id: null,
          },
        ],
      });
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const res =
        await exerciseStatsService.getPersonalRecordMatrix('user-123');

      expect(
        res.cardioPRs.find((pr) => pr.distanceStandard === '5k')
      ).toBeUndefined();
    });

    it('scales a near-exact untracked activity to the standard distance', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'parkrun',
            exercise_name: 'Parkrun',
            category: 'cardio',
            notes: null,
            entry_date: new Date('2026-07-12'),
            duration_minutes: 25.5,
            distance: 5.1,
            provider_name: 'garmin',
            detail_data: { activityType: { typeKey: 'running' } },
            exercise_source_id: null,
          },
        ],
      });
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const res =
        await exerciseStatsService.getPersonalRecordMatrix('user-123');

      const pr = res.cardioPRs.find((p) => p.distanceStandard === '5k');
      expect(pr?.bestTimeSeconds).toBe(1500);
      expect(pr?.timeBasis).toBe('activity_pace');
    });

    it('reports the fastest 5 km inside a longer run from its GPS track', async () => {
      // 10 km at a steady 6:00/km, except km 4 to 9 are run at 4:00/km, so the
      // best 5 km is 20:00 although the whole run averages 5:00/km (50:00).
      const start = Date.parse('2026-07-01T07:00:00Z');
      const points: { t: string; lat: number; lon: number; dist: number }[] =
        [];
      let seconds = 0;
      for (let km = 0; km <= 10; km += 0.5) {
        points.push({
          t: new Date(start + seconds * 1000).toISOString(),
          lat: 50,
          lon: 4,
          dist: km * 1000,
        });
        const pace = km >= 4 && km < 9 ? 240 : 360;
        seconds += pace * 0.5;
      }
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'long-run',
            exercise_name: 'Long Run',
            category: 'cardio',
            notes: null,
            entry_date: new Date('2026-07-01'),
            duration_minutes: seconds / 60,
            distance: 10,
            provider_name: 'garmin',
            detail_data: { activityType: { typeKey: 'running' } },
            exercise_source_id: null,
            has_gps_track: true,
            has_distance_series: false,
          },
        ],
      });
      mockClient.query.mockResolvedValueOnce({
        rows: [{ exercise_entry_id: 'long-run', points }],
      });
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const res =
        await exerciseStatsService.getPersonalRecordMatrix('user-123');

      const fiveK = res.cardioPRs.find((p) => p.distanceStandard === '5k');
      expect(fiveK?.bestTimeSeconds).toBe(20 * 60);
      expect(fiveK?.timeBasis).toBe('best_split');
      expect(fiveK?.avgPaceSecondsPerKm).toBe(240);
      const tenK = res.cardioPRs.find((p) => p.distanceStandard === '10k');
      expect(tenK?.timeBasis).toBe('best_split');
      expect(tenK?.bestTimeSeconds).toBe(Math.round(10 * 60 * 5));
    });

    // A GPS track that stops short of a standard must not hide a distance
    // series that covers it.
    it('falls back to the distance series for a standard the GPS track does not cover', async () => {
      const start = Date.parse('2026-08-05T07:00:00Z');
      // 3 km of GPS (device distance), but the series covers the full 5 km.
      const gps = [0, 1, 2, 3].map((km) => ({
        t: new Date(start + km * 360 * 1000).toISOString(),
        lat: 50,
        lon: 4,
        dist: km * 1000,
      }));
      const series: [number, number][] = [0, 1, 2, 3, 4, 5].map((km) => [
        km * 300,
        km * 1000,
      ]);
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'mixed-run',
            exercise_name: 'Mixed Run',
            category: 'cardio',
            notes: null,
            entry_date: new Date('2026-08-05'),
            duration_minutes: 25,
            distance: 5,
            provider_name: 'garmin',
            detail_data: { activityType: { typeKey: 'running' } },
            exercise_source_id: null,
            has_gps_track: true,
            has_distance_series: true,
            track_version: 'mixed-1',
          },
        ],
      });
      mockClient.query.mockResolvedValueOnce({
        rows: [{ exercise_entry_id: 'mixed-run', points: gps }],
      });
      mockClient.query.mockResolvedValueOnce({
        rows: [{ exercise_entry_id: 'mixed-run', points: series }],
      });
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const res =
        await exerciseStatsService.getPersonalRecordMatrix('user-123');

      const oneK = res.cardioPRs.find((p) => p.distanceStandard === '1k');
      const fiveK = res.cardioPRs.find((p) => p.distanceStandard === '5k');
      // GPS (6:00/km) decides the standard it covers, the series (5:00/km) the rest.
      expect(oneK?.bestTimeSeconds).toBe(360);
      expect(fiveK?.bestTimeSeconds).toBe(25 * 60);
      expect(fiveK?.timeBasis).toBe('best_split');
    });

    it('measures a track once and reuses the split until the track changes', async () => {
      const start = Date.parse('2026-08-01T07:00:00Z');
      const points = [0, 1, 2, 3, 4, 5, 6].map((km) => ({
        t: new Date(start + km * 300 * 1000).toISOString(),
        lat: 50,
        lon: 4,
        dist: km * 1000,
      }));
      const row = {
        id: 'cached-run',
        exercise_name: 'Cached Run',
        category: 'cardio',
        notes: null,
        entry_date: new Date('2026-08-01'),
        duration_minutes: 30,
        distance: 6,
        provider_name: 'garmin',
        detail_data: { activityType: { typeKey: 'running' } },
        exercise_source_id: null,
        has_gps_track: true,
        has_distance_series: false,
        track_version: '2026-08-01 07:30:00+00:7/',
      };
      mockClient.query.mockResolvedValueOnce({ rows: [row] });
      mockClient.query.mockResolvedValueOnce({
        rows: [{ exercise_entry_id: 'cached-run', points }],
      });
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      const first =
        await exerciseStatsService.getPersonalRecordMatrix('user-123');
      expect(mockClient.query).toHaveBeenCalledTimes(3);

      // Same track version: no track query this time.
      mockClient.query.mockClear();
      mockClient.query.mockResolvedValueOnce({ rows: [row] });
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      const second =
        await exerciseStatsService.getPersonalRecordMatrix('user-123');
      expect(mockClient.query).toHaveBeenCalledTimes(2);
      expect(second.cardioPRs).toEqual(first.cardioPRs);

      // A changed track is measured again.
      mockClient.query.mockClear();
      mockClient.query.mockResolvedValueOnce({
        rows: [{ ...row, track_version: '2026-08-02 08:00:00+00:7/' }],
      });
      mockClient.query.mockResolvedValueOnce({
        rows: [{ exercise_entry_id: 'cached-run', points }],
      });
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      await exerciseStatsService.getPersonalRecordMatrix('user-123');
      expect(mockClient.query).toHaveBeenCalledTimes(3);
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

    // #3469: a treadmill 5K test stopped after 2 seconds was saved as a 5 km
    // run with no track and took the 5 km record at 0:02. A time faster than
    // the sport allows comes from a wrong duration or distance, so it holds no
    // record, however the time was found.
    describe('times faster than the sport allows', () => {
      const runDetail = { activityType: { typeKey: 'running' } };
      // 5 km at 5:00 /km, as an indoor run's [active seconds, metres] rows.
      const steadySeries = [0, 1, 2, 3, 4, 5].map((km): [number, number] => [
        km * 300,
        km * 1000,
      ]);
      // A GPS track whose points carry the watch's own distance, which is
      // taken as recorded, from [seconds, metres] marks.
      const deviceTrack = (marks: [number, number][]) => {
        const start = Date.parse('2026-10-10T07:00:00Z');
        return marks.map(([seconds, meters]) => ({
          t: new Date(start + seconds * 1000).toISOString(),
          lat: 50,
          lon: 4,
          dist: meters,
        }));
      };

      it('keeps an untracked entry out of the records', async () => {
        mockClient.query.mockResolvedValueOnce({
          rows: [
            {
              id: 'treadmill-2s',
              exercise_name: 'Indoor Running',
              category: 'cardio',
              notes: null,
              entry_date: new Date('2026-11-08'),
              duration_minutes: 2 / 60,
              distance: 5,
              provider_name: null,
              detail_data: null,
              exercise_source_id: null,
            },
            {
              id: 'parkrun-5k',
              exercise_name: 'Parkrun',
              category: 'cardio',
              notes: null,
              entry_date: new Date('2026-11-01'),
              duration_minutes: 25,
              distance: 5,
              provider_name: 'garmin',
              detail_data: runDetail,
              exercise_source_id: null,
            },
          ],
        });
        mockClient.query.mockResolvedValueOnce({ rows: [] });

        const res =
          await exerciseStatsService.getPersonalRecordMatrix('user-123');

        const fiveK = res.cardioPRs.find(
          (pr) => pr.sportGroup === 'run' && pr.distanceStandard === '5k'
        );
        expect(fiveK?.activityId).toBe('parkrun-5k');
        expect(fiveK?.bestTimeSeconds).toBe(1500);
        expect(
          res.cardioPRs.filter((pr) => pr.activityId === 'treadmill-2s')
        ).toEqual([]);
      });

      it('still counts a fast but possible run', async () => {
        // 5 km in 13:00 is close to the world record, and about 6.4 m/s.
        mockClient.query.mockResolvedValueOnce({
          rows: [
            {
              id: 'track-5k',
              exercise_name: 'Track 5K',
              category: 'cardio',
              notes: null,
              entry_date: new Date('2026-09-12'),
              duration_minutes: 13,
              distance: 5,
              provider_name: 'garmin',
              detail_data: runDetail,
              exercise_source_id: null,
            },
          ],
        });
        mockClient.query.mockResolvedValueOnce({ rows: [] });

        const res =
          await exerciseStatsService.getPersonalRecordMatrix('user-123');

        const fiveK = res.cardioPRs.find(
          (pr) => pr.sportGroup === 'run' && pr.distanceStandard === '5k'
        );
        expect(fiveK?.activityId).toBe('track-5k');
        expect(fiveK?.bestTimeSeconds).toBe(780);
        expect(fiveK?.formattedPace).toBe('2:36 /km');
      });

      it('holds each sport to its own ceiling', async () => {
        // 10 km in 12:00 is 13.9 m/s: a fast bike time trial, but no run.
        mockClient.query.mockResolvedValueOnce({
          rows: [
            {
              id: 'typo-run',
              exercise_name: 'Morning Run',
              category: 'cardio',
              notes: null,
              entry_date: new Date('2026-09-20'),
              duration_minutes: 12,
              distance: 10,
              provider_name: 'garmin',
              detail_data: runDetail,
              exercise_source_id: null,
            },
            {
              id: 'easy-10k',
              exercise_name: 'Easy 10K',
              category: 'cardio',
              notes: null,
              entry_date: new Date('2026-09-14'),
              duration_minutes: 55,
              distance: 10,
              provider_name: 'garmin',
              detail_data: runDetail,
              exercise_source_id: null,
            },
            {
              id: 'time-trial',
              exercise_name: 'Time Trial',
              category: 'cardio',
              notes: null,
              entry_date: new Date('2026-09-21'),
              duration_minutes: 12,
              distance: 10,
              provider_name: 'garmin',
              detail_data: { activityType: { typeKey: 'cycling' } },
              exercise_source_id: null,
            },
          ],
        });
        mockClient.query.mockResolvedValueOnce({ rows: [] });

        const res =
          await exerciseStatsService.getPersonalRecordMatrix('user-123');

        const run10k = res.cardioPRs.find(
          (pr) => pr.sportGroup === 'run' && pr.distanceStandard === '10k'
        );
        const ride10k = res.cardioPRs.find(
          (pr) => pr.sportGroup === 'ride' && pr.distanceStandard === '10k'
        );
        expect(run10k?.activityId).toBe('easy-10k');
        expect(run10k?.bestTimeSeconds).toBe(3300);
        expect(ride10k?.activityId).toBe('time-trial');
        expect(ride10k?.bestTimeSeconds).toBe(720);
      });

      it('ignores a distance-series split faster than the sport allows', async () => {
        // The series jumps 1 km in one second; the rest of the run is real.
        const series: [number, number][] = [
          [0, 0],
          [300, 1000],
          [600, 2000],
          [601, 3000],
          [900, 4000],
          [1200, 5000],
        ];
        mockClient.query.mockResolvedValueOnce({
          rows: [
            {
              id: 'indoor-jump',
              exercise_name: 'Indoor Running',
              category: 'cardio',
              notes: null,
              entry_date: new Date('2026-10-03'),
              duration_minutes: 20,
              distance: 5,
              provider_name: null,
              detail_data: null,
              exercise_source_id: null,
              has_gps_track: false,
              has_distance_series: true,
            },
            {
              id: 'run-1k',
              exercise_name: 'Morning Run',
              category: 'cardio',
              notes: null,
              entry_date: new Date('2026-10-01'),
              duration_minutes: 4.5,
              distance: 1,
              provider_name: 'garmin',
              detail_data: runDetail,
              exercise_source_id: null,
            },
          ],
        });
        mockClient.query.mockResolvedValueOnce({
          rows: [{ exercise_entry_id: 'indoor-jump', points: series }],
        });
        mockClient.query.mockResolvedValueOnce({ rows: [] });

        const res =
          await exerciseStatsService.getPersonalRecordMatrix('user-123');

        const oneK = res.cardioPRs.find(
          (pr) => pr.sportGroup === 'run' && pr.distanceStandard === '1k'
        );
        const fiveK = res.cardioPRs.find(
          (pr) => pr.sportGroup === 'run' && pr.distanceStandard === '5k'
        );
        expect(oneK?.activityId).toBe('run-1k');
        expect(oneK?.bestTimeSeconds).toBe(270);
        // A longer stretch that takes the jump in still counts while its
        // average is within the ceiling (5 km in 20:00 here, and a mile in
        // about 3:03): the ceiling only refuses stretches faster than 12 m/s,
        // not every glitch.
        expect(fiveK?.activityId).toBe('indoor-jump');
        expect(fiveK?.bestTimeSeconds).toBe(1200);
        expect(fiveK?.timeBasis).toBe('best_split');
      });

      it('lets the distance series answer when the track split is too fast', async () => {
        // A jump in the watch's own distance gives an impossible split; the
        // series answers that distance instead.
        const gps = deviceTrack([
          [0, 0],
          [300, 1000],
          [600, 2000],
          [601, 3000],
          [900, 4000],
          [1200, 5000],
        ]);
        mockClient.query.mockResolvedValueOnce({
          rows: [
            {
              id: 'watch-jump',
              exercise_name: 'Morning Run',
              category: 'cardio',
              notes: null,
              entry_date: new Date('2026-10-10'),
              duration_minutes: 25,
              distance: 5,
              provider_name: 'garmin',
              detail_data: runDetail,
              exercise_source_id: null,
              has_gps_track: true,
              has_distance_series: true,
            },
          ],
        });
        mockClient.query.mockResolvedValueOnce({
          rows: [{ exercise_entry_id: 'watch-jump', points: gps }],
        });
        mockClient.query.mockResolvedValueOnce({
          rows: [{ exercise_entry_id: 'watch-jump', points: steadySeries }],
        });
        mockClient.query.mockResolvedValueOnce({ rows: [] });

        const res =
          await exerciseStatsService.getPersonalRecordMatrix('user-123');

        const oneK = res.cardioPRs.find(
          (pr) => pr.sportGroup === 'run' && pr.distanceStandard === '1k'
        );
        expect(oneK?.activityId).toBe('watch-jump');
        expect(oneK?.bestTimeSeconds).toBe(300);
        expect(oneK?.timeBasis).toBe('best_split');
      });

      it('checks track splits against the ceiling of their own sport', async () => {
        // A ride's first 10 km in 12:00 (13.9 m/s) is fast but possible; a
        // run's kilometre in 1:20 (12.5 m/s) is not.
        mockClient.query.mockResolvedValueOnce({
          rows: [
            {
              id: 'ride-20k',
              exercise_name: 'Evening Ride',
              category: 'cardio',
              notes: null,
              entry_date: new Date('2026-09-28'),
              duration_minutes: 40,
              distance: 20,
              provider_name: 'garmin',
              detail_data: { activityType: { typeKey: 'cycling' } },
              exercise_source_id: null,
              has_gps_track: true,
              has_distance_series: false,
            },
            {
              id: 'run-3k',
              exercise_name: 'Tempo Run',
              category: 'cardio',
              notes: null,
              entry_date: new Date('2026-09-27'),
              duration_minutes: 680 / 60,
              distance: 3,
              provider_name: 'garmin',
              detail_data: runDetail,
              exercise_source_id: null,
              has_gps_track: true,
              has_distance_series: false,
            },
          ],
        });
        mockClient.query.mockResolvedValueOnce({
          rows: [
            {
              exercise_entry_id: 'ride-20k',
              points: deviceTrack([
                [0, 0],
                [720, 10000],
                [2400, 20000],
              ]),
            },
            {
              exercise_entry_id: 'run-3k',
              points: deviceTrack([
                [0, 0],
                [300, 1000],
                [380, 2000],
                [680, 3000],
              ]),
            },
          ],
        });
        mockClient.query.mockResolvedValueOnce({ rows: [] });

        const res =
          await exerciseStatsService.getPersonalRecordMatrix('user-123');

        const ride10k = res.cardioPRs.find(
          (pr) => pr.sportGroup === 'ride' && pr.distanceStandard === '10k'
        );
        expect(ride10k?.activityId).toBe('ride-20k');
        expect(ride10k?.bestTimeSeconds).toBe(720);
        expect(ride10k?.timeBasis).toBe('best_split');
        expect(
          res.cardioPRs.find(
            (pr) => pr.sportGroup === 'run' && pr.distanceStandard === '1k'
          )
        ).toBeUndefined();
      });

      it("falls back to the activity's own pace when its track split is too fast", async () => {
        // The watch's distance covers the whole kilometre in one second, but
        // the run itself, 1 km in 5:00, is believable.
        mockClient.query.mockResolvedValueOnce({
          rows: [
            {
              id: 'jump-1k',
              exercise_name: 'Morning Run',
              category: 'cardio',
              notes: null,
              entry_date: new Date('2026-10-12'),
              duration_minutes: 5,
              distance: 1,
              provider_name: 'garmin',
              detail_data: runDetail,
              exercise_source_id: null,
              has_gps_track: true,
              has_distance_series: false,
            },
          ],
        });
        mockClient.query.mockResolvedValueOnce({
          rows: [
            {
              exercise_entry_id: 'jump-1k',
              points: deviceTrack([
                [0, 0],
                [150, 0],
                [151, 1000],
                [300, 1000],
              ]),
            },
          ],
        });
        mockClient.query.mockResolvedValueOnce({ rows: [] });

        const res =
          await exerciseStatsService.getPersonalRecordMatrix('user-123');

        const oneK = res.cardioPRs.find(
          (pr) => pr.sportGroup === 'run' && pr.distanceStandard === '1k'
        );
        expect(oneK?.activityId).toBe('jump-1k');
        expect(oneK?.bestTimeSeconds).toBe(300);
        expect(oneK?.timeBasis).toBe('activity_pace');
      });

      it('keeps the records a believable series sets for an entry with an impossible average', async () => {
        // The stored duration is 2 s, but a split never reads it: the series
        // covers 5 km in 25:00.
        mockClient.query.mockResolvedValueOnce({
          rows: [
            {
              id: 'series-2s',
              exercise_name: 'Indoor Running',
              category: 'cardio',
              notes: null,
              entry_date: new Date('2026-11-08'),
              duration_minutes: 2 / 60,
              distance: 5,
              provider_name: null,
              detail_data: null,
              exercise_source_id: null,
              has_gps_track: false,
              has_distance_series: true,
            },
          ],
        });
        mockClient.query.mockResolvedValueOnce({
          rows: [{ exercise_entry_id: 'series-2s', points: steadySeries }],
        });
        mockClient.query.mockResolvedValueOnce({ rows: [] });

        const res =
          await exerciseStatsService.getPersonalRecordMatrix('user-123');

        const fiveK = res.cardioPRs.find(
          (pr) => pr.sportGroup === 'run' && pr.distanceStandard === '5k'
        );
        expect(fiveK?.activityId).toBe('series-2s');
        expect(fiveK?.bestTimeSeconds).toBe(1500);
        expect(fiveK?.timeBasis).toBe('best_split');
      });

      it('takes the longest activity its sport allows for the best-effort card', async () => {
        // None is near a distance standard, so the card is looked up, longest
        // first. The walk at 8 m/s is under the run ceiling (12 m/s) but over
        // the walk one (7 m/s); the ride at 9.2 m/s (33 km/h) is over the walk
        // ceiling but under its own (30 m/s); the run after it is a second
        // allowed activity, and only one card is shown.
        const rows = [
          {
            id: 'walk-fast',
            exercise_name: 'Evening Walk',
            category: 'cardio',
            notes: null,
            entry_date: new Date('2026-11-03'),
            duration_minutes: 13.5,
            distance: 6.5,
            provider_name: 'garmin',
            detail_data: { activityType: { typeKey: 'walking' } },
            exercise_source_id: null,
          },
          {
            id: 'treadmill-6k',
            exercise_name: 'Indoor Running',
            category: 'cardio',
            notes: null,
            entry_date: new Date('2026-11-08'),
            duration_minutes: 2 / 60,
            distance: 6,
            provider_name: null,
            detail_data: null,
            exercise_source_id: null,
          },
          {
            id: 'ride-5k5',
            exercise_name: 'Evening Ride',
            category: 'cardio',
            notes: null,
            entry_date: new Date('2026-10-25'),
            duration_minutes: 10,
            distance: 5.5,
            provider_name: 'garmin',
            detail_data: { activityType: { typeKey: 'cycling' } },
            exercise_source_id: null,
          },
          {
            id: 'run-3k2',
            exercise_name: 'Lunch Run',
            category: 'cardio',
            notes: null,
            entry_date: new Date('2026-10-20'),
            duration_minutes: 15,
            distance: 3.2,
            provider_name: 'garmin',
            detail_data: runDetail,
            exercise_source_id: null,
          },
        ];
        mockClient.query.mockResolvedValueOnce({ rows });
        mockClient.query.mockResolvedValueOnce({ rows });
        mockClient.query.mockResolvedValueOnce({ rows: [] });

        const res =
          await exerciseStatsService.getPersonalRecordMatrix('user-123');

        expect(String(mockClient.query.mock.calls[1]?.[0])).toMatch(
          /LIMIT 10\b/
        );
        expect(res.cardioPRs).toHaveLength(1);
        expect(res.cardioPRs[0].id).toBe('pr-ride-longest');
        expect(res.cardioPRs[0].activityId).toBe('ride-5k5');
        expect(res.cardioPRs[0].label).toBe('Best Effort (5.5 km)');
        expect(res.cardioPRs[0].bestTimeSeconds).toBe(600);
      });

      it('shows a sport with no ceiling on the best-effort card as recorded', async () => {
        // Skiing has no speed limit, so 12 km in 10:00 (20 m/s) is shown.
        const ski = {
          id: 'ski-fast',
          exercise_name: 'Downhill Skiing',
          category: 'cardio',
          notes: null,
          entry_date: new Date('2026-02-23'),
          duration_minutes: 10,
          distance: 12,
          provider_name: null,
          detail_data: null,
          exercise_source_id: null,
        };
        mockClient.query.mockResolvedValueOnce({ rows: [ski] });
        mockClient.query.mockResolvedValueOnce({ rows: [ski] });
        mockClient.query.mockResolvedValueOnce({ rows: [] });

        const res =
          await exerciseStatsService.getPersonalRecordMatrix('user-123');

        expect(res.cardioPRs).toHaveLength(1);
        expect(res.cardioPRs[0].id).toBe('pr-other-longest');
        expect(res.cardioPRs[0].bestTimeSeconds).toBe(600);
      });
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

    // A course is matched by name, so a shortened version of the loop must not
    // post a faster "course time" than the full loop.
    it('does not let a shorter run of the same name set the course time', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            course_key: 'river loop',
            exercise_name: 'River Loop',
            category: 'running',
            activity_count: '3',
            avg_distance_km: 6.67, // the SQL average, dragged down by the short run
          },
        ],
      });
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'full',
            exercise_name: 'River Loop',
            entry_date: new Date('2026-07-24'),
            duration_minutes: 40, // 5:00 /km over 8 km
            distance: 8.0,
            avg_heart_rate: 150,
          },
          {
            id: 'cut-short',
            exercise_name: 'River Loop',
            entry_date: new Date('2026-07-20'),
            duration_minutes: 20, // only 4 km
            distance: 4.0,
            avg_heart_rate: 150,
          },
          {
            id: 'faster-full',
            exercise_name: 'River Loop',
            entry_date: new Date('2026-06-01'),
            duration_minutes: 38,
            distance: 8.0,
            avg_heart_rate: 150,
          },
        ],
      });

      const res = await exerciseStatsService.getMatchedCourses('user-123');

      expect(res.courses[0].bestTimeSeconds).toBe(38 * 60);
      expect(res.courses[0].bestPaceFormatted).toBe('4:45 /km');
      // The distance shown is the one the time is for, not the SQL average.
      expect(res.courses[0].totalDistanceMeters).toBe(8000);
      expect(res.courses[0].avgDistanceFormatted).toBe(8);
    });

    it('finds the best time across more than the five most recent runs', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            course_key: 'hill loop',
            exercise_name: 'Hill Loop',
            category: 'running',
            activity_count: '7',
            avg_distance_km: 5.0,
          },
        ],
      });
      const recent = Array.from({ length: 6 }, (_, i) => ({
        id: `recent-${i}`,
        exercise_name: 'Hill Loop',
        entry_date: new Date(`2026-07-${20 - i}`),
        duration_minutes: 30,
        distance: 5.0,
        avg_heart_rate: 150,
      }));
      mockClient.query.mockResolvedValueOnce({
        rows: [
          ...recent,
          {
            id: 'old-best',
            exercise_name: 'Hill Loop',
            entry_date: new Date('2025-01-01'),
            duration_minutes: 25,
            distance: 5.0,
            avg_heart_rate: 150,
          },
        ],
      });

      const res = await exerciseStatsService.getMatchedCourses('user-123');

      expect(res.courses[0].recentActivities.length).toBe(5);
      expect(res.courses[0].bestTimeSeconds).toBe(25 * 60);
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
