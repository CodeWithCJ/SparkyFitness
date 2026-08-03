import React, { useCallback, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import LibrarySearchBar from '../components/LibrarySearchBar';
import PaginatedLibraryFooter from '../components/PaginatedLibraryFooter';
import StatusView from '../components/StatusView';
import SegmentedControl from '../components/SegmentedControl';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useExercisesLibrary, useServerConnection, useProfile } from '../hooks';
import { deriveShareStatus } from '../utils/shareStatus';
import ShareStatusBadge from '../components/ShareStatusBadge';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import type { Exercise } from '../types/exercise';
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

type ExercisesLibraryScreenProps = RootStackScreenProps<'ExercisesLibrary'>;

const ExercisesLibraryScreen: React.FC<ExercisesLibraryScreenProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const copy = (key: string) => {
    switch (key) {
      case 'title': return t('screenCopy.exerciseLibrary.title', { defaultValue: 'Exercises' });
      case 'search': return t('screenCopy.exerciseLibrary.search', { defaultValue: 'Search exercises...' });
      case 'all': return t('screenCopy.exerciseLibrary.all', { defaultValue: 'All' });
      case 'mine': return t('screenCopy.exerciseLibrary.mine', { defaultValue: 'Mine' });
      case 'family': return t('screenCopy.exerciseLibrary.family', { defaultValue: 'Family' });
      case 'public': return t('screenCopy.exerciseLibrary.public', { defaultValue: 'Public' });
      case 'noMatch': return t('screenCopy.exerciseLibrary.noMatch', { defaultValue: 'No matching exercises found' });
      case 'changeFilter': return t('screenCopy.exerciseLibrary.changeFilter', { defaultValue: 'Try changing your ownership filter.' });
      case 'none': return t('screenCopy.exerciseLibrary.none', { defaultValue: 'No exercises found' });
      case 'searchNone': return t('screenCopy.exerciseLibrary.searchNone', { defaultValue: 'Try a different search term to find saved exercises.' });
      case 'description': return t('screenCopy.exerciseLibrary.description', { defaultValue: 'Exercises you save or log will appear here.' });
      case 'noServer': return t('screenCopy.exerciseLibrary.noServer', { defaultValue: 'No server configured' });
      case 'configure': return t('screenCopy.exerciseLibrary.configure', { defaultValue: 'Configure your server connection in Settings to view your exercise library.' });
      case 'loading': return t('screenCopy.exerciseLibrary.loading', { defaultValue: 'Loading exercises...' });
      case 'failed': return t('screenCopy.exerciseLibrary.failed', { defaultValue: 'Failed to load exercises' });
      case 'connection': return t('screenCopy.exerciseLibrary.connection', { defaultValue: 'Please check your connection and try again.' });
      case 'retry': return t('screenCopy.exerciseLibrary.retry', { defaultValue: 'Retry' });
      case 'moreFailed': return t('screenCopy.exerciseLibrary.moreFailed', { defaultValue: 'Failed to load more exercises.' });
      default: return key;
    }
  };
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [textSecondary, textPrimary] = useCSSVariable([
    '--color-text-secondary',
    '--color-text-primary',
  ]) as [string, string];
  const scrollBottomPadding = insets.bottom + activeWorkoutBarPadding + 16;
  const [searchText, setSearchText] = useState('');
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'mine' | 'family' | 'public'>('all');

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
  const filteredExercises = useMemo(() => filterItems(exercises, ownershipFilter, profile?.id), [exercises, ownershipFilter, profile?.id]);

  const handleExercisePress = useCallback(
    (exercise: Exercise) => {
      navigation.navigate('ExerciseDetail', { item: exercise });
    },
    [navigation],
  );

  const renderEmpty = () => {
    if (exercises.length > 0 && filteredExercises.length === 0) {
      return (
        <View className="px-6 py-10 items-center">
          <Text className="text-text-primary text-base font-medium text-center">
             {copy('noMatch')}
          </Text>
          <Text className="text-text-secondary text-sm mt-2 text-center">
             {copy('changeFilter')}
          </Text>
        </View>
      );
    }
    return (
      <View className="px-6 py-10 items-center">
        <Text className="text-text-primary text-base font-medium text-center">
           {searchText.trim().length > 0 ? copy('noMatch') : copy('none')}
        </Text>
        <Text className="text-text-secondary text-sm mt-2 text-center">
          {searchText.trim().length > 0
             ? copy('searchNone')
             : copy('description')}
        </Text>
      </View>
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
          iconColor="#9CA3AF"
          iconSize={64}
           title={copy('noServer')}
           subtitle={copy('configure')}
          action={{
             label: t('common.goToSettings'),
            onPress: () => navigation.navigate('Tabs', { screen: 'Settings' }),
            variant: 'primary',
          }}
        />
      );
    }

    if (isLoading || isConnectionLoading) {
       return <StatusView loading title={copy('loading')} />;
    }

    if (isError) {
      return (
        <StatusView
          icon="alert-circle"
          iconColor="#EF4444"
          iconSize={64}
           title={copy('failed')}
           subtitle={copy('connection')}
          action={{
             label: copy('retry'),
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
             errorMessage={copy('moreFailed')}
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

  const header = useScreenHeader({ title: copy('title'), left: { kind: 'back' } });

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}
      {isConnected ? (
        <>
          <LibrarySearchBar
            value={searchText}
            onChangeText={setSearchText}
             placeholder={copy('search')}
            isSearching={isSearching}
          />
          <View className="px-4 pb-2 border-b border-border-subtle">
            <SegmentedControl
              segments={[
                 { key: 'all', label: copy('all') },
                 { key: 'mine', label: copy('mine') },
                 { key: 'family', label: copy('family') },
                 { key: 'public', label: copy('public') },
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

export default ExercisesLibraryScreen;
