import { vi, beforeEach, describe, expect, it } from 'vitest';
import foodRepository from '../models/foodRepository.js';
import foodCoreService from '../services/foodCoreService.js';
import preferenceService from '../services/preferenceService.js';
import { fetchProviderFoodDetails } from '../services/foodProviderDetailService.js';
vi.mock('../models/foodRepository');
vi.mock('../services/preferenceService.js', () => ({
  default: { getUserPreferences: vi.fn() },
}));
vi.mock('../config/logging', () => ({ log: vi.fn() }));
vi.mock('../services/foodProviderDetailService.js', () => ({
  fetchProviderFoodDetails: vi.fn(),
}));
const TEST_USER_ID = 'user-123';
// What Open Food Facts answers for a product the client claims to have picked.
const OFF_RESPONSE = {
  provider_type: 'openfoodfacts',
  provider_nutriscore_grade: 'c',
  nutri_score_category: 'beverage',
};
const makeFoodData = (overrides = {}) => ({
  name: 'Test Food',
  brand: 'Test Brand',
  is_custom: true,
  user_id: TEST_USER_ID,
  barcode: '3017620422003',
  provider_external_id: '3017620422003',
  provider_type: 'openfoodfacts',
  serving_size: 100,
  serving_unit: 'g',
  calories: 200,
  protein: 10,
  carbs: 25,
  fat: 8,
  ...overrides,
});
const makeExistingFood = (overrides = {}) => ({
  id: 'food-existing-456',
  name: 'Test Food',
  brand: 'Test Brand',
  is_custom: true,
  user_id: TEST_USER_ID,
  provider_external_id: '3017620422003',
  provider_type: 'openfoodfacts',
  default_variant: {
    id: 'variant-789',
    serving_size: 100,
    serving_unit: 'g',
    calories: 200,
    protein: 10,
    carbs: 25,
    fat: 8,
    is_default: true,
  },
  ...overrides,
});
describe('foodCoreService.createFood', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchProviderFoodDetails).mockResolvedValue({
      provider_type: 'openfoodfacts',
    });
  });
  it('should return existing food when barcode already exists for user', async () => {
    const existingFood = makeExistingFood();
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.findFoodByBarcode.mockResolvedValue(existingFood);
    const result = await foodCoreService.createFood(
      TEST_USER_ID,
      makeFoodData()
    );
    expect(foodRepository.findFoodByBarcode).toHaveBeenCalledWith(
      '3017620422003',
      TEST_USER_ID
    );
    expect(foodRepository.createFood).not.toHaveBeenCalled();
    expect(foodRepository.updateFood).not.toHaveBeenCalled();
    expect(result).toEqual(existingFood);
  });
  it('should refresh provider verification when an existing external food is saved again', async () => {
    const existingFood = makeExistingFood({ provider_verified: false });
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.findFoodByProviderExternalId.mockResolvedValueOnce(
      existingFood
    );

    const result = await foodCoreService.createFood(
      TEST_USER_ID,
      makeFoodData({ barcode: undefined, provider_verified: true })
    );

    expect(foodRepository.createFood).not.toHaveBeenCalled();
    expect(foodRepository.updateFood).toHaveBeenCalledWith(
      existingFood.id,
      TEST_USER_ID,
      { provider_verified: true }
    );
    expect(result).toEqual({ ...existingFood, provider_verified: true });
  });
  // Regression: `hide` (the non-destructive delete) leaves the row in place with
  // is_quick_food = true, and every search/list query filters those out. The
  // provider dedupe lookup does NOT filter them, so re-importing the same
  // product matched the hidden row and returned it untouched -- the food came
  // back invisible, with no way to restore it from the UI.
  it('un-hides a food that was hidden when it is imported again', async () => {
    const existingFood = makeExistingFood({ is_quick_food: true });
    vi.mocked(foodRepository.findFoodByBarcode).mockResolvedValue(null);
    vi.mocked(
      foodRepository.findFoodByProviderExternalId
    ).mockResolvedValueOnce(existingFood);
    vi.mocked(foodRepository.updateFood).mockResolvedValue({
      ...existingFood,
      is_quick_food: false,
    });

    const result = await foodCoreService.createFood(
      TEST_USER_ID,
      makeFoodData({ barcode: undefined })
    );

    expect(foodRepository.createFood).not.toHaveBeenCalled();
    expect(foodRepository.updateFood).toHaveBeenCalledWith(
      existingFood.id,
      TEST_USER_ID,
      expect.objectContaining({ is_quick_food: false })
    );
    expect(result).toMatchObject({ is_quick_food: false });
  });

  it('leaves a hidden food hidden when the save is itself a quick add', async () => {
    const existingFood = makeExistingFood({ is_quick_food: true });
    vi.mocked(foodRepository.findFoodByBarcode).mockResolvedValue(null);
    vi.mocked(
      foodRepository.findFoodByProviderExternalId
    ).mockResolvedValueOnce(existingFood);

    const result = await foodCoreService.createFood(
      TEST_USER_ID,
      makeFoodData({ barcode: undefined, is_quick_food: true })
    );

    // A quick add is an explicit "log this once, do not keep it"; it must not
    // promote the row into the library.
    expect(foodRepository.updateFood).not.toHaveBeenCalled();
    expect(result).toEqual(existingFood);
  });

  it('should not refresh provider metadata when an existing food is found only by barcode', async () => {
    const existingFood = makeExistingFood({ provider_verified: false });
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.findFoodByBarcode.mockResolvedValue(existingFood);

    const result = await foodCoreService.createFood(
      TEST_USER_ID,
      makeFoodData({
        provider_type: undefined,
        provider_external_id: undefined,
        provider_verified: true,
      })
    );

    expect(foodRepository.findFoodByProviderExternalId).not.toHaveBeenCalled();
    expect(foodRepository.createFood).not.toHaveBeenCalled();
    expect(foodRepository.updateFood).not.toHaveBeenCalled();
    expect(result).toEqual(existingFood);
  });
  // Regression: re-importing a provider food that was already saved (back when
  // the image was being dropped) short-circuited on the dedupe and returned the
  // image-less row, so the photo could never be recovered without deleting it.
  it('backfills the provider image onto an existing food that has none', async () => {
    const existingFood = makeExistingFood({ images: [] });
    // @ts-expect-error TS(2339): mock typing on the repository default export
    foodRepository.findFoodByBarcode.mockResolvedValue(existingFood);
    // updateFood downloads the remote image and returns the localized row.
    // @ts-expect-error TS(2339): mock typing on the repository default export
    foodRepository.updateFood.mockResolvedValue({
      ...existingFood,
      images: ['/uploads/foods/food-existing-456/f.jpg'],
    });

    const result = await foodCoreService.createFood(
      TEST_USER_ID,
      makeFoodData({ image_url: 'https://images.openfoodfacts.org/f.jpg' })
    );

    expect(foodRepository.updateFood).toHaveBeenCalledWith(
      existingFood.id,
      TEST_USER_ID,
      { images: ['https://images.openfoodfacts.org/f.jpg'] }
    );
    // The caller must see the localized path, not the provider URL it sent in.
    expect(result).toEqual({
      ...existingFood,
      images: ['/uploads/foods/food-existing-456/f.jpg'],
    });
  });

  it('backfills added sugars and fruit/veg percent supplied by a re-import', async () => {
    const existingFood = makeExistingFood();
    // @ts-expect-error TS(2339): mock typing on the repository default export
    foodRepository.findFoodByBarcode.mockResolvedValue(existingFood);

    await foodCoreService.createFood(
      TEST_USER_ID,
      makeFoodData({ added_sugars: 4.5, fruit_veg_legume_percent: 30 })
    );

    expect(foodRepository.backfillMissingComposition).toHaveBeenCalledWith(
      existingFood.id,
      TEST_USER_ID,
      expect.objectContaining({
        added_sugars: 4.5,
        fruit_veg_legume_percent: 30,
      })
    );
  });

  it('does not overwrite images the existing food already has', async () => {
    const existingFood = makeExistingFood({
      images: ['/uploads/foods/food-existing-456/mine.jpg'],
    });
    // @ts-expect-error TS(2339): mock typing on the repository default export
    foodRepository.findFoodByBarcode.mockResolvedValue(existingFood);

    const result = await foodCoreService.createFood(
      TEST_USER_ID,
      makeFoodData({ image_url: 'https://images.openfoodfacts.org/f.jpg' })
    );

    expect(foodRepository.updateFood).not.toHaveBeenCalled();
    expect(result).toEqual(existingFood);
  });

  it('should create a new food when barcode does not exist for user', async () => {
    const newFood = makeExistingFood({ id: 'food-new-789' });
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.createFood.mockResolvedValue(newFood);
    const foodData = makeFoodData();
    const result = await foodCoreService.createFood(TEST_USER_ID, foodData);
    expect(foodRepository.findFoodByBarcode).toHaveBeenCalledWith(
      '3017620422003',
      TEST_USER_ID
    );
    expect(foodRepository.createFood).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Test Food',
        brand: 'Test Brand',
        barcode: '3017620422003',
        glycemic_index: null,
        custom_nutrients: {},
      })
    );
    expect(result).toEqual(newFood);
  });
  it('should skip barcode check and create food when no barcode provided', async () => {
    const newFood = makeExistingFood({ id: 'food-new-101' });
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.createFood.mockResolvedValue(newFood);
    const foodData = makeFoodData({ barcode: undefined });
    const result = await foodCoreService.createFood(TEST_USER_ID, foodData);
    expect(foodRepository.findFoodByBarcode).not.toHaveBeenCalled();
    expect(foodRepository.createFood).toHaveBeenCalled();
    expect(result).toEqual(newFood);
  });
  it('should sanitize custom_nutrients by stripping empty values', async () => {
    const newFood = makeExistingFood({ id: 'food-new-202' });
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.createFood.mockResolvedValue(newFood);
    const foodData = makeFoodData({
      custom_nutrients: { fiber: '2g', empty: '', blank: null, valid: '5mg' },
    });
    await foodCoreService.createFood(TEST_USER_ID, foodData);
    expect(foodRepository.createFood).toHaveBeenCalledWith(
      expect.objectContaining({
        custom_nutrients: { fiber: '2g', valid: '5mg' },
      })
    );
  });
  it('should coerce glycemic_index 0 to null', async () => {
    const newFood = makeExistingFood({ id: 'food-new-303' });
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.createFood.mockResolvedValue(newFood);
    const foodData = makeFoodData({ glycemic_index: 0 });
    await foodCoreService.createFood(TEST_USER_ID, foodData);
    // glycemic_index uses `|| null`, so falsy values (0, "", false) become null
    expect(foodRepository.createFood).toHaveBeenCalledWith(
      expect.objectContaining({ glycemic_index: null })
    );
  });
  it('should pass through a truthy glycemic_index value', async () => {
    const newFood = makeExistingFood({ id: 'food-new-404' });
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.createFood.mockResolvedValue(newFood);
    const foodData = makeFoodData({ glycemic_index: 55 });
    await foodCoreService.createFood(TEST_USER_ID, foodData);
    expect(foodRepository.createFood).toHaveBeenCalledWith(
      expect.objectContaining({ glycemic_index: 55 })
    );
  });
  it('should propagate errors from the repository', async () => {
    // @ts-expect-error TS(2339): Property 'mockRejectedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.findFoodByBarcode.mockRejectedValue(
      new Error('Database error')
    );
    await expect(
      foodCoreService.createFood(TEST_USER_ID, makeFoodData())
    ).rejects.toThrow('Database error');
  });
});

