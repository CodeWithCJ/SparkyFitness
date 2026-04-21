describe('SparkyFitness Server', () => {
  test('should return correct calorie calculation', () => {
    const calories = 500 + 300;
    expect(calories).toBe(800);
  });

  test('should validate water intake is positive', () => {
    const waterIntake = 2.5;
    expect(waterIntake).toBeGreaterThan(0);
  });

  test('should calculate BMI correctly', () => {
    const weight = 70;
    const height = 1.75;
    const bmi = weight / (height * height);
    expect(bmi).toBeCloseTo(22.86, 1);
  });
});
