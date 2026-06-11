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
import { mapFatSecretSearchItem } from '../integrations/fatsecret/fatsecretService.js';
import { searchYazioFoods } from '../integrations/yazio/yazioService.js';
import { searchSwissFoods } from '../integrations/swissfood/swissFoodService.js';
import {
  searchFatSecretFoods,
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

// Resolve an OFF providerId for session-cookie auth. Unlike other providers,
// OFF does not need credentials to function — this just opts into the
// authenticated request path when the user has configured an OFF account.
// Returns the provided id (validated for ownership) or the user's first
// credentialed OFF provider, or null.
export async function resolveOpenFoodFactsProviderId(
  userId: string,
  providerId: string | undefined
): Promise<string | null> {
  if (providerId) {
    try {
      const details =
        await externalProviderService.getExternalDataProviderDetails(
          userId,
          providerId
        );
      if (
        details &&
        details.is_active &&
        details.provider_type === 'openfoodfacts' &&
        details.app_id &&
        details.app_key
      ) {
        return providerId;
      }
    } catch (error) {
      log('debug', 'v2 OFF providerId validation failed:', error);
    }
    return null;
  }
  return externalProviderService.getActiveOpenFoodFactsProviderId(userId);
}

export async function resolveProviderCredentials(
  userId: string,
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
    userId,
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

export async function searchProviderFoods(
  userId: string,
  providerType: ProviderType,
  query: string,
  opts: ProviderSearchOptions = {}
): Promise<ProviderSearchResult> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const providerId = opts.providerId;
  const autoScale = opts.autoScale ?? true;

  const credentials = await resolveProviderCredentials(
    userId,
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
        userId,
        providerId
      );
      const result = await searchOpenFoodFacts(
        query,
        page,
        language,

        offProviderId ? userId : undefined,
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
      foods = items.map(mapFatSecretSearchItem).filter(Boolean);
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
