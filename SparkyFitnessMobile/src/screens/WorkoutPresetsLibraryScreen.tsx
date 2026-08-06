import React, { useCallback, useState, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import LibrarySearchBar from '../components/LibrarySearchBar';
import PaginatedLibraryFooter from '../components/PaginatedLibraryFooter';
import StatusView from '../components/StatusView';
import SegmentedControl from '../components/SegmentedControl';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useServerConnection, useWorkoutPresetsLibrary, useProfile } from '../hooks';
import { deriveShareStatus, filterByOwnership, type OwnershipFilter } from '../utils/shareStatus';
import ShareStatusBadge from '../components/ShareStatusBadge';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import type { WorkoutPreset } from '../types/workoutPresets';
import type { RootStackScreenProps } from '../types/navigation';
import { useTranslation } from 'react-i18next';
import { formatLocalizedNumber } from '../localization';

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
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>('all');

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
    if (presets.length > 0 && filteredPresets.length === 0) {
      return (
        <StatusView
          inline
          title={t('workout.noMatchingPresets')}
          subtitle={t('workout.tryOwnership')}
        />
      );
    }
    return (
      <StatusView
        inline
        title={searchText.trim().length > 0 ? t('workout.noMatchingPresets') : t('workout.noWorkoutPresets')}
        subtitle={searchText.trim().length > 0
          ? t('workout.tryDifferentPresetSearch')
          : t('workout.presetsAppearHere')}
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
            {t('workout.exerciseCount', { count: exerciseCount, formattedCount: formatLocalizedNumber(exerciseCount) })}
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
           title={t('workout.noServer')}
           subtitle={t('workout.configureServer')}
          action={{
             label: t('common.goToSettings'),
            onPress: () => navigation.navigate('Tabs', { screen: 'Settings' }),
            variant: 'primary',
          }}
        />
      );
    }

    if (isLoading || isConnectionLoading) {
       return <StatusView loading title={t('workout.loadingPresets')} />;
    }

    if (isError) {
      return (
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          iconSize={64}
           title={t('workout.failedLoadPresetsFull')}
           subtitle={t('workout.tryConnection')}
          action={{
             label: t('common.retry'),
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
             errorMessage={t('workout.failedMorePresets')}
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

  const header = useScreenHeader({ title: t('workout.presetsTitle'), left: { kind: 'back' } });

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}
      {isConnected ? (
        <>
          <LibrarySearchBar
            value={searchText}
            onChangeText={setSearchText}
             placeholder={t('workout.searchWorkoutPresets')}
            isSearching={isSearching}
          />
          <View className="px-4 pb-2 border-b border-border-subtle">
            <SegmentedControl
              segments={[
                 { key: 'all', label: t('workout.all') },
                 { key: 'mine', label: t('workout.mine') },
                 { key: 'family', label: t('workout.family') },
                 { key: 'public', label: t('workout.public') },
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

export default WorkoutPresetsLibraryScreen;
