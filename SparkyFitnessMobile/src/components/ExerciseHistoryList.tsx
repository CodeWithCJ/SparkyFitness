import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import type { TFunction } from 'i18next';
import { useCSSVariable } from 'uniwind';
import type {
  ExerciseEntryResponse,
  ExerciseEntrySetResponse,
  ExerciseModality,
  ExerciseSessionResponse,
  ExerciseSetStats,
  EnergyUnit,
} from '@workspace/shared';
import {
  isBodyweightModality,
  isCardioModality,
  isWeightDistanceModality,
  isWeightDurationModality,
} from '@workspace/shared';
import Button from './ui/Button';
import { useExerciseHistory } from '../hooks/useExerciseHistory';
import {
  formatRecentSessionSet,
  getRpeTone,
  isDurationModality,
  matchesSetRecord,
  setTypeLetter,
} from '../utils/workoutSession';
import { RPE_TONE_VARS } from './ActiveWorkoutSetRow';
import Icon from './Icon';
import { formatLocalizedNumber } from '../localization';
import { formatDateLabel } from '../utils/dateUtils';
import ExerciseEffortCard from './ExerciseEffortCard';
import { buildExerciseEffortSummary } from '../utils/exerciseEffort';
import { useEnergyUnit } from '../hooks/useEnergyUnit';
import { energyUnitLabel, roundedEnergy } from '../utils/energyUnit';

interface ExerciseHistoryListProps {
  exerciseId: string;
  weightUnit: 'kg' | 'lbs';
  distanceUnit?: 'km' | 'miles';
  /** The exercise's resolved modality — it sets the value column and its heading. */
  modality?: ExerciseModality;
  /** All-time best (from the stats endpoint) — sets tying it get the outlined trophy. */
  bestSet?: ExerciseSetStats | null;
  /** Opens the workout a session belongs to; the header shows a chevron when set. */
  onOpenSession?: (session: ExerciseSessionResponse) => void;
}

const SET_COLUMN_WIDTH = 44;
const RPE_COLUMN_WIDTH = 56;
const RECORD_COLUMN_WIDTH = 28;

/** The heading over the value column, which depends on what the sets record. */
const valueColumnLabel = (
  modality: ExerciseModality | undefined,
  t: TFunction
): string => {
  if (modality == null) {
    return t('exerciseHistory.columns.weightReps', {
      defaultValue: 'Weight & reps',
    });
  }
  if (isCardioModality(modality)) {
    return t('exerciseHistory.columns.timeDistance', {
      defaultValue: 'Time & distance',
    });
  }
  if (isDurationModality(modality)) {
    return t('exerciseHistory.columns.time', { defaultValue: 'Time' });
  }
  if (isWeightDistanceModality(modality)) {
    return t('exerciseHistory.columns.weightDistance', {
      defaultValue: 'Weight & distance',
    });
  }
  if (isWeightDurationModality(modality)) {
    return t('exerciseHistory.columns.weightTime', {
      defaultValue: 'Weight & time',
    });
  }
  if (modality === 'reps_only' || isBodyweightModality(modality)) {
    return t('exerciseHistory.columns.reps', { defaultValue: 'Reps' });
  }
  return t('exerciseHistory.columns.weightReps', {
    defaultValue: 'Weight & reps',
  });
};

const ColumnHeader: React.FC<{ valueLabel: string }> = ({ valueLabel }) => {
  const { t } = useTranslation();
  const labelClass = 'text-text-muted text-xs font-semibold uppercase';
  return (
    <View className="flex-row items-center px-2 mt-3 mb-1">
      <Text className={labelClass} style={{ width: SET_COLUMN_WIDTH }}>
        {t('exerciseHistory.columns.set', { defaultValue: 'Set' })}
      </Text>
      <Text className={`${labelClass} flex-1`}>{valueLabel}</Text>
      <Text
        className={`${labelClass} text-center`}
        style={{ width: RPE_COLUMN_WIDTH }}
      >
        {t('exerciseHistory.columns.rpe', { defaultValue: 'RPE' })}
      </Text>
      <View style={{ width: RECORD_COLUMN_WIDTH }} />
    </View>
  );
};

