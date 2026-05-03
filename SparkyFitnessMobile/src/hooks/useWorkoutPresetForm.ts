import { useCallback, useReducer, useRef } from 'react';
import { weightFromKg } from '../utils/unitConversions';
import type { Exercise } from '../types/exercise';
import type { WorkoutDraftExercise, WorkoutDraftSet } from '../types/drafts';
import type { WorkoutPreset } from '../types/workoutPresets';
import { DEFAULT_REST_SEC } from '../components/RestPeriodChip';

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
  | { type: 'SET_EXERCISE_REST'; exerciseClientId: string; seconds: number }
  | { type: 'POPULATE_FROM_PRESET'; preset: WorkoutPreset; weightUnit: 'kg' | 'lbs' };

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
        exercises: state.exercises.filter(e => e.clientId !== action.clientId),
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

    case 'POPULATE_FROM_PRESET':
      return {
        name: action.preset.name,
        description: action.preset.description ?? '',
        exercises: action.preset.exercises.map(exercise => ({
          clientId: generateClientId(),
          exerciseId: exercise.exercise_id,
          exerciseName: exercise.exercise_name,
          exerciseCategory: exercise.category ?? null,
          images: exercise.image_url ? [exercise.image_url] : [],
          sets: exercise.sets.map(set => ({
            clientId: generateClientId(),
            restTime: set.rest_time,
            weight:
              set.weight != null
                ? String(parseFloat(weightFromKg(set.weight, action.weightUnit).toFixed(1)))
                : '',
            reps: set.reps != null ? String(set.reps) : '',
            setType: set.set_type,
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

  const setExerciseRest = useCallback((exerciseClientId: string, seconds: number) => {
    exercisesModifiedRef.current = true;
    dispatch({ type: 'SET_EXERCISE_REST', exerciseClientId, seconds });
  }, []);

  const populateFromPreset = useCallback(
    (preset: WorkoutPreset, weightUnit: 'kg' | 'lbs') => {
      exercisesModifiedRef.current = false;
      initialDescriptionRef.current = preset.description ?? '';
      dispatch({ type: 'POPULATE_FROM_PRESET', preset, weightUnit });
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
    setExerciseRest,
    populateFromPreset,
    exercisesModifiedRef,
    initialDescriptionRef,
  };
}
