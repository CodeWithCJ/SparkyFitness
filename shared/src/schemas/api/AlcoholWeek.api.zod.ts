import { z } from "zod";

export const alcoholDayTotalSchema = z.object({
  date: z.string(),
  alcohol_g: z.number(),
  standard_drinks: z.number(),
});

export const alcoholWeekResponseSchema = z.object({
  week_start: z.string(),
  week_end: z.string(),
  total_g: z.number(),
  standard_drinks: z.number(),
  limit_g: z.number().nullable(),
  limit_standard_drinks: z.number().nullable(),
  over_limit: z.boolean(),
  days: z.array(alcoholDayTotalSchema),
});

export type AlcoholDayTotal = z.infer<typeof alcoholDayTotalSchema>;
export type AlcoholWeekResponse = z.infer<typeof alcoholWeekResponseSchema>;
