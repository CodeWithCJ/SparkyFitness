import {
  addDays,
  classifyActivitySport,
  heartRateZoneFor,
  instantToDay,
  isPassiveEntry,
  loggingStreak,
  localDateTimeToUtc,
  type CoachDirection,
  type CoachCyclePhase,
  COACH_CYCLE_PHASES,
  type CoachSignalSnapshot,
} from '@workspace/shared';
import coachSignalRepository, {
  type RecentExerciseRow,
} from '../models/coachSignalRepository.js';
import engagementRepository from '../models/engagementRepository.js';
import reportRepository from '../models/reportRepository.js';
import sleepScienceRepository from '../models/sleepScienceRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import goalService from './goalService.js';
import heartRateZoneService from './heartRateZoneService.js';
import hydrationTotalsService from './hydrationTotalsService.js';
import reportService from './reportService.js';
import exerciseStatsService from './exerciseStatsService.js';
import { getTrainingReview } from './trainingReviewService.js';
import cycleService from './cycleService.js';
import habitRepository from '../models/habitRepository.js';
import moodRepository from '../models/moodRepository.js';
import { log } from '../config/logging.js';

/** How far back workouts are read: enough for "within 48 hours". */
const EXERCISE_LOOKBACK_DAYS = 3;
const HARD_EFFORT = 7;
const HARD_ZONE = 4;
const STREAK_LOOKBACK_DAYS = 60;

function percentOf(total: unknown, goal: unknown): number | null {
  const goalValue = Number(goal);
  if (!Number.isFinite(goalValue) || goalValue <= 0) return null;
  const totalValue = Number(total);
  return Math.round(
    ((Number.isFinite(totalValue) ? totalValue : 0) / goalValue) * 100
  );
}

function hoursBetween(from: Date, to: Date): number {
  return Math.max(
    0,
    Math.round(((to.getTime() - from.getTime()) / 3_600_000) * 10) / 10
  );
}

/** When a diary workout began, in the zone it was recorded in. */
function startOf(row: RecentExerciseRow, tz: string): Date {
  const time = (row.entry_time ?? '12:00:00').slice(0, 5);
  return localDateTimeToUtc(
    `${row.entry_date}T${time}`,
    row.record_timezone ?? tz
  );
}

async function nutritionAndGoals(
  userId: string,
  today: string
): Promise<CoachSignalSnapshot> {
  const [rows, goalsByDay, water] = await Promise.all([
    reportRepository.getNutritionData(userId, today, today, []),
    goalService.getUserGoalsForRange(userId, today, today, true),
    hydrationTotalsService.resolveWaterTotalsForDate(userId, userId, today),
  ]);
  const totals = (rows as Record<string, unknown>[])[0] ?? {};
  const goals =
    (goalsByDay as Record<string, Record<string, unknown>>)[today] ?? {};
  return {
    calories_pct_of_goal: percentOf(totals.calories, goals.calories),
    protein_pct_of_goal: percentOf(totals.protein, goals.protein),
    carbs_pct_of_goal: percentOf(totals.carbs, goals.carbs),
    fiber_pct_of_goal: percentOf(totals.dietary_fiber, goals.dietary_fiber),
    water_pct_of_goal: percentOf(water.water_ml, goals.water_goal_ml),
  };
}

export interface WorkoutDescription {
  sport: ReturnType<typeof classifyActivitySport>['sport'];
  isStrength: boolean;
  hard: boolean;
  start: Date;
}

/** What kind of workout a diary row is, how hard it was and when it began. */
export function describeWorkout(
  row: RecentExerciseRow,
  tz: string,
  zoneFloors: readonly number[]
): WorkoutDescription {
  const sport = classifyActivitySport({
    exerciseName: row.exercise_name,
    category: row.category,
    notes: row.notes,
    providerName: row.provider_name,
    detailData: row.detail_data,
    exerciseSourceId: row.exercise_source_id,
  }).sport;
  const hard =
    (row.workout_effort ?? 0) >= HARD_EFFORT ||
    (row.avg_heart_rate !== null &&
      heartRateZoneFor(row.avg_heart_rate, zoneFloors) >= HARD_ZONE);
  return {
    sport,
    isStrength: sport === 'strength',
    hard,
    start: startOf(row, tz),
  };
}

async function workoutSignals(
  userId: string,
  tz: string,
  today: string,
  now: Date
): Promise<CoachSignalSnapshot> {
  const [rows, zones] = await Promise.all([
    coachSignalRepository.getRecentExerciseSessions(
      userId,
      addDays(today, -EXERCISE_LOOKBACK_DAYS)
    ),
    heartRateZoneService.resolveZonesForUser(userId),
  ]);
  let lastStrength: Date | null = null;
  let lastHardCardio: Date | null = null;
  for (const row of rows) {
    if (
      isPassiveEntry({
        name: row.exercise_name,
        durationMinutes: row.duration_minutes,
      })
    ) {
      continue;
    }
    const workout = describeWorkout(row, tz, zones.floors);
    if (workout.start.getTime() > now.getTime()) continue;
    if (workout.isStrength) {
      if (!lastStrength || workout.start > lastStrength) {
        lastStrength = workout.start;
      }
    } else if (workout.sport !== 'other' && workout.hard) {
      if (!lastHardCardio || workout.start > lastHardCardio) {
        lastHardCardio = workout.start;
      }
    }
  }
  return {
    hours_since_strength: lastStrength ? hoursBetween(lastStrength, now) : null,
    hours_since_hard_cardio: lastHardCardio
      ? hoursBetween(lastHardCardio, now)
      : null,
  };
}

