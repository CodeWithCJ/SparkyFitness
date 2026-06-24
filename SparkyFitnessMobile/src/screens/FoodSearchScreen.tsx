import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  SectionList,
  TextInput,
  Keyboard,
} from 'react-native';
import Button from '../components/ui/Button';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import MealLibraryRow from '../components/MealLibraryRow';
import BottomSheetPicker from '../components/BottomSheetPicker';
import AnchoredMenu, { AnchorRect } from '../components/AnchoredMenu';
import {
  useServerConnection,
  useFoods,
  useFoodSearch,
  useMealSearch,
  useExternalProviders,
  useExternalFoodSearch,
  usePreferences,
} from '../hooks';
import Toast from 'react-native-toast-message';
import { fetchExternalFoodDetails } from '../services/api/externalFoodSearchApi';
import { getApiErrorMessage } from '../services/api/errors';
import { FoodItem, TopFoodItem } from '../types/foods';
import { ExternalFoodItem } from '../types/externalFoods';
import { Meal } from '../types/meals';
import {
  foodItemToFoodInfo,
  externalFoodItemToFoodInfo,
  mealToFoodInfo,
} from '../types/foodInfo';
import type { FoodInfoItem } from '../types/foodInfo';
import type { RootStackScreenProps } from '../types/navigation';
import { formatServingDescription, formatServingUnit } from '../utils/foodDetails';

type FoodSearchScreenProps = RootStackScreenProps<'FoodSearch'>;

// Landing (empty query) sections: recent / top foods.
type LandingSection = {
  title: string;
  data: (FoodItem | TopFoodItem)[];
};

// A row in the unified search results. The local foods + meals and the online
// provider results are all rendered in one sectioned list.
type ResultRow =
  | { type: 'food'; food: FoodItem }
  | { type: 'meal'; meal: Meal }
  | { type: 'online'; online: ExternalFoodItem }
  | { type: 'empty-local' }
  | { type: 'local-loading' };

