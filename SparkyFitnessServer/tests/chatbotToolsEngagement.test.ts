import { vi, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { buildEngagementTools } from '../ai/tools/engagementTools.js';
import engagementRepository from '../models/engagementRepository.js';

vi.mock('../models/engagementRepository', () => ({
  default: {
    getLastExerciseDate: vi.fn(),
    getRecentWeights: vi.fn(),
    getWeeklyLoggedDayCount: vi.fn(),
    getLoggedDates: vi.fn(),
    getTodayActivityCounts: vi.fn(),
  },
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

const opts = { toolCallId: 'tc-1', messages: [] };
const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred. Please try again.\n\nSuggestion: If the issue persists, contact support.';

// pg returns DATE columns as local-midnight Date objects; fixtures mirror that.
const day = (dayOfMonth: number) => new Date(2026, 5, dayOfMonth);

function success(title: string, data: unknown): string {
  return `# ${title}\n\n${JSON.stringify(data, null, 2)}`;
}

let tools: ReturnType<typeof buildEngagementTools>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // A UTC instant ("today" is computed via todayInZone, so a local-time
  // anchor would make the suite host-timezone-dependent).
  vi.setSystemTime(new Date('2026-06-11T12:00:00Z'));
  tools = buildEngagementTools('user-1', 'UTC');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sparky_check_engagement', () => {
  it('composes missed-workout, plateau and streak-building triggers', async () => {
    vi.mocked(engagementRepository.getLastExerciseDate).mockResolvedValue(
      day(1)
    );
    vi.mocked(engagementRepository.getRecentWeights).mockResolvedValue([
      { weight: '80.2', entry_date: day(10) },
      { weight: '80.1', entry_date: day(9) },
    ]);
    vi.mocked(engagementRepository.getWeeklyLoggedDayCount).mockResolvedValue(
      5
    );

    const result = await tools.sparky_check_engagement.execute!({}, opts);

    expect(result).toBe(
      success('Engagement Triggers', {
        triggers: [
          {
            type: 'missed_workout',
            message: 'No workout logged in 10 days. Time to get moving!',
          },
          {
            type: 'weight_plateau',
            message:
              "Your weight has been stable for the past week. Consider adjusting your routine if you're trying to change.",
          },
          {
            type: 'streak_building',
            message: "You're on a 5-day logging streak. Keep going!",
          },
        ],
        trigger_count: 3,
        checked_at: new Date().toISOString(),
      })
    );
    expect(engagementRepository.getLastExerciseDate).toHaveBeenCalledWith(
      'user-1'
    );
    expect(engagementRepository.getWeeklyLoggedDayCount).toHaveBeenCalledWith(
      'user-1',
      '2026-06-11'
    );
  });

  it('reports no_workouts and achievement for a workout-free week of logging', async () => {
    vi.mocked(engagementRepository.getLastExerciseDate).mockResolvedValue(null);
    vi.mocked(engagementRepository.getRecentWeights).mockResolvedValue([]);
    vi.mocked(engagementRepository.getWeeklyLoggedDayCount).mockResolvedValue(
      7
    );

    const result = await tools.sparky_check_engagement.execute!({}, opts);

    expect(result).toBe(
      success('Engagement Triggers', {
        triggers: [
          {
            type: 'no_workouts',
            message:
              'No workouts logged yet. Start your fitness journey today!',
          },
          {
            type: 'achievement',
            message:
              "Amazing! You've logged data every day for the past week. Keep it up!",
          },
        ],
        trigger_count: 2,
        checked_at: new Date().toISOString(),
      })
    );
  });

  it('finds no triggers for a recently active user with moving weight', async () => {
    vi.mocked(engagementRepository.getLastExerciseDate).mockResolvedValue(
      day(10)
    );
    vi.mocked(engagementRepository.getRecentWeights).mockResolvedValue([
      { weight: '81', entry_date: day(10) },
      { weight: '80', entry_date: day(9) },
    ]);
    vi.mocked(engagementRepository.getWeeklyLoggedDayCount).mockResolvedValue(
      2
    );

    const result = await tools.sparky_check_engagement.execute!({}, opts);

    expect(result).toBe(
      success('Engagement Triggers', {
        triggers: [],
        trigger_count: 0,
        checked_at: new Date().toISOString(),
      })
    );
  });

  it('returns DB_ERROR when the repository throws', async () => {
    vi.mocked(engagementRepository.getLastExerciseDate).mockRejectedValue(
      new Error('boom')
    );

    const result = await tools.sparky_check_engagement.execute!({}, opts);

    expect(result).toBe(DB_ERROR_TEXT);
  });
});

describe('sparky_get_logging_streak', () => {
  it('counts consecutive days including today', async () => {
    const rows = [
      { entry_date: day(11) },
      { entry_date: day(10) },
      { entry_date: day(9) },
    ];
    vi.mocked(engagementRepository.getLoggedDates).mockResolvedValue(rows);

    const result = await tools.sparky_get_logging_streak.execute!({}, opts);

    expect(result).toBe(
      success('Logging Streak', {
        current_streak: 3,
        last_logged: '2026-06-11',
      })
    );
    expect(engagementRepository.getLoggedDates).toHaveBeenCalledWith('user-1');
  });

  it('lets the streak start from yesterday when nothing is logged today', async () => {
    const rows = [{ entry_date: day(10) }, { entry_date: day(9) }];
    vi.mocked(engagementRepository.getLoggedDates).mockResolvedValue(rows);

    const result = await tools.sparky_get_logging_streak.execute!({}, opts);

    expect(result).toBe(
      success('Logging Streak', {
        current_streak: 2,
        last_logged: '2026-06-10',
      })
    );
  });

  it('reports a zero streak when the last log is older than yesterday', async () => {
    const rows = [{ entry_date: day(8) }];
    vi.mocked(engagementRepository.getLoggedDates).mockResolvedValue(rows);

    const result = await tools.sparky_get_logging_streak.execute!({}, opts);

    expect(result).toBe(
      success('Logging Streak', {
        current_streak: 0,
        last_logged: '2026-06-08',
      })
    );
  });

  it('stops counting at a gap', async () => {
    const rows = [{ entry_date: day(11) }, { entry_date: day(9) }];
    vi.mocked(engagementRepository.getLoggedDates).mockResolvedValue(rows);

    const result = await tools.sparky_get_logging_streak.execute!({}, opts);

    expect(result).toBe(
      success('Logging Streak', {
        current_streak: 1,
        last_logged: '2026-06-11',
      })
    );
  });

  it("anchors the streak on the user's timezone today", async () => {
    // 20:00 UTC June 11 is already June 12 in Tokyo.
    vi.setSystemTime(new Date('2026-06-11T20:00:00Z'));
    const rows = [{ entry_date: day(12) }, { entry_date: day(11) }];
    vi.mocked(engagementRepository.getLoggedDates).mockResolvedValue(rows);

    const tokyoTools = buildEngagementTools('user-1', 'Asia/Tokyo');
    const result = await tokyoTools.sparky_get_logging_streak.execute!(
      {},
      opts
    );

    expect(result).toBe(
      success('Logging Streak', {
        current_streak: 2,
        last_logged: '2026-06-12',
      })
    );
  });

  it('handles a user with no logs at all', async () => {
    vi.mocked(engagementRepository.getLoggedDates).mockResolvedValue([]);

    const result = await tools.sparky_get_logging_streak.execute!({}, opts);

    expect(result).toBe(
      success('Logging Streak', { current_streak: 0, last_logged: null })
    );
  });

  it('returns DB_ERROR when the repository throws', async () => {
    vi.mocked(engagementRepository.getLoggedDates).mockRejectedValue(
      new Error('boom')
    );

    const result = await tools.sparky_get_logging_streak.execute!({}, opts);

    expect(result).toBe(DB_ERROR_TEXT);
  });
});

describe('sparky_get_contextual_nudge', () => {
  it.each([
    [
      { food_count: 0, exercise_count: 0, checkin_count: 0 },
      "You haven't logged anything today yet. Start with a quick check-in or log your breakfast!",
      'start_day',
    ],
    [
      { food_count: 2, exercise_count: 0, checkin_count: 0 },
      "You've logged your meals but no exercise today. Even a short walk counts!",
      'suggest_exercise',
    ],
    [
      { food_count: 0, exercise_count: 1, checkin_count: 1 },
      "Great workout! Don't forget to log your meals to track your nutrition.",
      'suggest_food',
    ],
    [
      { food_count: 2, exercise_count: 1, checkin_count: 0 },
      "You're doing great with logging today! Consider a quick check-in to track your weight or mood.",
      'suggest_checkin',
    ],
    [
      { food_count: 2, exercise_count: 1, checkin_count: 1 },
      "Excellent! You've been thorough with your logging today. Keep up the great work!",
      'encouragement',
    ],
  ])('nudges based on today activity %o', async (counts, nudge, nudgeType) => {
    vi.mocked(engagementRepository.getTodayActivityCounts).mockResolvedValue(
      counts
    );

    const result = await tools.sparky_get_contextual_nudge.execute!({}, opts);

    expect(result).toBe(
      success('Contextual Nudge', {
        nudge,
        nudge_type: nudgeType,
        today_summary: {
          food_entries: counts.food_count,
          exercise_entries: counts.exercise_count,
          checkin_entries: counts.checkin_count,
        },
        generated_at: new Date().toISOString(),
      })
    );
    expect(engagementRepository.getTodayActivityCounts).toHaveBeenCalledWith(
      'user-1',
      '2026-06-11',
      'UTC'
    );
  });

  it('returns DB_ERROR when the repository throws', async () => {
    vi.mocked(engagementRepository.getTodayActivityCounts).mockRejectedValue(
      new Error('boom')
    );

    const result = await tools.sparky_get_contextual_nudge.execute!({}, opts);

    expect(result).toBe(DB_ERROR_TEXT);
  });
});
