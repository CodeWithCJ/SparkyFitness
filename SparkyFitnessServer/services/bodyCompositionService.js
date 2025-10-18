const { log } = require('../config/logging');

/**
 * Calculates body fat percentage using the U.S. Navy method.
 * All measurements should be in centimeters.
 * @param {string} gender - 'male' or 'female'
 * @param {number} height - in cm
 * @param {number} waist - in cm
 * @param {number} neck - in cm
 * @param {number} [hips] - in cm, required for females
 * @returns {number} - Estimated body fat percentage
 */
function calculateBodyFatNavy(gender, height, waist, neck, hips) {
  log('info', `Calculating body fat with Navy method for ${gender}`);
  if (gender === 'male') {
    if (!height || !waist || !neck) throw new Error('Height, waist, and neck measurements are required for males.');
    // Formula for men: BFP = 86.010 * log10(waist - neck) - 70.041 * log10(height) + 36.76
    const bfp = 86.010 * Math.log10(waist - neck) - 70.041 * Math.log10(height) + 36.76;
    return parseFloat(bfp.toFixed(2));
  } else if (gender === 'female') {
    if (!height || !waist || !neck || !hips) throw new Error('Height, waist, neck, and hips measurements are required for females.');
    // Formula for women: BFP = 163.205 * log10(waist + hips - neck) - 97.684 * log10(height) - 78.387
    const bfp = 163.205 * Math.log10(waist + hips - neck) - 97.684 * Math.log10(height) - 78.387;
    return parseFloat(bfp.toFixed(2));
  } else {
    throw new Error("Invalid gender provided. Must be 'male' or 'female'.");
  }
}

/**
 * Calculates body fat percentage using the BMI method.
 * @param {number} weight - in kg
 * @param {number} height - in cm
 * @param {number} age - in years
 * @param {string} gender - 'male' or 'female'
 * @returns {number} - Estimated body fat percentage
 */
function calculateBodyFatBmi(weight, height, age, gender) {
  log('info', `Calculating body fat with BMI method for ${gender}`);
  if (!weight || !height || !age || !gender) {
    throw new Error('Weight, height, age, and gender are required for BMI body fat calculation.');
  }
  const heightInMeters = height / 100;
  const bmi = weight / (heightInMeters * heightInMeters);
  
  let bfp;
  if (gender === 'male') {
    // Formula for men: BFP = 1.20 * BMI + 0.23 * Age - 16.2
    bfp = 1.20 * bmi + 0.23 * age - 16.2;
  } else { // female
    // Formula for women: BFP = 1.20 * BMI + 0.23 * Age - 5.4
    bfp = 1.20 * bmi + 0.23 * age - 5.4;
  }
  
  return parseFloat(bfp.toFixed(2));
}

module.exports = {
  calculateBodyFatNavy,
  calculateBodyFatBmi,
};