const RpePill: React.FC<{ rpe: number }> = ({ rpe }) => {
  const toneVars = useCSSVariable([
    RPE_TONE_VARS.easy,
    RPE_TONE_VARS.moderate,
    RPE_TONE_VARS.hard,
    RPE_TONE_VARS.max,
  ]) as string[];
  const tone = getRpeTone(rpe);
  const color = toneVars[['easy', 'moderate', 'hard', 'max'].indexOf(tone)];
  return (
    <View
      testID="history-rpe"
      className="rounded-full px-2 py-0.5"
      style={{ backgroundColor: `${color}26` }}
    >
      <Text className="text-sm font-semibold" style={{ color }}>
        {formatLocalizedNumber(rpe, { maximumFractionDigits: 1 })}
      </Text>
    </View>
  );
};

const SetRow: React.FC<{
  set: ExerciseEntrySetResponse;
  /** What the set column shows: its working-set number, or its type letter. */
  setLabel: string;
  shaded: boolean;
  weightUnit: 'kg' | 'lbs';
  distanceUnit: 'km' | 'miles';
  modality?: ExerciseModality;
  bestSet?: ExerciseSetStats | null;
}> = ({
  set,
  setLabel,
  shaded,
  weightUnit,
  distanceUnit,
  modality,
  bestSet,
}) => {
  const { t } = useTranslation();
  const [accent, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];
  const isPr = set.is_pr === true;
  const isPrMatch = !isPr && matchesSetRecord(set, bestSet);
  const isTyped = setTypeLetter(set.set_type) != null;
  // The set column carries the type, so the value text drops its own prefix.
  const value = formatRecentSessionSet(
    {
      setNumber: set.set_number,
      setType: null,
      weight: set.weight,
      reps: set.reps,
      duration: set.duration,
      distance: set.distance,
    },
    weightUnit,
    t,
    modality,
    distanceUnit
  );
  return (
    <View
      testID={isPr ? 'pr-row' : isPrMatch ? 'pr-match-row' : 'history-set-row'}
      className={`flex-row items-center px-2 py-2.5 rounded-lg ${
        shaded ? 'bg-raised' : ''
      }`}
    >
      <Text
        className={`text-base font-semibold ${
          isTyped ? 'text-accent-primary' : 'text-text-secondary'
        }`}
        style={{ width: SET_COLUMN_WIDTH }}
      >
        {setLabel}
      </Text>
      <Text className="text-text-primary text-base flex-1">{value}</Text>
      <View style={{ width: RPE_COLUMN_WIDTH }} className="items-center">
        {set.rpe != null ? <RpePill rpe={set.rpe} /> : null}
      </View>
      <View style={{ width: RECORD_COLUMN_WIDTH }} className="items-end">
        {isPr ? (
          <Icon name="trophy" size={16} color={accent} />
        ) : isPrMatch ? (
          <Icon name="trophy-outline" size={16} color={textMuted} />
        ) : null}
      </View>
    </View>
  );
};

/** Duration/calories line for entries logged without set data (cardio, quick logs). */
const formatEntrySummary = (
  entries: ExerciseEntryResponse[],
  t: TFunction,
  energyUnit: EnergyUnit
): string | null => {
  const duration = entries.reduce(
    (sum, e) => sum + (e.duration_minutes ?? 0),
    0
  );
  const calories = entries.reduce(
    (sum, e) => sum + (e.calories_burned ?? 0),
    0
  );
  const parts: string[] = [];
  if (duration > 0) parts.push(`${Math.round(duration)} min`);
  if (calories > 0)
    parts.push(
      `${roundedEnergy(calories, energyUnit)} ${energyUnitLabel(energyUnit, t)}`
    );
  return parts.length > 0 ? parts.join(' · ') : null;
};

/** The time the session started, from its earliest completed set. */
const formatSessionTime = (
  sets: ExerciseEntrySetResponse[],
  language: string
): string | null => {
  const times = sets
    .map((set) => (set.completed_at ? Date.parse(set.completed_at) : NaN))
    .filter((time) => Number.isFinite(time));
  if (times.length === 0) return null;
  return new Intl.DateTimeFormat(language, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(Math.min(...times)));
};

