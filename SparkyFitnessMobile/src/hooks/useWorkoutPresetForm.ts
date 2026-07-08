import { useCallback, useReducer, useRef } from 'react';
import { weightFromKg } from '../utils/unitConversions';
import type { Exercise } from '../types/exercise';
import type {
  WorkoutDraftExercise,
  WorkoutDraftSet,
  WorkoutSetMetaPatch,
} from '../types/drafts';
import type { WorkoutPreset } from '../types/workoutPresets';
import {
  DEFAULT_REST_SEC,
  moveDraftExerciseItem,
  normalizeDraftSupersetGroups,
  supersetDraftExercises,
  ungroupDraftExercise,
} from '../utils/workoutSession';

function generateClientId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export interface PresetDraft {
  name: string;
  description: string;
  exercises: WorkoutDraftExercise[];
}

function createEmptyDraft(): PresetDraft {
  return {
    name: '',
    description: '',
    exercises: [],
  };
}

export type PresetClientIds = { exerciseClientId: string; setClientIds: string[] }[];

type PresetFormAction =
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_DESCRIPTION'; description: string }
  | { type: 'ADD_EXERCISE'; exercise: Exercise; exerciseClientId: string; setClientId: string }
  | { type: 'REMOVE_EXERCISE'; clientId: string }
  | { type: 'ADD_SET'; exerciseClientId: string; setClientId: string }
  | { type: 'REMOVE_SET'; exerciseClientId: string; setClientId: string }
  | {
      type: 'UPDATE_SET_FIELD';
      exerciseClientId: string;
      setClientId: string;
      field: 'weight' | 'reps';
      value: string;
    }
  | { type: 'UPDATE_SET_META'; exerciseClientId: string; setClientId: string; patch: WorkoutSetMetaPatch }
  | { type: 'SET_EXERCISE_REST'; exerciseClientId: string; seconds: number }
  | { type: 'SUPERSET_WITH'; currentClientId: string; pickedClientId: string }
  | { type: 'UNGROUP_EXERCISE'; clientId: string }
  | { type: 'REORDER_EXERCISES'; fromItemIndex: number; toItemIndex: number }
  | {
      type: 'POPULATE_FROM_PRESET';
      preset: WorkoutPreset;
      weightUnit: 'kg' | 'lbs';
      clientIds: PresetClientIds;
    };

export function presetFormReducer(state: PresetDraft, action: PresetFormAction): PresetDraft {
  switch (action.type) {
    case 'SET_NAME':
      return { ...state, name: action.name };

    case 'SET_DESCRIPTION':
      return { ...state, description: action.description };

    case 'ADD_EXERCISE':
      return {
        ...state,
        exercises: [
          ...state.exercises,
          {
            clientId: action.exerciseClientId,
            exerciseId: action.exercise.id,
            exerciseName: action.exercise.name,
            exerciseCategory: action.exercise.category,
            images: action.exercise.images ?? [],
            sets: [
              {
                clientId: action.setClientId,
                weight: '',
                reps: '',
                restTime: DEFAULT_REST_SEC,
              },
            ],
          },
        ],
      };

    case 'REMOVE_EXERCISE':
      return {
        ...state,
        exercises: normalizeDraftSupersetGroups(
          state.exercises.filter(e => e.clientId !== action.clientId),
        ),
      };

    case 'ADD_SET':
      return {
        ...state,
        exercises: state.exercises.map(exercise => {
          if (exercise.clientId !== action.exerciseClientId) return exercise;
          const lastSet = exercise.sets[exercise.sets.length - 1];
          const firstSet = exercise.sets[0];
          const newSet: WorkoutDraftSet = {
            clientId: action.setClientId,
            weight: lastSet?.weight ?? '',
            reps: lastSet?.reps ?? '',
            restTime: firstSet?.restTime ?? DEFAULT_REST_SEC,
          };
          return { ...exercise, sets: [...exercise.sets, newSet] };
        }),
      };

    case 'REMOVE_SET':
      return {
        ...state,
        exercises: state.exercises.map(exercise => {
          if (exercise.clientId !== action.exerciseClientId) return exercise;
          return {
            ...exercise,
            sets: exercise.sets.filter(s => s.clientId !== action.setClientId),
          };
        }),
      };

    case 'UPDATE_SET_FIELD':
      return {
        ...state,
        exercises: state.exercises.map(exercise => {
          if (exercise.clientId !== action.exerciseClientId) return exercise;
          return {
            ...exercise,
            sets: exercise.sets.map(set => {
              if (set.clientId !== action.setClientId) return set;
              return { ...set, [action.field]: action.value };
            }),
          };
        }),
      };

    case 'SET_EXERCISE_REST':
      return {
        ...state,
        exercises: state.exercises.map(exercise => {
          if (exercise.clientId !== action.exerciseClientId) return exercise;
          return {
            ...exercise,
            sets: exercise.sets.map(set => ({ ...set, restTime: action.seconds })),
          };
        }),
      };

    case 'UPDATE_SET_META':
      return {
        ...state,
        exercises: state.exercises.map(exercise => {
          if (exercise.clientId !== action.exerciseClientId) return exercise;
          return {
            ...exercise,
            sets: exercise.sets.map(set =>
              set.clientId === action.setClientId ? { ...set, ...action.patch } : set,
            ),
          };
        }),
      };

    case 'SUPERSET_WITH':
      return {
        ...state,
        exercises: supersetDraftExercises(
          state.exercises,
          action.currentClientId,
          action.pickedClientId,
        ),
      };

    case 'UNGROUP_EXERCISE':
      return {
        ...state,
        exercises: ungroupDraftExercise(state.exercises, action.clientId),
      };

    // Runs move atomically and the mover pre-clears stale group values, so no
    // remainders can form — normalizeDraftSupersetGroups is unnecessary here.
    case 'REORDER_EXERCISES':
      return {
        ...state,
        exercises: moveDraftExerciseItem(
          state.exercises,
          action.fromItemIndex,
          action.toItemIndex,
        ),
      };

    case 'POPULATE_FROM_PRESET':
      return {
        name: action.preset.name,
        description: action.preset.description ?? '',
        exercises: action.preset.exercises.map((exercise, exerciseIdx) => ({
          clientId: action.clientIds[exerciseIdx].exerciseClientId,
          exerciseId: exercise.exercise_id,
          exerciseName: exercise.exercise_name,
          exerciseCategory: exercise.category ?? null,
          images: exercise.image_url ? [exercise.image_url] : [],
          supersetGroup: exercise.superset_group ?? null,
          sets: exercise.sets.map((set, setIdx) => ({
            clientId: action.clientIds[exerciseIdx].setClientIds[setIdx],
            restTime: set.rest_time,
            weight:
              set.weight != null
                ? String(parseFloat(weightFromKg(set.weight, action.weightUnit).toFixed(1)))
                : '',
            reps: set.reps != null ? String(set.reps) : '',
            setType: set.set_type ?? undefined,
            duration: set.duration,
            notes: set.notes,
          })),
        })),
      };

    default:
      return state;
  }
}

