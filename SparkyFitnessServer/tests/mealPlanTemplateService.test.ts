import { describe, it, expect, vi, beforeEach } from 'vitest';
import mealPlanTemplateService from '../services/mealPlanTemplateService.js';
import mealPlanTemplateRepository from '../models/mealPlanTemplateRepository.js';
import foodRepository from '../models/foodRepository.js';

vi.mock('../models/mealPlanTemplateRepository.js', () => ({
  default: {
    createMealPlanTemplate: vi.fn(),
    getMealPlanTemplatesByUserId: vi.fn(),
    getMealPlanTemplateAssignments: vi.fn(),
    updateMealPlanTemplate: vi.fn(),
    deleteMealPlanTemplate: vi.fn(),
    deactivateAllMealPlanTemplates: vi.fn(),
  },
}));

vi.mock('../models/foodRepository.js', () => ({
  default: {
    createFoodEntriesFromTemplate: vi.fn().mockResolvedValue(true),
    deleteFoodEntriesByTemplateId: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../utils/timezoneLoader.js', () => ({
  resolveTemplateStartDay: vi.fn().mockResolvedValue('2026-07-25'),
}));

describe('mealPlanTemplateService', () => {
  const userId = 'user-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createMealPlanTemplate should create active template without deactivating other plans', async () => {
    const mockPlan = {
      id: 'plan-1',
      plan_name: 'Base Plan',
      is_active: true,
    };
    vi.mocked(
      mealPlanTemplateRepository.createMealPlanTemplate
    ).mockResolvedValue(mockPlan);

    const result = await mealPlanTemplateService.createMealPlanTemplate(
      userId,
      {
        plan_name: 'Base Plan',
        is_active: true,
      }
    );

    expect(result).toEqual(mockPlan);
    expect(
      mealPlanTemplateRepository.deactivateAllMealPlanTemplates
    ).not.toHaveBeenCalled();
    expect(foodRepository.createFoodEntriesFromTemplate).toHaveBeenCalledWith(
      'plan-1',
      userId,
      '2026-07-25'
    );
  });

  it('updateMealPlanTemplate should update template without deactivating other plans', async () => {
    const mockPlan = {
      id: 'plan-2',
      plan_name: 'Cutting Plan',
      is_active: true,
    };
    vi.mocked(
      mealPlanTemplateRepository.updateMealPlanTemplate
    ).mockResolvedValue(mockPlan);

    const result = await mealPlanTemplateService.updateMealPlanTemplate(
      'plan-2',
      userId,
      {
        plan_name: 'Cutting Plan',
        is_active: true,
      }
    );

    expect(result).toEqual(mockPlan);
    expect(
      mealPlanTemplateRepository.deactivateAllMealPlanTemplates
    ).not.toHaveBeenCalled();
    expect(foodRepository.deleteFoodEntriesByTemplateId).toHaveBeenCalledWith(
      'plan-2',
      userId,
      '2026-07-25'
    );
    expect(foodRepository.createFoodEntriesFromTemplate).toHaveBeenCalledWith(
      'plan-2',
      userId,
      '2026-07-25'
    );
  });

  it('duplicateMealPlanTemplate should clone original plan with (Copy) name and inactive state', async () => {
    const originalTemplate = {
      id: 'plan-orig',
      plan_name: 'Keto Plan',
      description: 'Low carb plan',
      start_date: new Date('2026-01-01'),
      end_date: null,
      is_active: true,
      assignments: [
        {
          day_of_week: 1,
          meal_type_id: 'mt-1',
          item_type: 'food',
          food_id: 'f-1',
          quantity: 2,
        },
      ],
    };

    vi.mocked(
      mealPlanTemplateRepository.getMealPlanTemplatesByUserId
    ).mockResolvedValue([originalTemplate]);
    vi.mocked(
      mealPlanTemplateRepository.getMealPlanTemplateAssignments
    ).mockResolvedValue(originalTemplate.assignments);

    const clonedPlan = {
      id: 'plan-copy',
      plan_name: 'Keto Plan (Copy)',
      is_active: false,
    };
    vi.mocked(
      mealPlanTemplateRepository.createMealPlanTemplate
    ).mockResolvedValue(clonedPlan);

    const result = await mealPlanTemplateService.duplicateMealPlanTemplate(
      'plan-orig',
      userId
    );

    expect(result).toEqual(clonedPlan);
    expect(
      mealPlanTemplateRepository.createMealPlanTemplate
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: userId,
        plan_name: 'Keto Plan (Copy)',
        description: 'Low carb plan',
        is_active: false,
        assignments: originalTemplate.assignments,
      })
    );
  });
});
