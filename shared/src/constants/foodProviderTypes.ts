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
  'cooktool',
  'nutrientgraph',
  'food-info',
] as const;

export type FoodProviderType = (typeof FOOD_PROVIDER_TYPES)[number];

export type FoodProviderCredentials =
  'none' | 'api_key' | 'app_id_and_key' | 'base_url_and_key' | 'custom';

export interface FoodProviderMetadata {
  id: FoodProviderType;
  displayName: string;
  shortName: string;
  credentials: FoodProviderCredentials;
  isPublic: boolean;
  needsDetailFetch: boolean;
  supportsBarcode: boolean;
  supportsBulkImport: boolean;
  pageSizeFromDisplayLimit?: boolean;
  allowsEmptyQuery?: boolean;
  portalUrl?: string;
  apiKeyUrl?: string;
  termsUrl?: string;
  foodPageUrl?: (food: {
    externalId?: string | null;
    barcode?: string | null;
    name?: string | null;
  }) => string | null;
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
    shortName: 'Open Food Facts',
    credentials: 'none',
    isPublic: true,
    needsDetailFetch: false,
    supportsBarcode: true,
    supportsBulkImport: false,
    portalUrl: 'https://world.openfoodfacts.org/',
    foodPageUrl: ({ barcode, externalId }) => {
      const code = barcode || externalId;
      return code ? `https://world.openfoodfacts.org/product/${code}` : null;
    },
    licenseName: 'Open Database License (ODbL)',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/',
    attributionText: 'Open Food Facts',
  },
  usda: {
    id: 'usda',
    displayName: 'USDA FoodData Central',
    shortName: 'USDA',
    credentials: 'api_key',
    isPublic: false,
    needsDetailFetch: true,
    supportsBarcode: true,
    supportsBulkImport: false,
    pageSizeFromDisplayLimit: true,
    portalUrl: 'https://fdc.nal.usda.gov/api-guide.html',
    apiKeyUrl: 'https://fdc.nal.usda.gov/api-key-signup.html',
    foodPageUrl: ({ externalId }) =>
      externalId
        ? `https://fdc.nal.usda.gov/food-details/${externalId}/nutrients`
        : null,
  },
  fatsecret: {
    id: 'fatsecret',
    displayName: 'FatSecret',
    shortName: 'FatSecret',
    credentials: 'app_id_and_key',
    isPublic: false,
    needsDetailFetch: true,
    supportsBarcode: true,
    supportsBulkImport: false,
    portalUrl: 'https://platform.fatsecret.com',
    apiKeyUrl: 'https://platform.fatsecret.com',
  },
  mealie: {
    id: 'mealie',
    displayName: 'Mealie',
    shortName: 'Mealie',
    credentials: 'base_url_and_key',
    isPublic: false,
    needsDetailFetch: false,
    supportsBarcode: false,
    supportsBulkImport: false,
    allowsEmptyQuery: true,
  },
  tandoor: {
    id: 'tandoor',
    displayName: 'Tandoor',
    shortName: 'Tandoor',
    credentials: 'base_url_and_key',
    isPublic: false,
    needsDetailFetch: false,
    supportsBarcode: false,
    supportsBulkImport: false,
  },
  yazio: {
    id: 'yazio',
    displayName: 'YAZIO',
    shortName: 'Yazio',
    credentials: 'custom',
    isPublic: false,
    needsDetailFetch: true,
    supportsBarcode: true,
    supportsBulkImport: false,
    pageSizeFromDisplayLimit: true,
    portalUrl: 'https://github.com/saganos/yazio_public_api',
  },
  norish: {
    id: 'norish',
    displayName: 'Norish',
    shortName: 'Norish',
    credentials: 'base_url_and_key',
    isPublic: false,
    needsDetailFetch: false,
    supportsBarcode: false,
    supportsBulkImport: false,
  },
  swissfood: {
    id: 'swissfood',
    displayName: 'Swiss Food Composition Database',
    shortName: 'SwissFood',
    credentials: 'none',
    isPublic: true,
    needsDetailFetch: true,
    supportsBarcode: false,
    supportsBulkImport: false,
    portalUrl: 'https://www.naehrwertdaten.ch',
    supportedLanguages: ['en', 'de', 'fr', 'it'],
    defaultLanguage: 'en',
    attributionText:
      'Swiss Food Composition Database (Federal Food Safety and Veterinary Office FSVO)',
  },
  'canadian-nutrient-file': {
    id: 'canadian-nutrient-file',
    displayName: 'Canadian Nutrient File',
    shortName: 'Canadian Nutrient File',
    credentials: 'none',
    isPublic: true,
    needsDetailFetch: true,
    supportsBarcode: false,
    supportsBulkImport: true,
    portalUrl:
      'https://open.canada.ca/data/en/dataset/1b6139bd-ed7e-4043-bc28-ff00e10f3109',
    supportedLanguages: ['en', 'fr'],
    defaultLanguage: 'en',
    licenseName: 'Open Government Licence - Canada',
    licenseUrl: 'https://open.canada.ca/en/open-government-licence-canada',
    attributionText: 'Health Canada, Canadian Nutrient File',
  },
  livsmedelsverket: {
    id: 'livsmedelsverket',
    displayName: 'Swedish Food Agency (Livsmedelsverket)',
    shortName: 'Swedish Food Agency (Livsmedelsverket)',
    credentials: 'none',
    isPublic: true,
    needsDetailFetch: true,
    supportsBarcode: false,
    supportsBulkImport: true,
    portalUrl:
      'https://www.livsmedelsverket.se/en/about-us/open-data/food-composition-data/',
    foodPageUrl: ({ externalId, name }) => {
      if (!externalId) {
        return 'https://soknaringsinnehall.livsmedelsverket.se/';
      }
      const query = encodeURIComponent(name || '');
      return `https://soknaringsinnehall.livsmedelsverket.se/Home/FoodDetails/${externalId}?sokord=${query}&soktyp=1&kategoriId=`;
    },
    supportedLanguages: ['sv', 'en'],
    defaultLanguage: 'sv',
    licenseName: 'Creative Commons Attribution 4.0 (CC BY 4.0)',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attributionText: 'Swedish Food Agency (Livsmedelsverket)',
  },
  cooktool: {
    id: 'cooktool',
    displayName: 'CookTool',
    shortName: 'CookTool',
    isPublic: false,
    credentials: 'api_key',
    needsDetailFetch: true,
    supportsBarcode: true,
    supportsBulkImport: false,
    apiKeyUrl: 'https://api.cooktool.org/',
    portalUrl: 'https://api.cooktool.org/docs/reference',
  },
  nutrientgraph: {
    id: 'nutrientgraph',
    displayName: 'NutrientGraph',
    shortName: 'NutrientGraph',
    isPublic: false,
    credentials: 'api_key',
    needsDetailFetch: true,
    supportsBarcode: true,
    supportsBulkImport: false,
    supportedLanguages: ['en', 'fr', 'de', 'it', 'es'],
    defaultLanguage: 'en',
    apiKeyUrl: 'https://nutrientgraph.com/pricing/',
    termsUrl: 'https://nutrientgraph.com/legal/terms/',
    portalUrl: 'https://nutrientgraph.com/docs/',
  },
  'food-info': {
    id: 'food-info',
    displayName: 'Food Info',
    shortName: 'Food Info',
    isPublic: false,
    credentials: 'api_key',
    needsDetailFetch: true,
    supportsBarcode: false,
    supportsBulkImport: false,
    apiKeyUrl: 'https://food-info.org/developer',
    termsUrl: 'https://food-info.org/terms',
    portalUrl: 'https://food-info.org/developer',
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
