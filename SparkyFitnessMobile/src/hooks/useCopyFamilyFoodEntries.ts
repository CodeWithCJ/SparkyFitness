import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import {
  copyReviewedFoodEntriesFromUser,
  copySelectedFoodEntriesFromUser,
} from '../services/api/foodEntriesApi';
import type {
  CopyReviewedFoodEntriesFromUserPayload,
  CopySelectedFoodEntriesFromUserPayload,
} from '../types/familyDiary';
import { ApiError } from '../services/api/errors';
import { dailySummaryQueryKey, familyUsersQueryKey } from './queryKeys';

export type FamilyCopyRequest =
  | { kind: 'whole'; payload: CopyReviewedFoodEntriesFromUserPayload }
  | { kind: 'selected'; payload: CopySelectedFoodEntriesFromUserPayload };

interface UseCopyFamilyFoodEntriesOptions {
  onSuccess?: (request: FamilyCopyRequest) => void;
}

export function useCopyFamilyFoodEntries(
  options?: UseCopyFamilyFoodEntriesOptions,
) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const mutation = useMutation({
    mutationFn: (request: FamilyCopyRequest) =>
      request.kind === 'whole'
        ? copyReviewedFoodEntriesFromUser(request.payload)
        : copySelectedFoodEntriesFromUser(request.payload),
    onSuccess: (_data, request) => {
      queryClient.invalidateQueries({
        queryKey: dailySummaryQueryKey(request.payload.targetDate),
      });
      Toast.show({
        type: 'success',
        text1: t('familyDiary.copySuccess', {
          defaultValue: 'Copied to your diary',
        }),
      });
      options?.onSuccess?.(request);
    },
    onError: error => {
      if (error instanceof ApiError && error.statusCode === 403) {
        void queryClient.invalidateQueries({ queryKey: familyUsersQueryKey });
        void queryClient.refetchQueries({ queryKey: familyUsersQueryKey });
        Toast.show({
          type: 'error',
          text1: t('familyDiary.copyPermissionRevoked', {
            defaultValue: 'Copy permission was removed',
          }),
          text2: t('familyDiary.copyPermissionRevokedGuidance', {
            defaultValue: 'Refresh family diaries to see your current access.',
          }),
        });
        return;
      }

      if (error instanceof ApiError && error.statusCode === 409) {
        Toast.show({
          type: 'error',
          text1: t('familyDiary.copyStale', {
            defaultValue: 'Family diary changed',
          }),
          text2: t('familyDiary.copyStaleGuidance', {
            defaultValue:
              'Refresh the family diary and review the foods again.',
          }),
        });
        return;
      }

      Toast.show({
        type: 'error',
        text1: t('familyDiary.copyFailed', {
          defaultValue: 'Could not copy foods',
        }),
        text2: t('familyDiary.copyFailedGuidance', {
          defaultValue: 'Your review is still here. Please try again.',
        }),
      });
    },
  });

  return {
    copyFromFamily: mutation.mutate,
    copyFromFamilyAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}