export function useWorkoutPresetForm() {
  const [state, dispatch] = useReducer(presetFormReducer, undefined, createEmptyDraft);
  const exercisesModifiedRef = useRef(false);
  const initialDescriptionRef = useRef('');

  const setName = useCallback((name: string) => {
    dispatch({ type: 'SET_NAME', name });
  }, []);

  const setDescription = useCallback((description: string) => {
    dispatch({ type: 'SET_DESCRIPTION', description });
  }, []);

  const addExercise = useCallback(
    (exercise: Exercise): { exerciseClientId: string; setClientId: string } => {
      exercisesModifiedRef.current = true;
      const exerciseClientId = generateClientId();
      const setClientId = generateClientId();
      dispatch({ type: 'ADD_EXERCISE', exercise, exerciseClientId, setClientId });
      return { exerciseClientId, setClientId };
    },
    [],
  );

  const removeExercise = useCallback((clientId: string) => {
    exercisesModifiedRef.current = true;
    dispatch({ type: 'REMOVE_EXERCISE', clientId });
  }, []);

  const addSet = useCallback((exerciseClientId: string): string => {
    exercisesModifiedRef.current = true;
    const setClientId = generateClientId();
    dispatch({ type: 'ADD_SET', exerciseClientId, setClientId });
    return setClientId;
  }, []);

  const removeSet = useCallback((exerciseClientId: string, setClientId: string) => {
    exercisesModifiedRef.current = true;
    dispatch({ type: 'REMOVE_SET', exerciseClientId, setClientId });
  }, []);

  const updateSetField = useCallback(
    (
      exerciseClientId: string,
      setClientId: string,
      field: 'weight' | 'reps',
      value: string,
    ) => {
      exercisesModifiedRef.current = true;
      dispatch({ type: 'UPDATE_SET_FIELD', exerciseClientId, setClientId, field, value });
    },
    [],
  );

  const updateSetMeta = useCallback(
    (exerciseClientId: string, setClientId: string, patch: WorkoutSetMetaPatch) => {
      exercisesModifiedRef.current = true;
      dispatch({ type: 'UPDATE_SET_META', exerciseClientId, setClientId, patch });
    },
    [],
  );

  const setExerciseRest = useCallback((exerciseClientId: string, seconds: number) => {
    exercisesModifiedRef.current = true;
    dispatch({ type: 'SET_EXERCISE_REST', exerciseClientId, seconds });
  }, []);

  const supersetWith = useCallback((currentClientId: string, pickedClientId: string) => {
    exercisesModifiedRef.current = true;
    dispatch({ type: 'SUPERSET_WITH', currentClientId, pickedClientId });
  }, []);

  const ungroupExercise = useCallback((clientId: string) => {
    exercisesModifiedRef.current = true;
    dispatch({ type: 'UNGROUP_EXERCISE', clientId });
  }, []);

  const reorderExercises = useCallback((fromItemIndex: number, toItemIndex: number) => {
    // Critical: preset save only includes `exercises` when exercisesModified is
    // true, and handleSave silently goBack()s on an empty payload — so a
    // reorder-only edit must flip this flag or it never persists.
    exercisesModifiedRef.current = true;
    dispatch({ type: 'REORDER_EXERCISES', fromItemIndex, toItemIndex });
  }, []);

  const populateFromPreset = useCallback(
    (preset: WorkoutPreset, weightUnit: 'kg' | 'lbs'): string[] => {
      const clientIds: PresetClientIds = preset.exercises.map(e => ({
        exerciseClientId: generateClientId(),
        setClientIds: e.sets.map(() => generateClientId()),
      }));
      exercisesModifiedRef.current = false;
      initialDescriptionRef.current = preset.description ?? '';
      dispatch({ type: 'POPULATE_FROM_PRESET', preset, weightUnit, clientIds });
      return clientIds.map(c => c.exerciseClientId);
    },
    [],
  );

  return {
    state,
    setName,
    setDescription,
    addExercise,
    removeExercise,
    addSet,
    removeSet,
    updateSetField,
    updateSetMeta,
    setExerciseRest,
    supersetWith,
    ungroupExercise,
    reorderExercises,
    populateFromPreset,
    exercisesModifiedRef,
    initialDescriptionRef,
  };
}
