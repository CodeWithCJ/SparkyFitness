import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listPhotos, deletePhoto, uploadPhoto } from '../services/api/pregnancyPhotosApi';
import { pregnancyPhotosQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

export function usePregnancyPhotos(pregnancyId: string | undefined) {
  const query = useQuery({
    queryKey: [...pregnancyPhotosQueryKey, pregnancyId],
    queryFn: () => listPhotos(pregnancyId!),
    enabled: !!pregnancyId,
  });

  useRefetchOnFocus(query.refetch, !!pregnancyId);

  return {
    photos: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function usePregnancyPhotoMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: pregnancyPhotosQueryKey });
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
    deleteAsync: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}
