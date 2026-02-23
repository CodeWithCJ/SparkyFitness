import { getDefaultMealType, MEAL_TYPES, MEAL_CONFIG } from '../../src/constants/meals';

describe('meals constants', () => {
  describe('getDefaultMealType', () => {
    it('returns breakfast before 11am', () => {
      expect(getDefaultMealType(0)).toBe('breakfast');
      expect(getDefaultMealType(8)).toBe('breakfast');
      expect(getDefaultMealType(10)).toBe('breakfast');
    });

    it('returns lunch from 11am to 2pm', () => {
      expect(getDefaultMealType(11)).toBe('lunch');
      expect(getDefaultMealType(12)).toBe('lunch');
      expect(getDefaultMealType(14)).toBe('lunch');
    });

    it('returns dinner from 3pm to 7pm', () => {
      expect(getDefaultMealType(15)).toBe('dinner');
      expect(getDefaultMealType(18)).toBe('dinner');
      expect(getDefaultMealType(19)).toBe('dinner');
    });

    it('returns snack from 8pm onward', () => {
      expect(getDefaultMealType(20)).toBe('snack');
      expect(getDefaultMealType(22)).toBe('snack');
      expect(getDefaultMealType(23)).toBe('snack');
    });

    it('defaults to current hour when no argument given', () => {
      const result = getDefaultMealType();
      expect(MEAL_TYPES).toContain(result);
    });
  });

  describe('MEAL_TYPES', () => {
    it('contains the four standard meal types', () => {
      expect(MEAL_TYPES).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
    });
  });

  describe('MEAL_CONFIG', () => {
    it('has config for all meal types plus other', () => {
      for (const type of [...MEAL_TYPES, 'other']) {
        expect(MEAL_CONFIG[type]).toBeDefined();
        expect(MEAL_CONFIG[type].label).toBeTruthy();
        expect(MEAL_CONFIG[type].icon).toBeTruthy();
      }
    });
  });
});
