import React, { useCallback, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View, Text, TouchableOpacity, TextInput, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Button from '../components/ui/Button';
import StatusView from '../components/StatusView';
import Icon from '../components/Icon';
import SafeImage from '../components/SafeImage';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useWorkoutPresets, useWorkoutPresetSearch, useRefetchOnFocus, useProfile } from '../hooks';
import {
  deriveShareStatus,
  filterByOwnership,
  ownershipFilterHeaderMenu,
  ownershipFilterEmptyState,
} from '../utils/shareStatus';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import ShareStatusBadge from '../components/ShareStatusBadge';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { useNavigationActionGuard } from '../hooks/useNavigationActionGuard';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useSelectedExercise } from '../hooks/useSelectedExercise';
import { useStartLiveWorkout } from '../hooks/useStartLiveWorkout';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { formatLocalizedNumber } from '../localization';
import {
  CATEGORY_ICON_MAP,
  buildPresetStartExercisesPayload,
  buildSingleExerciseStartPayload,
} from '../utils/workoutSession';
import type { Exercise } from '../types/exercise';
import type { WorkoutPreset } from '../types/workoutPresets';
import type { RootStackScreenProps } from '../types/navigation';

type PresetSearchScreenProps = RootStackScreenProps<'PresetSearch'>;

/** startingId sentinel for the pinned empty-workout row (preset rows use preset ids). */
const EMPTY_START_ID = 'empty-workout';

