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
import { Search, Plus, Loader2, Camera } from 'lucide-react';
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
import { mealSearchOptions } from '@/hooks/Foods/useMeals.ts';
import { DataProvider } from '@/types/settings.ts';
import { getProviderCategory } from '@/utils/settings.ts';

type FoodDataForBackend = Omit<CSVData, 'id'>;

// Stable empty fallback so the providers reference does not change each render
// (an inline [] default would re-run the online search effect during loading).
const EMPTY_PROVIDERS: DataProvider[] = [];

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
  const { data: recentTopData, isFetching: isFetchingRecent } =
    useRecentAndTopFoodsQuery(
      itemDisplayLimit,
      mealType,
      showLocalFoods && isSearchEmpty
    );
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

  const selectedFoodDataProvider =
    manualProviderId ||
    defaultFoodDataProviderId ||
    foodDataProviders[0]?.id ||
    null;
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
        provider: DataProvider
      ) => Promise<ExternalResultWrapper[]>
    >
  >(
    () => ({
      openfoodfacts: async (term) => {
        const data = await queryClient.fetchQuery(
          searchFoodsV2Options(
            'openfoodfacts',
            term,
            undefined,
            undefined,
            autoScaleOpenFoodFactsImports
          )
        );
        return data.foods.map((food: Food) => ({
          provider_type: 'openfoodfacts' as const,
          food,
        }));
      },
      nutritionix: async (term, id) => {
        const data: NutritionixItem[] = await queryClient.fetchQuery(
          searchNutritionixOptions(term, id)
        );
        return data.map((item) => ({
          provider_type: 'nutritionix' as const,
          raw: item,
          food: convertNutritionixToFood(item),
        }));
      },
      fatsecret: async (term, id) => {
        const data = await queryClient.fetchQuery(
          searchFoodsV2Options('fatsecret', term, id)
        );
        return data.foods.map((food: Food) => ({
          provider_type: 'fatsecret' as const,
          food,
        }));
      },
      usda: async (term, id) => {
        const data = await queryClient.fetchQuery(
          searchFoodsV2Options('usda', term, id, foodDisplayLimit)
        );
        return data.foods.map((food: Food) => ({
          provider_type: 'usda' as const,
          food,
        }));
      },
      mealie: async (term, id) => {
        const data = await queryClient.fetchQuery(
          searchFoodsV2Options('mealie', term, id)
        );
        return data.foods.map((food: Food) => ({
          provider_type: 'mealie' as const,
          food,
        }));
      },
      tandoor: async (term, id) => {
        const data = await queryClient.fetchQuery(
          searchFoodsV2Options('tandoor', term, id)
        );
        return data.foods.map((food: Food) => ({
          provider_type: 'tandoor' as const,
          food,
        }));
      },
      yazio: async (term, id) => {
        const data = await queryClient.fetchQuery(
          searchFoodsV2Options('yazio', term, id, foodDisplayLimit)
        );
        return data.foods.map((food: Food) => ({
          provider_type: 'yazio' as const,
          food,
        }));
      },
      norish: async (term, id) => {
        const data = await queryClient.fetchQuery(
          searchFoodsV2Options('norish', term, id)
        );
        return data.foods.map((food: Food) => ({
          provider_type: 'norish' as const,
          food,
        }));
      },
      swissfood: async (term, id) => {
        const data = await queryClient.fetchQuery(
          searchFoodsV2Options('swissfood', term, id)
        );
        return data.foods.map((food: Food) => ({
          provider_type: 'swissfood' as const,
          food,
        }));
      },
    }),
    [queryClient, autoScaleOpenFoodFactsImports, foodDisplayLimit]
  );

  // Online results stream in alongside local results, using the default
  // provider. Online searches start at 3 characters to limit provider calls.
  useEffect(() => {
    const term = searchTerm.trim();
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
        const results = await providerSearch(term, provider.id, provider);
        if (active) setExternalResults(results);
      } catch {
        if (active) {
          setExternalResults([]);
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

  const handleImportFromCSV = async (foodDataArray: FoodDataForBackend[]) => {
    await importCsvMutation(foodDataArray);
    setShowImportFromCsvDialog(false);
  };

  const handleNutritionixEdit = async (item: NutritionixItem) => {
    let nutrientData: NutritionixItem;
    if (item.brand) {
      nutrientData = await queryClient.fetchQuery(
        nutritionixBrandedNutrientsOptions(item.id ?? ' ', searchProviderId)
      );
    } else {
      nutrientData = await queryClient.fetchQuery(
        nutritionixNaturalNutrientsOptions(item.name, searchProviderId)
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

  const handleExternalFoodEdit = async (food: Food) => {
    const needsDetailFetch =
      (food.provider_type === 'fatsecret' ||
        food.provider_type === 'usda' ||
        food.provider_type === 'yazio' ||
        food.provider_type === 'swissfood') &&
      food.provider_external_id;

    if (needsDetailFetch) {
      const providerId = searchProviderId || undefined;
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
        setEditingProduct(detailedFood);
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

  const foodProviderOptions = foodDataProviders.filter(
    (provider) =>
      getProviderCategory(provider).includes('food') && provider.is_active
  );
  const isDebouncePending =
    !isSearchEmpty && debouncedSearchTerm !== searchTerm;
  const localPending = isFetchingSearch || isMealLoading || isDebouncePending;
  const noLocalResults = foods.length === 0 && meals.length === 0;
  const showLocalEmpty =
    showLocalFoods && !isSearchEmpty && !localPending && noLocalResults;
  const showLocalSpinner =
    showLocalFoods && !isSearchEmpty && localPending && noLocalResults;

  const renderExternalCard = (result: ExternalResultWrapper) => (
    <FoodResultCard
      key={`${result.provider_type}-${result.food.provider_external_id}`}
      item={result.food}
      isOnline={true}
      providerLabel={result.provider_type.toUpperCase()}
      nutrientConfig={nutrientConfig}
      onEditClick={() => {
        if (result.provider_type === 'nutritionix') {
          handleNutritionixEdit(result.raw);
        } else {
          handleExternalFoodEdit(result.food);
        }
      }}
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
        {(isOnlineLoading || localPending) && (
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
              // if the swap did nothing on a slow connection).
              setExternalResults([]);
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
        {/* Landing: recent + top foods (local mode, empty query) */}
        {showLocalFoods && isSearchEmpty && (
          <>
            {isFetchingRecent && (
              <div className="text-center py-8 text-gray-500">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                {t('enhancedFoodSearch.searchingFoods', 'Searching foods...')}
              </div>
            )}
            {!isFetchingRecent && (
              <>
                {recentFoods.map((food: Food) => (
                  <FoodResultCard
                    key={food.id}
                    item={food}
                    nutrientConfig={nutrientConfig}
                    onCardClick={() => onFoodSelect(food, 'food')}
                  />
                ))}
                {topFoods.map((food: Food) => (
                  <FoodResultCard
                    key={food.id}
                    item={food}
                    nutrientConfig={nutrientConfig}
                    onCardClick={() => onFoodSelect(food, 'food')}
                  />
                ))}
                {recentFoods.length === 0 && topFoods.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    {t(
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
                {foods.map((food: Food) => (
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
                {meals.map((meal) => (
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

            {/* Online provider results */}
            {selectedProviderName && (
              <>
                <SectionHeader>{selectedProviderName}</SectionHeader>
                {isOnlineLoading && externalResults.length === 0 && (
                  <div className="text-center py-6 text-gray-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                  </div>
                )}
                {externalResults.map(renderExternalCard)}
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
