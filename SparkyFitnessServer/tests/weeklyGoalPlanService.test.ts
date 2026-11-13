import { beforeEach, describe, expect, it, vi } from 'vitest';
import weeklyGoalPlanService from '../services/weeklyGoalPlanService.js';
import weeklyGoalPlanRepository, {
  WeeklyGoalPlanOverlapError,
} from '../models/weeklyGoalPlanRepository.js';
import { ValidationError } from '../utils/errors.js';

vi.mock('../models/weeklyGoalPlanRepository.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../models/weeklyGoalPlanRepository.js')
    >();
  return {
    ...actual,
    default: { saveWeeklyGoalPlan: vi.fn() },
  };
});

describe('saving a weekly goal plan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [{ start_date: '' }, 'A start date is required.'],
    [{ start_date: '2026-10-01', end_date: 'soon' }, 'not a valid date'],
    [
      { start_date: '2026-10-01', end_date: '2026-09-30' },
      'cannot be before the start date',
    ],
  ])('refuses %o', async (dates, message) => {
    const saving = weeklyGoalPlanService.createWeeklyGoalPlan('user-1', {
      plan_name: 'Plan',
      is_active: true,
      ...dates,
    });

    await expect(saving).rejects.toBeInstanceOf(ValidationError);
    await expect(saving).rejects.toThrow(message);
    expect(weeklyGoalPlanRepository.saveWeeklyGoalPlan).not.toHaveBeenCalled();
  });

  it('passes an overlap through for the client to show', async () => {
    const overlap = new WeeklyGoalPlanOverlapError({
      id: 'november',
      plan_name: 'November',
      start_date: '2026-11-01',
      end_date: null,
    });
    vi.mocked(weeklyGoalPlanRepository.saveWeeklyGoalPlan).mockRejectedValue(
      overlap
    );

    await expect(
      weeklyGoalPlanService.updateWeeklyGoalPlan('plan-1', 'user-1', {
        plan_name: 'October',
        start_date: '2026-10-01',
        end_date: '2026-11-05',
        is_active: true,
      })
    ).rejects.toBe(overlap);
    expect(overlap.status).toBe(409);
  });
});
