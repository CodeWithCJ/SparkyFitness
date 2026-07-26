import { useMemo, useRef } from 'react';
import type { Dispatch, MutableRefObject } from 'react';
import {
  getDefaultRestSec,
  moveDraftExerciseItem,
  normalizeDraftSupersetGroups,
  supersetDraftExercises,
  ungroupDraftExercise,
} from '../utils/workoutSession';
import type { Exercise } from '../types/exercise';
import type {
  WorkoutDraftExercise,
  WorkoutDraftSet,
  WorkoutSetMetaPatch,
} from '../types/drafts';

/**
 * The exercise-array slice shared by the workout and preset form reducers.
 * Both forms edit the same `WorkoutDraftExercise[]` shape with the same
 * semantics; each form reducer handles its own actions (name, date,
 * populate, …) and delegates everything below to {@link draftExercisesReducer}.
 */

export function generateClientId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export type DraftExercisesAction =
  | { type: 'ADD_EXERCISE'; exercise: Exercise; exerciseClientId: string; setClientId: string }
  | { type: 'REMOVE_EXERCISE'; clientId: string }
  | { type: 'REPLACE_EXERCISE'; clientId: string; exercise: Exercise; setClientId: string }
  | { type: 'CLEAR_EXERCISE_COMPLETIONS'; clientId: string }
  | { type: 'ADD_SET'; exerciseClientId: string; setClientId: string }
  | { type: 'REMOVE_SET'; exerciseClientId: string; setClientId: string }
  | {
      type: 'UPDATE_SET_FIELD';
      exerciseClientId: string;
      setClientId: string;
      field: 'weight' | 'reps' | 'duration';
      value: string;
    }
  | { type: 'UPDATE_SET_META'; exerciseClientId: string; setClientId: string; patch: WorkoutSetMetaPatch }
  | { type: 'SET_EXERCISE_REST'; exerciseClientId: string; seconds: number }
  | { type: 'SET_EXERCISE_CALORIES'; exerciseClientId: string; calories: string }
  | { type: 'SET_EXERCISE_NOTES'; exerciseClientId: string; notes: string }
  | { type: 'SUPERSET_WITH'; currentClientId: string; pickedClientId: string }
  | { type: 'UNGROUP_EXERCISE'; clientId: string }
  | { type: 'REORDER_EXERCISES'; fromItemIndex: number; toItemIndex: number };

