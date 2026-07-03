import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import type { Exercise } from '../types/exercise';

interface ExerciseSetEditingActions {
  addExercise: (exercise: Exercise) => { exerciseClientId: string; setClientId: string };
  removeExercise: (clientId: string) => void;
  addSet: (exerciseClientId: string) => string;
}

export function useExerciseSetEditing(actions: ExerciseSetEditingActions) {
  const [activeSetKey, setActiveSetKey] = useState<string | null>(null);
  const [activeSetField, setActiveSetField] = useState<'weight' | 'reps'>('weight');

  const handleAddExercise = useCallback((exercise: Exercise) => {
    const { exerciseClientId, setClientId } = actions.addExercise(exercise);
    setActiveSetKey(`${exerciseClientId}:${setClientId}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- using stable sub-property; spreading `actions` would break memoization
  }, [actions.addExercise]);

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

  const activateSet = useCallback((setKey: string, field: 'weight' | 'reps') => {
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
  };
}
