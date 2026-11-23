import { useMutation } from '@tanstack/react-query';
import { HttpApiError } from '@/api/api';
import { scanNutritionLabel } from '@/api/Foods/foodService';
import type { Food } from '@/types/food';
import { labelScanToFood, prepareLabelImage } from '@/utils/nutritionLabelScan';

/**
 * Reads a label photo with the user's vision AI service and returns an
 * unsaved food holding its values. Nothing is stored, so no cache changes.
 */
export function useNutritionLabelScan() {
  return useMutation<Food, Error, Blob>({
    mutationFn: async (image) =>
      labelScanToFood(await scanNutritionLabel(await prepareLabelImage(image))),
    // The input shows the failure in place, worded from the error code.
    meta: { silentError: true },
  });
}

/** The server's reason for a failed scan, such as `no_ai_configured`. */
export function labelScanErrorCode(err: unknown): string | undefined {
  return err instanceof HttpApiError ? err.code : undefined;
}