export function draftExercisesReducer(
  exercises: WorkoutDraftExercise[],
  action: DraftExercisesAction,
): WorkoutDraftExercise[] {
  switch (action.type) {
    case 'ADD_EXERCISE':
      return [
        ...exercises,
        {
          clientId: action.exerciseClientId,
          exerciseId: action.exercise.id,
          exerciseName: action.exercise.name,
          exerciseCategory: action.exercise.category,
          exerciseModality: action.exercise.modality ?? null,
          images: action.exercise.images ?? [],
          sets: [
            { clientId: action.setClientId, weight: '', reps: '', restTime: getDefaultRestSec() },
          ],
        },
      ];

    case 'REMOVE_EXERCISE':
      return normalizeDraftSupersetGroups(
        exercises.filter(e => e.clientId !== action.clientId),
      );

    // Mirrors the live store's replaceExercise: swap the exercise identity in
    // place (keeping clientId, position, and superset grouping) and reset to
    // one default set — the old sets no longer describe the new movement.
    // Dropping serverId sends the whole session down the server's
    // delete-and-recreate path (mixed old/new exercise ids aren't allowed).
    case 'REPLACE_EXERCISE':
      return exercises.map(exercise => {
        if (exercise.clientId !== action.clientId) return exercise;
        return {
          ...exercise,
          serverId: undefined,
          snapshot: null,
          exerciseId: action.exercise.id,
          exerciseName: action.exercise.name,
          exerciseCategory: action.exercise.category,
          exerciseModality: action.exercise.modality ?? null,
          images: action.exercise.images ?? [],
          sets: [
            { clientId: action.setClientId, weight: '', reps: '', restTime: getDefaultRestSec() },
          ],
        };
      });

    // Mirrors the live store's clearExerciseCompletions: un-log every set,
    // dropping the stale PR flags with the completions. Identity return when
    // nothing is logged.
    case 'CLEAR_EXERCISE_COMPLETIONS': {
      const target = exercises.find(e => e.clientId === action.clientId);
      if (target == null || !target.sets.some(s => s.completedAt != null)) return exercises;
      return exercises.map(exercise => {
        if (exercise.clientId !== action.clientId) return exercise;
        return {
          ...exercise,
          sets: exercise.sets.map(set =>
            set.completedAt != null ? { ...set, completedAt: null, isPr: false } : set,
          ),
        };
      });
    }

    case 'ADD_SET':
      return exercises.map(exercise => {
        if (exercise.clientId !== action.exerciseClientId) return exercise;
        const lastSet = exercise.sets[exercise.sets.length - 1];
        const firstSet = exercise.sets[0];
        const newSet: WorkoutDraftSet = {
          clientId: action.setClientId,
          weight: lastSet?.weight ?? '',
          reps: lastSet?.reps ?? '',
          duration: lastSet?.duration ?? null,
          restTime: firstSet?.restTime ?? getDefaultRestSec(),
        };
        return { ...exercise, sets: [...exercise.sets, newSet] };
      });

    case 'REMOVE_SET':
      return exercises.map(exercise => {
        if (exercise.clientId !== action.exerciseClientId) return exercise;
        return {
          ...exercise,
          sets: exercise.sets.filter(s => s.clientId !== action.setClientId),
        };
      });

    case 'UPDATE_SET_FIELD':
      return exercises.map(exercise => {
        if (exercise.clientId !== action.exerciseClientId) return exercise;
        return {
          ...exercise,
          sets: exercise.sets.map(set => {
            if (set.clientId !== action.setClientId) return set;
            // Drafts hold duration as `number | null` (not a display string),
            // so the seconds text parses here and the persisted draft shape
            // stays unchanged.
            if (action.field === 'duration') {
              const parsed = parseInt(action.value, 10);
              return { ...set, duration: Number.isNaN(parsed) ? null : parsed };
            }
            return { ...set, [action.field]: action.value };
          }),
        };
      });

    case 'UPDATE_SET_META':
      return exercises.map(exercise => {
        if (exercise.clientId !== action.exerciseClientId) return exercise;
        return {
          ...exercise,
          sets: exercise.sets.map(set =>
            set.clientId === action.setClientId ? { ...set, ...action.patch } : set,
          ),
        };
      });

    case 'SET_EXERCISE_REST':
      return exercises.map(exercise => {
        if (exercise.clientId !== action.exerciseClientId) return exercise;
        return {
          ...exercise,
          sets: exercise.sets.map(set => ({ ...set, restTime: action.seconds })),
        };
      });

    case 'SET_EXERCISE_CALORIES':
      return exercises.map(exercise => {
        if (exercise.clientId !== action.exerciseClientId) return exercise;
        return { ...exercise, calories: action.calories, caloriesManuallySet: true };
      });

    // Mirrors the live store's setExerciseNotes: trim, empty → null, identity
    // return when nothing changes.
    case 'SET_EXERCISE_NOTES': {
      const trimmed = action.notes.trim();
      const nextNotes = trimmed.length > 0 ? trimmed : null;
      const target = exercises.find(e => e.clientId === action.exerciseClientId);
      if (target == null || (target.notes ?? null) === nextNotes) return exercises;
      return exercises.map(exercise =>
        exercise.clientId === action.exerciseClientId
          ? { ...exercise, notes: nextNotes }
          : exercise,
      );
    }

    case 'SUPERSET_WITH':
      return supersetDraftExercises(exercises, action.currentClientId, action.pickedClientId);

    case 'UNGROUP_EXERCISE':
      return ungroupDraftExercise(exercises, action.clientId);

    // Runs move atomically and the mover pre-clears stale group values, so no
    // remainders can form — normalizeDraftSupersetGroups is unnecessary here.
    case 'REORDER_EXERCISES':
      return moveDraftExerciseItem(exercises, action.fromItemIndex, action.toItemIndex);

    default:
      return exercises;
  }
}

/**
 * The matching dispatch wrappers, memoized once. Every wrapper flips
 * `exercisesModifiedRef` so the owning form's save knows to include the
 * exercises payload (reorder-only edits included — the preset save silently
 * goBack()s on an empty payload otherwise).
 */
