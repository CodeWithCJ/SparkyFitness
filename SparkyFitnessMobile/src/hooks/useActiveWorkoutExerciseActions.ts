import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useSelectedExercise } from './useSelectedExercise';
import type {
  ExerciseSetRestSheetRef,
  ExerciseSetRestUpdate,
} from '../components/ExerciseSetRestSheet';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import { exerciseFromSnapshot, getSupersetRuns } from '../utils/workoutSession';
import type { RootStackParamList } from '../types/navigation';
import { buildExerciseReplaceContext } from '../utils/exerciseReplace';
import { fetchExerciseById } from '../services/api/exerciseApi';
import { addLog } from '../services/LogService';

interface UseActiveWorkoutExerciseActionsArgs {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ActiveWorkout'>;
  route: RouteProp<RootStackParamList, 'ActiveWorkout'>;
  runNavigationAction: (action: () => void) => void;
  setRestSheetRef: React.RefObject<ExerciseSetRestSheetRef | null>;
  setUserExpandedIds: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>;
  setFocusedExerciseId: React.Dispatch<React.SetStateAction<string | null>>;
  scrollToExercise: (entryId: string) => void;
}

export function useActiveWorkoutExerciseActions({
  navigation,
  route,
  runNavigationAction,
  setRestSheetRef,
  setUserExpandedIds,
  setFocusedExerciseId,
  scrollToExercise,
}: UseActiveWorkoutExerciseActionsArgs) {
  const { t } = useTranslation();

  // Distinguishes an ExerciseSearch return bound for Replace (an entry id) from
  // one bound for Add (null). Cleared on consume and whenever Add is opened, so
  // a cancelled replace can't misroute a later add.
  const replaceTargetEntryIdRef = useRef<string | null>(null);

  // ExerciseSearch return. Replace swaps the exercise in place; Add appends to
  // the end without moving the cursor, so expand the new card and scroll it
  // into view (deferred so the card has a measured offset before scrolling).
  useSelectedExercise(route.params, (exercise) => {
    const replaceTarget = replaceTargetEntryIdRef.current;
    if (replaceTarget != null) {
      replaceTargetEntryIdRef.current = null;
      useActiveWorkoutStore.getState().replaceExercise(replaceTarget, exercise);
      setFocusedExerciseId(replaceTarget);
      return;
    }
    useActiveWorkoutStore.getState().addExercise(exercise);
    const exercises = useActiveWorkoutStore.getState().session?.exercises ?? [];
    const added = exercises[exercises.length - 1];
    if (added != null) {
      const id = added.id;
      setUserExpandedIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      setFocusedExerciseId(id);
      setTimeout(() => scrollToExercise(id), 350);
    }
  });

  const handleAddExercise = useCallback(() => {
    replaceTargetEntryIdRef.current = null;
    runNavigationAction(() => {
      navigation.navigate('ExerciseSearch', { returnKey: route.key });
    });
  }, [navigation, route.key, runNavigationAction]);

  const handleReplaceExercise = useCallback(
    (entryId: string) => {
      replaceTargetEntryIdRef.current = entryId;
      const entries = (
        useActiveWorkoutStore.getState().session?.exercises ?? []
      ).map((e) => ({
        id: e.id,
        exerciseId: e.exercise_id,
        exerciseName: e.exercise_snapshot?.name ?? '',
      }));
      const replaceFor = buildExerciseReplaceContext(
        entries.find((e) => e.id === entryId),
        entries
      );
      runNavigationAction(() => {
        navigation.navigate('ExerciseSearch', {
          returnKey: route.key,
          replaceFor,
        });
      });
    },
    [navigation, route.key, runNavigationAction]
  );

  const handleRemoveExercise = useCallback(
    (entryId: string) => {
      const exercise = useActiveWorkoutStore
        .getState()
        .session?.exercises.find((e) => e.id === entryId);
      const name =
        exercise?.exercise_snapshot?.name ??
        t('workout.thisExercise', { defaultValue: 'this exercise' });
      Alert.alert(
        t('workout.removeExerciseTitle', { defaultValue: 'Remove exercise?' }),
        t('workout.removeExerciseMessage', {
          defaultValue: '{{name}} will be removed from this workout.',
          name,
        }),
        [
          {
            text: t('common.cancel', { defaultValue: 'Cancel' }),
            style: 'cancel',
          },
          {
            text: t('common.remove', { defaultValue: 'Remove' }),
            style: 'destructive',
            onPress: () =>
              useActiveWorkoutStore.getState().removeExercise(entryId),
          },
        ]
      );
    },
    [t]
  );

  const handleClearExerciseSets = useCallback((entryId: string) => {
    useActiveWorkoutStore.getState().clearExerciseCompletions(entryId);
  }, []);

  const handleClearAllSets = useCallback(() => {
    Alert.alert(
      t('workout.clearAllSetsTitle', {
        defaultValue: 'Clear all logged sets?',
      }),
      t('workout.clearAllSetsMessage', {
        defaultValue:
          'Un-checks every logged set in this workout. Your set weights and reps are kept.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('common.clear', { defaultValue: 'Clear' }),
          style: 'destructive',
          onPress: () => useActiveWorkoutStore.getState().clearAllCompletions(),
        },
      ]
    );
  }, [t]);

  // Tap an exercise thumbnail -> its library detail. Maps the session's full
  // snapshot to an Exercise so the detail screen gets muscles/equipment/etc.
  const handlePressThumb = useCallback(
    (entryId: string) => {
      const entry = useActiveWorkoutStore
        .getState()
        .session?.exercises.find((e) => e.id === entryId);
      if (entry == null) return;
      const exercise = exerciseFromSnapshot(
        entry.exercise_snapshot,
        entry.exercise_id,
        t
      );
      runNavigationAction(() => {
        navigation.navigate('ExerciseDetail', {
          item: exercise,
          hideWorkoutActions: true,
        });
      });
    },
    [navigation, runNavigationAction, t]
  );

  // Exercise rest drawer (All / per-set rest editing, committed on Done).
  const handlePressRestChip = useCallback(
    (entryId: string, _currentSec: number | null) => {
      const store = useActiveWorkoutStore.getState();
      const exercise = store.session?.exercises.find((e) => e.id === entryId);
      if (!exercise || !store.session) return;

      // Check if this exercise is part of a superset
      const run = getSupersetRuns(store.session.exercises).find((r) =>
        r.entryIds.includes(entryId)
      );
      const isSupersetMember = run != null;

      setRestSheetRef.current?.present(
        exercise.exercise_snapshot?.name ??
          t('workout.exercise', { defaultValue: 'Exercise' }),
        exercise.sets.map((set) => ({
          setId: String(set.id),
          setNumber: set.set_number,
          restSec: set.rest_time,
        })),
        isSupersetMember
      );
    },
    [setRestSheetRef, t]
  );

  const handleApplySetRests = useCallback(
    (updates: ExerciseSetRestUpdate[]) => {
      const store = useActiveWorkoutStore.getState();
      if (!store.session) return;

      // Find which exercise these updates belong to by matching the first set ID
      const firstUpdate = updates[0];
      if (!firstUpdate) return;
      const exercise = store.session.exercises.find((e) =>
        e.sets.some((s) => String(s.id) === firstUpdate.setId)
      );
      if (!exercise) return;

      // Check if this is a superset member
      const run = getSupersetRuns(store.session.exercises).find((r) =>
        r.entryIds.includes(exercise.id)
      );

      if (run) {
        // Superset rest is per-round and shared across members: applies each
        // changed round (matched by set_number) to every member's matching
        // set, so editing one round doesn't overwrite the others.
        const memberExercises = store.session.exercises.filter((e) =>
          run.entryIds.includes(e.id)
        );
        for (const update of updates) {
          const changedSet = exercise.sets.find(
            (s) => String(s.id) === update.setId
          );
          if (!changedSet) continue;
          for (const member of memberExercises) {
            const roundSet = member.sets.find(
              (s) => s.set_number === changedSet.set_number
            );
            if (roundSet)
              store.updateSetField(String(roundSet.id), {
                rest_time: update.seconds,
              });
          }
        }
      } else {
        // Solo exercise: update individual sets
        for (const update of updates) {
          store.updateSetField(update.setId, { rest_time: update.seconds });
        }
      }
    },
    []
  );

  // "Taken? Use …": swap in the preset slot's backup exercise. Same-modality
  // sets (weight, reps) carry over, as with any replace.
  const handleUseBackupExercise = useCallback(
    async (entryId: string, backupExerciseId: string) => {
      try {
        const exercise = await fetchExerciseById(backupExerciseId);
        useActiveWorkoutStore.getState().replaceExercise(entryId, exercise);
        setFocusedExerciseId(entryId);
      } catch (error) {
        addLog('Failed to load backup exercise', 'ERROR', [String(error)]);
        Toast.show({
          type: 'error',
          text1: t('workout.backupFailed', {
            defaultValue: 'Could not load the backup exercise',
          }),
        });
      }
    },
    [setFocusedExerciseId, t]
  );

  return {
    handleAddExercise,
    handleReplaceExercise,
    handleUseBackupExercise,
    handleRemoveExercise,
    handleClearExerciseSets,
    handleClearAllSets,
    handlePressThumb,
    handlePressRestChip,
    handleApplySetRests,
  };
}
