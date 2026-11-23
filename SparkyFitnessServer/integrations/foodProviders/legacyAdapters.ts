import type { FoodProviderAdapter, ProviderCallContext } from './types.js';
import type { ProviderSearchResult } from '../../services/externalFoodSearchService.js';
import {
  resolveOpenFoodFactsProviderId,
  enrichFatSecretResults,
} from '../../services/externalFoodSearchService.js';
import {
  searchOpenFoodFacts,
  mapOpenFoodFactsProduct,
  searchOpenFoodFactsByBarcodeFields,
  hasCompleteOffCoreNutrition,
} from '../openfoodfacts/openFoodFactsService.js';
import {
  searchUsdaFoods,
  getUsdaFoodDetails,
  mapUsdaBarcodeProduct,
} from '../usda/usdaService.js';
import {
  mapFatSecretSearchItem,
  mapFatSecretFood,
} from '../fatsecret/fatsecretService.js';
import {
  searchFatSecretFoods,
  getFatSecretNutrients,
  searchMealieFoods,
  getMealieFoodDetails,
  searchTandoorFoods,
  getTandoorFoodDetails,
  searchNorishFoods,
  getNorishFoodDetails,
} from '../../services/foodIntegrationService.js';
import {
  searchYazioFoods,
  getYazioFoodDetails,
} from '../yazio/yazioService.js';
import {
  searchSwissFoods,
  getSwissFoodDetails,
} from '../swissfood/swissFoodService.js';
import {
  searchCanadianNutrientFoods,
  getCanadianNutrientFoodDetails,
} from '../cnf/cnfService.js';
import {
  searchLivsmedelsverketFoods,
  getLivsmedelsverketFoodDetails,
} from '../livsmedelsverket/livsmedelsverketService.js';
import {
  rankProviderMatches,
  type ProviderFoodItem,
} from '../../utils/foodRanking.js';

export const legacyOpenFoodFactsAdapter: FoodProviderAdapter = {
  async search(
    ctx: ProviderCallContext,
    query: string,
    page: number,
    pageSize: number
  ): Promise<ProviderSearchResult> {
    const offProvider = await resolveOpenFoodFactsProviderId(
      ctx.credentialUserId,
      ctx.providerId
    );
    const result = await searchOpenFoodFacts(
      query,
      page,
      ctx.language,
      offProvider ? ctx.credentialUserId : undefined,
      offProvider?.id,
      pageSize,
      offProvider?.scope ?? 'personal'
    );
    const products = (result.products || []).filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p: Record<string, any>) =>
        p.product_name || p[`product_name_${ctx.language}`] || p.product_name_en
    );
    const foods = products
      .map((p: Record<string, unknown>) =>
        mapOpenFoodFactsProduct(p, {
          autoScale: ctx.autoScale,
          language: ctx.language,
        })
      )
      .filter(Boolean);
    return { foods, pagination: result.pagination };
  },

  async getDetails(
    ctx: ProviderCallContext,
    externalId: string,
    opts: { requireNutrition: boolean }
  ): Promise<unknown | null> {
    const offProvider = await resolveOpenFoodFactsProviderId(
      ctx.credentialUserId,
      ctx.providerId
    );
    const data = await searchOpenFoodFactsByBarcodeFields(
      externalId,
      undefined,
      ctx.language,
      offProvider ? ctx.credentialUserId : undefined,
      offProvider?.id,
      offProvider?.scope ?? 'personal',
      ctx.signal
    );
    if (
      data.status === 1 &&
      data.product &&
      (!opts.requireNutrition || hasCompleteOffCoreNutrition(data.product))
    ) {
      return mapOpenFoodFactsProduct(data.product, { language: ctx.language });
    }
    return null;
  },
};

