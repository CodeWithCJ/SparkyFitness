import { calculateBodyFatNavy } from '@/services/bodyCompositionService';

describe('calculateBodyFatNavy', () => {
  test('calculates body fat for male correctly', () => {
    const result = calculateBodyFatNavy('male', 180, 90, 40);
    expect(result).toBe(18.46);
  });

  test('calculates body fat for female correctly', () => {
    const result = calculateBodyFatNavy('female', 170, 75, 35, 100);
    expect(result).toBe(27.47);
  });

  test('returns 0 if log value is zero or negative for male', () => {
    const result = calculateBodyFatNavy('male', 180, 40, 40);
    expect(result).toBe(0);
  });

  test('returns 0 if log value is zero or negative for female', () => {
    const result = calculateBodyFatNavy('female', 170, 30, 40, 10);
    expect(result).toBe(0);
  });

  test('throws error for missing male measurements', () => {
    expect(() => {
      calculateBodyFatNavy('male', 180, 0, 40);
    }).toThrow('Height, waist, and neck measurements are required for males.');
  });

  test('throws error for missing female hips', () => {
    expect(() => {
      calculateBodyFatNavy('female', 170, 75, 35);
    }).toThrow(
      'Height, waist, neck, and hips measurements are required for females.'
    );
  });

  test('throws error for invalid gender', () => {
    expect(() => {
      calculateBodyFatNavy('invalid' as 'male', 180, 90, 40);
    }).toThrow("Invalid gender provided. Must be 'male' or 'female'.");
  });

  test('throws error if height is 0', () => {
    expect(() => {
      calculateBodyFatNavy('male', 0, 90, 40);
    }).toThrow('Height, waist, and neck measurements are required for males.');
  });
});
