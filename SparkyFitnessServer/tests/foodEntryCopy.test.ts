import { vi, beforeEach, describe, expect, it } from 'vitest';
import {
  copyAllFoodEntries,
  copyFoodEntries,
  copyFoodEntriesFromUser,
  copyFoodEntriesFromYesterday,
  copyFoodEntriesToUser,
} from '../services/foodEntryService.js';
import familyAccessRepository from '../models/familyAccessRepository.js';
import foodRepository from '../models/foodRepository.js';
import mealTypeRepository from '../models/mealType.js';

vi.mock('../models/familyAccessRepository');
vi.mock('../models/foodRepository');
vi.mock('../models/foodEntryMealRepository');
vi.mock('../models/mealType.js');
vi.mock('../config/logging', () => ({ log: vi.fn() }));

const ACTOR_A = 'actor-a';
const MEMBER_B = 'member-b';

describe('foodEntryService symmetrical cross-user copy tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('copyFoodEntriesFromUser', () => {
    it('throws Forbidden error when family permissions check fails', async () => {
      // Mock checkCopyPermissions to return false
      vi.mocked(familyAccessRepository.checkCopyPermissions).mockResolvedValue(
        false
      );

      await expect(
        copyFoodEntriesFromUser(
          ACTOR_A,
          ACTOR_A,
          MEMBER_B,
          '2026-06-17',
          'Lunch',
          '2026-06-17',
          'Lunch'
        )
      ).rejects.toThrow(
        'Forbidden: You do not have permissions to copy from this family member.'
      );
    });

    it('successfully copies food entries from family user B to actor A when permissions exist', async () => {
      // Mock permissions to be active
      vi.mocked(familyAccessRepository.checkCopyPermissions).mockResolvedValue(
        true
      );

      // Mock mealType resolution
      vi.mocked(mealTypeRepository.getAllMealTypes).mockResolvedValue([
        { id: 'meal-type-lunch-id', name: 'Lunch', user_id: null },
      ]);

      // Mock source food entries returned from B
      const mockEntries = [
        {
          id: 'entry-1',
          food_id: 'food-abc',
          variant_id: 'variant-xyz',
          quantity: 1.5,
          unit: 'serving',
          food_name: 'Banana',
          brand_name: 'Fresh',
          serving_size: 1,
          serving_unit: 'piece',
          calories: 105,
          protein: 1.3,
          carbs: 27,
          fat: 0.3,
          saturated_fat: 0.1,
          polyunsaturated_fat: 0.1,
          monounsaturated_fat: 0.1,
          trans_fat: 0,
          cholesterol: 0,
          sodium: 1,
          potassium: 422,
          dietary_fiber: 3.1,
          sugars: 14,
          vitamin_a: 1,
          vitamin_c: 10,
          calcium: 6,
          iron: 0.3,
          glycemic_index: 51,
          custom_nutrients: {},
        },
      ];
      vi.mocked(
        foodRepository.getFoodEntriesByDateAndMealType
      ).mockResolvedValue(mockEntries);

      // Mock duplicate check returning nothing
      vi.mocked(foodRepository.getFoodEntryByDetails).mockResolvedValue(
        undefined
      );

      // Mock bulkCreate
      const mockResult = [
        { id: 'entry-copied-1', user_id: ACTOR_A, food_id: 'food-abc' },
      ];
      vi.mocked(foodRepository.bulkCreateFoodEntries).mockResolvedValue(
        mockResult
      );

      const result = await copyFoodEntriesFromUser(
        ACTOR_A,
        ACTOR_A,
        MEMBER_B,
        '2026-06-17',
        'Lunch',
        '2026-06-17',
        'Lunch'
      );

      expect(familyAccessRepository.checkCopyPermissions).toHaveBeenCalledWith(
        ACTOR_A,
        MEMBER_B
      );
      expect(
        foodRepository.getFoodEntriesByDateAndMealType
      ).toHaveBeenCalledWith(MEMBER_B, '2026-06-17', 'meal-type-lunch-id');
      expect(foodRepository.bulkCreateFoodEntries).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            user_id: ACTOR_A,
            food_id: 'food-abc',
            food_name: 'Banana',
          }),
        ]),
        ACTOR_A
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('copyFoodEntriesToUser', () => {
    it('throws Forbidden error when family permissions check fails', async () => {
      // Mock checkCopyPermissions to return false
      vi.mocked(familyAccessRepository.checkCopyPermissions).mockResolvedValue(
        false
      );

      await expect(
        copyFoodEntriesToUser(
          ACTOR_A,
          ACTOR_A,
          MEMBER_B,
          '2026-06-17',
          'Lunch',
          '2026-06-17',
          'Lunch'
        )
      ).rejects.toThrow(
        'Forbidden: You do not have permissions to copy to this family member.'
      );
    });

    it('successfully copies food entries from actor A to family user B when permissions exist', async () => {
      // Mock permissions to be active
      vi.mocked(familyAccessRepository.checkCopyPermissions).mockResolvedValue(
        true
      );

      // Mock mealType resolution for target user B
      vi.mocked(mealTypeRepository.getAllMealTypes).mockResolvedValue([
        { id: 'meal-type-lunch-id', name: 'Lunch', user_id: null },
      ]);

      // Mock source food entries returned from A
      const mockEntries = [
        {
          id: 'entry-2',
          food_id: 'food-def',
          variant_id: 'variant-uvw',
          quantity: 2,
          unit: 'slice',
          food_name: 'Apple',
          brand_name: 'Organic',
          serving_size: 1,
          serving_unit: 'piece',
          calories: 95,
          protein: 0.5,
          carbs: 25,
          fat: 0.3,
          saturated_fat: 0,
          polyunsaturated_fat: 0,
          monounsaturated_fat: 0,
          trans_fat: 0,
          cholesterol: 0,
          sodium: 2,
          potassium: 195,
          dietary_fiber: 4.4,
          sugars: 19,
          vitamin_a: 2,
          vitamin_c: 8,
          calcium: 6,
          iron: 0.1,
          glycemic_index: 39,
          custom_nutrients: {},
        },
      ];
      vi.mocked(
        foodRepository.getFoodEntriesByDateAndMealType
      ).mockResolvedValue(mockEntries);

      // Mock duplicate check returning nothing
      vi.mocked(foodRepository.getFoodEntryByDetails).mockResolvedValue(
        undefined
      );

      // Mock bulkCreate for B
      const mockResult = [
        { id: 'entry-copied-2', user_id: MEMBER_B, food_id: 'food-def' },
      ];
      vi.mocked(foodRepository.bulkCreateFoodEntries).mockResolvedValue(
        mockResult
      );

      const result = await copyFoodEntriesToUser(
        ACTOR_A,
        ACTOR_A,
        MEMBER_B,
        '2026-06-17',
        'Lunch',
        '2026-06-17',
        'Lunch'
      );

      expect(familyAccessRepository.checkCopyPermissions).toHaveBeenCalledWith(
        ACTOR_A,
        MEMBER_B
      );
      expect(
        foodRepository.getFoodEntriesByDateAndMealType
      ).toHaveBeenCalledWith(ACTOR_A, '2026-06-17', 'meal-type-lunch-id');
      expect(foodRepository.bulkCreateFoodEntries).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            user_id: MEMBER_B,
            food_id: 'food-def',
            food_name: 'Apple',
          }),
        ]),
        MEMBER_B
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('copy permission is evaluated for the acting delegate, not the switched active user', () => {
    const ACTIVE_VICTIM = 'active-victim';
    const DELEGATE = 'delegate-d';

    it('copyFoodEntriesFromUser checks the acting delegate against the source', async () => {
      vi.mocked(familyAccessRepository.checkCopyPermissions).mockResolvedValue(
        true
      );
      vi.mocked(mealTypeRepository.getAllMealTypes).mockResolvedValue([
        { id: 'meal-type-lunch-id', name: 'Lunch', user_id: null },
      ]);
      // Empty source -> returns right after the permission check.
      vi.mocked(
        foodRepository.getFoodEntriesByDateAndMealType
      ).mockResolvedValue([]);

      await copyFoodEntriesFromUser(
        ACTIVE_VICTIM, // authenticatedUserId = switched-into active user
        DELEGATE, // actingUserId = real actor
        MEMBER_B,
        '2026-06-17',
        'Lunch',
        '2026-06-17',
        'Lunch'
      );

      expect(familyAccessRepository.checkCopyPermissions).toHaveBeenCalledWith(
        DELEGATE,
        MEMBER_B
      );
      expect(
        familyAccessRepository.checkCopyPermissions
      ).not.toHaveBeenCalledWith(ACTIVE_VICTIM, MEMBER_B);
    });

    it('copyFoodEntriesToUser checks the acting delegate against the target', async () => {
      vi.mocked(familyAccessRepository.checkCopyPermissions).mockResolvedValue(
        true
      );
      vi.mocked(mealTypeRepository.getAllMealTypes).mockResolvedValue([
        { id: 'meal-type-lunch-id', name: 'Lunch', user_id: null },
      ]);
      vi.mocked(
        foodRepository.getFoodEntriesByDateAndMealType
      ).mockResolvedValue([]);

      await copyFoodEntriesToUser(
        ACTIVE_VICTIM,
        DELEGATE,
        MEMBER_B,
        '2026-06-17',
        'Lunch',
        '2026-06-17',
        'Lunch'
      );

      expect(familyAccessRepository.checkCopyPermissions).toHaveBeenCalledWith(
        DELEGATE,
        MEMBER_B
      );
      expect(
        familyAccessRepository.checkCopyPermissions
      ).not.toHaveBeenCalledWith(ACTIVE_VICTIM, MEMBER_B);
    });
  });
});

