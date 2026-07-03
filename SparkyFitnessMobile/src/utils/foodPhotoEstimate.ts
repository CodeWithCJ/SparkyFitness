import {
  CONFIDENCE_TONES,
  ITEM_CONFIDENCE_LABELS,
  OVERALL_CONFIDENCE_LABELS,
  type ConfidenceTone,
  type FoodPhotoEstimateErrorCode,
} from '@workspace/shared';

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
        title: 'AI not configured',
        message: 'Configure an AI provider in the web app to use photo estimates.',
        stayOnForm: false,
        invalidateAiSettings: true,
      };
    case 'IMAGE_TOO_LARGE':
      return {
        title: 'Photo too large',
        message: 'Retake the photo at lower quality.',
        stayOnForm: false,
        invalidateAiSettings: false,
      };
    case 'UNSUPPORTED_MIME_TYPE':
      return {
        title: 'Unexpected image format',
        message: 'Retake the photo.',
        stayOnForm: false,
        invalidateAiSettings: false,
      };
    case 'CONTENT_BLOCKED':
      return {
        title: 'Could not process photo',
        message: 'The provider blocked this image. Try another shot.',
        stayOnForm: true,
        invalidateAiSettings: false,
      };
    case 'TIMEOUT':
      return {
        title: 'AI provider timed out',
        message: 'The estimate took too long. Try again, or log this food manually.',
        stayOnForm: true,
        invalidateAiSettings: false,
      };
    case 'PARSE_ERROR':
    case 'UPSTREAM_ERROR':
    case 'INVALID_REQUEST':
    default:
      return {
        title: "Couldn't reach AI provider",
        message: 'Try again, or log this food manually.',
        stayOnForm: true,
        invalidateAiSettings: false,
      };
  }
}
