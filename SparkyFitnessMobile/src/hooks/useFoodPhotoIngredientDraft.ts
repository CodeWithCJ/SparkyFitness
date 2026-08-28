import { useMemo, useReducer } from 'react';
import {
  ingredientDraftReducer,
  initialiseIngredientDraft,
  ingredientDraftTotals,
  ESTIMATE_MACRO_KEYS,
  type FoodPhotoEstimateItem,
} from '@workspace/shared';

export type {
  IngredientDraftRow,
  IngredientDraftAction,
} from '@workspace/shared';

/**
 * React binding for the shared ingredient-draft reducer. All the editing rules
 * live in `@workspace/shared` so mobile and web cannot drift apart; this only
 * wires them to `useReducer` and derives the totals.
 */
export function useFoodPhotoIngredientDraft(items: FoodPhotoEstimateItem[]) {
  const [state, dispatch] = useReducer(
    ingredientDraftReducer,
    items,
    initialiseIngredientDraft,
  );

  const { totals, totalGrams, matchedCount } = useMemo(
    () => ingredientDraftTotals(state.rows),
    [state.rows],
  );

  return {
    rows: state.rows,
    expandedId: state.expandedId,
    totals,
    totalGrams,
    matchedCount,
    dispatch,
  };
}

export { ESTIMATE_MACRO_KEYS };
