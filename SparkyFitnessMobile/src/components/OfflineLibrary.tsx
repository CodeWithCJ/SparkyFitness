import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './Icon';
import OfflineBanner from './OfflineBanner';
import { useActiveWorkoutBarPadding } from './ActiveWorkoutBar';
import { useNativeIOSTabsActive } from '../services/nativeTabBarPreference';

/**
 * The Library tab while the server cannot be reached (#1983). Only what the
 * phone has saved is offered: the workout presets, the exercise library and
 * the foods and meals kept on it.
 * Everything else in the Library needs the server, so one line says so
 * instead of a screen of disabled rows.
 */
const OfflineLibrary: React.FC<{
  onOpenWorkoutPresets: () => void;
  onOpenExercises: () => void;
  onOpenFoods: () => void;
  onOpenMeals: () => void;
}> = ({ onOpenWorkoutPresets, onOpenExercises, onOpenFoods, onOpenMeals }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeTabs = useNativeIOSTabsActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding();

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
    {
      key: 'foods',
      label: t('screens.library.foods', { defaultValue: 'Foods' }),
      onPress: onOpenFoods,
    },
    {
      key: 'meals',
      label: t('screens.library.meals', { defaultValue: 'Meals' }),
      onPress: onOpenMeals,
    },
  ];

  // One scroll view holds the banner too, so under iOS native tabs the large
  // title and its inset adjust it like the online Library.
  return (
    <ScrollView
      className="flex-1 bg-background"
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingBottom: insets.bottom + activeWorkoutBarPadding + 16,
      }}
      contentInsetAdjustmentBehavior={usesNativeTabs ? 'automatic' : 'never'}
      automaticallyAdjustsScrollIndicatorInsets={usesNativeTabs}
      testID="offline-library"
    >
      <OfflineBanner />
      <View style={{ padding: 16 }}>
        <Text className="text-text-secondary text-sm mb-4">
          {t('offline.libraryNote', {
            defaultValue:
              'Workouts, exercises, foods and meals saved on this phone are available offline. Everything else in the Library needs a connection.',
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
      </View>
    </ScrollView>
  );
};

export default OfflineLibrary;
