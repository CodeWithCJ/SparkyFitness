import { z } from "zod";

/** The dose forms the supplement form offers; shared with the lookup product. */
export const supplementLabelFormSchema = z.enum([
  "tablet",
  "capsule",
  "softgel",
  "gummy",
  "powder",
  "liquid",
]);

/** One line of a Supplement Facts panel: the amount in a serving, as printed. */
export const supplementLabelIngredientSchema = z.object({
  name: z.string().trim().min(1).max(200),
  amount: z.number().nonnegative().nullable(),
  unit: z.string().trim().max(40).nullable(),
});

/**
 * What an AI reads off a Supplement Facts photo. The on-device model and the
 * server's vision provider both produce this shape; the server turns it into
 * nutrients so there is one set of name matching and unit conversion.
 */
export const supplementLabelExtractionSchema = z.object({
  name: z.string().trim().max(200).nullable(),
  brand: z.string().trim().max(200).nullable(),
  form: supplementLabelFormSchema.nullable(),
  /** The serving as printed, such as "2 Capsules". */
  serving: z.string().trim().max(100).nullable(),
  ingredients: z.array(supplementLabelIngredientSchema).max(120),
});

/** POST /api/v2/medications/supplement-label/scan */
export const supplementLabelScanRequestSchema = z.object({
  image: z.string().min(1),
  mime_type: z.string().min(1),
});

export type SupplementLabelIngredient = z.infer<
  typeof supplementLabelIngredientSchema
>;
export type SupplementLabelExtraction = z.infer<
  typeof supplementLabelExtractionSchema
>;
