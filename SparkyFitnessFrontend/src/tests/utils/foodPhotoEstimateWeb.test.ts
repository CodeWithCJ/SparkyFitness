import { splitDataUrl } from '@/utils/imageResize';
import { describeEstimateError } from '@/utils/foodPhotoEstimate';
import {
  ingredientDraftReducer,
  initialiseIngredientDraft,
  ingredientDraftTotals,
  toPer100g,
  type FoodPhotoEstimateItem,
} from '@workspace/shared';

const item: FoodPhotoEstimateItem = {
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

describe('splitDataUrl', () => {
  it('separates the mime type from the raw base64 the server expects', () => {
    expect(splitDataUrl('data:image/jpeg;base64,AAAA')).toEqual({
      mimeType: 'image/jpeg',
      base64: 'AAAA',
    });
  });

  it('returns null for a non-data URL', () => {
    expect(splitDataUrl('https://example.com/a.jpg')).toBeNull();
  });

  it('returns null for a data URL that is not base64 encoded', () => {
    expect(splitDataUrl('data:image/svg+xml,<svg/>')).toBeNull();
  });
});

describe('describeEstimateError', () => {
  it('flags provider-configuration problems so the UI can link to Settings', () => {
    expect(describeEstimateError('NO_AI_CONFIGURED').isConfiguration).toBe(
      true
    );
    expect(describeEstimateError('API_KEY_MISSING').isConfiguration).toBe(true);
    expect(
      describeEstimateError('PRIVATE_NETWORK_FORBIDDEN').isConfiguration
    ).toBe(true);
  });

  it('does not flag transient failures as configuration problems', () => {
    expect(describeEstimateError('TIMEOUT').isConfiguration).toBe(false);
    expect(describeEstimateError('UPSTREAM_ERROR').isConfiguration).toBe(false);
  });
});

describe('web ingredient draft', () => {
  const init = (items: FoodPhotoEstimateItem[]) =>
    initialiseIngredientDraft(items);

  it('shares the reducer with mobile, so a grams edit rescales identically', () => {
    const state = ingredientDraftReducer(init([item]), {
      type: 'SET_GRAMS',
      id: 'local-0',
      grams: 42.5,
    });
    expect(state.rows[0]!.macros.calories_kcal).toBeCloseTo(44.5, 6);
  });

  it('derives totals rather than storing them', () => {
    const state = ingredientDraftReducer(init([item, item]), {
      type: 'REMOVE_ROW',
      id: 'local-0',
    });
    const { totals, totalGrams } = ingredientDraftTotals(state.rows);
    expect(totals.calories_kcal).toBe(89);
    expect(totalGrams).toBe(85);
  });

  it('converts an edited row to per-100g for storage', () => {
    const state = init([item]);
    const row = state.rows[0]!;
    const per100g = toPer100g(row.macros, row.grams);
    expect(per100g).not.toBeNull();
    // 89 kcal for 85 g -> 104.7 per 100 g.
    expect(per100g!.calories_kcal).toBeCloseTo(104.7, 1);
  });

  it('refuses to build per-100g nutrition from a zero-weight row', () => {
    const state = ingredientDraftReducer(init([item]), {
      type: 'SET_GRAMS',
      id: 'local-0',
      grams: 0,
    });
    const row = state.rows[0]!;
    expect(toPer100g(row.macros, row.grams)).toBeNull();
  });
});
