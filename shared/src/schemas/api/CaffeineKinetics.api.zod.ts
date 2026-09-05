import { z } from "zod";

export const caffeineDoseSchema = z.object({
  at: z.string(),
  mg: z.number(),
  name: z.string().optional(),
  is_estimated: z.boolean().optional(),
});

export const caffeineActiveResponseSchema = z.object({
  half_life_hours: z.number(),
  target_bedtime: z.string(),
  bedtime_at: z.string(),
  doses: z.array(caffeineDoseSchema),
  active_mg_now: z.number(),
  at_bedtime_mg: z.number(),
  latest_safe_dose_time: z.string().nullable(),
  threshold_mg: z.number(),
  has_estimated_times: z.boolean(),
});

export type CaffeineDoseApi = z.infer<typeof caffeineDoseSchema>;
export type CaffeineActiveResponse = z.infer<
  typeof caffeineActiveResponseSchema
>;
