import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import StatusView from '../components/StatusView';
import MealLibraryRow from '../components/MealLibraryRow';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useMealSearch, useMeals, useServerConnection } from '../hooks';
import type { RootStackScreenProps } from '../types/navigation';
import type { Meal } from '../types/meals';

type MealsLibraryScreenProps = RootStackScreenProps<'MealsLibrary'>;

const MealsLibraryScreen: React.FC<MealsLibraryScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [accentColor, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];
  const scrollBottomPadding = insets.bottom + activeWorkoutBarPadding + 16;
  const [searchText, setSearchText] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();
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

  const displayedMeals = isSearchActive ? searchResults : meals;
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
      <Text className="text-2xl font-bold text-text-primary">Meals</Text>
    </View>
  );

  const renderSearchBar = () => (
    <View className="px-4 pb-3">
      <View
        className="flex-row items-center bg-raised rounded-lg px-3"
        style={{ borderWidth: 1, borderColor: isSearchFocused ? accentColor : 'transparent' }}
      >
        <Icon name="search" size={18} color={textMuted} />
        <View className="flex-1 ml-2">
          <TextInput
            className="text-text-primary"
            style={{ fontSize: 16, paddingVertical: Platform.OS === 'ios' ? 12 : 0 }}
            placeholder="Search meals..."
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
        {isSearching ? (
          <ActivityIndicator size="small" color={accentColor} />
        ) : null}
      </View>
    </View>
  );

  const renderEmpty = () => (
    <View className="px-6 py-10 items-center">
      <Text className="text-text-primary text-base font-medium text-center">
        {isSearchActive ? 'No matching meals found' : 'No meals found'}
      </Text>
      <Text className="text-text-secondary text-sm mt-2 text-center">
        {isSearchActive
          ? 'Try a different search term to find saved meals.'
          : 'Meals you create will appear here.'}
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
          subtitle="Configure your server connection in Settings to view your meal library."
          action={{ label: 'Go to Settings', onPress: () => navigation.navigate('Tabs', { screen: 'Settings' }), variant: 'primary' }}
        />
      );
    }

    if (isLoading || isConnectionLoading) {
      return <StatusView loading title="Loading meals..." />;
    }

    if (isError) {
      return (
        <StatusView
          icon="alert-circle"
          iconColor="#EF4444"
          iconSize={64}
          title={isSearchActive ? 'Failed to search meals' : 'Failed to load meals'}
          subtitle="Please check your connection and try again."
          action={{ label: 'Retry', onPress: () => void (isSearchActive ? refetchSearch() : refetchMeals()), variant: 'primary' }}
        />
      );
    }

    return (
      <FlatList
        data={displayedMeals}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <MealLibraryRow
            meal={item}
            showDivider={index < displayedMeals.length - 1}
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

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {renderHeader()}
      {isConnected ? renderSearchBar() : null}
      {renderContent()}
    </View>
  );
};

export default MealsLibraryScreen;
