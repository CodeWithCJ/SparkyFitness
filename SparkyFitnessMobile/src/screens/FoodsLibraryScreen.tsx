import { useTranslation } from 'react-i18next';
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
            noun: t('foodLibrary.noun', { defaultValue: 'foods' }),
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
        title={searchText.trim().length > 0 ? t('foodLibrary.noMatch', { defaultValue: 'No matching foods found' }) : t('foodLibrary.noItems', { defaultValue: 'No foods found' })}
        subtitle={searchText.trim().length > 0
          ? t('foodLibrary.trySearch', { defaultValue: 'Try a different search term to find saved foods.' })
          : t('foodLibrary.empty', { defaultValue: 'Foods you save or log will appear here.' })}
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
          title={t('foodLibrary.noServer', { defaultValue: 'No server configured' })}
          subtitle={t('foodLibrary.configure', { defaultValue: 'Configure your server connection in Settings to view your food library.' })}
          action={{ label: t('foodLibrary.go', { defaultValue: 'Go to Settings' }), onPress: () => navigation.navigate('Tabs', { screen: 'Settings' }), variant: 'primary' }}
        />
      );
    }

    if (isLoading || isConnectionLoading) {
      return <StatusView loading title={t('foodLibrary.loading', { defaultValue: 'Loading foods...' })} />;
    }

    if (isError) {
      return (
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          iconSize={64}
          title={t('foodLibrary.failed', { defaultValue: 'Failed to load foods' })}
          subtitle={t('foodLibrary.check', { defaultValue: 'Please check your connection and try again.' })}
          action={{ label: t('foodLibrary.retry', { defaultValue: 'Retry' }), onPress: () => refetch(), variant: 'primary' }}
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
            errorMessage={t('foodLibrary.moreFailed', { defaultValue: 'Failed to load more foods.' })}
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
    title: t('foodLibrary.title', { defaultValue: 'Foods' }),
    left: { kind: 'back' },
    right: ownershipFilterHeaderMenu({
      noun: t('foodLibrary.noun', { defaultValue: 'foods' }),
      labels: {
        all: t('ownership.all', { defaultValue: 'All' }),
        mine: t('ownership.mine', { defaultValue: 'Mine' }),
        family: t('ownership.family', { defaultValue: 'Family' }),
        public: t('ownership.public', { defaultValue: 'Public' }),
      },
      showLabel: t('ownership.show', { defaultValue: 'Show' }),
      filterAccessibilityLabel: t('ownership.filter', { defaultValue: 'Filter {{noun}}, filtered to {{filter}}' }),
      identifier: 'foods-library-filter',
      filter: ownershipFilter,
      onSelect: setOwnershipFilter,
    }),
  });

  return (
      <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
        {header}
        {isConnected ? (
          <LibrarySearchBar
            value={searchText}
            onChangeText={setSearchText}
            placeholder={t('foodLibrary.search', { defaultValue: 'Search foods...' })}
            isSearching={isSearching}
          />
        ) : null}
        {renderContent()}
      </View>
  );
};

export default FoodsLibraryScreen;
