import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import {
  copyReviewedFoodEntriesFromUser,
  copySelectedFoodEntriesFromUser,
  copyReviewedFoodEntriesToUser,
  copySelectedFoodEntriesToUser,
} from '../services/api/foodEntriesApi';
import type {
  CopyReviewedFoodEntriesFromUserPayload,
  CopySelectedFoodEntriesFromUserPayload,
  CopyReviewedFoodEntriesToUserPayload,
  CopySelectedFoodEntriesToUserPayload,
} from '@workspace/shared';
import { ApiError } from '../services/api/errors';
import {
  dailySummaryQueryKey,
  familyCopySourceQueryKey,
  familyDailySummaryQueryKey,
  familyUsersQueryKey,
} from './queryKeys';
import { invalidateFoodCache } from './invalidateFoodCache';
import type { FamilyCopyDirection } from '../types/familyDiary';

export type FamilyCopyRequest =
  | {
      kind: 'whole';
      payload:
        | CopyReviewedFoodEntriesFromUserPayload
        | CopyReviewedFoodEntriesToUserPayload;
    }
  | {
      kind: 'selected';
      payload:
        | CopySelectedFoodEntriesFromUserPayload
        | CopySelectedFoodEntriesToUserPayload;
    };

interface UseCopyFamilyFoodEntriesOptions {
  direction?: FamilyCopyDirection;
  onSuccess?: (request: FamilyCopyRequest) => void;
  onStale?: (request: FamilyCopyRequest) => void;
  onPermissionDenied?: () => void;
}

export function useCopyFamilyFoodEntries(
  options?: UseCopyFamilyFoodEntriesOptions
) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const toFamily = options?.direction === 'to-family';

  const mutation = useMutation({
    mutationFn: (request: FamilyCopyRequest) => {
      if (request.kind === 'whole') {
        return toFamily
          ? copyReviewedFoodEntriesToUser(request.payload)
          : copyReviewedFoodEntriesFromUser(request.payload);
      }
      return toFamily
        ? copySelectedFoodEntriesToUser(request.payload)
        : copySelectedFoodEntriesFromUser(request.payload);
    },
    onSuccess: (_data, request) => {
      if (toFamily) {
        void queryClient.invalidateQueries({
          queryKey: familyDailySummaryQueryKey(
            request.payload.familyUserId,
            request.payload.targetDate
          ),
          refetchType: 'all',
        });
      } else {
        invalidateFoodCache(queryClient, request.payload.targetDate);
      }
      Toast.show({
        type: 'success',
        text1: toFamily
          ? t('familyDiary.copyToFamilySuccess', {
              defaultValue: 'Copied to the family diary',
            })
          : t('familyDiary.copySuccess', {
              defaultValue: 'Copied to your diary',
            }),
      });
      options?.onSuccess?.(request);
    },
    onError: (error, request) => {
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
        options?.onPermissionDenied?.();
        return;
      }

      if (error instanceof ApiError && error.statusCode === 409) {
        const sourceQueryKey = toFamily
          ? dailySummaryQueryKey(request.payload.sourceDate)
          : familyDailySummaryQueryKey(
              request.payload.familyUserId,
              request.payload.sourceDate
            );
        void queryClient.invalidateQueries({ queryKey: sourceQueryKey });
        void queryClient.refetchQueries({ queryKey: sourceQueryKey });
        if (toFamily) {
          const rawSourceQueryKey = familyCopySourceQueryKey(
            request.payload.sourceDate
          );
          void queryClient.invalidateQueries({ queryKey: rawSourceQueryKey });
          void queryClient.refetchQueries({ queryKey: rawSourceQueryKey });
        }
        Toast.show({
          type: 'error',
          text1: toFamily
            ? t('familyDiary.copyOwnStale', {
                defaultValue: 'Your source meal changed',
              })
            : t('familyDiary.copyStale', {
                defaultValue: 'Family diary changed',
              }),
          text2: toFamily
            ? t('familyDiary.copyOwnStaleGuidance', {
                defaultValue: 'Your latest meal is opening for review.',
              })
            : t('familyDiary.copyStaleGuidance', {
                defaultValue: 'The latest family diary is opening for review.',
              }),
        });
        options?.onStale?.(request);
        return;
      }

      if (toFamily && error instanceof ApiError && error.statusCode === 404) {
        Toast.show({
          type: 'error',
          text1: t('familyDiary.copyServerUpdateRequired', {
            defaultValue: 'Server update required',
          }),
          text2: t('familyDiary.copyServerUpdateGuidance', {
            defaultValue:
              'Update your SparkyFitness server to copy foods to family members.',
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
    copyEntries: mutation.mutate,
    copyEntriesAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}
