import {
  addDays,
  todayInZone,
  weeklyGoalPlanInForce,
  type CoachSuggestion,
  type CoachSuggestionKind,
} from '@workspace/shared';
import aiCoachRepository from '../models/aiCoachRepository.js';
import goalRepository from '../models/goalRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import weeklyGoalPlanRepository from '../models/weeklyGoalPlanRepository.js';
import { getCalorieTargetReview } from './calorieTargetReviewService.js';
import goalService from './goalService.js';
import { applyPlanProposals, getPlanProposals } from './planProposalService.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { log } from '../config/logging.js';

export type SuggestionErrorCode =
  'not_found' | 'not_pending' | 'expired' | 'prefill';

export class CoachSuggestionError extends Error {
  constructor(
    readonly code: SuggestionErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'CoachSuggestionError';
  }
}

/** A suggestion, plus the numbers the message may quote. */
export interface BuiltSuggestion {
  suggestion: CoachSuggestion | null;
  facts: Record<string, number | string>;
}

const PROTEIN_BUMP = 1.1;
const MIN_CALORIE_CHANGE_KCAL = 50;
const GOAL_MODE_RATES: Record<string, number> = {
  cut: -0.5,
  high_cut: -0.75,
  lean_bulk: 0.25,
  bulk: 0.25,
};

const roundUpTo5 = (value: number) => Math.ceil(value / 5) * 5;

// The goal columns manageGoalTimeline takes, as `p_<column>`.
const GOAL_FIELDS = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'water_goal_ml',
  'saturated_fat',
  'polyunsaturated_fat',
  'monounsaturated_fat',
  'trans_fat',
  'cholesterol',
  'sodium',
  'potassium',
  'dietary_fiber',
  'sugars',
  'vitamin_a',
  'vitamin_c',
  'calcium',
  'iron',
  'caffeine_mg',
  'alcohol_g',
  'target_exercise_calories_burned',
  'target_exercise_duration_minutes',
  'target_steps',
  'protein_percentage',
  'carbs_percentage',
  'fat_percentage',
  'breakfast_percentage',
  'lunch_percentage',
  'dinner_percentage',
  'snacks_percentage',
] as const;

type GoalRow = Record<string, unknown>;

/** Every goal field of a day, as the body `manageGoalTimeline` takes: it
 * writes the whole row, so a change must repeat what it keeps. */
function goalPayload(
  day: string,
  goal: GoalRow,
  changes: GoalRow,
  cascade: boolean
): GoalRow {
  const payload: GoalRow = {
    p_start_date: day,
    p_cascade: cascade,
    custom_meal_percentages: goal.custom_meal_percentages ?? null,
    custom_nutrients: goal.custom_nutrients ?? null,
  };
  for (const field of GOAL_FIELDS) {
    payload[`p_${field}`] =
      field in changes ? changes[field] : (goal[field] ?? null);
  }
  return payload;
}

async function desiredWeeklyRate(userId: string): Promise<number | null> {
  const prefs = await preferenceRepository.getUserPreferences(userId);
  if (prefs?.goal_mode === 'weekly') {
    const kg = Number(prefs.goal_mode_weekly_change_kg);
    return Number.isFinite(kg) ? kg : null;
  }
  return GOAL_MODE_RATES[prefs?.goal_mode as string] ?? null;
}

async function buildProteinBump(
  userId: string,
  tz: string
): Promise<BuiltSuggestion> {
  const today = todayInZone(tz);
  const goals = (await goalService.getUserGoalsForRange(
    userId,
    today,
    today,
    false
  )) as Record<string, GoalRow>;
  const from = Number(goals[today]?.protein);
  if (!Number.isFinite(from) || from <= 0)
    return { suggestion: null, facts: {} };
  const to = roundUpTo5(from * PROTEIN_BUMP);
  return {
    suggestion: { kind: 'goal_day_protein', day: today, from, to },
    facts: { protein_goal_from: from, protein_goal_to: to },
  };
}