describe('foodCoreService.searchFoods provider metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error mocked in test
    preferenceService.getUserPreferences.mockResolvedValue({
      item_display_limit: 10,
    });
  });

  it('returns recent and top local foods without refreshing provider metadata during search', async () => {
    const recentFood = makeExistingFood({
      id: 'recent-yazio',
      provider_type: 'yazio',
      provider_external_id: 'yazio-recent',
      provider_verified: false,
    });
    const topFood = makeExistingFood({
      id: 'top-yazio',
      provider_type: 'yazio',
      provider_external_id: 'yazio-top',
      provider_verified: false,
    });
    // @ts-expect-error mocked in test
    foodRepository.getRecentFoods.mockResolvedValue([recentFood]);
    // @ts-expect-error mocked in test
    foodRepository.getTopFoods.mockResolvedValue([topFood]);

    const result = await foodCoreService.searchFoods(
      TEST_USER_ID,
      undefined,
      TEST_USER_ID,
      false,
      false,
      false,
      10
    );

    expect(foodRepository.updateFood).not.toHaveBeenCalled();
    expect(result.recentFoods[0]).toMatchObject(recentFood);
    expect(result.topFoods[0]).toMatchObject(topFood);
  });

  it('returns search results without refreshing provider metadata during search', async () => {
    const localFood = makeExistingFood({
      id: 'local-yazio',
      provider_type: 'yazio',
      provider_external_id: 'yazio-local',
      provider_verified: false,
    });
    // @ts-expect-error mocked in test
    foodRepository.searchFoods.mockResolvedValue([localFood]);

    const result = await foodCoreService.searchFoods(
      TEST_USER_ID,
      'local',
      TEST_USER_ID,
      false,
      true,
      false,
      10
    );

    expect(foodRepository.updateFood).not.toHaveBeenCalled();
    expect(result.searchResults[0]).toMatchObject(localFood);
  });

  // Regression: the search limit used to read `food_display_limit`, a column
  // renamed to `item_display_limit` by migration 20250720201800. That read was
  // always undefined, so the preference was ignored and the request's own
  // number won every time. The two must not be equal here, or the assertion
  // can't tell the preference from the fallback.
  it('honours the item_display_limit preference over the request limit', async () => {
    // @ts-expect-error mocked in test
    preferenceService.getUserPreferences.mockResolvedValue({
      item_display_limit: 25,
    });
    // @ts-expect-error mocked in test
    foodRepository.searchFoods.mockResolvedValue([]);

    await foodCoreService.searchFoods(
      TEST_USER_ID,
      'local',
      TEST_USER_ID,
      false,
      true,
      false,
      10
    );

    expect(foodRepository.searchFoods).toHaveBeenCalledWith(
      'local',
      TEST_USER_ID,
      false,
      true,
      false,
      25
    );
  });

  it('falls back to the request limit when no preference is set', async () => {
    // @ts-expect-error mocked in test
    preferenceService.getUserPreferences.mockResolvedValue(null);
    // @ts-expect-error mocked in test
    foodRepository.searchFoods.mockResolvedValue([]);

    await foodCoreService.searchFoods(
      TEST_USER_ID,
      'local',
      TEST_USER_ID,
      false,
      true,
      false,
      10
    );

    expect(foodRepository.searchFoods).toHaveBeenCalledWith(
      'local',
      TEST_USER_ID,
      false,
      true,
      false,
      10
    );
  });
});

