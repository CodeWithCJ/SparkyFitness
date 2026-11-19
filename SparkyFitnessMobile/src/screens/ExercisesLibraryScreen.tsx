import { useTranslation } from 'react-i18next';
import React, { useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import LibrarySearchBar from '../components/LibrarySearchBar';
import PaginatedLibraryFooter from '../components/PaginatedLibraryFooter';
import StatusView from '../components/StatusView';
import ServerGate from '../components/ServerGate';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useExercisesLibrary, useServerConnection, useProfile } from '../hooks';
import {
  deriveShareStatus,
  filterByOwnership,
  ownershipFilterEmptyState,
  ownershipFilterHeaderMenu,
} from '../utils/shareStatus';
import ShareStatusBadge from '../components/ShareStatusBadge';
import SafeImage from '../components/SafeImage';
import Icon from '../components/Icon';
import FooterActionBar from '../components/FooterActionBar';
import Button from '../components/ui/Button';
import Toast from 'react-native-toast-message';
import { useKeptExercises } from '../hooks/useKeptExercises';
import { notifyOutboxChanged } from '../offline/events';
import {
  refreshOfflineImages,
  setExercisesKeptOffline,
} from '../offline/offlineImages';
import { getActiveServerConfigId } from '../services/storage';
import { CATEGORY_ICON_MAP } from '../utils/workoutSession';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { Exercise } from '../types/exercise';
import type { RootStackScreenProps } from '../types/navigation';
import { localizeExerciseTaxonomyValue } from '../localization/exerciseTaxonomy';

type ExercisesLibraryScreenProps = RootStackScreenProps<'ExercisesLibrary'>;

