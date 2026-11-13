import { describe, expect, it } from 'vitest';
import {
  CopyReviewedFoodEntriesToUserBodySchema,
  CopySelectedFoodEntriesToUserBodySchema,
  FamilyMealTypesParamSchema,
  FamilyMealTypesResponseSchema,
  foodEntryCopyFingerprint,
  foodEntryCopyToUserFingerprint,
} from '@workspace/shared';

const selected = {
  familyUserId: '11111111-1111-4111-8111-111111111111',
  sourceDate: '2026-10-27',
  targetDate: '2026-10-28',
  targetMealType: '22222222-2222-4222-8222-222222222222',
  entries: [
    {
      entryId: '33333333-3333-4333-8333-333333333333',
      quantity: 150,
      sourceFingerprint: 'snapshot',
    },
  ],
};
const reviewed = {
  ...selected,
  sourceMealType: 'Lunch',
  entries: selected.entries.map(({ entryId, sourceFingerprint }) => ({
    entryId,
    sourceFingerprint,
  })),
};

describe('copy-to-family shared contracts', () => {
  it('accepts reviewed and selected request shapes', () => {
    expect(CopyReviewedFoodEntriesToUserBodySchema.parse(reviewed)).toEqual(
      reviewed
    );
    expect(CopySelectedFoodEntriesToUserBodySchema.parse(selected)).toEqual(
      selected
    );
  });
  it.each([
    { sourceUserId: selected.familyUserId },
    { familyUserId: 'bad-id' },
    { targetDate: '2026-02-30' },
    { targetMealType: 'Lunch' },
    { entries: [] },
    { entries: [...selected.entries, ...selected.entries] },
    { entries: [{ ...selected.entries[0], quantity: 0 }] },
    { entries: [{ ...selected.entries[0], quantity: Infinity }] },
    { entries: [{ ...selected.entries[0], food_id: selected.familyUserId }] },
  ])('rejects invalid selected requests %#', (overrides) => {
    expect(
      CopySelectedFoodEntriesToUserBodySchema.safeParse({
        ...selected,
        ...overrides,
      }).success
    ).toBe(false);
  });
  it('validates the family parameter and JSON meal response', () => {
    expect(
      FamilyMealTypesParamSchema.safeParse({ familyUserId: 'invalid' }).success
    ).toBe(false);
    expect(
      FamilyMealTypesParamSchema.safeParse({
        familyUserId: selected.familyUserId,
        extra: true,
      }).success
    ).toBe(false);
    expect(
      FamilyMealTypesResponseSchema.safeParse([
        {
          id: selected.targetMealType,
          name: 'Lunch',
          user_id: selected.familyUserId,
          sort_order: 4,
          is_visible: true,
          show_in_quick_log: true,
          default_time: '12:00:00',
        },
      ]).success
    ).toBe(true);
    expect(
      FamilyMealTypesResponseSchema.safeParse([
        { id: 'invalid', name: 'Lunch' },
      ]).success
    ).toBe(false);
  });
  it.each(['notes', 'meal_id', 'caffeine_mg', 'water_ml', 'alcohol_g'])(
    'checks %s for new reverse copies without changing the old client fingerprint',
    (field) => {
      const before = { quantity: 100, [field]: null };
      const after = {
        ...before,
        [field]: field === 'notes' || field === 'meal_id' ? 'changed' : 42,
      };
      expect(foodEntryCopyFingerprint(before)).toBe(
        foodEntryCopyFingerprint(after)
      );
      expect(foodEntryCopyToUserFingerprint(before)).not.toBe(
        foodEntryCopyToUserFingerprint(after)
      );
    }
  );
});
