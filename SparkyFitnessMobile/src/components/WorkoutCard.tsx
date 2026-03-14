import React, { useEffect, useState } from 'react';
import { View, Text, Image } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { ExerciseSessionResponse } from '@workspace/shared';
import Icon, { type IconName } from './Icon';
import type { GetImageSource } from '../hooks/useExerciseImageSource';

interface WorkoutCardProps {
  session: ExerciseSessionResponse;
  getImageSource?: GetImageSource;
}

export const CATEGORY_ICON_MAP: Record<string, IconName> = {
  Strength: 'exercise-weights',
  Cardio: 'exercise-running',
  Running: 'exercise-running',
  Cycling: 'exercise-cycling',
  Swimming: 'exercise-swimming',
  Walking: 'exercise-walking',
  Hiking: 'exercise-hiking',
  Yoga: 'exercise-yoga',
  Pilates: 'exercise-pilates',
  Dance: 'exercise-dance',
  Boxing: 'exercise-boxing',
  Rowing: 'exercise-rowing',
  Tennis: 'exercise-tennis',
  Basketball: 'exercise-basketball',
  Soccer: 'exercise-soccer',
  Elliptical: 'exercise-elliptical',
  'Stair Stepper': 'exercise-stair',
};

export function getWorkoutIcon(session: ExerciseSessionResponse): IconName {
  if (session.type === 'preset') return 'exercise-weights';
  const category = session.exercise_snapshot?.category;
  if (category && category in CATEGORY_ICON_MAP) {
    return CATEGORY_ICON_MAP[category];
  }
  return 'exercise-default';
}

const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  HealthKit: 'Apple Health',
  'Health Connect': 'Health Connect',
  Garmin: 'Garmin',
  garmin: 'Garmin',
  Strava: 'Strava',
  Fitbit: 'Fitbit',
  Withings: 'Withings',
};

export function getSourceLabel(source: string | null): { label: string; isSparky: boolean } {
  if (source == null || source === 'manual' || source === 'sparky') {
    return { label: 'Sparky', isSparky: true };
  }
  return { label: SOURCE_DISPLAY_NAMES[source] ?? source, isSparky: false };
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

export function getFirstImage(session: ExerciseSessionResponse): string | null {
  if (session.type === 'individual') {
    return session.exercise_snapshot?.images?.[0] ?? null;
  }
  for (const exercise of session.exercises) {
    const img = exercise.exercise_snapshot?.images?.[0];
    if (img) return img;
  }
  return null;
}

export function getWorkoutSummary(session: ExerciseSessionResponse): {
  name: string;
  duration: number;
  calories: number;
} {
  if (session.type === 'preset') {
    return {
      name: session.name,
      duration: session.total_duration_minutes,
      calories: session.exercises.reduce((sum, e) => sum + e.calories_burned, 0),
    };
  }
  return {
    name: session.exercise_snapshot?.name ?? 'Unknown exercise',
    duration: session.duration_minutes,
    calories: session.calories_burned,
  };
}

function getImageSourceSignature(
  source: { uri: string; headers: Record<string, string> } | null,
): string {
  if (!source) return '';

  const headerSignature = Object.entries(source.headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join('|');

  return `${source.uri}|${headerSignature}`;
}

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
  const [imageError, setImageError] = useState(false);
  const imageSourceSignature = getImageSourceSignature(imageSource);

  useEffect(() => {
    setImageError(false);
  }, [imageSourceSignature]);

  const showImage = imageSource && !imageError;

  return (
    <View className="bg-surface rounded-xl p-4 mb-2 shadow-sm">
      <View className="flex-row items-center">
        <View className="mr-3 items-center justify-center" style={{ width: 40, height: 40 }}>
          {showImage ? (
            <Image
              source={{ uri: imageSource.uri, headers: imageSource.headers }}
              style={{ width: 40, height: 40, borderRadius: 8 }}
              onError={() => setImageError(true)}
            />
          ) : (
            <Icon name={iconName} size={24} color={accentPrimary} />
          )}
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
