import {
  calculateAge,
  calculateBmr,
  calculateBodyFatNavy,
  stepsToCalories,
  calculateEffectiveBurned,
  calculateCalorieBalance,
} from '../../src/services/calculations';

describe('calculations', () => {
  describe('calculateAge', () => {
    it('calculates age correctly', () => {
      const today = new Date();
      const thirtyYearsAgo = new Date(
        today.getFullYear() - 30,
        today.getMonth(),
        today.getDate()
      );
      expect(calculateAge(thirtyYearsAgo.toISOString())).toBe(30);
    });

    it('accounts for birthday not yet occurred this year', () => {
      const today = new Date();
      const futureMonth = (today.getMonth() + 1) % 12;
      const birthYear = today.getFullYear() - 25;
      const birthday = new Date(birthYear, futureMonth, 15);
      expect(calculateAge(birthday.toISOString())).toBe(24);
    });

    it('accounts for birthday already occurred this year', () => {
      const today = new Date();
      const pastMonth = today.getMonth() === 0 ? 11 : today.getMonth() - 1;
      const birthYear =
        today.getMonth() === 0 ? today.getFullYear() - 26 : today.getFullYear() - 25;
      const birthday = new Date(birthYear, pastMonth, 1);
      expect(calculateAge(birthday.toISOString())).toBe(25);
    });
  });

  describe('calculateBmr', () => {
    const baseParams = {
      weightKg: 70,
      heightCm: 175,
      age: 30,
    };

    describe('Mifflin-St Jeor (default)', () => {
      it('calculates BMR for male', () => {
        const bmr = calculateBmr({ ...baseParams, gender: 'male' });
        // 10 * 70 + 6.25 * 175 - 5 * 30 + 5 = 700 + 1093.75 - 150 + 5 = 1648.75
        expect(bmr).toBeCloseTo(1648.75, 1);
      });

      it('calculates BMR for female', () => {
        const bmr = calculateBmr({ ...baseParams, gender: 'female' });
        // 10 * 70 + 6.25 * 175 - 5 * 30 - 161 = 700 + 1093.75 - 150 - 161 = 1482.75
        expect(bmr).toBeCloseTo(1482.75, 1);
      });
    });

    describe('Harris-Benedict', () => {
      it('calculates BMR for male', () => {
        const bmr = calculateBmr({
          ...baseParams,
          gender: 'male',
          algorithm: 'harris_benedict',
        });
        // 88.362 + 13.397 * 70 + 4.799 * 175 - 5.677 * 30
        // = 88.362 + 937.79 + 839.825 - 170.31 = 1695.667
        expect(bmr).toBeCloseTo(1695.67, 1);
      });

      it('calculates BMR for female', () => {
        const bmr = calculateBmr({
          ...baseParams,
          gender: 'female',
          algorithm: 'harris_benedict',
        });
        // 447.593 + 9.247 * 70 + 3.098 * 175 - 4.33 * 30
        // = 447.593 + 647.29 + 542.15 - 129.9 = 1507.133
        expect(bmr).toBeCloseTo(1507.13, 1);
      });
    });
  });

  describe('calculateBodyFatNavy', () => {
    it('calculates body fat for male', () => {
      const bodyFat = calculateBodyFatNavy({
        gender: 'male',
        heightCm: 175,
        waistCm: 85,
        neckCm: 38,
      });
      // Male formula: 495 / (1.0324 - 0.19077 * log10(waist-neck) + 0.15456 * log10(height)) - 450
      expect(bodyFat).toBeCloseTo(16.94, 1);
    });

    it('calculates body fat for female', () => {
      const bodyFat = calculateBodyFatNavy({
        gender: 'female',
        heightCm: 165,
        waistCm: 75,
        neckCm: 33,
        hipsCm: 100,
      });
      // Female formula: 495 / (1.29579 - 0.35004 * log10(waist+hips-neck) + 0.221 * log10(height)) - 450
      expect(bodyFat).toBeCloseTo(29.43, 1);
    });

    it('returns null for female without hips measurement', () => {
      const bodyFat = calculateBodyFatNavy({
        gender: 'female',
        heightCm: 165,
        waistCm: 75,
        neckCm: 33,
      });
      expect(bodyFat).toBeNull();
    });

    it('returns null for invalid circumference (male)', () => {
      const bodyFat = calculateBodyFatNavy({
        gender: 'male',
        heightCm: 175,
        waistCm: 30,
        neckCm: 40, // neck > waist is invalid
      });
      expect(bodyFat).toBeNull();
    });
  });

  describe('stepsToCalories', () => {
    it('converts steps to calories at 0.04 kcal per step', () => {
      expect(stepsToCalories(10000)).toBe(400);
      expect(stepsToCalories(5000)).toBe(200);
      expect(stepsToCalories(0)).toBe(0);
    });
  });

  describe('calculateEffectiveBurned', () => {
    it('uses active calories when available', () => {
      const burned = calculateEffectiveBurned({
        activeCalories: 300,
        otherExerciseCalories: 150,
        steps: 10000,
      });
      expect(burned).toBe(450); // 300 + 150, ignores steps
    });

    it('uses steps calories when no active calories', () => {
      const burned = calculateEffectiveBurned({
        activeCalories: 0,
        otherExerciseCalories: 150,
        steps: 10000,
      });
      expect(burned).toBe(550); // 150 + 400 (10000 * 0.04)
    });
  });

  describe('calculateCalorieBalance', () => {
    it('calculates net and remaining calories', () => {
      const { netCalories, remainingCalories } = calculateCalorieBalance({
        calorieGoal: 2000,
        caloriesConsumed: 1500,
        caloriesBurned: 300,
      });
      expect(netCalories).toBe(1200); // 1500 - 300
      expect(remainingCalories).toBe(800); // 2000 - 1200
    });

    it('handles negative remaining (over goal)', () => {
      const { netCalories, remainingCalories } = calculateCalorieBalance({
        calorieGoal: 2000,
        caloriesConsumed: 2500,
        caloriesBurned: 200,
      });
      expect(netCalories).toBe(2300);
      expect(remainingCalories).toBe(-300);
    });
  });
});
