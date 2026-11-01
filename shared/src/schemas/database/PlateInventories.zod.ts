import { z } from 'zod';

export const plateInventoriesIdSchema = z.string();

const plateBarJsonSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  kind: z.enum(['barbell', 'womens', 'ez', 'trap', 'other']),
  weight: z.number(),
});

const plateDenominationJsonSchema = z.object({
  weight: z.number(),
  pairs: z.number(),
});

export const plateInventoriesSchema = z.object({
  id: plateInventoriesIdSchema,
  user_id: z.string(),
  weight_unit: z.enum(['kg', 'lbs']),
  bars: z.array(plateBarJsonSchema),
  plates: z.array(plateDenominationJsonSchema),
  collars_enabled: z.boolean(),
  collar_weight: z.number(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  created_by_user_id: z.string().nullable(),
  updated_by_user_id: z.string().nullable(),
});

export const plateInventoriesInitializerSchema = z.object({
  id: plateInventoriesIdSchema.optional(),
  user_id: z.string(),
  weight_unit: z.enum(['kg', 'lbs']).optional().default('kg'),
  bars: z.array(plateBarJsonSchema).optional().default([]),
  plates: z.array(plateDenominationJsonSchema).optional().default([]),
  collars_enabled: z.boolean().optional().default(false),
  collar_weight: z.number().optional().default(0),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
  created_by_user_id: z.string().optional().nullable(),
  updated_by_user_id: z.string().optional().nullable(),
});

export const plateInventoriesMutatorSchema =
  plateInventoriesInitializerSchema.partial();

export type PlateInventories = z.infer<typeof plateInventoriesSchema>;
export type PlateInventoriesInitializer = z.infer<
  typeof plateInventoriesInitializerSchema
>;
export type PlateInventoriesMutator = z.infer<
  typeof plateInventoriesMutatorSchema
>;
