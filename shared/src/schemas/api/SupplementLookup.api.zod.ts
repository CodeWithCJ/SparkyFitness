import { z } from "zod";
import { FOOD_VARIANT_NUTRIENT_FIELDS } from "../../constants/foodVariantNutrients.ts";

/** GET /api/v2/medications/supplement-lookup?upc=… */
export const supplementLookupQuerySchema = z.object({
  upc: z.string().trim().min(6).max(20),
});

/** A built-in nutrient column and the amount in one serving. */
export const supplementLookupFixedNutrientSchema = z.object({
  key: z.enum(FOOD_VARIANT_NUTRIENT_FIELDS),
  amount: z.number().nonnegative(),
});

/**
 * A catalog micronutrient that is not a built-in column, and the amount in one
 * serving in the catalog's unit. The caller creates its custom nutrient when the
 * supplement is saved.
 */
export const supplementLookupCatalogNutrientSchema = z.object({
  catalogId: z.string(),
  amount: z.number().nonnegative(),
});

/** An ingredient the label lists that no nutrient field could take. */
export const supplementLookupUnmatchedSchema = z.object({
  name: z.string(),
  amount: z.number().nullable(),
  unit: z.string().nullable(),
});

export const supplementLookupProductSchema = z.object({
  /** `dsld` for a database label, `label` for one read from a photo, `off` for an
   * Open Food Facts product. */
  source: z.enum(["dsld", "label", "off"]),
  sourceId: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  /** The dose form, as one of the app's supplement forms, when the label gives one. */
  form: z
    .enum(["tablet", "capsule", "softgel", "gummy", "powder", "liquid"])
    .nullable(),
  /** The label's serving, such as "2 Capsule(s)". */
  serving: z.string().nullable(),
  fixed: z.array(supplementLookupFixedNutrientSchema),
  catalog: z.array(supplementLookupCatalogNutrientSchema),
  unmatched: z.array(supplementLookupUnmatchedSchema),
});

export const supplementLookupResponseSchema = z.object({
  product: supplementLookupProductSchema.nullable(),
});

export type SupplementLookupProduct = z.infer<
  typeof supplementLookupProductSchema
>;
export type SupplementLookupResponse = z.infer<
  typeof supplementLookupResponseSchema
>;
