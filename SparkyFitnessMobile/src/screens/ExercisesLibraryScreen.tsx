import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import LibrarySearchBar from '../components/LibrarySearchBar';
import PaginatedLibraryFooter from '../components/PaginatedLibraryFooter';
import StatusView from '../components/StatusView';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useExercisesLibrary, useServerConnection } from '../hooks';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import type { Exercise } from '../types/exercise';
import type { RootStackScreenProps } from '../types/navigation';
import { localizeExerciseCategory, mobileT } from '../localization';

type ExercisesLibraryScreenProps = RootStackScreenProps<'ExercisesLibrary'>;

const ExercisesLibraryScreen: React.FC<ExercisesLibraryScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [textSecondary, textPrimary] = useCSSVariable([
    '--color-text-secondary',
    '--color-text-primary',
  ]) as [string, string];
  const scrollBottomPadding = insets.bottom + activeWorkoutBarPadding + 16;
  const [searchText, setSearchText] = useState('');

  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();

  const {
    exercises,
    isLoading,
    isSearching,
    isError,
    isFetchNextPageError,
    hasNextPage,
    isFetchingNextPage,
    loadMore,
    refetch,
  } = useExercisesLibrary(searchText, { enabled: isConnected });

  const handleExercisePress = useCallback(
    (exercise: Exercise) => {
      navigation.navigate('ExerciseDetail', { item: exercise });
    },
    [navigation],
  );

  const renderEmpty = () => (
    <View className="px-6 py-10 items-center">
      <Text className="text-text-primary text-base font-medium text-center">
        {searchText.trim().length > 0
          ? mobileT('library.noMatchingExercises')
          : mobileT('library.noExercises')}
      </Text>
      <Text className="text-text-secondary text-sm mt-2 text-center">
        {searchText.trim().length > 0
          ? mobileT('library.tryAnotherSearch')
          : mobileT('library.savedExercisesAppear')}
      </Text>
    </View>
  );

  const renderRow = ({ item, index }: { item: Exercise; index: number }) => (
    <TouchableOpacity
      className={`px-4 py-3 ${index < exercises.length - 1 ? 'border-b border-border-subtle' : ''}`}
      activeOpacity={0.7}
      onPress={() => handleExercisePress(item)}
    >
      <Text className="text-text-primary text-base font-medium">{item.name}</Text>
      {item.category ? (
        <Text className="text-sm mt-0.5" style={{ color: textSecondary }}>
          {localizeExerciseCategory(item.category)}
        </Text>
      ) : null}
    </TouchableOpacity>
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
      return <StatusView loading title={mobileT('library.loadingExercises')} />;
    }

    if (isError) {
      return (
        <StatusView
          icon="alert-circle"
          iconColor="#EF4444"
          iconSize={64}
          title={mobileT('library.loadExercisesFailed')}
          subtitle={mobileT('library.connectionError')}
          action={{
            label: mobileT('common.retry'),
            onPress: () => {
              void refetch();
            },
            variant: 'primary',
          }}
        />
      );
    }

    return (
      <FlatList
        data={exercises}
        keyExtractor={(item) => item.id}
        renderItem={renderRow}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={
          <PaginatedLibraryFooter
            isFetchingNextPage={isFetchingNextPage}
            isFetchNextPageError={isFetchNextPageError}
            errorMessage={mobileT('library.loadMoreExercisesFailed')}
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
          <RefreshControl
            refreshing={isSearching}
            onRefresh={refetch}
            tintColor={textPrimary}
          />
        }
        contentContainerStyle={{ paddingBottom: scrollBottomPadding, flexGrow: 1 }}
      />
    );
  };

  const header = useScreenHeader({
    title: mobileT('library.exercises'),
    left: { kind: 'back' },
  });

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}
      {isConnected ? (
        <LibrarySearchBar
          value={searchText}
          onChangeText={setSearchText}
          placeholder={mobileT('library.searchExercises')}
          isSearching={isSearching}
        />
      ) : null}
      {renderContent()}
    </View>
  );
};

export default ExercisesLibraryScreen;
