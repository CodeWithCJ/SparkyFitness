import type {
  WorkoutPresetResponse,
  WorkoutPresetExerciseResponse,
  WorkoutPresetSetResponse,
  WorkoutPresetsListResponse,
} from '@workspace/shared';

// Preset wire types come from the shared API schemas; these aliases keep the
// mobile-local names the screens and hooks were written against.
export type WorkoutPresetSet = WorkoutPresetSetResponse;
export type WorkoutPresetExercise = WorkoutPresetExerciseResponse;
export type WorkoutPreset = WorkoutPresetResponse;
export type WorkoutPresetsResponse = WorkoutPresetsListResponse;
