import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import i18n from '../localization/i18n';
import {
  cancelWaitingEntry,
  queueFoodEntryDelete,
} from '../offline/foodEntryDeleteHandOver';
import {
  isPendingEntryId,
  pendingEntryClientId,
} from '../offline/foodEntryHandOver';
import { deleteFoodEntry } from '../services/api/foodEntriesApi';
import { serverMayBeDown } from '../utils/serverErrors';
import { normalizeDate } from '../utils/dateUtils';
import { invalidateFoodCache } from './invalidateFoodCache';

/** The waiting entry is being sent this moment, so it cannot be cancelled. */
class UploadingNowError extends Error {}

/**
 * The waiting entry has uploaded since the Diary last loaded: it is on the
 * server under another id now, so nothing was cancelled.
 */
class AlreadyUploadedError extends Error {}

interface UseDeleteFoodEntryOptions {
  entryId: string;
  entryDate: string;
  onSuccess?: () => void;
}

export function useDeleteFoodEntry({
  entryId,
  entryDate,
  onSuccess,
}: UseDeleteFoodEntryOptions) {
  const queryClient = useQueryClient();
  const normalizedDate = normalizeDate(entryDate);

  const mutation = useMutation({
    mutationFn: async () => {
      // An entry that is still waiting to upload never reached the server:
      // deleting it takes it out of the queue.
      if (isPendingEntryId(entryId)) {
        const result = await cancelWaitingEntry(pendingEntryClientId(entryId));
        if (result === 'uploading') throw new UploadingNowError();
        if (result === 'gone') throw new AlreadyUploadedError();
        return;
      }
      try {
        await deleteFoodEntry(entryId);
      } catch (error) {
        // With the server away the removal is kept and sent later. Deleting is
        // safe to send again, so even a timeout is kept.
        if (
          serverMayBeDown(error) &&
          (await queueFoodEntryDelete(entryId, entryDate))
        ) {
          return;
        }
        throw error;
      }
    },
    onSuccess: () => {
      onSuccess?.();
    },
    onError: (error) => {
      // The Diary still shows a row that has uploaded: reload it, so the entry
      // appears under its real id and can be deleted.
      if (error instanceof AlreadyUploadedError) {
        invalidateFoodCache(queryClient, normalizedDate);
      }
      Toast.show({
        type: 'error',
        text1: i18n.t('foodEntryView.errors.deleteFailed', {
          defaultValue: 'Failed to delete',
        }),
        text2:
          error instanceof UploadingNowError
            ? i18n.t('foodEntryView.errors.uploadingNow', {
                defaultValue:
                  'It is uploading right now. Try again in a moment.',
              })
            : error instanceof AlreadyUploadedError
              ? i18n.t('foodEntryView.errors.alreadyUploaded', {
                  defaultValue:
                    'It has just uploaded. Try again once the Diary has refreshed.',
                })
              : i18n.t('common.tryAgain', {
                  defaultValue: 'Please try again.',
                }),
      });
    },
  });

  const confirmAndDelete = () => {
    Alert.alert(
      i18n.t('foodEntryView.deleteEntry', { defaultValue: 'Delete Entry' }),
      i18n.t('foodEntryView.deleteConfirm', {
        defaultValue: 'Are you sure you want to delete this food entry?',
      }),
      [
        {
          text: i18n.t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: i18n.t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () => mutation.mutate(),
        },
      ]
    );
  };

  const deleteEntry = () => mutation.mutate();

  const invalidateCache = () => {
    invalidateFoodCache(queryClient, normalizedDate);
  };

  return {
    confirmAndDelete,
    deleteEntry,
    isPending: mutation.isPending,
    invalidateCache,
  };
}
