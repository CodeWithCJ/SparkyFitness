import { apiCall } from '@/api/api';
import { Exercise } from '@/types/exercises';

export const searchExercises = async (
  query: string,
  equipmentFilter: string[] = [],
  muscleGroupFilter: string[] = []
): Promise<Exercise[]> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

export const searchExternalExercises = async (
  query: string,
  providerId: string,
  providerType: string,
  equipmentFilter: string[] = [],
  muscleGroupFilter: string[] = [],
  limit?: number
): Promise<Exercise[]> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

export const addExternalExerciseToUserExercises = async (
  wgerExerciseId: string
): Promise<Exercise> => {
  return apiCall(`/exercises/add-external`, {
    method: 'POST',
    body: JSON.stringify({ wgerExerciseId }),
  });
};

export const addNutritionixExercise = async (
  nutritionixExerciseData: Exercise
): Promise<Exercise> => {
  return apiCall(`/exercises/add-nutritionix-exercise`, {
    method: 'POST',
    body: JSON.stringify(nutritionixExerciseData),
  });
};

export const addFreeExerciseDBExercise = async (
  freeExerciseDBId: string
): Promise<Exercise> => {
  return apiCall(`/freeexercisedb/add`, {
    method: 'POST',
    body: JSON.stringify({ exerciseId: freeExerciseDBId }),
  });
};

export const getRecentExercises = async (
  userId: string,
  limit: number = 5
): Promise<Exercise[]> => {
  const result = await apiCall('/exercises/recent', {
    method: 'GET',
    params: { userId, limit },
  });
  return Array.isArray(result) ? result : [];
};

export const getTopExercises = async (
  userId: string,
  limit: number = 5
): Promise<Exercise[]> => {
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

export const getAvailableExercises = async (
  muscle?: string | null,
  equipment?: string | null
): Promise<{ id: string; name: string }[]> => {
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
