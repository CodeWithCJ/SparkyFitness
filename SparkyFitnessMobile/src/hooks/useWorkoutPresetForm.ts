import { useCallback, useReducer, useRef } from 'react';
import type { PresetSessionResponse, WorkoutFormat } from '@workspace/shared';
import { weightFromKg } from '../utils/unitConversions';
import {
  resolveSnapshotModality,
  setDistanceFromKm,
} from '../utils/workoutSession';
import type { WorkoutDraftExercise, DraftSetType } from '../types/drafts';
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
  workoutFormat: WorkoutFormat;
  timeCapSeconds: number | null;
  exercises: WorkoutDraftExercise[];
}

function createEmptyDraft(): PresetDraft {
  return {
    name: '',
    description: '',
    workoutFormat: 'standard',
    timeCapSeconds: null,
    exercises: [],
  };
}

export type PresetClientIds = {
  exerciseClientId: string;
  setClientIds: string[];
}[];

type PresetFormAction =
  | DraftExercisesAction
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_DESCRIPTION'; description: string }
  | { type: 'SET_WORKOUT_FORMAT'; workoutFormat: WorkoutFormat }
  | { type: 'SET_TIME_CAP_SECONDS'; timeCapSeconds: number | null }
  | {
      type: 'POPULATE_FROM_PRESET';
      preset: WorkoutPreset;
      weightUnit: 'kg' | 'lbs';
      distanceUnit: 'km' | 'miles';
      clientIds: PresetClientIds;
    }
  | {
      type: 'POPULATE_FROM_SESSION';
      session: PresetSessionResponse;
      weightUnit: 'kg' | 'lbs';
      distanceUnit: 'km' | 'miles';
      clientIds: PresetClientIds;
    };

