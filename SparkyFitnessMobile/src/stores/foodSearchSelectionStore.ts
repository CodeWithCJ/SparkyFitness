import { create } from 'zustand';
import type { FoodItem } from '../types/foods';
import {
  DraftVariantServing,
  initialDraftQuantityText,
  multiAddKeyForFood,
} from '../utils/multiAddFoodEntries';
export type { DraftVariantServing };

export interface FoodDraftFields {
  /** Raw quantity text from the review row; parsed with parseDecimalInput. */
  quantityText: string;
  mealTypeId: string;
  /**
   * Chosen variant id; '' means the food's default variant. Quantity is
   * denominated in the chosen variant's serving unit.
   */
  variantId: string;
  /** Chosen serving basis snapshot; absent = default variant. */
  variant?: DraftVariantServing;
}

/**
 * Snapshot of the row's chosen serving basis, stored on the draft at
 * selection time. The variants query cache cannot be trusted at submit
 * time — it expires while the review screen is unmounted — so the draft
 * carries what conversion needs (linked path: id + unit; quantity
 * recovery: serving size) instead of re-resolving variantId against a
 * possibly-evicted cache.
 */

/**
 * A row's outcome from the last batch attempt. `confirmed_rejected` covers
 * any parsed 4xx, including an auth failure (401) — that row's own request
 * did receive a definite rejection, even though the auth failure separately
 * halts the rest of the batch. `unknown` covers timeout/network/5xx, where
 * the request may have committed; those rows are never auto-retried. A row
 * with no entry here has not been attempted yet (fresh, or a batch left it
 * unstarted after an auth halt) and is retried normally.
 */
export type RowOutcomeStatus = 'succeeded' | 'confirmed_rejected' | 'unknown';

export interface AddManyResult {
  added: number;
  /**
   * True when at least one distinct (not already-selected) food was dropped
   * because the basket hit its cap. Duplicates never set this — a smaller
   * `added` alone can mean nothing but duplicates.
   */
  truncated: boolean;
}

function dropKeys<T>(
  map: Map<string, T>,
  keys: readonly string[]
): Map<string, T> {
  if (!keys.some((key) => map.has(key))) return map;
  const next = new Map(map);
  for (const key of keys) next.delete(key);
  return next;
}

interface FoodSearchSelectionState {
  selectedByKey: Map<string, FoodItem>;
  drafts: Map<string, FoodDraftFields>;
  outcomes: Map<string, RowOutcomeStatus>;
  /**
   * True while a batch submission is in flight. Store-owned (not hook-local)
   * so it survives the review screen remounting — a fresh hook instance must
   * not be able to start a second batch over the first. All basket and draft
   * mutations are refused while it is held; the batch hook clears it before
   * the screen reconciles results (removeKeys/setOutcomes run unlocked).
   */
  isSubmitting: boolean;
  /**
   * Monotonic token bumped by cancelBatch. A batch captures the token when
   * it starts and discards its reconciliation if the token moved — the
   * identity-change clear cancels an in-flight batch without waiting for
   * its requests, and a settled stale batch can never write outcomes into
   * the new account's freshly-cleared basket.
   */
  batchGeneration: number;
  setSubmitting: (submitting: boolean) => void;
  /**
   * Identity-change clear: cancel any active batch (bumping the generation
   * so its reconciliation is skipped), empty every map, and release the
   * latch — unlike clear(), which is a no-op mid-flight by design.
   */
  cancelBatch: () => void;
  toggle: (
    food: FoodItem,
    maxItems: number,
    initialMealTypeId: string | undefined
  ) => boolean;
  addMany: (
    foods: FoodItem[],
    maxItems: number,
    initialMealTypeId: string | undefined
  ) => AddManyResult;
  removeKeys: (keys: readonly string[]) => void;
  clear: () => void;
  updateDraft: (key: string, patch: Partial<FoodDraftFields>) => void;
  /**
   * Switch a row to another variant: records the variant id and re-seeds the
   * quantity in the new variant's serving unit — a number carried across
   * variants is meaningless (170 against a "1 cup" variant).
   */
  setDraftVariant: (key: string, variant: DraftVariantServing) => void;
  applyMealTypeToAll: (mealTypeId: string) => void;
  setOutcomes: (entries: { key: string; status: RowOutcomeStatus }[]) => void;
}

/**
 * Multi-select food-logging basket (#1980), shared across FoodSearchScreen
 * (where items are selected) and FoodEntryMultiAddScreen (the review screen
 * pushed on top of it). A store rather than screen-local hook state: the
 * review screen edits drafts and records batch outcomes, and FoodSearchScreen
 * must see those changes when the user navigates back mid-batch (the basket
 * bar's count, an "Add anyway" retry) — a plain hook instance is private to
 * whichever screen calls it, and a route param would freeze a snapshot of it
 * at the moment of navigation rather than staying live. `get()` inside each
 * action is always the current committed state (no React-batching staleness
 * to guard against, unlike a ref shadowing useState), so capacity checks stay
 * correct across calls made in the same tick. Not persisted: this basket is
 * session-scoped like the search screen it lives on, gone on app restart.
 */
