import { apiFetch } from './apiClient';
import type { ExternalFoodItem } from '../../types/externalFoods';

interface OpenFoodFactsProduct {
  product_name: string;
  brands?: string;
  serving_quantity?: number;
  nutriments: {
    'energy-kcal_100g'?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
    'saturated-fat_100g'?: number;
    sodium_100g?: number;
    fiber_100g?: number;
    sugars_100g?: number;
  };
  code: string;
}

interface OpenFoodFactsResponse {
  count: number;
  page: number;
  page_count: number;
  page_size: number;
  products: OpenFoodFactsProduct[];
  skip: number;
}

export function transformOpenFoodFactsProduct(product: OpenFoodFactsProduct): ExternalFoodItem {
  const n = product.nutriments;
  return {
    id: product.code,
    name: product.product_name,
    brand: product.brands || null,
    calories: Math.round(n['energy-kcal_100g'] ?? 0),
    protein: Math.round(n.proteins_100g ?? 0),
    carbs: Math.round(n.carbohydrates_100g ?? 0),
    fat: Math.round(n.fat_100g ?? 0),
    saturated_fat: Math.round(n['saturated-fat_100g'] ?? 0),
    sodium: Math.round((n.sodium_100g ?? 0) * 1000),
    fiber: Math.round(n.fiber_100g ?? 0),
    sugars: Math.round(n.sugars_100g ?? 0),
    serving_size: 100,
    serving_unit: 'g',
    source: 'openfoodfacts',
  };
}

export async function searchOpenFoodFacts(query: string): Promise<ExternalFoodItem[]> {
  const params = new URLSearchParams({ query });
  const response = await apiFetch<OpenFoodFactsResponse>({
    endpoint: `/api/foods/openfoodfacts/search?${params.toString()}`,
    serviceName: 'External Food Search',
    operation: 'search OpenFoodFacts',
  });

  return response.products
    .filter((p) => p.product_name)
    .map(transformOpenFoodFactsProduct);
}

// --- USDA FoodData Central ---

interface UsdaFoodNutrient {
  nutrientId: number;
  nutrientName: string;
  unitName: string;
  value: number;
}

interface UsdaFoodSearchItem {
  fdcId: number;
  description: string;
  brandOwner?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  foodNutrients: UsdaFoodNutrient[];
}

interface UsdaFoodSearchResponse {
  foods: UsdaFoodSearchItem[];
}

const USDA_NUTRIENT_IDS = {
  ENERGY: 1008,
  PROTEIN: 1003,
  FAT: 1004,
  CARBS: 1005,
  SUGARS: 2000,
  SODIUM: 1093,
  FIBER: 1079,
  SATURATED_FAT: 1258,
} as const;

function getUsdaNutrientValue(nutrients: UsdaFoodNutrient[], nutrientId: number): number {
  return nutrients.find((n) => n.nutrientId === nutrientId)?.value ?? 0;
}

export function transformUsdaFoodItem(item: UsdaFoodSearchItem): ExternalFoodItem {
  const n = item.foodNutrients;
  return {
    id: String(item.fdcId),
    name: item.description,
    brand: item.brandOwner || null,
    calories: Math.round(getUsdaNutrientValue(n, USDA_NUTRIENT_IDS.ENERGY)),
    protein: Math.round(getUsdaNutrientValue(n, USDA_NUTRIENT_IDS.PROTEIN)),
    carbs: Math.round(getUsdaNutrientValue(n, USDA_NUTRIENT_IDS.CARBS)),
    fat: Math.round(getUsdaNutrientValue(n, USDA_NUTRIENT_IDS.FAT)),
    saturated_fat: Math.round(getUsdaNutrientValue(n, USDA_NUTRIENT_IDS.SATURATED_FAT)),
    sodium: Math.round(getUsdaNutrientValue(n, USDA_NUTRIENT_IDS.SODIUM)),
    fiber: Math.round(getUsdaNutrientValue(n, USDA_NUTRIENT_IDS.FIBER)),
    sugars: Math.round(getUsdaNutrientValue(n, USDA_NUTRIENT_IDS.SUGARS)),
    serving_size: 100,
    serving_unit: 'g',
    source: 'usda',
  };
}

export async function searchUsda(query: string, providerId: string): Promise<ExternalFoodItem[]> {
  const params = new URLSearchParams({ query });
  const response = await apiFetch<UsdaFoodSearchResponse>({
    endpoint: `/api/foods/usda/search?${params.toString()}`,
    serviceName: 'External Food Search',
    operation: 'search USDA',
    headers: { 'x-provider-id': providerId },
  });

  return response.foods
    .filter((item) => item.description)
    .map(transformUsdaFoodItem);
}

// --- FatSecret ---

