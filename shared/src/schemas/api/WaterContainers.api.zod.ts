import { z } from "zod";

// Consumed by fetchWaterContainers (mobile measurementsApi.ts) and
// getWaterContainers (web waterContainerService.ts) -- both clients read
// the container-food link fields added in #2115.

const hydrationFactorSchema = z.number().min(0).max(2);
const linkedIdSchema = z.string().nullable();

export const waterContainerResponseSchema = z.object({
  id: z.number(),
  user_id: z.string(),
  name: z.string(),
  volume: z.number(),
  unit: z.enum(["ml", "oz", "liter"]),
  is_primary: z.boolean().nullable(),
  servings_per_container: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  hydration_factor: hydrationFactorSchema,
  linked_food_id: linkedIdSchema,
  linked_variant_id: linkedIdSchema,
  linked_meal_type_id: linkedIdSchema,
  linked_food_name: z.string().nullable().optional(),
  linked_variant_serving_size: z
    .union([z.number(), z.string()])
    .nullable()
    .optional(),
  linked_variant_serving_unit: z.string().nullable().optional(),
  linked_meal_type_name: z.string().nullable().optional(),
});
export type WaterContainerResponse = z.infer<
  typeof waterContainerResponseSchema
>;

export const createWaterContainerBodySchema = z.object({
  name: z.string().min(1).max(255),
  volume: z.number().min(0.001).max(9999.999),
  unit: z.enum(["ml", "oz", "liter"]),
  is_primary: z.boolean().optional(),
  servings_per_container: z.number().int().min(1).optional(),
  hydration_factor: hydrationFactorSchema.optional(),
  linked_food_id: linkedIdSchema.optional(),
  linked_variant_id: linkedIdSchema.optional(),
  linked_meal_type_id: linkedIdSchema.optional(),
});
export type CreateWaterContainerBody = z.infer<
  typeof createWaterContainerBodySchema
>;

export const updateWaterContainerBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  volume: z.number().min(0.001).max(9999.999).optional(),
  unit: z.enum(["ml", "oz", "liter"]).optional(),
  is_primary: z.boolean().optional(),
  servings_per_container: z.number().int().min(1).optional(),
  hydration_factor: hydrationFactorSchema.optional(),
  linked_food_id: linkedIdSchema.optional(),
  linked_variant_id: linkedIdSchema.optional(),
  linked_meal_type_id: linkedIdSchema.optional(),
});
export type UpdateWaterContainerBody = z.infer<
  typeof updateWaterContainerBodySchema
>;
