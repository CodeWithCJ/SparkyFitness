import {
  createFoodEntryMeal,
  fetchFoodEntryMealsByDate,
  updateFoodEntryMeal,
  getFoodEntryMealWithComponents,
  deleteFoodEntryMeal,
} from '../../src/services/api/foodEntryMealsApi';
import { getActiveServerConfig, ServerConfig } from '../../src/services/storage';

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
  proxyHeadersToRecord: jest.requireActual('../../src/services/storage').proxyHeadersToRecord,
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<
  typeof getActiveServerConfig
>;

describe('foodEntryMealsApi', () => {
  const mockFetch = jest.fn();
  const testConfig: ServerConfig = {
    id: 'test-id',
    url: 'https://example.com',
    apiKey: 'test-api-key-12345',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = mockFetch;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetActiveServerConfig.mockResolvedValue(testConfig);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('createFoodEntryMeal sends POST with payload', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'fem-1' }),
    });

    const payload = {
      meal_template_id: 'tpl-1',
      meal_type: 'lunch',
      meal_type_id: 'mt-1',
      entry_date: '2026-05-15',
      name: 'My Meal',
      quantity: 1,
      unit: 'serving',
    };

    const result = await createFoodEntryMeal(payload);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/api/food-entry-meals',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-api-key-12345',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(payload),
      }),
    );
    expect(result).toEqual({ id: 'fem-1' });
  });

  test('fetchFoodEntryMealsByDate sends GET to by-date route', async () => {
    const expected = [{ id: 'fem-1', name: 'My Meal', foods: [] }];
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(expected),
    });

    const result = await fetchFoodEntryMealsByDate('2026-05-15');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/api/food-entry-meals/by-date/2026-05-15',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result).toEqual(expected);
  });

  test('updateFoodEntryMeal sends PUT with payload to /:id', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'fem-1' }),
    });

    const payload = {
      name: 'Updated',
      meal_type: 'dinner',
      meal_type_id: 'mt-2',
      entry_date: '2026-05-16',
      quantity: 2,
      unit: 'serving',
      meal_template_id: 'tpl-1',
      foods: [
        {
          food_id: 'food-1',
          variant_id: 'var-1',
          quantity: 100,
          unit: 'g',
        },
      ],
    };

    await updateFoodEntryMeal('fem-1', payload);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/api/food-entry-meals/fem-1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    );
  });

  test('getFoodEntryMealWithComponents sends GET', async () => {
    const expected = { id: 'fem-1', foods: [] };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(expected),
    });

    const result = await getFoodEntryMealWithComponents('fem-1');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/api/food-entry-meals/fem-1',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result).toEqual(expected);
  });

  test('deleteFoodEntryMeal sends DELETE', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      headers: { get: () => '0' },
    });

    await deleteFoodEntryMeal('fem-1');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/api/food-entry-meals/fem-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
