import { vi, beforeEach, describe, expect, it } from 'vitest';
import NorishService, {
  NorishRecipe,
} from '../integrations/norish/norishService.js';

vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

describe('NorishService.mapNorishRecipeToSparkyFood', () => {
  const service = new NorishService(
    'https://norish.example.com/api/v1',
    'fake-api-key'
  );
  const userId = 'user-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should map a recipe with standard numeric string macronutrients', () => {
    const mockRecipe: NorishRecipe = {
      id: 'f3a478b8-4c91-49b4-8452-f67d64380e22',
      name: 'Norish Salad',
      description: 'A very healthy salad',
      url: 'https://example.com/salad',
      servings: 2,
      calories: 350,
      protein: '12g',
      carbs: '24.5g',
      fat: '8.2 g',
      systemUsed: 'metric',
      createdAt: '2026-06-06T12:00:00Z',
      updatedAt: '2026-06-06T12:00:00Z',
      categories: ['Lunch'],
      version: 1,
      recipeIngredients: [],
      steps: [],
    };

    const result = service.mapNorishRecipeToSparkyFood(mockRecipe, userId);

    expect(result.food.name).toBe(mockRecipe.name);
    expect(result.food.brand).toBe('example.com');
    expect(result.food.provider_external_id).toBe(mockRecipe.id);
    expect(result.food.provider_type).toBe('norish');
    expect(result.food.is_custom).toBe(true);

    expect(result.variant.calories).toBe(350);
    expect(result.variant.protein).toBe(12);
    expect(result.variant.carbs).toBe(24.5);
    expect(result.variant.fat).toBe(8.2);
    expect(result.variant.serving_size).toBe(1);
    expect(result.variant.serving_unit).toBe('serving');
  });

  it('should map a recipe with standard numeric float/integer macronutrients', () => {
    const mockRecipe: NorishRecipe = {
      id: 'f3a478b8-4c91-49b4-8452-f67d64380e22',
      name: 'Norish Salad',
      description: 'A very healthy salad',
      url: 'https://example.com/salad',
      servings: 2,
      calories: 350,
      protein: 12,
      carbs: 24.5,
      fat: 8.2,
      systemUsed: 'metric',
      createdAt: '2026-06-06T12:00:00Z',
      updatedAt: '2026-06-06T12:00:00Z',
      categories: ['Lunch'],
      version: 1,
      recipeIngredients: [],
      steps: [],
    };

    const result = service.mapNorishRecipeToSparkyFood(mockRecipe, userId);

    expect(result.variant.calories).toBe(350);
    expect(result.variant.protein).toBe(12);
    expect(result.variant.carbs).toBe(24.5);
    expect(result.variant.fat).toBe(8.2);
  });

  it('should handle null and invalid values gracefully', () => {
    const mockRecipe: NorishRecipe = {
      id: 'f3a478b8-4c91-49b4-8452-f67d64380e22',
      name: 'Plain Recipe',
      servings: 1,
      calories: null,
      protein: null,
      carbs: 'N/A',
      fat: undefined,
      systemUsed: 'us',
      createdAt: '2026-06-06T12:00:00Z',
      updatedAt: '2026-06-06T12:00:00Z',
      categories: [],
      version: 1,
      recipeIngredients: [],
      steps: [],
    };

    const result = service.mapNorishRecipeToSparkyFood(mockRecipe, userId);

    expect(result.variant.calories).toBe(0);
    expect(result.variant.protein).toBe(0);
    expect(result.variant.carbs).toBe(0);
    expect(result.variant.fat).toBe(0);
  });
});

describe('NorishService API requests', () => {
  const service = new NorishService(
    'https://norish.example.com/api/v1',
    'test-api-key'
  );

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('should successfully search recipes with POST request', async () => {
    const mockRecipes: NorishRecipe[] = [
      {
        id: '1',
        name: 'Chicken Rice',
        servings: 4,
        systemUsed: 'metric',
        createdAt: '2026-06-06T12:00:00Z',
        updatedAt: '2026-06-06T12:00:00Z',
        categories: [],
        version: 1,
        recipeIngredients: [],
        steps: [],
      },
    ];

    const mockResponse = {
      ok: true,
      json: async () => ({ recipes: mockRecipes }),
      status: 200,
      statusText: 'OK',
    };

    vi.mocked(fetch).mockResolvedValue(mockResponse as any);

    const results = await service.searchRecipes('chicken');

    expect(fetch).toHaveBeenCalledWith(
      'https://norish.example.com/api/v1/recipes/search',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'test-api-key',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          search: 'chicken',
          limit: 10,
          cursor: 0,
        }),
      })
    );
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Chicken Rice');
  });

  it('should successfully retrieve recipe details with GET request', async () => {
    const mockRecipe: NorishRecipe = {
      id: 'uuid-123',
      name: 'Chicken Rice',
      servings: 4,
      systemUsed: 'metric',
      createdAt: '2026-06-06T12:00:00Z',
      updatedAt: '2026-06-06T12:00:00Z',
      categories: [],
      version: 1,
      recipeIngredients: [],
      steps: [],
    };

    const mockResponse = {
      ok: true,
      json: async () => mockRecipe,
      status: 200,
      statusText: 'OK',
    };

    vi.mocked(fetch).mockResolvedValue(mockResponse as any);

    const result = await service.getRecipeDetails('uuid-123');

    expect(fetch).toHaveBeenCalledWith(
      'https://norish.example.com/api/v1/recipes/uuid-123',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'x-api-key': 'test-api-key',
        }),
      })
    );
    expect(result).not.toBeNull();
    expect(result?.name).toBe('Chicken Rice');
  });
});
