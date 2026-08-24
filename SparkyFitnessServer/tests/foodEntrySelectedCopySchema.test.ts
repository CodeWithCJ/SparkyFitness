import { describe, expect, it } from 'vitest';
import { CopySelectedFoodEntriesFromUserBodySchema } from '../schemas/foodEntryCopySchemas.js';

const valid = {
  familyUserId: '11111111-1111-4111-8111-111111111111',
  sourceDate: '2026-08-23',
  targetDate: '2026-08-24',
  targetMealType: '22222222-2222-4222-8222-222222222222',
  entries: [{ entryId: '33333333-3333-4333-8333-333333333333', quantity: 150 }],
};

describe('CopySelectedFoodEntriesFromUserBodySchema', () => {
  it('accepts a strict valid request', () => {
    expect(
      CopySelectedFoodEntriesFromUserBodySchema.safeParse(valid).success
    ).toBe(true);
  });

  it.each([
    { ...valid, sourceDate: '2026-02-30' },
    { ...valid, entries: [] },
    { ...valid, entries: [{ ...valid.entries[0], quantity: 0 }] },
    { ...valid, unexpected: true },
  ])('rejects invalid request %#', (input) => {
    expect(
      CopySelectedFoodEntriesFromUserBodySchema.safeParse(input).success
    ).toBe(false);
  });

  it('rejects duplicate source entry IDs', () => {
    expect(
      CopySelectedFoodEntriesFromUserBodySchema.safeParse({
        ...valid,
        entries: [valid.entries[0], { ...valid.entries[0], quantity: 200 }],
      }).success
    ).toBe(false);
  });
});
