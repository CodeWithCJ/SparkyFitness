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
import Toast from 'react-native-toast-message';
import Button from '../components/ui/Button';
import StatusView from '../components/StatusView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useQueryClient } from '@tanstack/react-query';
import Icon from '../components/Icon';
import SafeImage from '../components/SafeImage';
import SegmentedControl from '../components/SegmentedControl';
import { CATEGORY_ICON_MAP } from '../utils/workoutSession';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { useServerConnection, useExternalProviders, useSuggestedExercises, useExerciseSearch } from '../hooks';
import { suggestedExercisesQueryKey } from '../hooks/queryKeys';
import { useExternalExerciseSearch } from '../hooks/useExternalExerciseSearch';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { importExercise } from '../services/api/externalExerciseSearchApi';
import type { Exercise } from '../types/exercise';
import type { ExternalExerciseItem } from '../types/externalExercises';
import type { RootStackScreenProps } from '../types/navigation';
import { localizeExerciseCategory, mobileT } from '../localization';

type ExerciseSearchScreenProps = RootStackScreenProps<'ExerciseSearch'>;

type ExerciseSection = {
  title: string;
  data: Exercise[];
};

type TabKey = 'search' | 'online';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'search', label: mobileT('exerciseSearch.saved') },
  { key: 'online', label: mobileT('exerciseSearch.online') },
] as const;

