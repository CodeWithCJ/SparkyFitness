import React, { useCallback, useState } from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity, TextInput, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Button from '../components/ui/Button';
import StatusView from '../components/StatusView';
import Icon from '../components/Icon';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useWorkoutPresets, useWorkoutPresetSearch, useRefetchOnFocus } from '../hooks';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useSelectedExercise } from '../hooks/useSelectedExercise';
import { useStartLiveWorkout } from '../hooks/useStartLiveWorkout';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import {
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
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [accentColor, textMuted, textSecondary, borderSubtle] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-text-secondary',
    '--color-border-subtle',
  ]) as [string, string, string, string];
  const usesNativeHeader = useNativeIOSHeadersActive();

  const [searchText, setSearchText] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [startingId, setStartingId] = useState<string | number | null>(null);

  const { presets, isLoading, isError, refetch } = useWorkoutPresets();
  const { searchResults, isSearching, isSearchActive, isSearchError } = useWorkoutPresetSearch(searchText);
  const { startLiveWorkout, isStarting } = useStartLiveWorkout(navigation);

  useRefetchOnFocus(refetch, true);

  const handleCancel = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const header = useScreenHeader({
    title: 'Start Workout',
    left: { kind: 'dismiss', onPress: handleCancel, identifier: 'preset-search-cancel' },
  });

  const handleSelectPreset = useCallback((preset: WorkoutPreset) => {
    setStartingId(preset.id);
    void startLiveWorkout({
      name: preset.name,
      exercises: buildPresetStartExercisesPayload(preset),
    });
  }, [startLiveWorkout]);

  const handleStartEmpty = useCallback(() => {
    navigation.navigate('ExerciseSearch', { returnKey: route.key });
  }, [navigation, route.key]);

  // The picked first exercise returns here from ExerciseSearch; creating the
  // session with it satisfies the server's ≥1-exercise rule for empty starts.
  const handleFirstExerciseSelected = useCallback((exercise: Exercise) => {
    setStartingId(EMPTY_START_ID);
    void startLiveWorkout({ exercises: buildSingleExerciseStartPayload(exercise) });
  }, [startLiveWorkout]);

  useSelectedExercise(route.params, handleFirstExerciseSelected);

  const renderPresetRow = useCallback(({ item }: { item: WorkoutPreset }) => (
    <TouchableOpacity
      className="flex-row items-center px-4 py-3 border-b border-border-subtle"
      activeOpacity={0.7}
      onPress={() => handleSelectPreset(item)}
      disabled={isStarting}
    >
      <View className="flex-1">
        <Text className="text-text-primary text-base font-medium">{item.name}</Text>
        <Text className="text-sm mt-0.5" style={{ color: textSecondary }}>
          {item.exercises.length} {item.exercises.length === 1 ? 'exercise' : 'exercises'}
        </Text>
      </View>
      {isStarting && startingId === item.id && (
        <ActivityIndicator size="small" color={accentColor} testID="preset-row-spinner" />
      )}
    </TouchableOpacity>
  ), [handleSelectPreset, isStarting, startingId, textSecondary, accentColor]);

  const renderSearchResults = () => {
    if (isSearching && searchResults.length === 0) {
      return <StatusView loading />;
    }
    if (isSearchError) {
      return <StatusView icon="alert-circle" title="Failed to search presets" />;
    }
    if (searchResults.length === 0) {
      return <StatusView title="No matching presets found" />;
    }
    return (
      <FlatList
        data={searchResults}
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
          title="Failed to load presets"
          action={{ label: 'Retry', onPress: () => refetch() }}
        />
      );
    }
    if (presets.length === 0) {
      return <StatusView title="No presets yet" subtitle="Start an empty workout, or save a workout as a preset to see it here" />;
    }
    return (
      <FlatList
        data={presets}
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
      <View className="px-4 py-2">
        <View
          className="flex-row items-center bg-raised rounded-lg px-3 py-2.5"
          style={{ borderWidth: 1, borderColor: isSearchFocused ? accentColor : borderSubtle }}
        >
          <Icon name="search" size={18} color={textMuted} />
          <View className="flex-1 ml-2">
            <TextInput
              className="text-text-primary"
              style={{ fontSize: 16, padding: 0, includeFontPadding: false }}
              placeholder="Search presets..."
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

      {/* Pinned empty-workout start — stays visible across list loading/empty/error states */}
      <TouchableOpacity
        className="flex-row items-center px-4 py-3 border-b border-border-subtle"
        activeOpacity={0.7}
        onPress={handleStartEmpty}
        disabled={isStarting}
        testID="empty-workout-row"
      >
        <Icon name="add-circle" size={22} color={accentColor} />
        <View className="flex-1 ml-3">
          <Text className="text-text-primary text-base font-medium">Empty workout</Text>
          <Text className="text-sm mt-0.5" style={{ color: textSecondary }}>
            Pick your first exercise
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
