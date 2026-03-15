import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  SectionList,
  FlatList,
  ScrollView,
  TextInput,
  Platform,
} from 'react-native';
import { CommonActions } from '@react-navigation/native';
import Button from '../components/ui/Button';
import StatusView from '../components/StatusView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useQueryClient } from '@tanstack/react-query';
import Icon from '../components/Icon';
import SegmentedControl from '../components/SegmentedControl';
import { useServerConnection, useExternalProviders, useSuggestedExercises, useExerciseSearch, useWorkoutPresets, useWorkoutPresetSearch } from '../hooks';
import { suggestedExercisesQueryKey } from '../hooks/queryKeys';
import { useExternalExerciseSearch } from '../hooks/useExternalExerciseSearch';
import { importExercise } from '../services/api/externalExerciseSearchApi';
import { EXERCISE_PROVIDER_TYPES } from '../types/externalProviders';
import type { Exercise } from '../types/exercise';
import type { ExternalExerciseItem } from '../types/externalExercises';
import type { WorkoutPreset } from '../types/workoutPresets';
import type { RootStackScreenProps } from '../types/navigation';

type ExerciseSearchScreenProps = RootStackScreenProps<'ExerciseSearch'>;

type ExerciseSection = {
  title: string;
  data: Exercise[];
};

type TabKey = 'search' | 'online' | 'workouts';

const PICKER_TABS: { key: TabKey; label: string }[] = [
  { key: 'search', label: 'Search' },
  { key: 'online', label: 'Online' },
] as const;

const ENTRY_TABS: { key: TabKey; label: string }[] = [
  { key: 'search', label: 'Search' },
  { key: 'online', label: 'Online' },
  { key: 'workouts', label: 'Workouts' },
] as const;

