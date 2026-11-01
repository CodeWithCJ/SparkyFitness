import { beforeEach, describe, expect, it, vi } from 'vitest';
import { weeklyGoalPlanInForce } from '@workspace/shared';
import goalService from '../services/goalService.js';
import goalRepository from '../models/goalRepository.js';
import goalPresetRepository from '../models/goalPresetRepository.js';
import weeklyGoalPlanRepository from '../models/weeklyGoalPlanRepository.js';

vi.mock('../models/goalRepository.js');
vi.mock('../models/weeklyGoalPlanRepository.js');
vi.mock('../models/goalPresetRepository.js');

const plan = (
  presetId: string,
  start_date: string,
  end_date: string | null
) => ({
  id: presetId,
  user_id: 'user-1',
  plan_name: presetId,
  is_active: true,
  start_date,
  end_date,
  ...everyDay(presetId),
});

const everyDay = (presetId: string) => ({
  sunday_preset_id: presetId,
  monday_preset_id: presetId,
  tuesday_preset_id: presetId,
  wednesday_preset_id: presetId,
  thursday_preset_id: presetId,
  friday_preset_id: presetId,
  saturday_preset_id: presetId,
});

describe('weekly goal plans across a range of days', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(goalRepository.getGoalsInRange).mockResolvedValue([]);
    vi.mocked(goalRepository.getMostRecentGoalBeforeDate).mockResolvedValue({
      calories: 2000,
    });
    vi.mocked(goalPresetRepository.getGoalPresetById).mockImplementation(
      async (presetId: string) => ({
        id: presetId,
        calories: presetId === 'october' ? 1500 : 2500,
      })
    );
  });

  it('gives each day the plan that covers it', async () => {
    vi.mocked(
      weeklyGoalPlanRepository.getActiveWeeklyGoalPlansInRange
    ).mockResolvedValue([
      plan('november', '2026-11-01', null),
      plan('october', '2026-10-01', '2026-10-31'),
    ]);

    const goals = await goalService.getUserGoalsForRange(
      'user-1',
      '2026-10-30',
      '2026-11-02',
      false
    );

    expect(
      Object.entries(goals).map(([day, dayGoals]) => [
        day,
        (dayGoals as { calories: number }).calories,
      ])
    ).toEqual([
      ['2026-10-30', 1500],
      ['2026-10-31', 1500],
      ['2026-11-01', 2500],
      ['2026-11-02', 2500],
    ]);
  });

  it('stops applying a plan after its end date', async () => {
    vi.mocked(
      weeklyGoalPlanRepository.getActiveWeeklyGoalPlansInRange
    ).mockResolvedValue([plan('october', '2026-10-01', '2026-10-31')]);

    const goals = await goalService.getUserGoalsForRange(
      'user-1',
      '2026-10-31',
      '2026-11-01',
      false
    );

    expect((goals['2026-10-31'] as { calories: number }).calories).toBe(1500);
    expect((goals['2026-11-01'] as { calories: number }).calories).toBe(2000);
  });
});

describe('the weekly goal plan in force', () => {
  const overlapping = [
    { ...plan('october', '2026-10-01', null), id: 'older' },
    { ...plan('november', '2026-10-20', null), id: 'newer' },
    { ...plan('november', '2026-10-25', null), id: 'off', is_active: false },
  ];

  it('is the switched-on plan covering the day that started last', () => {
    expect(weeklyGoalPlanInForce(overlapping, '2026-10-26')?.id).toBe('newer');
    expect(weeklyGoalPlanInForce(overlapping, '2026-10-10')?.id).toBe('older');
    expect(weeklyGoalPlanInForce(overlapping, '2026-09-30')).toBeUndefined();
  });
});
