import { renderHook, act, render } from '@testing-library/react';
import { useFoodPhotoIngredientDraft } from '@/pages/Diary/useFoodPhotoIngredientDraft';
import type { FoodPhotoEstimateItem } from '@workspace/shared';

const broccoli: FoodPhotoEstimateItem = {
  name: 'Steamed broccoli',
  estimated_grams: 85,
  portion_description: '1 cup',
  preparation: 'steamed',
  calories_kcal: 89,
  protein_g: 3,
  carbs_g: 7,
  fat_g: 1,
  fiber_g: 2.6,
  sugar_g: 1.4,
  item_confidence: 'high',
  assumptions: [],
};

const rice: FoodPhotoEstimateItem = {
  ...broccoli,
  name: 'Rice',
  estimated_grams: 180,
};

describe('useFoodPhotoIngredientDraft (web)', () => {
  it('populates rows when the estimate arrives after mount', () => {
    // The dialog mounts this hook before the estimate exists. useReducer's
    // initializer runs only once, so without an explicit reset the review
    // table would stay permanently empty.
    const { result, rerender } = renderHook(
      ({ items }) => useFoodPhotoIngredientDraft(items),
      { initialProps: { items: [] as FoodPhotoEstimateItem[] } }
    );

    expect(result.current.rows).toHaveLength(0);

    rerender({ items: [broccoli, rice] });

    expect(result.current.rows).toHaveLength(2);
    expect(result.current.rows[0]!.name).toBe('Steamed broccoli');
    expect(result.current.totalGrams).toBe(265);
  });

  it('resets to the new estimate when a second photo is analysed', () => {
    const { result, rerender } = renderHook(
      ({ items }) => useFoodPhotoIngredientDraft(items),
      { initialProps: { items: [broccoli, rice] as FoodPhotoEstimateItem[] } }
    );

    act(() => {
      result.current.dispatch({
        type: 'REMOVE_ROW',
        id: result.current.rows[0]!.id,
      });
    });
    expect(result.current.rows).toHaveLength(1);

    rerender({ items: [broccoli] });

    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0]!.name).toBe('Steamed broccoli');
  });

  it('keeps edits across an unrelated re-render', () => {
    const items = [broccoli];
    const { result, rerender } = renderHook(
      ({ i }) => useFoodPhotoIngredientDraft(i),
      { initialProps: { i: items } }
    );

    act(() => {
      result.current.dispatch({
        type: 'SET_GRAMS',
        id: result.current.rows[0]!.id,
        grams: 170,
      });
    });
    // Same array identity — must not clobber the user's edit.
    rerender({ i: items });

    expect(result.current.rows[0]!.grams).toBe(170);
    expect(result.current.totals.calories_kcal).toBeCloseTo(178, 6);
  });

  it('does not loop when a caller passes a fresh empty array each render', () => {
    // Reproduces the dialog: it renders `estimate?.items ?? []`, so every
    // render supplies a NEW array. One unrelated re-render is enough to start
    // the loop — the hook resets, which re-renders, which supplies another new
    // array, forever. React aborts with "Too many re-renders".
    const Harness = () => {
      const draft = useFoodPhotoIngredientDraft([]);
      return <span data-testid="rows">{draft.rows.length}</span>;
    };

    const view = render(<Harness />);
    view.rerender(<Harness />);

    expect(view.getByTestId('rows').textContent).toBe('0');
  });

  it('still resets when a real estimate replaces an empty list', () => {
    const { result, rerender } = renderHook(
      ({ items }) => useFoodPhotoIngredientDraft(items),
      { initialProps: { items: [] as FoodPhotoEstimateItem[] } }
    );

    rerender({ items: [] });
    rerender({ items: [broccoli] });

    expect(result.current.rows).toHaveLength(1);
  });
});
