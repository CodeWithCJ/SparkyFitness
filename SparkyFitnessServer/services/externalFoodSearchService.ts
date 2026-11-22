import { log } from '../config/logging.js';
import externalProviderService from './externalProviderService.js';
import preferenceService from './preferenceService.js';
import {
  mapFatSecretFood,
  foodNutrientCache,
  getFatSecretAccessToken,
} from '../integrations/fatsecret/fatsecretService.js';
import { isPublicFoodProvider, type FoodProviderType } from '@workspace/shared';
import { getFatSecretNutrients } from './foodIntegrationService.js';
import {
  rankProviderMatches,
  PARTIAL_SERVING_DATA,
  type ProviderFoodItem,
} from '../utils/foodRanking.js';
import {
  FOOD_PROVIDER_ADAPTERS,
  type ProviderCallContext,
} from '../integrations/foodProviders/index.js';

import type { ProviderType } from '../constants/foodProviders.js';
import type { OpenFoodFactsCredentialScope } from '../integrations/openfoodfacts/openFoodFactsAuth.js';

export {
  VALID_PROVIDER_TYPES,
  isValidProviderType,
} from '../constants/foodProviders.js';
export type { ProviderType } from '../constants/foodProviders.js';

export interface ProviderCredentials {
  app_id?: string;
  app_key?: string;
  base_url?: string;
  is_active?: boolean;
  provider_options?: Record<string, unknown>;
}

export interface OpenFoodFactsProviderSelection {
  id: string;
  scope: OpenFoodFactsCredentialScope;
}

// Resolve an OFF providerId for session-cookie auth and base_url resolution.
// Unlike other providers, OFF does not need credentials to function — a
// provider row may carry login credentials, a custom base_url, both, or
// neither (the seeded public default). Returns the provided id and its
// credential-cache scope (validated for access and active status) or the
// user's first active personal OFF provider, or null.
export async function resolveOpenFoodFactsProviderId(
  credentialUserId: string,
  providerId: string | undefined
): Promise<OpenFoodFactsProviderSelection | null> {
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
        return {
          id: providerId,
          scope: details.is_public === true ? 'global' : 'personal',
        };
      }
    } catch (error) {
      log('debug', 'v2 OFF providerId validation failed:', error);
    }
    return null;
  }
  const activeProviderId =
    await externalProviderService.getActiveOpenFoodFactsProviderId(
      credentialUserId
    );
  return activeProviderId ? { id: activeProviderId, scope: 'personal' } : null;
}

export async function resolveProviderCredentials(
  credentialUserId: string,
  providerId: string | undefined,
  providerType: ProviderType
): Promise<ProviderCredentials> {
  if (isPublicFoodProvider(providerType) && !providerId) {
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
    provider_options:
      (details.provider_options as Record<string, unknown>) ?? undefined,
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
  signal?: AbortSignal;
}

export const EMPTY_PAGINATION = (
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
      // foods.search carries no photo, so the enrichment call is the only
      // place a FatSecret search result can get one. Keep any existing value
      // if the detail response has none.
      image_url: mappedDetail.image_url ?? item.image_url ?? null,
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

  // An item left as search-mapped carries the summary serving, not the
  // detail record's default that a save will use.
  return [...enrichedTop, ...enrichedRest].map((item, index) =>
    item === items[index] && item?.provider_external_id
      ? { ...item, [PARTIAL_SERVING_DATA]: true }
      : item
  );
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

  const adapter = FOOD_PROVIDER_ADAPTERS[providerType as FoodProviderType];
  if (!adapter) {
    throw Object.assign(
      new Error(`Unsupported provider type: ${providerType}`),
      {
        status: 400,
      }
    );
  }

  const ctx: ProviderCallContext = {
    userId,
    credentialUserId,
    providerId,
    credentials,
    language,
    autoScale,
    signal: opts.signal,
  };

  const result = await adapter.search(ctx, query, page, pageSize);
  const ranked = rankProviderMatches(result.foods as ProviderFoodItem[], query);

  return { foods: ranked, pagination: result.pagination };
}
