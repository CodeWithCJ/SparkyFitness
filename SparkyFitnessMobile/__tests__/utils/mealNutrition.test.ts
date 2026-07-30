import {
  getFoodEntryMealTypeKey,
  groupFoodEntriesByMealType,
} from '../../src/utils/mealNutrition';
import type { FoodEntry } from '../../src/types/foodEntries';
import type { MealType } from '../../src/types/mealTypes';

const systemMealTypes: MealType[] = [
  { id: 'sys-b', name: 'breakfast', sort_order: 0, user_id: null, created_at: '', is_visible: true, show_in_quick_log: true },
  { id: 'sys-l', name: 'lunch', sort_order: 1, user_id: null, created_at: '', is_visible: true, show_in_quick_log: true },
  { id: 'sys-d', name: 'dinner', sort_order: 2, user_id: null, created_at: '', is_visible: true, show_in_quick_log: true },
  { id: 'sys-s', name: 'snacks', sort_order: 3, user_id: null, created_at: '', is_visible: true, show_in_quick_log: true },
];

const customMealTypes: MealType[] = [
  ...systemMealTypes,
  { id: 'custom-pw', name: 'Pre-Workout', sort_order: 0, user_id: 'user1', created_at: '', is_visible: true, show_in_quick_log: true },
  { id: 'custom-ps', name: 'Post-Workout', sort_order: 5, user_id: 'user1', created_at: '', is_visible: true, show_in_quick_log: true },
  { id: 'custom-sn', name: 'Drugie śniadanie', sort_order: 0, user_id: 'user1', created_at: '', is_visible: true, show_in_quick_log: true },
];

describe('getFoodEntryMealTypeKey', () => {
  it('matches by meal_type_id when type exists', () => {
    const entry: FoodEntry = {
      id: '1', meal_type_id: 'custom-pw', meal_type: 'breakfast',
    } as FoodEntry;
    expect(getFoodEntryMealTypeKey(entry, customMealTypes)).toBe('Pre-Workout');
  });

  it('falls back to name when meal_type_id does not match any type', () => {
    const entry: FoodEntry = {
      id: '2', meal_type_id: 'unknown-id', meal_type: 'lunch',
    } as FoodEntry;
    expect(getFoodEntryMealTypeKey(entry, customMealTypes)).toBe('lunch');
  });

  it('falls back to name when meal_type_id is missing', () => {
    const entry: FoodEntry = {
      id: '3', meal_type: 'dinner',
    } as FoodEntry;
    expect(getFoodEntryMealTypeKey(entry, customMealTypes)).toBe('dinner');
  });

  it('returns other for unknown meal type', () => {
    const entry: FoodEntry = {
      id: '4', meal_type: 'unknown-slot',
    } as FoodEntry;
    expect(getFoodEntryMealTypeKey(entry, customMealTypes)).toBe('other');
  });

  it('preserves custom meal type name', () => {
    const entry: FoodEntry = {
      id: '5', meal_type_id: 'custom-sn', meal_type: 'Drugie śniadanie',
    } as FoodEntry;
    expect(getFoodEntryMealTypeKey(entry, customMealTypes)).toBe('Drugie śniadanie');
  });
});

describe('groupFoodEntriesByMealType', () => {
  it('groups entries by meal_type_id and uses server sort_order', () => {
    const entries: FoodEntry[] = [
      { id: '1', meal_type_id: 'custom-ps', meal_type: 'Post-Workout' } as FoodEntry,
      { id: '2', meal_type_id: 'custom-pw', meal_type: 'Pre-Workout' } as FoodEntry,
      { id: '3', meal_type_id: 'sys-l', meal_type: 'lunch' } as FoodEntry,
    ];

    const groups = groupFoodEntriesByMealType(entries, customMealTypes);

    // Pre-Workout has sort_order 0, lunch has 1, Post-Workout has 5
    expect(groups[0].name).toBe('Pre-Workout');
    expect(groups[1].name).toBe('lunch');
    expect(groups[2].name).toBe('Post-Workout');
  });

  it('custom type does not go to Other', () => {
    const entries: FoodEntry[] = [
      { id: '1', meal_type_id: 'custom-pw', meal_type: 'Pre-Workout' } as FoodEntry,
    ];

    const groups = groupFoodEntriesByMealType(entries, customMealTypes);

    const otherGroup = groups.find((g) => g.name === 'other');
    expect(otherGroup).toBeUndefined();
    const pwGroup = groups.find((g) => g.name === 'Pre-Workout');
    expect(pwGroup).toBeDefined();
    expect(pwGroup!.entries).toHaveLength(1);
  });

  it('unmatched entries go to Other', () => {
    const entries: FoodEntry[] = [
      { id: '1', meal_type: 'completely-unknown' } as FoodEntry,
    ];

    const groups = groupFoodEntriesByMealType(entries, customMealTypes);

    const otherGroup = groups.find((g) => g.mealTypeId === null);
    expect(otherGroup).toBeDefined();
    expect(otherGroup!.entries).toHaveLength(1);
  });

  it('entry without meal_type_id is matched by name', () => {
    const entries: FoodEntry[] = [
      { id: '1', meal_type: 'breakfast' } as FoodEntry,
    ];

    const groups = groupFoodEntriesByMealType(entries, customMealTypes);

    const breakfastGroup = groups.find((g) => g.name === 'breakfast');
    expect(breakfastGroup).toBeDefined();
    expect(breakfastGroup!.entries).toHaveLength(1);
  });

  it('entry without meal_type_id matching custom name finds the custom type', () => {
    const entries: FoodEntry[] = [
      { id: '1', meal_type: 'Drugie śniadanie' } as FoodEntry,
    ];

    const groups = groupFoodEntriesByMealType(entries, customMealTypes);

    const customGroup = groups.find((g) => g.name === 'Drugie śniadanie');
    expect(customGroup).toBeDefined();
    expect(customGroup!.entries).toHaveLength(1);
    expect(customGroup!.isSystem).toBe(false);
  });

  it('sorts groups by sort_order ascending', () => {
    const entries: FoodEntry[] = [
      { id: '1', meal_type_id: 'sys-s', meal_type: 'snacks' } as FoodEntry,
      { id: '2', meal_type_id: 'sys-b', meal_type: 'breakfast' } as FoodEntry,
      { id: '3', meal_type_id: 'sys-d', meal_type: 'dinner' } as FoodEntry,
      { id: '4', meal_type_id: 'sys-l', meal_type: 'lunch' } as FoodEntry,
    ];

    const groups = groupFoodEntriesByMealType(entries, systemMealTypes);

    expect(groups.map((g) => g.name)).toEqual(['breakfast', 'lunch', 'dinner', 'snacks']);
  });
});
