import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import LibrarySearchBar from '../components/LibrarySearchBar';
import PaginatedLibraryFooter from '../components/PaginatedLibraryFooter';
import StatusView from '../components/StatusView';
import FoodLibraryRow from '../components/FoodLibraryRow';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useFoodsLibrary, useServerConnection } from '../hooks';
import { foodItemToFoodInfo } from '../types/foodInfo';
import type { RootStackScreenProps } from '../types/navigation';
import type { FoodItem } from '../types/foods';

type FoodsLibraryScreenProps = RootStackScreenProps<'FoodsLibrary'>;

const FoodsLibraryScreen: React.FC<FoodsLibraryScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
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

  const renderHeader = () => (
    <View className="flex-row items-center px-4 pt-4 pb-5">
      <Button
        variant="ghost"
        onPress={() => navigation.goBack()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        className="py-0 px-0 mr-2"
      >
        <Icon name="chevron-back" size={22} color={accentColor} />
      </Button>
      <Text className="text-2xl font-bold text-text-primary">Foods</Text>
    </View>
  );

  const renderEmpty = () => (
    <View className="px-6 py-10 items-center">
      <Text className="text-text-primary text-base font-medium text-center">
        {searchText.trim().length > 0 ? 'No matching foods found' : 'No foods found'}
      </Text>
      <Text className="text-text-secondary text-sm mt-2 text-center">
        {searchText.trim().length > 0
          ? 'Try a different search term to find saved foods.'
          : 'Foods you save or log will appear here.'}
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
          iconColor="#EF4444"
          iconSize={64}
          title="Failed to load foods"
          subtitle="Please check your connection and try again."
          action={{ label: 'Retry', onPress: () => refetch(), variant: 'primary' }}
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

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {renderHeader()}
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
