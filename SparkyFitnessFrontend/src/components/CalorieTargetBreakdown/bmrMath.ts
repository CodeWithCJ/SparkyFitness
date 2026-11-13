import type { TFunction } from 'i18next';
import type { CalorieTargetBreakdownProps } from './types';

export type BmrMathInputs = Pick<
  CalorieTargetBreakdownProps,
  | 'bmrAlgorithm'
  | 'displayWeight'
  | 'displayHeight'
  | 'displayAge'
  | 'displayGender'
  | 'displayBodyFat'
>;

// Inputs are printed at the precision the formula actually evaluates at. Rounding
// weight to one decimal made the panel unable to reproduce its own answer: a stored
// 73.45 kg printed as "73.5" recomputes to 1597 kcal against a stated 1596.
const formatInput = (value: number) => Number(value.toFixed(2)).toString();

export const getBmrMathText = (
  t: TFunction,
  {
    bmrAlgorithm,
    displayWeight,
    displayHeight,
    displayAge,
    displayGender,
    displayBodyFat,
  }: BmrMathInputs
): string => {
  if (bmrAlgorithm === 'Katch-McArdle' || bmrAlgorithm === 'Cunningham') {
    if (!displayBodyFat) {
      return t('diary.calculateExplanation.requiresBodyFat', {
        defaultValue:
          'Requires Weight and Body Fat Percentage. Math: Skipped (using Mifflin-St Jeor fallback).',
      });
    }
    const lbm = displayWeight * (1 - displayBodyFat / 100);
    if (bmrAlgorithm === 'Katch-McArdle') {
      return t('diary.calculateExplanation.katchMath', {
        defaultValue:
          'Formula: 370 + 21.6 × LBM (where LBM = weight × (1 - BF/100))\nMath: 370 + 21.6 × ({{weight}} kg × (1 - {{bodyFat}}/100)) = {{result}} kcal',
        weight: formatInput(displayWeight),
        bodyFat: formatInput(displayBodyFat),
        result: Math.round(370 + 21.6 * lbm),
      });
    } else {
      return t('diary.calculateExplanation.cunninghamMath', {
        defaultValue:
          'Formula: 500 + 22 × LBM (where LBM = weight × (1 - BF/100))\nMath: 500 + 22 × ({{weight}} kg × (1 - {{bodyFat}}/100)) = {{result}} kcal',
        weight: formatInput(displayWeight),
        bodyFat: formatInput(displayBodyFat),
        result: Math.round(500 + 22 * lbm),
      });
    }
  }

  if (bmrAlgorithm === 'Revised Harris-Benedict') {
    if (displayGender === 'male') {
      return t('diary.calculateExplanation.harrisMaleMath', {
        defaultValue:
          'Formula: 13.397 × weight + 4.799 × height - 5.677 × age + 88.362\nMath: 13.397 × {{weight}} + 4.799 × {{height}} - 5.677 × {{age}} + 88.362 = {{result}} kcal',
        weight: formatInput(displayWeight),
        height: formatInput(displayHeight),
        age: displayAge,
        result: Math.round(
          13.397 * displayWeight +
            4.799 * displayHeight -
            5.677 * displayAge +
            88.362
        ),
      });
    } else {
      return t('diary.calculateExplanation.harrisFemaleMath', {
        defaultValue:
          'Formula: 9.247 × weight + 3.098 × height - 4.33 × age + 447.593\nMath: 9.247 × {{weight}} + 3.098 × {{height}} - 4.33 × {{age}} + 447.593 = {{result}} kcal',
        weight: formatInput(displayWeight),
        height: formatInput(displayHeight),
        age: displayAge,
        result: Math.round(
          9.247 * displayWeight +
            3.098 * displayHeight -
            4.33 * displayAge +
            447.593
        ),
      });
    }
  }

  if (bmrAlgorithm === 'Oxford') {
    if (displayGender === 'male') {
      return t('diary.calculateExplanation.oxfordMaleMath', {
        defaultValue:
          'Formula: 14.2 × weight + 593\nMath: 14.2 × {{weight}} + 593 = {{result}} kcal',
        weight: formatInput(displayWeight),
        result: Math.round(14.2 * displayWeight + 593),
      });
    } else {
      return t('diary.calculateExplanation.oxfordFemaleMath', {
        defaultValue:
          'Formula: 10.9 × weight + 677\nMath: 10.9 × {{weight}} + 677 = {{result}} kcal',
        weight: formatInput(displayWeight),
        result: Math.round(10.9 * displayWeight + 677),
      });
    }
  }

  // Default: Mifflin-St Jeor
  const genderOffset = displayGender === 'male' ? 5 : -161;
  return t('diary.calculateExplanation.mifflinMath', {
    defaultValue:
      'Formula: 10 × weight + 6.25 × height - 5 × age + offset ({{offset}})\nMath: 10 × {{weight}} + 6.25 × {{height}} - 5 × {{age}} {{sign}} {{absoluteOffset}} = {{result}} kcal',
    offset: genderOffset,
    weight: formatInput(displayWeight),
    height: formatInput(displayHeight),
    age: displayAge,
    sign: genderOffset >= 0 ? '+' : '-',
    absoluteOffset: Math.abs(genderOffset),
    result: Math.round(
      10 * displayWeight + 6.25 * displayHeight - 5 * displayAge + genderOffset
    ),
  });
};
