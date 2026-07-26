import { useState, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import type { SetInputField } from '../components/SetRowChrome';
import type { Exercise } from '../types/exercise';

interface ExerciseSetEditingActions {
  addExercise: (exercise: Exercise) => { exerciseClientId: string; setClientId: string };
  removeExercise: (clientId: string) => void;
  addSet: (exerciseClientId: string) => string;
  /** Enables replace routing: while a replace target is set, the next selected
   *  exercise swaps in place instead of appending. */
  replaceExercise?: (
    clientId: string,
    exercise: Exercise,
  ) => { exerciseClientId: string; setClientId: string };
}

export function useExerciseSetEditing(actions: ExerciseSetEditingActions) {
  const [activeSetKey, setActiveSetKey] = useState<string | null>(null);
  // 'rpe' is only reachable on the card-based workout/preset forms (tapping the
  // RPE column). The activity forms only ever set 'weight' | 'reps' | 'duration'.
  const [activeSetField, setActiveSetField] = useState<SetInputField>('weight');

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
    setActiveSetKey(`${exerciseClientId}:${setClientId}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- using stable sub-properties; spreading `actions` would break memoization
  }, [actions.addExercise, actions.replaceExercise]);

  const handleRemoveExercise = useCallback(
    (exercise: { clientId: string; exerciseName: string; sets: { weight: string; reps: string }[] }) => {
      const hasData = exercise.sets.some(s => s.weight || s.reps);
      const doRemove = () => actions.removeExercise(exercise.clientId);
      if (hasData) {
        Alert.alert(
          'Remove Exercise?',
          `Remove "${exercise.exerciseName}" and all its sets?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: doRemove },
          ],
        );
      } else {
        doRemove();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- using stable sub-property
    [actions.removeExercise],
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
