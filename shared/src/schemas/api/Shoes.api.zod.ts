import { z } from "zod";

export const shoeStatusSchema = z.enum(["active", "retired"]);
export type ShoeStatus = z.infer<typeof shoeStatusSchema>;

/** Default retirement mileage for a new pair, in kilometres. */
export const DEFAULT_SHOE_RETIREMENT_DISTANCE_KM = 800;

const shoeDaySchema = z.iso.date();

// Column precision: purchase_price is NUMERIC(10, 2), distances NUMERIC(9, 2).
const MAX_SHOE_PRICE = 99_999_999.99;
const MAX_SHOE_DISTANCE_KM = 9_999_999.99;

export const createShoeBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  brand: z.string().trim().max(120).nullable().optional(),
  model: z.string().trim().max(120).nullable().optional(),
  nickname: z.string().trim().max(120).nullable().optional(),
  purchase_date: shoeDaySchema.nullable().optional(),
  purchase_price: z.number().min(0).max(MAX_SHOE_PRICE).nullable().optional(),
  starting_distance_km: z.number().min(0).max(MAX_SHOE_DISTANCE_KM).optional(),
  retirement_distance_km: z
    .number()
    .positive()
    .max(MAX_SHOE_DISTANCE_KM)
    .optional(),
  is_default: z.boolean().optional(),
});
export type CreateShoeBody = z.infer<typeof createShoeBodySchema>;

export const updateShoeBodySchema = createShoeBodySchema.partial().extend({
  status: shoeStatusSchema.optional(),
});
export type UpdateShoeBody = z.infer<typeof updateShoeBodySchema>;

export const shoeResponseSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  nickname: z.string().nullable(),
  purchase_date: z.string().nullable(),
  purchase_price: z.number().nullable(),
  starting_distance_km: z.number(),
  retirement_distance_km: z.number(),
  status: shoeStatusSchema,
  is_default: z.boolean(),
  retired_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  /** Distance logged on linked diary entries, in kilometres. */
  logged_distance_km: z.number(),
  /** starting_distance_km + logged_distance_km. */
  total_distance_km: z.number(),
  run_count: z.number(),
  last_used_date: z.string().nullable(),
  /** total_distance_km >= retirement_distance_km. */
  is_worn_out: z.boolean(),
});
export type ShoeResponse = z.infer<typeof shoeResponseSchema>;

export const shoeListResponseSchema = z.array(shoeResponseSchema);
export type ShoeListResponse = z.infer<typeof shoeListResponseSchema>;

/** Body for linking (or unlinking, with null) a shoe to a diary entry. */
export const assignShoeBodySchema = z.object({
  shoe_id: z.string().uuid().nullable(),
});
export type AssignShoeBody = z.infer<typeof assignShoeBodySchema>;

export const assignShoeResponseSchema = z.object({
  exercise_entry_id: z.string(),
  shoe_id: z.string().nullable(),
});
export type AssignShoeResponse = z.infer<typeof assignShoeResponseSchema>;
