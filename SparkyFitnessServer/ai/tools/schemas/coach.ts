import { z } from 'zod';
import { optionalDateSchema } from './common.js';

export const GetHealthSummarySchema = z
  .object({
    start_date: optionalDateSchema,
    end_date: optionalDateSchema,
  })
  .strict();

export const DaysRangeSchema = z
  .object({
    days: z.coerce
      .number()
      .int()
      .min(1)
      .max(90)
      .default(7)
      .describe('Number of days to analyze (1-90)'),
  })
  .strict();

export const AnalyzeTrendsSchema = DaysRangeSchema;

export const Get30DayTrendsSchema = z
  .object({
    end_date: optionalDateSchema,
  })
  .strict();

export const DetectPatternsSchema = DaysRangeSchema.extend({
  days: z.coerce
    .number()
    .int()
    .min(1)
    .max(90)
    .default(30)
    .describe('Number of days to analyze for patterns (1-90)'),
}).strict();

export const GenerateCoachingPlanSchema = z
  .object({
    goal: z
      .enum(['weight_loss', 'muscle_gain', 'maintenance'])
      .default('maintenance'),
    target_weight: z.number().optional().describe("User's target weight in kg"),
  })
  .strict();

export type GetHealthSummaryInput = z.infer<typeof GetHealthSummarySchema>;
export type AnalyzeTrendsInput = z.infer<typeof AnalyzeTrendsSchema>;
export type Get30DayTrendsInput = z.infer<typeof Get30DayTrendsSchema>;
export type DetectPatternsInput = z.infer<typeof DetectPatternsSchema>;
export type GenerateCoachingPlanInput = z.infer<
  typeof GenerateCoachingPlanSchema
>;
