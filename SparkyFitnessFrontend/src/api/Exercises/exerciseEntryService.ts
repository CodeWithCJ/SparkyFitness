import { apiCall } from '@/api/api';
import type { WorkoutPresetSet } from '@/types/workout';
import { debug } from '@/utils/logging';
import { getUserLoggingLevel } from '@/utils/userPreferences';
import type { LapDTO } from '@/types/exercises';
import type { ExerciseProgressData } from '@/types/reports';
import { ActivityDetailMetric } from '@/pages/Reports/ActivityReportVisualizer';
import {
  ExerciseHistoryResponse,
  exerciseHistoryResponseSchema,
  ExerciseSessionResponse,
  exerciseSessionResponseSchema,
  ExerciseEntryResponse,
  exerciseEntryResponseSchema,
} from '@workspace/shared';
import z from 'zod';

export const fetchExerciseEntries = async (
  date: string,
  userId?: string
): Promise<ExerciseSessionResponse[]> => {
  const params = new URLSearchParams({ selectedDate: date });
  if (userId) {
    params.append('userId', userId);
  }
  const response = await apiCall(
    `/v2/exercise-entries/by-date?${params.toString()}`,
    {
      method: 'GET',
    }
  );
  return z.array(exerciseSessionResponseSchema).parse(response);
};

export const fetchExerciseEntryHistoryV2 = async (
  page: number = 1,
  pageSize: number = 20,
  userId?: string
): Promise<ExerciseHistoryResponse> => {
  const params = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
  });
  if (userId) {
    params.append('userId', userId);
  }

  const response = await apiCall(
    `/v2/exercise-entries/history?${params.toString()}`,
    {
      method: 'GET',
    }
  );
  return exerciseHistoryResponseSchema.parse(response);
};

export const createExerciseEntry = async (payload: {
  exercise_id: string;
  entry_date: string;
  notes?: string;
  sets: WorkoutPresetSet[];
  image_url?: string;
  calories_burned?: number;
  distance?: number | null;
  avg_heart_rate?: number | null;
  imageFile?: File | null;
  activity_details?: {
    provider_name?: string;
    detail_type: string;
    detail_data: string;
  }[]; // New field
}): Promise<void> => {
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
): Promise<void> => {
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
  image_url?: string | null;
  distance?: number | null;
  avg_heart_rate?: number | null;
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
): Promise<void> => {
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
): Promise<ExerciseEntryResponse[]> => {
  const params = new URLSearchParams({
    limit: limit.toString(),
  });
  const response = await apiCall(
    `/exercise-entries/history/${exerciseId}?${params.toString()}`,
    {
      method: 'GET',
    }
  );
  return z.array(exerciseEntryResponseSchema).parse(response);
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
