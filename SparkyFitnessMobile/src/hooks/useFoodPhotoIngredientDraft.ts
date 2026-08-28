import { useMemo, useReducer, useState } from 'react';
import {
  ingredientDraftReducer,
  initialiseIngredientDraft,
  ingredientDraftTotals,
  isIngredientDraftEdited,
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

  // `useReducer`'s initializer runs only on mount. The dialog mounts this hook
  // before the estimate exists (with an empty array) and then swaps in the
  // items, so without an explicit reset the reducer would keep its empty rows
  // and the review table would render permanently blank. Resetting during
  // render — rather than in an effect — avoids a frame of stale rows, and the
  // identity guard makes it self-limiting.
  const [seenItems, setSeenItems] = useState(items);
  // Compare by identity, but treat two empty lists as the same estimate. A
  // caller writing `estimate?.items ?? []` passes a fresh array on every
  // render before the estimate arrives; resetting on that would setState in
  // render forever ("Too many re-renders").
  const itemsChanged =
    items !== seenItems && !(items.length === 0 && seenItems.length === 0);
  if (itemsChanged) {
    setSeenItems(items);
    dispatch({ type: 'RESET', items });
  }

  const { totals, totalGrams, matchedCount } = useMemo(
    () => ingredientDraftTotals(state.rows),
    [state.rows],
  );

  const isEdited = useMemo(
    () => isIngredientDraftEdited(state.rows, items.length),
    [state.rows, items.length]
  );

  return {
    rows: state.rows,
    isEdited,
    expandedId: state.expandedId,
    totals,
    totalGrams,
    matchedCount,
    dispatch,
  };
}

export { ESTIMATE_MACRO_KEYS };
