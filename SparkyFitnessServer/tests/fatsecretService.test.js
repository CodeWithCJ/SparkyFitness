import { describe, expect, it } from 'vitest';
import { mapFatSecretSearchItem } from '../integrations/fatsecret/fatsecretService.js';
import { mapFatSecretFood } from '../integrations/fatsecret/fatsecretService.js';
describe('FatSecret Service Mapping', () => {
  describe('mapFatSecretSearchItem', () => {
    it('should map metric description correctly', () => {
      const item = {
        food_name: 'Test Food',
        brand_name: 'Test Brand',
        food_id: '123',
        food_description:
          'Per 100g - Calories: 165kcal | Fat: 3.57g | Carbs: 0.00g | Protein: 31.02g',
      };
      const result = mapFatSecretSearchItem(item);
      expect(result.default_variant.serving_size).toBe(100);
      expect(result.default_variant.serving_unit).toBe('g');
      expect(result.default_variant.calories).toBe(165);
    });
    it('should map metric in parentheses correctly', () => {
      const item = {
        food_name: 'Test Food',
        food_description:
          'Per 1 serving (28g) - Calories: 110kcal | Fat: 2.00g | Carbs: 15.00g | Protein: 7.00g',
      };
      const result = mapFatSecretSearchItem(item);
      expect(result.default_variant.serving_size).toBe(28);
      expect(result.default_variant.serving_unit).toBe('g');
    });
    it('should map fractional household units', () => {
      const item = {
        food_name: 'Test Food',
        food_description:
          'Per 1/4 cup - Calories: 110kcal | Fat: 2g | Carbs: 15g | Protein: 7g',
      };
      const result = mapFatSecretSearchItem(item);
      expect(result.default_variant.serving_size).toBe(0.25);
      expect(result.default_variant.serving_unit).toBe('cup');
    });
    it('should map whole household units correctly', () => {
      const item = {
        food_name: 'Test Food',
        food_description:
          'Per 1 slice - Calories: 70kcal | Fat: 1g | Carbs: 12g | Protein: 2g',
      };
      const result = mapFatSecretSearchItem(item);
      expect(result.default_variant.serving_size).toBe(1);
      expect(result.default_variant.serving_unit).toBe('slice');
    });
    it('should map mixed fractions like 1 1/2 cups', () => {
      const item = {
        food_name: 'Test Food',
        food_description:
          'Per 1 1/2 cups - Calories: 150kcal | Fat: 2g | Carbs: 25g | Protein: 5g',
      };
      const result = mapFatSecretSearchItem(item);
      expect(result.default_variant.serving_size).toBe(1.5);
      expect(result.default_variant.serving_unit).toBe('cup');
    });
  });
  describe('mapFatSecretFood', () => {
    it('should map detailed food with multiple variants', () => {
      const data = {
        food: {
          food_name: 'Peanut Butter',
          brand_name: 'Jif',
          food_id: '456',
          servings: {
            serving: [
              {
                serving_description: '1 tbsp',
                metric_serving_amount: '15.000',
                metric_serving_unit: 'g',
                number_of_units: '1.000',
                measurement_description: 'tablespoon',
                calories: '95',
                protein: '4',
                carbohydrate: '3.5',
                fat: '8',
                is_default: '1',
              },
              {
                serving_description: '100g',
                metric_serving_amount: '100.000',
                metric_serving_unit: 'g',
                number_of_units: '6.667',
                measurement_description: 'tablespoon',
                calories: '594',
                protein: '25',
                carbohydrate: '22',
                fat: '50',
              },
            ],
          },
        },
      };
      const result = mapFatSecretFood(data);
      expect(result.name).toBe('Peanut Butter');
      expect(result.default_variant.serving_size).toBe(1);
      expect(result.default_variant.serving_unit).toBe('tbsp');
      expect(result.variants.length).toBe(4);
      expect(
        result.variants.some(
          (v) => v.serving_size === 15 && v.serving_unit === 'g'
        )
      ).toBe(true);
      expect(
        result.variants.some(
          (v) => v.serving_size === 100 && v.serving_unit === 'g'
        )
      ).toBe(true);
      expect(
        result.variants.some(
          (v) => v.serving_size === 6.667 && v.serving_unit === 'tbsp'
        )
      ).toBe(true);
    });
    it('should parse Brand food serving_description for fractions', () => {
      const data = {
        food: {
          food_name: 'Brand Food',
          brand_name: 'Test Brand',
          food_id: '999',
          servings: {
            serving: {
              serving_description: '1/4 cup',
              number_of_units: '1.000',
              measurement_description: 'portion',
              metric_serving_amount: '28.000',
              metric_serving_unit: 'g',
            },
          },
        },
      };
      const result = mapFatSecretFood(data);
      // Even though number_of_units is 1, it should parse "1/4 cup"
      // from the description and get 0.25 cup.
      expect(result.default_variant.serving_size).toBe(0.25);
      expect(result.default_variant.serving_unit).toBe('cup');
    });
    it('should split a single serving into household and metric variants', () => {
      const data = {
        food: {
          food_name: 'Splitting Food',
          food_id: '777',
          servings: {
            serving: {
              serving_description: '1 cup (237 g)',
              number_of_units: '1.000',
              measurement_description: 'cup',
              metric_serving_amount: '237.000',
              metric_serving_unit: 'g',
              is_default: '1',
              calories: '100',
            },
          },
        },
      };
      const result = mapFatSecretFood(data);
      expect(result.variants.length).toBe(2);
      const hh = result.variants.find((v) => v.serving_unit === 'cup');
      const m = result.variants.find((v) => v.serving_unit === 'g');
      expect(hh.serving_size).toBe(1);
      expect(hh.serving_unit).toBe('cup');
      expect(m.serving_size).toBe(237);
      expect(m.serving_unit).toBe('g');
      expect(hh.calories).toBe(100);
      expect(m.calories).toBe(100);
      expect(hh.is_default).toBe(true);
      expect(m.is_default).toBe(true); // Both are default as they come from a default serving
    });
  });
});
