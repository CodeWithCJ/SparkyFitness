import {
  hasLoggedMealComponents,
  loggedMealToFoodEntry,
  collapseLoggedMealComponents,
  resolveCollapsedFoodEntries,
} from '../../src/utils/loggedMealCollapse';
import { fetchFoodEntryMealsByDate } from '../../src/services/api/foodEntryMealsApi';
import type { FoodEntry } from '../../src/types/foodEntries';
import type { FoodEntryMeal } from '../../src/types/foodEntryMeals';

jest.mock('../../src/services/api/foodEntryMealsApi', () => ({
  fetchFoodEntryMealsByDate: jest.fn(),
}));

const mockFetchFoodEntryMealsByDate = fetchFoodEntryMealsByDate as jest.MockedFunction<
  typeof fetchFoodEntryMealsByDate
>;

const makeEntry = (overrides: Partial<FoodEntry> = {}): FoodEntry => ({
  id: 'entry-1',
  meal_type: 'breakfast',
  quantity: 1,
  unit: 'g',
  entry_date: '2024-06-15',
  serving_size: 100,
  calories: 250,
  ...overrides,
});

const makeMeal = (overrides: Partial<FoodEntryMeal> = {}): FoodEntryMeal => ({
  id: 'meal-1',
  user_id: 'user-1',
  meal_template_id: 'template-1',
  meal_type: 'lunch',
  meal_type_id: 'mt-lunch',
  entry_date: '2024-06-15',
  name: 'Chicken Bowl',
  description: null,
  quantity: 2,
  unit: 'serving',
  foods: [],
  calories: 600,
  protein: 45,
  carbs: 50,
  fat: 20,
  ...overrides,
});

describe('hasLoggedMealComponents', () => {
  test('false for entries without meal links', () => {
    expect(hasLoggedMealComponents([makeEntry(), makeEntry({ id: 'entry-2' })])).toBe(false);
  });

  test('true when any entry carries food_entry_meal_id', () => {
    expect(
      hasLoggedMealComponents([makeEntry(), makeEntry({ food_entry_meal_id: 'meal-1' })]),
    ).toBe(true);
  });

  test('false for an empty list', () => {
    expect(hasLoggedMealComponents([])).toBe(false);
  });

  test('null-safe for missing list and holes', () => {
    expect(hasLoggedMealComponents(undefined as unknown as FoodEntry[])).toBe(false);
    expect(hasLoggedMealComponents([undefined as unknown as FoodEntry])).toBe(false);
  });
});

describe('loggedMealToFoodEntry', () => {
  test('maps meal fields and tags the entry with its meal id', () => {
    const entry = loggedMealToFoodEntry(makeMeal());

    expect(entry.id).toBe('meal-1');
    expect(entry.food_entry_meal_id).toBe('meal-1');
    expect(entry.meal_id).toBe('template-1');
    expect(entry.food_name).toBe('Chicken Bowl');
    expect(entry.meal_type).toBe('lunch');
    expect(entry.calories).toBe(600);
    expect(entry.protein).toBe(45);
  });

  test('serving_size equals quantity so consumed-amount scaling is a no-op', () => {
    // Consumers compute value * quantity / serving_size; the meal's stored
    // nutrition is already its own total, so the ratio must be exactly 1.
    const entry = loggedMealToFoodEntry(makeMeal({ quantity: 2.5 }));
    expect(entry.quantity).toBe(2.5);
    expect(entry.serving_size).toBe(2.5);
    expect(entry.serving_unit).toBe(entry.unit);
  });

  test('non-positive or invalid quantity falls back to 1', () => {
    expect(loggedMealToFoodEntry(makeMeal({ quantity: 0 })).quantity).toBe(1);
    expect(loggedMealToFoodEntry(makeMeal({ quantity: -3 })).quantity).toBe(1);
    expect(
      loggedMealToFoodEntry(makeMeal({ quantity: NaN as unknown as number })).quantity,
    ).toBe(1);
    expect(loggedMealToFoodEntry(makeMeal({ quantity: 0 })).serving_size).toBe(1);
  });

  test('missing calories defaults to 0', () => {
    expect(loggedMealToFoodEntry(makeMeal({ calories: undefined })).calories).toBe(0);
  });

  test('null meal_template_id and meal_type_id map to undefined', () => {
    const entry = loggedMealToFoodEntry(makeMeal({ meal_template_id: null, meal_type_id: null }));
    expect(entry.meal_id).toBeUndefined();
    expect(entry.meal_type_id).toBeUndefined();
  });

  test('has no source, so writeback source filters keep it', () => {
    expect(loggedMealToFoodEntry(makeMeal()).source).toBeUndefined();
  });
});

