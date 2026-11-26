import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  repo: {
    getNudge: vi.fn(),
    resolveSuggestion: vi.fn(),
    claimSuggestion: vi.fn(),
    unclaimSuggestion: vi.fn(),
  },
  getUserGoalsForRange: vi.fn(),
  manageGoalTimeline: vi.fn(),
  getGoalsInRange: vi.fn(),
  getActiveWeeklyGoalPlansInRange: vi.fn(),
  getUserPreferences: vi.fn(),
  getCalorieTargetReview: vi.fn(),
  getPlanProposals: vi.fn(),
  applyPlanProposals: vi.fn(),
}));

vi.mock('../models/aiCoachRepository.js', () => ({ default: mocks.repo }));
vi.mock('../services/goalService.js', () => ({
  default: {
    getUserGoalsForRange: mocks.getUserGoalsForRange,
    manageGoalTimeline: mocks.manageGoalTimeline,
  },
}));
vi.mock('../models/goalRepository.js', () => ({
  default: { getGoalsInRange: mocks.getGoalsInRange },
}));
vi.mock('../models/weeklyGoalPlanRepository.js', () => ({
  default: {
    getActiveWeeklyGoalPlansInRange: mocks.getActiveWeeklyGoalPlansInRange,
  },
}));
vi.mock('../models/preferenceRepository.js', () => ({
  default: { getUserPreferences: mocks.getUserPreferences },
}));
vi.mock('../services/calorieTargetReviewService.js', () => ({
  getCalorieTargetReview: mocks.getCalorieTargetReview,
}));
vi.mock('../services/planProposalService.js', () => ({
  getPlanProposals: mocks.getPlanProposals,
  applyPlanProposals: mocks.applyPlanProposals,
}));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import {
  applySuggestion,
  buildSuggestion,
  CoachSuggestionError,
  dismissSuggestion,
} from '../services/coachSuggestionService.js';

const TODAY = new Date().toISOString().slice(0, 10);
const TOMORROW = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const goal = {
  calories: 2300,
  protein: 150,
  carbs: 250,
  fat: 75,
  protein_percentage: 25,
  carbs_percentage: 45,
  fat_percentage: 30,
  dietary_fiber: 30,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserGoalsForRange.mockResolvedValue({
    [TODAY]: goal,
    [TOMORROW]: goal,
  });
  mocks.getGoalsInRange.mockResolvedValue([]);
  mocks.getActiveWeeklyGoalPlansInRange.mockResolvedValue([]);
  mocks.repo.resolveSuggestion.mockResolvedValue(true);
  mocks.repo.claimSuggestion.mockResolvedValue(true);
  mocks.repo.unclaimSuggestion.mockResolvedValue(undefined);
  mocks.getUserPreferences.mockResolvedValue({ goal_mode: 'cut' });
});

const nudge = (suggestion: object, status = 'pending') => ({
  id: 'n1',
  suggestion,
  suggestion_status: status,
});