const ExerciseSearchScreen: React.FC<ExerciseSearchScreenProps> = ({ navigation, route }) => {
  const params = route.params;
  const isEntryMode = 'mode' in params && params.mode === 'entry';
  const returnKey = 'returnKey' in params ? params.returnKey : undefined;
  const entryDate = isEntryMode ? params.date : undefined;

  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [accentColor, textMuted, textSecondary] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-text-secondary',
  ]) as [string, string, string];
  const { isConnected } = useServerConnection();

  const tabs = isEntryMode ? ENTRY_TABS : PICKER_TABS;

  const [activeTab, setActiveTab] = useState<TabKey>('search');
  const [searchText, setSearchText] = useState('');
  const [importingExerciseId, setImportingExerciseId] = useState<string | null>(null);

  const { recentExercises, topExercises, isLoading: isSuggestedLoading, isError: isSuggestedError, refetch: refetchSuggested } = useSuggestedExercises();
  const { searchResults, isSearching, isSearchActive, isSearchError } = useExerciseSearch(searchText);

  const {
    providers,
    isLoading: isProvidersLoading,
    isError: isProvidersError,
    refetch: refetchProviders,
  } = useExternalProviders({
    enabled: isConnected && activeTab === 'online',
    filterSet: EXERCISE_PROVIDER_TYPES,
  });

  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const hasUserSelectedProvider = useRef(false);

  const selectedProviderType = useMemo(
    () => providers.find((p) => p.id === selectedProvider)?.provider_type ?? '',
    [providers, selectedProvider],
  );

  const selectedProviderName = useMemo(
    () => providers.find((p) => p.id === selectedProvider)?.provider_name ?? '',
    [providers, selectedProvider],
  );

  const {
    searchResults: onlineSearchResults,
    isSearching: isOnlineSearching,
    isSearchActive: isOnlineSearchActive,
    isSearchError: isOnlineSearchError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useExternalExerciseSearch(searchText, selectedProviderType, {
    enabled: isConnected && activeTab === 'online' && selectedProvider !== null,
    providerId: selectedProvider ?? undefined,
  });

  // Workout presets (entry mode only)
  const {
    presets,
    isLoading: isPresetsLoading,
    isError: isPresetsError,
    refetch: refetchPresets,
  } = useWorkoutPresets({ enabled: isConnected && isEntryMode && activeTab === 'workouts' });
  const {
    searchResults: presetSearchResults,
    isSearching: isPresetSearching,
    isSearchActive: isPresetSearchActive,
    isSearchError: isPresetSearchError,
  } = useWorkoutPresetSearch(searchText, {
    enabled: isConnected && isEntryMode && activeTab === 'workouts',
  });

  useEffect(() => {
    if (providers.length === 0) return;
    if (hasUserSelectedProvider.current && providers.some((p) => p.id === selectedProvider)) return;
    setSelectedProvider(providers[0].id);
  }, [providers, selectedProvider]);

  // --- Selection handlers ---

  const handleSelectExercise = useCallback((exercise: Exercise) => {
    if (isEntryMode) {
      navigation.navigate('ActivityForm', {
        date: entryDate,
        selectedExercise: exercise,
        selectionNonce: Date.now(),
        popCount: 2,
      });
    } else {
      navigation.dispatch({
        ...CommonActions.setParams({ selectedExercise: exercise, selectionNonce: Date.now() }),
        source: returnKey!,
      });
      navigation.goBack();
    }
  }, [isEntryMode, returnKey, entryDate, navigation]);

  const handleImportExercise = useCallback(async (item: ExternalExerciseItem) => {
    setImportingExerciseId(item.id);
    try {
      const exercise = await importExercise(item.source, item.id);
      queryClient.invalidateQueries({ queryKey: suggestedExercisesQueryKey });
      handleSelectExercise(exercise);
    } catch {
      // Silently fail — user can retry
    } finally {
      setImportingExerciseId(null);
    }
  }, [queryClient, handleSelectExercise]);

  const handleSelectPreset = useCallback((preset: WorkoutPreset) => {
    navigation.navigate('WorkoutForm', { preset, date: entryDate, popCount: 2 });
  }, [entryDate, navigation]);

  const handleNewWorkout = useCallback(() => {
    navigation.navigate('WorkoutForm', { date: entryDate, popCount: 2 });
  }, [entryDate, navigation]);

  // --- Shared renderers ---

  const renderExerciseRow = useCallback(({ item }: { item: Exercise }) => (
    <TouchableOpacity
      className="px-4 py-3 border-b border-border-subtle"
      activeOpacity={0.7}
      onPress={() => handleSelectExercise(item)}
    >
      <Text className="text-text-primary text-base font-medium">{item.name}</Text>
      {item.category && (
        <Text className="text-sm mt-0.5" style={{ color: textSecondary }}>
          {item.category}
        </Text>
      )}
    </TouchableOpacity>
  ), [handleSelectExercise, textSecondary]);

  const sections = useMemo(() => {
    const allSections: ExerciseSection[] = [
      { title: 'Recent', data: recentExercises },
      { title: 'Popular', data: topExercises },
    ];
    return allSections.filter((section) => section.data.length > 0);
  }, [recentExercises, topExercises]);

  const renderSectionHeader = ({ section }: { section: ExerciseSection }) => (
    <View className="px-4 py-2 bg-surface">
      <Text className="text-text-secondary text-sm font-semibold uppercase tracking-wider">
        {section.title}
      </Text>
    </View>
  );

  const renderSearchBar = () => (
    <View className="px-4 py-2">
      <View className="flex-row items-center bg-raised rounded-lg border border-border-subtle px-3 py-2.5">
        <Icon name="search" size={18} color={textMuted} />
        <TextInput
          className="flex-1 text-text-primary ml-2"
          style={{ fontSize: 16, lineHeight: 20 }}
          placeholder={activeTab === 'workouts' ? 'Search workouts...' : 'Search exercises...'}
          placeholderTextColor={textMuted}
          value={searchText}
          onChangeText={setSearchText}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {searchText.length > 0 && (
          <Button variant="ghost" onPress={() => setSearchText('')} hitSlop={8} className="p-0">
            <Icon name="close" size={16} color={textMuted} />
          </Button>
        )}
      </View>
    </View>
  );

  // --- Search tab ---

  const renderSearchResults = () => {
    if (isSearching && searchResults.length === 0) {
      return <StatusView loading />;
    }

    if (isSearchError) {
      return <StatusView icon="alert-circle" title="Failed to search exercises" />;
    }

    if (searchResults.length === 0) {
      return <StatusView title="No matching exercises found" />;
    }

    return (
      <FlatList
        data={searchResults}
        keyExtractor={(item) => item.id}
        renderItem={renderExerciseRow}
        keyboardShouldPersistTaps="handled"
      />
    );
  };

  const renderSearchTab = () => {
    if (!isConnected) {
      return <StatusView icon="cloud-offline" title="Connect to a server to view exercises" />;
    }

    if (isSearchActive) {
      return renderSearchResults();
    }

    if (isSuggestedLoading) {
      return <StatusView loading />;
    }

    if (isSuggestedError) {
      return (
        <StatusView
          icon="alert-circle"
          title="Failed to load exercises"
          action={{ label: 'Retry', onPress: () => refetchSuggested() }}
        />
      );
    }

    if (sections.length === 0) {
      return <StatusView title="Search for an exercise to get started" />;
    }

    return (
      <SectionList
        sections={sections}
        keyExtractor={(item, index) => `${index}-${item.id}`}
        renderItem={renderExerciseRow}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled
        keyboardShouldPersistTaps="handled"
      />
    );
  };

  // --- Online tab ---

  const renderExternalExerciseItem = ({ item }: { item: ExternalExerciseItem }) => (
    <TouchableOpacity
      className="px-4 py-3 border-b border-border-subtle"
      activeOpacity={0.7}
      disabled={importingExerciseId !== null}
      onPress={() => handleImportExercise(item)}
    >
      <View className="flex-row justify-between items-center">
        <View className="flex-1 mr-3">
          <Text className="text-text-primary text-base font-medium">{item.name}</Text>
          {item.category && (
            <Text className="text-text-secondary text-sm mt-0.5">{item.category}</Text>
          )}
        </View>
        {importingExerciseId === item.id ? (
          <ActivityIndicator size="small" color={accentColor} />
        ) : (
          <Icon name="add-circle" size={22} color={accentColor} />
        )}
      </View>
    </TouchableOpacity>
  );

  const renderOnlineFooter = () => {
    if (isFetchNextPageError) {
      return (
        <Button
          variant="ghost"
          onPress={() => fetchNextPage()}
          className="py-3"
          textClassName="text-sm"
        >
          Failed to load more. Tap to retry
        </Button>
      );
    }
    if (isFetchingNextPage) {
      return (
        <View className="py-3 items-center">
          <ActivityIndicator size="small" color={accentColor} />
        </View>
      );
    }
    if (hasNextPage) {
      return (
        <Button
          variant="ghost"
          onPress={() => fetchNextPage()}
          className="py-4 mb-4"
          textClassName="text-sm"
        >
          Load More
        </Button>
      );
    }
    return null;
  };

  const renderOnlineSearchResults = () => {
    if (isOnlineSearching && onlineSearchResults.length === 0) {
      return <StatusView loading />;
    }

    if (isOnlineSearchError) {
      return <StatusView icon="alert-circle" title={`Failed to search ${selectedProviderName}`} />;
    }

    if (onlineSearchResults.length === 0) {
      return <StatusView title="No matching exercises found" />;
    }

    return (
      <FlatList
        data={onlineSearchResults}
        keyExtractor={(item, index) => `${item.source}-${item.id}-${index}`}
        renderItem={renderExternalExerciseItem}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={renderOnlineFooter()}
      />
    );
  };

  const renderOnlineTab = () => {
    if (!isConnected) {
      return <StatusView icon="cloud-offline" title="Connect to a server to search online exercises" />;
    }

    if (isProvidersLoading) {
      return <StatusView loading />;
    }

    if (isProvidersError) {
      return (
        <StatusView
          icon="alert-circle"
          title="Failed to load providers"
          action={{ label: 'Retry', onPress: () => refetchProviders() }}
        />
      );
    }

    if (providers.length === 0) {
      return <StatusView icon="globe" iconColor={textMuted} title="No online exercise providers configured" />;
    }

    return (
      <View className="flex-1">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="px-4 gap-2 items-center"
          className="grow-0"
        >
          {providers.map((provider) => {
            const isActive = provider.id === selectedProvider;
            return (
              <TouchableOpacity
                key={provider.id}
                onPress={() => {
                  hasUserSelectedProvider.current = true;
                  setSelectedProvider(provider.id);
                }}
                activeOpacity={0.7}
                className={`flex-row items-center rounded-full px-3 py-1 border ${
                  isActive
                    ? 'border-accent-primary bg-accent-primary'
                    : 'border-border-subtle bg-raised'
                }`}
              >
                <Text
                  className={`text-sm font-medium ${
                    isActive ? 'text-white' : 'text-text-primary'
                  }`}
                >
                  {provider.provider_name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {isOnlineSearchActive ? (
          renderOnlineSearchResults()
        ) : (
          <StatusView icon="search" iconColor={textSecondary} title={`Search ${selectedProviderName} for exercises`} />
        )}
      </View>
    );
  };

  // --- Workouts tab (entry mode only) ---

  const renderPresetItem = ({ item }: { item: WorkoutPreset }) => (
    <TouchableOpacity
      className="px-4 py-3 border-b border-border-subtle"
      activeOpacity={0.7}
      onPress={() => handleSelectPreset(item)}
    >
      <Text className="text-text-primary text-base font-medium">{item.name}</Text>
      {item.description && (
        <Text className="text-text-secondary text-sm mt-0.5" numberOfLines={1}>{item.description}</Text>
      )}
      <Text className="text-text-muted text-xs mt-0.5">
        {item.exercises.length} exercise{item.exercises.length !== 1 ? 's' : ''}
      </Text>
    </TouchableOpacity>
  );

  const renderPresetSearchResults = () => {
    if (isPresetSearching && presetSearchResults.length === 0) {
      return <StatusView loading />;
    }

    if (isPresetSearchError) {
      return <StatusView icon="alert-circle" title="Failed to search workouts" />;
    }

    if (presetSearchResults.length === 0) {
      return <StatusView title="No matching workouts found" />;
    }

    return (
      <FlatList
        data={presetSearchResults}
        keyExtractor={(item) => item.id}
        renderItem={renderPresetItem}
        keyboardShouldPersistTaps="handled"
      />
    );
  };

  const renderWorkoutsTab = () => {
    if (!isConnected) {
      return <StatusView icon="cloud-offline" title="Connect to a server to view workouts" />;
    }

    if (isPresetSearchActive) {
      return renderPresetSearchResults();
    }

    if (isPresetsLoading) {
      return <StatusView loading />;
    }

    if (isPresetsError) {
      return (
        <StatusView
          icon="alert-circle"
          title="Failed to load workouts"
          action={{ label: 'Retry', onPress: () => refetchPresets() }}
        />
      );
    }

    if (presets.length === 0) {
      return <StatusView title="No workout presets found" />;
    }

    return (
      <FlatList
        data={presets}
        keyExtractor={(item) => item.id}
        renderItem={renderPresetItem}
        keyboardShouldPersistTaps="handled"
      />
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'search':
        return renderSearchTab();
      case 'online':
        return renderOnlineTab();
      case 'workouts':
        return renderWorkoutsTab();
    }
  };

  return (
    <View className="flex-1 bg-background" style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border-subtle">
        <Button
          variant="ghost"
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="z-10 p-0"
        >
          <Icon name="close" size={22} color={accentColor} />
        </Button>
        <Text className="absolute left-0 right-0 text-center text-text-primary text-lg font-semibold">
          Exercises
        </Text>
        {isEntryMode ? (
          <Button
            variant="ghost"
            onPress={handleNewWorkout}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="z-10 p-0"
          >
            <Icon name="add" size={26} color={accentColor} />
          </Button>
        ) : (
          <View style={{ width: 22 }} />
        )}
      </View>

      {/* Segmented control */}
      <View className="px-4 mt-2">
        <SegmentedControl segments={tabs} activeKey={activeTab} onSelect={setActiveTab} />
      </View>

      {/* Search bar */}
      {renderSearchBar()}

      {/* Tab content */}
      {renderTabContent()}
    </View>
  );
};

export default ExerciseSearchScreen;
