import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { CommonActions } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import Button from '../components/ui/Button';
import StatusView from '../components/StatusView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useQueryClient } from '@tanstack/react-query';
import Icon from '../components/Icon';
import SafeImage from '../components/SafeImage';
import SegmentedControl from '../components/SegmentedControl';
import { CATEGORY_ICON_MAP, exerciseFromExternalItem } from '../utils/workoutSession';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { useServerConnection, useExternalProviders, useSuggestedExercises, useExerciseSearch, useProfile } from '../hooks';
import {
  deriveShareStatus,
  filterByOwnership,
  ownershipFilterEmptyState,
  ownershipFilterHeaderMenu,
} from '../utils/shareStatus';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import ShareStatusBadge from '../components/ShareStatusBadge';
import { suggestedExercisesQueryKey } from '../hooks/queryKeys';
import { useExternalExerciseSearch } from '../hooks/useExternalExerciseSearch';
import { useNavigationActionGuard } from '../hooks/useNavigationActionGuard';
import { useScreenHeader } from '../hooks/useScreenHeader';
import {
  importExercise,
  isImportableExerciseSource,
} from '../services/api/externalExerciseSearchApi';
import { getApiErrorMessage } from '../services/api/errors';
import type { Exercise } from '../types/exercise';
import type { ExternalExerciseItem } from '../types/externalExercises';
import type { RootStackScreenProps } from '../types/navigation';
import { localizeExerciseTaxonomyValue } from '../localization/exerciseTaxonomy';

type ExerciseSearchScreenProps = RootStackScreenProps<'ExerciseSearch'>;

type ExerciseSection = {
  title: string;
  data: Exercise[];
};

type TabKey = 'search' | 'online';

