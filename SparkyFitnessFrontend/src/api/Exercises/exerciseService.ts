import { apiCall } from '@/api/api';
import { withBasePath } from '@/utils/basePath';
import { ExerciseCSVData } from '@/pages/Exercises/ExerciseImportCSV';
import {
  Exercise,
  ExerciseDeletionImpact,
  ExerciseDeleteMode,
  ExerciseOwnershipFilter,
  HistoryImportEntry,
} from '@/types/exercises';
import { exerciseSnapshotResponseSchema } from '@workspace/shared';
import type { BodyFigure, ImportFitResponse } from '@workspace/shared';
import z from 'zod';

// Helper function to safely parse JSON strings that might be arrays
export const parseJsonArray = (
  value: string | string[] | undefined | null
): string[] | null => {
  if (!value) return null;

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    let currentString = value;
    let changed = true;

    // Attempt to parse as JSON and strip quotes repeatedly
    while (changed) {
      changed = false;
      try {
        const tempParsed = JSON.parse(currentString);
        if (typeof tempParsed === 'string') {
          // If JSON.parse results in a string, update currentString and try again
          if (tempParsed !== currentString) {
            // Only change if actual parsing happened
            currentString = tempParsed;
            changed = true;
          }
        } else if (Array.isArray(tempParsed)) {
          return tempParsed; // Found an array, return it
        } else {
          // Not a string or array after parsing, stop
          break;
        }
      } catch (e) {
        // JSON.parse failed, try stripping outer quotes
        const stripped = currentString.replace(/^"|"$/g, '');
        if (stripped !== currentString) {
          currentString = stripped;
          changed = true;
        } else {
          // No more outer quotes to strip, stop
          break;
        }
      }
    }

    // After all attempts, if it's a string, treat it as a single element array
    if (typeof currentString === 'string') {
      return [currentString];
    }
  }
  return null;
};

export interface ExercisePayload {
  name: string;
  category: string;
  calories_per_hour: number;
  description?: string | null;
  user_id?: string | null;
  is_custom?: boolean;
  shared_with_public?: boolean;
  source?: string;
  force?: string;
  level?: string;
  mechanic?: string;
  equipment?: string[];
  primary_muscles?: string[];
  secondary_muscles?: string[];
  instructions?: string[];
  images?: string[];
}

export const loadExercises = async (
  searchTerm: string = '',
  categoryFilter: string = 'all',
  ownershipFilter: ExerciseOwnershipFilter = 'all',
  currentPage: number = 1,
  itemsPerPage: number = 10,
  sortBy: string = 'name:asc'
): Promise<{ exercises: Exercise[]; totalCount: number }> => {
  const queryParams = new URLSearchParams({
    searchTerm,
    categoryFilter,
    ownershipFilter,
    currentPage: currentPage.toString(),
    itemsPerPage: itemsPerPage.toString(),
    sortBy,
  }).toString();

  const response = await apiCall(`/exercises?${queryParams}`, {
    method: 'GET',
  });

  const parsedExercises = response.exercises.map((exercise: Exercise) => ({
    ...exercise,
    equipment: parseJsonArray(exercise.equipment),
    primary_muscles: parseJsonArray(exercise.primary_muscles),
    secondary_muscles: parseJsonArray(exercise.secondary_muscles),
    instructions: parseJsonArray(exercise.instructions),
    images: parseJsonArray(exercise.images),
  }));

  const validatedExercises = z
    .array(exerciseSnapshotResponseSchema)
    .parse(parsedExercises);

  return {
    exercises: validatedExercises,
    totalCount: response.totalCount,
  };
};

export const createExercise = async (
  payload: ExercisePayload | FormData
): Promise<Exercise> => {
  if (payload instanceof FormData) {
    return apiCall('/exercises', {
      method: 'POST',
      body: payload,
      isFormData: true, // Custom flag to indicate FormData
    });
  } else {
    return apiCall('/exercises', {
      method: 'POST',
      body: payload,
    });
  }
};

