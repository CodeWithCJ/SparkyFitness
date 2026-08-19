import { z } from "zod";
import {
  ACTIVITY_SPORTS,
  PR_SPORT_GROUPS,
  SPORT_CONFIDENCES,
} from "../../utils/activitySport.ts";

/** Canonical sport, named after the ANT+/FIT SDK `sport` enum. */
export const activitySportSchema = z.enum(ACTIVITY_SPORTS);

/** Coarser bucket used to group the Personal Records matrix for display. */
export const prSportGroupSchema = z.enum(PR_SPORT_GROUPS);

/** Whether the sport came from the provider's enum or was inferred from text. */
export const sportConfidenceSchema = z.enum(SPORT_CONFIDENCES);

export const exerciseStatsIntervalSchema = z.enum([
  "day",
  "week",
  "month",
  "year",
  "ytd",
  "lifetime",
  "custom",
]);

export type ExerciseStatsInterval = z.infer<typeof exerciseStatsIntervalSchema>;

/** Query params for GET /api/exercise-stats/summary */
export const exerciseStatsSummaryQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  interval: exerciseStatsIntervalSchema.default("month"),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format must be YYYY-MM-DD")
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format must be YYYY-MM-DD")
    .optional(),
  category: z.string().optional(),
  unitSystem: z.enum(["metric", "imperial"]).default("metric"),
});

export type ExerciseStatsSummaryQuery = z.infer<
  typeof exerciseStatsSummaryQuerySchema
>;

/** Single aggregated interval breakdown point (e.g. 1 week or 1 month bar) */
export const exerciseStatsIntervalPointSchema = z.object({
  label: z.string(), // e.g. "Week 28", "Jul 2026", "2026-07-26"
  startDate: z.string(),
  endDate: z.string(),
  distanceMeters: z.number(),
  distanceFormatted: z.number(), // km or miles according to unit system
  durationMinutes: z.number(),
  caloriesBurned: z.number(),
  workoutCount: z.number(),
  avgHeartRate: z.number().nullable(),
  totalElevationGainMeters: z.number().optional(),
  movingDurationMinutes: z.number().optional(),
  totalLiftedVolumeKg: z.number().optional(),
});

export type ExerciseStatsIntervalPoint = z.infer<
  typeof exerciseStatsIntervalPointSchema
>;

/** Full response schema for GET /api/exercise-stats/summary */
export const exerciseStatsSummaryResponseSchema = z.object({
  interval: exerciseStatsIntervalSchema,
  startDate: z.string(),
  endDate: z.string(),
  unitSystem: z.enum(["metric", "imperial"]),
  totals: z.object({
    totalDistanceMeters: z.number(),
    totalDistanceFormatted: z.number(),
    totalDurationMinutes: z.number(),
    totalCaloriesBurned: z.number(),
    workoutCount: z.number(),
    avgHeartRate: z.number().nullable(),
    totalElevationGainMeters: z.number(),
    totalMovingDurationMinutes: z.number(),
    totalLiftedVolumeKg: z.number(),
    totalReps: z.number(),
  }),
  comparisonWithPreviousPeriod: z.object({
    distanceChangePercent: z.number(),
    durationChangePercent: z.number(),
    caloriesChangePercent: z.number(),
    workoutCountChangePercent: z.number(),
  }),
  intervalsBreakdown: z.array(exerciseStatsIntervalPointSchema),
  heartRateZoneDistribution: z.object({
    zone1RecoverySeconds: z.number(),
    zone2EnduranceSeconds: z.number(),
    zone3AerobicSeconds: z.number(),
    zone4ThresholdSeconds: z.number(),
    zone5AnaerobicSeconds: z.number(),
  }),
});

export type ExerciseStatsSummaryResponse = z.infer<
  typeof exerciseStatsSummaryResponseSchema
>;

