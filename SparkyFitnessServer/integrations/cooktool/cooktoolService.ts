import type {
  FoodProviderAdapter,
  ProviderCallContext,
} from '../foodProviders/types.js';
import type { ProviderSearchResult } from '../../services/externalFoodSearchService.js';
import { providerFetchJson } from '../foodProviders/httpClient.js';
import {
  buildPer100gFood,
  buildSearchSummaryFood,
  hasCoreNutrition,
} from '../foodProviders/per100gMapper.js';
import {
  detailCache,
  resolveCacheScope,
} from '../foodProviders/detailCache.js';
import { normalizeNutrientUnit } from '@workspace/shared';
import { COOKTOOL_USDA_NUTRIENT_NAMES } from './cooktoolNutrients.js';
import type {
  MappedProviderFood,
  StandardNutrientField,
} from '../foodProviders/per100gMapper.js';

export const COOKTOOL_DEFAULT_BASE_URL = 'https://api.cooktool.org/api/v1';

interface CookToolIngredientSearchItem {
  id: number;
  name: string;
  category_id?: number | null;
  data_type?: string;
}

interface CookToolNutrientRow {
  nutrient_nbr: number;
  amount_per_100g: number;
  unit_name?: string;
  source_code?: string;
}

interface CookToolNutrientResponse {
  ingredient_id: number;
  ingredient_name: string;
  country: string;
  nutrient_count: number;
  nutrients: CookToolNutrientRow[];
}

function resolveBaseUrl(providerBaseUrl?: string | null): string {
  if (!providerBaseUrl) return COOKTOOL_DEFAULT_BASE_URL;
  let trimmed = providerBaseUrl.trim().replace(/\/+$/, '');
  if (!trimmed.includes('/api/v1')) {
    trimmed = `${trimmed}/api/v1`;
  }
  return trimmed;
}

function resolveHeaders(appKey?: string | null): Record<string, string> {
  if (!appKey) {
    throw new Error('CookTool requires an API key in provider credentials.');
  }
  return {
    'x-api-key': appKey.trim(),
  };
}

const NUTRIENT_NUMBER_TO_STANDARD: Record<number, StandardNutrientField> = {
  // Energy
  208: 'calories',
  1008: 'calories',
  // Macronutrients
  203: 'protein',
  1003: 'protein',
  204: 'fat',
  1004: 'fat',
  205: 'carbs',
  1005: 'carbs',
  // Fats
  606: 'saturated_fat',
  1258: 'saturated_fat',
  645: 'monounsaturated_fat',
  1292: 'monounsaturated_fat',
  646: 'polyunsaturated_fat',
  1293: 'polyunsaturated_fat',
  605: 'trans_fat',
  1257: 'trans_fat',
  601: 'cholesterol',
  1253: 'cholesterol',
  // Minerals
  307: 'sodium',
  1093: 'sodium',
  306: 'potassium',
  1092: 'potassium',
  301: 'calcium',
  1087: 'calcium',
  303: 'iron',
  1089: 'iron',
  // Carbohydrates & fiber
  291: 'dietary_fiber',
  1079: 'dietary_fiber',
  269: 'sugars',
  2000: 'sugars',
  // Vitamins
  320: 'vitamin_a',
  1106: 'vitamin_a',
  401: 'vitamin_c',
  1162: 'vitamin_c',
  // Other
  262: 'caffeine_mg',
  1057: 'caffeine_mg',
  255: 'water_ml',
  1051: 'water_ml',
  221: 'alcohol_g',
  1018: 'alcohol_g',
};

