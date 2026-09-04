import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  ActivityIndicator,
  SectionList,
  TextInput,
  Platform,
} from 'react-native';
import Button from '../components/ui/Button';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import AnchoredMenu, {
  AnchorRect,
  measureAnchoredMenuTrigger,
} from '../components/AnchoredMenu';
import type { AnchoredMenuItem } from '../components/AnchoredMenu';
import StatusView from '../components/StatusView';
import LandingEntryRow from '../components/foodSearch/LandingEntryRow';
import FoodSearchResultRow from '../components/foodSearch/FoodSearchResultRow';
import FoodSearchSectionHeader, {
  SectionTitleHeader,
} from '../components/foodSearch/FoodSearchSectionHeader';
import OnlineSectionFooter from '../components/foodSearch/OnlineSectionFooter';
import type { ResultRow, ResultSection } from '../components/foodSearch/types';
import {
  useServerConnection,
  useFoods,
  useFoodSearch,
  useMealSearch,
  useRecentMeals,
  useTopMeals,
  useExternalProviders,
  useExternalFoodSearch,
  useAllProvidersSearch,
  usePreferences,
  useDebounce,
  useFavorites,
  useProfile,
} from '../hooks';
import {
  filterByOwnership,
  OWNERSHIP_FILTER_LABELS,
  type OwnershipFilter,
} from '../utils/shareStatus';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import Toast from 'react-native-toast-message';
import { fetchExternalFoodDetails } from '../services/api/externalFoodSearchApi';
import { getApiErrorMessage } from '../services/api/errors';
import { FoodItem } from '../types/foods';
import { ExternalFoodItem } from '../types/externalFoods';
import { Meal } from '../types/meals';
import { externalFoodItemToFoodInfo } from '../types/foodInfo';
import type { FoodInfoItem } from '../types/foodInfo';
import type { RootStackScreenProps } from '../types/navigation';
import { useProviderColor } from '../utils/providerColor';
import { interleaveTopMatches } from '../utils/topMatches';
import { mergeRecent, mergeFrequent, landingKey } from '../utils/landingLists';
import type { LandingEntry } from '../utils/landingLists';
import { useHeaderActionColors } from '../hooks/useHeaderActionColors';
import {
  createNativeHeaderAccentBadge,
  createNativeHeaderIconButtonItem,
  createNativeHeaderMenuButtonItem,
} from '../utils/nativeHeaderItems';
import type { NativeStackHeaderItemMenu } from '@react-navigation/native-stack';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { ALL_PROVIDERS_VALUE } from '../constants/foodProviders';

type FoodSearchScreenProps = RootStackScreenProps<'FoodSearch'>;

// Landing (empty query) sections: recent / top, each a merged timeline of the
// user's foods and saved meals (a meal is tagged with a "Meal" badge).
type LandingSection = {
  title: string;
  data: LandingEntry[];
};

// How many local rows to show per section before the "Show all" expander, while
// online results are also on screen.
const LOCAL_RESULT_CAP = 6;

// Fallback cap for each landing section (Recently Logged / Top) when the user's
// item_display_limit preference is unset. Matches the web food-search landing.
const LANDING_ITEM_LIMIT = 10;

