import { z } from 'zod/v4';

// Body for POST /custom-nutrients/from-catalog. The ids are canonical micronutrient
// catalog ids from the shared package; unknown ids are ignored by the service rather
// than rejected, so the schema only has to guarantee the shape.
export const EnsureCatalogNutrientsBodySchema = z
  .object({
    catalogIds: z.array(z.string()),
    forSupplement: z.boolean().optional(),
  })
  .loose();

export type EnsureCatalogNutrientsBody = z.infer<
  typeof EnsureCatalogNutrientsBodySchema
>;