const PresetSearchScreen: React.FC<PresetSearchScreenProps> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [accentColor, textMuted, textSecondary, borderSubtle] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-text-secondary',
    '--color-border-subtle',
  ]) as [string, string, string, string];
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { profile } = useProfile();

  const [searchText, setSearchText] = useState('');
  const ownershipFilter = useAppPreferencesStore((s) => s.presetSearchOwnershipFilter);
  const setOwnershipFilter = useAppPreferencesStore((s) => s.setPresetSearchOwnershipFilter);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [startingId, setStartingId] = useState<string | number | null>(null);

  const { presets, isLoading, isError, refetch } = useWorkoutPresets();
  const { searchResults, isSearching, isSearchActive, isSearchError } = useWorkoutPresetSearch(searchText);
  const filteredPresets = useMemo(() => filterByOwnership(presets, ownershipFilter, profile?.id), [presets, ownershipFilter, profile?.id]);
  const filteredSearchResults = useMemo(() => filterByOwnership(searchResults, ownershipFilter, profile?.id), [searchResults, ownershipFilter, profile?.id]);
  const { startLiveWorkout, isStarting } = useStartLiveWorkout(navigation);
  const { getImageSource } = useExerciseImageSource();
  const { isNavigationLocked, runNavigationAction } = useNavigationActionGuard(navigation);

  useRefetchOnFocus(refetch, true);

  const handleCancel = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const header = useScreenHeader({
    title: t('presetSearch.title', { defaultValue: 'Start Workout' }),
    left: { kind: 'dismiss', onPress: handleCancel, identifier: 'preset-search-cancel' },
    right: ownershipFilterHeaderMenu({
      noun: t('presetSearch.noun', { defaultValue: 'presets' }),
      labels: { all: t('ownership.all', { defaultValue: 'All' }), mine: t('ownership.mine', { defaultValue: 'Mine' }), family: t('ownership.family', { defaultValue: 'Family' }), public: t('ownership.public', { defaultValue: 'Public' }) },
      showLabel: t('ownership.show', { defaultValue: 'Show' }),
      filterAccessibilityLabel: t('ownership.filter', { defaultValue: 'Filter {{noun}}, filtered to {{filter}}' }),
      identifier: 'preset-search-filter',
      filter: ownershipFilter,
      onSelect: setOwnershipFilter,
    }),
  });

  const handleSelectPreset = useCallback((preset: WorkoutPreset) => {
    setStartingId(preset.id);
    void startLiveWorkout({
      name: preset.name,
      exercises: buildPresetStartExercisesPayload(preset),
      sourcePresetId: preset.id,
    });
  }, [startLiveWorkout]);

  const handlePreviewPreset = useCallback((preset: WorkoutPreset) => {
    runNavigationAction(() => {
      navigation.navigate('WorkoutPresetDetail', { preset });
    });
  }, [runNavigationAction, navigation]);

  const handleStartEmpty = useCallback(() => {
    navigation.navigate('ExerciseSearch', { returnKey: route.key });
  }, [navigation, route.key]);

  // The picked first exercise returns here from ExerciseSearch; creating the
  // session with it satisfies the server's ≥1-exercise rule for empty starts.
  const handleFirstExerciseSelected = useCallback((exercise: Exercise) => {
    setStartingId(EMPTY_START_ID);
    void startLiveWorkout({
      exercises: buildSingleExerciseStartPayload(exercise),
    });
  }, [startLiveWorkout]);

  useSelectedExercise(route.params, handleFirstExerciseSelected);

  // Same sibling-pressables layout as the ExerciseSearch rows: the content
  // starts the preset (fast path); the thumbnail and trailing ⓘ open the
  // preset detail as a preview (the ⓘ slot shows the start spinner). The
  // thumbnail is hidden from the accessibility tree because it duplicates
  // the labeled ⓘ action.
  const renderPresetRow = useCallback(({ item }: { item: WorkoutPreset }) => {
    const firstExercise = item.exercises[0];
    const image = firstExercise?.image_url ?? null;
    const fallbackIcon =
      (firstExercise?.category && CATEGORY_ICON_MAP[firstExercise.category]) ||
      'exercise-weights';
    const status = deriveShareStatus(item.user_id, item.is_public, profile?.id);
    return (
      <View className="flex-row items-center border-b border-border-subtle">
        <TouchableOpacity
          className="pl-4 py-3"
          activeOpacity={0.7}
          accessible={false}
          testID="preset-thumbnail"
          disabled={isNavigationLocked || isStarting}
          onPress={() => handlePreviewPreset(item)}
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
        </TouchableOpacity>
        <TouchableOpacity
          className="flex-1 flex-row items-center pl-3 py-3"
          activeOpacity={0.7}
          onPress={() => handleSelectPreset(item)}
          disabled={isStarting}
        >
          <View className="flex-1">
            <View className="flex-row items-center gap-1.5">
              <Text className="text-text-primary text-base font-medium flex-shrink" numberOfLines={1}>
                {item.name}
              </Text>
              <ShareStatusBadge status={status} />
            </View>
            <Text className="text-sm mt-0.5" style={{ color: textSecondary }}>
              {t('workoutPresetCount', { defaultValue: '{{formattedCount}} exercise', count: item.exercises.length, formattedCount: formatLocalizedNumber(item.exercises.length) })}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          className="px-4 py-3"
          activeOpacity={0.7}
          hitSlop={8}
          disabled={isNavigationLocked || isStarting}
          accessibilityLabel={t('presetSearch.viewDetails', { defaultValue: 'View preset details' })}
          onPress={() => handlePreviewPreset(item)}
        >
          {isStarting && startingId === item.id ? (
            <ActivityIndicator size="small" color={accentColor} testID="preset-row-spinner" />
          ) : (
            <Icon name="info-circle" size={22} color={accentColor} />
          )}
        </TouchableOpacity>
      </View>
    );
  }, [
    handleSelectPreset,
    handlePreviewPreset,
    isNavigationLocked,
    isStarting,
    startingId,
    textSecondary,
    textMuted,
    accentColor,
    getImageSource,
    profile,
    t,
  ]);

  const renderSearchResults = () => {
    if (isSearching && filteredSearchResults.length === 0) {
      return <StatusView loading />;
    }
    if (isSearchError) {
      return <StatusView icon="alert-circle" title={t('presetSearch.searchFailed', { defaultValue: 'Failed to search presets' })} />;
    }
    if (filteredSearchResults.length === 0) {
      if (searchResults.length > 0) {
        return (
          <StatusView
            {...ownershipFilterEmptyState({ noun: t('presetSearch.noun', { defaultValue: 'presets' }), filter: ownershipFilter as Exclude<typeof ownershipFilter, 'all'>, onReset: () => setOwnershipFilter('all'), labels: { all: t('ownership.all', { defaultValue: 'All' }), mine: t('ownership.mine', { defaultValue: 'Mine' }), family: t('ownership.family', { defaultValue: 'Family' }), public: t('ownership.public', { defaultValue: 'Public' }) }, emptyTitle: t('presetSearch.noPresetsIn', { defaultValue: 'No {{noun}} in {{filter}}' }), emptySubtitle: t('presetSearch.changeFilter', { defaultValue: 'Change the filter to see your other presets.' }), showAllLabel: t('ownership.showAll', { defaultValue: 'Show All' }) })}
          />
        );
      }
      return <StatusView title={t('presetSearch.noMatches', { defaultValue: 'No matching presets found' })} />;
    }
    return (
      <FlatList
        data={filteredSearchResults}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderPresetRow}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 + activeWorkoutBarPadding }}
      />
    );
  };

  const renderContent = () => {
    if (isSearchActive) {
      return renderSearchResults();
    }
    if (isLoading) {
      return <StatusView loading />;
    }
    if (isError) {
      return (
        <StatusView
          icon="alert-circle"
          title={t('presetSearch.loadFailed', { defaultValue: 'Failed to load presets' })}
          action={{ label: t('common.retry', { defaultValue: 'Retry' }), onPress: () => refetch() }}
        />
      );
    }
    if (presets.length === 0) {
      return <StatusView title={t('presetSearch.noPresetsYet', { defaultValue: 'No presets yet' })} subtitle={t('presetSearch.noPresetsYetMessage', { defaultValue: 'Start an empty workout, or save a workout as a preset to see it here' })} />;
    }
    if (filteredPresets.length === 0) {
      return (
        <StatusView
          {...ownershipFilterEmptyState({ noun: t('presetSearch.noun', { defaultValue: 'presets' }), filter: ownershipFilter as Exclude<typeof ownershipFilter, 'all'>, onReset: () => setOwnershipFilter('all'), labels: { all: t('ownership.all', { defaultValue: 'All' }), mine: t('ownership.mine', { defaultValue: 'Mine' }), family: t('ownership.family', { defaultValue: 'Family' }), public: t('ownership.public', { defaultValue: 'Public' }) }, emptyTitle: t('presetSearch.noPresetsIn', { defaultValue: 'No {{noun}} in {{filter}}' }), emptySubtitle: t('presetSearch.changeFilter', { defaultValue: 'Change the filter to see your other presets.' }), showAllLabel: t('ownership.showAll', { defaultValue: 'Show All' }) })}
        />
      );
    }
    return (
      <FlatList
        data={filteredPresets}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderPresetRow}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 + activeWorkoutBarPadding }}
      />
    );
  };

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}

      {/* Search bar */}
      <View className="px-4 py-2 border-b border-border-subtle">
        <View
          className="flex-row items-center bg-raised rounded-lg px-3 py-2.5"
          style={{ borderWidth: 1, borderColor: isSearchFocused ? accentColor : borderSubtle }}
        >
          <Icon name="search" size={18} color={textMuted} />
          <View className="flex-1 ml-2">
            <TextInput
              className="text-text-primary"
              style={{ fontSize: 16, padding: 0, includeFontPadding: false }}
              placeholder={t('presetSearch.searchPlaceholder', { defaultValue: 'Search presets...' })}
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
            <Button variant="header" onPress={() => setSearchText('')} hitSlop={8}>
              <Icon name="close" size={16} color={textMuted} />
            </Button>
          )}
        </View>
      </View>

      <TouchableOpacity
        className="flex-row items-center px-4 py-3 border-b border-border-subtle"
        activeOpacity={0.7}
        onPress={handleStartEmpty}
        disabled={isStarting}
        testID="empty-workout-row"
      >
        <Icon name="add-circle" size={22} color={accentColor} />
        <View className="flex-1 ml-3">
          <Text className="text-text-primary text-base font-medium">{t('presetSearch.emptyWorkout', { defaultValue: 'Empty workout' })}</Text>
          <Text className="text-sm mt-0.5" style={{ color: textSecondary }}>
            {t('presetSearch.pickFirstExercise', { defaultValue: 'Pick your first exercise' })}
          </Text>
        </View>
        {isStarting && startingId === EMPTY_START_ID && (
          <ActivityIndicator size="small" color={accentColor} testID="empty-row-spinner" />
        )}
      </TouchableOpacity>

      {/* Content */}
      {renderContent()}
    </View>
  );
};

export default PresetSearchScreen;
