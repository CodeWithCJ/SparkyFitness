import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/exerciseStatsService.js', () => ({
  default: {
    getExerciseStatsSummary: vi.fn(),
    queryExerciseActivities: vi.fn(),
    getPersonalRecordMatrix: vi.fn(),
    getMatchedCourses: vi.fn(),
  },
}));

vi.mock('../services/trainingReviewService.js', () => ({
  default: {
    getTrainingReview: vi.fn(),
  },
}));

vi.mock('../services/runReviewService.js', () => ({
  default: {
    getRunReview: vi.fn(),
  },
}));

vi.mock('../services/preferenceService.js', () => ({
  default: {
    getUserPreferences: vi.fn(),
  },
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

import exerciseStatsService from '../services/exerciseStatsService.js';
import trainingReviewService from '../services/trainingReviewService.js';
import runReviewService from '../services/runReviewService.js';
import preferenceService from '../services/preferenceService.js';
import { buildExerciseStatsTools } from '../ai/tools/exerciseStatsTools.js';
import { toolOpts } from './helpers/toolExecutionOptions.js';

const opts = toolOpts;

const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred.\n\nSuggestion: Do NOT retry the same call — it will fail the same way. Tell the user what failed and stop.';

const svc = exerciseStatsService as unknown as {
  getExerciseStatsSummary: ReturnType<typeof vi.fn>;
  queryExerciseActivities: ReturnType<typeof vi.fn>;
  getPersonalRecordMatrix: ReturnType<typeof vi.fn>;
  getMatchedCourses: ReturnType<typeof vi.fn>;
};

function getTool() {
  const tools = buildExerciseStatsTools('user-1', 'UTC');
  return tools.sparky_get_exercise_stats;
}

describe('sparky_get_exercise_stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a stats summary (inferred from {})', async () => {
    svc.getExerciseStatsSummary.mockResolvedValue({
      interval: 'month',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      unitSystem: 'metric',
      totals: {
        totalDistanceMeters: 42000,
        totalDistanceFormatted: '42.0',
        totalDurationMinutes: 300,
        totalCaloriesBurned: 2500,
        workoutCount: 12,
        avgHeartRate: 145,
        totalElevationGainMeters: 350,
        totalMovingDurationMinutes: 290,
        totalLiftedVolumeKg: 8000,
        totalReps: 240,
      },
      comparisonWithPreviousPeriod: {
        distanceChangePercent: 10,
        durationChangePercent: -5,
        caloriesChangePercent: 8,
        workoutCountChangePercent: 20,
      },
      intervalsBreakdown: [],
      heartRateZoneDistribution: {},
    });
    const result = await getTool().execute!({}, opts);
    expect(result).toBe(
      '# Exercise Stats (bucketed by month, 2026-01-01 → 2026-01-31)\n' +
        '\n' +
        '- Workouts: 12 (+20% vs previous)\n' +
        '- Distance: 42.0 km (+10%)\n' +
        '- Duration: 300 min (-5%)\n' +
        '- Calories: 2500 (+8%)\n' +
        '- Lifted volume: 8000 kg over 240 reps\n' +
        '- Elevation gain: 350 m\n' +
        '- Avg heart rate: 145'
    );
  });

  it('renders n/a avg heart rate when null', async () => {
    svc.getExerciseStatsSummary.mockResolvedValue({
      interval: 'week',
      startDate: '2026-01-01',
      endDate: '2026-01-07',
      unitSystem: 'metric',
      totals: {
        totalDistanceMeters: 0,
        totalDistanceFormatted: '0.0',
        totalDurationMinutes: 0,
        totalCaloriesBurned: 0,
        workoutCount: 0,
        avgHeartRate: null,
        totalElevationGainMeters: 0,
        totalMovingDurationMinutes: 0,
        totalLiftedVolumeKg: 0,
        totalReps: 0,
      },
      comparisonWithPreviousPeriod: {
        distanceChangePercent: 0,
        durationChangePercent: 0,
        caloriesChangePercent: 0,
        workoutCountChangePercent: 0,
      },
      intervalsBreakdown: [],
      heartRateZoneDistribution: {},
    });
    const result = await getTool().execute!(
      { action: 'stats_summary', interval: 'week' },
      opts
    );
    expect(result).toContain('- Avg heart rate: n/a');
  });

  it('queries activities (inferred from search_keyword)', async () => {
    svc.queryExerciseActivities.mockResolvedValue({
      totalCount: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
      items: [
        {
          id: 'a1',
          userId: 'user-1',
          exerciseName: 'Morning Run',
          category: 'cardio',
          entryDate: '2026-01-15',
          entryTime: null,
          durationMinutes: 30,
          movingDurationMinutes: 29,
          distanceMeters: 5000,
          distanceFormatted: '5.0',
          avgPaceSecondsPerKm: 360,
          formattedPace: '6:00/km',
          caloriesBurned: 300,
          avgHeartRate: 150,
          source: null,
          notes: null,
          hasGpsTrack: true,
        },
      ],
    });
    const result = await getTool().execute!({ search_keyword: 'run' }, opts);
    expect(result).toBe(
      '# Activities (page 1/1, 1 total)\n\n' +
        '**Morning Run** (2026-01-15) — 5.0 km, 30 min @ 6:00/km\n  ID: a1'
    );
  });

  it('renders no activities when empty', async () => {
    svc.queryExerciseActivities.mockResolvedValue({
      totalCount: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
      items: [],
    });
    const result = await getTool().execute!(
      { action: 'query_activities' },
      opts
    );
    expect(result).toBe(
      '# Activities (page 1/0, 0 total)\n\nNo results found.'
    );
  });

  it('renders personal records', async () => {
    svc.getPersonalRecordMatrix.mockResolvedValue({
      cardioPRs: [
        {
          id: 'pr1',
          category: 'cardio',
          distanceStandard: '5k',
          label: '5K',
          bestTimeSeconds: 1500,
          formattedTime: '25:00',
          avgPaceSecondsPerKm: 300,
          formattedPace: '5:00/km',
          activityId: 'act1',
          activityName: 'Fast 5K',
          achievedAt: '2026-01-10',
        },
      ],
      strength1RMs: [
        {
          exerciseName: 'Bench Press',
          estimatedOneRMKg: 100,
          weightKg: 90,
          reps: 3,
          achievedAt: '2026-01-12',
        },
      ],
    });
    const result = await getTool().execute!(
      { action: 'personal_records' },
      opts
    );
    expect(result).toBe(
      '# Cardio Personal Records\n\n' +
        '**5K** — 25:00 (5:00/km) on 2026-01-10\n  Fast 5K' +
        '\n\n' +
        '# Strength 1RM Estimates\n\n' +
        '**Bench Press** — 100 kg (from 90 kg × 3) on 2026-01-12'
    );
  });

  it('renders matched courses', async () => {
    svc.getMatchedCourses.mockResolvedValue({
      courses: [
        {
          courseId: 'c1',
          courseName: 'River Loop',
          category: 'cardio',
          totalDistanceMeters: 20000,
          avgDistanceFormatted: '5.0',
          activityCount: 4,
          bestTimeSeconds: 1500,
          bestPaceFormatted: '5:00/km',
          recentActivities: [],
        },
      ],
    });
    const result = await getTool().execute!(
      { action: 'matched_courses' },
      opts
    );
    expect(result).toBe(
      '# Matched Courses\n\n' +
        '**River Loop** (4 activities) — avg 5.0 km, best pace 5:00/km\n  ID: c1'
    );
  });

  it('returns DB_ERROR when the service throws', async () => {
    svc.getExerciseStatsSummary.mockRejectedValue(new Error('boom'));
    const result = await getTool().execute!({ action: 'stats_summary' }, opts);
    expect(result).toBe(DB_ERROR_TEXT);
  });
  describe('training_review', () => {
    const reviewSvc = trainingReviewService as unknown as {
      getTrainingReview: ReturnType<typeof vi.fn>;
    };
    const baseReview = {
      window: { from: '2026-09-12', to: '2026-10-09', days: 28 },
      sessions: 8,
      sessionsPerWeek: 2,
      enoughData: true,
      stalls: [
        {
          exerciseId: 'e1',
          exerciseName: 'Squat',
          sessions: 5,
          stalledSessions: 3,
          bestEstimatedOneRepMaxKg: 116.7,
          lastEstimatedOneRepMaxKg: 113.3,
          lastDate: '2026-10-04',
        },
      ],
      effort: {
        sampledSets: 12,
        averageRpe: 8.5,
        averageRir: null,
        nearFailure: ['Deadlift'],
      },
      muscleSets: { chest: 12, quadriceps: 9 },
      untrainedMuscles: ['lats'],
    };

    beforeEach(() => {
      (
        preferenceService as unknown as {
          getUserPreferences: ReturnType<typeof vi.fn>;
        }
      ).getUserPreferences.mockResolvedValue({ default_weight_unit: 'kg' });
    });

    it("shows weights in the lifter's unit", async () => {
      (
        preferenceService as unknown as {
          getUserPreferences: ReturnType<typeof vi.fn>;
        }
      ).getUserPreferences.mockResolvedValue({ default_weight_unit: 'lbs' });
      reviewSvc.getTrainingReview.mockResolvedValue(baseReview);
      const result = (await getTool().execute!(
        { action: 'training_review' },
        opts
      )) as string;
      expect(result).toContain('best 257.3 lbs, last 249.8 lbs on 2026-10-04');
      expect(result).not.toContain(' kg');
    });

    it('passes the window and renders stalls, effort and coverage', async () => {
      reviewSvc.getTrainingReview.mockResolvedValue(baseReview);
      const result = (await getTool().execute!(
        { action: 'training_review', window_days: 14 },
        opts
      )) as string;

      expect(reviewSvc.getTrainingReview).toHaveBeenCalledWith('user-1', 14);
      expect(result).toContain(
        '# Training Review (2026-09-12 → 2026-10-09, 28 days)'
      );
      expect(result).toContain('- Sessions: 8 (2 per week)');
      expect(result).toContain(
        '- **Squat**: 3 sessions in a row without beating the best estimated 1RM (best 116.7 kg, last 113.3 kg on 2026-10-04; 5 sessions)'
      );
      expect(result).toContain('- Average RPE: 8.5');
      expect(result).not.toContain('Average RIR');
      expect(result).toContain('- Taken to or near failure: Deadlift');
      expect(result).toContain('- chest: 12\n- quadriceps: 9');
      expect(result).toContain('Trained earlier but not in this window: lats.');
      expect(result).not.toContain('Not enough data');
    });

    it('tells the model not to act on fewer than three sessions', async () => {
      reviewSvc.getTrainingReview.mockResolvedValue({
        ...baseReview,
        sessions: 1,
        enoughData: false,
        stalls: [],
        effort: {
          sampledSets: 0,
          averageRpe: null,
          averageRir: null,
          nearFailure: [],
        },
      });
      const result = (await getTool().execute!(
        { action: 'training_review' },
        opts
      )) as string;

      expect(reviewSvc.getTrainingReview).toHaveBeenCalledWith(
        'user-1',
        undefined
      );
      expect(result).toContain('Not enough data for a trend');
      expect(result).toContain('None. Every lift with 3+ sessions');
      expect(result).toContain('No RPE or RIR was logged');
    });

    it('rejects a window outside 7-90 days', async () => {
      const result = (await getTool().execute!(
        { action: 'training_review', window_days: 200 },
        opts
      )) as string;
      expect(reviewSvc.getTrainingReview).not.toHaveBeenCalled();
      expect(result).toContain('window_days');
    });

    it('returns DB_ERROR when the review fails', async () => {
      reviewSvc.getTrainingReview.mockRejectedValue(new Error('boom'));
      const result = await getTool().execute!(
        { action: 'training_review' },
        opts
      );
      expect(result).toBe(DB_ERROR_TEXT);
    });
  });
  describe('run_review', () => {
    const runSvc = runReviewService as unknown as {
      getRunReview: ReturnType<typeof vi.fn>;
    };
    const prefs = preferenceService as unknown as {
      getUserPreferences: ReturnType<typeof vi.fn>;
    };
    const baseRun = {
      review: {
        window: { from: '2026-09-17', to: '2026-10-14', days: 28 },
        runs: 6,
        runsPerWeek: 1.5,
        enoughData: true,
        totalKm: 40,
        longestRunKm: 12,
        weeks: [
          { start: '2026-09-17', km: 8, runs: 1 },
          { start: '2026-09-24', km: 10, runs: 2 },
          { start: '2026-10-01', km: 10, runs: 1 },
          { start: '2026-10-08', km: 12, runs: 2 },
        ],
        jumps: [
          {
            weekStart: '2026-10-08',
            fromKm: 10,
            toKm: 12,
            increasePercent: 20,
          },
        ],
        paceSecPerKm: 330,
        previousPaceSecPerKm: 345,
        paceChangePercent: -4.3,
        lastRunDay: '2026-10-13',
      },
      load: {
        weeks: [],
        acute: 300,
        chronic: 200,
        ratio: 1.5,
        status: 'high',
        restDays: 1,
        recovery: 'takeRest',
      },
    };

    beforeEach(() => {
      prefs.getUserPreferences.mockResolvedValue({
        default_distance_unit: 'km',
      });
    });

    it('renders runs, weekly distance, jumps, pace and load', async () => {
      runSvc.getRunReview.mockResolvedValue(baseRun);
      const result = (await getTool().execute!(
        { action: 'run_review', window_days: 28 },
        opts
      )) as string;

      expect(runSvc.getRunReview).toHaveBeenCalledWith('user-1', 28);
      expect(result).toContain(
        '# Run Review (2026-09-17 → 2026-10-14, 28 days)'
      );
      expect(result).toContain('- Runs: 6 (1.5 per week)');
      expect(result).toContain('longest run 12 km');
      expect(result).toContain('Week of 2026-10-08 rose 20% (10 km to 12 km)');
      expect(result).toContain('- Average pace: 5:30 /km');
      expect(result).toContain('(4.3% faster)');
      expect(result).toContain('- Status: high');
      expect(result).toContain('- Recovery hint: takeRest');
      expect(result).not.toContain('Not enough data');
    });

    it('shows miles and min/mi for a miles user', async () => {
      prefs.getUserPreferences.mockResolvedValue({
        default_distance_unit: 'miles',
      });
      runSvc.getRunReview.mockResolvedValue(baseRun);
      const result = (await getTool().execute!(
        { action: 'run_review' },
        opts
      )) as string;
      expect(runSvc.getRunReview).toHaveBeenCalledWith('user-1', undefined);
      expect(result).toContain('longest run 7.5 mi');
      expect(result).toContain('- Average pace: 8:51 /mi');
    });

    it('warns below three runs and when load has no history', async () => {
      runSvc.getRunReview.mockResolvedValue({
        review: {
          ...baseRun.review,
          runs: 1,
          enoughData: false,
          jumps: [],
          paceSecPerKm: null,
          previousPaceSecPerKm: null,
          paceChangePercent: null,
        },
        load: { ...baseRun.load, status: 'learning', ratio: null },
      });
      const result = (await getTool().execute!(
        { action: 'run_review' },
        opts
      )) as string;
      expect(result).toContain('Not enough data for a trend');
      expect(result).toContain('so no pace');
      expect(result).toContain('Not enough history yet to judge load');
    });

    it('rejects a window outside 7-90 days', async () => {
      const result = (await getTool().execute!(
        { action: 'run_review', window_days: 3 },
        opts
      )) as string;
      expect(runSvc.getRunReview).not.toHaveBeenCalled();
      expect(result).toContain('window_days');
    });

    it('returns DB_ERROR when the review fails', async () => {
      runSvc.getRunReview.mockRejectedValue(new Error('boom'));
      const result = await getTool().execute!({ action: 'run_review' }, opts);
      expect(result).toBe(DB_ERROR_TEXT);
    });
  });
});
