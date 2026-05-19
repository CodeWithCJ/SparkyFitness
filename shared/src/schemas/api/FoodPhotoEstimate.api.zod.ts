import { z } from "zod";

export const foodPhotoEstimateConfidenceSchema = z.enum([
  "high",
  "medium",
  "low",
]);

export const foodPhotoEstimateItemSchema = z
  .object({
    name: z.string(),
    estimated_grams: z.number(),
    portion_description: z.string(),
    preparation: z.string(),
    calories_kcal: z.number(),
    protein_g: z.number(),
    carbs_g: z.number(),
    fat_g: z.number(),
    fiber_g: z.number(),
    sugar_g: z.number(),
    item_confidence: foodPhotoEstimateConfidenceSchema,
    assumptions: z.array(z.string()).default([]),
  })
  .passthrough();

export const foodPhotoEstimateTotalsSchema = z
  .object({
    calories_kcal: z.number(),
    protein_g: z.number(),
    carbs_g: z.number(),
    fat_g: z.number(),
    fiber_g: z.number(),
    sugar_g: z.number(),
    total_grams: z.number(),
  })
  .passthrough();

export const foodPhotoEstimateResponseSchema = z
  .object({
    meal_summary: z.string(),
    overall_confidence: foodPhotoEstimateConfidenceSchema,
    confidence_reason: z.string(),
    items: z.array(foodPhotoEstimateItemSchema),
    totals: foodPhotoEstimateTotalsSchema,
    user_weight_reconciliation: z.string(),
    clarifying_questions: z.array(z.string()).default([]),
  })
  .passthrough();

export const foodPhotoEstimateErrorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "IMAGE_TOO_LARGE",
  "UNSUPPORTED_MIME_TYPE",
  "NO_AI_CONFIGURED",
  "UNSUPPORTED_PROVIDER",
  "API_KEY_MISSING",
  "CONTENT_BLOCKED",
  "PARSE_ERROR",
  "UPSTREAM_ERROR",
]);

export const foodPhotoEstimateErrorResponseSchema = z.object({
  error: z.string(),
  code: foodPhotoEstimateErrorCodeSchema,
});

export type FoodPhotoEstimateConfidence = z.infer<
  typeof foodPhotoEstimateConfidenceSchema
>;
export type FoodPhotoEstimateItem = z.infer<typeof foodPhotoEstimateItemSchema>;
export type FoodPhotoEstimateTotals = z.infer<
  typeof foodPhotoEstimateTotalsSchema
>;
export type FoodPhotoEstimateResponse = z.infer<
  typeof foodPhotoEstimateResponseSchema
>;
export type FoodPhotoEstimateErrorCode = z.infer<
  typeof foodPhotoEstimateErrorCodeSchema
>;
export type FoodPhotoEstimateErrorResponse = z.infer<
  typeof foodPhotoEstimateErrorResponseSchema
>;
