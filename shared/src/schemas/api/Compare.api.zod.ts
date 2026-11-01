import { z } from 'zod';
import { COMPARE_METRIC_KEYS, offeredInMode } from '../../compare/metrics.ts';
import { MAX_CUSTOM_DAYS } from '../../compare/spans.ts';
import { daysBetween, isDayString } from '../../utils/timezone.ts';

const dayString = z
  .string()
  .refine(isDayString, { message: 'Expected YYYY-MM-DD' });

const metricKey = z.enum(COMPARE_METRIC_KEYS);

export const compareQuerySchema = z
  .object({
    a: metricKey,
    b: metricKey,
    mode: z.enum(['day', 'week']).default('day'),
    timing: z.coerce.number().int().min(-1).max(1).default(0),
    start: dayString,
    end: dayString,
  })
  .superRefine((q, ctx) => {
    if (q.a === q.b) {
      ctx.addIssue({
        code: 'custom',
        path: ['b'],
        message: 'Pick two different things to compare',
      });
    }
    if (q.mode === 'week') {
      if (q.timing === -1) {
        ctx.addIssue({
          code: 'custom',
          path: ['timing'],
          message: 'Week mode supports timing 0 or 1 only',
        });
      }
      for (const key of ['a', 'b'] as const) {
        if (!offeredInMode(q[key], 'week')) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${q[key]} has no weekly form; use day mode`,
          });
        }
      }
    }
    if (!isDayString(q.start) || !isDayString(q.end)) return;
    if (q.start > q.end) {
      ctx.addIssue({
        code: 'custom',
        path: ['start'],
        message: 'start must not be after end',
      });
      return;
    }
    // Span counts both ends: start === end is 1 day.
    const span = daysBetween(q.start, q.end) + 1;
    const limit = MAX_CUSTOM_DAYS[q.mode];
    if (span > limit) {
      ctx.addIssue({
        code: 'custom',
        path: ['end'],
        message: `The range can be at most ${limit} days in ${q.mode} mode`,
      });
    }
  });
export type CompareQuery = z.infer<typeof compareQuerySchema>;

export const compareResultSchema = z.object({
  status: z.enum(['ok', 'not_enough']),
  n: z.number(),
  needed: z.number(),
  reason: z.enum(['tooFew', 'noVariation', 'fewYes', 'fewNo']).optional(),
  method: z.enum(['pearson', 'spearman', 'difference']).optional(),
  nEff: z.number().optional(),
  r: z.number().optional(),
  p: z.number().optional(),
  low: z.number().optional(),
  high: z.number().optional(),
  linked: z.boolean().optional(),
  strength: z.enum(['weak', 'moderate', 'strong']).optional(),
  sign: z.enum(['positive', 'negative']).optional(),
  binary: z
    .object({
      yesKey: metricKey,
      yesMean: z.number(),
      noMean: z.number(),
      yesCount: z.number(),
      noCount: z.number(),
      diff: z.number(),
    })
    .optional(),
  checks: z.object({
    ownNormal: z.literal(true),
    direction: z
      .enum(['firstComesFirst', 'strongerOtherWay', 'cantTell'])
      .optional()
      .describe(
        "Timing 0: 'firstComesFirst' = A leads B by a day; 'strongerOtherWay' = B leads A by a day. Timing 1 or −1: 'firstComesFirst' = the thing on the earlier day leads (A for 1, B for −1); 'strongerOtherWay' = the link is stronger the other way round. 'cantTell': neither order stands out."
      ),
    weekend: z.enum(['holds', 'mayBeWeekends']).optional(),
  }),
});

const dayValues = z.record(z.string(), z.number());
const metricSeries = z.object({ key: metricKey, values: dayValues });

export const compareResponseSchema = z.object({
  a: metricSeries,
  b: metricSeries,
  deviations: z
    .object({ a: dayValues, b: dayValues })
    .describe(
      "Each side's values as the analysis paired them: deviations from its own normal. In day mode a yes/no side's values are its raw 0/1 flags, not deviations."
    ),
  through: dayString.describe(
    "Last day included; today — or the current week — is left out until it's over"
  ),
  result: compareResultSchema,
});
export type CompareResponse = z.infer<typeof compareResponseSchema>;

export const compareSinceQuerySchema = z
  .object({
    a: metricKey.describe('The habit'),
    b: metricKey.describe('The outcome'),
    mode: z.literal('since'),
    habitStart: dayString
      .optional()
      .describe(
        'The day the habit started; when omitted the server suggests one'
      ),
    line: z.coerce
      .number()
      .finite()
      .optional()
      .describe("A line in the outcome's own scale; defaults to a natural one"),
  })
  .superRefine((q, ctx) => {
    if (q.a === q.b) {
      ctx.addIssue({
        code: 'custom',
        path: ['b'],
        message: 'Pick two different things to compare',
      });
    }
    for (const key of ['a', 'b'] as const) {
      if (!offeredInMode(q[key], 'since')) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${q[key]} is not offered in since mode; it drifts too slowly to tell a change from its own wandering`,
        });
      }
    }
  });
export type CompareSinceQuery = z.infer<typeof compareSinceQuerySchema>;

const compareSinceStretchSchema = z
  .object({
    from: dayString,
    to: dayString,
    days: z.number(),
    valueDays: z.number(),
    mean: z.number().optional(),
    p10: z.number().optional(),
    p90: z.number().optional(),
    shareAtOrAbove: z.number().optional(),
  })
  .describe(
    'A stretch of days. With days 0 the stretch is empty and from may be later than to.'
  );

export const compareSinceResultSchema = z.object({
  status: z.enum(['ok', 'not_enough']),
  reason: z.enum(['fewBefore', 'fewSince', 'noStart']).optional(),
  start: dayString.nullable(),
  suggestedStart: dayString.nullable(),
  before: compareSinceStretchSchema.optional(),
  since: compareSinceStretchSchema.optional(),
  line: z.number(),
  diff: z.number().optional(),
  low: z.number().optional(),
  high: z.number().optional(),
  p: z.number().optional(),
  changed: z.boolean().optional(),
  regularity: z.object({ weeksKept: z.number(), weeks: z.number() }).optional(),
  alreadyChanging: z.boolean().optional(),
});

export const compareSinceResponseSchema = z.object({
  mode: z.literal('since'),
  habit: metricSeries,
  outcome: metricSeries.describe(
    'Raw daily values over the before and since stretches'
  ),
  result: compareSinceResultSchema,
});
export type CompareSinceResponse = z.infer<typeof compareSinceResponseSchema>;
