import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  SectionList,
  TextInput,
  Keyboard,
  Platform,
  useWindowDimensions,
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
  useAllProvidersSearch,
  usePreferences,
} from '../hooks';
import { ExternalProvider } from '../types/externalProviders';
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
import { useProviderColor } from '../utils/providerColor';
import { interleaveTopMatches } from '../utils/topMatches';
import { useHeaderActionColors } from '../hooks/useHeaderActionColors';
import { createNativeHeaderIconButtonItem } from '../utils/nativeHeaderItems';

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
  | { type: 'online'; online: ExternalFoodItem; providerId?: string }
  | {
      type: 'online-top';
      online: ExternalFoodItem;
      providerName: string;
      providerId?: string;
    }
  | { type: 'show-all'; provider: ExternalProvider; count: number }
  | { type: 'show-all-local'; section: 'foods' | 'meals'; count: number }
  | { type: 'provider-skeleton' }
  | { type: 'empty-local' }
  | { type: 'local-loading' };

type ResultSection = {
  key: string;
  title: string | null;
  kind:
    | 'food'
    | 'meal'
    | 'online'
    | 'online-top'
    | 'online-provider'
    | 'label'
    | 'empty-local'
    | 'status';
  data: ResultRow[];
  provider?: ExternalProvider;
  count?: number;
  providerLoading?: boolean;
  providerError?: boolean;
  onRetry?: () => void;
};

// Sentinel provider id for the aggregated "All Providers" mode.
const ALL_PROVIDERS_VALUE = '__all__';

// How many local rows to show per section before the "Show all" expander, while
// online results are also on screen.
const LOCAL_RESULT_CAP = 6;

