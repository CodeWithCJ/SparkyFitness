import { z } from "zod";
import { dailySleepNeedSchema } from "../database/DailySleepNeed.zod";

// DailyNeedData: extends DB schema, with date/method/confidence as API-only fields
export const dailyNeedResponseSchema = dailySleepNeedSchema
  .omit({ id: true, user_id: true, target_date: true, calculated_at: true })
  .extend({
    date: z.string(),
    method: z.string(),
    confidence: z.string(),
  });

export type DailyNeedData = z.infer<typeof dailyNeedResponseSchema>;

// SleepDebtDailyEntry
export const sleepDebtDailyEntrySchema = z.object({
  date: z.string(),
  tst: z.number(),
  deviation: z.number(),
  weight: z.number(),
  weightedDebt: z.number(),
});
export type SleepDebtDailyEntry = z.infer<typeof sleepDebtDailyEntrySchema>;

// SleepDebtData
export const sleepDebtDataSchema = z.object({
  currentDebt: z.number(),
  debtCategory: z.enum(['low', 'moderate', 'high', 'critical']),
  sleepNeed: z.number(),
  last14Days: z.array(sleepDebtDailyEntrySchema),
  trend: z.object({
    direction: z.enum(['improving', 'stable', 'worsening']),
    change7d: z.number(),
  }),
  paybackTime: z.number(),
});
export type SleepDebtData = z.infer<typeof sleepDebtDataSchema>;

// MCTQStatsData
export const mctqStatsDayClassificationSchema = z.object({
  dayOfWeek: z.number(),
  classifiedAs: z.string(),
  meanWakeHour: z.number().nullable(),
  varianceMinutes: z.number().nullable(),
  sampleCount: z.number(),
});

export const mctqStatsDataSchema = z.object({
  profile: z.object({
    baselineSleepNeed: z.number(),
    method: z.string(),
    confidence: z.string(),
    basedOnDays: z.number(),
    lastCalculated: z.string().nullable(),
    sdWorkday: z.number().nullable(),
    sdFreeday: z.number().nullable(),
    socialJetlag: z.number().nullable(),
  }).nullable(),
  latestCalculation: z.record(z.string(), z.unknown()).nullable(),
  dayClassifications: z.array(mctqStatsDayClassificationSchema),
});
export type MCTQStatsData = z.infer<typeof mctqStatsDataSchema>;

// BaselineResult
export const baselineResultSchema = z.object({
  success: z.boolean(),
  sleepNeedIdeal: z.number().optional(),
  sdWorkday: z.number().optional(),
  sdFreeday: z.number().optional(),
  sdWeek: z.number().optional(),
  socialJetlag: z.number().nullable().optional(),
  confidence: z.string().optional(),
  basedOnDays: z.number().optional(),
  workdaysCount: z.number().optional(),
  freedaysCount: z.number().optional(),
  method: z.string().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});
export type BaselineResult = z.infer<typeof baselineResultSchema>;

// EnergyCurvePoint
export const energyCurvePointSchema = z.object({
  hour: z.number(),
  time: z.string(),
  energy: z.number(),
  zone: z.enum(['peak', 'rising', 'dip', 'wind-down', 'sleep']),
  processS: z.number(),
  processC: z.number(),
});
export type EnergyCurvePoint = z.infer<typeof energyCurvePointSchema>;

// EnergyCurveData
export const energyCurveDataSchema = z.object({
  success: z.boolean(),
  points: z.array(energyCurvePointSchema).optional(),
  currentEnergy: z.number().optional(),
  currentZone: z.string().optional(),
  nextPeak: z.object({ hour: z.number(), energy: z.number() }).nullable().optional(),
  nextDip: z.object({ hour: z.number(), energy: z.number() }).nullable().optional(),
  melatoninWindow: z.object({ start: z.number(), end: z.number() }).optional(),
  wakeTime: z.number().optional(),
  sleepDebtPenalty: z.number().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});
export type EnergyCurveData = z.infer<typeof energyCurveDataSchema>;

// ChronotypeData
export const chronotypeDataSchema = z.object({
  success: z.boolean(),
  chronotype: z.enum(['early', 'intermediate', 'late']).optional(),
  averageWakeTime: z.string().optional(),
  averageSleepTime: z.string().nullable().optional(),
  circadianNadir: z.string().optional(),
  circadianAcrophase: z.string().optional(),
  melatoninWindowStart: z.string().nullable().optional(),
  melatoninWindowEnd: z.string().nullable().optional(),
  basedOnDays: z.number().optional(),
  confidence: z.string().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});
export type ChronotypeData = z.infer<typeof chronotypeDataSchema>;

// DataSufficiencyData
export const dataSufficiencyDataSchema = z.object({
  sufficient: z.boolean(),
  totalDays: z.number(),
  daysWithTimestamps: z.number(),
  workdaysAvailable: z.number(),
  freedaysAvailable: z.number(),
  workdaysNeeded: z.number(),
  freedaysNeeded: z.number(),
  projectedConfidence: z.string(),
  recommendation: z.string(),
});
export type DataSufficiencyData = z.infer<typeof dataSufficiencyDataSchema>;
