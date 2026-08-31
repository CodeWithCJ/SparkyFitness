import { vi, beforeEach, describe, expect, it } from 'vitest';
import type { FoodPhotoEstimateResponse } from '@workspace/shared';

const createPhotoLoggedMealMock = vi.fn();
vi.mock('../services/foodPhotoLogService.js', async () => {
  const actual = await vi.importActual<
    typeof import('../services/foodPhotoLogService.js')
  >('../services/foodPhotoLogService.js');
  return {
    ...actual,
    default: { createPhotoLoggedMeal: createPhotoLoggedMealMock },
  };
});

const getChatHistoryByUserIdMock = vi.fn();
vi.mock('../models/chatRepository.js', () => ({
  default: {
    getChatHistoryByUserId: (...a: unknown[]) =>
      getChatHistoryByUserIdMock(...(a as [])),
  },
}));
vi.mock('../services/foodPhotoEstimationService.js', () => ({
  default: { estimateFoodPhotoNutrition: vi.fn() },
}));
vi.mock('../services/labelScanService.js', () => ({
  default: { extractNutritionFromLabel: vi.fn() },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const { buildVisionTools } = await import('../ai/tools/visionTools.js');
const { createFoodPhotoEstimateSink, FOOD_PHOTO_ESTIMATE_PART_TYPE } =
  await import('../ai/tools/foodPhotoEstimateSink.js');

const USER = 'user-1';

function estimate(overrides: Partial<FoodPhotoEstimateResponse> = {}) {
  return {
    meal_summary: 'Chicken biryani',
    overall_confidence: 'medium' as const,
    confidence_reason: 'portions unclear',
    items: [
      {
        name: 'basmati rice',
        estimated_grams: 180,
        portion_description: '1 cup',
        preparation: 'steamed',
        calories_kcal: 234,
        protein_g: 4.3,
        carbs_g: 51,
        fat_g: 0.4,
        fiber_g: 0.6,
        sugar_g: 0.1,
        item_confidence: 'medium' as const,
        assumptions: [],
      },
      {
        name: 'chicken thigh',
        estimated_grams: 145,
        portion_description: '1 thigh',
        preparation: 'grilled',
        calories_kcal: 289,
        protein_g: 38,
        carbs_g: 0,
        fat_g: 14.5,
        fiber_g: 0,
        sugar_g: 0,
        item_confidence: 'high' as const,
        assumptions: [],
      },
    ],
    totals: {
      calories_kcal: 523,
      protein_g: 42.3,
      carbs_g: 51,
      fat_g: 14.9,
      fiber_g: 0.6,
      sugar_g: 0.1,
      total_grams: 325,
    },
    user_weight_reconciliation: '',
    clarifying_questions: [],
    ...overrides,
  } as FoodPhotoEstimateResponse;
}

const ARGS = { meal_type: 'lunch', entry_date: '2026-08-28' };

function toolsWithSink(seeded?: FoodPhotoEstimateResponse) {
  const sink = createFoodPhotoEstimateSink();
  if (seeded) sink.set(seeded);
  return buildVisionTools(USER, sink);
}

describe('sparky_log_food_photo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getChatHistoryByUserIdMock.mockResolvedValue([]);
    createPhotoLoggedMealMock.mockResolvedValue({
      mode: 'grouped',
      food_entry_meal_id: '33333333-3333-4333-8333-333333333333',
      food_entry_ids: ['a', 'b'],
      created_food_ids: ['c', 'd'],
      meal_template_id: '66666666-6666-4666-8666-666666666666',
    });
  });

  it('logs one item per detected ingredient', async () => {
    const tools = toolsWithSink(estimate());
    await tools.sparky_log_food_photo.execute!(
      { ...ARGS, save_mode: 'ingredients_and_meal' },
      {} as never
    );

    const payload = createPhotoLoggedMealMock.mock.calls[0][2];
    expect(payload.mode).toBe('grouped');
    expect(payload.items).toHaveLength(2);
    expect(payload.save_as_meal).toEqual({ name: 'Chicken biryani' });
  });

  it('converts each ingredient to per-100g with the grams on quantity', async () => {
    const tools = toolsWithSink(estimate());
    await tools.sparky_log_food_photo.execute!(
      { ...ARGS, save_mode: 'ingredients_and_meal' },
      {} as never
    );

    const [rice] = createPhotoLoggedMealMock.mock.calls[0][2].items;
    expect(rice.source).toBe('new');
    expect(rice.food.serving_size).toBe(100);
    expect(rice.quantity).toBe(180);
    // 234 kcal for 180 g -> 130 per 100 g.
    expect(rice.food.calories).toBeCloseTo(130, 2);
    expect(rice.food.ai_confidence).toBe('medium');
  });

  it('collapses to a single food in one_food mode', async () => {
    const tools = toolsWithSink(estimate());
    await tools.sparky_log_food_photo.execute!(
      { ...ARGS, save_mode: 'one_food' },
      {} as never
    );

    const payload = createPhotoLoggedMealMock.mock.calls[0][2];
    expect(payload.mode).toBe('combined');
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].quantity).toBe(325);
    expect(payload.save_as_meal).toBeUndefined();
  });

  it('reuses a preselected database match instead of the model numbers', async () => {
    const withMatch = estimate();
    withMatch.items[1] = {
      ...withMatch.items[1]!,
      preselect_match: true,
      match: {
        food_id: '11111111-1111-4111-8111-111111111111',
        variant_id: '22222222-2222-4222-8222-222222222222',
        food_name: 'Chicken Thigh',
        brand: null,
        serving_size: 100,
        serving_unit: 'g',
        match_score: 0.96,
        match_source: 'exact_name',
        is_own_food: true,
        gram_convertible: true,
        scaled: {
          calories_kcal: 288,
          protein_g: 37,
          carbs_g: 0,
          fat_g: 14,
          fiber_g: 0,
          sugar_g: 0,
        },
      },
    };
    const tools = toolsWithSink(withMatch);
    await tools.sparky_log_food_photo.execute!(
      { ...ARGS, save_mode: 'ingredients_and_meal' },
      {} as never
    );

    const chicken = createPhotoLoggedMealMock.mock.calls[0][2].items[1];
    expect(chicken.source).toBe('existing');
    expect(chicken.food_id).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('falls back to the estimate persisted on the transcript', async () => {
    // The normal path: asking the user ends the turn, so their answer arrives
    // with an empty sink and the estimate must come from chat history.
    getChatHistoryByUserIdMock.mockResolvedValue([
      { parts: [{ type: 'text', text: 'hi' }] },
      {
        parts: [
          {
            type: FOOD_PHOTO_ESTIMATE_PART_TYPE,
            data: { estimate: estimate(), capturedAt: '2026-08-28T10:00:00Z' },
          },
        ],
      },
    ]);
    const tools = buildVisionTools(USER);
    await tools.sparky_log_food_photo.execute!(
      { ...ARGS, save_mode: 'ingredients_and_meal' },
      {} as never
    );
    expect(createPhotoLoggedMealMock).toHaveBeenCalled();
  });

  it('asks for a photo when there is no analysis to log', async () => {
    const tools = buildVisionTools(USER);
    const out = await tools.sparky_log_food_photo.execute!(
      { ...ARGS, save_mode: 'ingredients_and_meal' },
      {} as never
    );
    expect(String(out)).toMatch(/No recent food photo analysis/);
    expect(createPhotoLoggedMealMock).not.toHaveBeenCalled();
  });

  it('skips an ingredient with no usable weight', async () => {
    const bad = estimate();
    bad.items[0] = { ...bad.items[0]!, estimated_grams: 0 };
    const tools = toolsWithSink(bad);
    await tools.sparky_log_food_photo.execute!(
      { ...ARGS, save_mode: 'ingredients_and_meal' },
      {} as never
    );
    expect(createPhotoLoggedMealMock.mock.calls[0][2].items).toHaveLength(1);
  });

  it('reports a failure instead of throwing', async () => {
    createPhotoLoggedMealMock.mockRejectedValue(new Error('db down'));
    const tools = toolsWithSink(estimate());
    const out = await tools.sparky_log_food_photo.execute!(
      { ...ARGS, save_mode: 'ingredients_and_meal' },
      {} as never
    );
    expect(String(out)).toMatch(/Could not log the photo estimate/);
  });

  it('tells the user the meal was saved for reuse', async () => {
    const tools = toolsWithSink(estimate());
    const out = await tools.sparky_log_food_photo.execute!(
      { ...ARGS, save_mode: 'ingredients_and_meal' },
      {} as never
    );
    expect(String(out)).toMatch(/2 ingredients/);
    expect(String(out)).toMatch(/Saved "Chicken biryani" as a meal/);
  });
});
