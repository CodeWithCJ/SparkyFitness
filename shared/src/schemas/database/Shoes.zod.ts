import { z } from "zod";

export const shoesIdSchema = z.string();

export const shoesSchema = z.object({
  id: shoesIdSchema,
  user_id: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  nickname: z.string().nullable(),
  purchase_date: z.string().nullable(),
  purchase_price: z.number().nullable(),
  starting_distance_km: z.number(),
  retirement_distance_km: z.number(),
  status: z.enum(["active", "retired"]),
  is_default: z.boolean(),
  retired_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  created_by_user_id: z.string().nullable(),
  updated_by_user_id: z.string().nullable(),
});

export const shoesInitializerSchema = z.object({
  id: shoesIdSchema.optional(),
  user_id: z.string(),
  name: z.string(),
  brand: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  nickname: z.string().optional().nullable(),
  purchase_date: z.string().optional().nullable(),
  purchase_price: z.number().optional().nullable(),
  starting_distance_km: z.number().optional().default(0),
  retirement_distance_km: z.number().optional().default(800),
  status: z.enum(["active", "retired"]).optional().default("active"),
  is_default: z.boolean().optional().default(false),
  retired_at: z.coerce.date().optional().nullable(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
  created_by_user_id: z.string().optional().nullable(),
  updated_by_user_id: z.string().optional().nullable(),
});

export const shoesMutatorSchema = shoesInitializerSchema.partial();

export type Shoes = z.infer<typeof shoesSchema>;
export type ShoesInitializer = z.infer<typeof shoesInitializerSchema>;
export type ShoesMutator = z.infer<typeof shoesMutatorSchema>;
