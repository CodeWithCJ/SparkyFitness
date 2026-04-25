import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Button from '../components/ui/Button';
import StatusView from '../components/StatusView';
import Icon from '../components/Icon';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useWorkoutPresets, useWorkoutPresetSearch, useRefetchOnFocus } from '../hooks';
import type { WorkoutPreset } from '../types/workoutPresets';
import type { RootStackScreenProps } from '../types/navigation';

type PresetSearchScreenProps = RootStackScreenProps<'PresetSearch'>;

const PresetSearchScreen: React.FC<PresetSearchScreenProps> = ({ navigation, route }) => {
  const date = route.params?.date;
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [accentColor, textMuted, textSecondary, borderSubtle] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-text-secondary',
    '--color-border-subtle',
  ]) as [string, string, string, string];

  const [searchText, setSearchText] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const { presets, isLoading, isError, refetch } = useWorkoutPresets();
  const { searchResults, isSearching, isSearchActive, isSearchError } = useWorkoutPresetSearch(searchText);

  useRefetchOnFocus(refetch, true);

  const handleSelectPreset = useCallback((preset: WorkoutPreset) => {
    navigation.navigate('WorkoutAdd', { preset, date, popCount: 2 });
  }, [navigation, date]);

  const renderPresetRow = useCallback(({ item }: { item: WorkoutPreset }) => (
    <TouchableOpacity
      className="px-4 py-3 border-b border-border-subtle"
      activeOpacity={0.7}
      onPress={() => handleSelectPreset(item)}
    >
      <Text className="text-text-primary text-base font-medium">{item.name}</Text>
      <Text className="text-sm mt-0.5" style={{ color: textSecondary }}>
        {item.exercises.length} {item.exercises.length === 1 ? 'exercise' : 'exercises'}
      </Text>
    </TouchableOpacity>
  ), [handleSelectPreset, textSecondary]);

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
        keyExtractor={(item) => item.id}
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
      return <StatusView title="No presets yet" subtitle="Create a workout and save it as a preset to see it here" />;
    }
    return (
      <FlatList
        data={presets}
        keyExtractor={(item) => item.id}
        renderItem={renderPresetRow}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 + activeWorkoutBarPadding }}
      />
    );
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
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
          Presets
        </Text>
        <View style={{ width: 22 }} />
      </View>

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
              style={{ fontSize: 16 }}
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
            <Button variant="ghost" onPress={() => setSearchText('')} hitSlop={8} className="p-0">
              <Icon name="close" size={16} color={textMuted} />
            </Button>
          )}
        </View>
      </View>

      {/* Content */}
      {renderContent()}
    </View>
  );
};

export default PresetSearchScreen;
