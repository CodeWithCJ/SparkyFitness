import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionTagResponse, TagAction } from '@workspace/shared';
import * as repo from '../models/actionTagRepository.js';
import foodRepository from '../models/foodRepository.js';
import mealRepository from '../models/mealRepository.js';
import mealTypeRepository from '../models/mealType.js';
import waterContainerRepository from '../models/waterContainerRepository.js';
import foodEntryService from '../services/foodEntryService.js';
import measurementService from '../services/measurementService.js';
import {
  actionTargetExists,
  scanActionTag,
} from '../services/actionTagService.js';

vi.mock('../models/actionTagRepository.js', () => ({
  getActionTagByCode: vi.fn(),
  claimActionTagRun: vi.fn(),
  releaseActionTagRun: vi.fn(),
}));

vi.mock('../models/waterContainerRepository.js', () => ({
  default: { getWaterContainerById: vi.fn() },
}));

vi.mock('../services/measurementService.js', () => ({
  default: { upsertWaterIntake: vi.fn() },
}));

vi.mock('../models/foodRepository.js', () => ({
  default: {
    getFoodById: vi.fn(),
    getFoodVariantById: vi.fn(),
    createFoodEntry: vi.fn(),
  },
}));

vi.mock('../models/mealRepository.js', () => ({
  default: { getMealById: vi.fn() },
}));

vi.mock('../models/mealType.js', () => ({
  default: { getAllMealTypes: vi.fn() },
}));

vi.mock('../services/foodEntryService.js', () => ({
  default: { createFoodEntryMeal: vi.fn() },
}));

vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn(async () => 'UTC'),
}));

const FOOD_ID = '11111111-1111-4111-8111-111111111111';
const VARIANT_ID = '22222222-2222-4222-8222-222222222222';
const MEAL_ID = '33333333-3333-4333-8333-333333333333';
const SNACKS_ID = '44444444-4444-4444-8444-444444444444';
const BREAKFAST_ID = '55555555-5555-4555-8555-555555555555';
const LUNCH_ID = '66666666-6666-4666-8666-666666666666';
const DINNER_ID = '77777777-7777-4777-8777-777777777777';
const OTHER_FOOD_ID = '88888888-8888-4888-8888-888888888888';
const TAG_CODE = 'a'.repeat(32);
const USER = 'user-1';
const BODY = { tag_code: TAG_CODE, entry_date: '2026-10-30' };

function tag(overrides: Partial<ActionTagResponse> = {}): ActionTagResponse {
  return {
    id: 'tag-1',
    tag_code: TAG_CODE,
    label: 'Stanley',
    action: { type: 'water', container_id: 7, drinks: 1 },
    ask_before_running: false,
    last_run_at: null,
    created_at: '2026-10-30T00:00:00.000Z',
    updated_at: '2026-10-30T00:00:00.000Z',
    ...overrides,
  };
}

