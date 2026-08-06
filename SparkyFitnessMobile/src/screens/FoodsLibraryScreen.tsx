import React, { useState, useCallback, useMemo } from 'react';
import { View, FlatList, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import LibrarySearchBar from '../components/LibrarySearchBar';
import PaginatedLibraryFooter from '../components/PaginatedLibraryFooter';
import StatusView from '../components/StatusView';
import FoodLibraryRow from '../components/FoodLibraryRow';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useFavorites, useFoodsLibrary, useServerConnection, useProfile } from '../hooks';
import { foodItemToFoodInfo } from '../types/foodInfo';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import {
  filterByOwnership,
  ownershipFilterEmptyState,
  ownershipFilterHeaderMenu,
} from '../utils/shareStatus';
import type { RootStackScreenProps } from '../types/navigation';
import type { FoodItem } from '../types/foods';
import { useTranslation } from 'react-i18next';

type FoodsLibraryScreenProps = RootStackScreenProps<'FoodsLibrary'>;

const FoodsLibraryScreen: React.FC<FoodsLibraryScreenProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const accentColor = useCSSVariable('--color-accent-primary') as string;
  const scrollBottomPadding = insets.bottom + activeWorkoutBarPadding + 16;
  const [searchText, setSearchText] = useState('');
  const ownershipFilter = useAppPreferencesStore((s) => s.foodsLibraryOwnershipFilter);
  const setOwnershipFilter = useAppPreferencesStore((s) => s.setFoodsLibraryOwnershipFilter);
  const [refreshing, setRefreshing] = useState(false);

  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();
  const { profile } = useProfile();
  const {
    foods,
    isLoading,
    isSearching,
    isError,
    isFetchNextPageError,
    hasNextPage,
    isFetchingNextPage,
    loadMore,
    refetch,
  } = useFoodsLibrary(searchText, { enabled: isConnected });
  const filteredFoods = useMemo(() => filterByOwnership(foods, ownershipFilter, profile?.id), [foods, ownershipFilter, profile?.id]);
  const { favoriteFoods } = useFavorites({ enabled: isConnected });
  const favoriteFoodIds = useMemo(
    () => new Set(favoriteFoods.map((f) => f.id)),
    [favoriteFoods],
  );

  const handleFoodPress = useCallback((food: FoodItem) => {
    navigation.navigate('FoodDetail', { item: foodItemToFoodInfo(food) });
  }, [navigation]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const renderEmpty = () => {
    if (ownershipFilter !== 'all' && foods.length > 0 && filteredFoods.length === 0) {
      return (
        <StatusView
          inline
          {...ownershipFilterEmptyState({
            noun: 'foods',
            filter: ownershipFilter,
            onReset: () => setOwnershipFilter('all'),
            t,
          })}
        />
      );
    }
    return (
      <StatusView
        inline
        title={searchText.trim().length > 0 ? t('foodMealScreens.noMatchingFoods') : t('foodMealScreens.noFoods')}
        subtitle={searchText.trim().length > 0
          ? t('foodMealScreens.tryDifferentFoodSearch')
          : t('foodMealScreens.foodsAppearHere')}
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
           title={t('foodMealScreens.noServer')}
           subtitle={t('foodMealScreens.foodLibrarySubtitle')}
           action={{ label: t('dashboard.goToSettings'), onPress: () => navigation.navigate('Tabs', { screen: 'Settings' }), variant: 'primary' }}
        />
      );
    }

    if (isLoading || isConnectionLoading) {
      return <StatusView loading title={t('foodMealScreens.loadingFoods')} />;
    }

    if (isError) {
      return (
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          iconSize={64}
           title={t('foodMealScreens.failedFoods')}
           subtitle={t('foodMealScreens.connectionRetry')}
           action={{ label: t('common.retry'), onPress: () => refetch(), variant: 'primary' }}
        />
      );
    }

    return (
      <FlatList
        data={filteredFoods}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <FoodLibraryRow
            food={item}
            isFavorite={favoriteFoodIds.has(item.id)}
            showDivider={index < filteredFoods.length - 1}
            onPress={() => handleFoodPress(item)}
          />
        )}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={
          <PaginatedLibraryFooter
            isFetchingNextPage={isFetchingNextPage}
            isFetchNextPageError={isFetchNextPageError}
             errorMessage={t('foodMealScreens.failedMoreFoods')}
            onRetry={loadMore}
          />
        }
        keyboardShouldPersistTaps="handled"
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) {
            loadMore();
          }
        }}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColor} />
        }
        contentContainerStyle={{ paddingBottom: scrollBottomPadding, flexGrow: 1 }}
      />
    );
  };

  const header = useScreenHeader({
    title: t('foodMealScreens.foods'),
    left: { kind: 'back' },
    right: ownershipFilterHeaderMenu({
      noun: 'foods',
      identifier: 'foods-library-filter',
      filter: ownershipFilter,
      onSelect: setOwnershipFilter,
      t,
    }),
  });

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}
      {isConnected ? (
        <LibrarySearchBar
          value={searchText}
          onChangeText={setSearchText}
           placeholder={t('foodMealScreens.searchFoodsPlaceholder')}
          isSearching={isSearching}
        />
      ) : null}
      {renderContent()}
    </View>
  );
};

export default FoodsLibraryScreen;
