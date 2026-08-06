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
  OWNERSHIP_FILTER_LABELS,
  type OwnershipFilter,
} from '../utils/shareStatus';
import type { RootStackScreenProps } from '../types/navigation';
import type { FoodItem } from '../types/foods';

type FoodsLibraryScreenProps = RootStackScreenProps<'FoodsLibrary'>;

const FoodsLibraryScreen: React.FC<FoodsLibraryScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const accentColor = useCSSVariable('--color-accent-primary') as string;
  const scrollBottomPadding = insets.bottom + activeWorkoutBarPadding + 16;
  const [searchText, setSearchText] = useState('');
  const ownershipFilter = useAppPreferencesStore((s) => s.foodsLibraryOwnershipFilter);
  const setOwnershipFilter = useAppPreferencesStore((s) => s.setFoodsLibraryOwnershipFilter);
  const isOwnershipFiltered = ownershipFilter !== 'all';
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
    if (foods.length > 0 && filteredFoods.length === 0) {
      return (
        <StatusView
          inline
          title={`No foods in ${OWNERSHIP_FILTER_LABELS[ownershipFilter]}`}
          subtitle="Change the filter to see your other foods."
          action={{ label: 'Show All', onPress: () => setOwnershipFilter('all') }}
        />
      );
    }
    return (
      <StatusView
        inline
        title={searchText.trim().length > 0 ? 'No matching foods found' : 'No foods found'}
        subtitle={searchText.trim().length > 0
          ? 'Try a different search term to find saved foods.'
          : 'Foods you save or log will appear here.'}
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
          title="No server configured"
          subtitle="Configure your server connection in Settings to view your food library."
          action={{ label: 'Go to Settings', onPress: () => navigation.navigate('Tabs', { screen: 'Settings' }), variant: 'primary' }}
        />
      );
    }

    if (isLoading || isConnectionLoading) {
      return <StatusView loading title="Loading foods..." />;
    }

    if (isError) {
      return (
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          iconSize={64}
          title="Failed to load foods"
          subtitle="Please check your connection and try again."
          action={{ label: 'Retry', onPress: () => refetch(), variant: 'primary' }}
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
            errorMessage="Failed to load more foods."
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

  // The ownership filter is a persisted device preference, so it lives behind
  // the header menu instead of spending a permanent bar on a rarely-changed
  // choice; the badge dot marks a non-default selection.
  const header = useScreenHeader({
    title: 'Foods',
    left: { kind: 'back' },
    right: {
      kind: 'menu',
      sfSymbol: 'line.3.horizontal.decrease',
      ionicon: 'filter',
      showsBadge: isOwnershipFiltered,
      accessibilityLabel: isOwnershipFiltered
        ? `Filter foods, filtered to ${OWNERSHIP_FILTER_LABELS[ownershipFilter]}`
        : 'Filter foods',
      identifier: 'foods-library-filter',
      items: [
        {
          label: 'Show',
          items: (Object.keys(OWNERSHIP_FILTER_LABELS) as OwnershipFilter[]).map((filter) => ({
            label: OWNERSHIP_FILTER_LABELS[filter],
            selected: ownershipFilter === filter,
            onPress: () => setOwnershipFilter(filter),
          })),
        },
      ],
    },
  });

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}
      {isConnected ? (
        <LibrarySearchBar
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Search foods..."
          isSearching={isSearching}
        />
      ) : null}
      {renderContent()}
    </View>
  );
};

export default FoodsLibraryScreen;
