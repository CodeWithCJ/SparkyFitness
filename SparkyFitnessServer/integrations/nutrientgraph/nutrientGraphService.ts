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
import type {
  MappedProviderFood,
  StandardNutrientField,
  PortionMeasure,
} from '../foodProviders/per100gMapper.js';

export const NUTRIENTGRAPH_DEFAULT_BASE_URL = 'https://api.nutrientgraph.com';
const SUPPORTED_LANGUAGES = ['en', 'fr', 'de', 'it', 'es'] as const;

interface NutrientGraphSearchItem {
  id: string;
  type?: string;
  name: string;
  basis?: string;
  energy_kcal_per_100?: number | null;
  score?: number;
  matched_name?: string;
  matched_lang?: string;
}

interface NutrientGraphSearchResponse {
  data: {
    query: string;
    lang: string;
    count: number;
    results: NutrientGraphSearchItem[];
  };
}

interface NutrientGraphName {
  lang: string;
  name: string;
  method?: string;
  source?: string;
}

interface NutrientGraphPortion {
  description: string;
  grams: number;
  source?: string;
}

interface NutrientGraphNutrients {
  energy_kcal?: number | null;
  energy_kj?: number | null;
  protein_g?: number | null;
  fat_g?: number | null;
  carbohydrate_g?: number | null;
  fiber_g?: number | null;
  sugars_g?: number | null;
  saturated_fat_g?: number | null;
  mufa_g?: number | null;
  pufa_g?: number | null;
  trans_fat_g?: number | null;
  cholesterol_mg?: number | null;
  sodium_mg?: number | null;
  potassium_mg?: number | null;
  calcium_mg?: number | null;
  iron_mg?: number | null;
  water_g?: number | null;
  alcohol_g?: number | null;
  caffeine_mg?: number | null;
  vitamin_a_rae_ug?: number | null;
  vitamin_c_mg?: number | null;
}

interface NutrientGraphProduct {
  id: string;
  type?: string;
  names?: NutrientGraphName[];
  group?: string;
  basis?: string;
  brand?: string | null;
  brand_name?: string | null;
  category?: string | null;
  nutrients?: NutrientGraphNutrients;
  portions?: NutrientGraphPortion[];
  primary_portion?: NutrientGraphPortion | null;
  missing?: string[];
}

interface NutrientGraphFoodResponse {
  data: NutrientGraphProduct;
}

interface NutrientGraphBarcodeResponse {
  data: {
    gtin14: string;
    product: NutrientGraphProduct;
  };
}

function resolveBaseUrl(providerBaseUrl?: string | null): string {
  if (!providerBaseUrl) return NUTRIENTGRAPH_DEFAULT_BASE_URL;
  return providerBaseUrl.trim().replace(/\/+$/, '');
}

function resolveHeaders(appKey?: string | null): Record<string, string> {
  if (!appKey) {
    throw new Error(
      'NutrientGraph requires an API key in provider credentials.'
    );
  }
  return {
    'X-API-Key': appKey.trim(),
  };
}

function resolveLanguage(lang?: string | null): string {
  if (!lang) return 'en';
  const normalized = lang.toLowerCase().trim().slice(0, 2);
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(normalized)
    ? normalized
    : 'en';
}

function resolveFoodName(
  names: NutrientGraphName[] | undefined,
  preferredLang: string,
  fallback = 'NutrientGraph Food'
): string {
  if (!names || names.length === 0) return fallback;
  const match = names.find((n) => n.lang === preferredLang);
  if (match?.name) return match.name;
  const enMatch = names.find((n) => n.lang === 'en');
  if (enMatch?.name) return enMatch.name;
  return names[0].name || fallback;
}

function mapNutrientGraphNutrients(
  nutrients: NutrientGraphNutrients | undefined
): {
  per100g: Partial<Record<StandardNutrientField, number>>;
  providerNutrients: Record<string, number>;
} {
  const per100g: Partial<Record<StandardNutrientField, number>> = {};
  const providerNutrients: Record<string, number> = {};

  if (!nutrients) {
    return { per100g, providerNutrients };
  }

  const setIfNumber = (field: StandardNutrientField, val?: number | null) => {
    if (typeof val === 'number' && !isNaN(val)) {
      per100g[field] = val;
    }
  };

  setIfNumber('calories', nutrients.energy_kcal);
  setIfNumber('protein', nutrients.protein_g);
  setIfNumber('fat', nutrients.fat_g);
  setIfNumber('carbs', nutrients.carbohydrate_g);
  setIfNumber('saturated_fat', nutrients.saturated_fat_g);
  setIfNumber('monounsaturated_fat', nutrients.mufa_g);
  setIfNumber('polyunsaturated_fat', nutrients.pufa_g);
  setIfNumber('trans_fat', nutrients.trans_fat_g);
  setIfNumber('cholesterol', nutrients.cholesterol_mg);
  setIfNumber('sodium', nutrients.sodium_mg);
  setIfNumber('potassium', nutrients.potassium_mg);
  setIfNumber('dietary_fiber', nutrients.fiber_g);
  setIfNumber('sugars', nutrients.sugars_g);
  setIfNumber('calcium', nutrients.calcium_mg);
  setIfNumber('iron', nutrients.iron_mg);
  setIfNumber('water_ml', nutrients.water_g);
  setIfNumber('alcohol_g', nutrients.alcohol_g);
  setIfNumber('caffeine_mg', nutrients.caffeine_mg);
  setIfNumber('vitamin_a', nutrients.vitamin_a_rae_ug);
  setIfNumber('vitamin_c', nutrients.vitamin_c_mg);

  for (const [key, val] of Object.entries(nutrients)) {
    if (typeof val === 'number' && !isNaN(val)) {
      providerNutrients[key] = val;
    }
  }

  return { per100g, providerNutrients };
}

