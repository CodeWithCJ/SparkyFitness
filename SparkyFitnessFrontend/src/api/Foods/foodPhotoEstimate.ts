import { apiCall } from '../api';
import type { FoodPhotoEstimateResponse } from '@workspace/shared';
import type { FoodPhotoEstimateErrorCode } from '@workspace/shared';
import { FoodPhotoEstimateError } from '@/utils/foodPhotoEstimate';

export interface EstimateFoodPhotoInput {
  images: { image: string; mime_type: string }[];
  description?: string;
  totalWeight?: number;
  weightUnit?: 'g' | 'oz';
}

export const estimateFoodPhoto = async (
  input: EstimateFoodPhotoInput
): Promise<FoodPhotoEstimateResponse> => {
  const body = {
    images: input.images,
    ...(input.description ? { description: input.description } : {}),
    // The server requires weight and unit together or not at all.
    ...(input.totalWeight !== undefined && input.weightUnit
      ? { total_weight: input.totalWeight, weight_unit: input.weightUnit }
      : {}),
  };

  try {
    return await apiCall<FoodPhotoEstimateResponse>(
      '/foods/estimate-food-photo',
      { method: 'POST', body }
    );
  } catch (error) {
    // apiCall throws with the server's JSON message; recover the typed code so
    // the dialog can show provider-specific copy (e.g. "AI not configured").
    const raw = error instanceof Error ? error.message : String(error);
    const code = extractErrorCode(raw);
    throw new FoodPhotoEstimateError(code, raw);
  }
};

const KNOWN_CODES: FoodPhotoEstimateErrorCode[] = [
  'INVALID_REQUEST',
  'IMAGE_TOO_LARGE',
  'UNSUPPORTED_MIME_TYPE',
  'NO_AI_CONFIGURED',
  'UNSUPPORTED_PROVIDER',
  'API_KEY_MISSING',
  'CONTENT_BLOCKED',
  'PARSE_ERROR',
  'UPSTREAM_ERROR',
  'PRIVATE_NETWORK_FORBIDDEN',
  'TIMEOUT',
];

function extractErrorCode(raw: string): FoodPhotoEstimateErrorCode {
  for (const code of KNOWN_CODES) {
    if (raw.includes(code)) return code;
  }
  return 'UPSTREAM_ERROR';
}
