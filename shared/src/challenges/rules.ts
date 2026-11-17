import { z } from 'zod';
import { ACTIVITY_SPORTS } from '../utils/activitySport.ts';

/**
 * Challenge rules: every number a host can change, in one versioned object.
 * The server stores it as `challenges.rules` JSONB and checks it with
 * `challengeRulesSchema`; web and mobile read the same object to explain how
 * points work. A new field is added with a default, so stored rules of the
 * same version keep parsing; a breaking change bumps `version` and adds an
 * upgrade step to `parseChallengeRules`.
 */
export const CHALLENGE_RULES_VERSION = 1;

/** What a challenge counts. Each metric is a daily value the scorer works out. */
export const CHALLENGE_METRICS = [
  'points',
  'steps',
  'active_minutes',
  'hr_zone_minutes',
  'distance',
  'workout_days',
  'active_calories',
  'elevation',
] as const;
export type ChallengeMetric = (typeof CHALLENGE_METRICS)[number];

/**
 * How a period is won.
 * - leaderboard: the highest total wins.
 * - race: the first to reach `target` wins; later finishers rank by finish day.
 * - hit_goal: everyone who reaches `target` (per day, or over the period) wins.
 * - group_goal: everyone adds to one total; the group wins at `target`.
 */
export const CHALLENGE_FORMATS = [
  'leaderboard',
  'race',
  'hit_goal',
  'group_goal',
] as const;
export type ChallengeFormat = (typeof CHALLENGE_FORMATS)[number];

/** How long one scored period lasts. `challenge` is one period from start to end. */
export const CHALLENGE_PERIODS = ['day', 'week', 'month', 'challenge'] as const;
export type ChallengePeriod = (typeof CHALLENGE_PERIODS)[number];

/** Manual (hand-logged) workouts: count them, count them up to a cap, or ignore them. */
export const CHALLENGE_MANUAL_ENTRY_MODES = ['count', 'cap', 'ignore'] as const;
export type ChallengeManualEntryMode =
  (typeof CHALLENGE_MANUAL_ENTRY_MODES)[number];

/** PR kinds the points builder can pay a bonus for. */
export const CHALLENGE_PR_TYPES = ['lift', 'distance', 'pace'] as const;
export type ChallengePrType = (typeof CHALLENGE_PR_TYPES)[number];

/** A member's own weekly goal, used by the self-adjusting goal bonus. */
export const CHALLENGE_GOAL_TYPES = [
  'lose_weight',
  'build_muscle',
  'endurance',
  'stay_active',
] as const;
export type ChallengeGoalType = (typeof CHALLENGE_GOAL_TYPES)[number];
export const DEFAULT_CHALLENGE_GOAL_TYPE: ChallengeGoalType = 'stay_active';

/** ISO weekday numbers: 1 = Monday ... 7 = Sunday. */
const isoWeekdaySchema = z.number().int().min(1).max(7);
const rateSchema = z.number().min(0).max(100);
const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const challengeMinuteTiersSchema = z.object({
  /** A day's first `full` minutes count in full... */
  full: z.number().int().min(0).max(1440).default(60),
  /** ...the next `half` minutes at `halfRate`, the rest not at all. */
  half: z.number().int().min(0).max(1440).default(30),
  halfRate: z.number().min(0).max(1).default(0.5),
});

