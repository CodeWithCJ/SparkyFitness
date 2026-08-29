import {
  ingredientDraftReducer,
  isIngredientDraftEdited,
  type IngredientDraftAction,
  type FoodPhotoEstimateItem,
  type FoodPhotoEstimateMatch,
} from '@workspace/shared';

const chicken: FoodPhotoEstimateItem = {
  name: 'Grilled chicken thigh',
  estimated_grams: 145,
  portion_description: '1 medium thigh',
  preparation: 'grilled',
  calories_kcal: 290,
  protein_g: 38,
  carbs_g: 0,
  fat_g: 14.5,
  fiber_g: 0,
  sugar_g: 0,
  item_confidence: 'high',
  assumptions: [],
};

const rice: FoodPhotoEstimateItem = {
  name: 'White jasmine rice',
  estimated_grams: 180,
  portion_description: '1 cup cooked',
  preparation: 'steamed',
  calories_kcal: 234,
  protein_g: 4.3,
  carbs_g: 51,
  fat_g: 0.4,
  fiber_g: 0.6,
  sugar_g: 0.1,
  item_confidence: 'medium',
  assumptions: [],
};

const match: FoodPhotoEstimateMatch = {
  food_id: '11111111-1111-4111-8111-111111111111',
  variant_id: '22222222-2222-4222-8222-222222222222',
  food_name: 'Chicken Thigh',
  brand: null,
  serving_size: 100,
  serving_unit: 'g',
  match_score: 0.96,
  match_source: 'exact_name',
  is_own_food: true,
  gram_convertible: true,
  scaled: {
    calories_kcal: 200,
    protein_g: 30,
    carbs_g: 0,
    fat_g: 8,
    fiber_g: 0,
    sugar_g: 0,
  },
};

const init = (items: FoodPhotoEstimateItem[]) =>
  ingredientDraftReducer({ rows: [], expandedId: null }, { type: 'RESET', items });

const run = (items: FoodPhotoEstimateItem[], actions: IngredientDraftAction[]) =>
  actions.reduce(ingredientDraftReducer, init(items));

