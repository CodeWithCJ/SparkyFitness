import { useTranslation } from 'react-i18next';
import React, { useCallback, useState, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import LibrarySearchBar from '../components/LibrarySearchBar';
import PaginatedLibraryFooter from '../components/PaginatedLibraryFooter';
import StatusView from '../components/StatusView';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useExercisesLibrary, useServerConnection, useProfile } from '../hooks';
import {
  deriveShareStatus,
  filterByOwnership,
  ownershipFilterEmptyState,
  ownershipFilterHeaderMenu,
} from '../utils/shareStatus';
import ShareStatusBadge from '../components/ShareStatusBadge';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { Exercise } from '../types/exercise';
import type { RootStackScreenProps } from '../types/navigation';

type ExercisesLibraryScreenProps = RootStackScreenProps<'ExercisesLibrary'>;

const ExercisesLibraryScreen: React.FC<ExercisesLibraryScreenProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [textSecondary, textPrimary] = useCSSVariable([
    '--color-text-secondary',
    '--color-text-primary',
  ]) as [string, string];
  const scrollBottomPadding = insets.bottom + activeWorkoutBarPadding + 16;
  const [searchText, setSearchText] = useState('');
  const ownershipFilter = useAppPreferencesStore((s) => s.exercisesLibraryOwnershipFilter);
  const setOwnershipFilter = useAppPreferencesStore((s) => s.setExercisesLibraryOwnershipFilter);

  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();
  const { profile } = useProfile();

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
  const filteredExercises = useMemo(() => filterByOwnership(exercises, ownershipFilter, profile?.id), [exercises, ownershipFilter, profile?.id]);

  const handleExercisePress = useCallback(
    (exercise: Exercise) => {
      navigation.navigate('ExerciseDetail', { item: exercise });
    },
    [navigation],
  );

  const renderEmpty = () => {
    if (ownershipFilter !== 'all' && exercises.length > 0 && filteredExercises.length === 0) {
      return (
        <StatusView
          inline
          {...ownershipFilterEmptyState({
            noun: 'exercises',
            filter: ownershipFilter,
            onReset: () => setOwnershipFilter('all'),
          })}
        />
      );
    }
    return (
      <StatusView
        inline
        title={searchText.trim().length > 0 ? t('exerciseLibrary.noMatch', { defaultValue: 'No matching exercises found' }) : t('exerciseLibrary.noItems', { defaultValue: 'No exercises found' })}
        subtitle={searchText.trim().length > 0
          ? t('exerciseLibrary.trySearch', { defaultValue: 'Try a different search term to find saved exercises.' })
          : t('exerciseLibrary.empty', { defaultValue: 'Exercises you save or log will appear here.' })}
      />
    );
  };

  const renderRow = ({ item, index }: { item: Exercise; index: number }) => {
    const status = deriveShareStatus(item.userId, item.sharedWithPublic, profile?.id);
    return (
      <TouchableOpacity
        className={`px-4 py-3 ${index < filteredExercises.length - 1 ? 'border-b border-border-subtle' : ''}`}
        activeOpacity={0.7}
        onPress={() => handleExercisePress(item)}
      >
        <View className="flex-row items-center gap-1.5">
          <Text className="text-text-primary text-base font-medium flex-shrink" numberOfLines={1}>
            {item.name}
          </Text>
          <ShareStatusBadge status={status} />
        </View>
        {item.category ? (
          <Text className="text-sm mt-0.5" style={{ color: textSecondary }}>
            {item.category}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderContent = () => {
    if (!isConnectionLoading && !isConnected) {
      return (
        <StatusView
          icon="cloud-offline"
          iconTone="muted"
          iconSize={64}
          title={t('exerciseLibrary.noServer', { defaultValue: 'No server configured' })}
          subtitle={t('exerciseLibrary.configure', { defaultValue: 'Configure your server connection in Settings to view your exercise library.' })}
          action={{
            label: t('exerciseLibrary.go', { defaultValue: 'Go to Settings' }),
            onPress: () => navigation.navigate('Tabs', { screen: 'Settings' }),
            variant: 'primary',
          }}
        />
      );
    }

    if (isLoading || isConnectionLoading) {
      return <StatusView loading title={t('exerciseLibrary.loading', { defaultValue: 'Loading exercises...' })} />;
    }

    if (isError) {
      return (
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          iconSize={64}
          title={t('exerciseLibrary.failed', { defaultValue: 'Failed to load exercises' })}
          subtitle={t('exerciseLibrary.check', { defaultValue: 'Please check your connection and try again.' })}
          action={{
            label: t('exerciseLibrary.retry', { defaultValue: 'Retry' }),
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
        data={filteredExercises}
        keyExtractor={(item) => item.id}
        renderItem={renderRow}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={
          <PaginatedLibraryFooter
            isFetchingNextPage={isFetchingNextPage}
            isFetchNextPageError={isFetchNextPageError}
            errorMessage={t('exerciseLibrary.moreFailed', { defaultValue: 'Failed to load more exercises.' })}
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
    title: t('exerciseLibrary.title', { defaultValue: 'Exercises' }),
    left: { kind: 'back' },
    right: ownershipFilterHeaderMenu({
      noun: 'exercises',
      identifier: 'exercises-library-filter',
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
          placeholder={t('exerciseLibrary.search', { defaultValue: 'Search exercises...' })}
          isSearching={isSearching}
        />
      ) : null}
      {renderContent()}
    </View>
  );
};

export default ExercisesLibraryScreen;
