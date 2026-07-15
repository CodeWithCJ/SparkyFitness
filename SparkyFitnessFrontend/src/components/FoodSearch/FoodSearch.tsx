import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Search,
  Plus,
  Loader2,
  Camera,
  ChevronDown,
  ChevronRight,
  RotateCw,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Food, CSVData, NutritionixItem } from '@/types/food';
import type { Meal } from '@/types/meal';
import { useQueryClient } from '@tanstack/react-query';
import {
  useDatabaseFoodSearchQuery,
  useImportCsvMutation,
  useRecentAndTopFoodsQuery,
} from '@/hooks/Foods/useFoods.ts';
import { useCustomNutrients } from '@/hooks/Foods/useCustomNutrients.ts';
import {
  nutritionixBrandedNutrientsOptions,
  nutritionixNaturalNutrientsOptions,
  searchNutritionixOptions,
} from '@/hooks/Foods/useNutrionix.ts';
import { DEFAULT_NUTRIENTS } from '@/constants/nutrients.ts';
import { convertNutritionixToFood } from '@/utils/foodSearch.ts';
import { dedupeAppend } from '@/utils/dedupeAppend.ts';
import {
  mergeRecent,
  mergeFrequent,
  landingKey,
  type LandingEntry,
} from '@/utils/landingLists.ts';
import { useFavoritesQuery } from '@/hooks/Foods/useFavorites.ts';
import FoodResultCard from './FoodResultCard.tsx';
import { BarcodeScannerDialog } from './BarcodeScannerDialog.tsx';
import { CsvImportDialog } from './CsvImportDialog.tsx';
import { FoodFormDialog } from './FoodFormDialog.tsx';
import { useExternalProvidersQuery } from '@/hooks/Settings/useExternalProviderSettings.ts';
import {
  searchFoodsV2Options,
  searchBarcodeV2Options,
  foodDetailsV2Options,
} from '@/hooks/Foods/useFoodsV2.ts';
import {
  mealSearchOptions,
  useRecentAndTopMealsQuery,
} from '@/hooks/Foods/useMeals.ts';
import {
  useAllProvidersFoodSearch,
  type ExternalResultWrapper,
} from '@/hooks/Foods/useAllProvidersFoodSearch.ts';
import { interleaveTopMatches } from '@/utils/topMatches.ts';
import { makeProviderColorResolver } from '@/utils/providerColor.ts';
import { DataProvider } from '@/types/settings.ts';
import {
  getProviderCategory,
  resolveFoodProviderId,
} from '@/utils/settings.ts';

type FoodDataForBackend = Omit<CSVData, 'id'>;

// Stable empty fallback so the providers reference does not change each render
// (an inline [] default would re-run the online search effect during loading).
const EMPTY_PROVIDERS: DataProvider[] = [];

// Sentinel provider id for the aggregated "All Providers" mode (offered only
// when more than one food provider is active).
const ALL_PROVIDERS_VALUE = '__all__';

// One page of provider results plus whether the provider reports more pages
// behind it, so the caller can offer a "Load more" affordance.
type ProviderSearchPage = {
  items: ExternalResultWrapper[];
  hasMore: boolean;
};

interface EnhancedFoodSearchProps {
  onFoodSelect: (item: Food | Meal, type: 'food' | 'meal') => void;
  // When set, only online provider results are shown (used by the Foods page to
  // import a food from an external provider). No local foods, meals, or recents.
  hideDatabaseTab?: boolean;
  // When set, the saved-meals section is hidden (e.g. building a meal, where a
  // meal cannot contain another meal).
  hideMealTab?: boolean;
  mealType?: string;
}

const SectionHeader = ({ children }: { children: ReactNode }) => (
  <div className="px-1 pt-2 pb-1 text-xs font-semibold uppercase text-muted-foreground">
    {children}
  </div>
);

