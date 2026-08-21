import {
  getFoodEntryMealTypeLabel,
  getHistoricalMealTypeLabel,
  getMealGroupLabel,
  getMealTypeDisplayLabel,
  getMealPercentage,
  groupFoodEntriesByMealType,
  filterFoodEntriesByMealTypeId,
  calculateEntryNutrition,
  calculateMealNutrition,
  type MealGroup,
} from '../../src/utils/mealNutrition';
import type { DailyGoals } from '../../src/types/goals';
import type { FoodEntry } from '../../src/types/foodEntries';
import type { MealType } from '../../src/types/mealTypes';
import i18n from '../../src/localization/i18n';

const t = i18n.t;

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

describe('groupFoodEntriesByMealType', () => {
  it('groups entries by meal_type_id and uses server sort_order', () => {
    const entries: FoodEntry[] = [
      { id: '1', meal_type_id: 'custom-pw', meal_type: 'Pre-Workout' } as FoodEntry,
      { id: '2', meal_type_id: 'sys-l', meal_type: 'lunch' } as FoodEntry,
      { id: '3', meal_type_id: 'custom-ps', meal_type: 'Post-Workout' } as FoodEntry,
    ];
    const groups = groupFoodEntriesByMealType(entries, customMealTypes);
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
    const pwGroup = groups.find((g) => g.mealTypeId === 'custom-pw');
    expect(otherGroup).toBeUndefined();
    expect(pwGroup).toBeDefined();
    expect(pwGroup!.entries).toHaveLength(1);
  });

  it('unmatched entries go to a fallback group without a definition', () => {
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
    const breakfastGroup = groups.find((g) => g.mealTypeId === 'sys-b');
    expect(breakfastGroup).toBeDefined();
    expect(breakfastGroup!.entries).toHaveLength(1);
  });

  it('entry without meal_type_id matching custom name finds the custom type', () => {
    const entries: FoodEntry[] = [
      { id: '1', meal_type: 'Pre-Workout' } as FoodEntry,
    ];
    const groups = groupFoodEntriesByMealType(entries, customMealTypes);
    const customGroup = groups.find((g) => g.mealTypeId === 'custom-pw');
    expect(customGroup).toBeDefined();
    expect(customGroup!.entries).toHaveLength(1);
    expect(customGroup!.isSystem).toBe(false);
  });

  it('sorts groups by sort_order ascending', () => {
    const entries: FoodEntry[] = [
      { id: '1', meal_type_id: 'sys-b', meal_type: 'breakfast' } as FoodEntry,
      { id: '2', meal_type_id: 'sys-l', meal_type: 'lunch' } as FoodEntry,
      { id: '3', meal_type_id: 'sys-d', meal_type: 'dinner' } as FoodEntry,
      { id: '4', meal_type_id: 'sys-s', meal_type: 'snacks' } as FoodEntry,
    ];
    const groups = groupFoodEntriesByMealType(entries, systemMealTypes);
    expect(groups.map((g) => g.name)).toEqual(['breakfast', 'lunch', 'dinner', 'snacks']);
  });
});

describe('getMealTypeDisplayLabel', () => {
  it('renders system meal types by ownership with canonical English labels', () => {
    expect(getMealTypeDisplayLabel({ name: 'breakfast', user_id: null }, t)).toBe('Breakfast');
    expect(getMealTypeDisplayLabel({ name: 'LUNCH', user_id: null }, t)).toBe('Lunch');
    expect(getMealTypeDisplayLabel({ name: 'snacks', user_id: null }, t)).toBe('Snacks');
    expect(getMealTypeDisplayLabel({ name: 'other', user_id: null }, t)).toBe('Other');
  });

  it('keeps a CUSTOM type named breakfast literal', () => {
    expect(getMealTypeDisplayLabel({ name: 'breakfast', user_id: 'user-1' }, t)).toBe('breakfast');
  });

  it('keeps custom types named lunch/dinner/snack/other literal', () => {
    expect(getMealTypeDisplayLabel({ name: 'Lunch', user_id: 'user-1' }, t)).toBe('Lunch');
    expect(getMealTypeDisplayLabel({ name: 'DINNER', user_id: 'user-1' }, t)).toBe('DINNER');
    expect(getMealTypeDisplayLabel({ name: 'snack', user_id: 'user-1' }, t)).toBe('snack');
    expect(getMealTypeDisplayLabel({ name: 'other', user_id: 'user-1' }, t)).toBe('other');
  });

  it('keeps custom meal type names literal', () => {
    expect(getMealTypeDisplayLabel({ name: 'Brunch', user_id: 'user-1' }, t)).toBe('Brunch');
    expect(getMealTypeDisplayLabel({ name: 'Drugie śniadanie', user_id: 'user-1' }, t)).toBe('Drugie śniadanie');
  });

  it('keeps a custom name that looks like a system key literal (never a static map)', () => {
    expect(getMealTypeDisplayLabel({ name: 'mealTypes.breakfast', user_id: 'user-1' }, t)).toBe('mealTypes.breakfast');
  });
});

