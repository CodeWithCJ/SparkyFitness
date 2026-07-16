import { log } from '../config/logging.js';
import externalProviderService from './externalProviderService.js';
import preferenceService from './preferenceService.js';
import {
  searchOpenFoodFacts,
  mapOpenFoodFactsProduct,
} from '../integrations/openfoodfacts/openFoodFactsService.js';
import {
  searchUsdaFoods,
  mapUsdaBarcodeProduct,
} from '../integrations/usda/usdaService.js';
import {
  mapFatSecretSearchItem,
  mapFatSecretFood,
  foodNutrientCache,
  getFatSecretAccessToken,
} from '../integrations/fatsecret/fatsecretService.js';
import { searchYazioFoods } from '../integrations/yazio/yazioService.js';
import { searchSwissFoods } from '../integrations/swissfood/swissFoodService.js';
import {
  searchFatSecretFoods,
  getFatSecretNutrients,
  searchMealieFoods,
  searchTandoorFoods,
  searchNorishFoods,
} from './foodIntegrationService.js';

export const VALID_PROVIDER_TYPES = [
  'openfoodfacts',
  'usda',
  'fatsecret',
  'mealie',
  'tandoor',
  'yazio',
  'norish',
  'swissfood',
] as const;

export type ProviderType = (typeof VALID_PROVIDER_TYPES)[number];

export function isValidProviderType(value: string): value is ProviderType {
  return (VALID_PROVIDER_TYPES as readonly string[]).includes(value);
}

export interface ProviderCredentials {
  app_id?: string;
  app_key?: string;
  base_url?: string;
  is_active?: boolean;
}

// Resolve an OFF providerId for session-cookie auth and base_url resolution.
// Unlike other providers, OFF does not need credentials to function — a
// provider row may carry login credentials, a custom base_url, both, or
// neither (the seeded public default). Returns the provided id (validated
// for ownership and active status) or the user's first active OFF provider,
// or null.
export async function resolveOpenFoodFactsProviderId(
  credentialUserId: string,
  providerId: string | undefined
): Promise<string | null> {
  if (providerId) {
    try {
      const details =
        await externalProviderService.getExternalDataProviderDetails(
          credentialUserId,
          providerId
        );
      if (
        details &&
        details.is_active &&
        details.provider_type === 'openfoodfacts'
      ) {
        return providerId;
      }
    } catch (error) {
      log('debug', 'v2 OFF providerId validation failed:', error);
    }
    return null;
  }
  return externalProviderService.getActiveOpenFoodFactsProviderId(
    credentialUserId
  );
}

export async function resolveProviderCredentials(
  credentialUserId: string,
  providerId: string | undefined,
  providerType: ProviderType
): Promise<ProviderCredentials> {
  if (providerType === 'openfoodfacts') {
    return {};
  }

  if (providerType === 'swissfood' && !providerId) {
    return {};
  }

  if (!providerId) {
    throw Object.assign(new Error('Missing providerId query parameter'), {
      status: 400,
    });
  }

  const details = await externalProviderService.getExternalDataProviderDetails(
    credentialUserId,
    providerId
  );

  if (!details || !details.is_active) {
    throw Object.assign(new Error('Provider not found or is inactive'), {
      status: 400,
    });
  }

  // Guard against Tandoor misconfiguration where app_key contains a URL
  if (providerType === 'tandoor' && typeof details.app_key === 'string') {
    const key = details.app_key;
    if (
      key.startsWith('http://') ||
      key.startsWith('https://') ||
      key.includes('/settings') ||
      key.includes('/api/')
    ) {
      throw Object.assign(
        new Error(
          'Tandoor provider configuration appears to have a URL in the app_key field. ' +
            'Please set the actual Tandoor API token (e.g. tda_...) as the provider app_key.'
        ),
        { status: 400 }
      );
    }
  }

  return {
    app_id: details.app_id ?? undefined,
    app_key: details.app_key ?? undefined,
    base_url: details.base_url ?? undefined,
  };
}

export interface ProviderSearchPagination {
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
}

export interface ProviderSearchResult {
  foods: unknown[];
  pagination: ProviderSearchPagination;
}

export interface ProviderSearchOptions {
  page?: number;
  pageSize?: number;
  providerId?: string;
  autoScale?: boolean;
}

const EMPTY_PAGINATION = (
  page: number,
  pageSize: number
): ProviderSearchPagination => ({
  page,
  pageSize,
  totalCount: 0,
  hasMore: false,
});

const ENRICH_SYNC_COUNT = 5;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FatSecretSearchItem = Record<string, any>;

function applyDetailToItem(
  item: FatSecretSearchItem,
  detailData: unknown
): FatSecretSearchItem {
  if (!detailData) return item;
  const mappedDetail = mapFatSecretFood(detailData);
  if (mappedDetail?.default_variant) {
    return {
      ...item,
      default_variant: mappedDetail.default_variant,
      variants: mappedDetail.variants,
    };
  }
  return item;
}

