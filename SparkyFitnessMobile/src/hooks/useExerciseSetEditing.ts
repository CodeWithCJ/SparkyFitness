import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SetInputField } from '../components/SetRowChrome';
import type { Exercise } from '../types/exercise';

interface ExerciseSetEditingActions {
  addExercise: (exercise: Exercise) => { exerciseClientId: string; setClientId: string };
  removeExercise: (clientId: string) => void;
  addSet: (exerciseClientId: string) => string;
  /** Enables replace routing: while a replace target is set, the next selected
   *  exercise swaps in place instead of appending. A null setClientId means
   *  the replace preserved the existing sets, so there's nothing new to focus. */
  replaceExercise?: (
    clientId: string,
    exercise: Exercise,
  ) => { exerciseClientId: string; setClientId: string | null };
}

export function useExerciseSetEditing(actions: ExerciseSetEditingActions) {
  const { t } = useTranslation();
  const [activeSetKey, setActiveSetKey] = useState<string | null>(null);
  // 'rpe' is only reachable on the card-based workout/preset forms (tapping the
  // RPE column). The activity forms only ever set 'weight' | 'reps' | 'duration'.
  const [activeSetField, setActiveSetField] = useState<SetInputField>('weight');

  // An ExerciseSearch selection lands (via setParams) while the search modal is
  // still dismissing over this screen, so activating the new set immediately
  // focuses its weight input mid-transition. On iOS that makes the input first
  // responder without presenting a keyboard — the cell keeps its focused chrome
  // with nothing to dismiss, so nothing ever clears it. Hold the activation
  // until this screen's reveal transition ends and focus lands frontmost.
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const pendingActivationRef = useRef<string | null>(null);
  useEffect(() => {
    return navigation.addListener('transitionEnd', (e) => {
      if (e.data.closing || pendingActivationRef.current == null) return;
      setActiveSetKey(pendingActivationRef.current);
      pendingActivationRef.current = null;
    });
  }, [navigation]);

  // Routes the next ExerciseSearch return to a Replace (holding the target's
  // clientId) instead of an Add. Consumed on selection; the owning screen must
  // clear it when plain Add opens the search, so a cancelled replace can't
  // misroute a later add.
  const replaceTargetClientIdRef = useRef<string | null>(null);
  const setReplaceTarget = useCallback((clientId: string | null) => {
    replaceTargetClientIdRef.current = clientId;
  }, []);

  const handleAddExercise = useCallback((exercise: Exercise) => {
    const replaceTarget = replaceTargetClientIdRef.current;
    replaceTargetClientIdRef.current = null;
    const { exerciseClientId, setClientId } =
      replaceTarget != null && actions.replaceExercise
        ? actions.replaceExercise(replaceTarget, exercise)
        : actions.addExercise(exercise);
    // null means a replace preserved the existing sets — nothing new to
    // focus. Clear (not just skip) so a stale pending activation from an
    // earlier action can't fire on a later transitionEnd.
    pendingActivationRef.current =
      setClientId != null ? `${exerciseClientId}:${setClientId}` : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- using stable sub-properties; spreading `actions` would break memoization
  }, [actions.addExercise, actions.replaceExercise]);

  const handleRemoveExercise = useCallback(
    (exercise: { clientId: string; exerciseName: string; sets: { weight: string; reps: string }[] }) => {
      const hasData = exercise.sets.some(s => s.weight || s.reps);
      const doRemove = () => actions.removeExercise(exercise.clientId);
      if (hasData) {
        Alert.alert(
          t('exerciseEditing.removeTitle', { defaultValue: 'Remove Exercise?' }),
          t('exerciseEditing.removeMessage', { defaultValue: 'Remove "{{name}}" and all its sets?', name: exercise.exerciseName }),
          [
            { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
            { text: t('common.remove', { defaultValue: 'Remove' }), style: 'destructive', onPress: doRemove },
          ],
        );
      } else {
        doRemove();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- using stable sub-property
    [actions.removeExercise, t],
  );

  const handleAddSet = useCallback((exerciseClientId: string) => {
    const newSetId = actions.addSet(exerciseClientId);
    if (newSetId) {
      setActiveSetKey(`${exerciseClientId}:${newSetId}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- using stable sub-property
  }, [actions.addSet]);

  const activateSet = useCallback((setKey: string, field: SetInputField) => {
    setActiveSetField(field);
    setActiveSetKey(setKey);
  }, []);

  const deactivateSet = useCallback(() => {
    setActiveSetKey(null);
  }, []);

  return {
    activeSetKey,
    activeSetField,
    handleAddExercise,
    handleRemoveExercise,
    handleAddSet,
    activateSet,
    deactivateSet,
    setReplaceTarget,
  };
}
