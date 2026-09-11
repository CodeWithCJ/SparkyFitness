import { z } from 'zod/v4';

export const WATER_CONTAINER_UNITS = ['ml', 'oz', 'liter'] as const;

export const WaterContainerIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const nameSchema = z.string().min(1).max(255);
// Stored as numeric(10,3) after unit conversion; the min stops ml values
// from rounding to 0.000 and the max keeps the worst-case liter -> ml
// conversion inside the column's range
// 0 is the "no override" sentinel on a linked container: take the volume from
// the linked food. Unlinked containers still need a real volume, enforced in
// the service rather than here, since this schema cannot see the link.
const volumeSchema = z.number().min(0).max(9999.999);
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

/**
 * volume 0 means "no override -- take the volume from the linked food", so it
 * is only meaningful on a linked container. An unlinked one has nothing else to
 * measure a drink with, and 0 would silently credit no water at all.
 *
 * The precision rule is separate: numeric(10,3) cannot store anything between 0
 * and 0.001, so such a value would round to zero in the database and quietly
 * become "no override".
 */
function checkVolumeAgainstLink(
  data: { volume?: number; linked_food_id?: string | null },
  ctx: z.RefinementCtx
) {
  if (data.volume === undefined) return;
  if (data.volume > 0 && data.volume < 0.001) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['volume'],
      message: 'Volume must be at least 0.001.',
    });
    return;
  }
  if (data.volume === 0 && !data.linked_food_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['volume'],
      message:
        'Volume must be greater than 0 unless the container is linked to a food.',
    });
  }
}

export const CreateWaterContainerBodySchema = z
  .object({
    name: nameSchema,
    volume: volumeSchema,
    unit: unitSchema,
    is_primary: z.boolean().default(false),
    servings_per_container: servingsSchema.default(1),
    hydration_factor: hydrationFactorSchema.optional(),
    linked_quantity: z.number().positive().max(9999).optional(),
    linked_food_id: linkedFoodIdSchema.optional(),
    linked_variant_id: linkedVariantIdSchema.optional(),
    linked_meal_type_id: linkedMealTypeIdSchema.optional(),
    is_quick_add: z.boolean().default(false),
    sort_order: z.number().int().default(0),
  })
  .superRefine(checkVolumeAgainstLink);

export const UpdateWaterContainerBodySchema = z
  .object({
    name: nameSchema.optional(),
    volume: volumeSchema.optional(),
    unit: unitSchema.optional(),
    is_primary: z.boolean().optional(),
    servings_per_container: servingsSchema.optional(),
    hydration_factor: hydrationFactorSchema.optional(),
    linked_quantity: z.number().positive().max(9999).optional(),
    linked_food_id: linkedFoodIdSchema.optional(),
    linked_variant_id: linkedVariantIdSchema.optional(),
    linked_meal_type_id: linkedMealTypeIdSchema.optional(),
    is_quick_add: z.boolean().optional(),
    sort_order: z.number().int().optional(),
  })
  .superRefine(checkVolumeAgainstLink);

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
