import { getNutrientDosesForWindow } from '../models/foodMisc.js';
import { getUserPreferences } from '../models/preferenceRepository.js';
import { getUserProfile } from '../models/userRepository.js';
import { getLatestCheckInMeasurementsOnOrBeforeDate } from '../models/measurementRepository.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { resolveDoseInstant } from '../utils/doseInstant.js';
import {
  addDays,
  ageFromDateOfBirth,
  bacModelOf,
  bloodAlcoholAt,
  bloodAlcoholChartWindow,
  bloodAlcoholPeak,
  dayToUtcRange,
  instantToDay,
  isBacDisplayUnit,
  isBacDistributionFormula,
  missingBacInputs,
  resolveBacDistributionFactor,
  BAC_LOOKBACK_HOURS,
  DEFAULT_BAC_DISPLAY_UNIT,
  DEFAULT_BAC_DISTRIBUTION_FORMULA,
  DEFAULT_BAC_ELIMINATION_RATE,
} from '@workspace/shared';
import type {
  AlcoholDose,
  BacBodyInputs,
  BacEstimateStatus,
  BacModel,
  BloodAlcoholResponse,
} from '@workspace/shared';

export interface BloodAlcoholOptions {
  date: string;
  now?: string | number | Date;
}

const HOUR_MS = 60 * 60 * 1000;

const positiveOrNull = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Drinks from before the day count only while their effect still reaches it:
 * last night's drinks raise this morning's estimate, but yesterday's lunch does
 * not stretch today's chart. Keeps the drinking episode that is still going at
 * midnight, from the drink that started it.
 */
function carriedOverDoses(
  earlier: AlcoholDose[],
  model: BacModel | null,
  dayStartMs: number
): AlcoholDose[] {
  if (
    !model ||
    earlier.length === 0 ||
    bloodAlcoholAt(earlier, model, dayStartMs) === 0
  ) {
    return [];
  }
  let episodeStart = 0;
  for (let i = 1; i < earlier.length; i++) {
    const at = earlier[i]!.at;
    if (
      Date.parse(at) > Date.parse(earlier[i - 1]!.at) &&
      bloodAlcoholAt(earlier.slice(0, i), model, at) === 0
    ) {
      episodeStart = i;
    }
  }
  return earlier.slice(episodeStart);
}

export async function getBloodAlcoholEstimate(
  userId: string,
  options: BloodAlcoholOptions
): Promise<BloodAlcoholResponse> {
  const { date, now = new Date() } = options;

  const [tz, prefs, profile, measurements, rawDoses] = await Promise.all([
    loadUserTimezone(userId),
    getUserPreferences(userId),
    getUserProfile(userId),
    getLatestCheckInMeasurementsOnOrBeforeDate(userId, date),
    getNutrientDosesForWindow(userId, addDays(date, -1), date, 'alcohol_g'),
  ]);

  const chosenFormula = isBacDistributionFormula(
    prefs?.bac_distribution_formula
  )
    ? prefs.bac_distribution_formula
    : DEFAULT_BAC_DISTRIBUTION_FORMULA;
  const eliminationRate =
    Number(prefs?.bac_elimination_rate) || DEFAULT_BAC_ELIMINATION_RATE;
  const displayUnit = isBacDisplayUnit(prefs?.bac_display_unit)
    ? prefs.bac_display_unit
    : DEFAULT_BAC_DISPLAY_UNIT;

  // No guessed defaults: an unknown sex or a missing measurement is reported
  // as missing rather than quietly turned into a confident wrong number.
  const gender: unknown = profile?.gender;
  const inputs: BacBodyInputs = {
    sex: gender === 'male' || gender === 'female' ? gender : null,
    ageYears: ageFromDateOfBirth(profile?.date_of_birth, date),
    heightCm: positiveOrNull(measurements?.height),
    weightKg: positiveOrNull(measurements?.weight),
  };
  const missingInputs = missingBacInputs(chosenFormula, inputs);
  // Seidl and Forrest leave the plausible range for some real bodies; the
  // shared resolver then uses Watson and names the formula it replaced.
  const resolvedFactor =
    missingInputs.length > 0
      ? null
      : resolveBacDistributionFactor(chosenFormula, inputs);
  const distributionFactor = resolvedFactor?.factor ?? null;
  const status: BacEstimateStatus =
    missingInputs.length > 0
      ? 'missing_inputs'
      : resolvedFactor === null
        ? 'implausible_inputs'
        : 'ok';
  const weightKg = status === 'ok' ? inputs.weightKg : null;
  const model = bacModelOf({
    distribution_factor: distributionFactor,
    weight_kg: weightKg,
    elimination_rate: eliminationRate,
  });

  const { start: dayStart, end: dayEnd } = dayToUtcRange(date, tz);
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayEnd.getTime();
  const lookbackStartMs = dayStartMs - BAC_LOOKBACK_HOURS * HOUR_MS;

  const resolved = rawDoses
    .map((raw) => {
      const { at, isEstimated } = resolveDoseInstant(raw, tz);
      return {
        at,
        grams: raw.amount,
        name: raw.name,
        is_estimated: isEstimated,
      };
    })
    .filter((dose) => {
      const ms = Date.parse(dose.at);
      return ms >= lookbackStartMs && ms < dayEndMs;
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const earlier = resolved.filter((d) => Date.parse(d.at) < dayStartMs);
  const doses = [
    ...carriedOverDoses(earlier, model, dayStartMs),
    ...resolved.filter((d) => Date.parse(d.at) >= dayStartMs),
  ];

  const isToday = instantToDay(now, tz) === date;
  // The peak covers the span the chart draws, so a late drink's peak after
  // midnight is the one the curve shows rather than the day's last minute.
  const chartWindow = bloodAlcoholChartWindow(
    doses,
    model,
    { startMs: dayStartMs, endMs: dayEndMs },
    now
  );

  return {
    status,
    missing_inputs: missingInputs,
    formula: resolvedFactor?.formula ?? chosenFormula,
    fell_back_from: resolvedFactor?.fellBackFrom ?? null,
    display_unit: displayUnit,
    elimination_rate: eliminationRate,
    distribution_factor: distributionFactor,
    weight_kg: weightKg,
    doses,
    estimated_now_permille:
      model && isToday ? bloodAlcoholAt(doses, model, now) : null,
    peak: chartWindow
      ? bloodAlcoholPeak(doses, model, chartWindow.from, chartWindow.to)
      : null,
    has_estimated_times: doses.some((dose) => dose.is_estimated),
  };
}

export default {
  getBloodAlcoholEstimate,
};
