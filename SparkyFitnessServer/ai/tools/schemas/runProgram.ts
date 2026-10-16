import { z } from 'zod';
import {
  MAX_ADJUST_WORKOUTS,
  MAX_EASE_PERCENT,
  MAX_PUSH_PERCENT,
} from '@workspace/shared';

export const RUN_PROGRAM_ACTIONS = [
  'get_run_program',
  'start_run_program',
  'set_run_program_enabled',
  'repeat_run_program_week',
  'move_run_program',
  'adjust_run_program_running',
  'set_run_program_schedule',
] as const;

const confirmedSchema = z
  .boolean()
  .optional()
  .describe(
    'Must be true to apply a change. If omitted or false, the tool says what it would do and changes nothing: ask the user first.'
  );

const WEEKDAYS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

// A weekday as 0 (Sunday) to 6, or its English name or abbreviation.
const weekdaySchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const key = value.trim().toLowerCase();
    if (key in WEEKDAYS) return WEEKDAYS[key];
    if (/^\d$/.test(key)) return Number(key);
  }
  return value;
}, z.number().int().min(0).max(6));

const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date as YYYY-MM-DD.');

export const manageRunProgramSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('get_run_program') }).strict(),
  z
    .object({
      action: z.literal('start_run_program'),
      program_id: z
        .string()
        .min(1)
        .max(50)
        .optional()
        .describe(
          'walkFit, walk10k, returnToRunning, gentle5k, beginner5k, fiveToTenK, faster5k, beginner10k, faster10k, tenKToHalf, halfMarathon, fasterHalf, beginnerMarathon, marathon or advancedMarathon; the half marathon and beginner marathon plans also come as tenKToHalf4, halfMarathon4, fasterHalf4 and beginnerMarathon4 with four runs a week. Default beginner5k.'
        ),
      confirmed: confirmedSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('set_run_program_enabled'),
      enabled: z.boolean(),
      confirmed: confirmedSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('repeat_run_program_week'),
      week: z.coerce.number().int().min(1).max(52),
      confirmed: confirmedSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('move_run_program'),
      week: z.coerce.number().int().min(1).max(52),
      run: z.coerce.number().int().min(1).max(7).optional(),
      confirmed: confirmedSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('adjust_run_program_running'),
      percent: z.coerce
        .number()
        .min(-MAX_EASE_PERCENT)
        .max(MAX_PUSH_PERCENT)
        .describe(
          `Change in running time, ${-MAX_EASE_PERCENT} (much easier) to +${MAX_PUSH_PERCENT} (a little harder). Never more than +${MAX_PUSH_PERCENT}.`
        ),
      count: z.coerce
        .number()
        .int()
        .min(1)
        .max(MAX_ADJUST_WORKOUTS)
        .optional()
        .describe('How many upcoming workouts to change. Default 1.'),
      confirmed: confirmedSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('set_run_program_schedule'),
      run_days: z
        .array(weekdaySchema)
        .max(7)
        .optional()
        .describe(
          'The weekdays the workouts show in the Diary: 0 (Sunday) to 6, or names like "mon". An empty list means every day.'
        ),
      start_date: daySchema
        .nullable()
        .optional()
        .describe(
          'The first day a workout shows, YYYY-MM-DD. null starts from today.'
        ),
      end_date: daySchema
        .nullable()
        .optional()
        .describe(
          'A goal day such as a race, YYYY-MM-DD. Nothing is scheduled after it. null removes it.'
        ),
      confirmed: confirmedSchema,
    })
    .strict()
    .refine(
      (value) =>
        value.run_days !== undefined ||
        value.start_date !== undefined ||
        value.end_date !== undefined,
      { message: 'Give run_days, start_date or end_date.' }
    ),
]);

export type ManageRunProgramInput = z.infer<typeof manageRunProgramSchema>;

// Flat published schema (all fields optional) — real validation is the strict
// union above inside the handler.
export const manageRunProgramInput = z.object({
  action: z.enum(RUN_PROGRAM_ACTIONS).optional(),
  program_id: z.string().max(50).optional(),
  enabled: z.boolean().optional(),
  week: z.union([z.string(), z.number()]).optional(),
  run: z.union([z.string(), z.number()]).optional(),
  percent: z.union([z.string(), z.number()]).optional(),
  count: z.union([z.string(), z.number()]).optional(),
  run_days: z.array(z.union([z.string(), z.number()])).optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  confirmed: z.boolean().optional(),
});
