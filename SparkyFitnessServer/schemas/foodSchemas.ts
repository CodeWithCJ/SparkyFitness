import { z } from 'zod/v4';

export const FoodVariantSchema = z.object({
  id: z.string().optional(),
  user_id: z.string().optional(),
  serving_size: z.number(),
  serving_unit: z.string(),
  serving_description: z.string().optional(),
  serving_weight: z.number().optional(),
  serving_weight_unit: z.string().optional(),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  saturated_fat: z.number().optional(),
  polyunsaturated_fat: z.number().optional(),
  monounsaturated_fat: z.number().optional(),
  trans_fat: z.number().optional(),
  cholesterol: z.number().optional(),
  sodium: z.number().optional(),
  potassium: z.number().optional(),
  dietary_fiber: z.number().optional(),
  sugars: z.number().optional(),
  vitamin_a: z.number().optional(),
  vitamin_c: z.number().optional(),
  calcium: z.number().optional(),
  iron: z.number().optional(),
  is_default: z.boolean(),
  glycemic_index: z.string().optional(),
  custom_nutrients: z
    .record(z.string(), z.union([z.string(), z.number()]))
    .optional(),
  source: z.enum(['manual', 'ai_estimate', 'imported']).optional(),
  ai_confidence: z.enum(['high', 'medium', 'low']).nullable().optional(),
  allergens: z.array(z.string()).nullable().optional(),
  traces: z.array(z.string()).nullable().optional(),
});

export type FoodVariant = z.infer<typeof FoodVariantSchema>;

export const NormalizedFoodSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  brand: z.string().nullable(),
  barcode: z.string().optional(),
  provider_external_id: z.string().optional(),
  provider_type: z.string().optional(),
  provider_verified: z.boolean().optional(),
  is_custom: z.boolean(),
  default_variant: FoodVariantSchema,
  variants: z.array(FoodVariantSchema).optional(),
});

export type NormalizedFood = z.infer<typeof NormalizedFoodSchema>;

export const PaginationSchema = z.object({
  // Some providers (e.g. Open Food Facts' legacy cgi/search.pl endpoint) report
  // these pagination values as strings, and the same field can switch between a
  // string and a number across requests. Coerce them so any provider that sends
  // string-typed numeric pagination is normalized rather than failing response
  // validation. `.int()` makes the integer intent explicit and rejects
  // non-integer floats (e.g. "1.5"). `hasMore` stays a strict boolean.
  page: z.coerce.number().int(),
  pageSize: z.coerce.number().int(),
  totalCount: z.coerce.number().int(),
  hasMore: z.boolean(),
});

export type Pagination = z.infer<typeof PaginationSchema>;

export const SearchResponseSchema = z.object({
  foods: z.array(NormalizedFoodSchema),
  pagination: PaginationSchema,
});

export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export const BarcodeResponseSchema = z.object({
  source: z.string(),
  food: NormalizedFoodSchema.nullable(),
});

export type BarcodeResponse = z.infer<typeof BarcodeResponseSchema>;
