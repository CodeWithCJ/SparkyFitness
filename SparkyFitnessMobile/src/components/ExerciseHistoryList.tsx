import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ActivityIndicator } from 'react-native';
import type {
  ExerciseEntryResponse,
  ExerciseEntrySetResponse,
  ExerciseModality,
  ExerciseSessionResponse,
  ExerciseSetStats,
} from '@workspace/shared';
import Button from './ui/Button';
import { useExerciseHistory } from '../hooks/useExerciseHistory';
import { formatRecentSessionSet, matchesSetRecord } from '../utils/workoutSession';
import { addDays, formatDate, getTodayDate } from '../utils/dateUtils';
import type { TFunction } from 'i18next';

interface ExerciseHistoryListProps {
  exerciseId: string;
  weightUnit: 'kg' | 'lbs';
  distanceUnit?: 'km' | 'miles';
  /** The exercise's resolved modality — duration exercises chip as `45s`. */
  modality?: ExerciseModality;
  /** All-time best (from the stats endpoint) — sets tying it get the outlined chip. */
  bestSet?: ExerciseSetStats | null;
}

const SetChip: React.FC<{
  set: ExerciseEntrySetResponse;
  weightUnit: 'kg' | 'lbs';
  distanceUnit: 'km' | 'miles';
  modality?: ExerciseModality;
  bestSet?: ExerciseSetStats | null;
}> = ({ set, weightUnit, distanceUnit, modality, bestSet }) => {
  const isPr = set.is_pr === true;
  const isPrMatch = !isPr && matchesSetRecord(set, bestSet);
  const label = formatRecentSessionSet(
    {
      setNumber: set.set_number,
      setType: set.set_type,
      weight: set.weight,
      reps: set.reps,
      duration: set.duration,
      distance: set.distance,
    },
    weightUnit,
    modality,
    distanceUnit,
  );
  return (
    <View
      testID={isPr ? 'pr-chip' : isPrMatch ? 'pr-match-chip' : undefined}
      className={`px-2.5 py-1 rounded-full border ${
        isPr
          ? 'bg-accent-primary/15 border-transparent'
          : isPrMatch
            ? 'bg-raised border-accent-primary/40'
            : 'bg-raised border-transparent'
      }`}
    >
      <Text
        className={`text-sm font-medium ${
          isPr || isPrMatch ? 'text-accent-primary' : 'text-text-primary'
        }`}
      >
        {label}
      </Text>
    </View>
  );
};

/** Duration/calories line for entries logged without set data (cardio, quick logs). */
function formatHistoryDate(t: TFunction, dateString: string | null | undefined): string {
  if (!dateString) return t('exerciseHistory.unknownDate');
  const today = getTodayDate();
  if (dateString === today) return t('commonDates.today');
  if (dateString === addDays(today, -1)) return t('commonDates.yesterday');
  return formatDate(dateString);
}

const formatEntrySummary = (t: TFunction, entries: ExerciseEntryResponse[]): string | null => {
  const duration = entries.reduce((sum, e) => sum + (e.duration_minutes ?? 0), 0);
  const calories = entries.reduce((sum, e) => sum + (e.calories_burned ?? 0), 0);
  const parts: string[] = [];
  if (duration > 0) parts.push(t('exerciseHistory.durationSummary', { minutes: Math.round(duration) }));
  if (calories > 0) parts.push(t('exerciseHistory.caloriesSummary', { calories: Math.round(calories) }));
  return parts.length > 0 ? parts.join(' · ') : null;
};

const SessionCard: React.FC<{
  session: ExerciseSessionResponse;
  exerciseId: string;
  weightUnit: 'kg' | 'lbs';
  distanceUnit: 'km' | 'miles';
  modality?: ExerciseModality;
  bestSet?: ExerciseSetStats | null;
  t: TFunction;
}> = ({ session, exerciseId, weightUnit, distanceUnit, modality, bestSet, t }) => {
  // The history endpoint filters at the session level, so a preset session
  // still carries every exercise it contains — show only this exercise's sets.
  const entries =
    session.type === 'preset'
      ? session.exercises.filter((entry) => entry.exercise_id === exerciseId)
      : [session];
  const sets = entries
    .flatMap((entry) => entry.sets)
    .filter(
      (set) =>
        set.weight != null ||
        set.reps != null ||
        set.duration != null ||
        set.distance != null,
    );
  const presetName = session.type === 'preset' ? session.name : null;

  return (
    <View className="bg-surface rounded-xl p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-text-primary text-base font-semibold">
          {formatHistoryDate(t, session.entry_date)}
        </Text>
        {presetName ? (
          <Text className="text-text-muted text-sm flex-shrink ml-3" numberOfLines={1}>
            {presetName}
          </Text>
        ) : null}
      </View>
      {sets.length > 0 ? (
        <View className="flex-row flex-wrap gap-1.5 mt-2.5">
          {sets.map((set) => (
            <SetChip
              key={set.id}
              set={set}
              weightUnit={weightUnit}
              distanceUnit={distanceUnit}
              modality={modality}
              bestSet={bestSet}
            />
          ))}
        </View>
      ) : (
        <Text className="text-text-secondary text-sm mt-2">
          {formatEntrySummary(t, entries) ?? t('exerciseHistory.noSetData')}
        </Text>
      )}
    </View>
  );
};

/**
 * History tab body for ExerciseDetailScreen. Renders as sibling cards inside
 * the screen's ScrollView (the contentContainer gap spaces them).
 */
const ExerciseHistoryList: React.FC<ExerciseHistoryListProps> = ({
  exerciseId,
  weightUnit,
  distanceUnit = 'km',
  modality,
  bestSet,
}) => {
  const { t } = useTranslation();
  const { sessions, isLoading, isLoadingMore, isError, refetch, loadMore, hasMore } =
    useExerciseHistory({ exerciseId });

  if (isLoading) {
    return (
      <View className="bg-surface rounded-xl p-6 items-center">
        <ActivityIndicator />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="bg-surface rounded-xl p-4 items-center">
        <Text className="text-text-secondary text-sm">{t('exerciseHistory.loadError')}</Text>
        <Button variant="ghost" onPress={refetch}>
          {t('common.retry')}
        </Button>
      </View>
    );
  }

  if (sessions.length === 0) {
    return (
      <View className="bg-surface rounded-xl p-4 items-center">
        <Text className="text-text-secondary text-sm">{t('exerciseHistory.empty')}</Text>
      </View>
    );
  }

  return (
    <>
      {sessions.map((session) => (
        <SessionCard
          key={session.id}
          session={session}
          exerciseId={exerciseId}
          weightUnit={weightUnit}
          distanceUnit={distanceUnit}
          modality={modality}
          bestSet={bestSet}
          t={t}
        />
      ))}
      {hasMore ? (
        <Button variant="ghost" onPress={loadMore} disabled={isLoadingMore}>
          {isLoadingMore ? t('exerciseHistory.loading') : t('exerciseHistory.loadMore')}
        </Button>
      ) : null}
    </>
  );
};

export default ExerciseHistoryList;
