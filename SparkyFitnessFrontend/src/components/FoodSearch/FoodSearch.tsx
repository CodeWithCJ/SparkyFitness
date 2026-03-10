import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Plus, Loader2, Camera, BookText } from 'lucide-react';
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
import type {
  Food,
  CSVData,
  FatSecretFoodItem,
  OpenFoodFactsProduct,
  NutritionixItem,
  UsdaItem,
} from '@/types/food';
import type { Meal } from '@/types/meal';
import { useQueryClient } from '@tanstack/react-query';
import {
  searchMealieOptions,
  searchTandoorOptions,
  useDatabaseFoodSearchQuery,
  useImportCsvMutation,
  useRecentAndTopFoodsQuery,
} from '@/hooks/Foods/useFoods.ts';
import { useCustomNutrients } from '@/hooks/Foods/useCustomNutrients.ts';
import {
  fatSecretNutrientOptions,
  searchFatSecretOptions,
} from '@/hooks/Foods/useFatSecret.ts';
import {
  nutritionixBrandedNutrientsOptions,
  nutritionixNaturalNutrientsOptions,
  searchNutritionixOptions,
} from '@/hooks/Foods/useNutrionix.ts';
import {
  searchUsdaOptions,
  usdaFoodDetailsOptions,
} from '@/hooks/Foods/useUSDA.ts';
import { DEFAULT_NUTRIENTS } from '@/constants/nutrients.ts';
import {
  convertFatSecretToFood,
  convertNutritionixToFood,
  convertOpenFoodFactsToFood,
  convertUsdaToFood,
  mapUsdaItemToDetails,
} from '@/utils/foodSearch.ts';
import FoodResultCard from './FoodResultCard.tsx';
import { BarcodeScannerDialog } from './BarcodeScannerDialog.tsx';
import { CsvImportDialog } from './CsvImportDialog.tsx';
import { FoodFormDialog } from './FoodFormDialog.tsx';
import { useExternalProvidersQuery } from '@/hooks/Settings/useExternalProviderSettings.ts';
import {
  searchBarcodeOptions,
  searchOpenFoodFactsOptions,
} from '@/hooks/Foods/useOpenFoodFacts.ts';
import { mealSearchOptions } from '@/hooks/Foods/useMeals.ts';
import { DataProvider } from '@/types/settings.ts';
import { getProviderCategory } from '@/utils/settings.ts';

type FoodDataForBackend = Omit<CSVData, 'id'>;

export type ExternalResultWrapper =
  | {
      provider_type: 'openfoodfacts';
      raw: OpenFoodFactsProduct;
      food: Food;
      barcode_raw?: OpenFoodFactsProduct;
    }
  | {
      provider_type: 'nutritionix';
      raw: NutritionixItem;
      food: Food;
      barcode_raw?: NutritionixItem;
    }
  | {
      provider_type: 'fatsecret';
      raw: FatSecretFoodItem;
      food: Food;
      barcode_raw?: { food: FatSecretFoodItem };
    }
  | {
      provider_type: 'usda';
      raw: UsdaItem;
      food: Food;
      barcode_raw?: UsdaItem;
    }
  | {
      provider_type: 'mealie';
      raw: Food;
      food: Food;
      barcode_raw?: Food;
    }
  | {
      provider_type: 'tandoor';
      raw: Food;
      food: Food;
      barcode_raw?: Food;
    };

interface EnhancedFoodSearchProps {
  onFoodSelect: (item: Food | Meal, type: 'food' | 'meal') => void;
  hideDatabaseTab?: boolean;
  hideMealTab?: boolean;
  mealType?: string;
}

