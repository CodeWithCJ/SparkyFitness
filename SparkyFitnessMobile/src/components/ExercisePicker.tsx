import React, { useState, useCallback, useEffect, useImperativeHandle, useRef, useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetTextInput,
  BottomSheetFlatList,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useUniwind, useCSSVariable } from 'uniwind';
import { useSuggestedExercises } from '../hooks/useSuggestedExercises';
import { useExerciseSearch } from '../hooks/useExerciseSearch';
import type { Exercise } from '../types/exercise';

export interface ExercisePickerRef {
  present: () => void;
  dismiss: () => void;
}

interface ExercisePickerProps {
  onSelectExercise: (exercise: Exercise) => void;
}

const ExercisePicker = React.forwardRef<ExercisePickerRef, ExercisePickerProps>(
  ({ onSelectExercise }, ref) => {
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const [searchText, setSearchText] = useState('');
    const { theme } = useUniwind();
    const isDarkMode = theme === 'dark' || theme === 'amoled';

    const [surfaceBg, textMuted, accentPrimary, textSecondary, raisedBg, borderSubtle] =
      useCSSVariable([
        '--color-surface',
        '--color-text-muted',
        '--color-accent-primary',
        '--color-text-secondary',
        '--color-raised',
        '--color-border-subtle',
      ]) as [string, string, string, string, string, string];

    const snapPoints = useMemo(() => ['70%', '90%'], []);

    const { recentExercises, topExercises, isLoading: isSuggestedLoading } = useSuggestedExercises();
    const { searchResults, isSearching, isSearchActive } = useExerciseSearch(searchText);

    useImperativeHandle(ref, () => ({
      present: () => bottomSheetRef.current?.present(),
      dismiss: () => bottomSheetRef.current?.dismiss(),
    }));

    useEffect(() => {
      const sheetRef = bottomSheetRef.current;
      return () => {
        sheetRef?.dismiss();
      };
    }, []);

    const handleDismiss = useCallback(() => {
      setSearchText('');
    }, []);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          opacity={isDarkMode ? 0.7 : 0.5}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
        />
      ),
      [isDarkMode],
    );

    const handleSelect = useCallback(
      (exercise: Exercise) => {
        onSelectExercise(exercise);
        bottomSheetRef.current?.dismiss();
      },
      [onSelectExercise],
    );

    const renderExerciseRow = useCallback(
      ({ item }: { item: Exercise }) => (
        <TouchableOpacity
          className="py-3 px-4"
          onPress={() => handleSelect(item)}
          activeOpacity={0.6}
        >
          <Text className="text-base text-text-primary">{item.name}</Text>
          {item.category && (
            <Text className="text-sm mt-0.5" style={{ color: textSecondary }}>
              {item.category}
            </Text>
          )}
        </TouchableOpacity>
      ),
      [handleSelect, textSecondary],
    );

    const renderSectionHeader = useCallback(
      (title: string) => (
        <View className="px-4 pt-4 pb-1" style={{ backgroundColor: surfaceBg }}>
          <Text className="text-xs font-semibold uppercase tracking-wide" style={{ color: textMuted }}>
            {title}
          </Text>
        </View>
      ),
      [surfaceBg, textMuted],
    );

    type SuggestedItem = { type: 'header'; title: string } | { type: 'exercise'; exercise: Exercise };

    // Build flat list data for suggested view
    const suggestedData = useMemo(() => {
      const items: SuggestedItem[] = [];
      if (recentExercises.length > 0) {
        items.push({ type: 'header', title: 'Recent' });
        recentExercises.forEach(e => items.push({ type: 'exercise', exercise: e }));
      }
      if (topExercises.length > 0) {
        items.push({ type: 'header', title: 'Popular' });
        topExercises.forEach(e => items.push({ type: 'exercise', exercise: e }));
      }
      return items;
    }, [recentExercises, topExercises]);

    const renderSuggestedItem = useCallback(
      ({ item }: { item: (typeof suggestedData)[number] }) => {
        if (item.type === 'header') {
          return renderSectionHeader(item.title);
        }
        return renderExerciseRow({ item: item.exercise });
      },
      [renderSectionHeader, renderExerciseRow],
    );

    const renderContent = () => {
      if (isSearchActive) {
        if (isSearching && searchResults.length === 0) {
          return (
            <View className="flex-1 items-center justify-center py-12">
              <ActivityIndicator size="small" color={accentPrimary} />
            </View>
          );
        }

        if (searchResults.length === 0) {
          return (
            <View className="flex-1 items-center justify-center py-12">
              <Text style={{ color: textMuted }} className="text-base">
                No exercises found
              </Text>
            </View>
          );
        }

        return (
          <BottomSheetFlatList
            data={searchResults}
            keyExtractor={(item: Exercise) => item.id}
            renderItem={renderExerciseRow}
            keyboardShouldPersistTaps="handled"
          />
        );
      }

      // Suggested view
      if (isSuggestedLoading) {
        return (
          <View className="flex-1 items-center justify-center py-12">
            <ActivityIndicator size="small" color={accentPrimary} />
          </View>
        );
      }

      if (suggestedData.length === 0) {
        return (
          <View className="flex-1 items-center justify-center py-12">
            <Text style={{ color: textMuted }} className="text-base">
              Search for an exercise to get started
            </Text>
          </View>
        );
      }

      return (
        <BottomSheetFlatList
          data={suggestedData}
          keyExtractor={(item: SuggestedItem, index: number) =>
            item.type === 'header' ? `header-${item.title}` : item.exercise.id + '-' + index
          }
          renderItem={renderSuggestedItem}
          keyboardShouldPersistTaps="handled"
        />
      );
    };

    return (
      <BottomSheetModal
        ref={bottomSheetRef}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: surfaceBg }}
        handleIndicatorStyle={{ backgroundColor: textMuted }}
        onDismiss={handleDismiss}
      >
        <View className="px-4 pb-3">
          <BottomSheetTextInput
            placeholder="Search exercises..."
            value={searchText}
            onChangeText={setSearchText}
            autoCapitalize="none"
            autoCorrect={false}
            className="text-base py-2.5 px-3 rounded-lg"
            style={{
              backgroundColor: raisedBg,
              borderWidth: 1,
              borderColor: borderSubtle,
              color: isDarkMode ? '#FFFFFF' : '#000000',
            }}
            placeholderTextColor={textMuted}
          />
        </View>
        {renderContent()}
      </BottomSheetModal>
    );
  },
);

ExercisePicker.displayName = 'ExercisePicker';

export default ExercisePicker;
