import { z } from 'zod';
import { optionalDateSchema } from './common.js';

export const SLEEP_SCIENCE_ACTIONS = [
  'sleep_debt',
  'mctq_stats',
  'daily_need',
  'energy_curve',
  'chronotype',
  'data_sufficiency',
  'recalculate_baseline',
] as const;

const sleepDebtSchema = z.object({
  action: z.literal('sleep_debt'),
});

const mctqStatsSchema = z.object({
  action: z.literal('mctq_stats'),
});

const dailyNeedSchema = z.object({
  action: z.literal('daily_need'),
  date: optionalDateSchema,
});

const energyCurveSchema = z.object({
  action: z.literal('energy_curve'),
});

const chronotypeSchema = z.object({
  action: z.literal('chronotype'),
});

const dataSufficiencySchema = z.object({
  action: z.literal('data_sufficiency'),
});

const recalculateBaselineSchema = z.object({
  action: z.literal('recalculate_baseline'),
  window_days: z.coerce.number().int().min(14).max(365).optional(),
});

export const sleepScienceSchema = z.discriminatedUnion('action', [
  sleepDebtSchema,
  mctqStatsSchema,
  dailyNeedSchema,
  energyCurveSchema,
  chronotypeSchema,
  dataSufficiencySchema,
  recalculateBaselineSchema,
]);

export type SleepScienceInput = z.infer<typeof sleepScienceSchema>;

export const sleepScienceInput = z.object({
  action: z.enum(SLEEP_SCIENCE_ACTIONS).optional(),
  date: optionalDateSchema,
  window_days: z.coerce.number().int().optional(),
});
