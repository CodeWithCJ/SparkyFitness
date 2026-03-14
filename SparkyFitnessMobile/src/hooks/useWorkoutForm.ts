import { useReducer, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import { saveDraft, loadDraft, clearDraft } from '../services/workoutDraftService';
import { getTodayDate } from '../utils/dateUtils';
import { weightFromKg } from '../utils/unitConversions';
import type { Exercise } from '../types/exercise';
import type { WorkoutDraft, WorkoutDraftSet } from '../types/drafts';
import type { PresetSessionResponse } from '@workspace/shared';
import type { WorkoutPreset } from '../types/workoutPresets';

export type { WorkoutDraft, WorkoutDraftExercise, WorkoutDraftSet } from '../types/drafts';

// --- Helpers ---

function generateClientId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function createEmptyDraft(): WorkoutDraft {
  return {
    type: 'workout',
    name: 'Workout',
    entryDate: getTodayDate(),
    exercises: [],
  };
}

function createEmptySet(): WorkoutDraftSet {
  return { clientId: generateClientId(), weight: '', reps: '' };
}

// --- Reducer ---

type WorkoutFormAction =
  | { type: 'RESTORE_DRAFT'; draft: WorkoutDraft }
  | { type: 'SET_DATE'; date: string }
  | { type: 'SET_NAME'; name: string }
  | { type: 'ADD_EXERCISE'; exercise: Exercise }
  | { type: 'REMOVE_EXERCISE'; clientId: string }
  | { type: 'ADD_SET'; exerciseClientId: string }
  | { type: 'REMOVE_SET'; exerciseClientId: string; setClientId: string }
  | { type: 'UPDATE_SET_FIELD'; exerciseClientId: string; setClientId: string; field: 'weight' | 'reps'; value: string }
  | { type: 'RESET' }
  | { type: 'POPULATE'; session: PresetSessionResponse; weightUnit: 'kg' | 'lbs' }
  | { type: 'POPULATE_FROM_PRESET'; preset: WorkoutPreset; weightUnit: 'kg' | 'lbs'; date?: string };

export function workoutFormReducer(state: WorkoutDraft, action: WorkoutFormAction): WorkoutDraft {
  switch (action.type) {
    case 'RESTORE_DRAFT':
      return action.draft;

    case 'SET_DATE':
      return { ...state, entryDate: action.date };

    case 'SET_NAME':
      return { ...state, name: action.name };

    case 'ADD_EXERCISE':
      return {
        ...state,
        exercises: [
          ...state.exercises,
          {
            clientId: generateClientId(),
            exerciseId: action.exercise.id,
            exerciseName: action.exercise.name,
            exerciseCategory: action.exercise.category,
            sets: [createEmptySet()],
          },
        ],
      };

    case 'REMOVE_EXERCISE':
      return {
        ...state,
        exercises: state.exercises.filter(e => e.clientId !== action.clientId),
      };

    case 'ADD_SET': {
      return {
        ...state,
        exercises: state.exercises.map(exercise => {
          if (exercise.clientId !== action.exerciseClientId) return exercise;
          const lastSet = exercise.sets[exercise.sets.length - 1];
          const newSet: WorkoutDraftSet = {
            clientId: generateClientId(),
            weight: lastSet?.weight ?? '',
            reps: lastSet?.reps ?? '',
          };
          return { ...exercise, sets: [...exercise.sets, newSet] };
        }),
      };
    }

    case 'REMOVE_SET': {
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
    }

    case 'UPDATE_SET_FIELD': {
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
    }

    case 'RESET':
      return createEmptyDraft();

    case 'POPULATE':
      return {
        type: 'workout',
        name: action.session.name,
        entryDate: action.session.entry_date?.split('T')[0] ?? getTodayDate(),
        exercises: action.session.exercises.map(exercise => ({
          clientId: generateClientId(),
          exerciseId: exercise.exercise_id,
          exerciseName: exercise.exercise_snapshot?.name ?? 'Unknown',
          exerciseCategory: exercise.exercise_snapshot?.category ?? null,
          sets: exercise.sets.map(set => ({
            clientId: generateClientId(),
            weight: set.weight != null
              ? String(parseFloat(weightFromKg(set.weight, action.weightUnit).toFixed(1)))
              : '',
            reps: set.reps != null ? String(set.reps) : '',
          })),
        })),
      };

    case 'POPULATE_FROM_PRESET':
      return {
        type: 'workout',
        name: action.preset.name,
        entryDate: action.date ?? getTodayDate(),
        exercises: action.preset.exercises.map(exercise => ({
          clientId: generateClientId(),
          exerciseId: exercise.exercise_id,
          exerciseName: exercise.exercise_name,
          exerciseCategory: null,
          sets: exercise.sets.map(set => ({
            clientId: generateClientId(),
            weight: set.weight != null
              ? String(parseFloat(weightFromKg(set.weight, action.weightUnit).toFixed(1)))
              : '',
            reps: set.reps != null ? String(set.reps) : '',
          })),
        })),
      };

    default:
      return state;
  }
}

// --- Hook ---

interface UseWorkoutFormOptions {
  isEditMode?: boolean;
  skipDraftLoad?: boolean;
  initialDate?: string;
}

export function useWorkoutForm(options?: UseWorkoutFormOptions) {
  const isEditMode = options?.isEditMode ?? false;
  const skipDraftLoad = options?.skipDraftLoad ?? false;
  const initialDate = options?.initialDate;
  const [state, dispatch] = useReducer(workoutFormReducer, undefined, createEmptyDraft);
  const isDraftLoadedRef = useRef(false);
  const skipNextSaveRef = useRef(false);
  const exercisesModifiedRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Load draft on mount (skip in edit mode and when populating from preset)
  useEffect(() => {
    if (isEditMode || skipDraftLoad) {
      if (skipDraftLoad && initialDate) {
        dispatch({ type: 'SET_DATE', date: initialDate });
      }
      isDraftLoadedRef.current = true;
      return;
    }
    loadDraft().then(draft => {
      if (draft && draft.type === 'workout') {
        skipNextSaveRef.current = true;
        dispatch({ type: 'RESTORE_DRAFT', draft });
      } else if (initialDate) {
        dispatch({ type: 'SET_DATE', date: initialDate });
      }
      isDraftLoadedRef.current = true;
    });
  }, [isEditMode, skipDraftLoad, initialDate]);

  // Debounced save on state changes (skip in edit mode)
  useEffect(() => {
    if (isEditMode) return;
    if (!isDraftLoadedRef.current) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveDraft(state);
    }, 300);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [state, isEditMode]);

  // Save immediately when app goes to background (skip in edit mode)
  useEffect(() => {
    if (isEditMode) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        saveDraft(stateRef.current);
      }
    });
    return () => subscription.remove();
  }, [isEditMode]);

  const addExercise = useCallback((exercise: Exercise) => {
    exercisesModifiedRef.current = true;
    dispatch({ type: 'ADD_EXERCISE', exercise });
  }, []);

  const removeExercise = useCallback((clientId: string) => {
    exercisesModifiedRef.current = true;
    dispatch({ type: 'REMOVE_EXERCISE', clientId });
  }, []);

  const addSet = useCallback((exerciseClientId: string) => {
    exercisesModifiedRef.current = true;
    dispatch({ type: 'ADD_SET', exerciseClientId });
  }, []);

  const removeSet = useCallback((exerciseClientId: string, setClientId: string) => {
    exercisesModifiedRef.current = true;
    dispatch({ type: 'REMOVE_SET', exerciseClientId, setClientId });
  }, []);

  const updateSetField = useCallback(
    (exerciseClientId: string, setClientId: string, field: 'weight' | 'reps', value: string) => {
      exercisesModifiedRef.current = true;
      dispatch({ type: 'UPDATE_SET_FIELD', exerciseClientId, setClientId, field, value });
    },
    [],
  );

  const setName = useCallback((name: string) => {
    dispatch({ type: 'SET_NAME', name });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
    if (!isEditMode) {
      clearDraft();
    }
  }, [isEditMode]);

  const populate = useCallback((session: PresetSessionResponse, weightUnit: 'kg' | 'lbs') => {
    exercisesModifiedRef.current = false;
    dispatch({ type: 'POPULATE', session, weightUnit });
  }, []);

  const populateFromPreset = useCallback((preset: WorkoutPreset, weightUnit: 'kg' | 'lbs', date?: string) => {
    exercisesModifiedRef.current = false;
    dispatch({ type: 'POPULATE_FROM_PRESET', preset, weightUnit, date });
  }, []);

  return {
    state,
    addExercise,
    removeExercise,
    addSet,
    removeSet,
    updateSetField,
    setName,
    reset,
    populate,
    populateFromPreset,
    hasDraftData: state.exercises.length > 0,
    exercisesModifiedRef,
  };
}
