import React from 'react';
import { View, Text } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { ExerciseSessionResponse } from '@workspace/shared';
import Icon from './Icon';
import SafeImage from './SafeImage';
import { getWorkoutIcon, getSourceLabel, formatDuration, getWorkoutSummary, getFirstImage } from '../utils/workoutSession';
import type { GetImageSource } from '../hooks/useExerciseImageSource';

interface WorkoutCardProps {
  session: ExerciseSessionResponse;
  getImageSource?: GetImageSource;
}

export { CATEGORY_ICON_MAP, getWorkoutIcon, getSourceLabel, formatDuration, getFirstImage, getWorkoutSummary } from '../utils/workoutSession';

const WorkoutCard = React.memo<WorkoutCardProps>(({ session, getImageSource }) => {
  const accentPrimary = useCSSVariable('--color-accent-primary') as string;
  const textMuted = useCSSVariable('--color-text-muted') as string;

  const iconName = getWorkoutIcon(session);
  const { name, duration, calories } = getWorkoutSummary(session);
  const source = session.source;
  const subtitle = session.type === 'preset'
    ? `${session.exercises.length} exercise${session.exercises.length !== 1 ? 's' : ''}`
    : undefined;

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
                style={{ color: isSparky ? accentPrimary : textMuted }}
              >
                {sourceLabel}
              </Text>
            </View>
          </View>
          <Text className="text-sm text-text-secondary mt-0.5">
            {[
              duration > 0 ? formatDuration(duration) : null,
              calories > 0 ? `${Math.round(calories)} Cal` : null,
              subtitle,
            ].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
    </View>
  );
});

WorkoutCard.displayName = 'WorkoutCard';

export default WorkoutCard;
