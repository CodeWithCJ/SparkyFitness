import { useReducer, useCallback } from 'react';
import { clearDraft } from '../services/workoutDraftService';
import { useDraftPersistence } from './useDraftPersistence';
import { getTodayDate } from '../utils/dateUtils';
import { kmToMiles } from '../utils/unitConversions';
import type { Exercise } from '../types/exercise';
import type { ActivityDraft } from '../types/drafts';
import type { IndividualSessionResponse } from '@workspace/shared';

export type { ActivityDraft } from '../types/drafts';

function createEmptyDraft(): ActivityDraft {
  return {
    type: 'activity',
    name: '',
    exerciseId: null,
    exerciseName: '',
    exerciseCategory: null,
    caloriesPerHour: 0,
    duration: '',
    distance: '',
    calories: '',
    caloriesManuallySet: false,
    entryDate: getTodayDate(),
    notes: '',
  };
}

function calculateCalories(caloriesPerHour: number, durationStr: string): string {
  const duration = parseFloat(durationStr);
  if (!caloriesPerHour || isNaN(duration) || duration <= 0) return '';
  return String(Math.round(caloriesPerHour * (duration / 60)));
}

type ActivityFormAction =
  | { type: 'RESTORE_DRAFT'; draft: ActivityDraft }
  | { type: 'SET_EXERCISE'; exercise: Exercise }
  | { type: 'SET_NAME'; value: string }
  | { type: 'SET_DURATION'; value: string }
  | { type: 'SET_DISTANCE'; value: string }
  | { type: 'SET_CALORIES'; value: string }
  | { type: 'SET_DATE'; value: string }
  | { type: 'SET_NOTES'; value: string }
  | { type: 'RESET' }
  | { type: 'POPULATE'; entry: IndividualSessionResponse; distanceUnit: 'km' | 'miles' };

export function activityFormReducer(state: ActivityDraft, action: ActivityFormAction): ActivityDraft {
  switch (action.type) {
    case 'RESTORE_DRAFT':
      return action.draft;

    case 'SET_EXERCISE': {
      const newState = {
        ...state,
        exerciseId: action.exercise.id,
        exerciseName: action.exercise.name,
        exerciseCategory: action.exercise.category,
        caloriesPerHour: action.exercise.calories_per_hour,
        name: state.name || action.exercise.name,
      };
      if (!state.caloriesManuallySet) {
        newState.calories = calculateCalories(action.exercise.calories_per_hour, state.duration);
      }
      return newState;
    }

    case 'SET_NAME':
      return { ...state, name: action.value };

    case 'SET_DURATION': {
      const newState = { ...state, duration: action.value };
      if (!state.caloriesManuallySet) {
        newState.calories = calculateCalories(state.caloriesPerHour, action.value);
      }
      return newState;
    }

    case 'SET_DISTANCE':
      return { ...state, distance: action.value };

    case 'SET_CALORIES':
      return {
        ...state,
        calories: action.value,
        caloriesManuallySet: action.value !== '',
      };

    case 'SET_DATE':
      return { ...state, entryDate: action.value };

    case 'SET_NOTES':
      return { ...state, notes: action.value };

    case 'RESET':
      return createEmptyDraft();

    case 'POPULATE': {
      const { entry, distanceUnit } = action;
      let distance = '';
      if (entry.distance != null && entry.distance > 0) {
        const displayDistance = distanceUnit === 'miles' ? kmToMiles(entry.distance) : entry.distance;
        distance = String(parseFloat(displayDistance.toFixed(2)));
      }
      return {
        type: 'activity',
        name: entry.name ?? entry.exercise_snapshot?.name ?? '',
        exerciseId: entry.exercise_id,
        exerciseName: entry.exercise_snapshot?.name ?? '',
        exerciseCategory: entry.exercise_snapshot?.category ?? null,
        caloriesPerHour: 0,
        duration: String(entry.duration_minutes),
        distance,
        calories: String(entry.calories_burned),
        caloriesManuallySet: true,
        entryDate: entry.entry_date ?? getTodayDate(),
        notes: entry.notes ?? '',
      };
    }

    default:
      return state;
  }
}

interface UseActivityFormOptions {
  isEditMode?: boolean;
  initialDate?: string;
  skipDraftLoad?: boolean;
}

export function useActivityForm({ isEditMode = false, initialDate, skipDraftLoad = false }: UseActivityFormOptions = {}) {
  const [state, dispatch] = useReducer(activityFormReducer, undefined, createEmptyDraft);

  useDraftPersistence({
    state,
    draftType: 'activity',
    isEditMode,
    skipDraftLoad,
    onDraftLoaded: (draft) => dispatch({ type: 'RESTORE_DRAFT', draft }),
    onInitialDate: initialDate ? () => dispatch({ type: 'SET_DATE', value: initialDate }) : undefined,
  });

  const setExercise = useCallback((exercise: Exercise) => {
    dispatch({ type: 'SET_EXERCISE', exercise });
  }, []);

  const setName = useCallback((value: string) => {
    dispatch({ type: 'SET_NAME', value });
  }, []);

  const setDuration = useCallback((value: string) => {
    dispatch({ type: 'SET_DURATION', value });
  }, []);

  const setDistance = useCallback((value: string) => {
    dispatch({ type: 'SET_DISTANCE', value });
  }, []);

  const setCalories = useCallback((value: string) => {
    dispatch({ type: 'SET_CALORIES', value });
  }, []);

  const setDate = useCallback((value: string) => {
    dispatch({ type: 'SET_DATE', value });
  }, []);

  const setNotes = useCallback((value: string) => {
    dispatch({ type: 'SET_NOTES', value });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
    clearDraft();
  }, []);

  const populate = useCallback((entry: IndividualSessionResponse, distanceUnit: 'km' | 'miles') => {
    dispatch({ type: 'POPULATE', entry, distanceUnit });
  }, []);

  return {
    state,
    setExercise,
    setName,
    setDuration,
    setDistance,
    setCalories,
    setDate,
    setNotes,
    reset,
    populate,
    hasDraftData: state.exerciseId !== null || state.duration !== '' || state.calories !== '' || state.distance !== '' || state.notes !== '',
  };
}

