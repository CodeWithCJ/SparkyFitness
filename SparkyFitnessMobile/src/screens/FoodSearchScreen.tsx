import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  SectionList,
  FlatList,
  ScrollView,
  TextInput,
  Platform,
} from 'react-native';
import Button from '../components/ui/Button';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import SegmentedControl from '../components/SegmentedControl';
import {
  useServerConnection,
  useFoods,
  useFoodSearch,
  useMeals,
  useMealSearch,
  useExternalProviders,
  useExternalFoodSearch,
  usePreferences,
} from '../hooks';
import { fetchExternalFoodDetails } from '../services/api/externalFoodSearchApi';
import { FoodItem, TopFoodItem } from '../types/foods';
import { ExternalFoodItem } from '../types/externalFoods';
import { Meal } from '../types/meals';
import { foodItemToFoodInfo, externalFoodItemToFoodInfo, mealToFoodInfo } from '../types/foodInfo';
import type { FoodInfoItem } from '../types/foodInfo';
import type { RootStackScreenProps } from '../types/navigation';

type FoodSearchScreenProps = RootStackScreenProps<'FoodSearch'>;

type FoodSection = {
  title: string;
  data: (FoodItem | TopFoodItem)[];
};

type TabKey = 'search' | 'online' | 'meal';

const ALL_TABS: { key: TabKey; label: string }[] = [
  { key: 'search', label: 'Search' },
  { key: 'online', label: 'Online' },
  { key: 'meal', label: 'Meals' },
] as const;

