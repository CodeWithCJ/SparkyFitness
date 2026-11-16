import {
  recipeImportInitialQuantity,
  unresolvedRecipeIngredientBatches,
  mergeRecipeImportSuggestions,
} from '@workspace/shared';
it('preserves compatible source amount and refuses implicit volume to mass', () => {
  expect(recipeImportInitialQuantity(0.6, 'kg', 'g')).toBe(600);
  expect(recipeImportInitialQuantity(250, 'ml', 'g')).toBeUndefined();
});
it('bounds requests and removes confirmed suggestions even from late responses', () => {
  expect(
    unresolvedRecipeIngredientBatches(
      Array.from({ length: 43 }, (_, i) => `row-${i}`),
      new Set(['row-0'])
    ).map((batch) => batch.length)
  ).toEqual([20, 20, 2]);
  expect(
    mergeRecipeImportSuggestions(
      [],
      [{ ingredientId: 'row', candidates: [], suggestedCandidateId: null }],
      new Set(['row'])
    )
  ).toEqual([]);
});
