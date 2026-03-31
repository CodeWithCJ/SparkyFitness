import React from 'react';
import { View, Text } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { ExerciseSessionResponse } from '@workspace/shared';
import Icon from './Icon';
import SafeImage from './SafeImage';
import { getWorkoutIcon, getSourceLabel, formatDuration, getWorkoutSummary, getFirstImage } from '../utils/workoutSession';
import { weightFromKg, distanceFromKm } from '../utils/unitConversions';
import type { GetImageSource } from '../hooks/useExerciseImageSource';

interface WorkoutCardProps {
  session: ExerciseSessionResponse;
  getImageSource?: GetImageSource;
  weightUnit?: 'kg' | 'lbs';
  distanceUnit?: 'km' | 'miles';
}

export { getSourceLabel, formatDuration, getWorkoutSummary } from '../utils/workoutSession';

const WorkoutCard = React.memo<WorkoutCardProps>(({ session, getImageSource, weightUnit = 'kg', distanceUnit = 'km' }) => {
  const accentPrimary = useCSSVariable('--color-accent-primary') as string;
  const textMuted = useCSSVariable('--color-text-muted') as string;
  const textSecondary = useCSSVariable('--color-text-secondary') as string;
  const iconName = getWorkoutIcon(session);
  const { name, duration, calories } = getWorkoutSummary(session);
  const source = session.source;

  const subtitle = buildSubtitle(session, duration, calories, weightUnit, distanceUnit);

  const { label: sourceLabel, isSparky } = getSourceLabel(source);

  const firstImage = getFirstImage(session);
  const imageSource = firstImage && getImageSource ? getImageSource(firstImage) : null;

  return (
    <View className="bg-surface rounded-xl p-4 mb-2 shadow-sm">
      <View className="flex-row items-center">
        <View className="mr-3 items-center justify-center" style={{ width: 40, height: 40 }}>
          <SafeImage
            source={imageSource}
            style={{ width: 40, height: 40, borderRadius: 8 }}
            fallback={<Icon name={iconName} size={24} color={accentPrimary} />}
          />
        </View>
        <View className="flex-1">
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-semibold text-text-primary flex-1 mr-2" numberOfLines={1}>
              {name}
            </Text>
            <View
              className="rounded-full px-2 py-0.5"
              style={{ backgroundColor: isSparky ? `${accentPrimary}20` : `${textMuted}20` }}
            >
              <Text
                className="text-xs font-medium"
                style={{ color: isSparky ? accentPrimary : textSecondary }}
              >
                {sourceLabel}
              </Text>
            </View>
          </View>
          <Text className="text-sm text-text-secondary mt-0.5">
            {subtitle}
          </Text>
        </View>
      </View>
    </View>
  );
});

function buildSubtitle(
  session: ExerciseSessionResponse,
  duration: number,
  calories: number,
  weightUnit: 'kg' | 'lbs',
  distanceUnit: 'km' | 'miles',
): string {
  if (session.type === 'preset') {
    const exerciseCount = session.exercises.length;
    const totalSets = session.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
    const totalVolumeKg = session.exercises.reduce(
      (sum, ex) => ex.sets.reduce((s, set) => s + (set.weight ?? 0) * (set.reps ?? 0), sum),
      0,
    );

    const parts: string[] = [];
    parts.push(`${exerciseCount} exercise${exerciseCount !== 1 ? 's' : ''}`);
    if (totalSets > 0) parts.push(`${totalSets} sets`);
    if (totalVolumeKg > 0) {
      const vol = Math.round(weightFromKg(totalVolumeKg, weightUnit));
      parts.push(`${vol.toLocaleString()} ${weightUnit}`);
    }
    return parts.join(' \u00b7 ');
  }

  // Individual activity: duration, distance, calories
  const parts: string[] = [];
  if (duration > 0) parts.push(formatDuration(duration));
  if (session.distance != null && session.distance > 0) {
    const dist = distanceFromKm(session.distance, distanceUnit);
    const label = distanceUnit === 'miles' ? 'mi' : 'km';
    parts.push(`${dist.toFixed(1)} ${label}`);
  }
  if (calories > 0) parts.push(`${Math.round(calories)} Cal`);
  return parts.join(' \u00b7 ');
}

WorkoutCard.displayName = 'WorkoutCard';

export default WorkoutCard;