async function buildCalorieTarget(userId: string): Promise<BuiltSuggestion> {
  const desired = await desiredWeeklyRate(userId);
  const review = await getCalorieTargetReview(userId, desired);
  if (review.status === 'learning' || review.status === 'low_logging') {
    return { suggestion: null, facts: {} };
  }
  const facts: Record<string, number | string> = {
    days_logged: review.daysLogged,
  };
  if (review.observedKgPerWeek !== null) {
    facts.observed_kg_per_week = review.observedKgPerWeek;
  }
  if (review.impliedKgPerWeek !== null) {
    facts.expected_kg_per_week = review.impliedKgPerWeek;
  }
  if (review.adherencePercent !== null) {
    facts.followed_target_percent = Math.round(review.adherencePercent);
  }
  const option = review.suggestion;
  if (
    review.status === 'off_track' &&
    option &&
    review.currentTargetKcal !== null &&
    !option.belowFloor &&
    Math.abs(option.calories - review.currentTargetKcal) >=
      MIN_CALORIE_CHANGE_KCAL
  ) {
    return {
      suggestion: {
        kind: 'calorie_target',
        from_kcal: review.currentTargetKcal,
        to_kcal: option.calories,
        weekly_rate_kg: option.kgPerWeek,
      },
      facts,
    };
  }
  return { suggestion: null, facts };
}

async function buildPlanChanges(userId: string): Promise<BuiltSuggestion> {
  const result = await getPlanProposals(userId);
  if (!result) return { suggestion: null, facts: {} };
  const changing = result.proposals.filter((p) => p.setChanges.length > 0);
  if (changing.length === 0) return { suggestion: null, facts: {} };
  const stepUp = changing.filter((p) => p.kind === 'increase').length;
  const lighter = changing.filter((p) => p.kind === 'reduce').length;
  return {
    suggestion: {
      kind: 'plan_changes',
      plan_id: String(result.plan.id),
      step_up: stepUp,
      lighter,
      hold: result.proposals.length - changing.length,
    },
    facts: { plan_step_up: stepUp, plan_lighter: lighter },
  };
}

/** What a rule proposes with its message, from today's data. */
export async function buildSuggestion(
  userId: string,
  tz: string,
  kind: CoachSuggestionKind
): Promise<BuiltSuggestion> {
  try {
    switch (kind) {
      case 'goal_day_protein':
        return await buildProteinBump(userId, tz);
      case 'calorie_target':
        return await buildCalorieTarget(userId);
      case 'plan_changes':
        return await buildPlanChanges(userId);
    }
  } catch (error) {
    log('warn', `Coach suggestion (${kind}) failed for user ${userId}:`, error);
    return { suggestion: null, facts: {} };
  }
}

async function applyProteinBump(
  userId: string,
  tz: string,
  suggestion: Extract<CoachSuggestion, { kind: 'goal_day_protein' }>
) {
  const today = todayInZone(tz);
  const tomorrow = addDays(today, 1);
  const [effective, explicit, plans] = await Promise.all([
    goalService.getUserGoalsForRange(userId, today, tomorrow, false) as Promise<
      Record<string, GoalRow>
    >,
    goalRepository.getGoalsInRange(userId, today, tomorrow),
    weeklyGoalPlanRepository.getActiveWeeklyGoalPlansInRange(
      userId,
      today,
      tomorrow
    ),
  ]);
  const todayGoal = effective[today];
  const tomorrowGoal = effective[tomorrow];
  if (!todayGoal) throw new CoachSuggestionError('expired', 'No goals today.');
  if (Math.round(Number(todayGoal.protein)) !== Math.round(suggestion.from)) {
    throw new CoachSuggestionError(
      'expired',
      'The current protein target has changed since this suggestion.'
    );
  }

  // Grams win only when the percentages are cleared on the changed day.
  await goalService.manageGoalTimeline(
    userId,
    goalPayload(
      today,
      todayGoal,
      {
        protein: suggestion.to,
        protein_percentage: null,
        carbs_percentage: null,
        fat_percentage: null,
      },
      false
    )
  );

  // A single-day write carries forward until the next dated goal, so write
  // tomorrow back to what it was, unless the person set tomorrow or a weekly
  // plan decides it.
  const tomorrowExplicit = (explicit as { goal_date: string | Date }[]).some(
    (row) =>
      String(
        typeof row.goal_date === 'string'
          ? row.goal_date
          : row.goal_date.toISOString()
      ).slice(0, 10) === tomorrow
  );
  const planDecides = Boolean(weeklyGoalPlanInForce(plans, tomorrow));
  if (tomorrowGoal && !tomorrowExplicit && !planDecides) {
    try {
      await goalService.manageGoalTimeline(
        userId,
        goalPayload(tomorrow, tomorrowGoal, {}, false)
      );
    } catch (err) {
      await goalService
        .manageGoalTimeline(userId, goalPayload(today, todayGoal, {}, false))
        .catch(() => {});
      throw err;
    }
  }
  return { day: today, nutrient: 'protein', value: suggestion.to };
}

