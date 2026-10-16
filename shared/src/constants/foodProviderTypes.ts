// Single source of truth for the external food providers the app can
// search, imported from, and refresh against.
//
// This list is intentionally code-level, not derived from the
// `external_provider_types` table: every entry here requires a hand-written
// `case` in `SparkyFitnessServer/services/externalFoodSearchService.ts#searchProviderFoods`.
// Adding a food-category row to the database does NOT make it searchable, so
// deriving from the table would advertise providers that fail at call time.
//
// Legacy `nutritionix` is excluded: it still appears on older food rows but
// has no active backend import/search path.
export const FOOD_PROVIDER_TYPES = [
  'openfoodfacts',
  'usda',
  'fatsecret',
  'mealie',
  'tandoor',
  'yazio',
  'norish',
  'swissfood',
  'canadian-nutrient-file',
  'livsmedelsverket',
] as const;

export type FoodProviderType = (typeof FOOD_PROVIDER_TYPES)[number];

export interface FoodProviderMetadata {
  id: FoodProviderType;
  displayName: string;
  isPublic: boolean;
  needsDetailFetch: boolean;
  supportsBarcode: boolean;
  supportsBulkImport: boolean;
  supportedLanguages?: readonly string[];
  defaultLanguage?: string;
  licenseName?: string;
  licenseUrl?: string;
  attributionText?: string;
}

export const FOOD_PROVIDER_REGISTRY: Record<
  FoodProviderType,
  FoodProviderMetadata
> = {
  openfoodfacts: {
    id: 'openfoodfacts',
    displayName: 'Open Food Facts',
    isPublic: true,
    needsDetailFetch: false,
    supportsBarcode: true,
    supportsBulkImport: false,
    licenseName: 'Open Database License (ODbL)',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/',
    attributionText: 'Open Food Facts',
  },
  usda: {
    id: 'usda',
    displayName: 'USDA FoodData Central',
    isPublic: false,
    needsDetailFetch: true,
    supportsBarcode: true,
    supportsBulkImport: false,
  },
  fatsecret: {
    id: 'fatsecret',
    displayName: 'FatSecret',
    isPublic: false,
    needsDetailFetch: true,
    supportsBarcode: true,
    supportsBulkImport: false,
  },
  mealie: {
    id: 'mealie',
    displayName: 'Mealie',
    isPublic: false,
    needsDetailFetch: false,
    supportsBarcode: false,
    supportsBulkImport: false,
  },
  tandoor: {
    id: 'tandoor',
    displayName: 'Tandoor',
    isPublic: false,
    needsDetailFetch: false,
    supportsBarcode: false,
    supportsBulkImport: false,
  },
  yazio: {
    id: 'yazio',
    displayName: 'YAZIO',
    isPublic: false,
    needsDetailFetch: true,
    supportsBarcode: false,
    supportsBulkImport: false,
  },
  norish: {
    id: 'norish',
    displayName: 'Norish',
    isPublic: false,
    needsDetailFetch: false,
    supportsBarcode: false,
    supportsBulkImport: false,
  },
  swissfood: {
    id: 'swissfood',
    displayName: 'Swiss Food Composition Database',
    isPublic: true,
    needsDetailFetch: true,
    supportsBarcode: false,
    supportsBulkImport: false,
    supportedLanguages: ['en', 'de', 'fr', 'it'],
    defaultLanguage: 'en',
    attributionText:
      'Swiss Food Composition Database (Federal Food Safety and Veterinary Office FSVO)',
  },
  'canadian-nutrient-file': {
    id: 'canadian-nutrient-file',
    displayName: 'Canadian Nutrient File',
    isPublic: true,
    needsDetailFetch: true,
    supportsBarcode: false,
    supportsBulkImport: true,
    supportedLanguages: ['en', 'fr'],
    defaultLanguage: 'en',
    licenseName: 'Open Government Licence - Canada',
    licenseUrl: 'https://open.canada.ca/en/open-government-licence-canada',
    attributionText: 'Health Canada, Canadian Nutrient File',
  },
  livsmedelsverket: {
    id: 'livsmedelsverket',
    displayName: 'Swedish Food Agency (Livsmedelsverket)',
    isPublic: true,
    needsDetailFetch: true,
    supportsBarcode: false,
    supportsBulkImport: true,
    supportedLanguages: ['sv', 'en'],
    defaultLanguage: 'sv',
    licenseName: 'Creative Commons Attribution 4.0 (CC BY 4.0)',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attributionText: 'Swedish Food Agency (Livsmedelsverket)',
  },
};

export function isPublicFoodProvider(
  providerType: string | null | undefined
): boolean {
  if (!providerType) return false;
  const meta = FOOD_PROVIDER_REGISTRY[providerType as FoodProviderType];
  return meta?.isPublic ?? false;
}

export function foodProviderNeedsDetailFetch(
  providerType: string | null | undefined
): boolean {
  if (!providerType) return false;
  const meta = FOOD_PROVIDER_REGISTRY[providerType as FoodProviderType];
  return meta?.needsDetailFetch ?? false;
}

export function getFoodProviderMetadata(
  providerType: string | null | undefined
): FoodProviderMetadata | undefined {
  if (!providerType) return undefined;
  return FOOD_PROVIDER_REGISTRY[providerType as FoodProviderType];
}
