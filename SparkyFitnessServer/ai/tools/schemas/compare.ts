import { z } from 'zod';
import { COMPARE_METRIC_KEYS } from '@workspace/shared';
import { optionalDateSchema } from './common.js';

export const COMPARE_TOOL_ACTIONS = [
  'compare',
  'since',
  'list_metrics',
] as const;

/** Which day (or week) each side is read on: A and B together, or one a step before the other. */
export const COMPARE_TOOL_TIMINGS = [
  'same_day',
  'a_then_b',
  'b_then_a',
] as const;
export type CompareToolTiming = (typeof COMPARE_TOOL_TIMINGS)[number];

const metricKey = z.enum(COMPARE_METRIC_KEYS);

const compareSchema = z
  .object({
    action: z.literal('compare'),
    a: metricKey,
    b: metricKey,
    by: z.enum(['day', 'week']).optional(),
    timing: z.enum(COMPARE_TOOL_TIMINGS).optional(),
    start_date: optionalDateSchema,
    end_date: optionalDateSchema,
  })
  .strict();

const sinceSchema = z
  .object({
    action: z.literal('since'),
    a: metricKey,
    b: metricKey,
    habit_start_date: optionalDateSchema,
  })
  .strict();

const listMetricsSchema = z
  .object({
    action: z.literal('list_metrics'),
  })
  .strict();

/**
 * The fields each action reads. The published schema is flat, so a model can send a field of
 * another action (`timing` with `since`); the handler keeps only these before the strict parse.
 */
export const COMPARE_TOOL_FIELDS: Readonly<
  Record<(typeof COMPARE_TOOL_ACTIONS)[number], readonly string[]>
> = {
  compare: Object.keys(compareSchema.shape),
  since: Object.keys(sinceSchema.shape),
  list_metrics: Object.keys(listMetricsSchema.shape),
};

export const compareToolSchema = z.discriminatedUnion('action', [
  compareSchema,
  sinceSchema,
  listMetricsSchema,
]);

export type CompareToolInput = z.infer<typeof compareToolSchema>;

// Flat shape published to the LLM as `inputSchema`. Strict validation still
// runs in the handler via `compareToolSchema.safeParse`.
export const compareToolInput = z.object({
  action: z
    .enum(COMPARE_TOOL_ACTIONS)
    .optional()
    .describe(
      'compare: does A go with B. since: has B changed since the habit A started. list_metrics: the metric keys with their units.'
    ),
  a: metricKey
    .optional()
    .describe('compare: the first thing. since: the habit.'),
  b: metricKey
    .optional()
    .describe('compare: the second thing. since: the outcome.'),
  by: z
    .enum(['day', 'week'])
    .optional()
    .describe('compare: pair the two by day (default) or by week.'),
  timing: z
    .enum(COMPARE_TOOL_TIMINGS)
    .optional()
    .describe(
      "compare: same_day (default) pairs A and B on the same day (or week); a_then_b pairs A with B the next day (or week); b_then_a pairs A with B the day before. Sleep metrics are dated by the day the person woke, so a day's caffeine with that night's sleep is a_then_b."
    ),
  start_date: optionalDateSchema.describe(
    'compare: first day of the range (YYYY-MM-DD). Defaults to 90 days (26 weeks by week) before end_date.'
  ),
  end_date: optionalDateSchema.describe(
    'compare: last day of the range (YYYY-MM-DD). Defaults to today; today (or the current week) is never counted.'
  ),
  habit_start_date: optionalDateSchema.describe(
    'since: the day the habit started (YYYY-MM-DD). Omit it to use the suggested start.'
  ),
});
