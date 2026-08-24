import { useTranslation } from 'react-i18next';
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import StatusView from '../components/StatusView';
import LibrarySearchBar from '../components/LibrarySearchBar';
import MealLibraryRow from '../components/MealLibraryRow';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useFavorites, useMealSearch, useMeals, useServerConnection, useProfile } from '../hooks';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import {
  filterByOwnership,
  ownershipFilterEmptyState,
  ownershipFilterHeaderMenu,
} from '../utils/shareStatus';
import type { RootStackScreenProps } from '../types/navigation';
import type { Meal } from '../types/meals';

type MealsLibraryScreenProps = RootStackScreenProps<'MealsLibrary'>;

const MealsLibraryScreen: React.FC<MealsLibraryScreenProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [accentColor] = useCSSVariable(['--color-accent-primary']) as [string];
  const scrollBottomPadding = insets.bottom + activeWorkoutBarPadding + 16;
  const [searchText, setSearchText] = useState('');
  const ownershipFilter = useAppPreferencesStore((s) => s.mealsLibraryOwnershipFilter);
  const setOwnershipFilter = useAppPreferencesStore((s) => s.setMealsLibraryOwnershipFilter);
  const [refreshing, setRefreshing] = useState(false);

  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();
  const { profile } = useProfile();
  const {
    meals,
    isLoading: isMealsLoading,
    isError: isMealsError,
    refetch: refetchMeals,
  } = useMeals({ enabled: isConnected });
  const {
    searchResults,
    isSearching,
    isSearchActive,
    isSearchError,
    refetch: refetchSearch,
  } = useMealSearch(searchText, { enabled: isConnected });
  const { favoriteMeals } = useFavorites({ enabled: isConnected });
  const favoriteMealIds = useMemo(
    () => new Set(favoriteMeals.map((m) => m.id)),
    [favoriteMeals],
  );

  const displayedMeals = isSearchActive ? searchResults : meals;
  const filteredMeals = useMemo(() => filterByOwnership(displayedMeals, ownershipFilter, profile?.id), [displayedMeals, ownershipFilter, profile?.id]);
  const isLoading = isSearchActive
    ? isSearching && searchResults.length === 0
    : isMealsLoading;
  const isError = isSearchActive ? isSearchError : isMealsError;

  const handleMealPress = useCallback((meal: Meal) => {
    navigation.navigate('MealDetail', { mealId: meal.id, initialMeal: meal });
  }, [navigation]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (isSearchActive) {
      await refetchSearch();
    } else {
      await refetchMeals();
    }
    setRefreshing(false);
  }, [isSearchActive, refetchMeals, refetchSearch]);

  const renderSearchBar = () => (
    <LibrarySearchBar
      value={searchText}
      onChangeText={setSearchText}
      placeholder={t('mealLibrary.search', { defaultValue: 'Search meals...' })}
      isSearching={isSearching}
    />
  );

  const renderEmpty = () => {
    if (ownershipFilter !== 'all' && displayedMeals.length > 0 && filteredMeals.length === 0) {
      return (
        <StatusView
          inline
          {...ownershipFilterEmptyState({
            noun: t('mealLibrary.noun', { defaultValue: 'meals' }),
            filter: ownershipFilter,
            onReset: () => setOwnershipFilter('all'),
            labels: {
              all: t('ownership.all', { defaultValue: 'All' }),
              mine: t('ownership.mine', { defaultValue: 'Mine' }),
              family: t('ownership.family', { defaultValue: 'Family' }),
              public: t('ownership.public', { defaultValue: 'Public' }),
            },
            emptyTitle: t('ownership.emptyTitle', { defaultValue: 'No {{noun}} in {{filter}}' }),
            emptySubtitle: t('ownership.emptySubtitle', { defaultValue: 'Change the filter to see your other {{noun}}.' }),
            showAllLabel: t('ownership.showAll', { defaultValue: 'Show All' }),
          })}
        />
      );
    }
    return (
      <StatusView
        inline
        title={isSearchActive ? t('mealLibrary.noMatch', { defaultValue: 'No matching meals found' }) : t('mealLibrary.noItems', { defaultValue: 'No meals found' })}
        subtitle={isSearchActive
          ? t('mealLibrary.trySearch', { defaultValue: 'Try a different search term to find saved meals.' })
          : t('mealLibrary.empty', { defaultValue: 'Meals you create will appear here.' })}
      />
    );
  };

  const renderContent = () => {
    if (!isConnectionLoading && !isConnected) {
      return (
        <StatusView
          icon="cloud-offline"
          iconTone="muted"
          iconSize={64}
          title={t('mealLibrary.noServer', { defaultValue: 'No server configured' })}
          subtitle={t('mealLibrary.configure', { defaultValue: 'Configure your server connection in Settings to view your meal library.' })}
          action={{ label: t('mealLibrary.go', { defaultValue: 'Go to Settings' }), onPress: () => navigation.navigate('Tabs', { screen: 'Settings' }), variant: 'primary' }}
        />
      );
    }

    if (isLoading || isConnectionLoading) {
      return <StatusView loading title={t('mealLibrary.loading', { defaultValue: 'Loading meals...' })} />;
    }

    if (isError) {
      return (
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          iconSize={64}
          title={isSearchActive
            ? t('mealLibrary.searchFailed', { defaultValue: 'Failed to search meals' })
            : t('mealLibrary.failed', { defaultValue: 'Failed to load meals' })}
          subtitle={t('mealLibrary.check', { defaultValue: 'Please check your connection and try again.' })}
          action={{ label: t('mealLibrary.retry', { defaultValue: 'Retry' }), onPress: () => void (isSearchActive ? refetchSearch() : refetchMeals()), variant: 'primary' }}
        />
      );
    }

    return (
      <FlatList
        data={filteredMeals}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <MealLibraryRow
            meal={item}
            isFavorite={favoriteMealIds.has(item.id)}
            showDivider={index < filteredMeals.length - 1}
            onPress={() => handleMealPress(item)}
          />
        )}
        ListEmptyComponent={renderEmpty}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColor} />
        }
        contentContainerStyle={{ paddingBottom: scrollBottomPadding, flexGrow: 1 }}
      />
    );
  };

  const header = useScreenHeader({
    title: t('mealLibrary.title', { defaultValue: 'Meals' }),
    left: { kind: 'back' },
    right: ownershipFilterHeaderMenu({
      noun: t('mealLibrary.noun', { defaultValue: 'meals' }),
      labels: {
        all: t('ownership.all', { defaultValue: 'All' }),
        mine: t('ownership.mine', { defaultValue: 'Mine' }),
        family: t('ownership.family', { defaultValue: 'Family' }),
        public: t('ownership.public', { defaultValue: 'Public' }),
      },
      showLabel: t('ownership.show', { defaultValue: 'Show' }),
      filterAccessibilityLabel: t('ownership.filter', { defaultValue: 'Filter {{noun}}, filtered to {{filter}}' }),
      identifier: 'meals-library-filter',
      filter: ownershipFilter,
      onSelect: setOwnershipFilter,
    }),
  });

  return (
      <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
        {header}
        {isConnected ? renderSearchBar() : null}
        {renderContent()}
      </View>
  );
};

export default MealsLibraryScreen;
