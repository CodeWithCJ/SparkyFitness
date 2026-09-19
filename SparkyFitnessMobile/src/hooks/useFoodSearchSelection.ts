import { useCallback, useMemo } from 'react';
import type { FoodItem } from '../types/foods';
import {
  MULTI_ADD_MAX_ITEMS,
  multiAddKeyForFood,
} from '../utils/multiAddFoodEntries';
import { useFoodSearchSelectionStore } from '../stores/foodSearchSelectionStore';
import type {
  AddManyResult,
  DraftVariantServing,
  FoodDraftFields,
  RowOutcomeStatus,
} from '../stores/foodSearchSelectionStore';

export type { AddManyResult, FoodDraftFields, RowOutcomeStatus };

export interface BasketRow {
  key: string;
  food: FoodItem;
  quantityText: string;
  mealTypeId: string;
  /** '' = the food's default variant; see FoodDraftFields. */
  variantId: string;
  variant?: DraftVariantServing;
  outcome?: RowOutcomeStatus;
}

/**
 * Basket state for multi-select food logging (#1980) — a thin selector hook
 * over useFoodSearchSelectionStore, so FoodSearchScreen and
 * FoodEntryMultiAddScreen (which the plan's batch milestone design
 * requirements say must not hold this state locally) both read and write the
 * same live basket instead of a snapshot frozen at navigation time. See the
 * store for the state-sharing rationale.
 *
 * `maxItems` and `initialMealTypeId` are read by this hook instance and
 * threaded into the store's mutators on every call, rather than configured
 * once on the shared store — the store itself carries no per-caller config,
 * only the basket contents.
 */
export function useFoodSearchSelection(
  maxItems: number = MULTI_ADD_MAX_ITEMS,
  /** Seeded onto every newly-selected row's draft; '' when not yet known (the
   * review screen backfills from the app default meal type on mount). */
  initialMealTypeId?: string
) {
  const selectedByKey = useFoodSearchSelectionStore((s) => s.selectedByKey);
  const drafts = useFoodSearchSelectionStore((s) => s.drafts);
  const outcomes = useFoodSearchSelectionStore((s) => s.outcomes);
  const storeToggle = useFoodSearchSelectionStore((s) => s.toggle);
  const storeAddMany = useFoodSearchSelectionStore((s) => s.addMany);
  const removeKeys = useFoodSearchSelectionStore((s) => s.removeKeys);
  const clear = useFoodSearchSelectionStore((s) => s.clear);
  const updateDraft = useFoodSearchSelectionStore((s) => s.updateDraft);
  const setDraftVariant = useFoodSearchSelectionStore((s) => s.setDraftVariant);
  const applyMealTypeToAll = useFoodSearchSelectionStore(
    (s) => s.applyMealTypeToAll
  );
  const setOutcomes = useFoodSearchSelectionStore((s) => s.setOutcomes);

  const selectedFoods = useMemo(
    () => Array.from(selectedByKey.values()),
    [selectedByKey]
  );

  const count = selectedByKey.size;
  const isAtCapacity = count >= maxItems;

  const isSelected = useCallback(
    (food: FoodItem) => selectedByKey.has(multiAddKeyForFood(food)),
    [selectedByKey]
  );

  /**
   * Toggles one food. Returns true when the basket changed; false when the
   * add was rejected because the basket is at capacity.
   */
  const toggle = useCallback(
    (food: FoodItem): boolean => storeToggle(food, maxItems, initialMealTypeId),
    [storeToggle, maxItems, initialMealTypeId]
  );

  /**
   * Adds many foods (select-all). Deduplicates against the basket and stops
   * at the cap. Returns what actually happened.
   */
  const addMany = useCallback(
    (foods: FoodItem[]): AddManyResult =>
      storeAddMany(foods, maxItems, initialMealTypeId),
    [storeAddMany, maxItems, initialMealTypeId]
  );

  const basketRows = useMemo<BasketRow[]>(
    () =>
      selectedFoods.map((food) => {
        const key = multiAddKeyForFood(food);
        const draft = drafts.get(key);
        return {
          key,
          food,
          quantityText: draft?.quantityText ?? '1',
          mealTypeId: draft?.mealTypeId ?? initialMealTypeId ?? '',
          variantId: draft?.variantId ?? '',
          variant: draft?.variant,
          outcome: outcomes.get(key),
        };
      }),
    [selectedFoods, drafts, outcomes, initialMealTypeId]
  );

  return {
    selectedFoods,
    count,
    isAtCapacity,
    maxItems,
    isSelected,
    toggle,
    addMany,
    removeKeys,
    clear,
    /** Combined per-row view (food + draft + last outcome) for the review
     * screen; FoodSearchScreen only needs selectedFoods/isSelected/count. */
    basketRows,
    updateDraft,
    setDraftVariant,
    applyMealTypeToAll,
    setOutcomes,
  };
}

export type FoodSearchSelection = ReturnType<typeof useFoodSearchSelection>;
