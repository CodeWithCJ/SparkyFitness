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

export interface EstimateErrorCopy {
  title: string;
  message: string;
  stayOnForm: boolean;
  invalidateAiSettings: boolean;
}

// Canonical allow-list for food-photo estimation providers. Mirrors the
// server's SUPPORTED_PROVIDERS in foodPhotoEstimationService.ts; the keys
// drive both the gate (via isFoodPhotoAvailable) and the display label.
export const FOOD_PHOTO_PROVIDER_LABELS: Record<string, string> = {
  google: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

export function foodPhotoProviderLabel(
  serviceType: string | null | undefined,
): string | null {
  if (!serviceType) return null;
  return FOOD_PHOTO_PROVIDER_LABELS[serviceType] ?? null;
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
