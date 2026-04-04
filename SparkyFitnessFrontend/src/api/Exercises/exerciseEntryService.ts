import { apiCall } from '@/api/api';
import { debug } from '@/utils/logging';
import { getUserLoggingLevel } from '@/utils/userPreferences';
import type { ActivityDetailsResponse } from '@/types/exercises';
import {
  ExerciseHistoryResponse,
  exerciseHistoryResponseSchema,
  ExerciseSessionResponse,
  exerciseSessionResponseSchema,
  ExerciseEntryResponse,
  CreateExerciseEntryRequest,
  UpdateExerciseEntryRequest,
  exerciseProgressResponseSchema,
  ExerciseProgressResponse,
  exerciseSnapshotResponseSchema,
  ExerciseSnapshotResponse,
} from '@workspace/shared';
import z from 'zod';
import { parseJsonArray } from './exerciseService';

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

export const createExerciseEntry = async (
  payload: CreateExerciseEntryRequest & { imageFile: File | null }
): Promise<void> => {
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

export const updateExerciseEntry = async (
  entryId: string,
  payload: UpdateExerciseEntryRequest & { imageFile: File | null }
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
): Promise<ExerciseProgressResponse[]> => {
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
  if (!Array.isArray(response)) return [];
  return response.reduce<ExerciseProgressResponse[]>((acc, item) => {
    const r = exerciseProgressResponseSchema.safeParse(item);
    if (r.success) acc.push(r.data);
    return acc;
  }, []);
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
  return response;
};

export const fetchExerciseDetails = async (
  exerciseId: string
): Promise<ExerciseSnapshotResponse> => {
  const response = await apiCall(`/exercises/${exerciseId}`, {
    method: 'GET',
  });

  const parsedResponse = { ...response };
  const arrayFields = [
    'images',
    'primary_muscles',
    'secondary_muscles',
    'equipment',
    'instructions',
  ];

  arrayFields.forEach((field) => {
    parsedResponse[field] = parseJsonArray(parsedResponse[field]) || [];
  });

  return exerciseSnapshotResponseSchema.parse(parsedResponse);
};

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