describe('ingredientDraftReducer', () => {
  describe('initialisation', () => {
    it('builds one row per detected item', () => {
      expect(init([chicken, rice]).rows).toHaveLength(2);
    });

    it('falls back to index-based ids when the server sends no item_id', () => {
      expect(init([chicken, rice]).rows.map((r) => r.id)).toEqual(['local-0', 'local-1']);
    });

    it('uses the server item_id when present', () => {
      const state = init([{ ...chicken, item_id: 'srv-1' }]);
      expect(state.rows[0].id).toBe('srv-1');
    });

    it('falls back to the display name when canonical_name is absent', () => {
      expect(init([chicken]).rows[0].canonicalName).toBe('Grilled chicken thigh');
    });

    it('does not apply a match unless the server preselects it', () => {
      const state = init([{ ...chicken, match }]);
      expect(state.rows[0].matchApplied).toBe(false);
      expect(state.rows[0].macros.calories_kcal).toBe(290);
    });

    it('applies a preselected match on open', () => {
      const state = init([{ ...chicken, match, preselect_match: true }]);
      expect(state.rows[0].matchApplied).toBe(true);
      expect(state.rows[0].macros.calories_kcal).toBe(200);
    });

    it('ignores a preselected match with no gram-scaled nutrition', () => {
      const state = init([
        {
          ...chicken,
          match: { ...match, gram_convertible: false, scaled: null },
          preselect_match: true,
        },
      ]);
      expect(state.rows[0].matchApplied).toBe(false);
      expect(state.rows[0].macros.calories_kcal).toBe(290);
    });

    it('ignores a preselected match whose nutrition is all zeros', () => {
      // A matched food with nothing recorded against it. Applying it would
      // replace a real estimate with zeros, and once that row is logged and
      // saved as a food the next photo matches THAT and the zeros spread.
      const zeroed = {
        ...match,
        scaled: {
          calories_kcal: 0,
          protein_g: 0,
          carbs_g: 0,
          fat_g: 0,
          fiber_g: 0,
          sugar_g: 0,
        },
      };
      const state = init([
        { ...chicken, match: zeroed, preselect_match: true },
      ]);
      expect(state.rows[0].matchApplied).toBe(false);
      expect(state.rows[0].macros.calories_kcal).toBe(290);
    });

    it('refuses to apply an all-zero match on demand either', () => {
      const zeroed = {
        ...match,
        scaled: {
          calories_kcal: 0,
          protein_g: 0,
          carbs_g: 0,
          fat_g: 0,
          fiber_g: 0,
          sugar_g: 0,
        },
      };
      const state = run(
        [{ ...chicken, match: zeroed }],
        [{ type: 'APPLY_MATCH', id: 'local-0' }],
      );
      expect(state.rows[0].matchApplied).toBe(false);
      expect(state.rows[0].macros.calories_kcal).toBe(290);
    });
  });

  describe('SET_GRAMS', () => {
    it('rescales every macro proportionally', () => {
      const state = run([chicken], [{ type: 'SET_GRAMS', id: 'local-0', grams: 72.5 }]);
      expect(state.rows[0].grams).toBe(72.5);
      expect(state.rows[0].macros.calories_kcal).toBeCloseTo(145, 6);
      expect(state.rows[0].macros.protein_g).toBeCloseTo(19, 6);
    });

    it('always rescales from the ORIGINAL values, so repeated edits do not compound', () => {
      const state = run([chicken], [
        { type: 'SET_GRAMS', id: 'local-0', grams: 72.5 },
        { type: 'SET_GRAMS', id: 'local-0', grams: 145 },
      ]);
      expect(state.rows[0].macros.calories_kcal).toBeCloseTo(290, 6);
    });

    it('scales to zero without producing NaN', () => {
      const state = run([chicken], [{ type: 'SET_GRAMS', id: 'local-0', grams: 0 }]);
      expect(state.rows[0].macros.calories_kcal).toBe(0);
    });

    it('clamps a negative weight to zero', () => {
      const state = run([chicken], [{ type: 'SET_GRAMS', id: 'local-0', grams: -20 }]);
      expect(state.rows[0].grams).toBe(0);
    });

    it('rescales from the matched food nutrition when a match is applied', () => {
      const state = run([{ ...chicken, match }], [
        { type: 'APPLY_MATCH', id: 'local-0' },
        { type: 'SET_GRAMS', id: 'local-0', grams: 72.5 },
      ]);
      // Half of the matched 200 kcal, not half of the AI's 290.
      expect(state.rows[0].macros.calories_kcal).toBeCloseTo(100, 6);
    });

    it('leaves other rows untouched', () => {
      const state = run([chicken, rice], [{ type: 'SET_GRAMS', id: 'local-0', grams: 10 }]);
      expect(state.rows[1].macros.calories_kcal).toBe(234);
    });
  });

  describe('manual override', () => {
    it('marks the row once a macro is edited directly', () => {
      const state = run([chicken], [
        { type: 'SET_MACRO', id: 'local-0', key: 'protein_g', value: 42 },
      ]);
      expect(state.rows[0].manualOverride).toBe(true);
      expect(state.rows[0].macros.protein_g).toBe(42);
    });

    it('stops a later grams edit from discarding the correction', () => {
      const state = run([chicken], [
        { type: 'SET_MACRO', id: 'local-0', key: 'protein_g', value: 42 },
        { type: 'SET_GRAMS', id: 'local-0', grams: 72.5 },
      ]);
      expect(state.rows[0].grams).toBe(72.5);
      expect(state.rows[0].macros.protein_g).toBe(42);
      expect(state.rows[0].macros.calories_kcal).toBe(290);
    });

    it('RECALC_FROM_GRAMS clears the override and rescales again', () => {
      const state = run([chicken], [
        { type: 'SET_MACRO', id: 'local-0', key: 'protein_g', value: 42 },
        { type: 'SET_GRAMS', id: 'local-0', grams: 72.5 },
        { type: 'RECALC_FROM_GRAMS', id: 'local-0' },
      ]);
      expect(state.rows[0].manualOverride).toBe(false);
      expect(state.rows[0].macros.protein_g).toBeCloseTo(19, 6);
      expect(state.rows[0].macros.calories_kcal).toBeCloseTo(145, 6);
    });

    it('clamps a negative macro to zero', () => {
      const state = run([chicken], [
        { type: 'SET_MACRO', id: 'local-0', key: 'fat_g', value: -3 },
      ]);
      expect(state.rows[0].macros.fat_g).toBe(0);
    });
  });

  describe('matching', () => {
    it('APPLY_MATCH swaps in the database nutrition and adopts its name', () => {
      const state = run([{ ...chicken, match }], [{ type: 'APPLY_MATCH', id: 'local-0' }]);
      expect(state.rows[0].matchApplied).toBe(true);
      expect(state.rows[0].name).toBe('Chicken Thigh');
      expect(state.rows[0].macros.calories_kcal).toBe(200);
    });

    it('APPLY_MATCH after a grams edit scales the match to the NEW weight', () => {
      const state = run([{ ...chicken, match }], [
        { type: 'SET_GRAMS', id: 'local-0', grams: 290 },
        { type: 'APPLY_MATCH', id: 'local-0' },
      ]);
      // `scaled` is the match at the AI's 145 g. The row now weighs 290 g, so
      // it must carry double — not the 200 kcal that described half the plate.
      expect(state.rows[0].grams).toBe(290);
      expect(state.rows[0].macros.calories_kcal).toBeCloseTo(400, 6);
      expect(state.rows[0].macros.protein_g).toBeCloseTo(60, 6);
    });

    it('CLEAR_MATCH restores the AI estimate at the current weight', () => {
      const state = run([{ ...chicken, match }], [
        { type: 'APPLY_MATCH', id: 'local-0' },
        { type: 'SET_GRAMS', id: 'local-0', grams: 72.5 },
        { type: 'CLEAR_MATCH', id: 'local-0' },
      ]);
      expect(state.rows[0].matchApplied).toBe(false);
      expect(state.rows[0].macros.calories_kcal).toBeCloseTo(145, 6);
    });

    it('APPLY_MATCH can switch to an alternate', () => {
      const alternate = { ...match, food_name: 'Chicken Thigh, Roasted', scaled: { ...match.scaled!, calories_kcal: 250 } };
      const state = run([{ ...chicken, match, alternates: [alternate] }], [
        { type: 'APPLY_MATCH', id: 'local-0', match: alternate },
      ]);
      expect(state.rows[0].name).toBe('Chicken Thigh, Roasted');
      expect(state.rows[0].macros.calories_kcal).toBe(250);
    });

    it('does nothing for a match with no gram-scaled nutrition', () => {
      const state = run([{ ...chicken, match: { ...match, scaled: null } }], [
        { type: 'APPLY_MATCH', id: 'local-0' },
      ]);
      expect(state.rows[0].matchApplied).toBe(false);
      expect(state.rows[0].macros.calories_kcal).toBe(290);
    });

    it('applying a match clears a previous manual override', () => {
      const state = run([{ ...chicken, match }], [
        { type: 'SET_MACRO', id: 'local-0', key: 'protein_g', value: 42 },
        { type: 'APPLY_MATCH', id: 'local-0' },
      ]);
      expect(state.rows[0].manualOverride).toBe(false);
      expect(state.rows[0].macros.protein_g).toBe(30);
    });
  });

  describe('rows and expansion', () => {
    it('REMOVE_ROW drops only that row', () => {
      const state = run([chicken, rice], [{ type: 'REMOVE_ROW', id: 'local-0' }]);
      expect(state.rows).toHaveLength(1);
      expect(state.rows[0].name).toBe('White jasmine rice');
    });

    it('REMOVE_ROW collapses the row if it was open', () => {
      const state = run([chicken, rice], [
        { type: 'TOGGLE_EXPANDED', id: 'local-0' },
        { type: 'REMOVE_ROW', id: 'local-0' },
      ]);
      expect(state.expandedId).toBeNull();
    });

    it('keeps only one row expanded at a time', () => {
      const state = run([chicken, rice], [
        { type: 'TOGGLE_EXPANDED', id: 'local-0' },
        { type: 'TOGGLE_EXPANDED', id: 'local-1' },
      ]);
      expect(state.expandedId).toBe('local-1');
    });

    it('toggles the same row closed', () => {
      const state = run([chicken], [
        { type: 'TOGGLE_EXPANDED', id: 'local-0' },
        { type: 'TOGGLE_EXPANDED', id: 'local-0' },
      ]);
      expect(state.expandedId).toBeNull();
    });

    it('SET_NAME renames without touching nutrition', () => {
      const state = run([chicken], [
        { type: 'SET_NAME', id: 'local-0', name: 'Turkey thigh' },
      ]);
      expect(state.rows[0].name).toBe('Turkey thigh');
      expect(state.rows[0].macros.calories_kcal).toBe(290);
    });

    it('ignores actions for an unknown row id', () => {
      const before = init([chicken]);
      const after = ingredientDraftReducer(before, {
        type: 'SET_GRAMS',
        id: 'nope',
        grams: 10,
      });
      expect(after.rows[0]).toEqual(before.rows[0]);
    });
  });

  describe('edits after a match is applied (PR #2282 review)', () => {
    it('detaches the match when a macro is edited, so the edit survives logging', () => {
      const state = run([{ ...chicken, match }], [
        { type: 'APPLY_MATCH', id: 'local-0' },
        { type: 'SET_MACRO', id: 'local-0', key: 'protein_g', value: 42 },
      ]);
      // A row still flagged matchApplied serializes as source:'existing', and
      // the server would then snapshot the database variant and drop this edit.
      expect(state.rows[0].matchApplied).toBe(false);
      expect(state.rows[0].macros.protein_g).toBe(42);
      // The other matched values are kept — only the link is broken.
      expect(state.rows[0].macros.calories_kcal).toBe(200);
      // The match stays available to re-apply.
      expect(state.rows[0].match).not.toBeNull();
    });

    it('detaches the match when the name is edited', () => {
      const state = run([{ ...chicken, match }], [
        { type: 'APPLY_MATCH', id: 'local-0' },
        { type: 'SET_NAME', id: 'local-0', name: 'Turkey thigh' },
      ]);
      expect(state.rows[0].matchApplied).toBe(false);
      expect(state.rows[0].name).toBe('Turkey thigh');
    });

    it('restores the AI name when the match is cleared', () => {
      const state = run([{ ...chicken, match }], [
        { type: 'APPLY_MATCH', id: 'local-0' },
        { type: 'CLEAR_MATCH', id: 'local-0' },
      ]);
      // Otherwise the row logs as a new quick food named after the food the
      // user just rejected.
      expect(state.rows[0].name).toBe('Grilled chicken thigh');
      expect(state.rows[0].macros.calories_kcal).toBe(290);
    });

    it('can re-apply the match after an edit detached it', () => {
      const state = run([{ ...chicken, match }], [
        { type: 'APPLY_MATCH', id: 'local-0' },
        { type: 'SET_MACRO', id: 'local-0', key: 'protein_g', value: 42 },
        { type: 'APPLY_MATCH', id: 'local-0' },
      ]);
      expect(state.rows[0].matchApplied).toBe(true);
      expect(state.rows[0].macros.protein_g).toBe(30);
      expect(state.rows[0].name).toBe('Chicken Thigh');
    });
  });

  describe('isIngredientDraftEdited', () => {
    // Drives whether "One food" keeps the model's plate total or switches to
    // the sum of the reviewed rows.
    it('is false for an untouched draft', () => {
      const state = init([chicken, rice]);
      expect(isIngredientDraftEdited(state.rows, 2)).toBe(false);
    });

    it('is true once a row is removed', () => {
      const state = run([chicken, rice], [{ type: 'REMOVE_ROW', id: 'local-0' }]);
      expect(isIngredientDraftEdited(state.rows, 2)).toBe(true);
    });

    it('is true once the grams change', () => {
      const state = run([chicken], [{ type: 'SET_GRAMS', id: 'local-0', grams: 90 }]);
      expect(isIngredientDraftEdited(state.rows, 1)).toBe(true);
    });

    it('is true once a macro is hand-edited', () => {
      const state = run([chicken], [
        { type: 'SET_MACRO', id: 'local-0', key: 'protein_g', value: 42 },
      ]);
      expect(isIngredientDraftEdited(state.rows, 1)).toBe(true);
    });

    it('is true once a row is renamed', () => {
      const state = run([chicken], [
        { type: 'SET_NAME', id: 'local-0', name: 'Turkey thigh' },
      ]);
      expect(isIngredientDraftEdited(state.rows, 1)).toBe(true);
    });

    it('is true once a match is applied', () => {
      const state = run([{ ...chicken, match }], [
        { type: 'APPLY_MATCH', id: 'local-0' },
      ]);
      expect(isIngredientDraftEdited(state.rows, 1)).toBe(true);
    });

    it('returns to false after a match is applied and then cleared', () => {
      const state = run([{ ...chicken, match }], [
        { type: 'APPLY_MATCH', id: 'local-0' },
        { type: 'CLEAR_MATCH', id: 'local-0' },
      ]);
      expect(isIngredientDraftEdited(state.rows, 1)).toBe(false);
    });

    it('ignores expanding a row', () => {
      const state = run([chicken], [{ type: 'TOGGLE_EXPANDED', id: 'local-0' }]);
      expect(isIngredientDraftEdited(state.rows, 1)).toBe(false);
    });
  });
});
