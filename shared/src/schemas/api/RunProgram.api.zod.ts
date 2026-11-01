import { z } from 'zod';

/** Seconds per kilometre; `min` is the fastest pace allowed. */
export const runProgramPaceSchema = z
  .object({
    minSecondsPerKm: z.number().int().min(120).max(1200),
    maxSecondsPerKm: z.number().int().min(120).max(1200),
  })
  .refine((band) => band.maxSecondsPerKm - band.minSecondsPerKm >= 10);

export const runProgramHeartRateSchema = z
  .object({
    minBpm: z.number().int().min(40).max(220),
    maxBpm: z.number().int().min(40).max(220),
  })
  .refine((band) => band.maxBpm - band.minBpm >= 10);

export const runProgramStepSchema = z.object({
  kind: z.enum(['warmup', 'work', 'recovery', 'cooldown']),
  seconds: z.number().int().min(1).max(14400),
  meters: z.number().int().min(50).max(50000).optional(),
  unit: z.enum(['m', 'mi']).optional(),
  /** A pace to hold in this step; only the person's own programs set one. */
  pace: runProgramPaceSchema.optional(),
  /** A heart-rate range to hold in this step; only the person's own programs set one. */
  heartRate: runProgramHeartRateSchema.optional(),
  /** What the stretch is for (an easy run, a stride, a tempo or marathon-pace effort, a hill repeat, a steady Zone 2 run); picks its pace range. */
  effort: z
    .enum(['easy', 'stride', 'tempo', 'marathon', 'hill', 'zone2'])
    .optional(),
});

export const runProgramPlanSchema = z.object({
  style: z.enum(['runWalk', 'fastEasy', 'briskWalk']),
  steps: z.array(runProgramStepSchema).min(1).max(200),
});

export const runProgramWorkoutSchema = z.object({
  week: z.number().int().min(0).max(51),
  day: z.number().int().min(0).max(6),
  plan: runProgramPlanSchema,
  /** A name for the workout; only the person's own programs set one. */
  title: z.string().trim().min(1).max(40).optional(),
});

export const runProgramAdjustmentSchema = z.object({
  /** ISO timestamp. */
  at: z.string(),
  summary: z.string().max(500),
  source: z.enum(['user', 'assistant']),
});
export type RunProgramAdjustment = z.infer<typeof runProgramAdjustmentSchema>;

export const runProgramEffortSchema = z.object({
  /** Index of the workout in `workouts`. */
  index: z.number().int().min(0).max(1000),
  /** How hard it felt, 1 (very easy) to 10 (all out). */
  rating: z.number().int().min(1).max(10),
  /** ISO timestamp. */
  at: z.string(),
});
export type RunProgramEffort = z.infer<typeof runProgramEffortSchema>;

export const runProgramCompletionSchema = z.object({
  /** Index of the workout in `workouts`. */
  index: z.number().int().min(0).max(1000),
  /** The diary exercise entry the workout was done as. */
  entry_id: z.string().min(1).max(64),
  /** ISO timestamp. */
  at: z.string(),
});
export type RunProgramCompletion = z.infer<typeof runProgramCompletionSchema>;

/** A real calendar day: 2026-02-31 matches the shape but is not a date. */
const isRealDay = (value: string): boolean => {
  const [y, m, d] = value.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
};
export const runDayStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isRealDay, { message: 'Not a real calendar day.' });
const weekday = z.number().int().min(0).max(6);

/** What a program's workouts are recorded as. */
export const runProgramActivitySchema = z.enum(['run', 'walk']);

export const runProgramResponseSchema = z.object({
  id: z.string(),
  program_id: z.string(),
  /** The person's own program's name; null for a built-in one. */
  name: z.string().nullable(),
  /** The person's own program's activity; null for a built-in one. */
  activity: runProgramActivitySchema.nullable(),
  enabled: z.boolean(),
  /** Index into `workouts` of the next workout; the length when finished. */
  next_index: z.number().int().min(0),
  workouts: z.array(runProgramWorkoutSchema),
  /** Most recent last, capped by the server. */
  adjustment_log: z.array(runProgramAdjustmentSchema),
  /** How hard finished workouts felt, most recent last, capped by the server. */
  effort_log: z.array(runProgramEffortSchema),
  /** Which diary entry each workout was done as, most recent last, capped by the server. */
  completion_log: z.array(runProgramCompletionSchema),
  /** Weekdays (0 = Sunday) the person plans to run; empty means every day. */
  run_days: z.array(weekday).max(7),
  /** First day (YYYY-MM-DD) the Diary offers the workout, or null for any. */
  start_date: runDayStringSchema.nullable(),
  /** The person's goal day (e.g. race day), or null. Nothing is scheduled after it. */
  end_date: runDayStringSchema.nullable(),
  /** The last day a program workout was completed (the person's local day). */
  last_done_date: runDayStringSchema.nullable(),
  updated_at: z.string(),
});
export type RunProgramResponse = z.infer<typeof runProgramResponseSchema>;

