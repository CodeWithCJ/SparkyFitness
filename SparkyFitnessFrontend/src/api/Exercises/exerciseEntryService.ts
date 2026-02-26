import { apiCall } from '@/api/api';
import { getExerciseEntriesForDate as getDailyExerciseEntries } from '@/api/Diary/dailyProgressService';
import type { Exercise } from './exerciseSearchService';
import { parseJsonArray } from './exerciseService';
import type { ExerciseProgressData } from '@/api/Reports/reportsService';
import type { WorkoutPresetSet } from '@/types/workout';
import type { ActivityDetailKeyValuePair } from '@/components/ExerciseActivityDetailsEditor';
import { debug } from '@/utils/logging';
import { getUserLoggingLevel } from '@/utils/userPreferences';

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
  exercise_snapshot: Exercise; // Renamed from 'exercises' to 'exercise_snapshot'
  activity_details?: ActivityDetailKeyValuePair[]; // New field
  exercise_preset_entry_id?: string; // New field
  created_at: string; // Add created_at for sorting
}

// Define a type for the grouped entries returned by the backend
export interface GroupedExerciseEntry {
  type: 'individual' | 'preset';
  id: string; // UUID for individual exercise entry or exercise preset entry
  created_at: string; // For sorting
  // Common fields for individual exercise entries
  exercise_id?: string;
  duration_minutes?: number;
  calories_burned?: number;
  entry_date?: string;
  notes?: string;
  workout_plan_assignment_id?: number;
  image_url?: string;
  created_by_user_id?: string;
  exercise_name?: string;
  calories_per_hour?: number;
  updated_by_user_id?: string;
  category?: string;
  source?: string;
  source_id?: string;
  force?: string;
  level?: string;
  mechanic?: string;
  equipment?: string[];
  primary_muscles?: string[];
  secondary_muscles?: string[];
  instructions?: string[];
  images?: string[];
  distance?: number;
  avg_heart_rate?: number;
  sets?: WorkoutPresetSet[];
  exercise_snapshot?: Exercise; // Snapshot of exercise details

  // Fields specific to preset entries
  workout_preset_id?: number;
  name?: string; // Name of the preset entry
  description?: string;
  // Array of individual exercise entries within this preset
  exercises?: ExerciseEntry[]; // This will hold the individual exercise entries
}

