import type { FoodProviderType } from '@workspace/shared';
import type { FoodProviderAdapter } from './types.js';
import {
  legacyOpenFoodFactsAdapter,
  legacyUsdaAdapter,
  legacyFatSecretAdapter,
  legacyMealieAdapter,
  legacyTandoorAdapter,
  legacyNorishAdapter,
  legacyYazioAdapter,
  legacySwissFoodAdapter,
  legacyCanadianNutrientFileAdapter,
  legacyLivsmedelsverketAdapter,
} from './legacyAdapters.js';
import { cooktoolAdapter } from '../cooktool/cooktoolService.js';

export const FOOD_PROVIDER_ADAPTERS: Record<
  FoodProviderType,
  FoodProviderAdapter
> = {
  openfoodfacts: legacyOpenFoodFactsAdapter,
  usda: legacyUsdaAdapter,
  fatsecret: legacyFatSecretAdapter,
  mealie: legacyMealieAdapter,
  tandoor: legacyTandoorAdapter,
  yazio: legacyYazioAdapter,
  norish: legacyNorishAdapter,
  swissfood: legacySwissFoodAdapter,
  'canadian-nutrient-file': legacyCanadianNutrientFileAdapter,
  livsmedelsverket: legacyLivsmedelsverketAdapter,
  cooktool: cooktoolAdapter,
};

export function getFoodProviderAdapter(
  providerType: string | null | undefined
): FoodProviderAdapter | undefined {
  if (!providerType) return undefined;
  return FOOD_PROVIDER_ADAPTERS[providerType as FoodProviderType];
}
