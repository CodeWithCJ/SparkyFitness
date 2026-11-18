import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Icon from './Icon';
import OfflineBanner from './OfflineBanner';

/**
 * The Library tab while the server cannot be reached (#1983). Only what the
 * phone has saved is offered: the workout presets and the exercise library.
 * Everything else in the Library needs the server, so one line says so
 * instead of a screen of disabled rows.
 */
const OfflineLibrary: React.FC<{
  onOpenWorkoutPresets: () => void;
  onOpenExercises: () => void;
}> = ({ onOpenWorkoutPresets, onOpenExercises }) => {
  const { t } = useTranslation();

  const rows = [
    {
      key: 'workoutPresets',
      label: t('screens.library.workoutPresets', {
        defaultValue: 'Workout presets',
      }),
      onPress: onOpenWorkoutPresets,
    },
    {
      key: 'exercises',
      label: t('screens.library.exercises', { defaultValue: 'Exercises' }),
      onPress: onOpenExercises,
    },
  ];

  return (
    <View className="flex-1 bg-background">
      <OfflineBanner />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16 }}
        testID="offline-library"
      >
        <Text className="text-text-secondary text-sm mb-4">
          {t('offline.libraryNote', {
            defaultValue:
              'Only workouts and exercises are available offline. Everything else in the Library needs a connection.',
          })}
        </Text>
        <View className="bg-surface rounded-xl shadow-sm overflow-hidden">
          {rows.map((row, index) => (
            <Pressable
              key={row.key}
              testID={`offline-library-${row.key}`}
              accessibilityRole="button"
              className={`px-4 py-4 flex-row items-center justify-between ${
                index < rows.length - 1 ? 'border-b border-border-subtle' : ''
              }`}
              onPress={row.onPress}
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
            >
              <Text className="text-base font-semibold text-text-primary">
                {row.label}
              </Text>
              <Icon name="chevron-forward" size={20} color="#999" />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

export default OfflineLibrary;
