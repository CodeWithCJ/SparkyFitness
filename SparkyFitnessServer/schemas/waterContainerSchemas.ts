import { z } from 'zod/v4';

export const WATER_CONTAINER_UNITS = ['ml', 'oz', 'liter'] as const;

export const WaterContainerIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const nameSchema = z.string().min(1).max(255);
// Stored as numeric(10,3) after unit conversion; the min stops ml values
// from rounding to 0.000 and the max keeps the worst-case liter -> ml
// conversion inside the column's range
const volumeSchema = z.number().min(0.001).max(9999.999);
const unitSchema = z.enum(WATER_CONTAINER_UNITS);
const servingsSchema = z.number().int().min(1);
// Scales ONLY the water credit (#2115); calories/macros/caffeine/alcohol from
// a linked food always count in full. 0-2 matches the migration's CHECK.
const hydrationFactorSchema = z.number().min(0).max(2);
// nullable (not just optional): an explicit null is how a client unlinks a
// container from its food, following preferenceRepository's
// default_barcode_provider_id explicit-null-clears precedent.
const linkedFoodIdSchema = z.string().nullable();
const linkedVariantIdSchema = z.string().nullable();
const linkedMealTypeIdSchema = z.string().nullable();

export const CreateWaterContainerBodySchema = z.object({
  name: nameSchema,
  volume: volumeSchema,
  unit: unitSchema,
  is_primary: z.boolean().default(false),
  servings_per_container: servingsSchema.default(1),
  hydration_factor: hydrationFactorSchema.optional(),
  linked_food_id: linkedFoodIdSchema.optional(),
  linked_variant_id: linkedVariantIdSchema.optional(),
  linked_meal_type_id: linkedMealTypeIdSchema.optional(),
  is_quick_add: z.boolean().default(false),
  sort_order: z.number().int().default(0),
});

export const UpdateWaterContainerBodySchema = z.object({
  name: nameSchema.optional(),
  volume: volumeSchema.optional(),
  unit: unitSchema.optional(),
  is_primary: z.boolean().optional(),
  servings_per_container: servingsSchema.optional(),
  hydration_factor: hydrationFactorSchema.optional(),
  linked_food_id: linkedFoodIdSchema.optional(),
  linked_variant_id: linkedVariantIdSchema.optional(),
  linked_meal_type_id: linkedMealTypeIdSchema.optional(),
  is_quick_add: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

export const MaterializeDrinkPresetBodySchema = z.object({
  catalog_id: z.string().min(1),
});

export const ReorderWaterContainersBodySchema = z.object({
  container_ids: z.array(z.number().int().positive()),
});

export type CreateWaterContainerBody = z.infer<
  typeof CreateWaterContainerBodySchema
>;
export type UpdateWaterContainerBody = z.infer<
  typeof UpdateWaterContainerBodySchema
>;
export type MaterializeDrinkPresetBody = z.infer<
  typeof MaterializeDrinkPresetBodySchema
>;
export type ReorderWaterContainersBody = z.infer<
  typeof ReorderWaterContainersBodySchema
>;
