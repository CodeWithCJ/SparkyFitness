import { useCallback } from 'react';
import type {
  AiUnitConversionRequest,
  AiUnitConversionResponse,
} from '@workspace/shared';
import { requestAiUnitConversion } from '@/api/AiConversions/aiConversionApi';

export function useAiUnitConversion() {
  return useCallback(
    (payload: AiUnitConversionRequest): Promise<AiUnitConversionResponse> =>
      requestAiUnitConversion(payload),
    []
  );
}