describe('buildSuggestion', () => {
  it('proposes about 10% more protein, rounded up to 5 g, for today', async () => {
    const built = await buildSuggestion('u1', 'UTC', 'goal_day_protein');
    expect(built.suggestion).toEqual({
      kind: 'goal_day_protein',
      day: TODAY,
      from: 150,
      to: 165,
    });
  });

  it('proposes nothing without a protein goal', async () => {
    mocks.getUserGoalsForRange.mockResolvedValue({
      [TODAY]: { calories: 2000 },
    });
    expect(
      (await buildSuggestion('u1', 'UTC', 'goal_day_protein')).suggestion
    ).toBeNull();
  });

  it('offers a calorie target only when the review says off track', async () => {
    mocks.getCalorieTargetReview.mockResolvedValue({
      status: 'off_track',
      daysLogged: 12,
      observedKgPerWeek: -0.1,
      impliedKgPerWeek: -0.5,
      adherencePercent: 98,
      currentTargetKcal: 2300,
      suggestion: {
        calories: 2150,
        kgPerWeek: -0.5,
        belowFloor: false,
        changeKcal: -150,
      },
    });
    const built = await buildSuggestion('u1', 'UTC', 'calorie_target');
    expect(built.suggestion).toEqual({
      kind: 'calorie_target',
      from_kcal: 2300,
      to_kcal: 2150,
      weekly_rate_kg: -0.5,
    });
    expect(built.facts.days_logged).toBe(12);
  });

  it('never offers a target below the floor, or a trivial change', async () => {
    const review = {
      status: 'off_track',
      daysLogged: 12,
      observedKgPerWeek: 0,
      impliedKgPerWeek: -0.5,
      adherencePercent: 98,
      currentTargetKcal: 2300,
    };
    mocks.getCalorieTargetReview.mockResolvedValue({
      ...review,
      suggestion: {
        calories: 1100,
        kgPerWeek: -1,
        belowFloor: true,
        changeKcal: -1200,
      },
    });
    expect(
      (await buildSuggestion('u1', 'UTC', 'calorie_target')).suggestion
    ).toBeNull();
    mocks.getCalorieTargetReview.mockResolvedValue({
      ...review,
      suggestion: {
        calories: 2320,
        kgPerWeek: -0.5,
        belowFloor: false,
        changeKcal: 20,
      },
    });
    expect(
      (await buildSuggestion('u1', 'UTC', 'calorie_target')).suggestion
    ).toBeNull();
  });

  it('says nothing about a calorie target while the estimate is still learning', async () => {
    mocks.getCalorieTargetReview.mockResolvedValue({
      status: 'learning',
      daysLogged: 3,
    });
    expect(await buildSuggestion('u1', 'UTC', 'calorie_target')).toEqual({
      suggestion: null,
      facts: {},
    });
  });

  it('counts plan changes, and offers none when every proposal is a hold', async () => {
    mocks.getPlanProposals.mockResolvedValue({
      plan: { id: 7 },
      proposals: [
        { kind: 'increase', setChanges: [{}] },
        { kind: 'reduce', setChanges: [{}] },
        { kind: 'hold', setChanges: [] },
      ],
    });
    expect(
      (await buildSuggestion('u1', 'UTC', 'plan_changes')).suggestion
    ).toEqual({
      kind: 'plan_changes',
      plan_id: '7',
      step_up: 1,
      lighter: 1,
      hold: 1,
    });
    mocks.getPlanProposals.mockResolvedValue({
      plan: { id: 7 },
      proposals: [{ kind: 'hold', setChanges: [] }],
    });
    expect(
      (await buildSuggestion('u1', 'UTC', 'plan_changes')).suggestion
    ).toBeNull();
  });

  it('answers with nothing when the data cannot be read', async () => {
    mocks.getUserGoalsForRange.mockRejectedValue(new Error('db'));
    expect(await buildSuggestion('u1', 'UTC', 'goal_day_protein')).toEqual({
      suggestion: null,
      facts: {},
    });
  });
});

