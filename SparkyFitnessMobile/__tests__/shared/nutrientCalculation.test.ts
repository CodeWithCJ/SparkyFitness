import {
  FatBreakdownAlgorithm,
  MineralCalculationAlgorithm,
  SugarCalculationAlgorithm,
  VitaminCalculationAlgorithm,
  AddedSugarAlgorithm,
  calculateSingleNutrientAutoValue,
  getAutoCalculateFamily,
  type AlgorithmBundle,
  type UserNutrientData,
} from '@workspace/shared';

const algorithms: AlgorithmBundle = {
  fatBreakdown: FatBreakdownAlgorithm.AHA_GUIDELINES,
  minerals: MineralCalculationAlgorithm.RDA_STANDARD,
  vitamins: VitaminCalculationAlgorithm.RDA_STANDARD,
  sugar: SugarCalculationAlgorithm.WHO_GUIDELINES,
  addedSugar: AddedSugarAlgorithm.WHO_MAXIMUM,
};

const user: UserNutrientData = {
  age: 35,
  sex: 'female',
  weightKg: 65,
  calories: 2000,
  totalFatGrams: 67,
  activityLevel: 'moderate',
};

describe('goal calculator in shared', () => {
  it('maps predefined nutrients to an algorithm family', () => {
    expect(getAutoCalculateFamily('sodium')).toBe('minerals');
    expect(getAutoCalculateFamily('vitamin_c')).toBe('vitamins');
    expect(getAutoCalculateFamily('protein')).toBeNull();
  });

  it('returns a positive recommended value for each calculable nutrient', () => {
    for (const nutrient of [
      'saturated_fat',
      'cholesterol',
      'sodium',
      'iron',
      'vitamin_a',
      'sugars',
    ]) {
      const value = calculateSingleNutrientAutoValue(
        nutrient,
        user,
        algorithms
      );
      expect(value).not.toBeNull();
      expect(value as number).toBeGreaterThan(0);
    }
  });

  it('returns null for nutrients without a formula', () => {
    expect(
      calculateSingleNutrientAutoValue('protein', user, algorithms)
    ).toBeNull();
  });
});