async function applyCalorieTarget(
  userId: string,
  tz: string,
  suggestion: Extract<CoachSuggestion, { kind: 'calorie_target' }>
) {
  const today = todayInZone(tz);
  const goals = (await goalService.getUserGoalsForRange(
    userId,
    today,
    today,
    false
  )) as Record<string, GoalRow>;
  const goal = goals[today];
  if (!goal) throw new CoachSuggestionError('expired', 'No goals today.');
  if (Math.round(Number(goal.calories)) !== Math.round(suggestion.from_kcal)) {
    throw new CoachSuggestionError(
      'expired',
      'The current calorie target has changed since this review.'
    );
  }
  await goalService.manageGoalTimeline(
    userId,
    goalPayload(today, goal, { calories: suggestion.to_kcal }, true)
  );
  return { day: today, kcal: suggestion.to_kcal };
}

async function applyPlan(
  userId: string,
  suggestion: Extract<CoachSuggestion, { kind: 'plan_changes' }>
) {
  // Recomputed from the plan as it is now; nothing from the message is trusted.
  const current = await getPlanProposals(userId, suggestion.plan_id);
  if (!current) throw new CoachSuggestionError('expired', 'Plan not found.');
  const changing = current.proposals.filter((p) => p.setChanges.length > 0);
  if (changing.length === 0) {
    throw new CoachSuggestionError('expired', 'No pending plan changes found.');
  }
  const stepUp = changing.filter((p) => p.kind === 'increase').length;
  const lighter = changing.filter((p) => p.kind === 'reduce').length;
  if (stepUp !== suggestion.step_up || lighter !== suggestion.lighter) {
    throw new CoachSuggestionError(
      'expired',
      'Plan proposals have changed since this suggestion was created.'
    );
  }
  const result = await applyPlanProposals(
    userId,
    suggestion.plan_id,
    changing.map((proposal) => proposal.assignmentId)
  );
  if (result === 'prefill') {
    throw new CoachSuggestionError(
      'prefill',
      'This plan fills the diary from its weights; change it in the plan.'
    );
  }
  if (!result) throw new CoachSuggestionError('expired', 'Plan not found.');
  return { applied: result.applied.length };
}

/** Applies a pending suggestion after the person tapped Apply. */
export async function applySuggestion(userId: string, nudgeId: string) {
  const nudge = await aiCoachRepository.getNudge(userId, nudgeId);
  if (!nudge?.suggestion) {
    throw new CoachSuggestionError('not_found', 'Suggestion not found.');
  }
  if (nudge.suggestion_status !== 'pending') {
    throw new CoachSuggestionError('not_pending', 'Already handled.');
  }
  if (!(await aiCoachRepository.claimSuggestion(userId, nudgeId))) {
    throw new CoachSuggestionError('not_pending', 'Already handled.');
  }
  const tz = await loadUserTimezone(userId);
  const suggestion = nudge.suggestion;
  if (
    suggestion.kind === 'goal_day_protein' &&
    suggestion.day !== todayInZone(tz)
  ) {
    await aiCoachRepository.resolveSuggestion(
      userId,
      nudgeId,
      'expired',
      'applied'
    );
    throw new CoachSuggestionError('expired', 'This was for another day.');
  }
  let summary: Record<string, unknown>;
  try {
    switch (suggestion.kind) {
      case 'goal_day_protein':
        summary = await applyProteinBump(userId, tz, suggestion);
        break;
      case 'calorie_target':
        summary = await applyCalorieTarget(userId, tz, suggestion);
        break;
      case 'plan_changes':
        summary = await applyPlan(userId, suggestion);
        break;
    }
  } catch (error) {
    if (error instanceof CoachSuggestionError && error.code === 'expired') {
      await aiCoachRepository
        .resolveSuggestion(userId, nudgeId, 'expired', 'applied')
        .catch(() => {});
    } else {
      await aiCoachRepository
        .unclaimSuggestion(userId, nudgeId)
        .catch(() => {});
    }
    throw error;
  }
  return { applied: true as const, kind: suggestion.kind, summary };
}

export async function dismissSuggestion(userId: string, nudgeId: string) {
  const nudge = await aiCoachRepository.getNudge(userId, nudgeId);
  if (!nudge?.suggestion) {
    throw new CoachSuggestionError('not_found', 'Suggestion not found.');
  }
  if (
    !(await aiCoachRepository.resolveSuggestion(userId, nudgeId, 'dismissed'))
  ) {
    throw new CoachSuggestionError('not_pending', 'Already handled.');
  }
  return { dismissed: true as const };
}

export default { buildSuggestion, applySuggestion, dismissSuggestion };