const FoodSearchScreen: React.FC<FoodSearchScreenProps> = ({ navigation, route }) => {
  const date = route.params?.date;
  const pickerMode = route.params?.pickerMode ?? 'log-entry';
  const isMealBuilderMode = pickerMode === 'meal-builder';
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [accentColor, textMuted, textSecondary] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-text-secondary',
  ]) as [string, string, string];
  const { defaultColor: headerActionColor, headerTintColor } = useHeaderActionColors();
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
  const getProviderColor = useProviderColor(providers);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const hasUserSelectedProvider = useRef(false);

  // Sync to the user's default (or first) provider until the user taps the
  // online section header to peek at a different provider's results.
  React.useEffect(() => {
    if (providers.length === 0) return;
    if (
      hasUserSelectedProvider.current &&
      ((selectedProvider === ALL_PROVIDERS_VALUE && providers.length > 1) ||
        providers.some((provider) => provider.id === selectedProvider))
    ) {
      return;
    }
    const defaultId = preferences?.default_food_data_provider_id;
    const defaultProvider = defaultId
      ? providers.find((provider) => provider.id === defaultId)
      : undefined;
    setSelectedProvider(defaultProvider?.id ?? providers[0].id);
  }, [preferences?.default_food_data_provider_id, providers, selectedProvider]);

  const providerOptions = useMemo(() => {
    const opts = providers.map((p) => ({
      label: p.provider_name,
      value: p.id,
    }));
    // Offer the aggregated view only when there is more than one provider.
    if (providers.length > 1) {
      opts.unshift({ label: 'All Providers', value: ALL_PROVIDERS_VALUE });
    }
    return opts;
  }, [providers]);
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

  const isAllProviders = selectedProvider === ALL_PROVIDERS_VALUE;
  // Which By Source provider accordions are expanded (All Providers mode).
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleProvider = useCallback((id: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // The local sections (Your Foods / Your Meals) are capped to a few rows while
  // online results are also showing, so a large local match set does not bury
  // the online section below the fold. A "Show all" row lifts the cap; a new
  // query resets it.
  const [showAllFoods, setShowAllFoods] = useState(false);
  const [showAllMeals, setShowAllMeals] = useState(false);
  React.useEffect(() => {
    setShowAllFoods(false);
    setShowAllMeals(false);
  }, [searchText]);

  // Single-provider online search (disabled while All Providers is active).
  const {
    searchResults: onlineResults,
    isSearching: isOnlineSearching,
    isSearchActive: isOnlineSearchActive,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useExternalFoodSearch(searchText, selectedProviderType, {
    enabled: isConnected && selectedProvider !== null && !isAllProviders,
    providerId: selectedProvider ?? undefined,
    autoScale: preferences?.auto_scale_open_food_facts_imports,
  });

  // All Providers fan-out: parallel per-provider searches that stream in.
  const {
    providerResults,
    anyLoading: anyProviderLoading,
    isSearchActive: isAllProvidersSearchActive,
  } = useAllProvidersSearch(searchText, providers, {
    enabled: isConnected && isAllProviders,
    autoScale: preferences?.auto_scale_open_food_facts_imports,
  });

  // Top Matches: interleave each provider's top results (round-robin by rank),
  // capped, each tagged with its source. See interleaveTopMatches for the rule.
  const topMatches = useMemo(
    () => interleaveTopMatches(providerResults),
    [providerResults],
  );

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
      // Never forward the All Providers sentinel as a real provider; the scanner
      // should fall back to its default provider in that mode.
      providerId:
        selectedProvider === ALL_PROVIDERS_VALUE
          ? undefined
          : (selectedProvider ?? undefined),
    });
  }, [navigation, date, isMealBuilderMode, selectedProvider]);

  // In meal-builder mode the only create action is a food, so skip the menu.
  const handleAddPress = useCallback(() => {
    if (isMealBuilderMode) {
      openCreateFood();
      return;
    }
    if (Platform.OS === 'ios') {
      setMenuAnchor({
        x: windowWidth - 48,
        y: insets.top,
        width: 36,
        height: 36,
      });
      setMenuVisible(true);
      return;
    }
    addButtonRef.current?.measureInWindow((x, y, width, height) => {
      setMenuAnchor({ x, y, width, height });
      setMenuVisible(true);
    });
  }, [insets.top, isMealBuilderMode, openCreateFood, windowWidth]);

  useLayoutEffect(() => {
    navigation.setOptions({ headerTintColor });

    if (Platform.OS !== 'ios') return;

    navigation.setOptions({
      unstable_headerLeftItems: () => [
        createNativeHeaderIconButtonItem({
          sfSymbol: 'xmark',
          identifier: 'food-search-close',
          tintColor: headerActionColor,
          accessibilityLabel: 'Close',
          onPress: () => navigation.goBack(),
        }),
      ],
      unstable_headerRightItems: () => [
        createNativeHeaderIconButtonItem({
          sfSymbol: 'plus',
          identifier: 'food-search-add',
          tintColor: headerActionColor,
          accessibilityLabel: isMealBuilderMode ? 'Add Food' : 'Add Food or Meal',
          onPress: handleAddPress,
        }),
      ],
    });
  }, [
    handleAddPress,
    headerActionColor,
    headerTintColor,
    isMealBuilderMode,
    navigation,
  ]);

  const handleExternalFoodTap = useCallback(
    async (item: ExternalFoodItem, explicitProviderId?: string) => {
      // Prefer the exact provider id carried by the result row (needed when
      // multiple providers share a type). Fall back to resolving by source: the
      // sentinel in All Providers mode, otherwise the selected provider.
      const providerId =
        explicitProviderId ??
        (selectedProvider === ALL_PROVIDERS_VALUE
          ? providers.find((p) => p.provider_type === item.source)?.id
          : selectedProvider);
      if ((item.source === 'fatsecret' || item.source === 'yazio') && providerId) {
        setLoadingFoodId(item.id);
        try {
          const detailed = await fetchExternalFoodDetails(
            item.source,
            item.id,
            providerId,
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
    [selectedProvider, providers, showFoodInfo],
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

    // Cap the local sections only when an online section will also render, so a
    // pure local search is never truncated.
    const willShowOnline = isAllProviders
      ? isAllProvidersSearchActive
      : showOnlineSection;

    if (hasLocalResults) {
      if (searchResults.length > 0) {
        const capFoods = willShowOnline && !showAllFoods;
        const shown = capFoods
          ? searchResults.slice(0, LOCAL_RESULT_CAP)
          : searchResults;
        const data: ResultRow[] = shown.map((food) => ({ type: 'food', food }));
        if (capFoods && searchResults.length > LOCAL_RESULT_CAP) {
          data.push({
            type: 'show-all-local',
            section: 'foods',
            count: searchResults.length,
          });
        }
        sections.push({ key: 'foods', kind: 'food', title: 'Your Foods', data });
      }
      if (!isMealBuilderMode && mealResults.length > 0) {
        const capMeals = willShowOnline && !showAllMeals;
        const shown = capMeals
          ? mealResults.slice(0, LOCAL_RESULT_CAP)
          : mealResults;
        const data: ResultRow[] = shown.map((meal) => ({ type: 'meal', meal }));
        if (capMeals && mealResults.length > LOCAL_RESULT_CAP) {
          data.push({
            type: 'show-all-local',
            section: 'meals',
            count: mealResults.length,
          });
        }
        sections.push({ key: 'meals', kind: 'meal', title: 'Your Meals', data });
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

    if (isAllProviders) {
      // Aggregated "All Providers" view: Top Matches then a By Source
      // accordion per provider, each streaming in independently. Gate on the
      // hook's debounced active flag (not raw text length) so the sections do
      // not flash "No results" during the debounce window before queries fire.
      if (isAllProvidersSearchActive) {
        sections.push({
          key: 'online-top',
          kind: 'online-top',
          title: 'Top Matches',
          data: topMatches.map((m) => ({
            type: 'online-top',
            online: m.online,
            providerName: m.providerName,
            providerId: m.providerId,
          })),
        });
        sections.push({
          key: 'by-source-label',
          kind: 'label',
          title: 'By Source',
          data: [],
        });
        for (const r of providerResults) {
          const expanded = expandedProviders.has(r.provider.id);
          let rows: ResultRow[] = [];
          if (expanded) {
            if (r.isLoading && r.items.length === 0) {
              rows = [{ type: 'provider-skeleton' }];
            } else {
              rows = r.items.map((online) => ({
                type: 'online' as const,
                online,
                providerId: r.provider.id,
              }));
              if (r.totalCount > r.items.length) {
                rows.push({
                  type: 'show-all',
                  provider: r.provider,
                  count: r.totalCount,
                });
              }
            }
          }
          sections.push({
            key: `online-provider-${r.provider.id}`,
            kind: 'online-provider',
            title: r.provider.provider_name,
            data: rows,
            provider: r.provider,
            count: r.totalCount,
            providerLoading: r.isLoading,
            providerError: r.isError,
            onRetry: r.refetch,
          });
        }
      }
    } else if (showOnlineSection) {
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
    isAllProviders,
    isAllProvidersSearchActive,
    topMatches,
    providerResults,
    expandedProviders,
    showAllFoods,
    showAllMeals,
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

  const renderOnlineRow = (
    item: ExternalFoodItem,
    badge?: string,
    providerId?: string,
  ) => (
    <TouchableOpacity
      className="px-4 py-3 border-b border-border-subtle"
      activeOpacity={0.7}
      disabled={loadingFoodId !== null}
      onPress={() => {
        void handleExternalFoodTap(item, providerId);
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
          {badge || item.brand ? (
            <View className="flex-row items-center gap-1.5 mt-0.5">
              {badge ? (
                <View className="px-1.5 py-0.5 rounded overflow-hidden">
                  <View
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: getProviderColor(providerId),
                      opacity: 0.13,
                    }}
                  />
                  <Text
                    className="text-xs font-semibold"
                    style={{ color: getProviderColor(providerId) }}
                  >
                    {badge}
                  </Text>
                </View>
              ) : null}
              {item.brand ? (
                <Text className="text-text-secondary text-sm">{item.brand}</Text>
              ) : null}
            </View>
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

  // "Show all N <provider> results" → switch into single-provider mode for that
  // provider, which shows the full paginated list.
  const renderShowAllRow = (provider: ExternalProvider, count: number) => (
    <TouchableOpacity
      className="px-4 py-3 border-b border-border-subtle"
      activeOpacity={0.7}
      onPress={() => handleSelectProvider(provider.id)}
    >
      <Text className="text-sm font-medium" style={{ color: accentColor }}>
        Show all {count} {provider.provider_name} results
      </Text>
    </TouchableOpacity>
  );

  const renderLocalShowAllRow = (section: 'foods' | 'meals', count: number) => (
    <TouchableOpacity
      className="px-4 py-3 border-b border-border-subtle"
      activeOpacity={0.7}
      onPress={() =>
        section === 'foods' ? setShowAllFoods(true) : setShowAllMeals(true)
      }
    >
      <Text className="text-sm font-medium" style={{ color: accentColor }}>
        Show all {count} {section === 'foods' ? 'foods' : 'meals'}
      </Text>
    </TouchableOpacity>
  );

  const renderProviderSkeleton = () => (
    <View className="px-4 py-3 gap-2">
      {[0.8, 0.6, 0.7].map((w, i) => (
        <View
          key={i}
          className="h-4 rounded"
          style={{
            width: `${w * 100}%`,
            backgroundColor: textMuted,
            opacity: 0.15,
          }}
        />
      ))}
    </View>
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
        return renderOnlineRow(item.online, undefined, item.providerId);
      case 'online-top':
        return renderOnlineRow(item.online, item.providerName, item.providerId);
      case 'show-all':
        return renderShowAllRow(item.provider, item.count);
      case 'show-all-local':
        return renderLocalShowAllRow(item.section, item.count);
      case 'provider-skeleton':
        return renderProviderSkeleton();
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

    // The External Results / Top Matches header doubles as the source switcher:
    // a single provider, or "All Providers" for the aggregated view. The current
    // value is shown in the accent colour with a double-arrow selector icon so it
    // reads as a switchable control; the icon becomes a spinner while loading.
    if (section.kind === 'online' || section.kind === 'online-top') {
      const canSwitch = providerOptions.length > 1;
      const label =
        section.kind === 'online-top' ? 'Top Matches' : 'External Results';
      const value = isAllProviders ? 'All Providers' : selectedProviderName;
      const loading = isAllProviders ? anyProviderLoading : isOnlineSearching;
      const header = (
        <View className="px-4 py-2 bg-surface flex-row items-center justify-between">
          <Text className="text-text-muted text-xs font-semibold uppercase">
            {label}
          </Text>
          <View className="flex-row items-center gap-1">
            <Text
              className="text-xs font-medium"
              style={{ color: canSwitch ? accentColor : textSecondary }}
            >
              {value}
            </Text>
            {loading ? (
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
              accessibilityLabel={`Source ${value}, tap to change`}
            >
              {header}
            </Pressable>
          )}
        />
      );
    }

    // By Source: a tappable accordion header per provider, with a result-count
    // badge and a per-provider loading spinner.
    if (section.kind === 'online-provider' && section.provider) {
      const provider = section.provider;
      const expanded = expandedProviders.has(provider.id);
      const color = getProviderColor(provider.id);
      const loading = !!section.providerLoading;
      const errored = !!section.providerError && !loading;
      const count = section.count ?? 0;
      const empty = !loading && !errored && count === 0;
      const expandable = !loading && !errored && count > 0;
      const onPress = errored
        ? section.onRetry
        : expandable
          ? () => toggleProvider(provider.id)
          : undefined;
      return (
        <Pressable
          onPress={onPress}
          disabled={!onPress}
          className="px-4 py-2.5 bg-surface flex-row items-center justify-between border-t border-border-subtle"
          accessibilityRole="button"
          accessibilityLabel={
            errored
              ? `${provider.provider_name}, could not load, tap to retry`
              : empty
                ? `${provider.provider_name}, no results`
                : expandable
                  ? `${provider.provider_name}, ${count} results, tap to ${
                      expanded ? 'collapse' : 'expand'
                    }`
                  : provider.provider_name
          }
        >
          <View className="flex-row items-center gap-2">
            <View
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: color }}
            />
            <Text className="text-text-primary text-sm font-semibold">
              {provider.provider_name}
            </Text>
            {expandable ? (
              <View className="px-1.5 py-0.5 rounded-full bg-background">
                <Text className="text-text-secondary text-xs">{count}</Text>
              </View>
            ) : null}
          </View>
          {loading ? (
            <ActivityIndicator size="small" color={textMuted} />
          ) : errored ? (
            <View className="flex-row items-center gap-1">
              <Text className="text-text-muted text-xs">Couldn&apos;t load</Text>
              <Icon name="sync" size={14} color={textMuted} />
            </View>
          ) : empty ? (
            <Text className="text-text-muted text-xs">No results</Text>
          ) : (
            <Icon
              name={expanded ? 'chevron-down' : 'chevron-forward'}
              size={16}
              color={textMuted}
            />
          )}
        </Pressable>
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
        // Include the provider id so two providers that share a provider_type
        // (item.online.source) cannot collide on the same key in All Providers.
        return `online-${item.providerId ?? item.online.source}-${item.online.id}-${index}`;
      case 'show-all-local':
        return `show-all-local-${item.section}`;
      default:
        return `${item.type}-${index}`;
    }
  };

  // --- Header ---

  const renderHeaderBar = () => (
    <View className="flex-row items-center px-4 py-2 gap-3">
      {Platform.OS !== 'ios' && (
        <Button
          variant="ghost"
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="p-0"
          accessibilityLabel="Close"
        >
          <Icon name="close" size={22} color={accentColor} />
        </Button>
      )}

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

      {Platform.OS !== 'ios' && (
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
      )}
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
    <View
      className="flex-1 bg-background"
      style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
    >
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