export const updateExercise = async (
  id: string,
  payload: Partial<ExercisePayload> | FormData
): Promise<Exercise> => {
  if (payload instanceof FormData) {
    return apiCall(`/exercises/${id}`, {
      method: 'PUT',
      body: payload,
      isFormData: true,
    });
  } else {
    return apiCall(`/exercises/${id}`, {
      method: 'PUT',
      body: payload,
    });
  }
};

export const deleteExercise = async (
  id: string,
  mode: ExerciseDeleteMode = 'delete',
  clientDate?: string
): Promise<{ message?: string; status?: string } | void> => {
  const params = new URLSearchParams({ mode });
  if (clientDate) {
    params.set('clientDate', clientDate);
  }
  return apiCall(`/exercises/${id}?${params.toString()}`, {
    method: 'DELETE',
  });
};

export const updateExerciseShareStatus = async (
  id: string,
  sharedWithPublic: boolean
): Promise<Exercise> => {
  const payload = new FormData();
  payload.append(
    'exerciseData',
    JSON.stringify({ shared_with_public: sharedWithPublic })
  );
  return apiCall(`/exercises/${id}`, {
    method: 'PUT',
    body: payload,
    isFormData: true,
  });
};

export const getExerciseDeletionImpact = async (
  exerciseId: string
): Promise<ExerciseDeletionImpact> => {
  const response = await apiCall(`/exercises/${exerciseId}/deletion-impact`, {
    method: 'GET',
  });
  // Normalize shape: server may return counts; build isUsedByOthers based on otherUserReferences
  const otherUserRefs =
    response.otherUserReferences ?? response.otherUserReferencesCount ?? 0;
  return {
    exerciseEntriesCount: response.exerciseEntriesCount ?? 0,
    workoutPlansCount: response.workoutPlansCount ?? 0,
    workoutPresetsCount: response.workoutPresetsCount ?? 0,
    totalReferences: response.totalReferences ?? 0,
    isUsedByOthers: (otherUserRefs || 0) > 0,
    otherUserReferences: otherUserRefs || 0,
  } as ExerciseDeletionImpact;
};

export const updateExerciseEntriesSnapshot = async (
  exerciseId: string
): Promise<void> => {
  return apiCall(`/exercises/update-snapshot`, {
    method: 'POST',
    body: { exerciseId },
  });
};

export const getExerciseById = async (id: string): Promise<Exercise> => {
  const response = await apiCall(`/exercises/${id}`, {
    method: 'GET',
  });
  // Ensure arrays are parsed correctly
  return {
    ...response,
    equipment: parseJsonArray(response.equipment),
    primary_muscles: parseJsonArray(response.primary_muscles),
    secondary_muscles: parseJsonArray(response.secondary_muscles),
    instructions: parseJsonArray(response.instructions),
    images: parseJsonArray(response.images),
  };
};

export const importExercisesFromJson = async (
  exercises: Omit<ExerciseCSVData, 'id'>[]
): Promise<unknown> => {
  return apiCall('/exercises/import-json', {
    method: 'POST',
    body: { exercises },
  });
};
export const importExerciseHistory = async (
  entries: HistoryImportEntry[]
): Promise<unknown> => {
  return apiCall('/exercise-entries/import-history-csv', {
    method: 'POST',
    body: { entries },
  });
};

export const importFitFiles = async (
  files: File[]
): Promise<ImportFitResponse> => {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }
  return apiCall('/exercise-entries/import-fit', {
    method: 'POST',
    body: formData,
    isFormData: true,
  }) as Promise<ImportFitResponse>;
};

// The files live in /public, so the URLs are not content-hashed. Bump a
// figure's version when its drawing changes or browsers keep the old one.
export const BODY_MAP_SVG_VERSION: Record<BodyFigure, string> = {
  male: 'lats1',
  female: 'f1',
};

export const getBodyMapSvg = async (
  figure: BodyFigure = 'male'
): Promise<string> => {
  const response = await fetch(
    withBasePath(
      `/images/muscle-${figure}.svg?v=${BODY_MAP_SVG_VERSION[figure]}`
    )
  );
  if (!response.ok) {
    throw new Error('Failed to fetch SVG');
  }
  return response.text();
};
