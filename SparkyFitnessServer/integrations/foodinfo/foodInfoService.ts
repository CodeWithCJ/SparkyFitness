import type {
  FoodProviderAdapter,
  ProviderSearchOptions,
  ProviderDetailOptions,
} from '../foodProviders/types.js';
import { providerFetchJson } from '../foodProviders/httpClient.js';
import { buildPer100gFood } from '../foodProviders/per100gMapper.js';
import { detailCache } from '../foodProviders/detailCache.js';
import type {
  MappedProviderFood,
  StandardNutrientField,
  PortionMeasure,
} from '../foodProviders/per100gMapper.js';
import type { FoodSearchItem } from '../../services/externalFoodSearchService.js';

export const FOODINFO_DEFAULT_BASE_URL = 'https://api.food-info.org/api/v1';

interface FoodInfoSearchItem {
  id: number;
  description: string;
  ndbNumber?: string | null;
}

interface FoodInfoServing {
  portionId?: number | null;
  label: string;
  gramWeight: number;
  milliliters?: number | null;
  massEstimated?: boolean;
}

interface FoodInfoNutrientRow {
  nutrientId: number;
  name: string;
  unit: string;
  amountPer100g?: number | null;
  amountPerServing?: number | null;
  percentDailyValue?: number | null;
  referenceAmount?: number | null;
}

interface FoodInfoNutrientGroup {
  name: string;
  sortOrder?: number;
  rows: FoodInfoNutrientRow[];
}

interface FoodInfoPanelResponse {
  foodId: number;
  description: string;
  foodCategory?: string | null;
  foodCategoryId?: number | null;
  ndbNumber?: string | null;
  dataType?: string | null;
  source?: string | null;
  serving?: FoodInfoServing | null;
  availableServings?: FoodInfoServing[];
  groups?: FoodInfoNutrientGroup[];
}

function resolveBaseUrl(providerBaseUrl?: string | null): string {
  if (!providerBaseUrl) return FOODINFO_DEFAULT_BASE_URL;
  return providerBaseUrl.trim().replace(/\/+$/, '');
}

function resolveHeaders(appKey?: string | null): Record<string, string> {
  if (!appKey) {
    throw new Error('Food Info requires an API key in provider credentials.');
  }
  return {
    'X-Api-Key': appKey.trim(),
  };
}

const NUTRIENT_ID_TO_STANDARD: Record<number, StandardNutrientField> = {
  1008: 'calories',
  208: 'calories',
  1003: 'protein',
  203: 'protein',
  1004: 'fat',
  204: 'fat',
  1005: 'carbs',
  205: 'carbs',
  1079: 'dietary_fiber',
  291: 'dietary_fiber',
  2000: 'sugars',
  269: 'sugars',
  212: 'sugars',
  1258: 'saturated_fat',
  606: 'saturated_fat',
  1292: 'monounsaturated_fat',
  645: 'monounsaturated_fat',
  1293: 'polyunsaturated_fat',
  646: 'polyunsaturated_fat',
  1257: 'trans_fat',
  605: 'trans_fat',
  1253: 'cholesterol',
  601: 'cholesterol',
  1093: 'sodium',
  307: 'sodium',
  1092: 'potassium',
  306: 'potassium',
  1087: 'calcium',
  301: 'calcium',
  1089: 'iron',
  303: 'iron',
  1106: 'vitamin_a',
  320: 'vitamin_a',
  1162: 'vitamin_c',
  401: 'vitamin_c',
  1051: 'water_ml',
  255: 'water_ml',
  1018: 'alcohol_g',
  221: 'alcohol_g',
  1057: 'caffeine_mg',
  262: 'caffeine_mg',
};

export async function searchFoodInfo(options: ProviderSearchOptions): Promise<{
  foods: FoodSearchItem[];
  totalCount?: number;
  hasMore?: boolean;
}> {
  const { query, provider, credentials, pageSize = 20, signal } = options;
  if (!query || !query.trim()) {
    return { foods: [], totalCount: 0, hasMore: false };
  }

  const baseUrl = resolveBaseUrl(provider?.base_url);
  const headers = resolveHeaders(credentials?.app_key ?? provider?.app_key);
  const encodedQuery = encodeURIComponent(query.trim());

  const results = await providerFetchJson<FoodInfoSearchItem[]>(
    `${baseUrl}/foods/search?q=${encodedQuery}&limit=${pageSize}`,
    { provider: 'food-info', headers, signal }
  );

  const items = Array.isArray(results) ? results : [];
  const foods: FoodSearchItem[] = items.map((item) => ({
    id: String(item.id),
    name: item.description,
    calories: undefined,
    serving_size: 100,
    serving_unit: 'g',
    is_partial: true,
  }));

  const hasMore = items.length === pageSize;

  return {
    foods,
    hasMore,
  };
}

export async function getFoodInfoDetails(
  options: ProviderDetailOptions
): Promise<MappedProviderFood> {
  const { externalId, provider, credentials, signal } = options;
  if (!externalId) {
    throw new Error('External ID is required for Food Info details.');
  }

  const cached = detailCache.get('food-info', externalId);
  if (cached) {
    return cached;
  }

  const baseUrl = resolveBaseUrl(provider?.base_url);
  const headers = resolveHeaders(credentials?.app_key ?? provider?.app_key);

  const panel = await providerFetchJson<FoodInfoPanelResponse>(
    `${baseUrl}/foods/${encodeURIComponent(externalId)}/panel`,
    { provider: 'food-info', headers, signal }
  );

  const per100g: Partial<Record<StandardNutrientField, number>> = {};
  const providerNutrients: Record<string, number> = {};
  const providerNutrientStandard: Record<string, string> = {};

  for (const group of panel.groups || []) {
    for (const row of group.rows || []) {
      const stdKey = NUTRIENT_ID_TO_STANDARD[row.nutrientId];
      if (
        stdKey &&
        per100g[stdKey] === undefined &&
        typeof row.amountPer100g === 'number' &&
        !isNaN(row.amountPer100g)
      ) {
        per100g[stdKey] = row.amountPer100g;
      }
      if (typeof row.amountPer100g === 'number' && !isNaN(row.amountPer100g)) {
        providerNutrients[row.name] = row.amountPer100g;
        if (row.unit) {
          providerNutrientStandard[row.name] = row.unit;
        }
      }
    }
  }

  const portions: PortionMeasure[] = [];
  const seenPortions = new Set<string>();

  for (const serving of panel.availableServings || []) {
    if (
      serving.gramWeight > 0 &&
      serving.label &&
      serving.label.toLowerCase() !== '100 g'
    ) {
      const labelKey = serving.label.toLowerCase();
      if (!seenPortions.has(labelKey)) {
        seenPortions.add(labelKey);
        portions.push({
          description: serving.label,
          grams: serving.gramWeight,
        });
      }
    }
  }

  const mapped = buildPer100gFood({
    providerType: 'food-info',
    externalId: String(panel.foodId || externalId),
    name: panel.description || 'Food Info Item',
    per100g,
    providerNutrients,
    providerNutrientStandard,
    portions,
  });

  detailCache.set('food-info', externalId, mapped);
  return mapped;
}

export const foodInfoAdapter: FoodProviderAdapter = {
  search: searchFoodInfo,
  getDetails: getFoodInfoDetails,
};