function mapPortions(
  portions?: NutrientGraphPortion[],
  primaryPortion?: NutrientGraphPortion | null
): PortionMeasure[] {
  const result: PortionMeasure[] = [];
  const seen = new Set<string>();

  if (primaryPortion && primaryPortion.grams > 0) {
    result.push({
      description: primaryPortion.description,
      grams: primaryPortion.grams,
    });
    seen.add(primaryPortion.description.toLowerCase());
  }

  for (const p of portions || []) {
    if (!p.grams || p.grams <= 0) continue;
    const key = p.description.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      description: p.description,
      grams: p.grams,
    });
  }

  return result;
}

export async function searchNutrientGraph(
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
  const lang = resolveLanguage(ctx.language);
  const offset = Math.max(0, (page - 1) * pageSize);
  const encodedQuery = encodeURIComponent(query.trim());

  const response = await providerFetchJson<NutrientGraphSearchResponse>(
    `${baseUrl}/v1/food/search?q=${encodedQuery}&lang=${lang}&limit=${pageSize}&offset=${offset}`,
    { providerType: 'nutrientgraph', headers, signal: ctx.signal }
  );

  const results = response.data?.results || [];
  const scope = `${resolveCacheScope(ctx)}:${lang}`;

  const foods = results.map((item) => {
    const cached = detailCache.get<MappedProviderFood>(
      'nutrientgraph',
      scope,
      item.id
    );
    if (cached) {
      return {
        ...cached,
        name: item.name || cached.name,
      };
    }
    return buildSearchSummaryFood({
      providerType: 'nutrientgraph',
      externalId: item.id,
      name: item.name,
      brand: null,
      calories:
        typeof item.energy_kcal_per_100 === 'number'
          ? item.energy_kcal_per_100
          : undefined,
    });
  });

  const hasMore = results.length === pageSize;

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

export async function getNutrientGraphDetails(
  ctx: ProviderCallContext,
  externalId: string,
  opts?: { requireNutrition?: boolean }
): Promise<MappedProviderFood | null> {
  if (!externalId) {
    throw new Error('External ID is required for NutrientGraph details.');
  }

  const lang = resolveLanguage(ctx.language);
  const scope = `${resolveCacheScope(ctx)}:${lang}`;
  const cached = detailCache.get<MappedProviderFood>(
    'nutrientgraph',
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

  const response = await providerFetchJson<NutrientGraphFoodResponse>(
    `${baseUrl}/v1/food/foods/${encodeURIComponent(externalId)}?lang=${lang}`,
    { providerType: 'nutrientgraph', headers, signal: ctx.signal }
  );

  const product = response.data;
  const name = resolveFoodName(product.names, lang);
  const brand = product.brand || product.brand_name || undefined;
  const { per100g, providerNutrients } = mapNutrientGraphNutrients(
    product.nutrients
  );
  const portions = mapPortions(product.portions, product.primary_portion);

  const mapped = buildPer100gFood({
    providerType: 'nutrientgraph',
    externalId,
    name,
    brand,
    per100g,
    providerNutrients,
    portions,
  });

  detailCache.set('nutrientgraph', scope, externalId, mapped);
  if (opts?.requireNutrition && !hasCoreNutrition(mapped)) {
    return null;
  }
  return mapped;
}

export async function lookupNutrientGraphBarcode(
  ctx: ProviderCallContext,
  barcode: string
): Promise<MappedProviderFood | null> {
  if (!barcode) return null;

  const baseUrl = resolveBaseUrl(ctx.credentials?.base_url);
  const headers = resolveHeaders(ctx.credentials?.app_key);
  const lang = resolveLanguage(ctx.language);

  try {
    const response = await providerFetchJson<NutrientGraphBarcodeResponse>(
      `${baseUrl}/v1/food/barcode/${encodeURIComponent(barcode)}`,
      { providerType: 'nutrientgraph', headers, signal: ctx.signal }
    );

    const { gtin14, product } = response.data;
    if (!product) return null;

    if (product.nutrients && Object.keys(product.nutrients).length > 0) {
      const name = resolveFoodName(product.names, lang);
      const brand = product.brand || product.brand_name || undefined;
      const { per100g, providerNutrients } = mapNutrientGraphNutrients(
        product.nutrients
      );
      const portions = mapPortions(product.portions, product.primary_portion);

      return buildPer100gFood({
        providerType: 'nutrientgraph',
        externalId: product.id || `gtin:${gtin14}`,
        name,
        brand,
        barcode: gtin14 || barcode,
        per100g,
        providerNutrients,
        portions,
      });
    }

    if (product.id) {
      const detailed = await getNutrientGraphDetails(ctx, product.id);
      if (detailed) {
        return {
          ...detailed,
          barcode: gtin14 || barcode,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

export const nutrientGraphAdapter: FoodProviderAdapter = {
  search: searchNutrientGraph,
  getDetails: getNutrientGraphDetails,
  lookupBarcode: lookupNutrientGraphBarcode,
};
