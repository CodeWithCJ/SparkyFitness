import { z } from 'zod';
import { ORAL_CARE_TYPES } from '../../utils/oralCare.ts';

export const oralCareTypeSchema = z.enum(ORAL_CARE_TYPES);
export type OralCareType = z.infer<typeof oralCareTypeSchema>;

const dayStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const customLabelSchema = z.string().trim().min(1).max(50);

/** Providers a client may send; health-store imports arrive through /api/health-data. */
export const oralCareClientProviderSchema = z.enum(['manual', 'timer']);

const sessionFields = {
  entry_date: dayStringSchema,
  start_time: z.string().datetime({ offset: true }).nullable().optional(),
  end_time: z.string().datetime({ offset: true }).nullable().optional(),
  duration_seconds: z.number().int().positive().max(3600).nullable().optional(),
  care_type: oralCareTypeSchema.default('brushing'),
  custom_label: customLabelSchema.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
};

function checkLabelAndTimes(
  value: {
    care_type?: OralCareType;
    custom_label?: string | null;
    start_time?: string | null;
    end_time?: string | null;
  },
  ctx: z.RefinementCtx
): void {
  if (value.care_type === 'other' && !value.custom_label) {
    ctx.addIssue({
      code: 'custom',
      path: ['custom_label'],
      message: 'custom_label is required when care_type is other',
    });
  }
  if (
    value.care_type !== undefined &&
    value.care_type !== 'other' &&
    value.custom_label
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['custom_label'],
      message: 'custom_label is only allowed when care_type is other',
    });
  }
  if (
    value.start_time &&
    value.end_time &&
    Date.parse(value.end_time) < Date.parse(value.start_time)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['end_time'],
      message: 'end_time must not be before start_time',
    });
  }
}

export const createOralCareSessionBodySchema = z
  .object({
    ...sessionFields,
    provider: oralCareClientProviderSchema.default('manual'),
  })
  .superRefine(checkLabelAndTimes);
export type CreateOralCareSessionBody = z.infer<
  typeof createOralCareSessionBodySchema
>;

/**
 * Fields sent replace the stored ones; `null` clears an optional field. The
 * type and label are checked together, so changing to or from `other` sends both.
 */
export const updateOralCareSessionBodySchema = z
  .object({
    entry_date: sessionFields.entry_date.optional(),
    start_time: sessionFields.start_time,
    end_time: sessionFields.end_time,
    duration_seconds: sessionFields.duration_seconds,
    care_type: oralCareTypeSchema.optional(),
    custom_label: sessionFields.custom_label,
    notes: sessionFields.notes,
  })
  .superRefine(checkLabelAndTimes);
export type UpdateOralCareSessionBody = z.infer<
  typeof updateOralCareSessionBodySchema
>;

export const oralCareSessionResponseSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  entry_date: z.string(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  duration_seconds: z.number().nullable(),
  care_type: oralCareTypeSchema,
  custom_label: z.string().nullable(),
  provider: z.string(),
  external_id: z.string().nullable(),
  notes: z.string().nullable(),
  /** True when a synced brush recorded the same brushing, so this one is not counted. */
  covered_by_sync: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type OralCareSessionResponse = z.infer<
  typeof oralCareSessionResponseSchema
>;

export const oralCareSettingsSchema = z.object({
  daily_target: z.number().int().min(1).max(6),
  target_seconds: z.number().int().min(30).max(600),
});
export type OralCareSettings = z.infer<typeof oralCareSettingsSchema>;

export const oralCareDaySummaryResponseSchema = z.object({
  entry_date: z.string(),
  settings: oralCareSettingsSchema,
  brushing_count: z.number(),
  brushing_seconds: z.number(),
  brushes_at_target: z.number(),
  goal_met: z.boolean(),
  counts_by_type: z.record(oralCareTypeSchema, z.number()),
  streak: z.number(),
  sessions: z.array(oralCareSessionResponseSchema),
});
export type OralCareDaySummaryResponse = z.infer<
  typeof oralCareDaySummaryResponseSchema
>;

export const oralCareHistoryQuerySchema = z.object({
  startDate: dayStringSchema,
  endDate: dayStringSchema,
});

export const oralCareHistoryDaySchema = z.object({
  date: z.string(),
  brushing_count: z.number(),
  brushing_seconds: z.number(),
  goal_met: z.boolean(),
  other_count: z.number(),
});
export type OralCareHistoryDay = z.infer<typeof oralCareHistoryDaySchema>;

export const oralCareHistoryResponseSchema = z.object({
  settings: oralCareSettingsSchema,
  days: z.array(oralCareHistoryDaySchema),
  streak: z.number(),
  best_streak: z.number(),
  /** Custom names used before, newest first, for the "other" picker. */
  recent_custom_labels: z.array(z.string()),
});
export type OralCareHistoryResponse = z.infer<
  typeof oralCareHistoryResponseSchema
>;