describe('foodCoreService.updateFood', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not overwrite shared_with_public when only updating name and brand', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.getFoodOwnerId.mockResolvedValue(TEST_USER_ID);
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.updateFood.mockResolvedValue({
      id: 'food-123',
      name: 'Updated Name',
      brand: 'Updated Brand',
      shared_with_public: true,
    });

    await foodCoreService.updateFood(TEST_USER_ID, 'food-123', {
      name: 'Updated Name',
      brand: 'Updated Brand',
    });

    // @ts-expect-error TS(2339): Property 'mock' does not exist on type '(id: any, ... Remove this comment to see the full error message
    const passedData = foodRepository.updateFood.mock.calls[0][2];
    expect(passedData.shared_with_public).toBeUndefined();
  });

  it('should pass through shared_with_public when explicitly provided', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.getFoodOwnerId.mockResolvedValue(TEST_USER_ID);
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.updateFood.mockResolvedValue({
      id: 'food-123',
      shared_with_public: false,
    });

    await foodCoreService.updateFood(TEST_USER_ID, 'food-123', {
      shared_with_public: false,
    });

    // @ts-expect-error TS(2339): Property 'mock' does not exist on type '(id: any, ... Remove this comment to see the full error message
    const passedData = foodRepository.updateFood.mock.calls[0][2];
    expect(passedData.shared_with_public).toBe(false);
  });
});

