import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import i18n from '../localization/i18n';
import {
  updateFoodEntry,
  type UpdateFoodEntryPayload,
} from '../services/api/foodEntriesApi';
import {
  displayFromPatch,
  editWaitingEntryQuantity,
  queueFoodEntryUpdate,
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

/** A change kept on the phone instead of reaching the server, as it reads. */
interface KeptOnPhone {
  keptOnPhone: Partial<FoodEntry>;
}

function isKeptOnPhone(result: FoodEntry | KeptOnPhone): result is KeptOnPhone {
  return 'keptOnPhone' in result;
}

interface UseUpdateFoodEntryOptions {
  entryId: string;
  entryDate: string;
  onSuccess?: (updatedEntry: FoodEntry) => void;
  /** Called when the change is kept on the phone, with what it changes. */
  onKeptOnPhone?: (changes: Partial<FoodEntry>) => void;
}

/** True for a change that carries only a new amount. */
function isQuantityOnly(
  payload: UpdateFoodEntryPayload
): payload is UpdateFoodEntryPayload & { quantity: number } {
  const keys = Object.keys(payload).filter(
    (key) => payload[key as keyof UpdateFoodEntryPayload] !== undefined
  );
  return keys.length === 1 && keys[0] === 'quantity';
}

/** A change and what it reads like on the entry while it waits. */
interface EntryChange {
  payload: UpdateFoodEntryPayload;
  /**
   * What the server works out from the request, for the entry shown while it
   * waits: the new serving's nutrition, the new meal's name.
   */
  preview?: Partial<FoodEntry>;
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
    mutationFn: async ({
      payload,
      preview,
    }: EntryChange): Promise<FoodEntry | KeptOnPhone> => {
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
        return { keptOnPhone: { quantity: payload.quantity } };
      }
      // Only the amount of a waiting entry can change; it has no server copy.
      if (isPendingEntryId(entryId)) {
        throw new Error('A waiting entry can only change its amount');
      }
      try {
        return await updateFoodEntry(entryId, payload);
      } catch (error) {
        // With the server away the change is kept and sent later. Setting
        // values is safe to send again, so even a timeout is kept.
        if (
          serverMayBeDown(error) &&
          (await queueFoodEntryUpdate(
            entryId,
            entryDate,
            payload,
            displayFromPatch(payload, preview)
          ))
        ) {
          return { keptOnPhone: displayFromPatch(payload, preview) };
        }
        throw error;
      }
    },
    onSuccess: (updatedEntry) => {
      if (isKeptOnPhone(updatedEntry)) {
        Toast.show({
          type: 'info',
          text1: i18n.t('foodEntryAdd.queued', {
            defaultValue: 'Saved on this phone',
          }),
          text2: i18n.t('foodEntryAdd.queuedMessage', {
            defaultValue: 'It uploads when your server can be reached.',
          }),
        });
        onKeptOnPhone?.(updatedEntry.keptOnPhone);
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
    updateEntry: (
      payload: UpdateFoodEntryPayload,
      preview?: Partial<FoodEntry>
    ) => mutation.mutate({ payload, preview }),
    isPending: mutation.isPending,
    invalidateCache,
  };
}
