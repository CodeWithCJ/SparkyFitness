import { z } from 'zod';
import {
  formStatusSchema,
  fitnessFatiguePointSchema,
} from './FitnessFatigue.api.zod.ts';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * The sport groups training load is split by. `cardio` is the rest of the
 * endurance work: gym cardio machines such as a stair climber or elliptical,
 * swimming and rowing.
 */
export const LOAD_SPORT_GROUPS = [
  'running',
  'cycling',
  'walking',
  'cardio',
  'strength',
  'other',
] as const;
export const loadSportGroupSchema = z.enum(LOAD_SPORT_GROUPS);
export type LoadSportGroup = z.infer<typeof loadSportGroupSchema>;

/** Longest range one request may cover. */
export const MAX_TRAINING_CALENDAR_DAYS = 120;

/** Query of GET /api/reports/training-calendar. */
export const trainingCalendarQuerySchema = z
  .object({
    start: day,
    end: day,
    userId: z.string().optional(),
  })
  .refine((q) => q.start <= q.end, {
    message: 'start must not be after end',
    path: ['end'],
  });
export type TrainingCalendarQuery = z.infer<typeof trainingCalendarQuerySchema>;

export const plannedStatusSchema = z.enum([
  'done',
  'partial',
  'missed',
  'upcoming',
]);
export type PlannedStatus = z.infer<typeof plannedStatusSchema>;

export const plannedSourceSchema = z.enum(['runProgram', 'workoutPlan']);

export const plannedItemSchema = z.object({
  id: z.string(),
  /** The day the item is planned for (the person's local day). */
  day,
  source: plannedSourceSchema,
  sport: loadSportGroupSchema,
  /**
   * What the item is called: the plan's session, preset or exercise name. Null
   * for a run program workout, which the client names from `programId`.
   */
  label: z.string().nullable(),
  programId: z.string().nullable(),
  /** 1-based workout number within the program. */
  workoutNumber: z.number().int().min(1).nullable(),
  plannedMinutes: z.number().nullable(),
  /** Estimated load of the plan (no heart rate, so the moderate weight). */
  plannedLoad: z.number().nullable(),
  status: plannedStatusSchema,
  /** Minutes and load of the diary entries matched to it. */
  completedMinutes: z.number(),
  completedLoad: z.number(),
  entryIds: z.array(z.string()),
});
export type PlannedItem = z.infer<typeof plannedItemSchema>;

export const completedItemSchema = z.object({
  /** The diary exercise entry id. */
  id: z.string(),
  day,
  name: z.string().nullable(),
  sport: loadSportGroupSchema,
  minutes: z.number(),
  distanceKm: z.number().nullable(),
  avgHeartRate: z.number().nullable(),
  load: z.number(),
  /** "heartRate": weighted by average heart rate; "estimated": no heart rate, moderate weight. */
  loadBasis: z.enum(['heartRate', 'estimated']),
  /** The planned item it was matched to; null for extra, unplanned work. */
  plannedItemId: z.string().nullable(),
});
export type CompletedItem = z.infer<typeof completedItemSchema>;

export const calendarWeekTotalsSchema = z.object({
  /** First day of the week, per the person's first day of the week. */
  start: day,
  plannedSessions: z.number().int(),
  doneSessions: z.number().int(),
  partialSessions: z.number().int(),
  missedSessions: z.number().int(),
  /** Completed entries that matched no plan. */
  extraSessions: z.number().int(),
  /** Every completed entry, planned or not. */
  completedSessions: z.number().int(),
  plannedMinutes: z.number(),
  completedMinutes: z.number(),
  /**
   * Minutes and load of the completed work that counted for a planned item
   * with a planned length, so they compare with `plannedMinutes` and
   * `plannedLoad`; the rest of `completedMinutes` and `completedLoad` is
   * extra or unmeasured work.
   */
  matchedMinutes: z.number(),
  plannedLoad: z.number(),
  completedLoad: z.number(),
  matchedLoad: z.number(),
  completedDistanceKm: z.number(),
});
export type CalendarWeekTotals = z.infer<typeof calendarWeekTotalsSchema>;

const loadBySportSchema = z.record(loadSportGroupSchema, z.number());
export type LoadBySport = z.infer<typeof loadBySportSchema>;

export const sportLoadSchema = z.object({
  /** Load per sport for each week in the range, oldest first. */
  weeks: z.array(z.object({ start: day, bySport: loadBySportSchema })),
  /** Load per sport for each calendar month the range touches (YYYY-MM). */
  months: z.array(
    z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/),
      bySport: loadBySportSchema,
    })
  ),
  /** Load per sport over the whole range. */
  total: loadBySportSchema,
});
export type SportLoad = z.infer<typeof sportLoadSchema>;

/** Response of GET /api/reports/training-calendar. */
export const trainingCalendarResponseSchema = z.object({
  start: day,
  end: day,
  /** The person's local today. */
  today: day,
  planned: z.array(plannedItemSchema),
  completed: z.array(completedItemSchema),
  weeks: z.array(calendarWeekTotalsSchema),
  sportLoad: sportLoadSchema,
  /** The existing fitness / fatigue / form figure for today, for context. */
  fitnessFatigue: z.object({
    today: fitnessFatiguePointSchema.nullable(),
    status: formStatusSchema,
  }),
});
export type TrainingCalendarResponse = z.infer<
  typeof trainingCalendarResponseSchema
>;
