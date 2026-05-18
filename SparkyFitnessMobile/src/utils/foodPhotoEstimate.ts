import type {
  FoodPhotoEstimateConfidence,
  FoodPhotoEstimateErrorCode,
} from '@workspace/shared';

export type ConfidenceTone = 'success' | 'warning' | 'error';

export const overallConfidenceLabels: Record<FoodPhotoEstimateConfidence, string> = {
  high: 'Good',
  medium: 'Fair',
  low: 'Rough',
};

export const itemConfidenceLabels: Record<FoodPhotoEstimateConfidence, string> = {
  high: 'Likely',
  medium: 'Possible',
  low: 'Uncertain',
};

export const confidenceTones: Record<FoodPhotoEstimateConfidence, ConfidenceTone> = {
  high: 'success',
  medium: 'warning',
  low: 'error',
};

export function mapOverallConfidence(value: FoodPhotoEstimateConfidence): string {
  return overallConfidenceLabels[value];
}

export function mapItemConfidence(value: FoodPhotoEstimateConfidence): string {
  return itemConfidenceLabels[value];
}

export function confidenceTone(value: FoodPhotoEstimateConfidence): ConfidenceTone {
  return confidenceTones[value];
}

export interface EstimateErrorCopy {
  /** Toast title */
  title: string;
  /** Toast body */
  message: string;
  /** Whether the screen should keep the user on the improve form */
  stayOnForm: boolean;
  /** Whether the active AI setting cache should be invalidated */
  invalidateAiSettings: boolean;
}

export function mapEstimateError(
  code: FoodPhotoEstimateErrorCode,
): EstimateErrorCopy {
  switch (code) {
    case 'NO_AI_CONFIGURED':
    case 'PROVIDER_NOT_GOOGLE':
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
