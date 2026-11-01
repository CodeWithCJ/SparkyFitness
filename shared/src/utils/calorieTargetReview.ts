import { ENERGY_DENSITY_KCAL_PER_KG } from '../constants/calorieConstants.ts';

/**
 * Deterministic weekly check of a calorie target against what the body did.
 * The adaptive TDEE (intake minus the weight trend) already says what the
 * person burns; this turns it into the rate the current target implies, the
 * rate actually seen, and the target that would give a chosen rate. Pure, so
 * the AI assistant only explains numbers it is given.
 */

export interface CalorieTargetReviewInput {
  /** Estimated maintenance calories (adaptive TDEE). */
  maintenanceKcal: number;
  /** False while the estimate is a fallback or has too little history. */
  maintenanceReliable: boolean;
  /** Days with food logged inside the estimate's window. */
  daysLogged: number;
  windowDays: number;
  /** Average logged intake over the logged days. */
  averageIntakeKcal: number | null;
  /** Smoothed weight change over the window, kg per day (negative is loss). */
  dailyWeightChangeKg: number | null;
  /** The saved calorie goal, when there is one. */
  currentTargetKcal: number | null;
  /** The rate the person wants, kg per week (negative is loss). */
  desiredKgPerWeek?: number | null;
  /** Lowest target worth suggesting, or null when the floor is off. */
  floorKcal: number | null;
}

export type CalorieTargetStatus =
  'learning' | 'low_logging' | 'no_target' | 'on_track' | 'off_track';

export interface CalorieTargetOption {
  kgPerWeek: number;
  calories: number;
  belowFloor: boolean;
}

export interface CalorieTargetReview {
  status: CalorieTargetStatus;
  maintenanceKcal: number;
  currentTargetKcal: number | null;
  /** Weekly change the current target implies at this maintenance. */
  impliedKgPerWeek: number | null;
  /** Weekly change the weight trend actually shows. */
  observedKgPerWeek: number | null;
  averageIntakeKcal: number | null;
  /** Average intake as a percent of the target. */
  adherencePercent: number | null;
  /** Intake within 10% of the target; null without both. */
  followedTarget: boolean | null;
  daysLogged: number;
  windowDays: number;
  /** Targets for a few common rates, always given once maintenance is known. */
  options: CalorieTargetOption[];
  /** The target for the desired rate; only when one was asked for. */
  suggestion: (CalorieTargetOption & { changeKcal: number | null }) | null;
}

/** Share of the window that must have food logged before a target is judged. */
export const CALORIE_REVIEW_MIN_LOGGED_SHARE = 0.7;
/** Weekly rate gap, kg, below which the target is doing what it should. */
export const CALORIE_REVIEW_RATE_TOLERANCE_KG = 0.25;
/** Intake within this share of the target counts as following it. */
export const CALORIE_REVIEW_ADHERENCE_TOLERANCE = 0.1;
export const CALORIE_REVIEW_RATES_KG_PER_WEEK = [-0.75, -0.5, -0.25, 0, 0.25];

const round10 = (value: number): number => Math.round(value / 10) * 10;
const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Calories a day that give `kgPerWeek` at this maintenance. */
export function targetForRate(
  maintenanceKcal: number,
  kgPerWeek: number
): number {
  return maintenanceKcal + (kgPerWeek * ENERGY_DENSITY_KCAL_PER_KG) / 7;
}

function option(
  maintenanceKcal: number,
  kgPerWeek: number,
  floorKcal: number | null
): CalorieTargetOption {
  const calories = round10(targetForRate(maintenanceKcal, kgPerWeek));
  return {
    kgPerWeek,
    calories,
    belowFloor: floorKcal !== null && calories < floorKcal,
  };
}

export function reviewCalorieTarget(
  input: CalorieTargetReviewInput
): CalorieTargetReview {
  const {
    maintenanceKcal,
    daysLogged,
    windowDays,
    averageIntakeKcal,
    currentTargetKcal,
    floorKcal,
  } = input;

  const impliedKgPerWeek =
    currentTargetKcal === null
      ? null
      : round2(
          ((currentTargetKcal - maintenanceKcal) * 7) /
            ENERGY_DENSITY_KCAL_PER_KG
        );
  const observedKgPerWeek =
    input.dailyWeightChangeKg === null
      ? null
      : round2(input.dailyWeightChangeKg * 7);
  const adherence =
    averageIntakeKcal !== null && currentTargetKcal
      ? averageIntakeKcal / currentTargetKcal
      : null;

  const options = CALORIE_REVIEW_RATES_KG_PER_WEEK.map((rate) =>
    option(maintenanceKcal, rate, floorKcal)
  );
  const desired = input.desiredKgPerWeek;
  const suggestion =
    desired === null || desired === undefined
      ? null
      : (() => {
          const base = option(maintenanceKcal, desired, floorKcal);
          return {
            ...base,
            changeKcal:
              currentTargetKcal === null
                ? null
                : base.calories - currentTargetKcal,
          };
        })();

  let status: CalorieTargetStatus;
  if (!input.maintenanceReliable) status = 'learning';
  else if (daysLogged / windowDays < CALORIE_REVIEW_MIN_LOGGED_SHARE) {
    status = 'low_logging';
  } else if (currentTargetKcal === null) status = 'no_target';
  else if (
    observedKgPerWeek !== null &&
    impliedKgPerWeek !== null &&
    Math.abs(observedKgPerWeek - impliedKgPerWeek) <=
      CALORIE_REVIEW_RATE_TOLERANCE_KG
  ) {
    status = 'on_track';
  } else status = 'off_track';

  return {
    status,
    maintenanceKcal,
    currentTargetKcal,
    impliedKgPerWeek,
    observedKgPerWeek,
    averageIntakeKcal,
    adherencePercent: adherence === null ? null : Math.round(adherence * 100),
    followedTarget:
      adherence === null
        ? null
        : Math.abs(adherence - 1) <= CALORIE_REVIEW_ADHERENCE_TOLERANCE,
    daysLogged,
    windowDays,
    options,
    suggestion,
  };
}
