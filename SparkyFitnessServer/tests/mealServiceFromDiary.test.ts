import { vi, beforeEach, describe, expect, it } from 'vitest';

const getFoodEntriesByDateAndMealTypeMock = vi.fn();
const getFoodByIdMock = vi.fn();
const createMealMock = vi.fn();

vi.mock('../models/foodEntry.js', () => ({
  default: {
    getFoodEntriesByDateAndMealType: (...a: unknown[]) =>
      getFoodEntriesByDateAndMealTypeMock(...(a as [])),
  },
}));
vi.mock('../models/food.js', () => ({
  default: {
    getFoodById: (...a: unknown[]) => getFoodByIdMock(...(a as [])),
    getFoodVariantsByFoodId: vi.fn(async () => []),
  },
}));
vi.mock('../models/mealRepository.js', () => ({
  default: { createMeal: (...a: unknown[]) => createMealMock(...(a as [])) },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const mealService = (await import('../services/mealService.js')).default;

const VARIANT = '22222222-2222-4222-8222-222222222222';
const MEAL_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function entry(name: string, foodEntryMealId: string | null) {
  return {
    food_id: `food-${name}`,
    variant_id: VARIANT,
    food_name: name,
    food_entry_meal_id: foodEntryMealId,
    quantity: 100,
    unit: 'g',
    serving_size: 100,
    serving_unit: 'g',
    calories: 100,
    protein: 1,
    carbs: 1,
    fat: 1,
  };
}

describe('createMealFromDiaryEntries scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFoodByIdMock.mockImplementation(async () => ({
      default_variant: { id: VARIANT },
    }));
    createMealMock.mockImplementation(async (data: { foods: unknown[] }) => ({
      id: 'new-meal',
      foods: data.foods,
    }));
  });

  it('includes only the entries of the named logged meal', async () => {
    getFoodEntriesByDateAndMealTypeMock.mockResolvedValue([
      entry('rice', MEAL_A),
      entry('chicken', MEAL_A),
      entry('coffee', null), // logged separately at the same meal type
    ]);

    await mealService.createMealFromDiaryEntries(
      'user-1',
      '2026-08-27',
      'lunch',
      'Chicken Biryani',
      null,
      false,
      MEAL_A
    );

    const created = createMealMock.mock.calls[0][0];
    expect(created.foods).toHaveLength(2);
    expect(created.foods.map((f: { food_id: string }) => f.food_id)).toEqual([
      'food-rice',
      'food-chicken',
    ]);
  });

  it('keeps the old behaviour when no logged meal is named', async () => {
    getFoodEntriesByDateAndMealTypeMock.mockResolvedValue([
      entry('rice', MEAL_A),
      entry('coffee', null),
    ]);

    await mealService.createMealFromDiaryEntries(
      'user-1',
      '2026-08-27',
      'lunch',
      'Lunch'
    );

    // The web "convert this meal type" button still takes everything.
    expect(createMealMock.mock.calls[0][0].foods).toHaveLength(2);
  });

  it('throws when the named logged meal has no entries', async () => {
    getFoodEntriesByDateAndMealTypeMock.mockResolvedValue([
      entry('coffee', null),
    ]);

    await expect(
      mealService.createMealFromDiaryEntries(
        'user-1',
        '2026-08-27',
        'lunch',
        'Chicken Biryani',
        null,
        false,
        MEAL_A
      )
    ).rejects.toThrow(/No food entries found/);
  });

  it('records one serving as the plate exactly as logged', async () => {
    getFoodEntriesByDateAndMealTypeMock.mockResolvedValue([
      entry('rice', MEAL_A),
    ]);

    await mealService.createMealFromDiaryEntries(
      'user-1',
      '2026-08-27',
      'lunch',
      'Chicken Biryani',
      null,
      false,
      MEAL_A
    );

    // A template-backed logged meal scales components by
    // quantity / (serving_size * total_servings). 1/serving/1 makes re-logging
    // one serving reproduce these amounts; anything else rescales silently.
    const created = createMealMock.mock.calls[0][0];
    expect(created.serving_size).toBe(1.0);
    expect(created.serving_unit).toBe('serving');
    expect(created.total_servings).toBe(1.0);
    expect(created.foods[0].quantity).toBe(100);
  });

  it('restores the whole dish when only a portion was logged', async () => {
    // The diary holds one 250 ml glass of a 2000 ml batch, so its entry is an
    // eighth of the recipe: 100 g of rice went in as 12.5 g.
    getFoodEntriesByDateAndMealTypeMock.mockResolvedValue([
      { ...entry('rice', MEAL_A), quantity: 12.5 },
    ]);

    await mealService.createMealFromDiaryEntries(
      'user-1',
      '2026-08-27',
      'lunch',
      'Mango Lassi',
      null,
      false,
      MEAL_A,
      8,
      8,
      250,
      'ml'
    );

    const created = createMealMock.mock.calls[0][0];
    // The template holds the BATCH, not the glass.
    expect(created.foods[0].quantity).toBe(100);
    expect(created.serving_size).toBe(250);
    expect(created.serving_unit).toBe('ml');
    expect(created.total_servings).toBe(8);
    // The round trip that matters: logging one serving_size of this template
    // multiplies its components by 250 / (250 * 8), landing back on the 12.5 g
    // the diary already holds. A mismatch here would rescale every future log.
    const reLogFactor =
      created.serving_size / (created.serving_size * created.total_servings);
    expect(created.foods[0].quantity * reLogFactor).toBeCloseTo(12.5, 6);
  });
});
