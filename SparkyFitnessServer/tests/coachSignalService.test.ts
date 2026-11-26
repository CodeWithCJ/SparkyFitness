import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getNutritionData: vi.fn(),
  getUserGoalsForRange: vi.fn(),
  resolveWaterTotalsForDate: vi.fn(),
  getRecentExerciseSessions: vi.fn(),
  resolveZonesForUser: vi.fn(),
  getSleepHistory: vi.fn(),
  getTrainingLoad: vi.fn(),
  getRecentWeights: vi.fn(),
  getLoggedDates: vi.fn(),
  getUserPreferences: vi.fn(),
  getPersonalRecordMatrix: vi.fn(),
  getTrainingReview: vi.fn(),
  getOverview: vi.fn(),
  getHabitHistory: vi.fn(),
  getCheckinsForDate: vi.fn(),
}));

vi.mock('../models/reportRepository.js', () => ({
  default: { getNutritionData: mocks.getNutritionData },
}));
vi.mock('../services/goalService.js', () => ({
  default: { getUserGoalsForRange: mocks.getUserGoalsForRange },
}));
vi.mock('../services/hydrationTotalsService.js', () => ({
  default: { resolveWaterTotalsForDate: mocks.resolveWaterTotalsForDate },
}));
vi.mock('../models/coachSignalRepository.js', () => ({
  default: { getRecentExerciseSessions: mocks.getRecentExerciseSessions },
}));
vi.mock('../services/heartRateZoneService.js', () => ({
  default: { resolveZonesForUser: mocks.resolveZonesForUser },
}));
vi.mock('../models/sleepScienceRepository.js', () => ({
  default: { getSleepHistory: mocks.getSleepHistory },
}));
vi.mock('../services/reportService.js', () => ({
  default: { getTrainingLoad: mocks.getTrainingLoad },
}));
vi.mock('../models/engagementRepository.js', () => ({
  default: {
    getRecentWeights: mocks.getRecentWeights,
    getLoggedDates: mocks.getLoggedDates,
  },
}));
vi.mock('../models/preferenceRepository.js', () => ({
  default: { getUserPreferences: mocks.getUserPreferences },
}));
vi.mock('../services/exerciseStatsService.js', () => ({
  default: { getPersonalRecordMatrix: mocks.getPersonalRecordMatrix },
}));
vi.mock('../services/trainingReviewService.js', () => ({
  getTrainingReview: mocks.getTrainingReview,
}));
vi.mock('../services/cycleService.js', () => ({
  default: { getOverview: mocks.getOverview },
}));
vi.mock('../models/habitRepository.js', () => ({
  default: { getHabitHistory: mocks.getHabitHistory },
}));
vi.mock('../models/moodRepository.js', () => ({
  default: { getCheckinsForDate: mocks.getCheckinsForDate },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import { getCoachSignals } from '../services/coachSignalService.js';

const NOW = new Date('2026-11-25T18:05:00Z');
const day = (offset: number) =>
  new Date(Date.UTC(2026, 10, 25 + offset)).toISOString().slice(0, 10);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getNutritionData.mockResolvedValue([]);
  mocks.getUserGoalsForRange.mockResolvedValue({});
  mocks.resolveWaterTotalsForDate.mockResolvedValue({ water_ml: 0 });
  mocks.getRecentExerciseSessions.mockResolvedValue([]);
  mocks.resolveZonesForUser.mockResolvedValue({
    floors: [100, 120, 140, 160, 180],
  });
  mocks.getSleepHistory.mockResolvedValue([]);
  mocks.getTrainingLoad.mockResolvedValue({ ratio: null });
  mocks.getRecentWeights.mockResolvedValue([]);
  mocks.getLoggedDates.mockResolvedValue([]);
  mocks.getUserPreferences.mockResolvedValue({ goal_mode: 'maintain' });
  mocks.getPersonalRecordMatrix.mockResolvedValue({
    cardioPRs: [],
    strength1RMs: [],
  });
  mocks.getCheckinsForDate.mockResolvedValue([]);
});

const options = { prSinceDay: '2026-11-25' };

describe('percent of goal', () => {
  it('works out today’s share of each goal, and null where there is no goal', async () => {
    mocks.getNutritionData.mockResolvedValue([
      {
        date: day(0),
        calories: 1150,
        protein: 90,
        carbs: 100,
        dietary_fiber: 10,
      },
    ]);
    mocks.getUserGoalsForRange.mockResolvedValue({
      [day(0)]: {
        calories: 2300,
        protein: 150,
        carbs: 0,
        dietary_fiber: 30,
        water_goal_ml: 2000,
      },
    });
    mocks.resolveWaterTotalsForDate.mockResolvedValue({ water_ml: 500 });
    const signals = await getCoachSignals('u1', 'UTC', NOW, options);
    expect(signals).toMatchObject({
      calories_pct_of_goal: 50,
      protein_pct_of_goal: 60,
      carbs_pct_of_goal: null,
      fiber_pct_of_goal: 33,
      water_pct_of_goal: 25,
    });
  });

  it('counts a day with no food as 0%, not unknown', async () => {
    mocks.getUserGoalsForRange.mockResolvedValue({
      [day(0)]: { calories: 2000 },
    });
    expect((await getCoachSignals('u1', 'UTC', NOW)).calories_pct_of_goal).toBe(
      0
    );
  });
});

describe('workouts', () => {
  const row = (over: object) => ({
    id: 'e',
    exercise_name: 'Back squat',
    category: 'Strength',
    notes: null,
    entry_date: day(-1),
    entry_time: '18:00:00',
    record_timezone: null,
    duration_minutes: 50,
    avg_heart_rate: null,
    workout_effort: null,
    provider_name: null,
    detail_data: null,
    exercise_source_id: null,
    ...over,
  });

  it('counts the hours since the last strength workout and since hard cardio', async () => {
    mocks.getRecentExerciseSessions.mockResolvedValue([
      row({}),
      row({
        id: 'r',
        exercise_name: 'Running',
        category: 'Cardio',
        entry_date: day(0),
        entry_time: '07:00:00',
        avg_heart_rate: 170,
      }),
    ]);
    const signals = await getCoachSignals('u1', 'UTC', NOW);
    expect(signals.hours_since_strength).toBe(24.1);
    expect(signals.hours_since_hard_cardio).toBe(11.1);
  });

  it('does not count an easy run as hard, nor a device summary as a workout', async () => {
    mocks.getRecentExerciseSessions.mockResolvedValue([
      row({
        exercise_name: 'Running',
        category: 'Cardio',
        avg_heart_rate: 110,
      }),
      row({
        id: 'p',
        exercise_name: 'Active Calories',
        duration_minutes: 1440,
      }),
    ]);
    const signals = await getCoachSignals('u1', 'UTC', NOW);
    expect(signals.hours_since_hard_cardio).toBeNull();
    expect(signals.hours_since_strength).toBeNull();
  });

  it('counts a high effort rating as hard', async () => {
    mocks.getRecentExerciseSessions.mockResolvedValue([
      row({ exercise_name: 'Running', category: 'Cardio', workout_effort: 8 }),
    ]);
    expect(
      (await getCoachSignals('u1', 'UTC', NOW)).hours_since_hard_cardio
    ).not.toBeNull();
  });
});

describe('sleep and load', () => {
  it('compares last night with the nights before it, in minutes', async () => {
    mocks.getSleepHistory.mockResolvedValue(
      [5, 7, 7, 7, 7].map((hours) => ({ timeAsleepHours: hours }))
    );
    mocks.getTrainingLoad.mockResolvedValue({ ratio: 1.456 });
    const signals = await getCoachSignals('u1', 'UTC', NOW);
    expect(signals.sleep_minutes_vs_avg).toBe(-120);
    expect(signals.training_load_ratio).toBe(1.46);
  });

  it('gives no comparison with fewer than four nights', async () => {
    mocks.getSleepHistory.mockResolvedValue([
      { timeAsleepHours: 5 },
      { timeAsleepHours: 7 },
    ]);
    expect(
      (await getCoachSignals('u1', 'UTC', NOW)).sleep_minutes_vs_avg
    ).toBeNull();
  });
});

describe('weight trend', () => {
  const weights = (newest: number, oldest: number) => [
    { weight: newest },
    { weight: (newest + oldest) / 2 },
    { weight: oldest },
  ];
  it.each([
    ['cut', weights(79, 80), 'toward'],
    ['cut', weights(81, 80), 'away'],
    ['bulk', weights(81, 80), 'toward'],
    ['cut', weights(80.1, 80.2), 'flat'],
  ])('reads %s with %j as %s', async (goal_mode, rows, expected) => {
    mocks.getUserPreferences.mockResolvedValue({ goal_mode });
    mocks.getRecentWeights.mockResolvedValue(rows);
    expect(
      (await getCoachSignals('u1', 'UTC', NOW)).weight_trend_direction
    ).toBe(expected);
  });

  it('is unknown with no direction to head, or too few weigh-ins', async () => {
    mocks.getRecentWeights.mockResolvedValue(weights(79, 80));
    expect(
      (await getCoachSignals('u1', 'UTC', NOW)).weight_trend_direction
    ).toBeNull();
    mocks.getUserPreferences.mockResolvedValue({ goal_mode: 'cut' });
    mocks.getRecentWeights.mockResolvedValue([{ weight: 80 }]);
    expect(
      (await getCoachSignals('u1', 'UTC', NOW)).weight_trend_direction
    ).toBeNull();
  });
});

describe('logging', () => {
  it('counts days since the last log and the streak', async () => {
    mocks.getLoggedDates.mockResolvedValue([
      { entry_date: day(-1) },
      { entry_date: day(-2) },
      { entry_date: day(-3) },
    ]);
    const signals = await getCoachSignals('u1', 'UTC', NOW);
    expect(signals.days_since_last_log).toBe(1);
    expect(signals.logging_streak_days).toBe(3);
  });
  it('is null days with nothing logged', async () => {
    expect(
      (await getCoachSignals('u1', 'UTC', NOW)).days_since_last_log
    ).toBeNull();
  });
});

describe('optional signals', () => {
  it('counts personal records set since the day asked', async () => {
    mocks.getPersonalRecordMatrix.mockResolvedValue({
      cardioPRs: [{ achievedAt: day(0) }, { achievedAt: day(-30) }],
      strength1RMs: [{ achievedAt: `${day(0)}T10:00:00Z` }],
    });
    expect(
      (await getCoachSignals('u1', 'UTC', NOW, options))
        .new_prs_since_last_checkin
    ).toBe(2);
    expect(
      (await getCoachSignals('u1', 'UTC', NOW)).new_prs_since_last_checkin
    ).toBeUndefined();
  });

  it('counts goal streaks ending yesterday, stopping at the first miss', async () => {
    mocks.getNutritionData.mockResolvedValue([
      { date: day(-1), protein: 150, calories: 2300 },
      { date: day(-2), protein: 160, calories: 2400 },
      { date: day(-3), protein: 100, calories: 2300 },
      { date: day(-4), protein: 150, calories: 2300 },
    ]);
    mocks.getUserGoalsForRange.mockImplementation(async () =>
      Object.fromEntries(
        [-1, -2, -3, -4].map((d) => [day(d), { protein: 150, calories: 2300 }])
      )
    );
    const signals = await getCoachSignals('u1', 'UTC', NOW, {
      includeGoalStreaks: true,
    });
    expect(signals.protein_goal_hit_streak_days).toBe(2);
    // 2400 of 2300 is within 10%.
    expect(signals.calorie_goal_hit_streak_days).toBe(4);
  });

  it('counts stalled lifts only once there is enough training to judge', async () => {
    mocks.getTrainingReview.mockResolvedValue({
      enoughData: true,
      stalls: [{}, {}],
    });
    expect(
      (await getCoachSignals('u1', 'UTC', NOW, { includeStalls: true }))
        .stalled_lifts
    ).toBe(2);
    mocks.getTrainingReview.mockResolvedValue({
      enoughData: false,
      stalls: [{}],
    });
    expect(
      (await getCoachSignals('u1', 'UTC', NOW, { includeStalls: true }))
        .stalled_lifts
    ).toBeNull();
  });

  it('flags a mood check-in today', async () => {
    expect((await getCoachSignals('u1', 'UTC', NOW)).mood_checkin_today).toBe(
      0
    );
    mocks.getCheckinsForDate.mockResolvedValue([{}]);
    expect((await getCoachSignals('u1', 'UTC', NOW)).mood_checkin_today).toBe(
      1
    );
  });

  it('reads the focus habit: done today, and its streak', async () => {
    mocks.getHabitHistory.mockResolvedValue([
      { value: 'true', entry_date: day(0) },
      { value: 'true', entry_date: day(-1) },
      { value: 'false', entry_date: day(-2) },
    ]);
    const signals = await getCoachSignals('u1', 'UTC', NOW, {
      focusHabitId: 'h1',
    });
    expect(signals.focus_habit_done_today).toBe(1);
    expect(signals.focus_habit_streak_days).toBe(2);
  });

  it('gives the cycle phase only when the hub knows it', async () => {
    mocks.getOverview.mockResolvedValue({ phase: 'luteal' });
    expect(
      (await getCoachSignals('u1', 'UTC', NOW, { includeCycle: true }))
        .cycle_phase
    ).toBe('luteal');
    mocks.getOverview.mockResolvedValue({ phase: 'unknown' });
    expect(
      (await getCoachSignals('u1', 'UTC', NOW, { includeCycle: true }))
        .cycle_phase
    ).toBeNull();
    expect(
      (await getCoachSignals('u1', 'UTC', NOW)).cycle_phase
    ).toBeUndefined();
  });

  it('leaves one part’s signals out when it fails, not the whole snapshot', async () => {
    mocks.getSleepHistory.mockRejectedValue(new Error('db'));
    mocks.getLoggedDates.mockResolvedValue([{ entry_date: day(-1) }]);
    const signals = await getCoachSignals('u1', 'UTC', NOW);
    expect(signals.sleep_minutes_vs_avg).toBeUndefined();
    expect(signals.logging_streak_days).toBe(1);
  });
});
