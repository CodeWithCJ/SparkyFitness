import {
  CONFIDENCE_TONES,
  type ConfidenceTone,
  type FoodPhotoEstimateErrorCode,
} from '@workspace/shared';
import { mobileT } from '../localization';

export type { ConfidenceTone };

// Confidence tones stay shared across clients; labels are localized here for
// the Saudi Arabic mobile experience.
export const overallConfidenceLabels = {
  high: mobileT('foodPhoto.overallConfidence.high'),
  medium: mobileT('foodPhoto.overallConfidence.medium'),
  low: mobileT('foodPhoto.overallConfidence.low'),
} as const;
export const itemConfidenceLabels = {
  high: mobileT('foodPhoto.itemConfidence.high'),
  medium: mobileT('foodPhoto.itemConfidence.medium'),
  low: mobileT('foodPhoto.itemConfidence.low'),
} as const;
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
    case 'PRIVATE_NETWORK_FORBIDDEN':
      return {
        title: 'AI provider not allowed',
        message:
          'This AI provider points to a private network address. Ask an admin to configure it globally.',
        stayOnForm: false,
        invalidateAiSettings: true,
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
