import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import Popover from '../components/Popover';
import {
  useServerConnection,
  useFoods,
  useFoodSearch,
  useMealSearch,
  useExternalProviders,
  useExternalFoodSearch,
  useAllProvidersSearch,
  usePreferences,
  useDebounce,
} from '../hooks';
import { ExternalProvider } from '../types/externalProviders';
import Toast from 'react-native-toast-message';
import { fetchExternalFoodDetails } from '../services/api/externalFoodSearchApi';
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
import {
  searchSourcesPopover,
  providerSelectorPopover,
} from '../services/foodSearchPreferences';
import { formatServingDescription, formatServingUnit } from '../utils/foodDetails';
import { useProviderColor } from '../utils/providerColor';
import { interleaveTopMatches } from '../utils/topMatches';
import { useHeaderActionColors } from '../hooks/useHeaderActionColors';
import { createNativeHeaderIconButtonItem } from '../utils/nativeHeaderItems';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import {
  formatMobileCalories,
  formatMobileNumber,
  localizeServingUnit,
  mobileT,
} from '../localization';

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
  | { type: 'local-status'; pending: boolean };

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
  const { defaultColor: headerActionColor, saveColor: headerSaveColor } = useHeaderActionColors();
  const iconSuccess = String(useCSSVariable('--color-icon-success'));
  const usesNativeHeader = useNativeIOSHeadersActive();

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

  // This screen's root View, the shared coordinate space for the in-tree
  // coaching popovers. Their anchors are measured against it so they line up on
  // both platforms (no cross-window offset on iOS modals).
  const rootRef = useRef<View>(null);

  // First-visit popover explaining that local + online sources are searched
  // together, anchored under the search bar. The search bar's onLayout rect is
  // relative to the root View, where the popover also renders, so the two share
  // one coordinate space.
  const [searchBarLayout, setSearchBarLayout] = useState<AnchorRect | null>(null);
  const [introVisible, setIntroVisible] = useState(false);
  const introHandledRef = useRef(false);

  // Show the intro popover once, after the search bar has laid out and the
  // server is connected (so the message about searching online actually
  // applies). Runs at most once per mount; the persisted flag prevents repeats
  // across visits.
  React.useEffect(() => {
    if (introHandledRef.current || !searchBarLayout || !isConnected) return;
    introHandledRef.current = true;
    let cancelled = false;
    void (async () => {
      if (await searchSourcesPopover.hasSeen()) return;
      if (!cancelled) setIntroVisible(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [searchBarLayout, isConnected]);

  const dismissIntro = useCallback(() => {
    setIntroVisible(false);
    void searchSourcesPopover.markSeen();
  }, []);

  // Second popover: points at the online-results source switcher once a search
  // has produced online results, nudging the user that they can change source
  // or search every source at once. The switcher header lives inside the
  // scrolling list, so its position is measured on demand (relative to the root)
  // rather than via a static onLayout rect.
  const onlineHeaderRef = useRef<View>(null);
  const [providerAnchor, setProviderAnchor] = useState<AnchorRect | null>(null);
  const [providerPopoverVisible, setProviderPopoverVisible] = useState(false);
  const providerHandledRef = useRef(false);

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
      opts.unshift({
        label: mobileT('foodSearch.allSources'),
        value: ALL_PROVIDERS_VALUE,
      });
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
    if (usesNativeHeader) {
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
  }, [insets.top, isMealBuilderMode, openCreateFood, usesNativeHeader, windowWidth]);

  useLayoutEffect(() => {
    if (!usesNativeHeader) return;

    navigation.setOptions({
      unstable_headerLeftItems: () => [
        createNativeHeaderIconButtonItem({
          sfSymbol: 'xmark',
          identifier: 'food-search-close',
          tintColor: headerActionColor,
          accessibilityLabel: mobileT('common.close'),
          onPress: () => navigation.goBack(),
        }),
      ],
      unstable_headerRightItems: () => [
        createNativeHeaderIconButtonItem({
          sfSymbol: 'plus',
          identifier: 'food-search-add',
          tintColor: headerSaveColor,
          accessibilityLabel: isMealBuilderMode
            ? mobileT('foodSearch.addFood')
            : mobileT('foodSearch.addFoodOrMeal'),
          onPress: handleAddPress,
        }),
      ],
    });
  }, [
    handleAddPress,
    headerActionColor,
    headerSaveColor,
    isMealBuilderMode,
    navigation,
    usesNativeHeader,
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
        } catch {
          Toast.show({
            type: 'error',
            text1: mobileT('foodSearch.detailsUnavailable'),
            text2: mobileT('foodSearch.partialDetails'),
          });
          showFoodInfo(externalFoodItemToFoodInfo(item));
        }
        setLoadingFoodId(null);
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
  // The foods and meals queries settle independently, so localPending can blip
  // false->true->false within a keystroke or two. Debounce just the
  // false-going transition so the status row's spinner/text swap doesn't
  // flicker mid-typing; becoming pending is still immediate via the ||.
  const debouncedNotPending = useDebounce(!localPending, 150);
  const stableLocalPending = localPending || !debouncedNotPending;
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

  // Whether the online-results source switcher header is on screen — the anchor
  // the source-switcher popover points at.
  const onlineHeaderVisible = isAllProviders
    ? isAllProvidersSearchActive
    : showOnlineSection;

  // Measure the switcher header relative to the root View (same space as the
  // in-tree popover overlay) by differencing their window positions, which keeps
  // the maths free of platform/modal/scroll offsets.
  const measureProviderAnchor = useCallback(
    () =>
      new Promise<AnchorRect | null>((resolve) => {
        const header = onlineHeaderRef.current;
        const root = rootRef.current;
        if (!header || !root) {
          resolve(null);
          return;
        }
        root.measureInWindow((rootX, rootY) => {
          header.measureInWindow((hx, hy, width, height) => {
            resolve({ x: hx - rootX, y: hy - rootY, width, height });
          });
        });
      }),
    [],
  );

  // Show the source-switcher popover once, after a search produces an online
  // section the user can switch sources on. Gated on having more than one
  // provider (so "change source" / "All Sources" actually applies). Claims its
  // single per-mount attempt like the intro popover; the persisted flag stops
  // repeats. When it appears it dismisses the intro popover (marking it seen) so
  // the two never stack — the source nudge is the more relevant message here.
  React.useEffect(() => {
    if (providerHandledRef.current) return;
    if (!isConnected || !inSearchMode) return;
    if (providers.length <= 1 || !onlineHeaderVisible) return;
    providerHandledRef.current = true;
    let cancelled = false;
    void (async () => {
      if (await providerSelectorPopover.hasSeen()) return;
      // Defer a frame so the freshly-rendered header has a measurable layout.
      requestAnimationFrame(() => {
        void measureProviderAnchor().then((rect) => {
          if (cancelled || !rect) return;
          // Replace the intro popover with the source nudge, marking the intro
          // seen so it does not reappear on a later visit.
          dismissIntro();
          setProviderAnchor(rect);
          setProviderPopoverVisible(true);
        });
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isConnected,
    inSearchMode,
    providers.length,
    onlineHeaderVisible,
    measureProviderAnchor,
    dismissIntro,
  ]);

  const dismissProviderPopover = useCallback(() => {
    setProviderPopoverVisible(false);
    void providerSelectorPopover.markSeen();
  }, []);

  // If the switcher header streams out of view while the popover is open, hide
  // it rather than leave it pointing at nothing. Not marked seen, so it can
  // reappear on a later visit.
  React.useEffect(() => {
    if (providerPopoverVisible && !onlineHeaderVisible) {
      setProviderPopoverVisible(false);
    }
  }, [providerPopoverVisible, onlineHeaderVisible]);

  const landingSections = useMemo<LandingSection[]>(() => {
    return [
      {
        title: mobileT('foodSearch.recentlyLogged'),
        data: recentFoods.slice(0, 6),
      },
      { title: mobileT('foodSearch.topFoods'), data: topFoods },
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
        sections.push({
          key: 'foods',
          kind: 'food',
          title: mobileT('foodSearch.yourFoods'),
          data,
        });
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
        sections.push({
          key: 'meals',
          kind: 'meal',
          title: mobileT('foodSearch.yourMeals'),
          data,
        });
      }
    } else {
      sections.push({
        key: 'local-status',
        kind: 'status',
        title: null,
        data: [{ type: 'local-status', pending: stableLocalPending }],
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
          title: mobileT('foodSearch.topMatches'),
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
          title: mobileT('foodSearch.bySource'),
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
    stableLocalPending,
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
        <View className="flex-1" style={{ marginEnd: 12 }}>
          <Text className="text-text-primary text-base font-medium">{item.name}</Text>
          {item.brand ? (
            <Text className="text-text-secondary text-sm mt-0.5">{item.brand}</Text>
          ) : null}
        </View>
        <View className="items-end">
          <Text className="text-text-primary text-base font-semibold">
            {formatMobileCalories(item.default_variant.calories)}
          </Text>
          <Text className="text-text-secondary text-xs">
            {formatMobileNumber(item.default_variant.serving_size)}{' '}
            {localizeServingUnit(
              formatServingUnit(item.default_variant.serving_unit),
            )}
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
      className="px-4 py-2 border-b border-border-subtle"
      activeOpacity={0.7}
      disabled={loadingFoodId !== null}
      onPress={() => {
        void handleExternalFoodTap(item, providerId);
      }}
    >
      <View className="flex-row justify-between items-center">
        <View className="flex-1" style={{ marginEnd: 12 }}>
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
                      opacity: 0.07,
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
                {formatMobileCalories(item.calories)}
              </Text>
              <Text className="text-text-secondary text-xs">
                {item.serving_description
                  ? formatServingDescription(item.serving_description)
                  : `${formatMobileNumber(item.serving_size)} ${localizeServingUnit(
                      formatServingUnit(item.serving_unit),
                    )}`}
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
        {mobileT('foodSearch.showAllProvider', {
          provider: provider.provider_name,
          count: formatMobileNumber(count, { maximumFractionDigits: 0 }),
        })}
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
        {mobileT(
          section === 'foods'
            ? 'foodSearch.showAllFoods'
            : 'foodSearch.showAllMeals',
          { count: formatMobileNumber(count, { maximumFractionDigits: 0 }) },
        )}
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
    <View className="px-4 py-1 bg-surface">
      <Text className="text-text-muted text-xs font-bold uppercase">{title}</Text>
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
      case 'local-status':
        return (
          <View className="px-4 py-6 items-center justify-center">
            <Text
              className="text-text-secondary text-base text-center"
              style={{ opacity: item.pending ? 0 : 1 }}
              importantForAccessibility={item.pending ? 'no' : 'yes'}
              accessibilityElementsHidden={item.pending}
            >
              {isMealBuilderMode
                ? mobileT('foodSearch.noSavedFoods')
                : mobileT('foodSearch.noSavedFoodsOrMeals')}
            </Text>
            {item.pending ? (
              <View
                className="absolute inset-0 items-center justify-center"
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel={
                  isMealBuilderMode
                    ? mobileT('foodSearch.searchingSavedFoods')
                    : mobileT('foodSearch.searchingSavedFoodsAndMeals')
                }
              >
                <ActivityIndicator size="small" color={accentColor} />
              </View>
            ) : null}
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
        section.kind === 'online-top'
          ? mobileT('foodSearch.topMatches')
          : mobileT('foodSearch.onlineResults');
      const value = isAllProviders
        ? mobileT('foodSearch.allSources')
        : selectedProviderName;
      const loading = isAllProviders ? anyProviderLoading : isOnlineSearching;
      const header = (
        <View
          ref={onlineHeaderRef}
          collapsable={false}
          className="px-4 py-1 bg-surface flex-row items-center justify-between"
        >
          <Text className="text-text-muted text-xs font-bold uppercase">
            {label}
          </Text>
          <View className="flex-row items-center gap-1">
            <Text
              className="text-sm font-bold"
              style={{ color: canSwitch ? accentColor : textSecondary }}
            >
              {value}
            </Text>
            {loading ? (
              <ActivityIndicator size="small" color={accentColor} />
            ) : canSwitch ? (
              <Icon name="chevron-down" size={16} color={accentColor} />
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
          title={mobileT('foodSearch.onlineProvider')}
          renderTrigger={({ onPress }) => (
            <Pressable
              onPress={() => {
                // Drop the search keyboard first so the sheet isn't hidden
                // behind it as it animates up.
                Keyboard.dismiss();
                onPress();
              }}
              accessibilityRole="button"
              accessibilityLabel={mobileT('foodSearch.sourceChange', {
                source: value,
              })}
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
              ? mobileT('foodSearch.providerLoadFailed', {
                  provider: provider.provider_name,
                })
              : empty
                ? mobileT('foodSearch.providerNoResults', {
                    provider: provider.provider_name,
                  })
                : expandable
                  ? mobileT('foodSearch.providerResults', {
                      provider: provider.provider_name,
                      count: formatMobileNumber(count, {
                        maximumFractionDigits: 0,
                      }),
                      action: mobileT(
                        expanded
                          ? 'foodSearch.collapse'
                          : 'foodSearch.expand',
                      ),
                    })
                  : provider.provider_name
          }
        >
          <View className="flex-row items-center gap-2">
            <View
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: color }}
            />
            <Text className="text-text-primary text-base font-semibold">
              {provider.provider_name}
            </Text>
            {expandable ? (
              <View className="px-1.5 py-0.5 rounded-full bg-background">
                <Text className="text-text-secondary text-xs">
                  {formatMobileNumber(count, { maximumFractionDigits: 0 })}
                </Text>
              </View>
            ) : null}
          </View>
          {loading ? (
            <ActivityIndicator size="small" color={textMuted} />
          ) : errored ? (
            <View className="flex-row items-center gap-1">
              <Text className="text-text-muted text-xs">
                {mobileT('foodSearch.couldNotLoad')}
              </Text>
              <Icon name="sync" size={14} color={textMuted} />
            </View>
          ) : empty ? (
            <Text className="text-text-muted text-xs">
              {mobileT('foodSearch.noResults')}
            </Text>
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
          {mobileT('foodSearch.loadMoreFailed')}
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
          {mobileT('foodSearch.loadMore')}
        </Button>
      );
    }
    if (visibleOnlineResults.length === 0 && !isOnlineSearching) {
      return (
        <View className="px-4 py-4">
          <Text className="text-text-secondary text-sm text-center">
            {mobileT('foodSearch.noOnlineResults', {
              provider: selectedProviderName,
            })}
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
      {!usesNativeHeader && (
        <Button
          variant="ghost"
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="p-0"
          accessibilityLabel={mobileT('common.close')}
        >
          <Icon name="close" size={22} color={headerActionColor} />
        </Button>
      )}

      <View
        onLayout={(e) => {
          const { x, y, width, height } = e.nativeEvent.layout;
          // onLayout y is relative to the header row, which flows below the
          // root's Android paddingTop. The popover overlay is absolutely
          // positioned from the root's padding-box top (above that padding), so
          // add the same top inset to land the anchor in the overlay's space.
          const topInset = Platform.OS === 'android' ? insets.top : 0;
          setSearchBarLayout((prev) => prev ?? { x, y: y + topInset, width, height });
        }}
        className="flex-1 flex-row items-center bg-raised rounded-lg px-3 py-2.5"
        style={{
          borderWidth: 1,
          borderColor: isSearchFocused ? accentColor : 'transparent',
        }}
      >
        <View className="w-[20px] h-[20px] items-center justify-center">
          {!!searchText.trim() &&
          (isSearching || isMealSearching || isOnlineSearching) ? (
            <ActivityIndicator size="small" color={textMuted} />
          ) : (
            <Icon name="search" size={18} color={textMuted} />
          )}
        </View>
        <View className="flex-1" style={{ marginStart: 8 }}>
          <TextInput
            className="text-text-primary"
            style={{ fontSize: 16, padding: 0, includeFontPadding: false }}
            placeholder={mobileT('foodSearch.searchPlaceholder')}
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
            variant="header"
            onPress={() => setSearchText('')}
            hitSlop={8}
            style={{ marginStart: 8 }}
            accessibilityLabel={mobileT('foodSearch.clearSearch')}
          >
            <Icon name="close" size={20} color={textMuted} />
          </Button>
        ) : (
          <Button
            variant="header"
            onPress={openFoodScan}
            hitSlop={8}
            style={{ marginStart: 8 }}
            accessibilityLabel={mobileT('foodSearch.scanFood')}
          >
            <Icon name="scan" size={20} color={headerActionColor} />
          </Button>
        )}
      </View>

      {!usesNativeHeader && (
        <View ref={addButtonRef} collapsable={false}>
          <Button
            variant="ghost"
            onPress={handleAddPress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="p-0"
            accessibilityLabel={
              isMealBuilderMode
                ? mobileT('foodSearch.addFood')
                : mobileT('foodSearch.addFoodOrMeal')
            }
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
            {mobileT('foodSearch.connectServer')}
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
            {mobileT('foodSearch.loadFailed')}
          </Text>
          <Button variant="secondary" onPress={() => refetch()} className="mt-4 px-6">
            {mobileT('common.retry')}
          </Button>
        </View>
      );
    }
    if (landingSections.length === 0) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Icon name="search" size={48} color={textSecondary} />
          <Text className="text-text-secondary text-base mt-4 text-center">
            {mobileT('foodSearch.startPrompt')}
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
      ref={rootRef}
      collapsable={false}
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
          {
            key: 'food',
            label: mobileT('foodSearch.newFood'),
            icon: 'food',
            onPress: openCreateFood,
          },
          {
            key: 'meal',
            label: mobileT('foodSearch.newMeal'),
            icon: 'meal',
            onPress: openMealAdd,
          },
        ]}
      />
      <Popover
        visible={introVisible}
        anchor={searchBarLayout}
        onDismiss={dismissIntro}
        title={mobileT('foodSearch.introTitle')}
        showDismissButton={false}
      >
        {mobileT('foodSearch.introDescription')}
      </Popover>
      <Popover
        visible={providerPopoverVisible}
        anchor={providerAnchor}
        onDismiss={dismissProviderPopover}
        title={mobileT('foodSearch.sourceTitle')}
        showDismissButton={false}
      >
        {mobileT('foodSearch.sourceDescription')}
      </Popover>
    </View>
  );
};

export default FoodSearchScreen;
