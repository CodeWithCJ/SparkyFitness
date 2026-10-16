import { labelScanToNutritionPatch } from '../../src/utils/labelScanFood';

describe('labelScanToNutritionPatch', () => {
  it('applies recognized values including zero without filling absent fields', () => {
    expect(
      labelScanToNutritionPatch({
        name: 'Scanned name',
        brand: 'Scanned brand',
        calories: 0,
        protein: 12.345,
        fiber: null,
        serving_size: 100,
        serving_unit: 'g',
        saturated_fat: 0,
        caffeine_mg: 25,
        water_ml: 0,
        alcohol_g: 0,
      })
    ).toEqual({
      calories: '0',
      protein: '12.345',
      servingSize: '100',
      servingUnit: 'g',
      saturatedFat: '0',
      caffeineMg: '25',
      waterMl: '0',
      alcoholG: '0',
    });
  });

  it('ignores missing, invalid and non-nutrition values', () => {
    expect(
      labelScanToNutritionPatch({
        name: 'Other food',
        brand: 'Other brand',
        serving_unit: '',
        calories: undefined,
        fat: NaN,
        carbs: Infinity,
        fiber: null,
      })
    ).toEqual({});
  });
});
