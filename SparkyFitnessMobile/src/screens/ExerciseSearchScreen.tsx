import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useQueryClient } from '@tanstack/react-query';
import Icon from '../components/Icon';
import SegmentedControl from '../components/SegmentedControl';
import { useServerConnection, useExternalProviders, useSuggestedExercises, useExerciseSearch } from '../hooks';
import { suggestedExercisesQueryKey } from '../hooks/queryKeys';
import { useExternalExerciseSearch } from '../hooks/useExternalExerciseSearch';
import { importExercise } from '../services/api/externalExerciseSearchApi';
import { EXERCISE_PROVIDER_TYPES } from '../types/externalProviders';
import type { Exercise } from '../types/exercise';
import type { ExternalExerciseItem } from '../types/externalExercises';
import type { RootStackScreenProps } from '../types/navigation';

type ExerciseSearchScreenProps = RootStackScreenProps<'ExerciseSearch'>;

type ExerciseSection = {
  title: string;
  data: Exercise[];
};

type TabKey = 'search' | 'online';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'search', label: 'Search' },
  { key: 'online', label: 'Online' },
] as const;

const ExerciseSearchScreen: React.FC<ExerciseSearchScreenProps> = ({ navigation, route }) => {
  const { returnKey } = route.params;
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [accentColor, textMuted, textSecondary] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-text-secondary',
  ]) as [string, string, string];
  const { isConnected } = useServerConnection();

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

  // Default to first provider when providers load
  useEffect(() => {
    if (providers.length === 0) return;
    if (hasUserSelectedProvider.current && providers.some((p) => p.id === selectedProvider)) return;
    setSelectedProvider(providers[0].id);
  }, [providers, selectedProvider]);

  const handleSelectExercise = (exercise: Exercise) => {
    navigation.dispatch({
      ...CommonActions.setParams({ selectedExercise: exercise, selectionNonce: Date.now() }),
      source: returnKey,
    });
    navigation.goBack();
  };

  const handleImportExercise = async (item: ExternalExerciseItem) => {
    setImportingExerciseId(item.id);
    try {
      const exercise = await importExercise(item.source, item.id);
      queryClient.invalidateQueries({ queryKey: suggestedExercisesQueryKey });
      handleSelectExercise(exercise);
    } catch {
      // Silently fail — user can retry
      setImportingExerciseId(null);
    }
  };

  // --- Shared renderers ---

  const renderExerciseRow = ({ item }: { item: Exercise }) => (
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
  );

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
          placeholder="Search exercises..."
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
      return (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color={accentColor} />
        </View>
      );
    }

    if (isSearchError) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Icon name="alert-circle" size={48} color={accentColor} />
          <Text className="text-text-secondary text-base mt-4 text-center">
            Failed to search exercises
          </Text>
        </View>
      );
    }

    if (searchResults.length === 0) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Text className="text-text-secondary text-base text-center">
            No matching exercises found
          </Text>
        </View>
      );
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
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Icon name="cloud-offline" size={48} color={accentColor} />
          <Text className="text-text-secondary text-base mt-4 text-center">
            Connect to a server to view exercises
          </Text>
        </View>
      );
    }

    if (isSearchActive) {
      return renderSearchResults();
    }

    if (isSuggestedLoading) {
      return (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color={accentColor} />
        </View>
      );
    }

    if (isSuggestedError) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Icon name="alert-circle" size={48} color={accentColor} />
          <Text className="text-text-secondary text-base mt-4 text-center">
            Failed to load exercises
          </Text>
          <Button
            variant="secondary"
            onPress={() => refetchSuggested()}
            className="mt-4 px-6"
          >
            Retry
          </Button>
        </View>
      );
    }

    if (sections.length === 0) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Text className="text-text-secondary text-base text-center">
            Search for an exercise to get started
          </Text>
        </View>
      );
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

  const renderOnlineSearchResults = () => {
    if (isOnlineSearching && onlineSearchResults.length === 0) {
      return (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color={accentColor} />
        </View>
      );
    }

    if (isOnlineSearchError) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Icon name="alert-circle" size={48} color={accentColor} />
          <Text className="text-text-secondary text-base mt-4 text-center">
            Failed to search {selectedProviderName}
          </Text>
        </View>
      );
    }

    if (onlineSearchResults.length === 0) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Text className="text-text-secondary text-base text-center">
            No matching exercises found
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={onlineSearchResults}
        keyExtractor={(item, index) => `${item.source}-${item.id}-${index}`}
        renderItem={renderExternalExerciseItem}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={
          isFetchNextPageError ? (
            <Button
              variant="ghost"
              onPress={() => fetchNextPage()}
              className="py-3"
              textClassName="text-sm"
            >
              Failed to load more. Tap to retry
            </Button>
          ) : isFetchingNextPage ? (
            <View className="py-3 items-center">
              <ActivityIndicator size="small" color={accentColor} />
            </View>
          ) : hasNextPage ? (
            <Button
              variant="ghost"
              onPress={() => fetchNextPage()}
              className="py-4 mb-4"
              textClassName="text-sm"
            >
              Load More
            </Button>
          ) : null
        }
      />
    );
  };

  const renderOnlineTab = () => {
    if (!isConnected) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Icon name="cloud-offline" size={48} color={accentColor} />
          <Text className="text-text-secondary text-base mt-4 text-center">
            Connect to a server to search online exercises
          </Text>
        </View>
      );
    }

    if (isProvidersLoading) {
      return (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color={accentColor} />
        </View>
      );
    }

    if (isProvidersError) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Icon name="alert-circle" size={48} color={accentColor} />
          <Text className="text-text-secondary text-base mt-4 text-center">
            Failed to load providers
          </Text>
          <Button
            variant="secondary"
            onPress={() => refetchProviders()}
            className="mt-4 px-6"
          >
            Retry
          </Button>
        </View>
      );
    }

    if (providers.length === 0) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Icon name="globe" size={48} color={textMuted} />
          <Text className="text-text-secondary text-base mt-4 text-center">
            No online exercise providers configured
          </Text>
        </View>
      );
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
          <View className="flex-1 justify-center items-center px-6">
            <Icon name="search" size={48} color={textSecondary} />
            <Text className="text-text-secondary text-base mt-4 text-center">
              Search {selectedProviderName} for exercises
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'search':
        return renderSearchTab();
      case 'online':
        return renderOnlineTab();
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
        {/* Spacer to keep title centered */}
        <View style={{ width: 22 }} />
      </View>

      {/* Segmented control */}
      <View className="px-4 mt-2">
        <SegmentedControl segments={TABS} activeKey={activeTab} onSelect={setActiveTab} />
      </View>

      {/* Search bar */}
      {renderSearchBar()}

      {/* Tab content */}
      {renderTabContent()}
    </View>
  );
};

export default ExerciseSearchScreen;