async function sleepAndLoad(
  userId: string,
  tz: string
): Promise<CoachSignalSnapshot> {
  const [history, load] = await Promise.all([
    sleepScienceRepository.getSleepHistory(userId, 8, tz),
    reportService.getTrainingLoad(userId, userId),
  ]);
  // Newest first, one per night. Last night against the nights before it.
  const hours = (
    history as { timeAsleepHours?: unknown; sleepDurationHours?: unknown }[]
  )
    .map((night) => Number(night.timeAsleepHours ?? night.sleepDurationHours))
    .filter((value) => Number.isFinite(value) && value > 0);
  let sleepDiff: number | null = null;
  if (hours.length >= 4) {
    const [last, ...before] = hours;
    const average =
      before.reduce((sum, value) => sum + value, 0) / before.length;
    sleepDiff = Math.round(((last ?? 0) - average) * 60);
  }
  return {
    sleep_minutes_vs_avg: sleepDiff,
    training_load_ratio:
      load.ratio === null ? null : Math.round(load.ratio * 100) / 100,
  };
}

function goalDirection(
  mode: string | null | undefined,
  weeklyChangeKg: number | null | undefined
): 'down' | 'up' | null {
  if (mode === 'cut' || mode === 'high_cut') return 'down';
  if (mode === 'lean_bulk' || mode === 'bulk') return 'up';
  if (mode === 'weekly' && weeklyChangeKg) {
    return weeklyChangeKg < 0 ? 'down' : 'up';
  }
  return null;
}

async function weightSignal(userId: string): Promise<CoachSignalSnapshot> {
  const [weights, prefs] = await Promise.all([
    engagementRepository.getRecentWeights(userId, 7),
    preferenceRepository.getUserPreferences(userId),
  ]);
  const wanted = goalDirection(
    prefs?.goal_mode,
    Number(prefs?.goal_mode_weekly_change_kg) || 0
  );
  const values = (weights as { weight: unknown }[])
    .map((row) => Number(row.weight))
    .filter(Number.isFinite);
  if (!wanted || values.length < 3) return { weight_trend_direction: null };
  // Newest first: change over the readings we have.
  const change = (values[0] ?? 0) - (values[values.length - 1] ?? 0);
  let direction: CoachDirection = 'flat';
  if (Math.abs(change) >= 0.3) {
    direction = change < 0 === (wanted === 'down') ? 'toward' : 'away';
  }
  return { weight_trend_direction: direction };
}