describe('applySuggestion', () => {
  const protein = { kind: 'goal_day_protein', day: TODAY, from: 150, to: 165 };

  it('changes only today: the whole goal is written, and tomorrow goes back', async () => {
    mocks.repo.getNudge.mockResolvedValue(nudge(protein));
    await applySuggestion('u1', 'n1');
    expect(mocks.manageGoalTimeline).toHaveBeenCalledTimes(2);
    const [, todayBody] = mocks.manageGoalTimeline.mock.calls[0];
    expect(todayBody).toMatchObject({
      p_start_date: TODAY,
      p_cascade: false,
      p_protein: 165,
      p_calories: 2300,
      p_carbs: 250,
      p_fat: 75,
      // Percentages would override grams, so they are cleared for that day.
      p_protein_percentage: null,
      p_carbs_percentage: null,
    });
    const [, tomorrowBody] = mocks.manageGoalTimeline.mock.calls[1];
    expect(tomorrowBody).toMatchObject({
      p_start_date: TOMORROW,
      p_cascade: false,
      p_protein: 150,
      p_protein_percentage: 25,
    });
    expect(mocks.repo.claimSuggestion).toHaveBeenCalledWith('u1', 'n1');
  });

  it('leaves tomorrow alone when the person set it', async () => {
    mocks.repo.getNudge.mockResolvedValue(nudge(protein));
    mocks.getGoalsInRange.mockResolvedValue([{ goal_date: TOMORROW }]);
    await applySuggestion('u1', 'n1');
    expect(mocks.manageGoalTimeline).toHaveBeenCalledOnce();
  });

  it('leaves tomorrow alone when a weekly plan decides it', async () => {
    mocks.repo.getNudge.mockResolvedValue(nudge(protein));
    mocks.getActiveWeeklyGoalPlansInRange.mockResolvedValue([
      { start_date: TODAY, end_date: null, is_active: true },
    ]);
    await applySuggestion('u1', 'n1');
    expect(mocks.manageGoalTimeline).toHaveBeenCalledOnce();
  });

  it('refuses a suggestion for another day and marks it expired', async () => {
    mocks.repo.getNudge.mockResolvedValue(
      nudge({ ...protein, day: '2020-01-01' })
    );
    await expect(applySuggestion('u1', 'n1')).rejects.toMatchObject({
      code: 'expired',
    });
    expect(mocks.manageGoalTimeline).not.toHaveBeenCalled();
    expect(mocks.repo.resolveSuggestion).toHaveBeenCalledWith(
      'u1',
      'n1',
      'expired',
      'applied'
    );
  });

  it('refuses a second apply and an unknown message', async () => {
    mocks.repo.getNudge.mockResolvedValue(nudge(protein, 'applied'));
    await expect(applySuggestion('u1', 'n1')).rejects.toMatchObject({
      code: 'not_pending',
    });
    mocks.repo.getNudge.mockResolvedValue(null);
    await expect(applySuggestion('u1', 'n1')).rejects.toBeInstanceOf(
      CoachSuggestionError
    );
    expect(mocks.manageGoalTimeline).not.toHaveBeenCalled();
  });

  it('applies a calorie target from today onwards, keeping every other field', async () => {
    mocks.repo.getNudge.mockResolvedValue(
      nudge({
        kind: 'calorie_target',
        from_kcal: 2300,
        to_kcal: 2150,
        weekly_rate_kg: -0.5,
      })
    );
    await applySuggestion('u1', 'n1');
    expect(mocks.manageGoalTimeline).toHaveBeenCalledOnce();
    expect(mocks.manageGoalTimeline.mock.calls[0][1]).toMatchObject({
      p_start_date: TODAY,
      p_cascade: true,
      p_calories: 2150,
      p_protein: 150,
      p_dietary_fiber: 30,
    });
  });

  it('applies plan changes by asking the plan service to recompute', async () => {
    mocks.repo.getNudge.mockResolvedValue(
      nudge({
        kind: 'plan_changes',
        plan_id: '7',
        step_up: 1,
        lighter: 0,
        hold: 0,
      })
    );
    mocks.getPlanProposals.mockResolvedValue({
      plan: { id: 7 },
      proposals: [
        { assignmentId: 'a1', kind: 'increase', setChanges: [{}] },
        { assignmentId: 'a2', kind: 'hold', setChanges: [] },
      ],
    });
    mocks.applyPlanProposals.mockResolvedValue({ applied: [{}], skipped: [] });
    const result = await applySuggestion('u1', 'n1');
    expect(mocks.applyPlanProposals).toHaveBeenCalledWith('u1', '7', ['a1']);
    expect(result.summary).toEqual({ applied: 1 });
  });

  it('refuses plan changes on a plan that fills the diary from its weights', async () => {
    mocks.repo.getNudge.mockResolvedValue(
      nudge({
        kind: 'plan_changes',
        plan_id: '7',
        step_up: 1,
        lighter: 0,
        hold: 0,
      })
    );
    mocks.getPlanProposals.mockResolvedValue({
      plan: { id: 7 },
      proposals: [{ assignmentId: 'a1', kind: 'increase', setChanges: [{}] }],
    });
    mocks.applyPlanProposals.mockResolvedValue('prefill');
    await expect(applySuggestion('u1', 'n1')).rejects.toMatchObject({
      code: 'prefill',
    });
    expect(mocks.repo.resolveSuggestion).not.toHaveBeenCalled();
  });
});

describe('dismissSuggestion', () => {
  it('dismisses a pending suggestion once', async () => {
    mocks.repo.getNudge.mockResolvedValue(nudge({ kind: 'goal_day_protein' }));
    expect(await dismissSuggestion('u1', 'n1')).toEqual({ dismissed: true });
    mocks.repo.resolveSuggestion.mockResolvedValue(false);
    await expect(dismissSuggestion('u1', 'n1')).rejects.toMatchObject({
      code: 'not_pending',
    });
  });
});
