import type { TFunction } from 'i18next';
import type { CalorieTargetBreakdownProps } from './types';

export type BodyFatMathInputs = Pick<
  CalorieTargetBreakdownProps,
  | 'bodyFatAlgorithm'
  | 'displayWeight'
  | 'displayHeight'
  | 'displayAge'
  | 'displayGender'
  | 'displayWaist'
  | 'displayNeck'
  | 'displayHips'
>;

export const getBodyFatMathText = (
  t: TFunction,
  {
    bodyFatAlgorithm,
    displayWeight,
    displayHeight,
    displayAge,
    displayGender,
    displayWaist,
    displayNeck,
    displayHips,
  }: BodyFatMathInputs
): string => {
  if (bodyFatAlgorithm === 'BMI Method') {
    const heightInM = displayHeight / 100;
    const bmi = displayWeight / (heightInM * heightInM);
    const constant = displayGender === 'male' ? 16.2 : 5.4;
    return t('diary.calculateExplanation.bmiBodyFatMath', {
      defaultValue:
        'Formula: 1.2 × BMI + 0.23 × age - constant ({{constant}})\nMath: 1.2 × {{bmi}} (BMI) + 0.23 × {{age}} - {{constant}} = {{result}}%',
      constant,
      bmi: bmi.toFixed(1),
      age: displayAge,
      result: (1.2 * bmi + 0.23 * displayAge - constant).toFixed(1),
    });
  }

  // Default: U.S. Navy
  if (
    !displayWaist ||
    !displayNeck ||
    (displayGender === 'female' && !displayHips)
  ) {
    return t('diary.calculateExplanation.navyMissingMeasurements', {
      defaultValue:
        'Formula: U.S. Navy Method (requires waist, neck, and hips for females)\nMissing measurements for formula visualization. Go to Check-In to record waist & neck.',
    });
  }

  const CM_TO_INCH = 1 / 2.54;
  const heightIn = displayHeight * CM_TO_INCH;
  const waistIn = displayWaist * CM_TO_INCH;
  const neckIn = displayNeck * CM_TO_INCH;

  if (displayGender === 'male') {
    const logValue = waistIn - neckIn;
    if (logValue <= 0 || heightIn <= 0)
      return t(
        'diary.calculateExplanation.invalidMeasurements',
        'Invalid measurements for log calculation.'
      );
    const bfp =
      86.01 * Math.log10(logValue) - 70.041 * Math.log10(heightIn) + 36.76;
    // Print the inch values the formula is actually evaluated with. Showing the raw
    // cm figures here made the panel contradict itself: plugging those into these
    // (imperial) constants yields a visibly different number from the result below.
    return t('diary.calculateExplanation.navyMaleMath', {
      defaultValue:
        'Formula (Male): 86.01 × log10(waist - neck) - 70.041 × log10(height) + 36.76 (in inches)\nMath: 86.01 × log10({{waist}}in - {{neck}}in) - 70.041 × log10({{height}}in) + 36.76\nCalculated: {{result}}%',
      waist: waistIn.toFixed(1),
      neck: neckIn.toFixed(1),
      height: heightIn.toFixed(1),
      result: bfp.toFixed(1),
    });
  } else {
    const displayHipsVal = displayHips || 0;
    const hipsIn = displayHipsVal * CM_TO_INCH;
    const logValue = waistIn + hipsIn - neckIn;
    if (logValue <= 0 || heightIn <= 0)
      return t(
        'diary.calculateExplanation.invalidMeasurements',
        'Invalid measurements for log calculation.'
      );
    const bfp =
      163.205 * Math.log10(logValue) - 97.684 * Math.log10(heightIn) - 78.387;
    return t('diary.calculateExplanation.navyFemaleMath', {
      defaultValue:
        'Formula (Female): 163.205 × log10(waist + hips - neck) - 97.684 × log10(height) - 78.387 (in inches)\nMath: 163.205 × log10({{waist}}in + {{hips}}in - {{neck}}in) - 97.684 × log10({{height}}in) - 78.387\nCalculated: {{result}}%',
      waist: waistIn.toFixed(1),
      hips: hipsIn.toFixed(1),
      neck: neckIn.toFixed(1),
      height: heightIn.toFixed(1),
      result: bfp.toFixed(1),
    });
  }
};
