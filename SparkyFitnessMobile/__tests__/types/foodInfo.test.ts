import { buildNutrientDisplayList } from '../../src/types/foodInfo';

describe('buildNutrientDisplayList', () => {
  describe('default behavior (showNetCarbs not set or false)', () => {
    it('returns existing primary/additional split without Total Carbs row', () => {
      const result = buildNutrientDisplayList({
        fiber: 5,
        sugars: 10,
        saturatedFat: 2,
        potassium: 200,
      });
      expect(result.primary.map((r) => r.label)).toEqual([
        'Fiber',
        'Sugars',
        'Saturated Fat',
      ]);
      expect(result.additional.map((r) => r.label)).toEqual(['Potassium']);
    });

    it('does not inject Total Carbs even if carbs is provided when showNetCarbs is false', () => {
      const result = buildNutrientDisplayList(
        { fiber: 5, sugars: 10 },
        { showNetCarbs: false, carbs: 30 },
      );
      expect(result.primary.map((r) => r.label)).toEqual(['Fiber', 'Sugars']);
    });
  });

  describe('with showNetCarbs enabled', () => {
    it('injects Total Carbs row immediately after Sugars', () => {
      const result = buildNutrientDisplayList(
        { fiber: 5, sugars: 10, saturatedFat: 2 },
        { showNetCarbs: true, carbs: 30 },
      );
      expect(result.primary.map((r) => r.label)).toEqual([
        'Fiber',
        'Sugars',
        'Total Carbs',
        'Saturated Fat',
      ]);
      const totalCarbs = result.primary.find((r) => r.label === 'Total Carbs');
      expect(totalCarbs).toEqual({ label: 'Total Carbs', value: 30, unit: 'g' });
    });

    it('inserts after Fiber when Sugars is absent', () => {
      const result = buildNutrientDisplayList(
        { fiber: 5, saturatedFat: 2 },
        { showNetCarbs: true, carbs: 30 },
      );
      expect(result.primary.map((r) => r.label)).toEqual([
        'Fiber',
        'Total Carbs',
        'Saturated Fat',
      ]);
    });

    it('inserts at top of primary when neither Fiber nor Sugars is present', () => {
      const result = buildNutrientDisplayList(
        { saturatedFat: 2, cholesterol: 50 },
        { showNetCarbs: true, carbs: 30 },
      );
      expect(result.primary.map((r) => r.label)).toEqual([
        'Total Carbs',
        'Saturated Fat',
        'Cholesterol',
      ]);
    });

    it('handles zero carbs', () => {
      const result = buildNutrientDisplayList(
        { fiber: 0, sugars: 0 },
        { showNetCarbs: true, carbs: 0 },
      );
      const totalCarbs = result.primary.find((r) => r.label === 'Total Carbs');
      expect(totalCarbs?.value).toBe(0);
    });

    it('omits Total Carbs row when carbs option is undefined (defensive fallback)', () => {
      const result = buildNutrientDisplayList(
        { fiber: 5, sugars: 10 },
        { showNetCarbs: true, carbs: undefined },
      );
      expect(result.primary.map((r) => r.label)).toEqual(['Fiber', 'Sugars']);
    });

    it('does not change additional list when injecting', () => {
      const result = buildNutrientDisplayList(
        { fiber: 5, sugars: 10, potassium: 200, calcium: 100 },
        { showNetCarbs: true, carbs: 30 },
      );
      expect(result.additional.map((r) => r.label)).toEqual([
        'Potassium',
        'Calcium',
      ]);
    });
  });
});