type ResultSection = {
  key: string;
  title: string | null;
  kind: 'food' | 'meal' | 'online' | 'empty-local' | 'status';
  data: ResultRow[];
};

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
  const iconSuccess = String(useCSSVariable('--color-icon-success'));

  const { isConnected } = useServerConnection();
  const { preferences } = usePreferences({ enabled: isConnected });
  const { recentFoods, topFoods, isLoading, isError, refetch } = useFoods({
    enabled: isConnected,
  });

  const [searchText, setSearchText] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [loadingFoodId, setLoadingFoodId] = useState<string | null>(null);

  // "+" New Food / New Meal menu, anchored under the button.
  const addButtonRef = useRef<View>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<AnchorRect | null>(null);

  // Local foods: the hook itself only fetches once the query is >= 2 chars.
  const { searchResults, isSearching, isSearchActive } = useFoodSearch(searchText, {
    enabled: isConnected,
  });

  // Local meals (never mixed in while building a meal).
  const { searchResults: mealResults, isSearching: isMealSearching } = useMealSearch(
    searchText,
    { enabled: isConnected && !isMealBuilderMode },
  );

  // Online provider results stream in below the local results, always fetched
  // (no separate Online tab). Provider is the user's default.
  const { providers } = useExternalProviders({ enabled: isConnected });
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const hasUserSelectedProvider = useRef(false);

  // Sync to the user's default (or first) provider until the user taps the
  // online section header to peek at a different provider's results.
  React.useEffect(() => {
    if (providers.length === 0) return;
    if (
      hasUserSelectedProvider.current &&
      providers.some((provider) => provider.id === selectedProvider)
    ) {
      return;
    }
    const defaultId = preferences?.default_food_data_provider_id;
    const defaultProvider = defaultId
      ? providers.find((provider) => provider.id === defaultId)
      : undefined;
    setSelectedProvider(defaultProvider?.id ?? providers[0].id);
  }, [preferences?.default_food_data_provider_id, providers, selectedProvider]);

  const providerOptions = useMemo(
    () => providers.map((p) => ({ label: p.provider_name, value: p.id })),
    [providers],
  );
  // Temporary peek at another provider; does not change the saved default.
  const handleSelectProvider = useCallback((id: string) => {
    hasUserSelectedProvider.current = true;
    setSelectedProvider(id);
  }, []);

  const selectedProviderType = useMemo(
    () => providers.find((p) => p.id === selectedProvider)?.provider_type ?? '',
    [providers, selectedProvider],
  );
  const selectedProviderName = useMemo(
    () => providers.find((p) => p.id === selectedProvider)?.provider_name ?? '',
    [providers, selectedProvider],
  );

  const {
    searchResults: onlineResults,
    isSearching: isOnlineSearching,
    isSearchActive: isOnlineSearchActive,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useExternalFoodSearch(searchText, selectedProviderType, {
    enabled: isConnected && selectedProvider !== null,
    providerId: selectedProvider ?? undefined,
    autoScale: preferences?.auto_scale_open_food_facts_imports,
  });

  // --- Navigation / actions ---

  const showFoodInfo = useCallback(
    (item: FoodInfoItem) => {
      navigation.navigate('FoodEntryAdd', {
        item,
        date,
        pickerMode: isMealBuilderMode ? 'meal-builder' : undefined,
        returnDepth: isMealBuilderMode ? 2 : undefined,
      });
    },
    [navigation, date, isMealBuilderMode],
  );

  const openCreateFood = useCallback(() => {
    navigation.navigate('FoodForm', {
      mode: 'create-food',
      date,
      pickerMode: isMealBuilderMode ? 'meal-builder' : undefined,
      returnDepth: isMealBuilderMode ? 2 : undefined,
    });
  }, [navigation, date, isMealBuilderMode]);

  const openMealAdd = useCallback(() => {
    navigation.navigate('MealAdd');
  }, [navigation]);

  const openFoodScan = useCallback(() => {
    navigation.navigate('FoodScan', {
      date,
      pickerMode: isMealBuilderMode ? 'meal-builder' : undefined,
      returnDepth: isMealBuilderMode ? 2 : undefined,
      providerId: selectedProvider ?? undefined,
    });
  }, [navigation, date, isMealBuilderMode, selectedProvider]);

  // In meal-builder mode the only create action is a food, so skip the menu.
  const handleAddPress = useCallback(() => {
    if (isMealBuilderMode) {
      openCreateFood();
      return;
    }
    addButtonRef.current?.measureInWindow((x, y, width, height) => {
      setMenuAnchor({ x, y, width, height });
      setMenuVisible(true);
    });
  }, [isMealBuilderMode, openCreateFood]);

  const handleExternalFoodTap = useCallback(
    async (item: ExternalFoodItem) => {
      if ((item.source === 'fatsecret' || item.source === 'yazio') && selectedProvider) {
        setLoadingFoodId(item.id);
        try {
          const detailed = await fetchExternalFoodDetails(
            item.source,
            item.id,
            selectedProvider,
          );
          showFoodInfo(externalFoodItemToFoodInfo(detailed));
        } catch (error) {
          const message =
            getApiErrorMessage(error) ?? "Couldn't load full nutrition details.";
          Toast.show({ type: 'error', text1: 'Details unavailable', text2: message });
          showFoodInfo(externalFoodItemToFoodInfo(item));
        } finally {
          setLoadingFoodId(null);
        }
        return;
      }
      showFoodInfo(externalFoodItemToFoodInfo(item));
    },
    [selectedProvider, showFoodInfo],
  );

  // --- Derived state ---

  const inSearchMode = searchText.trim().length >= 2;

  // Local results are still settling while the debounced query has not caught up
  // to the typed term, or while a fetch is in flight.
  const localPending = isSearching || isMealSearching || !isSearchActive;
  const hasLocalResults =
    searchResults.length > 0 || (!isMealBuilderMode && mealResults.length > 0);
  // Only show online results from the currently selected provider. On a swap,
  // keepPreviousData holds the previous provider's results in the hook until the
  // new ones load; filtering by source drops those stale rows immediately (so a
  // spinner shows, matching web) while still keeping results in place while
  // typing within the same provider.
  const visibleOnlineResults = useMemo(
    () =>
      onlineResults.filter((online) => online.source === selectedProviderType),
    [onlineResults, selectedProviderType],
  );
  const showOnlineSection =
    !!selectedProviderName &&
    (isOnlineSearchActive || visibleOnlineResults.length > 0);

  const landingSections = useMemo<LandingSection[]>(() => {
    return [
      { title: 'Recently Logged', data: recentFoods },
      { title: 'Top Foods', data: topFoods },
    ].filter((section) => section.data.length > 0);
  }, [recentFoods, topFoods]);

  const resultSections = useMemo<ResultSection[]>(() => {
    const sections: ResultSection[] = [];

    if (hasLocalResults) {
      if (searchResults.length > 0) {
        sections.push({
          key: 'foods',
          kind: 'food',
          title: 'Your Foods',
          data: searchResults.map((food) => ({ type: 'food', food })),
        });
      }
      if (!isMealBuilderMode && mealResults.length > 0) {
        sections.push({
          key: 'meals',
          kind: 'meal',
          title: 'Your Meals',
          data: mealResults.map((meal) => ({ type: 'meal', meal })),
        });
      }
    } else if (localPending) {
      sections.push({
        key: 'local-status',
        kind: 'status',
        title: null,
        data: [{ type: 'local-loading' }],
      });
    } else {
      sections.push({
        key: 'empty-local',
        kind: 'empty-local',
        title: null,
        data: [{ type: 'empty-local' }],
      });
    }

    if (showOnlineSection) {
      sections.push({
        key: 'online',
        kind: 'online',
        title: selectedProviderName,
        data: visibleOnlineResults.map((online) => ({ type: 'online', online })),
      });
    }

    return sections;
  }, [
    hasLocalResults,
    localPending,
    searchResults,
    mealResults,
    isMealBuilderMode,
    showOnlineSection,
    selectedProviderName,
    visibleOnlineResults,
  ]);

  // --- Row renderers (shared between landing and results) ---

  const renderFoodRow = (item: FoodItem | TopFoodItem) => (
    <TouchableOpacity
      className="px-4 py-2 border-b border-border-subtle"
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
            {item.default_variant.serving_size}{' '}
            {formatServingUnit(item.default_variant.serving_unit)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderOnlineRow = (item: ExternalFoodItem) => (
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
          <View className="flex-row items-center gap-1">
            <Text className="text-text-primary text-base font-medium">{item.name}</Text>
            {item.provider_verified ? (
              <Icon name="checkmark" size={14} color={iconSuccess} />
            ) : null}
          </View>
          {item.brand ? (
            <Text className="text-text-secondary text-sm mt-0.5">{item.brand}</Text>
          ) : null}
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
                {item.serving_description
                  ? formatServingDescription(item.serving_description)
                  : `${item.serving_size} ${formatServingUnit(item.serving_unit)}`}
              </Text>
            </>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderSectionHeaderTitle = (title: string) => (
    <View className="px-4 py-2 bg-surface">
      <Text className="text-text-muted text-xs font-semibold uppercase">{title}</Text>
    </View>
  );

  // --- Results list renderers ---

  const renderResultRow = ({ item }: { item: ResultRow }) => {
    switch (item.type) {
      case 'food':
        return renderFoodRow(item.food);
      case 'meal':
        return (
          <MealLibraryRow
            meal={item.meal}
            showDivider
            onPress={() => showFoodInfo(mealToFoodInfo(item.meal))}
          />
        );
      case 'online':
        return renderOnlineRow(item.online);
      case 'local-loading':
        return (
          <View className="py-8 items-center">
            <ActivityIndicator size="large" color={accentColor} />
          </View>
        );
      case 'empty-local':
        return (
          <View className="px-4 py-6">
            <Text className="text-text-secondary text-base text-center">
              {isMealBuilderMode
                ? 'No saved foods found'
                : 'No saved foods or meals found'}
            </Text>
          </View>
        );
    }
  };

  const renderResultSectionHeader = ({ section }: { section: ResultSection }) => {
    if (!section.title) return null;
    // The online section header doubles as a provider switcher so the user can
    // peek at another provider's results without changing their default.
    if (section.kind === 'online') {
      const canSwitch = providerOptions.length > 1;
      // Section heading on the left; on the right the current provider name is
      // shown in the accent colour with a double-arrow selector icon so it reads
      // as a switchable control. The icon becomes a spinner while a swap loads.
      const header = (
        <View className="px-4 py-2 bg-surface flex-row items-center justify-between">
          <Text className="text-text-muted text-xs font-semibold uppercase">
            External Results
          </Text>
          <View className="flex-row items-center gap-1">
            <Text
              className="text-xs font-medium"
              style={{ color: canSwitch ? accentColor : textSecondary }}
            >
              {selectedProviderName}
            </Text>
            {isOnlineSearching ? (
              <ActivityIndicator size="small" color={accentColor} />
            ) : canSwitch ? (
              <Icon name="chevron-expand" size={16} color={accentColor} />
            ) : null}
          </View>
        </View>
      );
      if (!canSwitch) return header;
      return (
        <BottomSheetPicker
          value={selectedProvider ?? ''}
          options={providerOptions}
          onSelect={handleSelectProvider}
          title="Online provider"
          renderTrigger={({ onPress }) => (
            <Pressable
              onPress={() => {
                // Drop the search keyboard first so the sheet isn't hidden
                // behind it as it animates up.
                Keyboard.dismiss();
                onPress();
              }}
              accessibilityRole="button"
              accessibilityLabel={`External results source ${selectedProviderName}, tap to change`}
            >
              {header}
            </Pressable>
          )}
        />
      );
    }
    return renderSectionHeaderTitle(section.title);
  };

  const renderResultSectionFooter = ({ section }: { section: ResultSection }) => {
    if (section.kind !== 'online') return null;

    if (isOnlineSearching && visibleOnlineResults.length === 0) {
      return (
        <View className="py-4 items-center">
          <ActivityIndicator size="small" color={accentColor} />
        </View>
      );
    }
    if (isFetchNextPageError) {
      return (
        <Button
          variant="ghost"
          onPress={() => fetchNextPage()}
          className="py-3"
          textClassName="text-sm"
        >
          Failed to load more. Tap to retry
        </Button>
      );
    }
    if (isFetchingNextPage) {
      return (
        <View className="py-3 items-center">
          <ActivityIndicator size="small" color={accentColor} />
        </View>
      );
    }
    if (hasNextPage) {
      return (
        <Button
          variant="ghost"
          onPress={() => fetchNextPage()}
          className="py-4 mb-4"
          textClassName="text-sm"
        >
          Load More
        </Button>
      );
    }
    if (visibleOnlineResults.length === 0 && !isOnlineSearching) {
      return (
        <View className="px-4 py-4">
          <Text className="text-text-secondary text-sm text-center">
            No online results from {selectedProviderName}
          </Text>
        </View>
      );
    }
    return null;
  };

  const resultKeyExtractor = (item: ResultRow, index: number) => {
    switch (item.type) {
      case 'food':
        return `food-${item.food.id}`;
      case 'meal':
        return `meal-${item.meal.id}`;
      case 'online':
        return `online-${item.online.source}-${item.online.id}-${index}`;
      default:
        return `${item.type}-${index}`;
    }
  };

  // --- Header ---

  const renderHeaderBar = () => (
    <View className="flex-row items-center px-4 py-2 gap-3">
      <Button
        variant="ghost"
        onPress={() => navigation.goBack()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        className="p-0"
        accessibilityLabel="Close"
      >
        <Icon name="close" size={22} color={accentColor} />
      </Button>

      <View
        className="flex-1 flex-row items-center bg-raised rounded-lg px-3"
        style={{
          borderWidth: 1,
          borderColor: isSearchFocused ? accentColor : 'transparent',
        }}
      >
        {!!searchText.trim() &&
        (isSearching || isMealSearching || isOnlineSearching) ? (
          <ActivityIndicator size="small" color={textMuted} />
        ) : (
          <Icon name="search" size={18} color={textMuted} />
        )}
        <View className="flex-1 ml-2">
          <TextInput
            className="text-text-primary"
            style={{ fontSize: 16 }}
            placeholder="Search foods..."
            placeholderTextColor={textMuted}
            value={searchText}
            onChangeText={setSearchText}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            autoFocus
          />
        </View>
        {searchText.length > 0 ? (
          <Button
            variant="ghost"
            onPress={() => setSearchText('')}
            hitSlop={8}
            className="ml-2 p-0"
            accessibilityLabel="Clear search"
          >
            <Icon name="close" size={20} color={textMuted} />
          </Button>
        ) : (
          <Button
            variant="ghost"
            onPress={openFoodScan}
            hitSlop={8}
            className="ml-2 p-0"
            accessibilityLabel="Scan Food"
          >
            <Icon name="scan" size={20} color={accentColor} />
          </Button>
        )}
      </View>

      <View ref={addButtonRef} collapsable={false}>
        <Button
          variant="ghost"
          onPress={handleAddPress}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="p-0"
          accessibilityLabel={isMealBuilderMode ? 'Add Food' : 'Add Food or Meal'}
        >
          <Icon name="add" size={26} color={accentColor} />
        </Button>
      </View>
    </View>
  );

  // --- Body ---

  const renderBody = () => {
    if (!isConnected) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Icon name="cloud-offline" size={48} color={accentColor} />
          <Text className="text-text-secondary text-base mt-4 text-center">
            Connect to a server to search foods
          </Text>
        </View>
      );
    }

    if (inSearchMode) {
      return (
        <SectionList
          sections={resultSections}
          keyExtractor={resultKeyExtractor}
          renderItem={renderResultRow}
          renderSectionHeader={renderResultSectionHeader}
          renderSectionFooter={renderResultSectionFooter}
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerClassName="pb-safe-or-4"
        />
      );
    }

    // Landing (no/short query): recent + top foods.
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
    if (landingSections.length === 0) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Icon name="search" size={48} color={textSecondary} />
          <Text className="text-text-secondary text-base mt-4 text-center">
            Search for a food or meal to log
          </Text>
        </View>
      );
    }
    return (
      <SectionList
        sections={landingSections}
        keyExtractor={(item, index) => `${index}-${item.id}`}
        renderItem={({ item }) => renderFoodRow(item)}
        renderSectionHeader={({ section }) => renderSectionHeaderTitle(section.title)}
        stickySectionHeadersEnabled
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerClassName="pb-safe-or-4"
      />
    );
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {renderHeaderBar()}
      {renderBody()}
      <AnchoredMenu
        visible={menuVisible}
        anchor={menuAnchor}
        onClose={() => setMenuVisible(false)}
        items={[
          { key: 'food', label: 'New Food', icon: 'food', onPress: openCreateFood },
          { key: 'meal', label: 'New Meal', icon: 'meal', onPress: openMealAdd },
        ]}
      />
    </View>
  );
};

export default FoodSearchScreen;