describe('foodCoreService.deleteFoodVariant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully delete a food variant if authenticated user owns the parent food', async () => {
    const variant = { id: 'variant-789', food_id: 'food-456' };
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.getFoodVariantById.mockResolvedValue(variant);
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.getFoodOwnerId.mockResolvedValue(TEST_USER_ID);
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.deleteFoodVariant.mockResolvedValue(true);

    const result = await foodCoreService.deleteFoodVariant(
      TEST_USER_ID,
      'variant-789'
    );

    expect(foodRepository.getFoodVariantById).toHaveBeenCalledWith(
      'variant-789',
      TEST_USER_ID
    );
    expect(foodRepository.getFoodOwnerId).toHaveBeenCalledWith(
      'food-456',
      TEST_USER_ID
    );
    expect(foodRepository.deleteFoodVariant).toHaveBeenCalledWith(
      'variant-789',
      TEST_USER_ID
    );
    expect(result).toBe(true);
  });

  it('should throw an error if variant is not found', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.getFoodVariantById.mockResolvedValue(null);

    await expect(
      foodCoreService.deleteFoodVariant(TEST_USER_ID, 'variant-789')
    ).rejects.toThrow('Food variant not found.');
  });

  it('should throw an error if parent food is not found', async () => {
    const variant = { id: 'variant-789', food_id: 'food-456' };
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.getFoodVariantById.mockResolvedValue(variant);
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.getFoodOwnerId.mockResolvedValue(null);

    await expect(
      foodCoreService.deleteFoodVariant(TEST_USER_ID, 'variant-789')
    ).rejects.toThrow('Associated food not found.');
  });

  it('should throw a Forbidden error if user does not own the parent food', async () => {
    const variant = { id: 'variant-789', food_id: 'food-456' };
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.getFoodVariantById.mockResolvedValue(variant);
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.getFoodOwnerId.mockResolvedValue('another-user-123');

    await expect(
      foodCoreService.deleteFoodVariant(TEST_USER_ID, 'variant-789')
    ).rejects.toThrow(
      'Forbidden: You do not have permission to delete this food variant.'
    );
  });
});

