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
import SegmentedControl from '../components/SegmentedControl';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useFavorites, useMealSearch, useMeals, useServerConnection, useProfile } from '../hooks';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { filterByOwnership, type OwnershipFilter } from '../utils/shareStatus';
import type { RootStackScreenProps } from '../types/navigation';
import type { Meal } from '../types/meals';
import { useTranslation } from 'react-i18next';

type MealsLibraryScreenProps = RootStackScreenProps<'MealsLibrary'>;

const MealsLibraryScreen: React.FC<MealsLibraryScreenProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [accentColor] = useCSSVariable(['--color-accent-primary']) as [string];
  const scrollBottomPadding = insets.bottom + activeWorkoutBarPadding + 16;
  const [searchText, setSearchText] = useState('');
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>('all');
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
      placeholder={t('foodMeals.searchMeals')}
      isSearching={isSearching}
    />
  );

  const renderEmpty = () => {
    if (displayedMeals.length > 0 && filteredMeals.length === 0) {
      return (
        <StatusView
          inline
          title={t('foodMeals.noMatchingMeals')}
          subtitle={t('foodMeals.changeOwnershipFilter')}
        />
      );
    }
    return (
      <StatusView
        inline
        title={isSearchActive ? t('foodMeals.noMatchingMeals') : t('foodMeals.noMealsFound')}
        subtitle={isSearchActive
          ? t('foodMeals.tryDifferentMealSearch')
          : t('foodMeals.mealsAppearHere')}
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
           title={t('dashboard.noServerTitle')}
           subtitle={t('foodMeals.noServerMealLibrary')}
           action={{ label: t('dashboard.goToSettings'), onPress: () => navigation.navigate('Tabs', { screen: 'Settings' }), variant: 'primary' }}
        />
      );
    }

    if (isLoading || isConnectionLoading) {
       return <StatusView loading title={t('foodMeals.loadingMeals')} />;
    }

    if (isError) {
      return (
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          iconSize={64}
           title={isSearchActive ? t('foodMeals.failedSearchMeals') : t('foodMeals.failedLoadMeals')}
           subtitle={t('batch.connectionRetry')}
           action={{ label: t('common.retry'), onPress: () => void (isSearchActive ? refetchSearch() : refetchMeals()), variant: 'primary' }}
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

   const header = useScreenHeader({ title: t('library.meals'), left: { kind: 'back' } });

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}
      {isConnected ? (
        <>
          {renderSearchBar()}
          <View className="px-4 pb-2 border-b border-border-subtle">
            <SegmentedControl
              segments={[
                 { key: 'all', label: t('foodMeals.all') },
                 { key: 'mine', label: t('foodMeals.mine') },
                 { key: 'family', label: t('foodMeals.family') },
                 { key: 'public', label: t('foodMeals.public') },
              ]}
              activeKey={ownershipFilter}
              onSelect={setOwnershipFilter}
            />
          </View>
        </>
      ) : null}
      {renderContent()}
    </View>
  );
};

export default MealsLibraryScreen;
