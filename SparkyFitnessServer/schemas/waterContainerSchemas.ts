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

export const CreateWaterContainerBodySchema = z.object({
  name: nameSchema,
  volume: volumeSchema,
  unit: unitSchema,
  is_primary: z.boolean().default(false),
  servings_per_container: servingsSchema.default(1),
});

export const UpdateWaterContainerBodySchema = z.object({
  name: nameSchema.optional(),
  volume: volumeSchema.optional(),
  unit: unitSchema.optional(),
  is_primary: z.boolean().optional(),
  servings_per_container: servingsSchema.optional(),
});

export type CreateWaterContainerBody = z.infer<
  typeof CreateWaterContainerBodySchema
>;
export type UpdateWaterContainerBody = z.infer<
  typeof UpdateWaterContainerBodySchema
>;