describe('scanActionTag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repo.releaseActionTagRun).mockResolvedValue(undefined);
    vi.mocked(repo.claimActionTagRun).mockResolvedValue({
      previousRunAt: null,
      claimedAt: new Date('2026-10-30T12:00:00.000Z'),
    });
    vi.mocked(waterContainerRepository.getWaterContainerById).mockResolvedValue(
      { id: 7, name: 'Stanley (1 L)' } as Awaited<
        ReturnType<typeof waterContainerRepository.getWaterContainerById>
      >
    );
  });

  it('logs nothing for an unknown code', async () => {
    vi.mocked(repo.getActionTagByCode).mockResolvedValue(null);
    const result = await scanActionTag(USER, USER, BODY);
    expect(result).toEqual({ status: 'unknown_tag', tag: null, summary: null });
    expect(repo.claimActionTagRun).not.toHaveBeenCalled();
    expect(measurementService.upsertWaterIntake).not.toHaveBeenCalled();
  });

  it('logs the drinks of a water tag', async () => {
    vi.mocked(repo.getActionTagByCode).mockResolvedValue(
      tag({ action: { type: 'water', container_id: 7, drinks: 2 } })
    );
    const result = await scanActionTag(USER, USER, BODY);
    expect(result.status).toBe('done');
    expect(result.summary).toBe('2 × Stanley (1 L)');
    expect(measurementService.upsertWaterIntake).toHaveBeenCalledWith(
      USER,
      USER,
      '2026-10-30',
      2,
      7
    );
  });

  it('asks first when the tag requires it, without claiming a run', async () => {
    vi.mocked(repo.getActionTagByCode).mockResolvedValue(
      tag({ ask_before_running: true })
    );
    const result = await scanActionTag(USER, USER, BODY);
    expect(result.status).toBe('needs_confirmation');
    expect(repo.claimActionTagRun).not.toHaveBeenCalled();
    expect(measurementService.upsertWaterIntake).not.toHaveBeenCalled();
  });

  it('runs a confirmed tag that asks first', async () => {
    vi.mocked(repo.getActionTagByCode).mockResolvedValue(
      tag({ ask_before_running: true })
    );
    const result = await scanActionTag(USER, USER, {
      ...BODY,
      confirmed: true,
    });
    expect(result.status).toBe('done');
  });

  it('drops a double read', async () => {
    vi.mocked(repo.getActionTagByCode).mockResolvedValue(tag());
    vi.mocked(repo.claimActionTagRun).mockResolvedValue(null);
    const result = await scanActionTag(USER, USER, BODY);
    expect(result.status).toBe('too_soon');
    expect(measurementService.upsertWaterIntake).not.toHaveBeenCalled();
  });

  it('reports a deleted container, logs nothing and releases the claim', async () => {
    vi.mocked(repo.getActionTagByCode).mockResolvedValue(tag());
    vi.mocked(waterContainerRepository.getWaterContainerById).mockResolvedValue(
      null
    );
    const result = await scanActionTag(USER, USER, BODY);
    expect(result.status).toBe('target_missing');
    expect(measurementService.upsertWaterIntake).not.toHaveBeenCalled();
    expect(repo.releaseActionTagRun).toHaveBeenCalledOnce();
  });

  it('releases the claim and rethrows when the action fails', async () => {
    vi.mocked(repo.getActionTagByCode).mockResolvedValue(tag());
    vi.mocked(measurementService.upsertWaterIntake).mockRejectedValue(
      new Error('db down')
    );
    await expect(scanActionTag(USER, USER, BODY)).rejects.toThrow('db down');
    expect(repo.releaseActionTagRun).toHaveBeenCalledOnce();
  });
});

const FOOD_ACTION: TagAction = {
  type: 'food',
  food_id: FOOD_ID,
  variant_id: VARIANT_ID,
  quantity: 170,
  unit: 'g',
  meal: { mode: 'auto' },
};
const MEAL_ACTION: TagAction = {
  type: 'meal',
  meal_template_id: MEAL_ID,
  quantity: 2,
  unit: 'serving',
  meal: { mode: 'fixed', meal_type_id: SNACKS_ID },
};
const MEAL_TYPES = [
  { id: BREAKFAST_ID, name: 'breakfast', default_time: '08:00' },
  { id: LUNCH_ID, name: 'lunch', default_time: '12:00' },
  { id: DINNER_ID, name: 'dinner', default_time: '18:00' },
  { id: SNACKS_ID, name: 'snacks', default_time: null },
];

type FoodRow = Awaited<ReturnType<typeof foodRepository.getFoodById>>;
type VariantRow = Awaited<ReturnType<typeof foodRepository.getFoodVariantById>>;
type MealRow = Awaited<ReturnType<typeof mealRepository.getMealById>>;

