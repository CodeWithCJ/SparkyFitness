import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  SectionList,
  FlatList,
  TextInput,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import BottomSheetPicker, { type PickerOption } from '../components/BottomSheetPicker';
import { useServerConnection, useFoods, useFoodSearch, useMeals, useMealSearch, useExternalProviders, useExternalFoodSearch } from '../hooks';
import { fetchFatSecretNutrients } from '../services/api/externalFoodSearchApi';
import { FoodItem, TopFoodItem } from '../types/foods';
import { ExternalFoodItem } from '../types/externalFoods';
import { Meal } from '../types/meals';
import { foodItemToFoodInfo, externalFoodItemToFoodInfo, mealToFoodInfo } from '../types/foodInfo';
import type { FoodInfoItem } from '../types/foodInfo';

interface AddFoodEntryScreenProps {
  navigation: { goBack: () => void; navigate: (screen: string, params: any) => void };
  route?: { params?: { date?: string } };
}

type FoodSection = {
  title: string;
  data: (FoodItem | TopFoodItem)[];
};

type TabKey = 'search' | 'online' | 'meal';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'search', label: 'Search' },
  { key: 'online', label: 'Online' },
  { key: 'meal', label: 'Meals' },
];

const AddFoodEntryScreen: React.FC<AddFoodEntryScreenProps> = ({ navigation, route }) => {
  const date = route?.params?.date;
  const insets = useSafeAreaInsets();
  const [accentColor, textMuted, textSecondary] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-text-secondary',
  ]) as [string, string, string];
  const { isConnected } = useServerConnection();
  const { recentFoods, topFoods, isLoading, isError, refetch } = useFoods({ enabled: isConnected });

  const [activeTab, setActiveTab] = useState<TabKey>('search');
  const [searchText, setSearchText] = useState('');

  const { searchResults, isSearching, isSearchActive, isSearchError } = useFoodSearch(searchText, {
    enabled: isConnected && activeTab === 'search',
  });

  const { meals, isLoading: isMealsLoading, isError: isMealsError, refetch: refetchMeals } = useMeals({
    enabled: isConnected && activeTab === 'meal',
  });
  const {
    searchResults: mealSearchResults,
    isSearching: isMealSearching,
    isSearchActive: isMealSearchActive,
    isSearchError: isMealSearchError,
  } = useMealSearch(searchText, {
    enabled: isConnected && activeTab === 'meal',
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
  const [loadingFoodId, setLoadingFoodId] = useState<string | null>(null);

  const selectedProviderType = useMemo(
    () => providers.find((p) => p.id === selectedProvider)?.provider_type ?? '',
    [providers, selectedProvider],
  );

  const {
    searchResults: onlineSearchResults,
    isSearching: isOnlineSearching,
    isSearchActive: isOnlineSearchActive,
    isSearchError: isOnlineSearchError,
    isProviderSupported,
  } = useExternalFoodSearch(searchText, selectedProviderType, {
    enabled: isConnected && activeTab === 'online' && selectedProvider !== null,
    providerId: selectedProvider ?? undefined,
  });

  useEffect(() => {
    if (providers.length === 0) return;
    if (selectedProvider === null || !providers.some((p) => p.id === selectedProvider)) {
      setSelectedProvider(providers[0].id);
    }
  }, [providers, selectedProvider]);

  const showFoodInfo = (item: FoodInfoItem) => {
    navigation.navigate('FoodItemInfo', { item, date });
  };

  const handleExternalFoodTap = async (item: ExternalFoodItem) => {
    if (item.source === 'fatsecret' && selectedProvider) {
      setLoadingFoodId(item.id);
      try {
        const detailed = await fetchFatSecretNutrients(item.id, selectedProvider);
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

  const renderItem = ({ item }: { item: FoodItem | TopFoodItem }) => (
    <TouchableOpacity
      className="px-4 py-3 border-b border-border-subtle"
      activeOpacity={0.7}
      onPress={() => showFoodInfo(foodItemToFoodInfo(item))}
    >
      <View className="flex-row justify-between items-center">
        <View className="flex-1 mr-3">
          <Text className="text-text-primary text-base font-medium">{item.name}</Text>
          {item.brand && (
            <Text className="text-text-secondary text-sm mt-0.5">{item.brand}</Text>
          )}
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
      <Text className="text-text-secondary text-sm font-semibold uppercase tracking-wider">
        {section.title}
      </Text>
    </View>
  );

  const renderSearchBar = () => (
    <View className="px-4 py-2">
      <View className="flex-row items-center bg-raised rounded-lg border border-border-subtle px-3 py-2.5">
        <Icon name="search" size={18} color={textMuted} />
        <TextInput
          className="flex-1 text-text-primary ml-2"
          // Match line height, font size to vertically center the text in search bar. Doesn't seem to work in tailwind
          style={{ fontSize: 16, lineHeight: 20 }}
          placeholder={activeTab === 'meal' ? 'Search meals...' : 'Search foods...'}
          placeholderTextColor={textMuted}
          value={searchText}
          onChangeText={setSearchText}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => setSearchText('')} hitSlop={8}>
            <Icon name="close" size={16} color={textMuted} />
          </TouchableOpacity>
        )}
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
          <TouchableOpacity
            onPress={() => refetch()}
            className="mt-4 px-6 py-2 rounded-lg bg-raised"
          >
            <Text className="text-accent-primary text-base font-medium">Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (sections.length === 0) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Text className="text-text-secondary text-base text-center">
            No foods found
          </Text>
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
        className="px-4 py-3 border-b border-border-subtle"
        activeOpacity={0.7}
        onPress={() => showFoodInfo(foodInfo)}
      >
        <View className="flex-row justify-between items-center">
          <View className="flex-1 mr-3">
            <Text className="text-text-primary text-base font-medium">{item.name}</Text>
            {item.description ? (
              <Text className="text-text-secondary text-sm mt-0.5" numberOfLines={1}>
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
          <TouchableOpacity
            onPress={() => refetchMeals()}
            className="mt-4 px-6 py-2 rounded-lg bg-raised"
          >
            <Text className="text-accent-primary text-base font-medium">Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (meals.length === 0) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Text className="text-text-secondary text-base text-center">
            No meals found
          </Text>
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
      onPress={() => handleExternalFoodTap(item)}
    >
      <View className="flex-row justify-between items-center">
        <View className="flex-1 mr-3">
          <Text className="text-text-primary text-base font-medium">{item.name}</Text>
          {item.brand && (
            <Text className="text-text-secondary text-sm mt-0.5">{item.brand}</Text>
          )}
        </View>
        <View className="items-end">
          {loadingFoodId === item.id ? (
            <ActivityIndicator size="small" color={accentColor} />
          ) : (
            <>
              <Text className="text-text-primary text-base font-semibold">
                {item.calories} cal
              </Text>
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
        keyExtractor={(item) => item.id}
        renderItem={renderExternalFoodItem}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          isOnlineSearching ? (
            <View className="py-2 items-center">
              <ActivityIndicator size="small" color={accentColor} />
            </View>
          ) : null
        }
      />
    );
  };

  const providerOptions: PickerOption<string>[] = useMemo(
    () => providers.map((p) => ({ label: p.provider_name, value: p.id })),
    [providers],
  );

  const selectedProviderName = useMemo(
    () => providers.find((p) => p.id === selectedProvider)?.provider_name ?? '',
    [providers, selectedProvider],
  );

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
          <TouchableOpacity
            onPress={() => refetchProviders()}
            className="mt-4 px-6 py-2 rounded-lg bg-raised"
          >
            <Text className="text-accent-primary text-base font-medium">Retry</Text>
          </TouchableOpacity>
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
        <View className="px-4 py-2">
          <BottomSheetPicker
            value={selectedProvider!}
            options={providerOptions}
            onSelect={setSelectedProvider}
            title="Select Provider"
            renderTrigger={({ onPress }) => (
              <TouchableOpacity
                onPress={onPress}
                activeOpacity={0.7}
                className="flex-row items-center bg-raised rounded-full px-3 py-1.5 border border-border-subtle self-start"
              >
                <Icon name="globe" size={16} color={accentColor} />
                <Text className="text-text-primary text-sm font-medium mx-1.5">
                  {selectedProviderName}
                </Text>
                <Icon name="chevron-down" size={12} color={textMuted} />
              </TouchableOpacity>
            )}
          />
        </View>
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
    <View className="flex-1 bg-background" style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border-subtle">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="z-10"
        >
          <Icon name="close" size={22} color={accentColor} />
        </TouchableOpacity>
        <Text className="absolute left-0 right-0 text-center text-text-primary text-lg font-semibold">
          Add
        </Text>
      </View>

      {/* Segmented control */}
      <View className="px-4 pb-2">
        <View className="flex-row bg-raised p-1 rounded-lg">
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              className={`flex-1 py-2 rounded-md items-center ${
                activeTab === tab.key ? 'bg-surface' : ''
              }`}
              activeOpacity={0.7}
            >
              <Text
                className={`text-sm font-medium ${
                  activeTab === tab.key ? 'text-text-primary' : 'text-text-muted'
                }`}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Search bar */}
      {renderSearchBar()}

      {/* Tab content */}
      {renderTabContent()}
    </View>
  );
};

export default AddFoodEntryScreen;