const ExerciseSearchScreen: React.FC<ExerciseSearchScreenProps> = ({ navigation, route }) => {
  const { returnKey } = route.params;
  const { t } = useTranslation();

  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [accentColor, textMuted, textSecondary, borderSubtle] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-text-secondary',
    '--color-border-subtle',
  ]) as [string, string, string, string];
  const { isConnected } = useServerConnection();
  const { profile } = useProfile();
  const { getImageSource } = useExerciseImageSource();
  const { isNavigationLocked, runNavigationAction } = useNavigationActionGuard(navigation);

  const [activeTab, setActiveTab] = useState<TabKey>('search');
  const ownershipFilter = useAppPreferencesStore((s) => s.exerciseSearchOwnershipFilter);
  const setOwnershipFilter = useAppPreferencesStore((s) => s.setExerciseSearchOwnershipFilter);
  const [searchText, setSearchText] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [importingExerciseId, setImportingExerciseId] = useState<string | null>(null);

  const { recentExercises, topExercises, isLoading: isSuggestedLoading, isError: isSuggestedError, refetch: refetchSuggested } = useSuggestedExercises();
  const { searchResults, isSearching, isSearchActive, isSearchError } = useExerciseSearch(searchText);

  const {
    providers,
    isLoading: isProvidersLoading,
    isError: isProvidersError,
    refetch: refetchProviders,
  } = useExternalProviders({
    enabled: isConnected && activeTab === 'online',
    category: 'exercise',
  });

  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const hasUserSelectedProvider = useRef(false);

  const selectedProviderType = useMemo(
    () => providers.find((p) => p.id === selectedProvider)?.provider_type ?? '',
    [providers, selectedProvider],
  );

  const selectedProviderName = useMemo(
    () => providers.find((p) => p.id === selectedProvider)?.provider_name ?? '',
    [providers, selectedProvider],
  );

  const {
    searchResults: onlineSearchResults,
    isSearching: isOnlineSearching,
    isSearchActive: isOnlineSearchActive,
    isSearchError: isOnlineSearchError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useExternalExerciseSearch(searchText, selectedProviderType, {
    enabled: isConnected && activeTab === 'online' && selectedProvider !== null,
    providerId: selectedProvider ?? undefined,
  });

useEffect(() => {
    if (providers.length === 0) return;
    if (hasUserSelectedProvider.current && providers.some((p) => p.id === selectedProvider)) return;
    // Default the provider once the list loads; guarded by a ref tracking an
    // explicit user selection, which keeps this from moving to a render-time derive.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedProvider(providers[0].id);
  }, [providers, selectedProvider]);

  // --- Selection handlers ---

  const handleSelectExercise = useCallback((exercise: Exercise) => {
    navigation.dispatch({
      ...CommonActions.setParams({ selectedExercise: exercise, selectionNonce: Date.now() }),
      source: returnKey,
    });
    navigation.goBack();
  }, [returnKey, navigation]);

  const importInFlightRef = useRef(false);
  const handleImportExercise = useCallback(async (item: ExternalExerciseItem) => {
    // `importingExerciseId` only disables the rows after a re-render; the ref
    // blocks a second tap landing before that.
    if (importInFlightRef.current) return;
    importInFlightRef.current = true;
    setImportingExerciseId(item.id);
    try {
      const exercise = await importExercise(item.source, item.id);
      // The import succeeded server-side, so the library cache must reflect
      // it even when the selection is abandoned below.
      queryClient.invalidateQueries({ queryKey: suggestedExercisesQueryKey });
      // The import doesn't block the back swipe/button; selecting from an
      // unfocused route would dispatch to the form and pop it.
      if (navigation.isFocused()) {
        handleSelectExercise(exercise);
      }
    } catch (error) {
      // apiFetch already logs the failure; surface it so the tap isn't silent.
      Toast.show({
        type: 'error',
        text1: t('exerciseSearch.errors.failedToAddExercise', { defaultValue: 'Failed to add exercise' }),
        text2: getApiErrorMessage(error) ?? undefined,
      });
    }
    // No `finally`: the react compiler can't lower it and would bail on the
    // whole component. Every path above falls through to this cleanup.
    importInFlightRef.current = false;
    setImportingExerciseId(null);
  }, [queryClient, handleSelectExercise, navigation, t]);

  const handlePreviewExercise = useCallback((item: Exercise) => {
    runNavigationAction(() => {
      navigation.navigate('ExerciseDetail', {
        item,
        hideWorkoutActions: true,
        selectionReturnKey: returnKey,
      });
    });
  }, [runNavigationAction, navigation, returnKey]);

  const handlePreviewExternalExercise = useCallback((item: ExternalExerciseItem) => {
    runNavigationAction(() => {
      navigation.navigate('ExerciseDetail', {
        item: exerciseFromExternalItem(item, t),
        hideWorkoutActions: true,
        // Only importable sources get the Add action; a nutritionix preview
        // is read-only because mobile has no import path for it.
        ...(isImportableExerciseSource(item.source)
          ? { selectionReturnKey: returnKey }
          : {}),
      });
    });
  }, [runNavigationAction, navigation, returnKey, t]);

  // --- Shared renderers ---

  // Row tap selects instantly (fast path); the thumbnail and trailing ⓘ open
  // the detail screen as a pre-add preview. All are sibling pressables —
  // nesting would leave the inner ones live while their parent is disabled
  // and invite mis-taps. The thumbnail is hidden from the accessibility tree
  // because it duplicates the labeled ⓘ action.
  const renderExerciseRow = useCallback(({ item }: { item: Exercise }) => {
    const image = item.images?.[0] ?? null;
    const fallbackIcon =
      (item.category && CATEGORY_ICON_MAP[item.category]) || 'exercise-weights';
    const status = deriveShareStatus(item.userId, item.sharedWithPublic, profile?.id);
    return (
      <View className="flex-row items-center border-b border-border-subtle">
        <TouchableOpacity
          className="pl-4 py-3"
          activeOpacity={0.7}
          accessible={false}
          testID="exercise-thumbnail"
          disabled={isNavigationLocked || importingExerciseId !== null}
          onPress={() => handlePreviewExercise(item)}
        >
          <SafeImage
            source={image ? getImageSource(image) : null}
            style={{ width: 44, height: 44, borderRadius: 8 }}
            fallback={
              <View
                className="bg-raised items-center justify-center"
                style={{ width: 44, height: 44, borderRadius: 8 }}
              >
                <Icon name={fallbackIcon} size={22} color={textMuted} />
              </View>
            }
          />
        </TouchableOpacity>
        <TouchableOpacity
          className="flex-1 flex-row items-center pl-3 py-3"
          activeOpacity={0.7}
          onPress={() => handleSelectExercise(item)}
        >
          <View className="flex-1">
            <View className="flex-row items-center gap-1.5">
              <Text className="text-text-primary text-base font-medium flex-shrink" numberOfLines={1}>
                {item.name}
              </Text>
              <ShareStatusBadge status={status} />
            </View>
            {item.category && (
              <Text className="text-sm mt-0.5" style={{ color: textSecondary }}>
                {localizeExerciseTaxonomyValue(t, 'category', item.category)}
              </Text>
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          className="px-4 py-3"
          activeOpacity={0.7}
          hitSlop={8}
          disabled={isNavigationLocked || importingExerciseId !== null}
          accessibilityLabel={t('exerciseSearch.actions.viewDetails', { defaultValue: 'View exercise details' })}
          onPress={() => handlePreviewExercise(item)}
        >
          <Icon name="info-circle" size={22} color={accentColor} />
        </TouchableOpacity>
      </View>
    );
  }, [
    handleSelectExercise,
    handlePreviewExercise,
    isNavigationLocked,
    importingExerciseId,
    accentColor,
    textSecondary,
    textMuted,
    getImageSource,
    profile,
    t,
  ]);

  const filteredRecentExercises = useMemo(() => filterByOwnership(recentExercises, ownershipFilter, profile?.id), [recentExercises, ownershipFilter, profile?.id]);
  const filteredTopExercises = useMemo(() => filterByOwnership(topExercises, ownershipFilter, profile?.id), [topExercises, ownershipFilter, profile?.id]);
  const filteredSearchResults = useMemo(() => filterByOwnership(searchResults, ownershipFilter, profile?.id), [searchResults, ownershipFilter, profile?.id]);

  const sections = useMemo(() => {
    const allSections: ExerciseSection[] = [
      { title: t('exerciseSearch.sections.recent', { defaultValue: 'Recent' }), data: filteredRecentExercises },
      { title: t('exerciseSearch.sections.popular', { defaultValue: 'Popular' }), data: filteredTopExercises },
    ];
    return allSections.filter((section) => section.data.length > 0);
  }, [filteredRecentExercises, filteredTopExercises, t]);

  const renderSectionHeader = ({ section }: { section: ExerciseSection }) => (
    <View className="px-4 py-2 bg-background">
      <Text className="text-text-secondary text-sm font-semibold uppercase tracking-wider">
        {section.title}
      </Text>
    </View>
  );

  const renderSearchBar = () => (
    <View className="px-4 py-2">
      <View
        className="flex-row items-center bg-raised rounded-lg px-3 py-2.5"
        style={{ borderWidth: 1, borderColor: isSearchFocused ? accentColor : borderSubtle }}
      >
        <Icon name="search" size={18} color={textMuted} />
        <View className="flex-1 ml-2">
          <TextInput
            className="text-text-primary"
            style={{ fontSize: 16, padding: 0, includeFontPadding: false }}
            placeholder={t('exerciseSearch.search.placeholder', { defaultValue: 'Search exercises...' })}
            placeholderTextColor={textMuted}
            value={searchText}
            onChangeText={setSearchText}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
        {searchText.length > 0 && (
          <Button variant="header" onPress={() => setSearchText('')} hitSlop={8} accessibilityLabel={t('exerciseSearch.actions.clearSearch', { defaultValue: 'Clear search' })}>
            <Icon name="close" size={16} color={textMuted} />
          </Button>
        )}
      </View>
    </View>
  );

  // --- Search tab ---

  const renderSearchResults = () => {
    if (isSearching && filteredSearchResults.length === 0) {
      return <StatusView loading />;
    }

    if (isSearchError) {
      return <StatusView icon="alert-circle" title={t('exerciseSearch.states.failedToSearch', { defaultValue: 'Failed to search exercises' })} />;
    }

    if (filteredSearchResults.length === 0) {
      if (ownershipFilter !== 'all' && searchResults.length > 0) {
        return (
          <StatusView
            {...ownershipFilterEmptyState({
              noun: t('exerciseSearch.filter.noun', { defaultValue: 'exercises' }),
              filter: ownershipFilter,
              labels: {
                all: t('exerciseSearch.filter.all', { defaultValue: 'All' }),
                mine: t('exerciseSearch.filter.mine', { defaultValue: 'Mine' }),
                family: t('exerciseSearch.filter.family', { defaultValue: 'Family' }),
                public: t('exerciseSearch.filter.public', { defaultValue: 'Public' }),
              },
              emptyTitle: t('exerciseSearch.filter.emptyTitle', { defaultValue: 'No {{noun}} in {{filter}}' }),
              emptySubtitle: t('exerciseSearch.filter.emptySubtitle', { defaultValue: 'Change the filter to see your other {{noun}}.' }),
              showAllLabel: t('exerciseSearch.filter.showAll', { defaultValue: 'Show All' }),
              onReset: () => setOwnershipFilter('all'),
            })}
          />
        );
      }
      return <StatusView title={t('exerciseSearch.states.noMatches', { defaultValue: 'No matching exercises found' })} />;
    }

    return (
      <View className="flex-1 bg-surface">
        <FlatList
          data={filteredSearchResults}
          keyExtractor={(item) => item.id}
          renderItem={renderExerciseRow}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="pb-safe-or-4"
        />
      </View>
    );
  };

  const renderSearchTab = () => {
    if (!isConnected) {
      return <StatusView icon="cloud-offline" title={t('exerciseSearch.states.connectToView', { defaultValue: 'Connect to a server to view exercises' })} />;
    }

    if (isSearchActive) {
      return renderSearchResults();
    }

    if (isSuggestedLoading) {
      return <StatusView loading />;
    }

    if (isSuggestedError) {
      return (
        <StatusView
          icon="alert-circle"
          title={t('exerciseSearch.states.failedToLoad', { defaultValue: 'Failed to load exercises' })}
          action={{ label: t('common.retry', { defaultValue: 'Retry' }), onPress: () => refetchSuggested() }}
        />
      );
    }

    if (sections.length === 0) {
      if (ownershipFilter !== 'all' && (recentExercises.length > 0 || topExercises.length > 0)) {
        return (
          <StatusView
            {...ownershipFilterEmptyState({
              noun: t('exerciseSearch.filter.noun', { defaultValue: 'exercises' }),
              filter: ownershipFilter,
              labels: {
                all: t('exerciseSearch.filter.all', { defaultValue: 'All' }),
                mine: t('exerciseSearch.filter.mine', { defaultValue: 'Mine' }),
                family: t('exerciseSearch.filter.family', { defaultValue: 'Family' }),
                public: t('exerciseSearch.filter.public', { defaultValue: 'Public' }),
              },
              emptyTitle: t('exerciseSearch.filter.emptyTitle', { defaultValue: 'No {{noun}} in {{filter}}' }),
              emptySubtitle: t('exerciseSearch.filter.emptySubtitle', { defaultValue: 'Change the filter to see your other {{noun}}.' }),
              showAllLabel: t('exerciseSearch.filter.showAll', { defaultValue: 'Show All' }),
              onReset: () => setOwnershipFilter('all'),
            })}
          />
        );
      }
      return <StatusView title={t('exerciseSearch.states.searchToStart', { defaultValue: 'Search for an exercise to get started' })} />;
    }

    return (
      <View className="flex-1 bg-surface">
        <SectionList
          sections={sections}
          keyExtractor={(item, index) => `${index}-${item.id}`}
          renderItem={renderExerciseRow}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="pb-safe-or-4"
        />
      </View>
    );
  };

  // --- Online tab ---

  // Same sibling-pressables layout as the local rows: content imports and
  // selects; the thumbnail and ⓘ open the pre-add preview (the ⓘ slot shows
  // a spinner while importing).
  const renderExternalExerciseItem = ({ item }: { item: ExternalExerciseItem }) => {
    const image = item.images?.[0] ?? null;
    const fallbackIcon =
      (item.category && CATEGORY_ICON_MAP[item.category]) || 'exercise-weights';
    const isImportInFlight = importingExerciseId !== null;
    return (
      <View className="flex-row items-center border-b border-border-subtle">
        <TouchableOpacity
          className="pl-4 py-3"
          activeOpacity={0.7}
          accessible={false}
          testID="exercise-thumbnail"
          disabled={isNavigationLocked || isImportInFlight}
          onPress={() => handlePreviewExternalExercise(item)}
        >
          <SafeImage
            source={image ? getImageSource(image) : null}
            style={{ width: 44, height: 44, borderRadius: 8 }}
            fallback={
              <View
                className="bg-raised items-center justify-center"
                style={{ width: 44, height: 44, borderRadius: 8 }}
              >
                <Icon name={fallbackIcon} size={22} color={textMuted} />
              </View>
            }
          />
        </TouchableOpacity>
        <TouchableOpacity
          className="flex-1 flex-row items-center pl-3 py-3"
          activeOpacity={0.7}
          disabled={isImportInFlight}
          onPress={() => handleImportExercise(item)}
        >
          <View className="flex-1">
            <Text className="text-text-primary text-base font-medium">{item.name}</Text>
            {item.category && (
              <Text className="text-text-secondary text-sm mt-0.5">{item.category}</Text>
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          className="px-4 py-3"
          activeOpacity={0.7}
          hitSlop={8}
          disabled={isNavigationLocked || isImportInFlight}
          accessibilityLabel={t('exerciseSearch.actions.viewDetails', { defaultValue: 'View exercise details' })}
          onPress={() => handlePreviewExternalExercise(item)}
        >
          {importingExerciseId === item.id ? (
            <ActivityIndicator size="small" color={accentColor} />
          ) : (
            <Icon name="info-circle" size={22} color={accentColor} />
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const renderOnlineFooter = () => {
    if (isFetchNextPageError) {
      return (
        <Button
          variant="ghost"
          onPress={() => fetchNextPage()}
          className="py-3"
          textClassName="text-sm"
        >
          {t('exerciseSearch.actions.loadMoreFailed', { defaultValue: 'Failed to load more. Tap to retry' })}
        </Button>
      );
    }
    if (isFetchingNextPage) {
      return (
        <View className="py-3 items-center" accessibilityRole="progressbar" accessibilityLabel={t('exerciseSearch.accessibility.loadingMore', { defaultValue: 'Loading more exercises' })}>
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
          {t('exerciseSearch.actions.loadMore', { defaultValue: 'Load More' })}
        </Button>
      );
    }
    return null;
  };

  const renderOnlineSearchResults = () => {
    if (isOnlineSearching && onlineSearchResults.length === 0) {
      return <StatusView loading />;
    }

    if (isOnlineSearchError) {
      return <StatusView icon="alert-circle" title={t('exerciseSearch.states.failedToSearchProvider', { defaultValue: 'Failed to search {{provider}}', provider: selectedProviderName })} />;
    }

    if (onlineSearchResults.length === 0) {
      return <StatusView title={t('exerciseSearch.states.noMatches', { defaultValue: 'No matching exercises found' })} />;
    }

    return (
      <View className="flex-1 bg-surface">
        <FlatList
          data={onlineSearchResults}
          keyExtractor={(item, index) => `${item.source}-${item.id}-${index}`}
          renderItem={renderExternalExerciseItem}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="pb-safe-or-4"
          ListFooterComponent={renderOnlineFooter()}
        />
      </View>
    );
  };

  const renderOnlineTab = () => {
    if (!isConnected) {
      return <StatusView icon="cloud-offline" title={t('exerciseSearch.states.connectToSearchOnline', { defaultValue: 'Connect to a server to search online exercises' })} />;
    }

    if (isProvidersLoading) {
      return <StatusView loading />;
    }

    if (isProvidersError) {
      return (
        <StatusView
          icon="alert-circle"
          title={t('exerciseSearch.states.failedToLoadProviders', { defaultValue: 'Failed to load providers' })}
          action={{ label: t('common.retry', { defaultValue: 'Retry' }), onPress: () => refetchProviders() }}
        />
      );
    }

    if (providers.length === 0) {
      return <StatusView icon="globe" iconColor={textMuted} title={t('exerciseSearch.states.noProviders', { defaultValue: 'No online exercise providers configured' })} />;
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
                accessibilityRole="tab"
                accessibilityLabel={t('exerciseSearch.accessibility.provider', { defaultValue: 'Exercise provider {{provider}}', provider: provider.provider_name })}
                accessibilityState={{ selected: isActive }}
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
        {isOnlineSearchActive ? (
          renderOnlineSearchResults()
        ) : (
          <StatusView icon="search" iconColor={textSecondary} title={t('exerciseSearch.states.searchProvider', { defaultValue: 'Search {{provider}} for exercises', provider: selectedProviderName })} />
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
    }
  };

  const tabs = useMemo(() => [
    { key: 'search' as const, label: t('exerciseSearch.tabs.search', { defaultValue: 'Search' }) },
    { key: 'online' as const, label: t('exerciseSearch.tabs.online', { defaultValue: 'Online' }) },
  ], [t]);

  const header = useScreenHeader({
    title: t('exerciseSearch.title', { defaultValue: 'Exercises' }),
    left: { kind: 'dismiss', onPress: () => navigation.goBack(), identifier: 'exercise-search-cancel' },
    // The filter only applies to the local library, so the Online tab drops it.
    right: activeTab === 'search'
      ? ownershipFilterHeaderMenu({
          noun: t('exerciseSearch.filter.noun', { defaultValue: 'exercises' }),
          identifier: 'exercise-search-filter',
          labels: {
            all: t('exerciseSearch.filter.all', { defaultValue: 'All' }),
            mine: t('exerciseSearch.filter.mine', { defaultValue: 'Mine' }),
            family: t('exerciseSearch.filter.family', { defaultValue: 'Family' }),
            public: t('exerciseSearch.filter.public', { defaultValue: 'Public' }),
          },
          showLabel: t('exerciseSearch.filter.show', { defaultValue: 'Show' }),
          filterAccessibilityLabel: t('exerciseSearch.filter.accessibility', { defaultValue: 'Filter {{noun}}, filtered to {{filter}}' }),
          filter: ownershipFilter,
          onSelect: setOwnershipFilter,
        })
      : undefined,
  });

  return (
      <View className="flex-1 bg-background" style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}>
      {header}

      {/* Segmented control */}
      <View className="px-4 mt-2">
        <SegmentedControl segments={tabs} activeKey={activeTab} onSelect={setActiveTab} />
      </View>

      {/* Search bar */}
      {renderSearchBar()}

      {/* Tab content */}
      {renderTabContent()}
    </View>
  );
};

export default ExerciseSearchScreen;