async function loggingSignals(
  userId: string,
  today: string
): Promise<CoachSignalSnapshot> {
  const rows = (await engagementRepository.getLoggedDates(
    userId,
    addDays(today, -STREAK_LOOKBACK_DAYS)
  )) as { entry_date: string | Date }[];
  const days = rows.map((row) =>
    typeof row.entry_date === 'string'
      ? row.entry_date.slice(0, 10)
      : instantToDay(row.entry_date, 'UTC')
  );
  const newest = days[0];
  let since: number | null = null;
  if (newest) {
    since = Math.max(
      0,
      Math.round(
        (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${newest}T00:00:00Z`)) /
          86_400_000
      )
    );
  }
  return {
    days_since_last_log: since,
    logging_streak_days: loggingStreak(days, today),
  };
}

/** What a check-in needs beyond the always-computed numbers, so a signal
 * only some coaches read is not worked out for everyone. */
export interface CoachSignalOptions {
  /** The day of the previous check-in; PRs set since then are counted. */
  prSinceDay?: string | null;
  focusHabitId?: string | null;
  includeCycle?: boolean;
  includeStalls?: boolean;
  includeGoalStreaks?: boolean;
}

async function personalRecordSignal(
  userId: string,
  sinceDay: string
): Promise<CoachSignalSnapshot> {
  const matrix = await exerciseStatsService.getPersonalRecordMatrix(userId);
  const count = [
    ...matrix.cardioPRs.map((item) => item.achievedAt),
    ...matrix.strength1RMs.map((item) => item.achievedAt),
  ].filter((day) => day.slice(0, 10) >= sinceDay).length;
  return { new_prs_since_last_checkin: count };
}

async function goalStreakSignals(
  userId: string,
  today: string
): Promise<CoachSignalSnapshot> {
  const from = addDays(today, -14);
  const yesterday = addDays(today, -1);
  const [rows, goals] = await Promise.all([
    reportRepository.getNutritionData(userId, from, yesterday, []),
    goalService.getUserGoalsForRange(userId, from, yesterday, true),
  ]);
  const byDay = new Map(
    (rows as { date: string; protein?: unknown; calories?: unknown }[]).map(
      (row) => [row.date, row]
    )
  );
  const goalFor = goals as Record<string, Record<string, unknown>>;
  let protein = 0;
  let calories = 0;
  let proteinOpen = true;
  let caloriesOpen = true;
  for (let day = yesterday; day >= from; day = addDays(day, -1)) {
    const row = byDay.get(day);
    const goal = goalFor[day];
    const proteinPct = percentOf(row?.protein, goal?.protein);
    const caloriePct = percentOf(row?.calories, goal?.calories);
    if (proteinOpen) {
      if (proteinPct !== null && proteinPct >= 100) protein += 1;
      else proteinOpen = false;
    }
    if (caloriesOpen) {
      if (caloriePct !== null && caloriePct >= 90 && caloriePct <= 110) {
        calories += 1;
      } else caloriesOpen = false;
    }
    if (!proteinOpen && !caloriesOpen) break;
  }
  return {
    protein_goal_hit_streak_days: protein,
    calorie_goal_hit_streak_days: calories,
  };
}

async function stallSignal(userId: string): Promise<CoachSignalSnapshot> {
  const review = await getTrainingReview(userId);
  return { stalled_lifts: review.enoughData ? review.stalls.length : null };
}

async function moodSignal(
  userId: string,
  today: string
): Promise<CoachSignalSnapshot> {
  const rows = await moodRepository.getCheckinsForDate(userId, today);
  return { mood_checkin_today: rows.length > 0 ? 1 : 0 };
}

async function habitSignals(
  userId: string,
  habitId: string,
  today: string
): Promise<CoachSignalSnapshot> {
  const rows = (await habitRepository.getHabitHistory(
    userId,
    habitId,
    addDays(today, -60),
    today
  )) as { value: string; entry_date: string | Date }[];
  const done = new Set(
    rows
      .filter((row) => String(row.value).toLowerCase() === 'true')
      .map((row) =>
        typeof row.entry_date === 'string'
          ? row.entry_date.slice(0, 10)
          : instantToDay(row.entry_date, 'UTC')
      )
  );
  const days = [...done].sort().reverse();
  return {
    focus_habit_done_today: done.has(today) ? 1 : 0,
    focus_habit_streak_days: loggingStreak(days, today),
  };
}

async function cycleSignal(
  userId: string,
  today: string
): Promise<CoachSignalSnapshot> {
  const overview = await cycleService.getOverview(userId, today);
  const phase = overview?.phase as string | undefined;
  const known = (COACH_CYCLE_PHASES as readonly string[]).includes(phase ?? '');
  return { cycle_phase: known ? (phase as CoachCyclePhase) : null };
}

/** One part of the snapshot failing leaves its signals null, so a rule that
 * needs them stays quiet instead of the whole check-in failing. */
async function settle(
  name: string,
  userId: string,
  part: Promise<CoachSignalSnapshot>
): Promise<CoachSignalSnapshot> {
  try {
    return await part;
  } catch (error) {
    log('warn', `Coach signals (${name}) failed for user ${userId}:`, error);
    return {};
  }
}

/** The numbers coach rules are checked against, worked out once per check-in. */
export async function getCoachSignals(
  userId: string,
  tz: string,
  now: Date = new Date(),
  options: CoachSignalOptions = {}
): Promise<CoachSignalSnapshot> {
  const today = instantToDay(now, tz);
  const optional: Promise<CoachSignalSnapshot>[] = [
    settle('mood', userId, moodSignal(userId, today)),
  ];
  if (options.prSinceDay) {
    optional.push(
      settle('prs', userId, personalRecordSignal(userId, options.prSinceDay))
    );
  }
  if (options.includeGoalStreaks) {
    optional.push(settle('streaks', userId, goalStreakSignals(userId, today)));
  }
  if (options.includeStalls) {
    optional.push(settle('stalls', userId, stallSignal(userId)));
  }
  if (options.focusHabitId) {
    optional.push(
      settle('habit', userId, habitSignals(userId, options.focusHabitId, today))
    );
  }
  if (options.includeCycle) {
    optional.push(settle('cycle', userId, cycleSignal(userId, today)));
  }
  const parts = await Promise.all([
    ...optional,
    settle('nutrition', userId, nutritionAndGoals(userId, today)),
    settle('workouts', userId, workoutSignals(userId, tz, today, now)),
    settle('sleep', userId, sleepAndLoad(userId, tz)),
    settle('weight', userId, weightSignal(userId)),
    settle('logging', userId, loggingSignals(userId, today)),
  ]);
  return Object.assign({}, ...parts) as CoachSignalSnapshot;
}

export default { getCoachSignals };
