import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/exerciseStatsService.js', () => ({
  default: {
    getExerciseStatsSummary: vi.fn(),
    queryExerciseActivities: vi.fn(),
    getPersonalRecordMatrix: vi.fn(),
    getMatchedCourses: vi.fn(),
  },
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

import exerciseStatsService from '../services/exerciseStatsService.js';
import { buildExerciseStatsTools } from '../ai/tools/exerciseStatsTools.js';

const opts = { toolCallId: 'tc-1', messages: [] };

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
      '# Exercise Stats (month: 2026-01-01 → 2026-01-31)\n' +
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
});
