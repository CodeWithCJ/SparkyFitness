import {
  aiUnitConversionRequestSchema,
  aiUnitConversionResponseSchema,
  type AiUnitConversionRequest,
  type AiUnitConversionResponse,
} from '@workspace/shared';
import { apiFetch } from './apiClient';
import { AI_TIMEOUT_MS } from '../../utils/concurrency';

/**
 * Request an AI-estimated cross-category unit conversion (e.g. cup → g) for
 * a food. Mirrors the web client wrapper — same shared zod schemas validate
 * both ends. See SparkyFitnessServer/services/aiUnitConversionService.ts.
 */
export async function requestAiUnitConversion(
  payload: AiUnitConversionRequest,
): Promise<AiUnitConversionResponse> {
  const validatedRequest = aiUnitConversionRequestSchema.parse(payload);
  const response = await apiFetch<unknown>({
    endpoint: '/api/ai/convert-unit',
    serviceName: 'aiConversionApi',
    operation: 'request unit conversion estimate',
    method: 'POST',
    body: validatedRequest,
    timeoutMs: AI_TIMEOUT_MS,
  });
  return aiUnitConversionResponseSchema.parse(response);
}