// Top ENRICH_SYNC_COUNT results are enriched with a real food.get.v4 call (parallel, all fire
// at once) so their search-card calories match the edit form. Lower-ranked results fall back
// to the in-memory cache if warm, otherwise stay as search-mapped. Failed detail fetches
// log a warning and leave the item unchanged.
export async function enrichFatSecretResults(
  items: FatSecretSearchItem[],
  appId: string | undefined,
  appKey: string | undefined
): Promise<FatSecretSearchItem[]> {
  const top = items.slice(0, ENRICH_SYNC_COUNT);
  const rest = items.slice(ENRICH_SYNC_COUNT);

  // Prefetch the access token once before firing parallel detail requests, so the
  // concurrent calls below hit the warm token cache instead of racing to fetch
  // their own token when the cache is cold or about to expire.
  if (top.some((item) => item?.provider_external_id)) {
    try {
      await getFatSecretAccessToken(appId, appKey);
    } catch (err) {
      log('warn', 'FatSecret access token prefetch failed:', err);
    }
  }

  const enrichedTop = await Promise.all(
    top.map(async (item) => {
      if (!item?.provider_external_id) return item;
      try {
        const detail = await getFatSecretNutrients(
          item.provider_external_id,
          appId,
          appKey
        );
        return applyDetailToItem(item, detail);
      } catch (err) {
        log(
          'warn',
          `FatSecret detail enrichment failed for ${item.provider_external_id}:`,
          err
        );
        return item;
      }
    })
  );

  const enrichedRest = rest.map((item) => {
    if (!item?.provider_external_id) return item;
    const cached = foodNutrientCache.get(item.provider_external_id);
    if (
      !cached ||
      typeof cached.expiry !== 'number' ||
      Date.now() >= cached.expiry
    )
      return item;
    try {
      return applyDetailToItem(item, cached.data);
    } catch (err) {
      log(
        'warn',
        `FatSecret cache enrichment failed for ${item.provider_external_id}:`,
        err
      );
      return item;
    }
  });

  return [...enrichedTop, ...enrichedRest];
}

// `userId` is the active (possibly switched) data context — used for
// preferences and provider-specific caching. `credentialUserId` is the real
// authenticated actor whose stored provider secrets and OpenFoodFacts session
// are used; a delegate must never search with a family member's credentials.
// It defaults to `userId` for non-delegated callers (chatbot, single-user).
export async function searchProviderFoods(
  userId: string,
  providerType: ProviderType,
  query: string,
  opts: ProviderSearchOptions = {},
  credentialUserId: string = userId
): Promise<ProviderSearchResult> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const providerId = opts.providerId;
  const autoScale = opts.autoScale ?? true;

  const credentials = await resolveProviderCredentials(
    credentialUserId,
    providerId,
    providerType
  );
  const userPrefs = await preferenceService.getUserPreferences(userId, userId);
  const language = userPrefs?.language || 'en';

  let foods: unknown[] = [];
  let pagination = EMPTY_PAGINATION(page, pageSize);

  switch (providerType) {
    case 'openfoodfacts': {
      const offProviderId = await resolveOpenFoodFactsProviderId(
        credentialUserId,
        providerId
      );
      const result = await searchOpenFoodFacts(
        query,
        page,
        language,

        offProviderId ? credentialUserId : undefined,
        offProviderId || undefined
      );
      const products = (result.products || []).filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: Record<string, any>) =>
          p.product_name || p[`product_name_${language}`] || p.product_name_en
      );
      foods = products
        .map((p: Record<string, unknown>) =>
          mapOpenFoodFactsProduct(p, { autoScale, language })
        )
        .filter(Boolean);
      pagination = result.pagination;
      break;
    }

    case 'usda': {
      const result = await searchUsdaFoods(
        query,
        credentials.app_key,
        page,
        pageSize
      );
      const items = result.foods || [];
      foods = items.map(mapUsdaBarcodeProduct).filter(Boolean);
      pagination = result.pagination;
      break;
    }

    case 'fatsecret': {
      const result = await searchFatSecretFoods(
        query,
        credentials.app_id,
        credentials.app_key,
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
        .filter(
          (x): x is NonNullable<typeof x> => x !== null && x !== undefined
        );
      foods = await enrichFatSecretResults(
        mapped,
        credentials.app_id,
        credentials.app_key
      );
      pagination = result.pagination;
      break;
    }

    case 'mealie': {
      const result = await searchMealieFoods(
        query,
        credentials.base_url,
        credentials.app_key,

        userId,
        providerId,
        page
      );
      foods = result.items || [];
      pagination = result.pagination;
      break;
    }

    case 'tandoor': {
      const results = await searchTandoorFoods(
        query,
        credentials.base_url,
        credentials.app_key,

        userId,
        providerId
      );
      foods = results || [];
      pagination = {
        page: 1,
        pageSize: foods.length,
        totalCount: foods.length,
        hasMore: false,
      };
      break;
    }

    case 'norish': {
      const results = await searchNorishFoods(
        query,
        credentials.base_url,
        credentials.app_key,

        userId,
        providerId
      );
      foods = results || [];
      pagination = {
        page: 1,
        pageSize: foods.length,
        totalCount: foods.length,
        hasMore: false,
      };
      break;
    }

    case 'yazio': {
      const result = await searchYazioFoods(query, {
        username: credentials.app_id,
        password: credentials.app_key,
        baseUrl: credentials.base_url,
        page,
        pageSize,
      });
      foods = result.foods || [];
      pagination = result.pagination;
      break;
    }

    case 'swissfood': {
      const result = await searchSwissFoods(
        query,
        page,
        pageSize,
        language,
        credentials.base_url || undefined
      );
      foods = result.foods || [];
      pagination = result.pagination;
      break;
    }
  }

  return { foods, pagination };
}
