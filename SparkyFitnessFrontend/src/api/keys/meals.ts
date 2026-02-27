import { MealFilter } from '@/api/Foods/meals';
import { FoodFilter } from '@/api/Foods/foodService';

export const mealKeys = {
  all: ['meals'] as const,
  one: (mealId: string) => [...mealKeys.all, mealId] as const,
  filter: (filter: MealFilter, searchTerm?: string) =>
    [...mealKeys.all, 'filter', filter, searchTerm] as const,
  impact: (mealId: string) => [...mealKeys.one(mealId), 'impact'] as const,
};
export const foodKeys = {
  all: ['foods'] as const,
  one: (foodId: string) => [...foodKeys.all, foodId] as const,
  impact: (foodId: string) => [...foodKeys.one(foodId), 'impact'] as const,
  lists: () => [...foodKeys.all, 'list'] as const,
  list: (
    searchTerm: string,
    filter: FoodFilter,
    page: number,
    limit: number,
    sort: string
  ) =>
    [...foodKeys.lists(), { searchTerm, filter, page, limit, sort }] as const,
  recentTop: (limit: number, mealType?: string) =>
    [...foodKeys.all, 'recentTop', limit, mealType] as const,
  databaseSearch: (term: string, limit: number, mealType?: string) =>
    [...foodKeys.all, 'search', term, limit, mealType] as const,
};

export const providerKeys = {
  all: ['foodProvider'] as const,
  one: (query: string, providerId: string) =>
    [...providerKeys.all, providerId, query] as const,
};

export const mealPlanKeys = {
  all: (userId: string) => [userId, 'mealplan'] as const,
};

export const customNutrientsKeys = {
  all: ['customNutrients'] as const,
  one: (id: string) => [...customNutrientsKeys.all, id] as const,
};

export const fatSecretKeys = {
  all: ['fatsecret'] as const,
  search: (query: string, providerId: string) =>
    [...fatSecretKeys.all, 'search', query, providerId] as const,
  nutrients: (foodId: string, providerId: string) =>
    [...fatSecretKeys.all, 'nutrients', foodId, providerId] as const,
};

export const nutritionixKeys = {
  all: ['nutritionix'] as const,
  search: (query: string, providerId: string | null) =>
    [...nutritionixKeys.all, 'search', query, providerId] as const,
  naturalNutrients: (query: string, providerId: string | null) =>
    [
      ...nutritionixKeys.all,
      'nutrients',
      'natural',
      query,
      providerId,
    ] as const,
  brandedNutrients: (nixItemId: string, providerId: string | null) =>
    [
      ...nutritionixKeys.all,
      'nutrients',
      'branded',
      nixItemId,
      providerId,
    ] as const,
};

export const usdaKeys = {
  all: ['usda'] as const,
  search: (query: string, providerId: string, limit: number) =>
    [...usdaKeys.all, 'search', query, providerId, limit] as const,
  details: (fdcId: number, providerId: string) =>
    [...usdaKeys.all, 'details', fdcId, providerId] as const,
};
export const foodVariantKeys = {
  all: [...foodKeys.all, 'variants'] as const,
  byFood: (foodId: string) => [...foodKeys.all, 'variants', foodId] as const,
};
export const openFoodFactsKeys = {
  all: ['openfoodfacts'] as const,
  search: (query: string) =>
    [...openFoodFactsKeys.all, 'search', query] as const,
  barcode: (barcode: string) =>
    [...openFoodFactsKeys.all, 'barcode', barcode] as const,
};