describe('collapseLoggedMealComponents', () => {
  test('collapses multiple components into one entry per logged meal', () => {
    const meal = makeMeal({ calories: 600 });
    const entries = [
      makeEntry({ id: 'c1', food_entry_meal_id: 'meal-1', calories: 200 }),
      makeEntry({ id: 'c2', food_entry_meal_id: 'meal-1', calories: 400 }),
    ];

    const collapsed = collapseLoggedMealComponents(entries, [meal]);

    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].id).toBe('meal-1');
    // The collapsed entry carries the meal total, not a component sum.
    expect(collapsed[0].calories).toBe(600);
  });

  test('preserves standalone entries and their position', () => {
    const meal = makeMeal();
    const standalone = makeEntry({ id: 'solo' });
    const entries = [
      standalone,
      makeEntry({ id: 'c1', food_entry_meal_id: 'meal-1' }),
      makeEntry({ id: 'c2', food_entry_meal_id: 'meal-1' }),
    ];

    const collapsed = collapseLoggedMealComponents(entries, [meal]);

    expect(collapsed.map((e) => e.id)).toEqual(['solo', 'meal-1']);
    expect(collapsed[0]).toBe(standalone);
  });

  test('component whose meal is missing from the list passes through unchanged', () => {
    const orphan = makeEntry({ id: 'c1', food_entry_meal_id: 'unknown-meal' });

    const collapsed = collapseLoggedMealComponents([orphan], [makeMeal()]);

    expect(collapsed.map((e) => e.id)).toEqual(['c1', 'meal-1']);
    expect(collapsed[0]).toBe(orphan);
  });

  test('logged meals with no components in the entry list are appended', () => {
    const collapsed = collapseLoggedMealComponents(
      [makeEntry({ id: 'solo' })],
      [makeMeal({ id: 'meal-x' })],
    );

    expect(collapsed.map((e) => e.id)).toEqual(['solo', 'meal-x']);
  });

  test('two different logged meals each collapse independently', () => {
    const entries = [
      makeEntry({ id: 'a1', food_entry_meal_id: 'meal-a' }),
      makeEntry({ id: 'b1', food_entry_meal_id: 'meal-b' }),
      makeEntry({ id: 'a2', food_entry_meal_id: 'meal-a' }),
    ];
    const meals = [makeMeal({ id: 'meal-a' }), makeMeal({ id: 'meal-b' })];

    const collapsed = collapseLoggedMealComponents(entries, meals);

    expect(collapsed.map((e) => e.id)).toEqual(['meal-a', 'meal-b']);
  });

  test('missing entry list collapses to empty', () => {
    expect(collapseLoggedMealComponents(undefined as unknown as FoodEntry[], [makeMeal()])).toEqual([]);
  });

  test('no logged meals returns the entries untouched', () => {
    const entries = [makeEntry()];
    expect(collapseLoggedMealComponents(entries, [])).toBe(entries);
    expect(collapseLoggedMealComponents(entries, undefined as unknown as FoodEntryMeal[])).toBe(entries);
  });
});

describe('resolveCollapsedFoodEntries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('skips the fetch entirely when no entry is a meal component', async () => {
    const entries = [makeEntry()];

    const result = await resolveCollapsedFoodEntries('2024-06-15', entries);

    expect(result).toBe(entries);
    expect(mockFetchFoodEntryMealsByDate).not.toHaveBeenCalled();
  });

  test('fetches logged meals for the date and collapses components', async () => {
    mockFetchFoodEntryMealsByDate.mockResolvedValue([makeMeal()]);
    const entries = [
      makeEntry({ id: 'c1', food_entry_meal_id: 'meal-1' }),
      makeEntry({ id: 'c2', food_entry_meal_id: 'meal-1' }),
    ];

    const result = await resolveCollapsedFoodEntries('2024-06-15', entries);

    expect(mockFetchFoodEntryMealsByDate).toHaveBeenCalledWith('2024-06-15');
    expect(result.map((e) => e.id)).toEqual(['meal-1']);
  });

  test('falls back to the raw entries when the fetch fails', async () => {
    mockFetchFoodEntryMealsByDate.mockRejectedValue(new Error('network down'));
    const entries = [makeEntry({ id: 'c1', food_entry_meal_id: 'meal-1' })];

    const result = await resolveCollapsedFoodEntries('2024-06-15', entries);

    expect(result).toBe(entries);
  });

  test('missing raw entries resolve to an empty list', async () => {
    const result = await resolveCollapsedFoodEntries(
      '2024-06-15',
      undefined as unknown as FoodEntry[],
    );

    expect(result).toEqual([]);
    expect(mockFetchFoodEntryMealsByDate).not.toHaveBeenCalled();
  });
});
