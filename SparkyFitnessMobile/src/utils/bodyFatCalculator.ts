import {
  BodyFatAlgorithm,
  calculateBodyFatBmi,
  calculateBodyFatNavy,
  type BodyFatGender,
} from '@workspace/shared';

/**
 * Body Fat % calculation for the mobile measurements screen.
 *
 * Mirrors the web Daily Check-In: the same two algorithms from
 * `@workspace/shared`, the same required inputs, and the same `Use Recent`
 * fallback where a recent recorded measurement is preferred over the field's
 * current contents. The calculation only produces a number; writing it into the
 * Body Fat field (and therefore saving) stays with the caller, so calculating
 * never commits a check-in on its own.
 */

/** Metric inputs, matching what the API stores (kg / cm). */
export interface BodyFatMeasurementInputs {
  weightKg: number | null;
  heightCm: number | null;
  waistCm: number | null;
  neckCm: number | null;
  hipsCm: number | null;
}

/**
 * Why a calculation could not produce a value. Callers map these onto
 * user-facing messages; they are codes rather than text so this module stays
 * free of i18n concerns.
 */
export type BodyFatCalculationFailure =
  | 'profile-required'
  | 'bmi-required-fields'
  | 'navy-required-fields'
  | 'uncomputable';

export type BodyFatCalculationResult =
  | { ok: true; percentage: number }
  | { ok: false; reason: BodyFatCalculationFailure };

const isUsable = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const toGender = (gender: string | null | undefined): BodyFatGender | null =>
  gender === 'male' || gender === 'female' ? gender : null;

/**
 * Resolves the measurement inputs the calculation will run on.
 *
 * With `useRecent`, each metric prefers the most recently recorded value and
 * falls back to the form's own value — the web behaviour. Without it, only the
 * form's values are used.
 */
export function resolveBodyFatInputs(params: {
  useRecent: boolean;
  formValues: BodyFatMeasurementInputs;
  recentValues: Partial<BodyFatMeasurementInputs>;
}): BodyFatMeasurementInputs {
  const { useRecent, formValues, recentValues } = params;
  if (!useRecent) return formValues;

  return {
    weightKg: recentValues.weightKg ?? formValues.weightKg,
    heightCm: recentValues.heightCm ?? formValues.heightCm,
    waistCm: recentValues.waistCm ?? formValues.waistCm,
    neckCm: recentValues.neckCm ?? formValues.neckCm,
    hipsCm: recentValues.hipsCm ?? formValues.hipsCm,
  };
}

/**
 * Runs the configured algorithm over the resolved inputs.
 *
 * Validation is stricter than the web check-in in one direction only: inputs
 * that would make a formula meaningless (a zero or negative measurement, an
 * invalid gender) are reported as validation failures instead of being handed
 * to the formula, where they would either throw or yield 0 and be written into
 * the field as if it were a real result. For every well-formed input the
 * numbers are identical to the web implementation, which is covered by tests.
 */
export function calculateBodyFatPercentage(params: {
  algorithm: string | null | undefined;
  gender: string | null | undefined;
  age: number;
  inputs: BodyFatMeasurementInputs;
}): BodyFatCalculationResult {
  const { algorithm, gender: rawGender, age, inputs } = params;
  const gender = toGender(rawGender);
  if (!gender) return { ok: false, reason: 'profile-required' };

  const isBmiMethod = algorithm === BodyFatAlgorithm.BMI;

  let percentage: number;
  try {
    if (isBmiMethod) {
      const { weightKg, heightCm } = inputs;
      if (
        !isUsable(weightKg) ||
        !isUsable(heightCm) ||
        !Number.isFinite(age) ||
        age <= 0
      ) {
        return { ok: false, reason: 'bmi-required-fields' };
      }
      percentage = calculateBodyFatBmi(weightKg, heightCm, age, gender);
    } else {
      const { heightCm, waistCm, neckCm, hipsCm } = inputs;
      if (
        !isUsable(heightCm) ||
        !isUsable(waistCm) ||
        !isUsable(neckCm) ||
        (gender === 'female' && !isUsable(hipsCm))
      ) {
        return { ok: false, reason: 'navy-required-fields' };
      }
      percentage = calculateBodyFatNavy(
        gender,
        heightCm,
        waistCm,
        neckCm,
        hipsCm ?? undefined
      );
    }
  } catch {
    return {
      ok: false,
      reason: isBmiMethod ? 'bmi-required-fields' : 'navy-required-fields',
    };
  }

  // A non-positive percentage means the log arguments fell outside their domain
  // (for example a waist no larger than the neck); the web form writes the 0
  // through, which would save an impossible body fat. Report it as uncomputable
  // instead so the user can correct the measurements. The upper bound matches
  // the field's own save validation.
  if (!Number.isFinite(percentage) || percentage <= 0 || percentage >= 100) {
    return { ok: false, reason: 'uncomputable' };
  }

  return { ok: true, percentage };
}