export async function searchCookTool(
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
  const offset = Math.max(0, (page - 1) * pageSize);
  const encodedQuery = encodeURIComponent(query.trim());

  // CookTool's /branded endpoint only returns metadata (names/barcodes) with zero nutrients.
  // We query canonical /ingredients exclusively so every result has verified nutritional data.
  const ingredientsRes = await providerFetchJson<{
    data?: CookToolIngredientSearchItem[];
  }>(
    `${baseUrl}/ingredients?q=${encodedQuery}&limit=${pageSize}&offset=${offset}`,
    { providerType: 'cooktool', headers, signal: ctx.signal }
  );

  const ingredients = Array.isArray(ingredientsRes?.data)
    ? ingredientsRes.data
    : [];

  const scope = resolveCacheScope(ctx);
  const foods = ingredients.map((item) => {
    const externalId = `ing:${item.id}`;
    const cached = detailCache.get<MappedProviderFood>(
      'cooktool',
      scope,
      externalId
    );
    if (cached) return cached;
    return buildSearchSummaryFood({
      providerType: 'cooktool',
      externalId,
      name: item.name,
      brand: null,
    });
  });

  const hasMore = ingredients.length === pageSize;

  return {
    foods,
    pagination: {
      page,
      pageSize,
      totalCount: -1,
      hasMore,
    },
  };
}

export async function getCookToolDetails(
  ctx: ProviderCallContext,
  externalId: string,
  opts?: { requireNutrition?: boolean }
): Promise<MappedProviderFood | null> {
  if (!externalId) {
    throw new Error('External ID is required for CookTool details.');
  }

  const scope = resolveCacheScope(ctx);
  const cached = detailCache.get<MappedProviderFood>(
    'cooktool',
    scope,
    externalId
  );
  if (cached) {
    if (opts?.requireNutrition && !hasCoreNutrition(cached)) {
      return null;
    }
    return cached;
  }

  const baseUrl = resolveBaseUrl(ctx.credentials?.base_url);
  const headers = resolveHeaders(ctx.credentials?.app_key);

  if (externalId.startsWith('ing:')) {
    const numericId = externalId.slice(4);
    const country = 'US';
    const response = await providerFetchJson<CookToolNutrientResponse>(
      `${baseUrl}/ingredients/${encodeURIComponent(numericId)}/nutrients?country=${country}`,
      { providerType: 'cooktool', headers, signal: ctx.signal }
    );

    const per100g: Partial<Record<StandardNutrientField, number>> = {};
    const providerNutrients: Record<string, number> = {};
    const providerNutrientUnits: Record<string, string> = {};
    const providerNutrientStandard: Record<string, string> = {};

    for (const row of response.nutrients || []) {
      const stdKey = NUTRIENT_NUMBER_TO_STANDARD[row.nutrient_nbr];
      if (stdKey && per100g[stdKey] === undefined) {
        per100g[stdKey] = row.amount_per_100g;
      }
      const label =
        COOKTOOL_USDA_NUTRIENT_NAMES[row.nutrient_nbr] ||
        `nutrient_${row.nutrient_nbr}`;
      providerNutrients[label] = row.amount_per_100g;
      if (row.unit_name) {
        providerNutrientUnits[label] = normalizeNutrientUnit(row.unit_name);
      }
      if (stdKey) {
        providerNutrientStandard[label] = stdKey;
      }
    }

    const mapped = buildPer100gFood({
      providerType: 'cooktool',
      externalId,
      name: response.ingredient_name || 'CookTool Ingredient',
      per100g,
      providerNutrients,
      providerNutrientUnits,
      providerNutrientStandard,
    });

    detailCache.set('cooktool', scope, externalId, mapped);
    if (opts?.requireNutrition && !hasCoreNutrition(mapped)) {
      return null;
    }
    return mapped;
  }

  if (externalId.startsWith('br:')) {
    const numericId = externalId.slice(3);
    const mapped = buildPer100gFood({
      providerType: 'cooktool',
      externalId,
      name: `CookTool Branded Product #${numericId}`,
      per100g: {},
    });

    detailCache.set('cooktool', scope, externalId, mapped);
    if (opts?.requireNutrition && !hasCoreNutrition(mapped)) {
      return null;
    }
    return mapped;
  }

  throw new Error(`Unsupported CookTool external ID format: ${externalId}`);
}

export const cooktoolAdapter: FoodProviderAdapter = {
  search: searchCookTool,
  getDetails: getCookToolDetails,
};