export function presetFormReducer(
  state: PresetDraft,
  action: PresetFormAction
): PresetDraft {
  switch (action.type) {
    case 'SET_NAME':
      return { ...state, name: action.name };

    case 'SET_DESCRIPTION':
      return { ...state, description: action.description };

    case 'SET_WORKOUT_FORMAT':
      return { ...state, workoutFormat: action.workoutFormat };

    case 'SET_TIME_CAP_SECONDS':
      return { ...state, timeCapSeconds: action.timeCapSeconds };

    case 'POPULATE_FROM_PRESET':
      return {
        name: action.preset.name,
        description: action.preset.description ?? '',
        workoutFormat: action.preset.workout_format ?? 'standard',
        timeCapSeconds: action.preset.time_cap_seconds ?? null,
        exercises: action.preset.exercises.map((exercise, exerciseIdx) => ({
          clientId: action.clientIds[exerciseIdx].exerciseClientId,
          exerciseId: exercise.exercise_id,
          exerciseName: exercise.exercise_name,
          exerciseCategory: exercise.category ?? null,
          exerciseModality: exercise.modality ?? null,
          images: exercise.image_url ? [exercise.image_url] : [],
          exerciseEquipment: exercise.equipment ?? null,
          supersetGroup: exercise.superset_group ?? null,
          // Progression & Equipment Fields
          progressionMode: exercise.progression_mode ?? 'rep_goal',
          repGoal: exercise.rep_goal ?? null,
          incrementType: exercise.increment_type ?? 'weight',
          incrementValue: exercise.increment_value ?? 5,
          equipmentBrand: exercise.equipment_brand ?? null,
          rampIncrement: exercise.ramp_increment ?? null,
          sets: exercise.sets.map((set, setIdx) => ({
            clientId: action.clientIds[exerciseIdx].setClientIds[setIdx],
            restTime: set.rest_time,
            weight:
              set.weight != null
                ? String(
                    parseFloat(
                      weightFromKg(set.weight, action.weightUnit).toFixed(1)
                    )
                  )
                : '',
            reps: set.reps != null ? String(set.reps) : '',
            distance:
              set.distance != null
                ? String(
                    parseFloat(
                      setDistanceFromKm(
                        set.distance,
                        action.distanceUnit,
                        resolveSnapshotModality({
                          modality: exercise.modality,
                          category: exercise.category,
                        })
                      ).toFixed(2)
                    )
                  )
                : '',
            setType: (set.set_type as DraftSetType) ?? undefined,
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
        workoutFormat: 'standard',
        timeCapSeconds: null,
        exercises: action.session.exercises.map((exercise, exerciseIdx) => ({
          clientId: action.clientIds[exerciseIdx].exerciseClientId,
          exerciseId: exercise.exercise_id,
          exerciseName: exercise.exercise_snapshot?.name ?? 'Unknown',
          exerciseCategory: exercise.exercise_snapshot?.category ?? null,
          exerciseModality: exercise.exercise_snapshot?.modality ?? null,
          images: exercise.exercise_snapshot?.images ?? [],
          exerciseEquipment: exercise.exercise_snapshot?.equipment ?? null,
          snapshot: exercise.exercise_snapshot ?? null,
          supersetGroup: exercise.superset_group ?? null,
          sets: exercise.sets.map((set, setIdx) => ({
            clientId: action.clientIds[exerciseIdx].setClientIds[setIdx],
            restTime: set.rest_time,
            setType: (set.set_type as DraftSetType) ?? undefined,
            duration: set.duration,
            notes: set.notes,
            weight:
              set.weight != null
                ? String(
                    parseFloat(
                      weightFromKg(set.weight, action.weightUnit).toFixed(1)
                    )
                  )
                : '',
            reps: set.reps != null ? String(set.reps) : '',
            distance:
              set.distance != null
                ? String(
                    parseFloat(
                      setDistanceFromKm(
                        set.distance,
                        action.distanceUnit,
                        resolveSnapshotModality(exercise.exercise_snapshot)
                      ).toFixed(2)
                    )
                  )
                : '',
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
  const [state, dispatch] = useReducer(
    presetFormReducer,
    undefined,
    createEmptyDraft
  );
  const initialDescriptionRef = useRef('');

  const {
    exercisesModifiedRef,
    addExercise,
    removeExercise,
    replaceExercise,
    duplicateExercise,
    addSet,
    addWarmupSets,
    removeSet,
    updateSetField,
    updateSetMeta,
    setExerciseRest,
    setExerciseProgression,
    supersetWith,
    ungroupExercise,
    reorderExercises,
  } = useDraftExerciseActions(dispatch, state.exercises, {
    preserveSetsOnReplace: true,
  });

  const setName = useCallback((name: string) => {
    dispatch({ type: 'SET_NAME', name });
  }, []);

  const setDescription = useCallback((description: string) => {
    dispatch({ type: 'SET_DESCRIPTION', description });
  }, []);

  const setWorkoutFormat = useCallback((workoutFormat: WorkoutFormat) => {
    dispatch({ type: 'SET_WORKOUT_FORMAT', workoutFormat });
  }, []);

  const setTimeCapSeconds = useCallback((timeCapSeconds: number | null) => {
    dispatch({ type: 'SET_TIME_CAP_SECONDS', timeCapSeconds });
  }, []);

  const populateFromPreset = useCallback(
    (
      preset: WorkoutPreset,
      weightUnit: 'kg' | 'lbs',
      distanceUnit: 'km' | 'miles'
    ): string[] => {
      const clientIds: PresetClientIds = preset.exercises.map((e) => ({
        exerciseClientId: generateClientId(),
        setClientIds: e.sets.map(() => generateClientId()),
      }));
      exercisesModifiedRef.current = false;
      initialDescriptionRef.current = preset.description ?? '';
      dispatch({
        type: 'POPULATE_FROM_PRESET',
        preset,
        weightUnit,
        distanceUnit,
        clientIds,
      });
      return clientIds.map((c) => c.exerciseClientId);
    },
    [exercisesModifiedRef, dispatch]
  );

  const populateFromSession = useCallback(
    (
      session: PresetSessionResponse,
      weightUnit: 'kg' | 'lbs',
      distanceUnit: 'km' | 'miles'
    ) => {
      const validExercises = (session.exercises ?? []).filter(
        (e) => e.exercise_id != null && e.exercise_id !== ''
      );
      const clientIds: PresetClientIds = validExercises.map((e) => ({
        exerciseClientId: generateClientId(),
        setClientIds: (e.sets ?? []).map(() => generateClientId()),
      }));
      exercisesModifiedRef.current = false;
      dispatch({
        type: 'POPULATE_FROM_SESSION',
        session: {
          ...session,
          exercises: validExercises,
        },
        weightUnit,
        distanceUnit,
        clientIds,
      });
    },
    [exercisesModifiedRef, dispatch]
  );

  return {
    state,
    setName,
    setDescription,
    setWorkoutFormat,
    setTimeCapSeconds,
    addExercise,
    removeExercise,
    replaceExercise,
    duplicateExercise,
    addSet,
    addWarmupSets,
    removeSet,
    updateSetField,
    updateSetMeta,
    setExerciseRest,
    setExerciseProgression,
    supersetWith,
    ungroupExercise,
    reorderExercises,
    populateFromPreset,
    populateFromSession,
    exercisesModifiedRef,
    initialDescriptionRef,
  };
}
