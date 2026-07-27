import { useCallback, useReducer, useRef } from 'react';
import type { PresetSessionResponse } from '@workspace/shared';
import { weightFromKg } from '../utils/unitConversions';
import type { WorkoutDraftExercise } from '../types/drafts';
import type { WorkoutPreset } from '../types/workoutPresets';
import {
  draftExercisesReducer,
  generateClientId,
  useDraftExerciseActions,
  type DraftExercisesAction,
} from './draftExercisesSlice';

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
  | DraftExercisesAction
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_DESCRIPTION'; description: string }
  | {
      type: 'POPULATE_FROM_PRESET';
      preset: WorkoutPreset;
      weightUnit: 'kg' | 'lbs';
      clientIds: PresetClientIds;
    }
  | {
      type: 'POPULATE_FROM_SESSION';
      session: PresetSessionResponse;
      weightUnit: 'kg' | 'lbs';
      clientIds: PresetClientIds;
    };

export function presetFormReducer(state: PresetDraft, action: PresetFormAction): PresetDraft {
  switch (action.type) {
    case 'SET_NAME':
      return { ...state, name: action.name };

    case 'SET_DESCRIPTION':
      return { ...state, description: action.description };

    case 'POPULATE_FROM_PRESET':
      return {
        name: action.preset.name,
        description: action.preset.description ?? '',
        exercises: action.preset.exercises.map((exercise, exerciseIdx) => ({
          clientId: action.clientIds[exerciseIdx].exerciseClientId,
          exerciseId: exercise.exercise_id,
          exerciseName: exercise.exercise_name,
          exerciseCategory: exercise.category ?? null,
          exerciseModality: exercise.modality ?? null,
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
            // Presets have no distance column.
            distance: '',
            setType: set.set_type ?? undefined,
            duration: set.duration,
            notes: set.notes,
          })),
        })),
      };

    // "Save as preset" from a logged workout. Every logged set carries over
    // verbatim (completed or not — completion is about that day's session, not
    // the template); session-only fields (completion, PRs, RPE, per-exercise
    // notes/calories/duration) have no preset column and are dropped.
    case 'POPULATE_FROM_SESSION':
      return {
        name: action.session.name,
        description: action.session.description ?? '',
        exercises: action.session.exercises.map((exercise, exerciseIdx) => ({
          clientId: action.clientIds[exerciseIdx].exerciseClientId,
          exerciseId: exercise.exercise_id,
          exerciseName: exercise.exercise_snapshot?.name ?? 'Unknown',
          exerciseCategory: exercise.exercise_snapshot?.category ?? null,
          exerciseModality: exercise.exercise_snapshot?.modality ?? null,
          images: exercise.exercise_snapshot?.images ?? [],
          supersetGroup: exercise.superset_group ?? null,
          sets: exercise.sets.map((set, setIdx) => ({
            clientId: action.clientIds[exerciseIdx].setClientIds[setIdx],
            restTime: set.rest_time,
            setType: set.set_type ?? undefined,
            duration: set.duration,
            notes: set.notes,
            weight:
              set.weight != null
                ? String(parseFloat(weightFromKg(set.weight, action.weightUnit).toFixed(1)))
                : '',
            reps: set.reps != null ? String(set.reps) : '',
            // Presets have no distance column.
            distance: '',
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

export function useWorkoutPresetForm() {
  const [state, dispatch] = useReducer(presetFormReducer, undefined, createEmptyDraft);
  const initialDescriptionRef = useRef('');

  const {
    exercisesModifiedRef,
    addExercise,
    removeExercise,
    replaceExercise,
    addSet,
    removeSet,
    updateSetField,
    updateSetMeta,
    setExerciseRest,
    supersetWith,
    ungroupExercise,
    reorderExercises,
  } = useDraftExerciseActions(dispatch);

  const setName = useCallback((name: string) => {
    dispatch({ type: 'SET_NAME', name });
  }, []);

  const setDescription = useCallback((description: string) => {
    dispatch({ type: 'SET_DESCRIPTION', description });
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
    [exercisesModifiedRef],
  );

  const populateFromSession = useCallback(
    (session: PresetSessionResponse, weightUnit: 'kg' | 'lbs') => {
      const clientIds: PresetClientIds = session.exercises.map(e => ({
        exerciseClientId: generateClientId(),
        setClientIds: e.sets.map(() => generateClientId()),
      }));
      exercisesModifiedRef.current = false;
      dispatch({ type: 'POPULATE_FROM_SESSION', session, weightUnit, clientIds });
    },
    [exercisesModifiedRef],
  );

  return {
    state,
    setName,
    setDescription,
    addExercise,
    removeExercise,
    replaceExercise,
    addSet,
    removeSet,
    updateSetField,
    updateSetMeta,
    setExerciseRest,
    supersetWith,
    ungroupExercise,
    reorderExercises,
    populateFromPreset,
    populateFromSession,
    exercisesModifiedRef,
    initialDescriptionRef,
  };
}
