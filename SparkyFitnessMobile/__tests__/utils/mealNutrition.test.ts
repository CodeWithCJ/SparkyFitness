import {
  getFoodEntryMealTypeKey,
  getMealTypeDisplayLabel,
  getMealPercentage,
  groupFoodEntriesByMealType,
  filterFoodEntriesByMealTypeId,
} from '../../src/utils/mealNutrition';
import type { DailyGoals } from '../../src/types/goals';
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


describe('getMealTypeDisplayLabel', () => {
  const t = (key: string): string => {
    const map: Record<string, string> = {
      'mealTypes.breakfast': 'Śniadanie',
      'mealTypes.lunch': 'Obiad',
      'mealTypes.dinner': 'Kolacja',
      'mealTypes.snacks': 'Przekąski',
      'mealTypes.other': 'Inne',
    };
    return map[key] ?? key;
  };

  it('localizes system meal types', () => {
    expect(getMealTypeDisplayLabel('breakfast', t)).toBe('Śniadanie');
    expect(getMealTypeDisplayLabel('LUNCH', t)).toBe('Obiad');
    expect(getMealTypeDisplayLabel('snacks', t)).toBe('Przekąski');
    expect(getMealTypeDisplayLabel('other', t)).toBe('Inne');
  });

  it('keeps custom meal type names literal', () => {
    expect(getMealTypeDisplayLabel('Brunch', t)).toBe('Brunch');
    expect(getMealTypeDisplayLabel('Drugie śniadanie', t)).toBe('Drugie śniadanie');
  });

  it('keeps a custom name that looks like an i18n key literal (never dynamic t)', () => {
    expect(getMealTypeDisplayLabel('mealTypes.breakfast', t)).toBe('mealTypes.breakfast');
  });

  it('keeps unknown historical names literal', () => {
    expect(getMealTypeDisplayLabel('completely-unknown-slot', t)).toBe('completely-unknown-slot');
  });
});

describe('filterFoodEntriesByMealTypeId', () => {
  it('matches entries by canonical id first', () => {
    const entries: FoodEntry[] = [
      { id: '1', meal_type_id: 'custom-pw', meal_type: 'Pre-Workout' } as FoodEntry,
      { id: '2', meal_type_id: 'sys-l', meal_type: 'lunch' } as FoodEntry,
    ];
    const filtered = filterFoodEntriesByMealTypeId(entries, 'custom-pw', 'Pre-Workout', customMealTypes);
    expect(filtered.map((e) => e.id)).toEqual(['1']);
  });

  it('does not mix two categories that share a name but differ by id', () => {
    const entries: FoodEntry[] = [
      { id: '1', meal_type_id: 'dup-a', meal_type: 'Fasting' } as FoodEntry,
      { id: '2', meal_type_id: 'dup-b', meal_type: 'Fasting' } as FoodEntry,
    ];
    const filtered = filterFoodEntriesByMealTypeId(entries, 'dup-a', 'Fasting', []);
    expect(filtered.map((e) => e.id)).toEqual(['1']);
  });

  it('falls back to the snapshotted name for a deleted/hidden type', () => {
    const entries: FoodEntry[] = [
      { id: '1', meal_type_id: 'deleted-id', meal_type: 'Old Meal' } as FoodEntry,
    ];
    // No matching type in the list (deleted): filter by name.
    const filtered = filterFoodEntriesByMealTypeId(entries, undefined, 'Old Meal', []);
    expect(filtered.map((e) => e.id)).toEqual(['1']);
  });

  it('matches entries without an id by resolved name when id is given', () => {
    const entries: FoodEntry[] = [
      { id: '1', meal_type: 'Pre-Workout' } as FoodEntry,
      { id: '2', meal_type: 'lunch' } as FoodEntry,
    ];
    const filtered = filterFoodEntriesByMealTypeId(entries, 'custom-pw', 'Pre-Workout', customMealTypes);
    expect(filtered.map((e) => e.id)).toEqual(['1']);
  });
});

describe('groupFoodEntriesByMealType — unknown types', () => {
  it('keeps two different unknown ids in separate groups, not one Other', () => {
    const entries: FoodEntry[] = [
      { id: '1', meal_type_id: 'deleted-a', meal_type: 'Old Meal A' } as FoodEntry,
      { id: '2', meal_type_id: 'deleted-b', meal_type: 'Old Meal B' } as FoodEntry,
    ];
    const groups = groupFoodEntriesByMealType(entries, systemMealTypes);
    const names = groups.map((g) => g.name);
    expect(names).toContain('Old Meal A');
    expect(names).toContain('Old Meal B');
    expect(groups.filter((g) => g.name === 'other')).toHaveLength(0);
  });

  it('keeps a hidden type entry visible in its own group by id', () => {
    const entries: FoodEntry[] = [
      { id: '1', meal_type_id: 'hidden-id', meal_type: 'Hidden Meal' } as FoodEntry,
    ];
    const groups = groupFoodEntriesByMealType(entries, systemMealTypes);
    const hidden = groups.find((g) => g.name === 'Hidden Meal');
    expect(hidden).toBeDefined();
    expect(hidden!.mealTypeId).toBe('hidden-id');
    expect(hidden!.entries).toHaveLength(1);
  });

  it('groups nameless unknown entries into the synthetic other group', () => {
    const entries: FoodEntry[] = [
      { id: '1' } as FoodEntry,
    ];
    const groups = groupFoodEntriesByMealType(entries, systemMealTypes);
    const other = groups.find((g) => g.name === 'other');
    expect(other).toBeDefined();
    expect(other!.entries).toHaveLength(1);
  });
});

describe('getMealPercentage', () => {
  it('uses legacy percentage fields for system meal types', () => {
    const goals: DailyGoals = { breakfast_percentage: 25, lunch_percentage: 30 } as DailyGoals;
    expect(getMealPercentage('breakfast', goals)).toBe(25);
    expect(getMealPercentage('lunch', goals)).toBe(30);
  });

  it('looks up custom meal percentages by lowercase name (web contract)', () => {
    const goals: DailyGoals = {
      custom_meal_percentages: { 'pre-workout': 15, 'drugie śniadanie': 10 },
    } as DailyGoals;
    expect(getMealPercentage('Pre-Workout', goals)).toBe(15);
    expect(getMealPercentage('Drugie śniadanie', goals)).toBe(10);
  });

  it('returns 0 after a rename because percentages are keyed by name', () => {
    const goals: DailyGoals = {
      custom_meal_percentages: { 'old-name': 15 },
    } as DailyGoals;
    expect(getMealPercentage('New Name', goals)).toBe(0);
  });

  it('returns 0 for a zero percentage and for a missing percentage', () => {
    const goals: DailyGoals = {
      custom_meal_percentages: { 'zero-meal': 0 },
    } as DailyGoals;
    expect(getMealPercentage('zero-meal', goals)).toBe(0);
    expect(getMealPercentage('missing', goals)).toBe(0);
  });

  it('returns 0 when there are no goals', () => {
    expect(getMealPercentage('breakfast', undefined)).toBe(0);
  });
});
