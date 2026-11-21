import type {
  FoodProviderAdapter,
  ProviderCallContext,
} from '../foodProviders/types.js';
import type { ProviderSearchResult } from '../../services/externalFoodSearchService.js';
import { providerFetchJson } from '../foodProviders/httpClient.js';
import {
  buildPer100gFood,
  buildSearchSummaryFood,
} from '../foodProviders/per100gMapper.js';
import { detailCache } from '../foodProviders/detailCache.js';
import type {
  MappedProviderFood,
  StandardNutrientField,
  PortionMeasure,
} from '../foodProviders/per100gMapper.js';

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
  let trimmed = providerBaseUrl.trim().replace(/\/+$/, '');
  if (
    trimmed === 'https://food-info.org' ||
    trimmed === 'http://food-info.org'
  ) {
    trimmed = 'https://api.food-info.org';
  }
  if (!trimmed.includes('/api/v1')) {
    trimmed = `${trimmed}/api/v1`;
  }
  return trimmed;
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

const ENRICH_COUNT = 5;
const ENRICH_CONCURRENCY = 3;

export async function searchFoodInfo(
  ctx: ProviderCallContext,
  query: string,
  page: number = 1,
  pageSize: number = 20
): Promise<ProviderSearchResult> {
  if (!query || !query.trim()) {
    return {
      foods: [],
      pagination: {
        page,
        pageSize,
        totalCount: 0,
        hasMore: false,
      },
    };
  }

  const baseUrl = resolveBaseUrl(ctx.credentials?.base_url);
  const headers = resolveHeaders(ctx.credentials?.app_key);
  const encodedQuery = encodeURIComponent(query.trim());

  const results = await providerFetchJson<FoodInfoSearchItem[]>(
    `${baseUrl}/foods/search?q=${encodedQuery}&limit=${pageSize}`,
    { providerType: 'food-info', headers, signal: ctx.signal }
  );

  const items = Array.isArray(results) ? results : [];
  const topItems = items.slice(0, ENRICH_COUNT);
  const restItems = items.slice(ENRICH_COUNT);

  const enrichedTop: MappedProviderFood[] = [];
  for (let i = 0; i < topItems.length; i += ENRICH_CONCURRENCY) {
    const chunk = topItems.slice(i, i + ENRICH_CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map(async (item) => {
        const idStr = String(item.id);
        const cached = detailCache.get<MappedProviderFood>('food-info', idStr);
        if (cached) return cached;
        try {
          const detail = await getFoodInfoDetails(ctx, idStr);
          if (detail) return detail;
        } catch {
          // Fall back to summary on error
        }
        return buildSearchSummaryFood({
          providerType: 'food-info',
          externalId: idStr,
          name: item.description,
          brand: null,
        });
      })
    );
    enrichedTop.push(...chunkResults);
  }

  const restFoods = restItems.map((item) => {
    const idStr = String(item.id);
    const cached = detailCache.get<MappedProviderFood>('food-info', idStr);
    if (cached) return cached;
    return buildSearchSummaryFood({
      providerType: 'food-info',
      externalId: idStr,
      name: item.description,
      brand: null,
    });
  });

  const foods = [...enrichedTop, ...restFoods];
  const hasMore = items.length === pageSize;

  return {
    foods,
    pagination: {
      page,
      pageSize,
      totalCount: foods.length,
      hasMore,
    },
  };
}

export async function getFoodInfoDetails(
  ctx: ProviderCallContext,
  externalId: string
): Promise<MappedProviderFood | null> {
  if (!externalId) {
    throw new Error('External ID is required for Food Info details.');
  }

  const cached = detailCache.get<MappedProviderFood>('food-info', externalId);
  if (cached) {
    return cached;
  }

  const baseUrl = resolveBaseUrl(ctx.credentials?.base_url);
  const headers = resolveHeaders(ctx.credentials?.app_key);

  const panel = await providerFetchJson<FoodInfoPanelResponse>(
    `${baseUrl}/foods/${encodeURIComponent(externalId)}/panel`,
    { providerType: 'food-info', headers, signal: ctx.signal }
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
