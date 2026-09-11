/**
 * Body-fat estimation formulas shared by the web Daily Check-In and the mobile
 * measurements screen.
 *
 * Both algorithms take metric inputs (kg / cm) and return a percentage rounded
 * to one decimal place, which is the precision the web check-in has always
 * used. Surfaces that display two decimals (the web check-in renders
 * `toFixed(2)`) format the returned number themselves rather than rounding a
 * second time here, so the two callers can never drift.
 *
 * These are the same formulas the server keeps in its own
 * `services/bodyCompositionService.ts`; that copy rounds to two decimals and is
 * used for stored health data, so it is intentionally left alone.
 */

export const BodyFatAlgorithm = {
  US_NAVY: "U.S. Navy",
  BMI: "BMI Method",
} as const;

export type BodyFatAlgorithm =
  (typeof BodyFatAlgorithm)[keyof typeof BodyFatAlgorithm];

export type BodyFatGender = "male" | "female";

/** Constants for centimeter to inch conversion. */
const CM_TO_INCH = 1 / 2.54;

/**
 * Calculates body fat percentage using the U.S. Navy method.
 * All measurements should be in centimeters.
 *
 * Returns 0 when the log arguments fall outside their domain (for example a
 * waist no larger than the neck), matching the long-standing web behaviour.
 * Callers should treat a non-positive result as uncomputable rather than as a
 * real measurement.
 */
export const calculateBodyFatNavy = (
  gender: BodyFatGender,
  height: number, // in cm
  waist: number, // in cm
  neck: number, // in cm
  hips?: number, // in cm, required for females
): number => {
  if (gender === "male") {
    if (!height || !waist || !neck)
      throw new Error(
        "Height, waist, and neck measurements are required for males.",
      );

    const heightIn = height * CM_TO_INCH;
    const waistIn = waist * CM_TO_INCH;
    const neckIn = neck * CM_TO_INCH;

    const logValue = waistIn - neckIn;
    if (logValue <= 0 || heightIn <= 0) return 0;
    // Imperial formula constants are used, so input must be in inches
    const bfp =
      86.01 * Math.log10(logValue) - 70.041 * Math.log10(heightIn) + 36.76;
    return parseFloat(bfp.toFixed(1));
  } else if (gender === "female") {
    if (!height || !waist || !neck || !hips)
      throw new Error(
        "Height, waist, neck, and hips measurements are required for females.",
      );

    const heightIn = height * CM_TO_INCH;
    const waistIn = waist * CM_TO_INCH;
    const neckIn = neck * CM_TO_INCH;
    const hipsIn = hips * CM_TO_INCH;

    const logValue = waistIn + hipsIn - neckIn;
    if (logValue <= 0 || heightIn <= 0) return 0;
    // Imperial formula constants are used, so input must be in inches
    const bfp =
      163.205 * Math.log10(logValue) - 97.684 * Math.log10(heightIn) - 78.387;
    return parseFloat(bfp.toFixed(1));
  } else {
    throw new Error("Invalid gender provided. Must be 'male' or 'female'.");
  }
};

/**
 * Calculates body fat percentage using the BMI method.
 * Weight is in kilograms, height in centimeters and age in years.
 */
export const calculateBodyFatBmi = (
  weight: number, // in kg
  height: number, // in cm
  age: number, // in years
  gender: BodyFatGender,
): number => {
  if (!weight || !height || !age || !gender) {
    throw new Error(
      "Weight, height, age, and gender are required for BMI body fat calculation.",
    );
  }
  const heightInMeters = height / 100;
  const bmi = weight / (heightInMeters * heightInMeters);

  let bfp: number;
  if (gender === "male") {
    bfp = 1.2 * bmi + 0.23 * age - 16.2;
  } else {
    // female
    bfp = 1.2 * bmi + 0.23 * age - 5.4;
  }

  return parseFloat(bfp.toFixed(1));
};
