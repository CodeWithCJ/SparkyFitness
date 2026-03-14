import { apiCall } from '@/api/api';
import { parseJsonArray } from './exerciseService';
import type { WorkoutPresetSet } from '@/types/workout';
import { debug } from '@/utils/logging';
import { getUserLoggingLevel } from '@/utils/userPreferences';
import type {
  Exercise,
  ExerciseEntry,
  GroupedExerciseEntry,
  LapDTO,
} from '@/types/exercises';
import type { ExerciseProgressData } from '@/types/reports';
import { ActivityDetailMetric } from '@/pages/Reports/ActivityReportVisualizer';
import {
  CreateExerciseEntriesRequest,
  UpdateExerciseEntriesRequest,
  exerciseEntriesResponseSchema,
} from '@workspace/shared';
import { z } from 'zod';

export const getExerciseEntriesForDate = async (
  date: string
): Promise<GroupedExerciseEntry[]> => {
  const params = new URLSearchParams({ selectedDate: date });
  const response = await apiCall(
    `/exercise-entries/by-date?${params.toString()}`,
    {
      method: 'GET',
      suppress404Toast: true,
    }
  );

  const validated = z.array(exerciseEntriesResponseSchema).parse(response);
  return validated as unknown as GroupedExerciseEntry[];
};

export const fetchExerciseEntries = async (
  selectedDate: string
): Promise<GroupedExerciseEntry[]> => {
  const loggingLevel = getUserLoggingLevel();
  const response = await getExerciseEntriesForDate(selectedDate);

  const parsedEntries: GroupedExerciseEntry[] = (response || []).map(
    (entry) => {
      if (entry.type === 'preset') {
        return {
          ...entry,
          exercises: entry.exercises
            ? entry.exercises.map((ex) => ({
                ...ex,
                sets: ex.sets ? ex.sets : [],
                exercise_snapshot: {
                  ...ex.exercise_snapshot,
                  id: ex.exercise_snapshot.id ?? '',
                  name: ex.exercise_snapshot.name ?? '',
                  description: ex.exercise_snapshot.description ?? null,
                  calories_per_hour:
                    ex.exercise_snapshot.calories_per_hour ?? 0,
                  category: ex.exercise_snapshot.category ?? '',
                  equipment: parseJsonArray(ex.exercise_snapshot.equipment),
                  primary_muscles: parseJsonArray(
                    ex.exercise_snapshot.primary_muscles
                  ),
                  secondary_muscles: parseJsonArray(
                    ex.exercise_snapshot.secondary_muscles
                  ),
                  instructions: parseJsonArray(
                    ex.exercise_snapshot.instructions
                  ),
                  images: parseJsonArray(ex.exercise_snapshot.images),
                } as Exercise,
                activity_details: ex.activity_details
                  ? ex.activity_details.map((detail) => ({
                      id: detail.id ?? '',
                      key: detail.detail_type ?? '',
                      value:
                        typeof detail.detail_data === 'object'
                          ? JSON.stringify(detail.detail_data, null, 2)
                          : String(detail.detail_data),
                      provider_name: detail.provider_name,
                      detail_type: detail.detail_type ?? '',
                    }))
                  : [],
              }))
            : [],
        };
      } else {
        return {
          ...entry,
          sets: entry.sets ? entry.sets : [],
          exercise_snapshot: (entry.exercise_snapshot
            ? {
                ...entry.exercise_snapshot,
                id: entry.exercise_snapshot.id ?? '',
                name: entry.exercise_snapshot.name ?? '',
                description: entry.exercise_snapshot.description ?? null,
                category: entry.exercise_snapshot.category ?? '',
                calories_per_hour:
                  entry.exercise_snapshot.calories_per_hour ?? 0,
                equipment: parseJsonArray(entry.exercise_snapshot.equipment),
                primary_muscles: parseJsonArray(
                  entry.exercise_snapshot.primary_muscles
                ),
                secondary_muscles: parseJsonArray(
                  entry.exercise_snapshot.secondary_muscles
                ),
                instructions: parseJsonArray(
                  entry.exercise_snapshot.instructions
                ),
                images: parseJsonArray(entry.exercise_snapshot.images),
              }
            : {
                id: '',
                name: '',
                category: '',
                calories_per_hour: 0,
                description: null,
                equipment: [],
                primary_muscles: [],
                secondary_muscles: [],
                instructions: [],
                images: [],
                user_id: null,
                is_custom: false,
                created_at: '',
                updated_at: '',
              }) as Exercise,
          activity_details: entry.activity_details
            ? entry.activity_details.map((detail) => ({
                id: detail.id ?? '',
                key: detail.detail_type ?? '',
                value:
                  typeof detail.detail_data === 'object'
                    ? JSON.stringify(detail.detail_data, null, 2)
                    : String(detail.detail_data),
                provider_name: detail.provider_name,
                detail_type: detail.detail_type ?? '',
              }))
            : [],
        };
      }
    }
  ) as GroupedExerciseEntry[];

  debug(
    loggingLevel,
    'fetchExerciseEntries: Parsed entries with activity details:',
    parsedEntries
  );
  return parsedEntries;
};

