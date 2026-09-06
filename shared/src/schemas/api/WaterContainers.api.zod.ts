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
  /** Servings of the linked food one press of "+" logs. 1 for unlinked containers. */
  linked_quantity: z.number(),
  linked_food_name: z.string().nullable().optional(),
  linked_variant_serving_size: z
    .union([z.number(), z.string()])
    .nullable()
    .optional(),
  linked_variant_serving_unit: z.string().nullable().optional(),
  linked_meal_type_name: z.string().nullable().optional(),
  is_quick_add: z.boolean().default(false),
  sort_order: z.number().int().default(0),
});
export type WaterContainerResponse = z.infer<
  typeof waterContainerResponseSchema
>;

export const createWaterContainerBodySchema = z.object({
  name: z.string().min(1).max(255),
  // 0 means "no override" on a linked container: take the volume from the
  // linked food instead. Unlinked containers must still carry a real volume,
  // which the service enforces.
  volume: z.number().min(0).max(9999.999),
  unit: z.enum(["ml", "oz", "liter"]),
  is_primary: z.boolean().optional(),
  servings_per_container: z.number().int().min(1).optional(),
  hydration_factor: hydrationFactorSchema.optional(),
  linked_food_id: linkedIdSchema.optional(),
  linked_variant_id: linkedIdSchema.optional(),
  linked_meal_type_id: linkedIdSchema.optional(),
  linked_quantity: z.number().positive().max(9999).optional(),
  is_quick_add: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});
export type CreateWaterContainerBody = z.infer<
  typeof createWaterContainerBodySchema
>;

export const updateWaterContainerBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  volume: z.number().min(0).max(9999.999).optional(),
  unit: z.enum(["ml", "oz", "liter"]).optional(),
  is_primary: z.boolean().optional(),
  servings_per_container: z.number().int().min(1).optional(),
  hydration_factor: hydrationFactorSchema.optional(),
  linked_food_id: linkedIdSchema.optional(),
  linked_variant_id: linkedIdSchema.optional(),
  linked_meal_type_id: linkedIdSchema.optional(),
  linked_quantity: z.number().positive().max(9999).optional(),
  is_quick_add: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});
export type UpdateWaterContainerBody = z.infer<
  typeof updateWaterContainerBodySchema
>;

export const materializeDrinkPresetBodySchema = z.object({
  catalog_id: z.string().min(1),
});
export type MaterializeDrinkPresetBody = z.infer<
  typeof materializeDrinkPresetBodySchema
>;

export const reorderWaterContainersBodySchema = z.object({
  container_ids: z.array(z.number().int().positive()),
});
export type ReorderWaterContainersBody = z.infer<
  typeof reorderWaterContainersBodySchema
>;