export const legacyUsdaAdapter: FoodProviderAdapter = {
  async search(
    ctx: ProviderCallContext,
    query: string,
    page: number,
    pageSize: number
  ): Promise<ProviderSearchResult> {
    const result = await searchUsdaFoods(
      query,
      ctx.credentials.app_key,
      page,
      pageSize
    );
    const items = result.foods || [];
    const foods = items.map(mapUsdaBarcodeProduct).filter(Boolean);
    return { foods, pagination: result.pagination };
  },

  async getDetails(
    ctx: ProviderCallContext,
    externalId: string
  ): Promise<unknown | null> {
    const data = await getUsdaFoodDetails(externalId, ctx.credentials.app_key);
    if (data) {
      return mapUsdaBarcodeProduct(data);
    }
    return null;
  },
};

export const legacyFatSecretAdapter: FoodProviderAdapter = {
  async search(
    ctx: ProviderCallContext,
    query: string,
    page: number
  ): Promise<ProviderSearchResult> {
    const result = await searchFatSecretFoods(
      query,
      ctx.credentials.app_id,
      ctx.credentials.app_key,
      page
    );
    const rawFoods = result.foods?.food;
    const items = Array.isArray(rawFoods)
      ? rawFoods
      : rawFoods
        ? [rawFoods]
        : [];
    const mapped = items
      .map(mapFatSecretSearchItem)
      .filter((x): x is NonNullable<typeof x> => x !== null && x !== undefined);
    const foods = await enrichFatSecretResults(
      rankProviderMatches(mapped as ProviderFoodItem[], query),
      ctx.credentials.app_id,
      ctx.credentials.app_key
    );
    return { foods, pagination: result.pagination };
  },

  async getDetails(
    ctx: ProviderCallContext,
    externalId: string
  ): Promise<unknown | null> {
    const data = await getFatSecretNutrients(
      externalId,
      ctx.credentials.app_id,
      ctx.credentials.app_key
    );
    if (data) {
      return mapFatSecretFood(data);
    }
    return null;
  },
};

export const legacyMealieAdapter: FoodProviderAdapter = {
  async search(
    ctx: ProviderCallContext,
    query: string,
    page: number
  ): Promise<ProviderSearchResult> {
    const result = await searchMealieFoods(
      query,
      ctx.credentials.base_url,
      ctx.credentials.app_key,
      ctx.userId,
      ctx.providerId,
      page
    );
    return { foods: result.items || [], pagination: result.pagination };
  },

  async getDetails(
    ctx: ProviderCallContext,
    externalId: string
  ): Promise<unknown | null> {
    const result = await getMealieFoodDetails(
      externalId,
      ctx.credentials.base_url,
      ctx.credentials.app_key,
      ctx.userId,
      ctx.providerId
    );
    if (result) {
      const { food: mealieFood, variant } = result;
      return {
        ...mealieFood,
        default_variant: variant,
        variants: [variant],
      };
    }
    return null;
  },
};

export const legacyTandoorAdapter: FoodProviderAdapter = {
  async search(
    ctx: ProviderCallContext,
    query: string
  ): Promise<ProviderSearchResult> {
    const results = await searchTandoorFoods(
      query,
      ctx.credentials.base_url,
      ctx.credentials.app_key,
      ctx.userId,
      ctx.providerId
    );
    const foods = results || [];
    return {
      foods,
      pagination: {
        page: 1,
        pageSize: foods.length,
        totalCount: foods.length,
        hasMore: false,
      },
    };
  },

  async getDetails(
    ctx: ProviderCallContext,
    externalId: string
  ): Promise<unknown | null> {
    const result = await getTandoorFoodDetails(
      externalId,
      ctx.credentials.base_url,
      ctx.credentials.app_key,
      ctx.userId,
      ctx.providerId
    );
    if (result) {
      const { food: tandoorFood, variant } = result;
      return {
        ...tandoorFood,
        default_variant: variant,
        variants: [variant],
      };
    }
    return null;
  },
};