/** Request schema for POST /api/exercise-stats/query (Activity Interrogation Engine) */
export const exerciseActivityQueryRequestSchema = z.object({
  userId: z.string().uuid().optional(),
  category: z.string().optional(), // e.g. 'running', 'cycling', 'swimming', 'walking'
  distanceMinMeters: z.number().optional(),
  distanceMaxMeters: z.number().optional(),
  distanceStandard: z
    .enum([
      "1k",
      "1mi",
      "5k",
      "10k",
      "15k",
      "half_marathon",
      "marathon",
      "custom",
    ])
    .optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  searchKeyword: z.string().optional(),
  unitSystem: z.enum(["metric", "imperial"]).optional().default("metric"),
  sortBy: z
    .enum([
      "entry_date",
      "distance",
      "duration_minutes",
      "calories_burned",
      "avg_pace",
      "avg_heart_rate",
    ])
    .default("entry_date"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export type ExerciseActivityQueryRequest = z.infer<
  typeof exerciseActivityQueryRequestSchema
>;

/** Single activity item in query response */
export const exerciseActivityQueryItemSchema = z.object({
  id: z.string(),
  userId: z.string(),
  exerciseName: z.string(),
  category: z.string().nullable(),
  entryDate: z.string(),
  entryTime: z.string().nullable(),
  durationMinutes: z.number(),
  movingDurationMinutes: z.number().nullable(),
  distanceMeters: z.number().nullable(),
  distanceFormatted: z.number().nullable(),
  avgPaceSecondsPerKm: z.number().nullable(),
  formattedPace: z.string().nullable(), // e.g. "5:12 /km" or "8:22 /mi"
  caloriesBurned: z.number(),
  avgHeartRate: z.number().nullable(),
  source: z.string().nullable(),
  notes: z.string().nullable(),
  hasGpsTrack: z.boolean(),
});

export type ExerciseActivityQueryItem = z.infer<
  typeof exerciseActivityQueryItemSchema
>;

export const exerciseActivityQueryResponseSchema = z.object({
  totalCount: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
  items: z.array(exerciseActivityQueryItemSchema),
});

export type ExerciseActivityQueryResponse = z.infer<
  typeof exerciseActivityQueryResponseSchema
>;

/** Card / Record item for Personal Records (PRs) & Best Efforts Matrix */
export const exercisePersonalRecordItemSchema = z.object({
  id: z.string(),
  category: z.string(),
  // Optional because a self-hosted deployment can pair a new frontend image
  // with an older server that predates these fields. Nothing validates this
  // schema at runtime -- it is a type source -- so an older response arrives
  // with them simply missing rather than failing a parse, and the widget's
  // single-section fallback needs the type to admit that. The current server
  // always populates all three.
  /** Canonical sport this record was set in. */
  sport: activitySportSchema.optional(),
  /** Display bucket; records are only ever compared within one group. */
  sportGroup: prSportGroupSchema.optional(),
  sportConfidence: sportConfidenceSchema.optional(),
  distanceStandard: z.enum([
    "1k",
    "1mi",
    "5k",
    "10k",
    "15k",
    "half_marathon",
    "marathon",
    "custom",
  ]),
  label: z.string(), // e.g. "Half Marathon (21.1 km)"
  bestTimeSeconds: z.number(),
  formattedTime: z.string(), // e.g. "1:42:15"
  avgPaceSecondsPerKm: z.number(),
  formattedPace: z.string(), // e.g. "4:50 /km"
  activityId: z.string(),
  activityName: z.string(),
  achievedAt: z.string(), // YYYY-MM-DD
});

export type ExercisePersonalRecordItem = z.infer<
  typeof exercisePersonalRecordItemSchema
>;

export const exercisePRMatrixResponseSchema = z.object({
  /**
   * One entry per (sportGroup, distance standard) pair, ordered by sport group
   * then by distance. Group by `sportGroup` for display — comparing records
   * across sports is meaningless (a 1 km walk is slower than a 1 mile run).
   */
  cardioPRs: z.array(exercisePersonalRecordItemSchema),
  strength1RMs: z.array(
    z.object({
      exerciseName: z.string(),
      estimatedOneRMKg: z.number(),
      weightKg: z.number(),
      reps: z.number(),
      achievedAt: z.string(),
    }),
  ),
});

export type ExercisePRMatrixResponse = z.infer<
  typeof exercisePRMatrixResponseSchema
>;

/** Matched course / route segment item */
export const matchedCourseGroupSchema = z.object({
  courseId: z.string(),
  courseName: z.string(),
  category: z.string(),
  /** Optional for the same mixed-version reason as the PR item fields above. */
  sport: activitySportSchema.optional(),
  totalDistanceMeters: z.number(),
  avgDistanceFormatted: z.number(),
  activityCount: z.number(),
  bestTimeSeconds: z.number(),
  bestPaceFormatted: z.string(),
  recentActivities: z.array(
    z.object({
      activityId: z.string(),
      activityName: z.string(),
      entryDate: z.string(),
      durationMinutes: z.number(),
      avgPaceFormatted: z.string(),
      avgHeartRate: z.number().nullable(),
    }),
  ),
});

export type MatchedCourseGroup = z.infer<typeof matchedCourseGroupSchema>;

export const matchedCoursesResponseSchema = z.object({
  courses: z.array(matchedCourseGroupSchema),
});

export type MatchedCoursesResponse = z.infer<
  typeof matchedCoursesResponseSchema
>;