const EnhancedFoodSearch = ({
  onFoodSelect,
  hideDatabaseTab = false,
  hideMealTab = false,
  mealType = undefined,
}: EnhancedFoodSearchProps) => {
  const { t } = useTranslation();
  const {
    defaultFoodDataProviderId,
    defaultBarcodeProviderId,
    itemDisplayLimit,
    foodDisplayLimit,
    nutrientDisplayPreferences,
    energyUnit,
    convertEnergy,
    getEnergyUnitString,
    autoScaleOpenFoodFactsImports,
  } = usePreferences();
  const isMobile = useIsMobile();
  const platform = isMobile ? 'mobile' : 'desktop';

  // Display modes derived from the embedding context.
  const onlineOnly = hideDatabaseTab;
  const showLocalFoods = !onlineOnly;
  const showMeals = !hideMealTab && !onlineOnly;

  const [searchTerm, setSearchTerm] = useState('');
  // Debounced term for the local-food query so it does not refetch on every
  // keystroke (meals and online have their own debounced effects).
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  useEffect(() => {
    if (!searchTerm.trim()) {
      setDebouncedSearchTerm('');
      return;
    }
    const timer = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);
  // A new search supersedes any barcode-scanned product.
  useEffect(() => {
    if (searchTerm.trim()) setScannedFood(null);
  }, [searchTerm]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [isMealLoading, setIsMealLoading] = useState(false);

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Food | null>(null);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [barcodeProviderId, setBarcodeProviderId] = useState<string | null>(
    null
  );
  const [showAddFoodDialog, setShowAddFoodDialog] = useState(false);
  const [showImportFromCsvDialog, setShowImportFromCsvDialog] = useState(false);
  const isSearchEmpty = !searchTerm.trim();

  const [manualProviderId, setManualProviderId] = useState<string | null>(null);
  const [isOnlineLoading, setIsOnlineLoading] = useState(false);
  const [searchProviderId, setSearchProviderId] = useState<string | null>(null);
  const [externalResults, setExternalResults] = useState<
    ExternalResultWrapper[]
  >([]);
  // Pagination for the single-provider online results: the last page fetched,
  // whether the provider reports more behind it, and a separate spinner for the
  // "Load more" fetch so it does not swap out the results already on screen.
  const [externalPage, setExternalPage] = useState(1);
  const [externalHasMore, setExternalHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // Bumped on every new online search (term or provider change). A "Load more"
  // fetch captures the token at click time and discards its result if the token
  // has moved on, so a slow page cannot append onto a newer search's results.
  const searchToken = useRef(0);
  // A product resolved from a barcode scan, shown even with an empty query.
  // Kept separate from live online-search results (which clear on an empty
  // query) so a scan result is not hidden or flickered away.
  const [scannedFood, setScannedFood] = useState<ExternalResultWrapper | null>(
    null
  );

  const queryClient = useQueryClient();
  const { data: customNutrients } = useCustomNutrients();
  const { data: foodDataProviders = EMPTY_PROVIDERS } =
    useExternalProvidersQuery();
  // item_display_limit (default 10) is the per-section total cap for the
  // empty-query landing: each of Recent and Frequent shows up to this many
  // merged items. It is also the per-source fetch count, so each merged list
  // can be filled even when one type dominates.
  const { data: recentTopData, isLoading: isLoadingRecentFoods } =
    useRecentAndTopFoodsQuery(
      itemDisplayLimit,
      mealType,
      showLocalFoods && isSearchEmpty
    );
  // Recent + frequent meals for the landing quick-pick list, so the landing
  // (like the typed search) surfaces both foods and meals. Only fetched when
  // meals are shown and the query is empty.
  const {
    recentMeals,
    topMeals,
    isLoading: isLoadingRecentMeals,
  } = useRecentAndTopMealsQuery(itemDisplayLimit, showMeals && isSearchEmpty);
  const { mutateAsync: importCsvMutation } = useImportCsvMutation();
  const { data: searchData, isFetching: isFetchingSearch } =
    useDatabaseFoodSearchQuery(
      debouncedSearchTerm,
      foodDisplayLimit,
      mealType,
      showLocalFoods && !!debouncedSearchTerm.trim()
    );

  const recentFoods = recentTopData?.recentFoods || [];
  const topFoods = recentTopData?.topFoods || [];
  const foods = searchData?.searchResults || [];

  // Starred foods and meals. Shared cache with the row star in FoodResultCard,
  // so this is one fetch, not two.
  const { data: favoritesData, isLoading: isLoadingFavorites } =
    useFavoritesQuery();

  // Favorites: the first landing section, foods and meals intermixed, most
  // recently starred first. Modelled as LandingEntry so all three sections
  // share one card renderer and one key space.
  //
  // Meals are withheld wherever the rest of the search already hides them
  // (`showMeals` covers both hideMealTab and onlineOnly), so Favorites cannot
  // become the one surface that offers a meal a caller has explicitly excluded.
  const favoriteEntries: LandingEntry[] = useMemo(() => {
    const selectableMeals = showMeals ? favoritesData?.favoriteMeals || [] : [];
    const tagged = [
      ...selectableMeals.map((meal) => ({
        entry: {
          kind: 'meal' as const,
          key: landingKey('meal', meal.id),
          meal,
        },
        // Pre-parsed to a timestamp so the comparator below is a plain numeric
        // subtraction rather than allocating a Date on every comparison.
        favoritedAt: meal.favorited_at
          ? new Date(meal.favorited_at).getTime()
          : 0,
      })),
      ...(favoritesData?.favoriteFoods || []).map((food) => ({
        entry: {
          kind: 'food' as const,
          key: landingKey('food', food.id),
          food,
        },
        favoritedAt: food.favorited_at
          ? new Date(food.favorited_at).getTime()
          : 0,
      })),
    ];
    // Dedupe by key so an item can never render twice, even if a stale refetch
    // window or a repeated API row briefly doubles it up.
    const seen = new Set<string>();
    return tagged
      .filter(({ entry }) => {
        if (seen.has(entry.key)) return false;
        seen.add(entry.key);
        return true;
      })
      .sort((a, b) => b.favoritedAt - a.favoritedAt)
      .map((t) => t.entry);
  }, [favoritesData, showMeals]);

  // Recent is one merged timeline (meals + foods by last-used date); Frequent is
  // one merged most-used list (by usage count). Each section excludes what the
  // sections above it already show, so the landing never renders the same card
  // twice: Recent drops favorites, Frequent drops favorites and Recent. Passing
  // the exclusions in (rather than filtering the results) keeps each section
  // filled to itemDisplayLimit, since both merges cap last.
  const favoriteKeys = useMemo(
    () => new Set(favoriteEntries.map((e) => e.key)),
    [favoriteEntries]
  );
  const recentEntries = mergeRecent(
    recentMeals,
    recentFoods,
    favoriteKeys,
    itemDisplayLimit
  );
  const recentEntryKeys = new Set(recentEntries.map((e) => e.key));
  const frequentEntries = mergeFrequent(
    topMeals,
    topFoods,
    new Set([...favoriteKeys, ...recentEntryKeys]),
    itemDisplayLimit
  );

  // Once a query is typed, favorites float to the top of their own section
  // rather than being pulled into a group of their own: a favorited meal stays
  // under Your Meals, just first. The rest keep the backend's relevance order,
  // and filter preserves it, so favorites stay relevance-ordered among
  // themselves too.
  const searchFoodsFavFirst = useMemo(() => {
    const results: Food[] = searchData?.searchResults || [];
    const isFavorite = (food: Food) =>
      favoriteKeys.has(landingKey('food', food.id));
    return [
      ...results.filter(isFavorite),
      ...results.filter((food) => !isFavorite(food)),
    ];
  }, [searchData, favoriteKeys]);
  const searchMealsFavFirst = useMemo(() => {
    const isFavorite = (meal: Meal) =>
      favoriteKeys.has(landingKey('meal', meal.id));
    return [
      ...meals.filter(isFavorite),
      ...meals.filter((meal) => !isFavorite(meal)),
    ];
  }, [meals, favoriteKeys]);

  // Active food-category providers: the only valid options for the provider
  // dropdown, so the resolved default must be drawn from this list (not the raw
  // provider list) or the shadcn Select renders blank when it falls back to an
  // inactive/non-food provider that has no matching SelectItem.
  const foodProviderOptions = useMemo(
    () =>
      foodDataProviders.filter(
        (provider) =>
          getProviderCategory(provider).includes('food') && provider.is_active
      ),
    [foodDataProviders]
  );

  const selectedFoodDataProvider = resolveFoodProviderId(
    manualProviderId,
    defaultFoodDataProviderId,
    foodProviderOptions
  );
  const selectedProviderName =
    foodDataProviders.find((p) => p.id === selectedFoodDataProvider)
      ?.provider_name ?? '';

  // Barcode provider: prefer explicit user selection, then the dedicated barcode
  // provider preference (set in External Provider Settings → Default Barcode Provider),
  // then fall back to the first active barcode-capable provider.
  const selectedBarcodeProvider =
    barcodeProviderId ||
    defaultBarcodeProviderId ||
    foodDataProviders.find((p) =>
      ['openfoodfacts', 'usda', 'fatsecret', 'yazio'].includes(p.provider_type)
    )?.id ||
    null;

  const [hasOnlineSearchBeenPerformed, setHasOnlineSearchBeenPerformed] =
    useState(false);

  // Aggregated "All Providers" mode: offered only when more than one food
  // provider is active. selectedFoodDataProvider holds the sentinel while it is
  // active (so the single-provider online effect below no-ops). The
  // length > 1 guard prevents rendering the aggregated view if providers drop
  // to one while the sentinel is still selected (its dropdown option is hidden
  // in that case).
  const isAllProviders =
    selectedFoodDataProvider === ALL_PROVIDERS_VALUE &&
    foodProviderOptions.length > 1;

  // If providers drop to one while the "All Providers" sentinel is still
  // selected, clear it so we fall back to a real provider instead of stranding
  // the selector on __all__ (which would show a blank value and no results).
  useEffect(() => {
    if (
      manualProviderId === ALL_PROVIDERS_VALUE &&
      foodProviderOptions.length <= 1
    ) {
      setManualProviderId(null);
    }
  }, [manualProviderId, foodProviderOptions.length]);

  // Which By Source provider sections are expanded (All Providers mode). Reset
  // when the query changes so stale sections don't stay open.
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(
    () => new Set()
  );
  const toggleProvider = useCallback((id: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Per-provider signature colour resolver for the All Providers badges/dots.
  const getProviderColor = useMemo(
    () => makeProviderColorResolver(foodProviderOptions),
    [foodProviderOptions]
  );

  // All Providers fan-out: parallel per-provider searches that stream in.
  const {
    providerResults,
    anyLoading: anyProviderLoading,
    isSearchActive: isAllProvidersSearchActive,
    debouncedSearch: allProvidersDebouncedSearch,
  } = useAllProvidersFoodSearch(searchTerm, foodProviderOptions, {
    enabled: isAllProviders,
    autoScale: autoScaleOpenFoodFactsImports,
    foodDisplayLimit,
  });

  // Collapse expanded By Source sections when the aggregated query changes.
  // Keyed on the hook's debounced term (not the faster local debounce) so it
  // fires in step with the results the sections are showing, not ~300ms early.
  useEffect(() => {
    setExpandedProviders(new Set());
  }, [allProvidersDebouncedSearch]);

  // Top Matches: interleave each provider's top results (round-robin by rank).
  const topMatches = useMemo(
    () => interleaveTopMatches(providerResults),
    [providerResults]
  );

  // --- Local meals: searched alongside foods, guarded against stale resolves ---

  const mealSearchSeq = useRef(0);
  const handleMealSearch = useCallback(
    async (term: string) => {
      const seq = ++mealSearchSeq.current;
      setIsMealLoading(true);
      try {
        const results = await queryClient.fetchQuery(
          mealSearchOptions('all', term)
        );
        if (seq === mealSearchSeq.current) {
          setMeals(results);
        }
      } catch {
        if (seq === mealSearchSeq.current) {
          setMeals([]);
        }
      } finally {
        if (seq === mealSearchSeq.current) {
          setIsMealLoading(false);
        }
      }
    },
    [queryClient]
  );

  useEffect(() => {
    // Invalidate any in-flight meal search immediately, so a slow prior request
    // can't flash stale results during the new debounce window.
    mealSearchSeq.current += 1;
    if (!showMeals || isSearchEmpty) {
      setMeals([]);
      setIsMealLoading(false);
      return;
    }
    setMeals([]);
    setIsMealLoading(true);
    const handler = setTimeout(() => {
      handleMealSearch(searchTerm);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm, showMeals, isSearchEmpty, handleMealSearch]);

  // --- Online provider search (per-provider handlers) ---

  // Each handler returns its mapped results rather than setting state, so the
  // online effect can discard a stale resolve via its `active` flag.
  const searchHandlers = useMemo<
    Record<
      string,
      (
        term: string,
        providerId: string,
        provider: DataProvider,
        page?: number
      ) => Promise<ProviderSearchPage>
    >
  >(
    () => ({
      openfoodfacts: async (term, _id, _provider, page) => {
        const data = await queryClient.fetchQuery(
          searchFoodsV2Options(
            'openfoodfacts',
            term,
            undefined,
            undefined,
            autoScaleOpenFoodFactsImports,
            page
          )
        );
        return {
          items: data.foods.map((food: Food) => ({
            provider_type: 'openfoodfacts' as const,
            food,
          })),
          hasMore: data.pagination?.hasMore ?? false,
        };
      },
      nutritionix: async (term, id) => {
        // Nutritionix uses a separate endpoint that returns the full result set
        // in one shot, so there is no further page to load.
        const data: NutritionixItem[] = await queryClient.fetchQuery(
          searchNutritionixOptions(term, id)
        );
        return {
          items: data.map((item) => ({
            provider_type: 'nutritionix' as const,
            raw: item,
            food: convertNutritionixToFood(item),
          })),
          hasMore: false,
        };
      },
      fatsecret: async (term, id, _provider, page) => {
        const data = await queryClient.fetchQuery(
          searchFoodsV2Options(
            'fatsecret',
            term,
            id,
            undefined,
            undefined,
            page
          )
        );
        return {
          items: data.foods.map((food: Food) => ({
            provider_type: 'fatsecret' as const,
            food,
          })),
          hasMore: data.pagination?.hasMore ?? false,
        };
      },
      usda: async (term, id, _provider, page) => {
        const data = await queryClient.fetchQuery(
          searchFoodsV2Options(
            'usda',
            term,
            id,
            foodDisplayLimit,
            undefined,
            page
          )
        );
        return {
          items: data.foods.map((food: Food) => ({
            provider_type: 'usda' as const,
            food,
          })),
          hasMore: data.pagination?.hasMore ?? false,
        };
      },
      mealie: async (term, id, _provider, page) => {
        const data = await queryClient.fetchQuery(
          searchFoodsV2Options('mealie', term, id, undefined, undefined, page)
        );
        return {
          items: data.foods.map((food: Food) => ({
            provider_type: 'mealie' as const,
            food,
          })),
          hasMore: data.pagination?.hasMore ?? false,
        };
      },
      tandoor: async (term, id, _provider, page) => {
        const data = await queryClient.fetchQuery(
          searchFoodsV2Options('tandoor', term, id, undefined, undefined, page)
        );
        return {
          items: data.foods.map((food: Food) => ({
            provider_type: 'tandoor' as const,
            food,
          })),
          hasMore: data.pagination?.hasMore ?? false,
        };
      },
      yazio: async (term, id, _provider, page) => {
        const data = await queryClient.fetchQuery(
          searchFoodsV2Options(
            'yazio',
            term,
            id,
            foodDisplayLimit,
            undefined,
            page
          )
        );
        return {
          items: data.foods.map((food: Food) => ({
            provider_type: 'yazio' as const,
            food,
          })),
          hasMore: data.pagination?.hasMore ?? false,
        };
      },
      norish: async (term, id, _provider, page) => {
        const data = await queryClient.fetchQuery(
          searchFoodsV2Options('norish', term, id, undefined, undefined, page)
        );
        return {
          items: data.foods.map((food: Food) => ({
            provider_type: 'norish' as const,
            food,
          })),
          hasMore: data.pagination?.hasMore ?? false,
        };
      },
      swissfood: async (term, id, _provider, page) => {
        const data = await queryClient.fetchQuery(
          searchFoodsV2Options(
            'swissfood',
            term,
            id,
            undefined,
            undefined,
            page
          )
        );
        return {
          items: data.foods.map((food: Food) => ({
            provider_type: 'swissfood' as const,
            food,
          })),
          hasMore: data.pagination?.hasMore ?? false,
        };
      },
    }),
    [queryClient, autoScaleOpenFoodFactsImports, foodDisplayLimit]
  );

  // Online results stream in alongside local results, using the default
  // provider. Online searches start at 3 characters to limit provider calls.
  useEffect(() => {
    // In All Providers mode the aggregated hook owns the online results, so this
    // single-provider effect must fully no-op. Without this guard it runs on
    // every keystroke (searchTerm is a dependency), finds no matching provider
    // for the __all__ sentinel, and calls setExternalResults([]) each time; a
    // fresh [] is never === the previous one, so it re-renders the whole
    // component on every keystroke and lags typing.
    if (selectedFoodDataProvider === ALL_PROVIDERS_VALUE) {
      return;
    }
    const term = searchTerm.trim();
    // Each new search (or provider switch) starts a fresh page 1, so reset the
    // paging cursor and "has more" flag alongside the results below, and
    // invalidate any "Load more" fetch still in flight from the previous search.
    // Clear isLoadingMore too, so a Load more that was in flight during the
    // switch does not leave the new search's button stuck disabled/spinning
    // until the stale request resolves.
    searchToken.current += 1;
    setExternalPage(1);
    setExternalHasMore(false);
    setIsLoadingMore(false);
    if (term.length < 3) {
      setExternalResults([]);
      setHasOnlineSearchBeenPerformed(false);
      setIsOnlineLoading(false);
      return;
    }
    const provider = foodDataProviders.find(
      (p) => p.id === selectedFoodDataProvider
    );
    const providerSearch = provider
      ? searchHandlers[provider.provider_type]
      : undefined;
    if (!provider || !providerSearch) {
      setExternalResults([]);
      setIsOnlineLoading(false);
      return;
    }
    let active = true;
    // Show the online section as loading the moment the term changes, rather
    // than waiting out the 600ms debounce. Otherwise the previous provider's
    // results linger in the ~300ms gap between the local debounce settling and
    // this timeout firing, reading as if they belong to the new term. The
    // < 3 char / no-provider guards above already prevent a spurious spinner.
    setIsOnlineLoading(true);
    const handler = setTimeout(async () => {
      setSearchProviderId(provider.id);
      setHasOnlineSearchBeenPerformed(true);
      try {
        const { items, hasMore } = await providerSearch(
          term,
          provider.id,
          provider,
          1
        );
        if (active) {
          setExternalResults(items);
          setExternalHasMore(hasMore);
        }
      } catch {
        if (active) {
          setExternalResults([]);
          setExternalHasMore(false);
          toast({
            title: t('common.error'),
            description: t(
              'enhancedFoodSearch.onlineSearchFailed',
              'Failed to search the online provider.'
            ),
            variant: 'destructive',
          });
        }
      } finally {
        if (active) setIsOnlineLoading(false);
      }
    }, 600);
    return () => {
      active = false;
      clearTimeout(handler);
    };
  }, [
    searchTerm,
    selectedFoodDataProvider,
    foodDataProviders,
    searchHandlers,
    t,
  ]);

  // Fetch the next page for the current single-provider search and append it to
  // the results already on screen. Providers that report no further pages hide
  // the trigger, so this only runs when there is genuinely more to load.
  const handleLoadMore = useCallback(async () => {
    const term = searchTerm.trim();
    if (term.length < 3 || isLoadingMore) return;
    const provider = foodDataProviders.find(
      (p) => p.id === selectedFoodDataProvider
    );
    const providerSearch = provider
      ? searchHandlers[provider.provider_type]
      : undefined;
    if (!provider || !providerSearch) return;
    const nextPage = externalPage + 1;
    const token = searchToken.current;
    setIsLoadingMore(true);
    try {
      const { items, hasMore } = await providerSearch(
        term,
        provider.id,
        provider,
        nextPage
      );
      // A newer search started while this page was in flight; drop it so it
      // cannot append onto the newer search's results.
      if (token !== searchToken.current) return;
      // Dedupe by external id so an overlapping page boundary cannot produce
      // duplicate React keys or repeated rows.
      setExternalResults((prev) =>
        dedupeAppend(
          prev,
          items,
          (r) => `${r.provider_type}-${r.food.provider_external_id}`
        )
      );
      setExternalHasMore(hasMore);
      setExternalPage(nextPage);
    } catch {
      toast({
        title: t('common.error'),
        description: t(
          'enhancedFoodSearch.loadMoreFailed',
          'Failed to load more results.'
        ),
        variant: 'destructive',
      });
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    searchTerm,
    isLoadingMore,
    externalPage,
    selectedFoodDataProvider,
    foodDataProviders,
    searchHandlers,
    t,
  ]);

  const searchBarcode = async (barcode: string) => {
    setIsOnlineLoading(true);

    toast({
      title: 'Searching barcode',
      description: `Looking up: ${barcode}...`,
    });

    try {
      const data = await queryClient.fetchQuery(
        searchBarcodeV2Options(barcode, selectedBarcodeProvider || undefined)
      );

      if (data.food) {
        if (data.source === 'local') {
          onFoodSelect(data.food, 'food');
          setShowBarcodeScanner(false);
          toast({
            title: 'Food found in database',
            description: `Found: ${data.food.name}`,
          });
          return;
        }

        type BarcodeProviderType =
          | 'openfoodfacts'
          | 'usda'
          | 'fatsecret'
          | 'mealie'
          | 'tandoor'
          | 'yazio'
          | 'norish'
          | 'swissfood';
        const mapped: ExternalResultWrapper = {
          provider_type: data.source as BarcodeProviderType,
          food: data.food,
        } as ExternalResultWrapper;

        setScannedFood(mapped);

        toast({
          title: 'Barcode scanned successfully',
          description: `Found product: ${data.food.name}`,
        });
      } else {
        setScannedFood(null);
        toast({
          title: 'Product not found',
          description: `No product found for this barcode using selected provider.`,
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to search barcode.',
        variant: 'destructive',
      });
    } finally {
      setIsOnlineLoading(false);
    }
  };

  const handleSaveEditedFood = async (foodData: Food) => {
    try {
      onFoodSelect(foodData, 'food');

      setShowEditDialog(false);
      setEditingProduct(null);

      toast({
        title: 'Food added',
        description: `${foodData.name} has been added and is ready to be added to your meal`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to process the edited food',
        variant: 'destructive',
      });
    }
  };

  const handleImportFromCSV = async (
    foodDataArray: FoodDataForBackend[],
    overwrite: boolean
  ) => {
    await importCsvMutation({ foods: foodDataArray, overwrite });
    setShowImportFromCsvDialog(false);
  };

  const handleNutritionixEdit = async (
    item: NutritionixItem,
    providerIdOverride?: string
  ) => {
    // In All Providers mode searchProviderId isn't set (the single-provider
    // search no-ops), so callers pass the result's own provider id to fetch
    // detailed nutrients with the right credentials.
    const providerId = providerIdOverride || searchProviderId;
    let nutrientData: NutritionixItem;
    if (item.brand) {
      nutrientData = await queryClient.fetchQuery(
        nutritionixBrandedNutrientsOptions(item.id ?? ' ', providerId)
      );
    } else {
      nutrientData = await queryClient.fetchQuery(
        nutritionixNaturalNutrientsOptions(item.name, providerId)
      );
    }

    if (nutrientData) {
      setEditingProduct(convertNutritionixToFood(item, nutrientData));
      setShowEditDialog(true);
    } else {
      toast({
        title: 'Error',
        description: 'Failed to retrieve detailed nutrition for this item.',
        variant: 'destructive',
      });
    }
  };

  const handleExternalFoodEdit = async (
    food: Food,
    providerIdOverride?: string
  ) => {
    const needsDetailFetch =
      (food.provider_type === 'fatsecret' ||
        food.provider_type === 'usda' ||
        food.provider_type === 'yazio' ||
        food.provider_type === 'swissfood') &&
      food.provider_external_id;

    if (needsDetailFetch) {
      // In All Providers mode searchProviderId isn't set, so callers pass the
      // result's own provider id to fetch full nutrients with the right creds.
      const providerId = providerIdOverride || searchProviderId || undefined;
      if (!providerId && food.provider_type !== 'swissfood') {
        // No provider credentials available — data is already complete (barcode flow)
        setEditingProduct(food);
        setShowEditDialog(true);
        return;
      }
      // Search results have partial data; fetch full nutrients
      try {
        const detailedFood = await queryClient.fetchQuery(
          foodDetailsV2Options(
            food.provider_type!,
            food.provider_external_id!,
            providerId
          )
        );
        setEditingProduct({
          ...detailedFood,
          provider_type: detailedFood.provider_type ?? food.provider_type,
          provider_external_id:
            detailedFood.provider_external_id ?? food.provider_external_id,
          provider_verified:
            detailedFood.provider_verified ?? food.provider_verified,
        });
        setShowEditDialog(true);
      } catch {
        toast({
          title: 'Error',
          description:
            'Failed to retrieve detailed nutrition. Using partial data.',
          variant: 'destructive',
        });
        setEditingProduct(food);
        setShowEditDialog(true);
      }
      return;
    }

    setEditingProduct(food);
    setShowEditDialog(true);
  };

  const quickInfoPreferences =
    nutrientDisplayPreferences.find(
      (p) => p.view_group === 'quick_info' && p.platform === platform
    ) ||
    nutrientDisplayPreferences.find(
      (p) => p.view_group === 'quick_info' && p.platform === 'desktop'
    );

  const visibleNutrients = useMemo(() => {
    const base = quickInfoPreferences
      ? quickInfoPreferences.visible_nutrients
      : DEFAULT_NUTRIENTS;

    const allKeys = [...base, ...(customNutrients?.map((cn) => cn.name) || [])];

    return Array.from(new Set(allKeys));
  }, [quickInfoPreferences, customNutrients]);

  const nutrientConfig = {
    visibleNutrients,
    energyUnit,
    convertEnergy,
    getEnergyUnitString,
    customNutrients: customNutrients || [],
  };

  // --- Derived render state ---

  const isDebouncePending =
    !isSearchEmpty && debouncedSearchTerm !== searchTerm;
  const localPending = isFetchingSearch || isMealLoading || isDebouncePending;
  const noLocalResults = foods.length === 0 && meals.length === 0;
  const showLocalEmpty =
    showLocalFoods && !isSearchEmpty && !localPending && noLocalResults;
  const showLocalSpinner =
    showLocalFoods && !isSearchEmpty && localPending && noLocalResults;

  const renderExternalCard = (
    result: ExternalResultWrapper,
    opts?: {
      keyPrefix?: string;
      providerLabel?: string;
      badgeColor?: string;
      // Provider id for this specific result, so the edit handler fetches
      // detailed nutrients with the right credentials in All Providers mode
      // (where the shared searchProviderId isn't set).
      providerId?: string;
    }
  ) => (
    <FoodResultCard
      key={`${opts?.keyPrefix ?? ''}-${result.provider_type}-${result.food.provider_external_id}`}
      item={result.food}
      isOnline={true}
      providerLabel={opts?.providerLabel ?? result.provider_type.toUpperCase()}
      providerBadgeColor={opts?.badgeColor}
      nutrientConfig={nutrientConfig}
      onEditClick={() => {
        if (result.provider_type === 'nutritionix') {
          handleNutritionixEdit(result.raw, opts?.providerId);
        } else {
          handleExternalFoodEdit(result.food, opts?.providerId);
        }
      }}
    />
  );

  // A single Recent/Frequent landing row: a meal card or a food card depending
  // on the merged entry's kind.
  const renderLandingEntry = (entry: LandingEntry) =>
    entry.kind === 'meal' ? (
      <FoodResultCard
        key={entry.key}
        item={entry.meal}
        isMeal={true}
        nutrientConfig={nutrientConfig}
        onCardClick={() => onFoodSelect(entry.meal, 'meal')}
      />
    ) : (
      <FoodResultCard
        key={entry.key}
        item={entry.food}
        nutrientConfig={nutrientConfig}
        onCardClick={() => onFoodSelect(entry.food, 'food')}
      />
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row flex-wrap gap-2">
        <Button
          onClick={() => setShowAddFoodDialog(true)}
          className="whitespace-nowrap"
        >
          <Plus className="w-4 h-4 mr-2" />{' '}
          {t('enhancedFoodSearch.customFood', 'Custom Food')}
        </Button>
        <Button
          onClick={() => setShowImportFromCsvDialog(true)}
          className="whitespace-nowrap"
          variant="outline"
        >
          <Plus className="w-4 h-4 mr-2" />{' '}
          {t('enhancedFoodSearch.importFromCSV', 'Import from CSV')}
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowBarcodeScanner(true)}
          className="whitespace-nowrap"
        >
          <Camera className="w-4 h-4 mr-2" />{' '}
          {t('enhancedFoodSearch.scanBarcode', 'Scan Barcode')}
        </Button>
      </div>

      <div className="flex space-x-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t(
              'enhancedFoodSearch.searchFoodsPlaceholder',
              'Search for foods...'
            )}
            value={searchTerm}
            autoFocus
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        {(isOnlineLoading || localPending || anyProviderLoading) && (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        )}
        {foodProviderOptions.length > 0 && (
          <Select
            value={selectedFoodDataProvider || ''}
            // Temporary view-only switch: peek at another provider's results
            // without changing the saved default provider.
            onValueChange={(value) => {
              // Clear the previous provider's results so the loading spinner
              // shows under the new header instead of stale rows (which reads as
              // if the swap did nothing on a slow connection). Hide the paging
              // trigger too, until the new provider reports its own next page.
              setExternalResults([]);
              setExternalHasMore(false);
              setManualProviderId(value);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue
                placeholder={t(
                  'enhancedFoodSearch.selectProvider',
                  'Select Provider'
                )}
              />
            </SelectTrigger>
            <SelectContent>
              {/* Aggregated view, offered only with more than one provider. */}
              {foodProviderOptions.length > 1 && (
                <SelectItem value={ALL_PROVIDERS_VALUE}>
                  {t('enhancedFoodSearch.allProviders', 'All Providers')}
                </SelectItem>
              )}
              {foodProviderOptions.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {' '}
                  {provider.provider_name}{' '}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {/* Landing: recent + top foods and meals (local mode, empty query) */}
        {showLocalFoods && isSearchEmpty && (
          <>
            {(isLoadingRecentFoods ||
              isLoadingFavorites ||
              (showMeals && isLoadingRecentMeals)) && (
              <div className="text-center py-8 text-gray-500">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                {t('enhancedFoodSearch.searchingFoods', 'Searching foods...')}
              </div>
            )}
            {!isLoadingRecentFoods &&
              !isLoadingFavorites &&
              !(showMeals && isLoadingRecentMeals) && (
                <>
                  {/* Favorites: starred meals + foods, most recently starred first */}
                  {favoriteEntries.length > 0 && (
                    <>
                      <SectionHeader>
                        {t('enhancedFoodSearch.favorites', 'Favorites')}
                      </SectionHeader>
                      {favoriteEntries.map(renderLandingEntry)}
                    </>
                  )}
                  {/* Recent: one timeline of meals + foods by last-used date */}
                  {recentEntries.length > 0 && (
                    <>
                      <SectionHeader>
                        {t('enhancedFoodSearch.recent', 'Recent')}
                      </SectionHeader>
                      {recentEntries.map(renderLandingEntry)}
                    </>
                  )}
                  {/* Frequent: one list of most-used meals + foods (not in Recent) */}
                  {frequentEntries.length > 0 && (
                    <>
                      <SectionHeader>
                        {t('enhancedFoodSearch.frequent', 'Frequent')}
                      </SectionHeader>
                      {frequentEntries.map(renderLandingEntry)}
                    </>
                  )}
                  {favoriteEntries.length === 0 &&
                    recentEntries.length === 0 &&
                    frequentEntries.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        {showMeals
                          ? t(
                              'enhancedFoodSearch.noRecentOrTopItems',
                              'No recent or frequent foods or meals found. Start logging to see them here.'
                            )
                          : t(
                              'enhancedFoodSearch.noRecentOrTopFoods',
                              'No recent or top foods found. Start logging foods to see them here.'
                            )}
                      </div>
                    )}
                </>
              )}
          </>
        )}

        {/* Online-only mode prompt (e.g. Foods page import) */}
        {onlineOnly && isSearchEmpty && (
          <div className="text-center py-8 text-gray-500">
            {t(
              'enhancedFoodSearch.searchOnlineToImport',
              'Search to find foods from your online provider.'
            )}
          </div>
        )}

        {/* Barcode scan result (shown even with an empty query) */}
        {isSearchEmpty && scannedFood && (
          <>
            <SectionHeader>
              {t('enhancedFoodSearch.scannedProduct', 'Scanned product')}
            </SectionHeader>
            {renderExternalCard(scannedFood)}
          </>
        )}

        {/* Search results */}
        {!isSearchEmpty && (
          <>
            {/* Local foods */}
            {showLocalFoods && foods.length > 0 && (
              <>
                <SectionHeader>
                  {t('enhancedFoodSearch.yourFoods', 'Your Foods')}
                </SectionHeader>
                {searchFoodsFavFirst.map((food: Food) => (
                  <FoodResultCard
                    key={food.id}
                    item={food}
                    nutrientConfig={nutrientConfig}
                    onCardClick={() => onFoodSelect(food, 'food')}
                  />
                ))}
              </>
            )}

            {/* Local meals */}
            {showMeals && meals.length > 0 && (
              <>
                <SectionHeader>
                  {t('enhancedFoodSearch.yourMeals', 'Your Meals')}
                </SectionHeader>
                {searchMealsFavFirst.map((meal) => (
                  <FoodResultCard
                    key={`meal-${meal.id}`}
                    item={meal}
                    isMeal={true}
                    nutrientConfig={nutrientConfig}
                    onCardClick={() => onFoodSelect(meal, 'meal')}
                  />
                ))}
              </>
            )}

            {/* Local loading / empty */}
            {showLocalSpinner && (
              <div className="text-center py-8 text-gray-500">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                {t('enhancedFoodSearch.searchingFoods', 'Searching foods...')}
              </div>
            )}
            {showLocalEmpty && (
              <div className="text-center py-6 text-gray-500">
                {showMeals
                  ? t(
                      'enhancedFoodSearch.noSavedFoodsOrMeals',
                      'No saved foods or meals found.'
                    )
                  : t(
                      'enhancedFoodSearch.noSavedFoods',
                      'No saved foods found.'
                    )}
              </div>
            )}

            {/* Single-provider online results */}
            {!isAllProviders && selectedProviderName && (
              <>
                <SectionHeader>{selectedProviderName}</SectionHeader>
                {isOnlineLoading && externalResults.length === 0 && (
                  <div className="text-center py-6 text-gray-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                  </div>
                )}
                {externalResults.map((result) => renderExternalCard(result))}
                {externalHasMore && !isOnlineLoading && (
                  <div className="flex justify-center py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isLoadingMore}
                      onClick={handleLoadMore}
                    >
                      {isLoadingMore ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        t('enhancedFoodSearch.loadMore', 'Load more')
                      )}
                    </Button>
                  </div>
                )}
                {!isOnlineLoading &&
                  hasOnlineSearchBeenPerformed &&
                  externalResults.length === 0 && (
                    <div className="text-center py-6 text-gray-500">
                      {t(
                        'enhancedFoodSearch.noFoodsFoundOnline',
                        'No foods found from the selected online provider.'
                      )}
                    </div>
                  )}
              </>
            )}

            {/* Aggregated "All Providers" results: Top Matches + By Source */}
            {isAllProviders && isAllProvidersSearchActive && (
              <>
                <SectionHeader>
                  <span className="flex items-center justify-between">
                    {t('enhancedFoodSearch.topMatches', 'Top Matches')}
                    {anyProviderLoading && (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    )}
                  </span>
                </SectionHeader>
                {topMatches.length > 0
                  ? topMatches.map((match) =>
                      renderExternalCard(match.result, {
                        keyPrefix: `top-${match.providerId}`,
                        providerLabel: match.providerName,
                        badgeColor: getProviderColor(match.providerId),
                        providerId: match.providerId,
                      })
                    )
                  : !anyProviderLoading && (
                      <div className="text-center py-4 text-gray-500 text-sm">
                        {t('enhancedFoodSearch.noResults', 'No results')}
                      </div>
                    )}

                <SectionHeader>
                  {t('enhancedFoodSearch.bySource', 'By Source')}
                </SectionHeader>
                {providerResults.map((r) => {
                  const expanded = expandedProviders.has(r.provider.id);
                  const color = getProviderColor(r.provider.id);
                  const loading = r.isLoading;
                  const errored = r.isError && !loading;
                  const count = r.totalCount;
                  const empty = !loading && !errored && count === 0;
                  const expandable = !loading && !errored && count > 0;
                  return (
                    <div
                      key={r.provider.id}
                      className="border rounded-md overflow-hidden"
                    >
                      <button
                        type="button"
                        disabled={!expandable && !errored}
                        aria-expanded={expandable ? expanded : undefined}
                        onClick={() => {
                          if (errored) r.refetch();
                          else if (expandable) toggleProvider(r.provider.id);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/50 disabled:hover:bg-transparent disabled:cursor-default"
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <span className="text-sm font-medium">
                            {r.provider.provider_name}
                          </span>
                          {expandable && (
                            <span className="text-xs rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                              {count}
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-1 text-muted-foreground text-xs">
                          {loading && (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          )}
                          {errored && (
                            <>
                              <span>
                                {t(
                                  'enhancedFoodSearch.couldntLoad',
                                  "Couldn't load"
                                )}
                              </span>
                              <RotateCw className="w-4 h-4" />
                            </>
                          )}
                          {empty && (
                            <span>
                              {t('enhancedFoodSearch.noResults', 'No results')}
                            </span>
                          )}
                          {expandable &&
                            (expanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            ))}
                        </span>
                      </button>
                      {expanded && expandable && (
                        <div className="px-2 pb-2 space-y-2">
                          {r.items.map((item) =>
                            renderExternalCard(item, {
                              keyPrefix: r.provider.id,
                              providerId: r.provider.id,
                            })
                          )}
                          {count > r.items.length && (
                            <button
                              type="button"
                              onClick={(e) => {
                                setExternalResults([]);
                                setManualProviderId(r.provider.id);
                                // Switching to the single-provider view reuses
                                // the same scroll container; reset it to the top
                                // so the user isn't left stranded at the bottom.
                                const container =
                                  e.currentTarget.closest('.overflow-y-auto');
                                if (container) container.scrollTop = 0;
                              }}
                              className="text-sm font-medium text-primary px-1 py-2"
                            >
                              {t(
                                'enhancedFoodSearch.showAllResults',
                                'Show all {{count}} {{provider}} results',
                                {
                                  count,
                                  provider: r.provider.provider_name,
                                }
                              )}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>
      <FoodFormDialog
        isOpen={showEditDialog}
        onOpenChange={setShowEditDialog}
        mode="edit"
        editingProduct={editingProduct}
        onSave={handleSaveEditedFood}
      />
      <FoodFormDialog
        isOpen={showAddFoodDialog}
        onOpenChange={setShowAddFoodDialog}
        mode="add"
        onSave={handleSaveEditedFood}
      />
      <BarcodeScannerDialog
        isOpen={showBarcodeScanner}
        onOpenChange={setShowBarcodeScanner}
        onBarcodeDetected={(barcode) => {
          searchBarcode(barcode);
          setShowBarcodeScanner(false);
        }}
        selectedProviderId={selectedBarcodeProvider}
        onProviderChange={setBarcodeProviderId}
        providers={foodDataProviders}
      />
      <CsvImportDialog
        isOpen={showImportFromCsvDialog}
        onOpenChange={setShowImportFromCsvDialog}
        onSave={handleImportFromCSV}
      />
    </div>
  );
};

export default EnhancedFoodSearch;
