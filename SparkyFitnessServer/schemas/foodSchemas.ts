import { z } from 'zod/v4';

export const FoodVariantSchema = z.object({
  id: z.string().optional(),
  serving_size: z.number(),
  serving_unit: z.string(),
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
});

export type FoodVariant = z.infer<typeof FoodVariantSchema>;

export const NormalizedFoodSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  brand: z.string().nullable(),
  barcode: z.string().optional(),
  provider_external_id: z.string().optional(),
  provider_type: z.string().optional(),
  is_custom: z.boolean(),
  default_variant: FoodVariantSchema,
  variants: z.array(FoodVariantSchema).optional(),
});

export type NormalizedFood = z.infer<typeof NormalizedFoodSchema>;

export const PaginationSchema = z.object({
  page: z.number(),
  pageSize: z.number(),
  totalCount: z.number(),
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
