import {
  CONFIDENCE_TONES,
  ITEM_CONFIDENCE_LABELS,
  OVERALL_CONFIDENCE_LABELS,
  type AiConfidence,
  type ConfidenceTone,
  type FoodPhotoEstimateErrorCode,
} from '@workspace/shared';
import type { TFunction } from 'i18next';

export type { ConfidenceTone };

// Re-exports of the shared confidence-tier labels and tones. The mobile
// food-photo flow was the original home of these constants; they now live in
// @workspace/shared so the unit-conversion AI flow can reuse the same wording
// and color scheme. Keep the lowercase aliases for callers in this app.
export const overallConfidenceLabels = OVERALL_CONFIDENCE_LABELS;
export const itemConfidenceLabels = ITEM_CONFIDENCE_LABELS;
export const confidenceTones = CONFIDENCE_TONES;

/**
 * Localized complete badge phrase for the AI estimate-QUALITY tier
 * (high/medium/low). Used by the FoodForm provenance badge, which presents the
 * estimate as a complete, grammatically-correct phrase (EN "Good estimate"; PL
 * "Dobre oszacowanie"). Returns null for an unknown value so callers can hide
 * the badge entirely.
 */
export function localizeAiEstimateQuality(
  t: TFunction,
  confidence: AiConfidence | null | undefined,
): string | null {
  switch (confidence) {
    case 'high':
      return t('foodForm.ai.estimateQuality.high', { defaultValue: 'Good estimate' });
    case 'medium':
      return t('foodForm.ai.estimateQuality.medium', { defaultValue: 'Fair estimate' });
    case 'low':
      return t('foodForm.ai.estimateQuality.low', { defaultValue: 'Rough estimate' });
    default:
      return null;
  }
}

/**
 * Localizes the AI confidence LEVEL (high/medium/low) for explicit
 * "confidence" phrasing (FoodUnitSelector accessibility label ->
 * "Oszacowanie AI (pewność: wysoka)"). Uses dedicated confidence-level keys
 * (foodUnit.confidence.*), separate from the estimate-QUALITY model above.
 * Returns null for an unknown value so callers can omit the fragment.
 */
export function localizeAiConfidenceLevel(
  t: TFunction,
  confidence: AiConfidence | null | undefined,
): string | null {
  switch (confidence) {
    case 'high':
      return t('foodUnit.confidence.high', { defaultValue: 'High' });
    case 'medium':
      return t('foodUnit.confidence.medium', { defaultValue: 'Medium' });
    case 'low':
      return t('foodUnit.confidence.low', { defaultValue: 'Low' });
    default:
      return null;
  }
}

export interface EstimateErrorCopy {
  titleKey: string;
  titleDefaultValue: string;
  messageKey: string;
  messageDefaultValue: string;
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
        titleKey: 'aiNotConfiguredTitle',
        titleDefaultValue: 'AI not configured',
        messageKey: 'aiNotConfiguredMessage',
        messageDefaultValue: 'Configure an AI provider in the web app to use photo estimates.',
        stayOnForm: false,
        invalidateAiSettings: true,
      };
    case 'IMAGE_TOO_LARGE':
      return {
        titleKey: 'photoTooLargeTitle',
        titleDefaultValue: 'Photo too large',
        messageKey: 'photoTooLargeMessage',
        messageDefaultValue: 'Retake the photo at lower quality.',
        stayOnForm: false,
        invalidateAiSettings: false,
      };
    case 'UNSUPPORTED_MIME_TYPE':
      return {
        titleKey: 'unexpectedImageFormatTitle',
        titleDefaultValue: 'Unexpected image format',
        messageKey: 'unexpectedImageFormatMessage',
        messageDefaultValue: 'Retake the photo.',
        stayOnForm: false,
        invalidateAiSettings: false,
      };
    case 'CONTENT_BLOCKED':
      return {
        titleKey: 'couldNotProcessPhotoTitle',
        titleDefaultValue: 'Could not process photo',
        messageKey: 'couldNotProcessPhotoMessage',
        messageDefaultValue: 'The provider blocked this image. Try another shot.',
        stayOnForm: true,
        invalidateAiSettings: false,
      };
    case 'TIMEOUT':
      return {
        titleKey: 'providerTimedOutTitle',
        titleDefaultValue: 'AI provider timed out',
        messageKey: 'providerTimedOutMessage',
        messageDefaultValue: 'The estimate took too long. Try again, or log this food manually.',
        stayOnForm: true,
        invalidateAiSettings: false,
      };
    case 'PRIVATE_NETWORK_FORBIDDEN':
      return {
        titleKey: 'providerNotAllowedTitle',
        titleDefaultValue: 'AI provider not allowed',
        messageKey: 'providerNotAllowedMessage',
        messageDefaultValue: 'This AI provider points to a private network address. Ask an admin to configure it globally.',
        stayOnForm: false,
        invalidateAiSettings: true,
      };
    case 'PARSE_ERROR':
    case 'UPSTREAM_ERROR':
    case 'INVALID_REQUEST':
    default:
      return {
        titleKey: 'providerUnreachableTitle',
        titleDefaultValue: "Couldn't reach AI provider",
        messageKey: 'providerUnreachableMessage',
        messageDefaultValue: 'Try again, or log this food manually.',
        stayOnForm: true,
        invalidateAiSettings: false,
      };
  }
}
