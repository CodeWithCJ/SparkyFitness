import { vi, beforeEach, describe, expect, it } from 'vitest';
import { buildDayStatusTools } from '../ai/tools/dayStatusTools.js';
import dashboardService from '../services/DashboardService.js';
import goalService from '../services/goalService.js';
import nutrientGoalPreferenceService from '../services/nutrientGoalPreferenceService.js';
import reportRepository from '../models/reportRepository.js';
import { toolOpts } from './helpers/toolExecutionOptions.js';

vi.mock('../services/DashboardService.js', () => ({
  default: { getDashboardStats: vi.fn() },
}));
vi.mock('../services/goalService.js', () => ({
  default: { getUserGoals: vi.fn() },
}));
vi.mock('../services/nutrientGoalPreferenceService.js', () => ({
  default: { getEffectiveGoalTypes: vi.fn() },
}));
vi.mock('../models/reportRepository.js', () => ({
  default: {
    getDailyNutritionTotalsRange: vi.fn(),
    getMealNutritionTotals: vi.fn(),
  },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

let tools: ReturnType<typeof buildDayStatusTools>;

beforeEach(() => {
  vi.clearAllMocks();
  tools = buildDayStatusTools('user-1', 'Europe/Vienna');
  vi.mocked(dashboardService.getDashboardStats).mockResolvedValue({
    eaten: 1290.4,
    burned: 300,
    remaining: 959.6,
    goal: 1950,
  } as never);
  vi.mocked(reportRepository.getDailyNutritionTotalsRange).mockResolvedValue([
    {
      entry_date: '2026-11-24',
      calories: 600.6,
      protein: 111.04,
      carbs: 142,
      fat: 27.3,
      fiber: 20,
    },
  ] as never);
  vi.mocked(goalService.getUserGoals).mockResolvedValue({
    calories: 1950,
    protein: 180,
    carbs: 180,
    fat: 55,
    dietary_fiber: null,
  } as never);
  vi.mocked(
    nutrientGoalPreferenceService.getEffectiveGoalTypes
  ).mockResolvedValue({
    calories: { goalType: 'maximum' },
    protein: { goalType: 'minimum' },
    fat: { goalType: 'target', targetMin: 40, targetMax: 60 },
  } as never);
  vi.mocked(reportRepository.getMealNutritionTotals).mockResolvedValue([
    {
      meal_type: 'Breakfast',
      entries: 2,
      calories: 400.6,
      protein: 30.04,
      carbs: 50,
      fat: 10,
      fiber: 12,
    },
    {
      meal_type: null,
      entries: 1,
      calories: 100,
      protein: 5,
      carbs: 10,
      fat: 2,
    },
  ] as never);
});

const run = async (args: Record<string, unknown> = {}) =>
  JSON.parse(
    (await tools.sparky_get_day_status.execute!(args, toolOpts)) as string
  );

describe('sparky_get_day_status', () => {
  it('returns consumed, goal and remaining with directions and meals', async () => {
    const out = await run({ date: '2026-11-24' });

    expect(out.date).toBe('2026-11-24');
    expect(out.timezone).toBe('Europe/Vienna');
    expect(out.nutrition.calories).toEqual({
      consumed: 1290,
      goal: 1950,
      remaining: 960,
      burned: 300,
      direction: 'maximum',
    });
    expect(out.nutrition.protein).toEqual({
      consumed: 111,
      goal: 180,
      remaining: 69,
      direction: 'minimum',
    });
    expect(out.nutrition.fat).toEqual({
      consumed: 27.3,
      goal: 55,
      remaining: 27.7,
      direction: 'target',
      target_min: 40,
      target_max: 60,
    });
    // No goal set: say so instead of a remaining of -20.
    expect(out.nutrition.fiber).toEqual({
      consumed: 20,
      goal: null,
      remaining: null,
    });
    expect(out.by_meal).toEqual([
      {
        meal_type: 'Breakfast',
        entries: 2,
        calories: 401,
        protein: 30,
        carbs: 50,
        fat: 10,
        fiber: 12,
      },
      {
        meal_type: 'Unassigned',
        entries: 1,
        calories: 100,
        protein: 5,
        carbs: 10,
        fat: 2,
        fiber: 0,
      },
      // Day totals minus the meals: taken supplements.
      {
        meal_type: 'Supplements',
        entries: 0,
        calories: 100,
        protein: 76,
        carbs: 82,
        fat: 15.3,
        fiber: 8,
      },
    ]);
    for (const call of [
      dashboardService.getDashboardStats,
      reportRepository.getMealNutritionTotals,
    ]) {
      expect(call).toHaveBeenCalledWith('user-1', '2026-11-24');
    }
    expect(goalService.getUserGoals).toHaveBeenCalledWith(
      'user-1',
      '2026-11-24',
      undefined,
      true
    );
  });

  it('shows a negative remaining when over the goal', async () => {
    vi.mocked(reportRepository.getDailyNutritionTotalsRange).mockResolvedValue([
      { entry_date: '2026-11-24', carbs: 200 },
    ] as never);
    const out = await run({ date: '2026-11-24' });
    expect(out.nutrition.carbs.remaining).toBe(-20);
  });

  it('reports zero consumed on a day with nothing logged', async () => {
    vi.mocked(reportRepository.getDailyNutritionTotalsRange).mockResolvedValue(
      [] as never
    );
    vi.mocked(reportRepository.getMealNutritionTotals).mockResolvedValue(
      [] as never
    );
    const out = await run({ date: '2026-11-24' });
    expect(out.nutrition.protein).toMatchObject({
      consumed: 0,
      remaining: 180,
    });
    expect(out.by_meal).toEqual([]);
  });

  it('defaults to today in the user timezone and accepts day keywords', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 23:30 UTC is already the next day in Vienna.
    vi.setSystemTime(new Date('2026-11-24T23:30:00Z'));
    try {
      expect((await run()).date).toBe('2026-11-25');
      expect((await run({ date: 'yesterday' })).date).toBe('2026-11-24');
      expect((await run({ date: 'tomorrow' })).date).toBe('2026-11-26');
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects unknown keys and bad dates', async () => {
    for (const args of [{ day: 'today' }, { date: '24.11.2026' }]) {
      const result = await tools.sparky_get_day_status.execute!(args, toolOpts);
      expect(result).toMatch(/VALIDATION/);
    }
    expect(dashboardService.getDashboardStats).not.toHaveBeenCalled();
  });

  it('returns a DB error when a read fails', async () => {
    vi.mocked(dashboardService.getDashboardStats).mockRejectedValue(
      new Error('boom')
    );
    const result = await tools.sparky_get_day_status.execute!({}, toolOpts);
    expect(result).toMatch(/DB_ERROR/);
  });

  it('adds no supplements row when the meals make up the whole day', async () => {
    vi.mocked(reportRepository.getDailyNutritionTotalsRange).mockResolvedValue([
      {
        entry_date: '2026-11-24',
        calories: 500.6,
        protein: 35.04,
        carbs: 60,
        fat: 12,
      },
    ] as never);
    const out = await run({ date: '2026-11-24' });
    expect(out.by_meal.map((m: { meal_type: string }) => m.meal_type)).toEqual([
      'Breakfast',
      'Unassigned',
    ]);
  });

  it('reads the fiber goal and direction from dietary_fiber', async () => {
    vi.mocked(goalService.getUserGoals).mockResolvedValue({
      dietary_fiber: 30,
    } as never);
    vi.mocked(
      nutrientGoalPreferenceService.getEffectiveGoalTypes
    ).mockResolvedValue({ dietary_fiber: { goalType: 'minimum' } } as never);
    const out = await run({ date: '2026-11-24' });
    expect(out.nutrition.fiber).toEqual({
      consumed: 20,
      goal: 30,
      remaining: 10,
      direction: 'minimum',
    });
  });

  it('flags a direction the user never chose', async () => {
    vi.mocked(goalService.getUserGoals).mockResolvedValue({
      calories: 2000,
      protein: 150,
    } as never);
    vi.mocked(
      nutrientGoalPreferenceService.getEffectiveGoalTypes
    ).mockResolvedValue({
      calories: { goalType: 'minimum', isDefault: true },
      protein: { goalType: 'minimum' },
    } as never);
    const out = await run({ date: '2026-11-24' });
    expect(out.nutrition.calories).toMatchObject({
      direction: 'minimum',
      direction_is_default: true,
    });
    expect(out.nutrition.protein.direction).toBe('minimum');
    expect(out.nutrition.protein).not.toHaveProperty('direction_is_default');
    expect(
      nutrientGoalPreferenceService.getEffectiveGoalTypes
    ).toHaveBeenCalledWith(expect.any(String), { markDefaults: true });
  });

  it('treats a goal of 0 as not set and a target without bounds as null', async () => {
    vi.mocked(goalService.getUserGoals).mockResolvedValue({
      protein: 0,
      fat: 55,
    } as never);
    vi.mocked(
      nutrientGoalPreferenceService.getEffectiveGoalTypes
    ).mockResolvedValue({ fat: { goalType: 'target' } } as never);
    const out = await run({ date: '2026-11-24' });
    expect(out.nutrition.protein).toMatchObject({
      goal: null,
      remaining: null,
    });
    expect(out.nutrition.fat).toMatchObject({
      direction: 'target',
      target_min: null,
      target_max: null,
    });
  });

  it('does not invent calorie numbers the dashboard did not return', async () => {
    vi.mocked(dashboardService.getDashboardStats).mockResolvedValue(
      {} as never
    );
    const out = await run({ date: '2026-11-24' });
    expect(out.nutrition.calories).toMatchObject({
      consumed: 0,
      goal: null,
      remaining: null,
      burned: 0,
    });
  });

  it('keeps a supplements row that is small but visible after rounding', async () => {
    vi.mocked(reportRepository.getDailyNutritionTotalsRange).mockResolvedValue([
      { entry_date: '2026-11-24', calories: 0, fiber: 0.4 },
    ] as never);
    vi.mocked(reportRepository.getMealNutritionTotals).mockResolvedValue(
      [] as never
    );
    const out = await run({ date: '2026-11-24' });
    expect(out.by_meal).toEqual([
      {
        meal_type: 'Supplements',
        entries: 0,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0.4,
      },
    ]);
  });

  it('drops a supplements row that rounds to nothing', async () => {
    vi.mocked(reportRepository.getDailyNutritionTotalsRange).mockResolvedValue([
      { entry_date: '2026-11-24', calories: 0.3, fiber: 0.04 },
    ] as never);
    vi.mocked(reportRepository.getMealNutritionTotals).mockResolvedValue(
      [] as never
    );
    expect((await run({ date: '2026-11-24' })).by_meal).toEqual([]);
  });
});
