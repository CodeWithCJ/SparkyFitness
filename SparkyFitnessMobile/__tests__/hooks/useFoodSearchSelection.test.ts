import { act, renderHook } from '@testing-library/react-native';
import { useFoodSearchSelection } from '../../src/hooks/useFoodSearchSelection';
import {
  __resetFoodSearchSelectionStoreForTests,
  useFoodSearchSelectionStore,
} from '../../src/stores/foodSearchSelectionStore';
import { convertDraftToPayload } from '../../src/utils/multiAddFoodEntries';
import type { FoodItem } from '../../src/types/foods';

function makeFood(id: string, variantId?: string): FoodItem {
  return {
    id,
    name: `Food ${id}`,
    brand: null,
    is_custom: false,
    default_variant: {
      id: variantId,
      serving_size: 100,
      serving_unit: 'g',
      calories: 50,
      protein: 2,
      carbs: 8,
      fat: 1,
    },
  } as FoodItem;
}

describe('useFoodSearchSelection', () => {
  // The basket now lives in a shared store (#1980 batch milestone) so
  // FoodEntryMultiAddScreen sees the same live state FoodSearchScreen
  // writes — reset it between tests or state leaks across cases.
  beforeEach(() => {
    __resetFoodSearchSelectionStoreForTests();
  });

  test('toggle adds then removes a food', () => {
    const { result } = renderHook(() => useFoodSearchSelection());
    const food = makeFood('f1', 'v1');

    act(() => {
      expect(result.current.toggle(food)).toBe(true);
    });
    expect(result.current.count).toBe(1);
    expect(result.current.isSelected(food)).toBe(true);
    expect(result.current.selectedFoods).toEqual([food]);

    act(() => {
      expect(result.current.toggle(food)).toBe(true);
    });
    expect(result.current.count).toBe(0);
    expect(result.current.isSelected(food)).toBe(false);
  });

  test('the same food from different sections collapses to one row', () => {
    const { result } = renderHook(() => useFoodSearchSelection());
    const recent = makeFood('f1', 'v1');
    const favorite = makeFood('f1', 'v1');

    act(() => {
      result.current.toggle(recent);
    });
    act(() => {
      result.current.toggle(favorite);
    });

    // Second toggle of the same key removes it; it can never double-add.
    expect(result.current.count).toBe(0);
  });

  test('different variants of one food stay distinct', () => {
    const { result } = renderHook(() => useFoodSearchSelection());
    const grams = makeFood('f1', 'v1');
    const ounces = makeFood('f1', 'v2');

    act(() => {
      result.current.toggle(grams);
      result.current.toggle(ounces);
    });

    expect(result.current.count).toBe(2);
  });

  test('toggle rejects adds once the cap is reached', () => {
    const { result } = renderHook(() => useFoodSearchSelection(2));

    act(() => {
      result.current.toggle(makeFood('f1', 'v1'));
      result.current.toggle(makeFood('f2', 'v1'));
    });
    expect(result.current.isAtCapacity).toBe(true);

    let changed = false;
    act(() => {
      changed = result.current.toggle(makeFood('f3', 'v1'));
    });
    expect(changed).toBe(false);
    expect(result.current.count).toBe(2);
  });

  test('capacity reporting stays honest across toggles inside one batch', () => {
    // Regression: three adds in a single act() against a 2-item cap. The
    // third must report rejection (false) — not claim success while the
    // state update is silently dropped.
    const { result } = renderHook(() => useFoodSearchSelection(2));

    let first = true;
    let second = true;
    let third = true;
    act(() => {
      first = result.current.toggle(makeFood('f1', 'v1'));
      second = result.current.toggle(makeFood('f2', 'v1'));
      third = result.current.toggle(makeFood('f3', 'v1'));
    });

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(third).toBe(false);
    expect(result.current.count).toBe(2);
  });

  test('addMany deduplicates and truncates at the cap, reporting additions', () => {
    const { result } = renderHook(() => useFoodSearchSelection(3));

    act(() => {
      result.current.toggle(makeFood('f1', 'v1'));
    });

    let outcome: { added: number; truncated: boolean } | undefined;
    act(() => {
      outcome = result.current.addMany([
        makeFood('f1', 'v1'), // duplicate of what is already selected
        makeFood('f2', 'v1'),
        makeFood('f3', 'v1'),
        makeFood('f4', 'v1'), // exceeds the cap
      ]);
    });

    expect(outcome).toEqual({ added: 2, truncated: true });
    expect(result.current.count).toBe(3);
    expect(result.current.selectedFoods.map((food) => food.id)).toEqual([
      'f1',
      'f2',
      'f3',
    ]);
  });

  test('addMany reports no truncation when only duplicates were skipped', () => {
    const { result } = renderHook(() => useFoodSearchSelection(5));
    act(() => {
      result.current.toggle(makeFood('f1', 'v1'));
    });

    let outcome: { added: number; truncated: boolean } | undefined;
    act(() => {
      outcome = result.current.addMany([makeFood('f1', 'v1')]);
    });

    expect(outcome).toEqual({ added: 0, truncated: false });
  });

  test('addMany truncation stays honest across calls inside one batch', () => {
    // Two select-alls from different sections in a single act(): the second
    // must report truncation against the first call's committed basket, not
    // a stale render closure.
    const { result } = renderHook(() => useFoodSearchSelection(2));

    let first: { added: number; truncated: boolean } | undefined;
    let second: { added: number; truncated: boolean } | undefined;
    act(() => {
      first = result.current.addMany([
        makeFood('f1', 'v1'),
        makeFood('f2', 'v1'),
      ]);
      second = result.current.addMany([makeFood('f3', 'v1')]);
    });

    expect(first).toEqual({ added: 2, truncated: false });
    expect(second).toEqual({ added: 0, truncated: true });
    expect(result.current.count).toBe(2);
  });

  test('removeKeys drops submitted rows and keeps the rest of the basket', () => {
    const { result } = renderHook(() => useFoodSearchSelection());

    act(() => {
      result.current.toggle(makeFood('f1', 'v1'));
      result.current.toggle(makeFood('f2', 'v1'));
      result.current.toggle(makeFood('f3', 'v1'));
    });
    act(() => {
      result.current.removeKeys(['f1:v1', 'f3:v1']);
    });

    expect(result.current.count).toBe(1);
    expect(result.current.selectedFoods.map((food) => food.id)).toEqual(['f2']);
  });

  test('clear empties the basket', () => {
    const { result } = renderHook(() => useFoodSearchSelection());
    act(() => {
      result.current.toggle(makeFood('f1', 'v1'));
    });
    act(() => {
      result.current.clear();
    });
    expect(result.current.count).toBe(0);
  });

  test('seeds the draft quantity from the variant serving size, not a serving count', () => {
    // Regression (#1980 final review): a plain '1' logged one GRAM of a
    // 100 g food while its row displayed "100 g" — quantity is denominated
    // in the serving unit, matching FoodEntryAddScreen's own seeding.
    const { result } = renderHook(() => useFoodSearchSelection());
    const food = makeFood('f1', 'v1');
    act(() => {
      result.current.toggle(food);
    });

    const row = result.current.basketRows[0];
    expect(row.quantityText).toBe('100');

    const conversion = convertDraftToPayload({
      food,
      quantityText: row.quantityText,
      mealTypeId: 'meal-1',
      entryDate: '2026-09-16',
    });
    expect(conversion.status === 'ok' && conversion.payload.quantity).toBe(100);
  });

  test('setDraftVariant records the variant and reseeds quantity in its unit', () => {
    const { result } = renderHook(() => useFoodSearchSelection());
    const food = makeFood('f1', 'v1'); // default variant serves 100 g
    act(() => {
      result.current.toggle(food);
    });
    expect(result.current.basketRows[0].quantityText).toBe('100');
    expect(result.current.basketRows[0].variantId).toBe('');

    act(() => {
      useFoodSearchSelectionStore.getState().setDraftVariant('f1:v1', {
        id: 'v2',
        serving_size: 1,
        serving_unit: 'cup',
      });
    });
    const row = result.current.basketRows[0];
    expect(row.variantId).toBe('v2');
    expect(row.quantityText).toBe('1');

    // Back to default — even re-selecting it BY its real id — normalizes
    // to '' and reseeds the default serving.
    act(() => {
      useFoodSearchSelectionStore.getState().setDraftVariant('f1:v1', {
        id: 'v1',
        serving_size: 100,
        serving_unit: 'g',
      });
    });
    expect(result.current.basketRows[0].variantId).toBe('');
    expect(result.current.basketRows[0].quantityText).toBe('100');
    expect(result.current.basketRows[0].variant).toEqual({
      id: undefined,
      serving_size: 100,
      serving_unit: 'g',
    });
  });

  test('basket and draft mutations are refused while a batch is submitting', () => {
    const { result } = renderHook(() => useFoodSearchSelection());
    act(() => {
      result.current.toggle(makeFood('f1', 'v1'));
    });

    act(() => {
      useFoodSearchSelectionStore.getState().setSubmitting(true);
    });

    // Duplicate submits, mid-flight removes, and draft edits must all no-op.
    expect(result.current.toggle(makeFood('f2', 'v1'))).toBe(false);
    act(() => {
      result.current.removeKeys(['f1:v1']);
      result.current.updateDraft('f1:v1', { quantityText: '5' });
      useFoodSearchSelectionStore.getState().setDraftVariant('f1:v1', {
        id: 'v9',
        serving_size: 2,
        serving_unit: 'oz',
      });
      result.current.clear();
    });
    expect(result.current.count).toBe(1);
    expect(result.current.basketRows[0].quantityText).toBe('100');

    act(() => {
      useFoodSearchSelectionStore.getState().setSubmitting(false);
    });
    act(() => {
      result.current.removeKeys(['f1:v1']);
    });
    expect(result.current.count).toBe(0);
  });

  test('a newly selected row seeds a draft defaulting to the serving size and the given meal type', () => {
    const { result } = renderHook(() => useFoodSearchSelection(50, 'meal-1'));

    act(() => {
      result.current.toggle(makeFood('f1', 'v1'));
    });

    expect(result.current.basketRows).toEqual([
      expect.objectContaining({
        key: 'f1:v1',
        quantityText: '100',
        mealTypeId: 'meal-1',
        outcome: undefined,
      }),
    ]);
  });

  test('removing a row drops its draft and outcome, not just the selection', () => {
    const { result } = renderHook(() => useFoodSearchSelection());
    act(() => {
      result.current.toggle(makeFood('f1', 'v1'));
    });
    act(() => {
      result.current.updateDraft('f1:v1', { quantityText: '2' });
      result.current.setOutcomes([{ key: 'f1:v1', status: 'unknown' }]);
    });
    expect(result.current.basketRows[0]).toEqual(
      expect.objectContaining({ quantityText: '2', outcome: 'unknown' })
    );

    act(() => {
      result.current.toggle(makeFood('f1', 'v1')); // deselect
    });
    expect(result.current.basketRows).toEqual([]);

    act(() => {
      result.current.toggle(makeFood('f1', 'v1')); // reselect
    });
    // A re-added row starts fresh — the prior draft/outcome do not resurface.
    expect(result.current.basketRows).toEqual([
      expect.objectContaining({
        quantityText: '100',
        mealTypeId: '',
        outcome: undefined,
      }),
    ]);
  });

  test('updateDraft is a no-op for a key that has left the basket', () => {
    const { result } = renderHook(() => useFoodSearchSelection());
    act(() => {
      result.current.toggle(makeFood('f1', 'v1'));
      result.current.toggle(makeFood('f1', 'v1')); // deselect
    });

    act(() => {
      result.current.updateDraft('f1:v1', { quantityText: '9' });
    });

    expect(result.current.basketRows).toEqual([]);
  });

  test('applyMealTypeToAll sets every row to the same meal type', () => {
    const { result } = renderHook(() => useFoodSearchSelection(50, 'meal-1'));
    act(() => {
      result.current.toggle(makeFood('f1', 'v1'));
      result.current.toggle(makeFood('f2', 'v1'));
    });
    act(() => {
      result.current.updateDraft('f1:v1', { mealTypeId: 'meal-2' });
    });

    act(() => {
      result.current.applyMealTypeToAll('meal-3');
    });

    expect(result.current.basketRows.map((row) => row.mealTypeId)).toEqual([
      'meal-3',
      'meal-3',
    ]);
  });

  test('the basket, drafts, and outcomes are shared across independent hook instances', () => {
    // Regression for the route-param snapshot problem this store replaced:
    // FoodSearchScreen and FoodEntryMultiAddScreen each call the hook fresh,
    // and must see the same live basket, not a copy frozen at navigation.
    const search = renderHook(() => useFoodSearchSelection());
    const review = renderHook(() => useFoodSearchSelection());

    act(() => {
      search.result.current.toggle(makeFood('f1', 'v1'));
    });
    expect(review.result.current.count).toBe(1);

    act(() => {
      review.result.current.updateDraft('f1:v1', { quantityText: '3' });
    });
    expect(search.result.current.basketRows[0].quantityText).toBe('3');
  });
});
