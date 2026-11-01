import { vi, beforeEach, describe, expect, it } from 'vitest';
import { buildCoachTools } from '../ai/tools/coachTools.js';
import calorieTargetReviewService from '../services/calorieTargetReviewService.js';
import preferenceService from '../services/preferenceService.js';
import { toolOpts } from './helpers/toolExecutionOptions.js';

vi.mock('../models/coachRepository', () => ({ default: {} }));
vi.mock('../models/symptomRepository', () => ({ default: {} }));
vi.mock('../services/exerciseCalorieRangeService', () => ({
  getResolvedExerciseCaloriesRange: vi.fn(),
  getResolvedExerciseCaloriesTotal: vi.fn(),
}));
vi.mock('../services/calorieTargetReviewService.js', () => ({
  default: { getCalorieTargetReview: vi.fn() },
}));
vi.mock('../services/preferenceService.js', () => ({
  default: { getUserPreferences: vi.fn() },
}));
vi.mock('../config/logging', () => ({ log: vi.fn() }));

const svc = calorieTargetReviewService as unknown as {
  getCalorieTargetReview: ReturnType<typeof vi.fn>;
};
const prefs = preferenceService as unknown as {
  getUserPreferences: ReturnType<typeof vi.fn>;
};

const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred.\n\nSuggestion: Do NOT retry the same call — it will fail the same way. Tell the user what failed and stop.';

const option = (kgPerWeek: number, calories: number, belowFloor = false) => ({
  kgPerWeek,
  calories,
  belowFloor,
});

const baseReview = {
  status: 'on_track',
  maintenanceKcal: 2400,
  currentTargetKcal: 1900,
  impliedKgPerWeek: -0.58,
  observedKgPerWeek: -0.5,
  averageIntakeKcal: 1950,
  adherencePercent: 103,
  followedTarget: true,
  daysLogged: 26,
  windowDays: 28,
  options: [
    option(-0.75, 1830),
    option(-0.5, 1970),
    option(-0.25, 2110),
    option(0, 2400),
    option(0.25, 2540),
  ],
  suggestion: null,
};

let tools: ReturnType<typeof buildCoachTools>;
const run = (args: Record<string, unknown> = {}) =>
  tools.sparky_review_calorie_target.execute!(args as never, toolOpts);

beforeEach(() => {
  vi.clearAllMocks();
  prefs.getUserPreferences.mockResolvedValue({ default_weight_unit: 'kg' });
  tools = buildCoachTools('user-1', 'UTC');
});

describe('sparky_review_calorie_target', () => {
  it('renders maintenance, both rates and the options, and asks for a rate', async () => {
    svc.getCalorieTargetReview.mockResolvedValue(baseReview);
    const result = (await run()) as string;

    expect(svc.getCalorieTargetReview).toHaveBeenCalledWith(
      'user-1',
      undefined
    );
    expect(result).toContain('- Estimated maintenance: 2400 kcal/day');
    expect(result).toContain('- Saved calorie target: 1900 kcal/day');
    expect(result).toContain('- Rate the target implies: -0.6 kg/week');
    expect(result).toContain('- Rate the weight trend shows: -0.5 kg/week');
    expect(result).toContain('- -0.5 kg/week: 1970 kcal/day');
    expect(result).toContain('Say plainly that no change is needed');
    expect(result).toContain('Ask which weekly rate the user wants');
  });

  it('treats a null desired rate as not given', async () => {
    await run({ desired_kg_per_week: null });
    expect(svc.getCalorieTargetReview).toHaveBeenCalledWith(
      'user-1',
      undefined
    );
  });

  it("gives the target for the desired rate in the user's unit", async () => {
    prefs.getUserPreferences.mockResolvedValue({ default_weight_unit: 'lbs' });
    svc.getCalorieTargetReview.mockResolvedValue({
      ...baseReview,
      suggestion: { ...option(-0.5, 1970), changeKcal: 70 },
    });
    const result = (await run({ desired_kg_per_week: -0.5 })) as string;

    expect(svc.getCalorieTargetReview).toHaveBeenCalledWith('user-1', -0.5);
    expect(result).toContain(
      'For -1.1 lbs/week: 1970 kcal/day (+70 from today).'
    );
    expect(result).not.toContain('Ask which weekly rate');
  });

  it('refuses to recommend a target under the safe minimum', async () => {
    svc.getCalorieTargetReview.mockResolvedValue({
      ...baseReview,
      suggestion: { ...option(-0.75, 1300, true), changeKcal: -600 },
    });
    const result = (await run({ desired_kg_per_week: -0.75 })) as string;
    expect(result).toContain('below the safe minimum; do not recommend it');
  });

  it('does not judge while learning or with too few logged days', async () => {
    svc.getCalorieTargetReview.mockResolvedValue({
      ...baseReview,
      status: 'learning',
    });
    const learning = (await run()) as string;
    expect(learning).toContain('still learning');
    expect(learning).not.toContain('Rate the target implies');

    svc.getCalorieTargetReview.mockResolvedValue({
      ...baseReview,
      status: 'low_logging',
      daysLogged: 9,
    });
    const sparse = (await run()) as string;
    expect(sparse).toContain('too few days');
    expect(sparse).not.toContain('Targets at this maintenance');
  });

  it('blames adherence, not the target, when intake was off', async () => {
    svc.getCalorieTargetReview.mockResolvedValue({
      ...baseReview,
      status: 'off_track',
      followedTarget: false,
      adherencePercent: 125,
      averageIntakeKcal: 2375,
    });
    const result = (await run()) as string;
    expect(result).toContain('Do not lower the target');
  });

  it('rejects a rate outside -1 to 1 kg a week', async () => {
    const result = (await run({ desired_kg_per_week: -3 })) as string;
    expect(svc.getCalorieTargetReview).not.toHaveBeenCalled();
    expect(result).toContain('desired_kg_per_week');
  });

  it('returns DB_ERROR when the review fails', async () => {
    svc.getCalorieTargetReview.mockRejectedValue(new Error('boom'));
    expect(await run()).toBe(DB_ERROR_TEXT);
  });
});
