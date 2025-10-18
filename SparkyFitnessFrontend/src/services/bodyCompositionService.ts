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
  if (gender === 'male') {
    if (!height || !waist || !neck) throw new Error('Height, waist, and neck measurements are required for males.');
    const bfp = 86.010 * Math.log10(waist - neck) - 70.041 * Math.log10(height) + 36.76;
    return parseFloat(bfp.toFixed(2));
  } else if (gender === 'female') {
    if (!height || !waist || !neck || !hips) throw new Error('Height, waist, neck, and hips measurements are required for females.');
    const bfp = 163.205 * Math.log10(waist + hips - neck) - 97.684 * Math.log10(height) - 78.387;
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
    throw new Error('Weight, height, age, and gender are required for BMI body fat calculation.');
  }
  const heightInMeters = height / 100;
  const bmi = weight / (heightInMeters * heightInMeters);
  
  let bfp;
  if (gender === 'male') {
    bfp = 1.20 * bmi + 0.23 * age - 16.2;
  } else { // female
    bfp = 1.20 * bmi + 0.23 * age - 5.4;
  }
  
  return parseFloat(bfp.toFixed(2));
};