const FoodSearchScreen: React.FC<FoodSearchScreenProps> = ({
  navigation,
  route,
}) => {
  const { t } = useTranslation();
  const date = route.params?.date;
  const pickerMode = route.params?.pickerMode ?? 'log-entry';
  const mealTypeId = route.params?.mealTypeId;
  const mealPlanTarget = route.params?.mealPlanTarget;
  const isMealBuilderMode = pickerMode === 'meal-builder';
  const isMealPlanMode = pickerMode === 'meal-plan';
  const selectionPickerMode =
    isMealBuilderMode || isMealPlanMode ? pickerMode : undefined;
  const insets = useSafeAreaInsets();
  const [accentColor, textMuted, textSecondary, favoriteGold] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-text-secondary',
    // Gold row-star marker; kept distinct from accent so it reads as an
    // indicator, not a tap target. See MealLibraryRow for the rationale.
    '--color-cat-amber',
  ]) as [string, string, string, string];
  const { defaultColor: headerActionColor } = useHeaderActionColors();
  const usesNativeHeader = useNativeIOSHeadersActive();

  const { isConnected } = useServerConnection();
  const { profile } = useProfile();
  const ownershipFilter = useAppPreferencesStore(
    (s) => s.foodSearchOwnershipFilter
  );
  const setOwnershipFilter = useAppPreferencesStore(
    (s) => s.setFoodSearchOwnershipFilter
  );
  const isOwnershipFiltered = ownershipFilter !== 'all';
  // Mine and Family describe ownership of saved items; provider results are
  // public catalog data, so those filters suppress online search and its
  // sections entirely, matching web.
  const onlineAllowedByOwnership =
    ownershipFilter === 'all' || ownershipFilter === 'public';
  const { preferences } = usePreferences({ enabled: isConnected });
  const { recentFoods, topFoods, isLoading, isError, refetch } = useFoods({
    enabled: isConnected,
  });
  const { favoriteFoods, favoriteMeals } = useFavorites({
    enabled: isConnected,
  });

  // Per-section cap for the landing lists (foods + meals merged). Mirrors web,
  // which caps each landing section at the user's item_display_limit.
  const landingLimit = preferences?.item_display_limit ?? LANDING_ITEM_LIMIT;

  // Recent + frequently-logged meals for the landing merge. Excluded while
  // building a meal (a meal cannot contain a meal), mirroring the typed-search
  // behaviour. Requested at the section cap so the merge with foods is not
  // starved.
  const landingMealsEnabled = isConnected && !isMealBuilderMode;
  const {
    recentMeals,
    isLoading: isRecentMealsLoading,
    refetch: refetchRecentMeals,
  } = useRecentMeals({
    enabled: landingMealsEnabled,
    limit: landingLimit,
  });
  const {
    topMeals,
    isLoading: isTopMealsLoading,
    refetch: refetchTopMeals,
  } = useTopMeals({
    enabled: landingMealsEnabled,
    limit: landingLimit,
  });

  // The landing spinner waits on foods *and* meals. Rendering foods first and
  // letting meals pop in afterwards shifts rows under the user's thumb mid-tap.
  const isLandingLoading =
    isLoading ||
    (landingMealsEnabled && (isRecentMealsLoading || isTopMealsLoading));

  // The landing error state is driven by the foods query, but a failure is
  // usually shared: an outage takes down foods and meals together. Retrying
  // foods alone would clear the error screen and leave the meals half of the
  // list silently empty, since nothing else refetches it while the screen
  // stays mounted.
  const retryLanding = useCallback(() => {
    refetch();
    if (landingMealsEnabled) {
      refetchRecentMeals();
      refetchTopMeals();
    }
  }, [refetch, refetchRecentMeals, refetchTopMeals, landingMealsEnabled]);

  const [searchText, setSearchText] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [loadingFoodId, setLoadingFoodId] = useState<string | null>(null);

  // "+" New Food / New Meal menu, anchored under the button.
  const addButtonRef = useRef<View>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<AnchorRect | null>(null);

  // Local foods: the hook itself only fetches once the query is >= 2 chars.
  const { searchResults, isSearching, isSearchActive } = useFoodSearch(
    searchText,
    {
      enabled: isConnected,
    }
  );

  // Local meals (never mixed in while building a meal).
  const { searchResults: mealResults, isSearching: isMealSearching } =
    useMealSearch(searchText, { enabled: isConnected && !isMealBuilderMode });

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
    // Persisted "All Providers" default. It has its own boolean preference rather
    // than living in default_food_data_provider_id, which is a uuid column and
    // cannot hold the sentinel. Applied only above one provider, matching the
    // option list below: with a single provider the aggregated option is not
    // offered, so fall through to that provider without clearing the stored
    // preference, and re-activating a second provider restores the default.
    if (
      preferences?.food_search_all_providers_default &&
      providers.length > 1
    ) {
      setSelectedProvider(ALL_PROVIDERS_VALUE);
      return;
    }
    const defaultId = preferences?.default_food_data_provider_id;
    const defaultProvider = defaultId
      ? providers.find((provider) => provider.id === defaultId)
      : undefined;
    setSelectedProvider(defaultProvider?.id ?? providers[0].id);
  }, [
    preferences?.default_food_data_provider_id,
    preferences?.food_search_all_providers_default,
    providers,
    selectedProvider,
  ]);

  const providerOptions = useMemo(() => {
    const opts = providers.map((p) => ({
      label: p.provider_name,
      value: p.id,
    }));
    // Offer the aggregated view only when there is more than one provider.
    if (providers.length > 1) {
      opts.unshift({
        // Literal fallback, not the shared constant: the i18n audit resolves
        // defaultValue statically and treats a constant reference as a missing
        // English fallback.
        label: t('foodSearch.menu.allProviders', {
          defaultValue: 'All Providers',
        }),
        value: ALL_PROVIDERS_VALUE,
      });
    }
    return opts;
  }, [providers, t]);
  // Temporary peek at another provider; does not change the saved default.
  const handleSelectProvider = useCallback((id: string) => {
    hasUserSelectedProvider.current = true;
    setSelectedProvider(id);
  }, []);

  const selectedProviderType = useMemo(
    () => providers.find((p) => p.id === selectedProvider)?.provider_type ?? '',
    [providers, selectedProvider]
  );
  const selectedProviderName = useMemo(
    () => providers.find((p) => p.id === selectedProvider)?.provider_name ?? '',
    [providers, selectedProvider]
  );

  const isAllProviders = selectedProvider === ALL_PROVIDERS_VALUE;
  // Which By Provider accordions are expanded (All Providers mode).
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
  const handleShowAllLocal = useCallback((section: 'foods' | 'meals') => {
    if (section === 'foods') setShowAllFoods(true);
    else setShowAllMeals(true);
  }, []);

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
    enabled:
      isConnected &&
      selectedProvider !== null &&
      !isAllProviders &&
      onlineAllowedByOwnership,
    providerId: selectedProvider ?? undefined,
    autoScale: preferences?.auto_scale_open_food_facts_imports,
  });

  // All Providers fan-out: parallel per-provider searches that stream in.
  const {
    providerResults,
    anyLoading: anyProviderLoading,
    isSearchActive: isAllProvidersSearchActive,
  } = useAllProvidersSearch(searchText, providers, {
    enabled: isConnected && isAllProviders && onlineAllowedByOwnership,
    autoScale: preferences?.auto_scale_open_food_facts_imports,
  });

  // Top Matches: interleave each provider's top results (round-robin by rank),
  // capped, each tagged with its source. See interleaveTopMatches for the rule.
  const topMatches = useMemo(
    () => interleaveTopMatches(providerResults),
    [providerResults]
  );

  // --- Navigation / actions ---

  const showFoodInfo = useCallback(
    (item: FoodInfoItem) => {
      navigation.navigate('FoodEntryAdd', {
        item,
        date,
        pickerMode: selectionPickerMode,
        returnDepth: selectionPickerMode ? 2 : undefined,
        mealTypeId,
        mealPlanTarget,
      });
    },
    [navigation, date, mealPlanTarget, mealTypeId, selectionPickerMode]
  );

  const openCreateFood = useCallback(() => {
    navigation.navigate('FoodForm', {
      mode: 'create-food',
      date,
      pickerMode: selectionPickerMode,
      returnDepth: selectionPickerMode ? 2 : undefined,
      mealPlanTarget,
    });
  }, [navigation, date, mealPlanTarget, selectionPickerMode]);

  const openMealAdd = useCallback(() => {
    navigation.navigate('MealAdd');
  }, [navigation]);

  const openFoodScan = useCallback(() => {
    navigation.navigate('FoodScan', {
      date,
      pickerMode: selectionPickerMode,
      returnDepth: selectionPickerMode ? 2 : undefined,
      // Preserve the originating meal type (MealTypeDetail → FoodSearch → scan).
      mealTypeId: mealTypeId ?? undefined,
      mealPlanTarget,
      // Deliberately no providerId. The food-search provider is not the barcode
      // provider, and the server treats an explicit providerId as winning over
      // default_barcode_provider_id, so forwarding it here silently overrode the
      // user's Barcode Scanning setting. Let the server resolve the preference,
      // matching the "+" → Scan Food entry point.
    });
  }, [navigation, date, mealPlanTarget, mealTypeId, selectionPickerMode]);

  // Only the custom-header path opens the JS menu; on the native path the
  // system presents a UIMenu from the header item directly.
  const handleOverflowPress = useCallback(() => {
    measureAnchoredMenuTrigger(addButtonRef.current, (anchor) => {
      setMenuAnchor(anchor);
      setMenuVisible(true);
    });
  }, []);

  // Create actions plus the ownership filter, one overflow menu. The filter is
  // a persisted device preference, so it lives behind the menu instead of
  // spending a permanent bar on a rarely-changed choice. Built twice from the
  // same source data: AnchoredMenu items for the custom-header path, native
  // UIMenu items for the iOS native-header path — keep the two in sync.
  const localizedFilterLabels = useMemo<Record<OwnershipFilter, string>>(
    () => ({
      all: t('foodSearch.filter.all', { defaultValue: 'All' }),
      mine: t('foodSearch.filter.mine', { defaultValue: 'Mine' }),
      family: t('foodSearch.filter.family', { defaultValue: 'Family' }),
      public: t('foodSearch.filter.public', { defaultValue: 'Public' }),
    }),
    [t]
  );

  const menuItems = useMemo<AnchoredMenuItem[]>(() => {
    const items: AnchoredMenuItem[] = [
      {
        key: 'food',
        label: t('foodSearch.menu.newFood', { defaultValue: 'New Food' }),
        icon: 'food',
        onPress: openCreateFood,
      },
    ];
    if (!isMealBuilderMode && !isMealPlanMode) {
      items.push({
        key: 'meal',
        label: t('foodSearch.menu.newMeal', { defaultValue: 'New Meal' }),
        icon: 'meal',
        onPress: openMealAdd,
      });
    }
    items.push({
      key: 'show-label',
      label: t('foodSearch.menu.show', { defaultValue: 'Show' }),
      isGroupLabel: true,
    });
    for (const filter of Object.keys(
      OWNERSHIP_FILTER_LABELS
    ) as OwnershipFilter[]) {
      items.push({
        key: `filter-${filter}`,
        label: localizedFilterLabels[filter],
        selected: ownershipFilter === filter,
        onPress: () => setOwnershipFilter(filter),
      });
    }
    return items;
  }, [
    isMealBuilderMode,
    isMealPlanMode,
    openCreateFood,
    openMealAdd,
    ownershipFilter,
    setOwnershipFilter,
    localizedFilterLabels,
    t,
  ]);

  const nativeMenuItems = useMemo<
    NativeStackHeaderItemMenu['menu']['items']
  >(() => {
    const items: NativeStackHeaderItemMenu['menu']['items'] = [
      {
        type: 'action',
        label: t('foodSearch.menu.newFood', { defaultValue: 'New Food' }),
        icon: { type: 'sfSymbol', name: 'fork.knife' as never },
        onPress: openCreateFood,
      },
    ];
    if (!isMealBuilderMode && !isMealPlanMode) {
      items.push({
        type: 'action',
        label: t('foodSearch.menu.newMeal', { defaultValue: 'New Meal' }),
        icon: { type: 'sfSymbol', name: 'square.stack.3d.up.fill' as never },
        onPress: openMealAdd,
      });
    }
    items.push({
      type: 'submenu',
      label: t('foodSearch.menu.show', { defaultValue: 'Show' }),
      // An inline single-selection submenu renders as a titled section with a
      // leading checkmark on the active option (the Mail-app pattern).
      inline: true,
      multiselectable: false,
      items: (Object.keys(OWNERSHIP_FILTER_LABELS) as OwnershipFilter[]).map(
        (filter) => ({
          type: 'action',
          label: localizedFilterLabels[filter],
          state: ownershipFilter === filter ? 'on' : 'off',
          onPress: () => setOwnershipFilter(filter),
        })
      ),
    });
    return items;
  }, [
    isMealBuilderMode,
    isMealPlanMode,
    openCreateFood,
    openMealAdd,
    ownershipFilter,
    setOwnershipFilter,
    localizedFilterLabels,
    t,
  ]);

  useLayoutEffect(() => {
    if (!usesNativeHeader) return;

    navigation.setOptions({
      unstable_headerLeftItems: () => [
        createNativeHeaderIconButtonItem({
          sfSymbol: 'xmark',
          identifier: 'food-search-close',
          tintColor: headerActionColor,
          accessibilityLabel: t('common.close', { defaultValue: 'Close' }),
          onPress: () => navigation.goBack(),
        }),
      ],
      unstable_headerRightItems: () => [
        createNativeHeaderMenuButtonItem({
          // Bare glyph: Liquid Glass draws its own circular button background,
          // so ellipsis.circle would double up the ring.
          sfSymbol: 'ellipsis',
          identifier: 'food-search-overflow',
          tintColor: headerActionColor,
          accessibilityLabel: isOwnershipFiltered
            ? t('foodSearch.accessibility.moreFiltered', {
                defaultValue: 'More options, filtered to {{filter}}',
                filter: localizedFilterLabels[ownershipFilter],
              })
            : t('foodSearch.accessibility.moreOptions', {
                defaultValue: 'More options',
              }),
          badge: isOwnershipFiltered
            ? createNativeHeaderAccentBadge(accentColor)
            : undefined,
          menuItems: nativeMenuItems,
        }),
      ],
    });
  }, [
    accentColor,
    headerActionColor,
    isOwnershipFiltered,
    localizedFilterLabels,
    nativeMenuItems,
    navigation,
    ownershipFilter,
    usesNativeHeader,
    t,
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
      if (
        (item.source === 'fatsecret' || item.source === 'yazio') &&
        providerId
      ) {
        setLoadingFoodId(item.id);
        try {
          const detailed = await fetchExternalFoodDetails(
            item.source,
            item.id,
            providerId,
            // Keep the serving the result row displayed so the detail view
            // doesn't silently switch to the provider's default serving.
            {
              serving_size: item.serving_size,
              serving_unit: item.serving_unit,
              serving_description: item.serving_description,
            }
          );
          // The details endpoint does not always echo the photo the search
          // result carried, so re-attach it rather than losing the image the
          // user just saw. Mirrors the web food search.
          showFoodInfo(
            externalFoodItemToFoodInfo({
              ...detailed,
              images: detailed.images?.length ? detailed.images : item.images,
              image_url: detailed.image_url ?? item.image_url,
              image_source_url:
                detailed.image_source_url ?? item.image_source_url,
            })
          );
        } catch (error) {
          const message =
            getApiErrorMessage(error) ??
            t('foodSearch.errors.loadNutritionDetails', {
              defaultValue: "Couldn't load full nutrition details.",
            });
          Toast.show({
            type: 'error',
            text1: t('foodSearch.errors.detailsUnavailable', {
              defaultValue: 'Details unavailable',
            }),
            text2: message,
          });
          showFoodInfo(externalFoodItemToFoodInfo(item));
        }
        setLoadingFoodId(null);
        return;
      }
      showFoodInfo(externalFoodItemToFoodInfo(item));
    },
    [selectedProvider, providers, showFoodInfo, t]
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
  // Only show online results from the currently selected provider. On a swap,
  // keepPreviousData holds the previous provider's results in the hook until the
  // new ones load; filtering by source drops those stale rows immediately (so a
  // spinner shows, matching web) while still keeping results in place while
  // typing within the same provider.
  const visibleOnlineResults = useMemo(
    () =>
      onlineResults.filter((online) => online.source === selectedProviderType),
    [onlineResults, selectedProviderType]
  );
  const showOnlineSection =
    !!selectedProviderName &&
    (isOnlineSearchActive || visibleOnlineResults.length > 0);

  const filteredFavoriteFoods = useMemo(
    () => filterByOwnership(favoriteFoods, ownershipFilter, profile?.id),
    [favoriteFoods, ownershipFilter, profile?.id]
  );
  const filteredFavoriteMeals = useMemo(
    () => filterByOwnership(favoriteMeals, ownershipFilter, profile?.id),
    [favoriteMeals, ownershipFilter, profile?.id]
  );
  const filteredRecentFoods = useMemo(
    () => filterByOwnership(recentFoods, ownershipFilter, profile?.id),
    [recentFoods, ownershipFilter, profile?.id]
  );
  const filteredTopFoods = useMemo(
    () => filterByOwnership(topFoods, ownershipFilter, profile?.id),
    [topFoods, ownershipFilter, profile?.id]
  );
  const filteredRecentMeals = useMemo(
    () => filterByOwnership(recentMeals, ownershipFilter, profile?.id),
    [recentMeals, ownershipFilter, profile?.id]
  );
  const filteredTopMeals = useMemo(
    () => filterByOwnership(topMeals, ownershipFilter, profile?.id),
    [topMeals, ownershipFilter, profile?.id]
  );

  const filteredSearchResults = useMemo(
    () => filterByOwnership(searchResults, ownershipFilter, profile?.id),
    [searchResults, ownershipFilter, profile?.id]
  );
  const filteredMealResults = useMemo(
    () => filterByOwnership(mealResults, ownershipFilter, profile?.id),
    [mealResults, ownershipFilter, profile?.id]
  );

  // Based on the FILTERED lists: results the ownership filter hides must still
  // produce the status row (which names the filter), not a silently blank list.
  const hasLocalResults =
    filteredSearchResults.length > 0 ||
    (!isMealBuilderMode && filteredMealResults.length > 0);

  // Favorites: the first landing section, starred foods and meals intermixed,
  // most recently starred first. Modelled as LandingEntry so every landing
  // section shares one row renderer and one key space.
  //
  // Meals are withheld in meal-builder mode, matching the rest of the screen:
  // recent/top meals and meal search are both disabled there. Not because a
  // meal cannot contain a meal — the model supports that (item_type/
  // child_meal_id) — but because this picker cannot yet EMIT one, and
  // handleMealBuilderAdd rejects a 'meal' source outright. Without this gate
  // Favorites is the only surface that offers a meal and then refuses it two
  // screens later. Drop the gate once the picker learns to emit child_meal_id.
  const favoriteEntries = useMemo<LandingEntry[]>(() => {
    const selectableMeals = isMealBuilderMode ? [] : filteredFavoriteMeals;
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
      ...filteredFavoriteFoods.map((food) => ({
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
    // No dedupe needed: a food and a meal never share a key (kind-prefixed),
    // and the DB's unique constraints stop the same row arriving twice.
    return tagged
      .sort((a, b) => b.favoritedAt - a.favoritedAt)
      .map((t) => t.entry);
  }, [filteredFavoriteFoods, filteredFavoriteMeals, isMealBuilderMode]);

  // One notion of "starred", shared by the landing (which excludes favorites
  // from the sections below Favorites) and the search results (which float them
  // to the top of their own section).
  const favoriteKeys = useMemo(
    () => new Set(favoriteEntries.map((entry) => entry.key)),
    [favoriteEntries]
  );

  // Once a query is typed, favorites float to the top of their own section
  // rather than being pulled into a group of their own: a favorited meal stays
  // under Your Meals, just first. The rest keep the backend's relevance order,
  // and filter preserves it, so favorites stay relevance-ordered among
  // themselves too. This runs before the LOCAL_RESULT_CAP slice below, or a
  // favorite ranked outside the cap could never float up.
  const searchFoodsFavFirst = useMemo(() => {
    const isFavorite = (food: FoodItem) =>
      favoriteKeys.has(landingKey('food', food.id));
    return [
      ...filteredSearchResults.filter(isFavorite),
      ...filteredSearchResults.filter((food) => !isFavorite(food)),
    ];
  }, [filteredSearchResults, favoriteKeys]);
  const searchMealsFavFirst = useMemo(() => {
    const isFavorite = (meal: Meal) =>
      favoriteKeys.has(landingKey('meal', meal.id));
    return [
      ...filteredMealResults.filter(isFavorite),
      ...filteredMealResults.filter((meal) => !isFavorite(meal)),
    ];
  }, [filteredMealResults, favoriteKeys]);

  const landingSections = useMemo<LandingSection[]>(() => {
    // Each section excludes what the sections above it already show, so the
    // landing never repeats a row: Recent drops favorites, Top drops favorites
    // and Recent. The exclusions are passed into the merges rather than applied
    // to their results, because both merges cap at landingLimit last — filtering
    // afterwards would shrink a section below its cap.
    // Recently Logged: foods + meals merged into one recency timeline.
    const recentEntries = mergeRecent(
      filteredRecentMeals,
      filteredRecentFoods,
      landingLimit,
      favoriteKeys
    );
    // Top: foods + meals by usage.
    const frequentEntries = mergeFrequent(
      filteredTopMeals,
      filteredTopFoods,
      landingLimit,
      new Set([...favoriteKeys, ...recentEntries.map((entry) => entry.key)])
    );
    return [
      {
        title: t('foodSearch.sections.favorites', {
          defaultValue: 'Favorites',
        }),
        data: favoriteEntries,
      },
      {
        title: t('foodSearch.sections.recentlyLogged', {
          defaultValue: 'Recently Logged',
        }),
        data: recentEntries,
      },
      {
        title: t('foodSearch.sections.top', { defaultValue: 'Top' }),
        data: frequentEntries,
      },
    ].filter((section) => section.data.length > 0);
  }, [
    favoriteEntries,
    favoriteKeys,
    filteredRecentFoods,
    filteredTopFoods,
    filteredRecentMeals,
    filteredTopMeals,
    landingLimit,
    t,
  ]);

  const resultSections = useMemo<ResultSection[]>(() => {
    const sections: ResultSection[] = [];

    // Cap the local sections only when an online section will also render, so a
    // pure local search is never truncated.
    const willShowOnline =
      (isAllProviders ? isAllProvidersSearchActive : showOnlineSection) &&
      onlineAllowedByOwnership;

    if (hasLocalResults) {
      if (searchFoodsFavFirst.length > 0) {
        const capFoods = willShowOnline && !showAllFoods;
        const shown = capFoods
          ? searchFoodsFavFirst.slice(0, LOCAL_RESULT_CAP)
          : searchFoodsFavFirst;
        const data: ResultRow[] = shown.map((food) => ({ type: 'food', food }));
        if (capFoods && searchFoodsFavFirst.length > LOCAL_RESULT_CAP) {
          data.push({
            type: 'show-all-local',
            section: 'foods',
            count: searchFoodsFavFirst.length,
          });
        }
        sections.push({
          key: 'foods',
          kind: 'food',
          title: t('foodSearch.sections.yourFoods', {
            defaultValue: 'Your Foods',
          }),
          data,
        });
      }
      if (!isMealBuilderMode && searchMealsFavFirst.length > 0) {
        const capMeals = willShowOnline && !showAllMeals;
        const shown = capMeals
          ? searchMealsFavFirst.slice(0, LOCAL_RESULT_CAP)
          : searchMealsFavFirst;
        const data: ResultRow[] = shown.map((meal) => ({ type: 'meal', meal }));
        if (capMeals && searchMealsFavFirst.length > LOCAL_RESULT_CAP) {
          data.push({
            type: 'show-all-local',
            section: 'meals',
            count: searchMealsFavFirst.length,
          });
        }
        sections.push({
          key: 'meals',
          kind: 'meal',
          title: t('foodSearch.sections.yourMeals', {
            defaultValue: 'Your Meals',
          }),
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

    if (isAllProviders && onlineAllowedByOwnership) {
      // Aggregated "All Providers" view: Top Matches then a By Provider
      // accordion per provider, each streaming in independently. Gate on the
      // hook's debounced active flag (not raw text length) so the sections do
      // not flash "No results" during the debounce window before queries fire.
      if (isAllProvidersSearchActive) {
        sections.push({
          key: 'online-top',
          kind: 'online-top',
          title: t('foodSearch.sections.topMatches', {
            defaultValue: 'Top Matches',
          }),
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
          title: t('foodSearch.sections.byProvider', {
            defaultValue: 'By Provider',
          }),
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
    } else if (showOnlineSection && onlineAllowedByOwnership) {
      sections.push({
        key: 'online',
        kind: 'online',
        title: selectedProviderName,
        data: visibleOnlineResults.map((online) => ({
          type: 'online',
          online,
        })),
      });
    }

    return sections;
  }, [
    hasLocalResults,
    stableLocalPending,
    searchFoodsFavFirst,
    searchMealsFavFirst,
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
    onlineAllowedByOwnership,
    t,
  ]);

  // --- Results list renderers ---

  const renderResultRow = ({ item }: { item: ResultRow }) => (
    <FoodSearchResultRow
      row={item}
      profileId={profile?.id}
      favoriteKeys={favoriteKeys}
      favoriteGold={favoriteGold}
      accentColor={accentColor}
      textMuted={textMuted}
      loadingFoodId={loadingFoodId}
      ownershipFilter={ownershipFilter}
      onResetOwnershipFilter={() => setOwnershipFilter('all')}
      isMealBuilderMode={isMealBuilderMode}
      getProviderColor={getProviderColor}
      onSelectFood={showFoodInfo}
      onSelectOnlineFood={handleExternalFoodTap}
      onSelectProvider={handleSelectProvider}
      onShowAllLocal={handleShowAllLocal}
    />
  );

  const renderResultSectionHeader = ({
    section,
  }: {
    section: ResultSection;
  }) => (
    <FoodSearchSectionHeader
      section={section}
      providerOptions={providerOptions}
      selectedProvider={selectedProvider}
      selectedProviderName={selectedProviderName}
      isAllProviders={isAllProviders}
      anyProviderLoading={anyProviderLoading}
      isOnlineSearching={isOnlineSearching}
      expandedProviders={expandedProviders}
      getProviderColor={getProviderColor}
      accentColor={accentColor}
      textMuted={textMuted}
      textSecondary={textSecondary}
      onSelectProvider={handleSelectProvider}
      onToggleProvider={toggleProvider}
    />
  );

  const renderResultSectionFooter = ({
    section,
  }: {
    section: ResultSection;
  }) => {
    if (section.kind !== 'online') return null;

    return (
      <OnlineSectionFooter
        isOnlineSearching={isOnlineSearching}
        visibleOnlineResultCount={visibleOnlineResults.length}
        isFetchNextPageError={isFetchNextPageError}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={hasNextPage}
        selectedProviderName={selectedProviderName}
        accentColor={accentColor}
        onFetchNextPage={fetchNextPage}
      />
    );
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
          accessibilityLabel={t('common.close', { defaultValue: 'Close' })}
        >
          <Icon name="close" size={22} color={headerActionColor} />
        </Button>
      )}

      <View
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
        <View className="flex-1 ml-2">
          <TextInput
            className="text-text-primary"
            style={{ fontSize: 16, padding: 0, includeFontPadding: false }}
            placeholder={t('foodSearch.search.placeholder', {
              defaultValue: 'Search foods...',
            })}
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
            className="ml-2"
            accessibilityLabel={t('foodSearch.accessibility.clearSearch', {
              defaultValue: 'Clear search',
            })}
          >
            <Icon name="close" size={20} color={textMuted} />
          </Button>
        ) : (
          <Button
            variant="header"
            onPress={openFoodScan}
            hitSlop={8}
            className="ml-2"
            accessibilityLabel={t('foodSearch.accessibility.scanFood', {
              defaultValue: 'Scan Food',
            })}
          >
            <Icon name="scan" size={20} color={headerActionColor} />
          </Button>
        )}
      </View>

      {!usesNativeHeader && (
        <View ref={addButtonRef} collapsable={false}>
          <Button
            variant="ghost"
            onPress={handleOverflowPress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="p-0"
            accessibilityLabel={
              isOwnershipFiltered
                ? t('foodSearch.accessibility.moreFiltered', {
                    defaultValue: 'More options, filtered to {{filter}}',
                    filter: localizedFilterLabels[ownershipFilter],
                  })
                : t('foodSearch.accessibility.moreOptions', {
                    defaultValue: 'More options',
                  })
            }
          >
            <View>
              <Icon
                name="ellipsis-horizontal"
                size={24}
                color={headerActionColor}
              />
              {isOwnershipFiltered && (
                <View
                  className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                  style={{ backgroundColor: accentColor }}
                />
              )}
            </View>
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
            {t('foodSearch.states.connectToSearch', {
              defaultValue: 'Connect to a server to search foods',
            })}
          </Text>
        </View>
      );
    }

    if (inSearchMode) {
      return (
        <View className="flex-1 bg-surface">
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
        </View>
      );
    }

    // Landing (no/short query): recent + top foods.
    if (isLandingLoading) {
      return <StatusView loading />;
    }
    if (isError) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Icon name="alert-circle" size={48} color={accentColor} />
          <Text className="text-text-secondary text-base mt-4 text-center">
            {t('foodSearch.states.failedToLoad', {
              defaultValue: 'Failed to load foods',
            })}
          </Text>
          <Button
            variant="secondary"
            onPress={retryLanding}
            className="mt-4 px-6"
          >
            {t('common.retry', { defaultValue: 'Retry' })}
          </Button>
        </View>
      );
    }
    if (landingSections.length === 0) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Icon name="search" size={48} color={textSecondary} />
          <Text className="text-text-secondary text-base mt-4 text-center">
            {isOwnershipFiltered
              ? t('foodSearch.states.noFilteredFoods', {
                  defaultValue: 'No foods in {{filter}}',
                  filter: localizedFilterLabels[ownershipFilter],
                })
              : t('foodSearch.states.searchToLog', {
                  defaultValue: 'Search for a food or meal to log',
                })}
          </Text>
          {isOwnershipFiltered && (
            <Button
              variant="secondary"
              onPress={() => setOwnershipFilter('all')}
              className="mt-4 px-6"
            >
              {t('foodSearch.filter.showAll', { defaultValue: 'Show All' })}
            </Button>
          )}
        </View>
      );
    }
    return (
      <View className="flex-1 bg-surface">
        <SectionList
          sections={landingSections}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => (
            <LandingEntryRow
              entry={item}
              profileId={profile?.id}
              favoriteKeys={favoriteKeys}
              favoriteGold={favoriteGold}
              onSelect={showFoodInfo}
            />
          )}
          renderSectionHeader={({ section }) => (
            <SectionTitleHeader title={section.title} />
          )}
          stickySectionHeadersEnabled
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerClassName="pb-safe-or-4"
        />
      </View>
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
        items={menuItems}
      />
    </View>
  );
};

export default FoodSearchScreen;
