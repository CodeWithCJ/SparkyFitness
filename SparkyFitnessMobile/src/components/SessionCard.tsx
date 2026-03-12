import React from 'react';
import { View, Text } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { ExerciseSessionResponse } from '@workspace/shared';
import Icon, { type IconName } from './Icon';
import { formatDate } from '../utils/dateUtils';

interface SessionCardProps {
  session: ExerciseSessionResponse;
}

const CATEGORY_ICON_MAP: Record<string, IconName> = {
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

function getSessionIcon(session: ExerciseSessionResponse): IconName {
  if (session.type === 'preset') return 'exercise-weights';
  const category = session.exercise_snapshot?.category;
  if (category && category in CATEGORY_ICON_MAP) {
    return CATEGORY_ICON_MAP[category];
  }
  return 'exercise-default';
}

function getSourceLabel(source: string | null): { label: string; isSparky: boolean } {
  if (source == null || source === 'manual' || source === 'sparky') {
    return { label: 'Sparky', isSparky: true };
  }
  return { label: 'Synced', isSparky: false };
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

const SessionCard: React.FC<SessionCardProps> = ({ session }) => {
  const accentPrimary = useCSSVariable('--color-accent-primary') as string;
  const textMuted = useCSSVariable('--color-text-muted') as string;

  const iconName = getSessionIcon(session);

  let name: string;
  let duration: number;
  let calories: number;
  let source: string | null;
  let subtitle: string | undefined;

  if (session.type === 'preset') {
    name = session.name;
    duration = session.total_duration_minutes;
    calories = session.exercises.reduce((sum, e) => sum + e.calories_burned, 0);
    source = session.source;
    subtitle = `${session.exercises.length} exercise${session.exercises.length !== 1 ? 's' : ''}`;
  } else {
    name = session.exercise_snapshot?.name ?? 'Unknown exercise';
    duration = session.duration_minutes;
    calories = session.calories_burned;
    source = session.source;
  }

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
};

export default SessionCard;
