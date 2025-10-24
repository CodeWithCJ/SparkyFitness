import { apiCall } from './api';
import { Exercise as ExerciseInterface } from './exerciseSearchService';

// Helper function to safely parse JSON strings that might be arrays
export const parseJsonArray = (value: string | string[] | undefined): string[] | undefined => {
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
          if (tempParsed !== currentString) { // Only change if actual parsing happened
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
  return undefined;
};

export interface Exercise extends ExerciseInterface {
  // No additional fields needed here, as ExerciseInterface is comprehensive
}

export interface ExerciseDeletionImpact {
    exerciseEntriesCount: number;
  // server returns counts; normalize to a boolean for backward compatible UI use
  isUsedByOthers: boolean;
  otherUserReferences?: number;
}

interface ExercisePayload {
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

export type ExerciseOwnershipFilter = 'all' | 'own' | 'family' | 'public' | 'needs-review';

export const loadExercises = async (
  userId: string,
  searchTerm: string = '',
  categoryFilter: string = 'all',
  ownershipFilter: ExerciseOwnershipFilter = 'all',
  currentPage: number = 1,
  itemsPerPage: number = 10
): Promise<{ exercises: Exercise[]; totalCount: number }> => {
  const queryParams = new URLSearchParams({
    userId,
    searchTerm,
    categoryFilter,
    ownershipFilter,
    currentPage: currentPage.toString(),
    itemsPerPage: itemsPerPage.toString(),
  }).toString();

  const response = await apiCall(`/exercises?${queryParams}`, {
    method: 'GET',
  });

  const parsedExercises = response.exercises.map((exercise: any) => ({
    ...exercise,
    equipment: parseJsonArray(exercise.equipment),
    primary_muscles: parseJsonArray(exercise.primary_muscles),
    secondary_muscles: parseJsonArray(exercise.secondary_muscles),
    instructions: parseJsonArray(exercise.instructions),
    images: parseJsonArray(exercise.images),
  }));

  return {
    exercises: parsedExercises,
    totalCount: response.totalCount,
  };
};

export const createExercise = async (payload: ExercisePayload | FormData): Promise<Exercise> => {
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

export const updateExercise = async (id: string, payload: Partial<ExercisePayload> | FormData): Promise<Exercise> => {
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

export const deleteExercise = async (id: string, userId: string, forceDelete: boolean = false): Promise<{ message?: string; status?: string } | void> => {
  const params = new URLSearchParams();
  params.append('userId', userId);
  if (forceDelete) {
    params.append('forceDelete', 'true');
  }
  return apiCall(`/exercises/${id}?${params.toString()}`, {
    method: 'DELETE',
  });
};

export const updateExerciseShareStatus = async (id: string, sharedWithPublic: boolean): Promise<Exercise> => {
    const payload = new FormData();
    payload.append('exerciseData', JSON.stringify({ shared_with_public: sharedWithPublic }));
  return apiCall(`/exercises/${id}`, {
    method: 'PUT',
    body: payload,
    isFormData: true,
  });
};

export const getExerciseDeletionImpact = async (exerciseId: string): Promise<ExerciseDeletionImpact> => {
  const response = await apiCall(`/exercises/${exerciseId}/deletion-impact`, {
    method: 'GET',
  });
  // Normalize shape: server may return counts; build isUsedByOthers based on otherUserReferences
  const otherUserRefs = response.otherUserReferences ?? (response.otherUserReferencesCount ?? 0);
  return {
    exerciseEntriesCount: response.exerciseEntriesCount ?? 0,
    isUsedByOthers: (otherUserRefs || 0) > 0,
    otherUserReferences: otherUserRefs || 0,
  } as ExerciseDeletionImpact;
};
export const getSuggestedExercises = async (limit: number): Promise<{ recentExercises: Exercise[]; topExercises: Exercise[] }> => {
  return apiCall(`/exercises/suggested?limit=${limit}`, {
    method: 'GET',
  });
};

export const updateExerciseEntriesSnapshot = async (exerciseId: string): Promise<void> => {
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

export const importExercisesFromCSV = async (formData: FormData): Promise<{ created: number; updated: number; failed: number; failedRows: any[] }> => {
  return apiCall('/exercises/import', {
    method: 'POST',
    body: formData,
    isFormData: true,
  });
};