const ExerciseSearchScreen: React.FC<ExerciseSearchScreenProps> = ({ navigation, route }) => {
  const { returnKey } = route.params;

  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [accentColor, textMuted, textSecondary, borderSubtle] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-text-secondary',
    '--color-border-subtle',
  ]) as [string, string, string, string];
  const { isConnected } = useServerConnection();
  const { getImageSource } = useExerciseImageSource();

  const [activeTab, setActiveTab] = useState<TabKey>('search');
  const [searchText, setSearchText] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
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
    category: 'exercise',
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

  useEffect(() => {
    if (providers.length === 0) return;
    if (hasUserSelectedProvider.current && providers.some((p) => p.id === selectedProvider)) return;
    // Default the provider once the list loads; guarded by a ref tracking an
    // explicit user selection, which keeps this from moving to a render-time derive.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedProvider(providers[0].id);
  }, [providers, selectedProvider]);

  // --- Selection handlers ---

  const handleSelectExercise = useCallback((exercise: Exercise) => {
    navigation.dispatch({
      ...CommonActions.setParams({ selectedExercise: exercise, selectionNonce: Date.now() }),
      source: returnKey,
    });
    navigation.goBack();
  }, [returnKey, navigation]);

  const handleImportExercise = useCallback(async (item: ExternalExerciseItem) => {
    setImportingExerciseId(item.id);
    try {
      const exercise = await importExercise(item.source, item.id);
      queryClient.invalidateQueries({ queryKey: suggestedExercisesQueryKey });
      handleSelectExercise(exercise);
    } catch {
      // apiFetch already logs the failure; surface it so the tap isn't silent.
      Toast.show({
        type: 'error',
        text1: mobileT('exerciseSearch.addFailed'),
        text2: mobileT('common.retry'),
      });
    }
    setImportingExerciseId(null);
  }, [queryClient, handleSelectExercise]);

  // --- Shared renderers ---

  const renderExerciseRow = useCallback(({ item }: { item: Exercise }) => {
    const image = item.images?.[0] ?? null;
    const fallbackIcon =
      (item.category && CATEGORY_ICON_MAP[item.category]) || 'exercise-weights';
    return (
      <TouchableOpacity
        className="flex-row items-center gap-3 px-4 py-3 border-b border-border-subtle"
        activeOpacity={0.7}
        onPress={() => handleSelectExercise(item)}
      >
        <SafeImage
          source={image ? getImageSource(image) : null}
          style={{ width: 44, height: 44, borderRadius: 8 }}
          fallback={
            <View
              className="bg-raised items-center justify-center"
              style={{ width: 44, height: 44, borderRadius: 8 }}
            >
              <Icon name={fallbackIcon} size={22} color={textMuted} />
            </View>
          }
        />
        <View className="flex-1">
          <Text className="text-text-primary text-base font-medium">{item.name}</Text>
          {item.category && (
            <Text className="text-sm mt-0.5" style={{ color: textSecondary }}>
              {localizeExerciseCategory(item.category)}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [handleSelectExercise, textSecondary, textMuted, getImageSource]);

  const sections = useMemo(() => {
    const allSections: ExerciseSection[] = [
      { title: mobileT('exerciseSearch.recent'), data: recentExercises },
      { title: mobileT('exerciseSearch.popular'), data: topExercises },
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
      <View
        className="flex-row items-center bg-raised rounded-lg px-3 py-2.5"
        style={{ borderWidth: 1, borderColor: isSearchFocused ? accentColor : borderSubtle }}
      >
        <Icon name="search" size={18} color={textMuted} />
        <View className="flex-1" style={{ marginStart: 8 }}>
          <TextInput
            className="text-text-primary"
            style={{ fontSize: 16, padding: 0, includeFontPadding: false }}
            placeholder={mobileT('library.searchExercises')}
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
        {searchText.length > 0 && (
          <Button
            variant="header"
            onPress={() => setSearchText('')}
            hitSlop={8}
            accessibilityLabel={mobileT('exerciseSearch.clearSearch')}
          >
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
      return (
        <StatusView
          icon="alert-circle"
          title={mobileT('exerciseSearch.searchFailed')}
        />
      );
    }

    if (searchResults.length === 0) {
      return <StatusView title={mobileT('library.noMatchingExercises')} />;
    }

    return (
      <FlatList
        data={searchResults}
        keyExtractor={(item) => item.id}
        renderItem={renderExerciseRow}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="pb-safe-or-4"
      />
    );
  };

  const renderSearchTab = () => {
    if (!isConnected) {
      return (
        <StatusView
          icon="cloud-offline"
          title={mobileT('exerciseSearch.connectToView')}
        />
      );
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
          title={mobileT('library.loadExercisesFailed')}
          action={{
            label: mobileT('common.retry'),
            onPress: () => refetchSuggested(),
          }}
        />
      );
    }

    if (sections.length === 0) {
      return <StatusView title={mobileT('exerciseSearch.startPrompt')} />;
    }

    return (
      <SectionList
        sections={sections}
        keyExtractor={(item, index) => `${index}-${item.id}`}
        renderItem={renderExerciseRow}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="pb-safe-or-4"
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
      accessibilityLabel={mobileT('exerciseSearch.addExercise', {
        exercise: item.name,
      })}
    >
      <View className="flex-row justify-between items-center">
        <View className="flex-1" style={{ marginEnd: 12 }}>
          <Text className="text-text-primary text-base font-medium">{item.name}</Text>
          {item.category && (
            <Text className="text-text-secondary text-sm mt-0.5">
              {localizeExerciseCategory(item.category)}
            </Text>
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
          {mobileT('exerciseSearch.loadMoreFailed')}
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
          {mobileT('exerciseSearch.loadMore')}
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
      return (
        <StatusView
          icon="alert-circle"
          title={mobileT('exerciseSearch.providerSearchFailed', {
            provider: selectedProviderName,
          })}
        />
      );
    }

    if (onlineSearchResults.length === 0) {
      return <StatusView title={mobileT('library.noMatchingExercises')} />;
    }

    return (
      <FlatList
        data={onlineSearchResults}
        keyExtractor={(item, index) => `${item.source}-${item.id}-${index}`}
        renderItem={renderExternalExerciseItem}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="pb-safe-or-4"
        ListFooterComponent={renderOnlineFooter()}
      />
    );
  };

  const renderOnlineTab = () => {
    if (!isConnected) {
      return (
        <StatusView
          icon="cloud-offline"
          title={mobileT('exerciseSearch.connectOnline')}
        />
      );
    }

    if (isProvidersLoading) {
      return <StatusView loading />;
    }

    if (isProvidersError) {
      return (
        <StatusView
          icon="alert-circle"
          title={mobileT('exerciseSearch.providersFailed')}
          action={{
            label: mobileT('common.retry'),
            onPress: () => refetchProviders(),
          }}
        />
      );
    }

    if (providers.length === 0) {
      return (
        <StatusView
          icon="globe"
          iconColor={textMuted}
          title={mobileT('exerciseSearch.noProviders')}
        />
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
                accessibilityRole="radio"
                accessibilityState={{ checked: isActive }}
                accessibilityLabel={mobileT('exerciseSearch.selectProvider', {
                  provider: provider.provider_name,
                })}
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
          <StatusView
            icon="search"
            iconColor={textSecondary}
            title={mobileT('exerciseSearch.searchProvider', {
              provider: selectedProviderName,
            })}
          />
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

  const header = useScreenHeader({
    title: mobileT('screens.selectExercise'),
    left: { kind: 'dismiss', onPress: () => navigation.goBack(), identifier: 'exercise-search-cancel' },
  });

  return (
      <View className="flex-1 bg-background" style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}>
      {header}

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
