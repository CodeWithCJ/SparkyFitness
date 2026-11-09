import { z } from 'zod';

/** Additive response contract for GET /api/adaptive-tdee. */
export const adaptiveTdeeResponseSchema = z.object({
  tdee: z.number(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  weightTrend: z.number().nullable().optional(),
  isFallback: z.boolean(),
  fallbackReason: z.string().optional(),
  avgIntake: z.number().optional(),
  daysOfData: z.number(),
  lastCalculated: z.string(),
  startWeightTrend: z.number().optional(),
  endWeightTrend: z.number().optional(),
  /** Fitted change across the actual observation span. */
  weightChangeKg: z.number().optional(),
  daysInWindow: z.number().optional(),
  windowStartDate: z.string().optional(),
  windowEndDate: z.string().optional(),
  /** Observed fitted daily rate, before expenditure-history smoothing. */
  dailyWeightChangeKg: z.number().optional(),
  weightChangeCalories: z.number().optional(),
  rawTdee: z.number().optional(),
  wasClamped: z.boolean().optional(),
  clampMin: z.number().optional(),
  clampMax: z.number().optional(),
  averageActivityCalories: z.number().optional(),
  rawActivityAdjustedTdee: z.number().optional(),
  activityAdjustedTdee: z.number().optional(),
  activityDaysOfData: z.number().optional(),
  /** Absent on older servers; clients retain the legacy explanation. */
  weightTrendMethod: z.literal('bounded_daily').optional(),
  observedWeightDays: z.number().optional(),
  weightObservationSpanDays: z.number().optional(),
  lastWeightDate: z.string().optional(),
  candidateDate: z.string().optional(),
  daysSinceLastWeight: z.number().optional(),
  daysSinceEstimate: z.number().optional(),
  estimateStatus: z
    .enum(['learning', 'adaptive', 'held', 'fading', 'fallback'])
    .optional(),
  /** Learned inputs among the fixed expenditure-history window. */
  stabilizationDays: z.number().optional(),
  stabilizationWindowDays: z.number().optional(),
  /** New-day bound with an unchanged formula baseline and unchanged past logs. */
  dailyChangeLimitKcal: z.number().optional(),
  /** Final expenditure minus the latest candidate after its plausibility cap. */
  stabilityAdjustmentKcal: z.number().optional(),
  activityStabilityAdjustmentKcal: z.number().optional(),
});

export type AdaptiveTdeeResult = z.infer<typeof adaptiveTdeeResponseSchema>;
