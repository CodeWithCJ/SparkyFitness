import { useReducer, useRef, useCallback } from 'react';
import { clearDraft } from '../services/workoutDraftService';
import { useDraftPersistence } from './useDraftPersistence';
import { getTodayDate, normalizeDate } from '../utils/dateUtils';
import { weightFromKg } from '../utils/unitConversions';
import {
  DEFAULT_REST_SEC,
  buildExercisesPayload,
  normalizeDraftSupersetGroups,
  supersetDraftExercises,
  ungroupDraftExercise,
} from '../utils/workoutSession';
import type { Exercise } from '../types/exercise';
import type {
  WorkoutDraft,
  WorkoutDraftExercise,
  WorkoutDraftSet,
  WorkoutSetMetaPatch,
} from '../types/drafts';
import type { PresetSessionResponse } from '@workspace/shared';
import type { WorkoutPreset } from '../types/workoutPresets';

export type { WorkoutDraft, WorkoutDraftExercise, WorkoutDraftSet } from '../types/drafts';

// --- Helpers ---

function generateClientId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

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
  | { type: 'RESTORE_DRAFT'; draft: WorkoutDraft }
  | { type: 'SET_DATE'; date: string }
  | { type: 'SET_NAME'; name: string }
  | { type: 'ADD_EXERCISE'; exercise: Exercise; exerciseClientId: string; setClientId: string }
  | { type: 'REMOVE_EXERCISE'; clientId: string }
  | { type: 'ADD_SET'; exerciseClientId: string; setClientId: string }
  | { type: 'REMOVE_SET'; exerciseClientId: string; setClientId: string }
  | { type: 'UPDATE_SET_FIELD'; exerciseClientId: string; setClientId: string; field: 'weight' | 'reps'; value: string }
  | { type: 'UPDATE_SET_META'; exerciseClientId: string; setClientId: string; patch: WorkoutSetMetaPatch }
  | { type: 'SET_EXERCISE_REST'; exerciseClientId: string; seconds: number }
  | { type: 'SUPERSET_WITH'; currentClientId: string; pickedClientId: string }
  | { type: 'UNGROUP_EXERCISE'; clientId: string }
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
            sets: [{ clientId: action.setClientId, weight: '', reps: '', restTime: DEFAULT_REST_SEC }],
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

    case 'ADD_SET': {
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

    case 'SET_EXERCISE_REST': {
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
    }

    case 'UPDATE_SET_META': {
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
    }

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
  const exercisesModifiedRef = useRef(false);

  const { clearPersistedDraft } = useDraftPersistence({
    state,
    draftType: 'workout',
    isEditMode,
    skipDraftLoad,
    onDraftLoaded: (draft) => dispatch({ type: 'RESTORE_DRAFT', draft }),
    onInitialDate: initialDate ? () => dispatch({ type: 'SET_DATE', date: initialDate }) : undefined,
  });

  const addExercise = useCallback((exercise: Exercise): { exerciseClientId: string; setClientId: string } => {
    exercisesModifiedRef.current = true;
    const exerciseClientId = generateClientId();
    const setClientId = generateClientId();
    dispatch({ type: 'ADD_EXERCISE', exercise, exerciseClientId, setClientId });
    return { exerciseClientId, setClientId };
  }, []);

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
    (exerciseClientId: string, setClientId: string, field: 'weight' | 'reps', value: string) => {
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
  }, []);

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
    [],
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