export const legacyNorishAdapter: FoodProviderAdapter = {
  async search(
    ctx: ProviderCallContext,
    query: string
  ): Promise<ProviderSearchResult> {
    const results = await searchNorishFoods(
      query,
      ctx.credentials.base_url,
      ctx.credentials.app_key,
      ctx.userId,
      ctx.providerId
    );
    const foods = results || [];
    return {
      foods,
      pagination: {
        page: 1,
        pageSize: foods.length,
        totalCount: foods.length,
        hasMore: false,
      },
    };
  },

  async getDetails(
    ctx: ProviderCallContext,
    externalId: string
  ): Promise<unknown | null> {
    const result = await getNorishFoodDetails(
      externalId,
      ctx.credentials.base_url,
      ctx.credentials.app_key,
      ctx.userId,
      ctx.providerId
    );
    if (result) {
      const { food: norishFood, variant } = result;
      return {
        ...norishFood,
        default_variant: variant,
        variants: [variant],
      };
    }
    return null;
  },
};

export const legacyYazioAdapter: FoodProviderAdapter = {
  async search(
    ctx: ProviderCallContext,
    query: string,
    page: number,
    pageSize: number
  ): Promise<ProviderSearchResult> {
    const result = await searchYazioFoods(query, {
      username: ctx.credentials.app_id,
      password: ctx.credentials.app_key,
      baseUrl: ctx.credentials.base_url,
      page,
      pageSize,
      language: ctx.language,
    });
    return { foods: result.foods || [], pagination: result.pagination };
  },

  async getDetails(
    ctx: ProviderCallContext,
    externalId: string
  ): Promise<unknown | null> {
    return (
      (await getYazioFoodDetails(externalId, {
        username: ctx.credentials.app_id,
        password: ctx.credentials.app_key,
        baseUrl: ctx.credentials.base_url,
        language: ctx.language,
      })) ?? null
    );
  },
};

export const legacySwissFoodAdapter: FoodProviderAdapter = {
  async search(
    ctx: ProviderCallContext,
    query: string,
    page: number,
    pageSize: number
  ): Promise<ProviderSearchResult> {
    const result = await searchSwissFoods(
      query,
      page,
      pageSize,
      ctx.language,
      ctx.credentials.base_url || undefined
    );
    return { foods: result.foods || [], pagination: result.pagination };
  },

  async getDetails(
    ctx: ProviderCallContext,
    externalId: string
  ): Promise<unknown | null> {
    return (
      (await getSwissFoodDetails(
        externalId,
        ctx.language,
        ctx.credentials.base_url || undefined
      )) ?? null
    );
  },
};

export const legacyCanadianNutrientFileAdapter: FoodProviderAdapter = {
  async search(
    ctx: ProviderCallContext,
    query: string,
    page: number,
    pageSize: number
  ): Promise<ProviderSearchResult> {
    const result = await searchCanadianNutrientFoods(
      query,
      page,
      pageSize,
      ctx.language,
      ctx.credentials.base_url || undefined
    );
    return { foods: result.foods || [], pagination: result.pagination };
  },

  async getDetails(
    ctx: ProviderCallContext,
    externalId: string
  ): Promise<unknown | null> {
    return (
      (await getCanadianNutrientFoodDetails(
        externalId,
        ctx.language,
        ctx.credentials.base_url || undefined
      )) ?? null
    );
  },
};

export const legacyLivsmedelsverketAdapter: FoodProviderAdapter = {
  async search(
    ctx: ProviderCallContext,
    query: string,
    page: number,
    pageSize: number
  ): Promise<ProviderSearchResult> {
    const result = await searchLivsmedelsverketFoods(
      query,
      page,
      pageSize,
      ctx.language,
      ctx.credentials.base_url || undefined
    );
    return { foods: result.foods || [], pagination: result.pagination };
  },

  async getDetails(
    ctx: ProviderCallContext,
    externalId: string
  ): Promise<unknown | null> {
    return (
      (await getLivsmedelsverketFoodDetails(
        externalId,
        ctx.language,
        ctx.credentials.base_url || undefined
      )) ?? null
    );
  },
};