export function useDraftExerciseActions(
  dispatch: Dispatch<DraftExercisesAction>,
): {
  exercisesModifiedRef: MutableRefObject<boolean>;
  addExercise: (exercise: Exercise) => { exerciseClientId: string; setClientId: string };
  removeExercise: (clientId: string) => void;
  replaceExercise: (
    clientId: string,
    exercise: Exercise,
  ) => { exerciseClientId: string; setClientId: string };
  clearExerciseCompletions: (clientId: string) => void;
  addSet: (exerciseClientId: string) => string;
  removeSet: (exerciseClientId: string, setClientId: string) => void;
  updateSetField: (
    exerciseClientId: string,
    setClientId: string,
    field: 'weight' | 'reps' | 'duration',
    value: string,
  ) => void;
  updateSetMeta: (
    exerciseClientId: string,
    setClientId: string,
    patch: WorkoutSetMetaPatch,
  ) => void;
  setExerciseRest: (exerciseClientId: string, seconds: number) => void;
  setExerciseCalories: (exerciseClientId: string, calories: string) => void;
  setExerciseNotes: (exerciseClientId: string, notes: string) => void;
  supersetWith: (currentClientId: string, pickedClientId: string) => void;
  ungroupExercise: (clientId: string) => void;
  reorderExercises: (fromItemIndex: number, toItemIndex: number) => void;
} {
  const exercisesModifiedRef = useRef(false);
  return useMemo(
    () => ({
      exercisesModifiedRef,
      addExercise: (exercise: Exercise) => {
        exercisesModifiedRef.current = true;
        const exerciseClientId = generateClientId();
        const setClientId = generateClientId();
        dispatch({ type: 'ADD_EXERCISE', exercise, exerciseClientId, setClientId });
        return { exerciseClientId, setClientId };
      },
      removeExercise: (clientId: string) => {
        exercisesModifiedRef.current = true;
        dispatch({ type: 'REMOVE_EXERCISE', clientId });
      },
      replaceExercise: (clientId: string, exercise: Exercise) => {
        exercisesModifiedRef.current = true;
        const setClientId = generateClientId();
        dispatch({ type: 'REPLACE_EXERCISE', clientId, exercise, setClientId });
        return { exerciseClientId: clientId, setClientId };
      },
      clearExerciseCompletions: (clientId: string) => {
        exercisesModifiedRef.current = true;
        dispatch({ type: 'CLEAR_EXERCISE_COMPLETIONS', clientId });
      },
      addSet: (exerciseClientId: string) => {
        exercisesModifiedRef.current = true;
        const setClientId = generateClientId();
        dispatch({ type: 'ADD_SET', exerciseClientId, setClientId });
        return setClientId;
      },
      removeSet: (exerciseClientId: string, setClientId: string) => {
        exercisesModifiedRef.current = true;
        dispatch({ type: 'REMOVE_SET', exerciseClientId, setClientId });
      },
      updateSetField: (
        exerciseClientId: string,
        setClientId: string,
        field: 'weight' | 'reps' | 'duration',
        value: string,
      ) => {
        exercisesModifiedRef.current = true;
        dispatch({ type: 'UPDATE_SET_FIELD', exerciseClientId, setClientId, field, value });
      },
      updateSetMeta: (
        exerciseClientId: string,
        setClientId: string,
        patch: WorkoutSetMetaPatch,
      ) => {
        exercisesModifiedRef.current = true;
        dispatch({ type: 'UPDATE_SET_META', exerciseClientId, setClientId, patch });
      },
      setExerciseRest: (exerciseClientId: string, seconds: number) => {
        exercisesModifiedRef.current = true;
        dispatch({ type: 'SET_EXERCISE_REST', exerciseClientId, seconds });
      },
      setExerciseCalories: (exerciseClientId: string, calories: string) => {
        exercisesModifiedRef.current = true;
        dispatch({ type: 'SET_EXERCISE_CALORIES', exerciseClientId, calories });
      },
      setExerciseNotes: (exerciseClientId: string, notes: string) => {
        exercisesModifiedRef.current = true;
        dispatch({ type: 'SET_EXERCISE_NOTES', exerciseClientId, notes });
      },
      supersetWith: (currentClientId: string, pickedClientId: string) => {
        exercisesModifiedRef.current = true;
        dispatch({ type: 'SUPERSET_WITH', currentClientId, pickedClientId });
      },
      ungroupExercise: (clientId: string) => {
        exercisesModifiedRef.current = true;
        dispatch({ type: 'UNGROUP_EXERCISE', clientId });
      },
      reorderExercises: (fromItemIndex: number, toItemIndex: number) => {
        exercisesModifiedRef.current = true;
        dispatch({ type: 'REORDER_EXERCISES', fromItemIndex, toItemIndex });
      },
    }),
    [dispatch],
  );
}