const SessionCard: React.FC<{
  session: ExerciseSessionResponse;
  exerciseId: string;
  weightUnit: 'kg' | 'lbs';
  distanceUnit: 'km' | 'miles';
  modality?: ExerciseModality;
  bestSet?: ExerciseSetStats | null;
  onOpenSession?: (session: ExerciseSessionResponse) => void;
}> = ({
  session,
  exerciseId,
  weightUnit,
  distanceUnit,
  modality,
  bestSet,
  onOpenSession,
}) => {
  const { t, i18n: translationI18n } = useTranslation();
  const energyUnit = useEnergyUnit();
  const textMuted = useCSSVariable('--color-text-muted') as string;
  const dateLocale = translationI18n.language.startsWith('pl')
    ? 'pl-PL'
    : 'en-US';
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
        set.distance != null
    );
  const presetName = session.type === 'preset' ? session.name : null;
  const dateLabel = session.entry_date
    ? formatDateLabel(session.entry_date, t, dateLocale)
    : t('common.unknownDate', { defaultValue: 'Unknown date' });
  const timeLabel = formatSessionTime(sets, translationI18n.language);
  // The title is the workout's name when it has one; the date moves beneath it.
  const subtitle = [presetName ? dateLabel : null, timeLabel]
    .filter(Boolean)
    .join(' · ');

  // A working set is numbered among the working sets; the others show their type.
  const rows = sets.map((set, index) => {
    const label =
      setTypeLetter(set.set_type) ??
      String(
        sets.slice(0, index + 1).filter((s) => !setTypeLetter(s.set_type))
          .length
      );
    return (
      <SetRow
        key={set.id}
        set={set}
        setLabel={label}
        shaded={index % 2 === 1}
        weightUnit={weightUnit}
        distanceUnit={distanceUnit}
        modality={modality}
        bestSet={bestSet}
      />
    );
  });

  const header = (
    <View className="flex-row items-center justify-between">
      <View className="flex-1">
        <Text
          className="text-text-primary text-base font-semibold"
          numberOfLines={1}
        >
          {presetName ?? dateLabel}
        </Text>
        {subtitle ? (
          <Text className="text-text-muted text-sm mt-0.5">{subtitle}</Text>
        ) : null}
      </View>
      {onOpenSession ? (
        <Icon name="chevron-forward" size={18} color={textMuted} />
      ) : null}
    </View>
  );

  return (
    <View className="bg-surface rounded-xl p-4">
      {onOpenSession ? (
        <Pressable
          testID="history-session-header"
          accessibilityRole="button"
          onPress={() => onOpenSession(session)}
        >
          {header}
        </Pressable>
      ) : (
        header
      )}
      {sets.length > 0 ? (
        <>
          <ColumnHeader valueLabel={valueColumnLabel(modality, t)} />
          {rows}
        </>
      ) : (
        <Text className="text-text-secondary text-sm mt-2">
          {formatEntrySummary(entries, t, energyUnit) ??
            t('exerciseHistory.noSetData', { defaultValue: 'No set data' })}
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
  onOpenSession,
}) => {
  const { t } = useTranslation();
  const {
    sessions,
    isLoading,
    isLoadingMore,
    isError,
    refetch,
    loadMore,
    hasMore,
  } = useExerciseHistory({ exerciseId });
  // A bodyweight set's load is not its weight, so only plain lifts get a 1RM.
  const effort = useMemo(
    () =>
      buildExerciseEffortSummary(
        sessions,
        exerciseId,
        modality == null || modality === 'weight_reps'
      ),
    [sessions, exerciseId, modality]
  );

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
        <Text className="text-text-secondary text-sm">
          {t('exerciseHistory.loadError', {
            defaultValue: "Couldn't load history.",
          })}
        </Text>
        <Button variant="ghost" onPress={refetch}>
          {t('common.retry', { defaultValue: 'Retry' })}
        </Button>
      </View>
    );
  }

  if (sessions.length === 0) {
    return (
      <View className="bg-surface rounded-xl p-4 items-center">
        <Text className="text-text-secondary text-sm">
          {t('exerciseHistory.empty', {
            defaultValue: 'No sessions logged yet.',
          })}
        </Text>
      </View>
    );
  }

  return (
    <>
      <ExerciseEffortCard summary={effort} weightUnit={weightUnit} />
      {sessions.map((session) => (
        <SessionCard
          key={session.id}
          session={session}
          exerciseId={exerciseId}
          weightUnit={weightUnit}
          distanceUnit={distanceUnit}
          modality={modality}
          bestSet={bestSet}
          onOpenSession={onOpenSession}
        />
      ))}
      {hasMore ? (
        <Button variant="ghost" onPress={loadMore} disabled={isLoadingMore}>
          {isLoadingMore
            ? t('common.loading', { defaultValue: 'Loading...' })
            : t('common.loadMore', { defaultValue: 'Load more' })}
        </Button>
      ) : null}
    </>
  );
};

export default ExerciseHistoryList;