describe('getHistoricalMealTypeLabel', () => {
  it('returns the literal snapshot for a historical entry without a definition', () => {
    // No active definition exists, so even a snapshot reading "breakfast" is
    // never auto-translated; the safe contract prefers the literal name.
    expect(getHistoricalMealTypeLabel('breakfast', t)).toBe('breakfast');
    expect(getHistoricalMealTypeLabel('Old Meal', t)).toBe('Old Meal');
  });

  it('falls back to Other when the snapshot is missing', () => {
    expect(getHistoricalMealTypeLabel(null, t)).toBe('Other');
    expect(getHistoricalMealTypeLabel(undefined, t)).toBe('Other');
    expect(getHistoricalMealTypeLabel('   ', t)).toBe('Other');
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
    const other = groups.find((g) => g.name.toLowerCase() === 'other');
    expect(other).toBeDefined();
    expect(other!.entries).toHaveLength(1);
  });
});

const entry = (overrides: Partial<FoodEntry>): FoodEntry => ({
  id: 'entry-1',
  meal_type: 'breakfast',
  quantity: 1,
  unit: 'serving',
  entry_date: '2026-04-23',
  serving_size: 1,
  calories: 0,
  ...overrides,
});

describe('calculateEntryNutrition / calculateMealNutrition', () => {
  it('scales entry nutrition by quantity and serving size', () => {
    const nutrition = calculateEntryNutrition(entry({
      calories: 200,
      protein: 10,
      carbs: 20,
      fat: 5,
      quantity: 3,
      serving_size: 2,
    }));

    expect(nutrition).toEqual({
      calories: 300,
      protein: 15,
      carbs: 30,
      fat: 8,
    });
  });

  it('totals meal nutrition including optional nutrients only when present', () => {
    const nutrition = calculateMealNutrition([
      entry({
        calories: 200,
        protein: 10,
        carbs: 20,
        fat: 5,
        dietary_fiber: 4,
        sodium: 150,
        quantity: 2,
        serving_size: 1,
      }),
      entry({
        calories: 100,
        protein: 4,
        carbs: 12,
        fat: 3,
        quantity: 1,
        serving_size: 2,
      }),
    ]);

    expect(nutrition.values).toMatchObject({
      servingSize: 1,
      servingUnit: 'meal',
      calories: 450,
      protein: 22,
      carbs: 46,
      fat: 12,
      fiber: 8,
      sodium: 300,
    });
    expect(nutrition.values.calcium).toBeUndefined();
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

describe('groupFoodEntriesByMealType — canonical ID contract', () => {
  it('keeps a deleted custom type separate from an active system type with the same name', () => {
    const types: MealType[] = [
      { id: 'system-breakfast', name: 'breakfast', sort_order: 10, user_id: null, created_at: '', is_visible: true, show_in_quick_log: true },
    ];
    const entries = [
      // Historical entry whose custom type was deleted — id no longer resolves.
      { id: 'e1', meal_type_id: 'custom-old-1', meal_type: 'breakfast' },
      // Entry referencing the active system type.
      { id: 'e2', meal_type_id: 'system-breakfast', meal_type: 'breakfast' },
    ] as FoodEntry[];

    const groups = groupFoodEntriesByMealType(entries, types);

    const sysGroup = groups.find((g) => g.mealTypeId === 'system-breakfast');
    const histGroup = groups.find((g) => g.mealTypeId === 'custom-old-1');
    expect(sysGroup?.entries.map((e) => e.id)).toEqual(['e2']);
    // The deleted custom id must NOT merge into the active system Breakfast.
    expect(histGroup?.entries.map((e) => e.id)).toEqual(['e1']);
    expect(histGroup?.isSystem).toBe(false);
    expect(histGroup?.name).toBe('breakfast');
  });

  it('matches by name only when the entry has no meal_type_id', () => {
    const types: MealType[] = [
      { id: 'system-breakfast', name: 'breakfast', sort_order: 10, user_id: null, created_at: '', is_visible: true, show_in_quick_log: true },
    ];
    const groups = groupFoodEntriesByMealType(
      [{ id: 'e1', meal_type_id: null, meal_type: 'breakfast' }] as FoodEntry[],
      types,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].mealTypeId).toBe('system-breakfast');
    expect(groups[0].isSystem).toBe(true);
  });
});

describe('getMealGroupLabel — historical groups stay literal', () => {
  it('keeps a fallback group literal (never translated to the system label)', () => {
    const group: MealGroup = {
      mealTypeId: 'custom-old-1',
      name: 'breakfast',
      sortOrder: 9999,
      entries: [],
      isSystem: false,
      user_id: null,
    };
    expect(getMealGroupLabel(group, t)).toBe('breakfast');
  });

  it('renders a system group through the canonical English label', () => {
    const group: MealGroup = {
      mealTypeId: 'system-breakfast',
      name: 'breakfast',
      sortOrder: 10,
      entries: [],
      isSystem: true,
      user_id: null,
    };
    expect(getMealGroupLabel(group, t)).toBe('Breakfast');
  });
});

describe('groupFoodEntriesByMealType — distinct historical fallback groups', () => {
  it('groups two no-id historical entries by their own names', () => {
    const groups = groupFoodEntriesByMealType(
      [
        { id: 'e1', meal_type_id: null, meal_type: 'Morning Snack' },
        { id: 'e2', meal_type_id: null, meal_type: 'Night Snack' },
      ] as FoodEntry[],
      [],
    );

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.name).sort()).toEqual(['Morning Snack', 'Night Snack']);
    // Both are fallback groups: never system, and each keeps its own id-less key.
    expect(groups.every((g) => g.isSystem === false && g.mealTypeId === null)).toBe(true);
  });
});

describe('getFoodEntryMealTypeLabel — id-first label resolution', () => {
  const types: MealType[] = [
    { id: 'system-breakfast', name: 'breakfast', sort_order: 10, user_id: null, created_at: '', is_visible: true, show_in_quick_log: true },
    { id: 'custom-b', name: 'breakfast', sort_order: 20, user_id: 'user1', created_at: '', is_visible: true, show_in_quick_log: true },
  ];

  it('resolves an active definition by id with ownership-aware display', () => {
    expect(
      getFoodEntryMealTypeLabel({ meal_type_id: 'custom-b', meal_type: 'breakfast' }, types, t),
    ).toBe('breakfast');
    expect(
      getFoodEntryMealTypeLabel({ meal_type_id: 'system-breakfast', meal_type: 'breakfast' }, types, t),
    ).toBe('Breakfast');
  });

  it('keeps an unknown historical id literal instead of rematching by name', () => {
    // custom-old-1 no longer resolves; even though an active system "breakfast"
    // exists, the literal historical label wins.
    expect(
      getFoodEntryMealTypeLabel({ meal_type_id: 'custom-old-1', meal_type: 'breakfast' }, types, t),
    ).toBe('breakfast');
  });

  it('uses name-only resolution only when the id is absent', () => {
    // Only the system definition is active here, so the name-only path resolves
    // to the canonical English label.
    const onlySystem: MealType[] = [types[0]];
    expect(
      getFoodEntryMealTypeLabel({ meal_type_id: null, meal_type: 'breakfast' }, onlySystem, t),
    ).toBe('Breakfast');
  });

describe('blank historical meal type compatibility', () => {
  it('groups a blank-name entry into the synthetic Other bucket', () => {
    const { getMealGroupLabel, groupFoodEntriesByMealType } = require('../../src/utils/mealNutrition');
    const groups = groupFoodEntriesByMealType(
      [{ id: 'e1', meal_type_id: null, meal_type: '' } as FoodEntry],
      [],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('Other');
    expect(groups[0].isSystem).toBe(false);
    expect(getMealGroupLabel(groups[0], t)).toBe('Other');
  });

  it('detail filter matches a blank-name entry under the other bucket', () => {
    const { filterFoodEntriesByMealTypeId } = require('../../src/utils/mealNutrition');
    const entries = [{ id: 'e1', meal_type_id: null, meal_type: '' } as FoodEntry];
    // Opening "Other" from the summary must show the blank-name entry.
    expect(filterFoodEntriesByMealTypeId(entries, null, 'other', [])).toHaveLength(1);
    expect(filterFoodEntriesByMealTypeId(entries, null, 'Other', [])).toHaveLength(1);
  });
});

});
