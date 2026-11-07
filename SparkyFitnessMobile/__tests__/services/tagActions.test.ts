import { QueryClient } from '@tanstack/react-query';
import {
  glucoseContextQueryKeyRoot,
  dailySummaryQueryKey,
  waterIntakeLogQueryKey,
  caffeineActiveQueryKey,
} from '../../src/hooks/queryKeys';
import type { TagAction } from '@workspace/shared';
import { changeWaterIntake } from '../../src/services/api/measurementsApi';
import { deleteFoodEntry } from '../../src/services/api/foodEntriesApi';
import { deleteFoodEntryMeal } from '../../src/services/api/foodEntryMealsApi';
import {
  describeTagAction,
  refreshAfterTagAction,
  undoTagAction,
} from '../../src/services/tagActions';
import type { WaterContainer } from '../../src/types/measurements';
import type { MealType } from '../../src/types/mealTypes';
import i18n, { initializeI18n } from '../../src/localization/i18n';

jest.mock('../../src/services/api/measurementsApi', () => ({
  changeWaterIntake: jest.fn(() => Promise.resolve({})),
}));
jest.mock('../../src/services/api/foodEntriesApi', () => ({
  deleteFoodEntry: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/services/api/foodEntryMealsApi', () => ({
  deleteFoodEntryMeal: jest.fn(() => Promise.resolve()),
}));

const action: TagAction = { type: 'water', container_id: 7, drinks: 2 };
const t = ((key: string, options: Record<string, unknown>) =>
  String(options.defaultValue)
    .replace('{{drinks}}', String(options.drinks))
    .replace('{{name}}', String(options.name))) as never;

describe('tag actions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('describes a water action with its container', () => {
    const containers = [{ id: 7, name: 'Stanley' }] as WaterContainer[];
    expect(
      describeTagAction(t, action, {
        waterContainers: containers,
        mealTypes: [],
      })
    ).toBe('2 × Stanley');
  });

  it('says so when the container was deleted', () => {
    expect(
      describeTagAction(t, action, { waterContainers: [], mealTypes: [] })
    ).toBe('Water container no longer exists');
  });

  it('undoes a water action by removing the same drinks', async () => {
    await undoTagAction(action, '2026-10-30');
    expect(changeWaterIntake).toHaveBeenCalledWith({
      entryDate: '2026-10-30',
      changeDrinks: -2,
      containerId: 7,
    });
  });

  it('refreshes the water caches for that day', () => {
    const queryClient = new QueryClient();
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    refreshAfterTagAction(queryClient, action, '2026-10-30');
    expect(spy.mock.calls.map(([options]) => options?.queryKey)).toEqual(
      expect.arrayContaining([
        glucoseContextQueryKeyRoot,
        dailySummaryQueryKey('2026-10-30'),
        waterIntakeLogQueryKey('2026-10-30'),
        caffeineActiveQueryKey('2026-10-30'),
      ])
    );
  });
});

describe('food and meal tag actions', () => {
  const food: TagAction = {
    type: 'food',
    food_id: 'food-1',
    variant_id: 'variant-1',
    quantity: 170,
    unit: 'g',
    meal: { mode: 'auto' },
  };
  const meal: TagAction = {
    type: 'meal',
    meal_template_id: 'meal-1',
    quantity: 2,
    unit: 'serving',
    meal: { mode: 'fixed', meal_type_id: 'snacks-id' },
  };
  const mealTypes = [
    { id: 'snacks-id', name: 'snacks', user_id: null },
  ] as MealType[];
  const context = { waterContainers: [], mealTypes };

  beforeAll(async () => {
    await initializeI18n('en');
  });
  beforeEach(() => jest.clearAllMocks());

  it('describes the amount and where it is logged', () => {
    const tr = i18n.t.bind(i18n);
    expect(describeTagAction(tr, food, context)).toBe('170 g · By time of day');
    expect(describeTagAction(tr, meal, context)).toBe('2 servings · Snacks');
  });

  it('falls back to the time of day when the fixed meal type is gone', () => {
    const tr = i18n.t.bind(i18n);
    expect(
      describeTagAction(tr, meal, { waterContainers: [], mealTypes: [] })
    ).toBe('2 servings · By time of day');
  });

  it('does not crash on an action type this app does not know', () => {
    const tr = i18n.t.bind(i18n);
    const unknown = { type: 'medication' } as unknown as TagAction;
    expect(describeTagAction(tr, unknown, context)).toBe(
      'Update the app to use this tag'
    );
    expect(() =>
      refreshAfterTagAction(new QueryClient(), unknown, '2026-10-30')
    ).not.toThrow();
  });

  it('undoes a food or meal tap by deleting the row it logged', async () => {
    await undoTagAction(food, '2026-10-30', {
      kind: 'food_entry',
      id: 'entry-1',
    });
    await undoTagAction(meal, '2026-10-30', {
      kind: 'food_entry_meal',
      id: 'logged-1',
    });
    expect(deleteFoodEntry).toHaveBeenCalledWith('entry-1');
    expect(deleteFoodEntryMeal).toHaveBeenCalledWith('logged-1');
  });

  it('refuses to undo a food tap without knowing what it logged', async () => {
    await expect(undoTagAction(food, '2026-10-30', null)).rejects.toThrow();
    expect(deleteFoodEntry).not.toHaveBeenCalled();
  });
});
