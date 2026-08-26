import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copySelectedFoodEntriesFromUser } from '../services/foodEntryService.js';
import familyAccessRepository from '../models/familyAccessRepository.js';
import foodRepository from '../models/foodRepository.js';
import mealTypeRepository from '../models/mealType.js';
import { foodEntryCopyFingerprint } from '@workspace/shared';

vi.mock('../models/familyAccessRepository');
vi.mock('../models/foodRepository');
vi.mock('../models/foodEntryMealRepository');
vi.mock('../models/mealType.js');
vi.mock('../config/logging', () => ({ log: vi.fn() }));

const ACTOR = 'actor-a';
const SOURCE = 'member-b';
const ENTRY_ID = '33333333-3333-4333-8333-333333333333';
const SECOND_ENTRY_ID = '44444444-4444-4444-8444-444444444444';
const TARGET_MEAL = '22222222-2222-4222-8222-222222222222';
const SOURCE_DATE = '2026-08-23';
const TARGET_DATE = '2026-08-24';

const validSourceEntry = {
  id: ENTRY_ID,
  user_id: SOURCE,
  entry_date: SOURCE_DATE,
  food_id: 'food-1',
  variant_id: 'variant-1',
  food_entry_meal_id: 'source-container',
  quantity: 100,
  unit: 'g',
  serving_size: 100,
  serving_unit: 'g',
  food_name: 'Family Pasta',
  calories: 180,
  protein: 6,
  carbs: 32,
  fat: 3,
  custom_nutrients: { magnesium: 12 },
};
const selection = (entryId = ENTRY_ID, quantity = 150) => ({
  entryId,
  quantity,
  sourceFingerprint: foodEntryCopyFingerprint({
    ...validSourceEntry,
    id: entryId,
    food_id: entryId === ENTRY_ID ? 'food-1' : 'food-2',
  }),
});

describe('copySelectedFoodEntriesFromUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires diary and food-library copy permission for the real actor', async () => {
    vi.mocked(familyAccessRepository.checkCopyPermissions).mockResolvedValue(
      false
    );

    await expect(
      copySelectedFoodEntriesFromUser(
        ACTOR,
        ACTOR,
        SOURCE,
        SOURCE_DATE,
        TARGET_DATE,
        TARGET_MEAL,
        [selection()]
      )
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(familyAccessRepository.checkCopyPermissions).toHaveBeenCalledWith(
      ACTOR,
      SOURCE
    );
    expect(foodRepository.getFoodEntryById).not.toHaveBeenCalled();
  });

  it.each([
    ['is unavailable', undefined],
    [
      'belongs to another owner',
      { ...validSourceEntry, user_id: 'other-owner' },
    ],
    [
      'belongs to another date',
      { ...validSourceEntry, entry_date: '2026-08-22' },
    ],
  ])(
    'fails atomically when a selected entry %s',
    async (_reason, sourceEntry) => {
      vi.mocked(familyAccessRepository.checkCopyPermissions).mockResolvedValue(
        true
      );
      vi.mocked(mealTypeRepository.getAllMealTypes).mockResolvedValue([
        { id: TARGET_MEAL, name: 'Lunch', user_id: null },
      ]);
      vi.mocked(foodRepository.getFoodEntryById).mockResolvedValue(sourceEntry);

      await expect(
        copySelectedFoodEntriesFromUser(
          ACTOR,
          ACTOR,
          SOURCE,
          SOURCE_DATE,
          TARGET_DATE,
          TARGET_MEAL,
          [selection()]
        )
      ).rejects.toMatchObject({ statusCode: 409 });

      expect(foodRepository.bulkCreateFoodEntries).not.toHaveBeenCalled();
    }
  );

  it('copies selected rows as standalone entries while retaining serving-basis nutrients', async () => {
    vi.mocked(familyAccessRepository.checkCopyPermissions).mockResolvedValue(
      true
    );
    vi.mocked(mealTypeRepository.getAllMealTypes).mockResolvedValue([
      { id: TARGET_MEAL, name: 'Lunch', user_id: null },
    ]);
    vi.mocked(foodRepository.getFoodEntryById).mockResolvedValue(
      validSourceEntry
    );
    vi.mocked(foodRepository.getFoodEntryByDetails).mockResolvedValue(
      undefined
    );
    vi.mocked(foodRepository.bulkCreateFoodEntries).mockResolvedValue([
      { id: 'copy-1' },
    ]);

    const result = await copySelectedFoodEntriesFromUser(
      ACTOR,
      ACTOR,
      SOURCE,
      SOURCE_DATE,
      TARGET_DATE,
      TARGET_MEAL,
      [selection()]
    );

    expect(foodRepository.bulkCreateFoodEntries).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          user_id: ACTOR,
          created_by_user_id: ACTOR,
          meal_type_id: TARGET_MEAL,
          entry_date: TARGET_DATE,
          food_entry_meal_id: null,
          quantity: 150,
          serving_size: 100,
          calories: 180,
          protein: 6,
          custom_nutrients: { magnesium: 12 },
        }),
      ],
      ACTOR
    );
    expect(result).toEqual([{ id: 'copy-1' }]);
  });

  it('re-fetches every selection and sends all validated rows in one bulk insert', async () => {
    vi.mocked(familyAccessRepository.checkCopyPermissions).mockResolvedValue(
      true
    );
    vi.mocked(mealTypeRepository.getAllMealTypes).mockResolvedValue([
      { id: TARGET_MEAL, name: 'Lunch', user_id: null },
    ]);
    vi.mocked(foodRepository.getFoodEntryById)
      .mockResolvedValueOnce(validSourceEntry)
      .mockResolvedValueOnce({
        ...validSourceEntry,
        id: SECOND_ENTRY_ID,
        food_id: 'food-2',
      });
    vi.mocked(foodRepository.getFoodEntryByDetails).mockResolvedValue(
      undefined
    );
    vi.mocked(foodRepository.bulkCreateFoodEntries).mockResolvedValue([
      { id: 'copy-1' },
      { id: 'copy-2' },
    ]);

    await copySelectedFoodEntriesFromUser(
      ACTOR,
      ACTOR,
      SOURCE,
      SOURCE_DATE,
      TARGET_DATE,
      TARGET_MEAL,
      [selection(), selection(SECOND_ENTRY_ID, 75)]
    );

    expect(foodRepository.getFoodEntryById).toHaveBeenNthCalledWith(
      1,
      ENTRY_ID,
      SOURCE
    );
    expect(foodRepository.getFoodEntryById).toHaveBeenNthCalledWith(
      2,
      SECOND_ENTRY_ID,
      SOURCE
    );
    expect(foodRepository.bulkCreateFoodEntries).toHaveBeenCalledTimes(1);
    expect(foodRepository.bulkCreateFoodEntries).toHaveBeenCalledWith(
      [
        expect.objectContaining({ food_id: 'food-1', quantity: 150 }),
        expect.objectContaining({ food_id: 'food-2', quantity: 75 }),
      ],
      ACTOR
    );
  });

  it('rejects a row whose reviewed food or nutrition snapshot changed', async () => {
    vi.mocked(familyAccessRepository.checkCopyPermissions).mockResolvedValue(
      true
    );
    vi.mocked(mealTypeRepository.getAllMealTypes).mockResolvedValue([
      { id: TARGET_MEAL, name: 'Lunch', user_id: null },
    ]);
    vi.mocked(foodRepository.getFoodEntryById).mockResolvedValue({
      ...validSourceEntry,
      calories: 250,
    });

    await expect(
      copySelectedFoodEntriesFromUser(
        ACTOR,
        ACTOR,
        SOURCE,
        SOURCE_DATE,
        TARGET_DATE,
        TARGET_MEAL,
        [selection()]
      )
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(foodRepository.bulkCreateFoodEntries).not.toHaveBeenCalled();
  });

  it('does not conflate null food ids during the duplicate lookup', async () => {
    const customEntry = {
      ...validSourceEntry,
      food_id: null,
      food_name: 'Family recipe',
    };
    vi.mocked(familyAccessRepository.checkCopyPermissions).mockResolvedValue(
      true
    );
    vi.mocked(mealTypeRepository.getAllMealTypes).mockResolvedValue([
      { id: TARGET_MEAL, name: 'Lunch', user_id: null },
    ]);
    vi.mocked(foodRepository.getFoodEntryById).mockResolvedValue(customEntry);
    vi.mocked(foodRepository.getFoodEntryByDetails).mockResolvedValue({
      id: 'unrelated-target-row',
    });
    vi.mocked(foodRepository.bulkCreateFoodEntries).mockResolvedValue([
      { id: 'copied-custom-row' },
    ]);

    await expect(
      copySelectedFoodEntriesFromUser(
        ACTOR,
        ACTOR,
        SOURCE,
        SOURCE_DATE,
        TARGET_DATE,
        TARGET_MEAL,
        [
          {
            entryId: ENTRY_ID,
            quantity: 150,
            sourceFingerprint: foodEntryCopyFingerprint(customEntry),
          },
        ]
      )
    ).resolves.toEqual([{ id: 'copied-custom-row' }]);

    expect(foodRepository.getFoodEntryByDetails).not.toHaveBeenCalled();
    expect(foodRepository.bulkCreateFoodEntries).toHaveBeenCalledWith(
      [expect.objectContaining({ food_id: null })],
      ACTOR
    );
  });
});
