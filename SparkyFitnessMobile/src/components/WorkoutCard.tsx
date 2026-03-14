import React from 'react';
import { View, Text } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { ExerciseSessionResponse } from '@workspace/shared';
import Icon, { type IconName } from './Icon';
import { formatDate } from '../utils/dateUtils';

interface WorkoutCardProps {
  session: ExerciseSessionResponse;
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

const WorkoutCard = React.memo<WorkoutCardProps>(({ session }) => {
  const accentPrimary = useCSSVariable('--color-accent-primary') as string;
  const textMuted = useCSSVariable('--color-text-muted') as string;

  const iconName = getWorkoutIcon(session);
  const { name, duration, calories } = getWorkoutSummary(session);
  const source = session.source;
  const subtitle = session.type === 'preset'
    ? `${session.exercises.length} exercise${session.exercises.length !== 1 ? 's' : ''}`
    : undefined;

  const { label: sourceLabel, isSparky } = getSourceLabel(source);
  const dateStr = session.entry_date ? formatDate(session.entry_date) : '';

  return (
    <View className="bg-surface rounded-xl p-4 mb-2 shadow-sm">
      <View className="flex-row items-center">
        <View className="mr-3">
          <Icon name={iconName} size={24} color={accentPrimary} />
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
            {formatDuration(duration)} · {Math.round(calories)} Cal
            {subtitle ? ` · ${subtitle}` : ''}
          </Text>
          {dateStr ? (
            <Text className="text-xs text-text-muted mt-0.5">{dateStr}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
});

WorkoutCard.displayName = 'WorkoutCard';

export default WorkoutCard;