/** The prefix of a person's own program in `program_id`: `custom:<id>`. */
export const CUSTOM_PROGRAM_PREFIX = 'custom:';

/** Most workouts in a person's own program: every one needs a week (0 to 51) and day (0 to 6). */
export const MAX_CUSTOM_PROGRAM_WORKOUTS = 52 * 7;

export const isCustomProgramId = (programId: string): boolean =>
  programId.startsWith(CUSTOM_PROGRAM_PREFIX);

export const customProgramId = (id: string): string =>
  `${CUSTOM_PROGRAM_PREFIX}${id}`;

/**
 * The fields of a person's own program. Workouts are a free list, in the order
 * they are done; each is a plan of timed steps. The server numbers them into
 * `week` and `day` (seven to a "week") so they fit the stored shape.
 */
export const customRunProgramInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  activity: runProgramActivitySchema,
  workouts: z
    .array(
      z.object({
        plan: runProgramPlanSchema,
        title: z.string().trim().min(1).max(40).optional(),
      })
    )
    .min(1)
    .max(MAX_CUSTOM_PROGRAM_WORKOUTS),
});
export type CustomRunProgramInput = z.infer<typeof customRunProgramInputSchema>;

export const customRunProgramResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  activity: runProgramActivitySchema,
  workouts: z.array(runProgramWorkoutSchema),
  created_at: z.string(),
  updated_at: z.string(),
});
export type CustomRunProgramResponse = z.infer<
  typeof customRunProgramResponseSchema
>;

export const listCustomRunProgramsResponseSchema = z.object({
  programs: z.array(customRunProgramResponseSchema),
});
export type ListCustomRunProgramsResponse = z.infer<
  typeof listCustomRunProgramsResponseSchema
>;

/** `program` is null until the person has chosen one. */
export const getRunProgramResponseSchema = z.object({
  program: runProgramResponseSchema.nullable(),
});
export type GetRunProgramResponse = z.infer<typeof getRunProgramResponseSchema>;

/**
 * Creates the person's program (seeded from the built-in one) or changes its
 * switch and place. Only fields present are changed.
 */
export const upsertRunProgramBodySchema = z
  .object({
    /** A built-in program's id, or `custom:<id>` for one of the person's own. */
    program_id: z.string().min(1).max(50),
    enabled: z.boolean().optional(),
    next_index: z.number().int().min(0).max(1000).optional(),
    run_days: z.array(weekday).max(7).optional(),
    /** null clears it; absent leaves it as it is. */
    start_date: runDayStringSchema.nullable().optional(),
    end_date: runDayStringSchema.nullable().optional(),
  })
  .refine(
    (body) =>
      !body.start_date || !body.end_date || body.end_date >= body.start_date,
    {
      message: 'The goal day cannot be before the first day.',
      path: ['end_date'],
    }
  );
export type UpsertRunProgramBody = z.infer<typeof upsertRunProgramBodySchema>;

/** Marks workout `index` done, if it is the one due. */
export const completeRunProgramWorkoutBodySchema = z.object({
  index: z.number().int().min(0).max(1000),
  /** The program the workout belonged to; ignored if the person has switched since. */
  program_id: z.string().min(1).max(40).optional(),
  /** The person's local day, recorded as the last day a workout was done. */
  day: runDayStringSchema.optional(),
  /** The diary exercise entry the workout was done as, so it can be shown as part of the program. */
  entry_id: z.string().min(1).max(64).optional(),
});
export type CompleteRunProgramWorkoutBody = z.infer<
  typeof completeRunProgramWorkoutBodySchema
>;

/** Records how hard finished workout `index` felt. */
export const rateRunProgramWorkoutBodySchema = z.object({
  index: z.number().int().min(0).max(1000),
  rating: z.number().int().min(1).max(10),
  /** The program the workout belonged to; ignored if the person has switched since. */
  program_id: z.string().min(1).max(40).optional(),
});
export type RateRunProgramWorkoutBody = z.infer<
  typeof rateRunProgramWorkoutBodySchema
>;

/** Makes the running in the next few workouts shorter (negative) or a little longer. */
export const adjustRunProgramBodySchema = z.object({
  percent: z
    .number()
    .int()
    .min(-30)
    .max(10)
    .refine((value) => value !== 0, { message: 'Give a non-zero percent.' }),
  count: z.number().int().min(1).max(9),
});
export type AdjustRunProgramBody = z.infer<typeof adjustRunProgramBodySchema>;

/** Race distances a realignment can name; the same ids the race plan builder uses. */
export const realignDistanceSchema = z.enum(['5k', '10k', 'half', 'marathon']);