interface FatSecretSearchFood {
  food_id: string;
  food_name: string;
  food_description: string;
}

interface FatSecretSearchResponse {
  foods?: { food?: FatSecretSearchFood | FatSecretSearchFood[] };
}

interface FatSecretServing {
  serving_id: string;
  serving_description: string;
  measurement_description: string;
  metric_serving_amount?: string;
  metric_serving_unit?: string;
  calories: string;
  protein: string;
  carbohydrate: string;
  fat: string;
  saturated_fat?: string;
  sodium?: string;
  fiber?: string;
  sugar?: string;
}

interface FatSecretNutrientsResponse {
  food: {
    food_id: string;
    food_name: string;
    servings: { serving: FatSecretServing | FatSecretServing[] };
  };
}

export function parseFatSecretDescription(description: string): {
  calories: number;
  fat: number;
  carbs: number;
  protein: number;
  servingSize: number;
  servingUnit: string;
} {
  const caloriesMatch = description.match(/Calories:\s*([\d.]+)/i);
  const fatMatch = description.match(/Fat:\s*([\d.]+)/i);
  const carbsMatch = description.match(/Carbs:\s*([\d.]+)/i);
  const proteinMatch = description.match(/Protein:\s*([\d.]+)/i);
  const servingMatch = description.match(/Per\s+([\d.]+)\s*(\w+)/i);

  return {
    calories: caloriesMatch ? Math.round(parseFloat(caloriesMatch[1])) : 0,
    fat: fatMatch ? Math.round(parseFloat(fatMatch[1])) : 0,
    carbs: carbsMatch ? Math.round(parseFloat(carbsMatch[1])) : 0,
    protein: proteinMatch ? Math.round(parseFloat(proteinMatch[1])) : 0,
    servingSize: servingMatch ? Math.round(parseFloat(servingMatch[1])) : 100,
    servingUnit: servingMatch ? servingMatch[2] : 'g',
  };
}

export function transformFatSecretSearchItem(item: FatSecretSearchFood): ExternalFoodItem {
  const parsed = parseFatSecretDescription(item.food_description);
  return {
    id: item.food_id,
    name: item.food_name,
    brand: null,
    calories: parsed.calories,
    protein: parsed.protein,
    carbs: parsed.carbs,
    fat: parsed.fat,
    serving_size: parsed.servingSize,
    serving_unit: parsed.servingUnit,
    source: 'fatsecret',
  };
}

export function selectFatSecretServing(servings: FatSecretServing[]): FatSecretServing {
  const preferred = servings.find((s) =>
    s.measurement_description.toLowerCase().includes('serving'),
  );
  return preferred ?? servings[0];
}

export async function searchFatSecret(query: string, providerId: string): Promise<ExternalFoodItem[]> {
  const params = new URLSearchParams({ query });
  const response = await apiFetch<FatSecretSearchResponse>({
    endpoint: `/api/foods/fatsecret/search?${params.toString()}`,
    serviceName: 'External Food Search',
    operation: 'search FatSecret',
    headers: { 'x-provider-id': providerId },
  });

  const rawFood = response.foods?.food;
  const foods = rawFood == null ? [] : Array.isArray(rawFood) ? rawFood : [rawFood];

  return foods
    .filter((item) => item.food_name)
    .map(transformFatSecretSearchItem);
}

export async function fetchFatSecretNutrients(foodId: string, providerId: string): Promise<ExternalFoodItem> {
  const params = new URLSearchParams({ foodId });
  const response = await apiFetch<FatSecretNutrientsResponse>({
    endpoint: `/api/foods/fatsecret/nutrients?${params.toString()}`,
    serviceName: 'External Food Search',
    operation: 'fetch FatSecret nutrients',
    headers: { 'x-provider-id': providerId },
  });

  const rawServings = response.food.servings.serving;
  const servings = Array.isArray(rawServings) ? rawServings : [rawServings];
  const serving = selectFatSecretServing(servings);

  return {
    id: response.food.food_id,
    name: response.food.food_name,
    brand: null,
    calories: Math.round(parseFloat(serving.calories)),
    protein: Math.round(parseFloat(serving.protein)),
    carbs: Math.round(parseFloat(serving.carbohydrate)),
    fat: Math.round(parseFloat(serving.fat)),
    saturated_fat: Math.round(parseFloat(serving.saturated_fat ?? '0')),
    sodium: Math.round(parseFloat(serving.sodium ?? '0')),
    fiber: Math.round(parseFloat(serving.fiber ?? '0')),
    sugars: Math.round(parseFloat(serving.sugar ?? '0')),
    serving_size: Math.round(parseFloat(serving.metric_serving_amount ?? '100')),
    serving_unit: serving.metric_serving_unit ?? 'g',
    source: 'fatsecret',
  };
}
