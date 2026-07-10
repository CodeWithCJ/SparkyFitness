import {
  CONFIDENCE_TONES,
  ITEM_CONFIDENCE_LABELS,
  OVERALL_CONFIDENCE_LABELS,
  type ConfidenceTone,
  type FoodPhotoEstimateErrorCode,
} from '@workspace/shared';
import { mobileT } from '../localization';

export type { ConfidenceTone };

// Re-exports of the shared confidence-tier labels and tones. The mobile
// food-photo flow was the original home of these constants; they now live in
// @workspace/shared so the unit-conversion AI flow can reuse the same wording
// and color scheme. Keep the lowercase aliases for callers in this app.
export const overallConfidenceLabels = OVERALL_CONFIDENCE_LABELS;
export const itemConfidenceLabels = ITEM_CONFIDENCE_LABELS;
export const confidenceTones = CONFIDENCE_TONES;

export interface EstimateErrorCopy {
  title: string;
  message: string;
  stayOnForm: boolean;
  invalidateAiSettings: boolean;
}

export function mapEstimateError(
  code: FoodPhotoEstimateErrorCode,
): EstimateErrorCopy {
  switch (code) {
    case 'NO_AI_CONFIGURED':
    case 'UNSUPPORTED_PROVIDER':
    case 'API_KEY_MISSING':
      return {
        title: mobileT('foodPhoto.errorAiNotConfigured'),
        message: mobileT('foodPhoto.errorAiNotConfiguredDescription'),
        stayOnForm: false,
        invalidateAiSettings: true,
      };
    case 'IMAGE_TOO_LARGE':
      return {
        title: mobileT('foodPhoto.errorImageTooLarge'),
        message: mobileT('foodPhoto.errorImageTooLargeDescription'),
        stayOnForm: false,
        invalidateAiSettings: false,
      };
    case 'UNSUPPORTED_MIME_TYPE':
      return {
        title: mobileT('foodPhoto.errorUnexpectedFormat'),
        message: mobileT('foodPhoto.errorUnexpectedFormatDescription'),
        stayOnForm: false,
        invalidateAiSettings: false,
      };
    case 'CONTENT_BLOCKED':
      return {
        title: mobileT('foodPhoto.errorProcessFailed'),
        message: mobileT('foodPhoto.errorProcessFailedDescription'),
        stayOnForm: true,
        invalidateAiSettings: false,
      };
    case 'TIMEOUT':
      return {
        title: mobileT('foodPhoto.errorTimedOut'),
        message: mobileT('foodPhoto.errorTimedOutDescription'),
        stayOnForm: true,
        invalidateAiSettings: false,
      };
    case 'PARSE_ERROR':
    case 'UPSTREAM_ERROR':
    case 'INVALID_REQUEST':
    default:
      return {
        title: mobileT('foodPhoto.errorProviderUnavailable'),
        message: mobileT('foodPhoto.errorProviderUnavailableDescription'),
        stayOnForm: true,
        invalidateAiSettings: false,
      };
  }
}
