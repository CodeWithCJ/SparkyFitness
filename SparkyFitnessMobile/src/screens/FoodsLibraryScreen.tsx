import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import LibrarySearchBar from '../components/LibrarySearchBar';
import PaginatedLibraryFooter from '../components/PaginatedLibraryFooter';
import StatusView from '../components/StatusView';
import FoodLibraryRow from '../components/FoodLibraryRow';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useFoodsLibrary, useServerConnection } from '../hooks';
import { foodItemToFoodInfo } from '../types/foodInfo';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import type { RootStackScreenProps } from '../types/navigation';
import type { FoodItem } from '../types/foods';
import { mobileT } from '../localization';

type FoodsLibraryScreenProps = RootStackScreenProps<'FoodsLibrary'>;

const FoodsLibraryScreen: React.FC<FoodsLibraryScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const accentColor = useCSSVariable('--color-accent-primary') as string;
  const scrollBottomPadding = insets.bottom + activeWorkoutBarPadding + 16;
  const [searchText, setSearchText] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();
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

  const handleFoodPress = useCallback((food: FoodItem) => {
    navigation.navigate('FoodDetail', { item: foodItemToFoodInfo(food) });
  }, [navigation]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const renderEmpty = () => (
    <View className="px-6 py-10 items-center">
      <Text className="text-text-primary text-base font-medium text-center">
        {searchText.trim().length > 0
          ? mobileT('library.noMatchingFoods')
          : mobileT('library.noFoods')}
      </Text>
      <Text className="text-text-secondary text-sm mt-2 text-center">
        {searchText.trim().length > 0
          ? mobileT('library.tryAnotherSearch')
          : mobileT('library.savedFoodsAppear')}
      </Text>
    </View>
  );

  const renderContent = () => {
    if (!isConnectionLoading && !isConnected) {
      return (
        <StatusView
          icon="cloud-offline"
          iconColor="#9CA3AF"
          iconSize={64}
          title={mobileT('library.noServerTitle')}
          subtitle={mobileT('library.noServerDescription')}
          action={{
            label: mobileT('common.goToSettings'),
            onPress: () => navigation.navigate('Tabs', { screen: 'Settings' }),
            variant: 'primary',
          }}
        />
      );
    }

    if (isLoading || isConnectionLoading) {
      return <StatusView loading title={mobileT('library.loadingFoods')} />;
    }

    if (isError) {
      return (
        <StatusView
          icon="alert-circle"
          iconColor="#EF4444"
          iconSize={64}
          title={mobileT('library.loadFoodsFailed')}
          subtitle={mobileT('library.connectionError')}
          action={{
            label: mobileT('common.retry'),
            onPress: () => refetch(),
            variant: 'primary',
          }}
        />
      );
    }

    return (
      <FlatList
        data={foods}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <FoodLibraryRow
            food={item}
            showDivider={index < foods.length - 1}
            onPress={() => handleFoodPress(item)}
          />
        )}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={
          <PaginatedLibraryFooter
            isFetchingNextPage={isFetchingNextPage}
            isFetchNextPageError={isFetchNextPageError}
            errorMessage={mobileT('library.loadMoreFoodsFailed')}
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
    title: mobileT('library.foods'),
    left: { kind: 'back' },
  });

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}
      {isConnected ? (
        <LibrarySearchBar
          value={searchText}
          onChangeText={setSearchText}
          placeholder={mobileT('library.searchFoods')}
          isSearching={isSearching}
        />
      ) : null}
      {renderContent()}
    </View>
  );
};

export default FoodsLibraryScreen;
