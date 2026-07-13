import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import type {
  ExerciseEntryResponse,
  ExerciseEntrySetResponse,
  ExerciseSessionResponse,
  ExerciseSetStats,
} from '@workspace/shared';
import Button from './ui/Button';
import { useExerciseHistory } from '../hooks/useExerciseHistory';
import { formatRecentSessionSet, matchesSetRecord } from '../utils/workoutSession';
import { formatDateLabel } from '../utils/dateUtils';

interface ExerciseHistoryListProps {
  exerciseId: string;
  weightUnit: 'kg' | 'lbs';
  /** All-time best (from the stats endpoint) — sets tying it get the outlined chip. */
  bestSet?: ExerciseSetStats | null;
}

const SetChip: React.FC<{
  set: ExerciseEntrySetResponse;
  weightUnit: 'kg' | 'lbs';
  bestSet?: ExerciseSetStats | null;
}> = ({ set, weightUnit, bestSet }) => {
  const isPr = set.is_pr === true;
  const isPrMatch = !isPr && matchesSetRecord(set, bestSet);
  const label = formatRecentSessionSet(
    {
      setNumber: set.set_number,
      setType: set.set_type,
      weight: set.weight,
      reps: set.reps,
    },
    weightUnit,
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
const formatEntrySummary = (entries: ExerciseEntryResponse[]): string | null => {
  const duration = entries.reduce((sum, e) => sum + (e.duration_minutes ?? 0), 0);
  const calories = entries.reduce((sum, e) => sum + (e.calories_burned ?? 0), 0);
  const parts: string[] = [];
  if (duration > 0) parts.push(`${Math.round(duration)} min`);
  if (calories > 0) parts.push(`${Math.round(calories)} cal`);
  return parts.length > 0 ? parts.join(' · ') : null;
};

const SessionCard: React.FC<{
  session: ExerciseSessionResponse;
  exerciseId: string;
  weightUnit: 'kg' | 'lbs';
  bestSet?: ExerciseSetStats | null;
}> = ({ session, exerciseId, weightUnit, bestSet }) => {
  // The history endpoint filters at the session level, so a preset session
  // still carries every exercise it contains — show only this exercise's sets.
  const entries =
    session.type === 'preset'
      ? session.exercises.filter((entry) => entry.exercise_id === exerciseId)
      : [session];
  const sets = entries
    .flatMap((entry) => entry.sets)
    .filter((set) => set.weight != null || set.reps != null);
  const presetName = session.type === 'preset' ? session.name : null;

  return (
    <View className="bg-surface rounded-xl p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-text-primary text-base font-semibold">
          {session.entry_date ? formatDateLabel(session.entry_date) : 'Unknown date'}
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
            <SetChip key={set.id} set={set} weightUnit={weightUnit} bestSet={bestSet} />
          ))}
        </View>
      ) : (
        <Text className="text-text-secondary text-sm mt-2">
          {formatEntrySummary(entries) ?? 'No set data'}
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
  bestSet,
}) => {
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
        <Text className="text-text-secondary text-sm">Couldn&apos;t load history.</Text>
        <Button variant="ghost" onPress={refetch}>
          Retry
        </Button>
      </View>
    );
  }

  if (sessions.length === 0) {
    return (
      <View className="bg-surface rounded-xl p-4 items-center">
        <Text className="text-text-secondary text-sm">No sessions logged yet.</Text>
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
          bestSet={bestSet}
        />
      ))}
      {hasMore ? (
        <Button variant="ghost" onPress={loadMore} disabled={isLoadingMore}>
          {isLoadingMore ? 'Loading…' : 'Load more'}
        </Button>
      ) : null}
    </>
  );
};

export default ExerciseHistoryList;