describe('food and meal tags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T12:30:00.000Z'));
    vi.mocked(repo.releaseActionTagRun).mockResolvedValue(undefined);
    vi.mocked(repo.claimActionTagRun).mockResolvedValue({
      previousRunAt: null,
      claimedAt: new Date('2026-10-30T12:30:00.000Z'),
    });
    vi.mocked(foodRepository.getFoodById).mockResolvedValue({
      id: FOOD_ID,
      name: 'Greek yogurt',
      brand: null,
    } as FoodRow);
    vi.mocked(foodRepository.getFoodVariantById).mockResolvedValue({
      id: VARIANT_ID,
      food_id: FOOD_ID,
      serving_size: 170,
      serving_unit: 'g',
      calories: 100,
    } as VariantRow);
    vi.mocked(foodRepository.createFoodEntry).mockResolvedValue({
      id: 'entry-1',
    } as Awaited<ReturnType<typeof foodRepository.createFoodEntry>>);
    vi.mocked(mealRepository.getMealById).mockResolvedValue({
      id: MEAL_ID,
      name: 'Overnight oats',
      serving_unit: 'serving',
    } as MealRow);
    vi.mocked(foodEntryService.createFoodEntryMeal).mockResolvedValue({
      id: 'logged-meal-1',
    } as Awaited<ReturnType<typeof foodEntryService.createFoodEntryMeal>>);
    vi.mocked(mealTypeRepository.getAllMealTypes).mockResolvedValue(
      MEAL_TYPES as Awaited<
        ReturnType<typeof mealTypeRepository.getAllMealTypes>
      >
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('logs the saved amount of a food into the meal for the time of day', async () => {
    vi.mocked(repo.getActionTagByCode).mockResolvedValue(
      tag({ action: FOOD_ACTION })
    );
    const result = await scanActionTag(USER, USER, BODY);
    expect(result).toMatchObject({
      status: 'done',
      summary: '170 g Greek yogurt',
      logged: { kind: 'food_entry', id: 'entry-1' },
    });
    expect(foodRepository.createFoodEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER,
        food_id: FOOD_ID,
        variant_id: VARIANT_ID,
        quantity: 170,
        unit: 'g',
        meal_type_id: LUNCH_ID,
        entry_date: '2026-10-30',
        entry_time: '12:30',
        food_name: 'Greek yogurt',
      }),
      USER
    );
  });

  it('logs a saved meal into its fixed meal type', async () => {
    vi.mocked(repo.getActionTagByCode).mockResolvedValue(
      tag({ action: MEAL_ACTION })
    );
    const result = await scanActionTag(USER, USER, BODY);
    expect(result).toMatchObject({
      status: 'done',
      summary: '2 × Overnight oats',
      logged: { kind: 'food_entry_meal', id: 'logged-meal-1' },
    });
    expect(foodEntryService.createFoodEntryMeal).toHaveBeenCalledWith(
      USER,
      USER,
      expect.objectContaining({
        meal_template_id: MEAL_ID,
        meal_type_id: SNACKS_ID,
        quantity: 2,
        unit: 'serving',
        entry_date: '2026-10-30',
        _clientMealModelVersion: 2,
      })
    );
  });

  it('falls back to the time of day when the fixed meal type was deleted', async () => {
    vi.mocked(repo.getActionTagByCode).mockResolvedValue(
      tag({
        action: {
          ...MEAL_ACTION,
          meal: { mode: 'fixed', meal_type_id: 'gone' },
        } as TagAction,
      })
    );
    await scanActionTag(USER, USER, BODY);
    expect(foodEntryService.createFoodEntryMeal).toHaveBeenCalledWith(
      USER,
      USER,
      expect.objectContaining({ meal_type_id: LUNCH_ID })
    );
  });

  it('never logs into a hidden meal type', async () => {
    vi.mocked(mealTypeRepository.getAllMealTypes).mockResolvedValue([
      ...MEAL_TYPES.map((type) =>
        type.id === LUNCH_ID ? { ...type, is_visible: false } : type
      ),
    ] as Awaited<ReturnType<typeof mealTypeRepository.getAllMealTypes>>);
    vi.mocked(repo.getActionTagByCode).mockResolvedValue(
      tag({ action: FOOD_ACTION })
    );
    await scanActionTag(USER, USER, BODY);
    expect(foodRepository.createFoodEntry).toHaveBeenCalledWith(
      expect.objectContaining({ meal_type_id: BREAKFAST_ID }),
      USER
    );
  });

  it('matches a fixed meal type id in any letter case', async () => {
    vi.mocked(repo.getActionTagByCode).mockResolvedValue(
      tag({
        action: {
          ...MEAL_ACTION,
          meal: { mode: 'fixed', meal_type_id: SNACKS_ID.toUpperCase() },
        } as TagAction,
      })
    );
    await scanActionTag(USER, USER, BODY);
    expect(foodEntryService.createFoodEntryMeal).toHaveBeenCalledWith(
      USER,
      USER,
      expect.objectContaining({ meal_type_id: SNACKS_ID })
    );
  });

  it('reports a food tag whose serving unit changed instead of rescaling it', async () => {
    vi.mocked(repo.getActionTagByCode).mockResolvedValue(
      tag({ action: FOOD_ACTION })
    );
    vi.mocked(foodRepository.getFoodVariantById).mockResolvedValue({
      id: VARIANT_ID,
      food_id: FOOD_ID,
      serving_unit: 'kg',
    } as VariantRow);
    const result = await scanActionTag(USER, USER, BODY);
    expect(result.status).toBe('target_missing');
    expect(foodRepository.createFoodEntry).not.toHaveBeenCalled();
  });

  it("reports a meal tag whose unit is not the meal's own unit", async () => {
    vi.mocked(repo.getActionTagByCode).mockResolvedValue(
      tag({ action: MEAL_ACTION })
    );
    vi.mocked(mealRepository.getMealById).mockResolvedValue({
      id: MEAL_ID,
      name: 'Overnight oats',
      serving_unit: 'g',
    } as MealRow);
    const result = await scanActionTag(USER, USER, BODY);
    expect(result.status).toBe('target_missing');
    expect(foodEntryService.createFoodEntryMeal).not.toHaveBeenCalled();
  });

  it('reports a deleted food and logs nothing', async () => {
    vi.mocked(repo.getActionTagByCode).mockResolvedValue(
      tag({ action: FOOD_ACTION })
    );
    vi.mocked(foodRepository.getFoodById).mockResolvedValue(undefined);
    const result = await scanActionTag(USER, USER, BODY);
    expect(result.status).toBe('target_missing');
    expect(foodRepository.createFoodEntry).not.toHaveBeenCalled();
    expect(repo.releaseActionTagRun).toHaveBeenCalledOnce();
  });

  it('reports a variant that no longer belongs to the food', async () => {
    vi.mocked(repo.getActionTagByCode).mockResolvedValue(
      tag({ action: FOOD_ACTION })
    );
    vi.mocked(foodRepository.getFoodVariantById).mockResolvedValue({
      id: VARIANT_ID,
      food_id: OTHER_FOOD_ID,
    } as VariantRow);
    const result = await scanActionTag(USER, USER, BODY);
    expect(result.status).toBe('target_missing');
    expect(foodRepository.createFoodEntry).not.toHaveBeenCalled();
  });

  it('reports a deleted meal instead of logging an empty one', async () => {
    vi.mocked(repo.getActionTagByCode).mockResolvedValue(
      tag({ action: MEAL_ACTION })
    );
    vi.mocked(mealRepository.getMealById).mockResolvedValue(undefined);
    const result = await scanActionTag(USER, USER, BODY);
    expect(result.status).toBe('target_missing');
    expect(foodEntryService.createFoodEntryMeal).not.toHaveBeenCalled();
  });

  it('checks the target of each action type', async () => {
    expect(await actionTargetExists(USER, FOOD_ACTION)).toBe(true);
    expect(await actionTargetExists(USER, MEAL_ACTION)).toBe(true);
    vi.mocked(mealRepository.getMealById).mockResolvedValue(undefined);
    expect(await actionTargetExists(USER, MEAL_ACTION)).toBe(false);
    vi.mocked(waterContainerRepository.getWaterContainerById).mockResolvedValue(
      null
    );
    expect(
      await actionTargetExists(USER, {
        type: 'water',
        container_id: 7,
        drinks: 1,
      })
    ).toBe(false);
  });
});
