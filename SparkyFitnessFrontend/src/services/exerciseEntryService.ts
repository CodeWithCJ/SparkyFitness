import { apiCall } from './api';
import { getExerciseEntriesForDate as getDailyExerciseEntries } from './dailyProgressService';
import { Exercise } from './exerciseSearchService'; // Import the comprehensive Exercise interface
import { parseJsonArray } from './exerciseService'; // Import parseJsonArray
import { ExerciseProgressData } from './reportsService'; // Import ExerciseProgressData
import { WorkoutPresetSet } from '@/types/workout';
import { ActivityDetailKeyValuePair } from '@/components/ExerciseActivityDetailsEditor'; // New import

export interface ExerciseEntry {
  id: string;
  exercise_id: string;
  duration_minutes?: number;
  calories_burned: number;
  entry_date: string;
  notes?: string;
  sets: WorkoutPresetSet[];
  image_url?: string;
  distance?: number;
  avg_heart_rate?: number;
  exercises: Exercise;
  activity_details?: ActivityDetailKeyValuePair[]; // New field
}

export const fetchExerciseEntries = async (selectedDate: string): Promise<ExerciseEntry[]> => {
  const response = await getDailyExerciseEntries(selectedDate);
  
  const parsedEntries = response.map((entry: any) => ({
    ...entry,
    exercises: entry.exercises ? {
      ...entry.exercises,
      equipment: parseJsonArray(entry.exercises.equipment),
      primary_muscles: parseJsonArray(entry.exercises.primary_muscles),
      secondary_muscles: parseJsonArray(entry.exercises.secondary_muscles),
      instructions: parseJsonArray(entry.exercises.instructions),
      images: parseJsonArray(entry.exercises.images),
    } : entry.exercises,
    activity_details: entry.activity_details ? entry.activity_details
      .map((detail: any) => {
        return {
          id: detail.id,
          key: detail.detail_type,
          value: typeof detail.detail_data === 'object' ? JSON.stringify(detail.detail_data, null, 2) : detail.detail_data,
          provider_name: detail.provider_name,
          detail_type: detail.detail_type,
        };
      }) : [],
  }));
 
  console.log('DEBUG', 'fetchExerciseEntries: Parsed entries with activity details:', parsedEntries);
  return parsedEntries;
};

export const createExerciseEntry = async (payload: {
  exercise_id: string;
  entry_date: string;
  notes?: string;
  sets: WorkoutPresetSet[];
  image_url?: string;
  calories_burned?: number;
  distance?: number;
  avg_heart_rate?: number;
  imageFile?: File | null;
  activity_details?: { provider_name?: string; detail_type: string; detail_data: string; }[]; // New field
}): Promise<ExerciseEntry> => {
  const { imageFile, ...entryData } = payload;

  if (imageFile) {
    const formData = new FormData();
    formData.append('image', imageFile);
    
    // Append other data from the payload to formData
    Object.keys(entryData).forEach(key => {
      const value = (entryData as any)[key];
      if (value !== undefined && value !== null) {
        if (key === 'sets' && Array.isArray(value)) {
          // The backend expects 'sets' to be a JSON string if it's part of FormData
          formData.append(key, JSON.stringify(value));
        } else if (typeof value === 'object' && !Array.isArray(value)) {
          formData.append(key, JSON.stringify(value));
        } else if (key === 'activity_details' && Array.isArray(value)) {
          formData.append(key, JSON.stringify(value));
        }
        else if (typeof value === 'object' && !Array.isArray(value)) {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, value);
        }
      }
    });

    return apiCall('/exercise-entries', {
      method: 'POST',
      body: formData,
      isFormData: true, // Explicitly mark as FormData
    });
  } else {
    return apiCall('/exercise-entries', {
      method: 'POST',
      body: entryData,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const logWorkoutPreset = async (workoutPresetId: string, entryDate: string): Promise<ExerciseEntry[]> => {
  return apiCall('/exercise-entries/from-preset', {
    method: 'POST',
    body: JSON.stringify({ workout_preset_id: workoutPresetId, entry_date: entryDate }),
  });
};

export const deleteExerciseEntry = async (entryId: string): Promise<void> => {
  return apiCall(`/exercise-entries/${entryId}`, {
    method: 'DELETE',
  });
};

export const updateExerciseEntry = async (entryId: string, payload: {
  duration_minutes?: number;
  calories_burned?: number;
  notes?: string;
  sets?: WorkoutPresetSet[];
  image_url?: string;
  distance?: number;
  avg_heart_rate?: number;
  imageFile?: File | null;
  activity_details?: { id?: string; provider_name?: string; detail_type: string; detail_data: string; }[]; // New field
}): Promise<ExerciseEntry> => {
  const { imageFile, ...entryData } = payload;
  console.log('updateExerciseEntry payload:', payload);
  console.log('updateExerciseEntry entryData:', entryData);
  
  if (imageFile) {
    const formData = new FormData();
    formData.append('image', imageFile);
    
    Object.keys(entryData).forEach(key => {
      const value = (entryData as any)[key];
      if (value !== undefined && value !== null) {
        if (key === 'sets' && Array.isArray(value)) {
          formData.append(key, JSON.stringify(value));
        } else if (typeof value === 'object' && !Array.isArray(value)) {
          formData.append(key, JSON.stringify(value));
        } else if (key === 'activity_details' && Array.isArray(value)) {
          formData.append(key, JSON.stringify(value));
        }
        else if (typeof value === 'object' && !Array.isArray(value)) {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, value);
        }
      }
    });

    return apiCall(`/exercise-entries/${entryId}`, {
      method: 'PUT',
      body: formData,
      isFormData: true,
    });
  } else {
    // If no new image, send as JSON
    return apiCall(`/exercise-entries/${entryId}`, {
      method: 'PUT',
      body: entryData,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const getExerciseProgressData = async (exerciseId: string, startDate: string, endDate: string, aggregationLevel: string = 'daily'): Promise<ExerciseProgressData[]> => {
  const params = new URLSearchParams({
    startDate,
    endDate,
    aggregationLevel,
  });
  const response = await apiCall(`/exercise-entries/progress/${exerciseId}?${params.toString()}`, {
    method: 'GET',
  });
  return response;
};

export const searchExercises = async (query: string, filterType: string): Promise<Exercise[]> => {
  if (!query.trim()) {
    return [];
  }
  const params = new URLSearchParams({ searchTerm: query, ownershipFilter: filterType });
  const data = await apiCall(`/exercises?${params.toString()}`, {
    method: 'GET',
    suppress404Toast: true, // Suppress toast for 404
  });
  return data.exercises || []; // Return empty array if 404 or no exercises found
};

export const getExerciseHistory = async (exerciseId: string, limit: number = 5): Promise<ExerciseEntry[]> => {
  const params = new URLSearchParams({
    limit: limit.toString(),
  });
  const response = await apiCall(`/exercise-entries/history/${exerciseId}?${params.toString()}`, {
    method: 'GET',
  });
  return response;
};