export const fetchExerciseEntries = async (
  selectedDate: string
): Promise<GroupedExerciseEntry[]> => {
  const loggingLevel = getUserLoggingLevel();
  const response = await getDailyExerciseEntries(selectedDate);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsedEntries: GroupedExerciseEntry[] = response.map((entry: any) => {
    if (entry.type === 'preset') {
      return {
        ...entry,
        exercises: entry.exercises
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            entry.exercises.map((ex: any) => ({
              ...ex,
              sets: ex.sets ? parseJsonArray(ex.sets) : [], // Parse sets if it's a JSON string
              exercise_snapshot: {
                ...ex.exercise_snapshot, // Use the existing snapshot
                equipment: parseJsonArray(ex.exercise_snapshot.equipment),
                primary_muscles: parseJsonArray(
                  ex.exercise_snapshot.primary_muscles
                ),
                secondary_muscles: parseJsonArray(
                  ex.exercise_snapshot.secondary_muscles
                ),
                instructions: parseJsonArray(ex.exercise_snapshot.instructions),
                images: parseJsonArray(ex.exercise_snapshot.images),
              },
              activity_details: ex.activity_details
                ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  ex.activity_details.map((detail: any) => ({
                    id: detail.id,
                    key: detail.detail_type,
                    value:
                      typeof detail.detail_data === 'object'
                        ? JSON.stringify(detail.detail_data, null, 2)
                        : detail.detail_data,
                    provider_name: detail.provider_name,
                    detail_type: detail.detail_type,
                  }))
                : [],
            }))
          : [],
      };
    } else {
      return {
        ...entry,
        sets: entry.sets ? parseJsonArray(entry.sets) : [], // Parse sets if it's a JSON string
        exercise_snapshot: {
          ...entry.exercise_snapshot, // Use the existing snapshot
          equipment: parseJsonArray(entry.exercise_snapshot.equipment),
          primary_muscles: parseJsonArray(
            entry.exercise_snapshot.primary_muscles
          ),
          secondary_muscles: parseJsonArray(
            entry.exercise_snapshot.secondary_muscles
          ),
          instructions: parseJsonArray(entry.exercise_snapshot.instructions),
          images: parseJsonArray(entry.exercise_snapshot.images),
        },
        activity_details: entry.activity_details
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            entry.activity_details.map((detail: any) => ({
              id: detail.id,
              key: detail.detail_type,
              value:
                typeof detail.detail_data === 'object'
                  ? JSON.stringify(detail.detail_data, null, 2)
                  : detail.detail_data,
              provider_name: detail.provider_name,
              detail_type: detail.detail_type,
            }))
          : [],
      };
    }
  });

  debug(
    loggingLevel,
    'fetchExerciseEntries: Parsed entries with activity details:',
    parsedEntries
  );
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
  activity_details?: {
    provider_name?: string;
    detail_type: string;
    detail_data: string;
  }[]; // New field
}): Promise<ExerciseEntry> => {
  const { imageFile, ...entryData } = payload;

  if (imageFile) {
    const formData = new FormData();
    formData.append('image', imageFile);

    // Append other data from the payload to formData
    Object.keys(entryData).forEach((key) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const value = (entryData as any)[key];
      if (value !== undefined && value !== null) {
        if (key === 'sets' && Array.isArray(value)) {
          // The backend expects 'sets' to be a JSON string if it's part of FormData
          formData.append(key, JSON.stringify(value));
        } else if (typeof value === 'object' && !Array.isArray(value)) {
          formData.append(key, JSON.stringify(value));
        } else if (key === 'activity_details' && Array.isArray(value)) {
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

export const logWorkoutPreset = async (
  workoutPresetId: string | number,
  entryDate: string
): Promise<GroupedExerciseEntry> => {
  return apiCall('/exercise-preset-entries', {
    method: 'POST',
    body: JSON.stringify({
      workout_preset_id: workoutPresetId,
      entry_date: entryDate,
    }),
  });
};

export const deleteExerciseEntry = async (entryId: string): Promise<void> => {
  return apiCall(`/exercise-entries/${entryId}`, {
    method: 'DELETE',
  });
};

export const deleteExercisePresetEntry = async (
  presetEntryId: string
): Promise<void> => {
  return apiCall(`/exercise-preset-entries/${presetEntryId}`, {
    method: 'DELETE',
  });
};

export interface UpdateExerciseEntryPayload {
  duration_minutes?: number;
  calories_burned?: number;
  notes?: string;
  sets?: WorkoutPresetSet[];
  image_url?: string;
  distance?: number;
  avg_heart_rate?: number;
  imageFile?: File | null;
  activity_details?: {
    id?: string;
    provider_name?: string;
    detail_type: string;
    detail_data: string;
  }[];
}

export const updateExerciseEntry = async (
  entryId: string,
  payload: UpdateExerciseEntryPayload // New field
): Promise<ExerciseEntry> => {
  const { imageFile, ...entryData } = payload;
  const loggingLevel = getUserLoggingLevel();
  debug(loggingLevel, 'updateExerciseEntry payload:', payload);
  debug(loggingLevel, 'updateExerciseEntry entryData:', entryData);

  if (imageFile) {
    const formData = new FormData();
    formData.append('image', imageFile);

    Object.keys(entryData).forEach((key) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const value = (entryData as any)[key];
      if (value !== undefined && value !== null) {
        if (key === 'sets' && Array.isArray(value)) {
          formData.append(key, JSON.stringify(value));
        } else if (typeof value === 'object' && !Array.isArray(value)) {
          formData.append(key, JSON.stringify(value));
        } else if (key === 'activity_details' && Array.isArray(value)) {
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
    // workaround because the backend deletes the image when an url is in the request
    const { image_url, ...dataToSend } = entryData;
    // If no new image, send as JSON
    return apiCall(`/exercise-entries/${entryId}`, {
      method: 'PUT',
      body: dataToSend,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const getExerciseProgressData = async (
  exerciseId: string,
  startDate: string,
  endDate: string,
  aggregationLevel: string = 'daily'
): Promise<ExerciseProgressData[]> => {
  const params = new URLSearchParams({
    startDate,
    endDate,
    aggregationLevel,
  });
  const response = await apiCall(
    `/exercise-entries/progress/${exerciseId}?${params.toString()}`,
    {
      method: 'GET',
    }
  );
  // Ensure that exercise_entry_id and provider_name are included in the returned data
  return response.map((entry: ExerciseProgressData) => ({
    ...entry,
    exercise_entry_id: entry.exercise_entry_id || '', // Provide a default or ensure it's always present
    provider_name: entry.provider_name || '', // Provide a default or ensure it's always present
  }));
};

export const getExerciseHistory = async (
  exerciseId: string,
  limit: number = 5
): Promise<ExerciseEntry[]> => {
  const params = new URLSearchParams({
    limit: limit.toString(),
  });
  const response = await apiCall(
    `/exercise-entries/history/${exerciseId}?${params.toString()}`,
    {
      method: 'GET',
    }
  );
  return response;
};

export const fetchExerciseDetails = async (
  exerciseId: string
): Promise<{ calories_per_hour: number }> => {
  return apiCall(`/exercises/${exerciseId}`, {
    method: 'GET',
  });
};
