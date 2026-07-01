import { useCallback } from 'react';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { searchFoodsV2 } from '@/api/Foods/foodService';
import { searchNutritionixFoods } from '@/api/Foods/nutrionix';
import { convertNutritionixToFood } from '@/utils/foodSearch';
import { useDebounce } from '@/hooks/useDebounce';
import type { Food, NutritionixItem } from '@/types/food';
import type { DataProvider } from '@/types/settings';

// A single online provider result, tagged with its source so the UI can render
// the correct edit/detail flow. Mirrors the per-provider mapping used by the
// single-provider online search in FoodSearch.tsx. Defined here (rather than in
// the component) so both the single-provider path and this aggregated hook can
// share the type.
export type ExternalResultWrapper =
  | {
      provider_type: 'openfoodfacts';
      food: Food;
    }
  | {
      provider_type: 'nutritionix';
      raw: NutritionixItem;
      food: Food;
    }
  | {
      provider_type: 'fatsecret';
      food: Food;
    }
  | {
      provider_type: 'usda';
      food: Food;
    }
  | {
      provider_type: 'mealie';
      food: Food;
    }
  | {
      provider_type: 'tandoor';
      food: Food;
    }
  | {
      provider_type: 'yazio';
      food: Food;
    }
  | {
      provider_type: 'norish';
      food: Food;
    }
  | {
      provider_type: 'swissfood';
      food: Food;
    };

// Normalised per-provider payload returned by each fan-out query.
interface NormalisedProviderResult {
  items: ExternalResultWrapper[];
  totalCount: number;
}

export interface ProviderFoodSearchResult {
  provider: DataProvider;
  items: ExternalResultWrapper[];
  totalCount: number;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

// Online search starts at 3 characters (matches the single-provider path) to
// limit provider calls, debounced by 600ms.
const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 600;
const STALE_TIME = 1000 * 60 * 5; // 5 minutes

// Stable fallback so a missing refetch does not allocate a new function each
// render (which would break reference stability of the providerResults items).
const noop = () => {};

// Dedicated key namespace for the aggregated, normalised per-provider queries.
// Kept distinct from v2FoodKeys.search / nutritionixKeys.search because those
// cache the providers' raw response shapes; reusing them here with a different
// (normalised) shape would corrupt the shared cache.
const allProvidersFoodSearchKey = (
  providerType: string,
  query: string,
  providerId?: string,
  autoScale?: boolean
) =>
  [
    'v2',
    'foods',
    'allProvidersSearch',
    providerType,
    query,
    providerId,
    autoScale,
  ] as const;

// Providers whose single-provider search caps results at the food display
// limit (see FoodSearch.tsx search handlers); kept in parity here.
const PAGE_SIZE_PROVIDERS = ['usda', 'yazio'];

async function fetchProviderResults(
  provider: DataProvider,
  query: string,
  options: { autoScale?: boolean; foodDisplayLimit?: number }
): Promise<NormalisedProviderResult> {
  if (provider.provider_type === 'nutritionix') {
    const data: NutritionixItem[] = await searchNutritionixFoods(
      query,
      provider.id
    );
    // Guard against a non-array response so a provider error can't crash the map.
    const items = (Array.isArray(data) ? data : []).map(
      (raw) =>
        ({
          provider_type: 'nutritionix' as const,
          raw,
          food: convertNutritionixToFood(raw),
        }) satisfies ExternalResultWrapper
    );
    return { items, totalCount: items.length };
  }

  const pageSize = PAGE_SIZE_PROVIDERS.includes(provider.provider_type)
    ? options.foodDisplayLimit
    : undefined;
  const data = await searchFoodsV2(
    provider.provider_type,
    query,
    provider.id,
    undefined,
    pageSize,
    provider.provider_type === 'openfoodfacts' ? options.autoScale : undefined
  );
  // Fall back to an empty list if a provider returns a malformed payload.
  const items = (data?.foods ?? []).map(
    (food: Food) =>
      ({
        provider_type: provider.provider_type,
        food,
      }) as ExternalResultWrapper
  );
  return {
    items,
    totalCount: data?.pagination?.totalCount ?? items.length,
  };
}

// Fans a single search out across every active food provider in parallel. Each
// provider query is independent, so results stream in as they return and a
// failure in one provider does not block the others (partial results). First
// page only; "show all" deep-links to the single-provider search for full
// pagination.
export function useAllProvidersFoodSearch(
  searchTerm: string,
  providers: DataProvider[],
  options?: {
    enabled?: boolean;
    autoScale?: boolean;
    foodDisplayLimit?: number;
  }
): {
  providerResults: ProviderFoodSearchResult[];
  anyLoading: boolean;
  isSearchActive: boolean;
  // The debounced term the current providerResults correspond to. Consumers can
  // key UI resets (e.g. collapsing expanded sections) off this so they fire in
  // step with the aggregated results rather than a faster local debounce.
  debouncedSearch: string;
} {
  const { enabled = true, autoScale, foodDisplayLimit } = options ?? {};
  const debouncedSearch = useDebounce(searchTerm.trim(), DEBOUNCE_MS);
  // Require both the live and the debounced term to clear the threshold. The
  // debounced check gates the queries; the live check makes backspacing below
  // the threshold deactivate immediately, instead of leaving stale aggregated
  // results on screen for the debounce window.
  const isSearchActive =
    searchTerm.trim().length >= MIN_QUERY_LENGTH &&
    debouncedSearch.length >= MIN_QUERY_LENGTH;

  // Project the raw query results into ProviderFoodSearchResult inside
  // useQueries' `combine`, rather than a downstream useMemo over the raw queries
  // array. Without `combine`, useQueries returns a brand-new array reference on
  // every render; `combine` is run only when a query actually changes and its
  // output gets structural-sharing, so providerResults stays referentially
  // stable across renders. Results are index-aligned with `providers` because
  // the query list below is built from the same `providers.map` order.
  const combine = useCallback(
    (
      results: UseQueryResult<NormalisedProviderResult>[]
    ): ProviderFoodSearchResult[] =>
      providers.map((provider, i) => {
        const q = results[i];
        const items = q?.data?.items ?? [];
        return {
          provider,
          items,
          totalCount: q?.data?.totalCount ?? 0,
          // Loading while fetching with nothing to show yet — covers the
          // initial load and an error retry, but not a background refetch that
          // already has cached results (which would otherwise flash a spinner
          // over good data).
          isLoading: (q?.isFetching ?? false) && items.length === 0,
          isError: q?.isError ?? false,
          refetch: q?.refetch ?? noop,
        };
      }),
    [providers]
  );

  const providerResults = useQueries({
    queries: providers.map((provider) => ({
      queryKey: allProvidersFoodSearchKey(
        provider.provider_type,
        debouncedSearch,
        provider.id,
        autoScale
      ),
      queryFn: () =>
        fetchProviderResults(provider, debouncedSearch, {
          autoScale,
          foodDisplayLimit,
        }),
      enabled: isSearchActive && enabled,
      staleTime: STALE_TIME,
    })),
    combine,
  });

  // Treat the debounce window as loading so the input spinner keeps spinning
  // between the keystroke and the queries actually starting, instead of
  // briefly stopping (flicker) while the debounced term catches up.
  const isDebouncePending =
    enabled &&
    searchTerm.trim().length >= MIN_QUERY_LENGTH &&
    searchTerm.trim() !== debouncedSearch;
  const anyLoading =
    providerResults.some((r) => r.isLoading) || isDebouncePending;

  return { providerResults, isSearchActive, anyLoading, debouncedSearch };
}
