import { apiCall } from './api';

export interface Exercise {
  id: string;
  source?: string; // e.g., 'manual', 'wger', 'free-exercise-db'
  source_id?: string; // ID from the external source
  name: string;
  force?: string; // e.g., 'static', 'pull', 'push'
  level?: string; // e.g., 'beginner', 'intermediate', 'expert'
  mechanic?: string; // e.g., 'isolation', 'compound'
  equipment?: string[]; // Stored as JSON array of strings
  primary_muscles?: string[]; // Stored as JSON array of strings
  secondary_muscles?: string[]; // Stored as JSON array of strings
  instructions?: string[]; // Stored as JSON array of strings
  category: string; // e.g., 'strength', 'cardio'
  images?: string[]; // Stored as JSON array of URLs (local paths after download)
  calories_per_hour: number;
  description?: string;
  duration_min?: number; // Added duration_min
  user_id?: string;
  is_custom?: boolean;
  shared_with_public?: boolean;
  created_at?: string;
  updated_at?: string;
  tags?: string[];
}

export const searchExercises = async (query: string, equipmentFilter: string[] = [], muscleGroupFilter: string[] = []): Promise<Exercise[]> => {
  const params: Record<string, any> = {
    searchTerm: query,
  };
  if (equipmentFilter.length > 0) {
    params.equipmentFilter = equipmentFilter.join(',');
  }
  if (muscleGroupFilter.length > 0) {
    params.muscleGroupFilter = muscleGroupFilter.join(',');
  }
  const result = await apiCall('/exercises/search', {
    method: 'GET',
    params: params,
  });
  return Array.isArray(result) ? result : [];
};

export const searchExternalExercises = async (query: string, providerId: string, providerType: string, equipmentFilter: string[] = [], muscleGroupFilter: string[] = [], limit?: number): Promise<Exercise[]> => {
  const params: Record<string, any> = {
    query: query,
    providerId: providerId,
    providerType: providerType,
  };

  if (equipmentFilter.length > 0) {
    params.equipmentFilter = equipmentFilter.join(',');
  }
  if (muscleGroupFilter.length > 0) {
    params.muscleGroupFilter = muscleGroupFilter.join(',');
  }
  if (limit !== undefined) {
    params.limit = limit;
  }

  const result = await apiCall('/exercises/search-external', {
    method: 'GET',
    params: params,
  });
  return Array.isArray(result) ? result : [];
};

export const addExternalExerciseToUserExercises = async (wgerExerciseId: string): Promise<Exercise> => {
  return apiCall(`/exercises/add-external`, {
    method: 'POST',
    body: JSON.stringify({ wgerExerciseId }),
  });
};

export const addNutritionixExercise = async (nutritionixExerciseData: Exercise): Promise<Exercise> => {
  return apiCall(`/exercises/add-nutritionix-exercise`, {
    method: 'POST',
    body: JSON.stringify(nutritionixExerciseData),
  });
};

export const addFreeExerciseDBExercise = async (freeExerciseDBId: string): Promise<Exercise> => {
  return apiCall(`/freeexercisedb/add`, {
    method: 'POST',
    body: JSON.stringify({ exerciseId: freeExerciseDBId }),
  });
};

export const getRecentExercises = async (userId: string, limit: number = 5): Promise<Exercise[]> => {
  const result = await apiCall('/exercises/recent', {
    method: 'GET',
    params: { userId, limit },
  });
  return Array.isArray(result) ? result : [];
};

export const getTopExercises = async (userId: string, limit: number = 5): Promise<Exercise[]> => {
  const result = await apiCall('/exercises/top', {
    method: 'GET',
    params: { userId, limit },
  });
  return Array.isArray(result) ? result : [];
};

export const getAvailableEquipment = async (): Promise<string[]> => {
  const response = await apiCall('/exercises/equipment', {
    method: 'GET',
  });
  return Array.isArray(response) ? response : [];
};

export const getAvailableExercises = async (muscle?: string | null, equipment?: string | null): Promise<{ id: string, name: string }[]> => {
  const params = new URLSearchParams();
  if (muscle) {
    params.append('muscle', muscle);
  }
  if (equipment) {
    params.append('equipment', equipment);
  }
  // Assuming the endpoint can return objects with id and name.
  // If the endpoint `/exercises/names` only returns names, a new endpoint might be needed.
  // For now, let's assume we can change it to return what we need.
  const response = await apiCall(`/exercises/names?${params.toString()}`, {
    method: 'GET',
  });
  return Array.isArray(response) ? response : [];
};

export const getAvailableMuscleGroups = async (): Promise<string[]> => {
  const response = await apiCall('/exercises/muscle-groups', {
    method: 'GET',
  });
  return Array.isArray(response) ? response : [];
};