describe('updateFoodVariant custom_nutrients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(foodRepository.getFoodVariantById).mockResolvedValue({
      id: 'variant-1',
      food_id: 'food-1',
      serving_size: 100,
      serving_unit: 'g',
    } as never);
    vi.mocked(foodRepository.getFoodOwnerId).mockResolvedValue(
      'user-1' as never
    );
    vi.mocked(foodRepository.updateFoodVariant).mockResolvedValue({
      id: 'variant-1',
    } as never);
  });

  it('leaves stored custom nutrients alone when the update omits them', async () => {
    await foodCoreService.updateFoodVariant('user-1', 'variant-1', {
      food_id: 'food-1',
      calories: 100,
    } as never);

    const sent = vi.mocked(foodRepository.updateFoodVariant).mock.calls[0][1];
    expect(sent.custom_nutrients).toBeUndefined();
  });

  it('saves custom nutrients when the update includes them', async () => {
    await foodCoreService.updateFoodVariant('user-1', 'variant-1', {
      food_id: 'food-1',
      custom_nutrients: { Zinc: 3, Iron: '' },
    } as never);

    const sent = vi.mocked(foodRepository.updateFoodVariant).mock.calls[0][1];
    expect(sent.custom_nutrients).toEqual({ Zinc: 3 });
  });
});