export const useFoodSearchSelectionStore = create<FoodSearchSelectionState>(
  (set, get) => ({
    selectedByKey: new Map(),
    drafts: new Map(),
    outcomes: new Map(),
    isSubmitting: false,
    batchGeneration: 0,

    cancelBatch: () => {
      set({
        selectedByKey: new Map(),
        drafts: new Map(),
        outcomes: new Map(),
        isSubmitting: false,
        batchGeneration: get().batchGeneration + 1,
      });
    },

    setSubmitting: (submitting) => {
      if (get().isSubmitting === submitting) return;
      set({ isSubmitting: submitting });
    },

    toggle: (food, maxItems, initialMealTypeId) => {
      if (get().isSubmitting) return false;
      const { selectedByKey, drafts, outcomes } = get();
      const key = multiAddKeyForFood(food);
      if (selectedByKey.has(key)) {
        const nextSelected = new Map(selectedByKey);
        nextSelected.delete(key);
        set({
          selectedByKey: nextSelected,
          drafts: dropKeys(drafts, [key]),
          outcomes: dropKeys(outcomes, [key]),
        });
        return true;
      }
      if (selectedByKey.size >= maxItems) return false;
      const nextSelected = new Map(selectedByKey);
      nextSelected.set(key, food);
      const nextDrafts = new Map(drafts);
      nextDrafts.set(key, {
        quantityText: initialDraftQuantityText(food),
        mealTypeId: initialMealTypeId ?? '',
        variantId: '',
      });
      set({ selectedByKey: nextSelected, drafts: nextDrafts });
      return true;
    },

    addMany: (foods, maxItems, initialMealTypeId) => {
      if (get().isSubmitting) return { added: 0, truncated: false };
      const { selectedByKey, drafts } = get();
      const nextSelected = new Map(selectedByKey);
      const nextDrafts = new Map(drafts);
      let added = 0;
      let truncated = false;
      for (const food of foods) {
        const key = multiAddKeyForFood(food);
        if (nextSelected.has(key)) continue;
        if (nextSelected.size >= maxItems) {
          truncated = true;
          break;
        }
        nextSelected.set(key, food);
        nextDrafts.set(key, {
          quantityText: initialDraftQuantityText(food),
          mealTypeId: initialMealTypeId ?? '',
          variantId: '',
        });
        added++;
      }
      if (added === 0) return { added: 0, truncated };
      set({ selectedByKey: nextSelected, drafts: nextDrafts });
      return { added, truncated };
    },

    removeKeys: (keys) => {
      if (keys.length === 0) return;
      if (get().isSubmitting) return;
      const { selectedByKey, drafts, outcomes } = get();
      if (!keys.some((key) => selectedByKey.has(key))) return;
      set({
        selectedByKey: dropKeys(selectedByKey, keys),
        drafts: dropKeys(drafts, keys),
        outcomes: dropKeys(outcomes, keys),
      });
    },

    clear: () => {
      if (get().isSubmitting) return;
      if (get().selectedByKey.size === 0) return;
      set({
        selectedByKey: new Map(),
        drafts: new Map(),
        outcomes: new Map(),
      });
    },

    updateDraft: (key, patch) => {
      if (get().isSubmitting) return;
      const { drafts } = get();
      const current = drafts.get(key);
      if (!current) return;
      const next = new Map(drafts);
      next.set(key, { ...current, ...patch });
      set({ drafts: next });
    },

    setDraftVariant: (key, variant) => {
      if (get().isSubmitting) return;
      const { drafts, selectedByKey } = get();
      const current = drafts.get(key);
      if (!current) return;
      // Re-selecting the food's default normalizes back to '' so the
      // invariant "'' = default variant" holds however the user got there.
      const defaultId = selectedByKey.get(key)?.default_variant?.id;
      const isDefault = !variant.id || variant.id === defaultId;
      const next = new Map(drafts);
      next.set(key, {
        ...current,
        variantId: isDefault ? '' : variant.id!,
        variant: {
          id: isDefault ? undefined : variant.id,
          serving_size: variant.serving_size,
          serving_unit: variant.serving_unit,
        },
        quantityText:
          variant.serving_size != null && Number.isFinite(variant.serving_size)
            ? String(variant.serving_size)
            : current.quantityText,
      });
      set({ drafts: next });
    },

    applyMealTypeToAll: (mealTypeId) => {
      if (get().isSubmitting) return;
      const { drafts } = get();
      if (drafts.size === 0) return;
      const next = new Map<string, FoodDraftFields>();
      for (const [key, draft] of drafts) {
        next.set(key, { ...draft, mealTypeId });
      }
      set({ drafts: next });
    },

    setOutcomes: (entries) => {
      if (entries.length === 0) return;
      const { selectedByKey, outcomes } = get();
      const next = new Map(outcomes);
      for (const entry of entries) {
        // A row can be removed (manually, or by a fresh toggle) while its
        // own request from an earlier batch is still in flight; dropping the
        // outcome here stops it resurfacing if the same food is re-selected
        // later, which would otherwise wrongly show a stale failure badge.
        if (!selectedByKey.has(entry.key)) continue;
        next.set(entry.key, entry.status);
      }
      set({ outcomes: next });
    },
  })
);

export function __resetFoodSearchSelectionStoreForTests(): void {
  useFoodSearchSelectionStore.setState({
    selectedByKey: new Map(),
    drafts: new Map(),
    outcomes: new Map(),
    isSubmitting: false,
    batchGeneration: 0,
  });
}
