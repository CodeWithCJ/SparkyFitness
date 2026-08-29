import {
  toPer100g,
  unbrandMacros,
  roundMacros,
  type FoodPhotoEstimateErrorCode,
  type IngredientDraftRow,
} from '@workspace/shared';
import type { MealFood } from '@/types/meal';

/**
 * Mirrors the server's own caps (`foodCrudRoutes.ts`) so the browser rejects an
 * oversized batch before spending time base64-encoding and uploading it.
 */
export const MAX_PHOTO_IMAGES = 6;
export const MAX_BASE64_IMAGE_LENGTH = 8 * 1024 * 1024;
export const MAX_TOTAL_BASE64_LENGTH = 24 * 1024 * 1024;
export const MAX_DESCRIPTION_LENGTH = 500;

export class FoodPhotoEstimateError extends Error {
  code: FoodPhotoEstimateErrorCode;
  constructor(code: FoodPhotoEstimateErrorCode, message: string) {
    super(message);
    this.name = 'FoodPhotoEstimateError';
    this.code = code;
  }
}

/** User-facing copy per error code, mirroring the mobile `mapEstimateError`. */
export function describeEstimateError(code: FoodPhotoEstimateErrorCode): {
  titleKey: string;
  messageKey: string;
  /** True when the user should fix their AI provider settings. */
  isConfiguration: boolean;
} {
  switch (code) {
    case 'NO_AI_CONFIGURED':
    case 'UNSUPPORTED_PROVIDER':
    case 'API_KEY_MISSING':
      return {
        titleKey: 'foodPhoto.errors.aiNotConfiguredTitle',
        messageKey: 'foodPhoto.errors.aiNotConfiguredMessage',
        isConfiguration: true,
      };
    case 'PRIVATE_NETWORK_FORBIDDEN':
      return {
        titleKey: 'foodPhoto.errors.providerNotAllowedTitle',
        messageKey: 'foodPhoto.errors.providerNotAllowedMessage',
        isConfiguration: true,
      };
    case 'IMAGE_TOO_LARGE':
      return {
        titleKey: 'foodPhoto.errors.photoTooLargeTitle',
        messageKey: 'foodPhoto.errors.photoTooLargeMessage',
        isConfiguration: false,
      };
    case 'UNSUPPORTED_MIME_TYPE':
      return {
        titleKey: 'foodPhoto.errors.unexpectedFormatTitle',
        messageKey: 'foodPhoto.errors.unexpectedFormatMessage',
        isConfiguration: false,
      };
    case 'CONTENT_BLOCKED':
      return {
        titleKey: 'foodPhoto.errors.couldNotProcessTitle',
        messageKey: 'foodPhoto.errors.couldNotProcessMessage',
        isConfiguration: false,
      };
    case 'TIMEOUT':
      return {
        titleKey: 'foodPhoto.errors.timedOutTitle',
        messageKey: 'foodPhoto.errors.timedOutMessage',
        isConfiguration: false,
      };
    default:
      return {
        titleKey: 'foodPhoto.errors.unreachableTitle',
        messageKey: 'foodPhoto.errors.unreachableMessage',
        isConfiguration: false,
      };
  }
}

/**
 * Turns reviewed estimate rows into `MealFood`s for the Meal Builder.
 *
 * The Meal Builder treats any row carrying a `food_id` as already resolved and
 * logs the diary entry against that database food, which makes the server
 * snapshot ITS nutrition. So a match's ids may only travel with a row that is
 * actually showing that match: an unapplied suggestion would silently swap the
 * reviewed numbers for a food the user never accepted.
 */
export function estimateRowsToMealFoods(
  rows: IngredientDraftRow[]
): MealFood[] {
  return rows.map((row) => {
    const per100g = toPer100g(row.macros, row.grams);
    const rounded = per100g
      ? unbrandMacros(roundMacros(per100g))
      : unbrandMacros(roundMacros(row.macros));
    const applied = row.matchApplied ? row.match : null;
    return {
      id: row.id,
      food_id: applied?.food_id || undefined,
      variant_id: applied?.variant_id || undefined,
      food_name: row.name,
      quantity: row.grams,
      unit: 'g',
      calories: rounded.calories_kcal,
      protein: rounded.protein_g,
      carbs: rounded.carbs_g,
      fat: rounded.fat_g,
      dietary_fiber: rounded.fiber_g,
      sugars: rounded.sugar_g,
      serving_size: 100,
      serving_unit: 'g',
    };
  });
}