export const challengePointsRulesSchema = z.object({
  /** Points per minute in heart-rate zones 1 to 5 (the member's own zones). */
  zoneRates: z
    .tuple([rateSchema, rateSchema, rateSchema, rateSchema, rateSchema])
    .default([1, 1, 2, 2, 2]),
  /** Points per minute below zone 1, when only an average heart rate is known. */
  belowZoneRate: rateSchema.default(0.5),
  /** Points per minute for a workout with no heart rate at all. */
  noHrRate: rateSchema.default(0.75),
  /** Lifting earns at least this a minute (rest between sets pulls heart rate down); null turns it off. */
  strengthFloor: rateSchema.nullable().default(1.5),
  /** Daily minute tiers; null counts every minute in full. */
  minuteTiers: challengeMinuteTiersSchema
    .nullable()
    .default({ full: 60, half: 30, halfRate: 0.5 }),
  steps: z
    .object({
      stepsPerPoint: z.number().int().min(1).max(100000).default(1000),
      dailyCap: z.number().min(0).max(10000).default(10),
    })
    .nullable()
    .default({ stepsPerPoint: 1000, dailyCap: 10 }),
  pr: z
    .object({
      bonus: z.number().min(0).max(1000).default(15),
      dailyMax: z.number().int().min(0).max(20).default(2),
      types: z
        .array(z.enum(CHALLENGE_PR_TYPES))
        .min(1)
        .max(CHALLENGE_PR_TYPES.length)
        .default(['lift', 'distance', 'pace']),
      lookbackDays: z.number().int().min(7).max(365).default(90),
      /** A PR needs at least this many earlier tries of the same thing. */
      minEarlier: z.number().int().min(0).max(20).default(2),
      /** Pace PRs only for efforts of at least this many metres. */
      minPaceMeters: z.number().min(0).max(100000).default(1600),
    })
    .nullable()
    .default({
      bonus: 15,
      dailyMax: 2,
      types: ['lift', 'distance', 'pace'],
      lookbackDays: 90,
      minEarlier: 2,
      minPaceMeters: 1600,
    }),
  streak: z
    .object({
      fromDay: z.number().int().min(1).max(365).default(3),
      bonus: z.number().min(0).max(1000).default(5),
    })
    .nullable()
    .default({ fromDay: 3, bonus: 5 }),
  beatAverage: z
    .object({
      bonus: z.number().min(0).max(1000).default(10),
      lookbackDays: z.number().int().min(7).max(90).default(28),
      minActiveDays: z.number().int().min(0).max(90).default(7),
    })
    .nullable()
    .default({ bonus: 10, lookbackDays: 28, minActiveDays: 7 }),
  goal: z
    .object({
      /** The most a fully met weekly goal is worth; partial progress pays pro rata. */
      maxBonus: z.number().min(0).max(10000).default(50),
      /** Target = own average of the last `lookbackWeeks` weeks x (1 + stretchPct / 100). */
      stretchPct: z.number().min(0).max(100).default(5),
      lookbackWeeks: z.number().int().min(1).max(12).default(4),
    })
    .nullable()
    .default({ maxBonus: 50, stretchPct: 5, lookbackWeeks: 4 }),
});
export type ChallengePointsRules = z.infer<typeof challengePointsRulesSchema>;

export const challengeActivityRulesSchema = z.object({
  /** Only these sports count; null counts every sport. */
  includeSports: z
    .array(z.enum(ACTIVITY_SPORTS))
    .min(1)
    .max(ACTIVITY_SPORTS.length)
    .nullable()
    .default(null),
  excludeSports: z
    .array(z.enum(ACTIVITY_SPORTS))
    .max(ACTIVITY_SPORTS.length)
    .default([]),
  /** Workouts shorter than this do not count. */
  minMinutes: z.number().min(0).max(600).default(0),
  manualEntries: z.enum(CHALLENGE_MANUAL_ENTRY_MODES).default('count'),
  /** With `manualEntries: 'cap'`, at most this many manual minutes a day count. */
  manualMinutesCap: z.number().min(0).max(1440).default(60),
  /** One workout synced from two sources counts once. */
  mergeDuplicates: z.boolean().default(true),
});
export type ChallengeActivityRules = z.infer<
  typeof challengeActivityRulesSchema
>;