const ExercisesLibraryScreen: React.FC<ExercisesLibraryScreenProps> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [textSecondary, textPrimary] = useCSSVariable([
    '--color-text-secondary',
    '--color-text-primary',
  ]) as [string, string];
  const scrollBottomPadding = insets.bottom + activeWorkoutBarPadding + 16;
  const [searchText, setSearchText] = useState('');
  const ownershipFilter = useAppPreferencesStore(
    (s) => s.exercisesLibraryOwnershipFilter
  );
  const setOwnershipFilter = useAppPreferencesStore(
    (s) => s.setExercisesLibraryOwnershipFilter
  );

  const { isConnected, status: connectionStatus } = useServerConnection();
  // A server that is set up but not answering: the list then comes from
  // what the phone saved (src/offline/).
  const canShowData = isConnected || connectionStatus === 'unreachable';
  const { profile } = useProfile();
  const { getImageSource } = useExerciseImageSource();

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
  } = useExercisesLibrary(searchText, { enabled: canShowData });
  const filteredExercises = useMemo(
    () => filterByOwnership(exercises, ownershipFilter, profile?.id),
    [exercises, ownershipFilter, profile?.id]
  );

  // Long-press selects exercises to keep (or stop keeping) their pictures
  // offline (#1983). Null when not selecting.
  const keptIds = useKeptExercises();
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null);
  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const applyKeepOffline = useCallback(
    async (keep: boolean) => {
      const ids = [...(selectedIds ?? [])];
      setSelectedIds(null);
      const serverConfigId = await getActiveServerConfigId();
      if (!serverConfigId || ids.length === 0) return;
      await setExercisesKeptOffline(serverConfigId, ids, keep);
      notifyOutboxChanged();
      Toast.show({
        type: 'success',
        text1: keep
          ? t('offline.keptAdded', {
              count: ids.length,
              defaultValue:
                'Pictures of {{count}} exercises will be kept offline',
              defaultValue_one:
                'Pictures of {{count}} exercise will be kept offline',
              defaultValue_other:
                'Pictures of {{count}} exercises will be kept offline',
            })
          : t('offline.keptRemoved', {
              count: ids.length,
              defaultValue: '{{count}} exercises no longer kept offline',
              defaultValue_one: '{{count}} exercise no longer kept offline',
              defaultValue_other: '{{count}} exercises no longer kept offline',
            }),
      });
      void refreshOfflineImages();
    },
    [selectedIds, t]
  );

  const handleExercisePress = useCallback(
    (exercise: Exercise) => {
      if (selectedIds != null) {
        toggleSelected(exercise.id);
        return;
      }
      navigation.navigate('ExerciseDetail', { item: exercise });
    },
    [navigation, selectedIds, toggleSelected]
  );

  const renderEmpty = () => {
    if (
      ownershipFilter !== 'all' &&
      exercises.length > 0 &&
      filteredExercises.length === 0
    ) {
      return (
        <StatusView
          inline
          {...ownershipFilterEmptyState({
            noun: t('exerciseLibrary.noun', { defaultValue: 'exercises' }),
            filter: ownershipFilter,
            onReset: () => setOwnershipFilter('all'),
            labels: {
              all: t('ownership.all', { defaultValue: 'All' }),
              mine: t('ownership.mine', { defaultValue: 'Mine' }),
              family: t('ownership.family', { defaultValue: 'Family' }),
              public: t('ownership.public', { defaultValue: 'Public' }),
            },
            emptyTitle: t('ownership.emptyTitle', {
              defaultValue: 'No {{noun}} in {{filter}}',
            }),
            emptySubtitle: t('ownership.emptySubtitle', {
              defaultValue: 'Change the filter to see your other {{noun}}.',
            }),
            showAllLabel: t('ownership.showAll', { defaultValue: 'Show All' }),
          })}
        />
      );
    }
    return (
      <StatusView
        inline
        title={
          searchText.trim().length > 0
            ? t('exerciseLibrary.noMatch', {
                defaultValue: 'No matching exercises found',
              })
            : t('exerciseLibrary.noItems', {
                defaultValue: 'No exercises found',
              })
        }
        subtitle={
          searchText.trim().length > 0
            ? t('exerciseLibrary.trySearch', {
                defaultValue:
                  'Try a different search term to find saved exercises.',
              })
            : t('exerciseLibrary.empty', {
                defaultValue: 'Exercises you save or log will appear here.',
              })
        }
      />
    );
  };

  const renderRow = ({ item, index }: { item: Exercise; index: number }) => {
    const status = deriveShareStatus(
      item.userId,
      item.sharedWithPublic,
      profile?.id
    );
    const image = item.images?.[0] ?? null;
    const fallbackIcon =
      (item.category && CATEGORY_ICON_MAP[item.category]) || 'exercise-weights';
    return (
      <TouchableOpacity
        className={`px-4 py-3 ${
          index < filteredExercises.length - 1
            ? 'border-b border-border-subtle'
            : ''
        }`}
        activeOpacity={0.7}
        onPress={() => handleExercisePress(item)}
        onLongPress={() => toggleSelected(item.id)}
        accessibilityState={
          selectedIds != null
            ? { selected: selectedIds.has(item.id) }
            : undefined
        }
        testID={`exercise-row-${item.id}`}
      >
        <View className="flex-row items-center gap-3">
          {selectedIds != null && (
            <Icon
              name={
                selectedIds.has(item.id)
                  ? 'checkmark-circle-filled'
                  : 'checkmark-circle'
              }
              size={24}
              color={selectedIds.has(item.id) ? textPrimary : textSecondary}
            />
          )}
          <SafeImage
            source={image ? getImageSource(image) : null}
            style={{ width: 44, height: 44, borderRadius: 8 }}
            fallback={
              <View
                className="bg-raised items-center justify-center"
                style={{ width: 44, height: 44, borderRadius: 8 }}
              >
                <Icon name={fallbackIcon} size={22} color={textSecondary} />
              </View>
            }
          />
          <View className="flex-1">
            <View className="flex-row items-center gap-1.5">
              <Text
                className="text-text-primary text-base font-medium flex-shrink"
                numberOfLines={1}
              >
                {item.name}
              </Text>
              <ShareStatusBadge status={status} />
              {keptIds.has(item.id) && (
                <Icon
                  name="cloud-offline"
                  size={14}
                  color={textSecondary}
                  accessibilityLabel={t('offline.keptMark', {
                    defaultValue: 'Kept offline',
                  })}
                />
              )}
            </View>
            {item.category ? (
              <Text className="text-sm mt-0.5" style={{ color: textSecondary }}>
                {localizeExerciseTaxonomyValue(t, 'category', item.category)}
              </Text>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <StatusView
          loading
          title={t('exerciseLibrary.loading', {
            defaultValue: 'Loading exercises...',
          })}
        />
      );
    }

    if (isError) {
      return (
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          iconSize={64}
          title={t('exerciseLibrary.failed', {
            defaultValue: 'Failed to load exercises',
          })}
          subtitle={t('exerciseLibrary.check', {
            defaultValue: 'Please check your connection and try again.',
          })}
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
        extraData={[selectedIds, keptIds]}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={
          <PaginatedLibraryFooter
            isFetchingNextPage={isFetchingNextPage}
            isFetchNextPageError={isFetchNextPageError}
            errorMessage={t('exerciseLibrary.moreFailed', {
              defaultValue: 'Failed to load more exercises.',
            })}
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
        contentContainerStyle={{
          paddingBottom: scrollBottomPadding,
          flexGrow: 1,
        }}
      />
    );
  };

  const header = useScreenHeader({
    title: t('exerciseLibrary.title', { defaultValue: 'Exercises' }),
    left: { kind: 'back' },
    right: ownershipFilterHeaderMenu({
      noun: t('exerciseLibrary.noun', { defaultValue: 'exercises' }),
      labels: {
        all: t('ownership.all', { defaultValue: 'All' }),
        mine: t('ownership.mine', { defaultValue: 'Mine' }),
        family: t('ownership.family', { defaultValue: 'Family' }),
        public: t('ownership.public', { defaultValue: 'Public' }),
      },
      showLabel: t('ownership.show', { defaultValue: 'Show' }),
      filterAccessibilityLabel: t('ownership.filter', {
        defaultValue: 'Filter {{noun}}, filtered to {{filter}}',
      }),
      identifier: 'exercises-library-filter',
      filter: ownershipFilter,
      onSelect: setOwnershipFilter,
    }),
  });

  return (
    <View className="flex-1 bg-background">
      {header}
      {canShowData ? (
        <LibrarySearchBar
          value={searchText}
          onChangeText={setSearchText}
          placeholder={t('exerciseLibrary.search', {
            defaultValue: 'Search exercises...',
          })}
          isSearching={isSearching}
        />
      ) : null}
      <ServerGate offlineCapable>{renderContent()}</ServerGate>
      {selectedIds != null ? (
        <FooterActionBar>
          <Text
            testID="exercise-selection-count"
            className="text-sm text-text-secondary text-center mb-2"
          >
            {t('offline.selectedCount', {
              count: selectedIds.size,
              defaultValue: '{{count}} selected',
              defaultValue_one: '{{count}} selected',
              defaultValue_other: '{{count}} selected',
            })}
          </Text>
          <View className="flex-row gap-2">
            <Button
              testID="exercise-selection-keep"
              className="flex-1"
              disabled={selectedIds.size === 0}
              onPress={() => void applyKeepOffline(true)}
            >
              {t('offline.keepOffline', { defaultValue: 'Keep offline' })}
            </Button>
            <Button
              testID="exercise-selection-remove"
              variant="outline"
              className="flex-1"
              disabled={selectedIds.size === 0}
              onPress={() => void applyKeepOffline(false)}
            >
              {t('offline.removeFromOffline', {
                defaultValue: 'Remove from offline',
              })}
            </Button>
          </View>
          <Button
            testID="exercise-selection-cancel"
            variant="ghost"
            className="mt-1"
            onPress={() => setSelectedIds(null)}
          >
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
        </FooterActionBar>
      ) : null}
    </View>
  );
};

export default ExercisesLibraryScreen;
