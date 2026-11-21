import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import i18n from '../localization/i18n';
import {
  updateFoodEntry,
  type UpdateFoodEntryPayload,
} from '../services/api/foodEntriesApi';
import {
  editWaitingEntryQuantity,
  queueFoodEntryQuantity,
} from '../offline/foodEntryUpdateHandOver';
import {
  isPendingEntryId,
  pendingEntryClientId,
} from '../offline/foodEntryHandOver';
import { serverMayBeDown } from '../utils/serverErrors';
import { normalizeDate } from '../utils/dateUtils';
import { invalidateFoodCache } from './invalidateFoodCache';
import type { FoodEntry } from '../types/foodEntries';

/** The waiting entry is being sent this moment, so it cannot be changed. */
class UploadingNowError extends Error {}

/** A change that was kept on the phone instead of reaching the server. */
const KEPT_ON_PHONE = Symbol('keptOnPhone');
type KeptOnPhone = typeof KEPT_ON_PHONE;

interface UseUpdateFoodEntryOptions {
  entryId: string;
  entryDate: string;
  onSuccess?: (updatedEntry: FoodEntry) => void;
  /** Called when the new amount is kept on the phone to upload later. */
  onKeptOnPhone?: () => void;
}

/** True for a change that carries only a new amount, the one kept offline. */
function isQuantityOnly(
  payload: UpdateFoodEntryPayload
): payload is UpdateFoodEntryPayload & { quantity: number } {
  const keys = Object.keys(payload).filter(
    (key) => payload[key as keyof UpdateFoodEntryPayload] !== undefined
  );
  return keys.length === 1 && keys[0] === 'quantity';
}

export function useUpdateFoodEntry({
  entryId,
  entryDate,
  onSuccess,
  onKeptOnPhone,
}: UseUpdateFoodEntryOptions) {
  const queryClient = useQueryClient();
  const normalizedDate = normalizeDate(entryDate);

  const mutation = useMutation({
    mutationFn: async (
      payload: UpdateFoodEntryPayload
    ): Promise<FoodEntry | KeptOnPhone> => {
      // An entry still waiting to upload is changed where it waits, so the
      // server only ever sees the final amount.
      if (isPendingEntryId(entryId) && isQuantityOnly(payload)) {
        const result = await editWaitingEntryQuantity(
          pendingEntryClientId(entryId),
          payload.quantity
        );
        if (result === 'uploading') throw new UploadingNowError();
        if (result === 'gone')
          throw new Error('The entry is no longer waiting');
        return KEPT_ON_PHONE;
      }
      try {
        return await updateFoodEntry(entryId, payload);
      } catch (error) {
        // With the server away a new amount is kept and sent later. Setting
        // an amount is safe to send again, so even a timeout is kept.
        if (
          serverMayBeDown(error) &&
          isQuantityOnly(payload) &&
          (await queueFoodEntryQuantity(entryId, entryDate, payload.quantity))
        ) {
          return KEPT_ON_PHONE;
        }
        throw error;
      }
    },
    onSuccess: (updatedEntry) => {
      if (updatedEntry === KEPT_ON_PHONE) {
        Toast.show({
          type: 'info',
          text1: i18n.t('foodEntryAdd.queued', {
            defaultValue: 'Saved on this phone',
          }),
          text2: i18n.t('foodEntryAdd.queuedMessage', {
            defaultValue: 'It uploads when your server can be reached.',
          }),
        });
        onKeptOnPhone?.();
        return;
      }
      onSuccess?.(updatedEntry);
    },
    onError: (error) => {
      const message =
        error instanceof UploadingNowError
          ? i18n.t('foodEntryView.errors.uploadingNow', {
              defaultValue: 'It is uploading right now. Try again in a moment.',
            })
          : error instanceof Error && error.message.includes('403')
            ? i18n.t('foodEntryView.errors.permission', {
                defaultValue: "You don't have permission to edit this entry.",
              })
            : i18n.t('common.tryAgain', { defaultValue: 'Please try again.' });
      Toast.show({
        type: 'error',
        text1: i18n.t('foodEntryView.errors.saveFailed', {
          defaultValue: 'Failed to save changes',
        }),
        text2: message,
      });
    },
  });

  const invalidateCache = (newDate?: string) => {
    invalidateFoodCache(queryClient, normalizedDate);
    if (newDate && newDate !== normalizedDate) {
      invalidateFoodCache(queryClient, newDate);
    }
  };

  return {
    updateEntry: mutation.mutate,
    isPending: mutation.isPending,
    invalidateCache,
  };
}
