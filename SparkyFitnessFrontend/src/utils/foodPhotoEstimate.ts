import type { FoodPhotoEstimateErrorCode } from '@workspace/shared';

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
