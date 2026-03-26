import { z } from "zod";

export const dashboardStatsResponseSchema = z
  .object({
    eaten: z.number(),
    burned: z.number(),
    remaining: z.number(),
    goal: z.number(),
    net: z.number(),
    progress: z.number(),
    steps: z.number(),
    stepCalories: z.number(),
    bmr: z.number(),
    unit: z.string(),
  })
  .strict();

export type DashboardStatsResponse = z.infer<typeof dashboardStatsResponseSchema>;
