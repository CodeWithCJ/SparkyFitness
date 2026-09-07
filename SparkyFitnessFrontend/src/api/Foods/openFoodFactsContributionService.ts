import {
  OpenFoodFactsPreviewRequestSchema,
  OpenFoodFactsPreviewResponseSchema,
  OpenFoodFactsConfirmRequestSchema,
  OpenFoodFactsConfirmResponseSchema,
  type OpenFoodFactsPreviewRequest,
  type OpenFoodFactsPreviewResponse,
  type OpenFoodFactsConfirmRequest,
  type OpenFoodFactsConfirmResponse,
} from '@workspace/shared';
import { apiCall } from '@/api/api';

export async function previewOpenFoodFactsContribution(
  foodId: string,
  request: OpenFoodFactsPreviewRequest
): Promise<OpenFoodFactsPreviewResponse> {
  const result = await apiCall<unknown>(
    `/v2/foods/${encodeURIComponent(foodId)}/openfoodfacts/preview`,
    { method: 'POST', body: OpenFoodFactsPreviewRequestSchema.parse(request) }
  );
  return OpenFoodFactsPreviewResponseSchema.parse(result);
}

export async function confirmOpenFoodFactsContribution(
  foodId: string,
  request: OpenFoodFactsConfirmRequest
): Promise<OpenFoodFactsConfirmResponse> {
  const result = await apiCall<unknown>(
    `/v2/foods/${encodeURIComponent(foodId)}/openfoodfacts/contribute`,
    { method: 'POST', body: OpenFoodFactsConfirmRequestSchema.parse(request) }
  );
  return OpenFoodFactsConfirmResponseSchema.parse(result);
}
