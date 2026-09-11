import { z } from 'zod';

export {
  OpenFoodFactsPreviewRequestSchema,
  OpenFoodFactsPreviewResponseSchema,
  OpenFoodFactsConfirmRequestSchema,
  OpenFoodFactsConfirmResponseSchema,
} from '@workspace/shared';

export const OpenFoodFactsFoodParamsSchema = z.object({ foodId: z.uuid() });
