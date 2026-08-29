import { useMutation } from '@tanstack/react-query';
import type {
  FoodPhotoLogRequest,
  FoodPhotoLogResponse,
} from '@workspace/shared';
import { createPhotoLoggedMeal } from '@/api/Diary/foodEntryService';
import { useDiaryInvalidation } from '@/hooks/useInvalidateKeys';

/**
 * Web runs the estimate itself only from the chat, where the estimate arrives
 * on the `sparky_analyze_food_image` tool result rather than from a REST call —
 * so there is no `useEstimateFoodPhoto` here. The mobile app owns the direct
 * `POST /foods/estimate-food-photo` path.
 */

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
