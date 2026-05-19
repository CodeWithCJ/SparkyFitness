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

const FOOD_PHOTO_PROVIDER_LABELS: Record<string, string> = {
  google: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

/**
 * Display name for the AI provider that will run the photo estimate. The
 * server pins the model per provider, so we surface the provider only —
 * keeping the user's expectations aligned with the supported allow-list in
 * `isFoodPhotoAvailable` and `foodPhotoEstimationService.SUPPORTED_PROVIDERS`.
 * Returns `null` for providers outside the allow-list (the gate UI fires
 * upstream, but defensively returning null keeps the row hidden if reached).
 */
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
