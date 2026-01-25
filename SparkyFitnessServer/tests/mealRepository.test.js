const mealRepository = require('../models/mealRepository');
const { v4: uuidv4 } = require('uuid');

// Mock the poolManager.getClient function
jest.mock('../db/poolManager', () => ({
  getClient: jest.fn(),
}));

const { getClient } = require('../db/poolManager');

describe('mealRepository', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    getClient.mockResolvedValue(mockClient);
    mockClient.query.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // --- Meal Template CRUD Operations ---

  describe('createMeal', () => {
    it('should create a new meal and its associated foods', async () => {
      const userId = uuidv4();
      const mealId = uuidv4();
      const foodId1 = uuidv4();
      const foodId2 = uuidv4();
      const variantId1 = uuidv4();
      const variantId2 = uuidv4();

      const mealData = {
        user_id: userId,
        name: 'Test Meal',
        description: 'A delicious test meal',
        is_public: false,
        foods: [
          { food_id: foodId1, variant_id: variantId1, quantity: 100, unit: 'g' },
          { food_id: foodId2, variant_id: variantId2, quantity: 200, unit: 'ml' },
        ],
      };

      mockClient.query
        .mockResolvedValueOnce({}) // For BEGIN
        .mockResolvedValueOnce({ rows: [{ id: mealId, user_id: userId, name: 'Test Meal', description: 'A delicious test meal', is_public: false, serving_size: undefined, serving_unit: undefined }] }) // For meal creation
        .mockResolvedValueOnce({ rows: [{ id: uuidv4() }] }) // For meal_foods batch insert
        .mockResolvedValueOnce({}); // For COMMIT

      const result = await mealRepository.createMeal(mealData);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO meals'),
        [mealData.user_id, mealData.name, mealData.description, mealData.is_public, undefined, undefined]
      );
      // pg-format creates a single formatted string, not array parameters
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringMatching(/INSERT INTO meal_foods.*VALUES/)
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(result).toEqual({ id: mealId, user_id: userId, name: 'Test Meal', description: 'A delicious test meal', is_public: false, serving_size: undefined, serving_unit: undefined });
    });

    it('should rollback transaction on error', async () => {
      const mealData = {
        user_id: uuidv4(),
        name: 'Error Meal',
        foods: [{ food_id: uuidv4(), quantity: 1, unit: 'ea' }],
      };

      mockClient.query.mockImplementation((sql) => {
        if (sql.includes('INSERT INTO meals')) {
          throw new Error('Database error');
        }
        return { rows: [] };
      });

      await expect(mealRepository.createMeal(mealData)).rejects.toThrow('Database error');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('getMeals', () => {
    it('should return all meals for a user', async () => {
      const userId = uuidv4();
      const mealId1 = uuidv4();
      const mealId2 = uuidv4();
      const mockMeals = [
        { id: mealId1, user_id: userId, name: 'Meal 1', is_public: false },
        { id: mealId2, user_id: userId, name: 'Meal 2', is_public: true },
      ];
      mockClient.query
        .mockResolvedValueOnce({ rows: mockMeals }) // For meals query
        .mockResolvedValueOnce({ rows: [] }) // For meal_foods query for first meal
        .mockResolvedValueOnce({ rows: [] }); // For meal_foods query for second meal

      const result = await mealRepository.getMeals(userId, 'all');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('AND (user_id = $1 OR is_public = TRUE)'),
        [userId]
      );
      expect(result).toEqual([
        { ...mockMeals[0], foods: [] },
        { ...mockMeals[1], foods: [] }
      ]);
    });

    it('should return public meals when filter is all', async () => {
      const userId = uuidv4();
      const mealId1 = uuidv4();
      const mealId2 = uuidv4();
      const mockMeals = [
        { id: mealId1, user_id: userId, name: 'Meal 1', is_public: false },
        { id: mealId2, user_id: uuidv4(), name: 'Public Meal', is_public: true },
      ];
      mockClient.query
        .mockResolvedValueOnce({ rows: mockMeals }) // For meals query
        .mockResolvedValueOnce({ rows: [] }) // For meal_foods query for first meal
        .mockResolvedValueOnce({ rows: [] }); // For meal_foods query for second meal

      const result = await mealRepository.getMeals(userId, 'all');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('AND (user_id = $1 OR is_public = TRUE)'),
        [userId]
      );
      expect(result).toEqual([
        { ...mockMeals[0], foods: [] },
        { ...mockMeals[1], foods: [] }
      ]);
    });
  });

  describe('getMealById', () => {
    it('should return a meal with its foods', async () => {
      const mealId = uuidv4();
      const userId = uuidv4();
      const mockMeal = { id: mealId, name: 'Single Meal', user_id: userId };
      const mockMealFoods = [
        { id: uuidv4(), meal_id: mealId, food_id: uuidv4(), food_name: 'Food A' },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: [mockMeal] })
        .mockResolvedValueOnce({ rows: mockMealFoods });

      const result = await mealRepository.getMealById(mealId, userId);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM meals WHERE id = $1'),
        [mealId]
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM meal_foods mf'),
        [mealId]
      );
      expect(result).toEqual({ ...mockMeal, foods: mockMealFoods });
    });

    it('should return undefined if meal not found', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      const result = await mealRepository.getMealById(uuidv4(), uuidv4());
      expect(result).toBeUndefined();
    });
  });

  describe('updateMeal', () => {
    it('should update a meal and its associated foods', async () => {
      const mealId = uuidv4();
      const userId = uuidv4();
      const foodId1 = uuidv4();
      const foodId2 = uuidv4();

      const updateData = {
        name: 'Updated Meal',
        description: 'New description',
        is_public: true,
        foods: [
          { food_id: foodId1, quantity: 150, unit: 'g' },
          { food_id: foodId2, quantity: 250, unit: 'ml' },
        ],
      };

      mockClient.query
        .mockResolvedValueOnce({}) // For BEGIN
        .mockResolvedValueOnce({ rows: [{ id: mealId, user_id: userId, name: 'Updated Meal', description: 'New description', is_public: true, serving_size: undefined, serving_unit: undefined }] }) // For meal update
        .mockResolvedValueOnce({ rowCount: 1 }) // For deleting old meal_foods
        .mockResolvedValueOnce({ rows: [{ id: uuidv4() }] }) // For new meal_foods batch insert
        .mockResolvedValueOnce({}); // For COMMIT

      const result = await mealRepository.updateMeal(mealId, userId, updateData);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE meals SET'),
        [updateData.name, updateData.description, updateData.is_public, undefined, undefined, mealId]
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        'DELETE FROM meal_foods WHERE meal_id = $1',
        [mealId]
      );
      // pg-format creates a single formatted string, not array parameters
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringMatching(/INSERT INTO meal_foods.*VALUES/)
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(result).toEqual({ id: mealId, user_id: userId, name: 'Updated Meal', description: 'New description', is_public: true, serving_size: undefined, serving_unit: undefined });
    });

    it('should update meal details without changing foods if foods array is not provided', async () => {
      const mealId = uuidv4();
      const userId = uuidv4();
      const updateData = {
        name: 'Updated Meal Only',
        description: 'Only description changed',
      };

      mockClient.query
        .mockResolvedValueOnce({}) // For BEGIN
        .mockResolvedValueOnce({ rows: [{ id: mealId, user_id: userId, name: 'Updated Meal Only', description: 'Only description changed', is_public: false, serving_size: undefined, serving_unit: undefined }] }) // For meal update
        .mockResolvedValueOnce({}); // For COMMIT

      const result = await mealRepository.updateMeal(mealId, userId, updateData);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE meals SET'),
        [updateData.name, updateData.description, undefined, undefined, undefined, mealId]
      );
      expect(mockClient.query).not.toHaveBeenCalledWith(expect.stringContaining('DELETE FROM meal_foods'));
      expect(mockClient.query).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO meal_foods'));
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(result).toEqual({ id: mealId, user_id: userId, name: 'Updated Meal Only', description: 'Only description changed', is_public: false, serving_size: undefined, serving_unit: undefined });
    });

    it('should rollback transaction on error', async () => {
      const mealId = uuidv4();
      const userId = uuidv4();
      const updateData = { name: 'Error Update' };

      mockClient.query.mockImplementation((sql) => {
        if (sql.includes('UPDATE meals')) {
          throw new Error('Database error during update');
        }
        return { rows: [] };
      });

      await expect(mealRepository.updateMeal(mealId, userId, updateData)).rejects.toThrow('Database error during update');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('deleteMeal', () => {
    it('should delete a meal', async () => {
      const mealId = uuidv4();
      const userId = uuidv4();
      mockClient.query
        .mockResolvedValueOnce({}) // For BEGIN
        .mockResolvedValueOnce({ rowCount: 1 }) // For DELETE
        .mockResolvedValueOnce({}); // For COMMIT

      const result = await mealRepository.deleteMeal(mealId, userId);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        'DELETE FROM meals WHERE id = $1 RETURNING id',
        [mealId]
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(result).toBe(true);
    });

    it('should return false if meal not found', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // For BEGIN
        .mockResolvedValueOnce({ rowCount: 0 }) // For DELETE
        .mockResolvedValueOnce({}); // For COMMIT

      const result = await mealRepository.deleteMeal(uuidv4(), uuidv4());
      expect(result).toBe(false);
    });

    it('should rollback transaction on error', async () => {
      mockClient.query.mockImplementation((sql) => {
        if (sql.includes('DELETE FROM meals')) {
          throw new Error('Database error during delete');
        }
        return { rows: [] };
      });

      await expect(mealRepository.deleteMeal(uuidv4(), uuidv4())).rejects.toThrow('Database error during delete');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  // --- Meal Plan CRUD Operations ---

  describe('createMealPlanEntry', () => {
    it('should create a new meal plan entry', async () => {
      const userId = uuidv4();
      const mealId = uuidv4();
      const mealTypeId = uuidv4();
      const planData = {
        user_id: userId,
        meal_id: mealId,
        plan_date: '2024-07-15',
        meal_type: 'breakfast',
        is_template: false,
      };
      const mockResult = { id: uuidv4(), ...planData, meal_type_id: mealTypeId };

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: mealTypeId }] }) // For meal_types lookup
        .mockResolvedValueOnce({ rows: [mockResult] }); // For INSERT

      const result = await mealRepository.createMealPlanEntry(planData);
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT id FROM meal_types WHERE LOWER(name) = LOWER($1)',
        ['breakfast']
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO meal_plans'),
        [
          planData.user_id, planData.meal_id, undefined, undefined,
          undefined, undefined, planData.plan_date, mealTypeId,
          planData.is_template, undefined, undefined, undefined
        ]
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('getMealPlanEntries', () => {
    it('should return meal plan entries for a user within a date range', async () => {
      const userId = uuidv4();
      const startDate = '2024-07-01';
      const endDate = '2024-07-31';
      const mockEntries = [
        { id: uuidv4(), user_id: userId, plan_date: '2024-07-10', meal_type: 'lunch' },
      ];
      mockClient.query.mockResolvedValue({ rows: mockEntries });

      const result = await mealRepository.getMealPlanEntries(userId, startDate, endDate);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE mp.plan_date BETWEEN $1 AND $2'),
        [startDate, endDate]
      );
      expect(result).toEqual(mockEntries);
    });
  });

  describe('updateMealPlanEntry', () => {
    it('should update a meal plan entry', async () => {
      const planId = uuidv4();
      const userId = uuidv4();
      const mealTypeId = uuidv4();
      const updateData = {
        meal_type: 'dinner',
        quantity: 2,
      };
      const mockResult = { id: planId, user_id: userId, meal_type: 'dinner', quantity: 2, meal_type_id: mealTypeId };

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: mealTypeId }] }) // For meal_types lookup
        .mockResolvedValueOnce({ rows: [mockResult] }); // For UPDATE

      const result = await mealRepository.updateMealPlanEntry(planId, userId, updateData);
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT id FROM meal_types WHERE LOWER(name) = LOWER($1)',
        ['dinner']
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE meal_plans SET'),
        [
          undefined, undefined, undefined,
          updateData.quantity, undefined, undefined, mealTypeId,
          undefined, undefined, undefined, undefined,
          planId
        ]
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('deleteMealPlanEntry', () => {
    it('should delete a meal plan entry', async () => {
      const planId = uuidv4();
      const userId = uuidv4();
      mockClient.query.mockResolvedValue({ rowCount: 1 });

      const result = await mealRepository.deleteMealPlanEntry(planId, userId);
      expect(mockClient.query).toHaveBeenCalledWith(
        'DELETE FROM meal_plans WHERE id = $1 RETURNING id',
        [planId]
      );
      expect(result).toBe(true);
    });

    it('should return false if meal plan entry not found', async () => {
      mockClient.query.mockResolvedValue({ rowCount: 0 });
      const result = await mealRepository.deleteMealPlanEntry(uuidv4(), uuidv4());
      expect(result).toBe(false);
    });
  });

  // --- Helper for logging meal plan to food entries ---

  describe('createFoodEntryFromMealPlan', () => {
    it('should create a food entry from meal plan data', async () => {
      const mealTypeId = uuidv4();
      const entryData = {
        user_id: uuidv4(),
        food_id: uuidv4(),
        meal_type: 'lunch',
        quantity: 1,
        unit: 'serving',
        entry_date: '2024-07-15',
        variant_id: uuidv4(),
        meal_plan_id: uuidv4(),
      };
      const mockResult = { id: uuidv4(), ...entryData, meal_type_id: mealTypeId };

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: mealTypeId }] }) // For meal_types lookup
        .mockResolvedValueOnce({ rows: [mockResult] }); // For INSERT

      const result = await mealRepository.createFoodEntryFromMealPlan(entryData);
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT id FROM meal_types WHERE LOWER(name) = LOWER($1)',
        ['lunch']
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO food_entries'),
        [
          entryData.user_id, entryData.food_id, mealTypeId, entryData.quantity,
          entryData.unit, entryData.entry_date, entryData.variant_id, entryData.meal_plan_id
        ]
      );
      expect(result).toEqual(mockResult);
    });
  });
});