/** What realigning did to one workout of the plan as it stood before. */
export const runProgramRealignChangeSchema = z.object({
  kind: z.enum(['dropped', 'merged', 'repeated', 'added']),
  /** Why: a repeat of a workout in the same week, a lighter week folded into its neighbour, or time to spare. */
  reason: z.enum(['repeat', 'lighter', 'shortest', 'extraTime']),
  /** 1-based week and run of the workout it concerns, as numbered before. */
  week: z.number().int().min(1).max(60),
  run: z.number().int().min(1).max(60),
  /** Whole minutes the workout takes. */
  minutes: z.number().int().min(0).max(1000),
  /** The workout's own name, for plans that have one. */
  title: z.string().max(40).optional(),
});
export type RunProgramRealignChange = z.infer<
  typeof runProgramRealignChangeSchema
>;

/** What a realignment would do, without the workouts themselves. */
export const runProgramRealignPreviewSchema = z.object({
  /** Changes with the plan it was worked out against; send it back to confirm the same preview. */
  token: z.string().max(100),
  /** Workout days left from today to the goal day. */
  slots: z.number().int().min(0).max(400),
  before: z.object({
    workouts: z.number().int().min(0),
    /** The day the last workout falls on today, goal day ignored. */
    finishDay: runDayStringSchema.nullable(),
  }),
  after: z.object({
    workouts: z.number().int().min(0),
    finishDay: runDayStringSchema.nullable(),
  }),
  changes: z.array(runProgramRealignChangeSchema).max(100),
  dropped: z.number().int().min(0),
  merged: z.number().int().min(0),
  repeated: z.number().int().min(0),
  added: z.number().int().min(0),
  /** Workout days left empty because the stretch is capped. */
  spare: z.number().int().min(0),
  /** The taper and final workouts that were kept as they are. */
  keptTail: z.number().int().min(0),
  /** The return-to-running ease applied on top, if the person has been away. */
  eased: z
    .object({
      daysAway: z.number().int().min(0),
      percent: z.number().int().min(-30).max(10),
      count: z.number().int().min(1).max(9),
    })
    .nullable(),
  summary: z.string().max(500),
});
export type RunProgramRealignPreview = z.infer<
  typeof runProgramRealignPreviewSchema
>;

export const runProgramRealignOptionSchema = z.enum([
  'later',
  'lower',
  'continue',
]);
export type RunProgramRealignOption = z.infer<
  typeof runProgramRealignOptionSchema
>;

export const runProgramRealignResultSchema = z.discriminatedUnion('state', [
  /** No goal day, no workout days, nothing left, or nothing to realign against. */
  z.object({
    state: z.literal('unavailable'),
    reason: z.enum(['noGoalDay', 'noRunDays', 'finished']),
  }),
  z.object({ state: z.literal('fits') }),
  z.object({
    state: z.literal('plan'),
    preview: runProgramRealignPreviewSchema,
  }),
  /** The goal day is not realistic for the distance; the person chooses what to do. */
  z.object({
    state: z.literal('unrealistic'),
    reasons: z
      .array(
        z.enum([
          'noTimeLeft',
          'taperDoesNotFit',
          'tooMuchToDrop',
          'tooFewWeeks',
        ])
      )
      .min(1),
    slots: z.number().int().min(0).max(400),
    workoutsLeft: z.number().int().min(0),
    weeksLeft: z.number().int().min(0),
    distance: realignDistanceSchema.nullable(),
    /** The day the whole remaining plan would end on if the goal moved. */
    laterDay: runDayStringSchema.nullable(),
    /** The next shorter race, if there is one. */
    lowerDistance: realignDistanceSchema.nullable(),
    options: z.array(runProgramRealignOptionSchema),
    /** What "continue anyway" would do: the same realignment without the usual cap. */
    continuePreview: runProgramRealignPreviewSchema.nullable(),
  }),
]);
export type RunProgramRealignResult = z.infer<
  typeof runProgramRealignResultSchema
>;

/**
 * Rebuilds the rest of the plan to finish on the goal day. With `confirmed`
 * false (the default) it only reports what would change; nothing is saved
 * until it is sent again with `confirmed` true.
 */
export const realignRunProgramBodySchema = z.object({
  confirmed: z.boolean().optional(),
  /** Realign even when the usual cap on dropped workouts would be exceeded. */
  force: z.boolean().optional(),
  /** The race distance, when the plan does not make it clear. */
  distance: realignDistanceSchema.optional(),
  /** The person's local day. */
  today: runDayStringSchema.optional(),
  /** The `token` of the preview the person saw; a changed plan is refused. */
  token: z.string().max(100).optional(),
});
export type RealignRunProgramBody = z.infer<typeof realignRunProgramBodySchema>;

export const realignRunProgramResponseSchema = z.object({
  realign: runProgramRealignResultSchema,
  /** True when the plan was changed. */
  applied: z.boolean(),
  /** The program as it now stands, when it was changed. */
  program: runProgramResponseSchema.nullable(),
});
export type RealignRunProgramResponse = z.infer<
  typeof realignRunProgramResponseSchema
>;