describe('copy flows resolve custom meal types by name (shared service contract)', () => {
  const CUSTOM_MEAL_TYPE_ID = 'custom-second-breakfast-id';
  const CUSTOM_LUNCH_ID = 'custom-lunch-id';
  const SYSTEM_LUNCH_ID = 'system-lunch-id';

  // Source entry fixture: no food_entry_meal_id, so the copy path goes
  // straight to the per-entry duplicate check and bulk create.
  const mockEntry = {
    id: 'entry-1',
    food_id: 'food-abc',
    variant_id: 'variant-xyz',
    quantity: 1.5,
    unit: 'serving',
    food_name: 'Banana',
    brand_name: 'Fresh',
    serving_size: 1,
    serving_unit: 'piece',
    calories: 105,
    protein: 1.3,
    carbs: 27,
    fat: 0.3,
    saturated_fat: 0.1,
    polyunsaturated_fat: 0.1,
    monounsaturated_fat: 0.1,
    trans_fat: 0,
    cholesterol: 0,
    sodium: 1,
    potassium: 422,
    dietary_fiber: 3.1,
    sugars: 14,
    vitamin_a: 1,
    vitamin_c: 10,
    calcium: 6,
    iron: 0.3,
    glycemic_index: 51,
    custom_nutrients: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(foodRepository.getFoodEntryByDetails).mockResolvedValue(
      undefined
    );
  });

  it('copyFoodEntries resolves a custom type by its name and queries by canonical id', async () => {
    vi.mocked(mealTypeRepository.getAllMealTypes).mockResolvedValue([
      { id: CUSTOM_MEAL_TYPE_ID, name: 'Second breakfast', user_id: 'user-1' },
    ]);
    vi.mocked(foodRepository.getFoodEntriesByDateAndMealType).mockResolvedValue(
      [mockEntry]
    );
    vi.mocked(foodRepository.bulkCreateFoodEntries).mockResolvedValue([
      { id: 'entry-copied-1', user_id: 'user-1', food_id: 'food-abc' },
    ]);

    const result = await copyFoodEntries(
      'user-1',
      'user-1',
      '2026-06-09',
      'Second breakfast',
      '2026-06-10',
      'Second breakfast'
    );

    expect(result).toEqual([
      { id: 'entry-copied-1', user_id: 'user-1', food_id: 'food-abc' },
    ]);
    // The source query uses the canonical id, not the raw name.
    expect(foodRepository.getFoodEntriesByDateAndMealType).toHaveBeenCalledWith(
      'user-1',
      '2026-06-09',
      CUSTOM_MEAL_TYPE_ID
    );
    // The duplicate check receives the canonical target id.
    expect(foodRepository.getFoodEntryByDetails).toHaveBeenCalledWith(
      'user-1',
      'food-abc',
      CUSTOM_MEAL_TYPE_ID,
      '2026-06-10',
      'variant-xyz',
      null
    );
    expect(foodRepository.bulkCreateFoodEntries).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ meal_type_id: CUSTOM_MEAL_TYPE_ID }),
      ]),
      'user-1'
    );
  });

  it('copyFoodEntriesFromYesterday resolves a custom type by its name and queries by id', async () => {
    vi.mocked(mealTypeRepository.getAllMealTypes).mockResolvedValue([
      { id: CUSTOM_MEAL_TYPE_ID, name: 'Second breakfast', user_id: 'user-1' },
    ]);
    vi.mocked(foodRepository.getFoodEntriesByDateAndMealType).mockResolvedValue(
      [mockEntry]
    );
    vi.mocked(foodRepository.bulkCreateFoodEntries).mockResolvedValue([
      { id: 'entry-copied-1' },
    ]);

    const result = await copyFoodEntriesFromYesterday(
      'user-1',
      'user-1',
      'Second breakfast',
      '2026-06-10'
    );

    expect(result).toHaveLength(1);
    expect(foodRepository.getFoodEntriesByDateAndMealType).toHaveBeenCalledWith(
      'user-1',
      '2026-06-09',
      CUSTOM_MEAL_TYPE_ID
    );
  });

  it('copyAllFoodEntries copies a day that contains a custom meal type', async () => {
    vi.mocked(foodRepository.getFoodEntriesByDate).mockResolvedValue([
      {
        ...mockEntry,
        meal_type: 'Second breakfast',
        meal_type_id: CUSTOM_MEAL_TYPE_ID,
      },
      {
        ...mockEntry,
        id: 'entry-2',
        food_id: 'food-def',
        meal_type: 'Lunch',
        meal_type_id: SYSTEM_LUNCH_ID,
      },
    ]);
    vi.mocked(mealTypeRepository.getAllMealTypes).mockResolvedValue([
      { id: CUSTOM_MEAL_TYPE_ID, name: 'Second breakfast', user_id: 'user-1' },
      { id: SYSTEM_LUNCH_ID, name: 'Lunch', user_id: null },
    ]);
    vi.mocked(foodRepository.getFoodEntriesByDateAndMealType).mockResolvedValue(
      [mockEntry]
    );
    vi.mocked(foodRepository.bulkCreateFoodEntries).mockResolvedValue([
      { id: 'entry-copied-1' },
    ]);

    const result = await copyAllFoodEntries(
      'user-1',
      'user-1',
      '2026-06-09',
      '2026-06-10'
    );

    expect(result.length).toBeGreaterThan(0);
    // Both used slots are queried by their canonical ids.
    expect(foodRepository.getFoodEntriesByDateAndMealType).toHaveBeenCalledWith(
      'user-1',
      '2026-06-09',
      CUSTOM_MEAL_TYPE_ID
    );
    expect(foodRepository.getFoodEntriesByDateAndMealType).toHaveBeenCalledWith(
      'user-1',
      '2026-06-09',
      SYSTEM_LUNCH_ID
    );
  });

  it('copyFoodEntries prefers an exact id over a same-named system type', async () => {
    // A custom type shares its name with a system default; passing the custom
    // UUID must resolve to the custom type, not the system one.
    vi.mocked(mealTypeRepository.getAllMealTypes).mockResolvedValue([
      { id: CUSTOM_LUNCH_ID, name: 'Lunch', user_id: 'user-1' },
      { id: SYSTEM_LUNCH_ID, name: 'Lunch', user_id: null },
    ]);
    vi.mocked(foodRepository.getFoodEntriesByDateAndMealType).mockResolvedValue(
      [mockEntry]
    );
    vi.mocked(foodRepository.bulkCreateFoodEntries).mockResolvedValue([
      { id: 'entry-copied-1' },
    ]);

    await copyFoodEntries(
      'user-1',
      'user-1',
      '2026-06-09',
      'Lunch',
      '2026-06-10',
      CUSTOM_LUNCH_ID
    );

    expect(foodRepository.bulkCreateFoodEntries).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ meal_type_id: CUSTOM_LUNCH_ID }),
      ]),
      'user-1'
    );
  });

  // A plain name that collides between a custom type (sorts first) and the
  // system default must deterministically resolve to the system default,
  // regardless of sort_order, when the spellings are identical.
  it('copyFoodEntries resolves a same-spelled colliding name to the system type', async () => {
    vi.mocked(mealTypeRepository.getAllMealTypes).mockResolvedValue([
      { id: CUSTOM_LUNCH_ID, name: 'Lunch', user_id: 'user-1' },
      { id: SYSTEM_LUNCH_ID, name: 'Lunch', user_id: null },
    ]);
    vi.mocked(foodRepository.getFoodEntriesByDateAndMealType).mockResolvedValue(
      [mockEntry]
    );
    vi.mocked(foodRepository.bulkCreateFoodEntries).mockResolvedValue([
      { id: 'entry-copied-1' },
    ]);

    await copyFoodEntries(
      'user-1',
      'user-1',
      '2026-06-09',
      'Lunch',
      '2026-06-10',
      'Lunch'
    );

    // Both source query and duplicate check use the system id.
    expect(foodRepository.getFoodEntriesByDateAndMealType).toHaveBeenCalledWith(
      'user-1',
      '2026-06-09',
      SYSTEM_LUNCH_ID
    );
    expect(foodRepository.getFoodEntryByDetails).toHaveBeenCalledWith(
      'user-1',
      'food-abc',
      SYSTEM_LUNCH_ID,
      '2026-06-10',
      'variant-xyz',
      null
    );
    expect(foodRepository.bulkCreateFoodEntries).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ meal_type_id: SYSTEM_LUNCH_ID }),
      ]),
      'user-1'
    );
  });

  // System defaults are stored lowercase while a custom type may be created
  // with a different casing ("Lunch"). An exact-case name match must win, so
  // web/mobile sending the selected label "Lunch" resolves to the custom
  // type, not the system "lunch".
  it('copyFoodEntries resolves an exact-case name to the custom type over a lowercase system default', async () => {
    vi.mocked(mealTypeRepository.getAllMealTypes).mockResolvedValue([
      { id: CUSTOM_LUNCH_ID, name: 'Lunch', user_id: 'user-1' },
      { id: SYSTEM_LUNCH_ID, name: 'lunch', user_id: null },
    ]);
    vi.mocked(foodRepository.getFoodEntriesByDateAndMealType).mockResolvedValue(
      [mockEntry]
    );
    vi.mocked(foodRepository.bulkCreateFoodEntries).mockResolvedValue([
      { id: 'entry-copied-1' },
    ]);

    await copyFoodEntries(
      'user-1',
      'user-1',
      '2026-06-09',
      'Lunch',
      '2026-06-10',
      'Lunch'
    );

    expect(foodRepository.getFoodEntriesByDateAndMealType).toHaveBeenCalledWith(
      'user-1',
      '2026-06-09',
      CUSTOM_LUNCH_ID
    );
    expect(foodRepository.getFoodEntryByDetails).toHaveBeenCalledWith(
      'user-1',
      'food-abc',
      CUSTOM_LUNCH_ID,
      '2026-06-10',
      'variant-xyz',
      null
    );
  });

  // The lowercase system spelling resolves to the system type.
  it('copyFoodEntries resolves the lowercase system name to the system type', async () => {
    vi.mocked(mealTypeRepository.getAllMealTypes).mockResolvedValue([
      { id: CUSTOM_LUNCH_ID, name: 'Lunch', user_id: 'user-1' },
      { id: SYSTEM_LUNCH_ID, name: 'lunch', user_id: null },
    ]);
    vi.mocked(foodRepository.getFoodEntriesByDateAndMealType).mockResolvedValue(
      [mockEntry]
    );
    vi.mocked(foodRepository.bulkCreateFoodEntries).mockResolvedValue([
      { id: 'entry-copied-1' },
    ]);

    await copyFoodEntries(
      'user-1',
      'user-1',
      '2026-06-09',
      'lunch',
      '2026-06-10',
      'lunch'
    );

    expect(foodRepository.getFoodEntriesByDateAndMealType).toHaveBeenCalledWith(
      'user-1',
      '2026-06-09',
      SYSTEM_LUNCH_ID
    );
  });

  // With no exact-case match, the case-insensitive fallback deterministically
  // prefers the system default.
  it('copyFoodEntries falls back to the system type for a differently-cased name', async () => {
    vi.mocked(mealTypeRepository.getAllMealTypes).mockResolvedValue([
      { id: CUSTOM_LUNCH_ID, name: 'Lunch', user_id: 'user-1' },
      { id: SYSTEM_LUNCH_ID, name: 'lunch', user_id: null },
    ]);
    vi.mocked(foodRepository.getFoodEntriesByDateAndMealType).mockResolvedValue(
      [mockEntry]
    );
    vi.mocked(foodRepository.bulkCreateFoodEntries).mockResolvedValue([
      { id: 'entry-copied-1' },
    ]);

    await copyFoodEntries(
      'user-1',
      'user-1',
      '2026-06-09',
      'LUNCH',
      '2026-06-10',
      'LUNCH'
    );

    expect(foodRepository.getFoodEntriesByDateAndMealType).toHaveBeenCalledWith(
      'user-1',
      '2026-06-09',
      SYSTEM_LUNCH_ID
    );
  });

  // Two distinct types that share a name must be copied as two separate
  // slots, never merged into one.
  it('copyAllFoodEntries keeps same-named types with different ids separate', async () => {
    vi.mocked(foodRepository.getFoodEntriesByDate).mockResolvedValue([
      {
        ...mockEntry,
        meal_type: 'Lunch',
        meal_type_id: SYSTEM_LUNCH_ID,
      },
      {
        ...mockEntry,
        id: 'entry-2',
        food_id: 'food-def',
        meal_type: 'Lunch',
        meal_type_id: CUSTOM_LUNCH_ID,
      },
    ]);
    vi.mocked(mealTypeRepository.getAllMealTypes).mockResolvedValue([
      { id: CUSTOM_LUNCH_ID, name: 'Lunch', user_id: 'user-1' },
      { id: SYSTEM_LUNCH_ID, name: 'Lunch', user_id: null },
    ]);
    vi.mocked(foodRepository.getFoodEntriesByDateAndMealType).mockResolvedValue(
      [mockEntry]
    );
    vi.mocked(foodRepository.bulkCreateFoodEntries).mockResolvedValue([
      { id: 'entry-copied-1' },
    ]);

    await copyAllFoodEntries('user-1', 'user-1', '2026-06-09', '2026-06-10');

    // Two separate copy passes, one per canonical id.
    expect(foodRepository.getFoodEntriesByDateAndMealType).toHaveBeenCalledWith(
      'user-1',
      '2026-06-09',
      SYSTEM_LUNCH_ID
    );
    expect(foodRepository.getFoodEntriesByDateAndMealType).toHaveBeenCalledWith(
      'user-1',
      '2026-06-09',
      CUSTOM_LUNCH_ID
    );
  });

  it('copyFoodEntriesFromUser resolves source for the source user and target for the active user', async () => {
    vi.mocked(familyAccessRepository.checkCopyPermissions).mockResolvedValue(
      true
    );
    // Each user gets their own meal types so the test proves the resolver is
    // called in the right user context.
    vi.mocked(mealTypeRepository.getAllMealTypes).mockImplementation(
      async (userId) => {
        if (userId === MEMBER_B) {
          return [
            { id: 'member-source-lunch-id', name: 'Lunch', user_id: MEMBER_B },
          ];
        }
        return [
          { id: 'active-target-lunch-id', name: 'Lunch', user_id: 'user-1' },
        ];
      }
    );
    vi.mocked(foodRepository.getFoodEntriesByDateAndMealType).mockResolvedValue(
      [mockEntry]
    );
    vi.mocked(foodRepository.bulkCreateFoodEntries).mockResolvedValue([
      { id: 'entry-copied-1' },
    ]);

    await copyFoodEntriesFromUser(
      'user-1',
      'user-1',
      MEMBER_B,
      '2026-06-17',
      'Lunch',
      '2026-06-17',
      'Lunch'
    );

    // Source resolved against MEMBER_B, target against user-1.
    expect(mealTypeRepository.getAllMealTypes).toHaveBeenNthCalledWith(
      1,
      MEMBER_B
    );
    expect(mealTypeRepository.getAllMealTypes).toHaveBeenNthCalledWith(
      2,
      'user-1'
    );
    expect(foodRepository.getFoodEntriesByDateAndMealType).toHaveBeenCalledWith(
      MEMBER_B,
      '2026-06-17',
      'member-source-lunch-id'
    );
    expect(foodRepository.getFoodEntryByDetails).toHaveBeenCalledWith(
      'user-1',
      'food-abc',
      'active-target-lunch-id',
      '2026-06-17',
      'variant-xyz',
      null
    );
  });

  it('copyFoodEntriesToUser resolves source for the active user and target for the target user', async () => {
    vi.mocked(familyAccessRepository.checkCopyPermissions).mockResolvedValue(
      true
    );
    vi.mocked(mealTypeRepository.getAllMealTypes).mockImplementation(
      async (userId) => {
        if (userId === MEMBER_B) {
          return [
            { id: 'member-target-lunch-id', name: 'Lunch', user_id: MEMBER_B },
          ];
        }
        return [
          { id: 'active-source-lunch-id', name: 'Lunch', user_id: 'user-1' },
        ];
      }
    );
    vi.mocked(foodRepository.getFoodEntriesByDateAndMealType).mockResolvedValue(
      [mockEntry]
    );
    vi.mocked(foodRepository.bulkCreateFoodEntries).mockResolvedValue([
      { id: 'entry-copied-1' },
    ]);

    await copyFoodEntriesToUser(
      'user-1',
      'user-1',
      MEMBER_B,
      '2026-06-17',
      'Lunch',
      '2026-06-17',
      'Lunch'
    );

    // Source resolved against user-1, target against MEMBER_B.
    expect(mealTypeRepository.getAllMealTypes).toHaveBeenNthCalledWith(
      1,
      'user-1'
    );
    expect(mealTypeRepository.getAllMealTypes).toHaveBeenNthCalledWith(
      2,
      MEMBER_B
    );
    expect(foodRepository.getFoodEntriesByDateAndMealType).toHaveBeenCalledWith(
      'user-1',
      '2026-06-17',
      'active-source-lunch-id'
    );
    expect(foodRepository.getFoodEntryByDetails).toHaveBeenCalledWith(
      MEMBER_B,
      'food-abc',
      'member-target-lunch-id',
      '2026-06-17',
      'variant-xyz',
      null
    );
  });
});
