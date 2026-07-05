import { z } from 'zod/v4';
import { isDayString } from '@workspace/shared';

const optionalNullableString = z.string().nullable().optional();
const dayString = z
  .string()
  .refine((v) => isDayString(v), { message: 'Expected YYYY-MM-DD' });

const CYCLE_MODES = [
  'standard',
  'ttc',
  'pregnant',
  'postpartum',
  'menopause',
] as const;

const FLOW_LEVELS = ['none', 'spotting', 'light', 'medium', 'heavy'] as const;

// --- Settings ---------------------------------------------------------------

export const UpsertCycleSettingsBodySchema = z
  .object({
    enabled: z.boolean().optional(),
    mode: z.enum(CYCLE_MODES).optional(),
    avg_cycle_length_override: z
      .number()
      .int()
      .min(15)
      .max(90)
      .nullable()
      .optional(),
    avg_period_length_override: z
      .number()
      .int()
      .min(1)
      .max(15)
      .nullable()
      .optional(),
    luteal_phase_length: z.number().int().min(9).max(18).optional(),
    birth_control_method: z.string().max(20).optional(),
    conditions: z.array(z.string()).optional(),
    show_fertile_window: z.boolean().optional(),
    preferred_products: z.array(z.string()).optional(),
    dismissed_prompts: z.array(z.string()).optional(),
    terminology: z.enum(['default', 'neutral']).optional(),
    discreet_mode: z.boolean().optional(),
    mark_onboarded: z.boolean().optional(),
    reset_onboarding: z.boolean().optional(),
  })
  .loose();

export type UpsertCycleSettingsBody = z.infer<
  typeof UpsertCycleSettingsBodySchema
>;

// --- Daily logs -------------------------------------------------------------

export const UpsertDailyLogBodySchema = z
  .object({
    flow_level: z.enum(FLOW_LEVELS).nullable().optional(),
    product_usage: z.record(z.string(), z.number().int().min(0)).optional(),
    cervical_mucus: optionalNullableString,
    unusual_discharge: z.array(z.string()).optional(),
    energy: z.number().int().min(1).max(5).nullable().optional(),
    libido: z.number().int().min(1).max(5).nullable().optional(),
    notes: optionalNullableString,
    intercourse: z.boolean().nullable().optional(),
    intercourse_protected: z.boolean().nullable().optional(),
    cervical_position: z.string().max(30).nullable().optional(),
    custom_fields: z.record(z.string(), z.unknown()).optional(),
  })
  .loose();

export type UpsertDailyLogBody = z.infer<typeof UpsertDailyLogBodySchema>;

export const DateParamSchema = z
  .object({
    date: dayString,
  })
  .loose();

export const ListLogsQuerySchema = z
  .object({
    startDate: dayString,
    endDate: dayString,
  })
  .loose();

export type ListLogsQuery = z.infer<typeof ListLogsQuerySchema>;

export const ListCyclesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .loose();

export const OverviewQuerySchema = z
  .object({
    date: dayString.optional(),
  })
  .loose();

export const DismissPromptBodySchema = z
  .object({
    key: z.string().min(1),
  })
  .loose();

export const BulkFlowLogsBodySchema = z.array(
  z.object({
    date: dayString,
    flow_level: z
      .enum(['none', 'spotting', 'light', 'medium', 'heavy'])
      .nullable(),
  })
);

export const CreateManualCycleBodySchema = z
  .object({
    start_date: dayString,
    end_date: dayString.nullable().optional(),
    period_length: z.number().int().min(1).max(15).nullable().optional(),
    cycle_length: z.number().int().min(15).max(90).nullable().optional(),
    is_excluded: z.boolean().optional(),
  })
  .loose();

export const UpdateCycleBodySchema = z
  .object({
    start_date: dayString.optional(),
    end_date: dayString.nullable().optional(),
    period_length: z.number().int().min(1).max(15).nullable().optional(),
    cycle_length: z.number().int().min(15).max(90).nullable().optional(),
    is_excluded: z.boolean().optional(),
  })
  .loose();

export const CreateTestEntryBodySchema = z
  .object({
    entry_date: dayString,
    tested_at: z.string().optional(),
    test_type: z.enum(['opk', 'hpt']),
    result: z.string().min(1),
    notes: optionalNullableString,
  })
  .loose();

export type CreateTestEntryBody = z.infer<typeof CreateTestEntryBodySchema>;

export const ListTestEntriesQuerySchema = z
  .object({
    startDate: dayString,
    endDate: dayString,
  })
  .loose();

export type ListTestEntriesQuery = z.infer<typeof ListTestEntriesQuerySchema>;