export const challengeRulesSchema = z
  .object({
    version: z.literal(CHALLENGE_RULES_VERSION),
    metric: z.enum(CHALLENGE_METRICS),
    format: z.enum(CHALLENGE_FORMATS).default('leaderboard'),
    /** Race, hit-the-goal and group-goal target, in the metric's unit (metres for distance). */
    target: z.number().positive().max(1e9).nullable().default(null),
    /** For hit_goal: the target applies to each day, or to the period total. */
    targetPer: z.enum(['day', 'period']).default('period'),
    period: z.enum(CHALLENGE_PERIODS).default('week'),
    /** Which weekdays count (ISO, 1 = Monday). */
    days: z
      .array(isoWeekdaySchema)
      .min(1)
      .max(7)
      .default([1, 2, 3, 4, 5, 6, 7]),
    /** Only workouts starting inside this window count; null for all day. */
    timeWindow: z
      .object({ start: timeOfDaySchema, end: timeOfDaySchema })
      .nullable()
      .default(null),
    /** Only the best N days of each Monday-to-Sunday week count; null counts every day. */
    bestDaysPerWeek: z.number().int().min(1).max(7).nullable().default(null),
    /** Most a single day can add, in the metric's unit; null for no cap. */
    dailyCap: z.number().positive().max(1e9).nullable().default(null),
    /** Distance metric: which sports' distance counts (null = any with a distance). */
    activities: challengeActivityRulesSchema.default({
      includeSports: null,
      excludeSports: [],
      minMinutes: 0,
      manualEntries: 'count',
      manualMinutesCap: 60,
      mergeDuplicates: true,
    }),
    /** Heart-rate zone minutes count from this zone up. */
    zoneMinutesFromZone: z.number().int().min(1).max(5).default(2),
    /** The points builder; required when metric is points, ignored otherwise. */
    points: challengePointsRulesSchema.nullable().default(null),
  })
  .superRefine((rules, ctx) => {
    if (rules.metric === 'points' && rules.points === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['points'],
        message: 'points rules are required for the points metric', // i18n-ignore
      });
    }
    if (rules.format !== 'leaderboard' && rules.target === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['target'],
        message: 'target is required for this format', // i18n-ignore
      });
    }
    // The goal bonus is weekly: a daily period would pay it only on the days
    // it lands on, which skews the day's winner.
    if (
      rules.metric === 'points' &&
      rules.period === 'day' &&
      rules.points?.goal
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['points', 'goal'],
        message: 'the weekly goal needs a period of a week or longer', // i18n-ignore
      });
    }
    if (rules.timeWindow && rules.timeWindow.start === rules.timeWindow.end) {
      ctx.addIssue({
        code: 'custom',
        path: ['timeWindow'],
        message: 'timeWindow must not be empty', // i18n-ignore
      });
    }
    if (new Set(rules.days).size !== rules.days.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['days'],
        message: 'days must not repeat', // i18n-ignore
      });
    }
  });

export type ChallengeRules = z.infer<typeof challengeRulesSchema>;
/** Rules as a client may send them: defaults may be left out. */
export type ChallengeRulesInput = z.input<typeof challengeRulesSchema>;

/**
 * Parses stored rules. Only version 1 exists; an older version would be
 * upgraded here before parsing, so stored rules never stop loading. Rules
 * saved before a daily period refused the weekly goal have it turned off
 * here (a request with both is still refused by challengeRulesSchema).
 */
export function parseChallengeRules(value: unknown) {
  return challengeRulesSchema.safeParse(withoutDailyGoal(value));
}

function withoutDailyGoal(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const rules = value as {
    period?: unknown;
    points?: { goal?: unknown } | null;
  };
  if (
    rules.period !== 'day' ||
    typeof rules.points !== 'object' ||
    rules.points === null ||
    rules.points.goal === null
  )
    return value;
  return { ...rules, points: { ...rules.points, goal: null } };
}

/** The default points builder (the All-Rounder preset). */
export function defaultPointsRules(): ChallengePointsRules {
  return challengePointsRulesSchema.parse({});
}
