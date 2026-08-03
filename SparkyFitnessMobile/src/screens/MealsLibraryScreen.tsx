import React, { useState, useCallback, useMemo } from 'react';
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
import SegmentedControl from '../components/SegmentedControl';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useFavorites, useMealSearch, useMeals, useServerConnection, useProfile } from '../hooks';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import type { RootStackScreenProps } from '../types/navigation';
import type { Meal } from '../types/meals';
import { useTranslation } from 'react-i18next';

const filterItems = <T extends { user_id?: string | null; userId?: string | null; is_public?: boolean | null; shared_with_public?: boolean | null; sharedWithPublic?: boolean | null }>(
  items: T[],
  filter: 'all' | 'mine' | 'family' | 'public',
  currentUserId?: string
) => {
  if (filter === 'all') return items;
  return items.filter((item) => {
    const isOwner = !!((item.user_id && item.user_id === currentUserId) || (item.userId && item.userId === currentUserId));
    const isPublic = !!(item.is_public || item.shared_with_public || item.sharedWithPublic);
    
    if (filter === 'mine') {
      return isOwner;
    }
    if (filter === 'family') {
      return !isOwner && !isPublic && (item.user_id != null || item.userId != null);
    }
    if (filter === 'public') {
      return isPublic;
    }
    return true;
  });
};

type MealsLibraryScreenProps = RootStackScreenProps<'MealsLibrary'>;

const MealsLibraryScreen: React.FC<MealsLibraryScreenProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [accentColor, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];
  const scrollBottomPadding = insets.bottom + activeWorkoutBarPadding + 16;
  const [searchText, setSearchText] = useState('');
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'mine' | 'family' | 'public'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

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
  const filteredMeals = useMemo(() => filterItems(displayedMeals, ownershipFilter, profile?.id), [displayedMeals, ownershipFilter, profile?.id]);
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
        <View className="flex-1 ml-2">
          <TextInput
            className="text-text-primary"
            style={{ fontSize: 16, padding: 0, includeFontPadding: false }}
             placeholder={t('foodMeals.searchMeals')}
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

  const renderEmpty = () => {
    if (displayedMeals.length > 0 && filteredMeals.length === 0) {
      return (
        <View className="px-6 py-10 items-center">
          <Text className="text-text-primary text-base font-medium text-center">
             {t('foodMeals.noMatchingMeals')}
          </Text>
          <Text className="text-text-secondary text-sm mt-2 text-center">
             {t('foodMeals.changeOwnershipFilter')}
          </Text>
        </View>
      );
    }
    return (
      <View className="px-6 py-10 items-center">
        <Text className="text-text-primary text-base font-medium text-center">
           {isSearchActive ? t('foodMeals.noMatchingMeals') : t('foodMeals.noMealsFound')}
        </Text>
        <Text className="text-text-secondary text-sm mt-2 text-center">
          {isSearchActive
             ? t('foodMeals.tryDifferentMealSearch')
             : t('foodMeals.mealsAppearHere')}
        </Text>
      </View>
    );
  };

  const renderContent = () => {
    if (!isConnectionLoading && !isConnected) {
      return (
        <StatusView
          icon="cloud-offline"
          iconColor="#9CA3AF"
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
          iconColor="#EF4444"
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
