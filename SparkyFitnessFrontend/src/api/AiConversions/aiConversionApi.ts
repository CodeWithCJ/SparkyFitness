import {
  aiUnitConversionRequestSchema,
  aiUnitConversionResponseSchema,
  type AiUnitConversionRequest,
  type AiUnitConversionResponse,
} from '@workspace/shared';
import { apiCall } from '../api';

/**
 * Request an AI-estimated cross-category unit conversion (e.g. cup → g).
 *
 * The server validates units (must be standard weight/volume AND incompatible
 * for math), checks the user's preference + active AI service, calls the LLM,
 * and returns a structured estimate. See aiUnitConversionService.ts.
 *
 * This wrapper additionally runs the shared Zod schemas on both ends so a
 * malformed shape fails fast in the client instead of surfacing as a runtime
 * type error downstream.
 */
export async function requestAiUnitConversion(
  payload: AiUnitConversionRequest
): Promise<AiUnitConversionResponse> {
  const validatedRequest = aiUnitConversionRequestSchema.parse(payload);
  const response = await apiCall('/ai/convert-unit', {
    method: 'POST',
    body: validatedRequest,
  });
  return aiUnitConversionResponseSchema.parse(response);
}
