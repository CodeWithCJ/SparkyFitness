import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyReviewedFoodEntriesFromUser } from '../services/foodEntryService.js';
import familyAccessRepository from '../models/familyAccessRepository.js';
import foodRepository from '../models/foodRepository.js';
import mealTypeRepository from '../models/mealType.js';
import { foodEntryCopyFingerprint } from '@workspace/shared';

vi.mock('../models/familyAccessRepository');
vi.mock('../models/foodRepository');
vi.mock('../models/foodEntryMealRepository');
vi.mock('../models/mealType.js');
vi.mock('../config/logging', () => ({ log: vi.fn() }));

const ACTOR_A = 'actor-a';
const SOURCE_B = 'source-b';
const SOURCE_DATE = '2026-08-23';
const TARGET_DATE = '2026-08-24';
const TARGET_MEAL = 'target-lunch-id';
const sourceEntry = {
  id: '33333333-3333-4333-8333-333333333333',
  user_id: SOURCE_B,
  entry_date: SOURCE_DATE,
  quantity: 150,
};
const reviewedEntries = [
  {
    entryId: sourceEntry.id,
    sourceFingerprint: foodEntryCopyFingerprint(sourceEntry),
  },
];

describe('copyReviewedFoodEntriesFromUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects the reviewed path when the actor lacks copy permission', async () => {
    vi.mocked(familyAccessRepository.checkCopyPermissions).mockResolvedValue(
      false
    );

    await expect(
      copyReviewedFoodEntriesFromUser(
        ACTOR_A,
        ACTOR_A,
        SOURCE_B,
        SOURCE_DATE,
        'Lunch',
        TARGET_DATE,
        TARGET_MEAL,
        reviewedEntries
      )
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(mealTypeRepository.getAllMealTypes).not.toHaveBeenCalled();
    expect(
      foodRepository.copyReviewedFoodEntriesFromUser
    ).not.toHaveBeenCalled();
  });

  it.each([
    [
      'added',
      [
        ...[sourceEntry],
        { ...sourceEntry, id: '44444444-4444-4444-8444-444444444444' },
      ],
    ],
    ['removed', []],
    ['quantity-changed', [{ ...sourceEntry, quantity: 175 }]],
  ])(
    'returns a 409 and creates neither rows nor meal containers when a source entry is %s after review',
    async (_change, currentEntries) => {
      vi.mocked(familyAccessRepository.checkCopyPermissions).mockResolvedValue(
        true
      );
      vi.mocked(mealTypeRepository.getAllMealTypes).mockImplementation(
        async (userId) => [
          {
            id: userId === SOURCE_B ? 'source-lunch-id' : TARGET_MEAL,
            name: 'Lunch',
            user_id: null,
          },
        ]
      );
      vi.mocked(
        foodRepository.getFoodEntriesByDateAndMealType
      ).mockResolvedValue(currentEntries);

      await expect(
        copyReviewedFoodEntriesFromUser(
          ACTOR_A,
          ACTOR_A,
          SOURCE_B,
          SOURCE_DATE,
          'Lunch',
          TARGET_DATE,
          TARGET_MEAL,
          reviewedEntries
        )
      ).rejects.toMatchObject({ statusCode: 409 });

      expect(
        foodRepository.copyReviewedFoodEntriesFromUser
      ).not.toHaveBeenCalled();
    }
  );

  it('delegates an exact reviewed snapshot to the atomic repository with server-derived source rows', async () => {
    vi.mocked(familyAccessRepository.checkCopyPermissions).mockResolvedValue(
      true
    );
    vi.mocked(mealTypeRepository.getAllMealTypes).mockImplementation(
      async (userId) => [
        {
          id: userId === SOURCE_B ? 'source-lunch-id' : TARGET_MEAL,
          name: 'Lunch',
          user_id: null,
        },
      ]
    );
    vi.mocked(foodRepository.getFoodEntriesByDateAndMealType).mockResolvedValue(
      [sourceEntry]
    );
    vi.mocked(foodRepository.copyReviewedFoodEntriesFromUser).mockResolvedValue(
      [{ id: 'copy-1' }]
    );

    await expect(
      copyReviewedFoodEntriesFromUser(
        ACTOR_A,
        ACTOR_A,
        SOURCE_B,
        SOURCE_DATE,
        'Lunch',
        TARGET_DATE,
        TARGET_MEAL,
        reviewedEntries
      )
    ).resolves.toEqual([{ id: 'copy-1' }]);

    expect(foodRepository.copyReviewedFoodEntriesFromUser).toHaveBeenCalledWith(
      expect.objectContaining({
        targetUserId: ACTOR_A,
        actingUserId: ACTOR_A,
        sourceUserId: SOURCE_B,
        sourceDate: SOURCE_DATE,
        sourceMealTypeId: 'source-lunch-id',
        targetDate: TARGET_DATE,
        targetMealTypeId: TARGET_MEAL,
        reviewedEntries,
      })
    );
  });

  it('rejects a source row whose reviewed nutrition changed', async () => {
    vi.mocked(familyAccessRepository.checkCopyPermissions).mockResolvedValue(
      true
    );
    vi.mocked(mealTypeRepository.getAllMealTypes).mockImplementation(
      async (userId) => [
        {
          id: userId === SOURCE_B ? 'source-lunch-id' : TARGET_MEAL,
          name: 'Lunch',
          user_id: null,
        },
      ]
    );
    vi.mocked(foodRepository.getFoodEntriesByDateAndMealType).mockResolvedValue(
      [{ ...sourceEntry, calories: 250 }]
    );

    await expect(
      copyReviewedFoodEntriesFromUser(
        ACTOR_A,
        ACTOR_A,
        SOURCE_B,
        SOURCE_DATE,
        'Lunch',
        TARGET_DATE,
        TARGET_MEAL,
        reviewedEntries
      )
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
