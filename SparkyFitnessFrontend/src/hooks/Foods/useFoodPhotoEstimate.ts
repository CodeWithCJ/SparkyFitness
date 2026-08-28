import { useMutation } from '@tanstack/react-query';
import type {
  FoodPhotoEstimateResponse,
  FoodPhotoLogRequest,
  FoodPhotoLogResponse,
} from '@workspace/shared';
import {
  estimateFoodPhoto,
  type EstimateFoodPhotoInput,
} from '@/api/Foods/foodPhotoEstimate';
import { FoodPhotoEstimateError } from '@/utils/foodPhotoEstimate';
import { createPhotoLoggedMeal } from '@/api/Diary/foodEntryService';
import { useDiaryInvalidation } from '@/hooks/useInvalidateKeys';

/** Runs the AI photo estimate. Errors keep their typed `code`. */
export function useEstimateFoodPhoto(options?: {
  onSuccess?: (estimate: FoodPhotoEstimateResponse) => void;
  onError?: (error: FoodPhotoEstimateError | Error) => void;
}) {
  return useMutation({
    mutationFn: (input: EstimateFoodPhotoInput) => estimateFoodPhoto(input),
    onSuccess: options?.onSuccess,
    onError: options?.onError,
  });
}

/**
 * Logs a reviewed estimate. The diary reads through TanStack Query, so the
 * day's caches are invalidated here rather than in the calling component.
 */
export function useLogFoodPhotoEstimate(options?: {
  onSuccess?: (result: FoodPhotoLogResponse) => void;
  onError?: (error: Error) => void;
}) {
  const invalidateDiary = useDiaryInvalidation();

  return useMutation({
    mutationFn: (payload: FoodPhotoLogRequest) =>
      createPhotoLoggedMeal(payload),
    onSuccess: (result) => {
      invalidateDiary();
      options?.onSuccess?.(result);
    },
    onError: options?.onError,
  });
}
