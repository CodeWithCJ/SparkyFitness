import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deletePhoto,
  fetchPhotoDates,
  fetchPhotoGallery,
  fetchPhotosByDate,
  uploadPhoto,
} from '../services/api/checkInPhotosApi';
import {
  checkInPhotoDatesQueryKey,
  checkInPhotoGalleryQueryKey,
  checkInPhotosByDateQueryKey,
  checkInPhotosRootQueryKey,
} from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { groupPhotosByDay } from '@workspace/shared';

// The day grouping is shared with the web's comparison and time-lapse, so it
// lives in @workspace/shared. Re-exported so callers keep one import site.
export { groupPhotosByDay };

/** The whole progress gallery, grouped by day (newest first). */
export function useCheckInPhotoGallery(enabled = true) {
  const query = useQuery({
    queryKey: checkInPhotoGalleryQueryKey,
    queryFn: fetchPhotoGallery,
    enabled,
  });

  useRefetchOnFocus(query.refetch, enabled);

  const days = useMemo(() => groupPhotosByDay(query.data ?? []), [query.data]);

  return {
    days,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/** The photos taken on one specific day, for the capture screen. */
export function useCheckInPhotosByDate(date: string, enabled = true) {
  const query = useQuery({
    queryKey: checkInPhotosByDateQueryKey(date),
    queryFn: () => fetchPhotosByDate(date),
    enabled,
  });

  useRefetchOnFocus(query.refetch, enabled);

  return {
    photos: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/**
 * The days that already have a photo, for marking the capture screen's date
 * picker. Deliberately its own endpoint rather than deriving from the gallery:
 * the dates list is a handful of strings, while the gallery carries every photo
 * the user has.
 */
export function useCheckInPhotoDates(enabled = true) {
  const query = useQuery({
    queryKey: checkInPhotoDatesQueryKey,
    queryFn: fetchPhotoDates,
    enabled,
  });

  useRefetchOnFocus(query.refetch, enabled);

  return {
    dates: query.data ?? [],
    isLoading: query.isLoading,
  };
}

/**
 * Upload and delete, plus which angle is mid-upload so a slot can show it.
 *
 * `uploadingType` is read only while the mutation is pending: `variables` holds
 * the last call's arguments until the mutation is reset, so an ungated read
 * leaves the slot that just finished reporting itself as still uploading.
 */
export function useCheckInPhotoMutations() {
  const queryClient = useQueryClient();

  // Default staleTime is Infinity, so every mutation must invalidate what it
  // touched. The photo weight comes from the measurements join, so the
  // measurements range caches that feed the weight chart stay untouched — only
  // photo caches change here.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: checkInPhotosRootQueryKey });
  };

  const uploadMutation = useMutation({
    mutationFn: uploadPhoto,
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePhoto(id),
    onSuccess: invalidate,
  });

  return {
    uploadAsync: uploadMutation.mutateAsync,
    isUploading: uploadMutation.isPending,
    // Gated on isPending: `variables` holds the last call's arguments until the
    // mutation is reset, so an ungated read leaves the slot that just finished
    // reporting itself as still uploading.
    uploadingType: uploadMutation.isPending
      ? uploadMutation.variables?.type
      : undefined,
    deleteAsync: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}
