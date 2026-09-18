import { vi, beforeEach, describe, expect, it } from 'vitest';
import MealieService from '../integrations/mealie/mealieService.js';
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));
describe('MealieService.mapMealieRecipeToSparkyFood', () => {
  const service = new MealieService(
    'http://mealie.example.com',
    'fake-api-key'
  );
  const userId = 'user-123';
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('should map a multi-serving recipe to a one-serving variant', () => {
    const mockRecipe = {
      name: 'Multi-Serving Recipe',
      slug: 'multi-serving-recipe',
      recipeServings: 2,
      recipeYield: '2 portions',
      nutrition: {
        calories: 586,
        proteinContent: 24.6,
        carbohydrateContent: 61.77,
        fatContent: 27.73,
      },
    };

    const result = service.mapMealieRecipeToSparkyFood(mockRecipe, userId);

    expect(result.variant.serving_size).toBe(1);
    expect(result.variant.serving_unit).toBe('serving');
    expect(result.variant.calories).toBe(586);
    expect(result.variant.protein).toBe(24.6);
    expect(result.variant.carbs).toBe(61.77);
    expect(result.variant.fat).toBe(27.73);
  });
  it('should use the same serving when the recipe has no yield information', () => {
    const result = service.mapMealieRecipeToSparkyFood(
      {
        name: 'Single Serving Recipe',
        slug: 'single-serving-recipe',
        nutrition: { calories: '250' },
      },
      userId
    );

    expect(result.variant.serving_size).toBe(1);
    expect(result.variant.serving_unit).toBe('serving');
    expect(result.variant.calories).toBe(250);
  });
});