const FoodSearchScreen: React.FC<FoodSearchScreenProps> = ({ navigation, route }) => {
  const date = route.params?.date;
  const pickerMode = route.params?.pickerMode ?? 'log-entry';
  const isMealBuilderMode = pickerMode === 'meal-builder';
  const insets = useSafeAreaInsets();
  const [accentColor, textMuted, textSecondary] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-text-secondary',
  ]) as [string, string, string];
  const { isConnected } = useServerConnection();
  const { preferences } = usePreferences({ enabled: isConnected });
  const { recentFoods, topFoods, isLoading, isError, refetch } = useFoods({ enabled: isConnected });

  const [activeTab, setActiveTab] = useState<TabKey>('search');
  const [searchText, setSearchText] = useState('');

  const visibleTabs = useMemo(
    () => (isMealBuilderMode ? ALL_TABS.filter((tab) => tab.key !== 'meal') : ALL_TABS),
    [isMealBuilderMode],
  );

  useEffect(() => {
    if (isMealBuilderMode && activeTab === 'meal') {
      setActiveTab('search');
    }
  }, [activeTab, isMealBuilderMode]);

  const { searchResults, isSearching, isSearchActive, isSearchError } = useFoodSearch(searchText, {
    enabled: isConnected && activeTab === 'search',
  });

  const { meals, isLoading: isMealsLoading, isError: isMealsError, refetch: refetchMeals } = useMeals({
    enabled: isConnected && activeTab === 'meal' && !isMealBuilderMode,
  });
  const {
    searchResults: mealSearchResults,
    isSearching: isMealSearching,
    isSearchActive: isMealSearchActive,
    isSearchError: isMealSearchError,
  } = useMealSearch(searchText, {
    enabled: isConnected && activeTab === 'meal' && !isMealBuilderMode,
  });

  const {
    providers,
    isLoading: isProvidersLoading,
    isError: isProvidersError,
    refetch: refetchProviders,
  } = useExternalProviders({
    enabled: isConnected && activeTab === 'online',
  });

  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const hasUserSelectedProvider = useRef(false);
  const [loadingFoodId, setLoadingFoodId] = useState<string | null>(null);

  const selectedProviderType = useMemo(
    () => providers.find((provider) => provider.id === selectedProvider)?.provider_type ?? '',
    [providers, selectedProvider],
  );

  const selectedProviderName = useMemo(
    () => providers.find((provider) => provider.id === selectedProvider)?.provider_name ?? '',
    [providers, selectedProvider],
  );

  const {
    searchResults: onlineSearchResults,
    isSearching: isOnlineSearching,
    isSearchActive: isOnlineSearchActive,
    isSearchError: isOnlineSearchError,
    isProviderSupported,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useExternalFoodSearch(searchText, selectedProviderType, {
    enabled: isConnected && activeTab === 'online' && selectedProvider !== null,
    providerId: selectedProvider ?? undefined,
    autoScale: preferences?.auto_scale_open_food_facts_imports,
  });

  useEffect(() => {
    if (providers.length === 0) return;
    if (hasUserSelectedProvider.current && providers.some((provider) => provider.id === selectedProvider)) {
      return;
    }

    const defaultId = preferences?.default_food_data_provider_id;
    const defaultProvider = defaultId ? providers.find((provider) => provider.id === defaultId) : undefined;
    setSelectedProvider(defaultProvider?.id ?? providers[0].id);
  }, [preferences?.default_food_data_provider_id, providers, selectedProvider]);

  const showFoodInfo = (item: FoodInfoItem) => {
    navigation.navigate('FoodEntryAdd', {
      item,
      date,
      pickerMode: isMealBuilderMode ? 'meal-builder' : undefined,
      returnDepth: isMealBuilderMode ? 2 : undefined,
    });
  };

  const openCreateFood = () => {
    navigation.navigate('FoodForm', {
      mode: 'create-food',
      date,
      pickerMode: isMealBuilderMode ? 'meal-builder' : undefined,
      returnDepth: isMealBuilderMode ? 2 : undefined,
    });
  };

  const openMealBuilder = () => {
    navigation.navigate('MealBuilder');
  };

  const openFoodScan = () => {
    navigation.navigate('FoodScan', {
      date,
      pickerMode: isMealBuilderMode ? 'meal-builder' : undefined,
      returnDepth: isMealBuilderMode ? 2 : undefined,
    });
  };

  const handleHeaderActionPress = () => {
    if (!isMealBuilderMode && activeTab === 'meal') {
      openMealBuilder();
      return;
    }

    openCreateFood();
  };

  const handleExternalFoodTap = async (item: ExternalFoodItem) => {
    if (item.source === 'fatsecret' && selectedProvider) {
      setLoadingFoodId(item.id);
      try {
        const detailed = await fetchExternalFoodDetails('fatsecret', item.id, selectedProvider);
        showFoodInfo(externalFoodItemToFoodInfo(detailed));
      } catch {
        showFoodInfo(externalFoodItemToFoodInfo(item));
      } finally {
        setLoadingFoodId(null);
      }
      return;
    }

    showFoodInfo(externalFoodItemToFoodInfo(item));
  };

  const sections = useMemo(() => {
    const allSections: FoodSection[] = [
      { title: 'Recently Logged', data: recentFoods },
      { title: 'Top Foods', data: topFoods },
    ];

    return allSections.filter((section) => section.data.length > 0);
  }, [recentFoods, topFoods]);

  const trailingActionLabel =
    !isMealBuilderMode && activeTab === 'meal' ? 'Create Meal' : 'Add Food';

  const renderCreateMealCta = () => {
    if (isMealBuilderMode || activeTab !== 'meal') return null;

    return (
      <TouchableOpacity
        onPress={openMealBuilder}
        activeOpacity={0.7}
        className="px-4 pb-2"
        accessibilityRole="button"
        accessibilityLabel="Create Meal"
      >
        <Text className="text-accent-primary text-sm font-medium">Create new meal...</Text>
      </TouchableOpacity>
    );
  };

  const renderItem = ({ item }: { item: FoodItem | TopFoodItem }) => (
    <TouchableOpacity
      className="px-4 py-3 border-b border-border-subtle"
      activeOpacity={0.7}
      onPress={() => showFoodInfo(foodItemToFoodInfo(item))}
    >
      <View className="flex-row justify-between items-center">
        <View className="flex-1 mr-3">
          <Text className="text-text-primary text-base font-medium">{item.name}</Text>
          {item.brand ? (
            <Text className="text-text-secondary text-sm mt-0.5">{item.brand}</Text>
          ) : null}
        </View>
        <View className="items-end">
          <Text className="text-text-primary text-base font-semibold">
            {item.default_variant.calories} cal
          </Text>
          <Text className="text-text-secondary text-xs">
            {item.default_variant.serving_size} {item.default_variant.serving_unit}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderSectionHeader = ({ section }: { section: FoodSection }) => (
    <View className="px-4 py-2 bg-surface">
      <Text className="text-text-muted text-xs font-semibold uppercase">{section.title}</Text>
    </View>
  );

  const renderSearchBar = () => (
    <View className="px-4 py-2">
      <View className="flex-row items-center bg-raised rounded-lg px-3">
        <Icon name="search" size={18} color={textMuted} />
        <View className="flex-1 ml-2">
          <TextInput
            className="text-text-primary"
            style={{ fontSize: 16 }}
            placeholder={activeTab === 'meal' ? 'Search meals...' : 'Search foods...'}
            placeholderTextColor={textMuted}
            value={searchText}
            onChangeText={setSearchText}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
        {searchText.length > 0 ? (
          <Button variant="ghost" onPress={() => setSearchText('')} hitSlop={8} className="p-0">
            <Icon name="close" size={16} color={textMuted} />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          onPress={openFoodScan}
          hitSlop={8}
          className="ml-2 p-0"
          accessibilityLabel="Scan Food"
        >
          <Icon name="scan" size={20} color={accentColor} />
        </Button>
      </View>
    </View>
  );

  const renderSearchResults = () => {
    if (isSearching && searchResults.length === 0) {
      return (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color={accentColor} />
        </View>
      );
    }

    if (isSearchError) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Icon name="alert-circle" size={48} color={accentColor} />
          <Text className="text-text-secondary text-base mt-4 text-center">
            Failed to search foods
          </Text>
        </View>
      );
    }

    if (searchResults.length === 0) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Text className="text-text-secondary text-base text-center">
            No matching foods found
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={searchResults}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
      />
    );
  };

  const renderSearchTab = () => {
    if (!isConnected) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Icon name="cloud-offline" size={48} color={accentColor} />
          <Text className="text-text-secondary text-base mt-4 text-center">
            Connect to a server to view foods
          </Text>
        </View>
      );
    }

    if (isSearchActive) {
      return renderSearchResults();
    }

    if (isLoading) {
      return (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color={accentColor} />
        </View>
      );
    }

    if (isError) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Icon name="alert-circle" size={48} color={accentColor} />
          <Text className="text-text-secondary text-base mt-4 text-center">
            Failed to load foods
          </Text>
          <Button variant="secondary" onPress={() => refetch()} className="mt-4 px-6">
            Retry
          </Button>
        </View>
      );
    }

    if (sections.length === 0) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Text className="text-text-secondary text-base text-center">No foods found</Text>
        </View>
      );
    }

    return (
      <SectionList
        sections={sections}
        keyExtractor={(item, index) => `${index}-${item.id}`}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled
        keyboardShouldPersistTaps="handled"
      />
    );
  };

  const renderMealItem = ({ item }: { item: Meal }) => {
    const foodInfo = mealToFoodInfo(item);

    return (
      <TouchableOpacity
        className="px-4 py-2 border-b border-border-subtle"
        activeOpacity={0.7}
        onPress={() => showFoodInfo(foodInfo)}
      >
        <View className="flex-row justify-between items-center">
          <View className="flex-1 mr-3">
            <Text className="text-text-primary text-base font-medium">{item.name}</Text>
            {item.description ? (
              <Text className="text-text-secondary text-sm" numberOfLines={1}>
                {item.description}
              </Text>
            ) : null}
            <Text className="text-text-muted text-xs mt-0.5">
              {item.foods.length} {item.foods.length === 1 ? 'item' : 'items'}
            </Text>
          </View>
          <View className="items-end">
            <Text className="text-text-primary text-base font-semibold">
              {foodInfo.calories} cal
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderMealSearchResults = () => {
    if (isMealSearching && mealSearchResults.length === 0) {
      return (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color={accentColor} />
        </View>
      );
    }

    if (isMealSearchError) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Icon name="alert-circle" size={48} color={accentColor} />
          <Text className="text-text-secondary text-base mt-4 text-center">
            Failed to search meals
          </Text>
        </View>
      );
    }

    if (mealSearchResults.length === 0) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Text className="text-text-secondary text-base text-center">
            No matching meals found
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={mealSearchResults}
        keyExtractor={(item) => item.id}
        renderItem={renderMealItem}
        keyboardShouldPersistTaps="handled"
      />
    );
  };

  const renderMealTab = () => {
    if (!isConnected) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Icon name="cloud-offline" size={48} color={accentColor} />
          <Text className="text-text-secondary text-base mt-4 text-center">
            Connect to a server to view meals
          </Text>
        </View>
      );
    }

    if (isMealSearchActive) {
      return renderMealSearchResults();
    }

    if (isMealsLoading) {
      return (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color={accentColor} />
        </View>
      );
    }

    if (isMealsError) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Icon name="alert-circle" size={48} color={accentColor} />
          <Text className="text-text-secondary text-base mt-4 text-center">
            Failed to load meals
          </Text>
          <Button variant="secondary" onPress={() => refetchMeals()} className="mt-4 px-6">
            Retry
          </Button>
        </View>
      );
    }

    if (meals.length === 0) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Text className="text-text-secondary text-base text-center">No meals found</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={meals}
        keyExtractor={(item) => item.id}
        renderItem={renderMealItem}
        keyboardShouldPersistTaps="handled"
      />
    );
  };

  const renderExternalFoodItem = ({ item }: { item: ExternalFoodItem }) => (
    <TouchableOpacity
      className="px-4 py-3 border-b border-border-subtle"
      activeOpacity={0.7}
      disabled={loadingFoodId !== null}
      onPress={() => {
        void handleExternalFoodTap(item);
      }}
    >
      <View className="flex-row justify-between items-center">
        <View className="flex-1 mr-3">
          <Text className="text-text-primary text-base font-medium">{item.name}</Text>
          {item.brand ? (
            <Text className="text-text-secondary text-sm mt-0.5">{item.brand}</Text>
          ) : null}
        </View>
        <View className="items-end">
          {loadingFoodId === item.id ? (
            <ActivityIndicator size="small" color={accentColor} />
          ) : (
            <>
              <Text className="text-text-primary text-base font-semibold">{item.calories} cal</Text>
              <Text className="text-text-secondary text-xs">
                {item.serving_size} {item.serving_unit}
              </Text>
            </>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderOnlineSearchResults = () => {
    if (isOnlineSearching && onlineSearchResults.length === 0) {
      return (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color={accentColor} />
        </View>
      );
    }

    if (isOnlineSearchError) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Icon name="alert-circle" size={48} color={accentColor} />
          <Text className="text-text-secondary text-base mt-4 text-center">
            Failed to search {selectedProviderName}
          </Text>
        </View>
      );
    }

    if (onlineSearchResults.length === 0) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Text className="text-text-secondary text-base text-center">
            No matching foods found
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={onlineSearchResults}
        keyExtractor={(item, index) => `${item.source}-${item.id}-${index}`}
        renderItem={renderExternalFoodItem}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={
          isFetchNextPageError ? (
            <Button
              variant="ghost"
              onPress={() => fetchNextPage()}
              className="py-3"
              textClassName="text-sm"
            >
              Failed to load more. Tap to retry
            </Button>
          ) : isFetchingNextPage ? (
            <View className="py-3 items-center">
              <ActivityIndicator size="small" color={accentColor} />
            </View>
          ) : hasNextPage ? (
            <Button
              variant="ghost"
              onPress={() => fetchNextPage()}
              className="py-4 mb-4"
              textClassName="text-sm"
            >
              Load More
            </Button>
          ) : null
        }
      />
    );
  };

  const renderOnlineTab = () => {
    if (!isConnected) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Icon name="cloud-offline" size={48} color={accentColor} />
          <Text className="text-text-secondary text-base mt-4 text-center">
            Connect to a server to search online foods
          </Text>
        </View>
      );
    }

    if (isProvidersLoading) {
      return (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color={accentColor} />
        </View>
      );
    }

    if (isProvidersError) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Icon name="alert-circle" size={48} color={accentColor} />
          <Text className="text-text-secondary text-base mt-4 text-center">
            Failed to load providers
          </Text>
          <Button variant="secondary" onPress={() => refetchProviders()} className="mt-4 px-6">
            Retry
          </Button>
        </View>
      );
    }

    if (providers.length === 0) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Icon name="globe" size={48} color={textMuted} />
          <Text className="text-text-secondary text-base mt-4 text-center">
            No online food providers configured
          </Text>
        </View>
      );
    }

    return (
      <View className="flex-1">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="px-4 gap-2 items-center"
          className="grow-0"
        >
          {providers.map((provider) => {
            const isActive = provider.id === selectedProvider;

            return (
              <TouchableOpacity
                key={provider.id}
                onPress={() => {
                  hasUserSelectedProvider.current = true;
                  setSelectedProvider(provider.id);
                }}
                activeOpacity={0.7}
                className={`flex-row items-center rounded-full px-3 py-1 border ${
                  isActive
                    ? 'border-accent-primary bg-accent-primary'
                    : 'border-border-subtle bg-raised'
                }`}
              >
                <Text
                  className={`text-sm font-medium ${
                    isActive ? 'text-white' : 'text-text-primary'
                  }`}
                >
                  {provider.provider_name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {!isProviderSupported ? (
          <View className="flex-1 justify-center items-center px-6">
            <Icon name="globe" size={48} color={textMuted} />
            <Text className="text-text-secondary text-base mt-4 text-center">
              {selectedProviderName} search is not yet supported
            </Text>
          </View>
        ) : isOnlineSearchActive ? (
          renderOnlineSearchResults()
        ) : (
          <View className="flex-1 justify-center items-center px-6">
            <Icon name="search" size={48} color={textSecondary} />
            <Text className="text-text-secondary text-base mt-4 text-center">
              Search {selectedProviderName} for foods
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'search':
        return renderSearchTab();
      case 'online':
        return renderOnlineTab();
      case 'meal':
        return renderMealTab();
    }
  };

  return (
    <View
      className="flex-1 bg-background"
      style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
    >
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border-subtle">
        <Button
          variant="ghost"
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="z-10 p-0"
          accessibilityLabel="Close"
        >
          <Icon name="close" size={22} color={accentColor} />
        </Button>
        <Text className="absolute left-0 right-0 text-center text-text-primary text-lg font-semibold">
          Add
        </Text>
        <Button
          variant="ghost"
          onPress={handleHeaderActionPress}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="z-10 p-0"
          accessibilityLabel={trailingActionLabel}
        >
          <Icon name="add" size={26} color={accentColor} />
        </Button>
      </View>

      <View className="px-4 mt-2">
        <SegmentedControl segments={visibleTabs} activeKey={activeTab} onSelect={setActiveTab} />
      </View>

      {renderSearchBar()}
      {renderCreateMealCta()}

      {renderTabContent()}
    </View>
  );
};

export default FoodSearchScreen;
