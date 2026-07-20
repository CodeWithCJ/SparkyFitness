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
import { deriveShareStatus } from '../utils/shareStatus';
import ShareStatusBadge from '../components/ShareStatusBadge';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import type { WorkoutPreset } from '../types/workoutPresets';
import type { RootStackScreenProps } from '../types/navigation';

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
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'mine' | 'family' | 'public'>('all');

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
  const filteredPresets = useMemo(() => filterItems(presets, ownershipFilter, profile?.id), [presets, ownershipFilter, profile?.id]);

  const handlePresetPress = useCallback(
    (preset: WorkoutPreset) => {
      navigation.navigate('WorkoutPresetDetail', { preset });
    },
    [navigation],
  );

  const renderEmpty = () => {
    if (presets.length > 0 && filteredPresets.length === 0) {
      return (
        <View className="px-6 py-10 items-center">
          <Text className="text-text-primary text-base font-medium text-center">
            No matching presets found
          </Text>
          <Text className="text-text-secondary text-sm mt-2 text-center">
            Try changing your ownership filter.
          </Text>
        </View>
      );
    }
    return (
      <View className="px-6 py-10 items-center">
        <Text className="text-text-primary text-base font-medium text-center">
          {searchText.trim().length > 0 ? 'No matching presets found' : 'No workout presets yet'}
        </Text>
        <Text className="text-text-secondary text-sm mt-2 text-center">
          {searchText.trim().length > 0
            ? 'Try a different search term to find a workout preset.'
            : 'Workout presets you create will appear here.'}
        </Text>
      </View>
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
          {exerciseCount} {exerciseCount === 1 ? 'exercise' : 'exercises'}
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
          title="No server configured"
          subtitle="Configure your server connection in Settings to view your workout presets."
          action={{
            label: 'Go to Settings',
            onPress: () => navigation.navigate('Tabs', { screen: 'Settings' }),
            variant: 'primary',
          }}
        />
      );
    }

    if (isLoading || isConnectionLoading) {
      return <StatusView loading title="Loading workout presets..." />;
    }

    if (isError) {
      return (
        <StatusView
          icon="alert-circle"
          iconColor="#EF4444"
          iconSize={64}
          title="Failed to load workout presets"
          subtitle="Please check your connection and try again."
          action={{
            label: 'Retry',
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
            errorMessage="Failed to load more presets."
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

  const header = useScreenHeader({ title: 'Workout presets', left: { kind: 'back' } });

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}
      {isConnected ? (
        <>
          <LibrarySearchBar
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search workout presets..."
            isSearching={isSearching}
          />
          <View className="px-4 pb-2 border-b border-border-subtle">
            <SegmentedControl
              segments={[
                { key: 'all', label: 'All' },
                { key: 'mine', label: 'Mine' },
                { key: 'family', label: 'Family' },
                { key: 'public', label: 'Public' },
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