const EnhancedFoodSearch = ({
  onFoodSelect,
  hideDatabaseTab = false,
  hideMealTab = false,
  mealType = undefined,
}: EnhancedFoodSearchProps) => {
  const { t } = useTranslation();
  const {
    defaultFoodDataProviderId,
    setDefaultFoodDataProviderId,
    defaultBarcodeProviderId,
    itemDisplayLimit,
    foodDisplayLimit,
    nutrientDisplayPreferences,
    energyUnit,
    convertEnergy,
    getEnergyUnitString,
    autoScaleOpenFoodFactsImports,
    loggingLevel,
  } = usePreferences();
  const isMobile = useIsMobile();
  const platform = isMobile ? 'mobile' : 'desktop';

  const [searchTerm, setSearchTerm] = useState('');
  const [meals, setMeals] = useState<Meal[]>([]);
  const getInitialActiveTab = () => {
    if (!hideDatabaseTab) return 'database';
    if (!hideMealTab) return 'meal';
    return 'online';
  };

  const [activeTab, setActiveTab] = useState<
    'database' | 'meal' | 'online' | 'barcode'
  >(getInitialActiveTab());
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<
    OpenFoodFactsProduct | Food | null
  >(null);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [barcodeProviderId, setBarcodeProviderId] = useState<string | null>(
    null
  );
  const [showAddFoodDialog, setShowAddFoodDialog] = useState(false);
  const [showImportFromCsvDialog, setShowImportFromCsvDialog] = useState(false);
  const isSearchEmpty = !searchTerm.trim();
  const isDatabaseTab = activeTab === 'database';

  const [manualProviderId, setManualProviderId] = useState<string | null>(null);
  const [isOnlineLoading, setIsOnlineLoading] = useState(false);
  const [searchProviderId, setSearchProviderId] = useState<string | null>(null);
  const [externalResults, setExternalResults] = useState<
    ExternalResultWrapper[]
  >([]);

  const queryClient = useQueryClient();
  const { data: customNutrients } = useCustomNutrients();
  const { data: foodDataProviders = [] } = useExternalProvidersQuery();
  const { data: recentTopData, isFetching: isFetchingRecent } =
    useRecentAndTopFoodsQuery(
      itemDisplayLimit,
      mealType,
      isDatabaseTab && isSearchEmpty
    );
  const { mutateAsync: importCsvMutation } = useImportCsvMutation();
  const { data: searchData, isFetching: isFetchingSearch } =
    useDatabaseFoodSearchQuery(
      searchTerm,
      foodDisplayLimit,
      mealType,
      isDatabaseTab && !isSearchEmpty
    );

  const recentFoods = recentTopData?.recentFoods || [];
  const topFoods = recentTopData?.topFoods || [];
  const foods = searchData?.searchResults || [];
  const loading = isFetchingRecent || isFetchingSearch || isOnlineLoading;

  const selectedFoodDataProvider =
    manualProviderId ||
    defaultFoodDataProviderId ||
    foodDataProviders[0]?.id ||
    null;

  // Barcode provider: prefer explicit user selection, then the dedicated barcode
  // provider preference (set in External Provider Settings → Default Barcode Provider),
  // then fall back to the first active barcode-capable provider.
  const selectedBarcodeProvider =
    barcodeProviderId ||
    defaultBarcodeProviderId ||
    foodDataProviders.find((p) =>
      ['openfoodfacts', 'usda', 'fatsecret'].includes(p.provider_type)
    )?.id ||
    null;

  const [hasOnlineSearchBeenPerformed, setHasOnlineSearchBeenPerformed] =
    useState(false);

  const handleMealSearch = useCallback(
    async (term: string) => {
      const results = await queryClient.fetchQuery(
        mealSearchOptions('all', term)
      );
      setMeals(results);
    },
    [queryClient]
  );
  useEffect(() => {
    const handler = setTimeout(() => {
      if (activeTab === 'meal') {
        handleMealSearch(searchTerm);
      }
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [searchTerm, activeTab, handleMealSearch]);

  const searchOpenFoodFacts = async () => {
    if (!searchTerm.trim()) return;

    const data = await queryClient.fetchQuery(
      searchOpenFoodFactsOptions(searchTerm)
    );

    if (data.products) {
      const mapped: ExternalResultWrapper[] = data.products
        .filter(
          (p: OpenFoodFactsProduct) =>
            p.product_name && p.nutriments && p.nutriments['energy-kcal_100g']
        )
        .map((p: OpenFoodFactsProduct) => ({
          provider_type: 'openfoodfacts',
          raw: p,
          food: convertOpenFoodFactsToFood(p, autoScaleOpenFoodFactsImports),
        }));

      setExternalResults(mapped);
    }
  };

  const searchBarcode = async (barcode: string) => {
    setIsOnlineLoading(true);

    toast({
      title: 'Searching barcode',
      description: `Looking up: ${barcode}...`,
    });

    try {
      const data = await queryClient.fetchQuery(
        searchBarcodeOptions(barcode, selectedBarcodeProvider || undefined)
      );

      if (data.food) {
        // Handle local source separately or map to ExternalResultWrapper
        if (data.source === 'local') {
          // If it's local, we might want to just show it or add to a separate list
          // For now, let's map it but keep in mind provider_type is 'local'
          onFoodSelect(data.food, 'food');
          setShowBarcodeScanner(false);
          toast({
            title: 'Food found in database',
            description: `Found: ${data.food.name}`,
          });
          return;
        }

        type BarcodeProviderType = 'openfoodfacts' | 'usda' | 'fatsecret';
        // The barcode endpoint always returns a pre-mapped Food. We use
        // `unknown` as an intermediate cast since the raw type doesn't
        // structurally match the provider-specific types at compile time.
        const mapped = {
          provider_type: data.source as BarcodeProviderType,
          raw: data.food, // Use mapped food as raw for barcode results to satisfy edit handler checks
          barcode_raw: data.barcode_raw, // Keep the actual raw provider data separate
          food: data.food,
        } as unknown as ExternalResultWrapper;

        setExternalResults([mapped]);
        setActiveTab('online');
        setHasOnlineSearchBeenPerformed(true);

        toast({
          title: 'Barcode scanned successfully',
          description: `Found product: ${data.food.name}`,
        });
      } else {
        setExternalResults([]);
        toast({
          title: 'Product not found',
          description: `No product found for this barcode using selected provider.`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to search barcode.',
        variant: 'destructive',
      });
    } finally {
      setIsOnlineLoading(false);
    }
  };

  const handleOpenFoodFactsEdit = (product: OpenFoodFactsProduct) => {
    setEditingProduct(product);
    setShowEditDialog(true);
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

  const searchHandlers: Record<
    string,
    (term: string, providerId: string, provider: DataProvider) => Promise<void>
  > = {
    openfoodfacts: async () => {
      await searchOpenFoodFacts();
    },
    nutritionix: async (term, id) => {
      const data: NutritionixItem[] = await queryClient.fetchQuery(
        searchNutritionixOptions(term, id)
      );
      setExternalResults(
        data.map((item) => ({
          provider_type: 'nutritionix',
          raw: item,
          food: convertNutritionixToFood(item),
        }))
      );
    },
    fatsecret: async (term, id) => {
      const data: FatSecretFoodItem[] = await queryClient.fetchQuery(
        searchFatSecretOptions(term, id)
      );
      setExternalResults(
        data.map((item) => ({
          provider_type: 'fatsecret',
          raw: item,
          food: convertFatSecretToFood(item),
        }))
      );
    },
    usda: async (term, id) => {
      const data: UsdaItem[] = await queryClient.fetchQuery(
        searchUsdaOptions(term, id, foodDisplayLimit)
      );
      setExternalResults(
        data.map((item) => ({
          provider_type: 'usda',
          raw: item,
          food: convertUsdaToFood(
            item,
            mapUsdaItemToDetails(item, loggingLevel)
          ),
        }))
      );
    },
    mealie: async (term, id, p) => {
      const data: Food[] = await queryClient.fetchQuery(
        searchMealieOptions(term, p.base_url ?? '', p.app_key, id)
      );
      setExternalResults(
        data.map((item) => ({
          provider_type: 'mealie',
          raw: item,
          food: item,
        }))
      );
    },
    tandoor: async (term, id, p) => {
      const data: Food[] = await queryClient.fetchQuery(
        searchTandoorOptions(term, p.base_url ?? '', p.app_key, id)
      );
      setExternalResults(
        data.map((item) => ({
          provider_type: 'tandoor',
          raw: item,
          food: item,
        }))
      );
    },
  };

  const handleSearch = async () => {
    setIsOnlineLoading(true);
    setExternalResults([]);
    setMeals([]);

    if (!searchTerm.trim()) {
      setIsOnlineLoading(false);
      return;
    }

    if (activeTab === 'meal') {
      await handleMealSearch(searchTerm);
    } else if (activeTab === 'online') {
      setHasOnlineSearchBeenPerformed(true);
      const provider = foodDataProviders.find(
        (p) => p.id === selectedFoodDataProvider
      );

      if (provider && searchHandlers[provider.provider_type]) {
        setSearchProviderId(provider.id);
        const searchHandler = searchHandlers[provider.provider_type];
        if (searchHandler)
          await searchHandler(searchTerm, provider.id, provider);
      } else {
        toast({
          title: t('common.error'),
          description: 'Provider not supported',
          variant: 'destructive',
        });
      }
    } else if (activeTab === 'barcode') {
      await searchBarcode(searchTerm);
    }
    setIsOnlineLoading(false);
  };

  const handleUsdaEdit = async (item: UsdaItem | Food, barcodeRaw?: any) => {
    // If it's already a mapped Food (from barcode search), check if we have barcode_raw to get better details
    if ('provider_type' in item && item.provider_type === 'usda') {
      if (barcodeRaw) {
        // We have the raw USDA data from barcode, use it to fetch full nutrients
        const usdaRaw = barcodeRaw as UsdaItem;
        const nutrientData = await queryClient.fetchQuery(
          usdaFoodDetailsOptions(usdaRaw.fdcId, searchProviderId || '')
        );
        if (nutrientData) {
          setEditingProduct(convertUsdaToFood(usdaRaw, nutrientData));
          setShowEditDialog(true);
          return;
        }
      }
      // Fallback to the already mapped food if fetch fails or no barcodeRaw
      setEditingProduct(item);
      setShowEditDialog(true);
      return;
    }

    const usdaItem = item as UsdaItem;
    if (!searchProviderId) {
      return;
    }
    const nutrientData = await queryClient.fetchQuery(
      usdaFoodDetailsOptions(usdaItem.fdcId, searchProviderId)
    );

    if (nutrientData) {
      setEditingProduct(convertUsdaToFood(usdaItem, nutrientData));
      setShowEditDialog(true);
    } else {
      toast({
        title: 'Error',
        description: 'Failed to retrieve detailed nutrition for this item.',
        variant: 'destructive',
      });
    }
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

  const handleFatSecretEdit = async (
    item: FatSecretFoodItem | Food,
    barcodeRaw?: any
  ) => {
    // If it's already a mapped Food (from barcode search), check if we have barcode_raw to get better details
    if ('provider_type' in item && item.provider_type === 'fatsecret') {
      if (barcodeRaw && barcodeRaw.food) {
        // We have the raw FatSecret data from barcode, use it to fetch full nutrients
        const fsRaw = barcodeRaw.food as FatSecretFoodItem;
        const nutrientData: Partial<FatSecretFoodItem> =
          await queryClient.fetchQuery(
            fatSecretNutrientOptions(fsRaw.food_id, searchProviderId || '')
          );
        if (nutrientData) {
          setEditingProduct(convertFatSecretToFood(fsRaw, nutrientData));
          setShowEditDialog(true);
          return;
        }
      }
      // Fallback to the already mapped food if fetch fails or no barcodeRaw
      setEditingProduct(item);
      setShowEditDialog(true);
      return;
    }

    const fsItem = item as FatSecretFoodItem;
    if (!searchProviderId) {
      return;
    }

    const nutrientData: Partial<FatSecretFoodItem> =
      await queryClient.fetchQuery(
        fatSecretNutrientOptions(fsItem.food_id, searchProviderId)
      );

    if (nutrientData) {
      setEditingProduct(convertFatSecretToFood(fsItem, nutrientData));
      setShowEditDialog(true);
    } else {
      toast({
        title: 'Error',
        description: 'Failed to retrieve detailed nutrition for this item.',
        variant: 'destructive',
      });
    }
  };

  const handleMealieOrTandoorEdit = async (food: Food) => {
    const provider = foodDataProviders.find(
      (p) => p.id === selectedFoodDataProvider
    );
    if (!provider) {
      toast({
        title: 'Error',
        description: 'Could not find the selected food provider.',
        variant: 'destructive',
      });
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

  const visibleNutrients = quickInfoPreferences
    ? quickInfoPreferences.visible_nutrients
    : DEFAULT_NUTRIENTS;

  const nutrientConfig = {
    visibleNutrients,
    energyUnit,
    convertEnergy,
    getEnergyUnitString,
    customNutrients: customNutrients || [],
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row flex-wrap gap-2">
        {!hideDatabaseTab && (
          <Button
            variant={activeTab === 'database' ? 'default' : 'outline'}
            onClick={() => setActiveTab('database')}
          >
            {t('enhancedFoodSearch.database', 'Database')}
          </Button>
        )}
        {!hideMealTab && (
          <Button
            variant={activeTab === 'meal' ? 'default' : 'outline'}
            onClick={() => setActiveTab('meal')}
          >
            <BookText className="w-4 h-4 mr-2" />
            {t('enhancedFoodSearch.meals', 'Meals')}
          </Button>
        )}
        <Button
          variant={activeTab === 'online' ? 'default' : 'outline'}
          onClick={() => setActiveTab('online')}
        >
          {t('enhancedFoodSearch.online', 'Online')}
        </Button>
        <Button
          variant={activeTab === 'barcode' ? 'default' : 'outline'}
          onClick={() => {
            setActiveTab('barcode');
            setShowBarcodeScanner(true);
          }}
        >
          <Camera className="w-4 h-4 mr-2" />{' '}
          {t('enhancedFoodSearch.scanBarcode', 'Scan Barcode')}
        </Button>
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
        >
          <Plus className="w-4 h-4 mr-2" />{' '}
          {t('enhancedFoodSearch.importFromCSV', 'Import from CSV')}
        </Button>
      </div>

      <div className="flex space-x-2 items-center">
        <Input
          placeholder={t(
            'enhancedFoodSearch.searchFoodsPlaceholder',
            'Search for foods...'
          )}
          value={searchTerm}
          autoFocus
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              (activeTab === 'online' || activeTab === 'barcode')
            ) {
              handleSearch();
            }
          }}
          className="flex-1"
        />
        <Button onClick={handleSearch} disabled={loading}>
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
        </Button>
        {activeTab === 'online' && (
          <Select
            value={selectedFoodDataProvider || ''}
            onValueChange={(value) => {
              setManualProviderId(value);
              setDefaultFoodDataProviderId(value);
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
              {foodDataProviders
                .filter(
                  (provider) =>
                    getProviderCategory(provider).includes('food') &&
                    provider.is_active
                )
                .map((provider) => (
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
        {loading && (
          <div className="text-center py-8 text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
            {t('enhancedFoodSearch.searchingFoods', 'Searching foods...')}
          </div>
        )}

        {!loading && activeTab === 'database' && searchTerm.trim() === '' && (
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

        {!loading &&
          activeTab === 'database' &&
          searchTerm.trim() !== '' &&
          foods.length === 0 &&
          meals.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              {t('enhancedFoodSearch.noItemsFoundInDatabase', {
                searchTerm,
                defaultValue: `No items found in your database for "${searchTerm}".`,
              })}
            </div>
          )}

        {!loading &&
          (activeTab === 'online' || activeTab === 'barcode') &&
          !hasOnlineSearchBeenPerformed && (
            <div className="text-center py-8 text-gray-500">
              {t(
                'enhancedFoodSearch.clickSearchIconOnline',
                'Click the search icon to search online.'
              )}
            </div>
          )}

        {!loading &&
          (activeTab === 'online' || activeTab === 'barcode') &&
          hasOnlineSearchBeenPerformed &&
          externalResults.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              {t(
                'enhancedFoodSearch.noFoodsFoundOnline',
                'No foods found from the selected online provider.'
              )}
            </div>
          )}

        {(activeTab === 'online' || activeTab === 'barcode') &&
          externalResults.length > 0 &&
          externalResults.map((result) => (
            <FoodResultCard
              key={`${result.provider_type}-${result.food.provider_external_id}`}
              item={result.food}
              isOnline={true}
              providerLabel={result.provider_type.toUpperCase()}
              nutrientConfig={nutrientConfig}
              onEditClick={() => {
                switch (result.provider_type) {
                  case 'openfoodfacts':
                    handleOpenFoodFactsEdit(result.raw);
                    break;
                  case 'nutritionix':
                    handleNutritionixEdit(result.raw);
                    break;
                  case 'fatsecret':
                    handleFatSecretEdit(
                      result.raw,
                      (result as any).barcode_raw
                    );
                    break;
                  case 'usda':
                    handleUsdaEdit(result.raw, (result as any).barcode_raw);
                    break;
                  case 'mealie':
                  case 'tandoor':
                    handleMealieOrTandoorEdit(result.raw);
                    break;
                }
              }}
            />
          ))}

        {activeTab === 'meal' &&
          meals.map((meal) => (
            <FoodResultCard
              key={meal.id}
              item={meal}
              isMeal={true}
              nutrientConfig={nutrientConfig}
              onCardClick={() => onFoodSelect(meal, 'meal')}
            />
          ))}

        {activeTab === 'database' &&
          searchTerm.trim() !== '' &&
          foods.map((food: Food) => (
            <FoodResultCard
              key={food.id}
              item={food}
              nutrientConfig={nutrientConfig}
              onCardClick={() => onFoodSelect(food, 'food')}
            />
          ))}
      </div>
      <FoodFormDialog
        isOpen={showEditDialog}
        onOpenChange={setShowEditDialog}
        mode="edit"
        editingProduct={editingProduct}
        autoScaleOpenFoodFactsImports={autoScaleOpenFoodFactsImports}
        onSave={handleSaveEditedFood}
      />
      <FoodFormDialog
        isOpen={showAddFoodDialog}
        onOpenChange={setShowAddFoodDialog}
        mode="add"
        autoScaleOpenFoodFactsImports={autoScaleOpenFoodFactsImports}
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
