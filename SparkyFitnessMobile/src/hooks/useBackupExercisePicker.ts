import { useCallback, useRef } from 'react';
import type { Exercise } from '../types/exercise';
import type { ExerciseProgressionPatch } from './draftExercisesSlice';

/**
 * Routes the next ExerciseSearch return to "set this slot's backup exercise"
 * instead of an add. Like the replace target, it is consumed on selection;
 * the screen clears it when plain Add or Replace opens the search.
 */
export function useBackupExercisePicker(
  setExerciseProgression: (
    clientId: string,
    patch: ExerciseProgressionPatch
  ) => void,
  onAddExercise: (exercise: Exercise) => void
) {
  const backupTargetRef = useRef<string | null>(null);
  const setBackupTarget = useCallback((clientId: string | null) => {
    backupTargetRef.current = clientId;
  }, []);
  const handleSelectedExercise = useCallback(
    (exercise: Exercise) => {
      const target = backupTargetRef.current;
      backupTargetRef.current = null;
      if (target == null) {
        onAddExercise(exercise);
        return;
      }
      setExerciseProgression(target, {
        backupExerciseId: exercise.id,
        backupExerciseName: exercise.name,
      });
    },
    [onAddExercise, setExerciseProgression]
  );
  return { setBackupTarget, handleSelectedExercise };
}
