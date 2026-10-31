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

describe('NorishService worked-out nutrition', () => {
  const service = new NorishService(
    'https://norish.example.com/api/v1',
    'test-api-key'
  );
  const recipe = (overrides: Partial<NorishRecipe> = {}): NorishRecipe => ({
    id: 'uuid-456',
    name: 'Insalata di mare',
    servings: 6,
    systemUsed: 'metric',
    createdAt: '2026-10-24T12:00:00Z',
    updatedAt: '2026-10-24T12:00:00Z',
    categories: [],
    version: 1,
    recipeIngredients: [],
    steps: [],
    calories: null,
    fat: null,
    carbs: null,
    protein: null,
    ...overrides,
  });
  const workedOut = {
    source: 'worked-out' as const,
    perServing: {
      calories: 390.588,
      fat: 19.4504,
      carbs: 4.7496,
      protein: 48.8754,
    },
    estimated: true,
  };
  const json = (body: unknown, status = 200) =>
    ({
      ok: status < 400,
      status,
      statusText: status < 400 ? 'OK' : 'Not Found',
      json: async () => body,
      text: async () => JSON.stringify(body),
    }) as any;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('maps the worked-out total of a recipe that states no nutrition', () => {
    const result = service.mapNorishRecipeToSparkyFood(
      recipe({ nutrition: workedOut }),
      'user-123'
    );

    expect(result.variant.calories).toBe(391);
    expect(result.variant.fat).toBe(19.5);
    expect(result.variant.carbs).toBe(4.7);
    expect(result.variant.protein).toBe(48.9);
  });

  it('uses the worked-out total where the stored values are not numbers', () => {
    const result = service.mapNorishRecipeToSparkyFood(
      recipe({ fat: 'N/A', nutrition: workedOut }),
      'user-123'
    );

    expect(result.variant.calories).toBe(391);
    expect(result.variant.fat).toBe(19.5);
  });

  it('keeps a stored value written with its unit', () => {
    const result = service.mapNorishRecipeToSparkyFood(
      recipe({ fat: '12g', nutrition: workedOut }),
      'user-123'
    );

    expect(result.variant.fat).toBe(12);
    expect(result.variant.calories).toBe(0);
  });

  it('ignores a nutrition answer whose numbers are not finite', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json(recipe({ id: 'odd' })))
      .mockResolvedValueOnce(
        json({
          ...workedOut,
          perServing: { ...workedOut.perServing, calories: 'Infinity' },
        })
      );

    expect((await service.getRecipeDetails('odd'))?.nutrition).toBeNull();
  });

  it('returns the recipe without nutrition when Norish is too slow to give it', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json(recipe({ id: 'slow' })))
      .mockRejectedValueOnce(
        new DOMException('The operation timed out.', 'TimeoutError')
      );

    const details = await service.getRecipeDetails('slow');

    expect(vi.mocked(fetch).mock.lastCall?.[1]?.signal).toBeInstanceOf(
      AbortSignal
    );
    expect(details?.id).toBe('slow');
    expect(details?.nutrition).toBeNull();
  });

  it('keeps the stored values when the recipe states them', () => {
    const result = service.mapNorishRecipeToSparkyFood(
      recipe({ calories: 520, fat: '9.00', nutrition: workedOut }),
      'user-123'
    );

    expect(result.variant.calories).toBe(520);
    expect(result.variant.fat).toBe(9);
    expect(result.variant.protein).toBe(0);
  });

  it('asks Norish for the nutrition of every recipe, stated or not, for the other nutrients', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json(recipe({ id: 'empty' })))
      .mockResolvedValueOnce(json(workedOut));

    const empty = await service.getRecipeDetails('empty');

    expect(fetch).toHaveBeenLastCalledWith(
      'https://norish.example.com/api/v1/recipes/empty/nutrition',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ 'x-api-key': 'test-api-key' }),
      })
    );
    expect(empty?.nutrition).toEqual(workedOut);
  });

  it('maps the other nutrients Norish knows onto the variant, leaving the unknown at 0', () => {
    const result = service.mapNorishRecipeToSparkyFood(
      recipe({
        calories: 560,
        fat: '12.00',
        nutrition: {
          source: 'supplied',
          estimated: false,
          perServing: {
            calories: 560,
            fat: 12,
            carbs: 88,
            protein: 22,
            extras: {
              fiber: 11.04,
              sugars: 4,
              saturatedFat: 1.8,
              sodium: 420,
              vitaminA: 12.5,
            },
          },
        },
      }),
      'user-123'
    );

    expect(result.variant).toMatchObject({
      dietary_fiber: 11,
      sugars: 4,
      saturated_fat: 1.8,
      sodium: 420,
      vitamin_a: 12.5,
      potassium: 0,
      iron: 0,
    });
  });

  it('imports at zero when Norish has no nutrition endpoint', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json(recipe({ id: 'older' })))
      .mockResolvedValueOnce(json({ message: 'Not found' }, 404));

    const details = await service.getRecipeDetails('older');

    expect(details?.nutrition).toBeNull();
    expect(
      service.mapNorishRecipeToSparkyFood(details!, 'user-123').variant.calories
    ).toBe(0);
  });
});
