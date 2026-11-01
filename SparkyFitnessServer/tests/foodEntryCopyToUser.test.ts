import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  copyReviewedFoodEntriesToUser,
  copySelectedFoodEntriesToUser,
} from '../services/foodEntryService.js';
import familyAccessRepository from '../models/familyAccessRepository.js';
import foodRepository from '../models/foodRepository.js';
import mealTypeRepository from '../models/mealType.js';
import { foodEntryCopyToUserFingerprint } from '@workspace/shared';

vi.mock('../models/familyAccessRepository');
vi.mock('../models/foodRepository');
vi.mock('../models/foodEntryMealRepository');
vi.mock('../models/mealType.js');
vi.mock('../config/logging', () => ({ log: vi.fn() }));

const ACTOR = 'actor';
const RECIPIENT = 'recipient';
const DATE = '2026-10-27';
const TARGET_DATE = '2026-10-28';
const TARGET_MEAL = 'target-meal';
const row = {
  id: '33333333-3333-4333-8333-333333333333',
  user_id: ACTOR,
  entry_date: DATE,
  meal_type_id: 'source-meal',
  food_id: null,
  variant_id: null,
  food_entry_meal_id: null,
  quantity: 100,
  serving_size: 100,
  food_name: 'Saved snapshot',
  calories: 120,
  notes: 'My note',
};
const entries = () => [
  {
    entryId: row.id,
    sourceFingerprint: foodEntryCopyToUserFingerprint(row),
  },
];
const selected = () => entries().map((entry) => ({ ...entry, quantity: 175 }));
const copyWhole = () =>
  copyReviewedFoodEntriesToUser(
    ACTOR,
    RECIPIENT,
    DATE,
    'source-meal',
    TARGET_DATE,
    TARGET_MEAL,
    entries()
  );
const copySelected = () =>
  copySelectedFoodEntriesToUser(
    ACTOR,
    RECIPIENT,
    DATE,
    TARGET_DATE,
    TARGET_MEAL,
    selected()
  );

describe('reviewed food copies to a family member', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(familyAccessRepository.checkCopyPermissions).mockResolvedValue(
      true
    );
    vi.mocked(mealTypeRepository.getAllMealTypes).mockImplementation(
      async (userId) => [
        {
          id: userId === ACTOR ? 'source-meal' : TARGET_MEAL,
          name: 'Lunch',
          user_id: userId,
        },
      ]
    );
    vi.mocked(foodRepository.getFoodEntriesByDateAndMealType).mockResolvedValue(
      [row]
    );
    vi.mocked(foodRepository.getFoodEntryById).mockResolvedValue(row);
  });

  it.each(['whole', 'selected'] as const)(
    'rejects missing or expired copy permission for %s copies',
    async (mode) => {
      vi.mocked(familyAccessRepository.checkCopyPermissions).mockResolvedValue(
        false
      );
      await expect(
        mode === 'whole' ? copyWhole() : copySelected()
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(familyAccessRepository.checkCopyPermissions).toHaveBeenCalledWith(
        ACTOR,
        RECIPIENT
      );
      expect(mealTypeRepository.getAllMealTypes).not.toHaveBeenCalled();
      expect(
        foodRepository.copyReviewedFoodEntriesFromUser
      ).not.toHaveBeenCalled();
      expect(foodRepository.copySelectedFoodEntries).not.toHaveBeenCalled();
    }
  );

  it.each(['whole', 'selected'] as const)(
    'rejects a custom target meal that belongs to the source for %s copies',
    async (mode) => {
      vi.mocked(mealTypeRepository.getAllMealTypes).mockImplementation(
        async (userId) => [
          {
            id: userId === ACTOR ? 'source-meal' : 'recipient-meal',
            name: 'Lunch',
            user_id: userId,
          },
        ]
      );
      await expect(
        mode === 'whole' ? copyWhole() : copySelected()
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(
        foodRepository.copyReviewedFoodEntriesFromUser
      ).not.toHaveBeenCalled();
      expect(foodRepository.copySelectedFoodEntries).not.toHaveBeenCalled();
    }
  );

  it('uses the actor as source and recipient as target for a whole copy', async () => {
    vi.mocked(foodRepository.copyReviewedFoodEntriesFromUser).mockResolvedValue(
      [{ id: 'copied' }]
    );
    await expect(copyWhole()).resolves.toEqual([{ id: 'copied' }]);
    expect(foodRepository.getFoodEntriesByDateAndMealType).toHaveBeenCalledWith(
      ACTOR,
      DATE,
      'source-meal'
    );
    expect(foodRepository.copyReviewedFoodEntriesFromUser).toHaveBeenCalledWith(
      {
        sourceUserId: ACTOR,
        actingUserId: ACTOR,
        targetUserId: RECIPIENT,
        sourceDate: DATE,
        sourceMealTypeId: 'source-meal',
        targetDate: TARGET_DATE,
        targetMealTypeId: TARGET_MEAL,
        reviewedEntries: entries(),
        fingerprintVersion: 'to-user',
      }
    );
  });

  it('re-fetches selected rows from the actual actor and delegates adjusted quantities atomically', async () => {
    vi.mocked(foodRepository.copySelectedFoodEntries).mockResolvedValue([
      { id: 'copied' },
    ]);
    await expect(copySelected()).resolves.toEqual([{ id: 'copied' }]);
    expect(foodRepository.getFoodEntryById).toHaveBeenCalledWith(row.id, ACTOR);
    expect(foodRepository.copySelectedFoodEntries).toHaveBeenCalledWith({
      sourceUserId: ACTOR,
      actingUserId: ACTOR,
      targetUserId: RECIPIENT,
      sourceDate: DATE,
      targetDate: TARGET_DATE,
      targetMealTypeId: TARGET_MEAL,
      selections: selected(),
      fingerprintVersion: 'to-user',
    });
  });

  it.each([
    { ...row, user_id: RECIPIENT },
    { ...row, entry_date: TARGET_DATE },
    { ...row, notes: 'Changed since review' },
    { ...row, caffeine_mg: 50 },
    { ...row, serving_size: 0 },
    undefined,
  ])(
    'rejects forged, unavailable, or stale selected snapshots %# before writing',
    async (current) => {
      vi.mocked(foodRepository.getFoodEntryById).mockResolvedValue(current);
      await expect(copySelected()).rejects.toMatchObject({ statusCode: 409 });
      expect(foodRepository.copySelectedFoodEntries).not.toHaveBeenCalled();
    }
  );

  it('rejects changed whole-meal contents without creating a container', async () => {
    vi.mocked(foodRepository.getFoodEntriesByDateAndMealType).mockResolvedValue(
      [row, { ...row, id: 'additional' }]
    );
    await expect(copyWhole()).rejects.toMatchObject({ statusCode: 409 });
    expect(
      foodRepository.copyReviewedFoodEntriesFromUser
    ).not.toHaveBeenCalled();
  });
});
