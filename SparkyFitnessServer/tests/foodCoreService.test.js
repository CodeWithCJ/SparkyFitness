jest.mock('../models/foodRepository');
jest.mock('../config/logging', () => ({ log: jest.fn() }));

const foodRepository = require('../models/foodRepository');
const foodCoreService = require('../services/foodCoreService');

const TEST_USER_ID = 'user-123';

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
    jest.clearAllMocks();
  });

  it('should return existing food when barcode already exists for user', async () => {
    const existingFood = makeExistingFood();
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
    expect(result).toEqual(existingFood);
  });

  it('should create a new food when barcode does not exist for user', async () => {
    const newFood = makeExistingFood({ id: 'food-new-789' });
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
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
    foodRepository.createFood.mockResolvedValue(newFood);

    const foodData = makeFoodData({ barcode: undefined });
    const result = await foodCoreService.createFood(TEST_USER_ID, foodData);

    expect(foodRepository.findFoodByBarcode).not.toHaveBeenCalled();
    expect(foodRepository.createFood).toHaveBeenCalled();
    expect(result).toEqual(newFood);
  });

  it('should sanitize custom_nutrients by stripping empty values', async () => {
    const newFood = makeExistingFood({ id: 'food-new-202' });
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
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
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
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
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
    foodRepository.createFood.mockResolvedValue(newFood);

    const foodData = makeFoodData({ glycemic_index: 55 });
    await foodCoreService.createFood(TEST_USER_ID, foodData);

    expect(foodRepository.createFood).toHaveBeenCalledWith(
      expect.objectContaining({ glycemic_index: 55 })
    );
  });

  it('should propagate errors from the repository', async () => {
    foodRepository.findFoodByBarcode.mockRejectedValue(
      new Error('Database error')
    );

    await expect(
      foodCoreService.createFood(TEST_USER_ID, makeFoodData())
    ).rejects.toThrow('Database error');
  });
});

describe('foodCoreService.updateFood', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not overwrite shared_with_public when only updating name and brand', async () => {
    foodRepository.getFoodOwnerId.mockResolvedValue(TEST_USER_ID);
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

    const passedData = foodRepository.updateFood.mock.calls[0][2];
    expect(passedData.shared_with_public).toBeUndefined();
  });

  it('should pass through shared_with_public when explicitly provided', async () => {
    foodRepository.getFoodOwnerId.mockResolvedValue(TEST_USER_ID);
    foodRepository.updateFood.mockResolvedValue({
      id: 'food-123',
      shared_with_public: false,
    });

    await foodCoreService.updateFood(TEST_USER_ID, 'food-123', {
      shared_with_public: false,
    });

    const passedData = foodRepository.updateFood.mock.calls[0][2];
    expect(passedData.shared_with_public).toBe(false);
  });
});
