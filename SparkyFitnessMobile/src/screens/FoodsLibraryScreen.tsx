import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
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
  const [accentColor, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];
  const scrollBottomPadding = insets.bottom + activeWorkoutBarPadding + 16;
  const [searchText, setSearchText] = useState('');

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

  const renderSearchBar = () => (
    <View className="px-4 pb-3">
      <View className="flex-row items-center bg-raised rounded-lg px-3">
        <Icon name="search" size={18} color={textMuted} />
        <View className="flex-1 ml-2">
          <TextInput
            className="text-text-primary"
            style={{ fontSize: 16 }}
            placeholder="Search foods..."
            placeholderTextColor={textMuted}
            value={searchText}
            onChangeText={setSearchText}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
        {isSearching ? (
          <ActivityIndicator size="small" color={accentColor} />
        ) : null}
      </View>
    </View>
  );

  const renderFooter = () => {
    if (isFetchingNextPage) {
      return (
        <View className="py-5 items-center">
          <ActivityIndicator size="small" color={accentColor} />
        </View>
      );
    }

    if (isFetchNextPageError) {
      return (
        <View className="px-4 py-4 items-center">
          <Text className="text-text-secondary text-sm text-center mb-3">
            Failed to load more foods.
          </Text>
          <Button variant="secondary" className="px-6" onPress={loadMore}>
            Retry
          </Button>
        </View>
      );
    }

    if (!hasNextPage) {
      return <View className="h-4" />;
    }

    return (
      <Button variant="ghost" onPress={loadMore} className="mx-4 mt-2 mb-4">
        <Text className="text-base font-semibold" style={{ color: accentColor }}>
          Load More
        </Text>
      </Button>
    );
  };

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
        ListFooterComponent={renderFooter}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: scrollBottomPadding, flexGrow: 1 }}
      />
    );
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {renderHeader()}
      {isConnected ? renderSearchBar() : null}
      {renderContent()}
    </View>
  );
};

export default FoodsLibraryScreen;
