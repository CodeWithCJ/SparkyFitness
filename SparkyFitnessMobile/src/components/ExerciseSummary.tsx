import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { ExerciseSessionResponse } from '@workspace/shared';
import Icon from './Icon';
import SafeImage from './SafeImage';
import { getWorkoutIcon, getSourceLabel, getWorkoutSummary, getFirstImage, buildSessionSubtitle } from '../utils/workoutSession';
import type { GetImageSource } from '../hooks/useExerciseImageSource';

interface ExerciseSummaryProps {
  exerciseEntries: ExerciseSessionResponse[];
  onPressWorkout?: (session: ExerciseSessionResponse) => void;
  getImageSource?: GetImageSource;
  weightUnit?: 'kg' | 'lbs';
  distanceUnit?: 'km' | 'miles';
}

const ExerciseSummary: React.FC<ExerciseSummaryProps> = ({
  exerciseEntries,
  onPressWorkout,
  getImageSource,
  weightUnit = 'kg',
  distanceUnit = 'km',
}) => {
  const [accentPrimary, textMuted, textSecondary] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-text-secondary',
  ]) as [string, string, string];

  const filtered = exerciseEntries.filter((session) => {
    if (session.type === 'preset') return true;
    return session.exercise_snapshot?.name !== 'Active Calories';
  });

  if (filtered.length === 0) {
    return (
      <View className="bg-surface rounded-xl p-4 my-2 shadow-sm items-center py-6">
        <Text className="text-text-muted text-base">No exercise entries yet</Text>
      </View>
    );
  }

  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
      <View className="flex-row items-center gap-2 mb-2">
        <Icon name="exercise" size={18} color={accentPrimary} />
        <Text className="text-base font-bold text-text-muted">Exercise</Text>
      </View>
      {filtered.map((session, index) => {
        const { name, duration, calories } = getWorkoutSummary(session);
        const { label: sourceLabel, isSparky } = getSourceLabel(session.source);
        const iconName = getWorkoutIcon(session);
        const firstImage = getFirstImage(session);
        const imageSource = firstImage && getImageSource ? getImageSource(firstImage) : null;
        const subtitle = buildSessionSubtitle(session, duration, calories, weightUnit, distanceUnit);

        return (
          <Pressable
            key={session.id || index}
            className="py-2.5"
            onPress={() => onPressWorkout?.(session)}
          >
            <View className="flex-row items-center">
              <View className="mr-3 items-center justify-center" style={{ width: 36, height: 36 }}>
                <SafeImage
                  source={imageSource}
                  style={{ width: 36, height: 36, borderRadius: 8 }}
                  fallback={<Icon name={iconName} size={20} color={accentPrimary} />}
                />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center justify-between">
                  <Text className="text-base font-semibold text-text-primary flex-1 mr-2" numberOfLines={1}>
                    {name}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    <View
                      className="rounded-full px-1.5 py-0.5"
                      style={{ backgroundColor: isSparky ? `${accentPrimary}20` : `${textMuted}20` }}
                    >
                      <Text
                        className="text-[10px] font-medium"
                        style={{ color: isSparky ? accentPrimary : textSecondary }}
                      >
                        {sourceLabel}
                      </Text>
                    </View>
                    <Icon name="chevron-forward" size={14} color={textMuted} />
                  </View>
                </View>
                <Text className="text-sm text-text-secondary mt-0.5" numberOfLines={1}>
                  {subtitle}
                </Text>
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
};

export default ExerciseSummary;