export const createExerciseEntry = async (
  payload: CreateExerciseEntriesRequest & {
    sets: WorkoutPresetSet[];
    imageFile?: File | null;
  }
): Promise<ExerciseEntry> => {
  const { imageFile, ...entryData } = payload;

  if (imageFile) {
    const formData = new FormData();
    formData.append('image', imageFile);

    // Append other data from the payload to formData
    Object.entries(entryData).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (key === 'sets' && Array.isArray(value)) {
          // The backend expects 'sets' to be a JSON string if it's part of FormData
          formData.append(key, JSON.stringify(value));
        } else if (typeof value === 'object' && !Array.isArray(value)) {
          formData.append(key, JSON.stringify(value));
        } else if (key === 'activity_details' && Array.isArray(value)) {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, String(value));
        }
      }
    });

    const response = await apiCall('/exercise-entries', {
      method: 'POST',
      body: formData,
      isFormData: true, // Explicitly mark as FormData
    });
    return exerciseEntriesResponseSchema.parse(
      response
    ) as unknown as ExerciseEntry;
  } else {
    const response = await apiCall('/exercise-entries', {
      method: 'POST',
      body: entryData,
      headers: { 'Content-Type': 'application/json' },
    });
    return exerciseEntriesResponseSchema.parse(
      response
    ) as unknown as ExerciseEntry;
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

export type UpdateExerciseEntryPayload = UpdateExerciseEntriesRequest & {
  sets?: WorkoutPresetSet[];
  imageFile?: File | null;
};

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

    Object.entries(entryData).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (key === 'sets' && Array.isArray(value)) {
          formData.append(key, JSON.stringify(value));
        } else if (typeof value === 'object' && !Array.isArray(value)) {
          formData.append(key, JSON.stringify(value));
        } else if (key === 'activity_details' && Array.isArray(value)) {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, String(value));
        }
      }
    });

    const response = await apiCall(`/exercise-entries/${entryId}`, {
      method: 'PUT',
      body: formData,
      isFormData: true,
    });
    return exerciseEntriesResponseSchema.parse(
      response
    ) as unknown as ExerciseEntry;
  } else {
    // workaround because the backend deletes the image when an url is in the request
    const { image_url, ...dataToSend } = entryData;
    // If no new image, send as JSON
    const response = await apiCall(`/exercise-entries/${entryId}`, {
      method: 'PUT',
      body: dataToSend,
      headers: { 'Content-Type': 'application/json' },
    });
    return exerciseEntriesResponseSchema.parse(
      response
    ) as unknown as ExerciseEntry;
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
  const validated = z.array(exerciseEntriesResponseSchema).parse(response);
  return validated as unknown as ExerciseEntry[];
};

export const fetchExerciseDetails = async (
  exerciseId: string
): Promise<{ calories_per_hour: number }> => {
  return apiCall(`/exercises/${exerciseId}`, {
    method: 'GET',
  });
};

export interface ActivityDetailsResponse {
  id?: string;
  activity?: {
    details?: {
      metricDescriptors?: unknown[];
      activityDetailMetrics?: ActivityDetailMetric[];
      geoPolylineDTO?: {
        polyline: { lat: number; lon: number }[];
      };
      [key: string]: unknown;
    };
    hr_in_timezones?: unknown[];
    splits?: {
      lapDTOs: LapDTO[];
      [key: string]: unknown;
    };
    activity?: {
      duration?: number;
      calories?: number;
      totalAscent?: number;
      averageHR?: number;
      averageRunCadence?: number;
      distance?: number;
      averagePace?: number;
      activityName?: string;
      eventType?: unknown;
      course?: unknown;
      gear?: unknown;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  workout?: {
    workoutName: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export const getActivityDetails = async (
  exerciseEntryId: string,
  providerName: string
): Promise<ActivityDetailsResponse> => {
  return apiCall(
    `/exercises/activity-details/${exerciseEntryId}/${providerName}`,
    {
      method: 'GET',
    }
  );
};
