import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/hooks/use-toast';
import {
  fetchCheckInPhotos,
  uploadCheckInPhoto,
  deleteCheckInPhoto,
  type PhotoType,
  type CheckInPhoto,
} from '@/api/CheckIn/checkInPhotoService';

export type { PhotoType, CheckInPhoto };

export const useCheckInPhotos = (selectedDate: string) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const queryKey = ['check-in-photos', selectedDate];

  const { data: photos = [] } = useQuery({
    queryKey,
    queryFn: () => fetchCheckInPhotos(selectedDate),
  });

  const uploadMutation = useMutation({
    mutationFn: ({ type, file }: { type: PhotoType; file: File }) =>
      uploadCheckInPhoto(selectedDate, type, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: t('checkIn.photos.uploadSuccess', 'Photo saved') });
    },
    onError: (err: Error) => {
      toast({
        title: t('checkIn.photos.uploadError', 'Upload failed'),
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCheckInPhoto(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: t('checkIn.photos.deleteSuccess', 'Photo removed') });
    },
    onError: () => {
      toast({
        title: t('checkIn.photos.deleteError', 'Failed to remove photo'),
        variant: 'destructive',
      });
    },
  });

  return {
    photos,
    uploadPhoto: (type: PhotoType, file: File) =>
      uploadMutation.mutate({ type, file }),
    deletePhoto: (id: string) => deleteMutation.mutate(id),
    isUploading: uploadMutation.isPending,
    uploadingType: uploadMutation.variables?.type,
  };
};