describe('foodCoreService provenance trust boundary', () => {
  const FORGED_GRADE = 'a';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(foodRepository.findFoodByBarcode).mockResolvedValue(null);
    vi.mocked(foodRepository.findFoodByProviderExternalId).mockResolvedValue(
      null
    );
    vi.mocked(foodRepository.createFood).mockResolvedValue(
      makeExistingFood({ id: 'food-new' }) as never
    );
    vi.mocked(fetchProviderFoodDetails).mockResolvedValue(OFF_RESPONSE);
  });

  const createdFood = () =>
    vi.mocked(foodRepository.createFood).mock.calls[0][0];

  it('stores the grade Open Food Facts reports, not the one the client sent', async () => {
    await foodCoreService.createFood(
      TEST_USER_ID,
      makeFoodData({ provider_nutriscore_grade: FORGED_GRADE })
    );

    expect(createdFood()).toMatchObject({
      provider_type: 'openfoodfacts',
      provider_nutriscore_grade: 'c',
      nutri_score_category: 'beverage',
    });
  });

  it('keeps the category the user chose over the one Open Food Facts derives', async () => {
    await foodCoreService.createFood(
      TEST_USER_ID,
      makeFoodData({ nutri_score_category: 'general' })
    );

    expect(createdFood().nutri_score_category).toBe('general');
  });

  it('saves a plain custom food when Open Food Facts cannot confirm the claim', async () => {
    vi.mocked(fetchProviderFoodDetails).mockResolvedValue(null);

    await foodCoreService.createFood(
      TEST_USER_ID,
      makeFoodData({ provider_nutriscore_grade: FORGED_GRADE })
    );

    const saved = createdFood();
    expect(saved.provider_nutriscore_grade).toBeUndefined();
    expect(saved.provider_type).toBeNull();
    expect(saved.provider_external_id).toBeNull();
  });

  it('saves a plain custom food when the Open Food Facts lookup fails', async () => {
    vi.mocked(fetchProviderFoodDetails).mockRejectedValue(new Error('down'));

    await foodCoreService.createFood(
      TEST_USER_ID,
      makeFoodData({ provider_nutriscore_grade: FORGED_GRADE })
    );

    expect(createdFood().provider_type).toBeNull();
    expect(createdFood().provider_nutriscore_grade).toBeUndefined();
  });

  it('never stores a client grade on a food from another provider', async () => {
    await foodCoreService.createFood(
      TEST_USER_ID,
      makeFoodData({
        provider_type: 'usda',
        provider_nutriscore_grade: FORGED_GRADE,
      })
    );

    expect(fetchProviderFoodDetails).not.toHaveBeenCalled();
    expect(createdFood().provider_nutriscore_grade).toBeUndefined();
  });

  it('ignores a forged grade and provider_type on update', async () => {
    vi.mocked(foodRepository.getFoodOwnerId).mockResolvedValue(
      TEST_USER_ID as never
    );
    vi.mocked(foodRepository.updateFood).mockResolvedValue({
      id: 'food-1',
    } as never);

    await foodCoreService.updateFood(TEST_USER_ID, 'food-1', {
      name: 'Renamed',
      nutri_score_category: 'fat_oil_nut',
      provider_type: 'openfoodfacts',
      provider_nutriscore_grade: FORGED_GRADE,
    } as never);

    const sent = vi.mocked(foodRepository.updateFood).mock.calls[0][2];
    expect(sent).not.toHaveProperty('provider_nutriscore_grade');
    expect(sent).not.toHaveProperty('provider_type');
    expect(sent).toMatchObject({
      name: 'Renamed',
      nutri_score_category: 'fat_oil_nut',
    });
  });

  it('drops provider_type from bulk CSV rows', async () => {
    vi.mocked(foodRepository.createFoodsInBulk).mockResolvedValue({} as never);

    await foodCoreService.importFoodsInBulk(TEST_USER_ID, [
      {
        name: 'Row',
        serving_size: 100,
        serving_unit: 'g',
        provider_type: 'openfoodfacts',
        provider_nutriscore_grade: FORGED_GRADE,
      },
    ] as never);

    const [, rows] = vi.mocked(foodRepository.createFoodsInBulk).mock.calls[0];
    expect(rows[0]).not.toHaveProperty('provider_type');
  });
});
