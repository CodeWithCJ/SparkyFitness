import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCSSVariable } from 'uniwind';

import Icon, { type IconName } from '../components/Icon';
import Button from '../components/ui/Button';
import WorkoutCompleteHero from '../components/WorkoutCompleteHero';
import WorkoutCompleteWodCard from '../components/WorkoutCompleteWodCard';
import WorkoutCompleteStatTiles from '../components/WorkoutCompleteStatTiles';
import WorkoutCompletePrCard from '../components/WorkoutCompletePrCard';
import WorkoutCompleteExerciseList from '../components/WorkoutCompleteExerciseList';
import WorkoutFeedbackCard from '../components/WorkoutFeedbackCard';
import FocusWorkoutSummary from '../components/FocusWorkoutSummary';
import { invalidateExerciseCache } from '../hooks/invalidateExerciseCache';
import { workoutSessionQueryKey } from '../hooks/queryKeys';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { useNavigationActionGuard } from '../hooks/useNavigationActionGuard';
import { usePreferences } from '../hooks/usePreferences';
import {
  useWorkoutCompletePresetSync,
  type PresetUpdateOffer,
} from '../hooks/useWorkoutCompletePresetSync';
import {
  getWorkout,
  setExerciseEntryEffort,
} from '../services/api/exerciseApi';
import { fireSuccessHaptic } from '../services/haptics';
import { getActiveServerConfig } from '../services/storage';
import { formatDateToTimeLabel } from '../utils/entryTimeDisplay';
import { setsDurationMinutes } from '@workspace/shared';
import {
  buildSessionDurationMinutes,
  buildWorkoutCompletionSummary,
  getSessionCalories,
  isCardioModality,
  normalizeWeightUnit,
  resolveSnapshotModality,
  summarizeWorkoutSpan,
  summarizeWorkoutHeartRate,
  hasBodyweightExercise,
  summarizeWorkoutEffort,
} from '../utils/workoutSession';
import { useBodyWeightKg } from '../hooks/useBodyWeightKg';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'WorkoutComplete'>;

function DockedActionButton({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  const textMuted = String(useCSSVariable('--color-text-muted'));
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-1 flex-row items-center justify-center gap-1.5 bg-raised rounded-xl py-3"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <Icon name={icon} size={16} color={textMuted} />
      <Text className="text-sm font-semibold text-text-primary">{label}</Text>
    </Pressable>
  );
}

function WorkoutCompleteScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const {
    session,
    completedSetIds,
    prSetIds,
    startedAt,
    finishedAt,
    sourcePresetId,
    sourceServerConfigId,
    presetCheckHandledElsewhere,
    plannedSetValues,
    previousSessionSets,
    exerciseConfigs,
    weightUnit: sessionWeightUnit,
    workoutFormat,
    timeCapSeconds,
    intervalRoundsCompleted,
    intervalRepsCompleted,
    intervalStatus,
    intervalScalingNotes,
    focusStyle = false,
  } = route.params;

  const { preferences } = usePreferences();
  const weightUnit = normalizeWeightUnit(preferences?.default_weight_unit);
  const distanceUnit =
    (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';
  const { getImageSource } = useExerciseImageSource();
  const { runNavigationAction } = useNavigationActionGuard(navigation);

  const bodyWeightKg = useBodyWeightKg(
    session.entry_date,
    hasBodyweightExercise(session.exercises)
  );
  const summary = useMemo(
    () =>
      buildWorkoutCompletionSummary(
        session,
        completedSetIds,
        prSetIds,
        t,
        bodyWeightKg
      ),
    [session, completedSetIds, prSetIds, t, bodyWeightKg]
  );
  const hasRecords = summary.prRows.length > 0;

  const durationMinutes = useMemo(() => {
    const split = buildSessionDurationMinutes(
      session,
      completedSetIds,
      startedAt
    );
    if (split != null) {
      const derived = session.exercises.reduce(
        (sum, e) =>
          sum +
          (isCardioModality(resolveSnapshotModality(e.exercise_snapshot))
            ? setsDurationMinutes(e.sets)
            : (split.get(e.id) ?? 0)),
        0
      );
      if (derived > 0) return derived;
    }
    const stamped = session.exercises.reduce(
      (sum, e) => sum + (e.duration_minutes ?? 0),
      0
    );
    if (stamped > 0) return stamped;
    return summarizeWorkoutSpan(completedSetIds, startedAt)?.totalMinutes ?? 0;
  }, [session, completedSetIds, startedAt]);

  const { data: refreshedSession, isError: caloriesFailed } = useQuery({
    queryKey: workoutSessionQueryKey(session.id),
    queryFn: () => getWorkout(session.id),
  });
  // Heart rate comes from the same refetch as calories, and for the same
  // reason: it is not in the snapshot this screen opens with. It arrives later
  // still — the watch posts telemetry after the workout is saved — so the
  // flush invalidates every `workoutSession` query and this re-renders when it
  // lands. A workout with no watch behind it simply has no tiles here.
  const heartRate = useMemo(
    () => summarizeWorkoutHeartRate((refreshedSession ?? session).exercises),
    [refreshedSession, session]
  );
  const snapshotCalories = getSessionCalories(session);
  const caloriesValue =
    refreshedSession != null
      ? getSessionCalories(refreshedSession)
      : snapshotCalories > 0
        ? snapshotCalories
        : null;

  useEffect(() => {
    if (hasRecords) fireSuccessHaptic();
  }, [hasRecords]);

  // Stable identity: the prompt's memo and timer effect key off it.
  const assumeSources = useMemo(
    () =>
      previousSessionSets != null && exerciseConfigs != null
        ? {
            previousSessionSets,
            exerciseConfigs,
            weightUnit: sessionWeightUnit,
            workoutFormat,
          }
        : undefined,
    [previousSessionSets, exerciseConfigs, sessionWeightUnit, workoutFormat]
  );
  // The focus summary asks "Update preset?" in a card instead of an alert: the
  // same check (structure only, owner only) with its prompt held back.
  const [presetOffer, setPresetOffer] = useState<PresetUpdateOffer | null>(
    null
  );
  const [updatingPreset, setUpdatingPreset] = useState(false);
  useWorkoutCompletePresetSync({
    session,
    sourcePresetId: presetCheckHandledElsewhere ? null : sourcePresetId,
    sourceServerConfigId,
    completedSetIds,
    plannedSetValues,
    assumeSources,
    skipPrompt: focusStyle,
    onNeedsUpdate: focusStyle
      ? (offer) => {
          // No card without a change to list.
          if (offer.describeChanges(t).length > 0) setPresetOffer(offer);
        }
      : undefined,
  });
  const handleUpdatePreset = useCallback(async () => {
    if (presetOffer == null) return;
    setUpdatingPreset(true);
    const ok = await presetOffer.update();
    setUpdatingPreset(false);
    if (ok) setPresetOffer(null);
  }, [presetOffer]);
  const handleKeepPreset = useCallback(() => setPresetOffer(null), []);

  // How hard the person rated the workout (1-10): the saved rating, else what
  // they tap here. One rating speaks for the whole session on the server.
  const queryClient = useQueryClient();
  const [pickedEffort, setPickedEffort] = useState<number | null>(null);
  const effortWriteRef = useRef<{ latest: number; chain: Promise<unknown> }>({
    latest: 0,
    chain: Promise.resolve(),
  });
  const savedEffort = summarizeWorkoutEffort(
    (refreshedSession ?? session).exercises
  );
  const effort = pickedEffort ?? savedEffort;
  const handleRateEffort = useCallback(
    (rating: number) => {
      const entryId = session.exercises[0]?.id;
      if (entryId == null) return;
      setPickedEffort(rating);
      // One write at a time, in tap order, so the last tap is the one stored;
      // a failed older write does not clear a newer pick.
      const write = ++effortWriteRef.current.latest;
      // Read at the tap: a queued write starts later, and must still go to the
      // server this entry is on.
      const serverConfig = getActiveServerConfig();
      effortWriteRef.current.chain = effortWriteRef.current.chain
        .then(async () =>
          setExerciseEntryEffort(
            entryId,
            rating,
            (await serverConfig) ?? undefined
          )
        )
        .then(() => {
          if (session.entry_date != null) {
            invalidateExerciseCache(queryClient, session.entry_date);
          }
          return queryClient.invalidateQueries({
            queryKey: workoutSessionQueryKey(session.id),
          });
        })
        .catch(() => {
          if (effortWriteRef.current.latest === write) setPickedEffort(null);
        });
    },
    [session.exercises, session.id, session.entry_date, queryClient]
  );

  const finishedTimeText = formatDateToTimeLabel(
    new Date(finishedAt),
    preferences?.time_format
  );

  const sessionForDetail = refreshedSession ?? session;
  const handleViewWorkout = () => {
    runNavigationAction(() => {
      navigation.navigate('WorkoutDetail', { session: sessionForDetail });
    });
  };
  const handleSaveAsPreset = () => {
    runNavigationAction(() => {
      navigation.navigate('WorkoutPresetForm', {
        mode: 'create-preset',
        sourceSession: sessionForDetail,
      });
    });
  };
  const handleDone = () => {
    navigation.navigate('Tabs', { screen: 'Diary' });
  };

  const allSetsLogged = summary.completedSetCount === summary.totalSetCount;

  const feedbackExercises = useMemo(
    () =>
      session.exercises.map((exercise) => ({
        id: exercise.id,
        name: exercise.exercise_snapshot?.name ?? '',
      })),
    [session.exercises]
  );

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {focusStyle ? (
          <View className="px-4 pt-3">
            <FocusWorkoutSummary
              sessionName={session.name}
              completedSetCount={summary.completedSetCount}
              totalSetCount={summary.totalSetCount}
              durationMinutes={durationMinutes}
              volumeKg={summary.volumeKg}
              weightUnit={weightUnit}
              caloriesKcal={caloriesValue}
              heartRate={heartRate}
              effort={effort}
              onRateEffort={handleRateEffort}
              presetOffer={
                presetOffer != null
                  ? {
                      changes: presetOffer.describeChanges(t),
                      onUpdate: () => void handleUpdatePreset(),
                      onKeep: handleKeepPreset,
                      updating: updatingPreset,
                    }
                  : null
              }
            />
          </View>
        ) : (
          <WorkoutCompleteHero
            sessionName={session.name}
            hasRecords={hasRecords}
            allSetsLogged={allSetsLogged}
            totalSetCount={summary.totalSetCount}
            completedSetCount={summary.completedSetCount}
            finishedTimeText={finishedTimeText}
          />
        )}

        <View className="px-4">
          {workoutFormat && workoutFormat !== 'standard' && (
            <WorkoutCompleteWodCard
              workoutFormat={workoutFormat}
              intervalStatus={intervalStatus}
              intervalRoundsCompleted={intervalRoundsCompleted}
              intervalRepsCompleted={intervalRepsCompleted}
              intervalScalingNotes={intervalScalingNotes}
              timeCapSeconds={timeCapSeconds}
              durationMinutes={durationMinutes}
              completedSetCount={summary.completedSetCount}
            />
          )}

          {!focusStyle && (
            <WorkoutCompleteStatTiles
              durationMinutes={durationMinutes}
              volumeKg={summary.volumeKg}
              completedSetCount={summary.completedSetCount}
              totalSetCount={summary.totalSetCount}
              skippedSetCount={summary.skippedSetCount}
              caloriesValue={caloriesValue}
              caloriesFailed={caloriesFailed}
              heartRate={heartRate}
              totalDistanceKm={summary.totalDistanceKm}
              averageRpe={summary.averageRpe}
              weightUnit={weightUnit}
              distanceUnit={distanceUnit}
            />
          )}

          <WorkoutCompletePrCard
            prRows={summary.prRows}
            weightUnit={weightUnit}
          />

          <WorkoutFeedbackCard
            presetEntryId={session.id}
            exercises={feedbackExercises}
            effort={effort}
          />
        </View>

        <WorkoutCompleteExerciseList
          session={session}
          exercises={summary.exercises}
          weightUnit={weightUnit}
          getImageSource={getImageSource}
        />
      </ScrollView>

      <View
        className="bg-surface border-t border-border-subtle px-4 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <View className="flex-row gap-2 mb-2">
          <DockedActionButton
            icon="bookmark"
            label={t('workoutComplete.actions.saveAsPreset', {
              defaultValue: 'Save as Preset',
            })}
            onPress={handleSaveAsPreset}
          />
          <DockedActionButton
            icon="list"
            label={t('workoutComplete.actions.viewWorkout', {
              defaultValue: 'View Workout',
            })}
            onPress={handleViewWorkout}
          />
        </View>
        {focusStyle ? (
          <Pressable
            testID="focus-summary-done"
            onPress={handleDone}
            accessibilityRole="button"
            className="h-14 items-center justify-center rounded-full bg-text-primary active:opacity-80"
          >
            <Text className="text-[18px] font-bold text-background">
              {t('workoutComplete.actions.done', { defaultValue: 'Done' })}
            </Text>
          </Pressable>
        ) : (
          <Button variant="primary" onPress={handleDone}>
            {t('workoutComplete.actions.done', { defaultValue: 'Done' })}
          </Button>
        )}
      </View>
    </View>
  );
}

export default WorkoutCompleteScreen;
