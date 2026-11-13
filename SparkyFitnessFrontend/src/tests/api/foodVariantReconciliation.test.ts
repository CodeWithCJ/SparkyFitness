import { planFoodVariantReconciliation } from '@/api/Foods/foodVariantReconciliation';
import type { FoodVariant } from '@/types/food';

const createVariant = (overrides: Partial<FoodVariant> = {}): FoodVariant => ({
  serving_size: 1,
  serving_unit: 'packet (150 g)',
  calories: 300,
  protein: 15,
  carbs: 30,
  fat: 10,
  ...overrides,
});

describe('planFoodVariantReconciliation', () => {
  it('plans creates, edits and removals for an ordinary food edit', () => {
    const plan = planFoodVariantReconciliation(
      [
        createVariant({ id: 'edited-packet', calories: 240 }),
        createVariant({ serving_unit: 'bottle (200 ml)', calories: 80 }),
      ],
      [
        createVariant({ id: 'edited-packet' }),
        createVariant({ id: 'removed-slice', serving_unit: 'slice' }),
      ]
    );

    expect(plan).toMatchObject({
      variantsToCreate: [{ serving_unit: 'bottle (200 ml)', calories: 80 }],
      variantsToUpdate: [{ id: 'edited-packet', calories: 240 }],
      variantsToDelete: [{ id: 'removed-slice' }],
      nextAttemptedVariantKeys: [],
    });
  });

  it('preserves baseline variants when an append operation resumes', () => {
    const plan = planFoodVariantReconciliation(
      [createVariant({ id: 'baseline-packet', calories: 999 })],
      [
        createVariant({ id: 'baseline-packet' }),
        createVariant({ id: 'baseline-slice', serving_unit: 'slice' }),
        createVariant({ id: 'unrelated-row', serving_unit: 'spoon' }),
      ],
      {
        baselineVariantIds: ['baseline-packet', 'baseline-slice'],
        attemptedVariantKeys: ['1|slice'],
      }
    );

    expect(plan).toMatchObject({
      variantsToCreate: [],
      variantsToUpdate: [],
      variantsToDelete: [],
      nextAttemptedVariantKeys: ['1|slice', '1|packet (150 g)'],
    });
  });

  it('allows an explicitly edited reference to update even when it belongs to the baseline', () => {
    const plan = planFoodVariantReconciliation(
      [
        createVariant({
          id: 'reference',
          serving_size: 100,
          serving_unit: 'g',
          calories: 120,
          is_default: true,
        }),
      ],
      [
        createVariant({
          id: 'reference',
          serving_size: 100,
          serving_unit: 'g',
          calories: 100,
          is_default: true,
        }),
      ],
      {
        baselineVariantIds: ['reference'],
        attemptedVariantKeys: [],
        updatedReferenceId: 'reference',
      }
    );

    expect(plan).toMatchObject({
      variantsToCreate: [],
      variantsToUpdate: [{ id: 'reference', calories: 120 }],
      variantsToDelete: [],
      nextAttemptedVariantKeys: [],
    });
  });

  it('removes a previously attempted portion that the user removed after failure', () => {
    const plan = planFoodVariantReconciliation(
      [],
      [createVariant({ id: 'previous-packet' })],
      {
        baselineVariantIds: [],
        attemptedVariantKeys: ['1|packet (150 g)'],
      }
    );

    expect(plan).toMatchObject({
      variantsToCreate: [],
      variantsToUpdate: [],
      variantsToDelete: [{ id: 'previous-packet' }],
      nextAttemptedVariantKeys: ['1|packet (150 g)'],
    });
  });

  it('replaces a previously attempted portion when the user renames it after failure', () => {
    const plan = planFoodVariantReconciliation(
      [createVariant({ serving_unit: 'bag (150 g)' })],
      [createVariant({ id: 'previous-packet' })],
      {
        baselineVariantIds: [],
        attemptedVariantKeys: ['1|packet (150 g)'],
      }
    );

    expect(plan).toMatchObject({
      variantsToCreate: [{ serving_unit: 'bag (150 g)' }],
      variantsToUpdate: [],
      variantsToDelete: [{ id: 'previous-packet' }],
      nextAttemptedVariantKeys: ['1|packet (150 g)', '1|bag (150 g)'],
    });
  });

  it('reuses a read-back ID after a bulk response was lost', () => {
    const plan = planFoodVariantReconciliation(
      [createVariant({ serving_unit: '  PACKET (150 G)  ', calories: 240 })],
      [createVariant({ id: 'committed-packet' })],
      {
        baselineVariantIds: [],
        attemptedVariantKeys: ['1|packet (150 g)'],
      }
    );

    expect(plan).toMatchObject({
      variantsToCreate: [],
      variantsToUpdate: [{ id: 'committed-packet', calories: 240 }],
      variantsToDelete: [],
      nextAttemptedVariantKeys: ['1|packet (150 g)'],
    });
  });

  it('reserves explicit IDs before matching duplicate serving names and sizes', () => {
    const plan = planFoodVariantReconciliation(
      [
        createVariant({ calories: 111 }),
        createVariant({ id: 'explicit-packet', calories: 222 }),
        createVariant({ calories: 333 }),
      ],
      [
        createVariant({ id: 'explicit-packet' }),
        createVariant({ id: 'available-packet' }),
      ]
    );

    expect(plan).toMatchObject({
      variantsToCreate: [{ calories: 333 }],
      variantsToUpdate: [
        { id: 'available-packet', calories: 111 },
        { id: 'explicit-packet', calories: 222 },
      ],
      variantsToDelete: [],
    });
  });

  it('does not reuse a row with the same serving name but a different size', () => {
    const plan = planFoodVariantReconciliation(
      [createVariant({ serving_size: 2 })],
      [createVariant({ id: 'single-packet' })]
    );

    expect(plan).toMatchObject({
      variantsToCreate: [{ serving_size: 2 }],
      variantsToUpdate: [],
      variantsToDelete: [{ id: 'single-packet' }],
    });
  });

  it('authorizes deletion only with keys from previous attempts', () => {
    const plan = planFoodVariantReconciliation(
      [createVariant()],
      [
        createVariant({ id: 'matched-packet' }),
        createVariant({ id: 'unrelated-duplicate' }),
      ],
      { baselineVariantIds: [], attemptedVariantKeys: [] }
    );

    expect(plan).toMatchObject({
      variantsToCreate: [],
      variantsToUpdate: [{ id: 'matched-packet' }],
      variantsToDelete: [],
      nextAttemptedVariantKeys: ['1|packet (150 g)'],
    });
  });

  it('leaves inputs unchanged and returns the same plan for repeated calls', () => {
    const requested = Object.freeze([
      Object.freeze(createVariant({ calories: 240 })),
      Object.freeze(createVariant({ serving_unit: 'bag (150 g)' })),
    ]);
    const existing = Object.freeze([
      Object.freeze(createVariant({ id: 'committed-packet' })),
      Object.freeze(
        createVariant({ id: 'removed-slice', serving_unit: 'slice' })
      ),
    ]);
    const context = Object.freeze({
      baselineVariantIds: Object.freeze(['baseline-reference']),
      attemptedVariantKeys: Object.freeze(['1|slice']),
    });
    const before = JSON.stringify({ requested, existing, context });

    const first = planFoodVariantReconciliation(requested, existing, context);
    const repeated = planFoodVariantReconciliation(
      requested,
      existing,
      context
    );

    expect(first).toMatchObject({
      variantsToCreate: [{ serving_unit: 'bag (150 g)' }],
      variantsToUpdate: [{ id: 'committed-packet', calories: 240 }],
      variantsToDelete: [{ id: 'removed-slice' }],
      nextAttemptedVariantKeys: [
        '1|slice',
        '1|packet (150 g)',
        '1|bag (150 g)',
      ],
    });
    expect(repeated).toEqual(first);
    expect(JSON.stringify({ requested, existing, context })).toBe(before);
  });
});
