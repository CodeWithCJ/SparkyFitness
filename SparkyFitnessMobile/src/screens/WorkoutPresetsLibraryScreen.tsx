import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import LibrarySearchBar from '../components/LibrarySearchBar';
import PaginatedLibraryFooter from '../components/PaginatedLibraryFooter';
import StatusView from '../components/StatusView';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useServerConnection, useWorkoutPresetsLibrary } from '../hooks';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import type { WorkoutPreset } from '../types/workoutPresets';
import type { RootStackScreenProps } from '../types/navigation';
import { formatMobileExerciseCount, mobileT } from '../localization';

type WorkoutPresetsLibraryScreenProps = RootStackScreenProps<'WorkoutPresetsLibrary'>;

const WorkoutPresetsLibraryScreen: React.FC<WorkoutPresetsLibraryScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [accentColor, textSecondary] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-secondary',
  ]) as [string, string];
  const scrollBottomPadding = insets.bottom + activeWorkoutBarPadding + 16;
  const [searchText, setSearchText] = useState('');

  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();
  const {
    presets,
    isLoading,
    isSearching,
    isError,
    isFetchNextPageError,
    hasNextPage,
    isFetchingNextPage,
    loadMore,
    refetch,
  } = useWorkoutPresetsLibrary(searchText, { enabled: isConnected });

  const handlePresetPress = useCallback(
    (preset: WorkoutPreset) => {
      navigation.navigate('WorkoutPresetDetail', { preset });
    },
    [navigation],
  );

  const renderEmpty = () => (
    <View className="px-6 py-10 items-center">
      <Text className="text-text-primary text-base font-medium text-center">
        {searchText.trim().length > 0
          ? mobileT('library.noMatchingWorkoutPresets')
          : mobileT('library.noWorkoutPresets')}
      </Text>
      <Text className="text-text-secondary text-sm mt-2 text-center">
        {searchText.trim().length > 0
          ? mobileT('library.tryAnotherSearch')
          : mobileT('library.savedWorkoutPresetsAppear')}
      </Text>
    </View>
  );

  const renderRow = ({ item, index }: { item: WorkoutPreset; index: number }) => {
    const exerciseCount = item.exercises?.length ?? 0;
    return (
      <TouchableOpacity
        className={`px-4 py-3 ${index < presets.length - 1 ? 'border-b border-border-subtle' : ''}`}
        activeOpacity={0.7}
        onPress={() => handlePresetPress(item)}
      >
        <Text className="text-text-primary text-base font-medium">{item.name}</Text>
        <Text className="text-sm mt-0.5" style={{ color: textSecondary }}>
          {formatMobileExerciseCount(exerciseCount)}
        </Text>
      </TouchableOpacity>
    );
  };

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
      return (
        <StatusView loading title={mobileT('library.loadingWorkoutPresets')} />
      );
    }

    if (isError) {
      return (
        <StatusView
          icon="alert-circle"
          iconColor="#EF4444"
          iconSize={64}
          title={mobileT('library.loadWorkoutPresetsFailed')}
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
        data={presets}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderRow}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={
          <PaginatedLibraryFooter
            isFetchingNextPage={isFetchingNextPage}
            isFetchNextPageError={isFetchNextPageError}
            errorMessage={mobileT('library.loadMoreWorkoutPresetsFailed')}
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
          <RefreshControl refreshing={isSearching} onRefresh={refetch} tintColor={accentColor} />
        }
        contentContainerStyle={{ paddingBottom: scrollBottomPadding, flexGrow: 1 }}
      />
    );
  };

  const header = useScreenHeader({
    title: mobileT('library.workoutPresets'),
    left: { kind: 'back' },
  });

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}
      {isConnected ? (
        <LibrarySearchBar
          value={searchText}
          onChangeText={setSearchText}
          placeholder={mobileT('library.searchWorkoutPresets')}
          isSearching={isSearching}
        />
      ) : null}
      {renderContent()}
    </View>
  );
};

export default WorkoutPresetsLibraryScreen;
