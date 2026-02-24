export enum BodyFatAlgorithm {
  US_NAVY = 'U.S. Navy',
  BMI = 'BMI Method',
}

/**
 * Calculates body fat percentage using the U.S. Navy method.
 * All measurements should be in centimeters.
 */
export const calculateBodyFatNavy = (
  gender: 'male' | 'female',
  height: number, // in cm
  waist: number, // in cm
  neck: number, // in cm
  hips?: number // in cm, required for females
): number => {
  // Constants for centimeter to inch conversion
  const CM_TO_INCH = 1 / 2.54;

  if (gender === 'male') {
    if (!height || !waist || !neck)
      throw new Error(
        'Height, waist, and neck measurements are required for males.'
      );

    const heightIn = height * CM_TO_INCH;
    const waistIn = waist * CM_TO_INCH;
    const neckIn = neck * CM_TO_INCH;

    const logValue = waistIn - neckIn;
    if (logValue <= 0 || heightIn <= 0) return 0;
    // Imperial formula constants are used, so input must be in inches
    const bfp =
      86.01 * Math.log10(logValue) - 70.041 * Math.log10(heightIn) + 36.76;
    return parseFloat(bfp.toFixed(2));
  } else if (gender === 'female') {
    if (!height || !waist || !neck || !hips)
      throw new Error(
        'Height, waist, neck, and hips measurements are required for females.'
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
    return parseFloat(bfp.toFixed(2));
  } else {
    throw new Error("Invalid gender provided. Must be 'male' or 'female'.");
  }
};

/**
 * Calculates body fat percentage using the BMI method.
 */
export const calculateBodyFatBmi = (
  weight: number, // in kg
  height: number, // in cm
  age: number, // in years
  gender: 'male' | 'female'
): number => {
  if (!weight || !height || !age || !gender) {
    throw new Error(
      'Weight, height, age, and gender are required for BMI body fat calculation.'
    );
  }
  const heightInMeters = height / 100;
  const bmi = weight / (heightInMeters * heightInMeters);

  let bfp: number;
  if (gender === 'male') {
    bfp = 1.2 * bmi + 0.23 * age - 16.2;
  } else {
    // female
    bfp = 1.2 * bmi + 0.23 * age - 5.4;
  }

  return parseFloat(bfp.toFixed(2));
};
