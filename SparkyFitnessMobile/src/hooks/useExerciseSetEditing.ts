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
  }, [actions]);

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
    [actions],
  );

  const handleAddSet = useCallback((exerciseClientId: string) => {
    const newSetId = actions.addSet(exerciseClientId);
    if (newSetId) {
      setActiveSetKey(`${exerciseClientId}:${newSetId}`);
    }
  }, [actions]);

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
