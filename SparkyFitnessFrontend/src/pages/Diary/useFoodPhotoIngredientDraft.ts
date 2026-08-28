import { useMemo, useReducer } from 'react';
import {
  ingredientDraftReducer,
  initialiseIngredientDraft,
  ingredientDraftTotals,
  type FoodPhotoEstimateItem,
} from '@workspace/shared';

export type {
  IngredientDraftRow,
  IngredientDraftAction,
} from '@workspace/shared';

/**
 * React binding for the shared ingredient-draft reducer — the same one the
 * mobile review screen uses, so the two platforms cannot diverge on how a
 * grams edit rescales, when the manual-override latch trips, or what applying
 * a database match does.
 */
export function useFoodPhotoIngredientDraft(items: FoodPhotoEstimateItem[]) {
  const [state, dispatch] = useReducer(
    ingredientDraftReducer,
    items,
    initialiseIngredientDraft
  );

  const { totals, totalGrams, matchedCount } = useMemo(
    () => ingredientDraftTotals(state.rows),
    [state.rows]
  );

  return {
    rows: state.rows,
    totals,
    totalGrams,
    matchedCount,
    dispatch,
  };
}
