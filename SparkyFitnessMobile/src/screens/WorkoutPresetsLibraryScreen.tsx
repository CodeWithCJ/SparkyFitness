import { useTranslation } from 'react-i18next';
import React, { useCallback, useState, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import LibrarySearchBar from '../components/LibrarySearchBar';
import PaginatedLibraryFooter from '../components/PaginatedLibraryFooter';
import StatusView from '../components/StatusView';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useServerConnection, useWorkoutPresetsLibrary, useProfile } from '../hooks';
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
import type { WorkoutPreset } from '../types/workoutPresets';
import type { RootStackScreenProps } from '../types/navigation';

type WorkoutPresetsLibraryScreenProps = RootStackScreenProps<'WorkoutPresetsLibrary'>;

const WorkoutPresetsLibraryScreen: React.FC<WorkoutPresetsLibraryScreenProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [accentColor, textSecondary] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-secondary',
  ]) as [string, string];
  const scrollBottomPadding = insets.bottom + activeWorkoutBarPadding + 16;
  const [searchText, setSearchText] = useState('');
  const ownershipFilter = useAppPreferencesStore((s) => s.workoutPresetsLibraryOwnershipFilter);
  const setOwnershipFilter = useAppPreferencesStore((s) => s.setWorkoutPresetsLibraryOwnershipFilter);

  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();
  const { profile } = useProfile();
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
  const filteredPresets = useMemo(() => filterByOwnership(presets, ownershipFilter, profile?.id), [presets, ownershipFilter, profile?.id]);

  const handlePresetPress = useCallback(
    (preset: WorkoutPreset) => {
      navigation.navigate('WorkoutPresetDetail', { preset });
    },
    [navigation],
  );

  const renderEmpty = () => {
    if (ownershipFilter !== 'all' && presets.length > 0 && filteredPresets.length === 0) {
      return (
        <StatusView
          inline
          {...ownershipFilterEmptyState({
            noun: t('presetLibrary.noun', { defaultValue: 'workout presets' }),
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
        title={searchText.trim().length > 0 ? t('presetLibrary.noMatch', { defaultValue: 'No matching presets found' }) : t('presetLibrary.noItems', { defaultValue: 'No workout presets yet' })}
        subtitle={searchText.trim().length > 0
          ? t('presetLibrary.trySearch', { defaultValue: 'Try a different search term to find a workout preset.' })
          : t('presetLibrary.empty', { defaultValue: 'Workout presets you create will appear here.' })}
      />
    );
  };

  const renderRow = ({ item, index }: { item: WorkoutPreset; index: number }) => {
    const exerciseCount = item.exercises?.length ?? 0;
    const status = deriveShareStatus(item.user_id, item.is_public, profile?.id);
    return (
      <TouchableOpacity
        className={`px-4 py-3 ${index < filteredPresets.length - 1 ? 'border-b border-border-subtle' : ''}`}
        activeOpacity={0.7}
        onPress={() => handlePresetPress(item)}
      >
        <View className="flex-row items-center gap-1.5">
          <Text className="text-text-primary text-base font-medium flex-shrink" numberOfLines={1}>
            {item.name}
          </Text>
          <ShareStatusBadge status={status} />
        </View>
        <Text className="text-sm mt-0.5" style={{ color: textSecondary }}>
          {t('presetLibrary.exerciseCount', {
            defaultValue: '{{count}} exercises',
            defaultValue_one: '{{count}} exercise',
            defaultValue_other: '{{count}} exercises',
            count: exerciseCount,
          })}
        </Text>
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
          title={t('presetLibrary.noServer', { defaultValue: 'No server configured' })}
          subtitle={t('workoutPresetLibrary.configure', { defaultValue: 'Configure your server connection in Settings to view your workout presets.' })}
          action={{
            label: t('presetLibrary.go', { defaultValue: 'Go to Settings' }),
            onPress: () => navigation.navigate('Tabs', { screen: 'Settings' }),
            variant: 'primary',
          }}
        />
      );
    }

    if (isLoading || isConnectionLoading) {
      return <StatusView loading title={t('presetLibrary.loading', { defaultValue: 'Loading workout presets...' })} />;
    }

    if (isError) {
      return (
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          iconSize={64}
          title={t('presetLibrary.failed', { defaultValue: 'Failed to load workout presets' })}
          subtitle={t('presetLibrary.check', { defaultValue: 'Please check your connection and try again.' })}
          action={{
            label: t('presetLibrary.retry', { defaultValue: 'Retry' }),
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
        data={filteredPresets}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderRow}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={
          <PaginatedLibraryFooter
            isFetchingNextPage={isFetchingNextPage}
            isFetchNextPageError={isFetchNextPageError}
            errorMessage={t('presetLibrary.moreFailed', { defaultValue: 'Failed to load more presets.' })}
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
    title: t('presetLibrary.title', { defaultValue: 'Workout presets' }),
    left: { kind: 'back' },
    right: ownershipFilterHeaderMenu({
      noun: t('presetLibrary.noun', { defaultValue: 'workout presets' }),
      labels: {
        all: t('ownership.all', { defaultValue: 'All' }),
        mine: t('ownership.mine', { defaultValue: 'Mine' }),
        family: t('ownership.family', { defaultValue: 'Family' }),
        public: t('ownership.public', { defaultValue: 'Public' }),
      },
      showLabel: t('ownership.show', { defaultValue: 'Show' }),
      filterAccessibilityLabel: t('ownership.filter', { defaultValue: 'Filter {{noun}}, filtered to {{filter}}' }),
      identifier: 'workout-presets-library-filter',
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
          placeholder={t('presetLibrary.search', { defaultValue: 'Search workout presets...' })}
          isSearching={isSearching}
        />
      ) : null}
      {renderContent()}
    </View>
  );
};

export default WorkoutPresetsLibraryScreen;
