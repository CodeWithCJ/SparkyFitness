import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import StatusView from '../components/StatusView';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useExercisesLibrary, useServerConnection } from '../hooks';
import type { Exercise } from '../types/exercise';
import type { RootStackScreenProps } from '../types/navigation';

type ExercisesLibraryScreenProps = RootStackScreenProps<'ExercisesLibrary'>;

const ExercisesLibraryScreen: React.FC<ExercisesLibraryScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [accentColor, textMuted, textSecondary] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-text-secondary',
  ]) as [string, string, string];
  const scrollBottomPadding = insets.bottom + activeWorkoutBarPadding + 16;
  const [searchText, setSearchText] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

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

  const renderHeader = () => (
    <View className="flex-row items-center px-4 pt-4 pb-5">
      <Button
        variant="ghost"
        onPress={() => navigation.goBack()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        className="py-0 px-0 mr-2"
      >
        <Icon name="chevron-back" size={22} color={accentColor} />
      </Button>
      <Text className="text-2xl font-bold text-text-primary">Exercises</Text>
    </View>
  );

  const renderSearchBar = () => (
    <View className="px-4 pb-3">
      <View
        className="flex-row items-center bg-raised rounded-lg px-3"
        style={{ borderWidth: 1, borderColor: isSearchFocused ? accentColor : 'transparent' }}
      >
        <Icon name="search" size={18} color={textMuted} />
        <View className="flex-1 ml-2">
          <TextInput
            className="text-text-primary"
            style={{ fontSize: 16, paddingVertical: Platform.OS === 'ios' ? 12 : 0 }}
            placeholder="Search exercises..."
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
        {searchText.trim().length > 0 ? 'No matching exercises found' : 'No exercises found'}
      </Text>
      <Text className="text-text-secondary text-sm mt-2 text-center">
        {searchText.trim().length > 0
          ? 'Try a different search term to find saved exercises.'
          : 'Exercises you save or log will appear here.'}
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
          {item.category}
        </Text>
      ) : null}
    </TouchableOpacity>
  );

  const renderFooter = () => {
    if (isFetchingNextPage) {
      return (
        <View className="py-5 items-center">
          <ActivityIndicator size="small" color={accentColor} />
        </View>
      );
    }

    if (isFetchNextPageError) {
      return (
        <View className="px-4 py-4 items-center">
          <Text className="text-text-secondary text-sm text-center mb-3">
            Failed to load more exercises.
          </Text>
          <Button variant="secondary" className="px-6" onPress={loadMore}>
            Retry
          </Button>
        </View>
      );
    }

    return null;
  };

  const renderContent = () => {
    if (!isConnectionLoading && !isConnected) {
      return (
        <StatusView
          icon="cloud-offline"
          iconColor="#9CA3AF"
          iconSize={64}
          title="No server configured"
          subtitle="Configure your server connection in Settings to view your exercise library."
          action={{
            label: 'Go to Settings',
            onPress: () => navigation.navigate('Tabs', { screen: 'Settings' }),
            variant: 'primary',
          }}
        />
      );
    }

    if (isLoading || isConnectionLoading) {
      return <StatusView loading title="Loading exercises..." />;
    }

    if (isError) {
      return (
        <StatusView
          icon="alert-circle"
          iconColor="#EF4444"
          iconSize={64}
          title="Failed to load exercises"
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
        data={exercises}
        keyExtractor={(item) => item.id}
        renderItem={renderRow}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
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
            tintColor={accentColor}
          />
        }
        contentContainerStyle={{ paddingBottom: scrollBottomPadding, flexGrow: 1 }}
      />
    );
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {renderHeader()}
      {isConnected ? renderSearchBar() : null}
      {renderContent()}
    </View>
  );
};

export default ExercisesLibraryScreen;
