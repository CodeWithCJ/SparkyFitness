import { vi, beforeEach, describe, expect, it } from 'vitest';
import { buildMealPlanTools } from '../ai/tools/mealPlansTools.js';
import mealPlanTemplateService from '../services/mealPlanTemplateService.js';

vi.mock('../services/mealPlanTemplateService', () => ({
  default: {
    getMealPlanTemplates: vi.fn(),
    duplicateMealPlanTemplate: vi.fn(),
    deleteMealPlanTemplate: vi.fn(),
  },
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

const opts = { toolCallId: 'tc-1', messages: [] };
const PLAN_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_ID = '223e4567-e89b-12d3-a456-426614174000';
const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred.\n\nSuggestion: Do NOT retry the same call — it will fail the same way. Tell the user what failed and stop.';

let tools: ReturnType<typeof buildMealPlanTools>;

beforeEach(() => {
  vi.clearAllMocks();
  tools = buildMealPlanTools('user-1', 'UTC');
});

describe('sparky_manage_meal_plans', () => {
  it('list_meal_plans renders each plan with state and assignment count', async () => {
    vi.mocked(mealPlanTemplateService.getMealPlanTemplates).mockResolvedValue([
      {
        id: PLAN_ID,
        plan_name: 'Cutting Week',
        is_active: true,
        assignments: [{ day_of_week: 1 }, { day_of_week: 2 }],
      },
      {
        id: OTHER_ID,
        plan_name: 'Bulk Week',
        is_active: false,
        assignments: [{ day_of_week: 0 }],
      },
    ] as never);

    const result = await tools.sparky_manage_meal_plans.execute!(
      { action: 'list_meal_plans' },
      opts
    );

    expect(result).toBe(
      '# Meal Plans\n\n' +
        '**Cutting Week** (active, 2 assignments)\n  ID: ' +
        PLAN_ID +
        '\n\n' +
        '**Bulk Week** (inactive, 1 assignment)\n  ID: ' +
        OTHER_ID
    );
    expect(mealPlanTemplateService.getMealPlanTemplates).toHaveBeenCalledWith(
      'user-1'
    );
  });

  it('list_meal_plans reports when there are none', async () => {
    vi.mocked(mealPlanTemplateService.getMealPlanTemplates).mockResolvedValue(
      [] as never
    );

    const result = await tools.sparky_manage_meal_plans.execute!(
      { action: 'list_meal_plans' },
      opts
    );

    expect(result).toBe('# Meal Plans\n\nNo results found.');
  });

  it('infers list_meal_plans when no action is provided', async () => {
    vi.mocked(mealPlanTemplateService.getMealPlanTemplates).mockResolvedValue(
      [] as never
    );

    const result = await tools.sparky_manage_meal_plans.execute!({}, opts);

    expect(result).toBe('# Meal Plans\n\nNo results found.');
  });

  it('get_meal_plan renders the day-by-day assignments', async () => {
    vi.mocked(mealPlanTemplateService.getMealPlanTemplates).mockResolvedValue([
      {
        id: PLAN_ID,
        plan_name: 'Cutting Week',
        is_active: true,
        assignments: [
          {
            day_of_week: 1,
            meal_type: 'Breakfast',
            item_type: 'meal',
            meal_name: 'Overnight Oats',
            quantity: 1,
            unit: 'bowl',
          },
          {
            day_of_week: 3,
            meal_type: 'Lunch',
            item_type: 'food',
            food_name: 'Chicken Breast',
            quantity: 200,
            unit: 'g',
          },
        ],
      },
    ] as never);

    const result = await tools.sparky_manage_meal_plans.execute!(
      { action: 'get_meal_plan', plan_id: PLAN_ID },
      opts
    );

    expect(result).toBe(
      '# Meal Plan: Cutting Week\n\n' +
        'Monday [Breakfast]: Overnight Oats — 1 bowl\n\n' +
        'Wednesday [Lunch]: Chicken Breast — 200 g'
    );
  });

  it('get_meal_plan returns NOT_FOUND when the plan is absent', async () => {
    vi.mocked(mealPlanTemplateService.getMealPlanTemplates).mockResolvedValue(
      [] as never
    );

    const result = await tools.sparky_manage_meal_plans.execute!(
      { action: 'get_meal_plan', plan_id: PLAN_ID },
      opts
    );

    expect(result).toBe(
      `Error [NOT_FOUND]: Meal plan with ID '${PLAN_ID}' not found.\n\nSuggestion: Check the ID and try again.`
    );
  });

  it('duplicate_meal_plan confirms the copy', async () => {
    vi.mocked(
      mealPlanTemplateService.duplicateMealPlanTemplate
    ).mockResolvedValue({
      id: OTHER_ID,
      plan_name: 'Cutting Week (Copy)',
    } as never);

    const result = await tools.sparky_manage_meal_plans.execute!(
      { action: 'duplicate_meal_plan', plan_id: PLAN_ID },
      opts
    );

    expect(result).toBe(
      `✅ Meal plan duplicated as **Cutting Week (Copy)** (ID: ${OTHER_ID}).`
    );
    expect(
      mealPlanTemplateService.duplicateMealPlanTemplate
    ).toHaveBeenCalledWith(PLAN_ID, 'user-1');
  });

  it('delete_meal_plan confirms the deletion', async () => {
    vi.mocked(mealPlanTemplateService.deleteMealPlanTemplate).mockResolvedValue(
      undefined as never
    );

    const result = await tools.sparky_manage_meal_plans.execute!(
      { action: 'delete_meal_plan', plan_id: PLAN_ID },
      opts
    );

    expect(result).toBe('✅ Meal plan deleted.');
    expect(mealPlanTemplateService.deleteMealPlanTemplate).toHaveBeenCalledWith(
      PLAN_ID,
      'user-1'
    );
  });

  it('rejects a non-UUID plan_id', async () => {
    const result = await tools.sparky_manage_meal_plans.execute!(
      { action: 'get_meal_plan', plan_id: 'nope' },
      opts
    );

    expect(result).toBe('Error [VALIDATION]: plan_id: Must be a valid UUID');
    expect(mealPlanTemplateService.getMealPlanTemplates).not.toHaveBeenCalled();
  });

  it('maps a "not found" throw to NOT_FOUND', async () => {
    vi.mocked(
      mealPlanTemplateService.duplicateMealPlanTemplate
    ).mockRejectedValue(new Error(`Meal plan template ${PLAN_ID} not found.`));

    const result = await tools.sparky_manage_meal_plans.execute!(
      { action: 'duplicate_meal_plan', plan_id: PLAN_ID },
      opts
    );

    expect(result).toBe(
      `Error [NOT_FOUND]: Meal plan with ID '${PLAN_ID}' not found.\n\nSuggestion: Check the ID and try again.`
    );
  });

  it('returns DB_ERROR when the service throws unexpectedly', async () => {
    vi.mocked(mealPlanTemplateService.getMealPlanTemplates).mockRejectedValue(
      new Error('boom')
    );

    const result = await tools.sparky_manage_meal_plans.execute!(
      { action: 'list_meal_plans' },
      opts
    );

    expect(result).toBe(DB_ERROR_TEXT);
  });
});
