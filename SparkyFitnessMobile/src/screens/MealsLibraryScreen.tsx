import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import StatusView from '../components/StatusView';
import MealLibraryRow from '../components/MealLibraryRow';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useMealSearch, useMeals, useServerConnection } from '../hooks';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import type { RootStackScreenProps } from '../types/navigation';
import type { Meal } from '../types/meals';
import { mobileT } from '../localization';

type MealsLibraryScreenProps = RootStackScreenProps<'MealsLibrary'>;

const MealsLibraryScreen: React.FC<MealsLibraryScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
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

  const renderSearchBar = () => (
    <View className="px-4 pb-3">
      <View
        className="flex-row items-center bg-raised rounded-lg px-3 py-2.5"
        style={{ borderWidth: 1, borderColor: isSearchFocused ? accentColor : 'transparent' }}
      >
        <Icon name="search" size={18} color={textMuted} />
        <View className="flex-1" style={{ marginStart: 8 }}>
          <TextInput
            className="text-text-primary"
            style={{ fontSize: 16, padding: 0, includeFontPadding: false }}
            placeholder={mobileT('library.searchMeals')}
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
        {isSearchActive
          ? mobileT('library.noMatchingMeals')
          : mobileT('library.noMeals')}
      </Text>
      <Text className="text-text-secondary text-sm mt-2 text-center">
        {isSearchActive
          ? mobileT('library.tryAnotherSearch')
          : mobileT('library.savedMealsAppear')}
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
      return <StatusView loading title={mobileT('library.loadingMeals')} />;
    }

    if (isError) {
      return (
        <StatusView
          icon="alert-circle"
          iconColor="#EF4444"
          iconSize={64}
          title={
            isSearchActive
              ? mobileT('library.searchMealsFailed')
              : mobileT('library.loadMealsFailed')
          }
          subtitle={mobileT('library.connectionError')}
          action={{
            label: mobileT('common.retry'),
            onPress: () =>
              void (isSearchActive ? refetchSearch() : refetchMeals()),
            variant: 'primary',
          }}
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

  const header = useScreenHeader({
    title: mobileT('library.meals'),
    left: { kind: 'back' },
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
