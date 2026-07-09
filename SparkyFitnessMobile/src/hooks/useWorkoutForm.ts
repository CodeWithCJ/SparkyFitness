import { useReducer, useCallback } from 'react';
import { clearDraft } from '../services/workoutDraftService';
import { useDraftPersistence } from './useDraftPersistence';
import {
  draftExercisesReducer,
  generateClientId,
  useDraftExerciseActions,
  type DraftExercisesAction,
} from './draftExercisesSlice';
import { getTodayDate, normalizeDate } from '../utils/dateUtils';
import { weightFromKg } from '../utils/unitConversions';
import { buildExercisesPayload } from '../utils/workoutSession';
import type { WorkoutDraft, WorkoutDraftExercise } from '../types/drafts';
import type { PresetSessionResponse } from '@workspace/shared';
import type { WorkoutPreset } from '../types/workoutPresets';

export type { WorkoutDraft, WorkoutDraftExercise, WorkoutDraftSet } from '../types/drafts';

// --- Helpers ---

function formatWorkoutDate(dateString: string): string {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function defaultWorkoutName(dateString: string): string {
  return `Workout - ${formatWorkoutDate(dateString)}`;
}

function createEmptyDraft(): WorkoutDraft {
  const today = getTodayDate();
  return {
    type: 'workout',
    name: defaultWorkoutName(today),
    nameManuallySet: false,
    entryDate: today,
    exercises: [],
  };
}

export interface WorkoutDraftSubmission {
  name: string;
  entryDate: string;
  exercisesWithSets: WorkoutDraftExercise[];
  exerciseCount: number;
  canSave: boolean;
  payloadExercises: ReturnType<typeof buildExercisesPayload>;
}

export function getWorkoutDraftSubmission(
  state: WorkoutDraft,
  weightUnit: 'kg' | 'lbs',
): WorkoutDraftSubmission {
  const exercisesWithSets = state.exercises.filter(exercise => exercise.sets.length > 0);

  return {
    name: state.name.trim() || 'Workout',
    entryDate: state.entryDate,
    exercisesWithSets,
    exerciseCount: exercisesWithSets.length,
    canSave: exercisesWithSets.length > 0,
    payloadExercises: buildExercisesPayload(exercisesWithSets, weightUnit),
  };
}

// --- Reducer ---

export type PresetClientIds = { exerciseClientId: string; setClientIds: string[] }[];

type WorkoutFormAction =
  | DraftExercisesAction
  | { type: 'RESTORE_DRAFT'; draft: WorkoutDraft }
  | { type: 'SET_DATE'; date: string }
  | { type: 'SET_NAME'; name: string }
  | { type: 'RESET' }
  | { type: 'POPULATE'; session: PresetSessionResponse; weightUnit: 'kg' | 'lbs' }
  | {
      type: 'POPULATE_FROM_PRESET';
      preset: WorkoutPreset;
      weightUnit: 'kg' | 'lbs';
      date?: string;
      clientIds: PresetClientIds;
    };

export function workoutFormReducer(state: WorkoutDraft, action: WorkoutFormAction): WorkoutDraft {
  switch (action.type) {
    case 'RESTORE_DRAFT':
      return {
        ...action.draft,
        nameManuallySet: action.draft.nameManuallySet ?? true,
        exercises: action.draft.exercises.map(e => ({ ...e, images: e.images ?? [] })),
      };

    case 'SET_DATE': {
      const next: WorkoutDraft = { ...state, entryDate: action.date };
      if (!state.nameManuallySet) {
        next.name = defaultWorkoutName(action.date);
      }
      return next;
    }

    case 'SET_NAME':
      return { ...state, name: action.name, nameManuallySet: true };

    case 'RESET':
      return createEmptyDraft();

    case 'POPULATE':
      return {
        type: 'workout',
        name: action.session.name,
        nameManuallySet: true,
        entryDate: action.session.entry_date ? normalizeDate(action.session.entry_date) : getTodayDate(),
        exercises: action.session.exercises.map(exercise => ({
          clientId: generateClientId(),
          serverId: exercise.id,
          exerciseId: exercise.exercise_id,
          exerciseName: exercise.exercise_snapshot?.name ?? 'Unknown',
          exerciseCategory: exercise.exercise_snapshot?.category ?? null,
          images: exercise.exercise_snapshot?.images ?? [],
          supersetGroup: exercise.superset_group ?? null,
          snapshot: exercise.exercise_snapshot ?? null,
          sets: exercise.sets.map(set => ({
            clientId: generateClientId(),
            serverId: set.id,
            restTime: set.rest_time,
            setType: set.set_type ?? undefined,
            duration: set.duration,
            notes: set.notes,
            rpe: set.rpe,
            completedAt: set.completed_at,
            isPr: set.is_pr,
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
        nameManuallySet: true,
        entryDate: action.date ?? getTodayDate(),
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
            // buildExercisesPayload writes every set column with `?? null`, so
            // preset fields the form doesn't edit must still be carried here —
            // dropping them would permanently null them on save.
            setType: set.set_type ?? undefined,
            duration: set.duration,
            notes: set.notes,
            weight: set.weight != null
              ? String(parseFloat(weightFromKg(set.weight, action.weightUnit).toFixed(1)))
              : '',
            reps: set.reps != null ? String(set.reps) : '',
          })),
        })),
      };

    // Everything else is a shared exercise-array edit. Identity return from
    // the slice (unknown action, no-op edit) keeps the state object identical.
    default: {
      const exercises = draftExercisesReducer(state.exercises, action);
      return exercises === state.exercises ? state : { ...state, exercises };
    }
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

  const {
    exercisesModifiedRef,
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
  } = useDraftExerciseActions(dispatch);

  const { clearPersistedDraft } = useDraftPersistence({
    state,
    draftType: 'workout',
    isEditMode,
    skipDraftLoad,
    onDraftLoaded: (draft) => dispatch({ type: 'RESTORE_DRAFT', draft }),
    onInitialDate: initialDate ? () => dispatch({ type: 'SET_DATE', date: initialDate }) : undefined,
  });

  const setName = useCallback((name: string) => {
    dispatch({ type: 'SET_NAME', name });
  }, []);

  const setDate = useCallback((date: string) => {
    dispatch({ type: 'SET_DATE', date });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
    if (!isEditMode) {
      void clearDraft();
    }
  }, [isEditMode]);

  const discardDraft = useCallback(async () => {
    if (!isEditMode) {
      await clearPersistedDraft();
    }
  }, [clearPersistedDraft, isEditMode]);

  const populate = useCallback((session: PresetSessionResponse, weightUnit: 'kg' | 'lbs') => {
    exercisesModifiedRef.current = false;
    dispatch({ type: 'POPULATE', session, weightUnit });
  }, [exercisesModifiedRef]);

  const populateFromPreset = useCallback(
    (preset: WorkoutPreset, weightUnit: 'kg' | 'lbs', date?: string): string[] => {
      const clientIds: PresetClientIds = preset.exercises.map(e => ({
        exerciseClientId: generateClientId(),
        setClientIds: e.sets.map(() => generateClientId()),
      }));
      exercisesModifiedRef.current = false;
      dispatch({ type: 'POPULATE_FROM_PRESET', preset, weightUnit, date, clientIds });
      return clientIds.map(c => c.exerciseClientId);
    },
    [exercisesModifiedRef],
  );

  return {
    state,
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
    setName,
    setDate,
    reset,
    discardDraft,
    populate,
    populateFromPreset,
    hasDraftData: state.exercises.length > 0,
    exercisesModifiedRef,
  };
}
