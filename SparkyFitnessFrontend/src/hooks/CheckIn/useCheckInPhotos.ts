import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/hooks/use-toast';
import {
  fetchCheckInPhotos,
  fetchCheckInPhotoDates,
  uploadCheckInPhoto,
  deleteCheckInPhoto,
  type PhotoType,
  type CheckInPhoto,
} from '@/api/CheckIn/checkInPhotoService';

export type { PhotoType, CheckInPhoto };

// Mirror the server's multer limit so oversized files are rejected up front
// with immediate feedback instead of after a round-trip.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

// Shared key for the "which days have photos" query so the upload/delete
// mutations can invalidate the calendar indicator alongside the day's photos.
const PHOTO_DATES_KEY = ['check-in-photo-dates'];

/**
 * The calendar-day strings (YYYY-MM-DD) on which the user has progress photos.
 * Used to mark those days on the check-in calendar.
 */
export const useCheckInPhotoDates = () => {
  const { data: photoDates = [] } = useQuery({
    queryKey: PHOTO_DATES_KEY,
    queryFn: fetchCheckInPhotoDates,
  });
  return photoDates;
};

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
      queryClient.invalidateQueries({ queryKey: PHOTO_DATES_KEY });
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
      queryClient.invalidateQueries({ queryKey: PHOTO_DATES_KEY });
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
    uploadPhoto: (type: PhotoType, file: File) => {
      if (file.size > MAX_UPLOAD_BYTES) {
        toast({
          title: t('checkIn.photos.uploadError', 'Upload failed'),
          description: t(
            'checkIn.photos.tooLarge',
            'Image is too large (max 10 MB).'
          ),
          variant: 'destructive',
        });
        return;
      }
      uploadMutation.mutate({ type, file });
    },
    deletePhoto: (id: string) => deleteMutation.mutate(id),
    isUploading: uploadMutation.isPending,
    uploadingType: uploadMutation.variables?.type,
    isDeleting: deleteMutation.isPending,
  };
};
