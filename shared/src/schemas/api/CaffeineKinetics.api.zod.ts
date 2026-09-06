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
  /** Local HH:MM, present only when cutoff_state is "by" or "passed". */
  latest_safe_dose_time: z.string().nullable(),
  /**
   * Which of the four answers latest_safe_dose_time is expressing. A nullable
   * time cannot separate "room all evening" from "already over the threshold",
   * and those two need opposite advice.
   */
  cutoff_state: z.enum(["anytime", "by", "passed", "over"]),
  /** Room left under the threshold at bedtime; negative once already over. */
  bedtime_headroom_mg: z.number(),
  /** The dose the cutoff was computed for, so a client can label it honestly. */
  cutoff_dose_mg: z.number(),
  threshold_mg: z.number(),
  has_estimated_times: z.boolean(),
});

export type CaffeineDoseApi = z.infer<typeof caffeineDoseSchema>;
export type CaffeineActiveResponse = z.infer<
  typeof caffeineActiveResponseSchema
>;
